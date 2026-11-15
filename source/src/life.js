// ============================================================================
// animals: red deer and sheep on the grass, swans and ducks on the loch
// ============================================================================
// Meshes face +x with their feet at y = 0 and are animated in the vertex shader (W_LIFE): uv.x = limb * 10 + pivot x + 2,
// uv.y = pivot y. Limbs: 0 body, 1-4 legs (front left, front right, back left, back right), 5 head and neck.
// Materials: 30 deer coat, 31 antler and hoof, 32 wool, 33 dark face and legs, 34 swan white, 35 bill, 36 duck brown,
// 37 duck green head, 38 eagle plumage, 39 eagle head (pale gold). Limbs 6 and 7 are the wings (they roll about
// the body's axis, pivot z in place of pivot x). A small simulation moves them (lifeTick); its output is one preallocated instance array.
const KIND = { HIND: 0, STAG: 1, SHEEP: 2, SWAN: 3, DUCK: 4, EAGLE: 5 };
function lifeMeshes() {
  const m = new Mesh(), runs = [];
  const L = (limb, px, py) => [limb * 10 + px + 2, py];
  // an ellipsoid, in rings
  // nr: shade with the normals of a larger ellipsoid [cx, cy, cz, rx, ry, rz], so overlapping blobs read as one body
  const ell = (cx, cy, cz, rx, ry, rz, mat, lb = L(0, 0, 0), sg = 10, rg = 6, nr = null) => {
    m.grow(sg * (rg + 1), sg * rg * 6); const b0 = m.nv;
    for (let j = 0; j <= rg; j++) for (let i = 0; i < sg; i++) {
      const th = j / rg * PI, ph = i / sg * TAU, x = sin(th) * cos(ph), y = cos(th), z = sin(th) * sin(ph);
      const px = cx + x * rx, py = cy + y * ry, pz = cz + z * rz;
      if (nr) m.vert(px, py, pz, (px - nr[0]) / nr[3] ** 2, (py - nr[1]) / nr[4] ** 2, (pz - nr[2]) / nr[5] ** 2, mat, lb[0], lb[1]);
      else m.vert(px, py, pz, x / rx, y / ry, z / rz, mat, lb[0], lb[1]);
    }
    for (let j = 0; j < rg; j++) for (let i = 0; i < sg; i++) { const a = b0 + j * sg + i, b = b0 + j * sg + (i + 1) % sg; m.tri(a, b + sg, b); m.tri(a, a + sg, b + sg); }
  };
  // a tapered tube from a to b
  const seg = (a, b, r0, r1, mat, lb = L(0, 0, 0), n = 6) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = hypot(...d), w = d.map((c) => c / l);
    const u = abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let s = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]]; const sl = hypot(...s); s = s.map((c) => c / sl);
    const t = [w[1] * s[2] - w[2] * s[1], w[2] * s[0] - w[0] * s[2], w[0] * s[1] - w[1] * s[0]];
    m.grow(n * 2, n * 6); const b0 = m.nv;
    for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) {
      const an = i / n * TAU, c = cos(an), sn = sin(an), r = k ? r1 : r0, p = k ? b : a, nx = s[0] * c + t[0] * sn, ny = s[1] * c + t[1] * sn, nz = s[2] * c + t[2] * sn;
      m.vert(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r, nx, ny, nz, mat, lb[0], lb[1]);
    }
    for (let i = 0; i < n; i++) { const a0 = b0 + i, a1 = b0 + (i + 1) % n; m.tri(a0, a1, a1 + n); m.tri(a0, a1 + n, a0 + n); }
  };
  const run = (f) => { const i0 = m.ni; f(); runs.push([i0, m.ni - i0]); };
  // red deer: hind, then stag with antlers
  const deer = (stag) => {
    const hd = L(5, 0.5, 1.15), s = stag ? 1.12 : 1, S = (v) => v.map((c) => c * s);
    const tn = [0, 1.02 * s, 0, 0.85 * s, 0.34 * s, 0.27 * s];
    ell(0, 1.03 * s, 0, 0.66 * s, 0.29 * s, 0.25 * s, 30, L(0, 0, 0), 14, 8, tn);                                     // barrel
    ell(0.33 * s, 0.99 * s, 0, 0.38 * s, 0.34 * s, 0.25 * s, 30, L(0, 0, 0), 12, 7, tn);                              // deep chest
    ell(-0.38 * s, 1.04 * s, 0, 0.38 * s, 0.31 * s, 0.26 * s, 30, L(0, 0, 0), 12, 7, tn);                             // haunches
    ell(-0.74 * s, 1.08 * s, 0, 0.05, 0.11, 0.07, 32);                                                                   // pale rump
    ell(0.52 * s, 1.16 * s, 0, 0.22 * s, 0.24 * s, 0.17 * s, 30, hd);                                                 // where the neck leaves the chest
    seg(S([0.55, 1.2, 0]), S([0.85, 1.55, 0]), 0.17 * s, 0.1 * s, 30, hd, 8);
    ell(0.97 * s, 1.6 * s, 0, 0.19 * s, 0.1 * s, 0.085 * s, 30, hd); ell(1.13 * s, 1.55 * s, 0, 0.09 * s, 0.06 * s, 0.055 * s, 33, hd);
    for (const z of [-1, 1]) ell(0.87 * s, 1.72 * s, z * 0.09 * s, 0.04, 0.09, 0.03, 30, hd);
    if (stag) for (const z of [-1, 1]) {
      const b = [0.9 * s, 1.68 * s, z * 0.07], t = [0.78 * s, 2.25 * s, z * 0.32];
      seg(b, t, 0.035, 0.018, 31, hd, 5);
      for (const f of [0.3, 0.55, 0.8]) { const p = [b[0] + (t[0] - b[0]) * f, b[1] + (t[1] - b[1]) * f, b[2] + (t[2] - b[2]) * f]; seg(p, [p[0] + 0.18, p[1] + 0.16, p[2] + z * 0.04], 0.02, 0.01, 31, hd, 4); }
    }
    let k = 1;
    for (const front of [true, false]) for (const z of [0.12, -0.12]) {
      const x = front ? 0.42 : -0.46, lb = L(k++, x * s, 0.95 * s), kx = front ? 0.45 : -0.58, ky = front ? 0.42 : 0.46;
      if (!front) ell((x - 0.04) * s, 0.8 * s, z * 1.15 * s, 0.17 * s, 0.24 * s, 0.09 * s, 30, lb);           // thigh
      else ell((x + 0.01) * s, 0.78 * s, z * 1.1 * s, 0.11 * s, 0.2 * s, 0.07 * s, 30, lb);                  // forearm
      seg(S([x, 0.95, z]), S([kx, ky, z]), (front ? 0.08 : 0.1) * s, 0.05 * s, 30, lb, 7);                    // upper leg
      seg(S([kx, ky, z]), [ (x + 0.01) * s, 0.09, z * s], 0.042 * s, 0.032, 30, lb);                         // cannon
      seg([(x + 0.01) * s, 0.09, z * s], [(x + 0.04) * s, 0, z * s], 0.034, 0.03, 31, lb);                 // hoof
    }
  };
  run(() => deer(false)); run(() => deer(true));
  // sheep: a round fleece, a dark face, thin dark legs
  run(() => {
    const fn = [-0.05, 0.75, 0, 0.55, 0.36, 0.34];
    ell(0, 0.72, 0, 0.5, 0.32, 0.32, 32, L(0, 0, 0), 12, 7, fn); ell(-0.1, 0.8, 0, 0.42, 0.28, 0.3, 32, L(0, 0, 0), 10, 6, fn);
    const hd = L(5, 0.38, 0.75);
    ell(0.55, 0.8, 0, 0.17, 0.12, 0.1, 33, hd); ell(0.47, 0.88, 0, 0.12, 0.1, 0.12, 32, hd);
    for (const z of [-1, 1]) ell(0.5, 0.86, z * 0.12, 0.08, 0.025, 0.04, 33, hd);
    let k = 1;
    for (const x of [0.3, -0.3]) for (const z of [0.15, -0.15]) seg([x, 0.5, z], [x, 0, z], 0.05, 0.035, 33, L(k++, x, 0.5));
  });
  // mute swan: a long body sitting low in the water, an S-shaped neck, an orange bill
  run(() => {
    ell(0, 0.12, 0, 0.55, 0.2, 0.28, 34, L(0, 0, 0), 12, 7); ell(-0.38, 0.22, 0, 0.22, 0.15, 0.2, 34);
    const hd = L(5, 0.35, 0.25);
    seg([0.35, 0.22, 0], [0.48, 0.6, 0], 0.08, 0.06, 34, hd); seg([0.48, 0.6, 0], [0.5, 0.88, 0], 0.06, 0.05, 34, hd);
    ell(0.56, 0.92, 0, 0.09, 0.055, 0.05, 34, hd); ell(0.67, 0.9, 0, 0.07, 0.022, 0.028, 35, hd);
  });
  // mallard
  run(() => {
    ell(0, 0.07, 0, 0.24, 0.1, 0.12, 36, L(0, 0, 0), 8, 5); ell(-0.2, 0.12, 0, 0.08, 0.05, 0.06, 36);
    const hd = L(5, 0.15, 0.12);
    seg([0.15, 0.12, 0], [0.2, 0.24, 0], 0.05, 0.04, 37, hd); ell(0.23, 0.27, 0, 0.065, 0.055, 0.05, 37, hd); ell(0.31, 0.26, 0, 0.05, 0.015, 0.025, 35, hd);
  });
  // golden eagle: a solid body, a pale head, a fanned tail, and broad continuous wings ending in fingered primaries
  run(() => {
    ell(0, 0, 0, 0.42, 0.13, 0.14, 38); ell(0.42, 0.04, 0, 0.12, 0.1, 0.09, 39); ell(0.54, 0.02, 0, 0.06, 0.035, 0.03, 35);
    const fan = (x0, x1, w0, w1) => m.quad([x0, 0, -w0], [x0, 0, w0], [x1, -0.02, w1], [x1, -0.02, -w1], 38, 0, 0, 0, 0, 0, 0, 0, 0);
    fan(-0.3, -0.85, 0.08, 0.26);
    for (const sd of [1, -1]) {
      const lb = L(sd > 0 ? 6 : 7, 0.12 * sd, 0.04), q = (a, b, c, d, mat) => m.quad(a, b, c, d, mat, lb[0], lb[1], lb[0], lb[1], lb[0], lb[1], lb[0], lb[1]);
      const P = (x, z, y = 0.04) => [x, y, z * sd];
      q(P(0.2, 0.1), P(0.16, 0.95, 0.07), P(-0.28, 0.95, 0.05), P(-0.24, 0.1), 38);                   // inner wing
      q(P(0.16, 0.95, 0.07), P(0.1, 1.55, 0.09), P(-0.22, 1.55, 0.07), P(-0.28, 0.95, 0.05), 38);       // outer wing
      for (let f = 0; f < 5; f++) { const x0 = 0.08 - f * 0.07, z0 = 1.55; q(P(x0, z0, 0.09), P(x0 + 0.02, z0 + 0.42 - f * 0.05, 0.12 - f * 0.01), P(x0 - 0.035, z0 + 0.4 - f * 0.05, 0.11 - f * 0.01), P(x0 - 0.06, z0, 0.08), 38); }
      q(P(0.18, 0.12, 0.05), P(0.14, 0.9, 0.08), P(0.02, 0.9, 0.075), P(0.04, 0.12, 0.05), 39);        // pale coverts along the leading edge
    }
  });
  return { m, runs };
}

// ---- the population and its behaviour
// per animal: kind, x, z, yaw, home x, home z, target x, target z, state, timer, speed, phase, walk, graze, scale, y
const LS = 16, LIFEMAX = 96;
const LA = new Float32Array(LIFEMAX * LS);  // state
const LI = new Float32Array(LIFEMAX * 8);   // instance data for the GPU: x, y, z, yaw, scale, phase, walk, graze
const LRUN = [];                             // per kind: first animal, count
let LN = 0, lifeCalm = false; // calm: nothing runs from the camera (dev screenshots only)
function makeLife() {
  rseed(21);
  const byKind = [[], [], [], [], []];
  const land = (x, z) => { const y = H(x, z); return y > 3 && y < 150 && slope(x, z) < 0.45 && !OBJS.some((o) => x > o[2] - 4 && x < o[5] + 4 && z > o[4] - 4 && z < o[7] + 4); };
  const water = (x, z) => H(x, z) < -1.5 && H(x + 6, z) < -0.5 && H(x - 6, z) < -0.5 && H(x, z + 6) < -0.5 && H(x, z - 6) < -0.5;
  const herd = (kind, cx, cz, n, r, ok, stag) => {
    let placed = 0;
    for (let k = 0; k < n * 30 && placed < n; k++) {
      const x = cx + rr(-r, r), z = cz + rr(-r, r);
      if (!ok(x, z)) continue;
      byKind[stag && placed === 0 ? KIND.STAG : kind].push([x, z, cx, cz]); placed++;
    }
  };
  // red deer in the open meadows: below the castle by the gorge mouth, and up the glen
  herd(KIND.HIND, 150, 60, 7, 30, land, true);
  herd(KIND.HIND, 235, -265, 6, 30, land, true);
  herd(KIND.HIND, -330, -60, 6, 35, land, true);
  // sheep on the village pastures
  herd(KIND.SHEEP, 330, -370, 12, 35, land);
  herd(KIND.SHEEP, 190, -520, 12, 35, land);
  herd(KIND.SHEEP, 360, -500, 9, 30, land);
  // swans in pairs and ducks in small groups on the loch
  for (const [x, z] of [[-170, 250], [-330, 360], [40, 270], [-470, 440]]) herd(KIND.SWAN, x, z, 2, 12, water);
  for (const [x, z] of [[-120, 300], [-250, 220], [-420, 330]]) herd(KIND.DUCK, x, z, 5, 10, water);
  byKind.push([[0, 0, 0, 0]]);
  LN = 0;
  for (let k = 0; k < byKind.length; k++) {
    LRUN.push([LN, byKind[k].length]);
    for (const [x, z, hx, hz] of byKind[k]) {
      if (LN >= LIFEMAX) break;
      const a = LA.subarray(LN * LS, LN * LS + LS);
      a[0] = k; a[1] = x; a[2] = z; a[3] = rnd() * TAU; a[4] = hx; a[5] = hz; a[6] = x; a[7] = z; a[8] = 0; a[9] = rr(1, 8);
      a[10] = 0; a[11] = rnd(); a[12] = 0; a[13] = 1; a[14] = k === KIND.STAG ? 1 : k === KIND.HIND ? rr(0.85, 1) : k === KIND.EAGLE ? 1.1 : rr(0.85, 1.1); a[15] = 0;
      LN++;
    }
  }
}
// the eagle's flight: wide slow circles over the crag (position and direction into EG)
const EG = new Float64Array(6);
function eagleAt(t) {
  const an = 0.065 * t, R = 170;
  EG[0] = 10 + cos(an) * R; EG[1] = 235 + sin(an * 2.3 + 2.7) * 5; EG[2] = 10 + sin(an) * R * 0.7;
  const fx = -sin(an) * R, fz = cos(an) * R * 0.7, l = hypot(fx, fz); EG[3] = fx / l; EG[4] = 0; EG[5] = fz / l;
}
// states: 0 grazing, 1 walking to a target, 2 fleeing
function lifeTick(dt, cx, cy, cz) {
  for (let i = 0; i < LN; i++) {
    const b = i * LS, k = LA[b];
    if (k === KIND.EAGLE) { eagleAt(F[TIME]); const o = i * 8; LI[o] = EG[0]; LI[o + 1] = EG[1]; LI[o + 2] = EG[2]; LI[o + 3] = atan2(EG[5], EG[3]); LI[o + 4] = LA[b + 14]; LI[o + 5] = F[TIME] * 0.55 % 1; LI[o + 6] = 1; LI[o + 7] = 0.15 + 0.55 * sstep(0.75, 0.95, sin(F[TIME] * 0.23 + 3.3)); continue; }
    const swim = k >= KIND.SWAN, sheep = k === KIND.SHEEP;
    let x = LA[b + 1], z = LA[b + 2];
    const dx = x - cx, dz = z - cz, dc = hypot(dx, dz), above = cy - (swim ? 0 : H(x, z));
    // too close: run (deer bolt, sheep trot off, birds paddle away)
    const scare = swim ? 18 : sheep ? 22 : 45;
    if (!lifeCalm && dc < scare && above < (swim ? 15 : 45) && LA[b + 8] !== 2) {
      const run = swim ? 30 : sheep ? 40 : 110; LA[b + 8] = 2; LA[b + 9] = swim ? 6 : sheep ? 5 : 7;
      LA[b + 6] = x + dx / (dc + 0.1) * run + rr(-15, 15); LA[b + 7] = z + dz / (dc + 0.1) * run + rr(-15, 15);
    }
    LA[b + 9] -= dt;
    if (LA[b + 9] <= 0) {
      if (LA[b + 8] === 0) { // done grazing: wander somewhere near home
        const r = swim ? 35 : sheep ? 30 : 40; LA[b + 6] = LA[b + 4] + rr(-r, r); LA[b + 7] = LA[b + 5] + rr(-r, r); LA[b + 8] = 1; LA[b + 9] = rr(4, 10);
      } else { // done walking or fleeing: graze here; home drifts to where the herd settled
        LA[b + 8] = 0; LA[b + 9] = rr(4, 12);
        if (hypot(x - LA[b + 4], z - LA[b + 5]) > 60) { LA[b + 4] += (x - LA[b + 4]) * 0.5; LA[b + 5] += (z - LA[b + 5]) * 0.5; }
      }
    }
    const st = LA[b + 8], tx = LA[b + 6] - x, tz = LA[b + 7] - z, td = hypot(tx, tz);
    let sp = st === 2 ? (swim ? 2.2 : sheep ? 3 : 9) : st === 1 ? (swim ? 0.6 : sheep ? 0.5 : 1.1) : 0;
    if (td < 1) { sp = 0; if (st === 1) LA[b + 9] = min(LA[b + 9], 0.5); }
    // turn toward the target, then move; blocked by water (land animals), land (swimmers), steep ground and buildings
    if (sp > 0) {
      let dy = atan2(tz, tx) - LA[b + 3]; dy -= TAU * round(dy / TAU);
      LA[b + 3] += clamp(dy, -dt * (st === 2 ? 4 : 1.5), dt * (st === 2 ? 4 : 1.5));
      const nx = x + cos(LA[b + 3]) * sp * dt, nz = z + sin(LA[b + 3]) * sp * dt, h = H(nx, nz);
      const ok = swim ? h < -0.8 : h > 2 && slope(nx, nz) < 0.55 && abs(nx) < 990 && abs(nz) < 990;
      if (ok) { x = nx; z = nz; } else { LA[b + 6] = x - tx; LA[b + 7] = z - tz; LA[b + 3] += 0.8; }
    }
    LA[b + 1] = x; LA[b + 2] = z;
    LA[b + 10] += (sp - LA[b + 10]) * min(1, dt * 3);
    const stride = swim ? 1 : sheep ? 0.9 : st === 2 ? 3.2 : 1.6;
    LA[b + 11] = (LA[b + 11] + dt * LA[b + 10] / stride) % 1;
    LA[b + 12] += ((sp > 0 ? (st === 2 && !sheep ? 2 : 1) : 0) - LA[b + 12]) * min(1, dt * 4);
    // heads down while grazing (dabbling, for the birds), up and alert otherwise
    const g = st === 0 ? (swim ? 0.5 + 0.5 * sin(F[TIME] * 0.5 + i) : 1) : 0;
    LA[b + 13] += (g - LA[b + 13]) * min(1, dt * 1.5);
    const o = i * 8, y = swim ? 0.02 * sin(F[TIME] * 1.3 + i) : H(x, z);
    LI[o] = x; LI[o + 1] = y; LI[o + 2] = z; LI[o + 3] = LA[b + 3]; LI[o + 4] = LA[b + 14]; LI[o + 5] = LA[b + 11]; LI[o + 6] = LA[b + 12]; LI[o + 7] = swim ? max(LA[b + 13], 0) : LA[b + 13];
  }
}
