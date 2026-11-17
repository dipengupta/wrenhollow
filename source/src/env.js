// ============================================================================
// times of day (and, later, seasons and weather): tables the renderer reads when the menu changes
// ============================================================================
// light: direction toward the sun (or the moon at night); its colour comes from the atmosphere, times scale and tint
// amb: sky light on surfaces; sky: brightness of the baked sky; expo: exposure; glow: lit windows; night: 0 day .. 1 night
// rays: strength of the sun shafts; grade: warm/violet colour grade amount
const TOD = [
  { name: 'Dawn', clock: 6.1, light: [0.86, 0.04, -0.5], scale: 1, tint: [1, 1, 1], amb: [0.2, 0.2, 0.31], sky: 1, expo: 1.75, glow: 0.8, night: 0, rays: 0.5, grade: 1 },
  { name: 'Morning', clock: 9.5, light: [0.7, 0.38, 0.6], scale: 1, tint: [1, 1, 1], amb: [0.8, 0.9, 1.2], sky: 1.7, expo: 0.5, glow: 0.12, night: 0, rays: 0.25, grade: 0.4 },
  { name: 'Afternoon', clock: 14.4, light: [-0.25, 0.75, 0.6], scale: 1, tint: [1, 1, 1], amb: [0.95, 1.07, 1.4], sky: 1.8, expo: 0.42, glow: 0.08, night: 0, rays: 0.15, grade: 0.3 },
  { name: 'Golden hour', clock: 18.7, light: [-0.64, 0.082, 0.765], scale: 1, tint: [1, 1, 1], amb: [0.3, 0.31, 0.46], sky: 1, expo: 1, glow: 1, night: 0, rays: 0.55, grade: 1 },
  { name: 'Dusk', clock: 20.6, light: [-0.78, -0.06, 0.62], scale: 1, tint: [1, 1, 1], amb: [0.06, 0.07, 0.13], sky: 1, expo: 3.2, glow: 0.8, night: 0.35, rays: 0, grade: 0.8 },
  { name: 'Night', clock: 23.2, light: [0.78, 0.3, -0.55], scale: 0.04, tint: [0.7, 0.85, 1.25], amb: [0.018, 0.024, 0.05], sky: 0.035, expo: 3.4, glow: 1.1, night: 1, rays: 0, grade: 0.3 },
];
const TODDEF = 3;
// the choices in the menu: the six times, then Flowing (the day passes on its own, about twelve minutes from dawn to dawn)
const TIMES = [...TOD, { name: 'Flowing' }], FLOWI = TOD.length;
// the starting time: ?time=night in the address, else the last one picked, else golden hour
let tod = (() => {
  const q = new URLSearchParams(location.search).get('time'), i = TIMES.findIndex((t) => t.name.toLowerCase().replace(' ', '') === (q || '').toLowerCase().replace(/[\s-]/g, ''));
  if (i >= 0) return i;
  let s; try { s = +localStorage.wrenhollowTime; } catch {}
  return s >= 0 && s < TIMES.length ? s : TODDEF;
})();

// seasons: snow cover on the ground, roofs and trees; phase: 0 spring, 1 summer, 2 autumn, 3 winter (foliage colours)
const SEASON = [
  { name: 'Spring', snow: 0, phase: 0 },
  { name: 'Summer', snow: 0, phase: 1 },
  { name: 'Autumn', snow: 0, phase: 2 },
  { name: 'Winter', snow: 1, phase: 3 },
];
// weather: cloud cover, how much direct sun gets through, wet surfaces, extra fog, precipitation (rain, or snow in winter), wind
const WEATHER = [
  { name: 'Clear', cover: 0, sun: 1, wet: 0, fog: 0, precip: 0, wind: 0.3 },
  { name: 'Cloudy', cover: 0.8, sun: 0.07, wet: 0, fog: 0.15, precip: 0, wind: 0.6 },
  { name: 'Rain', cover: 0.95, sun: 0.02, wet: 1, fog: 0.45, precip: 1, wind: 1 },
  { name: 'Fog', cover: 0.88, sun: 0.06, wet: 0.3, fog: 1, precip: 0, wind: 0.1 },
];
// the starting season and weather: ?season=winter&weather=rain, else the last ones picked, else summer and clear
const pick = (key, table, store, def) => {
  const q = (new URLSearchParams(location.search).get(key) || '').toLowerCase(), i = table.findIndex((t) => t.name.toLowerCase() === q || (key === 'weather' && q === 'snow' && t.name === 'Rain'));
  if (i >= 0) return i;
  let s; try { s = +localStorage[store]; } catch {}
  return s >= 0 && s < table.length ? s : def;
};
let season = pick('season', SEASON, 'wrenhollowSeason', 1), weather = pick('weather', WEATHER, 'wrenhollowWeather', 0);
// in winter the rain falls as snow
const weatherName = (i) => (i === 2 && SEASON[season].snow > 0.5 ? 'Snow' : WEATHER[i].name);

// the named places: where the map puts each label, the view you are taken to when you pick it, how near you must come
// for its name to appear (r, in metres) and the line shown under it
const PLACES = [
  { name: 'The Great Hall', tag: [-9, -2.6], at: [-44, 130, 59], view: [-160, 140, 165, -44, 125, 60], r: 45, sub: 'The long hall above the loch, its rose windows facing the water' },
  { name: 'Starwatch', tag: [1.5, -6.5], at: [43, 210, 8], view: [125, 205, 95, 43, 200, 8], r: 40, sub: 'The observatory tower, the highest point of the castle' },
  { name: 'The Bell Tower', tag: [-4, -4.2], at: [-52, 150, -19], view: [-52, 148, -48, -52, 147, -19], r: 35, sub: 'A clock on every face. It strikes the hours' },
  { name: "St Wren's Chapel", tag: [-8, -0.6], at: [-112, 90, 96], view: [-230, 95, 170, -112, 90, 96], r: 45, sub: 'A rose window over the west door, and a slender spire' },
  { name: 'The Glasshouse Bastion', tag: [4, 4.4], at: [-27, 50, 132], view: [-60, 70, 230, -27, 50, 135], r: 45, sub: 'Glasshouses behind the parapet of the south bastion' },
  { name: 'Wren Falls', tag: [7, 1], at: [194, 10, -41], view: [192, 11, -4, 194, 9, -40], r: 45, sub: 'The burn drops over a rock step into a dark pool' },
  { name: 'The Boathouse Stair', tag: [-4, 4.6], at: [-110, 5, 156], view: [-150, 12, 205, -110, 5, 156], r: 50, sub: 'The jetty at the foot of the crag, and the stair up the cliff' },
  { name: 'Corrie Gorge', tag: [5, 2.6], at: [198, 20, -20], view: [196, 18, 60, 190, 86, -86], r: 90, sub: 'Scree on its floor, and a burn running down to the loch' },
  { name: 'The Covered Bridge', tag: [5, -1.6], at: [202, 90, -86], view: [150, 100, -40, 202, 92, -86], r: 50, sub: 'A timber bridge on stone piers across the gorge' },
  { name: 'The Long Viaduct', at: [-30, 100, -210], view: [60, 92, -190, -30, 96, -215], r: 90, sub: 'The arched road north from the gatehouse, over the valley' },
  { name: 'Gate Lodge', at: [-30, 105, -340], view: [20, 115, -295, -30, 105, -340], r: 60, sub: 'Twin towers where the viaduct comes ashore' },
  { name: 'Loch Wren', at: [-300, 0, 420], view: [-360, 9, 330, 0, 125, -10], r: 300, sub: 'Deep water wrapping the crag on the south and the west' },
  { name: 'Inchkeld', at: [-470, 12, 560], view: [-380, 30, 475, -470, 12, 560], r: 90, sub: "A wooded island far out in the loch, the ferry's far landing" },
  { name: "Hart's Meadow", tag: [5, 2.4], at: [150, 13, 62], view: [110, 25, 110, 150, 13, 62], r: 80, sub: 'Open grass at the mouth of the gorge, where red deer graze' },
  { name: 'The Glen', at: [225, 20, -270], view: [185, 38, -190, 205, 20, -300], r: 130, sub: 'The valley where the burn runs out toward the village' },
  { name: 'Kilwren', at: [255, 25, -440], view: [205, 52, -340, 260, 26, -440], r: 130, sub: 'Cottages along a winding lane, a church, smoking chimneys' },
  { name: 'The Grey Stones', at: [640, 48, 262], view: [600, 58, 305, 640, 50, 262], r: 40, sub: 'Eleven standing stones, and one great stone lying down' },
  { name: 'The Cairn of Keld', tag: [4, 2.4], at: [675, 53, 242], view: [645, 58, 268, 675, 51, 244], r: 30, sub: 'A grassed burial mound, ringed with kerbstones' },
  { name: 'The Old Pine', tag: [-4, -2.4], at: [612, 52, 238], view: [585, 52, 262, 612, 50, 238], r: 25, sub: 'An ancient Scots pine with a wind-shaped crown' },
  { name: 'The Glen Mill', tag: [-7, -1.2], at: [208, 24, -285], view: [186, 27, -298, 205, 23, -285], r: 45, sub: 'A whitewashed mill, its wheel turning under the lade' },
  { name: 'Dun Corran', at: [-300, 58, -560], view: [-258, 66, -522, -300, 55, -560], r: 60, sub: 'An Iron Age broch, broken down on its southern side' },
  { name: 'Ardlach', tag: [4, 2.2], at: [-232, 44, -492], view: [-205, 50, -468, -232, 43, -492], r: 40, sub: 'A roofless croft, one gable still standing' },
  { name: 'The Crannog', tag: [-6, -0.8], at: [-330, 4, 699], view: [-298, 13, 672, -330, 3, 700], r: 40, sub: 'An Iron Age roundhouse raised on piles out in the water' },
  { name: "Fisher's Strand", tag: [4, 2], at: [-195, 3, 728], view: [-150, 15, 690, -198, 2, 730], r: 60, sub: 'A sandy cove, nets hung to dry, a boat drawn up' },
  { name: 'Blackmyre', at: [-590, 36, -222], view: [-540, 50, -178, -590, 34, -222], r: 60, sub: 'A farm on the western slopes, its stacks of hay and peat' },
  { name: 'Westerhill', at: [-822, 38, 152], view: [-872, 50, 112, -822, 36, 152], r: 60, sub: 'The farthest farm, where the sheep graze up to the forest' },
  { name: 'The Summer Shielings', at: [380, 75, -590], view: [362, 82, -566, 382, 73, -592], r: 50, sub: 'Turf-roofed huts on the high pasture, used in summer' },
  { name: 'Beacon Knowe', at: [310, 96, -70], view: [296, 99, -56, 310, 92, -70], r: 40, sub: 'A cairn on the rim of the gorge. Its fire burns after dark' },
  { name: 'The Walled Garden', tag: [-7, 2.6], at: [166, 16, 126], view: [138, 30, 92, 168, 14, 128], r: 45, sub: 'Beds of earth, a glasshouse, bee skeps and an orchard' },
  { name: 'Kilwren Kirkyard', tag: [6, 2.6], at: [292, 26, -445], view: [260, 38, -412, 292, 26, -447], r: 40, sub: 'Leaning headstones around the village church, and an old yew' },
];
