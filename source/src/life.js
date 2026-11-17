// ============================================================================
// animals: red deer and sheep on the grass, swans and ducks on the loch
// ============================================================================
// Meshes face +x with their feet at y = 0 and are animated in the vertex shader (W_LIFE): uv.x = limb * 10 + pivot x + 2,
// uv.y = pivot y. Limbs: 0 body, 1-4 legs (front left, front right, back left, back right), 5 head and neck.
// Materials: 30 deer coat, 31 antler and hoof, 32 wool, 33 dark face and legs, 34 swan white, 35 bill, 36 duck brown,
// 37 duck green head, 38 eagle plumage, 39 eagle coverts, 40 boat paint, 41 boat timber, 42 eagle head (pale gold),
// 43 duck grey flank, 44 rower's coat, 45 skin, 46 heron grey, 47 heron legs. Limbs 8 and 9 are oars (they sweep about
// the vertical at the rowlock: pivot x, pivot z), limb 10 the rower leaning through the stroke. Limbs 6 and 7 are the wings (they roll about
// the body's axis, pivot z in place of pivot x). A small simulation moves them (lifeTick); its output is one preallocated instance array.
const KIND = { HIND: 0, STAG: 1, SHEEP: 2, SWAN: 3, DUCK: 4, EAGLE: 5, BOAT: 6, FERRY: 7, HERON: 8, CATTLE: 9, RABBIT: 10, SQUIRREL: 11, WHEEL: 12, VILLAGER: 13, BEARER: 14 };
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
      seg(b, t, 0.05, 0.022, 31, hd, 6);
      for (const f of [0.3, 0.55, 0.8]) { const p = [b[0] + (t[0] - b[0]) * f, b[1] + (t[1] - b[1]) * f, b[2] + (t[2] - b[2]) * f]; seg(p, [p[0] + 0.18, p[1] + 0.16, p[2] + z * 0.04], 0.028, 0.012, 31, hd, 5); }
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
    for (const x of [0.3, -0.3]) for (const z of [0.15, -0.15]) { const lb = L(k++, x, 0.5), kx = x + (x > 0 ? 0.03 : -0.05); seg([x, 0.52, z], [kx, 0.26, z], 0.07, 0.045, 33, lb); seg([kx, 0.26, z], [x, 0, z], 0.04, 0.035, 33, lb); }
  });
  // mute swan: a long body sitting low in the water, an S-shaped neck, an orange bill
  run(() => {
    ell(0, 0.12, 0, 0.55, 0.2, 0.28, 34, L(0, 0, 0), 12, 7); ell(-0.38, 0.22, 0, 0.22, 0.15, 0.2, 34);
    for (const z of [-1, 1]) ell(-0.12, 0.24, z * 0.15, 0.42, 0.12, 0.11, 34);
    const hd = L(5, 0.35, 0.25);
    seg([0.35, 0.22, 0], [0.48, 0.6, 0], 0.08, 0.06, 34, hd); seg([0.48, 0.6, 0], [0.5, 0.88, 0], 0.06, 0.05, 34, hd);
    ell(0.56, 0.92, 0, 0.09, 0.055, 0.05, 34, hd); ell(0.67, 0.9, 0, 0.07, 0.022, 0.028, 35, hd);
  });
  // mallard
  run(() => {
    ell(-0.02, 0.07, 0, 0.23, 0.1, 0.12, 43, L(0, 0, 0), 8, 5); ell(0.13, 0.1, 0, 0.11, 0.09, 0.1, 36); ell(-0.22, 0.12, 0, 0.07, 0.05, 0.05, 33);
    ell(0.16, 0.16, 0, 0.045, 0.02, 0.045, 34);
    const hd = L(5, 0.15, 0.12);
    seg([0.15, 0.12, 0], [0.2, 0.24, 0], 0.05, 0.04, 37, hd); ell(0.23, 0.27, 0, 0.065, 0.055, 0.05, 37, hd); ell(0.31, 0.26, 0, 0.05, 0.015, 0.025, 35, hd);
  });
  // golden eagle: a long body, a pale gold head, a fanned tail, broad cambered wings ending in tapered primaries
  run(() => {
    ell(-0.05, 0, 0, 0.5, 0.12, 0.12, 38, L(0, 0, 0), 12, 7); ell(0.44, 0.04, 0, 0.13, 0.095, 0.085, 42); ell(0.57, 0.02, 0, 0.065, 0.035, 0.03, 35);
    const fan = (x0, x1, w0, w1) => m.quad([x0, 0, -w0], [x0, 0, w0], [x1, -0.02, w1], [x1, -0.02, -w1], 38, 0, 0, 0, 0, 0, 0, 0, 0);
    fan(-0.4, -0.95, 0.08, 0.27);
    for (const sd of [1, -1]) {
      const lb = L(sd > 0 ? 6 : 7, 0.12 * sd, 0.04), q = (a, b, c, d, mat) => m.quad(a, b, c, d, mat, lb[0], lb[1], lb[0], lb[1], lb[0], lb[1], lb[0], lb[1]);
      const P = (x, z, y = 0.04) => [x, y, z * sd];
      // two chordwise strips, the middle raised: the wing has a curve to catch the light
      for (const [z0, z1, le0, le1, te0, te1, y0, y1] of [[0.1, 0.95, 0.2, 0.16, -0.26, -0.28, 0.04, 0.07], [0.95, 1.55, 0.16, 0.1, -0.28, -0.22, 0.07, 0.09]]) {
        const mc0 = (le0 + te0) / 2 + 0.05, mc1 = (le1 + te1) / 2 + 0.05;
        q(P(le0, z0, y0), P(le1, z1, y1), P(mc1, z1, y1 + 0.035), P(mc0, z0, y0 + 0.035), z0 < 0.5 ? 39 : 38);
        q(P(mc0, z0, y0 + 0.035), P(mc1, z1, y1 + 0.035), P(te1, z1, y1), P(te0, z0, y0), 38);
      }
      // primaries: tapered to points, spread like fingers
      for (let f = 0; f < 6; f++) {
        // each a narrow feather with a gap to the next, fanned out: the eagle's 'fingers'
        const x0 = 0.08 - f * 0.06, z0 = 1.5, ang = (f - 2.5) * 0.16, len = 0.5 - abs(f - 2) * 0.04;
        const tx = x0 + sin(-ang) * len, tz = z0 + cos(ang) * len;
        q(P(x0 + 0.018, z0, 0.09), P(tx + 0.01, tz, 0.12), P(tx - 0.01, tz, 0.12), P(x0 - 0.018, z0, 0.088), 38);
      }
    }
  });
  // a clinker rowboat: painted hull, timber inside, two thwarts and a pair of oars shipped along the sides
  const boatHull = (oars) => {
    const NS = 12, NP = 8, len = 2.1;
    const st = (i) => -len + (2 * len * i) / NS;
    const w = (x) => 0.66 * sqrt(max(0, 1 - (x / (len + 0.08)) ** 2)) + 0.02, top = (x) => 0.38 + 0.12 * (x / len) ** 2, bot = (x) => -0.2 + 0.08 * (x / len) ** 4;
    for (const [inner, mat] of [[0, 40], [1, 41]]) {
      const b0 = m.nv; m.grow((NS + 1) * (NP + 1), NS * NP * 6);
      for (let i = 0; i <= NS; i++) for (let j = 0; j <= NP; j++) {
        const x = st(i), ph = -PI / 2 + PI * j / NP, k = inner ? 0.94 : 1, ww = w(x) * k, dep = (top(x) - bot(x)) * k;
        const z = ww * sin(ph), y = top(x) - dep * cos(ph) * (inner ? 0.97 : 1) - (inner ? 0.03 : 0);
        m.vert(x, y, z, 0, -cos(ph), sin(ph) * 1.3, mat, 2, 0);
      }
      for (let i = 0; i < NS; i++) for (let j = 0; j < NP; j++) { const a = b0 + i * (NP + 1) + j, b = a + NP + 1; m.tri(a, b, b + 1); m.tri(a, b + 1, a + 1); }
    }
    for (const x of [-0.7, 0.45]) { const hw = w(x) * 0.92; m.quad([x - 0.12, 0.2, -hw], [x + 0.12, 0.2, -hw], [x + 0.12, 0.2, hw], [x - 0.12, 0.2, hw], 41, 2, 0, 2, 0, 2, 0, 2, 0); }
    if (oars) for (const z of [-1, 1]) { seg([-1.6, 0.36, z * 0.5], [1.2, 0.33, z * 0.55], 0.025, 0.025, 41, L(0, 0, 0), 5); m.quad([1.2, 0.32, z * 0.5], [1.75, 0.3, z * 0.48], [1.75, 0.3, z * 0.62], [1.2, 0.32, z * 0.6], 41, 2, 0, 2, 0, 2, 0, 2, 0); }
    };
  run(() => boatHull(true));
  // the ferryman: the same boat, a rower on the forward thwart facing the stern, oars out and pulling
  run(() => {
    boatHull(false);
    const tl = L(10, 0.45, 0.22);
    ell(0.45, 0.6, 0, 0.17, 0.26, 0.2, 44, tl); ell(0.42, 0.98, 0, 0.1, 0.11, 0.1, 45, tl); ell(0.43, 1.06, 0, 0.11, 0.05, 0.11, 44, tl);
    for (const z of [-1, 1]) seg([0.45, 0.78, z * 0.17], [0.22, 0.6, z * 0.36], 0.055, 0.045, 44, tl);
    for (const sd of [1, -1]) {
      const lb = L(sd > 0 ? 8 : 9, 0.5, sd * 0.6);
      seg([0.2, 0.58, sd * 0.32], [0.5, 0.38, sd * 0.62], 0.025, 0.025, 41, lb, 5);
      seg([0.5, 0.38, sd * 0.62], [0.9, -0.02, sd * 2.1], 0.025, 0.02, 41, lb, 5);
      m.quad([0.86, 0.02, sd * 1.75], [0.98, -0.06, sd * 2.25], [0.86, -0.06, sd * 2.25], [0.76, 0.02, sd * 1.75], 41, lb[0], lb[1], lb[0], lb[1], lb[0], lb[1], lb[0], lb[1]);
    }
  });
  // grey heron: long legs, an S-shaped neck, a dagger bill; it stands in the shallows
  run(() => {
    ell(0, 0.95, 0, 0.3, 0.17, 0.15, 46, L(0, 0, 0), 10, 6); ell(-0.32, 0.9, 0, 0.14, 0.06, 0.08, 46);
    const hd = L(5, 0.2, 1.02);
    seg([0.18, 1.02, 0], [0.32, 1.3, 0], 0.06, 0.045, 46, hd); seg([0.32, 1.3, 0], [0.27, 1.52, 0], 0.045, 0.04, 46, hd);
    ell(0.31, 1.56, 0, 0.075, 0.05, 0.045, 34, hd); seg([0.3, 1.58, 0], [0.12, 1.62, 0], 0.012, 0.005, 33, hd, 4);
    seg([0.36, 1.56, 0], [0.6, 1.52, 0], 0.022, 0.004, 35, hd, 4);
    for (const [k, z] of [[1, 0.06], [3, -0.06]]) seg([0, 0.86, z], [0.02, 0, z], 0.022, 0.016, 47, L(k, 0, 0.86));
  });
  // highland cattle: deep shaggy ginger bodies, a fringe over the eyes, wide sweeping horns
  run(() => {
    const tn = [0, 0.95, 0, 0.95, 0.46, 0.42];
    ell(0, 0.95, 0, 0.75, 0.42, 0.38, 49, L(0, 0, 0), 14, 8, tn); ell(0.5, 0.92, 0, 0.4, 0.4, 0.36, 49, L(0, 0, 0), 12, 7, tn); ell(-0.5, 0.98, 0, 0.4, 0.4, 0.37, 49, L(0, 0, 0), 12, 7, tn);
    const hd = L(5, 0.72, 1.05);
    ell(0.98, 1.0, 0, 0.3, 0.25, 0.22, 49, hd); ell(1.22, 0.9, 0, 0.14, 0.13, 0.14, 50, hd); ell(1.0, 1.18, 0, 0.22, 0.13, 0.24, 49, hd);
    for (const z of [-1, 1]) { seg([0.95, 1.18, z * 0.16], [0.98, 1.28, z * 0.55], 0.06, 0.045, 31, hd); seg([0.98, 1.28, z * 0.55], [1.1, 1.5, z * 0.72], 0.045, 0.015, 31, hd); }
    let k = 1;
    for (const x of [0.48, -0.5]) for (const z of [0.2, -0.2]) { const lb = L(k++, x, 0.75); seg([x, 0.78, z], [x, 0.08, z], 0.12, 0.085, 49, lb); seg([x, 0.08, z], [x + 0.02, 0, z], 0.08, 0.075, 33, lb); }
    seg([-0.88, 1.1, 0], [-0.95, 0.6, 0], 0.04, 0.03, 49, L(0, 0, 0), 4);
  });
  // rabbit: a round grey-brown body that bounds, long ears, a white scut
  run(() => {
    const b = L(12, 0, 0);
    ell(0, 0.13, 0, 0.16, 0.11, 0.1, 51, b, 10, 6); ell(0.15, 0.21, 0, 0.075, 0.068, 0.062, 51, b, 8, 5); ell(0.21, 0.2, 0, 0.03, 0.03, 0.03, 33, b, 6, 4);
    for (const z of [-1, 1]) seg([0.13, 0.26, z * 0.025], [0.09, 0.39, z * 0.04], 0.018, 0.012, 51, b, 4);
    ell(-0.16, 0.16, 0, 0.042, 0.042, 0.042, 34, b, 6, 4);
    for (const z of [-1, 1]) ell(-0.06, 0.07, z * 0.075, 0.08, 0.055, 0.03, 51, b, 6, 4);
  });
  // red squirrel: a small russet body, ear tufts and a great bushy tail that flicks
  run(() => {
    const b = L(12, 0, 0), tl = L(13, -0.07, 0.11);
    ell(0, 0.09, 0, 0.1, 0.065, 0.055, 52, b, 8, 5); ell(0.1, 0.13, 0, 0.05, 0.045, 0.042, 52, b, 8, 5);
    for (const z of [-1, 1]) seg([0.1, 0.17, z * 0.022], [0.09, 0.21, z * 0.026], 0.012, 0.004, 52, b, 4);
    ell(-0.12, 0.18, 0, 0.06, 0.1, 0.05, 52, tl, 8, 5); ell(-0.13, 0.3, 0, 0.065, 0.08, 0.055, 52, tl, 8, 5); ell(-0.08, 0.37, 0, 0.05, 0.05, 0.045, 52, tl, 8, 5);
  });
  // the mill wheel: two rims, spokes and paddles, turning about its axle (limb 14)
  run(() => {
    const wl = L(14, 0, 0), R = 2.3, N = 16;
    for (const z of [-0.42, 0.42]) {
      for (let i = 0; i < N; i++) { const a0 = i / N * TAU, a1 = (i + 1) / N * TAU; seg([cos(a0) * R, sin(a0) * R, z], [cos(a1) * R, sin(a1) * R, z], 0.07, 0.07, 41, wl, 4); }
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; seg([0, 0, z], [cos(a) * R, sin(a) * R, z], 0.05, 0.05, 41, wl, 4); }
    }
    seg([0, 0, -0.7], [0, 0, 0.7], 0.14, 0.14, 6, wl, 6);
    for (let i = 0; i < N; i++) { const a = (i + 0.5) / N * TAU, c = cos(a), s = sin(a), r0 = R - 0.45, r1 = R + 0.1; m.quad([c * r0, s * r0, -0.45], [c * r1, s * r1, -0.45], [c * r1, s * r1, 0.45], [c * r0, s * r0, 0.45], 41, wl[0], wl[1], wl[0], wl[1], wl[0], wl[1], wl[0], wl[1]); }
  });
  // people: a coat, a hat, legs that walk (limbs 1 and 3); the lantern-bearer carries a lantern (glass, material 16)
  const person = (lamp) => {
    const tn = [0, 1.25, 0, 0.26, 0.55, 0.3];
    ell(0, 1.28, 0, 0.17, 0.33, 0.21, 48, L(0, 0, 0), 10, 6, tn); seg([0, 1.05, 0], [0, 0.62, 0], 0.22, 0.27, 48, L(0, 0, 0), 8);
    ell(0.02, 1.7, 0, 0.1, 0.12, 0.1, 45, L(0, 0, 0), 8, 5); ell(0, 1.8, 0, 0.13, 0.04, 0.13, 44, L(0, 0, 0), 8, 4); ell(0, 1.84, 0, 0.08, 0.05, 0.08, 44, L(0, 0, 0), 6, 4);
    seg([0, 1.48, 0.24], [0.04, 1.0, 0.29], 0.06, 0.05, 48, L(0, 0, 0), 5);
    if (lamp) { seg([0, 1.48, -0.24], [0.28, 1.12, -0.34], 0.06, 0.05, 48, L(0, 0, 0), 5); ell(0.32, 0.98, -0.35, 0.07, 0.1, 0.07, 16, L(0, 0, 0), 6, 4); seg([0.32, 1.1, -0.35], [0.3, 1.13, -0.35], 0.012, 0.012, 6, L(0, 0, 0), 4); }
    else seg([0, 1.48, -0.24], [-0.02, 1.0, -0.29], 0.06, 0.05, 48, L(0, 0, 0), 5);
    for (const [k, z] of [[1, 0.1], [3, -0.1]]) { const lb = L(k, 0, 0.9); seg([0, 0.92, z], [0, 0.08, z], 0.075, 0.055, 33, lb); seg([0, 0.08, z], [0.1, 0.02, z], 0.05, 0.05, 33, lb); }
  };
  run(() => person(false)); run(() => person(true));
  return { m, runs };
}

// ---- the population and its behaviour
// per animal: kind, x, z, yaw, home x, home z, target x, target z, state, timer, speed, phase, walk, graze, scale, y
const LS = 16, LIFEMAX = 160;
const LA = new Float32Array(LIFEMAX * LS);  // state
const LI = new Float32Array(LIFEMAX * 8);   // instance data for the GPU: x, y, z, yaw, scale, phase, walk, graze
const LRUN = [];                             // per kind: first animal, count
let LN = 0, lifeCalm = false; // calm: nothing runs from the camera (dev screenshots only)
function makeLife() {
  rseed(21); makeRoutes();
  const byKind = [[], [], [], [], []];
  const land = (x, z) => { const y = H(x, z); return y > 3 && y < 150 && slope(x, z) < 0.45 && !OBJS.some((o) => !o.wall && x > o[2] - 4 && x < o[5] + 4 && z > o[4] - 4 && z < o[7] + 4); };
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
  byKind.push([[-126, 172, 0.6, 0], [-139, 166, 2.1, 0], [-318, 306, 4, 0], [-232, 725, 1.35, 1]]);   // the last is drawn up on Fisher's Strand
  byKind.push([[FERRY[0], FERRY[1], 0, 0]]);
  const herons = []; for (const [cx, cz] of [[-230, 205], [70, 215], [-420, 380], [-30, 205]]) for (let k = 0; k < 200; k++) { const x = cx + rr(-40, 40), z = cz + rr(-40, 40), h = H(x, z); if (h > -0.6 && h < -0.15 && slope(x, z) < 0.3) { herons.push([x, z, x, z]); break; } }
  byKind.push(herons);
  byKind.push([]); herd(KIND.CATTLE, -265, -505, 6, 35, land); herd(KIND.CATTLE, 245, -235, 4, 22, land); herd(KIND.CATTLE, -560, -185, 4, 22, land);
  herd(KIND.SHEEP, -800, 185, 6, 25, land); herd(KIND.SHEEP, 400, -560, 5, 22, land);
  byKind.push([]); herd(KIND.RABBIT, 640, 262, 6, 26, land); herd(KIND.RABBIT, 150, 62, 4, 25, land);
  // squirrels at the forest edge: each starts beside a tree near one of these spots
  const treeNear = (x, z, r) => { for (let i = 0; i < TW.n; i++) if (abs(TW.data[i * 8] - x) < r && abs(TW.data[i * 8 + 2] - z) < r) return true; return false; };
  byKind.push([]);
  for (const [cx, cz] of [[120, 120], [211, 173], [230, -300], [-280, 34], [-259, -153], [397, -163]]) for (let i = 0; i < TW.n; i++) { const x = TW.data[i * 8], z = TW.data[i * 8 + 2]; if (abs(x - cx) < 40 && abs(z - cz) < 40 && land(x + 5, z) && !treeNear(x + 5, z, 3.5)) { byKind[KIND.SQUIRREL].push([x + 5, z, x + 5, z]); break; } }
  byKind.push([[MILLW[0], MILLW[2], 0, 0]]);
  byKind.push([0, 0, 0, 1, 1, 1, 2, 2, 3, 3].map((r) => [0, 0, r, 0]));        // villagers: the route each walks
  byKind.push([4, 4, 5, 5, 6, 7].map((r) => [0, 0, r, 0]));        // lantern-bearers
  LN = 0;
  for (let k = 0; k < byKind.length; k++) {
    LRUN.push([LN, byKind[k].length]);
    for (const [x, z, hx, hz] of byKind[k]) {
      if (k === KIND.FERRY) { LA[LN * LS] = k; LA[LN * LS + 14] = 1.25; LN++; continue; }
      if (k === KIND.WHEEL) { LA[LN * LS] = k; LA[LN * LS + 14] = 1; LN++; continue; }
      if (k === KIND.VILLAGER || k === KIND.BEARER) {
        // route, distance along it, direction, pause; the scale's last digits pick a coat colour
        const o = LN * LS; LA[o] = k; LA[o + 4] = hx; LA[o + 5] = rr(0, ROUTEL[hx]); LA[o + 8] = rnd() < 0.5 ? 1 : -1; LA[o + 9] = 0; LA[o + 14] = 1 + 0.0025 * (LN % 4); LN++; continue;
      }
      if (k === KIND.BOAT) { LA[LN * LS] = k; LA[LN * LS + 1] = x; LA[LN * LS + 2] = z; LA[LN * LS + 3] = hx; LA[LN * LS + 14] = 1.25; LA[LN * LS + 15] = hz; LA[LN * LS + 4] = hz ? H(x, z) + 0.12 : 0; LN++; continue; }
      if (LN >= LIFEMAX) break;
      const a = LA.subarray(LN * LS, LN * LS + LS);
      a[0] = k; a[1] = x; a[2] = z; a[3] = rnd() * TAU; a[4] = hx; a[5] = hz; a[6] = x; a[7] = z; a[8] = 0; a[9] = rr(1, 8);
      a[10] = 0; a[11] = rnd(); a[12] = 0; a[13] = 1; a[14] = k === KIND.STAG ? 1 : k === KIND.HIND ? rr(0.85, 1) : k === KIND.EAGLE ? 1.1 : rr(0.85, 1.1); a[15] = 0;
      LN++;
    }
  }
}
// the people's routes: 0-3 villagers (Kilwren's lane in two halves, the path to the mill, the burn above the mill),
// 4-7 lantern-bearers (both sides of the Long Viaduct's deck, through the Covered Bridge, the length of the lane).
// Points are x, y, z; y < -500 means 'on the ground'.
const ROUTES = [], ROUTEL = [];
function makeRoutes() {
  const lane = (t0, t1) => { const r = []; for (let i = 0; i <= 24; i++) { const t = mix(t0, t1, i / 24); r.push(mix(170, 330, t) + 25 * sin(t * 7), -999, mix(-380, -500, t) + 30 * cos(t * 5)); } return r; };
  const G = -999;
  for (const r of [lane(0.04, 0.5), lane(0.5, 0.96), [182, G, -383, 198, G, -350, 210, G, -318, 214, G, -295], [214, G, -292, 216, G, -270, 218, G, -248, 220, G, -228],
    [-29.2, 100, -112, -29.2, 100, -318], [-30.8, 100, -318, -30.8, 100, -112], [163, 88, -85.4, 241, 88, -85.4], lane(0.04, 0.96)]) {
    let l = 0; for (let i = 3; i < r.length; i += 3) l += hypot(r[i] - r[i - 3], r[i + 2] - r[i - 1]);
    ROUTES.push(new Float32Array(r)); ROUTEL.push(l);
  }
}
const DL = new Float32Array(24); // the lantern-bearers' lanterns this frame: x, y, z, on
// the ferry's course across Loch Wren, from the boathouse jetty to Inchkeld
const FERRY = [-135, 186, -210, 262, -300, 360, -390, 455, -440, 520];
const FERRYLEN = (() => { let l = 0; for (let i = 0; i + 3 < FERRY.length; i += 2) l = max(l, hypot(FERRY[i + 2] - FERRY[i], FERRY[i + 3] - FERRY[i + 1])); return l; })();
// the eagle's flight: wide slow circles over the crag (position and direction into EG)
const EG = new Float64Array(6);
function eagleAt(t) {
  const an = 0.065 * t, R = 170;
  EG[0] = 10 + cos(an) * R; EG[1] = 235 + sin(an * 2.3 + 2.7) * 5; EG[2] = 10 + sin(an) * R * 0.7;
  const fx = -sin(an) * R, fz = cos(an) * R * 0.7, l = hypot(fx, fz); EG[3] = fx / l; EG[4] = 0; EG[5] = fz / l;
}
// per kind (by KIND number): how close you may come, how far and fast it runs, walking pace, stride, how far it roams
//            hind stag sheep swan duck  -  -  -  heron cattle rabbit squirrel
const SCARE = [45, 45, 22, 18, 18, 0, 0, 0, 22, 18, 15, 10];
const RUND = [110, 110, 40, 30, 30, 0, 0, 0, 40, 30, 40, 20];
const FLEE = [9, 9, 3, 2.2, 2.2, 0, 0, 0, 3, 2.5, 6, 4];
const WALK = [1.1, 1.1, 0.5, 0.6, 0.6, 0, 0, 0, 0.5, 0.5, 1.2, 2.2];
const STRIDE = [1.6, 1.6, 0.9, 1, 1, 0, 0, 0, 0.9, 1.3, 0.55, 0.35];
const ROAM = [40, 40, 30, 35, 35, 0, 0, 0, 30, 25, 12, 8];
// states: 0 grazing, 1 walking to a target, 2 fleeing
function lifeTick(dt, cx, cy, cz) {
  let nl = 0;
  for (let i = 0; i < LN; i++) {
    const b = i * LS, k = LA[b];
    if (k === KIND.FERRY) {
      // back and forth between the boathouse and the island, at a steady pull
      const o = i * 8, n = FERRY.length / 2 - 1; let u = (F[TIME] * 1.3 / FERRYLEN) % (2 * n); if (u > n) u = 2 * n - u;
      const j = min(floor(u), n - 1), f = u - j, ax = FERRY[j * 2], az = FERRY[j * 2 + 1], bx = FERRY[j * 2 + 2], bz = FERRY[j * 2 + 3];
      const back = ((F[TIME] * 1.3 / FERRYLEN) % (2 * n)) > n;
      LI[o] = ax + (bx - ax) * f; LI[o + 1] = sin(F[TIME] * 1.3) * 0.04 - 0.05; LI[o + 2] = az + (bz - az) * f;
      LI[o + 3] = atan2(bz - az, bx - ax) + (back ? PI : 0); LI[o + 4] = 1.25; LI[o + 5] = F[TIME] * 0.38 % 1; LI[o + 6] = 1; LI[o + 7] = 0; continue;
    }
    if (k === KIND.WHEEL) { const o = i * 8; LI[o] = MILLW[0]; LI[o + 1] = MILLW[1]; LI[o + 2] = MILLW[2]; LI[o + 3] = PI / 2; LI[o + 4] = 1; LI[o + 5] = 0; LI[o + 6] = 0; LI[o + 7] = 0; continue; }
    if (k === KIND.VILLAGER || k === KIND.BEARER) {
      // walk the route at an easy pace, pause at each end, turn back
      const r = LA[b + 4], R = ROUTES[r], len = ROUTEL[r];
      let sp = 0;
      if (LA[b + 9] > 0) LA[b + 9] -= dt;
      else { sp = 1.25; LA[b + 5] += LA[b + 8] * sp * dt; if (LA[b + 5] > len || LA[b + 5] < 0) { LA[b + 5] = clamp(LA[b + 5], 0, len); LA[b + 8] *= -1; LA[b + 9] = rr(3, 8); } }
      let d = LA[b + 5], j = 3; while (j < R.length - 3) { const l = hypot(R[j] - R[j - 3], R[j + 2] - R[j - 1]); if (d <= l) break; d -= l; j += 3; }
      const ax = R[j - 3], az = R[j - 1], bx = R[j], bz = R[j + 2], l = hypot(bx - ax, bz - az) || 1, f = min(d / l, 1);
      const x = ax + (bx - ax) * f, z = az + (bz - az) * f, y = R[j - 2] < -500 ? H(x, z) : R[j - 2] + (R[j + 1] - R[j - 2]) * f, yaw = atan2((bz - az) * LA[b + 8], (bx - ax) * LA[b + 8]);
      LA[b + 10] += (sp - LA[b + 10]) * min(1, dt * 4); LA[b + 11] = (LA[b + 11] + dt * LA[b + 10] / 1.4) % 1;
      const o = i * 8; LI[o] = x; LI[o + 1] = y; LI[o + 2] = z; LI[o + 3] = yaw; LI[o + 4] = LA[b + 14]; LI[o + 5] = LA[b + 11]; LI[o + 6] = min(LA[b + 10] / 1.25, 1); LI[o + 7] = 0;
      if (k === KIND.BEARER && nl < 6) { const c = cos(yaw), s = sin(yaw); DL[nl * 4] = x + c * 0.32 + s * 0.35; DL[nl * 4 + 1] = y + 1.0; DL[nl * 4 + 2] = z + s * 0.32 - c * 0.35; DL[nl * 4 + 3] = 1; nl++; }
      continue;
    }
    if (k === KIND.BOAT && LA[b + 15]) { const o = i * 8; LI[o] = LA[b + 1]; LI[o + 1] = LA[b + 4]; LI[o + 2] = LA[b + 2]; LI[o + 3] = LA[b + 3]; LI[o + 4] = LA[b + 14]; LI[o + 5] = 0; LI[o + 6] = 0; LI[o + 7] = 0; continue; }
    if (k === KIND.BOAT) { const o = i * 8, t = F[TIME] + i * 3; LI[o] = LA[b + 1]; LI[o + 1] = sin(t * 1.3) * 0.05 - 0.05; LI[o + 2] = LA[b + 2]; LI[o + 3] = LA[b + 3] + sin(t * 0.21) * 0.15; LI[o + 4] = LA[b + 14]; LI[o + 5] = 0; LI[o + 6] = 0; LI[o + 7] = 0; continue; }
    if (k === KIND.EAGLE) { eagleAt(F[TIME]); const o = i * 8; LI[o] = EG[0]; LI[o + 1] = EG[1]; LI[o + 2] = EG[2]; LI[o + 3] = atan2(EG[5], EG[3]); LI[o + 4] = LA[b + 14]; LI[o + 5] = F[TIME] * 0.55 % 1; LI[o + 6] = 1; LI[o + 7] = 0.15 + 0.55 * sstep(0.75, 0.95, sin(F[TIME] * 0.23 + 3.3)); continue; }
    const heron = k === KIND.HERON, swim = k === KIND.SWAN || k === KIND.DUCK, small = k === KIND.RABBIT || k === KIND.SQUIRREL;
    let x = LA[b + 1], z = LA[b + 2];
    const dx = x - cx, dz = z - cz, dc = hypot(dx, dz), above = cy - (swim ? 0 : H(x, z));
    // too close: run (deer bolt, sheep trot off, birds paddle away)
    if (!lifeCalm && dc < SCARE[k] && above < (swim ? 15 : 45) && LA[b + 8] !== 2) {
      const run = RUND[k]; LA[b + 8] = 2; LA[b + 9] = small ? 3 : swim ? 6 : 6;
      LA[b + 6] = x + dx / (dc + 0.1) * run + rr(-15, 15); LA[b + 7] = z + dz / (dc + 0.1) * run + rr(-15, 15);
    }
    LA[b + 9] -= dt;
    if (LA[b + 9] <= 0) {
      if (LA[b + 8] === 0) { // done grazing: wander somewhere near home
        const r = ROAM[k]; LA[b + 6] = LA[b + 4] + rr(-r, r); LA[b + 7] = LA[b + 5] + rr(-r, r); LA[b + 8] = 1; LA[b + 9] = small ? rr(1, 4) : rr(4, 10);
      } else { // done walking or fleeing: graze here; home drifts to where the herd settled
        LA[b + 8] = 0; LA[b + 9] = small ? rr(1.5, 5) : rr(4, 12);
        if (hypot(x - LA[b + 4], z - LA[b + 5]) > 60) { LA[b + 4] += (x - LA[b + 4]) * 0.5; LA[b + 5] += (z - LA[b + 5]) * 0.5; }
      }
    }
    const st = LA[b + 8], tx = LA[b + 6] - x, tz = LA[b + 7] - z, td = hypot(tx, tz);
    let sp = st === 2 ? FLEE[k] : st === 1 ? WALK[k] : 0;
    if (td < 1) { sp = 0; if (st === 1) LA[b + 9] = min(LA[b + 9], 0.5); }
    // turn toward the target, then move; blocked by water (land animals), land (swimmers), steep ground and buildings
    if (sp > 0) {
      let dy = atan2(tz, tx) - LA[b + 3]; dy -= TAU * round(dy / TAU);
      LA[b + 3] += clamp(dy, -dt * (st === 2 ? 4 : 1.5), dt * (st === 2 ? 4 : 1.5));
      const nx = x + cos(LA[b + 3]) * sp * dt, nz = z + sin(LA[b + 3]) * sp * dt, h = H(nx, nz);
      const ok = swim ? h < -0.8 : heron ? h > -0.7 && h < 0.4 : h > 2 && slope(nx, nz) < 0.55 && abs(nx) < 990 && abs(nz) < 990;
      if (ok) { x = nx; z = nz; } else { LA[b + 6] = x - tx; LA[b + 7] = z - tz; LA[b + 3] += 0.8; }
    }
    LA[b + 1] = x; LA[b + 2] = z;
    LA[b + 10] += (sp - LA[b + 10]) * min(1, dt * 3);
    const stride = STRIDE[k] * (st === 2 && k <= KIND.STAG ? 2 : 1);
    LA[b + 11] = (LA[b + 11] + dt * LA[b + 10] / stride) % 1;
    LA[b + 12] += ((sp > 0 ? (st === 2 && (k <= KIND.STAG || small) ? 2 : 1) : 0) - LA[b + 12]) * min(1, dt * 4);
    // heads down while grazing (dabbling, for the birds), up and alert otherwise
    const g = st === 0 ? (swim ? 0.5 + 0.5 * sin(F[TIME] * 0.5 + i) : heron ? sstep(0.93, 0.99, sin(F[TIME] * 0.37 + i * 2.1)) : 1) : 0;
    LA[b + 13] += (g - LA[b + 13]) * min(1, dt * 1.5);
    const o = i * 8, y = swim ? 0.02 * sin(F[TIME] * 1.3 + i) : heron ? max(H(x, z), -0.45) : H(x, z);
    LI[o] = x; LI[o + 1] = y; LI[o + 2] = z; LI[o + 3] = LA[b + 3]; LI[o + 4] = LA[b + 14]; LI[o + 5] = LA[b + 11]; LI[o + 6] = LA[b + 12]; LI[o + 7] = swim ? max(LA[b + 13], 0) : LA[b + 13];
  }
  for (let k = nl; k < 6; k++) DL[k * 4 + 3] = 0;
}
