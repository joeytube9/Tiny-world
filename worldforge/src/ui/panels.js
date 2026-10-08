// Tool-category panels. Each returns { el, refresh } — refresh runs ~4 Hz while open.
import { h, slider, toggle, chips, section, btn, fmtNum, pct } from './dom.js';
import { BODY_PRESETS, SCENES } from '../sim/presets.js';
import { STORM_TYPES } from '../sim/storms.js';
import { PLANT_TYPES, SPECIES, BIOMES } from '../sim/life.js';
import { MATERIALS, RECIPE_KEYS, KEY_TO_MAT } from '../sim/materials.js';
import { orbitalElements } from '../sim/orbits.js';
import { GOALS } from '../sim/goals.js';
import { starColor } from '../sim/body.js';

const deg = (r) => (r * 180) / Math.PI;

export function tempStr(app, c) {
  const u = app.world.settings.units;
  if (u === 'F') return (c * 9 / 5 + 32).toFixed(0) + '°F';
  if (u === 'K') return (c + 273.15).toFixed(0) + ' K';
  return c.toFixed(0) + '°C';
}

function toolHint(text) {
  return h('p', { class: 'hint' }, text);
}

function brushControls(app) {
  return h('div', { class: 'row2' },
    slider({ label: 'Brush size', min: 0.03, max: 0.6, step: 0.01, value: app.tool.size, fmt: (v) => (v * app.unitRadius()).toFixed(2) + ' u', oninput: (v) => { app.tool.size = v; } }),
    slider({ label: 'Strength', min: 0.05, max: 1, step: 0.01, value: app.tool.strength, fmt: (v) => (v * 100).toFixed(0) + '%', oninput: (v) => { app.tool.strength = v; } }),
  );
}

// ---------------- Bodies ----------------
export function bodiesPanel(app) {
  const el = h('div', { class: 'panel-inner' });
  const list = h('div', { class: 'body-list' });
  const detail = h('div');
  let lastSel = null, lastCount = -1;
  function renderList() {
    list.innerHTML = '';
    for (const b of app.world.bodies) {
      const icon = b.type === 'star' ? '☀️' : b.type === 'gas' ? '🪐' : b.kind === 'moon' ? '🌑' : b.kind === 'ocean' ? '🌊' : b.kind === 'lava' ? '🌋' : b.kind === 'frozen' ? '🧊' : '🌍';
      const sel = b.id === app.world.selectedId;
      const badge = b.type === 'terrestrial' ? (sel ? 'detailed sim' : 'coarse sim') : b.type;
      list.appendChild(h('button', { class: 'body-item' + (sel ? ' on' : ''), onclick: () => app.select(b.id, true) }, h('span', { class: 'bi-icon' }, icon), h('span', { class: 'bi-name' }, b.name), h('span', { class: 'badge' + (sel ? ' hot' : '') }, badge)));
    }
    list.appendChild(h('button', { class: 'body-item add', onclick: () => app.openPanel('presets', 'bodies') }, h('span', { class: 'bi-icon' }, '＋'), h('span', { class: 'bi-name' }, 'Add body…')));
  }
  function renderDetail() {
    detail.innerHTML = '';
    const b = app.world.selected;
    if (!b) { detail.appendChild(toolHint('No body selected. Use Presets → Bodies to forge your first world.')); return; }
    const name = h('input', { class: 'name-input', value: b.name, maxlength: 30 });
    name.addEventListener('change', () => { b.name = name.value.trim() || b.name; renderList(); app.ui.refreshTop(); });
    detail.appendChild(section('Selected body', h('div', { class: 'row' }, name, btn('🎯 Focus', () => app.renderer.focusBody(b, 'planet')), btn('⧉ Duplicate', () => app.duplicateBody(b)), btn('🗑 Delete', () => app.deleteBody(b), 'danger')), (detail.info = h('div', { class: 'kv' }))));
    if (b.type === 'terrestrial') {
      const s = b.surface;
      detail.appendChild(section('Shape & spin',
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Terrain seed'), (detail.seed = h('input', { type: 'number', value: b.seed, class: 'num' })), btn('🎲', () => { detail.seed.value = Math.floor(Math.random() * 99999); app.regenerateTerrain(b, +detail.seed.value, b.roughness); }), btn('Apply seed', () => app.regenerateTerrain(b, +detail.seed.value, b.roughness))),
        slider({ label: 'Terrain roughness', min: 0.2, max: 2.5, step: 0.05, value: b.roughness, onchange: (v) => app.regenerateTerrain(b, b.seed, v) }),
        slider({ label: 'Size (target radius)', min: 1, max: 20, step: 0.1, value: Math.cbrt((3 * b.condensedVolume()) / (4 * Math.PI)), fmt: (v) => v.toFixed(1) + ' u', onchange: (v) => app.resizeBody(b, v), hint: 'transition' }),
        slider({ label: 'Spin period', min: 20, max: 1200, step: 5, value: Math.abs(b.spinPeriod), fmt: (v) => v.toFixed(0) + ' s', onchange: (v) => { app.pushUndo('body', 'Spin'); b.spinPeriod = v * Math.sign(b.spinPeriod || 1); } }),
        toggle({ label: 'Retrograde spin', value: b.spinPeriod < 0, onchange: (v) => { b.spinPeriod = Math.abs(b.spinPeriod) * (v ? -1 : 1); } }),
        slider({ label: 'Axial tilt', min: 0, max: 3.1, step: 0.01, value: b.tilt, fmt: (v) => deg(v).toFixed(0) + '°', oninput: (v) => { b.tilt = v; } }),
      ));
      detail.appendChild(section('Atmosphere & climate',
        slider({ label: 'Atmosphere', min: 0, max: 3, step: 0.001, value: Math.min(3, Math.cbrt(b.atmosphere)), fmt: (v) => (v ** 3).toFixed(3) + ' bar', onchange: (v) => { app.pushUndo('body', 'Atmosphere'); b.atmosphere = v ** 3; b.updateCaches(); }, hint: '(separate inventory)' }),
        slider({ label: 'Greenhouse', min: 0, max: 3, step: 0.05, value: b.greenhouse, fmt: (v) => '×' + v.toFixed(2), onchange: (v) => { b.greenhouse = v; } }),
        slider({ label: 'Climate bias', min: -80, max: 300, step: 1, value: b.tempBias, fmt: (v) => (v >= 0 ? '+' : '') + v.toFixed(0) + '°C', onchange: (v) => { b.tempBias = v; }, hint: 'internal heat' }),
        h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Starting temperature'), (detail.t0 = h('input', { type: 'number', value: Math.round(s.stats().meanTemp), class: 'num' })), h('span', {}, '°C'), btn('Set now', () => { app.pushUndo('body', 'Temperature'); const d = +detail.t0.value - s.stats().meanTemp; for (let i = 0; i < s.count; i++) s.temp[i] += d; app.toast('Surface temperatures shifted; climate will now evolve from there.'); })),
      ));
    } else if (b.type === 'star') {
      detail.appendChild(section('Star',
        slider({ label: 'Surface temperature', min: 2500, max: 30000, step: 100, value: b.star.temperatureK, fmt: (v) => v.toFixed(0) + ' K', oninput: (v) => { b.star.temperatureK = v; } }),
        slider({ label: 'Luminosity', min: 0.05, max: 20, step: 0.05, value: b.star.luminosity, fmt: (v) => v.toFixed(2) + ' L☉', oninput: (v) => { b.star.luminosity = v; } }),
        slider({ label: 'Radius', min: 5, max: 80, step: 1, value: b.radiusCache, fmt: (v) => v.toFixed(0) + ' u', onchange: (v) => { app.pushUndo('body', 'Star radius'); b.star.volume = (4 / 3) * Math.PI * v ** 3; b.updateCaches(); } }),
        toolHint('Planet heating uses luminosity / distance² (1 L☉ at 1000 u ≈ Earth flux). Mass = volume × plasma density.'),
      ));
    } else if (b.type === 'gas') {
      const g = b.gas;
      detail.appendChild(section('Gas giant envelope (separate from condensed core)',
        slider({ label: 'Envelope volume', min: 0.1, max: 4, step: 0.05, value: 1, fmt: (v) => '×' + v.toFixed(2), onchange: (v) => { app.pushUndo('body', 'Envelope'); g.envelope *= v; b.updateCaches(); app.toast('Envelope rescaled: radius and mass updated.'); } }),
        slider({ label: 'Band contrast', min: 0, max: 2, step: 0.05, value: g.bands.contrast, oninput: (v) => { g.bands.contrast = v; } }),
        slider({ label: 'Atmospheric speed', min: 0, max: 5, step: 0.1, value: g.bands.speed, oninput: (v) => { g.bands.speed = v; } }),
        slider({ label: 'Spin period', min: 20, max: 600, step: 5, value: Math.abs(b.spinPeriod), fmt: (v) => v.toFixed(0) + ' s', onchange: (v) => { b.spinPeriod = v; } }),
        slider({ label: 'Axial tilt', min: 0, max: 3.1, step: 0.01, value: b.tilt, fmt: (v) => deg(v).toFixed(0) + '°', oninput: (v) => { b.tilt = v; } }),
        toggle({ label: 'Rings', value: !!g.rings, onchange: (v) => { g.rings = v ? { inner: 1.3, outer: 2.2, color: [0.9, 0.84, 0.7], opacity: 0.8 } : null; } }),
        slider({ label: 'Ring outer edge', min: 1.5, max: 4, step: 0.05, value: g.rings ? g.rings.outer : 2.2, fmt: (v) => v.toFixed(2) + ' R', oninput: (v) => { if (g.rings) g.rings = { ...g.rings, outer: v }; } }),
        btn('🌀 Add storm vortex', () => { g.spots.push({ id: Date.now() % 1e6, lat: (Math.random() - 0.5) * 1.2, lon: Math.random() * 6, size: 0.12 + Math.random() * 0.1, color: [0.85, 0.5, 0.35], life: 200, persistent: false, intensity: 1 }); }),
        toolHint('Rings are a rendered disc with radial bands and planet shadow, not individually simulated particles.'),
      ));
    }
    detail.appendChild(section('Reset', h('div', { class: 'row' }, btn('↺ Reset planet', () => app.resetBody(b)), btn('↺ Reset scene', () => app.resetScene()))));
  }
  function refresh() {
    const sel = app.world.selectedId;
    if (sel !== lastSel || app.world.bodies.length !== lastCount) { lastSel = sel; lastCount = app.world.bodies.length; renderList(); renderDetail(); }
    const b = app.world.selected;
    if (b && detail.info) {
      const R = b.radiusCache, M = b.massCache;
      const rows = [['Type', b.type === 'terrestrial' ? `${b.kind} (terrestrial)` : b.type], ['Radius', R.toFixed(2) + ' u'], ['Mass', fmtNum(M)], ['Surface gravity', b.surfaceGravity().toFixed(2) + ' u/s²']];
      if (b.surface) {
        const st = b.surface.stats();
        rows.push(['Mean temp', tempStr(app, st.meanTemp)], ['Atmosphere', b.atmosphere.toFixed(3) + ' bar'], ['Ocean coverage', pct(st.oceanCoverage)], ['Grid', `${b.surface.N}×${b.surface.N}×6 = ${b.surface.count} cells`]);
      }
      if (b.type === 'star') rows.push(['Temperature', b.star.temperatureK.toFixed(0) + ' K'], ['Luminosity', b.star.luminosity.toFixed(2)]);
      detail.info.innerHTML = '';
      for (const [k, v] of rows) detail.info.appendChild(h('div', { class: 'kv-row' }, h('span', {}, k), h('b', {}, v)));
    }
  }
  el.appendChild(section('Bodies in scene', list));
  el.appendChild(detail);
  return { el, refresh, reset: () => { lastSel = null; } };
}

// ---------------- Materials ----------------
export function materialsPanel(app) {
  const el = h('div', { class: 'panel-inner' });
  const tools = [
    { id: 'raise', label: 'Raise', icon: '⛰️' }, { id: 'lower', label: 'Lower', icon: '🕳️' }, { id: 'smooth', label: 'Smooth', icon: '〰️' },
    { id: 'paint', label: 'Paint', icon: '🖌️' }, { id: 'addmat', label: 'Add', icon: '⬇️' }, { id: 'remove', label: 'Remove', icon: '⛏️' },
  ];
  const toolChips = chips(tools, { value: app.tool.id, onpick: (id) => app.setTool(id) });
  const palette = MATERIALS.map((m) => ({ id: m.key, label: m.name, icon: h('span', { class: 'swatch', style: { background: `rgb(${m.color.map((c) => Math.round(c * 255)).join(',')})` } }), title: m.desc }));
  const pal = chips(palette, { value: app.tool.material, onpick: (k) => { app.tool.material = k; if (!['paint', 'addmat', 'raise'].includes(app.tool.id)) app.setTool('paint'); app.ui.updateMode(); }, cls: 'palette' });
  const matDesc = h('p', { class: 'hint' });
  el.appendChild(section('Sculpt & paint (brush)', toolChips, brushControls(app), toolHint('Raise adds the selected material (inventory grows), Lower/Remove take material out, Smooth moves it (conserved). Paint replaces the surface skin. Add pours loose material that falls and deposits.')));
  el.appendChild(section('Element palette', pal, matDesc));
  // composition editor
  const comp = h('div');
  el.appendChild(section('Composition (whole body)', comp));
  const sliders = {};
  const fr = {};
  let totalR = 10;
  const prog = h('div', { class: 'progress' }, h('div', { class: 'bar' }));
  const jobRow = h('div', { class: 'row' });
  const table = h('table', { class: 'comp-table' });
  let builtFor = null;
  function build() {
    comp.innerHTML = '';
    const b = app.world.selected;
    builtFor = b ? b.id : null;
    if (!b) return;
    if (b.type !== 'terrestrial') {
      comp.appendChild(toolHint(b.type === 'gas' ? 'Gas giants: use Bodies → envelope controls. Poured material sinks into the envelope and adds mass.' : 'Stars: use Bodies → star controls.'));
      return;
    }
    const rep = b.compositionReport();
    totalR = Math.cbrt((3 * rep.volumeTotal) / (4 * Math.PI));
    comp.appendChild(toolHint('Percentages are normalised VOLUME fractions of the condensed body (solids + water + ice + lava + organics). Atmosphere is a separate inventory (Bodies panel). Applying a recipe is a deliberate replacement edit: removed material leaves through an explicit sink, new material falls in as visible streams.'));
    comp.appendChild(h('div', { class: 'row' }, btn('99% rock / 1% water', () => preset({ rock: 99, water: 1 })), btn('1% rock / 99% water', () => preset({ rock: 1, water: 99 })), btn('Current', () => preset(null))));
    const grid = h('div', { class: 'comp-grid' });
    for (const k of RECIPE_KEYS) {
      fr[k] = rep.volumeFractions[k] * 100;
      const m = MATERIALS[KEY_TO_MAT[k]];
      sliders[k] = slider({ label: m.name, min: 0, max: 100, step: 0.1, value: fr[k], fmt: (v) => v.toFixed(1), oninput: (v) => { fr[k] = v; updateNorm(); } });
      grid.appendChild(sliders[k]);
    }
    comp.appendChild(grid);
    comp.appendChild((comp.norm = h('p', { class: 'hint norm' })));
    comp.appendChild(slider({ label: 'Total condensed volume (as radius)', min: 1, max: 20, step: 0.1, value: totalR, fmt: (v) => v.toFixed(1) + ' u', oninput: (v) => { totalR = v; } }));
    comp.appendChild(h('div', { class: 'row' }, btn('▶ Apply recipe', () => apply(), 'primary')));
    comp.appendChild(prog);
    comp.appendChild(jobRow);
    comp.appendChild(table);
    updateNorm();
  }
  function preset(p) {
    const b = app.world.selected;
    if (!b) return;
    const rep = b.compositionReport();
    for (const k of RECIPE_KEYS) {
      fr[k] = p ? p[k] || 0 : rep.volumeFractions[k] * 100;
      sliders[k].set(fr[k]);
    }
    updateNorm();
  }
  function updateNorm() {
    let s = 0;
    for (const k of RECIPE_KEYS) s += fr[k];
    if (comp.norm) comp.norm.textContent = 'Normalised: ' + RECIPE_KEYS.filter((k) => fr[k] > 0).map((k) => `${MATERIALS[KEY_TO_MAT[k]].name} ${(100 * fr[k] / (s || 1)).toFixed(1)}%`).join(' · ');
  }
  function apply() {
    const b = app.world.selected;
    let s = 0;
    for (const k of RECIPE_KEYS) s += fr[k];
    if (s <= 0) return app.toast('Recipe is empty.', 'warn');
    app.pushUndo('body', 'Recipe');
    const total = (4 / 3) * Math.PI * totalR ** 3;
    app.world.startRecipe(b, Object.fromEntries(RECIPE_KEYS.map((k) => [k, fr[k] / s])), total);
    app.toast('Reconfiguring composition — watch the streams. Pause or cancel any time.');
  }
  function refresh() {
    const b = app.world.selected;
    if ((b ? b.id : null) !== builtFor) build();
    toolChips.setValue(app.tool.id);
    pal.setValue(app.tool.material);
    const m = MATERIALS.find((x) => x.key === app.tool.material);
    matDesc.textContent = m ? `${m.name}: ${m.desc}${m.density ? ` Density ${m.density}.` : ''}` : '';
    if (!b || b.type !== 'terrestrial') return;
    const job = app.world.jobFor(b);
    prog.style.display = job ? '' : 'none';
    jobRow.innerHTML = '';
    if (job) {
      prog.firstChild.style.width = (job.progress * 100).toFixed(1) + '%';
      jobRow.appendChild(h('span', { class: 'lbl' }, job.done ? 'Complete' : job.paused ? `Paused ${(job.progress * 100).toFixed(0)}%` : `Transition ${(job.progress * 100).toFixed(0)}%`));
      if (!job.done) {
        jobRow.appendChild(btn(job.paused ? '▶ Resume' : '⏸ Pause', () => { job.paused = !job.paused; }));
        jobRow.appendChild(btn('✕ Cancel', () => { job.cancelled = true; app.toast('Recipe cancelled. Inventories stay as they are now (in-flight streams still land).'); }, 'danger'));
      }
    }
    const rep = b.compositionReport();
    const st = b.surface.stats();
    table.innerHTML = '';
    table.appendChild(h('tr', {}, h('th', {}, 'Material'), h('th', {}, 'Volume'), h('th', {}, 'Vol %'), h('th', {}, 'Mass %')));
    for (const k of RECIPE_KEYS) {
      if (rep.volumes[k] <= 0) continue;
      table.appendChild(h('tr', {}, h('td', {}, MATERIALS[KEY_TO_MAT[k]].name), h('td', {}, fmtNum(rep.volumes[k])), h('td', {}, pct(rep.volumeFractions[k], 2)), h('td', {}, pct(rep.massFractions[k], 2))));
    }
    table.appendChild(h('tr', { class: 'sep' }, h('td', {}, 'Ocean coverage (area)'), h('td', { colspan: 3 }, pct(st.oceanCoverage) + '  · exposed land ' + pct(st.landFraction))));
    table.appendChild(h('tr', {}, h('td', {}, 'Total mass'), h('td', { colspan: 3 }, fmtNum(b.massCache) + '  · radius ' + b.radiusCache.toFixed(2) + ' u  · solid core Rs ' + b.surface.Rs.toFixed(2) + ' u')));
  }
  build();
  return { el, refresh, reset: () => { builtFor = -1; } };
}

// ---------------- Water ----------------
export function waterPanel(app) {
  const el = h('div', { class: 'panel-inner' });
  const tools = chips([
    { id: 'pour', label: 'Pour water', icon: '💧' }, { id: 'drain', label: 'Drain', icon: '🧽' }, { id: 'pourlava', label: 'Pour lava', icon: '🌋' }, { id: 'snow', label: 'Add snow/ice', icon: '❄️' },
  ], { value: app.tool.id, onpick: (id) => { if (id === 'snow') { app.tool.material = 'ice'; app.setTool('paint'); } else app.setTool(id); } });
  const info = h('div', { class: 'kv' });
  el.appendChild(section('Liquids (brush)', tools, brushControls(app), toolHint('Pouring ADDS inventory: water falls toward the centre, lands, pools and flows downhill. Draining removes water through an explicit sink. Soils absorb only up to their pore capacity.')));
  el.appendChild(section('Water inventory', info));
  const ex = h('div');
  el.appendChild(section('Erosion',
    slider({ label: 'Erosion strength', min: 0, max: 10, step: 0.1, value: app.world.settings.erosion, fmt: (v) => '×' + v.toFixed(1), oninput: (v) => { app.world.settings.erosion = v; } }),
    h('div', { class: 'row' }, btn('🧪 Run erosion experiment', () => app.erosionExperiment(), 'primary'), btn('Stop', () => { app.world.experiment = null; app.world.settings.erosion = 1; app.world.settings.surfaceSpeed = 1; app.ui.refreshTop(); })),
    ex,
    h('div', { class: 'row' }, btn('Runoff overlay', () => app.setOverlay('runoff')), btn('Sediment overlay', () => app.setOverlay('sediment')), btn('No overlay', () => app.setOverlay('none'))),
    toggle({ label: 'Show BEFORE terrain (original heights)', value: app.world.settings.beforeAfter === 'before', onchange: (v) => { app.world.settings.beforeAfter = v ? 'before' : 'after'; } }),
    toolHint('Experiment: a spring on the highest peak, erosion ×6 and surface time ×8. A channel forms within about a minute; harder rock changes less than soil or sand.'),
  ));
  function refresh() {
    tools.setValue(app.tool.id === 'paint' && app.tool.material === 'ice' ? 'snow' : app.tool.id);
    const b = app.world.selected;
    info.innerHTML = '';
    if (!b || !b.surface) { info.appendChild(toolHint('Select a terrestrial body.')); return; }
    const r = b.surface.waterReservoirs();
    const rep = b.compositionReport();
    const st = b.surface.stats();
    const cons = app.world.conservation(b);
    const rows = [
      ['Water (all reservoirs)', fmtNum(cons.water) + ' u³'], ['Water volume fraction', pct(rep.volumeFractions.water + rep.volumeFractions.ice, 2)], ['Ocean coverage (area)', pct(st.oceanCoverage)], ['Exposed land', pct(st.landFraction)],
      ['Liquid / soil', fmtNum(r.liquid) + ' / ' + fmtNum(r.soil)], ['Ice / vapour / cloud', `${fmtNum(r.ice)} / ${fmtNum(r.vapor)} / ${fmtNum(r.cloud)}`], ['Falling (in flight)', fmtNum(b.pendingOf('water'))],
      ['Ledger: poured / drained', `${fmtNum(b.ledger.source)} / ${fmtNum(b.ledger.sink)}`], ['Escaped to space / forced', `${fmtNum(b.ledger.escaped)} / ${fmtNum(b.ledger.forced)}`], ['Conservation error', cons.waterError.toExponential(1)],
    ];
    for (const [k, v] of rows) info.appendChild(h('div', { class: 'kv-row' }, h('span', {}, k), h('b', {}, v)));
    const e = app.world.experiment;
    ex.textContent = e && e.bodyId === b.id ? `Experiment running: ${Math.max(0, e.until - app.world.time.surface).toFixed(0)} surface-s left. Max channel depth ${app.channelDepth(b).toFixed(3)} u.` : '';
  }
  return { el, refresh };
}

// ---------------- Weather ----------------
export function weatherPanel(app) {
  const el = h('div', { class: 'panel-inner' });
  const types = Object.entries(STORM_TYPES).map(([id, d]) => ({ id, label: d.name, icon: d.icon }));
  const t = app.tool;
  const grid = chips(types, { value: t.weather, onpick: (id) => { t.weather = id; app.setTool('weather'); }, cls: 'grid3' });
  const forced = toggle({ label: 'Forced (sandbox override)', value: app.world.settings.stormForced, onchange: (v) => { app.world.settings.stormForced = v; app.ui.updateMode(); }, hint: 'supplies artificial energy/moisture' });
  const dirs = [['•', -1], ['E', 0], ['NE', 45], ['N', 90], ['NW', 135], ['W', 180], ['SW', 225], ['S', 270], ['SE', 315]];
  const dirChips = chips(dirs.map(([l, a]) => ({ id: String(a), label: l })), { value: t.speed > 0 ? String(Math.round(deg(t.heading))) : '-1', onpick: (id) => { const a = +id; if (a < 0) t.speed = 0; else { t.heading = (a * Math.PI) / 180; if (!t.speed) t.speed = 1; } }, cls: 'dirs' });
  const list = h('div', { class: 'storm-list' });
  el.appendChild(section('Spawn weather (tap the planet)', grid, forced,
    h('div', { class: 'row2' },
      slider({ label: 'Intensity', min: 0.1, max: 1.4, step: 0.05, value: t.intensity, fmt: (v) => (v * 100).toFixed(0) + '%', oninput: (v) => { t.intensity = v; } }),
      slider({ label: 'Area', min: 0.4, max: 2.5, step: 0.05, value: t.area, fmt: (v) => '×' + v.toFixed(2), oninput: (v) => { t.area = v; } }),
      slider({ label: 'Duration', min: 10, max: 400, step: 5, value: t.duration, fmt: (v) => v.toFixed(0) + ' s', oninput: (v) => { t.duration = v; } }),
      slider({ label: 'Move speed', min: 0, max: 3, step: 0.1, value: t.speed, fmt: (v) => v.toFixed(1), oninput: (v) => { t.speed = v; } }),
    ),
    h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Direction'), dirChips),
    toggle({ label: 'Automatic natural weather', value: app.world.settings.autoWeather, onchange: (v) => { app.world.settings.autoWeather = v; } }),
    slider({ label: 'Weather intensity (global)', min: 0, max: 3, step: 0.1, value: app.world.settings.weather, fmt: (v) => '×' + v.toFixed(1), oninput: (v) => { app.world.settings.weather = v; } }),
    toolHint('Natural mode checks atmosphere, moisture, temperature and spin, and explains refusals. Forced mode is a labelled sandbox override that injects artificial moisture/energy (tracked in the water ledger).'),
  ));
  el.appendChild(section('Active weather systems', list));
  el.appendChild(section('Overlays', h('div', { class: 'row' }, btn('Temperature', () => app.setOverlay('temperature')), btn('Clouds & humidity', () => app.setOverlay('clouds')), btn('Wind', () => app.setOverlay('wind')), btn('Off', () => app.setOverlay('none')))));
  function refresh() {
    grid.setValue(t.weather);
    forced.set(app.world.settings.stormForced);
    const b = app.world.selected;
    list.innerHTML = '';
    if (!b) return;
    if (b.type === 'gas') {
      for (const sp of b.gas.spots) list.appendChild(h('div', { class: 'storm' }, `🌀 Vortex ${sp.persistent ? '(persistent)' : `(${sp.life.toFixed(0)} s)`}`));
      return;
    }
    if (!b.storms.length) list.appendChild(toolHint('No active storms. Natural weather (clouds, rain, snow) still runs from the moisture model.'));
    for (const st of b.storms) {
      const lat = deg(Math.asin(st.pos[1])).toFixed(0);
      const lbl = `${STORM_TYPES[st.type].icon} ${STORM_TYPES[st.type].name}${st.waterspout ? ' (waterspout)' : ''}`;
      list.appendChild(h('div', { class: 'storm' },
        h('div', { class: 'row' }, h('b', {}, lbl), h('span', { class: 'badge' + (st.forced ? ' warn' : '') }, st.forced ? 'FORCED' : st.natural ? 'natural (auto)' : 'natural'), btn('✕', () => { st.dead = true; b.storms = b.storms.filter((x) => x !== st); }, 'small')),
        h('div', { class: 'meter' }, h('div', { style: { width: Math.min(100, st.intensity * 70) + '%' } })),
        h('small', {}, `lat ${lat}° · ${(st.duration - st.age).toFixed(0)} s left${st.state ? ' · ' + st.state : ''}${st.type === 'hurricane' ? ` · surge ${(st.surgeMax * 1000).toFixed(1)} mu` : ''}${st.type === 'tornado' ? ` · sediment moved ${(st.sedimentMoved * 1000).toFixed(1)}` : ''}`),
      ));
    }
  }
  return { el, refresh };
}

// ---------------- Life ----------------
export function lifePanel(app) {
  const el = h('div', { class: 'panel-inner' });
  const t = app.tool;
  const plantIcons = ['🌱', '🌸', '🌿', '🌲', '🌳', '🍄'];
  const plants = chips(PLANT_TYPES.map((p, i) => ({ id: String(i), label: p.name, icon: plantIcons[i] })), { value: String(t.plant), onpick: (id) => { t.plant = +id; app.setTool('seed'); }, cls: 'grid3' });
  const animalIcons = ['🦌', '🦊', '🐇', '🐦', '🐟', '🦋'];
  const animals = chips(SPECIES.map((s, i) => ({ id: String(i), label: s.name, icon: animalIcons[i], title: s.desc })), { value: String(t.species), onpick: (id) => { t.species = +id; app.setTool('animal'); }, cls: 'grid3' });
  const group = chips([{ id: '1', label: '×1' }, { id: '3', label: '×3' }, { id: '6', label: '×6' }], { value: String(t.group), onpick: (id) => { t.group = +id; } });
  const biomes = chips(Object.entries(BIOMES).map(([id, b]) => ({ id, label: b.name })), { value: t.biome, onpick: (id) => { t.biome = id; app.setTool('biome'); }, cls: 'grid3' });
  const pop = h('div', { class: 'kv' });
  const events = h('div', { class: 'events' });
  el.appendChild(section('Seed brush (paint plants)', plants, brushControls(app)));
  el.appendChild(section('Organism dropper (tap)', animals, h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Group'), group)));
  el.appendChild(section('Biome package (tap a region)', biomes));
  el.appendChild(section('Experimental life package (tap)',
    h('div', { class: 'row' },
      toggle({ label: 'Cold-hardy', value: t.cold, onchange: (v) => { t.cold = v; } }),
      toggle({ label: 'Drought-tolerant', value: t.dry, onchange: (v) => { t.dry = v; } }),
      toggle({ label: 'Low-oxygen', value: t.lowAir, onchange: (v) => { t.lowAir = v; } })),
    btn('🧬 Place hardy organisms', () => app.setTool('experimental')),
    toolHint('Adaptations widen requirements by bounded amounts (−25°C cold limit, 30% moisture need, 0.01 bar air) at a growth penalty.'),
  ));
  el.appendChild(section('Rules',
    toggle({ label: 'Natural colonisation (spread & reproduce)', value: app.world.settings.naturalLife, onchange: (v) => { app.world.settings.naturalLife = v; } }),
    toggle({ label: '⚠ EXPERIMENTAL OVERRIDE: allow unsuitable placement', value: app.world.settings.experimentalOverride, onchange: (v) => { app.world.settings.experimentalOverride = v; app.ui.updateMode(); } }),
    slider({ label: 'Explicit population cap', min: 20, max: 400, step: 10, value: app.world.settings.popCap, fmt: (v) => v.toFixed(0), onchange: (v) => { app.world.settings.popCap = v; } }),
  ));
  el.appendChild(section('Populations (explicit + aggregated)', pop));
  el.appendChild(section('Recent events', events));
  function refresh() {
    plants.setValue(String(t.plant));
    animals.setValue(String(t.species));
    biomes.setValue(t.biome);
    const b = app.world.selected;
    pop.innerHTML = '';
    events.innerHTML = '';
    if (!b || !b.surface) { pop.appendChild(toolHint('Select a terrestrial body.')); return; }
    const sum = app.world.populationSummary(b);
    sum.forEach((s, i) => pop.appendChild(h('div', { class: 'kv-row' }, h('span', {}, `${animalIcons[i]} ${s.name}`), h('b', {}, `${s.explicit} visible + ${s.reserve} aggregated`))));
    const st = b.surface.stats();
    pop.appendChild(h('div', { class: 'kv-row' }, h('span', {}, 'Vegetation cover'), h('b', {}, pct(st.vegCoverage))));
    if (b.lifeStats) pop.appendChild(h('div', { class: 'kv-row' }, h('span', {}, 'Births / deaths'), h('b', {}, `${b.lifeStats.births} / ${b.lifeStats.deaths}`)));
    for (const e of b.events.slice(-6).reverse()) events.appendChild(h('div', {}, `t=${e.t.toFixed(0)}s · ${e.text}`));
  }
  return { el, refresh };
}

// ---------------- Orbits ----------------
export function orbitsPanel(app) {
  const el = h('div', { class: 'panel-inner' });
  const w = app.world;
  const speeds = chips([0, 0.25, 1, 4, 16, 50].map((v) => ({ id: String(v), label: v === 0 ? '⏸' : '×' + v })), { value: String(w.settings.orbitSpeed), onpick: (id) => { w.settings.orbitSpeed = +id; app.ui.refreshTop(); } });
  const info = h('div', { class: 'kv' });
  const parentSel = h('select', { class: 'sel' });
  let ecc = 0, dirSign = 1;
  const moonChips = chips(['moon', 'rocky', 'frozen', 'ocean', 'mars'].map((k) => ({ id: k, label: BODY_PRESETS[k].label, icon: BODY_PRESETS[k].icon })), { onpick: (k) => app.addMoon(k) });
  const planetChips = chips(['earth', 'mars', 'venus', 'mercury', 'jupiter', 'saturn', 'neptune', 'lava'].map((k) => ({ id: k, label: BODY_PRESETS[k].label, icon: BODY_PRESETS[k].icon })), { onpick: (k) => app.addPlanetToStar(k) });
  const placeChips = chips(Object.entries(BODY_PRESETS).map(([k, p]) => ({ id: k, label: p.label, icon: p.icon })), { onpick: (k) => { app.tool.placePreset = k; app.setTool('place'); }, cls: 'grid3' });
  el.appendChild(section('Orbital time (separate from surface time)', speeds, h('div', { class: 'row' }, btn('⏭ Step 0.5 s', () => app.step()), toggle({ label: 'Trails', value: w.settings.showTrails, onchange: (v) => { w.settings.showTrails = v; } }), toggle({ label: 'Predicted path', value: w.settings.showPredict, onchange: (v) => { w.settings.showPredict = v; } }), toggle({ label: 'Velocity vector', value: w.settings.showVectors, onchange: (v) => { w.settings.showVectors = v; } }))));
  el.appendChild(section('Selected body orbit', info,
    h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Parent'), parentSel),
    slider({ label: 'Eccentricity', min: 0, max: 0.8, step: 0.01, value: 0, oninput: (v) => { ecc = v; } }),
    toggle({ label: 'Retrograde direction', value: false, onchange: (v) => { dirSign = v ? -1 : 1; } }),
    h('div', { class: 'row' }, btn('🛰 Auto-orbit (set velocity)', () => app.autoOrbit(+parentSel.value, ecc, dirSign), 'primary'), btn('⚖ Re-stabilize', () => app.restabilize())),
    h('div', { class: 'row' }, btn('⬆ Prograde +5%', () => app.nudge('prograde')), btn('⬇ Retro −5%', () => app.nudge('retrograde')), btn('↗ Radial', () => app.nudge('radial')), btn('💥 Disturb', () => app.nudge('kick'), 'danger')),
    toolHint('Auto-orbit only sets the initial velocity from current masses and separation; gravity then integrates the motion (leapfrog). Mass edits perturb orbits; Re-stabilize is an explicit player intervention.'),
  ));
  el.appendChild(section('Add a moon to the selected body', moonChips));
  el.appendChild(section('Add a planet to the star', planetChips));
  el.appendChild(section('Place a body at a tapped location in space', placeChips));
  let lastKey = '';
  function refresh() {
    speeds.setValue(String(w.settings.orbitSpeed));
    const b = w.selected;
    const key = w.bodies.map((x) => x.id).join(',') + ':' + (b ? b.id + ':' + b.parentId : '');
    if (key !== lastKey) {
      lastKey = key;
      parentSel.innerHTML = '';
      for (const o of w.bodies) if (o !== b) parentSel.appendChild(h('option', { value: o.id, selected: b && b.parentId === o.id }, o.name));
    }
    info.innerHTML = '';
    if (!b) return;
    const p = w.getBody(b.parentId);
    const rows = [];
    if (p) {
      const el2 = orbitalElements(b, p);
      rows.push(['Parent', p.name], ['Distance', el2.r.toFixed(1) + ' u'], ['Speed (rel.)', el2.speed.toFixed(3) + ' u/s'], ['Eccentricity', el2.e.toFixed(3)], ['Period', el2.bound ? el2.period.toFixed(1) + ' orbit-s' : 'unbound'], ['Periapsis / apoapsis', el2.bound ? `${el2.periapsis.toFixed(1)} / ${el2.apoapsis.toFixed(1)}` : '—']);
      if (el2.bound && el2.periapsis < p.radiusCache + b.radiusCache) rows.push(['⚠ Warning', 'periapsis intersects parent: collision course']);
    } else rows.push(['Parent', 'none (free body)'], ['Speed', Math.hypot(...b.vel).toFixed(3) + ' u/s']);
    rows.push(['Mass', fmtNum(b.massCache)]);
    if (w.lastCollision) rows.push(['Last collision', `${w.lastCollision.small}→${w.lastCollision.big}: mass err ${w.lastCollision.massError.toExponential(1)}, momentum err ${w.lastCollision.momentumError.toExponential(1)}`]);
    for (const [k, v] of rows) info.appendChild(h('div', { class: 'kv-row' }, h('span', {}, k), h('b', {}, v)));
  }
  return { el, refresh };
}

// ---------------- Inspect ----------------
export function inspectPanel(app) {
  const el = h('div', { class: 'panel-inner' });
  const views = chips([{ id: 'system', label: 'System', icon: '🌌' }, { id: 'planet', label: 'Planet', icon: '🌍' }, { id: 'surface', label: 'Surface', icon: '🏔️' }, { id: 'cutaway', label: 'Cutaway', icon: '🔪' }], { value: app.renderer.cam.view, onpick: (id) => app.setView(id) });
  const overlays = chips(['none', 'runoff', 'sediment', 'temperature', 'moisture', 'clouds', 'wind', 'life'].map((o) => ({ id: o, label: o === 'none' ? 'Off' : o[0].toUpperCase() + o.slice(1) })), { value: app.world.settings.overlay, onpick: (id) => app.setOverlay(id) });
  const cut = h('div', { class: 'kv' });
  el.appendChild(section('Camera view', views, toggle({ label: 'Camera follows planet rotation', value: app.renderer.cam.followSpin, onchange: (v) => { app.renderer.cam.followSpin = v; } })));
  el.appendChild(section('Inspector', h('div', { class: 'row' }, btn('🔍 Tap-to-inspect tool', () => app.setTool('inspect'), 'primary')), toolHint('Tap terrain to read a cell; tap an animal for the life inspector. In View mode a tap also selects bodies and organisms.')));
  el.appendChild(section('Analysis overlays', overlays, toggle({ label: 'Before/after: show ORIGINAL terrain', value: app.world.settings.beforeAfter === 'before', onchange: (v) => { app.world.settings.beforeAfter = v ? 'before' : 'after'; } })));
  el.appendChild(section('Cutaway layers', cut));
  el.appendChild(section('Diagnostics', toggle({ label: 'Show diagnostics panel', value: app.ui.diagOn, onchange: (v) => app.ui.showDiag(v) })));
  function refresh() {
    views.setValue(app.renderer.cutaway ? 'cutaway' : app.renderer.cam.view);
    overlays.setValue(app.world.settings.overlay);
    cut.innerHTML = '';
    const b = app.world.selected;
    const v = b ? app.renderer.views.get(b.id) : null;
    if (v && v.cutawayInfo && app.renderer.cutaway) {
      const c = v.cutawayInfo;
      for (const [k, val] of [['Iron core radius', c.core], ['Rock surface (mean)', c.rock], ['Ice top (mean)', c.ice], ['Water surface (mean)', c.water]]) cut.appendChild(h('div', { class: 'kv-row' }, h('span', {}, k), h('b', {}, val.toFixed(2) + ' u')));
    } else cut.appendChild(toolHint('Choose Cutaway to slice the selected planet and see its core beneath any ocean envelope.'));
  }
  return { el, refresh };
}

// ---------------- Presets / saves ----------------
export function presetsPanel(app) {
  const el = h('div', { class: 'panel-inner' });
  const scenes = h('div', { class: 'cards' });
  for (const [k, s] of Object.entries(SCENES)) scenes.appendChild(h('button', { class: 'card', onclick: () => app.loadScene(k) }, h('div', { class: 'card-icon' }, s.icon), h('div', { class: 'card-t' }, s.name), h('div', { class: 'card-d' }, s.desc)));
  const bodies = h('div', { class: 'cards small' });
  for (const [k, p] of Object.entries(BODY_PRESETS)) bodies.appendChild(h('button', { class: 'card', onclick: () => app.addPresetBody(k) }, h('div', { class: 'card-icon' }, p.icon), h('div', { class: 'card-t' }, p.label), h('div', { class: 'card-d' }, p.desc)));
  const saveName = h('input', { class: 'name-input', placeholder: 'Save name', maxlength: 40 });
  const saveList = h('div', { class: 'save-list' });
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) app.importFile(fileIn.files[0]); fileIn.value = ''; });
  const modeChips = chips([{ id: 'sandbox', label: 'Sandbox', icon: '🧪' }, { id: 'terraform', label: 'Terraforming goals', icon: '🎯' }], { value: app.world.mode, onpick: (id) => { app.world.mode = id; app.ui.renderGoals(); } });
  el.appendChild(section('Scenes', scenes));
  el.appendChild(section('Body presets (added to the current scene)', bodies));
  el.appendChild(section('Saves', h('div', { class: 'row' }, saveName, btn('💾 Save', async () => { await app.saveNamed(saveName.value.trim() || 'World ' + new Date().toLocaleString()); renderSaves(); }, 'primary')), saveList,
    h('div', { class: 'row' }, btn('⬇ Export JSON', () => app.exportJSON()), btn('⬆ Import JSON', () => fileIn.click()), fileIn, btn('↶ Undo', () => app.undo()), btn('↷ Redo', () => app.redo()))));
  el.appendChild(section('Mode', modeChips, h('div', { class: 'row' }, btn('🎓 Tutorial', () => app.tutorial.start()), btn('⚙ Settings', () => app.ui.openSettings()))));
  async function renderSaves() {
    saveList.innerHTML = '';
    const names = await app.listSaves();
    if (!names.length) saveList.appendChild(toolHint('No saves yet. Autosave runs every 60 s and when the app is hidden.'));
    for (const n of names) saveList.appendChild(h('div', { class: 'save-item' }, h('span', {}, n === '__autosave' ? '⟳ Autosave' : n), btn('Load', () => app.loadNamed(n)), n === '__autosave' ? null : btn('✕', async () => { await app.deleteSave(n); renderSaves(); }, 'small')));
  }
  renderSaves();
  function refresh() { modeChips.setValue(app.world.mode); }
  return { el, refresh, onOpen: renderSaves, scrollTo: (what) => { if (what === 'bodies') bodies.scrollIntoView({ block: 'start' }); } };
}

export function goalsCard(app) {
  const el = h('div', { class: 'goals' });
  return {
    el,
    render() {
      el.innerHTML = '';
      el.style.display = app.world.mode === 'terraform' ? '' : 'none';
      if (app.world.mode !== 'terraform') return;
      if (this._init === undefined) { this._init = true; if (window.innerWidth < 600) el.classList.add('collapsed'); }
      const done = GOALS.filter((g) => app.world.goals[g.id].done).length;
      const head = h('button', { class: 'goals-head', onclick: () => el.classList.toggle('collapsed') }, `🎯 Goals ${done}/${GOALS.length}`);
      el.appendChild(head);
      const list = h('div', { class: 'goals-list' });
      if (app.world.unlocks.length) list.appendChild(h('div', { class: 'unlocks' }, '🏅 ' + app.world.unlocks.join(' · ')));
      for (const g of GOALS) {
        const st = app.world.goals[g.id];
        list.appendChild(h('div', { class: 'goal' + (st.done ? ' done' : '') }, h('div', { class: 'g-t' }, (st.done ? '✅ ' : '⬜ ') + g.name), h('div', { class: 'meter' }, h('div', { style: { width: (st.progress * 100).toFixed(0) + '%' } })), h('small', {}, st.done ? 'Unlocked: ' + g.reward : g.desc)));
      }
      el.appendChild(list);
    },
  };
}

export { starColor };
