// Step 5-1 self-test: node src/admin/components/mockup-v2/generation/selfTest.mjs  (pure models, no network, no DOM)
import assert from 'node:assert/strict'
import * as G from './index.js'
import { createInitialState, mockupReducer } from '../mockupStudioState.js'

const ok = (name) => console.log('PASS', name)
// angles
assert.equal(G.ANGLE_DEFS.length, 6); assert.ok(G.isAngle('THREE_QUARTER_BACK')); assert.equal(G.angleFromLegacyId('three-quarter-front'), 'THREE_QUARTER_FRONT'); ok('angles')
// templates
const t = G.createTemplate({ id: 'a', name: 'A', angle: 'FRONT', sourceType: 'stored_template', sourceImage: '/x.jpg', colors: ['black'] })
assert.equal(t.assetKind, 'REAL_PHOTO'); assert.ok(G.isTemplateUsable(t)); assert.ok(!G.supportsColor(t, 'white'))
const gen = G.createTemplate({ id: 'g', name: 'G', angle: 'BACK', sourceType: 'generated_image' })
assert.equal(gen.assetKind, 'GENERATED_OUTPUT'); assert.ok(!G.isTemplateUsable(gen))
assert.throws(() => G.createTemplate({ id: 'g2', name: 'G', angle: 'BACK', sourceType: 'generated_image', assetKind: 'REAL_PHOTO' }))
assert.throws(() => G.createTemplate({ id: 'b', name: 'B', angle: 'NOPE', sourceType: 'stored_template', sourceImage: '/x' }))
assert.throws(() => G.createTemplate({ id: 'b', name: 'B', angle: 'FRONT', sourceType: 'stored_template' })) // no source
ok('template model')
// registry
const reg = G.createTemplateRegistry([t, gen]); assert.equal(reg.list().length, 2); assert.equal(reg.usable().length, 1); assert.equal(reg.forAngle('BACK')[0].id, 'g')
assert.throws(() => reg.register(t)); assert.equal(G.templateRegistry.list().length, 0); ok('registry (default registry empty, no fake assets)')
// state + regions + project
let s = createInitialState(); assert.equal(s.generation.status, 'IDLE'); assert.equal(s.generation.angle, 'FRONT')
s = mockupReducer(s, { type: 'SET_TSHIRT', asset: { url: 'blob:t', name: 'tee', width: 900, height: 1100 } })
const src = { url: 'blob:a', name: 'a', width: 600, height: 300 }
s = mockupReducer(s, { type: 'ADD_ARTWORK', asset: src })
s = mockupReducer(s, { type: 'SET_SURFACE', surface: 'back' }); s = mockupReducer(s, { type: 'ADD_ARTWORK', asset: src })
s = mockupReducer(s, { type: 'SET_SURFACE', surface: 'leftSleeve' }); s = mockupReducer(s, { type: 'ADD_ARTWORK', asset: src })
const p = G.buildMockupProject(s)
assert.deepEqual(G.activeRegions(p.artwork), ['FRONT', 'BACK', 'LEFT_SLEEVE']); assert.equal(p.artwork.FRONT[0].width, s.composition.surfaces.front.artworks[0].width)
assert.equal(p.template.sourceType, 'uploaded_photo'); assert.equal(p.template.source.url, 'blob:t'); assert.equal(p.background.mode, 'original'); ok('artwork regions + multi-region project')
// backgrounds pass through the existing system
for (const a of [{ type: 'SET_BACKGROUND_MODE', mode: 'transparent' }, { type: 'SET_BACKGROUND_MODE', mode: 'solid' }, { type: 'SET_BACKGROUND_MODE', mode: 'gradient' }, { type: 'APPLY_BACKGROUND_PRESET', id: 'dark-black' }]) {
  s = mockupReducer(s, a); const b = G.buildMockupProject(s).background; assert.equal(b.mode, s.composition.background.mode)
}
assert.ok(G.buildMockupProject(s).background.paint); ok('background modes described via existing describeBackground')
// request
const req = G.createGenerationRequest(p); assert.deepEqual(G.validateGenerationRequest(req), []); assert.equal(req.artwork.length, 3); assert.equal(req.generationProvider, 'none')
assert.ok(G.validateGenerationRequest({ ...req, extras: { apiKey: 'x' } }).some((e) => /credentials/.test(e))); assert.ok(G.validateGenerationRequest({ ...req, angle: 'x' }).length); ok('generation request')
// status
assert.ok(G.canTransition('IDLE', 'PREPARING')); assert.ok(!G.canTransition('IDLE', 'COMPLETED')); assert.ok(G.canTransition('GENERATING', 'CANCELLED'))
const s2 = mockupReducer(s, { type: 'SET_GENERATION_STATUS', status: 'COMPLETED' }); assert.equal(s2.generation.status, 'IDLE'); ok('status transitions (illegal ones ignored)')
// result
const r = G.createGenerationResult({ status: 'COMPLETED', outputImage: 'u', angle: 'FRONT', templateId: 'a' }); assert.deepEqual(G.validateGenerationResult(r), [])
assert.ok(G.validateGenerationResult({ status: 'COMPLETED' }).length); assert.equal(G.failedResult({}, 'X', 'm').error.code, 'X'); ok('generation result')
// pipeline: honest failure, no provider call, no network
let calls = 0; const realFetch = globalThis.fetch; globalThis.fetch = () => { calls++; throw new Error('network!') }
const seen = []; const out = await G.runGenerationPipeline({ request: req, template: p.template, onStatus: (x) => seen.push(x) })
assert.equal(out.status, 'FAILED'); assert.equal(out.error.code, 'PROVIDER_UNAVAILABLE'); assert.deepEqual(seen, ['PREPARING', 'FAILED']); assert.equal(calls, 0); globalThis.fetch = realFetch
const fake = { id: 'fake', label: 'f', available: true, generate: async () => G.createGenerationResult({ status: 'COMPLETED', outputImage: 'o' }) }
const reg2 = G.createProviderRegistry(); reg2.register(fake); const out2 = await G.runGenerationPipeline({ request: req, template: p.template, provider: reg2.get('fake') }); assert.equal(out2.status, 'COMPLETED')
const out3 = await G.runGenerationPipeline({ request: req, template: gen }); assert.equal(out3.error.code, 'INVALID_REQUEST'); ok('provider abstraction + pipeline (replaceable, no fake progress)')
// reducer selection rules
let q = createInitialState(); q = mockupReducer(q, { type: 'SET_GENERATION_ANGLE', angle: 'SIDE' }); assert.equal(q.generation.angle, 'SIDE')
assert.equal(mockupReducer(q, { type: 'SET_GENERATION_ANGLE', angle: 'bogus' }), q); assert.equal(mockupReducer(q, { type: 'SET_GENERATION_TEMPLATE', id: 'unknown' }), q); ok('reducer selection rules')
console.log('ALL SELF-TESTS PASSED')
