// ============================================================================
// development tools: only in dev.html (npm run build:dev), never in index.html
// ============================================================================
//   F    fly the camera along the scripted path (FLY in main.js), one minute around the whole castle
//   B    the same flight as a benchmark: the resolution stays fixed, every frame is timed, the result is shown at the end
//   F, B or 1-6 during a flight stop it
// window.dev also lets shots.mjs drive the page: pose(i), flyTo(t), bench() -> report, freeze(t)
{
  const LOGN = 1 << 16, logFrame = new Float32Array(LOGN), logGpu = new Float32Array(LOGN);
  let flying = false, bench = false, last = 0, nFrame = 0, nGpu = 0, done = null, frozen = -1;
  const stop = () => { flying = bench = false; dynT = 0; };
  const st = (a, n) => { const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y); let sum = 0; for (const v of s) sum += v; return { n, avg: sum / n, p99: s[min(n - 1, floor(n * 0.99))], max: s[n - 1] }; };
  const report = () => {
    const fm = (o) => `avg ${o.avg.toFixed(2)}  p99 ${o.p99.toFixed(2)}  max ${o.max.toFixed(2)} ms`;
    const f = st(logFrame, nFrame), g = nGpu ? st(logGpu, nGpu) : null;
    info.textContent = `Fly-through ${W}x${H2}, ${f.n} frames\nframe  ${fm(f)}\nGPU    ${g ? fm(g) : 'timestamp-query unavailable'}`;
    if (done) { done({ res: [W, H2], frame: f, gpu: g, frames: Array.from(logFrame.subarray(0, nFrame)), gpus: Array.from(logGpu.subarray(0, nGpu)) }); done = null; }
  };
  const draw = render;
  render = () => {
    if (frozen >= 0) F[TIME] = frozen;
    if (flying) {
      const dtr = F[LAST] - last; last = F[LAST];
      F[FLT] += min(dtr / 1000, 0.1); flyAt();
      // the first frames after starting are warm-up (caches, clocks) and are not logged
      if (bench && F[FLT] > 0.15) { if (nFrame < LOGN) logFrame[nFrame++] = dtr; if (F[GPU] > 0 && nGpu < LOGN) logGpu[nGpu++] = F[GPU]; }
      if (F[FLT] >= FLYT) { if (bench) report(); stop(); }
    }
    draw();
  };
  const start = (b) => {
    flying = true; bench = b; titlesOff = true; F[FLT] = 0; last = F[LAST]; nFrame = nGpu = 0;
    if (bench) { hud = false; info.textContent = ''; dynT = -Infinity; }
  };
  addEventListener('keydown', (e) => {
    if (menu || e.repeat) return;
    if (e.code === 'KeyF' || e.code === 'KeyB') { if (flying) stop(); else start(e.code === 'KeyB'); }
    else if (/Digit[1-6]/.test(e.code)) stop();
  });
  window.dev = {
    ready: true,
    pose: (i) => { stop(); lookAt(...POSES[i]); },
    flyTo: (t) => { stop(); F[FLT] = t; flyAt(); },
    look: (...a) => { stop(); lookAt(...a); },
    freeze: (t) => { frozen = t; },
    hide: () => { ui(false); titlesOff = true; },
    setPix: (p) => { pix = p; dynT = -Infinity; resize(); return [W, H2]; },
    bench: () => new Promise((r) => { done = r; ui(false); start(true); }),
    mask: (k) => { DBG = k; },
    gpu: (n) => new Promise((r) => { let k = 0, s = 0; const f = () => { s += F[GPU]; if (++k >= n) r(s / n); else requestAnimationFrame(f); }; requestAnimationFrame(f); }),
    // points on the scripted path that collide() would move: the flight passes through something there
    checkFly: () => { const bad = []; for (let t = 0; t <= FLYT; t += 0.25) { F[FLT] = t; flyAt(); const x = F[CX], y = F[CY], z = F[CZ]; collide(); const m = hypot(F[CX] - x, F[CY] - y, F[CZ] - z); if (m > 0.3) bad.push([t, x | 0, y | 0, z | 0, +m.toFixed(1)]); } return bad; },
    where: () => [F[CX], F[CY], F[CZ], F[YAW], F[PIT]],
    h: (x, z) => H(x, z),
    time: (i) => applyTime(i),
    calm: () => { lifeCalm = true; },
    titles: (on) => { titlesOff = !on; },
    // flowing time from t seconds into the day (0 dawn, 120 morning, ... 600 night), at the given speed
    flow: (t, speed = 1) => { if (!flowing) applyTime(FLOWI); DAYS = speed; DAY0 = t - F[TIME] * speed; blendTime(F[TIME]); setLight(); bakeSky(); bakeShadow(); },
    cur: () => JSON.stringify({ ...CUR, sun: SUN.map((v) => +v.toFixed(3)), shI, slotK }),
    bakeParts: async (n = 10) => {
      const part = (k) => { const e = device.createCommandEncoder(); const r = e.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: tShadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } }); r.setBindGroup(0, bgS);
        if (k === 0) { r.setPipeline(S.terr); r.setIndexBuffer(ibTerr, 'uint32'); for (let i = 0; i < NPC * NPC; i++) r.drawIndexed(TIDX[1][1], 1, TIDX[1][0], 0, i + 1024); }
        if (k === 1) { r.setPipeline(S.solid); r.setVertexBuffer(0, vbCastle); r.setIndexBuffer(ibCastle, 'uint32'); r.drawIndexed(CM.ni); }
        if (k === 2) { r.setPipeline(S.tree); r.setVertexBuffer(0, vbTree); r.setVertexBuffer(1, ibTrees); r.setIndexBuffer(ibTree, 'uint32'); for (let c = 0; c < TCELLS * TCELLS; c++) for (const kk of [0, 1]) { const a = TW.start[c * 2 + kk], m = TW.start[c * 2 + kk + 1] - a; if (m) r.drawIndexed(TR[kk ? 4 : 1][1], m, TR[kk ? 4 : 1][0], 0, a); } }
        r.end(); Q.submit([e.finish()]); };
      const out = {}; for (const k of [0, 1, 2]) { await Q.onSubmittedWorkDone(); const t0 = performance.now(); for (let i = 0; i < n; i++) part(k); await Q.onSubmittedWorkDone(); out[['terrain', 'castle', 'trees'][k]] = +((performance.now() - t0) / n).toFixed(2); }
      await Q.onSubmittedWorkDone(); const t0 = performance.now(); for (let i = 0; i < n; i++) { const e = device.createCommandEncoder(); e.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: tShadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } }).end(); Q.submit([e.finish()]); } await Q.onSubmittedWorkDone(); out.clear = +((performance.now() - t0) / n).toFixed(2);
      out.trees_n = TW.n; out.shadow = SHADOW; return JSON.stringify(out);
    },
    // GPU time of the shadow bake by part (terrain, castle, trees), and of the sky bake, from timestamp queries
    bakeGPU: async (n = 8) => {
      const qs = device.createQuerySet({ type: 'timestamp', count: 2 }), rb = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }), mb = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const run = async (k) => {
        const e = device.createCommandEncoder(), tw = { querySet: qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 };
        if (k === 3) { const r = e.beginRenderPass({ colorAttachments: [colorAtt(tSky.createView(), true)], timestampWrites: tw }); r.setPipeline(pSkyBake); r.setBindGroup(0, bgSkyBake); r.draw(3); r.end(); }
        else { const r = e.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: tShadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }, timestampWrites: tw }); r.setBindGroup(0, bgS);
          if (k === 0 || k === 4) { r.setPipeline(S.terr); r.setIndexBuffer(ibTerr, 'uint32'); for (let i = 0; i < NPC * NPC; i++) r.drawIndexed(TIDX[1][1], 1, TIDX[1][0], 0, i + 1024); }
          if (k === 1 || k === 4) { r.setPipeline(S.solid); r.setVertexBuffer(0, vbCastle); r.setIndexBuffer(ibCastle, 'uint32'); r.drawIndexed(CM.ni); }
          if (k === 2 || k === 4) { r.setPipeline(S.tree); r.setVertexBuffer(0, vbTree); r.setVertexBuffer(1, ibTrees); r.setIndexBuffer(ibTree, 'uint32'); for (let c = 0; c < TCELLS * TCELLS; c++) for (const kk of [0, 1]) { const a = TW.start[c * 2 + kk], m = TW.start[c * 2 + kk + 1] - a; if (m) r.drawIndexed(TR[kk ? 4 : 1][1], m, TR[kk ? 4 : 1][0], 0, a); } }
          r.end(); }
        e.resolveQuerySet(qs, 0, 2, rb, 0); e.copyBufferToBuffer(rb, 0, mb, 0, 16); Q.submit([e.finish()]);
        await mb.mapAsync(GPUMapMode.READ); const t = new BigInt64Array(mb.getMappedRange().slice(0)); mb.unmap(); return Number(t[1] - t[0]) / 1e6;
      };
      const out = {}; for (const [k, name] of [[0, 'terrain'], [1, 'castle'], [2, 'trees'], [4, 'all'], [3, 'sky']]) { let best = 1e9, sum = 0; for (let i = 0; i < n; i++) { const v = await run(k); best = min(best, v); sum += v; } out[name] = [+best.toFixed(2), +(sum / n).toFixed(2)]; }
      bakeShadow(); bakeSky(); return JSON.stringify(out);
    },
    bakeCost: async (n = 10) => { await Q.onSubmittedWorkDone(); const t0 = performance.now(); for (let i = 0; i < n; i++) bakeShadow(); await Q.onSubmittedWorkDone(); const t1 = performance.now(); for (let i = 0; i < n; i++) bakeSky(); await Q.onSubmittedWorkDone(); return JSON.stringify({ shadow: (t1 - t0) / n, sky: (performance.now() - t1) / n }); },
    found: () => JSON.stringify([...FOUND]),
    flash: (v, az, seed = 0.3) => { DEVFLASH = v; UB[78] = UBR[78] = az; UB[77] = UBR[77] = seed; },
    falls: () => JSON.stringify(FALLS.map((v) => +v.toFixed(1))),
    map: () => { stop(); openMap(); },
    // the map with no labels and no buttons (for the atlas page), and where each place falls on it, in percent
    mapClean: () => { stop(); openMap(); $('map').hidden = true; $('o').style.display = 'none'; return JSON.stringify(PLACES.map((p) => [p.name, ...mapAt(...p.at).map((v) => +v.toFixed(2))])); },
    wet: (t) => { stop(); F[FLT] = t; flyAt(); camUB(UB, false); const o = []; for (let i = 0; i < WC.length; i += 4) { const dx = max(WC[i] - F[CX], 0, F[CX] - WC[i + 2]), dz = max(WC[i + 1] - F[CZ], 0, F[CZ] - WC[i + 3]); if (dx * dx + dz * dz < REFLD * REFLD && inView(WC[i], -1, WC[i + 1], WC[i + 2], 1.5, WC[i + 3])) o.push(Array.from(WC.subarray(i, i + 4))); } return JSON.stringify({ cam: [F[CX] | 0, F[CY] | 0, F[CZ] | 0], cells: o }); },
    // open hilltops: high, gentle, no trees within r metres, away from buildings
    tops: (r = 30) => { const out = []; for (let z = -900; z <= 900; z += 25) for (let x = -900; x <= 900; x += 25) { const y = H(x, z); if (y < 40 || slope(x, z) > 0.18) continue; if (OBJS.some((o) => x > o[2] - 30 && x < o[5] + 30 && z > o[4] - 30 && z < o[7] + 30)) continue; let near = false; for (let i = 0; i < TW.n && !near; i++) if (abs(TW.data[i * 8] - x) < r && abs(TW.data[i * 8 + 2] - z) < r) near = true; if (!near && H(x + 40, z) < y + 3 && H(x - 40, z) < y + 3 && H(x, z + 40) < y + 3 && H(x, z - 40) < y + 3) out.push([x, z, y | 0]); } return JSON.stringify(out.slice(0, 40)); },
    // frame the first animal of a kind from a distance, from the side and a little above
    animal: (k, d) => { lifeCalm = true; stop(); const i = LRUN[k][0] * 8, x = LI[i], y = LI[i + 1], z = LI[i + 2], a = LI[i + 3] + PI / 2; lookAt(x + cos(a) * d, y + d * 0.3 + 1, z + sin(a) * d, x, y + 0.9, z); },
    trees: (x, z, r) => { const o = []; for (let i = 0; i < TW.n && o.length < 5; i++) { const a = TW.data[i * 8], b = TW.data[i * 8 + 2]; if (hypot(a - x, b - z) < r) o.push([a | 0, TW.data[i * 8 + 1] | 0, b | 0]); } return JSON.stringify(o); },
    follow: () => { stop(); follow = true; },
    kind: (k) => JSON.stringify(Array.from({ length: LRUN[k][1] }, (_, i) => { const o = (LRUN[k][0] + i) * 8; return [LI[o] | 0, LI[o + 1] | 0, LI[o + 2] | 0, +LI[o + 3].toFixed(2)]; })),
    life: () => JSON.stringify({ runs: LRUN, at: LRUN.map(([s0, n]) => n ? [LI[s0 * 8] | 0, LI[s0 * 8 + 1] | 0, LI[s0 * 8 + 2] | 0] : null) }),
    season: (i) => applySeason(i),
    weather: (i) => applyWeather(i),
    // a grid of terrain heights, rows along z: dev.grid(x0, x1, z0, z1, step)
    grid: (x0, x1, z0, z1, s) => { const r = []; for (let z = z0; z <= z1; z += s) { const row = []; for (let x = x0; x <= x1; x += s) row.push(H(x, z) | 0); r.push(z + ': ' + row.join(' ')); } return r.join('\n'); },
  };
}
