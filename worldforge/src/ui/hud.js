// HUD shell: top bar, collapsible bottom tool categories, mode banner, toasts,
// inspector, body labels, diagnostics and settings.
import * as THREE from 'three';
import { h, toggle, slider, chips, section, btn, fmtNum, pct } from './dom.js';
import { bodiesPanel, materialsPanel, waterPanel, weatherPanel, lifePanel, orbitsPanel, inspectPanel, presetsPanel, goalsCard, tempStr } from './panels.js';
import { SPECIES, PLANT_TYPES, plantSuitability } from '../sim/life.js';
import { MATERIALS } from '../sim/materials.js';
import { STORM_TYPES } from '../sim/storms.js';
import { PLANTS } from '../sim/surface.js';

const TABS = [
  { id: 'bodies', label: 'Bodies', icon: '🪐', make: bodiesPanel },
  { id: 'materials', label: 'Materials', icon: '⛰️', make: materialsPanel },
  { id: 'water', label: 'Water', icon: '💧', make: waterPanel },
  { id: 'weather', label: 'Weather', icon: '🌀', make: weatherPanel },
  { id: 'life', label: 'Life', icon: '🌱', make: lifePanel },
  { id: 'orbits', label: 'Orbits', icon: '🛰️', make: orbitsPanel },
  { id: 'inspect', label: 'Inspect', icon: '🔍', make: inspectPanel },
  { id: 'presets', label: 'Presets', icon: '✨', make: presetsPanel },
];

export const TOOL_INFO = {
  view: { name: 'View', kind: 'view' },
  raise: { name: 'Raise terrain', kind: 'brush', color: 0xffc46b },
  lower: { name: 'Lower terrain', kind: 'brush', color: 0xff8f6b },
  smooth: { name: 'Smooth terrain', kind: 'brush', color: 0xbfe3ff },
  paint: { name: 'Paint material', kind: 'brush', color: 0xe6b3ff },
  addmat: { name: 'Add material (falling)', kind: 'brush', color: 0xd9c38a },
  remove: { name: 'Remove material', kind: 'brush', color: 0xff6b6b },
  pour: { name: 'Pour water', kind: 'brush', color: 0x5ac8ff },
  pourlava: { name: 'Pour lava', kind: 'brush', color: 0xff7a2a },
  drain: { name: 'Drain water', kind: 'brush', color: 0xffe066 },
  seed: { name: 'Seed plants', kind: 'brush', color: 0x7bea7b },
  biome: { name: 'Biome package', kind: 'tap', color: 0x9cf09c },
  weather: { name: 'Spawn weather', kind: 'tap', color: 0xd0e6ff },
  animal: { name: 'Drop organisms', kind: 'tap', color: 0xffd27f },
  experimental: { name: 'Hardy life package', kind: 'tap', color: 0xff9cf0 },
  inspect: { name: 'Inspect', kind: 'tap', color: 0xffffff },
  place: { name: 'Place body', kind: 'tap', color: 0xffffff },
};

export class HUD {
  constructor(root, app) {
    this.app = app;
    this.root = root;
    this.panels = {};
    this.open = null;
    this.diagOn = false;
    this.build();
  }

  build() {
    const app = this.app;
    const w = app.world;
    // top bar
    this.sceneEl = h('div', { class: 'scene-name' });
    this.bodyChip = h('button', { class: 'body-chip', onclick: () => this.openPanel('bodies') });
    this.pauseBtn = h('button', { class: 'icon-btn', title: 'Pause / resume (space)', onclick: () => app.togglePause() });
    this.stepBtn = h('button', { class: 'icon-btn', title: 'Step one interval', onclick: () => app.step() }, '⏭');
    this.surfSpeed = h('button', { class: 'speed-btn', title: 'Surface (climate/water/life) time speed', onclick: () => app.cycleSpeed('surface') });
    this.orbSpeed = h('button', { class: 'speed-btn', title: 'Orbital time speed', onclick: () => app.cycleSpeed('orbit') });
    this.saveEl = h('span', { class: 'save-state' }, '');
    this.undoBtn = h('button', { class: 'icon-btn', title: 'Undo', onclick: () => app.undo() }, '↶');
    this.redoBtn = h('button', { class: 'icon-btn', title: 'Redo', onclick: () => app.redo() }, '↷');
    const top = h('div', { class: 'topbar' },
      h('div', { class: 'brand' }, h('div', { class: 'logo' }, 'WORLDFORGE'), this.sceneEl),
      this.bodyChip,
      h('button', { class: 'icon-btn gear', title: 'Settings', onclick: () => this.openSettings() }, '⚙'),
      h('div', { class: 'top-right' }, this.undoBtn, this.redoBtn, this.pauseBtn, this.stepBtn, this.surfSpeed, this.orbSpeed, this.saveEl),
    );
    // mode banner
    this.modeText = h('span', { class: 'mode-text' });
    this.viewBtn = h('button', { class: 'view-btn', onclick: () => app.setTool('view') }, '✋ View');
    this.modeBar = h('div', { class: 'modebar' }, this.modeText, this.viewBtn);
    // toasts
    this.toastEl = h('div', { class: 'toasts' });
    // panel + tabs
    this.panelEl = h('div', { class: 'panel hidden' });
    this.panelTitle = h('div', { class: 'panel-title' });
    this.panelBody = h('div', { class: 'panel-body' });
    this.panelEl.append(h('div', { class: 'panel-head' }, this.panelTitle, h('button', { class: 'icon-btn', title: 'Close', onclick: () => this.openPanel(null) }, '✕')), this.panelBody);
    this.tabs = h('div', { class: 'tabs' }, TABS.map((t) => h('button', { class: 'tab', 'data-id': t.id, onclick: () => this.openPanel(this.open === t.id ? null : t.id) }, h('span', { class: 'tab-i' }, t.icon), h('span', { class: 'tab-l' }, t.label))));
    // inspector
    this.inspector = h('div', { class: 'inspector hidden' });
    // labels layer
    this.labels = h('div', { class: 'labels' });
    // diagnostics
    this.diag = h('div', { class: 'diag hidden' });
    // goals
    this.goals = goalsCard(app);
    // job progress mini-bar
    this.jobBar = h('div', { class: 'jobbar hidden' });
    this.root.append(this.labels, top, this.modeBar, this.toastEl, this.goals.el, this.jobBar, this.inspector, this.diag, this.panelEl, this.tabs);
    this.updateMode();
    this.refreshTop();
    this.renderGoals();
  }

  openPanel(id, scrollTo) {
    this.open = id;
    for (const b of this.tabs.children) b.classList.toggle('on', b.dataset.id === id);
    if (!id) { this.panelEl.classList.add('hidden'); return; }
    const def = TABS.find((t) => t.id === id);
    if (!this.panels[id]) this.panels[id] = def.make(this.app);
    const p = this.panels[id];
    this.panelTitle.textContent = def.icon + ' ' + def.label;
    this.panelBody.innerHTML = '';
    this.panelBody.appendChild(p.el);
    this.panelEl.classList.remove('hidden');
    if (p.reset) p.reset();
    if (p.onOpen) p.onOpen();
    p.refresh && p.refresh();
    if (scrollTo && p.scrollTo) p.scrollTo(scrollTo);
    else this.panelBody.scrollTop = 0;
    this.app.notify('panel:' + id);
  }

  rebuildPanels() {
    this.panels = {};
    if (this.open) this.openPanel(this.open);
  }

  refreshOpen() {
    if (this.open && this.panels[this.open] && this.panels[this.open].refresh) this.panels[this.open].refresh();
  }

  updateMode() {
    const t = this.app.tool;
    const info = TOOL_INFO[t.id] || TOOL_INFO.view;
    let txt;
    const touch = this.app.isTouch;
    if (info.kind === 'view') txt = touch ? 'VIEW · 1 finger orbit · pinch zoom · 2 fingers pan · tap to select' : 'VIEW · drag orbit · wheel zoom · right/shift-drag pan · click to select';
    else if (info.kind === 'brush') {
      const mat = t.id === 'paint' || t.id === 'addmat' || t.id === 'raise' ? ` (${MATERIALS.find((m) => m.key === t.material)?.name || t.material})` : t.id === 'seed' ? ` (${PLANT_TYPES[t.plant].name})` : '';
      txt = `BRUSH · ${info.name}${mat} · ${touch ? '1 finger applies · 2 fingers move camera' : 'drag applies · right-drag orbits · wheel zooms'}`;
    } else {
      let what = info.name;
      if (t.id === 'weather') what = `${STORM_TYPES[t.weather].name} (${this.app.world.settings.stormForced ? 'FORCED' : 'natural'})`;
      if (t.id === 'animal') what = `Drop ${SPECIES[t.species].name} ×${t.group}`;
      if (t.id === 'place') what = `Place ${t.placePreset}`;
      txt = `TAP · ${what} · tap target · drag orbits`;
    }
    if (this.app.world.settings.experimentalOverride && (t.id === 'seed' || t.id === 'animal' || t.id === 'biome')) txt += ' · ⚠ EXPERIMENTAL OVERRIDE';
    this.modeText.textContent = txt;
    this.modeBar.className = 'modebar ' + info.kind;
    this.viewBtn.style.display = info.kind === 'view' ? 'none' : '';
  }

  refreshTop() {
    const w = this.app.world;
    this.sceneEl.textContent = w.sceneName + (w.mode === 'terraform' ? ' · Terraforming' : '');
    const b = w.selected;
    this.bodyChip.textContent = b ? `◉ ${b.name}` : '◌ No body';
    this.pauseBtn.textContent = w.settings.paused ? '▶' : '⏸';
    this.pauseBtn.classList.toggle('hot', w.settings.paused);
    const lim = w.dilation.surface < 1 ? '*' : '';
    this.surfSpeed.textContent = `🌦 ×${w.settings.surfaceSpeed}${lim}`;
    this.orbSpeed.textContent = `🛰 ×${w.settings.orbitSpeed}`;
    this.undoBtn.disabled = !this.app.undoStack.undoStack.length;
    this.redoBtn.disabled = !this.app.undoStack.redoStack.length;
  }

  setSaveState(text) {
    this.saveEl.textContent = text;
  }

  toast(msg, kind = 'info', ms = 3600) {
    const t = h('div', { class: 'toast ' + kind }, msg);
    this.toastEl.appendChild(t);
    while (this.toastEl.children.length > 3) this.toastEl.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  renderGoals() {
    this.goals.render();
  }

  showDiag(on) {
    this.diagOn = on;
    this.diag.classList.toggle('hidden', !on);
  }

  updateDiag(d) {
    if (!this.diagOn) return;
    this.diag.innerHTML = '';
    for (const [k, v] of d) this.diag.appendChild(h('div', {}, h('span', {}, k), h('b', {}, v)));
  }

  updateJobBar() {
    const w = this.app.world;
    const b = w.selected;
    const job = b ? w.jobFor(b) : null;
    if (!job || job.done) { this.jobBar.classList.add('hidden'); return; }
    this.jobBar.classList.remove('hidden');
    this.jobBar.innerHTML = '';
    this.jobBar.append(h('span', {}, `⚗ Recipe ${job.paused ? 'paused' : 'transition'} ${(job.progress * 100).toFixed(0)}%`), h('div', { class: 'progress' }, h('div', { class: 'bar', style: { width: (job.progress * 100).toFixed(1) + '%' } })),
      btn(job.paused ? '▶' : '⏸', () => { job.paused = !job.paused; this.updateJobBar(); }, 'small'), btn('✕', () => { job.cancelled = true; this.updateJobBar(); }, 'small'));
  }

  // body name labels (system view / small bodies)
  updateLabels() {
    const app = this.app;
    const r = app.renderer;
    const show = r.cam.view === 'system' || app.world.bodies.length > 1;
    if (!show) { this.labels.innerHTML = ''; this._labels = null; return; }
    this._labels = this._labels || new Map();
    const seen = new Set();
    for (const b of app.world.bodies) {
      seen.add(b.id);
      let el = this._labels.get(b.id);
      if (!el) {
        el = h('button', { class: 'label', onclick: () => app.select(b.id, true) });
        this.labels.appendChild(el);
        this._labels.set(b.id, el);
      }
      const wp = new THREE.Vector3(...b.pos);
      const p = r.project(wp);
      const sel = b.id === app.world.selectedId;
      const dist = r.camera.position.distanceTo(wp);
      const pixR = (b.radiusCache / Math.max(1e-3, dist)) * r.height / (2 * Math.tan((r.camera.fov * Math.PI) / 360));
      const visible = p.visible && pixR < Math.min(70, r.height * 0.08) && !r.cutaway;
      el.style.display = visible ? '' : 'none';
      if (!visible) continue;
      el.style.transform = `translate(${p.x.toFixed(0)}px, ${(p.y - pixR - 14).toFixed(0)}px)`;
      const badge = b.type === 'terrestrial' ? (sel ? ' · detailed' : ' · coarse') : '';
      el.textContent = (sel ? '◉ ' : '') + b.name + badge;
      el.classList.toggle('sel', sel);
    }
    for (const [id, el] of this._labels) if (!seen.has(id)) { el.remove(); this._labels.delete(id); }
    // de-overlap labels (selected first)
    const placed = [];
    const ordered = [...this._labels.entries()].sort((a, b) => (b[0] === app.world.selectedId) - (a[0] === app.world.selectedId));
    for (const [, el] of ordered) {
      if (el.style.display === 'none') continue;
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
      if (!m) continue;
      const x = +m[1], w2 = el.offsetWidth || 90;
      let y = +m[2];
      for (let k = 0; k < 4; k++) {
        const hit = placed.find((p) => Math.abs(p.y - y) < 18 && x - 40 < p.x + p.w - 40 && x - 40 + w2 > p.x - 40);
        if (!hit) break;
        y = hit.y + 19;
      }
      placed.push({ x, y, w: w2 });
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  // ---------- inspector ----------
  inspectCell(body, hit) {
    const s = body.surface;
    const c = hit.cell;
    const area = s.grid.omega[c] * s.ground[c] ** 2;
    const depth = s.head[c] - s.ground[c];
    const veg = [];
    for (let p = 0; p < PLANTS; p++) if (s.veg[c * PLANTS + p] > 0.02) veg.push(`${PLANT_TYPES[p].name} ${(s.veg[c * PLANTS + p] * 100).toFixed(0)}%`);
    const det = {};
    const suit = plantSuitability(body, c, 0, det);
    const rows = [
      ['Cell', `#${c} · lat ${(s.grid.lat[c] * 57.3).toFixed(0)}°`], ['Elevation', (s.bed[c] + s.sed[c]).toFixed(3) + ' u (vs Rs)'], ['Surface material', MATERIALS[s.mat[c]].name],
      ['Loose sediment', s.sed[c].toFixed(4) + ' u'], ['Hardness / porosity', `${MATERIALS[s.mat[c]].hardness} / ${MATERIALS[s.mat[c]].porosity}`],
      ['Water depth', depth.toFixed(3) + ' u'], ['Soil moisture', pct(s.sw[c] / (s.soilCapacity(c) + 1e-12))], ['Ice', (s.ice[c] / area).toFixed(4) + ' u'],
      ['Temperature', tempStr(this.app, s.temp[c])], ['Humidity / cloud', `${(s.vap[c] / area * 1000).toFixed(2)} / ${(s.cloud[c] / area * 1000).toFixed(2)} mu`],
      ['Wind', `${Math.hypot(s.windE[c], s.windN[c]).toFixed(1)} u/s`], ['Vegetation', veg.join(', ') || 'none'], ['Grass suitability', `${(suit * 100).toFixed(0)}% ${det.reason || ''}`],
      ['Organic / nutrients', `${(s.org[c] / area * 1000).toFixed(2)} / ${s.nut[c].toFixed(2)}`], ['Lava', s.lava[c] > 0 ? `${(s.lava[c] / area).toFixed(3)} u, T ${(s.lavaT[c] * 100).toFixed(0)}%` : 'none'],
      ['Fire / damage', `${(s.fire[c] * 100).toFixed(0)}% / ${(s.damage[c] * 100).toFixed(0)}%`],
    ];
    this.showInspector('🔍 Surface cell', rows);
  }

  inspectAgent(body, a) {
    const S = SPECIES[a.sp];
    const stage = a.age < S.mature ? 'juvenile' : a.age > a.lifespan * 0.8 ? 'elder' : 'adult';
    const pop = body.agents.filter((x) => x.sp === a.sp).length;
    const ev = body.events.filter((e) => e.text.includes(S.name)).slice(-3).map((e) => e.text).join(' · ');
    const rows = [
      ['Species', `${S.name} — ${S.desc}`], ['Age / stage', `${a.age.toFixed(0)} s / ${stage} (lifespan ~${a.lifespan.toFixed(0)} s)`], ['Health', pct(Math.max(0, a.health), 0)], ['Energy (hunger)', pct(Math.max(0, a.energy), 0)],
      ['State', a.state], ['Habitat suitability', `${((a.suit ?? 0) * 100).toFixed(0)}%${a.need ? ' — ' + a.need : ''}`], ['Needs', `${S.tMin}…${S.tMax}°C, ${S.habitat}, diet: ${S.diet}`],
      ['Population', `${pop} visible + ${Math.floor(body.reserve[a.sp])} aggregated`], ['Generation', a.gen], ['Recent events', ev || '—'],
    ];
    if (a.override) rows.unshift(['⚠', 'Placed with EXPERIMENTAL OVERRIDE']);
    this.showInspector('🔬 Life inspector', rows, a);
  }

  showInspector(title, rows, follow = null) {
    this.inspector.innerHTML = '';
    this.inspector.append(h('div', { class: 'insp-head' }, h('b', {}, title), h('button', { class: 'icon-btn', onclick: () => this.hideInspector() }, '✕')));
    const kv = h('div', { class: 'kv' });
    for (const [k, v] of rows) kv.appendChild(h('div', { class: 'kv-row' }, h('span', {}, k), h('b', {}, String(v))));
    this.inspector.appendChild(kv);
    this.inspector.classList.remove('hidden');
    this.inspectFollow = follow;
  }

  hideInspector() {
    this.inspector.classList.add('hidden');
    this.inspectFollow = null;
  }

  // ---------- settings ----------
  openSettings() {
    const app = this.app;
    const s = app.world.settings;
    const close = () => modal.remove();
    const modal = h('div', { class: 'modal', onclick: (e) => { if (e.target === modal) close(); } });
    const box = h('div', { class: 'modal-box' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, '⚙ Settings'), h('button', { class: 'icon-btn', onclick: close }, '✕')),
      h('div', { class: 'panel-body' },
        section('Display',
          h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Quality'), chips([{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }], { value: s.quality, onpick: (q) => app.setQuality(q) })),
          h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Temperature units'), chips([{ id: 'C', label: '°C' }, { id: 'F', label: '°F' }, { id: 'K', label: 'K' }], { value: s.units, onpick: (u) => { s.units = u; app.savePrefs(); } })),
          toggle({ label: 'Reduced motion', value: s.reducedMotion, onchange: (v) => { s.reducedMotion = v; app.savePrefs(); } }),
          slider({ label: 'Particle budget', min: 200, max: 3000, step: 100, value: s.maxParticles, fmt: (v) => v.toFixed(0), onchange: (v) => { s.maxParticles = v; app.savePrefs(); } }),
          toggle({ label: 'Diagnostics panel', value: this.diagOn, onchange: (v) => this.showDiag(v) }),
        ),
        section('Simulation',
          slider({ label: 'Weather intensity', min: 0, max: 3, step: 0.1, value: s.weather, fmt: (v) => '×' + v.toFixed(1), oninput: (v) => { s.weather = v; } }),
          slider({ label: 'Erosion intensity', min: 0, max: 10, step: 0.1, value: s.erosion, fmt: (v) => '×' + v.toFixed(1), oninput: (v) => { s.erosion = v; } }),
          toggle({ label: 'Natural life (colonisation)', value: s.naturalLife, onchange: (v) => { s.naturalLife = v; } }),
          toggle({ label: 'Automatic weather', value: s.autoWeather, onchange: (v) => { s.autoWeather = v; } }),
          slider({ label: 'Population cap (explicit agents)', min: 20, max: 400, step: 10, value: s.popCap, fmt: (v) => v.toFixed(0), onchange: (v) => { s.popCap = v; app.savePrefs(); } }),
        ),
        section('Audio', toggle({ label: 'Sound (wind, rain, pouring, thunder)', value: s.audio, onchange: (v) => { s.audio = v; app.audio.setEnabled(v); app.savePrefs(); } })),
        section('Help', h('div', { class: 'row' }, btn('🎓 Restart tutorial', () => { close(); app.tutorial.start(); }), btn('↺ Reset scene', () => { close(); app.resetScene(); }))),
      ),
    );
    modal.appendChild(box);
    this.root.appendChild(modal);
  }

  confirm(text, options) {
    return new Promise((resolve) => {
      const modal = h('div', { class: 'modal' });
      const box = h('div', { class: 'modal-box small' }, h('p', {}, text), h('div', { class: 'row' }, options.map((o) => btn(o.label, () => { modal.remove(); resolve(o.id); }, o.cls || ''))));
      modal.appendChild(box);
      this.root.appendChild(modal);
    });
  }
}

export { TABS, fmtNum };
