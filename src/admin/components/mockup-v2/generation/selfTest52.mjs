// Step 5-2 self-test: node src/admin/components/mockup-v2/generation/selfTest52.mjs  (pure logic; no network, no DOM, no Supabase)
import assert from 'node:assert/strict'
import * as G from './index.js'
import { createInitialState, mockupReducer as R } from '../mockupStudioState.js'
import { templateRegistry } from './templateRegistry.js'

const ok = (n) => console.log('PASS', n)
const realFetch = globalThis.fetch; let netCalls = 0; globalThis.fetch = () => { netCalls++; throw new Error('network!') }
const blob = (txt, type = 'image/jpeg') => Object.assign(new Blob([txt], { type }), { name: `${txt}.jpg` })
const asset = (txt, w = 1600, h = 2000, type) => ({ url: `mem:${txt}`, file: blob(txt, type), name: txt, width: w, height: h })
const fields = (o = {}) => ({ name: 'Tee', angle: 'FRONT', garmentType: 'OVERSIZED_TSHIRT', colors: ['black'], supportedRegions: ['FRONT', 'LEFT_SLEEVE'], ...o })

// --- model
const t = G.createTemplate({ id: 'x', name: 'X', angle: 'BACK', sourceType: 'stored_template', sourceImage: '/x.jpg' })
assert.equal(t.garmentType, 'OVERSIZED_TSHIRT'); assert.equal(t.active, true); assert.deepEqual(t.supportedRegions, []); assert.equal(t.supportedColors, t.colors)
assert.ok(t.createdAt && t.updatedAt); assert.deepEqual(Object.keys(t.maskData).sort(), [...G.MASK_DATA_KEYS].sort()); assert.ok(Object.values(t.maskData).every((v) => v === null))
assert.throws(() => G.createTemplate({ ...t, id: 'y', garmentType: 'HOODIE' })); assert.throws(() => G.createTemplate({ ...t, id: 'y', supportedRegions: ['NOPE'] }))
assert.ok(G.isTemplateUsable(t)); assert.ok(!G.isTemplateUsable(G.withTemplateUpdates(t, { active: false })))
assert.equal(G.TEMPLATE_COLORS.length, 8); assert.equal(G.GARMENT_DEFS.length, 1)
ok('template model (garment, regions, active, timestamps, reserved mask slots all null)')

// --- image info
assert.equal(G.formatAspectRatio(1600, 2000), '4:5'); assert.equal(G.assessImageQuality({ width: 800, height: 900 }).message, G.LOW_RESOLUTION_MESSAGE)
assert.ok(G.assessImageQuality({ width: 1600, height: 2000 }).ok); assert.ok(G.assessImageQuality({}).ok)
assert.ok(G.aspectDiffers({ width: 1000, height: 1000 }, { width: 1000, height: 1250 })); assert.ok(!G.aspectDiffers({ width: 1600, height: 2000 }, { width: 800, height: 1000 }))
ok('image info + quality warning (no upscaling claims)')

// --- row mapping
const row = G.templateToRow(t, 'mockup-templates/h.jpg'); assert.equal(row.garment_type, 'OVERSIZED_TSHIRT'); assert.equal(row.source_type, 'stored_template')
assert.equal(G.createTemplate(G.rowToTemplateInput(row)).id, 'x'); assert.ok(!Object.keys(row).some((k) => /key|secret|token/i.test(k)))
ok('row mapping round-trips, no credential fields')

// --- library with an in-memory persistent-style fake backend that counts uploads
const uploads = []; const rows = new Map()
const fake = { persistent: true, async list() { return [...rows.values()].map(G.rowToTemplateInput) },
  async storeImage(a, { hash, reuse }) { if (reuse) return { url: reuse.url, path: reuse.ref }; uploads.push(hash); return { url: `https://cdn/x/${hash}.jpg`, path: `mockup-templates/${hash}.jpg` } },
  async insert(tpl) { rows.set(tpl.id, G.templateToRow(tpl)) }, async patch(id, { template, deleted }) { if (deleted) rows.delete(id); else rows.set(id, { ...rows.get(id), active: template.active }) } }
const reg = G.createTemplateRegistry()
const lib = G.createTemplateLibrary({ backend: fake, registry: reg })
await lib.load(); assert.equal(lib.getSnapshot().entries.length, 0)
const a = await lib.addTemplate(asset('A'), fields()); const b = await lib.addTemplate(asset('A'), fields({ name: 'Tee 3/4', angle: 'THREE_QUARTER_FRONT' })) // identical bytes
assert.equal(uploads.length, 1, 'same photo uploaded once'); assert.equal(a.source.url, b.source.url); assert.equal(a.sourceType, 'stored_template')
const c = await lib.addTemplate(asset('C', 1000, 1000), fields({ name: 'Back', angle: 'BACK', supportedRegions: ['BACK'] })); assert.equal(uploads.length, 2)
assert.equal(reg.list().length, 3); assert.deepEqual(lib.getSnapshot().entries.map((e) => e.template.angle).sort(), ['BACK', 'FRONT', 'THREE_QUARTER_FRONT'])
await assert.rejects(() => lib.addTemplate(asset('D'), fields({ name: '  ' }))); await assert.rejects(() => lib.addTemplate(asset('D'), fields({ angle: 'NOPE' })))
ok('upload/register: metadata saved, identical photo stored once, no missing angles invented')

// filters
const all = lib.getSnapshot().entries
assert.equal(G.filterTemplates(all, { angle: 'FRONT' }).length, 1); assert.equal(G.filterTemplates(all, { angle: 'SIDE' }).length, 0)
assert.equal(G.filterTemplates(all, { garment: 'OVERSIZED_TSHIRT' }).length, 3); assert.equal(G.filterTemplates(all, {}).length, 3); ok('filters (angle, garment)')

// activate / deactivate / delete
await lib.setActive(a.id, false); assert.equal(lib.get(a.id).active, false); assert.equal(rows.get(a.id).active, false)
assert.ok(!G.isTemplateUsable(reg.get(a.id))); assert.equal(G.selectableEntries(lib.getSnapshot().entries).length, 2)
await lib.setActive(a.id, true); assert.ok(G.isTemplateUsable(reg.get(a.id)))
await lib.removeTemplate(b.id); assert.equal(lib.get(b.id), null); assert.equal(reg.get(b.id), null); assert.equal(lib.getSnapshot().entries.length, 2); ok('activate / deactivate / soft delete')

// replace photo keeps everything but the photo
const before = lib.get(c.id); const rep = await lib.replacePhoto(c.id, asset('C2', 2000, 2000))
assert.equal(rep.template.id, before.id); assert.equal(rep.template.name, before.name); assert.equal(rep.template.angle, before.angle); assert.deepEqual(rep.template.supportedRegions, before.supportedRegions)
assert.notEqual(rep.template.source.url, before.source.url); assert.equal(rep.template.source.width, 2000); assert.equal(reg.get(c.id).source.width, 2000)
assert.equal((await lib.replacePhoto(c.id, asset('C2', 2000, 2000))).unchanged, true); ok('replace photo updates only the source image')

// persistence: a fresh library over the same rows sees the templates; fallback to session mode on backend failure
const lib2 = G.createTemplateLibrary({ backend: fake, registry: G.createTemplateRegistry() }); await lib2.load(); assert.equal(lib2.getSnapshot().entries.length, 2)
const broken = { persistent: true, list: async () => { throw new Error('relation "mockup_templates" does not exist') } }
const lib3 = G.createTemplateLibrary({ backend: broken, fallbackBackend: G.createMemoryBackend(), registry: G.createTemplateRegistry() }); await lib3.load()
assert.equal(lib3.getSnapshot().status, 'ready'); assert.equal(lib3.getSnapshot().persistent, false); assert.match(lib3.getSnapshot().notice, /only be kept while this page is open/)
const m = await lib3.addTemplate(asset('M'), fields()); assert.equal(m.sourceType, 'uploaded_photo'); assert.equal(lib3.getSnapshot().entries[0].persisted, false); ok('persistence + honest session-only fallback')

// --- studio integration (shared registry): select, reversible, non-destructive
for (const e of lib.getSnapshot().entries) templateRegistry.upsert(e.template)
let s = createInitialState()
s = R(s, { type: 'SET_TSHIRT', asset: { url: 'blob:own', name: 'own', width: 1000, height: 1250 } })
s = R(s, { type: 'ADD_ARTWORK', asset: { url: 'blob:art', name: 'art', width: 600, height: 300 } })
s = R(s, { type: 'SET_SURFACE', surface: 'back' }); s = R(s, { type: 'ADD_ARTWORK', asset: { url: 'blob:art', name: 'art', width: 600, height: 300 } })
s = R(s, { type: 'SET_BACKGROUND_MODE', mode: 'gradient' }); s = R(s, { type: 'APPLY_BACKGROUND_PRESET', id: 'dark-black' }); s = R(s, { type: 'SET_TSHIRT_SCALE', value: 80 })
s = R(s, { type: 'SET_GENERATION_SETTINGS', patch: { quality: 'high' } })
const keep = (x) => JSON.stringify({ bg: x.composition.background, pres: x.composition.tshirtPresentation, gen: x.generation.settings, garment: x.generation.garment, pos: ['front', 'back'].map((k) => x.composition.surfaces[k].artworks.map((q) => [q.id, q.x, q.y, q.width, q.rotation])) })
const snap = keep(s)
// A: same aspect ratio as the person's photo (0.8) -> artwork completely unchanged
s = R(s, { type: 'APPLY_TEMPLATE_PHOTO', id: a.id })
assert.equal(s.sourceAssets.tshirt.originalUrl, a.source.url); assert.equal(s.sourceAssets.tshirt.fromTemplateId, a.id); assert.equal(s.generation.templateId, a.id); assert.equal(s.generation.angle, 'FRONT')
assert.equal(keep(s), snap); assert.equal(s.composition.surfaces.front.artworks.length, 1); assert.equal(s.composition.surfaces.back.artworks.length, 1)
assert.equal(s.sourceAssets.tshirtBeforeTemplate.originalUrl, 'blob:own'); assert.equal(G.buildMockupProject(s).template.id, a.id)
ok('select template: photo loaded; background/presentation/settings/artwork preserved')

// C: square photo -> layer heights rescaled so artwork keeps its visual proportions; x/y/width untouched
const h0 = s.composition.surfaces.front.artworks[0].height
s = R(s, { type: 'APPLY_TEMPLATE_PHOTO', id: c.id })
assert.ok(Math.abs(s.composition.surfaces.front.artworks[0].height - h0 * 1.25) < 0.02); assert.equal(keep(s), snap)
assert.equal(s.sourceAssets.tshirtBeforeTemplate.originalUrl, 'blob:own', 'switching templates keeps the ORIGINAL personal photo parked')

// replace the loaded template's photo: only the photo changes
const keepBefore = keep(s); const gen0 = JSON.stringify(s.generation)
await lib.replacePhoto(c.id, asset('C3', 1500, 1875)); templateRegistry.upsert(lib.get(c.id))
s = R(s, { type: 'REPLACE_TEMPLATE_PHOTO', id: c.id })
assert.equal(s.sourceAssets.tshirt.originalUrl, lib.get(c.id).source.url); assert.equal(s.sourceAssets.tshirt.width, 1500); assert.equal(keep(s), keepBefore); assert.equal(JSON.stringify(s.generation), gen0)
ok('replace photo while in use: background, artwork data, T-shirt settings and generation config are not reset')

// reversible
s = R(s, { type: 'RELEASE_TEMPLATE_PHOTO' })
assert.equal(s.sourceAssets.tshirt.originalUrl, 'blob:own'); assert.equal(s.generation.templateId, null); assert.equal(keep(s), snap); assert.ok(Math.abs(s.composition.surfaces.front.artworks[0].height - h0) < 0.05)
assert.equal(s.sourceAssets.tshirtBeforeTemplate, null); ok('selection is reversible (own photo + artwork geometry restored)')

// inactive / unknown templates cannot be applied; deactivating a loaded template keeps the photo
await lib.setActive(a.id, false); templateRegistry.upsert(lib.get(a.id))
assert.equal(R(s, { type: 'APPLY_TEMPLATE_PHOTO', id: a.id }), s); assert.equal(R(s, { type: 'APPLY_TEMPLATE_PHOTO', id: 'nope' }), s)
assert.ok(!G.availableTemplates(s).some((x) => x.id === a.id)); await lib.setActive(a.id, true); templateRegistry.upsert(lib.get(a.id))
s = R(s, { type: 'APPLY_TEMPLATE_PHOTO', id: a.id }); s = R(s, { type: 'DETACH_TEMPLATE_PHOTO', id: a.id })
assert.equal(s.sourceAssets.tshirt.originalUrl, a.source.url); assert.equal(s.sourceAssets.tshirt.fromTemplateId, undefined); assert.equal(s.generation.templateId, null); ok('inactive templates not selectable; detach keeps the photo')

// person uploads their own photo while a template is loaded -> template link cleared
s = R(s, { type: 'APPLY_TEMPLATE_PHOTO', id: a.id }); s = R(s, { type: 'SET_TSHIRT', asset: { url: 'blob:new', name: 'n', width: 800, height: 1000 } })
assert.equal(s.generation.templateId, null); assert.equal(s.sourceAssets.tshirtBeforeTemplate, null); ok('own upload clears the template link')

// artwork regions vs template support
let p = R(createInitialState(), { type: 'SET_TSHIRT', asset: { url: 'blob:o', name: 'o', width: 800, height: 1000 } })
p = R(p, { type: 'ADD_ARTWORK', asset: { url: 'blob:a', name: 'a', width: 600, height: 300 } }); p = R(p, { type: 'SET_SURFACE', surface: 'back' }); p = R(p, { type: 'ADD_ARTWORK', asset: { url: 'blob:a', name: 'a', width: 600, height: 300 } })
p = R(p, { type: 'APPLY_TEMPLATE_PHOTO', id: a.id }); assert.deepEqual(G.buildMockupProject(p).unsupportedRegions, ['BACK']); assert.deepEqual(G.activeRegions(G.buildMockupProject(p).artwork), ['FRONT', 'BACK']); ok('template region support vs multi-region artwork')

// 5-1 generation still refuses honestly, and nothing touched the network
const project = G.buildMockupProject(p); const out = await G.runGenerationPipeline({ request: G.createGenerationRequest(project), template: project.template })
assert.equal(out.error.code, 'PROVIDER_UNAVAILABLE'); assert.equal(netCalls, 0); globalThis.fetch = realFetch; ok('5-1 pipeline intact; zero network calls')
console.log('ALL STEP 5-2 SELF-TESTS PASSED')
