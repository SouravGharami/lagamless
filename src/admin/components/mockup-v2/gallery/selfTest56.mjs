// Step 5-6 self-test: the real services/adminMockups.js against an in-memory Supabase fake (tables, unique indexes,
// RPCs, Storage). Covers the product-integration flow A-P. Run:  node selfTest56.mjs
import { register } from 'node:module'
import assert from 'node:assert/strict'

// Replace lib/supabase.js (needs import.meta.env / a network) by a stub that reads the fake from globalThis.
const hooks = `
export async function resolve(spec, ctx, next) {
  if (/lib\\/supabase\\.js$/.test(spec)) return { url: 'stub:supabase', shortCircuit: true }
  return next(spec, ctx)
}
export async function load(url, ctx, next) {
  if (url === 'stub:supabase') return { format: 'module', shortCircuit: true, source:
    'export const supabase = globalThis.__fake; export const isSupabaseConfigured = true; export const PRODUCT_IMAGES_BUCKET = "product-images"; export const getProductImagePublicUrl = (p) => p ? "https://cdn.test/" + p : null' }
  return next(url, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(hooks))

// ---- fake Supabase ------------------------------------------------------------------------------------------------
const db = { product_mockups: [] }
const files = new Map()
let seq = 0
const err = (message, code) => ({ message, code })
class Q {
  constructor(t) { this.t = t; this.op = 'select'; this.f = []; this.wantOne = false }
  select() { return this }
  insert(row) { this.op = 'insert'; this.row = row; return this }
  update(p) { this.op = 'update'; this.patch = p; return this }
  delete() { this.op = 'delete'; return this }
  eq(k, v) { this.f.push((r) => r[k] === v); return this }
  neq(k, v) { this.f.push((r) => r[k] !== v); return this }
  contains(k, arr) { this.f.push((r) => arr.every((x) => (r[k] || []).includes(x))); return this }
  limit() { return this }
  single() { this.wantOne = true; return this }
  run() {
    const rows = db[this.t]
    const match = () => rows.filter((r) => this.f.every((fn) => fn(r)))
    let out
    if (this.op === 'insert') {
      const r = { id: `m${++seq}`, is_main: false, sort_order: 0, origin: 'studio', render_config: null, source_paths: [], created_at: 'x', updated_at: 'x', ...this.row }
      if (rows.some((x) => x.product_id === r.product_id && x.view_type === r.view_type)) return { data: null, error: err('dup view', '23505') }
      if (r.is_main && rows.some((x) => x.product_id === r.product_id && x.is_main)) return { data: null, error: err('two mains', '23505') }
      rows.push(r); out = [r]
    } else if (this.op === 'update') {
      out = match(); out.forEach((r) => Object.assign(r, this.patch))
    } else if (this.op === 'delete') {
      out = match(); out.forEach((r) => rows.splice(rows.indexOf(r), 1))
    } else out = match()
    out = out.map((r) => ({ ...r }))
    if (this.wantOne) return out.length === 1 ? { data: out[0], error: null } : { data: null, error: err('no row', 'PGRST116') }
    return { data: out, error: null }
  }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej) }
}
globalThis.__fake = {
  from: (t) => new Q(t),
  rpc: async (name, a) => {
    const rows = db.product_mockups
    if (name === 'set_main_product_mockup') {
      const m = rows.find((r) => r.id === a.p_mockup_id); if (!m) return { error: err('Mockup not found') }
      rows.forEach((r) => { if (r.product_id === m.product_id) r.is_main = r.id === m.id })
    } else if (name === 'reorder_product_mockups') {
      a.p_ids.forEach((id, i) => { const r = rows.find((x) => x.id === id && x.product_id === a.p_product_id); if (r) r.sort_order = i })
    }
    return { error: null }
  },
  storage: { from: () => ({
    upload: async (path, blob) => { files.set(path, blob); return { error: null } },
    remove: async (paths) => { paths.forEach((p) => files.delete(p)); return { error: null } },
    download: async (path) => (files.has(path) ? { data: files.get(path), error: null } : { data: null, error: err('missing') }),
  }) },
}

const svc = await import('../../../../services/adminMockups.js')
const model = await import('./galleryModel.js')
let n = 0; const ok = (m) => console.log(`ok ${++n} - ${m}`)
const png = (tag) => new Blob([tag], { type: 'image/png' })
const mk = (productId, view, tag = view) => svc.createMockup({ productId, view, blob: png(tag), width: 4000, height: 5000, renderConfig: { version: 1 }, sourcePaths: [`mockups/${productId}/sources/${tag}.png`] })
const views = async (p) => (await svc.listMockups(p)).map((m) => `${m.viewType}${m.isMain ? '*' : ''}`)

// A-D  open product A, save a Front mockup
for (const p of ['A', 'B']) files.set(`mockups/${p}/sources/x.png`, png('src'))
const front = await mk('A', 'FRONT'); assert.equal(front.productId, 'A'); assert.equal(front.isMain, true)
// G  reopen: still there, with its metadata
const [again] = await svc.listMockups('A')
assert.equal(again.id, front.id); assert.equal(again.viewType, 'FRONT'); assert.equal(again.width, 4000); assert.ok(again.imageUrl.startsWith('https://cdn.test/mockups/A/front/'))
ok('A-G: Front saved against product A (first mockup becomes main) and is still there when listed again')

// H-I  add Back: same product, does not take over main
const back = await mk('A', 'BACK')
assert.equal(back.productId, 'A'); assert.deepEqual(await views('A'), ['FRONT*', 'BACK'])
ok('H-I: Back added to the same product; existing main not taken over')

// J-K  product B sees nothing of A
assert.deepEqual(await views('B'), [])
const bFront = await mk('B', 'FRONT', 'bfront')
assert.deepEqual(await views('A'), ['FRONT*', 'BACK']); assert.deepEqual(await views('B'), ['FRONT*'])
ok('J-K: product B lists only its own mockups; A and B stay separate, each with its own main')

// duplicate protection
await assert.rejects(() => mk('A', 'FRONT'), (e) => e.code === 'VIEW_EXISTS')
assert.equal((await svc.listMockups('A')).length, 2)
const twice = await Promise.allSettled([mk('A', 'SIDE'), mk('A', 'SIDE')])
assert.equal(twice.filter((r) => r.status === 'fulfilled').length, 1, 'a double click creates ONE record')
assert.deepEqual(await views('A'), ['FRONT*', 'SIDE', 'BACK'], 'Side lands between Front and Back (view order), not last')
ok('duplicates: same view twice is refused; a double click creates one record; new view slots into view order')

// L-N  set Back as main; other product untouched
await svc.setMainMockup(back.id)
assert.deepEqual(await views('A'), ['FRONT', 'SIDE', 'BACK*']); assert.deepEqual(await views('B'), ['FRONT*'])
assert.equal((await svc.listMockups('A')).filter((m) => m.isMain).length, 1)
assert.ok(files.has(front.imagePath), 'previous main image is not deleted')
ok('L-N: Back becomes main, Front loses main, nothing deleted, product B unaffected')

// replace keeps identity, deletes only the old file
const oldPath = front.imagePath
const replaced = await svc.replaceMockupImage(front, { blob: png('new-front'), width: 3000, height: 4000, origin: 'uploaded' })
assert.equal(replaced.id, front.id); assert.equal(replaced.viewType, 'FRONT'); assert.equal(replaced.sortOrder, front.sortOrder); assert.equal(replaced.isMain, false)
assert.ok(!files.has(oldPath) && files.has(replaced.imagePath)); assert.equal((await svc.listMockups('A')).length, 3)
ok('replace: same record, view/order/main/product kept, old file cleaned, new file stored, no extra record')

// O-P  remove Side only
const side = (await svc.listMockups('A')).find((m) => m.viewType === 'SIDE')
await svc.removeMockup(side, await svc.listMockups('A'))
assert.deepEqual(await views('A'), ['FRONT', 'BACK*']); assert.ok(!files.has(side.imagePath)); assert.ok(files.has(back.imagePath)); assert.deepEqual(await views('B'), ['FRONT*'])
ok('O-P: removing Side removes only Side (and its file); other views, main and product B remain')

// removing the main promotes the next
const list = await svc.listMockups('A')
const successor = await svc.removeMockup(list.find((m) => m.isMain), list)
assert.equal(successor, list.find((m) => m.viewType === 'FRONT').id); assert.deepEqual(await views('A'), ['FRONT*'])
ok('removing MAIN promotes the next mockup; the product is never left without a main')

// file-safety guards: a file still referenced elsewhere, or foreign, is kept
files.set('mockups/A/shared.png', png('s')); files.set('product-images-file', png('p')); files.set('mockups/B/foreign.png', png('f'))
const a1 = await mk('A', 'BACK', 'k1'); db.product_mockups.find((r) => r.id === a1.id).source_paths = ['mockups/A/shared.png']
const a2 = await mk('A', 'DETAIL', 'k2'); db.product_mockups.find((r) => r.id === a2.id).source_paths = ['mockups/A/shared.png', 'mockups/B/foreign.png', 'product-images-file']
await svc.removeMockup(a2, await svc.listMockups('A'))
assert.ok(files.has('mockups/A/shared.png'), 'still used by another mockup -> kept')
assert.ok(files.has('mockups/B/foreign.png') && files.has('product-images-file'), 'other products\' and regular product-image files are never touched')
ok('storage safety: shared / foreign / regular product-image files survive a removal')

// reorder persists
const cur = await svc.listMockups('A'); const ids = cur.map((m) => m.id)
await svc.moveMockup('A', cur, ids[1], -1)
assert.deepEqual((await svc.listMockups('A')).map((m) => m.id), [ids[1], ids[0]])
ok('reorder persists across a reload')

// download for "Use as product image"
const blob = await svc.downloadMockupBlob(bFront.imagePath); assert.equal(await blob.text(), 'bfront')
await assert.rejects(() => svc.downloadMockupBlob('nope'), (e) => e.code === 'DOWNLOAD_FAILED')
ok('mockup file can be read back for the product image slot; missing file is a clear error')

// product-image slot reconciliation
assert.deepEqual(model.destinationSlots({ viewType: 'BACK', isMain: true }).map((d) => d.key), ['main', 'back'])
assert.deepEqual(model.destinationSlots({ viewType: 'BACK', isMain: false }).map((d) => d.key), ['back', 'main'])
assert.deepEqual(model.destinationSlots({ viewType: 'THREE_QUARTER_FRONT', isMain: false })[0], { key: 'model', label: '3/4 Front' })
assert.equal(model.PRODUCT_SLOT_FOR_VIEW.THREE_QUARTER_BACK, 'three_quarter_back')
ok('product-image slots: main mockup defaults to the Main slot; every view maps to its existing slot key')

// Step 5-7: users never see raw database / storage / network errors; authored messages pass through
const silence = console.error; console.error = () => {}
try {
  assert.equal(svc.friendlyMockupError(new svc.MockupError('VIEW_EXISTS', 'This view already has a mockup.')), 'This view already has a mockup.')
  const raw = { message: 'duplicate key value violates unique constraint "product_mockups_pkey"', code: '23505' }
  assert.equal(svc.friendlyMockupError(raw, 'That action failed.'), 'That action failed.')
  assert.ok(!svc.friendlyMockupError(new TypeError('Failed to fetch https://x.supabase.co/storage/v1/object/product-images/mockups/A/1.png')).includes('supabase'))
  assert.match(svc.friendlyMockupError({ code: '42501', message: 'new row violates row-level security policy for table "product_mockups"' }), /permission/)
} finally { console.error = silence }
ok('friendlyMockupError: authored messages pass through; raw DB/storage/network text is never shown')
