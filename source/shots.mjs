// Drives the installed Chrome (headless by default; WebGPU still runs on the real GPU) against ../dev.html.
//   node shots.mjs poses [dir] [scale]      the six viewpoints as PNGs (scale 1 = 3456x2234, 0.5 = 1728x1117)
//   node shots.mjs look x y z tx ty tz name [dir]   one custom view
//   node shots.mjs fly [dir] [n]             n frames spread over the 60 s flight, plus bursts of consecutive frames
//   node shots.mjs eval 'js expression'      evaluate in the page (e.g. dev.grid(...)) and print the result
//   node shots.mjs bench [dir]               the 60 s benchmark flight at the target resolution floor, report as JSON
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [mode = 'poses', ...args] = process.argv.slice(2);
const outDir = (i) => { const d = path.resolve(args[i] || path.join(here, '..', 'shots')); mkdirSync(d, { recursive: true }); return d; };
// The tests never take over the screen. Screenshots run headless (the GPU still renders). The benchmark needs a real
// window for true frame pacing, so it starts a separate Chrome (its own temporary profile) in the background with
// `open -g`, which does not take focus, with its window parked off-screen. SHOW=1 runs everything in a visible window.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
const show = process.env.SHOW === '1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const flags = ['--enable-unsafe-webgpu', '--enable-features=WebGPUDeveloperFeatures', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--allow-file-access-from-files'];
const viewport = { width: 1728, height: 1117, deviceScaleFactor: 2 };
let browser;
if ((mode === 'bench' || mode === 'bgeval' || mode === 'prof') && !show) {
  const port = 9300 + (process.pid % 500), dir = mkdtempSync(path.join(os.tmpdir(), 'wrenhollow-bench-'));
  execFileSync('open', ['-g', '-n', '-a', 'Google Chrome', '--args', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--window-position=-4000,0', '--window-size=1760,1200', ...flags]);
  for (let i = 0; i < 100 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: viewport }); } catch { await new Promise((r) => setTimeout(r, 200)); } }
  // when this script ends, that Chrome and its temporary profile go too
  process.on('exit', () => { try { execFileSync('pkill', ['-f', dir]); } catch {} try { rmSync(dir, { recursive: true, force: true }); } catch {} });
} else {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: !show, args: [...flags, '--window-size=1760,1200'], defaultViewport: viewport });
}
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('file://' + path.join(here, '..', process.env.PAGE || 'dev.html'));
if (mode === 'release') { await page.waitForFunction(() => document.body.className === 'm', { timeout: 120000 }); await new Promise((r) => setTimeout(r, 3000)); await page.screenshot({ path: path.resolve(args[0] || 'release.png') }); console.log('release ok, errors:', errs.length); await browser.close(); process.exit(0); }
try { await page.waitForFunction(() => window.dev && document.body.className === 'm', { timeout: 120000, polling: 250 }); }
catch { console.log('did not load', await page.evaluate(() => document.getElementById('s').textContent), errs.join('\n')); await browser.close(); process.exit(1); }
await page.evaluate(() => { dev.hide(); document.getElementById('i').textContent = ''; });
if (process.env.TIME) await page.evaluate((t) => dev.time(t), +process.env.TIME);
if (process.env.CALM) await page.evaluate(() => dev.calm());
if (process.env.SEASON) await page.evaluate((t) => dev.season(t), +process.env.SEASON);
if (process.env.WEATHER) await page.evaluate((t) => dev.weather(t), +process.env.WEATHER);
if (process.env.PRE) await page.evaluate(process.env.PRE);
if (process.env.FLOW) await page.evaluate((v) => dev.flow(...v), process.env.FLOW.split(',').map(Number));
await new Promise((r) => setTimeout(r, 1500));
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = async (file) => { await frames(8); await page.screenshot({ path: file, type: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: file.endsWith('.jpg') ? 92 : undefined }); };
const setScale = (s) => page.evaluate((p) => dev.setPix(p), Math.round(3456 * 2234 * s * s));

if (mode === 'poses') {
  const d = outDir(0), s = +(args[1] || 1); await setScale(s); await page.evaluate(() => dev.freeze(30));
  await frames(60);
  for (let i = 0; i < 6; i++) { await page.evaluate((i) => { dev.pose(i); dev.hide(); }, i); await frames(30); await shot(path.join(d, `pose${i + 1}.png`)); }
} else if (mode === 'follow') {
  // ride with the eagle for a few seconds, then a frame
  const d = outDir(0); await setScale(0.5); await page.evaluate(() => dev.follow()); await new Promise((r) => setTimeout(r, 6000)); await shot(path.join(d, `${args[1] || 'follow'}.png`));
} else if (mode === 'animal') {
  // node shots.mjs animal kind distance name [dir]
  const d = outDir(3); await setScale(0.5); await page.evaluate((k, r) => dev.animal(k, r), +args[0], +args[1]); await frames(20); await shot(path.join(d, `${args[2] || 'animal'}.png`));
} else if (mode === 'atlas') {
  // a clean full-resolution map render and the label positions, for the atlas page
  const d = outDir(0); await setScale(1); await page.evaluate(() => dev.pose(0)); const labels = await page.evaluate(() => dev.mapClean()); await frames(40);
  await page.screenshot({ path: path.join(d, 'atlas.jpg'), type: 'jpeg', quality: 86 }); writeFileSync(path.join(d, 'atlas.json'), labels); console.log(labels);
} else if (mode === 'map') {
  // the in-game map, after flying to pose 1 (so the 'you are here' arrow has somewhere to be)
  const d = outDir(0); await setScale(0.5); await page.evaluate(() => { dev.pose(0); dev.map(); }); await frames(30); await shot(path.join(d, `${args[1] || 'map'}.png`));
} else if (mode === 'eval' || mode === 'bgeval') {
  console.log(await page.evaluate(args[0]));
} else if (mode === 'look') {
  const d = outDir(7); await setScale(0.5); await page.evaluate((t) => dev.freeze(t), +(process.env.FREEZE || 30));
  await page.evaluate((a) => { dev.look(...a); dev.hide(); }, args.slice(0, 6).map(Number)); await frames(20);
  if (process.env.TITLES) { await page.evaluate(() => dev.titles(true)); await new Promise((r) => setTimeout(r, 2200)); } await shot(path.join(d, `${args[6] || 'look'}.png`));
} else if (mode === 'fly') {
  const d = outDir(0), n = +(args[1] || 24); await setScale(0.5);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n * 60; await page.evaluate((t) => { dev.freeze(t); dev.flyTo(t); }, t); await shot(path.join(d, `fly${String(i).padStart(2, '0')}.jpg`)); }
  // bursts: 6 consecutive frames 1/60 s apart at three moments, to see shimmer and popping
  for (const t0 of [12, 31, 47]) for (let k = 0; k < 6; k++) { const t = t0 + k / 60; await page.evaluate((t) => { dev.freeze(t); dev.flyTo(t); }, t); await shot(path.join(d, `burst${t0}_${k}.jpg`)); }
} else if (mode === 'prof') {
  // GPU ms per pose with each pass left out in turn
  await setScale(0.5);
  const names = ['all', 'refl', 'castle', 'terrain', 'water', 'trees', 'sky', 'precip'];
  // node shots.mjs prof [t1,t2,...]: profile at those flight times instead of the six poses
  const at = args[0] ? args[0].split(',').map(Number) : [0, 1, 2, 3, 4, 5];
  for (const i of at) {
    await page.evaluate((i, fly) => { dev.freeze(fly ? i : 30); if (fly) dev.flyTo(i); else dev.pose(i); }, i, !!args[0]); const row = [];
    for (let k = 0; k < names.length; k++) { await page.evaluate((k) => dev.mask(k ? 1 << (k - 1) : 0), k); await frames(10); row.push((await page.evaluate(() => dev.gpu(30))).toFixed(1)); }
    console.log((args[0] ? `t=${i} ` : `pose${i + 1} `) + names.map((n, k) => `${n} ${row[k]}`).join('  '));
  }
} else if (mode === 'check') {
  console.log(JSON.stringify(await page.evaluate(() => dev.checkFly())));
} else if (mode === 'bench') {
  const d = outDir(0); await setScale(0.5);
  const rep = await page.evaluate(() => dev.bench());
  const fm = (o) => o && `avg ${o.avg.toFixed(2)} ms, p99 ${o.p99.toFixed(2)} ms, max ${o.max.toFixed(2)} ms (${o.n} samples)`;
  console.log(`resolution ${rep.res.join('x')}\nframe ${fm(rep.frame)}\nGPU   ${fm(rep.gpu) || 'no timestamps'}`);
  writeFileSync(path.join(d, 'bench.json'), JSON.stringify(rep));
}
if (errs.length) console.log('console:\n' + [...new Set(errs)].slice(0, 20).join('\n'));
await browser.close();
