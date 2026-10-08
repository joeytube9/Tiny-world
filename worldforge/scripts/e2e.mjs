// Browser end-to-end checks against the production build (dist/).
// Usage: npm run build && npm run e2e   → writes test-results/e2e-report.json + screenshots.
// Runs headless Chromium (SwiftShader software WebGL): this verifies behaviour,
// NOT real iPhone performance.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'test-results');
mkdirSync(out, { recursive: true });
if (!existsSync(join(dist, 'index.html'))) { console.error('Run npm run build first'); process.exit(1); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const requested = [];
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  requested.push(p);
  const f = join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(readFileSync(f));
}).listen(4399);
const URL = 'http://localhost:4399/';

const report = { environment: { browser: 'Chromium (Playwright 1.56, headless, SwiftShader software WebGL)', os: process.platform, node: process.version, note: 'Desktop/headless emulation; not a physical iPhone.' }, checks: [] };
const check = (name, ok, details = '') => { report.checks.push({ name, ok: !!ok, details }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${details ? ' — ' + details : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function newPage(viewport, { tutorial = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  if (!tutorial) await page.addInitScript(() => { try { localStorage.setItem('worldforge.pref.tutorialDone', 'true'); } catch (e) { /* */ } });
  return { context, page, errors };
}
const W = (page, fn, arg) => page.evaluate(fn, arg);

// CDP touch helper (real touch events → pointer events with pointerType "touch")
async function touch(page, cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
}
async function touchDrag(page, cdp, from, to, steps = 12) {
  await touch(page, cdp, 'touchStart', [from]);
  for (let i = 1; i <= steps; i++) { await touch(page, cdp, 'touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]); await page.waitForTimeout(16); }
  await touch(page, cdp, 'touchEnd', []);
}
async function pinch(page, cdp, c, d0, d1, steps = 12) {
  const pts = (d) => [[c[0] - d / 2, c[1]], [c[0] + d / 2, c[1]]];
  await touch(page, cdp, 'touchStart', pts(d0));
  for (let i = 1; i <= steps; i++) { await touch(page, cdp, 'touchMove', pts(d0 + ((d1 - d0) * i) / steps)); await page.waitForTimeout(16); }
  await touch(page, cdp, 'touchEnd', []);
}

// ---------------- 1. fresh launch (portrait) ----------------
{
  const { context, page, errors } = await newPage({ width: 390, height: 844 }, { tutorial: true });
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => window.WF && window.WF.world.bodies.length > 0, null, { timeout: 30000 });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(2500);
  const st = await W(page, () => ({ bodies: window.WF.world.bodies.map((b) => b.name), scene: window.WF.world.sceneKey, tut: !document.querySelector('.tutorial').classList.contains('hidden') }));
  check('Fresh launch opens Earth–Moon', st.scene === 'earthMoon' && st.bodies.join() === 'Earth,Moon', `${st.bodies.join(', ')} in ${loadMs} ms`);
  check('Tutorial appears on first launch', st.tut);
  await page.screenshot({ path: join(out, '01-launch-portrait.png') });
  await page.click('.tutorial .btn.small'); // skip
  const cdp = await context.newCDPSession(page);
  // touch orbit
  const yaw0 = await W(page, () => window.WF.app.renderer.cam.yaw);
  await touchDrag(page, cdp, [200, 500], [80, 470]);
  const yaw1 = await W(page, () => window.WF.app.renderer.cam.yaw);
  check('Touch: one-finger drag orbits the camera (View mode)', Math.abs(yaw1 - yaw0) > 0.2, `yaw ${yaw0.toFixed(2)} → ${yaw1.toFixed(2)}`);
  const d0 = await W(page, () => window.WF.app.renderer.cam.dist);
  await pinch(page, cdp, [195, 450], 100, 260);
  const d1 = await W(page, () => window.WF.app.renderer.cam.dist);
  check('Touch: pinch zooms', d1 < d0 * 0.8, `dist ${d0.toFixed(1)} → ${d1.toFixed(1)}`);
  // mouse controls
  const yawM0 = await W(page, () => window.WF.app.renderer.cam.yaw);
  await page.mouse.move(150, 400); await page.mouse.down(); await page.mouse.move(260, 420, { steps: 8 }); await page.mouse.up();
  const yawM1 = await W(page, () => window.WF.app.renderer.cam.yaw);
  await page.mouse.wheel(0, 400); await page.waitForTimeout(100);
  const d2 = await W(page, () => window.WF.app.renderer.cam.dist);
  check('Mouse: drag orbits and wheel zooms', Math.abs(yawM1 - yawM0) > 0.2 && d2 > d1, `yaw Δ ${(yawM1 - yawM0).toFixed(2)}, dist ${d1.toFixed(1)} → ${d2.toFixed(1)}`);
  // tap selects the Moon
  await W(page, () => { window.WF.app.setView('system'); window.WF.world.settings.orbitSpeed = 0; });
  await page.waitForFunction(() => window.WF.app.renderer.camSmooth.blend >= 1, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  const moonScreen = await W(page, () => { const m = window.WF.world.bodies[1]; const THREE = window.WF.app.renderer.camera.position.constructor; const p = window.WF.app.renderer.project(new THREE(...m.pos)); const pk = window.WF.app.renderer.pick(p.x, p.y); return { ...p, pick: pk.type + ':' + (pk.body ? pk.body.name : '') }; });
  await touch(page, cdp, 'touchStart', [[moonScreen.x, moonScreen.y]]); await page.waitForTimeout(60); await touch(page, cdp, 'touchEnd', []);
  await page.waitForTimeout(300);
  const sel = await W(page, () => window.WF.world.selected?.name);
  check('Tap selects a body (Moon in system view)', sel === 'Moon', `selected ${sel}; pick at (${moonScreen.x.toFixed(0)},${moonScreen.y.toFixed(0)}) = ${moonScreen.pick}`);
  await W(page, () => { window.WF.world.settings.orbitSpeed = 1; });
  await W(page, () => window.WF.app.select(1, true));
  await page.waitForTimeout(1200);
  // make room under the population cap so the dropper test is meaningful
  await W(page, () => { const b = window.WF.world.selected; b.agents.length = Math.min(b.agents.length, 20); });
  // brush mode: open Water tab, pick Pour water, 1-finger drag pours; 2 fingers move camera
  await page.click('.tab[data-id="water"]');
  await page.click('.panel .chip[data-id="pour"]');
  await page.click('.panel-head .icon-btn'); // close panel to expose the planet
  const mode = await page.textContent('.mode-text');
  check('Brush mode banner explains 1 finger vs 2 fingers', /1 finger applies/.test(mode) && /2 fingers move camera/.test(mode), mode);
  const src0 = await W(page, () => window.WF.world.selected.ledger.source);
  await touchDrag(page, cdp, [180, 430], [210, 450], 20);
  await page.waitForTimeout(400);
  const src1 = await W(page, () => window.WF.world.selected.ledger.source);
  const yawB0 = await W(page, () => window.WF.app.renderer.cam.yaw);
  const pinchStart = await W(page, () => window.WF.app.renderer.cam.dist);
  await pinch(page, cdp, [195, 450], 220, 120);
  const src2 = await W(page, () => window.WF.world.selected.ledger.source);
  const pinchEnd = await W(page, () => window.WF.app.renderer.cam.dist);
  check('Brush: one finger pours water onto the surface', src1 > src0, `poured ${(src1 - src0).toFixed(3)} u³`);
  check('Brush: two fingers control the camera without pouring', Math.abs(src2 - src1) < 1e-9 && pinchEnd > pinchStart, `dist ${pinchStart.toFixed(1)} → ${pinchEnd.toFixed(1)}`);
  await page.click('.view-btn');
  check('Quick return to View mode', (await page.textContent('.mode-text')).startsWith('VIEW'));
  // weather via UI: forced tornado tapped onto the planet centre
  await page.click('.tab[data-id="weather"]');
  await page.click('.panel .chip[data-id="tornado"]');
  await page.click('.panel .toggle >> text=Forced');
  await page.click('.panel-head .icon-btn');
  const storms0 = await W(page, () => window.WF.world.selected.storms.length);
  await touch(page, cdp, 'touchStart', [[195, 440]]); await touch(page, cdp, 'touchEnd', []);
  await page.waitForTimeout(400);
  const storms1 = await W(page, () => window.WF.world.selected.storms.map((s) => s.type));
  check('Weather: tap spawns a storm attached to the surface', storms1.length > storms0, storms1.join(','));
  // life dropper
  await page.click('.tab[data-id="life"]');
  await page.click('.panel .chip[data-id="2"] >> nth=1');
  await page.click('.panel-head .icon-btn');
  const ag0 = await W(page, () => window.WF.world.selected.agents.length);
  // tap until a suitable land spot accepts the animals
  let ag1 = ag0;
  for (const [x, y] of [[195, 440], [160, 400], [230, 480], [150, 480], [240, 400], [195, 360], [195, 520]]) {
    await touch(page, cdp, 'touchStart', [[x, y]]); await touch(page, cdp, 'touchEnd', []);
    await page.waitForTimeout(250);
    ag1 = await W(page, () => window.WF.world.selected.agents.length);
    if (ag1 > ag0) break;
  }
  const lastToast = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).slice(-1)[0] || '');
  check('Life: organism dropper places animals (or reports cap/habitat honestly)', ag1 > ag0 || /Cannot thrive|population cap/i.test(lastToast), `agents ${ag0} → ${ag1}; ${lastToast.slice(0, 90)}`);
  // orbit: add a moon via the Orbits panel
  await page.click('.tab[data-id="orbits"]');
  const nb0 = await W(page, () => window.WF.world.bodies.length);
  await page.click('.panel .chip[data-id="moon"] >> nth=0');
  const nb1 = await W(page, () => window.WF.world.bodies.length);
  check('Orbits: add a moon to the selected body', nb1 === nb0 + 1);
  // every panel opens; click non-destructive buttons and watch for errors
  const clicked = [];
  for (const tab of ['bodies', 'materials', 'water', 'weather', 'life', 'orbits', 'inspect', 'presets']) {
    await page.click(`.tab[data-id="${tab}"]`);
    await page.waitForTimeout(150);
    const n = await page.locator('.panel button').count();
    for (let i = 0; i < n; i++) {
      const b = page.locator('.panel button').nth(i);
      const txt = ((await b.textContent()) || '').trim();
      if (/Delete|Reset|Load|Import|Export|Save|✕|Tutorial|Settings|Duplicate|Apply|experiment|Undo|Redo|Disturb|Focus/i.test(txt)) continue;
      if (await b.locator('xpath=ancestor::div[contains(@class,"cards")]').count()) continue;
      if (!(await b.isVisible())) continue;
      await b.click({ timeout: 2000 }).catch(() => {});
      clicked.push(`${tab}:${txt.slice(0, 18)}`);
      await page.waitForTimeout(30);
    }
    await page.screenshot({ path: join(out, `02-panel-${tab}.png`) });
  }
  await page.click('.panel-head .icon-btn').catch(() => {});
  await W(page, () => window.WF.app.setTool('view'));
  check('All 8 tool panels open; non-destructive controls clicked without errors', errors.length === 0, `${clicked.length} controls clicked; errors: ${errors.slice(0, 3).join(' | ')}`);
  // layout: no horizontal overflow, tabs visible
  const lay = await W(page, () => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, tabs: document.querySelector('.tabs').getBoundingClientRect().bottom <= innerHeight + 1 }));
  check('Portrait layout: no horizontal overflow, tab bar on screen', lay.sw <= lay.iw && lay.tabs, JSON.stringify(lay));
  // recipe via UI: 1% rock / 99% water
  await page.click('.tab[data-id="materials"]');
  await page.click('.panel .btn >> text=1% rock / 99% water');
  await page.click('.panel .btn >> text=Apply recipe');
  const job = await W(page, () => { const j = window.WF.world.jobFor(window.WF.world.selected); return j && { target: j.target.water / j.totalVolume }; });
  check('Composition editor starts a 1%/99% recipe transition', job && Math.abs(job.target - 0.99) < 0.01, JSON.stringify(job));
  await page.click('.panel-head .icon-btn');
  await W(page, () => { window.WF.world.settings.surfaceSpeed = 16; });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(out, '03-recipe-transition.png') });
  // cutaway
  await W(page, () => window.WF.app.setView('cutaway'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, '04-cutaway.png') });
  check('No console errors during portrait session', errors.length === 0, errors.slice(0, 5).join(' | '));
  await context.close();
}

// ---------------- 2. landscape, scenes, saves ----------------
{
  const { context, page, errors } = await newPage({ width: 844, height: 390 });
  await page.goto(URL);
  await page.waitForFunction(() => window.WF && window.WF.world.bodies.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, '05-launch-landscape.png') });
  const lay = await W(page, () => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check('Landscape layout: no horizontal overflow', lay.sw <= lay.iw, JSON.stringify(lay));
  const expected = { earthMoon: 2, sunEarthMoon: 3, saturn: 4, solar: 7, mars: 2, floodLab: 1, stormWorld: 1, blank: 0 };
  for (const [k, n] of Object.entries(expected)) {
    await W(page, () => window.WF.app.openPanel('presets'));
    await W(page, () => { window.WF.app.dirty = false; });
    await page.click(`.cards .card:has-text("${{ earthMoon: 'Earth–Moon', sunEarthMoon: 'Sun–Earth–Moon', saturn: 'Saturn', solar: 'Solar neighborhood', mars: 'Terraform Mars', floodLab: 'Flood Lab', stormWorld: 'Storm World', blank: 'Blank Forge' }[k]}") >> nth=0`);
    await page.waitForFunction((key) => window.WF.world.sceneKey === key, k, { timeout: 30000 });
    await page.waitForTimeout(1800);
    const st = await W(page, () => ({ n: window.WF.world.bodies.length, views: window.WF.app.renderer.views.size, scene: window.WF.world.sceneKey }));
    check(`Scene "${k}" loads with ${n} bodies and no hidden leftovers`, st.n === n && st.views === n, JSON.stringify(st));
    await page.screenshot({ path: join(out, `06-scene-${k}.png`) });
  }
  // save / reload / export / import on Storm World
  await W(page, () => window.WF.app.openPanel('presets'));
  await W(page, () => { window.WF.app.dirty = false; });
  await page.click('.cards .card:has-text("Storm World")');
  await page.waitForFunction(() => window.WF.world.sceneKey === 'stormWorld');
  await page.waitForTimeout(1500);
  await W(page, () => { const w = window.WF.world; w.applyBrush({ id: 'raise', size: 0.2, strength: 1, material: 'granite' }, { bodyId: w.selectedId, dir: [0, 1, 0] }, 1); w.settings.paused = true; });
  const snap = await W(page, () => { const w = window.WF.world; const b = w.selected; return { storms: b.storms.length, agents: b.agents.length, bed: Array.from(b.surface.bed.slice(0, 50)), inv: b.inv, t: w.time.surface }; });
  await W(page, () => window.WF.app.openPanel('presets'));
  await page.fill('.panel .name-input', 'e2e-save');
  await page.click('.panel .btn >> text=Save');
  await page.waitForTimeout(800);
  const dl = page.waitForEvent('download');
  await page.click('.panel .btn >> text=Export JSON');
  const download = await dl;
  const exportPath = join(out, 'export.json');
  await download.saveAs(exportPath);
  // reload the page and load the named save
  await page.reload();
  await page.waitForFunction(() => window.WF && window.WF.world.bodies.length > 0);
  await W(page, () => window.WF.app.openPanel('presets'));
  await page.waitForTimeout(500);
  await page.click('.save-item:has-text("e2e-save") .btn >> text=Load');
  await page.waitForTimeout(800);
  const viaUi = await W(page, () => ({ scene: window.WF.world.sceneKey, name: window.WF.world.selected?.name }));
  check('Load button restores the named save after a page reload', viaUi.scene === 'stormWorld' && viaUi.name === 'Tempest', JSON.stringify(viaUi));
  // strict comparison: load and read in the same task, before any further simulation step
  const after = await page.evaluate(async () => { await window.WF.app.loadNamed('e2e-save'); const w = window.WF.world; const b = w.selected; return { storms: b.storms.length, agents: b.agents.length, bed: Array.from(b.surface.bed.slice(0, 50)), inv: b.inv, t: w.time.surface, scene: w.sceneKey, savedT: null }; });
  check('Save → reload → load restores terrain, inventories, storms, life and time exactly', after.scene === 'stormWorld' && JSON.stringify(after.bed) === JSON.stringify(snap.bed) && JSON.stringify(after.inv) === JSON.stringify(snap.inv) && after.storms === snap.storms && after.agents === snap.agents && after.t === snap.t, `t ${after.t.toFixed(2)} vs ${snap.t.toFixed(2)}, storms ${after.storms}/${snap.storms}, agents ${after.agents}/${snap.agents}`);
  await W(page, () => { window.WF.app.dirty = false; window.WF.app.loadScene('earthMoon'); });
  await page.waitForTimeout(1500);
  await W(page, () => window.WF.app.openPanel('presets'));
  await page.setInputFiles('.panel input[type=file]', exportPath);
  await page.waitForTimeout(1500);
  const imp = await W(page, () => ({ scene: window.WF.world.sceneKey, n: window.WF.world.bodies.length }));
  check('Export JSON → Import JSON round trip', imp.scene === 'stormWorld' && imp.n === 1, JSON.stringify(imp));
  // invalid import is rejected with a message, world intact
  writeFileSync(join(out, 'bad.json'), JSON.stringify({ format: 'worldforge-save', version: 1, bodies: [{ type: 'terrestrial', id: 1, pos: [0, 'x', 0] }] }));
  await page.setInputFiles('.panel input[type=file]', join(out, 'bad.json'));
  await page.waitForTimeout(800);
  const bad = await W(page, () => ({ n: window.WF.world.bodies.length, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' ') }));
  check('Invalid import rejected with a message; world untouched', bad.n === 1 && /rejected/i.test(bad.toast), bad.toast.slice(0, 120));
  check('No console errors during landscape session', errors.length === 0, errors.slice(0, 5).join(' | '));
  await context.close();
}

// ---------------- 3. offline after first load (service worker) ----------------
{
  const { context, page, errors } = await newPage({ width: 390, height: 844 });
  await page.goto(URL);
  await page.waitForFunction(() => window.WF && window.WF.world.bodies.length > 0);
  const swReady = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  const ok = await page.waitForFunction(() => window.WF && window.WF.world.bodies.length > 0, null, { timeout: 20000 }).then(() => true).catch(() => false);
  check('Offline reload after first visit (service worker cache)', swReady && ok, `sw active ${swReady}`);
  await context.setOffline(false);
  const external = requested.filter((p) => /^https?:/.test(p));
  check('All assets served from the local bundle', external.length === 0 && !errors.some((e) => /requestfailed/.test(e) && !/offline/i.test(e)), `${new Set(requested).size} local paths`);
  await context.close();
}

// ---------------- 4. visibility/background: no catch-up jump ----------------
{
  const { context, page } = await newPage({ width: 390, height: 844 });
  await page.goto(URL);
  await page.waitForFunction(() => window.WF && window.WF.world.bodies.length > 0);
  await page.waitForTimeout(1000);
  const before = await W(page, () => ({ t: window.WF.world.time.orbit, p: window.WF.world.bodies[1].pos.slice() }));
  // simulate a long background: freeze rAF time by jumping performance clock
  await W(page, () => { window.WF.app.last -= 3600 * 1000; });
  await page.waitForTimeout(200);
  const after = await W(page, () => ({ t: window.WF.world.time.orbit, p: window.WF.world.bodies[1].pos.slice() }));
  const jump = Math.hypot(...after.p.map((x, k) => x - before.p[k]));
  check('Resume after a long gap does not launch bodies', after.t - before.t < 2 && jump < 5, `orbit time +${(after.t - before.t).toFixed(2)} s, moon moved ${jump.toFixed(2)} u`);
  await context.close();
}

// ---------------- 5. mixed stress scene ----------------
for (const quality of ['low', 'medium']) {
  const { context, page, errors } = await newPage({ width: 390, height: 844 });
  await page.addInitScript((q) => { try { localStorage.setItem('worldforge.pref.settings', JSON.stringify({ quality: q, popCap: 160 })); } catch (e) { /* */ } }, quality);
  await page.goto(URL);
  await page.waitForFunction(() => window.WF && window.WF.world.bodies.length > 0);
  await W(page, () => {
    const { app, world } = window.WF;
    const e = world.bodies[0];
    for (const k of ['moon', 'rocky', 'frozen']) world.spawnBody(k, { parentId: e.id });
    world.settings.stormForced = true;
    const s = e.surface;
    let ocean = -1, land = -1;
    s.computeHeads();
    for (let i = 0; i < s.count; i++) { const d = s.head[i] - s.ground[i]; if (ocean < 0 && d > 0.15 && Math.abs(s.grid.lat[i] - 0.3) < 0.1) ocean = i; if (land < 0 && d < 0.002 && Math.abs(s.grid.lat[i]) < 0.5) land = i; }
    if (ocean < 0 || land < 0) throw new Error('stress setup: no ocean/land cell found');
    const dir = (c) => [s.grid.dir[c * 3], s.grid.dir[c * 3 + 1], s.grid.dir[c * 3 + 2]];
    world.tapTool({ id: 'weather', weather: 'hurricane', intensity: 1, duration: 600, area: 1, speed: 0 }, { bodyId: e.id, dir: dir(ocean) });
    world.tapTool({ id: 'weather', weather: 'tornado', intensity: 1, duration: 600, area: 1, speed: 1, heading: 1 }, { bodyId: e.id, dir: dir(land) });
    world.experiment = { bodyId: e.id, dir: dir(land), radius: 0.08, rate: 2, until: 1e9 };
    // fill the explicit population cap
    let guard = 0;
    while (e.agents.length < world.settings.popCap && guard++ < 4000) {
      const sp = guard % 6;
      const d = [Math.sin(guard * 1.7), Math.cos(guard * 0.9), Math.sin(guard * 2.3)];
      world.tapTool({ id: 'animal', species: sp, group: 3 }, { bodyId: e.id, dir: d });
    }
    app.select(e.id, true);
    world.settings.surfaceSpeed = 2;
    app.ui.showDiag(true);
  });
  await page.waitForTimeout(3000);
  // main-thread JS cost (independent of the software GPU): CDP sampling profiler busy time
  const cdpP = await context.newCDPSession(page);
  await cdpP.send('Profiler.enable');
  await cdpP.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdpP.send('Profiler.start');
  const m = await page.evaluate(() => new Promise((res) => {
    const times = [];
    let last = performance.now();
    const t0 = last;
    function f(t) { times.push(t - last); last = t; if (t - t0 < 12000) requestAnimationFrame(f); else res(times); }
    requestAnimationFrame(f);
  }));
  const { profile } = await cdpP.send('Profiler.stop');
  let busy = 0, all = 0;
  const idle = new Set(profile.nodes.filter((n) => n.callFrame.functionName === '(idle)').map((n) => n.id));
  profile.samples.forEach((id, i) => { all += profile.timeDeltas[i] || 0; if (!idle.has(id)) busy += profile.timeDeltas[i] || 0; });
  const sorted = [...m].sort((a, b) => a - b);
  const fps = (m.length / m.reduce((a, b) => a + b, 0)) * 1000;
  const stats = await W(page, () => { const { app, world } = window.WF; const r = app.renderer.statsAll(); const e = world.bodies[0]; return { bodies: world.bodies.length, agents: e.agents.length, cap: world.settings.popCap, storms: e.storms.map((s) => s.type), particles: r.particles, calls: r.calls, tris: r.triangles, plants: r.plants, cells: e.surface.count, waterErr: world.conservation(e).waterError, jsMs: app.frameMs, pr: app.renderer.renderer.getPixelRatio() }; });
  // JS cost per 60 fps frame with the GL draw call stubbed out (simulation + scene/mesh/life updates)
  const jsOnly = await W(page, () => {
    const { app, world } = window.WF;
    const r = app.renderer;
    const orig = r.renderer.render;
    r.renderer.render = () => {};
    const times = [];
    for (let i = 0; i < 180; i++) {
      const t0 = performance.now();
      world.step(1 / 60);
      r.render(1 / 60, world.transient);
      app.ui.updateLabels();
      times.push(performance.now() - t0);
    }
    r.renderer.render = orig;
    times.sort((a, b) => a - b);
    return { mean: times.reduce((a, b) => a + b, 0) / times.length, p50: times[90], p95: times[171] };
  });
  const busyPct = (100 * busy) / Math.max(1, all);
  const jsPerFrame = busy / 1000 / Math.max(1, m.length);
  report[`stress_${quality}`] = { jsPerFrameMsExcludingGpu: { mean: +jsOnly.mean.toFixed(2), p50: +jsOnly.p50.toFixed(2), p95: +jsOnly.p95.toFixed(2) }, fpsSoftwareGL: +fps.toFixed(1), frameMsMedian: +sorted[Math.floor(sorted.length / 2)].toFixed(1), frameMsP95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1), mainThreadBusyPct: +busyPct.toFixed(1), mainThreadJsMsPerFrame: +jsPerFrame.toFixed(2), frameMsIncludingGpuWait: +stats.jsMs.toFixed(1), ...stats };
  check(`Stress scene (${quality}) runs: ${stats.bodies} bodies, hurricane+tornado, flowing water, ${stats.agents}/${stats.cap} animals, finite conservation`, stats.agents >= stats.cap * 0.9 && stats.storms.includes('hurricane') && stats.storms.includes('tornado') && Number.isFinite(stats.waterErr) && stats.waterErr < 1e-5 && errors.length === 0, `JS ${jsOnly.mean.toFixed(1)} ms/frame mean (p95 ${jsOnly.p95.toFixed(1)}) excluding GPU; ${fps.toFixed(1)} FPS on software WebGL; ${stats.calls} draw calls, ${(stats.tris / 1000).toFixed(0)}k triangles`);
  await page.screenshot({ path: join(out, `07-stress-${quality}.png`) });
  await context.close();
}

await browser.close();
server.close();
report.passed = report.checks.filter((c) => c.ok).length;
report.failed = report.checks.filter((c) => !c.ok).length;
writeFileSync(join(out, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log(`\n${report.passed} passed, ${report.failed} failed. Report: test-results/e2e-report.json`);
process.exit(report.failed ? 1 : 0);
