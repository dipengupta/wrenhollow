// ============================================================================
// renderer, camera and input
// ============================================================================
const $ = (id) => document.getElementById(id);
const canvas = $('c'), info = $('i'), body = document.body;
const rot = matchMedia('(orientation:portrait) and (pointer:coarse)');
let loaded = 0, dead;
const say = (m, to, ms) => {
  if (!dead) $('s').textContent = m;
  const a = $('b').animate({ transform: [`scaleX(${loaded})`, `scaleX(${to})`] }, { duration: ms, fill: 'forwards', easing: 'cubic-bezier(.3,.5,.5,1)' });
  loaded = to;
  return new Promise((r) => { a.ready.then(() => setTimeout(r)); setTimeout(r, document.hidden ? 0 : 1e3); });
};
const fail = (m) => { throw new Error(m, { cause: 1 }); };
if (!navigator.gpu) fail('This scene needs WebGPU. Try a current Chrome or Edge.');
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
if (!adapter) fail('No WebGPU adapter found.');
$('w').hidden = !!navigator.userAgentData;
const hasTS = adapter.features.has('timestamp-query');
const device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [], requiredLimits: { maxStorageBufferBindingSize: min(adapter.limits.maxStorageBufferBindingSize, 1 << 28), maxBufferSize: min(adapter.limits.maxBufferSize, 1 << 28) } });
device.addEventListener('uncapturederror', (e) => console.error('GPU: ' + e.error.message));
device.lost.then((l) => {
  if (l.reason === 'destroyed') return;
  if (LV < 2) { keep('wrenhollow', LV + 1); location.reload(); }
  dead = body.className = 'l e'; $('s').textContent = 'The graphics device was lost. Reload the page to try again.';
});
const ctx = canvas.getContext('webgpu'), FMT = navigator.gpu.getPreferredCanvasFormat();
const Q = device.queue, HDR = 'rgba16float', DEPTH = 'depth32float';
const TU = GPUTextureUsage, BU = GPUBufferUsage, SS = GPUShaderStage;
const mod = (code) => device.createShaderModule({ code });
const buf = (data, usage) => { const b = device.createBuffer({ size: max(16, (data.byteLength + 3) & ~3), usage: usage | BU.COPY_DST }); Q.writeBuffer(b, 0, data.buffer || data, data.byteOffset || 0, data.byteLength); return b; };
const tex = (w, h, format, usage, o = {}) => device.createTexture({ size: [w, h], format, usage, mipLevelCount: o.mips || 1, sampleCount: o.samples || 1 });

// ---------------------------------------------------------------- light: the sun (or the moon), set from the time of day in env.js
const SUN = [0, 1, 0], SUNC = [0, 0, 0], AMB = [0, 0, 0];
let EXPO = 1, RAYS = 0.55;
// the sunlight that survives the atmosphere along direction d
const sunColor = (d) => {
  const RE = 6360e3, BR = [5.8e-6, 13.5e-6, 33.1e-6], BM = 3.2e-5 * 1.11, BO = [0.65e-6, 1.881e-6, 0.085e-6]; let r = 0, m = 0, o = 0;
  for (let i = 0; i < 400; i++) { const s = (i + 0.5) * 500, x = d[0] * s, y = RE + 150 + d[1] * s, z = d[2] * s, h = hypot(x, y, z) - RE; r += exp(-h / 8000) * 500; m += exp(-h / 1400) * 500; o += max(0, 1 - abs(h - 25e3) / 15e3) * 500; }
  return [0, 1, 2].map((k) => [7.5, 6.8, 7.2][k] * exp(-(BR[k] * r + BM * m + BO[k] * o)) || 0);
};
// cloud takes the direct light and spreads it over the sky: the sun dims, the ambient grows and greys
const setLight = (t, w = WEATHER[weather]) => {
  const l = hypot(...t.light); for (let k = 0; k < 3; k++) SUN[k] = t.light[k] / l;
  const c = sunColor(SUN), lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) * t.scale;
  for (let k = 0; k < 3; k++) { SUNC[k] = c[k] * t.scale * t.tint[k] * w.sun; AMB[k] = t.amb[k] * (1 - 0.25 * w.cover) + lum * (1 - w.sun) * 0.26 * [0.95, 0.98, 1.05][k]; }
  EXPO = t.expo * (1 + 0.3 * w.cover); RAYS = t.rays * w.sun;
};
setLight(TOD[tod]);

// ---------------------------------------------------------------- static resources
const sRep = device.createSampler({ addressModeU: 'repeat', addressModeV: 'clamp-to-edge', magFilter: 'linear', minFilter: 'linear' });
const sClamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const sCmp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
const tShadow = tex(SHADOW, SHADOW, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tDummy = tex(1, 1, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tDummyC = tex(1, 1, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tSky = tex(512, 256, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const UB = new Float32Array(292), UBR = new Float32Array(292), UBS = new Float32Array(292);
const ubo = device.createBuffer({ size: 1168, usage: BU.UNIFORM | BU.COPY_DST }), uboR = device.createBuffer({ size: 1168, usage: BU.UNIFORM | BU.COPY_DST }), uboS = device.createBuffer({ size: 1168, usage: BU.UNIFORM | BU.COPY_DST });
const bHC = device.createBuffer({ size: CN * CN * 4, usage: BU.STORAGE | BU.COPY_SRC }), bHF = device.createBuffer({ size: FN * FN * 4, usage: BU.STORAGE | BU.COPY_SRC });

const VF = SS.VERTEX | SS.FRAGMENT;
const bgl0 = device.createBindGroupLayout({ entries: [
  { binding: 0, visibility: VF, buffer: {} },
  { binding: 1, visibility: VF, sampler: {} }, { binding: 2, visibility: VF, sampler: {} }, { binding: 3, visibility: VF, sampler: { type: 'comparison' } },
  { binding: 4, visibility: VF, texture: { sampleType: 'depth' } }, { binding: 5, visibility: VF, texture: {} },
  { binding: 6, visibility: VF, buffer: { type: 'read-only-storage' } }, { binding: 7, visibility: VF, buffer: { type: 'read-only-storage' } },
  { binding: 8, visibility: VF, texture: {} }] });
const mkBG0 = (u, sh, refl) => device.createBindGroup({ layout: bgl0, entries: [
  { binding: 0, resource: { buffer: u } }, { binding: 1, resource: sRep }, { binding: 2, resource: sClamp }, { binding: 3, resource: sCmp },
  { binding: 4, resource: sh.createView() }, { binding: 5, resource: tSky.createView() },
  { binding: 6, resource: { buffer: bHC } }, { binding: 7, resource: { buffer: bHF } }, { binding: 8, resource: refl }] });
const pl0 = device.createPipelineLayout({ bindGroupLayouts: [bgl0] });
const bgR = mkBG0(uboR, tShadow, tDummyC.createView()), bgS = mkBG0(uboS, tDummy, tDummyC.createView());
let bg0 = null;

const A = (shaderLocation, offset, format) => ({ shaderLocation, offset, format });
const vbMeshL = { arrayStride: 24, attributes: [A(0, 0, 'float32x3'), A(1, 12, 'snorm8x4'), A(2, 16, 'float32x2')] };
const ibTreeL = { arrayStride: 32, stepMode: 'instance', attributes: [A(3, 0, 'float32x4'), A(4, 16, 'float32x4')] };
const ibBirdL = { arrayStride: 32, stepMode: 'instance', attributes: [A(0, 0, 'float32x4'), A(1, 16, 'float32x4')] };
const ADD = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const PREM = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
// a scene pipeline for the main pass (MSAA) and one for the reflection pass (single sample)
const scenePipe = (m, buffers, o = {}, samples = AA) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: o.vs || 'vs', buffers, constants: o.constants },
  fragment: { module: m, entryPoint: o.fs || 'fs', targets: [{ format: HDR, blend: o.blend }], constants: o.constants },
  primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: !o.blend && !o.sky, depthCompare: o.sky ? 'greater-equal' : 'greater' }, multisample: { count: samples } });
const shadowPipe = (m, buffers, o = {}) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: 'vs', buffers, constants: o.constants },
  primitive: { topology: 'triangle-list', cullMode: 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less', depthBias: 3, depthBiasSlopeScale: 2.5 } });

await say('Compiling shaders…', 0.05, 300);
const mTerr = mod(W_TERR), mSolid = mod(W_SOLID), mTree = mod(W_TREE), mWater = mod(W_WATER), mSky = mod(W_SKY), mBird = mod(W_BIRD);
const FARC = { FAR: 1 };
const P = {}; // main pass pipelines, and R for the reflection
const R = {};
for (const [k, s] of [[P, AA], [R, 1]]) {
  k.terr = scenePipe(mTerr, [], {}, s); k.far = scenePipe(mTerr, [], { constants: FARC }, s);
  k.solid = scenePipe(mSolid, [vbMeshL], {}, s); k.tree = scenePipe(mTree, [vbMeshL, ibTreeL], {}, s);
  k.sky = scenePipe(mSky, [], { sky: 1 }, s);
}
P.water = scenePipe(mWater, [], { strip: 1 });
P.bird = scenePipe(mBird, [ibBirdL], {});
P.precip = scenePipe(mod(W_PRECIP), [], { strip: 1, blend: PREM });
{ const ml = mod(W_LIFE); P.life = scenePipe(ml, [vbMeshL, ibTreeL]); R.life = scenePipe(ml, [vbMeshL, ibTreeL], {}, 1); }
const NPREC = 11000 >> LV;
const S = { terr: shadowPipe(mTerr, []), solid: shadowPipe(mSolid, [vbMeshL]), tree: shadowPipe(mTree, [vbMeshL, ibTreeL]) };

const bglBlit = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.FRAGMENT, texture: {} }, { binding: 1, visibility: SS.FRAGMENT, sampler: {} }] });
const plBlit = device.createPipelineLayout({ bindGroupLayouts: [bglBlit] });
const mBlit = mod(W_BLIT);
const blitPipe = (entry, add) => device.createRenderPipeline({ layout: plBlit, vertex: { module: mBlit, entryPoint: 'vs' }, fragment: { module: mBlit, entryPoint: entry, targets: [{ format: HDR, blend: add ? ADD : undefined }] } });
const pDown0 = blitPipe('fsDown0'), pDown = blitPipe('fsDown'), pUp = blitPipe('fsUp', true);
const blitBG = (view) => device.createBindGroup({ layout: bglBlit, entries: [{ binding: 0, resource: view }, { binding: 1, resource: sClamp }] });
const colorAtt = (view, clear) => ({ view, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 0] });
const mRays = mod(W_RAYS), mPost = mod(W_POST);
const pRays = device.createRenderPipeline({ layout: 'auto', vertex: { module: mRays, entryPoint: 'vs' }, fragment: { module: mRays, entryPoint: 'fs', targets: [{ format: HDR }] } });
const pPost = device.createRenderPipeline({ layout: 'auto', vertex: { module: mPost, entryPoint: 'vs' }, fragment: { module: mPost, entryPoint: 'fs', targets: [{ format: FMT }] } });
const RS = new Float32Array(4), PP = new Float32Array(8);
const uboRays = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST }), uboPost = device.createBuffer({ size: 32, usage: BU.UNIFORM | BU.COPY_DST });

// ---------------------------------------------------------------- terrain: generate, read back, bake the sky
await say('Raising the highlands…', 0.2, 900);
keep('wrenhollowLoad', 1);
addEventListener('pagehide', () => keep('wrenhollowLoad', ''));
{
  const p = device.createComputePipeline({ layout: 'auto', compute: { module: mod(W_HGT), entryPoint: 'main' } });
  const e = device.createCommandEncoder(), rb = [];
  for (const [b, n, s, o] of [[bHC, CN, CS, CO], [bHF, FN, FS, FO]]) {
    const u = new ArrayBuffer(16); new Uint32Array(u)[0] = n; new Float32Array(u)[2] = s; new Float32Array(u)[3] = o;
    const bg = device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf(new Uint8Array(u), BU.UNIFORM) } }, { binding: 1, resource: { buffer: b } }] });
    const c = e.beginComputePass(); c.setPipeline(p); c.setBindGroup(0, bg); c.dispatchWorkgroups(ceil(n / 8), ceil(n / 8)); c.end();
    const r = device.createBuffer({ size: n * n * 4, usage: BU.MAP_READ | BU.COPY_DST }); e.copyBufferToBuffer(b, 0, r, 0, n * n * 4); rb.push(r);
  }
  Q.submit([e.finish()]);
  await Promise.all(rb.map((b) => b.mapAsync(GPUMapMode.READ)));
  HC = new Float32Array(rb[0].getMappedRange().slice(0)); HF = new Float32Array(rb[1].getMappedRange().slice(0));
  for (const b of rb) { b.unmap(); b.destroy(); }
}
// sky: single scattering for every direction, baked again whenever the time of day changes
const pSkyBake = (() => { const ms = mod(W_SKYBAKE); return device.createRenderPipeline({ layout: 'auto', vertex: { module: ms, entryPoint: 'vs' }, fragment: { module: ms, entryPoint: 'fs', targets: [{ format: HDR }] } }); })();
const uSkyBake = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST });
const bgSkyBake = device.createBindGroup({ layout: pSkyBake.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uSkyBake } }] });
function bakeSky() {
  Q.writeBuffer(uSkyBake, 0, new Float32Array([...SUN, TOD[tod].sky]));
  const e = device.createCommandEncoder(), r = e.beginRenderPass({ colorAttachments: [colorAtt(tSky.createView(), true)] });
  r.setPipeline(pSkyBake); r.setBindGroup(0, bgSkyBake); r.draw(3); r.end();
  Q.submit([e.finish()]);
}
bakeSky();
// per patch height range, for culling
const PLO = new Float32Array(NPC * NPC), PHI = new Float32Array(NPC * NPC), FLO = new Float32Array(NPF * NPF), FHI = new Float32Array(NPF * NPF);
for (const [A2, n, np, lo, hi] of [[HC, CN, NPC, PLO, PHI], [HF, FN, NPF, FLO, FHI]]) for (let pz = 0; pz < np; pz++) for (let px = 0; px < np; px++) {
  let a = 1e9, b = -1e9;
  for (let z = pz * PATCH; z <= pz * PATCH + PATCH; z += 2) for (let x = px * PATCH; x <= px * PATCH + PATCH; x += 2) { const h = A2[x + z * n]; if (h < a) a = h; if (h > b) b = h; }
  lo[px + pz * np] = a - 60; hi[px + pz * np] = b + 2;
}

await say('Building the castle…', 0.45, 1500);
const CM = buildCastle();
const vbCastle = buf(new Uint8Array(CM.v, 0, CM.nv * 24), BU.VERTEX), ibCastle = buf(CM.ix.subarray(0, CM.ni), BU.INDEX);
// effects: banners, chimney smoke, the waterfall and motes, their sources written into the shader
const mFx = mod(W_FX());
P.smoke = scenePipe(mFx, [], { vs: 'vsSmoke', fs: 'fsSmoke', blend: PREM, strip: 1 });
P.fly = scenePipe(mFx, [], { vs: 'vsFly', fs: 'fsFly', blend: ADD, strip: 1 });
P.fall = scenePipe(mFx, [], { vs: 'vsFall', fs: 'fsFall', blend: PREM, strip: 1 });
P.banner = scenePipe(mFx, [], { vs: 'vsBan', fs: 'fsBan' });
P.boat = scenePipe(mFx, [], { vs: 'vsBoat', fs: 'fsBoat' });
const NBAN = BANS.length / 4, NSMOKE = VSMOKE.length / 3 * 14, NFLY = 420 >> LV, NFALL = 5;
const NOBJ = OBJS.length, OB = new Float32Array(NOBJ * 8); OBJS.forEach((o, i) => OB.set(o, i * 8));

await say('Planting the forest…', 0.7, 1200);
const TM = new Mesh(), TR = [];
for (const [f, l] of [[meshPine, 0], [meshPine, 1], [meshPine, 2], [meshBirch, 0], [meshBirch, 1]]) { const i0 = TM.ni; rseed(11 + l); f(TM, l); TR.push([i0, TM.ni - i0]); }
const vbTree = buf(new Uint8Array(TM.v, 0, TM.nv * 24), BU.VERTEX), ibTree = buf(TM.ix.subarray(0, TM.ni), BU.INDEX);
const TW = makeTrees();
const ibTrees = buf(TW.data, BU.VERTEX);
const BIRDS = makeBirds(), nBird = BIRDS.length / 8, ibBirds = buf(BIRDS, BU.VERTEX);
// animals: meshes, the herds, and an instance buffer rewritten every frame from the simulation
const LM = lifeMeshes(), vbLife = buf(new Float32Array(LM.m.v, 0, LM.m.nv * 6), BU.VERTEX), ibLife = buf(LM.m.ix.subarray(0, LM.m.ni), BU.INDEX);
makeLife();
const ibLifeI = device.createBuffer({ size: LIFEMAX * 32, usage: BU.VERTEX | BU.COPY_DST });
function drawLife(r, pl) {
  if (!LN) return;
  r.setPipeline(pl); r.setVertexBuffer(0, vbLife); r.setVertexBuffer(1, ibLifeI); r.setIndexBuffer(ibLife, 'uint32');
  const eagle = TOD[tod].night < 0.3 && WEATHER[weather].precip < 0.5;
  for (let k = 0; k < LRUN.length; k++) { const [s0, n] = LRUN[k]; if (n && (k !== KIND.EAGLE || eagle)) r.drawIndexed(LM.runs[k][1], n, LM.runs[k][0], 0, s0); }
}

// terrain index buffer: for each level of detail a grid of (n+1)^2 vertices plus four skirts of n+1 (see W_TERR)
const TIDX = [];
const ibTerr = (() => {
  const all = [];
  for (let l = 0; l < 4; l++) {
    const n = 128 >> l, m = n + 1, ng = m * m, i0 = all.length;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) { const a = x + z * m; all.push(a, a + 1, a + 1 + m, a, a + 1 + m, a + m); }
    const edge = [(k) => k, (k) => k + n * m, (k) => k * m, (k) => n + k * m];
    for (let s = 0; s < 4; s++) for (let k = 0; k < n; k++) { const a = edge[s](k), b = edge[s](k + 1), c = ng + s * m + k; all.push(a, b, c + 1, a, c + 1, c); }
    TIDX.push([i0, all.length - i0]);
  }
  return buf(new Uint32Array(all), BU.INDEX);
})();

// ---------------------------------------------------------------- shadow map (static light, static world): baked again when the time changes
function bakeShadow() {
  const L = SUN, lr = [-L[2], 0, L[0]], ll = hypot(...lr); lr[0] /= ll; lr[2] /= ll;
  const lu = [L[1] * lr[2] - L[2] * lr[1], L[2] * lr[0] - L[0] * lr[2], L[0] * lr[1] - L[1] * lr[0]];
  const dot = (a, x, y, z) => a[0] * x + a[1] * y + a[2] * z;
  let b = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
  for (const x of [-300, 360]) for (const y of [-30, 200]) for (const z of [-540, 280]) {
    const a = dot(lr, x, y, z), c = dot(lu, x, y, z), d = dot(L, x, y, z);
    b = [min(b[0], a), max(b[1], a), min(b[2], c), max(b[3], c), min(b[4], d - 400), max(b[5], d + 400)];
  }
  const sx = 2 / (b[1] - b[0]), cx = (b[0] + b[1]) / 2, sy = 2 / (b[3] - b[2]), cy = (b[2] + b[3]) / 2, dz = b[5] - b[4], m = UBS;
  m[0] = lr[0] * sx; m[4] = lr[1] * sx; m[8] = lr[2] * sx; m[12] = -cx * sx;
  m[1] = lu[0] * sy; m[5] = lu[1] * sy; m[9] = lu[2] * sy; m[13] = -cy * sy;
  m[2] = -L[0] / dz; m[6] = -L[1] / dz; m[10] = -L[2] / dz; m[14] = b[5] / dz;
  m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
  for (let i = 0; i < 16; i++) UBS[16 + i] = UB[16 + i] = UBR[16 + i] = m[i];
  lightUB();
  UBR[39] = 1; UBS[32] = 0; UBS[33] = 300; UBS[34] = 0;
  Q.writeBuffer(uboS, 0, UBS);
  const e = device.createCommandEncoder();
  const r = e.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: tShadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
  r.setBindGroup(0, bgS);
  r.setPipeline(S.terr); r.setIndexBuffer(ibTerr, 'uint32'); for (let i = 0; i < NPC * NPC; i++) r.drawIndexed(TIDX[1][1], 1, TIDX[1][0], 0, i + 1024);
  r.setPipeline(S.solid); r.setVertexBuffer(0, vbCastle); r.setIndexBuffer(ibCastle, 'uint32'); r.drawIndexed(CM.ni);
  r.setPipeline(S.tree); r.setVertexBuffer(0, vbTree); r.setVertexBuffer(1, ibTrees); r.setIndexBuffer(ibTree, 'uint32');
  for (let c = 0; c < TCELLS * TCELLS; c++) for (const k of [0, 1]) { const a = TW.start[c * 2 + k], n = TW.start[c * 2 + k + 1] - a; if (n) r.drawIndexed(TR[k ? 4 : 1][1], n, TR[k ? 4 : 1][0], 0, a); }
  r.end();
  Q.submit([e.finish()]);
}
// the light and the look of the time of day into all three uniform arrays
function lightUB() {
  const t = TOD[tod];
  for (const u of [UB, UBR, UBS]) {
    u[36] = SUN[0]; u[37] = SUN[1]; u[38] = SUN[2]; u[56] = SUNC[0]; u[57] = SUNC[1]; u[58] = SUNC[2]; u[60] = AMB[0]; u[61] = AMB[1]; u[62] = AMB[2];
    const se = SEASON[season], w = WEATHER[weather];
    u[64] = t.night; u[65] = t.glow * (1 + 0.6 * w.cover * (1 - t.night)); u[66] = w.cover; u[67] = t.grade * (1 - 0.6 * w.cover);
    u[68] = se.snow; u[69] = se.phase; u[70] = w.wet * (1 - se.snow * 0.5); u[71] = w.fog;
    u[72] = w.precip; u[73] = w.wind; u[74] = se.snow > 0.5 ? 1 : 0; u[75] = t.clock;
    // lanterns: a box around each group (so most pixels skip them), then up to 16 lights per group
    for (let g = 0; g < 3; g++) {
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9, k = 0;
      for (let i = 0; i < LAMPS.length; i += 4) if (LAMPS[i + 3] === g && k < 16) {
        const o = 100 + (g * 16 + k++) * 4; u[o] = LAMPS[i]; u[o + 1] = LAMPS[i + 1]; u[o + 2] = LAMPS[i + 2]; u[o + 3] = 1;
        x0 = min(x0, LAMPS[i] - 10); z0 = min(z0, LAMPS[i + 2] - 10); x1 = max(x1, LAMPS[i] + 10); z1 = max(z1, LAMPS[i + 2] + 10);
        y0 = min(y0, LAMPS[i + 1] - 10); y1 = max(y1, LAMPS[i + 1] + 10);
      }
      u[76 + g * 4] = x0; u[77 + g * 4] = z0; u[78 + g * 4] = x1; u[79 + g * 4] = z1; u[88 + g * 4] = y0; u[89 + g * 4] = y1;
    }
  }
}
bakeShadow();
// switch the time of day: new light, sky and shadows; nothing else is rebuilt
function applyTime(i) {
  tod = (i + TOD.length) % TOD.length; try { localStorage.wrenhollowTime = tod; } catch {}
  setLight(TOD[tod]); bakeSky(); bakeShadow();
}
function applySeason(i) { season = (i + SEASON.length) % SEASON.length; try { localStorage.wrenhollowSeason = season; } catch {} setLight(TOD[tod]); lightUB(); }
function applyWeather(i) { weather = (i + WEATHER.length) % WEATHER.length; try { localStorage.wrenhollowWeather = weather; } catch {} setLight(TOD[tod]); lightUB(); }


// ---------------------------------------------------------------- render targets (rebuilt on resize)
const PIXMAX = 3456 * 2234, PIXMIN = 9e5;
let W = 0, H2 = 0, DW = 0, DH = 0, RW = 0, RH = 0, pix = +SV[1] || (LV > 1 ? 6e5 : 1728 * 1117 * 1.4), dynN = 0, dynT = 0, dynG = 0, dynGN = 0;
let passScene, passRefl, passRays, passPost, bgRays, bgPost, bloomPass = [], bloomBG = [], targets = [];
const NB = 6;
function resize() {
  DW = max(2, round(canvas.clientWidth * devicePixelRatio)); DH = max(2, round(canvas.clientHeight * devicePixelRatio));
  const s = min(1, sqrt(pix / (DW * DH)));
  const w = max(2, round(DW * s) & ~1), h = max(2, round(DH * s) & ~1);
  if (w === W && h === H2) return;
  dynN = dynG = dynGN = 0; dynT = -300;
  W = w; H2 = h; canvas.width = W; canvas.height = H2;
  ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
  for (const t of targets) t.destroy();
  RW = max(2, round(W * REFL)); RH = max(2, round(H2 * REFL));
  const tMS = tex(AA > 1 ? W : 1, H2, HDR, TU.RENDER_ATTACHMENT, { samples: AA }), tDp = tex(W, H2, DEPTH, TU.RENDER_ATTACHMENT, { samples: AA });
  const tRes = tex(W, H2, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tRay = tex(W / 2, H2 / 2, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
  const tRefl = tex(RW, RH, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tRDp = tex(RW, RH, DEPTH, TU.RENDER_ATTACHMENT);
  targets = [tMS, tDp, tRes, tRay, tRefl, tRDp];
  const bl = [];
  for (let i = 0; i < NB; i++) { const t = tex(max(1, W >> (i + 1)), max(1, H2 >> (i + 1)), HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING); bl.push(t); targets.push(t); }
  const vRes = tRes.createView(), vBl = bl.map((t) => t.createView());
  passScene = { colorAttachments: [{ view: AA > 1 ? tMS.createView() : vRes, resolveTarget: AA > 1 ? vRes : undefined, loadOp: 'clear', storeOp: AA > 1 ? 'discard' : 'store', clearValue: [0, 0, 0, 1] }],
    depthStencilAttachment: { view: tDp.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' } };
  passRefl = { colorAttachments: [colorAtt(tRefl.createView(), true)], depthStencilAttachment: { view: tRDp.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' } };
  passRays = { colorAttachments: [colorAtt(tRay.createView(), true)] };
  passPost = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
  bg0 = mkBG0(ubo, tShadow, tRefl.createView());
  bgRays = device.createBindGroup({ layout: pRays.getBindGroupLayout(0), entries: [{ binding: 0, resource: vRes }, { binding: 1, resource: sClamp }, { binding: 2, resource: { buffer: uboRays } }] });
  bgPost = device.createBindGroup({ layout: pPost.getBindGroupLayout(0), entries: [{ binding: 0, resource: vRes }, { binding: 1, resource: sClamp }, { binding: 2, resource: vBl[0] }, { binding: 3, resource: tRay.createView() }, { binding: 4, resource: { buffer: uboPost } }] });
  bloomPass = []; bloomBG = [];
  for (let i = 0; i < NB; i++) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i], true)] }); bloomBG.push(blitBG(i ? vBl[i - 1] : vRes)); }
  for (let i = NB - 1; i > 0; i--) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i - 1], false)] }); bloomBG.push(blitBG(vBl[i])); }
  for (const u of [UB, UBR]) { u[40] = W; u[41] = H2; u[42] = 1 / W; u[43] = 1 / H2; }
}
resize();
addEventListener('resize', resize);

// ---------------------------------------------------------------- timing (GPU timestamp queries)
let qs, qResolve, qRead = [], tsBegin, tsEnd;
if (hasTS) {
  qs = device.createQuerySet({ type: 'timestamp', count: 2 });
  qResolve = device.createBuffer({ size: 16, usage: BU.QUERY_RESOLVE | BU.COPY_SRC });
  for (let i = 0; i < 6; i++) {
    const b = device.createBuffer({ size: 16, usage: BU.MAP_READ | BU.COPY_DST });
    const o = { b, busy: false, done: null };
    o.done = () => {
      const a = new BigInt64Array(b.getMappedRange());
      const ms = Number(a[1] - a[0]) / 1e6; F[GPU] = ms; b.unmap(); o.busy = false;
      if (dynT > 0 && ms > 0 && ms < 1e3) { dynG += ms; dynGN++; }
    };
    qRead.push(o);
  }
  tsBegin = { querySet: qs, beginningOfPassWriteIndex: 0 }; tsEnd = { querySet: qs, endOfPassWriteIndex: 1 };
}

// ---------------------------------------------------------------- camera
// preset viewpoints (position, look-at), keys 1-6
const POSES = [
  [-360, 9, 330, 0, 125, -10],
  [92, 104, -26, 58, 150, -38],
  [196, 18, 60, 190, 86, -86],
  [80, 230, 50, 250, 40, -430],
  [-200, 6, 260, -80, 70, 70],
  [205, 52, -372, -10, 135, -90],
]
// 60 s camera path (position + look-at, Catmull-Rom), flown by dev.js
const FLY = new Float32Array([
  -520, 30, 520, 0, 120, 0,
  -420, 18, 380, 0, 120, 0,
  -300, 12, 260, -20, 110, 0,
  -210, 14, 215, -40, 90, 20,
  -110, 40, 185, -30, 120, 0,
  -60, 120, 140, 20, 150, -20,
  40, 175, 120, 120, 90, 120,
  130, 100, 190, 192, 30, 60,
  188, 32, 110, 194, 34, 0,
  193, 34, 20, 191, 40, -86,
  191, 40, -86, 196, 44, -200,
  198, 46, -180, 230, 70, -330,
  225, 90, -300, 250, 40, -430,
  240, 120, -340, 0, 100, -250,
  80, 115, -280, -30, 104, -200,
  -30, 110, -270, -30, 110, -100,
  -30, 112, -150, -30, 125, -40,
  -100, 160, -60, -80, 110, 60,
  -220, 110, 40, -60, 120, 40,
  -330, 50, 200, 0, 120, 0,
  -460, 25, 400, 0, 130, 0,
]);
const FLYN = FLY.length / 6, FLYT = 60, LUTN = 1024, flyLUT = new Float32Array(LUTN + 1);
const F = new Float64Array(32), P6 = new Float64Array(6);
const CX = 0, CY = 1, CZ = 2, YAW = 3, PIT = 4, FX = 5, FY = 6, FZ = 7, RX = 8, RZ = 9, UX = 10, UY = 11, UZ = 12, VX = 13, VY = 14, VZ = 15, TIME = 16, FLT = 17, LAST = 18, GPU = 19, HUDT = 20, SPL = 21;
function aim() {
  const dx = P6[3] - P6[0], dy = P6[4] - P6[1], dz = P6[5] - P6[2];
  F[CX] = P6[0]; F[CY] = P6[1]; F[CZ] = P6[2];
  F[YAW] = atan2(dx, -dz); F[PIT] = atan2(dy, sqrt(dx * dx + dz * dz));
}
const lookAt = (x, y, z, tx, ty, tz) => { P6[0] = x; P6[1] = y; P6[2] = z; P6[3] = tx; P6[4] = ty; P6[5] = tz; aim(); F[VX] = F[VY] = F[VZ] = 0; };
function flyRaw() {
  const s = F[SPL]; let i = floor(s) | 0; if (i > FLYN - 2) i = FLYN - 2;
  const u = s - i, i0 = (i > 0 ? i - 1 : 0) * 6, i1 = i * 6, i2 = (i + 1) * 6, i3 = (i + 2 < FLYN ? i + 2 : FLYN - 1) * 6;
  for (let o = 0; o < 6; o++) {
    const a = FLY[i0 + o], b = FLY[i1 + o], c = FLY[i2 + o], d = FLY[i3 + o];
    P6[o] = 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  }
  aim();
}
{
  const M = 4096, len = new Float32Array(M + 1); let px = 0, py = 0, pz = 0;
  for (let k = 0; k <= M; k++) { F[SPL] = k / M * (FLYN - 1); flyRaw(); if (k) len[k] = len[k - 1] + hypot(F[CX] - px, F[CY] - py, F[CZ] - pz); px = F[CX]; py = F[CY]; pz = F[CZ]; }
  for (let k = 0, j = 0; k <= LUTN; k++) { const d = k / LUTN * len[M]; while (j < M - 1 && len[j + 1] < d) j++; flyLUT[k] = (j + (d - len[j]) / max(len[j + 1] - len[j], 1e-6)) / M * (FLYN - 1); }
}
function flyAt() {
  let s = F[FLT] / FLYT; s = s < 0 ? 0 : s > 1 ? 1 : s; s = s * s * (3 - 2 * s) * 0.25 + s * 0.75;
  s *= LUTN; let k = floor(s) | 0; if (k > LUTN - 1) k = LUTN - 1;
  F[SPL] = flyLUT[k] + (flyLUT[k + 1] - flyLUT[k]) * (s - k); flyRaw();
}

// ---------------------------------------------------------------- frame
let hud = false, watch = false, follow = false;
let kf = 0, kb = 0, kl = 0, kr = 0, ku = 0, kd = 0, ks = 0, mdx = 0, mdy = 0, lkx = 0, lky = 0, l2x = 0, l2y = 0, hN = 0, hMax = 0, hMin = 1e9, hPer = 1e9, hLate = 0, hTot = 0, tId = -1, tN = 0, tx0 = 0, ty0 = 0, tx = 0, ty = 0;
const TANH = 0.62, NEAR = 0.15;
const submitList = [null];
let DBG = 0; // dev.js only: bit mask of passes to skip, for profiling
const C = new Float64Array(11); // camera basis of the pass being encoded: position, forward, right (x, z), up
// camera basis + matrices into a uniform array; refl mirrors the camera in the water plane
function camUB(m, refl) {
  const cx = F[CX], cy = refl ? -F[CY] : F[CY], cz = F[CZ], pitch = refl ? -F[PIT] : F[PIT], yaw = F[YAW];
  const cp = cos(pitch), fy = sin(pitch), rx = cos(yaw), rz = sin(yaw), fx = cp * rz, fz = -cp * rx;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  if (!refl) { F[FX] = fx; F[FY] = fy; F[FZ] = fz; F[RX] = rx; F[RZ] = rz; F[UX] = ux; F[UY] = uy; F[UZ] = uz; }
  const asp = W / H2, sx = 1 / (TANH * asp), sy = 1 / TANH;
  m[0] = rx * sx; m[4] = 0; m[8] = rz * sx; m[12] = -(rx * cx + rz * cz) * sx;
  m[1] = ux * sy; m[5] = uy * sy; m[9] = uz * sy; m[13] = -(ux * cx + uy * cy + uz * cz) * sy;
  m[2] = 0; m[6] = 0; m[10] = 0; m[14] = NEAR;
  m[3] = fx; m[7] = fy; m[11] = fz; m[15] = -(fx * cx + fy * cy + fz * cz);
  m[32] = cx; m[33] = cy; m[34] = cz; m[35] = F[TIME];
  m[44] = rx; m[45] = 0; m[46] = rz; m[47] = TANH * asp;
  m[48] = ux; m[49] = uy; m[50] = uz; m[51] = TANH;
  m[52] = fx; m[53] = fy; m[54] = fz; m[55] = EXPO;
  C[0] = cx; C[1] = cy; C[2] = cz; C[3] = fx; C[4] = fy; C[5] = fz; C[6] = rx; C[7] = rz; C[8] = ux; C[9] = uy; C[10] = uz;
}
// conservative box-in-frustum test against the camera basis in C
function inView(x0, y0, z0, x1, y1, z1) {
  const ex = (x1 - x0) / 2, ey = (y1 - y0) / 2, ez = (z1 - z0) / 2, px = x0 + ex - C[0], py = y0 + ey - C[1], pz = z0 + ez - C[2];
  const fx = C[3], fy = C[4], fz = C[5], rx = C[6], rz = C[7], ux = C[8], uy = C[9], uz = C[10];
  const lim = px * fx + py * fy + pz * fz + ex * abs(fx) + ey * abs(fy) + ez * abs(fz);
  if (lim < 0) return false;
  if (abs(px * rx + pz * rz) - ex * abs(rx) - ez * abs(rz) > lim * TANH * W / H2) return false;
  return abs(px * ux + py * uy + pz * uz) - ex * abs(ux) - ey * abs(uy) - ez * abs(uz) <= lim * TANH;
}
// open water as boxes (64 m cells in the core, 512 m beyond): the loch's reflection is only drawn when one is in view
const WC = (() => {
  const a = [];
  for (let cz = 0; cz < 32; cz++) for (let cx = 0; cx < 32; cx++) {
    let w = false;
    for (let j = 0; j < 64 && !w; j += 4) for (let i = 0; i < 64; i += 4) if (HC[cx * 64 + i + (cz * 64 + j) * CN] < 0.3) { w = true; break; }
    if (w) a.push(CO + cx * 64, CO + cz * 64, CO + cx * 64 + 64, CO + cz * 64 + 64);
  }
  for (let cz = 0; cz < 32; cz++) for (let cx = 0; cx < 32; cx++) {
    const x0 = FO + cx * 512, z0 = FO + cz * 512;
    if (x0 >= CO && x0 + 512 <= -CO && z0 >= CO && z0 + 512 <= -CO) continue;
    let w = false;
    for (let j = 0; j < 16 && !w; j++) for (let i = 0; i < 16; i++) if (HF[cx * 16 + i + (cz * 16 + j) * FN] < 0.3) { w = true; break; }
    if (w) a.push(x0, z0, x0 + 512, z0 + 512);
  }
  return new Float32Array(a);
})();
function waterInView() { for (let i = 0; i < WC.length; i += 4) if (inView(WC[i], -1, WC[i + 1], WC[i + 2], 1.5, WC[i + 3])) return true; return false; }
// terrain patches: level of detail by distance; refl draws one level coarser
function drawTerrain(r, pl, plFar, refl) {
  r.setPipeline(pl); r.setIndexBuffer(ibTerr, 'uint32');
  for (let pz = 0; pz < NPC; pz++) for (let px = 0; px < NPC; px++) {
    const i = px + pz * NPC, x0 = CO + px * PATCH, z0 = CO + pz * PATCH;
    if (!inView(x0, PLO[i], z0, x0 + PATCH, PHI[i], z0 + PATCH)) continue;
    const dx = max(abs(C[0] - x0 - PATCH / 2) - PATCH / 2, 0), dz = max(abs(C[2] - z0 - PATCH / 2) - PATCH / 2, 0), d = sqrt(dx * dx + dz * dz + max(C[1] - PHI[i], 0) ** 2);
    const lod = d < 170 ? 0 : d < 400 ? 1 : d < 800 ? 2 : 3;
    r.drawIndexed(TIDX[lod][1], 1, TIDX[lod][0], 0, i + 1024 * lod);
  }
  r.setPipeline(plFar);
  for (let i = 0; i < NPF * NPF; i++) {
    const px = i % NPF, pz = (i / NPF) | 0, x0 = FO + px * PATCH * FS, z0 = FO + pz * PATCH * FS, e = PATCH * FS;
    if (!inView(x0, FLO[i], z0, x0 + e, FHI[i], z0 + e)) continue;
    const dx = max(abs(C[0] - x0 - e / 2) - e / 2, 0), dz = max(abs(C[2] - z0 - e / 2) - e / 2, 0), d = sqrt(dx * dx + dz * dz);
    const lod = d < 2500 ? 0 : d < 5000 ? 1 : 2;
    r.drawIndexed(TIDX[lod][1], 1, TIDX[lod][0], 0, i + 1024 * lod);
  }
}
function drawCastle(r, pl) {
  r.setPipeline(pl); r.setVertexBuffer(0, vbCastle); r.setIndexBuffer(ibCastle, 'uint32');
  let run = -1, end = 0;
  for (let i = 0; i < NOBJ; i++) {
    const o = i * 8;
    if (inView(OB[o + 2], OB[o + 3], OB[o + 4], OB[o + 5], OB[o + 6], OB[o + 7])) { if (run < 0) run = OB[o]; end = OB[o] + OB[o + 1]; }
    else if (run >= 0) { r.drawIndexed(end - run, 1, run); run = -1; }
  }
  if (run >= 0) r.drawIndexed(end - run, 1, run);
}
function drawTrees(r, pl, refl) {
  r.setPipeline(pl); r.setVertexBuffer(0, vbTree); r.setVertexBuffer(1, ibTrees); r.setIndexBuffer(ibTree, 'uint32');
  for (let c = 0; c < TCELLS * TCELLS; c++) {
    if (TW.start[c * 2 + 2] === TW.start[c * 2]) continue;
    const px = c % TCELLS, pz = (c / TCELLS) | 0, x0 = CO + px * TCW, z0 = CO + pz * TCW;
    if (!inView(x0 - 6, TW.ylo[c], z0 - 6, x0 + TCW + 6, TW.yhi[c], z0 + TCW + 6)) continue;
    const dx = max(abs(C[0] - x0 - TCW / 2) - TCW / 2, 0), dz = max(abs(C[2] - z0 - TCW / 2) - TCW / 2, 0), d = sqrt(dx * dx + dz * dz);
    let lod = d < 110 ? 0 : d < 520 ? 1 : 2; if (refl) lod = max(lod, 1);
    for (let k = 0; k < 2; k++) {
      const a = TW.start[c * 2 + k], n = TW.start[c * 2 + k + 1] - a; if (!n) continue;
      const g = TR[k ? (lod ? 4 : 3) : lod]; r.drawIndexed(g[1], n, g[0], 0, a);
    }
  }
}
function render() {
  camUB(UB, false); Q.writeBuffer(ubo, 0, UB);
  const wet = waterInView();
  camUB(UBR, true); Q.writeBuffer(uboR, 0, UBR);
  // the sun on screen, for the shafts
  { const sf = SUN[0] * F[FX] + SUN[1] * F[FY] + SUN[2] * F[FZ]; const asp = W / H2;
    RS[0] = 0.5 + 0.5 * (SUN[0] * F[RX] + SUN[2] * F[RZ]) / max(sf, 0.05) / (TANH * asp); RS[1] = 0.5 - 0.5 * (SUN[0] * F[UX] + SUN[1] * F[UY] + SUN[2] * F[UZ]) / max(sf, 0.05) / TANH;
    RS[2] = sf > 0 ? RAYS * sstep(0, 0.35, sf) : 0; RS[3] = asp; Q.writeBuffer(uboRays, 0, RS); }
  PP[0] = EXPO; PP[1] = W; PP[2] = H2; PP[3] = F[TIME]; PP[4] = TOD[tod].grade; PP[5] = TOD[tod].night; Q.writeBuffer(uboPost, 0, PP);

  const e = device.createCommandEncoder();
  let slot = null;
  if (hasTS) { for (let i = 0; i < qRead.length; i++) if (!qRead[i].busy) { slot = qRead[i]; break; } }
  passRefl.timestampWrites = slot ? tsBegin : undefined;
  passPost.timestampWrites = slot ? tsEnd : undefined;
  // the world mirrored in the loch (only drawn when the camera is near enough to the water to see it matter)
  let r = e.beginRenderPass(passRefl);
  r.setBindGroup(0, bgR);
  if (!(DBG & 1) && wet) { drawCastle(r, R.solid); drawTerrain(r, R.terr, R.far, true); drawTrees(r, R.tree, true); drawLife(r, R.life); r.setPipeline(R.sky); r.draw(3); }
  r.end();
  camUB(UB, false);
  r = e.beginRenderPass(passScene);
  r.setBindGroup(0, bg0);
  if (!(DBG & 2)) drawCastle(r, P.solid);
  if (!(DBG & 4)) drawTerrain(r, P.terr, P.far, false);
  if (!(DBG & 8) && wet) { r.setPipeline(P.water); r.draw(4); }
  if (!(DBG & 16)) drawTrees(r, P.tree, false);
  drawLife(r, P.life);
  r.setPipeline(P.banner); r.draw(6 * 24, NBAN);
  // rooks by day, the eagle on dry days, the owl at night, bats from dusk (not in rain or winter)
  { const nt = TOD[tod].night, wet = WEATHER[weather].precip > 0.5, cold = SEASON[season].snow > 0.5;
    r.setPipeline(P.bird); r.setVertexBuffer(0, ibBirds);
    if (nt < 0.5 && !wet) r.draw(18, NROOK);
    if (nt > 0.5) r.draw(18, 1, 0, NROOK + 1);   // the owl (slot NROOK is unused: the eagle is drawn with the animals)
    if (nt > 0.2 && !wet && !cold) r.draw(18, nBird - NROOK - 2, 0, NROOK + 2); }
  if (!(DBG & 32)) { r.setPipeline(P.sky); r.draw(3); }
  r.setPipeline(P.fall); r.draw(4, NFALL);
  r.setPipeline(P.smoke); r.draw(4, NSMOKE);
  r.setPipeline(P.fly); r.draw(4, NFLY);
  if (!(DBG & 64)) {
    if (WEATHER[weather].precip > 0) { r.setPipeline(P.precip); r.draw(4, NPREC); }
    else if (SEASON[season].phase === 2) { r.setPipeline(P.precip); r.draw(4, NPREC >> 2); } // autumn: leaves falling
  }
  r.end();
  r = e.beginRenderPass(passRays); r.setPipeline(pRays); r.setBindGroup(0, bgRays); r.draw(3); r.end();
  for (let i = 0; i < bloomPass.length; i++) {
    r = e.beginRenderPass(bloomPass[i]); r.setPipeline(i === 0 ? pDown0 : i < NB ? pDown : pUp); r.setBindGroup(0, bloomBG[i]); r.draw(3); r.end();
  }
  passPost.colorAttachments[0].view = ctx.getCurrentTexture().createView();
  r = e.beginRenderPass(passPost); r.setPipeline(pPost); r.setBindGroup(0, bgPost); r.draw(3); r.end();
  if (slot) { e.resolveQuerySet(qs, 0, 2, qResolve, 0); e.copyBufferToBuffer(qResolve, 0, slot.b, 0, 16); }
  submitList[0] = e.finish();
  Q.submit(submitList);
  if (slot) { slot.busy = true; slot.b.mapAsync(GPUMapMode.READ).then(slot.done); }
}

// ---------------------------------------------------------------- collision: terrain, water, castle
const CR = 0.9;
function collide() {
  let x = F[CX], y = F[CY], z = F[CZ];
  for (let i = 0; i < COLC.length; i++) {
    const c = COLC[i], dx = x - c[0], dz = z - c[1], rr2 = c[2] + CR;
    if (y > c[3] + CR || dx * dx + dz * dz > rr2 * rr2) continue;
    const d = sqrt(dx * dx + dz * dz) || 1e-3, up = c[3] + CR - y, out = rr2 - d;
    if (up < out) y = c[3] + CR; else { x = c[0] + dx / d * rr2; z = c[1] + dz / d * rr2; }
  }
  for (let i = 0; i < COLB.length; i++) {
    const b = COLB[i];
    if (y > b[7] + CR || y < b[6] - CR) continue;
    const dx = x - b[0], dz = z - b[1], a = dx * b[2] + dz * b[3], p = -dx * b[3] + dz * b[2];
    const oa = b[4] + CR - abs(a), op = b[5] + CR - abs(p);
    if (oa <= 0 || op <= 0) continue;
    const up = b[7] + CR - y;
    if (up < oa && up < op) y = b[7] + CR;
    else if (oa < op) { const na = a + (a > 0 ? oa : -oa); x = b[0] + na * b[2] - p * b[3]; z = b[1] + na * b[3] + p * b[2]; }
    else { const np = p + (p > 0 ? op : -op); x = b[0] + a * b[2] - np * b[3]; z = b[1] + a * b[3] + np * b[2]; }
  }
  const g = max(H(x, z), 0) + 1.2; if (y < g) { y = g; if (F[VY] < 0) F[VY] = 0; }
  F[CX] = x; F[CY] = y; F[CZ] = z;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtr = now - F[LAST]; F[LAST] = now;
  let dt = dtr / 1000; if (dt > 0.1) dt = 0.1;
  // dynamic resolution: keep the GPU between 10 and 13 ms per frame
  if (dtr < 1e3 && (dynT += dtr) > 0 && (dynN++, dynT > (menu ? 400 : 1000))) {
    const a = dynT / dynN, g = dynGN ? dynG / dynGN : 0; let k = 1;
    if (g) { if (g > 13 || g < 9.5) k = 11.3 / g; } else if (a > 17.6) k = 15 / a; else if (a < 12) k = 1.1;
    k = k < 0.6 ? 0.6 : k > 1.5 ? 1.5 : k;
    const top = min(PIXMAX, DW * DH), was = pix;
    pix = clamp(pix * k, min(PIXMIN, top), top);
    if (abs(was - pix) > 1) keep('wrenhollow', [LV, pix | 0]);
    dynN = dynT = dynG = dynGN = 0; resize();
  }
  F[TIME] += dt;
  if (watch) { F[FLT] = (F[FLT] + dt) % FLYT; flyAt(); }
  else if (follow) {
    // ride behind the eagle
    eagleAt(F[TIME]); const ex = EG[0], ey = EG[1], ez = EG[2], fx = EG[3], fz = EG[5];
    const k = 1 - exp(-dt * 2.5);
    F[CX] += (ex - fx * 9 - F[CX]) * k; F[CY] += (ey + 3 - F[CY]) * k; F[CZ] += (ez - fz * 9 - F[CZ]) * k;
    P6[0] = F[CX]; P6[1] = F[CY]; P6[2] = F[CZ]; P6[3] = ex + fx * 10; P6[4] = ey - 1.5; P6[5] = ez + fz * 10; aim();
  }
  else {
    if (tId >= 0) {
      const tr = 4 / (innerWidth < innerHeight ? innerWidth : innerHeight); let jx = (tx - tx0) * tr, jy = (ty - ty0) * tr;
      jx = jx > 1 ? 1 : jx < -1 ? -1 : jx; jy = jy > 1 ? 1 : jy < -1 ? -1 : jy;
      lkx += jx * 1.5 * dt; lky += jy * dt;
    }
    const kq = 1 - exp(-dt * 30); lkx += mdx * 0.0022; lky += mdy * 0.0022; mdx = 0; mdy = 0;
    const ax = lkx * kq, ay = lky * kq; lkx -= ax; lky -= ay; l2x += ax; l2y += ay;
    const dyw = l2x * kq, dpt = l2y * kq; l2x -= dyw; l2y -= dpt;
    const yaw = F[YAW] + dyw; let pitch = F[PIT] - dpt; pitch = pitch < -1.55 ? -1.55 : pitch > 1.55 ? 1.55 : pitch;
    const sp = ks || tN > 1 ? 70 : 14, k = 1 - exp(-dt * 3.5), mf = tId >= 0 ? 0.7 : kf - kb, mr = kr - kl, mu = ku - kd, cp = cos(pitch), sy = sin(yaw), cw = cos(yaw);
    const vx = F[VX] + ((sy * cp * mf + cw * mr) * sp - F[VX]) * k, vy = F[VY] + ((sin(pitch) * mf + mu) * sp - F[VY]) * k, vz = F[VZ] + ((-cw * cp * mf + sy * mr) * sp - F[VZ]) * k;
    let x = F[CX] + vx * dt, y = F[CY] + vy * dt, z = F[CZ] + vz * dt;
    x = clamp(x, -990, 990); z = clamp(z, -990, 990); y = y > 1100 ? 1100 : y;
    F[YAW] = yaw; F[PIT] = pitch; F[VX] = vx; F[VY] = vy; F[VZ] = vz; F[CX] = x; F[CY] = y; F[CZ] = z;
    collide();
  }
  lifeTick(dt, F[CX], F[CY], F[CZ]); Q.writeBuffer(ibLifeI, 0, LI, 0, LN * 8);
  render();
  if (hud) {
    hN++; if (dtr > hMax) hMax = dtr; if (dtr < hMin) hMin = dtr; if (dtr > hPer * 1.5) { hLate++; hTot++; }
    F[HUDT] += dtr / 1000;
    if (F[HUDT] > 0.5) { info.textContent = `${(hN / F[HUDT]).toFixed(0)} fps  ·  worst frame ${hMax.toFixed(1)} ms  ·  late frames ${hLate} (total ${hTot})  ·  GPU ${F[GPU].toFixed(2)} ms  ·  ${W}x${H2} (${W * 100 / DW | 0}%)  ·  ${F[CX].toFixed(0)} ${F[CY].toFixed(0)} ${F[CZ].toFixed(0)}`; F[HUDT] = 0; hPer = hMin; hN = 0; hMax = 0; hMin = 1e9; hLate = 0; }
  }
}

// ---------------------------------------------------------------- input
const key = (e, v) => {
  // any movement takes the camera back from the tour or the eagle
  if (v && /Key[WASDQE]|Arrow/.test(e.code)) watch = follow = false;
  switch (e.code) {
    case 'KeyW': kf = v; break; case 'KeyS': kb = v; break; case 'KeyA': kl = v; break; case 'KeyD': kr = v; break;
    case 'KeyE': ku = v; break; case 'KeyQ': kd = v; break; case 'ShiftLeft': case 'ShiftRight': ks = v; break;
    default: if (v && !e.repeat) {
      if (e.code === 'KeyH') { hud = !hud; hTot = 0; hPer = 1e9; info.textContent = ''; }
      else if (e.code === 'KeyM') mute();
      else if (e.code === 'KeyT') setTime(tod + 1, true);
      else if (e.code === 'KeyG') { follow = !follow && TOD[tod].night < 0.3 && WEATHER[weather].precip < 0.5; const n = $('n'); n.textContent = follow ? 'Following the eagle' : TOD[tod].night >= 0.3 || WEATHER[weather].precip >= 0.5 ? 'The eagle is not out' : ''; n.className = ''; void n.offsetWidth; n.className = 'on'; }
      else if (e.code === 'KeyY') setSeason(season + 1, true);
      else if (e.code === 'KeyR') setWeather(weather + 1, true);
      else if (e.code === 'Escape') ui(true);
      else if (e.code >= 'Digit1' && e.code <= 'Digit6') lookAt(...POSES[e.code.charCodeAt(5) - 49]);
    }
  }
};
addEventListener('keydown', (e) => { if (menu && e.code !== 'KeyH' && e.code !== 'KeyM') return; sound(); key(e, 1); });
addEventListener('keyup', (e) => key(e, 0));
const release = () => { kf = kb = kl = kr = ku = kd = ks = 0; tId = -1; tN = 0; };
const capture = () => { sound(); const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => canvas.requestPointerLock()).catch(() => 0); };
canvas.addEventListener('click', capture);
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });
addEventListener('blur', release);
const touch = (e) => {
  e.preventDefault(); sound(); tN = e.touches.length;
  let f = null, first = false; for (let i = 0; i < tN; i++) if (e.touches[i].identifier === tId) f = e.touches[i];
  if (!f) { tId = -1; if (tN) { f = e.touches[0]; tId = f.identifier; first = true; } }
  if (f) {
    const x = rot.matches ? f.clientY : f.clientX, y = rot.matches ? -f.clientX : f.clientY, s = 1100 / min(innerWidth, innerHeight);
    if (first) { tx0 = x; ty0 = y; } else { mdx += (x - tx) * s; mdy += (y - ty) * s; }
    tx = x; ty = y;
  }
};
for (const n of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(n, touch, { passive: false });

// ---------------------------------------------------------------- menu
let menu = true;
const bDive = $('d');
const ui = (m) => {
  if (dead) return;
  menu = m; body.className = m ? 'm' : document.pointerLockElement ? 'g p' : 'g';
  if (m) { release(); setTimeout(() => menu && bDive.focus(), 100); } else document.activeElement.blur();
};
const go = () => {
  sound(); ui(false); bDive.textContent = 'Resume';
  if (mob) document.documentElement.requestFullscreen?.()?.then(() => screen.orientation.lock('landscape')).catch(() => 0);
  if (!mob) capture();
};
bDive.onclick = go; $('o').onclick = () => ui(true);
// watch: the camera tours the castle on its own until you press a key or click
$('wt').onclick = () => { sound(); watch = true; follow = false; F[FLT] = 0; ui(false); bDive.textContent = 'Resume'; };
canvas.addEventListener('mousedown', () => { watch = false; });
// time of day, season and weather: a row of buttons each; the choices go into the address too, so a look can be shared
const rows = [];
const row = (id, table, cur, apply, key, label = (i) => table[i].name) => {
  const el = $(id).lastChild, bs = table.map((t, i) => { const b = document.createElement('button'); b.onclick = () => set(i); el.append(b); return b; });
  const mark = () => bs.forEach((b, k) => { b.textContent = label(k); b.className = k === cur() ? 'on' : ''; });
  const set = (i, say) => {
    apply(i); for (const r of rows) r();
    try { const u = new URL(location.href); u.searchParams.set(key, label(cur()).toLowerCase().replace(' ', '')); history.replaceState(null, '', u); } catch {}
    if (say) { const n = $('n'); n.textContent = label(cur()); n.className = ''; void n.offsetWidth; n.className = 'on'; }
  };
  rows.push(mark); mark();
  return set;
};
const setTime = row('tm', TOD, () => tod, applyTime, 'time');
const setSeason = row('se', SEASON, () => season, applySeason, 'season');
const setWeather = row('we', WEATHER, () => weather, applyWeather, 'weather', weatherName);
$('q').querySelectorAll('button').forEach((b, i) => { if (i === 2 - LV) b.className = 'on'; else b.onclick = () => { keep('wrenhollow', 2 - i); location.reload(); }; });
document.addEventListener('pointerlockchange', () => ui(!document.pointerLockElement));

// draw from every viewpoint once while loading, so the first sight of anything does not cost a frame later
await say('Lighting the windows…', 1, 400);
for (let i = POSES.length - 1; i >= 0; i--) { lookAt(...POSES[i]); render(); }
await Q.onSubmittedWorkDone();
setTimeout(keep, 15e3, 'wrenhollowLoad', '');
ui(true);
requestAnimationFrame((t) => { F[LAST] = t; requestAnimationFrame(frame); });
