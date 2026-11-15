// ============================================================================
// the castle: a kit of procedural Gothic pieces and the layout that places them (load time)
// ============================================================================
// Materials (vertex w): 0 ashlar, 1 slate, 2 lit window, 3 timber, 4 copper, 5 dressed trim, 6 lead/iron,
// 7 plaster, 8 greenhouse glass, 9 clock face, 10 dark window, 11 thatch, 12 paving, 13 rubble, 14 rose window,
// 15 traceried window
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
    // string courses
    for (let y = y0 + 9; y < top - 4; y += 9 + floor(rnd() * 3)) prism(x, z, rr0 + 0.18, rr0 + 0.18, y, y + 0.45, n, 5, rot);
    // windows: one per face per floor on narrow faces, offset floor to floor
    const nw = n === 4 ? 4 : min(n, r > 6 ? 10 : r > 4 ? 6 : 4), ww = min(1.5, r * 0.36);
    for (let y = y0 + 4, f = 0; y < top - 4; y += 6.5, f++) for (let i = 0; i < nw; i++) {
      if (rnd() < 0.18) continue;
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
      for (let i = 0; i < 4; i++) { const a = rot + PI / 4 + i * PI / 2, rw = r + 0.08, s = r * 0.62; const cx = x + cos(a) * rw, cz = z + sin(a) * rw, tx = -sin(a), tz = cos(a); m.quad([cx - tx * s, top - 2 * s - 2, cz - tz * s], [cx + tx * s, top - 2 * s - 2, cz + tz * s], [cx + tx * s, top - 2, cz + tz * s], [cx - tx * s, top - 2, cz - tz * s], 9, 0, 0, 1, 0, 1, 1, 0, 1); const k = m.nv - 4; if (m.b[k * 24 + 12] * cos(a) + m.b[k * 24 + 14] * sin(a) < 0) for (let j = 0; j < 4; j++) { m.b[(k + j) * 24 + 12] *= -1; m.b[(k + j) * 24 + 14] *= -1; } }
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
    for (let i = 0; i < nb; i += 3) { const t = -hl + (i + 0.5) * bl; if (rnd() < 0.5 && !o.great) box(cx + ex * t + px * hw * 0.3, cz + ez * t + pz * hw * 0.3, ex, ez, 0.6, 0.6, top + rh * 0.5, top + rh + 2, 0, 6); }
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
  towerL(34, 28, T, 10, 118, { rh: 3.4 });
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
    COLB.push([x, (z0 + z1) / 2, 0, 1, (z0 - z1) / 2, hw + 1, -50, deck]);
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
    let x = -150, z = 70; const dx = -0.86, dz = 0.5;
    while (H(x, z) > B - 3 && x > -260) { x += dx; z += dz; }
    FALLS[0] = x - dx * 1.5; FALLS[1] = B - 2.5; FALLS[2] = z - dz * 1.5;
    let fx = x, fz = z; while (H(fx, fz) > 0.5 && fx > -300) { fx += dx; fz += dz; }
    FALLS[3] = fx + dx * 2; FALLS[4] = 0; FALLS[5] = fz + dz * 2;
    // the stream that feeds it: a channel cut across the terrace
    box(x - dx * 10, z - dz * 10, dx, dz, 9, 1.6, B - 2.5, B - 0.3, 13, 12);
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
    VSMOKE.push(x + ex * hl * 0.6, y0 + wh + rh + 1.3, z + ez * hl * 0.6);
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
  // the village church
  tower(286, -470, H(286, -470), 3.5, 16, { n: 4, roof: 'spire', rh: 4 });
  hall(286, -462, 296, -440, 9, H(292, -450), 8, { rh: 6, dormers: false });
  return m;
}
const VSMOKE = []; // chimney tops in the village
const BANS = []; // banner poles: x, top y, z, seed
const FALLS = [-171, 43, 86, -177, 0, 93]; // waterfall lip and foot
