// ============================================================================
// WGSL sources
// ============================================================================

const W_NOISE = /*wgsl*/`
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn h21(p: vec2f) -> f32 { var q = fract(p * vec2f(.1031, .1030)); q += dot(q, q.yx + 33.33); return fract((q.x + q.y) * q.x); }
fn h31(p: vec3f) -> f32 { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn h22(p: vec2f) -> vec2f { var q = fract(vec3f(p.xyx) * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
fn vn2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2f(1., 0.)), u.x), mix(h21(i + vec2f(0., 1.)), h21(i + vec2f(1., 1.)), u.x), u.y);
}
fn vn(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3f(1., 0., 0.)), u.x), mix(h31(i + vec3f(0., 1., 0.)), h31(i + vec3f(1., 1., 0.)), u.x), u.y),
             mix(mix(h31(i + vec3f(0., 0., 1.)), h31(i + vec3f(1., 0., 1.)), u.x), mix(h31(i + vec3f(0., 1., 1.)), h31(i + vec3f(1., 1., 1.)), u.x), u.y), u.z);
}
fn fbm2(p: vec2f, n: i32) -> f32 {
  var a = .5; var s = 0.; var q = p;
  for (var i = 0; i < n; i++) { s += a * vn2(q); q = mat2x2f(1.6, 1.2, -1.2, 1.6) * q + vec2f(17.1, 31.7); a *= .5; }
  return s / (1. - 2. * a);
}
fn fbm(p: vec3f, n: i32) -> f32 {
  var a = .5; var s = 0.; var q = p;
  for (var i = 0; i < n; i++) { s += a * vn(q); q = q * 2.03 + vec3f(17.1, 31.7, 5.3); a *= .5; }
  return s / (1. - 2. * a);
}
// the gorge east of the castle: distance from its meandering centre line, and the height of its floor
fn ravD(p: vec2f) -> f32 {
  let m = 30. * (fbm2(p * vec2f(.002, .0075) + 4., 3) - .5) + 4. * (vn2(p * .03) - .5);
  let pa = p + vec2f(m, 0.) - vec2f(205., -330.); let ba = vec2f(-15., 545.);
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.));
}
fn ravF(z: f32) -> f32 { return mix(19., 1., ss(-300., 200., z)); }
`;

// ---------------------------------------------------------------- terrain height field (compute, load time)
// Water level is y = 0. The castle crag stands at the origin with the loch to its south and west.
const W_HGT = W_NOISE + /*wgsl*/`
struct G { n: u32, pad: u32, s: f32, o: f32 };
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var<storage, read_write> Hs: array<f32>;
fn smax(a: f32, b: f32, k: f32) -> f32 { let h = max(k - abs(a - b), 0.) / k; return max(a, b) + h * h * k * .25; }
fn smin(a: f32, b: f32, k: f32) -> f32 { return -smax(-a, -b, k); }
fn seg(p: vec2f, a: vec2f, b: vec2f) -> f32 { let pa = p - a; let ba = b - a; let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0., 1.); return length(pa - ba * h); }
fn ell(p: vec2f, c: vec2f, r: vec2f, a: f32) -> f32 {
  let d = p - c; let cs = cos(a); let sn = sin(a); let q = vec2f(cs * d.x + sn * d.y, -sn * d.x + cs * d.y) / r;
  return (length(q) - 1.) * min(r.x, r.y);
}
fn ridged(p: vec2f) -> f32 {
  var a = .5; var s = 0.; var q = p; var w = 1.;
  for (var i = 0; i < 6; i++) { var n = 1. - abs(vn2(q) * 2. - 1.); n = n * n * w; w = clamp(n * 1.8, 0., 1.); s += a * n; q = mat2x2f(1.6, 1.2, -1.2, 1.6) * q + vec2f(5.3, 9.1); a *= .5; }
  return s;
}
// a plateau along segment a-b: flat top at t, falling at slope k beyond radius r
fn plat(h: f32, p: vec2f, a: vec2f, b: vec2f, r: f32, t: f32, k: f32, j: f32) -> f32 {
  // ribs and gullies: wobbling the rim sideways turns a steep slope into fluted rock
  let rib = 1. - abs(vn2(p * vec2f(.11, .07)) * 2. - 1.);
  let d = seg(p, a, b) + j + 3.5 * rib + 1.2 * (vn2(p * .35) - .5); let o = max(d - r, 0.);
  var c = t - k * o;
  let dr = t - c;
  // buttresses of rock, ledges and gullies down the face
  c += min(dr * .35, 1.) * (9. * (fbm2(p * .07 + t, 3) - .5) + 4. * (fbm2(p * .23, 2) - .5));
  c -= min(dr * .1, 1.) * 1.2 * ss(.3, .7, fract(c / 13. + 2. * fbm2(p * .03, 2))) * ss(1.5, 4., k);
  return smax(h, c - .4 * fbm2(p * .3, 2), 4.);
}
fn hgt(p: vec2f) -> f32 {
  let w = vec2f(fbm2(p * .0016 + 3.1, 3), fbm2(p * .0016 + 9.7, 3)) - .5;
  let q = p + w * 200.;
  var h = 22. + 46. * (fbm2(q * .0011, 4) - .4) + 9. * (fbm2(q * .006, 3) - .5) + 1.6 * (fbm2(q * .04, 3) - .5);
  // mountains rise around the loch
  let r = length((p - vec2f(-260., 330.)) * vec2f(.85, 1.));
  h += ss(820., 3300., r) * (140. + 860. * ridged(q * .00042 + 2.)) + ss(450., 1300., r) * 70. * fbm2(q * .0021, 3);
  // the loch: a long body south-west plus a lobe that wraps the crag
  let jw = 60. * (fbm2(p * .004, 3) - .5);
  let ld = min(min(ell(q, vec2f(-340., 450.), vec2f(600., 330.), -.18), ell(p, vec2f(-90., 175.), vec2f(250., 130.), .2)), ell(p, vec2f(140., 230.), vec2f(130., 70.), -.3)) + jw;
  let bed = -5. - 34. * ss(0., 280., -ld);
  h = mix(h, bed, ss(55., -50., ld));
  // the valley under the viaduct
  let vm = ss(240., 150., length(vec2f((p.x + 30.) * .6, p.y + 215.)));
  h = mix(h, smin(h, 14. + .04 * abs(p.x + 30.) + 3. * fbm2(p * .02, 2), 10.), vm);
  // island
  h = smax(h, 16. - .12 * pow(length(p - vec2f(-470., 560.)), 1.5) + 4. * fbm2(p * .03, 3), 6.);
  // the castle crag: main top, west terrace, north-east court, south bastion, with cliffs into the water
  let cj = 12. * (fbm2(p * .025, 3) - .5) + 5. * (fbm2(p * .08, 2) - .5);
  var c = -100.;
  c = plat(c, p, vec2f(-55., 25.), vec2f(60., -40.), 62., 100., 9., cj);
  c = plat(c, p, vec2f(-70., 40.), vec2f(40., -10.), 76., 72., 7., cj * 1.4 + 6. * (fbm2(p * .05, 2) - .5));
  c = plat(c, p, vec2f(-60., 70.), vec2f(30., 30.), 70., 36., 6., cj * 1.6);
  c = plat(c, p, vec2f(-150., 70.), vec2f(-100., 100.), 52., 40., 7., cj * 1.5);
  c = plat(c, p, vec2f(-140., 55.), vec2f(-100., 90.), 42., 70., 9., cj);
  c = plat(c, p, vec2f(90., -60.), vec2f(140., -80.), 48., 88., 8., cj);
  c = plat(c, p, vec2f(-40., 120.), vec2f(-10., 150.), 30., 48., 9., cj);
  c = plat(c, p, vec2f(-30., -90.), vec2f(-30., -110.), 16., 100., 5., cj);  // viaduct abutment
  // low shelf by the water for the boathouse
  c = plat(c, p, vec2f(-122., 152.), vec2f(-100., 160.), 13., 2.2, 3., cj * .3);
  h = smax(h, c, 8.);
  // north hill where the viaduct lands, and the east hill across the ravine
  h = plat(h, p, vec2f(-30., -335.), vec2f(-30., -360.), 30., 100., 2.2, cj);
  h = plat(h, p, vec2f(265., -70.), vec2f(320., -40.), 48., 88., .75, cj);
  // the gorge between the north-east court and the east hill: the gap is filled to the rim first, so the gorge is the
  // only way down, then cut as one channel: a narrow floor, scree fans, then stepped and gullied walls
  let rv = ravD(p); let rf = ravF(p.y);
  // the rim: shoulders that fall away gently from the gorge, lowering toward its north end where it opens out
  // north of the bridge the gorge relaxes into an open glen
  let gl = max(ss(-140., -230., p.y), ss(-20., 70., p.y));
  h = mix(h, max(h, 84. + 3. * fbm2(p * .03, 2) - 40. * ss(34., 110., rv + 25. * (fbm2(p * .012, 2) - .5))), ss(-215., -150., p.y) * ss(10., -60., p.y));
  { let w = 3.5 + 3. * vn2(p * .012) + 6. * ss(40., 160., p.y);
    let e = max(rv - w, 0.);
    let rib = 1. - abs(vn2(p * vec2f(.08, .2)) * 2. - 1.);
    let ew = e + 3.5 * rib * ss(5., 14., e) + 3. * (vn2(p * .11) - .5) * ss(3., 9., e);
    var g = rf + .55 * min(ew, 9.) * (.6 + .8 * vn2(p * .07 + 3.)) + mix(2.8, .42, gl) * max(ew - 9., 0.);
    g -= 2.4 * ss(.4, .85, fract(g / 12. + 1.5 * fbm2(p * .025, 2))) * ss(10., 18., e);
    g += 5. * (fbm2(p * .06, 3) - .5) * ss(9., 22., e);
    h = smin(h, g, 3.); }
  // the village shelf
  let vd = length((p - vec2f(250., -430.)) * vec2f(.8, 1.));
  h = mix(h, 24. + 2. * fbm2(p * .02, 2), ss(150., 70., vd));
  // rocky texture where it is steep
  h += 1.4 * (fbm2(p * .09, 3) - .5) * ss(4., 40., abs(h - 30.));
  return h;
}
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= g.n || id.y >= g.n) { return; }
  Hs[id.x + id.y * g.n] = hgt(vec2f(g.o) + vec2f(id.xy) * g.s);
}
`;

// ---------------------------------------------------------------- fullscreen helpers
const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
`;

// ---------------------------------------------------------------- sky bake: single scattering, lat-long, load time
// v maps elevation with more rows near the horizon; u is the azimuth.
const W_SKYBAKE = W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> sun: vec4f;
const RE = 6360e3; const RA = 6420e3;
const BR = vec3f(5.8e-6, 13.5e-6, 33.1e-6); const BM = 3.2e-5; const HR = 8000.; const HM = 1400.;
const BO = vec3f(.65e-6, 1.881e-6, .085e-6);
fn ray(o: vec3f, d: vec3f, r: f32) -> f32 { let b = dot(o, d); let c = dot(o, o) - r * r; let h = b * b - c; if (h < 0.) { return -1.; } return -b + sqrt(h); }
fn dens(p: vec3f) -> vec3f { let hh = length(p) - RE; return vec3f(exp(-hh / HR), exp(-hh / HM), max(0., 1. - abs(hh - 25e3) / 15e3)); }
fn tr(p: vec3f, d: vec3f) -> vec3f {
  let t = ray(p, d, RA); var od = vec3f(0.); let n = 12;
  for (var i = 0; i < n; i++) { od += dens(p + d * (t * (f32(i) + .5) / f32(n))) * t / f32(n); }
  return exp(-(BR * od.x + BM * 1.11 * od.y + BO * od.z));
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(512., 256.);
  let az = (uv.x - .5) * 6.2831853; let vv = 1. - uv.y * 2.; let el = sign(vv) * vv * vv * 1.5707963;
  let d = vec3f(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  let o = vec3f(0., RE + 150., 0.);
  var t = ray(o, d, RA);
  let g = ray(o, d, RE); if (g > 0. && d.y < 0.) { t = min(t, 4e4); }
  let n = 40; var L = vec3f(0.); var od = vec3f(0.);
  let mu = dot(d, sun.xyz); let pr = .0596831 * (1. + mu * mu);
  let gm = .76; let pm = .1193662 * (1. - gm * gm) * (1. + mu * mu) / ((2. + gm * gm) * pow(1. + gm * gm - 2. * gm * mu, 1.5));
  for (var i = 0; i < n; i++) {
    let s = t * (f32(i) + .5) / f32(n); let p = o + d * s; let ds = dens(p) * t / f32(n); od += ds;
    if (ray(p, sun.xyz, RE) > 0. && dot(p, sun.xyz) < 0.) { continue; }
    let T = exp(-(BR * od.x + BM * 1.11 * od.y + BO * od.z)) * tr(p, sun.xyz);
    L += T * (BR * ds.x * pr + BM * ds.y * pm);
  }
  // a little multiple scattering so the shadowed sky is not black
  L += (BR * .55 + vec3f(BM * .12)) * od.x * .015 * vec3f(.9, .8, 1.);
  return vec4f(L * 22. * sun.w, 1.);
}
`;

// ---------------------------------------------------------------- shared scene code
const S_G = W_NOISE + /*wgsl*/`
struct U {
  vp: mat4x4f, sh: mat4x4f,
  cam: vec4f, sun: vec4f, scr: vec4f, rt: vec4f, up: vec4f, fw: vec4f, sunc: vec4f, amb: vec4f,
  env: vec4f,  // night 0..1, window glow, cloud cover, grade
  env2: vec4f, // seasons: snow, foliage, wet, fog
  env3: vec4f, // weather: precipitation, wind, snow (not rain), clock hour
  lbox: array<vec4f, 6>,   // lantern groups: min x, min z, max x, max z; then min y, max y, -, -
  lamps: array<vec4f, 48>, // lanterns: position, 1 (0 = unused slot)
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var sRep: sampler;
@group(0) @binding(2) var sClamp: sampler;
@group(0) @binding(3) var sCmp: sampler_comparison;
@group(0) @binding(4) var tSh: texture_depth_2d;
@group(0) @binding(5) var tSky: texture_2d<f32>;
@group(0) @binding(6) var<storage, read> HC: array<f32>;
@group(0) @binding(7) var<storage, read> HF: array<f32>;
@group(0) @binding(8) var tRefl: texture_2d<f32>;
const TAU = 6.2831853;
const LOW = ${LV > 1};
const CN = ${CN}u; const FN = ${FN}u;
fn skyL(d: vec3f) -> vec3f {
  let el = asin(clamp(d.y, -1., 1.)) / 1.5707963;
  let v = .5 - .5 * sign(el) * sqrt(abs(el));
  let uu = atan2(d.z, d.x) / TAU + .5;
  let c = textureSampleLevel(tSky, sRep, vec2f(uu, clamp(v, .002, .998)), 0.).rgb;
  // under cloud the sky flattens to a soft grey
  let cv = u.env.z;
  let flat = mix(dot(c, vec3f(.3, .5, .2)), dot(u.amb.rgb, vec3f(.3, .5, .2)) * 1.1, ss(.0, .85, cv));
  return mix(c, vec3f(flat) * vec3f(.93, .96, 1.02) * (.9 + .15 * ss(-.1, .4, d.y)), ss(.0, .85, cv));
}
const SNOWC = vec3f(.72, .74, .78);
// aerial perspective: height fog lit by the sky in the same direction, plus the sun's forward glow, plus low mist
fn aerial(c: vec3f, p: vec3f) -> vec3f {
  let v = p - u.cam.xyz; let d = length(v); let rd = v / max(d, 1e-3);
  let fg = u.env2.w;
  let b = 1. / mix(260., 420., fg); let a = 1.6e-4 * (1. + 9. * fg); let oy = max(u.cam.y, -5.);
  var fi = a * exp(-b * oy) * d;
  if (abs(rd.y) > 1e-4) { fi = a * exp(-b * oy) * (1. - exp(-b * rd.y * d)) / (b * rd.y); }
  // the mist: thin and close to the water, patchy, drifting
  let bm = 1. / mix(7., 22., fg); let am = .0018 * (1. + 2. * fg);
  var fm = am * exp(-bm * oy) * d;
  if (abs(rd.y) > 1e-4) { fm = am * exp(-bm * oy) * (1. - exp(-bm * clamp(rd.y * d, -60., 400.))) / (bm * rd.y); }
  let lo = u.cam.xyz + rd * min(d, max(0., -u.cam.y / min(rd.y, -1e-3))) ;
  fm *= .15 + 1.3 * ss(.4, .8, fbm2(lo.xz * .006 + u.cam.w * vec2f(.004, .002), 2));
  let sr = vec3f(rd.x, max(rd.y, .015), rd.z);
  let mu = max(dot(rd, u.sun.xyz), 0.);
  let ins = skyL(sr) + u.sunc.rgb * (.05 * pow(mu, 6.) + .04 * pow(mu, 40.));
  let T = exp(-fi * vec3f(.75, .95, 1.3));
  let Tm = exp(-fm);
  let mc = u.amb.rgb * .9 + u.sunc.rgb * (.18 + .7 * pow(mu, 4.));
  return (c * T + ins * (1. - T)) * Tm + mc * (1. - Tm);
}
fn shadowAt(p: vec3f, n: vec3f) -> f32 {
  let q = u.sh * vec4f(p + n * .25 + u.sun.xyz * .1, 1.);
  let uv = q.xy * vec2f(.5, -.5) + .5;
  if (any(uv < vec2f(0.)) || any(uv > vec2f(1.)) || q.z > 1.) { return 1.; }
  let tx = 1. / f32(textureDimensions(tSh).x);
  if (LOW || u.sun.w > .5 || distance(p, u.cam.xyz) > 150.) { return textureSampleCompareLevel(tSh, sCmp, uv, q.z); }
  var s = 0.;
  s += textureSampleCompareLevel(tSh, sCmp, uv + vec2f(-.5, -1.5) * tx, q.z);
  s += textureSampleCompareLevel(tSh, sCmp, uv + vec2f(1.5, -.5) * tx, q.z);
  s += textureSampleCompareLevel(tSh, sCmp, uv + vec2f(.5, 1.5) * tx, q.z);
  s += textureSampleCompareLevel(tSh, sCmp, uv + vec2f(-1.5, .5) * tx, q.z);
  return s * .25;
}
// sun + sky + bounce, with a soft wrap for foliage (wr > 0)
fn lit(al: vec3f, n: vec3f, p: vec3f, sh: f32, ao: f32, sp: f32, gl: f32) -> vec3f {
  let L = u.sun.xyz; let ndl = max(dot(n, L), 0.);
  let sky = u.amb.rgb * (.55 + .45 * n.y) * ao;
  let bounce = vec3f(.5, .4, .3) * u.sunc.rgb * .05 * (.5 - .5 * n.y) * ao;
  var c = al * (u.sunc.rgb * ndl * sh + sky + bounce);
  if (sp > 0.) {
    let V = normalize(u.cam.xyz - p); let Hh = normalize(L + V);
    let f = .04 + .96 * pow(1. - max(dot(n, V), 0.), 5.);
    c += u.sunc.rgb * sh * sp * pow(max(dot(n, Hh), 0.), gl) * ndl * (gl + 8.) / 25. * f * 4.;
    c += skyL(reflect(-V, n)) * f * sp * ao * .6;
  }
  return c;
}
// warm pools of light from the lanterns, from dusk; only for pixels inside a group's box
fn lampLight(p: vec3f, n: vec3f) -> vec3f {
  let on = ss(.08, .45, u.env.x);
  if (on <= 0.01 || u.sun.w > .5 || distance(p, u.cam.xyz) > 300.) { return vec3f(0.); }
  var c = 0.;
  for (var g = 0u; g < 3u; g++) {
    let b = u.lbox[g]; let by = u.lbox[g + 3u];
    if (p.x < b.x || p.z < b.y || p.x > b.z || p.z > b.w || p.y < by.x || p.y > by.y) { continue; }
    for (var i = 0u; i < 16u; i++) {
      let l = u.lamps[g * 16u + i]; if (l.w == 0.) { break; }
      let d = l.xyz - p; let r2 = dot(d, d);
      if (r2 < 100.) { let r = sqrt(r2); let f = 1. - r * .1; c += max(dot(n, d / r) * .8 + .2, 0.) * f * f / (r2 + .4); }
    }
  }
  return vec3f(1., .62, .26) * c * on * 5.;
}
fn bump(n: vec3f, p: vec3f, h: f32) -> vec3f {
  let dpx = dpdxFine(p); let dpy = dpdyFine(p); let dhx = dpdxFine(h); let dhy = dpdyFine(h);
  let r1 = cross(dpy, n); let r2 = cross(n, dpx); let det = dot(dpx, r1);
  let sg = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - sg);
}
fn clipW(p: vec3f) { if (u.sun.w > .5 && p.y < -.05) { discard; } }
`;

// ---------------------------------------------------------------- terrain (core and far grids, LOD by instance)
const W_TERR = S_G + /*wgsl*/`
override FAR: bool = false;
struct VO { @builtin(position) pos: vec4f, @location(0) p: vec3f, @location(1) n: vec3f, @location(2) rv: f32, @location(3) sl: f32 };
fn hAt(x: i32, z: i32) -> f32 {
  if (FAR) { let n = i32(FN); return HF[u32(clamp(x, 0, n - 1) + clamp(z, 0, n - 1) * n)]; }
  let n = i32(CN); return HC[u32(clamp(x, 0, n - 1) + clamp(z, 0, n - 1) * n)];
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let pid = ii & 1023u; let lod = ii >> 10u;
  let np = select(${NPC}u, ${NPF}u, FAR);
  let sp = select(${CS}., ${FS}., FAR); let org = select(${CO}., ${FO}., FAR);
  let n = 128u >> lod; let st = i32(1u << lod);
  let bx = i32((pid % np) * 128u); let bz = i32((pid / np) * 128u);
  var gx: i32; var gz: i32; var drop = 0.;
  let m = n + 1u; let ng = m * m;
  if (vi < ng) {
    gx = bx + i32(vi % m) * st; gz = bz + i32(vi / m) * st;
  } else {
    // skirts hide the cracks between neighbouring levels of detail
    let s = vi - ng; let side = s / m; let a = i32(s % m) * st; drop = 1.;
    let e = i32(n) * st;
    if (side == 0u) { gx = bx + a; gz = bz; } else if (side == 1u) { gx = bx + a; gz = bz + e; }
    else if (side == 2u) { gx = bx; gz = bz + a; } else { gx = bx + e; gz = bz + a; }
  }
  var h = hAt(gx, gz);
  // normals over two cells: smoother shading on sharp ridges, the per-pixel bump puts the fine detail back
  let s2 = st * 2;
  let nx = hAt(gx - s2, gz) - hAt(gx + s2, gz); let nz = hAt(gx, gz - s2) - hAt(gx, gz + s2);
  let wp = vec3f(org + f32(gx) * sp, 0., org + f32(gz) * sp);
  h -= drop * (2. + 3. * f32(st)) * select(1., 6., FAR);
  if (FAR && abs(wp.x) < 1023. && abs(wp.z) < 1023.) { h -= 60.; }
  var o: VO;
  o.p = vec3f(wp.x, h, wp.z);
  o.n = normalize(vec3f(nx, 2. * f32(s2) * sp, nz));
  // slope over a wider footprint: material boundaries follow the land, not single triangles
  let s3 = st * 3; o.sl = 1. - normalize(vec3f(hAt(gx - s3, gz) - hAt(gx + s3, gz), 2. * f32(s3) * sp, hAt(gx, gz - s3) - hAt(gx, gz + s3))).y;
  // distance from the gorge's centre line: smooth at this scale, so per vertex is enough
  o.rv = 1e3; if (!FAR && abs(wp.x - 200.) < 100. && wp.z > -370. && wp.z < 250.) { o.rv = ravD(wp.xz); }
  o.pos = u.vp * vec4f(o.p, 1.);
  return o;
}
fn rock(p: vec3f, near: bool, f: f32) -> vec3f {
  var s = f; if (s < 0.) { s = fbm(p * vec3f(.25, .6, .25), select(2, 3, near)); }
  let st = vn2(vec2f((p.x + p.z) * .04, p.y * .9));
  var c = mix(vec3f(.14, .128, .112), vec3f(.25, .228, .2), s) * (.82 + .3 * st);
  if (near) { c *= (.86 + .28 * vn(p * vec3f(.9, .25, .9))) * (.88 + .24 * vn(p * 3.1)); c *= 1. - .18 * ss(.9, .97, vn(vec3f(p.x * .35, p.y * .04, p.z * .35)) ) ; }
  c *= .9 + .18 * ss(.3, .7, vn2(vec2f((p.x - p.z) * .02, p.y * .35)));            // layers
  c *= 1. - .2 * ss(.55, .8, vn2(vec2f((p.x + .7 * p.z) * .25, p.y * .015)));       // rain stains
  c = mix(c, vec3f(.26, .28, .17), ss(.68, .8, vn2(p.xz * .2 + p.y * .13 + 3.)) * .35); // lichen
  return c;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let p = i.p; let d = length(p - u.cam.xyz);
  var n = normalize(i.n);
  // detail normal, faded with distance against shimmer
  let sl0 = 1. - n.y;
  // ground ripple on the flats, strata and boulders on the rock faces, faded out with distance
  let rf = ss(.2, .45, sl0); let near = d < 450. && !FAR && u.sun.w < .5; // the reflection is blurred: no near detail
  var bh = 0.;
  var crk = 0.; var rfb = -1.; var lyS = -1.;
  if (near) { bh = fbm2(p.xz * 1.3, 2) * .35;
    if (rf > .01) {
      // rock faces: big lumps, bedding ledges along a tilted plane, and (close up) fractures and grain
      let bed = p.y * .21 + .05 * (p.x - p.z) + 1.6 * vn(p * .07);
      let ly = fract(bed); lyS = ly;
      rfb = fbm(p * vec3f(.3, .55, .3), 3);
      var r = rfb * 1.4 + .45 * ss(.05, .55, ly) * ss(1., .6, ly);
      let cl = 1. - ss(12., 45., d);
      if (cl > 0.) {
        // joints: mostly vertical fractures, broken where the bedding changes
        crk = ss(.82, .97, 1. - abs(vn(p * vec3f(.45, .09, .45) + 7.) * 2. - 1.));
        r += cl * (vn(p * 2.3) * .25 - crk * .3);
        crk *= cl;
      }
      bh = mix(bh, r, rf);
    }
    bh *= 1. - ss(80., 450., d); }
  // the far hills: gullies and spurs in the bump, so they are not smooth domes
  let hf = ss(900., 1400., d);
  if (FAR && u.sun.w < .5) { bh += hf * (vn2(p.xz * .0035) * 14. - 5. * pow(1. - abs(vn2(p.xz * .0075 + 3.) * 2. - 1.), 2.)); }
  let nb = bump(n, p, bh);
  if (u.sun.w < .5) { n = nb; }
  let sl = 1. - n.y;
  // grass / heather / bracken, rock on steep ground, shingle by the water, snow on the high tops
  let m1 = fbm2(p.xz * .012, 3); var m2 = .5; var m3 = .5;
  if (near) { m2 = fbm2(p.xz * .07 + 4., 2); m3 = vn2(p.xz * .5) * .6 + vn2(p.xz * 1.7) * .4; } else if (!FAR) { m2 = vn2(p.xz * .07 + 4.); }
  let rk = ss(.13, .42, mix(sl0, i.sl, .7) + .2 * (m2 - .5) + .16 * (vn2(p.xz * .7) - .5));
  let far = ss(900., 2500., d);
  var al = vec3f(0.);
  if (rk < .995) {
  let mh = fbm2(p.xz * .03 + 9., select(1, 3, near));
  al = mix(vec3f(.11, .155, .06), vec3f(.18, .2, .08), m2);
  // the seasons: fresh green in spring, golden grass in autumn, dead straw in winter
  let ph = u.env2.y; let spr = ss(1., 0., ph); let aut = ss(1., 2., ph) * ss(3., 2., ph); let wtr = ss(2., 3., ph);
  al = mix(al, al * vec3f(.85, 1.2, .75), spr);
  if (spr > 0.) {
    al = mix(al, vec3f(.5, .4, .04), ss(.74, .82, vn2(p.xz * .06 + 5.) * .7 + m3 * .3) * spr * ss(.05, .25, 1. - n.y) * .8); // gorse in flower
    al = mix(al, vec3f(.24, .22, .5), ss(.66, .78, vn2(p.xz * .035 + 11.) * .75 + m3 * .25) * ss(.35, .7, vn2(p.xz * 1.9) * .6 + vn2(p.xz * .4) * .4) * spr * ss(60., 15., p.y) * .55); // bluebells
  }
  al = mix(al, mix(vec3f(.2, .16, .07), vec3f(.27, .2, .08), m2), aut * .65);
  al = mix(al, vec3f(.2, .18, .12) * (.8 + .4 * m2), wtr);
  al = mix(al, vec3f(.22, .19, .09), ss(.45, .85, m1 + .3 * (m2 - .5)) * .4);                    // dry golden grass
  al = mix(al, vec3f(.15, .11, .11), ss(.5, .8, mh + .3 * (m3 - .5)) * ss(.1, .3, 1. - n.y) * ss(30., 80., p.y) * .45 * (1. - far * .4)); // heather on the slopes
  // heather in bloom at the end of summer
  al = mix(al, vec3f(.21, .1, .17), ss(.55, .8, mh + .3 * (m3 - .5)) * ss(30., 80., p.y) * ss(.5, 1., ph) * ss(1.7, 1.1, ph) * .55);
  al = mix(al, vec3f(.27, .13, .05), ss(.62, .72, 1. - mh + .3 * (m2 - .5)) * (.3 + .4 * aut) * (1. - spr) * (1. - far * .7)); // bracken
  if (near && spr > 0.) { al = mix(al, select(vec3f(.8, .75, .4), vec3f(.85, .85, .8), m3 > .5), ss(.955, .99, vn2(p.xz * 2.7)) * spr * (1. - far)); } // spring flowers
  if (far > 0.) { al = mix(al, mix(vec3f(.13, .14, .07), vec3f(.17, .13, .1), ss(.3, .7, vn2(p.xz * .003))), far * .35); }
  al *= .8 + .4 * m3;
  }
  if (rk > .01) { al = mix(al, rock(p, near, rfb) * (1. - .25 * min(crk, 1.)), rk); }
  let shore = ss(2.5, .3, p.y + .8 * (m3 - .5));
  al = mix(al, mix(vec3f(.30, .27, .22), vec3f(.18, .16, .13), m3), shore);
  al = mix(al, vec3f(.13, .1, .07), ss(.5, -1.5, p.y));
  // the gorge: scree and pebbles on the floor and the fans, the burn down the middle
  var stream = vec3f(0.);
  if (i.rv < 40.) {
    let rd = i.rv; let above = p.y - ravF(p.z);
    let scr = ss(17., 8., rd + 3. * (m3 - .5)) * ss(22., 6., above);
    al = mix(al, mix(vec3f(.16, .15, .135), vec3f(.31, .29, .26), m3) * (.5 + .7 * vn2(p.xz * 2.3)) * (.8 + .4 * vn2(p.xz * 9.)), scr);
    let wob = rd + 1.1 * (vn2(p.xz * .15) - .5);
    let wet = ss(2.7, 1.7, wob) * ss(3., .5, above);
    al = mix(al, al * .45, ss(4.5, 2.5, wob) * ss(3., .5, above));
    if (wet > 0.) {
      let rp = vec2f(vn2(vec2f(p.x * 3., p.z * 1.2 - u.cam.w * 2.)), vn2(vec2f(p.x * 3. + 5., p.z * 1.2 - u.cam.w * 2.))) - .5;
      let wn = normalize(vec3f(rp.x * .25, 1., rp.y * .25)); let V = normalize(u.cam.xyz - p);
      let fr = .03 + .97 * pow(1. - max(dot(wn, V), 0.), 5.);
      let wc = mix(vec3f(.015, .018, .016), skyL(reflect(-V, wn)), fr) + vec3f(.6) * ss(2.4, 2.65, wob) * .5 * vn2(p.xz * 1.3 + u.cam.w * vec2f(0., -1.5));
      al = mix(al, vec3f(.02), wet); stream = wc * wet; n = normalize(mix(n, vec3f(0., 1., 0.), wet));
    }
  }
  let snow = ss(620., 760., p.y + 140. * (m1 - .5)) * ss(.55, .3, sl);
  // the winter snow lies on everything that is not too steep, deepest in the hollows
  var snowL = 0.; if (u.env2.x > 0.) { snowL = u.env2.x * ss(.62, .82, i.sl * -1. + 1. + .18 * (m3 - .5) + .12 * (vn2(p.xz * .25) - .5)) * ss(-1., 1.5, p.y); }
  var snowR = 0.; if (u.env2.x > 0.) {
    var ledge = 0.; if (lyS >= 0.) { let wv = vn2(vec2f(p.x + p.z, p.y * 2.5) * .05 + 4.); ledge = ss(.58 + .08 * wv, .68, lyS) * ss(.82 - .1 * wv, .7, lyS) * ss(.35, .6, wv) * .8; }
    let clump = ss(.45, .7, n.y + .35 * (vn2(p.xz * .3 + p.y * .2) - .5)) * ss(.3, .6, vn2(vec2f(p.x + p.z, p.y) * .08 + 2.));
    snowR = u.env2.x * rk * max(ss(.55, .8, normalize(i.n).y + .2 * (m3 - .5)), max(ledge * .35, clump * .9));
  }
  let snowT = max(max(snow, snowL), snowR);
  al = mix(al, SNOWC * (.92 + .1 * m3), snowT);
  al *= 1. - .35 * u.env2.z * (1. - snowT);
  // shadows: pushed further off faces the light only grazes, and faded on the smooth normal, so the edge of the light
  // follows the shape of the land rather than single triangles
  let nG = normalize(i.n); let gL = dot(nG, u.sun.xyz);
  var sh = ss(-.03, .1, gL + .3 * ss(.4, .05, u.sun.y) * (1. - rk)); if (!FAR) { sh *= shadowAt(p + nG * 1.2 * ss(.35, 0., gL), nG); }
  let ao = mix(.7, 1., ss(-5., 30., p.y));
  // grass scatters light: a wrapped response (the normal leans toward the sun) keeps grazing light from picking out facets
  let nl = normalize(n + u.sun.xyz * .45 * ss(.4, .05, u.sun.y) * (1. - rk) * (1. - snowT));
  var c = lit(al, nl, p, sh, ao, shore * .2 * (1. - snowT), 20.) + stream;
  if (u.env.x > .05) { c += al * lampLight(p, nG); }
  clipW(p);
  return vec4f(aerial(c, p), 1.);
}
`;

// ---------------------------------------------------------------- castle, village, bridges (static meshes)
const W_SOLID = S_G + /*wgsl*/`
struct VO { @builtin(position) pos: vec4f, @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) @interpolate(flat) m: u32 };
@vertex fn vs(@location(0) pos: vec3f, @location(1) nm: vec4f, @location(2) uv: vec2f) -> VO {
  var o: VO; o.p = pos; o.n = nm.xyz; o.uv = uv; o.m = u32(round(nm.w * 127.)); o.pos = u.vp * vec4f(pos, 1.); return o;
}
// running-bond ashlar: x = block-local coordinates, y = id
fn ashlar(uv: vec2f, bw: f32, bh: f32) -> vec4f {
  let row = floor(uv.y / bh); let off = select(0., .5, fract(row * .5) > .25) + h21(vec2f(row, 7.)) * .3;
  let col = floor(uv.x / bw + off);
  let f = vec2f(fract(uv.x / bw + off) * bw, fract(uv.y / bh) * bh);
  let mo = min(min(f.x, bw - f.x), min(f.y, bh - f.y));
  return vec4f(mo, h21(vec2f(col, row)), f.x / bw, f.y / bh);
}
fn stoneCol(p: vec3f, uv: vec2f, dark: f32) -> vec4f {
  let a = ashlar(uv, .95, .42);
  var c = mix(vec3f(.40, .385, .355), vec3f(.52, .50, .46), a.y);
  c *= mix(vec3f(1.), vec3f(1.06, 1., .9), h31(floor(p * .035) + 2.));
  c *= .82 + .32 * fbm(p * 2.1, 3);
  // weathering: rain streaks down the walls, damp darkening near the base, lichen
  let streak = fbm(vec3f(uv.x * 2.3, uv.y * .12, 3.), 3);
  c *= mix(1., .5, ss(.42, .85, streak));
  c *= .8 + .2 * ss(.25, .6, fbm(p * vec3f(.15, .04, .15) + 1., 3));
  c *= mix(.72, 1., ss(-2., 8., uv.y));
  c = mix(c, vec3f(.27, .29, .2), ss(.62, .82, fbm(p * .4 + 5., 3)) * .3);
  c *= 1. - dark;
  let mort = ss(.0, .03, a.x);
  return vec4f(c * mix(.55, 1., mort), mort);
}
fn slate(p: vec3f, uv: vec2f) -> vec3f {
  let rw = .22; let row = floor(uv.y / rw); let off = select(0., .5, fract(row * .5) > .25);
  let fx = fract(uv.x / .32 + off); let fy = fract(uv.y / rw);
  let id = h21(vec2f(floor(uv.x / .32 + off), row));
  var c = mix(vec3f(.13, .14, .17), vec3f(.20, .21, .25), id);
  c *= .8 + .2 * ss(.0, .25, fy) * ss(.0, .05, min(fx, 1. - fx));
  c = mix(c, vec3f(.25, .27, .16), ss(.6, .78, fbm(p * .5, 3)) * .5);
  return c;
}
// window: arched lancet with leaded lattice; returns rgb + emission flag
fn windowCol(p: vec3f, uv: vec2f, fl: f32, fwu: vec2f, tr: bool) -> vec4f {
  let x = uv.x * 2. - 1.; let y = uv.y;
  // pointed arch: two circles meeting at the top
  let ah = .72; var inside = abs(x) < .82 && y > .04 && y < ah;
  if (y >= ah) { let cx = select(-.82 + 1.25, .82 - 1.25, x > 0.); let dd = length(vec2f((x - cx) * 1., (y - ah) * 3.4)); inside = dd < 1.25 - .18 && y < 1.; }
  let seed = h31(floor(p * .25) + vec3f(.5));
  if (!inside) { return vec4f(vec3f(.62, .58, .52) * (.85 + .2 * fbm(p * 3., 2)), 0.); }
  // lead cames: diamond lattice + a central mullion
  let q = vec2f(x * 5., y * 9.);
  let dg = min(abs(fract(q.x + q.y) - .5), abs(fract(q.x - q.y) - .5));
  let fw = length(fwu * vec2f(10., 9.)) * .6 + 1e-4;
  let lead = (1. - ss(.04, .09 + fw, dg)) * (1. - ss(.15, .5, fw));
  var mul = 1. - ss(.035, .06 + fw * .2, abs(x));
  if (tr) {
    // three lights under a traceried head: two mullions, cusped sub-arches, and a ring in the head
    let fm = fwu.x * 2. + 1e-4;
    let ml = 1. - ss(.04, .07 + fm, abs(abs(x) - .33));
    let sub = abs(length(vec2f(abs(abs(x) - .33) - .33, (y - ah + .02) * 3.)) - .33);
    let ring = abs(length(vec2f(x, (y - .87) * 3.4)) - .3);
    mul = max(select(ml, 0., y > ah), max(1. - ss(.03, .06 + fm, sub) * select(0., 1., y > ah - .1), 1. - ss(.03, .07 + fm, ring)));
  }
  var lit = select(0., 1., seed < .74) * fl;
  let warm = mix(vec3f(1., .42, .11), vec3f(1., .6, .25), h31(floor(p * .25) + 3.));
  let fk = .85 + .15 * sin(u.cam.w * (2. + seed * 5.) + seed * 40.) * sin(u.cam.w * 1.3 + seed * 13.);
  var e = warm * (2.2 + 3. * h31(floor(p * .25) + 7.)) * fk * lit * (1. - max(lead, mul) * .9) * u.env.y;
  let glass = vec3f(.05, .055, .07) * (1. - lead);
  return vec4f(glass + e, 1.);
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let fwu = fwidth(i.uv);
  let p = i.p; let m = i.m; let uv = i.uv;
  var n = normalize(i.n); if (dot(n, u.cam.xyz - p) < 0.) { n = -n; }
  var al = vec3f(.5); var sp = 0.; var gl = 16.; var em = vec3f(0.);
  if (m == 0u || m == 5u) {
    let s = stoneCol(p, uv, select(0., .12, m == 5u));
    al = s.rgb;
    // the joints catch the low sun: tilt the normal across the mortar
    let a = ashlar(uv, .95, .42);
    n = normalize(n + (1. - s.a) * .25 * vec3f(0., select(-1., 1., a.w < .5), 0.));
    if (m == 5u) { al = vec3f(.56, .52, .46) * (.85 + .25 * fbm(p * 3., 3)); }
  } else if (m == 1u) { al = slate(p, uv); sp = .35; gl = 30.; }
  else if (m == 14u) {
    // rose window: a deep moulded ring, twelve stone mullions ending in cusped arches, a hub with a quatrefoil;
    // between them small panes of muted stained glass in lead, lit from inside
    let c = uv * 2. - 1.; let r = length(c); let an = atan2(c.y, c.x) / TAU + .5;
    let fr = length(fwu) * 2. + 1e-3;
    let sec = fract(an * 12.); let sx = (sec - .5) * r * TAU / 12.;               // distance across a petal, in uv units
    let mull = ss(.05 + fr, .03, abs(abs(sx) - TAU / 24. * r));                    // mullions on the petal edges
    let cusp = ss(.045 + fr, .02, abs(length(vec2f(sx, r - .72)) - .17)) * ss(.5, .6, r);
    let ringO = ss(.84, .86, r); let hub = ss(.25, .23, r) * (1. - ss(.04 + fr, .0, abs(length(vec2f(abs(c.x) - .07, abs(c.y) - .07)) - .07)));
    let stoneT = max(max(max(mull * ss(.22, .26, r), cusp), ringO), hub);
    // the glass: a small grid of panes, each a muted colour, mostly blue with ruby and amber
    // panes laid out around the wheel: rings of wedges, coloured in rings so each petal reads as one design
    let pa = an * 48.; let pr = r * 8.; let g = vec2f(floor(pa) % 4., floor(pr)); let hue = h21(g + 3.);
    let gc = select(select(vec3f(.16, .26, .62), vec3f(.62, .14, .12), hue > .6), vec3f(.75, .55, .2), hue > .86) * (.75 + .5 * h21(vec2f(floor(pa), floor(pr)) + 9.));
    let lead = 1. - ss(.06, .12 + fr * 6., min(abs(fract(pa) - .5) * r * 3.3, abs(fract(pr) - .5))) * .7;
    let pet = 1. - .45 * ss(.0, TAU / 24. * r, abs(sx));
    let ins = ss(.985, .96, r);
    let st = stoneCol(p, uv * 7., 0.).rgb;
    // the moulding falls into shadow toward the glass, so the window sits back in the wall
    let rec = mix(1., .45, ss(.97, .86, r));
    al = mix(st, st * rec * .8, stoneT) ; al = mix(al, vec3f(.03, .035, .045), ins * (1. - stoneT));
    em = gc * lead * pet * 1.6 * ins * (1. - stoneT) * (.9 + .1 * sin(u.cam.w * 1.3 + hue * 30.)) * u.env.y;
    if (r > .985) { al = st; }
  }
  else if (m == 2u || m == 10u || m == 15u) { let w = windowCol(p, uv, select(1., .0, m == 10u), fwu, m == 15u); al = select(w.rgb, vec3f(.04, .045, .06), w.a > .5); if (w.a > .5) { em = w.rgb; sp = .25; gl = 300.; } }
  else if (m == 3u) { let g = fbm(vec3f(uv.x * 9., uv.y * .4, 1.), 3); al = mix(vec3f(.12, .07, .04), vec3f(.24, .15, .08), g) * (.7 + .3 * ss(.0, .06, abs(fract(uv.x * 4.) - .5))); }
  else if (m == 4u) { let g = fbm(p * 1.3, 3); al = mix(vec3f(.12, .36, .30), vec3f(.20, .42, .36), g) * (.8 + .3 * fbm(vec3f(uv.x * 3., uv.y * .3, 2.), 2)); sp = .25; }
  else if (m == 6u) { al = vec3f(.06, .06, .065); sp = .6; gl = 60.; }
  else if (m == 7u) { al = vec3f(.62, .58, .52) * (.8 + .25 * fbm(p * 1.7, 3)); al *= mix(.7, 1., ss(-1., 2., uv.y)); }
  else if (m == 8u) { al = vec3f(.08, .1, .1); sp = 1.; gl = 200.; em = vec3f(.2, .35, .15) * .25; }
  else if (m == 9u) {
    // the clock: an ivory dial in a stone surround and an iron bezel, hour marks, and hands that keep the time of day
    // (the face's u runs right to left as seen from outside, so x is mirrored)
    let c = vec2f(1. - uv.x * 2., uv.y * 2. - 1.); let r = length(c); let fr = length(fwu) * 2. + 1e-3;
    let an = atan2(c.x, c.y) / TAU;                                                   // clockwise from twelve
    let hrs = u.env3.w + u.cam.w / 3600.; let mins = fract(hrs) * 60. + 0.;
    let ah = hrs / 12. * TAU; let am = mins / 60. * TAU;
    al = mix(vec3f(.86, .82, .7), vec3f(.78, .72, .58), ss(.3, .9, r)) * (.92 + .1 * fbm(p * 4., 2));
    let mk = ss(.05 + fr, .02, abs(fract(an * 12. + .5) - .5) * r * 6.3) * ss(.66, .7, r) * ss(.88, .85, r);
    let mm = ss(.02 + fr, .008, abs(fract(an * 60. + .5) - .5) * r * 6.3 / 5.) * ss(.8, .82, r) * ss(.88, .86, r);
    let dh = vec2f(sin(ah), cos(ah)); let dm = vec2f(sin(am), cos(am));
    let hh = ss(.04 + fr * .5, .035, abs(dot(c, vec2f(dh.y, -dh.x)))) * ss(.5, .46, dot(c, dh)) * ss(-.12, -.08, dot(c, dh));
    let hm = ss(.026 + fr * .5, .021, abs(dot(c, vec2f(dm.y, -dm.x)))) * ss(.78, .74, dot(c, dm)) * ss(-.15, -.1, dot(c, dm));
    let boss = ss(.07, .05, r);
    al = mix(al, vec3f(.05, .045, .04), max(max(mk, mm), max(max(hh, hm), boss)));
    em = al * vec3f(1., .8, .55) * 1.2 * u.env.y * ss(.97, .94, r);
    let bez = ss(.89, .9, r) * ss(.99, .97, r);
    al = mix(al, vec3f(.07, .065, .06), bez); em *= 1. - bez;
    sp = select(.05, .4, bez > .5); gl = 40.;
  }
  else if (m == 13u) {
    let a = ashlar(uv * vec2f(.8, 1.1) + vec2f(0., fbm(p * .3, 2) * .3), 1.4, .7);
    al = mix(vec3f(.22, .21, .19), vec3f(.33, .31, .28), a.y) * (.75 + .4 * fbm(p * 1.3, 3)) * mix(.5, 1., ss(.0, .06, a.x));
    al = mix(al, vec3f(.2, .22, .14), ss(.58, .78, fbm(p * .25 + 9., 3)) * .35);
  }
  else if (m == 11u) { al = vec3f(.5, .38, .2) * (.6 + .4 * fbm(p * 4., 2)); } // thatch / straw
  else if (m == 16u) { al = vec3f(.05); em = vec3f(1., .62, .26) * 22. * max(ss(.08, .45, u.env.x), .12 * ss(.5, 1., u.env.y)) * (.9 + .1 * sin(u.cam.w * 9. + p.x * 3.)); } // lantern
  else if (m == 12u) { al = vec3f(.3, .3, .28); sp = .2; } // paving
  // winter: snow on roofs, sills and wall tops; rain: darker, glossier stone and slate
  let up = normalize(i.n).y * select(-1., 1., dot(normalize(i.n), n) > 0.);
  if ((u.env2.x > 0. || u.env2.z > 0.) && m != 2u && m != 10u && m != 14u && m != 15u && m != 9u && m != 8u) {
    var sn = 0.; if (u.env2.x > 0.) { sn = u.env2.x * ss(select(.62, .3, m == 1u || m == 4u || m == 11u || m == 3u), select(.85, .5, m == 1u || m == 4u || m == 11u || m == 3u), up + .15 * (vn(p * .9) - .5)); }
    al = mix(al * (1. - .3 * u.env2.z), SNOWC, sn);
    sp = mix(sp + u.env2.z * .4, .25, sn); gl = mix(select(gl, 60., u.env2.z > .3), 20., sn);
  }
  let sh = shadowAt(p, n);
  let ao = select(mix(.55, 1., ss(-1., 6., uv.y)), 1., m == 14u || m == 9u) * select(1., .8, m == 1u);
  var c = lit(al, n, p, sh, ao, sp, gl) + em;
  if (u.env.x > .05) { c += al * lampLight(p, n); }
  clipW(p);
  return vec4f(aerial(c, p), 1.);
}
`;

// ---------------------------------------------------------------- trees (instanced)
const W_TREE = S_G + /*wgsl*/`
struct VO { @builtin(position) pos: vec4f, @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) @interpolate(flat) m: u32, @location(4) @interpolate(flat) s: f32, @location(5) h: f32 };
@vertex fn vs(@location(0) pos: vec3f, @location(1) nm: vec4f, @location(2) uv: vec2f, @location(3) ia: vec4f, @location(4) ib: vec4f) -> VO {
  let cs = cos(ib.x); let sn = sin(ib.x);
  var q = vec3f(cs * pos.x - sn * pos.z, pos.y, sn * pos.x + cs * pos.z) * ia.w * vec3f(ib.z, 1., ib.z);
  let sw = (sin(u.cam.w * .9 + ia.x * .05 + ia.z * .03) * .5 + sin(u.cam.w * 2.3 + ib.y * 20.) * .15) * (.6 + 1.4 * u.env3.y);
  q.x += sw * .012 * pos.y * pos.y * ia.w; q.z += sw * .006 * pos.y * pos.y * ia.w;
  let nn = vec3f(cs * nm.x - sn * nm.z, nm.y, sn * nm.x + cs * nm.z);
  var o: VO; o.m = u32(round(nm.w * 127.));
  // winter: the birches drop their leaves
  if (o.m == 23u && u.env2.y > 2.5) { q = vec3f(0., .5 * ia.w, 0.); }
  o.p = ia.xyz + q; o.n = nn; o.uv = uv; o.s = ib.y; o.h = pos.y;
  o.pos = u.vp * vec4f(o.p, 1.); return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  var n = normalize(i.n);
  var al: vec3f; var wrap = 0.;
  let d = length(i.p - u.cam.xyz);
  let t = fbm(i.p * 2.6, 2); let tf = 1. - ss(40., 200., d);
  let nb = bump(n, i.p, t * .5 * tf);
  if (i.m == 21u) { al = vec3f(.16, .1, .07) * (.7 + .4 * fbm(i.p * vec3f(3., .5, 3.), 2)); }
  else if (i.m == 22u) { al = vec3f(.62, .6, .55) * (.6 + .5 * ss(.3, .6, fbm(i.p * vec3f(4., 12., 4.), 2))); }
  else {
    n = nb;
    let birch = i.m == 23u;
    let ph = u.env2.y;
    var bc = mix(vec3f(.12, .16, .05), vec3f(.32, .26, .07), t);                                   // late summer
    bc = mix(bc, mix(vec3f(.14, .24, .05), vec3f(.26, .34, .08), t), ss(1., 0., ph));             // spring
    if (ph < .6) { bc = mix(bc, vec3f(.82, .74, .76), ss(.62, .78, vn(i.p * 3.1)) * ss(.6, 0., ph) * .8); } // blossom
    bc = mix(bc, mix(vec3f(.36, .16, .03), vec3f(.55, .38, .05), t), ss(1.2, 2., ph));            // autumn
    al = select(mix(vec3f(.035, .07, .035), vec3f(.07, .11, .05), t), bc, birch);
    al *= .75 + .5 * i.s;
    al *= mix(.55, 1., ss(.1, .9, i.uv.y)); // darker deep inside each layer
    al = mix(al, SNOWC, u.env2.x * ss(.05, .45, n.y) * ss(.15, .7, i.uv.y) * .95 * select(1., 0., birch));
    wrap = .35;
  }
  let sh = shadowAt(i.p, n);
  let L = u.sun.xyz; let ndl = max((dot(n, L) + wrap) / (1. + wrap), 0.);
  let sky = u.amb.rgb * (.55 + .45 * n.y) * mix(.6, 1., ss(0., 14., i.h));
  var c = al * (u.sunc.rgb * ndl * sh + sky);
  // light through the needles at the silhouette when looking toward the sun
  let V = normalize(u.cam.xyz - i.p);
  c += al * u.sunc.rgb * pow(max(dot(-V, L), 0.), 6.) * sh * .9 * wrap;
  clipW(i.p);
  return vec4f(aerial(c, i.p), 1.);
}
`;

// ---------------------------------------------------------------- the loch
const W_WATER = S_G + /*wgsl*/`
struct VO { @builtin(position) pos: vec4f, @location(0) p: vec3f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  let c = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  var o: VO; o.p = vec3f(u.cam.x + c.x * 9000., 0., u.cam.z + c.y * 9000.); o.pos = u.vp * vec4f(o.p, 1.); return o;
}
fn depthAt(x: f32, z: f32) -> f32 {
  if (abs(x) < 1023. && abs(z) < 1023.) {
    let g = vec2f(x, z) - ${CO}.; let i = vec2u(floor(g)); let f = fract(g); let n = CN;
    let a = HC[i.x + i.y * n]; let b = HC[i.x + 1u + i.y * n]; let c = HC[i.x + (i.y + 1u) * n]; let d = HC[i.x + 1u + (i.y + 1u) * n];
    return -mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  let g = (vec2f(x, z) - ${FO}.) / ${FS}.; let i = vec2u(clamp(floor(g), vec2f(0.), vec2f(f32(FN) - 2.))); let f = fract(g); let n = FN;
  let a = HF[i.x + i.y * n]; let b = HF[i.x + 1u + i.y * n]; let c = HF[i.x + (i.y + 1u) * n]; let d = HF[i.x + 1u + (i.y + 1u) * n];
  return -mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// sum of drifting wave trains; returns the slope (d/dx, d/dz)
fn waves(p: vec2f, t: f32, fade: f32) -> vec2f {
  var g = vec2f(0.); var a = .05; var k = .35; var dir = vec2f(.8, .6);
  for (var i = 0; i < 7; i++) {
    let w = sqrt(9.81 * k); let ph = dot(dir, p) * k - w * t + f32(i) * 1.7;
    g += dir * cos(ph) * a * k * mix(1., fade, f32(i) / 6.);
    dir = mat2x2f(.73, .68, -.68, .73) * dir; k *= 1.42; a *= .72;
  }
  return g;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let p = i.p; let V0 = u.cam.xyz - p; let dist = length(V0); let V = V0 / dist;
  let dep = depthAt(p.x, p.z);
  let fade = 1. - ss(30., 500., dist);
  var g = waves(p.xz, u.cam.w, fade) * (.6 + .7 * u.env3.y);
  g *= ss(0., 1.5, dep) * .7 + .3;
  var rip = fbm2(p.xz * .9 + u.cam.w * vec2f(.3, .2), 2) * .12 * fade;
  // rain: rings spreading from drops, one per cell, each at its own moment
  if (u.env3.x > 0. && u.env3.z < .5) {
    let q = p.xz * 1.6; let c = floor(q); let h = h22(c); let f = fract(q) - .5 - (h - .5) * .5;
    let t = fract(u.cam.w * 1.1 + h.x * 7.); let r = length(f);
    rip += sin((r - t * .45) * 45.) * ss(.06, 0., abs(r - t * .45)) * (1. - t) * .03 * u.env3.x * fade;
  }
  let n = bump(normalize(vec3f(-g.x, 1., -g.y)), p, rip);
  let f = .02 + .98 * pow(1. - max(dot(n, V), 0.), 5.);
  // planar reflection (rendered mirrored at reduced resolution), distorted by the ripples
  let suv = i.pos.xy * u.scr.zw;
  let ruv = vec2f(suv.x, 1. - suv.y) + n.xz * vec2f(.6, .9) * .06 / (1. + dist * .02);
  var refl = textureSampleLevel(tRefl, sClamp, clamp(ruv, vec2f(.001), vec2f(.999)), 0.).rgb;
  // peaty loch water: dark brown-green in the deep, the stony bed shows through in the shallows
  let L = u.sun.xyz;
  let deep = vec3f(.008, .012, .01) * (u.amb.rgb * 3. + u.sunc.rgb * .2);
  let bed = vec3f(.22, .18, .13) * (u.sunc.rgb * max(L.y, 0.) * 2. + u.amb.rgb);
  let tr = exp(-max(dep, 0.) * vec3f(.9, .55, .45) * (1. + 1. / max(V.y, .05)) * .35);
  var col = mix(deep, bed, tr);
  col = mix(col, refl, f);
  // the sun's glitter path
  let Hh = normalize(L + V); let sp = pow(max(dot(n, Hh), 0.), mix(180., 1200., fade));
  col += u.sunc.rgb * sp * mix(4., 18., fade) * f * shadowAt(p, vec3f(0., 1., 0.));
  // foam where the water meets the shore
  let fo = ss(.55, .0, dep + .25 * sin(u.cam.w * .8 + p.x * .3 + p.z * .2)) * ss(.3, .7, fbm2(p.xz * 1.5 + u.cam.w * .1, 3));
  col = mix(col, vec3f(.8) * (u.sunc.rgb * .4 + u.amb.rgb), fo * .7);
  // winter: a shelf of snowy ice around the shore, cracked, the open water beyond
  var ice = 0.; if (u.env2.x > 0.) { ice = u.env2.x * ss(8., 6., dep + 3. * (fbm2(p.xz * .015, 3) - .5)); }
  if (ice > 0.) {
    let ck = 1. - ss(.0, .05, abs(vn2(p.xz * .35) - .5)) * .5;
    let sn = ss(.3, .7, fbm2(p.xz * .2, 3));
    let ia = mix(vec3f(.45, .5, .55), SNOWC, sn) * ck;
    let ic = ia * (u.sunc.rgb * max(L.y, 0.) * shadowAt(p, vec3f(0., 1., 0.)) + u.amb.rgb) + refl * f * .25 * (1. - sn);
    col = mix(col, ic, ss(0., .3, ice));
  }
  if (dep < -.02) { discard; }
  return vec4f(aerial(col, p), 1.);
}
`;

// ---------------------------------------------------------------- sky, sun and clouds (drawn behind everything)
const W_SKY = S_G + /*wgsl*/`
struct VO { @builtin(position) pos: vec4f, @location(0) c: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  let c = vec2f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
  var o: VO; o.pos = vec4f(c, 0., 1.); o.c = c; return o;
}
fn cloud(p: vec2f, o: i32) -> f32 {
  let w = u.cam.w * vec2f(4., 1.5);
  let q = p * .00022 + w * .00022;
  var d = fbm2(q, o) * 1.15 - .1 * fbm2(q * 6. + 3., 2);
  let cv = u.env.z;
  d = ss(.5 - .42 * cv, .85 - .3 * cv, d + .1 * fbm2(p * .00006, 2));
  return d;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let rd = normalize(u.fw.xyz + u.rt.xyz * i.c.x * u.rt.w + u.up.xyz * i.c.y * u.up.w);
  var c = skyL(rd);
  let mu = dot(rd, u.sun.xyz);
  // the sun disk with limb darkening
  let sd = 1. - ss(.99996, .99999, mu);
  let disk = ss(.99990, .99993, mu);
  let nt = u.env.x;
  c += u.sunc.rgb * disk * 160. * mix(.6, 1., sd) * (1. - nt) * (1. - u.env.z);
  if (nt > 0. && rd.y > 0.) {
    // stars: one per cell of a fine grid on the sky, twinkling; a faint band of the galaxy across it
    let g = rd * 260.; let id = floor(g); let f = fract(g) - .5; let h = h31(id);
    let st = ss(.9965, 1., h) * ss(.25, .05, length(f + (vec3f(h22(id.xy + id.z), fract(h * 17.)) - .5) * .5)) * (.6 + .4 * sin(u.cam.w * (3. + h * 9.) + h * 50.));
    let band = ss(.35, 0., abs(dot(rd, normalize(vec3f(.3, .55, -.78))))) * fbm2(rd.xz / max(rd.y, .1) * 3., 3);
    c += (vec3f(st * 3.) + vec3f(.5, .55, .7) * band * .04) * nt * ss(.02, .2, rd.y) * (1. - u.env.z);
    // the moon: a pale disk with darker seas
    let md = ss(.99991, .99994, mu);
    let ml = 1. - .35 * ss(.4, .7, fbm2(vec2f(dot(rd, u.rt.xyz), rd.y) * 900., 3));
    c += vec3f(.9, .92, 1.) * md * ml * 7. * nt + vec3f(.5, .6, .8) * pow(max(mu, 0.), 300.) * .3 * nt;
  }
  if (rd.y > 0.) {
    let t = (2200. - u.cam.y) / rd.y; let cp = u.cam.xz + rd.xz * t;
    let d = cloud(cp, ${CLOUDN});
    if (d > 0.) {
      // light: how much cloud lies toward the sun, phase for the silver lining
      let lsh = cloud(cp + u.sun.xz * 260., 3) * .8 + cloud(cp + u.sun.xz * 700., 2) * .4;
      let be = exp(-lsh * 2.2);
      let ph = .6 + 2.5 * pow(max(mu, 0.), 8.) + .3 * pow(max(mu, 0.), 2.);
      var lc = u.sunc.rgb * (be * ph * .55 + .08) * vec3f(1., .82, .7) + u.amb.rgb * (.7 + .3 * d) * vec3f(.9, .85, 1.);
      lc *= 1. - .45 * u.env.z * ss(.3, 1., d);   // heavy cloud is dark underneath
      let a = d * (1. - ss(14000., 60000., t)) * ss(.0, .06, rd.y);
      c = mix(c, lc, a * .92);
    }
  }
  // fog veils the sky as well
  c = mix(c, skyL(normalize(vec3f(rd.x, .03, rd.z))), u.env2.w * .85 * ss(-.2, .6, 1. - rd.y));
  return vec4f(c, 1.);
}
`;

// ---------------------------------------------------------------- post: blit, bloom, shafts, tonemap
const W_BLIT = W_FS + /*wgsl*/`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
fn tc(p: vec4f) -> vec2f { return p.xy / vec2f(textureDimensions(src)) * .5; }
@fragment fn fsDown0(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let d = vec2f(textureDimensions(src)); let uv = p.xy * 2. / d; let o = 1. / d;
  var c = textureSampleLevel(src, smp, uv + o * vec2f(-1., -1.), 0.).rgb + textureSampleLevel(src, smp, uv + o * vec2f(1., -1.), 0.).rgb
        + textureSampleLevel(src, smp, uv + o * vec2f(-1., 1.), 0.).rgb + textureSampleLevel(src, smp, uv + o * vec2f(1., 1.), 0.).rgb;
  c *= .25; let l = max(c.r, max(c.g, c.b));
  return vec4f(c * max(l - .9, 0.) / max(l, 1e-4), 1.);
}
@fragment fn fsDown(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let d = vec2f(textureDimensions(src)); let uv = p.xy * 2. / d; let o = 1. / d;
  let c = textureSampleLevel(src, smp, uv + o * vec2f(-1., -1.), 0.) + textureSampleLevel(src, smp, uv + o * vec2f(1., -1.), 0.)
        + textureSampleLevel(src, smp, uv + o * vec2f(-1., 1.), 0.) + textureSampleLevel(src, smp, uv + o * vec2f(1., 1.), 0.);
  return c * .25;
}
@fragment fn fsUp(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let d = vec2f(textureDimensions(src)) * 2.; let uv = p.xy / d; let o = 1. / d;
  let c = textureSampleLevel(src, smp, uv + o * vec2f(-1., 0.), 0.) + textureSampleLevel(src, smp, uv + o * vec2f(1., 0.), 0.)
        + textureSampleLevel(src, smp, uv + o * vec2f(0., -1.), 0.) + textureSampleLevel(src, smp, uv + o * vec2f(0., 1.), 0.);
  return c * .25 * .8;
}
`;

// sun shafts: march toward the sun's screen position over the bright parts of the image (half resolution)
const W_RAYS = W_FS + W_NOISE + /*wgsl*/`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> sp: vec4f; // sun position in uv, strength, aspect
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let d = vec2f(textureDimensions(src)) * .5; let uv = p.xy / d;
  if (sp.z <= 0.) { return vec4f(0.); }
  let dv = (sp.xy - uv); let n = 40; let st = dv / f32(n) * .9;
  var q = uv + st * h21(p.xy); var acc = vec3f(0.); var w = 1.;
  for (var i = 0; i < n; i++) {
    let c = textureSampleLevel(src, smp, q, 0.).rgb; let l = max(c.r, max(c.g, c.b));
    acc += c * ss(5., 14., l) * w; w *= .965; q += st;
  }
  let r = length(dv * vec2f(sp.w, 1.));
  return vec4f(acc / f32(n) * sp.z * exp(-r * 1.6), 1.);
}
`;

const W_POST = W_FS + W_NOISE + /*wgsl*/`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var blm: texture_2d<f32>;
@group(0) @binding(3) var ray: texture_2d<f32>;
struct PP { a: vec4f, b: vec4f };
@group(0) @binding(4) var<uniform> P: PP; // exposure, out w, out h, time; grade, night
fn aces(x: vec3f) -> vec3f {
  let a = mat3x3f(.59719, .07600, .02840, .35458, .90834, .13383, .04823, .01566, .83777);
  let b = mat3x3f(1.60475, -.10208, -.00327, -.53108, 1.10813, -.07276, -.07367, -.00605, 1.07602);
  let v = a * x; let r = (v * (v + .0245786) - .000090537) / (v * (.983729 * v + .4329510) + .238081);
  return clamp(b * r, vec3f(0.), vec3f(1.));
}
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let pp = P.a;
  let uv = p.xy / pp.yz;
  var c = textureSampleLevel(src, smp, uv, 0.).rgb;
  c += textureSampleLevel(blm, smp, uv, 0.).rgb * .09;
  c += textureSampleLevel(ray, smp, uv, 0.).rgb;
  c *= pp.x;
  // warm dusk grade: lift the shadows toward violet, keep the highlights gold
  let l = dot(c, vec3f(.2126, .7152, .0722));
  c = mix(c, c * vec3f(.92, .95, 1.12), ss(.25, 0., l) * .5 * P.b.x);
  // night: the eye loses colour in the dark, and the shadows go blue
  c = mix(c, mix(vec3f(l), c, ss(.0, .5, l)) * vec3f(.85, .95, 1.2), P.b.y * .6);
  c = aces(c * 1.05);
  c = pow(c, vec3f(1. / 2.2));
  let v = uv - .5; c *= 1. - dot(v, v) * .55;
  c += (h21(p.xy + fract(pp.w) * 17.) - .5) / 255.;
  return vec4f(c, 1.);
}
`;

// ---------------------------------------------------------------- rooks: two flapping wings per bird, on orbits
const W_BIRD = S_G + /*wgsl*/`
struct VO { @builtin(position) pos: vec4f, @location(0) p: vec3f, @location(1) n: vec3f, @location(2) @interpolate(flat) big: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> VO {
  let t = u.cam.w; let an = b.x + t * b.y;
  var c = a.xyz + vec3f(cos(an) * a.w, sin(an * 2.3 + b.z * 9.) * 5., sin(an) * a.w * .7);
  let bat = b.w < .5; let big = b.w > 1.5;
  if (bat) { c += vec3f(sin(t * 5.1 + b.z * 40.), sin(t * 6.3 + b.z * 20.) * .6, cos(t * 4.7 + b.z * 30.)) * 3.; }
  let fw = normalize(vec3f(-sin(an) * a.w * b.y, 0., cos(an) * a.w * .7 * b.y));
  let rt = normalize(cross(fw, vec3f(0., 1., 0.)));
  var fl = sin(t * 9. * b.w + b.z * 30.) * .7;
  // big birds glide on a slight dihedral and flap now and then; bats beat their wings fast
  if (big) { fl = .15 + sin(t * 3.2 + b.z * 30.) * .55 * ss(.75, .95, sin(t * .23 + b.z * 11.)); }
  if (bat) { fl = sin(t * 28. + b.z * 30.) * .8; }
  let tri = vi / 3u; let k = vi % 3u; let s = select(-1., 1., tri >= 2u); let outer = (tri & 1u) == 1u;
  let sz = .55 * b.w; var p = vec3f(0.);
  let wa = vec2f(cos(fl), sin(fl)); let wb = vec2f(cos(fl * 1.6), sin(fl * 1.6));
  let mid = rt * s * wa.x * sz + vec3f(0., wa.y * sz, 0.);
  let up = cross(rt, fw);
  if (tri < 4u) {
    if (!outer) { if (k == 0u) { p = fw * sz * .5; } else if (k == 1u) { p = -fw * sz * .6; } else { p = mid; } }
    else { if (k == 0u) { p = mid + fw * sz * .2; } else if (k == 1u) { p = mid - fw * sz * .25; } else { p = mid + (rt * s * wb.x + vec3f(0., wb.y, 0.)) * sz * .9 - fw * sz * .2; } }
  } else if (tri == 4u) { // a fanned tail
    if (k == 0u) { p = -fw * sz * .45; } else if (k == 1u) { p = -fw * sz * 1.05 + rt * sz * .24; } else { p = -fw * sz * 1.05 - rt * sz * .24; }
  } else { // the head
    if (k == 0u) { p = fw * sz * .9 - up * sz * .03; } else if (k == 1u) { p = fw * sz * .3 + rt * sz * .1; } else { p = fw * sz * .3 - rt * sz * .1; }
  }
  var o: VO; o.p = c + p; o.n = normalize(up + rt * s * wa.y * select(0., 1., tri < 4u)); o.big = select(0., 1., big); o.pos = u.vp * vec4f(o.p, 1.); return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  // rooks and bats read as black silhouettes; the eagle and the owl are brown, lit from above and below
  var n = normalize(i.n); if (dot(n, u.cam.xyz - i.p) < 0.) { n = -n; }
  let al = select(vec3f(.012, .011, .012), vec3f(.11, .07, .04), i.big > .5);
  let c = select(al * (u.sunc.rgb + u.amb.rgb), al * (u.sunc.rgb * max(dot(n, u.sun.xyz), 0.) * 1.5 + u.amb.rgb * (.6 + .4 * n.y)), i.big > .5);
  return vec4f(aerial(c, i.p), 1.);
}
`;

// ---------------------------------------------------------------- banners, chimney smoke, the waterfall, motes
const W_FX = () => S_G + /*wgsl*/`
const NB = ${BANS.length / 4}u; const NS = ${VSMOKE.length / 3}u;
const BAN = array<vec4f, ${max(1, BANS.length / 4)}>(${Array.from({ length: max(1, BANS.length / 4) }, (_, i) => `vec4f(${(BANS.slice(i * 4, i * 4 + 4).concat([0, 0, 0, 0])).slice(0, 4).map((v) => v.toFixed(2)).join(',')})`).join(',')});
const SMK = array<vec3f, ${max(1, VSMOKE.length / 3)}>(${Array.from({ length: max(1, VSMOKE.length / 3) }, (_, i) => `vec3f(${(VSMOKE.slice(i * 3, i * 3 + 3).concat([0, 0, 0])).slice(0, 3).map((v) => v.toFixed(2)).join(',')})`).join(',')});
const WIND = vec3f(.8, 0., -.6);
struct VO { @builtin(position) pos: vec4f, @location(0) p: vec3f, @location(1) uv: vec2f, @location(2) @interpolate(flat) k: vec2f };
const QU = array<vec2f, 6>(vec2f(0., 0.), vec2f(1., 0.), vec2f(1., 1.), vec2f(0., 0.), vec2f(1., 1.), vec2f(0., 1.));
const ST = array<vec2f, 4>(vec2f(-1., -1.), vec2f(1., -1.), vec2f(-1., 1.), vec2f(1., 1.));
// banner: 24 strips along the fly, waving in the wind
@vertex fn vsBan(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let b = BAN[ii]; let q = vi / 6u; let c = QU[vi % 6u];
  let uu = (f32(q) + c.x) / 24.; let vv = c.y;
  let t = u.cam.w;
  let wd = normalize(WIND + vec3f(0., 0., sin(t * .3 + b.w * 9.) * .2));
  let sd = normalize(cross(wd, vec3f(0., 1., 0.)));
  let wav = sin(uu * 7. - t * 6. + b.w * 30.) * .35 * uu + sin(uu * 13. - t * 9.) * .08 * uu;
  var o: VO; o.p = b.xyz + wd * uu * 3.6 + sd * wav + vec3f(0., -vv * 1.9 - uu * uu * .3, 0.);
  o.uv = vec2f(uu, vv); o.k = vec2f(wav, b.w); o.pos = u.vp * vec4f(o.p, 1.); return o;
}
@fragment fn fsBan(i: VO) -> @location(0) vec4f {
  // deep violet with a pale chevron and a swallow-tail
  if (i.uv.x > .82 && abs(i.uv.y - .5) < (i.uv.x - .82) * 2.4) { discard; }
  var al = vec3f(.16, .05, .2);
  let ch = abs(abs(i.uv.y - .5) * 1.4 - (i.uv.x - .3)) < .07;
  if (ch) { al = vec3f(.6, .58, .52); }
  let n = normalize(vec3f(.3, .2, 1.) + vec3f(cos(i.k.x * 3.), 0., 0.));
  let sh = shadowAt(i.p, vec3f(0., 1., 0.));
  let c = al * (u.sunc.rgb * (.35 + .65 * abs(dot(n, u.sun.xyz))) * sh + u.amb.rgb * .7) * (.8 + .4 * sin(i.k.x * 4.));
  return vec4f(aerial(c, i.p), 1.);
}
// smoke: puffs rise from each chimney, drift downwind, grow and fade
@vertex fn vsSmoke(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let s = ii / 14u; let k = f32(ii % 14u);
  let a = fract(u.cam.w * .045 + k / 14. + h21(vec2f(f32(s), 3.)));
  let base = SMK[s];
  let c = base + WIND * a * a * 30. + vec3f(sin(a * 6. + k) * 1.2, a * 22., cos(a * 5. + k) * 1.2);
  let sz = .6 + a * 5.;
  let co = ST[vi];
  var o: VO; o.p = c + (u.rt.xyz * co.x + u.up.xyz * co.y) * sz;
  o.uv = co; o.k = vec2f(a, k); o.pos = u.vp * vec4f(o.p, 1.); return o;
}
@fragment fn fsSmoke(i: VO) -> @location(0) vec4f {
  let r = length(i.uv); if (r > 1.) { discard; }
  let n = fbm2(i.uv * 1.7 + i.k.y * 3.1 + i.k.x * 2., 3);
  let a = ss(1., .2, r) * ss(.0, .08, i.k.x) * (1. - i.k.x) * .22 * ss(.3, .6, n);
  let c = vec3f(.7, .68, .66) * (u.sunc.rgb * .35 + u.amb.rgb * 1.2);
  return vec4f(aerial(c, i.p) * a, a);
}
// waterfall: stacked ribbons from the lip to the foot, streaks running down, mist at the bottom
@vertex fn vsFall(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let top = vec3f(${FALLS.slice(0, 3).map((v) => v.toFixed(1)).join(',')}); let bot = vec3f(${FALLS.slice(3).map((v) => v.toFixed(1)).join(',')});
  let co = ST[vi] * .5 + .5; let k = f32(ii);
  let w = 7.5 + k * .8; let dir = normalize(vec3f(bot.x - top.x, 0., bot.z - top.z)); let sd = vec3f(-dir.z, 0., dir.x);
  let y = co.y;
  // arc outward off the lip, then fall
  let p = mix(bot, top, y) + dir * (3. + (1. - y) * (1. - y) * 4. * (1. + k * .2)) + sd * (co.x - .5) * w * (1. + (1. - y) * .6) + dir * k * .3;
  var o: VO; o.p = p; o.uv = vec2f(co.x, y); o.k = vec2f(k, 0.); o.pos = u.vp * vec4f(p, 1.); return o;
}
@fragment fn fsFall(i: VO) -> @location(0) vec4f {
  let t = u.cam.w;
  let s = fbm2(vec2f(i.uv.x * 18. + i.k.x * 3., i.uv.y * 3. + t * 2.2), 3);
  let edge = ss(0., .25, i.uv.x) * ss(1., .75, i.uv.x);
  var a = ss(.3, .7, s) * edge * (.7 - i.k.x * .1) * ss(1., .95, i.uv.y);
  a += ss(.25, 0., i.uv.y) * .7 * edge * (.6 + .4 * fbm2(vec2f(i.uv.x * 9., u.cam.w * 1.5), 2));
  let c = vec3f(.8, .82, .85) * (u.sunc.rgb * .45 + u.amb.rgb);
  return vec4f(aerial(c, i.p) * a, a);
}
// rowing boats: a ten-triangle hull, bobbing and rolling on the swell
const BOATS = array<vec4f, 3>(vec4f(-126., 0., 172., .6), vec4f(-139., 0., 166., 2.1), vec4f(-318., 0., 306., 4.));
const HULL = array<vec3f, 30>(
  vec3f(2.2, .45, 0.), vec3f(1., .35, .65), vec3f(2., -.1, 0.),   vec3f(1., .35, .65), vec3f(-2., .35, .6), vec3f(2., -.1, 0.),   vec3f(-2., .35, .6), vec3f(-2., -.2, 0.), vec3f(2., -.1, 0.),
  vec3f(2.2, .45, 0.), vec3f(1., .35, -.65), vec3f(2., -.1, 0.),  vec3f(1., .35, -.65), vec3f(-2., .35, -.6), vec3f(2., -.1, 0.),  vec3f(-2., .35, -.6), vec3f(-2., -.2, 0.), vec3f(2., -.1, 0.),
  vec3f(-2., .35, .6), vec3f(-2., .35, -.6), vec3f(-2., -.2, 0.),
  vec3f(2.2, .4, 0.), vec3f(1., .3, .6), vec3f(1., .3, -.6),     vec3f(1., .3, .6), vec3f(-2., .3, .55), vec3f(-2., .3, -.55),   vec3f(1., .3, .6), vec3f(-2., .3, -.55), vec3f(1., .3, -.6));
@vertex fn vsBoat(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let b = BOATS[ii]; let t = u.cam.w + b.w * 3.;
  var q = HULL[vi] * 1.25;
  let roll = sin(t * 1.1) * .06; let pitch = sin(t * .8 + 1.) * .04;
  q = vec3f(q.x, q.y * cos(roll) + q.z * sin(roll), q.z * cos(roll) - q.y * sin(roll));
  q = vec3f(q.x * cos(pitch) - q.y * sin(pitch), q.x * sin(pitch) + q.y * cos(pitch), q.z);
  let cs = cos(b.w); let sn = sin(b.w);
  var o: VO; o.p = vec3f(b.x + cs * q.x - sn * q.z, b.y + q.y + sin(t * 1.3) * .06, b.z + sn * q.x + cs * q.z);
  o.uv = vec2f(q.x, q.y); o.k = vec2f(select(0., 1., vi >= 21u), 0.); o.pos = u.vp * vec4f(o.p, 1.); return o;
}
@fragment fn fsBoat(i: VO) -> @location(0) vec4f {
  var n = normalize(cross(dpdx(i.p), dpdy(i.p))); if (dot(n, u.cam.xyz - i.p) < 0.) { n = -n; }
  let pl = .8 + .2 * ss(.0, .08, abs(fract(i.uv.y * 6.) - .5));
  let al = select(vec3f(.22, .12, .06) * pl, vec3f(.1, .06, .035), i.k.x > .5);
  let c = lit(al, n, i.p, shadowAt(i.p, n), 1., .1, 20.);
  return vec4f(aerial(c, i.p), 1.);
}
// motes: warm points of light drifting along the shore below the castle
@vertex fn vsFly(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let h = vec3f(h21(vec2f(f32(ii), 1.)), h21(vec2f(f32(ii), 2.)), h21(vec2f(f32(ii), 3.)));
  let t = u.cam.w * (.2 + h.z * .2);
  // over the grass of the glen where the burn meets the loch, low above the ground
  var c = vec3f(140. + h.x * 90. + sin(t + h.y * 9.) * 3., 0., 40. + h.y * 150. + cos(t * .8 + h.z * 5.) * 3.);
  let g = vec2u(c.xz - ${CO}.); let gy = HC[g.x + g.y * CN];
  c.y = max(gy, 0.) + .5 + h.z * 1.8 + sin(t * 1.7 + h.x * 7.) * .4;
  let co = ST[vi];
  var o: VO; o.p = c + (u.rt.xyz * co.x + u.up.xyz * co.y) * .22;
  let on = ss(.5, 1., u.env.y) * select(1., 0., u.env2.y > 1.5 || u.env3.x > .5) * ss(.2, .8, gy);
  o.uv = co; o.k = vec2f(pow(.5 + .5 * sin(u.cam.w * (1.2 + h.x * 2.) + h.y * 40.), 3.) * on, 0.); o.pos = u.vp * vec4f(o.p, 1.); return o;
}
@fragment fn fsFly(i: VO) -> @location(0) vec4f {
  // a bright core in a soft green-gold halo
  let r = length(i.uv); let a = (exp(-r * r * 60.) * 8. + exp(-r * r * 6.) * .6) * i.k.x;
  return vec4f(vec3f(.8, 1., .35) * a, 0.);
}
`;

// ---------------------------------------------------------------- rain and snow: streaks or flakes in a box that travels with the camera
const W_PRECIP = S_G + /*wgsl*/`
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) a: f32 };
const B = vec3f(64., 40., 64.);
fn H0(p: vec2f) -> f32 { if (abs(p.x) < 1020. && abs(p.y) < 1020.) { let g = vec2u(p - ${CO}.); return HC[g.x + g.y * CN]; } return 0.; }
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let leaf = u.env3.x == 0.; let snow = u.env3.z > .5 || leaf; let t = u.cam.w; let fi = f32(ii);
  let h = vec3f(h21(vec2f(fi, 1.7)), h21(vec2f(fi, 9.3)), h21(vec2f(fi, 4.1)));
  let fall = select(select(9.5, 1.1 + .5 * h.y, snow), .9 + .4 * h.y, leaf);
  let wind = vec2f(1.8, .8) * u.env3.y * select(1., .6, snow);
  // anchored in the world (so they do not slide with the camera), wrapped into the box around it
  var p = h * B + vec3f(wind.x * t, -fall * t, wind.y * t);
  if (snow) { p += vec3f(sin(t * 1.3 + h.y * 20.), 0., cos(t * 1.1 + h.x * 17.)) * .6; }
  let o = u.cam.xyz - B * .5; var r = p - o; r -= B * floor(r / B); p = o + r;
  let vel = normalize(vec3f(wind.x, -fall, wind.y));
  let v = p - u.cam.xyz; let d = length(v);
  let side = normalize(cross(vel, v / max(d, 1e-3)));
  let c = vec2f(f32(vi & 1u) * 2. - 1., f32(vi >> 1u) * 2. - 1.);
  var q: vec3f;
  if (leaf) { let a = t * (2. + h.x * 3.) + h.z * 20.; q = p + (u.rt.xyz * c.x * cos(a) + u.up.xyz * c.y + vec3f(0., c.x * sin(a), 0.)) * .07; }
  else if (snow) { q = p + (u.rt.xyz * c.x + u.up.xyz * c.y) * .035; }
  else { q = p + side * c.x * .012 * (1. + d * .02) + vel * c.y * .35; }
  // gone below the ground
  var a = ss(1.8, 4.5, d) * ss(31., 22., d);
  if (abs(p.x) < 1020. && abs(p.z) < 1020.) { let g = vec2u(p.xz - ${CO}.); if (p.y < HC[g.x + g.y * CN]) { a = 0.; } }
  // leaves fall only near the trees, low down
  if (leaf) { a *= ss(60., 25., u.cam.y - H0(u.cam.xz)) * ss(28., 6., p.y - H0(p.xz)) * step(1., H0(p.xz)); }
  var out: VO; out.pos = u.vp * vec4f(q, 1.); out.uv = c; out.a = a * select(u.env3.x, 1., leaf);
  return out;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let snow = u.env3.z > .5;
  var a: f32; var col: vec3f;
  if (u.env3.x == 0.) { a = ss(1., .7, length(i.uv * vec2f(1., 1.6))); col = mix(vec3f(.5, .22, .04), vec3f(.62, .42, .08), fract(i.a * 37.)) * (u.amb.rgb + u.sunc.rgb * .5); }
  else if (snow) { a = ss(1., .3, length(i.uv)) * .9; col = (u.amb.rgb * 1.1 + u.sunc.rgb * .3) * .9; }
  else { a = (1. - abs(i.uv.x)) * ss(1., .4, abs(i.uv.y)) * .28; col = u.amb.rgb * .7 + u.sunc.rgb * .1 + vec3f(.02); }
  a *= i.a;
  return vec4f(col * a, a);
}
`;

// ---------------------------------------------------------------- animals: limbs swing about their pivots, heads dip to graze
const W_LIFE = S_G + /*wgsl*/`
struct VO { @builtin(position) pos: vec4f, @location(0) p: vec3f, @location(1) n: vec3f, @location(2) @interpolate(flat) m: u32, @location(3) ly: f32 };
fn rz(v: vec2f, a: f32) -> vec2f { let c = cos(a); let s = sin(a); return vec2f(c * v.x - s * v.y, s * v.x + c * v.y); }
@vertex fn vs(@location(0) pos: vec3f, @location(1) nm: vec4f, @location(2) uv: vec2f, @location(3) ia: vec4f, @location(4) ib: vec4f) -> VO {
  let limb = floor(uv.x / 10.); let piv = vec2f(uv.x - limb * 10. - 2., uv.y);
  let ph = ib.y * TAU; let walk = ib.z; let graze = ib.w;
  var q = pos; var n = nm.xyz;
  if (limb >= 1. && limb <= 4.) {
    // a trot: diagonal pairs together; a gallop (walk 2) swings harder with the front and back pairs apart
    let off = select(select(3.14159, 0., limb == 1. || limb == 4.), select(0., 3.14159, limb > 2.5) + select(0., .6, limb == 2. || limb == 4.), walk > 1.5);
    let a = sin(ph + off) * min(walk, 1.) * select(.4, .6, walk > 1.5);
    q = vec3f(piv + rz(q.xy - piv, a), q.z); n = vec3f(rz(n.xy, a), n.z);
  } else if (limb == 5.) {
    let a = -graze * 1.05 + sin(u.cam.w * .7 + ia.x) * .06 * (1. - graze) - sin(ph * 2.) * .05 * min(walk, 1.);
    q = vec3f(piv + rz(q.xy - piv, a), q.z); n = vec3f(rz(n.xy, a), n.z);
  }
  if (limb >= 6.) {
    // wings roll about the body's axis from the shoulder: a slight dihedral, beats when flapping (graze = flap depth)
    let sd = select(-1., 1., limb == 6.); let a = sd * (.1 + sin(ph * 6.) * graze * .7);
    let d = rz(vec2f(q.z - piv.x, q.y - piv.y), a); q = vec3f(q.x, d.y + piv.y, d.x + piv.x);
    let nn = rz(n.zy, a); n = vec3f(n.x, nn.y, nn.x);
  }
  q.y += abs(sin(ph)) * .06 * max(walk - 1., 0.);   // a bound at the gallop
  let c = cos(ia.w); let s = sin(ia.w);
  let w = vec3f(c * q.x - s * q.z, q.y, s * q.x + c * q.z) * ib.x;
  var o: VO; o.p = ia.xyz + w; o.n = vec3f(c * n.x - s * n.z, n.y, s * n.x + c * n.z); o.m = u32(round(nm.w * 127.)); o.ly = pos.y;
  o.pos = u.vp * vec4f(o.p, 1.); return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  var n = normalize(i.n); if (dot(n, u.cam.xyz - i.p) < 0.) { n = -n; }
  let g = fbm(i.p * 9., 2);
  var al = vec3f(.3); var sp = .05;
  switch i.m {
    case 30u: {
      // red deer: a darker back, a pale tawny belly, legs greying toward the hoof
      al = mix(vec3f(.24, .15, .09), vec3f(.15, .095, .06), ss(1.05, 1.3, i.ly));
      al = mix(al, vec3f(.36, .28, .19), ss(.92, .78, i.ly) * ss(.55, .7, i.ly));
      al = mix(al, vec3f(.13, .11, .09), ss(.55, .3, i.ly));
      al *= .85 + .3 * g; al = mix(al, al * vec3f(1.1, .9, .8), u.env2.x);
    }
    case 31u: { al = vec3f(.22, .18, .13); }
    case 32u: { al = vec3f(.6, .56, .48) * (.75 + .45 * g); }
    case 33u: { al = vec3f(.07, .06, .055); }
    case 34u: { al = vec3f(.82, .82, .8) * (.86 + .2 * g) * mix(.82, 1., ss(.05, .3, i.ly)); sp = .2; }
    case 35u: { al = vec3f(.75, .3, .05); }
    case 36u: { al = vec3f(.3, .22, .14) * (.8 + .4 * g); }
    case 38u: { al = vec3f(.15, .09, .045) * (.8 + .4 * g); }
    case 39u: { al = vec3f(.24, .155, .075) * (.8 + .4 * g); }
    case 40u: { al = mix(vec3f(.17, .055, .04), vec3f(.15, .12, .09), ss(.55, .8, fbm(i.p * 3., 2))) * (.85 + .3 * ss(.0, .06, abs(fract(i.ly * 9.) - .5))); sp = .15; }
    case 41u: { al = vec3f(.2, .13, .07) * (.75 + .3 * g) * (.8 + .2 * ss(.0, .05, abs(fract(i.ly * 7.) - .5))); }
    case 42u: { al = vec3f(.42, .3, .14) * (.85 + .3 * g); }
    case 43u: { al = vec3f(.3, .29, .27) * (.85 + .25 * g); }
    default: { al = vec3f(.04, .18, .1); sp = .4; }
  }
  let sh = shadowAt(i.p, n);
  let c = lit(al, n, i.p, sh, select(mix(.6, 1., ss(0., .9, i.ly)), 1., i.m >= 38u), sp, 20.);
  clipW(i.p);
  return vec4f(aerial(c, i.p), 1.);
}
`;
