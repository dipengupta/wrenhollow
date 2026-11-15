// ============================================================================
// math + procedural helpers (load-time only unless noted)
// ============================================================================
const { sin, cos, sqrt, min, max, abs, floor, ceil, PI, pow, atan2, hypot, exp, round } = Math;
const TAU = PI * 2;
let _seed = 20261115;
const rnd = () => {
  _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rr = (a, b) => a + (b - a) * rnd();
// each generator system starts its own random stream, so the systems stay independent
const rseed = (s) => { _seed = (20261115 + Math.imul(s, 7919)) | 0; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const ihash = (x, y, z) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vnoise = (x, y, z) => {
  const ix = floor(x), iy = floor(y), iz = floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = mix(mix(ihash(ix, iy, iz), ihash(ix + 1, iy, iz), fx), mix(ihash(ix, iy + 1, iz), ihash(ix + 1, iy + 1, iz), fx), fy);
  const b = mix(mix(ihash(ix, iy, iz + 1), ihash(ix + 1, iy, iz + 1), fx), mix(ihash(ix, iy + 1, iz + 1), ihash(ix + 1, iy + 1, iz + 1), fx), fy);
  return mix(a, b, fz);
};
const fbm = (x, y, z, o = 4) => {
  let a = 0.5, s = 0;
  for (let i = 0; i < o; i++) { s += a * vnoise(x, y, z); x = x * 2.03 + 17.1; y = y * 2.03 + 31.7; z = z * 2.03 + 5.3; a *= 0.5; }
  return s / (1 - 2 * a);
};

// ---------------------------------------------------------------- terrain grids
// core: 2049² heights at 1 m around the castle; far: 513² at 32 m out to the mountains. Both are filled on the GPU
// (W_HGT) and read back for placement and collision.
const CN = 2049, CS = 1, CO = -1024, FN = 513, FS = 32, FO = -8192;
const PATCH = 128, NPC = (CN - 1) / PATCH, NPF = (FN - 1) / PATCH; // quads per patch side, patches per side
let HC = null, HF = null; // Float32Array heights, set once generated
const hgrid = (A, n, s, o, x, z) => {
  let gx = (x - o) / s, gz = (z - o) / s; gx = gx < 0 ? 0 : gx > n - 1.001 ? n - 1.001 : gx; gz = gz < 0 ? 0 : gz > n - 1.001 ? n - 1.001 : gz;
  const ix = gx | 0, iz = gz | 0, u = gx - ix, v = gz - iz, i = ix + iz * n;
  const a = A[i] + (A[i + 1] - A[i]) * u, b = A[i + n] + (A[i + n + 1] - A[i + n]) * u;
  return a + (b - a) * v;
};
// terrain height anywhere (bilinear, the same triangles the renderer draws up to the diagonal)
const H = (x, z) => (x > CO && x < -CO && z > CO && z < -CO ? hgrid(HC, CN, CS, CO, x, z) : hgrid(HF, FN, FS, FO, x, z));
const slope = (x, z) => { const e = 1.5; return hypot(H(x + e, z) - H(x - e, z), H(x, z + e) - H(x, z - e)) / (2 * e); };

// ---------------------------------------------------------------- mesh builder
// vertex: position f32x3, normal snorm8x3 + material (w = id/127), uv f32x2 (metres along the surface) = 24 bytes
class Mesh {
  constructor() { this.v = new ArrayBuffer(1 << 20); this.f = new Float32Array(this.v); this.b = new Int8Array(this.v); this.nv = 0; this.ix = new Uint32Array(1 << 18); this.ni = 0; }
  grow(nv, ni) {
    if ((this.nv + nv) * 24 > this.v.byteLength) { const v = new ArrayBuffer(max(this.v.byteLength * 2, (this.nv + nv) * 24)); new Uint8Array(v).set(new Uint8Array(this.v)); this.v = v; this.f = new Float32Array(v); this.b = new Int8Array(v); }
    if (this.ni + ni > this.ix.length) { const x = new Uint32Array(max(this.ix.length * 2, this.ni + ni)); x.set(this.ix); this.ix = x; }
  }
  vert(x, y, z, nx, ny, nz, mat, u, v) {
    const k = this.nv++, f = k * 6, b = k * 24 + 12, l = hypot(nx, ny, nz) || 1;
    this.f[f] = x; this.f[f + 1] = y; this.f[f + 2] = z; this.f[f + 4] = u; this.f[f + 5] = v;
    this.b[b] = round(nx / l * 127); this.b[b + 1] = round(ny / l * 127); this.b[b + 2] = round(nz / l * 127); this.b[b + 3] = mat;
    return k;
  }
  tri(a, b, c) { this.ix[this.ni++] = a; this.ix[this.ni++] = b; this.ix[this.ni++] = c; }
  // quad a b c d counter-clockwise seen from the front; uv given per corner, flat normal
  quad(a, b, c, d, mat, ua, va, ub, vb, uc, vc, ud, vd) {
    this.grow(4, 6);
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    if (nx * nx + ny * ny + nz * nz < 1e-12) { const f1x = c[0] - b[0], f1y = c[1] - b[1], f1z = c[2] - b[2], f2x = a[0] - b[0], f2y = a[1] - b[1], f2z = a[2] - b[2]; nx = f2y * f1z - f2z * f1y; ny = f2z * f1x - f2x * f1z; nz = f2x * f1y - f2y * f1x; }
    const i = this.vert(a[0], a[1], a[2], nx, ny, nz, mat, ua, va), j = this.vert(b[0], b[1], b[2], nx, ny, nz, mat, ub, vb);
    const k = this.vert(c[0], c[1], c[2], nx, ny, nz, mat, uc, vc), l = this.vert(d[0], d[1], d[2], nx, ny, nz, mat, ud, vd);
    this.tri(i, j, k); this.tri(i, k, l);
  }
}
