// ============================================================================
// trees and other scattered life (load time)
// ============================================================================
// Tree meshes are built at unit height; instances scale them. Materials: 20 pine needles, 21 bark, 22 birch bark,
// 23 birch leaves. Three levels of detail: layered skirts up close, fewer skirts mid-range, a cone far away.
function meshPine(m, lod) {
  const layers = [9, 4, 1][lod], seg = [13, 8, 6][lod];
  if (lod < 2) for (let i = 0; i < 6; i++) {
    const a0 = i * TAU / 6, a1 = (i + 1) * TAU / 6;
    m.quad([cos(a0) * .022, 0, sin(a0) * .022], [cos(a0) * .004, .86, sin(a0) * .004], [cos(a1) * .004, .86, sin(a1) * .004], [cos(a1) * .022, 0, sin(a1) * .022], 21, 0, 0, 0, 1, .1, 1, .1, 0);
  }
  for (let l = 0; l < layers; l++) {
    const t = layers === 1 ? 0 : l / (layers - 1), yt = mix(.2, .93, t) + (layers === 1 ? .8 : 0), yb = layers === 1 ? .12 : yt - mix(.22, .14, t);
    const rb = layers === 1 ? .2 : mix(.3, .09, t) * rr(.9, 1.1), rt = rb * .12, rot = rnd() * TAU;
    const top = [], bot = [];
    for (let i = 0; i <= seg; i++) {
      const a = rot + i * TAU / seg, j = i === seg ? 0 : rr(.75, 1.15), r = rb * (i === seg ? bot[0].j : j);
      const droop = yb - rr(0, .03);
      top.push({ x: cos(a) * rt, y: yt, z: sin(a) * rt, a });
      bot.push({ x: cos(a) * r, y: droop, z: sin(a) * r, a, j: i === seg ? bot[0].j : j });
      if (i === seg) { bot[i].x = cos(a) * rb * bot[0].j; bot[i].z = sin(a) * rb * bot[0].j; }
    }
    m.grow(seg * 4 + 4, seg * 6);
    for (let i = 0; i < seg; i++) {
      // normals lean out and up so the layer reads soft and round
      const v = (p, s) => m.vert(p.x, p.y, p.z, cos(p.a), .9 - .5 * s, sin(p.a), 20, p.a, s ? 1 : 0);
      const a = v(top[i], 0), b = v(top[i + 1], 0), c = v(bot[i + 1], 1), d = v(bot[i], 1);
      m.tri(a, b, c); m.tri(a, c, d);
    }
  }
}
function meshBirch(m, lod) {
  const n = lod ? 5 : 7;
  for (let i = 0; i < n; i++) {
    const a0 = i * TAU / n, a1 = (i + 1) * TAU / n;
    m.quad([cos(a0) * .02, 0, sin(a0) * .02], [cos(a0) * .008, .8, sin(a0) * .008], [cos(a1) * .008, .8, sin(a1) * .008], [cos(a1) * .02, 0, sin(a1) * .02], 22, 0, 0, 0, 1, .1, 1, .1, 0);
  }
  // a loose crown of a few lumpy blobs
  const blobs = lod ? 3 : 7;
  for (let k = 0; k < blobs; k++) {
    const cx = rr(-.1, .1), cy = rr(.5, .9), cz = rr(-.1, .1), r = rr(.13, .2), sg = lod ? 6 : 9, rg = lod ? 4 : 6;
    m.grow(sg * (rg + 1), sg * rg * 6);
    const base = m.nv;
    for (let j = 0; j <= rg; j++) for (let i = 0; i < sg; i++) {
      const th = j / rg * PI, ph = i / sg * TAU, x = sin(th) * cos(ph), y = cos(th), z = sin(th) * sin(ph), w = r * rr(.85, 1.15);
      m.vert(cx + x * w, cy + y * w * .8, cz + z * w, x, y + .3, z, 23, ph, j / rg);
    }
    for (let j = 0; j < rg; j++) for (let i = 0; i < sg; i++) { const a = base + j * sg + i, b = base + j * sg + (i + 1) % sg; m.tri(a, b + sg, b); m.tri(a, a + sg, b + sg); }
  }
}

// forest placement: bucketed into the terrain patch grid for culling
const TCELLS = NPC, TCW = PATCH * CS;
let NROOK = 0;
function makeTrees() {
  rseed(7);
  const cells = Array.from({ length: TCELLS * TCELLS }, () => []);
  const keepOut = (x, z) => {
    for (const o of OBJS) if (x > o[2] - 7 && x < o[5] + 7 && z > o[4] - 7 && z < o[7] + 7) return true;
    return false;
  };
  const N = 90000 / THIN;
  let placed = 0;
  for (let i = 0; i < N * 4 && placed < N; i++) {
    const x = rr(-1010, 1010), z = rr(-1010, 1010), y = H(x, z);
    if (y < 1.5 || y > 330) continue;
    const s = slope(x, z); if (s > 0.85) continue;
    // forest patches thicken on the hillsides and thin near the water and on the crag
    const f = fbm(x * .0035, 3, z * .0035, 4) + .25 * sstep(20, 120, y) - .2 * sstep(.4, .85, s);
    const d0 = hypot(x - 10, z + 10);
    if (f < 0.56 + (rnd() - 0.5) * 0.1 + (d0 < 250 ? 0.12 : 0) || (d0 < 200 && y > 26 && rnd() < 0.85)) continue;
    if (hypot(x + 30, z + 210) < 120 && rnd() < 0.4) continue;
    if (keepOut(x, z)) continue;
    if (hypot((x - 250) * 0.8, z + 440) < 150 && f < 0.75 && rnd() < 0.6) continue;
    const birch = y < 40 && rnd() < 0.18 + 0.3 * sstep(0.5, 0.62, fbm(x * .01, 9, z * .01, 2));
    const hgt = birch ? rr(9, 15) : rr(12, 24) * (1 - 0.35 * sstep(150, 330, y)), cx = clamp(floor((x - CO) / TCW), 0, TCELLS - 1), cz = clamp(floor((z - CO) / TCW), 0, TCELLS - 1);
    cells[cx + cz * TCELLS].push(x, y - 0.3, z, hgt, rnd() * TAU, rnd(), rr(.8, 1.2), birch ? 1 : 0);
    placed++;
  }
  for (let i = 0; i < 400 / THIN; i++) {
    const t = rnd(), x = mix(170, 330, t) + 25 * sin(t * 7) + rr(-30, 30), z = mix(-380, -500, t) + 30 * cos(t * 5) + rr(-30, 30), y = H(x, z);
    if (keepOut(x, z) || hypot(x - mix(170, 330, t) - 25 * sin(t * 7), z - mix(-380, -500, t) - 30 * cos(t * 5)) < 5) continue;
    const cx = clamp(floor((x - CO) / TCW), 0, TCELLS - 1), cz = clamp(floor((z - CO) / TCW), 0, TCELLS - 1), b = rnd() < 0.6;
    cells[cx + cz * TCELLS].push(x, y - 0.3, z, b ? rr(7, 12) : rr(9, 16), rnd() * TAU, rnd(), rr(.9, 1.3), b ? 1 : 0); placed++;
  }
  // per cell: pines first, then birches, so each cell draws two runs
  const out = new Float32Array(placed * 8), start = new Uint32Array(TCELLS * TCELLS * 2 + 1), ylo = new Float32Array(TCELLS * TCELLS).fill(1e9), yhi = new Float32Array(TCELLS * TCELLS).fill(-1e9);
  let n = 0;
  for (let c = 0; c < cells.length; c++) for (const kind of [0, 1]) {
    start[c * 2 + kind] = n;
    const a = cells[c];
    for (let i = 0; i < a.length; i += 8) if (a[i + 7] === kind) { out.set(a.slice(i, i + 8), n * 8); n++; ylo[c] = min(ylo[c], a[i + 1]); yhi[c] = max(yhi[c], a[i + 1] + a[i + 3]); }
  }
  start[cells.length * 2] = n;
  return { data: out, start, ylo, yhi, n };
}

// rooks: flocks circling the towers; each instance is a bird with its own orbit
let NGOOSE0 = 0, NSTAR0 = 0, NKITE0 = 0;
const NSTAR = 1400;
function makeBirds() {
  rseed(9);
  const a = [];
  const flocks = [[40, 150, 10, 70], [-80, 120, 40, 50], [120, 110, -60, 40], [-30, 90, -200, 60]];
  for (const [x, y, z, r] of flocks) for (let i = 0; i < 28; i++) a.push(x + rr(-8, 8), y + rr(-10, 10), z + rr(-8, 8), r * rr(.6, 1.2), rnd() * TAU, rr(.12, .22) * (rnd() < .5 ? -1 : 1), rnd(), rr(.8, 1.2));
  NROOK = a.length / 8;
  // the eagle: wide, slow circles high over the crag (size > 2: it glides)
  a.push(10, 235, 10, 170, 0, 0.065, 0.3, 3.2);
  // the owl at night: lower, around the towers
  a.push(-20, 128, 0, 70, 2, -0.16, 0.7, 1.7);
  // bats at dusk and night (size < 0.5: they flit)
  for (let i = 0; i < 24; i++) a.push(rr(-60, 60), rr(90, 120), rr(-40, 60), rr(15, 40), rnd() * TAU, rr(0.5, 0.9) * (rnd() < .5 ? -1 : 1), rnd(), rr(0.3, 0.4));
  // geese in autumn: a V of 15 (back, side, height offsets from the leader; radius -1 marks them)
  NGOOSE0 = a.length / 8;
  for (let i = 0; i < 15; i++) { const row = (i + 1) >> 1, s = i & 1 ? 1 : -1; a.push(row * 3.4 + rr(-0.4, 0.4), s * row * 2.6 * (i ? 1 : 0), rr(-0.4, 0.4), -1, 0, 0, rnd(), 1.6); }
  // the starling murmuration: each bird a point inside a unit ball (denser toward the cores); the shader stretches,
  // folds and swirls the ball
  NSTAR0 = a.length / 8;
  for (let i = 0; i < NSTAR; i++) { const u = rnd() * 2 - 1, th = rnd() * TAU, s = Math.sqrt(1 - u * u), r = (rnd() ** 0.7) * (i % 3 ? 1 : 0.55); a.push(s * Math.cos(th) * r, u * r, s * Math.sin(th) * r, -2, 0, 0, rnd(), 0.45); }
  // red kites: wide circles over the western hills (size 2: they glide, rufous)
  NKITE0 = a.length / 8;
  for (const [x, y, z, r, sp] of [[-620, 165, -60, 110, 0.06], [-720, 150, 150, 90, -0.07], [-470, 175, -330, 120, 0.05]]) a.push(x, y, z, r, rnd() * TAU, sp, rnd(), 2.05);
  return new Float32Array(a);
}
