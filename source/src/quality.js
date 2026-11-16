// ============================================================================
// quality level, chosen before anything is built
// ============================================================================
// LV: 0 High, 1 Medium, 2 Low. Medium halves the trees and the shadow map; Low also drops anti-aliasing, the
// reflection resolution and the cloud detail.
// localStorage.wrenhollow = "level,pixels,detail". wrenhollowLoad is set while the world is built: still set on the next
// visit means that load crashed the tab, so this one runs a level lower.
const mob = matchMedia('(pointer:coarse)').matches, mem = navigator.deviceMemory;
const keep = (k, v) => { try { localStorage[k] = v; } catch {} };
let SV = [], LV, bad;
try { SV = (localStorage.wrenhollow || '').split(','); bad = localStorage.wrenhollowLoad; } catch {}
LV = SV[0] ? +SV[0] : mob ? (mem > 7 ? 1 : 2) : mem <= 4 ? 2 : 0;
if (bad && LV < 2) { SV = [++LV]; keep('wrenhollow', LV); }
const THIN = 1 << LV, SHADOW = LV ? 2048 : 4096, AA = LV > 1 ? 1 : 4, REFL = LV > 1 ? 0.35 : 0.45, CLOUDN = LV > 1 ? 3 : 5;
