// ============================================================================
// the castle: a kit of procedural Gothic pieces and the layout that places them (load time)
// ============================================================================
// Materials (vertex w): 0 ashlar, 1 slate, 2 lit window, 3 timber, 4 copper, 5 dressed trim, 6 lead/iron,
// 7 plaster, 8 greenhouse glass, 9 clock face, 10 dark window, 11 thatch, 12 paving, 13 rubble, 14 rose window,
// 15 traceried window, 16 lantern glass, 17 standing stone, 18 pine canopy
// Colliders: towers are vertical cylinders, everything else oriented boxes. The camera is kept out of both.
const COLC = [], COLB = []; // [x, z, r, ytop] ; [cx, cz, ex, ez, half len, half wid, y0, y1]
const OBJS = []; // [first index, index count, minx, miny, minz, maxx, maxy, maxz] per culling object

function buildCastle() {
  const m = new Mesh();
  rseed(40);
  let o0 = 0;
  const begin = () => { o0 = m.ni; };
  const end = () => {
    if (m.ni === o0) return;
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (let i = o0; i < m.ni; i++) { const v = m.ix[i] * 6; for (let k = 0; k < 3; k++) { const c = m.f[v + k]; if (c < b[k]) b[k] = c; if (c > b[k + 3]) b[k + 3] = c; } }
    OBJS.push([o0, m.ni - o0, ...b]);
  };
  const groundMin = (x, z, r) => { let h = 1e9; for (let a = 0; a < 8; a++) for (const f of [0.5, 1]) h = min(h, H(x + cos(a * TAU / 8) * r * f, z + sin(a * TAU / 8) * r * f)); return min(h, H(x, z)) - 3; };

  // ---- primitives
  // a vertical or tapered quad strip between two points, the front facing away from (cx, cz)
  const panel = (ax, az, bx, bz, y0, y1, mat, cx, cz, u0 = 0, ta = 0) => {
    const dx = bx - ax, dz = bz - az, len = hypot(dx, dz);
    let A = [ax, y0, az], B = [bx, y0, bz], C = [bx - dx * ta, y1, bz - dz * ta], D = [ax + dx * ta, y1, az + dz * ta];
    const nx = -dz, nz = dx, mx = (ax + bx) / 2 - cx, mz = (az + bz) / 2 - cz;
    if (nx * mx + nz * mz < 0) { [A, B] = [B, A]; [C, D] = [D, C]; m.quad(A, B, C, D, mat, u0 + len, y0, u0, y0, u0 + len * (1 - ta), y1, u0 + len * ta, y1); }
    else m.quad(A, B, C, D, mat, u0, y0, u0 + len, y0, u0 + len * (1 - ta), y1, u0 + len * ta, y1);
  };
  // n-sided prism, radius r0 at y0 and r1 at y1
  const prism = (x, z, r0, r1, y0, y1, n, mat, rot = 0) => {
    let u = rnd() * 7;
    for (let i = 0; i < n; i++) {
      const a0 = rot + i * TAU / n, a1 = rot + (i + 1) * TAU / n;
      const A = [x + cos(a0) * r0, y0, z + sin(a0) * r0], B = [x + cos(a1) * r0, y0, z + sin(a1) * r0], C = [x + cos(a1) * r1, y1, z + sin(a1) * r1], D = [x + cos(a0) * r1, y1, z + sin(a0) * r1];
      const L = 2 * r0 * sin(PI / n);
      m.quad(A, D, C, B, mat, u, y0, u, y1, u + L, y1, u + L, y0); // wound so the normal points out
      u += L;
    }
  };
  const disk = (x, z, r, y, n, mat, rot = 0) => {
    for (let i = 0; i < n; i++) { const a0 = rot + i * TAU / n, a1 = rot + (i + 1) * TAU / n; m.quad([x, y, z], [x + cos(a0) * r, y, z + sin(a0) * r], [x + cos(a1) * r, y, z + sin(a1) * r], [x, y, z], mat, 0, 0, r, 0, r, 1, 0, 0); }
  };
  // steep spire: cone in n segments, slight bell flare at the eaves
  const spire = (x, z, r, y0, h, n, mat, rot = 0) => {
    const sl = hypot(r, h);
    for (let i = 0; i < n; i++) {
      const a0 = rot + i * TAU / n, a1 = rot + (i + 1) * TAU / n, L = 2 * r * sin(PI / n);
      const rf = r * 0.82, yf = y0 + h * 0.12;
      m.quad([x + cos(a0) * r, y0, z + sin(a0) * r], [x + cos(a0) * rf, yf, z + sin(a0) * rf], [x + cos(a1) * rf, yf, z + sin(a1) * rf], [x + cos(a1) * r, y0, z + sin(a1) * r], mat, 0, 0, 0, sl * .12, L, sl * .12, L, 0);
      m.quad([x + cos(a0) * rf, yf, z + sin(a0) * rf], [x, y0 + h, z], [x, y0 + h, z], [x + cos(a1) * rf, yf, z + sin(a1) * rf], mat, 0, sl * .12, L / 2, sl, L / 2, sl, L * .82, sl * .12);
    }
  };
  const finial = (x, z, y, h) => { prism(x, z, 0.16, 0.16, y - 0.3, y + 0.5, 6, 6); spire(x, z, 0.2, y + 0.5, h, 6, 6); };
  // oriented box: centre (x, z), half extents along (ex, ez) and its normal, from y0 to y1
  const box = (x, z, ex, ez, hl, hw, y0, y1, mat, top = mat) => {
    const px = -ez, pz = ex;
    const c = [[x - ex * hl - px * hw, z - ez * hl - pz * hw], [x + ex * hl - px * hw, z + ez * hl - pz * hw], [x + ex * hl + px * hw, z + ez * hl + pz * hw], [x - ex * hl + px * hw, z - ez * hl + pz * hw]];
    let u = 0;
    for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; panel(a[0], a[1], b[0], b[1], y0, y1, mat, x, z, u); u += hypot(b[0] - a[0], b[1] - a[1]); }
    if (top >= 0) m.quad([c[0][0], y1, c[0][1]], [c[3][0], y1, c[3][1]], [c[2][0], y1, c[2][1]], [c[1][0], y1, c[1][1]], top, 0, 0, 0, 2 * hw, 2 * hl, 2 * hw, 2 * hl, 0);
  };
  // window panel on a wall: centre, outward normal, width, height (uv 0-1 for the arch shader)
  const win = (x, y, z, nx, nz, w, h, lit = rnd() < 0.9, mat = lit ? 2 : 10) => {
    const tx = -nz, tz = nx, o = 0.07, cx = x + nx * o, cz = z + nz * o;
    m.quad([cx - tx * w / 2, y, cz - tz * w / 2], [cx + tx * w / 2, y, cz + tz * w / 2], [cx + tx * w / 2, y + h, cz + tz * w / 2], [cx - tx * w / 2, y + h, cz - tz * w / 2], mat, 0, 0, 1, 0, 1, 1, 0, 1);
    // flip if it faces the wrong way (quad winding follows the tangent)
    const k = m.nv - 4, b = k * 24 + 12;
    if (m.b[b] * nx + m.b[b + 2] * nz < 0) for (let j = 0; j < 4; j++) { m.b[(k + j) * 24 + 12] *= -1; m.b[(k + j) * 24 + 14] *= -1; }
  };
  // crenellations along a straight run at height y on the outer face (normal nx, nz)
  const merlons = (ax, az, bx, bz, y, nx, nz, th = 0.6) => {
    const L = hypot(bx - ax, bz - az), n = max(1, floor(L / 1.7)), ex = (bx - ax) / L, ez = (bz - az) / L;
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; box(ax + (bx - ax) * t + nx * th * 0.5, az + (bz - az) * t + nz * th * 0.5, ex, ez, 0.45, th / 2, y, y + 1.1, 0); }
  };
  // ---- tower: round (n >= 8) or square (n = 4)
  const tower = (x, z, y0, r, h, o = {}) => {
    begin();
    const n = o.n || (o.round ? (r > 6 ? 20 : 16) : r >= 3.8 ? 8 : 10), rot = n === 4 ? PI / 4 : rnd() * TAU, rr0 = n === 4 ? r * Math.SQRT2 : r;
    const g = o.base ?? groundMin(x, z, r), top = y0 + h;
    prism(x, z, rr0 * 1.12, rr0 * 1.04, max(g, -2), y0, n, 13, rot); prism(x, z, rr0 * 1.04, rr0, y0, y0 + 2, n, 0, rot);
    prism(x, z, rr0, rr0, y0 + 2, top, n, 0, rot);
    // a lantern room: a ring of tall lit windows just under the roof, one per face
    if (o.lantern) for (let i = 0; i < n; i++) { const a = rot + (i + 0.5) * TAU / n, rw = rr0 * cos(PI / n); win(x + cos(a) * rw, top - 9, z + sin(a) * rw, cos(a), sin(a), 2 * rw * sin(PI / n) * 0.62, 6.5, true, 15); }
    // string courses
    for (let y = y0 + 9; y < top - 4; y += 9 + floor(rnd() * 3)) if ((!o.clock || y < top - 2 * r * 0.62 - 3) && (!o.lantern || y < top - 11 || y > top - 2)) prism(x, z, rr0 + 0.18, rr0 + 0.18, y, y + 0.45, n, 5, rot);
    // windows: one per face per floor on narrow faces, offset floor to floor
    const nw = n === 4 ? 4 : min(n, r > 6 ? 10 : r > 4 ? 6 : 4), ww = min(1.5, r * 0.36);
    for (let y = y0 + 4, f = 0; y < top - 4; y += 6.5, f++) for (let i = 0; i < nw; i++) {
      if (rnd() < 0.18 || (o.clock && y > top - 2 * r * 0.62 - 5) || (o.lantern && y > top - 13)) continue;
      const a = n === 4 ? rot + PI / 4 + i * PI / 2 : rot + (i + (f & 1) * 0.5) * TAU / nw + PI / n, rw = n === 4 ? r : rr0 * cos(PI / n);
      if (n === 4) for (const s of [-0.45, 0.45]) win(x + cos(a) * rw - sin(a) * s * r, y, z + sin(a) * rw + cos(a) * s * r, cos(a), sin(a), ww * 0.8, 2.6);
      else win(x + cos(a) * rw, y, z + sin(a) * rw, cos(a), sin(a), ww, 2.7);
    }
    // corbelled top
    const R = rr0 + 0.55;
    prism(x, z, rr0, R, top, top + 1, n, 5, rot);
    COLC.push([x, z, r + 0.6, top + 1]);
    if (o.clock) {
      // clock faces near the top on all four sides
      // round dials (a disc, so the castle shader needs no cut-out), uv 0-1 across the disc as on a square face
      for (let i = 0; i < 4; i++) {
        const a = rot + PI / 4 + i * PI / 2, rw = r + 0.08, s = r * 0.62, cx = x + cos(a) * rw, cz = z + sin(a) * rw, cy = top - 2 - s, tx = -sin(a), tz = cos(a), N = 32;
        m.grow(N + 1, N * 3); const c0 = m.vert(cx, cy, cz, cos(a), 0, sin(a), 9, 0.5, 0.5);
        for (let k = 0; k < N; k++) { const f = k / N * TAU; m.vert(cx + tx * s * cos(f), cy + s * sin(f), cz + tz * s * cos(f), cos(a), 0, sin(a), 9, 0.5 + 0.5 * cos(f) * 1.005, 0.5 + 0.5 * sin(f) * 1.005); }
        for (let k = 0; k < N; k++) m.tri(c0, c0 + 1 + k, c0 + 1 + (k + 1) % N);
      }
    }
    const roof = o.roof || 'spire';
    if (roof === 'flat') {
      prism(x, z, R, R, top + 1, top + 2.2, n, 0, rot);
      disk(x, z, R, top + 1.3, n, 12, rot);
      prism(x, z, 0.12, 0.08, top + 1.3, top + 9.5, 6, 6); BANS.push(x, top + 9.3, z, rnd());
      for (let i = 0; i < n; i++) { const a0 = rot + i * TAU / n, a1 = rot + (i + 1) * TAU / n; merlons(x + cos(a0) * R, z + sin(a0) * R, x + cos(a1) * R, z + sin(a1) * R, top + 2.2, cos((a0 + a1) / 2), sin((a0 + a1) / 2)); }
      if (o.turret !== false) { // stair turret rising past the parapet, with its own spire
        const a = rnd() * TAU, tr = max(1.4, r * 0.3), tx = x + cos(a) * (rr0 - tr * 0.3), tz = z + sin(a) * (rr0 - tr * 0.3);
        prism(tx, tz, tr, tr, top - 6, top + 6, 10, 0); prism(tx, tz, tr, tr + 0.25, top + 6, top + 6.5, 10, 5);
        spire(tx, tz, tr + 0.35, top + 6.5, tr * 3.4, 10, o.cu ? 4 : 1); finial(tx, tz, top + 6.5 + tr * 3.4, 1.5);
        COLC.push([tx, tz, tr + 0.4, top + 7]);
      }
    } else {
      // Gothic towers: a parapet with a pinnacle on every corner, and the spire set back inside it, tall and narrow
      const goth = n === 8 && roof !== 'pyr', rs = goth ? R * 0.84 : R + 0.4, mat = o.cu ? 4 : 1;
      const rh = (o.rh || rr(2.8, 3.6)) * R * (goth ? 1.3 : 1), y1 = top + 1;
      if (goth) { prism(x, z, R, R, y1, y1 + 1.7, n, 5, rot); disk(x, z, R, y1 + 0.25, n, 12, rot); }
      if (roof === 'pyr') spire(x, z, R + 0.35, y1, rh, 4, mat, rot);
      else spire(x, z, rs, y1, rh, n, mat, rot);
      // lucarnes: small gabled windows on alternate faces of the spire
      if (r > (goth ? 4.2 : 5) && roof !== 'pyr') for (let i = 0; i < 4; i++) {
        const a = rot + (goth ? (i * 2 + 0.5) * TAU / n : i * PI / 2 + 0.3), d = rs * 0.66, dx = x + cos(a) * d, dz = z + sin(a) * d, y = y1 + rh * 0.16;
        box(dx, dz, -sin(a), cos(a), 0.6, 0.7, y, y + 1.6, 0); win(dx + cos(a) * 0.7, y + 0.1, dz + sin(a) * 0.7, cos(a), sin(a), 0.8, 1.3);
        spire(dx, dz, 0.9, y + 1.6, 2.2, 4, mat, a + PI / 4); finial(dx, dz, y + 3.8, 0.8);
      }
      finial(x, z, y1 + rh, max(2, r * 0.4));
      if (goth && rh > 22 && rnd() < 0.5) BANS.push(x, y1 + rh + max(2, r * 0.4) * 0.9, z, rnd());   // a pennant on the tallest spires
      if (goth) for (let i = 0; i < n; i++) { const a = rot + i * TAU / n, d = R, qx = x + cos(a) * d, qz = z + sin(a) * d; box(qx, qz, cos(a), sin(a), 0.32, 0.32, top + 0.6, y1 + 3, 5, -1); spire(qx, qz, 0.46, y1 + 3, 3.4, 4, 5, a + PI / 4); }
      else if (r > 3.8) for (let i = 0; i < (n === 4 ? 4 : 6); i++) { const a = rot + (i + 0.5) * TAU / (n === 4 ? 4 : 6) + (n === 4 ? PI / 4 : 0), d = R + 0.1, qx = x + cos(a) * d, qz = z + sin(a) * d; box(qx, qz, cos(a), sin(a), 0.35, 0.35, top + 0.6, top + 2.6, 5, -1); spire(qx, qz, 0.5, top + 2.6, 2.6, 4, 1, a + PI / 4); }
      COLC.push([x, z, R * 0.55, top + 1 + rh * 0.6]);
    }
    end();
  };
  // ---- hall: a range of building along A-B, width w, floor y0, walls wh high, steep slate roof
  const hall = (ax, az, bx, bz, w, y0, wh, o = {}) => {
    begin();
    const L = hypot(bx - ax, bz - az), ex = (bx - ax) / L, ez = (bz - az) / L, px = -ez, pz = ex, cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const hl = L / 2, hw = w / 2, top = y0 + wh;
    let g = 1e9; for (let t = 0; t <= 1; t += 0.125) for (const s of [-1, 1]) g = min(g, H(ax + (bx - ax) * t + px * hw * s, az + (bz - az) * t + pz * hw * s));
    g = o.base ?? g - 3;
    box(cx, cz, ex, ez, hl + 0.3, hw + 0.3, max(g, -2), y0 - 0.5, 13, -1);
    box(cx, cz, ex, ez, hl, hw, y0 - 0.5, top, 0, -1);
    COLB.push([cx, cz, ex, ez, hl + 0.6, hw + 0.6, g, top + w * 0.65]);
    // tall foundations become lower storeys: rows of small windows down the substructure
    for (let y = y0 - 7; y > max(g, -2) + 3; y -= 6) for (const s of [-1, 1]) for (let t = -hl + 3; t < hl - 2; t += 5.5) if (rnd() < 0.75) win(cx + ex * t + px * (hw + 0.3) * s, y, cz + ez * t + pz * (hw + 0.3) * s, px * s, pz * s, 0.8, 1.7, rnd() < 0.6);
    // plinth and string courses
    box(cx, cz, ex, ez, hl + 0.25, hw + 0.25, y0 - 0.5, y0 + 1.2, 5, -1);
    box(cx, cz, ex, ez, hl + 0.15, hw + 0.15, top - 0.6, top, 5, -1);
    // bays: buttresses with sloped caps, windows between
    const bay = o.bay || 5.6, nb = max(1, round(L / bay)), bl = L / nb;
    const great = o.great, rows = great ? 1 : max(1, floor((wh - 3) / 5.5));
    // a tall substructure gets stepped buttresses all the way down, one per bay and at the corners
    if (y0 - max(g, -2) > 8) for (const s of [-1, 1]) for (let i = 0; i <= nb; i++) {
      const t = -hl + i * bl, q = hw + 1.1, bx0 = cx + ex * t + px * q * s, bz0 = cz + ez * t + pz * q * s, yb = max(g, -2), ym = (yb + y0) / 2;
      box(bx0, bz0, ex, ez, 0.85, 0.85, yb, ym, 13, -1);
      box(bx0 - px * 0.3 * s, bz0 - pz * 0.3 * s, ex, ez, 0.75, 0.55, ym, y0 - 1.5, 13, -1);
      box(bx0 - px * 0.3 * s, bz0 - pz * 0.3 * s, ex, ez, 0.8, 0.6, y0 - 1.5, y0 - 0.6, 5, 5);
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i <= nb; i++) {
        const t = -hl + i * bl, bx0 = cx + ex * t + px * (hw + 0.5) * s, bz0 = cz + ez * t + pz * (hw + 0.5) * s;
        const bh = wh * (great ? 0.92 : 0.8);
        box(bx0, bz0, ex, ez, 0.6, 0.55, y0 - 0.5, y0 + bh * 0.7, 0, -1);
        box(cx + ex * t + px * (hw + 0.35) * s, cz + ez * t + pz * (hw + 0.35) * s, ex, ez, 0.5, 0.4, y0 + bh * 0.7, y0 + bh, 0, 5);
        if (o.fly && i > 0 && i < nb) {
          const ox = cx + ex * t + px * (hw + 6) * s, oz = cz + ez * t + pz * (hw + 6) * s, yt = y0 + wh * 0.62;
          box(ox, oz, ex, ez, 0.7, 0.9, max(g, -2), yt, 0, 5); spire(ox, oz, 0.9, yt, 4.5, 4, 1, PI / 4 + atan2(ez, ex));
          const ix = cx + ex * t + px * (hw + 0.4) * s, iz = cz + ez * t + pz * (hw + 0.4) * s, yi = top - 2.5;
          for (const q of [-0.35, 0.35]) m.quad([ox + ex * q, yt - 1.2, oz + ez * q], [ix + ex * q, yi - 1.2, iz + ez * q], [ix + ex * q, yi, iz + ez * q], [ox + ex * q, yt, oz + ez * q], 0, 0, yt - 1.2, 6, yi - 1.2, 6, yi, 0, yt);
          m.quad([ox - ex * 0.35, yt, oz - ez * 0.35], [ix - ex * 0.35, yi, iz - ez * 0.35], [ix + ex * 0.35, yi, iz + ez * 0.35], [ox + ex * 0.35, yt, oz + ez * 0.35], 5, 0, 0, 6, 0, 6, 0.7, 0, 0.7);
          m.quad([ox - ex * 0.35, yt - 1.2, oz - ez * 0.35], [ox + ex * 0.35, yt - 1.2, oz + ez * 0.35], [ix + ex * 0.35, yi - 1.2, iz + ez * 0.35], [ix - ex * 0.35, yi - 1.2, iz - ez * 0.35], 5, 0, 0, 6, 0, 6, 0.7, 0, 0.7);
        }
        if (great || o.pinn || (wh >= 18 && o.pinn !== false)) { const qx = cx + ex * t + px * (hw + 0.35) * s, qz = cz + ez * t + pz * (hw + 0.35) * s; box(qx, qz, ex, ez, 0.4, 0.4, top - 1, top + 2.2, 5, -1); spire(qx, qz, 0.6, top + 2.2, 3, 4, 1, PI / 4 + atan2(ez, ex)); }
      }
      for (let i = 0; i < nb; i++) {
        const t = -hl + (i + 0.5) * bl, wx = cx + ex * t + px * hw * s, wz = cz + ez * t + pz * hw * s;
        if (great) win(wx, y0 + 4, wz, px * s, pz * s, min(bl * 0.6, 3.8), wh * 0.66, true, 15);
        else for (let k = 0; k < rows; k++) if (rnd() > 0.08) { const lw = min(bl * 0.22, 0.95), lit = rnd() < 0.9; for (const q of [-1, 1]) win(wx + ex * q * lw * 0.62, y0 + 1.8 + k * 5.5, wz + ez * q * lw * 0.62, px * s, pz * s, lw, 3.6, lit); }
      }
    }
    // gable ends: tall window, triangular gable in stone, corner pinnacles
    const rh = o.rh || w * 0.62, ov = 0.7;
    for (const s of [-1, 1]) {
      const gx = cx + ex * hl * s, gz = cz + ez * hl * s;
      if (!o.noEnd?.includes(s)) win(gx, y0 + 3, gz, ex * s, ez * s, min(w * (great ? 0.42 : 0.3), great ? 6 : 4), great ? wh * 0.72 : min(wh - 5, 8), true, great ? 15 : 2);
      if (o.rose) { const d = min(w * 0.46, rh * 0.62); win(gx + ex * s * 0.05, top + rh * 0.12, gz + ez * s * 0.05, ex * s, ez * s, d, d, true, 14); }
      m.quad([gx - px * (hw + ov), top - 0.4, gz - pz * (hw + ov)], [gx + px * (hw + ov), top - 0.4, gz + pz * (hw + ov)], [gx, top + rh, gz], [gx, top + rh, gz], 0, 0, top, w, top, w / 2, top + rh, w / 2, top + rh);
      { const k = m.nv - 4; if (m.b[k * 24 + 12] * ex * s + m.b[k * 24 + 14] * ez * s < 0) for (let j = 0; j < 4; j++) { m.b[(k + j) * 24 + 12] *= -1; m.b[(k + j) * 24 + 14] *= -1; } }
      finial(gx + ex * s * 0.2, gz + ez * s * 0.2, top + rh, 1.6);
      if (o.turrets) for (const q of [-1, 1]) {
        if (rnd() < 0.3) continue;
        const tx = gx + px * hw * q + ex * s * 0.4, tz = gz + pz * hw * q + ez * s * 0.4, tr = rr(1.4, 2);
        prism(tx, tz, tr * 0.5, tr, top - 5, top - 3, 10, 5);
        prism(tx, tz, tr, tr, top - 3, top + 4, 10, 0);
        if (rnd() < 0.6) win(tx + px * q * tr, top - 1, tz + pz * q * tr, px * q, pz * q, 0.7, 1.6);
        spire(tx, tz, tr + 0.25, top + 4, tr * rr(3, 4.2), 10, o.cu ? 4 : 1); finial(tx, tz, top + 4 + tr * 3, 1.2);
      }
    }
    // roof: two slopes with overhang; uv runs along the ridge and down the slope
    const rx = hw + ov, sl = hypot(rx, rh), mat = o.cu ? 4 : 1;
    for (const s of [-1, 1]) {
      const e0 = [cx - ex * (hl + 0.5) + px * rx * s, top - 0.4, cz - ez * (hl + 0.5) + pz * rx * s], e1 = [cx + ex * (hl + 0.5) + px * rx * s, top - 0.4, cz + ez * (hl + 0.5) + pz * rx * s];
      const r0 = [cx - ex * (hl + 0.5), top + rh, cz - ez * (hl + 0.5)], r1 = [cx + ex * (hl + 0.5), top + rh, cz + ez * (hl + 0.5)];
      if (s > 0) m.quad(e0, r0, r1, e1, mat, 0, 0, 0, sl, L + 1, sl, L + 1, 0); else m.quad(e1, r1, r0, e0, mat, 0, 0, 0, sl, L + 1, sl, L + 1, 0);
      const k = m.nv - 4; if (m.b[k * 24 + 12] * px * s + m.b[k * 24 + 14] * pz * s < 0) for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) m.b[(k + j) * 24 + 12 + c] *= -1;
      // dormers
      if (o.dormers !== false && wh < 30) for (let i = 1; i < nb; i += 2) {
        const t = -hl + i * bl, dx = cx + ex * t + px * hw * 0.55 * s, dz = cz + ez * t + pz * hw * 0.55 * s, y = top + rh * 0.38;
        box(dx, dz, ex, ez, 0.8, hw * 0.25, y - 1.5, y + 1.3, 0, -1);
        win(dx + px * s * hw * 0.25, y - 0.6, dz + pz * s * hw * 0.25, px * s, pz * s, 1, 1.6);
        spire(dx, dz, 1.15, y + 1.3, 1.6, 4, mat, PI / 4 + atan2(ez, ex));
      }
    }
    // ridge cresting and chimneys
    for (let i = 0; i < nb; i += 3) { const t = -hl + (i + 0.5) * bl; if (rnd() < 0.5 && !o.great) { const sx = cx + ex * t + px * hw * 0.3, sz = cz + ez * t + pz * hw * 0.3; box(sx, sz, ex, ez, 0.6, 0.6, top + rh * 0.5, top + rh + 2, 0, 6); if (VSMOKE.length < 30 && rnd() < 0.5) VSMOKE.push(sx, top + rh + 2.1, sz); } }
    if (o.fleche) { const fx = cx, fz = cz; prism(fx, fz, 1.6, 1.6, top + rh - 1, top + rh + 4, 8, 3); spire(fx, fz, 2, top + rh + 4, 10, 8, o.cu ? 4 : 1); finial(fx, fz, top + rh + 14, 2); }
    end();
  };
  // ---- curtain wall along a polyline: walk on top, crenellated on the outer side (to the left of travel)
  const curtain = (pts, y, h = 8, th = 3) => {
    begin();
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = hypot(bx - ax, bz - az), ex = (bx - ax) / L, ez = (bz - az) / L;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2; let g = 1e9; for (let t = 0; t <= 1; t += 0.1) g = min(g, H(ax + (bx - ax) * t, az + (bz - az) * t));
      box(cx, cz, ex, ez, L / 2 + th / 2, th / 2, max(g - 3, -2), y - 1, 13, -1); box(cx, cz, ex, ez, L / 2 + th / 2, th / 2, y - 1, y + h, 0, 12);
      for (let t = 4.5; t < L - 2; t += 9) box(ax + ex * t - ez * (th / 2 + 0.5), az + ez * t + ex * (th / 2 + 0.5), ex, ez, 0.8, 0.6, max(g - 3, -2), y + h - 1.5, 13, 5);
      for (let t = 6; t < L - 3; t += 9) if (rnd() < 0.7) win(ax + ex * t - ez * th / 2, y + h - 3.6, az + ez * t + ex * th / 2, -ez, ex, 0.5, 1.6, rnd() < 0.3);
      merlons(ax - ez * th / 2, az + ex * th / 2, bx - ez * th / 2, bz + ex * th / 2, y + h, -ez, ex);
      merlons(ax + ez * th / 2, az - ex * th / 2, bx + ez * th / 2, bz - ex * th / 2, y + h, ez, -ex, 0.4);
      COLB.push([cx, cz, ex, ez, L / 2 + th, th / 2 + 0.6, g - 3, y + h + 1.2]);
    }
    end();
  };

  // =================================================================== layout
  // Upper ward frame: the crag's long axis runs WSW-ENE. L(a, b) = point a along it, b across (+b toward the loch).
  const EA = [0.87, -0.49], EB = [0.49, 0.87];
  const L = (a, b) => [a * EA[0] + b * EB[0], a * EA[1] + b * EB[1]];
  const hallL = (a0, b0, a1, b1, w, y0, wh, o) => { const p = L(a0, b0), q = L(a1, b1); hall(p[0], p[1], q[0], q[1], w, y0, wh, o); };
  const towerL = (a, b, y0, r, h, o) => { const p = L(a, b); tower(p[0], p[1], y0, r, h, o); };
  const T = 100; // upper ward floor

  // great hall on the loch side, its tall windows facing the water
  hallL(-98, 30, -38, 30, 21, T, 30, { great: true, fleche: true, rh: 17, dormers: false, fly: true, rose: true });
  // the keep: the central mass
  hallL(-28, -6, 24, -6, 27, T, 40, { turrets: true, rh: 18, fly: true });
  // the observatory: the tallest landmark
  towerL(34, 28, T, 10, 118, { rh: 3.4, lantern: true });
  towerL(22, 38, T, 4, 58, { rh: 3.4 });
  // clock tower on the north side of the upper ward
  towerL(-36, -42, T, 7.5, 54, { n: 4, roof: 'pyr', clock: true, rh: 2.6 });
  // west court: north range, and big towers at its ends
  hallL(-98, -32, -46, -32, 15, T, 20, { turrets: true });
  hallL(-104, -26, -104, 22, 14, T, 22, {});
  towerL(-112, -36, T, 6.5, 46, { rh: 2.9, n: 8 });
  towerL(-114, 38, T, 7.5, 40, { roof: 'flat' });
  towerL(-44, 40, T, 5.5, 52, { rh: 3.4, n: 8 });
  towerL(-30, 26, T, 4.5, 40, { rh: 3.3 });
  // east court: four ranges around a quad
  hallL(46, -40, 108, -40, 15, T, 21, { turrets: true });
  hallL(52, 34, 104, 34, 15, T, 18, { pinn: true });
  hallL(114, -34, 114, 28, 14, T, 24, { turrets: true, cu: true });
  hallL(42, -32, 42, 24, 12, T, 17, {});
  towerL(46, -44, T, 5.5, 38, { rh: 3 });
  towerL(116, -44, T, 6.5, 44, { rh: 2.8 });
  towerL(118, 36, T, 6, 36, { roof: 'flat' });
  towerL(78, 40, T, 4.5, 32, { rh: 3.2, cu: true });
  towerL(80, -46, T, 4, 30, { rh: 3.4 });
  towerL(-6, -40, T, 5, 38, { rh: 3.2 });
  towerL(10, 32, T, 4.5, 28, { roof: 'flat' });
  // tall slender towers inside the wards break up the skyline
  towerL(70, -4, T, 5, 66, { rh: 3.5, cu: true, n: 8 });
  towerL(-70, 0, T, 4.5, 34, { rh: 3.5 });
  // curtain wall along the north edge of the upper ward
  curtain([L(-118, -50), L(-60, -58), L(-10, -60), L(40, -58), L(120, -52)].map(([x, z]) => [x, z]), T, 7);

  // ---- the lower ledge on the loch side: buildings stepping down the crag
  const LE = 72;
  tower(-40, 98, LE, 5.5, 30, { rh: 3.2, n: 8 });
  hall(-22, 90, 28, 70, 12, LE, 15, { turrets: true });
  tower(8, 86, LE, 3.5, 44, { rh: 3.8 });
  tower(46, 62, LE, 5, 34, { rh: 3.1, cu: true });
  hall(52, 52, 76, 30, 11, LE, 13, { pinn: true });
  tower(-60, 88, LE, 4, 20, { roof: 'flat', turret: false });
  curtain([[-64, 92], [-44, 106], [-20, 100], [30, 80], [60, 60]], LE, 4, 2.4);

  // ---- the gatehouse and the viaduct to the north hill
  tower(-40, -78, T, 5, 26, { roof: 'flat', turret: false });
  tower(-20, -78, T, 5, 26, { roof: 'flat', turret: false });
  hall(-40, -78, -20, -78, 9, T, 16, { rh: 6, dormers: false, noEnd: [-1, 1] });
  begin();
  {
    // stone arches: piers from the valley floor, a deck at T with low parapets
    const z0 = -96, z1 = -322, x = -30, sp = 15, n = round((z0 - z1) / sp), s = (z0 - z1) / n, hw = 3.6, deck = T;
    for (let i = 0; i <= n; i++) {
      const z = z0 - i * s, g = H(x, z) - 3;
      box(x, z, 0, 1, 1.6, hw + 0.4, g, deck - 6.8, 0, -1);
      if (deck - g > 30) box(x, z, 0, 1, 1.4, hw + 0.2, g, deck - 25, 5, -1);
      box(x, z, 0, 1, 1.65, hw, deck - 7, deck - 1.2, 0, -1);
    }
    for (let i = 0; i < n; i++) {
      const za = z0 - i * s - 1.6, zb = z0 - (i + 1) * s + 1.6, r = (za - zb) / 2, zc = (za + zb) / 2, ys = deck - 6.8;
      const K = 12;
      for (let k = 0; k < K; k++) {
        const t0 = PI * k / K, t1 = PI * (k + 1) / K;
        const p0 = [zc + cos(t0) * r, ys + sin(t0) * r * 0.9], p1 = [zc + cos(t1) * r, ys + sin(t1) * r * 0.9];
        for (const sd of [-1, 1]) {
          const xx = x + sd * hw;
          const A = [xx, p0[1], p0[0]], B = [xx, p1[1], p1[0]], C = [xx, deck, p1[0]], D = [xx, deck, p0[0]];
          if (sd < 0) m.quad(A, D, C, B, 0, p0[0], p0[1], p0[0], deck, p1[0], deck, p1[0], p1[1]); else m.quad(A, B, C, D, 0, p0[0], p0[1], p1[0], p1[1], p1[0], deck, p0[0], deck);
        }
        m.quad([x + hw, p0[1], p0[0]], [x - hw, p0[1], p0[0]], [x - hw, p1[1], p1[0]], [x + hw, p1[1], p1[0]], 5, 0, k, 7, k, 7, k + 1, 0, k + 1);
      }
    }
    box(x, (z0 + z1) / 2, 0, 1, (z0 - z1) / 2, hw + 0.3, deck - 1.2, deck, 5, 12);
    for (const sd of [-1, 1]) box(x + sd * (hw - 0.2), (z0 + z1) / 2, 0, 1, (z0 - z1) / 2, 0.3, deck, deck + 1.1, 5);
    COLB.push([x, (z0 + z1) / 2, 0, 1, (z0 - z1) / 2, hw + 1, deck - 7.5, deck]);
    for (let i = 0; i <= n; i++) { const zp = z0 - i * s; COLB.push([x, zp, 0, 1, 2.2, hw + 1, H(x, zp) - 4, deck - 6]); }
  }
  end();
  // a lodge on the north hill where the viaduct lands
  tower(-44, -340, T, 4.5, 18, { rh: 3 });
  tower(-16, -340, T, 4.5, 18, { rh: 3 });

  // ---- the north-east court (lower) and the covered bridge over the ravine
  const C = 88;
  hall(92, -50, 136, -74, 16, C, 18, { turrets: true });
  hall(98, -92, 150, -112, 13, C, 14, {});
  tower(156, -104, C, 6, 30, { roof: 'flat' });
  tower(86, -96, C, 5, 26, { rh: 3.2 });
  tower(132, -36, C, 4.5, 24, { rh: 3.2 });
  begin();
  {
    // timber bridge on stone piers: posts, rails, a slate roof
    const x0 = 164, x1 = 240, z = -86, y = C, hw = 2.6, n = 26, piers = [182, 200, 218];
    for (const px of piers) { let g = 1e9; for (const a of [-2.2, 2.2]) for (const b of [-3.2, 3.2]) g = min(g, H(px + a, z + b) - 3); COLB.push([px, z, 1, 0, 2.2, hw + 0.6, g, y]); box(px, z, 1, 0, 3.4, hw + 1.8, g - 2, g + 5, 13, 12); box(px, z, 1, 0, 2.2, hw + 0.6, g, y - 0.6, 0, 5); box(px, z, 1, 0, 1.6, hw + 0.2, g, y - 8, 5, -1); }
    box((x0 + x1) / 2, z, 1, 0, (x1 - x0) / 2, hw, y - 0.6, y, 3, 3);
    // where the ground falls away under an end before the first pier, a battered masonry abutment carries the deck
    for (const [xe, dir] of [[x0, 1], [x1, -1]]) {
      let xa = xe; while (H(xa - dir, z) < y - 1 && abs(xa - xe) < 12) xa -= dir;         // back to solid ground
      if (H(xe + dir * 2, z) > y - 1.5) continue;
      const xb = xe + dir * 7, cx = (xa + xb) / 2, hl = abs(xb - xa) / 2 + 1;
      let g = 1e9; for (let t = 0; t <= 1; t += 0.1) for (const b of [-4, 4]) g = min(g, H(xa + (xb - xa) * t, z + b));
      for (let k = 0; k < 3; k++) { const yb = g - 2 + (y - g) * k / 3, yt = g - 2 + (y - g) * (k + 1) / 3 - 0.6 * (k === 2 ? 1 : 0), wk = hw + 1.6 - k * 0.45;
        box(cx + dir * k * 0.6, z, 1, 0, hl - k * 0.6, wk, yb, yt, 13, -1); box(cx + dir * k * 0.6, z, 1, 0, hl - k * 0.6 + 0.15, wk + 0.15, yt - 0.45, yt, 5, -1); }
      COLB.push([cx, z, 1, 0, hl + 0.4, hw + 2, g - 2, y - 0.6]);
    }
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; for (const s of [-1, 1]) box(x, z + s * hw, 1, 0, 0.14, 0.14, y, y + 3.4, 3); }
    for (const s of [-1, 1]) { box((x0 + x1) / 2, z + s * hw, 1, 0, (x1 - x0) / 2, 0.1, y, y + 1.3, 3); box((x0 + x1) / 2, z + s * hw, 1, 0, (x1 - x0) / 2, 0.1, y + 2.3, y + 3.5, 3); }
    for (const xe of [x0, x1]) m.quad([xe, y + 3.4, z - hw - 0.6], [xe, y + 3.4, z + hw + 0.6], [xe, y + 5.4, z], [xe, y + 5.4, z], 3, 0, 0, 7, 0, 3.5, 2, 3.5, 2);
    // the roof, a little wider than the deck
    for (const s of [-1, 1]) { const A = [x0, y + 3.4, z + s * (hw + 0.6)], B = [x1, y + 3.4, z + s * (hw + 0.6)], Cc = [x1, y + 5.4, z], D = [x0, y + 5.4, z]; if (s > 0) m.quad(A, B, Cc, D, 1, 0, 0, 76, 0, 76, 3.5, 0, 3.5); else m.quad(B, A, D, Cc, 1, 76, 0, 0, 0, 0, 3.5, 76, 3.5); }
    COLB.push([(x0 + x1) / 2, z, 1, 0, (x1 - x0) / 2, hw + 0.8, y - 1.2, y], [(x0 + x1) / 2, z, 1, 0, (x1 - x0) / 2, hw + 0.8, y + 3.4, y + 5.6]);
    for (const s of [-1, 1]) COLB.push([(x0 + x1) / 2, z + s * (hw + 0.3), 1, 0, (x1 - x0) / 2, 0.3, y, y + 3.4]);
  }
  end();
  tower(248, -100, C, 4, 16, { rh: 2.8 });
  tower(248, -72, C, 3.2, 12, { rh: 3 });

  // ---- west terrace (lower) toward the boathouse
  const B = 70;
  hall(-170, 38, -132, 70, 14, B, 18, { turrets: true });
  hall(-128, 82, -96, 110, 12, B, 17, { great: true, rose: true, fly: true, fleche: true, dormers: false, rh: 9 });
  tower(-135, 87, B, 3.9, 30, { rh: 6.2 });
  tower(-176, 76, B, 7, 34, { rh: 3 });
  tower(-120, 40, B, 5, 30, { rh: 3.2, cu: true });
  tower(-92, 118, B, 5.5, 22, { roof: 'flat' });
  tower(-152, 118, B, 4.5, 20, { rh: 3.4 });
  tower(-179, 70, B, 3.5, 30, { rh: 3.6 });
  hall(-183, 50, -178, 92, 9, B, 12, { dormers: true, pinn: false });
  hall(-172, 100, -150, 120, 9, B, 11, { pinn: false });
  hall(-140, 124, -112, 130, 8, B, 10, { pinn: false });

  {
    // Wren Falls: the burn in Corrie Gorge drops over a rock step (RAVSTEP) into a pool. The lip and the foot are
    // the lowest points across the gorge just above and below the step.
    const low = (z) => { let bx = 200, by = 1e9; for (let x = 150; x <= 250; x += 0.5) { const h = H(x, z); if (h < by) { by = h; bx = x; } } return [bx, by]; };
    const [lx, ly] = low(RAVSTEP - 2.5), [fx, fy] = low(RAVSTEP + 5);
    FALLS[0] = lx; FALLS[1] = ly + 0.3; FALLS[2] = RAVSTEP - 1; FALLS[3] = fx; FALLS[4] = fy + 0.2; FALLS[5] = RAVSTEP + 4;
  }
  // ---- south bastion over the water, with a greenhouse range on it
  const D = 48;
  tower(-52, 152, D, 6, 22, { roof: 'flat', turret: false });
  tower(-6, 168, D, 6, 18, { roof: 'flat', turret: false });
  curtain([[-56, 112], [-62, 146], [-52, 152], [-6, 168], [18, 140]], D, 5);
  begin();
  for (let i = 0; i < 3; i++) {
    const x = -40 + i * 13, z = 128 + i * 4, ex = 0.94, ez = 0.34;
    box(x, z, ex, ez, 5, 3, H(x, z) - 1, D + 2.6, 0, -1);
    for (const s of [-1, 1]) { const A = [x - ex * 5 - ez * s * 3.1, D + 2.6, z - ez * 5 + ex * s * 3.1], Bq = [x + ex * 5 - ez * s * 3.1, D + 2.6, z + ez * 5 + ex * s * 3.1], Cq = [x + ex * 5, D + 5.4, z + ez * 5], Dq = [x - ex * 5, D + 5.4, z - ez * 5]; m.quad(A, Bq, Cq, Dq, 8, 0, 0, 10, 0, 10, 3, 0, 3); const k = m.nv - 4; if (m.b[k * 24 + 13] < 0) for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) m.b[(k + j) * 24 + 12 + c] *= -1; }
  }
  end();

  // ---- boathouse on its shelf, a jetty, and a stair climbing the cliff
  begin();
  {
    const x = -110, z = 156, y = 2.2;
    box(x, z, 0.7, 0.71, 7, 5, y - 4, y + 6, 3, -1);
    for (const s of [-1, 1]) { const ex = 0.7, ez = 0.71, px = -ez, pz = ex; const A = [x - ex * 7.4 + px * 5.6 * s, y + 6, z - ez * 7.4 + pz * 5.6 * s], Bq = [x + ex * 7.4 + px * 5.6 * s, y + 6, z + ez * 7.4 + pz * 5.6 * s], Cq = [x + ex * 7.4, y + 10, z + ez * 7.4], Dq = [x - ex * 7.4, y + 10, z - ez * 7.4]; if (s < 0) m.quad(Dq, Cq, Bq, A, 1, 0, 6.9, 15, 6.9, 15, 0, 0, 0); else m.quad(A, Bq, Cq, Dq, 1, 0, 0, 15, 0, 15, 6.9, 0, 6.9); }
    for (const s of [-1, 1]) { const ex = 0.7, ez = 0.71, px = -ez, pz = ex, gx = x + ex * 7 * s, gz = z + ez * 7 * s; m.quad([gx - px * 5.6, y + 6, gz - pz * 5.6], [gx + px * 5.6, y + 6, gz + pz * 5.6], [gx, y + 10, gz], [gx, y + 10, gz], 3, 0, 0, 11, 0, 5.5, 4, 5.5, 4); win(gx + ex * s * 0.05, y + 6.6, gz + ez * s * 0.05, ex * s, ez * s, 1.2, 2); }
    for (const t of [-4, 0, 4]) for (const s of [-1, 1]) win(x + 0.7 * t - 0.71 * 5 * s, y + 1.5, z + 0.71 * t + 0.7 * 5 * s, -0.71 * s, 0.7 * s, 1.1, 1.9);
    win(x - 0.71 * 5, y + 1.2, z + 0.7 * 5, -0.71, 0.7, 1.4, 2.2); win(x + 0.71 * 5, y + 1.2, z - 0.7 * 5, 0.71, -0.7, 1.4, 2.2);
    // jetty
    box(x - 14, z + 14, 0.7, 0.71, 12, 1.4, 0.4, 0.8, 3, 3);
    for (let i = 0; i < 6; i++) { const t = -10 + i * 4; for (const s of [-1, 1]) box(x - 14 + 0.7 * t - 0.71 * s * 1.3, z + 14 + 0.71 * t + 0.7 * s * 1.3, 1, 0, 0.12, 0.12, -3, 1.3, 3); }
    COLB.push([x, z, 0.7, 0.71, 7.5, 5.5, -4, y + 10]);
    // the stair: flights zig-zagging up the cliff face, stepped masonry on a buttress
    let sx = -100, sz = 147, sy = y, dir = 1;
    while (sy < B - 1) {
      const run = 14, rise = min(6.5, B - sy), steps = round(rise / 0.3);
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps, px = sx + dir * run * t, pz = sz - 1.2 * t, g = H(px, pz) - 2;
        box(px, pz, 1, 0, run / steps / 2 + 0.05, 1.2, min(g, sy + rise * t - 4), sy + rise * (k + 1) / steps, 13, 12);
      }
      sx += dir * run; sz -= 1.6; sy += rise; dir = -dir;
      box(sx, sz, 1, 0, 1.6, 1.6, H(sx, sz) - 3, sy, 13, 12);
    }
  }
  end();

  // ---- the village on the shelf to the north-east
  rseed(41);
  begin();
  for (let i = 0; i < 46; i++) {
    const t = i / 46, lane = [mix(170, 330, t) + 25 * sin(t * 7), mix(-380, -500, t) + 30 * cos(t * 5)];
    const side = i & 1 ? 1 : -1, a = atan2(-120, 160) + sin(t * 7) * 0.4, ex = cos(a), ez = sin(a);
    const x = lane[0] - ez * side * rr(9, 13), z = lane[1] + ex * side * rr(9, 13), hl = rr(3.2, 5), hw = rr(2.6, 3.4), wh = rr(3.4, 5.2), y0 = H(x, z);
    box(x, z, ex, ez, hl, hw, y0 - 2, y0 + wh, rnd() < 0.6 ? 7 : 0, -1);
    const rh = hw * rr(1.1, 1.5), mat = rnd() < 0.3 ? 11 : 1;
    for (const s of [-1, 1]) {
      const px = -ez, pz = ex, A = [x - ex * (hl + 0.4) + px * (hw + 0.5) * s, y0 + wh - 0.2, z - ez * (hl + 0.4) + pz * (hw + 0.5) * s], Bq = [x + ex * (hl + 0.4) + px * (hw + 0.5) * s, y0 + wh - 0.2, z + ez * (hl + 0.4) + pz * (hw + 0.5) * s];
      const Cq = [x + ex * (hl + 0.4), y0 + wh + rh, z + ez * (hl + 0.4)], Dq = [x - ex * (hl + 0.4), y0 + wh + rh, z - ez * (hl + 0.4)];
      m.quad(A, Bq, Cq, Dq, mat, 0, 0, 2 * hl, 0, 2 * hl, 3, 0, 3);
      const k = m.nv - 4; if (m.b[k * 24 + 12] * px * s + m.b[k * 24 + 14] * pz * s < 0) for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) m.b[(k + j) * 24 + 12 + c] *= -1;
      const gx = x + ex * hl * s, gz = z + ez * hl * s;
      m.quad([gx - px * (hw + 0.5), y0 + wh - 0.2, gz - pz * (hw + 0.5)], [gx + px * (hw + 0.5), y0 + wh - 0.2, gz + pz * (hw + 0.5)], [gx, y0 + wh + rh, gz], [gx, y0 + wh + rh, gz], 7, 0, y0 + wh, 2 * hw, y0 + wh, hw, y0 + wh + rh, hw, y0 + wh + rh);
      for (const q of [-0.5, 0.5]) win(x + ex * hl * q + px * hw * s, y0 + 1, z + ez * hl * q + pz * hw * s, px * s, pz * s, 0.9, 1.4, rnd() < 0.7);
    }
    box(x + ex * hl * 0.6, z + ez * hl * 0.6, ex, ez, 0.5, 0.5, y0 + wh, y0 + wh + rh + 1.2, 0, 6);
    COLB.push([x, z, ex, ez, hl + 0.5, hw + 0.6, y0 - 2, y0 + wh + rh]);
    VSMOKE.push(x + ex * hl * 0.6, y0 + wh + rh + 1.3, z + ez * hl * 0.6); COTS.push(x, z);
  }
  end();
  begin();
  for (let i = 0; i < 120; i++) {
    const P = (t) => [mix(170, 330, t) + 25 * sin(t * 7), mix(-380, -500, t) + 30 * cos(t * 5)];
    const [ax, az] = P(i / 120), [bx, bz] = P((i + 1) / 120), L = hypot(bx - ax, bz - az), ex = (bx - ax) / L, ez = (bz - az) / L, w = 2.2;
    const A = [ax + ez * w, H(ax + ez * w, az - ex * w) + 0.12, az - ex * w], Bq = [bx + ez * w, H(bx + ez * w, bz - ex * w) + 0.12, bz - ex * w], Cq = [bx - ez * w, H(bx - ez * w, bz + ex * w) + 0.12, bz + ex * w], Dq = [ax - ez * w, H(ax - ez * w, az + ex * w) + 0.12, az + ex * w];
    m.quad(A, Bq, Cq, Dq, 12, 0, 0, L, 0, L, 2 * w, 0, 2 * w);
    const k = m.nv - 4; if (m.b[k * 24 + 13] < 0) for (let j = 0; j < 4; j++) for (let q = 0; q < 3; q++) m.b[(k + j) * 24 + 12 + q] *= -1;
  }
  end();
  // lanterns, lit from dusk: on posts along the lane, on the viaduct parapets, at the bridge ends, the gate and the jetty
  begin();
  {
    // each its own small object, so its bounds stay tight (trees and animals keep clear of object bounds)
    let grp = 0;
    const lantern = (x, z, y, post) => {
      LAMPS.push(x, y + 0.3, z, grp);
      end(); begin();
      if (post) box(x, z, 1, 0, 0.07, 0.07, y - post, y, 6, 6);
      box(x, z, 1, 0, 0.22, 0.22, y, y + 0.55, 16, 6); spire(x, z, 0.32, y + 0.55, 0.3, 4, 6, PI / 4);
    };
    const P = (t) => [mix(170, 330, t) + 25 * sin(t * 7), mix(-380, -500, t) + 30 * cos(t * 5)];
    for (let i = 1; i < 16; i++) { const [ax, az] = P(i / 16), [bx, bz] = P(i / 16 + 0.01), L = hypot(bx - ax, bz - az), s = i & 1 ? 1 : -1, x = ax - (bz - az) / L * 3.2 * s, z = az + (bx - ax) / L * 3.2 * s; lantern(x, z, H(x, z) + 2.4, 2.4); }
    grp = 1; for (let z = -110; z > -320; z -= 30) for (const s of [-1, 1]) lantern(-30 + s * 3.4, z, T + 1.1, 0);
    for (const s of [-1, 1]) lantern(-30 + s * 4.5, -86, T + 3.2, 0);
    grp = 2; for (const x of [161, 243]) for (const s of [-1, 1]) lantern(x, -86 + s * 3.4, C + 2.2, 2.2);
    for (const x of [189, 215]) lantern(x, -86, C + 2.6, 0); // hung inside the covered bridge
    grp = 3; // the jetty lantern glows but casts no pool (it would put the whole castle inside a group's box)
    lantern(-110 - 14 - 0.7 * 11, 156 + 14 - 0.71 * 11, 2.3, 1.5);
  }
  end();
  // drystone walls around the village pastures: knee-high runs that follow the ground, a gap for a gate, broken
  // where the lane passes. Each enclosure is its own object, marked as a wall so the sheep may graze inside.
  {
    const P = (t) => [mix(170, 330, t) + 25 * sin(t * 7), mix(-380, -500, t) + 30 * cos(t * 5)];
    const nearLane = (x, z) => { for (let t = 0; t <= 1; t += 0.01) { const [a, b] = P(t); if (hypot(x - a, z - b) < 5) return true; } return false; };
    const solid = OBJS.length;
    for (const [cx, cz, R, seed] of [[330, -370, 46, 1], [190, -520, 44, 2], [360, -500, 36, 3]]) {
      begin();
      const n = 9, pts = []; rseed(60 + seed);
      for (let i = 0; i < n; i++) { const a = i / n * TAU + rr(-0.15, 0.15), r = R * rr(0.85, 1.15); pts.push([cx + cos(a) * r, cz + sin(a) * r]); }
      for (let i = 0; i < n; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n], L = hypot(bx - ax, bz - az), ex = (bx - ax) / L, ez = (bz - az) / L;
        for (let t = 0; t < L; t += 2.2) {
          if (i === seed % n && t > L / 2 - 2 && t < L / 2 + 2) continue;          // the gate
          const x = ax + ex * (t + 1.1), z = az + ez * (t + 1.1);
          if (nearLane(x, z) || OBJS.slice(0, solid).some((o) => x > o[2] - 1 && x < o[5] + 1 && z > o[4] - 1 && z < o[7] + 1)) continue;
          const g = min(H(x - ex * 1.1, z - ez * 1.1), H(x + ex * 1.1, z + ez * 1.1)) - 0.3, h = 1.25 + 0.2 * rnd();
          box(x, z, ex, ez, 1.15, 0.32, g, g + h, 13, 13); box(x, z, ex, ez, 1.2, 0.36, g + h, g + h + 0.12, 13, 13);  // coping stones
        }
      }
      end(); OBJS[OBJS.length - 1].wall = true;
    }
  }
  // a rough standing stone: rings of seven points up the stone, each a little wider or narrower, the whole leaning; the
  // top rounded and uneven. a: the angle it faces (its broad side across it), h height, w half width, d half depth
  const menhir = (x, z, a, h, w, d, sink = 0.6) => {
      const g = H(x, z) - sink, tx = -sin(a), tz = cos(a), lx = rr(-0.3, 0.3) * h / 3, lz = rr(-0.2, 0.2) * h / 3;
      const NR = 5, NP = 7, ring = [];
      for (let k = 0; k <= NR; k++) {
        const f = k / NR, sh = 1 - 0.35 * f * f, y = g + h * (k === NR ? 0.96 + rr(-0.06, 0.06) : f), pts = [];
        for (let j = 0; j < NP; j++) { const an = j / NP * TAU, jr = rr(0.85, 1.12) * (k === NR ? 0.45 : sh); pts.push([x + (tx * cos(an) * w + cos(a) * sin(an) * d) * jr + tx * lx * f * f + cos(a) * lz * f * f, y, z + (tz * cos(an) * w + sin(a) * sin(an) * d) * jr + tz * lx * f * f + sin(a) * lz * f * f]); }
        ring.push(pts);
      }
      for (let k = 0; k < NR; k++) for (let j = 0; j < NP; j++) { const j1 = (j + 1) % NP, A = ring[k][j], B = ring[k][j1], C2 = ring[k + 1][j1], D2 = ring[k + 1][j]; m.quad(A, B, C2, D2, 17, j, A[1], j + 1, B[1], j + 1, C2[1], j, D2[1]); }
      const top = ring[NR], tc = [top.reduce((s, p) => s + p[0], 0) / NP, top[0][1] + 0.12, top.reduce((s, p) => s + p[2], 0) / NP];
      for (let j = 0; j < NP; j++) m.quad(top[j], top[(j + 1) % NP], tc, tc, 17, 0, 0, 1, 0, 0.5, 1, 0.5, 1);
    };
  // the Grey Stones: a ring of standing stones on the open hill east of the loch, one great recumbent stone
  begin();
  {
    const cx = 640, cz = 262; rseed(77);
    for (let i = 0; i < 11; i++) { const a = i / 11 * TAU + rr(-0.1, 0.1), r = 11 + rr(-0.8, 0.8); menhir(cx + cos(a) * r, cz + sin(a) * r, a, rr(2.2, 3.8), rr(0.55, 0.85), rr(0.3, 0.45)); }
    box(cx + 10.5, cz + 2, 0.2, 0.98, 2, 0.7, H(cx + 10.5, cz + 2) - 0.4, H(cx + 10.5, cz + 2) + 1.3, 17);
  }
  end();
  // a blob of geometry: an ellipsoid in rings (for the old pine's crown)
  const blob = (cx, cy, cz, rx, ry, rz, mat, sg = 9, rg = 5) => {
    m.grow(sg * (rg + 1), sg * rg * 6); const b0 = m.nv;
    for (let j = 0; j <= rg; j++) for (let i = 0; i < sg; i++) { const th = j / rg * PI, ph = i / sg * TAU, x = sin(th) * cos(ph), y = cos(th), z = sin(th) * sin(ph), w = rr(0.85, 1.12); m.vert(cx + x * rx * w, cy + y * ry * w, cz + z * rz * w, x, y + 0.4, z, mat, ph, j / rg); }
    for (let j = 0; j < rg; j++) for (let i = 0; i < sg; i++) { const a = b0 + j * sg + i, b = b0 + j * sg + (i + 1) % sg; m.tri(a, b + sg, b); m.tri(a, a + sg, b + sg); }
  };
  // a tapering tube between two points (branches, the pine's trunk)
  const limb = (A, B, r0, r1, mat, n = 7) => {
    const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], l = hypot(...d), f = d.map((v) => v / l);
    const up = abs(f[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let e1 = [up[1] * f[2] - up[2] * f[1], up[2] * f[0] - up[0] * f[2], up[0] * f[1] - up[1] * f[0]]; const el = hypot(...e1); e1 = e1.map((v) => v / el);
    const e2 = [f[1] * e1[2] - f[2] * e1[1], f[2] * e1[0] - f[0] * e1[2], f[0] * e1[1] - f[1] * e1[0]];
    const P = (C, r, a) => [C[0] + (e1[0] * cos(a) + e2[0] * sin(a)) * r, C[1] + (e1[1] * cos(a) + e2[1] * sin(a)) * r, C[2] + (e1[2] * cos(a) + e2[2] * sin(a)) * r];
    for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU; m.quad(P(A, r0, a0), P(A, r0, a1), P(B, r1, a1), P(B, r1, a0), mat, i, 0, i + 1, 0, i + 1, l, i, l); const k = m.nv - 4, cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2, cz = (A[2] + B[2]) / 2, q = P([cx, cy, cz], 1, (a0 + a1) / 2); if (m.b[k * 24 + 12] * (q[0] - cx) + m.b[k * 24 + 13] * (q[1] - cy) + m.b[k * 24 + 14] * (q[2] - cz) < 0) for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) m.b[(k + j) * 24 + 12 + c] *= -1; }
  };
  // Dun Corran: an Iron Age broch on the slope north-west of Gate Lodge. A round, tapering drystone tower with a
  // hollow core, its wall broken down on the south side, and a low doorway facing the glen.
  begin();
  {
    // the wall batters inward in a gentle curve (wide foot, slimmer top); its top is ragged, and on the south it has
    // fallen to a low stump; small flat stones (uv scaled so the coursing reads as drystone, not brick)
    const cx = -300, cz = -560, g = H(cx, cz) - 1.2, N = 44, HT = 13, SC = 2.4;
    const ro = (y) => { const t = clamp((y - g) / HT, 0, 1); return 10.5 - 3.2 * t + 0.9 * t * t; }, ri = (y) => 5.8 - (y - g) * 0.03;
    rseed(95); const jag = Array.from({ length: N + 1 }, () => rr(-0.9, 0.5)); jag[N] = jag[0];
    const height = (i) => { const a = i / N * TAU, br = sstep(0.75, 0.0, abs(((a - 1.9 + PI) % TAU + TAU) % TAU - PI)); return HT - (HT - 3.2) * br + jag[i] * (1 + 2 * br); };
    for (let i = 0; i < N; i++) {
      const a0 = i / N * TAU, a1 = (i + 1) / N * TAU, h0 = g + height(i), h1 = g + height(i + 1), door = abs(((a0 - 4.4 + PI) % TAU + TAU) % TAU - PI) < 0.1, yb = door ? g + 3.4 : g;
      const P = (a, r, y) => [cx + cos(a) * r, y, cz + sin(a) * r];
      // the outer face in two bands, so the curve of the batter shows
      const ym0 = (yb + h0) / 2, ym1 = (yb + h1) / 2;
      m.quad(P(a0, ro(yb), yb), P(a0, ro(ym0), ym0), P(a1, ro(ym1), ym1), P(a1, ro(yb), yb), 13, a0 * 10 * SC, yb * SC, a0 * 10 * SC, ym0 * SC, a1 * 10 * SC, ym1 * SC, a1 * 10 * SC, yb * SC);
      m.quad(P(a0, ro(ym0), ym0), P(a0, ro(h0), h0), P(a1, ro(h1), h1), P(a1, ro(ym1), ym1), 13, a0 * 10 * SC, ym0 * SC, a0 * 10 * SC, h0 * SC, a1 * 10 * SC, h1 * SC, a1 * 10 * SC, ym1 * SC);
      m.quad(P(a1, ri(yb), yb), P(a1, ri(h1), h1), P(a0, ri(h0), h0), P(a0, ri(yb), yb), 13, a1 * 6 * SC, yb * SC, a1 * 6 * SC, h1 * SC, a0 * 6 * SC, h0 * SC, a0 * 6 * SC, yb * SC);
      m.quad(P(a0, ri(h0), h0), P(a0, ro(h0), h0), P(a1, ro(h1), h1), P(a1, ri(h1), h1), 13, a0 * 10 * SC, 0, a0 * 10 * SC, 4 * SC, a1 * 10 * SC, 4 * SC, a1 * 10 * SC, 0);
    }
    // the door's lintel, and fallen stone heaped against the broken side
    { const a = 4.4, r = (ro(g) + ri(g)) / 2; box(cx + cos(a) * r, cz + sin(a) * r, cos(a), sin(a), (ro(g) - ri(g)) / 2 + 0.3, 0.9, g + 3.3, g + 3.9, 17, 17); }
    for (let i = 0; i < 26; i++) { const a = 1.9 + rr(-0.9, 0.9), r = rr(9.5, 15) - abs(a - 1.9) * 2, x = cx + cos(a) * r, z = cz + sin(a) * r, gy = H(x, z); box(x, z, cos(a + i), sin(a + i), rr(0.3, 0.7), rr(0.25, 0.5), gy - 0.2, gy + rr(0.15, 0.5), 13, 13); }
    COLC.push([cx, cz, 10.6, g + HT]);
  }
  end();
  // Ardlach: a roofless croft cottage below the broch: low walls, one gable still standing, a fallen lintel
  begin();
  {
    const x = -232, z = -492, ex = 0.94, ez = 0.34, px = -ez, pz = ex, hl = 5.5, hw = 2.8, g = H(x, z) - 0.6, wh = 1.9;
    for (const s of [-1, 1]) box(x + px * hw * s, z + pz * hw * s, ex, ez, hl, 0.4, g, g + wh - (s > 0 ? 0.6 : 0), 13, 13);
    box(x - ex * hl, z - ez * hl, px, pz, hw + 0.4, 0.4, g, g + wh, 13, 13);
    // the standing gable, with an empty window
    const gx = x + ex * hl, gz = z + ez * hl;
    box(gx, gz, px, pz, hw + 0.4, 0.4, g, g + wh + 0.3, 13, -1);
    for (const o of [-0.4, 0.4]) m.quad([gx - px * (hw + 0.4) + ex * o, g + wh + 0.3, gz - pz * (hw + 0.4) + ez * o], [gx + px * (hw + 0.4) + ex * o, g + wh + 0.3, gz + pz * (hw + 0.4) + ez * o], [gx + ex * o, g + wh + 2.8, gz + ez * o], [gx + ex * o, g + wh + 2.8, gz + ez * o], 13, 0, g + wh, 6.4, g + wh, 3.2, g + wh + 2.5, 3.2, g + wh + 2.5);
    // the doorway's fallen lintel and tumbled stones
    box(x + px * (hw + 1.4) + ex * 1.5, z + pz * (hw + 1.4) + ez * 1.5, ex, ez, 0.9, 0.22, H(x + px * (hw + 1.4), z + pz * (hw + 1.4)) - 0.1, H(x + px * (hw + 1.4), z + pz * (hw + 1.4)) + 0.25, 17, 17);
    rseed(91); for (let i = 0; i < 9; i++) { const a = rr(0, TAU), r = rr(hw, hw + 3), sx = x + cos(a) * r * 1.6, sz = z + sin(a) * r, gy = H(sx, sz); box(sx, sz, cos(a), sin(a), rr(0.25, 0.5), rr(0.2, 0.35), gy - 0.15, gy + rr(0.2, 0.4), 13, 13); }
    COLB.push([x, z, ex, ez, hl + 0.5, hw + 0.6, g, g + wh + 2.6]);
  }
  end();
  // the Cairn of Keld: a grassed burial mound by the Grey Stones (the mound is in the terrain), and its stone-lined
  // entrance passage facing the ring
  begin();
  {
    const cx = 675, cz = 242, dx = (640 - cx) / hypot(640 - cx, 262 - cz), dz = (262 - cz) / hypot(640 - cx, 262 - cz), px = -dz, pz = dx, ea = atan2(dz, dx);
    rseed(97);
    // a kerb of big stones set on edge round the foot of the mound, broken only by the entrance
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU; let da = a - ea; da -= TAU * Math.round(da / TAU); if (abs(da) < 0.16) continue; const r = 13.2, x = cx + cos(a) * r, z = cz + sin(a) * r; menhir(x, z, a, rr(0.7, 1.2), rr(0.45, 0.7), rr(0.2, 0.3), 0.3); }
    // the entrance: two lines of uprights under capstones, running into the mound, and a tall portal stone either side
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { const x = cx + dx * (13.6 - k * 1.5) + px * 1.0 * s, z = cz + dz * (13.6 - k * 1.5) + pz * 1.0 * s; menhir(x, z, ea + PI / 2, 1.9, 0.65, 0.26, 0.4); }
    for (let k = 0; k < 3; k++) { const x = cx + dx * (13.4 - k * 1.6), z = cz + dz * (13.4 - k * 1.6), gy = H(x, z) - 0.4; blob(x, gy + 1.75, z, 0.9 + 0.7 * abs(px), 0.28, 0.9 + 0.7 * abs(pz), 17, 8, 3); }
    for (const s of [-1, 1]) { const x = cx + dx * 14.2 + px * 2.4 * s, z = cz + dz * 14.2 + pz * 2.4 * s; menhir(x, z, ea, 2.8, 0.55, 0.35, 0.4); }
  }
  end();
  // the Old Pine: one ancient Scots pine near the Grey Stones, a tall bare red trunk and a flat, wind-shaped crown
  begin();
  {
    // the trunk leans a little and thins; heavy limbs leave it high up, each reaching out and up to a flat pad of
    // needles; the topmost pad is broadest, so the crown reads flat and wind-shaped
    const x = 612, z = 238, g = H(x, z) - 0.4; rseed(93);
    const T0 = [x, g, z], T1 = [x + 0.25, g + 5.5, z + 0.15], T2 = [x + 0.7, g + 10.5, z + 0.35];
    limb(T0, T1, 0.85, 0.6, 3, 9); limb(T1, T2, 0.6, 0.36, 3, 9);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU + rr(-0.35, 0.35), h = 6.8 + k * 0.75, f = (h - 5.5) / 5, S = [mix(T1[0], T2[0], f), g + h, mix(T1[2], T2[2], f)];
      const r = rr(2.6, 4.2), M = [S[0] + cos(a) * r * 0.55, S[1] + 0.9, S[2] + sin(a) * r * 0.55], E = [S[0] + cos(a) * r, S[1] + 1.6 + rr(0, 0.6), S[2] + sin(a) * r];
      limb(S, M, 0.24, 0.17, 3, 6); limb(M, E, 0.17, 0.09, 3, 5);
      blob(E[0], E[1] + 0.35, E[2], rr(2, 2.6), rr(0.55, 0.75), rr(1.8, 2.4), 18, 10, 4);
    }
    // two dead stubs lower down, and the crown's top pad
    for (const a of [1.1, 3.9]) limb([x + 0.1, g + 4 + a * 0.3, z], [x + cos(a) * 1.3, g + 4.6 + a * 0.3, z + sin(a) * 1.3], 0.12, 0.05, 3, 5);
    blob(T2[0], T2[1] + 1.1, T2[2], 3.2, 0.85, 2.9, 18, 11, 4);
    COLC.push([x, z, 1.2, g + 10], [T2[0], T2[2], 6, T2[1] + 3]);
  }
  end();
  // the Glen Mill: a stone mill house on the east bank of the burn, a lade carrying water to the top of its wheel
  begin();
  {
    const x = 210, z = -285, ex = 0, ez = 1, px = -1, pz = 0, hl = 4.5, hw = 3.2, y0 = H(x, z), wh = 5;
    box(x, z, ex, ez, hl, hw, y0 - 2, y0 + wh, 7, -1);
    const rh = 3.6;
    for (const s of [-1, 1]) {
      const A = [x - ex * (hl + 0.4) + px * (hw + 0.5) * s, y0 + wh - 0.2, z - ez * (hl + 0.4) + pz * (hw + 0.5) * s], Bq = [x + ex * (hl + 0.4) + px * (hw + 0.5) * s, y0 + wh - 0.2, z + ez * (hl + 0.4) + pz * (hw + 0.5) * s];
      const Cq = [x + ex * (hl + 0.4), y0 + wh + rh, z + ez * (hl + 0.4)], Dq = [x - ex * (hl + 0.4), y0 + wh + rh, z - ez * (hl + 0.4)];
      m.quad(A, Bq, Cq, Dq, 1, 0, 0, 2 * hl, 0, 2 * hl, 3, 0, 3);
      const k = m.nv - 4; if (m.b[k * 24 + 12] * px * s + m.b[k * 24 + 14] * pz * s < 0) for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) m.b[(k + j) * 24 + 12 + c] *= -1;
      const gx = x + ex * hl * s, gz = z + ez * hl * s;
      m.quad([gx - px * (hw + 0.5), y0 + wh - 0.2, gz - pz * (hw + 0.5)], [gx + px * (hw + 0.5), y0 + wh - 0.2, gz + pz * (hw + 0.5)], [gx, y0 + wh + rh, gz], [gx, y0 + wh + rh, gz], 7, 0, y0 + wh, 2 * hw, y0 + wh, hw, y0 + wh + rh, hw, y0 + wh + rh);
      win(x + px * hw * s, y0 + 1.4, z, px * s, pz * s, 1, 1.5, rnd() < 0.7);
    }
    win(x + ex * hl, y0 + 1, z, ex, ez, 1.1, 2.1, false);
    box(x - ex * hl * 0.5, z - ez * hl * 0.5, ex, ez, 0.5, 0.5, y0 + wh, y0 + wh + rh + 1.2, 0, 6); VSMOKE.push(x - ex * hl * 0.5, y0 + wh + rh + 1.3, z - ez * hl * 0.5);
    COLB.push([x, z, ex, ez, hl + 0.5, hw + 0.6, y0 - 2, y0 + wh + rh]);
    // the lade: a timber trough on posts, from upstream to the top of the wheel
    // the wheel turns between the house's west wall and the burn, its foot in a stone-lined pit; the lade ends right
    // over the top of the wheel
    const wx = 204, gw = H(wx, -285), wy = gw + 1.9, top = wy + 2.75;
    box(wx, -295.4, 0, 1, 9.8, 0.45, top - 0.35, top, 3, 3); for (const s of [-1, 1]) box(wx + s * 0.45, -295.4, 0, 1, 9.8, 0.06, top, top + 0.45, 3, 3);
    for (let k = 0; k < 4; k++) { const zz = -289.5 - k * 4.5; box(wx, zz, 1, 0, 0.12, 0.12, H(wx, zz) - 0.5, top - 0.35, 3, 3); }
    box(wx - 1.05, -285, 0, 1, 2.9, 0.25, gw - 0.8, gw + 0.5, 13, 13);                                   // the pit's outer wall
    box(wx, -285, 0, 1, 2.9, 0.75, gw - 0.75, gw - 0.6, 13, 13);                                          // and its floor, below the paddles
    MILLW[0] = wx; MILLW[1] = wy; MILLW[2] = -285;
  }
  end();
  // the village church
  tower(286, -470, H(286, -470), 3.5, 16, { n: 4, roof: 'spire', rh: 4 });
  hall(286, -462, 296, -440, 9, H(292, -450), 8, { rh: 6, dormers: false });

  // ======================================================================== phase 5: farms, the loch shore, the garden
  // a small rural building: walls of `wall`, a pitched roof of `roof` (gables in the wall material), windows lit at night
  const house = (x, z, a, hl, hw, wh, wall, roof, o = {}) => {
    const ex = cos(a), ez = sin(a), px = -ez, pz = ex, y0 = groundMin(x, z, max(hl, hw)) + 3, rh = hw * (o.pitch ?? 1.15);
    box(x, z, ex, ez, hl, hw, y0 - 2, y0 + wh, wall, -1);
    for (const s of [-1, 1]) {
      const A = [x - ex * (hl + 0.35) + px * (hw + 0.45) * s, y0 + wh - 0.15, z - ez * (hl + 0.35) + pz * (hw + 0.45) * s], B = [x + ex * (hl + 0.35) + px * (hw + 0.45) * s, y0 + wh - 0.15, z + ez * (hl + 0.35) + pz * (hw + 0.45) * s];
      const C = [x + ex * (hl + 0.35), y0 + wh + rh, z + ez * (hl + 0.35)], D = [x - ex * (hl + 0.35), y0 + wh + rh, z - ez * (hl + 0.35)];
      m.quad(A, B, C, D, roof, 0, 0, 2 * hl, 0, 2 * hl, 3, 0, 3);
      const k = m.nv - 4; if (m.b[k * 24 + 12] * px * s + m.b[k * 24 + 14] * pz * s < 0) for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) m.b[(k + j) * 24 + 12 + c] *= -1;
      const gx = x + ex * hl * s, gz = z + ez * hl * s;
      m.quad([gx - px * hw, y0 + wh, gz - pz * hw], [gx + px * hw, y0 + wh, gz + pz * hw], [gx, y0 + wh + rh - 0.1, gz], [gx, y0 + wh + rh - 0.1, gz], wall, 0, y0 + wh, 2 * hw, y0 + wh, hw, y0 + wh + rh, hw, y0 + wh + rh);
      const k2 = m.nv - 4; if (m.b[k2 * 24 + 12] * ex * s + m.b[k2 * 24 + 14] * ez * s < 0) for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) m.b[(k2 + j) * 24 + 12 + c] *= -1;
      for (let w = 0; w < (o.win ?? 1); w++) { const q = (o.win ?? 1) === 1 ? 0.35 * s : (w ? 0.45 : -0.45); win(x + ex * hl * q + px * hw * s, y0 + 0.9, z + ez * hl * q + pz * hw * s, px * s, pz * s, 0.75, 1.0, o.lit ?? rnd() < 0.8); }
    }
    win(x + ex * hl, y0 - 0.05, z + ez * hl, ex, ez, 0.95, 1.9, false);                                   // the door
    if (o.smoke) { const cx = x - ex * hl * 0.85, cz = z - ez * hl * 0.85; box(cx, cz, ex, ez, 0.4, 0.4, y0 + wh, y0 + wh + rh * 0.8 + 0.9, 13, 13); VSMOKE.push(cx, y0 + wh + rh * 0.8 + 1, cz); }
    COLB.push([x, z, ex, ez, hl + 0.5, hw + 0.6, y0 - 2, y0 + wh + rh]);
    return y0;
  };
  // a drystone wall from a to b, knee to shoulder high, following the ground in short lengths; skip(x, z) leaves gaps
  const dyke = (ax, az, bx, bz, ht, mat = 17, skip = null) => {
    const L = hypot(bx - ax, bz - az), n = max(1, round(L / 3)), ex = (bx - ax) / L, ez = (bz - az) / L;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (skip && skip(x, z)) continue;
      const g = H(x, z), top = g + ht + rr(-0.06, 0.06); box(x, z, ex, ez, L / n / 2 + 0.05, 0.32, g - 0.6, top, mat, mat);
      // the cope: a row of rough stones set on edge along the top, so the wall's line is broken, not ruled
      // stones of uneven width, packed tight, uneven in height, some set slightly askew
      let f = -0.5 * (L / n); const end = 0.5 * (L / n);
      while (f < end - 0.12) { const w = min(rr(0.22, 0.6), end - f), cx = x + ex * (f + w / 2), cz = z + ez * (f + w / 2), sk = rr(-0.12, 0.12); box(cx, cz, ex + sk * ez, ez - sk * ex, w / 2, 0.2 + rr(-0.05, 0.06), top - 0.03, top + rr(0.12, 0.38), 17, 17); f += w + 0.02; }
    }
  };
  // a round hay stack: a drum with a conical thatched top
  const stack = (x, z, r, ht) => { const g = H(x, z) - 0.2; prism(x, z, r, r * 1.06, g, g + ht, 12, 11); blob(x, g + ht - 0.1, z, r * 1.12, r * 0.95, r * 1.12, 11, 12, 5); };
  // stacked peats drying: a stepped pile of dark bricks
  const peats = (x, z, a, l) => { const ex = cos(a), ez = sin(a), px = -ez, pz = ex, g = H(x, z) - 0.05; for (let k = 0; k < 4; k++) { const n = round((l - k * 0.35) / 0.42); for (let i = 0; i < n; i++) for (const s of [-1, 1]) { if (k === 3 && s > 0) continue; const u = (i - (n - 1) / 2) * 0.42, v = s * (0.24 - k * 0.06) * (k === 3 ? 0 : 1); box(x + ex * u + px * v, z + ez * u + pz * v, ex + rr(-0.15, 0.15), ez, 0.19, 0.11, g + k * 0.24, g + (k + 1) * 0.24 - 0.02, 22, 22); } } };
  // a farmstead: longhouse, byre, a stackyard and peats inside a drystone enclosure
  const farm = (cx, cz, a, seed, whitewash) => {
    rseed(seed); begin();
    const ex = cos(a), ez = sin(a), px = -ez, pz = ex;
    house(cx, cz, a, 7, 3, 3, 7, 11, { win: 2, smoke: true, lit: true });
    house(cx + px * 10 + ex * 2, cz + pz * 10 + ez * 2, a, 5, 2.6, 2.6, whitewash ? 0 : 13, 1, { win: 0 });
    for (let k = 0; k < 3; k++) stack(cx - ex * (6 + k * 4.4) - px * 9, cz - ez * (6 + k * 4.4) - pz * 9, 1.7, 1.8);
    peats(cx + ex * 10 - px * 6, cz + ez * 10 - pz * 6, a, 2.2);
    end();
    begin();
    const R = [[-16, -15], [16, -15], [16, 18], [-16, 18]].map(([u, v]) => [cx + ex * u + px * v, cz + ez * u + pz * v]);
    for (let i = 0; i < 4; i++) { const [x0, z0] = R[i], [x1, z1] = R[(i + 1) % 4]; dyke(x0, z0, x1, z1, 1.1, 17, (x, z) => i === 0 && hypot(x - (x0 + x1) / 2, z - (z0 + z1) / 2) < 2.2); }
    end(); OBJS[OBJS.length - 1].wall = true;
  };
  farm(-590, -222, 0.35, 501, true);    // Blackmyre
  farm(-822, 152, -0.6, 503, false);    // Westerhill

  // the Summer Shielings: three low turf-roofed huts and a round stone fold, high above Kilwren
  rseed(507); begin();
  for (const [x, z, a] of [[372, -598, 0.3], [386, -584, 1.2], [362, -578, 2.4]]) house(x, z, a, 2.8, 2, 1.3, 17, 23, { pitch: 0.55, win: 1, lit: false });
  { const fx = 398, fz = -603; for (let i = 0; i < 20; i++) { const a0 = i / 20 * TAU, a1 = (i + 1) / 20 * TAU; if (i === 6) continue; dyke(fx + cos(a0) * 7.5, fz + sin(a0) * 7.5, fx + cos(a1) * 7.5, fz + sin(a1) * 7.5, 1.2); } }
  end();

  // Beacon Knowe: a cairn on the gorge's east rim, an iron fire-basket on a post at its top, burning after dark
  rseed(509); begin();
  {
    const x = 310, z = -70, g = H(x, z) - 0.5;
    for (let k = 0; k < 5; k++) { const rk = 2.9 - k * 0.6, n = max(3, round(rk * 4)); for (let i = 0; i < n; i++) { const a = (i + k * 0.5) / n * TAU + rr(-0.15, 0.15); blob(x + cos(a) * rk, g + 0.35 + k * 0.5, z + sin(a) * rk, rr(0.45, 0.65), rr(0.3, 0.45), rr(0.4, 0.6), 17, 6, 3); } }
    blob(x, g + 2.6, z, 0.7, 0.45, 0.7, 17, 6, 3);
    // stones scattered across a heathery glade (the stones' spread keeps the trees back, so the fire shows from afar)
    for (let i = 0; i < 34; i++) { const a = i < 12 ? rr(0, TAU) : (i - 12) / 22 * TAU, r = i < 12 ? rr(3, 5) : rr(16, 44), sx = x + cos(a) * r, sz = z + sin(a) * r, gy = H(sx, sz); box(sx, sz, cos(a), sin(a), rr(0.25, 0.5), rr(0.2, 0.4), gy - 0.2, gy + rr(0.15, 0.45), 13, 13); }
    const T = g + 3.9;   // the brazier sits squat on a short stout post at the cairn's top
    limb([x, g + 2.4, z], [x, T, z], 0.3, 0.26, 3, 8); for (const [dx, dz] of [[-0.9, 0], [0.45, 0.8], [0.45, -0.8]]) limb([x + dx, g + 2.5, z + dz], [x, T - 0.1, z], 0.08, 0.07, 6, 4);
    // the brazier: an open iron cage of bars between two rings, flames standing up out of it
    prism(x, z, 0.2, 0.62, T - 0.15, T + 0.1, 10, 6); for (const y of [T + 0.12, T + 0.9]) prism(x, z, 0.82, 0.82, y, y + 0.07, 12, 6);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; limb([x + cos(a) * 0.62, T + 0.08, z + sin(a) * 0.62], [x + cos(a) * 0.86, T + 1.02, z + sin(a) * 0.86], 0.035, 0.035, 6, 4); }
    blob(x, T + 0.55, z, 0.6, 0.5, 0.6, 19, 9, 4);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.4, r = i ? 0.38 : 0; blob(x + cos(a) * r, T + 1.1 + (i ? rr(-0.1, 0.15) : 0.4), z + sin(a) * r, i ? 0.22 : 0.3, i ? rr(0.5, 0.7) : 0.95, i ? 0.22 : 0.3, 19, 6, 3); }
    LAMPS.push(x, T + 1.2, z, 2);
    VSMOKE.push(x, T + 1.6, z); BEACON[0] = x; BEACON[1] = T + 0.8; BEACON[2] = z;
    COLC.push([x, z, 3.2, T + 1.2]);
  }
  end();

  // the Crannog: a thatched roundhouse on a timber platform raised on piles out in the shallows, a walkway to the shore
  rseed(511); begin();
  {
    const x = -330, z = 699, top = 1.1;
    prism(x, z, 7, 7, top - 0.35, top, 16, 3); spire(x, z, 7, top, 0.01, 16, 3);
    for (let i = 0; i < 20; i++) { const a = i / 20 * TAU + rr(-0.05, 0.05), r = i & 1 ? 6.6 : 4; prism(x + cos(a) * r, z + sin(a) * r, 0.17, 0.15, -4, top - 0.3 + rr(0, 0.5), 5, 3); }
    prism(x, z, 4.4, 4.4, top, top + 2.1, 18, 3); spire(x, z, 5.6, top + 2.0, 4.4, 18, 11);
    win(x + 4.45 * cos(1.75), top, z + 4.45 * sin(1.75), cos(1.75), sin(1.75), 1, 1.7, false);
    VSMOKE.push(x, top + 6.5, z);
    // the walkway: planks on posts, from the platform to the beach
    const z0 = z + 7, z1 = 721, n = 8;
    box(x - 0.2, (z0 + z1) / 2, 0, 1, (z1 - z0) / 2, 0.75, top - 0.25, top, 3, 3);
    for (let k = 0; k <= n; k++) for (const s of [-0.8, 0.8]) { const zz = z0 + (z1 - z0) * k / n; prism(x - 0.2 + s, zz, 0.11, 0.1, min(H(x, zz), 0) - 2, top + 0.6, 5, 3); }
    COLC.push([x, z, 7.2, top + 6.4]);
    COLB.push([x - 0.2, (z0 + z1) / 2, 0, 1, (z1 - z0) / 2, 0.9, -3, top + 0.6]);
  }
  end();

  // Fisher's Strand: a bothy at the back of the beach (the cove itself is cut into the terrain), net poles with nets
  // hung to dry, and a rowing boat drawn up (one of the animals' boats)
  rseed(513); begin();
  {
    house(-170, 731, 0.12, 4.2, 2.6, 2.4, 7, 11, { win: 1, smoke: true, lit: true });
    for (let k = 0; k < 3; k++) {
      const x0 = -215 + k * 9, z = 731 + k * 1.5, gy = H(x0, z);
      for (const d of [0, 3.6]) limb([x0 + d, gy - 0.4, z], [x0 + d, gy + 2.3, z], 0.08, 0.07, 3, 5);
      limb([x0, gy + 2.15, z], [x0 + 3.6, gy + 2.15, z], 0.04, 0.04, 3, 4);
      // the net hangs from the rail in loose pleats, its foot ragged and sagging toward the middle
      const NP = 8; for (let j = 0; j < NP; j++) { const xa = x0 + 0.1 + 3.4 * j / NP, xb = x0 + 0.1 + 3.4 * (j + 1) / NP, za = z + (j & 1 ? 0.12 : -0.12), zb = z + (j & 1 ? -0.12 : 0.12), ya = gy + 0.35 + 0.35 * sin(PI * j / NP) + rr(-0.1, 0.1), yb = gy + 0.35 + 0.35 * sin(PI * (j + 1) / NP) + rr(-0.1, 0.1);
        for (const s of [1, -1]) { if (s > 0) m.quad([xa, ya, za], [xb, yb, zb], [xb, gy + 2.12, z], [xa, gy + 2.12, z], 21, j / NP, 0, (j + 1) / NP, 0, (j + 1) / NP, 1, j / NP, 1); else m.quad([xb, yb, zb], [xa, ya, za], [xa, gy + 2.12, z], [xb, gy + 2.12, z], 21, (j + 1) / NP, 0, j / NP, 0, j / NP, 1, (j + 1) / NP, 1); } }
    }
  }
  end();

  // the Walled Garden: below the castle, south of Hart's Meadow. Stone walls with a dressed coping and a gateway to the
  // north, beds of dark earth, a lean-to glasshouse against the north wall, bee skeps on a bench, and an orchard
  rseed(515); begin();
  {
    const cx = 166, cz = 126, a = 0.08, ex = cos(a), ez = sin(a), px = -ez, pz = ex, hl = 19, hw = 13, ht = 2.6;
    const P = (u, v) => [cx + ex * u + px * v, cz + ez * u + pz * v];
    const sides = [[[-hl, -hw], [hl, -hw]], [[hl, -hw], [hl, hw]], [[hl, hw], [-hl, hw]], [[-hl, hw], [-hl, -hw]]];
    sides.forEach(([[u0, v0], [u1, v1]], i) => {
      const [x0, z0] = P(u0, v0), [x1, z1] = P(u1, v1), gate = P(0, -hw), L = hypot(x1 - x0, z1 - z0), n = round(L / 4), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (i === 0 && hypot(x - gate[0], z - gate[1]) < 1.8) continue; const g = H(x, z); box(x, z, dx, dz, L / n / 2 + 0.02, 0.32, g - 0.8, g + ht, 0, -1); box(x, z, dx, dz, L / n / 2 + 0.06, 0.4, g + ht, g + ht + 0.2, 5, 5); }
    });
    for (const s of [-1, 1]) { const [x, z] = P(s * 2.1, -hw), g = H(x, z); box(x, z, ex, ez, 0.45, 0.45, g - 0.5, g + ht + 0.6, 5, 5); spire(x, z, 0.5, g + ht + 0.6, 0.7, 4, 5, PI / 4 + a); }
    // beds: long low strips of earth with grass paths between
    for (let r = 0; r < 4; r++) { const [x, z] = P(-6, -7 + r * 4), g = H(x, z); box(x, z, ex, ez, 10, 1.1, g - 0.4, g + 0.05, 22, 22);
      for (const v of [-0.5, 0.5]) for (let k = 0; k < 16; k++) { const [qx, qz] = P(-15.4 + k * 1.25, -7 + r * 4 + v); if (r === 3 && k > 9) continue; blob(qx, H(qx, qz) + 0.12, qz, 0.32, 0.22, 0.32, r & 1 ? 18 : 23, 6, 3); } }
    // the lean-to glasshouse along the inside of the north wall (facing south into the sun)
    { const [x, z] = P(-8, hw - 1.6), g = H(x, z); box(x, z, ex, ez, 8, 1.3, g - 0.3, g + 0.7, 0, 0);
      const A = P(-16, hw - 2.9), B = P(0, hw - 2.9), C = P(0, hw - 0.3), D = P(-16, hw - 0.3);
      m.quad([A[0], g + 0.7, A[1]], [B[0], g + 0.7, B[1]], [B[0], g + 2.4, B[1]], [A[0], g + 2.4, A[1]], 8, 0, 0, 16, 0, 16, 1.7, 0, 1.7);
      m.quad([A[0], g + 2.4, A[1]], [B[0], g + 2.4, B[1]], [C[0], g + 3.4, C[1]], [D[0], g + 3.4, D[1]], 8, 0, 0, 16, 0, 16, 2.8, 0, 2.8); }
    // bee skeps on a bench by the east wall
    { const [bx, bz] = P(hl - 2, 4), g = H(bx, bz); box(bx, bz, px, pz, 3, 0.35, g, g + 0.55, 3, 3); for (let k = 0; k < 5; k++) { const [x, z] = P(hl - 2, 1.6 + k * 1.2); prism(x, z, 0.32, 0.36, g + 0.55, g + 0.85, 8, 11); spire(x, z, 0.36, g + 0.85, 0.42, 8, 11); } }
    // the orchard: eight fruit trees in the east half
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      const [x, z] = P(6.5 + c * 3.9, -6.5 + r * 8.5 + (c & 1) * 1.4), g = H(x, z) - 0.2, tx = x + rr(-0.3, 0.3), tz = z + rr(-0.3, 0.3);
      limb([x, g, z], [tx, g + 1.9, tz], 0.2, 0.14, 3, 6);
      for (let k = 0; k < 3; k++) { const b = k / 3 * TAU + rr(0, 1); limb([tx, g + 1.8, tz], [tx + cos(b) * 1.1, g + 2.8, tz + sin(b) * 1.1], 0.1, 0.06, 3, 4); }
      blob(tx, g + 3.3, tz, rr(1.9, 2.2), rr(1.4, 1.65), rr(1.9, 2.2), 20, 10, 5);
    }
    COLB.push([cx, cz, ex, ez, hl + 0.5, hw + 0.5, H(cx, cz) - 3, H(cx, cz) + ht + 3]);
  }
  end();

  // Kilwren Kirkyard: around the village church, a low wall, a lychgate on the lane, a dark yew and leaning headstones
  // a headstone: a thin slab, rounded at the top, leaning back a little about its foot
  const slab = (x, z, a, w, h, t, lean, mat = 5) => {
    const ex = cos(a), ez = sin(a), nx = -ez, nz = ex, g = H(x, z) - 0.15, cl = cos(lean), sl = sin(lean);
    const P = (u, v, y) => [x + ex * u + nx * (v + y * sl), g + y * cl, z + ez * u + nz * (v + y * sl)];
    const ring = [[-w, 0], [w, 0], [w, h * 0.82], [w * 0.7, h * 0.95], [0, h], [-w * 0.7, h * 0.95], [-w, h * 0.82]];
    for (const s of [-1, 1]) for (let i = 1; i + 1 < ring.length; i++) { const A = P(ring[0][0], s * t, ring[0][1]), B = P(ring[i][0], s * t, ring[i][1]), C = P(ring[i + 1][0], s * t, ring[i + 1][1]); if (s > 0) m.quad(A, B, C, C, mat, 0, 0, 1, 0, 1, 1, 1, 1); else m.quad(A, C, B, B, mat, 0, 0, 1, 0, 1, 1, 1, 1); }
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; m.quad(P(p[0], -t, p[1]), P(q[0], -t, q[1]), P(q[0], t, q[1]), P(p[0], t, p[1]), mat, 0, 0, 1, 0, 1, 1, 0, 1); const k = m.nv - 4, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2 - h * 0.45; if (m.b[k * 24 + 12] * (ex * mx) + m.b[k * 24 + 13] * my + m.b[k * 24 + 14] * (ez * mx) < 0) for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) m.b[(k + j) * 24 + 12 + c] *= -1; }
  };
  rseed(517); begin();
  {
    const laneD = (x, z) => { let d = 1e9; for (let i = 0; i <= 60; i++) { const t = i / 60; d = min(d, hypot(x - (mix(170, 330, t) + 25 * sin(t * 7)), z - (mix(-380, -500, t) + 30 * cos(t * 5)))); } return d; };
    const cotD = (x, z) => { let d = 1e9; for (let i = 0; i < COTS.length; i += 2) d = min(d, hypot(x - COTS[i], z - COTS[i + 1])); return d; };
    const church = (x, z, r) => x > 280 - r && x < 301 + r && z > -474 - r && z < -437 + r;
    const ok = (x, z, r) => !church(x, z, r) && cotD(x, z) > 6.5 + r && laneD(x, z) > 3.5 + r;
    const X0 = 266, X1 = 318, Z0 = -470, Z1 = -418;
    for (const [ax, az, bx, bz] of [[X0, Z0, X1, Z0], [X1, Z0, X1, Z1], [X1, Z1, X0, Z1], [X0, Z1, X0, Z0]]) dyke(ax, az, bx, bz, 0.9, 13, (x, z) => !ok(x, z, 0.5) || (az === Z0 && bz === Z0 && abs(x - 292) < 1.6));
    // the lychgate over the south entrance
    { const g = H(292, Z0); for (const s of [-1, 1]) for (const d of [-0.9, 0.9]) limb([292 + s * 1.5, g - 0.3, Z0 + d], [292 + s * 1.5, g + 2.4, Z0 + d], 0.1, 0.09, 3, 5);
      for (const d of [-1, 1]) m.quad([290.1, g + 2.4, Z0 + d * 1.5], [293.9, g + 2.4, Z0 + d * 1.5], [293.9, g + 3.5, Z0], [290.1, g + 3.5, Z0], 1, 0, 0, 3, 0, 3, 1, 0, 1);
      const k = m.nv - 8; for (const kk of [k, k + 4]) if (m.b[kk * 24 + 13] < 0) for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) m.b[(kk + j) * 24 + 12 + c] *= -1; }
    // the yew, old and dark, in the north-east corner
    { const x = 311, z = -424, g = H(x, z); limb([x, g - 0.3, z], [x + 0.2, g + 1.8, z], 0.45, 0.35, 3, 7); blob(x + 0.1, g + 3, z, 3.4, 2.7, 3.2, 18, 11, 5); blob(x - 0.8, g + 1.9, z + 0.6, 2.6, 1.6, 2.5, 18, 9, 4); }
    // headstones in loose rows, facing east, some leaning
    let n = 0;
    for (let r = 0; r < 9 && n < 34; r++) for (let c = 0; c < 10 && n < 34; c++) {
      const x = X0 + 3 + c * 4.9 + rr(-0.6, 0.6), z = Z1 - 3 - r * 5.4 + rr(-0.5, 0.5);
      if (!ok(x, z, 0.8) || hypot(x - 311, z + 424) < 4.5 || rnd() < 0.3) continue;
      slab(x, z, PI / 2 + rr(-0.1, 0.1), rr(0.34, 0.46), rr(0.8, 1.25), rr(0.07, 0.1), rr(-0.18, 0.12), rnd() < 0.7 ? 5 : 17); n++;
    }
  }
  end(); OBJS[OBJS.length - 1].wall = true;
  return m;
}
const VSMOKE = []; // chimney tops in the village
const LAMPS = []; // lanterns: x, y, z, group (0 lane, 1 viaduct, 2 the rest)
const MILLW = [197.6, 22, -285]; // the mill wheel's axle
const BEACON = [310, 90, -70]; // the beacon's fire
const COTS = []; // the village cottages' centres (x, z), so later building keeps clear of them
const BANS = []; // banner poles: x, top y, z, seed
const FALLS = [200, 16, -41, 199, 4, -36]; // waterfall lip and foot (set from the height field)
const RAVSTEP = -40; // where the burn drops over the step in Corrie Gorge (z)
