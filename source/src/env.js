// ============================================================================
// times of day (and, later, seasons and weather): tables the renderer reads when the menu changes
// ============================================================================
// light: direction toward the sun (or the moon at night); its colour comes from the atmosphere, times scale and tint
// amb: sky light on surfaces; sky: brightness of the baked sky; expo: exposure; glow: lit windows; night: 0 day .. 1 night
// rays: strength of the sun shafts; grade: warm/violet colour grade amount
const TOD = [
  { name: 'Dawn', light: [0.86, 0.04, -0.5], scale: 1, tint: [1, 1, 1], amb: [0.2, 0.2, 0.31], sky: 1, expo: 1.75, glow: 0.8, night: 0, rays: 0.5, grade: 1 },
  { name: 'Morning', light: [0.7, 0.38, 0.6], scale: 1, tint: [1, 1, 1], amb: [0.8, 0.9, 1.2], sky: 1.7, expo: 0.5, glow: 0.12, night: 0, rays: 0.25, grade: 0.4 },
  { name: 'Afternoon', light: [-0.25, 0.75, 0.6], scale: 1, tint: [1, 1, 1], amb: [0.95, 1.07, 1.4], sky: 1.8, expo: 0.42, glow: 0.08, night: 0, rays: 0.15, grade: 0.3 },
  { name: 'Golden hour', light: [-0.64, 0.082, 0.765], scale: 1, tint: [1, 1, 1], amb: [0.3, 0.31, 0.46], sky: 1, expo: 1, glow: 1, night: 0, rays: 0.55, grade: 1 },
  { name: 'Dusk', light: [-0.78, -0.06, 0.62], scale: 1, tint: [1, 1, 1], amb: [0.06, 0.07, 0.13], sky: 1, expo: 3.2, glow: 0.8, night: 0.35, rays: 0, grade: 0.8 },
  { name: 'Night', light: [0.78, 0.3, -0.55], scale: 0.04, tint: [0.7, 0.85, 1.25], amb: [0.018, 0.024, 0.05], sky: 0.035, expo: 3.4, glow: 1.1, night: 1, rays: 0, grade: 0.3 },
];
const TODDEF = 3;
// the starting time: ?time=night in the address, else the last one picked, else golden hour
let tod = (() => {
  const q = new URLSearchParams(location.search).get('time'), i = TOD.findIndex((t) => t.name.toLowerCase().replace(' ', '') === (q || '').toLowerCase().replace(/[\s-]/g, ''));
  if (i >= 0) return i;
  let s; try { s = +localStorage.wrenhollowTime; } catch {}
  return s >= 0 && s < TOD.length ? s : TODDEF;
})();
