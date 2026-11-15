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
      if (bench) { if (nFrame < LOGN) logFrame[nFrame++] = dtr; if (F[GPU] > 0 && nGpu < LOGN) logGpu[nGpu++] = F[GPU]; }
      if (F[FLT] >= FLYT) { if (bench) report(); stop(); }
    }
    draw();
  };
  const start = (b) => {
    flying = true; bench = b; F[FLT] = 0; last = F[LAST]; nFrame = nGpu = 0;
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
    hide: () => ui(false),
    setPix: (p) => { pix = p; dynT = -Infinity; resize(); return [W, H2]; },
    bench: () => new Promise((r) => { done = r; ui(false); start(true); }),
    mask: (k) => { DBG = k; },
    gpu: (n) => new Promise((r) => { let k = 0, s = 0; const f = () => { s += F[GPU]; if (++k >= n) r(s / n); else requestAnimationFrame(f); }; requestAnimationFrame(f); }),
    // points on the scripted path that collide() would move: the flight passes through something there
    checkFly: () => { const bad = []; for (let t = 0; t <= FLYT; t += 0.25) { F[FLT] = t; flyAt(); const x = F[CX], y = F[CY], z = F[CZ]; collide(); const m = hypot(F[CX] - x, F[CY] - y, F[CZ] - z); if (m > 0.3) bad.push([t, x | 0, y | 0, z | 0, +m.toFixed(1)]); } return bad; },
    where: () => [F[CX], F[CY], F[CZ], F[YAW], F[PIT]],
  };
}
