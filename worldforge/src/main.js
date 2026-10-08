// WORLDFORGE app controller: game loop, tools, actions, saves.
import './styles.css';
import { World } from './sim/world.js';
import { GameRenderer } from './render/renderer.js';
import { Input } from './input/input.js';
import { HUD, TOOL_INFO } from './ui/hud.js';
import { Tutorial } from './ui/tutorial.js';
import { storage } from './storage.js';
import { UndoStack } from './undo.js';
import { Audio } from './audio.js';
import { serializeWorld, validateAndLoad, serializeBody, deserializeBody } from './sim/save.js';
import { generateRelief, assignSkins, makeBodyFromKey, bumpId } from './sim/bodyhelpers.js';
import { RECIPE_KEYS } from './sim/materials.js';
import { BODY_PRESETS } from './sim/presets.js';
import { SPECIES } from './sim/life.js';

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];
const ORBIT_SPEEDS = [0, 0.25, 1, 4, 16, 50];

class App {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.uiRoot = document.getElementById('ui');
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const prefs = storage.pref('settings') || {};
    const quality = prefs.quality || (this.isTouch && Math.min(screen.width, screen.height) < 400 ? 'low' : this.isTouch ? 'medium' : 'medium');
    this.world = new World({ quality, units: prefs.units || 'C', reducedMotion: prefs.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches, audio: !!prefs.audio, popCap: prefs.popCap || (quality === 'low' ? 100 : 160), maxParticles: prefs.maxParticles || (quality === 'low' ? 700 : quality === 'high' ? 2000 : 1200) });
    this.tool = { id: 'view', size: 0.12, strength: 0.55, material: 'rock', plant: 0, species: 0, group: 3, biome: 'grassland', weather: 'tornado', intensity: 0.8, duration: 60, area: 1, heading: 0, speed: 0, cold: true, dry: false, lowAir: false, placePreset: 'moon' };
    this.stats = { poured: 0 };
    this.dirty = false;
    this.undoStack = new UndoStack(this.world);
    this.audio = new Audio();
    this.audio.enabled = this.world.settings.audio;
    this.world.loadScene('earthMoon');
    this.renderer = new GameRenderer(this.canvas, this.world);
    this.renderer.onContextLost = () => this.showOverlay('Graphics context lost — restoring…');
    this.renderer.onContextRestored = () => this.hideOverlay();
    this.ui = new HUD(this.uiRoot, this);
    this.tutorial = new Tutorial(this, this.uiRoot);
    this.input = new Input(this.canvas, this);
    this.world.on((type, data) => this.onWorld(type, data));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.autosave(true));
    this.resize();
    if (this.world.selected) this.renderer.focusBody(this.world.selected, 'planet', true);
    this.last = performance.now();
    this.fps = 60;
    this.frameMs = 16;
    this.timers = { panel: 0, top: 0, diag: 0, save: 0, tut: 0 };
    this.stroke = null;
    this.hoverPos = null;
    requestAnimationFrame((t) => this.frame(t));
    document.getElementById('loading')?.remove();
    if (!storage.pref('tutorialDone')) setTimeout(() => this.tutorial.start(), 600);
    this.checkAutosave();
    window.WF = { app: this, world: this.world };
  }

  // ---------------- loop ----------------
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    if (document.hidden) return;
    const t0 = performance.now();
    this.applyStroke(dt);
    this.world.step(dt);
    this.renderer.render(dt, this.world.transient);
    this.ui.updateLabels();
    const timers = this.timers;
    for (const k in timers) timers[k] += dt;
    if (timers.panel > 0.25) { timers.panel = 0; this.ui.refreshOpen(); this.ui.updateJobBar(); this.refreshInspector(); }
    if (timers.top > 0.5) { timers.top = 0; this.ui.refreshTop(); if (this.world.mode === 'terraform') this.ui.renderGoals(); }
    if (timers.tut > 0.5) { timers.tut = 0; this.tutorial.tick(); this.updateAudio(); }
    if (timers.diag > 0.5) { timers.diag = 0; this.updateDiag(); }
    if (timers.save > 60) { timers.save = 0; this.autosave(); }
    const ms = performance.now() - t0;
    this.frameMs += (ms - this.frameMs) * 0.1;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.resize(w, h);
  }

  onVisibility() {
    if (document.hidden) {
      this.autosave(true);
    } else {
      this.last = performance.now(); // no catch-up jump after resume
    }
  }

  onWorld(type, data) {
    if (type === 'goal') { this.toast(`🎯 Goal complete: ${data.name}! Unlocked: ${data.reward}`, 'good', 5000); this.ui.renderGoals(); this.dirty = true; }
    if (type === 'collision') this.toast(`💥 ${data.small} merged into ${data.big}. Mass conserved to ${(data.massError * 100).toExponential(1)}%.`, 'warn', 5000);
    if (type === 'storm') this.notify('storm');
  }

  // ---------------- tools ----------------
  setTool(id, opts = {}) {
    Object.assign(this.tool, opts);
    this.tool.id = id;
    this.ui.updateMode();
    if (TOOL_INFO[id]?.kind !== 'brush') this.renderer.brushPreview(null);
    this.notify('tool:' + id);
  }
  isBrushTool() {
    return TOOL_INFO[this.tool.id]?.kind === 'brush';
  }
  unitRadius() {
    const b = this.world.selected;
    return b ? b.radiusCache : 10;
  }

  brushHit(x, y) {
    const b = this.world.selected;
    if (!b) return { hit: null, msg: 'Select a body first.' };
    if (b.type !== 'terrestrial') {
      const p = this.renderer.pick(x, y, { agents: false });
      if (p.body === b) return { hit: p.hit };
      return { hit: null };
    }
    const hit = this.renderer.pickSurfaceAt(x, y, b);
    if (!hit) return { hit: null };
    const along = this.renderer.bodiesAlong(this.renderer.ray(x, y));
    const blocker = along.find((a) => a.body !== b && a.t < hit.t);
    return { hit, blocked: !!blocker, blocker: blocker?.body };
  }

  brushStart(x, y) {
    const b = this.world.selected;
    if (!b) return this.toast('Select or create a body first.', 'warn');
    this.pushUndo(this.tool.id === 'pour' || this.tool.id === 'drain' ? 'body' : 'body', TOOL_INFO[this.tool.id].name);
    this.stroke = { x, y, t: 0 };
    this.dirty = true;
  }
  brushMove(x, y) {
    if (this.stroke) { this.stroke.x = x; this.stroke.y = y; }
  }
  brushEnd(cancelled) {
    this.stroke = null;
    if (!this.hoverPos) this.renderer.brushPreview(null);
  }
  hover(p) {
    this.hoverPos = p;
    if (!this.isBrushTool() || this.stroke) return;
    if (!p) return this.renderer.brushPreview(null);
    const r = this.brushHit(p.x, p.y);
    this.renderer.brushPreview(r.hit, this.tool.size, TOOL_INFO[this.tool.id].color, r.blocked);
  }

  applyStroke(dt) {
    if (!this.stroke) return;
    const { x, y } = this.stroke;
    const r = this.brushHit(x, y);
    this.renderer.brushPreview(r.hit, this.tool.size, TOOL_INFO[this.tool.id].color, r.blocked);
    if (!r.hit) return;
    if (r.blocked) {
      if (!this.stroke.warned) { this.toast(`${r.blocker.name} is in front — edits never pass through another body.`, 'warn'); this.stroke.warned = true; }
      return;
    }
    const res = this.world.applyBrush(this.tool, r.hit, dt);
    if (this.tool.id === 'pour') this.stats.poured += dt;
    if (res && res.msg && (!this.stroke.lastMsg || this.stroke.lastMsg !== res.msg)) { this.stroke.lastMsg = res.msg; this.toast(res.msg, res.ok ? 'info' : 'warn'); }
  }

  tap(x, y) {
    const t = this.tool;
    const info = TOOL_INFO[t.id];
    const w = this.world;
    if (t.id === 'place') {
      const p = this.renderer.pick(x, y, { agents: false });
      if (p.type !== 'space' || !p.point) return this.toast('Tap empty space (not a body) to place it.', 'warn');
      this.pushUndo('system', 'Place body');
      try {
        const b = w.spawnBody(t.placePreset, { pos: p.point.toArray() });
        const parent = this.dominantFor(b);
        if (parent) { w.setOrbit(b, parent, {}); this.toast(`${b.name} placed and given a circular orbit around ${parent.name}. Change it in Orbits.`); }
        else this.toast(`${b.name} placed.`);
        this.notify('orbit-created');
        this.dirty = true;
      } catch (e) { this.toast(e.message, 'warn'); }
      return;
    }
    if (info.kind === 'view' || t.id === 'inspect') {
      const p = this.renderer.pick(x, y);
      if (p.type === 'agent') { this.ui.inspectAgent(p.body, p.agent); return; }
      if (p.type === 'surface' || p.type === 'body') {
        if (p.body.id !== w.selectedId) { this.select(p.body.id, false); this.toast(`Selected ${p.body.name}`); return; }
        if (t.id === 'inspect' && p.type === 'surface') { this.ui.inspectCell(p.body, p.hit); this.inspectCell = { body: p.body, hit: p.hit }; }
      }
      return;
    }
    // tap tools apply to the body under the finger (if not blocked)
    const p = this.renderer.pick(x, y, { agents: false });
    if (p.type !== 'surface' && p.type !== 'body') return this.toast('Tap a planet surface.', 'warn');
    if (p.blocked) return this.toast('Another body is in front of that point.', 'warn');
    if (p.body.id !== w.selectedId) this.select(p.body.id, false);
    this.pushUndo('body', info.name);
    const res = w.tapTool({ ...t, id: t.id }, p.hit);
    if (res.msg) this.toast(res.msg, res.ok ? 'good' : 'warn', 5000);
    if (res.ok) {
      this.dirty = true;
      if (t.id === 'animal' || t.id === 'biome' || t.id === 'experimental') this.notify('animal');
    } else this.undoStack.undoStack.pop();
  }

  dominantFor(b) {
    let best = null, ba = 0;
    for (const o of this.world.bodies) {
      if (o === b || o.massCache <= b.massCache) continue;
      const d2 = (o.pos[0] - b.pos[0]) ** 2 + (o.pos[1] - b.pos[1]) ** 2 + (o.pos[2] - b.pos[2]) ** 2;
      const a = o.massCache / d2;
      if (a > ba) { ba = a; best = o; }
    }
    return best;
  }

  // ---------------- actions ----------------
  select(id, focus) {
    this.world.selectedId = id;
    this.renderer.setSelected();
    const b = this.world.getBody(id);
    if (focus && b) this.renderer.focusBody(b, 'planet');
    else if (b && this.renderer.cam.view !== 'system') this.renderer.focusBody(b, this.renderer.cutaway ? 'cutaway' : 'planet');
    this.ui.refreshTop();
    this.ui.rebuildPanels();
  }
  setView(v) {
    this.renderer.setView(v);
    this.notify('view:' + v);
  }
  setOverlay(o) {
    this.world.settings.overlay = o;
    this.ui.refreshOpen();
  }
  togglePause() {
    this.world.settings.paused = !this.world.settings.paused;
    this.ui.refreshTop();
  }
  step() {
    this.world.stepOnce(1, 0.5);
    this.ui.refreshTop();
  }
  cycleSpeed(which) {
    const s = this.world.settings;
    if (which === 'surface') s.surfaceSpeed = SPEEDS[(SPEEDS.indexOf(s.surfaceSpeed) + 1) % SPEEDS.length] ?? 1;
    else s.orbitSpeed = ORBIT_SPEEDS[(ORBIT_SPEEDS.indexOf(s.orbitSpeed) + 1) % ORBIT_SPEEDS.length] ?? 1;
    this.ui.refreshTop();
    this.toast(which === 'surface' ? `Surface time (climate, water, erosion, life) ×${s.surfaceSpeed}` : `Orbital time ×${s.orbitSpeed}`);
  }
  pushUndo(kind, label) {
    const b = this.world.selected;
    this.undoStack.push(kind, label, b ? b.id : null);
    this.ui && this.ui.refreshTop();
  }
  undo() {
    const l = this.undoStack.undo();
    this.toast(l ? `Undid: ${l}` : 'Nothing to undo');
    this.ui.rebuildPanels();
    this.ui.refreshTop();
  }
  redo() {
    const l = this.undoStack.redo();
    this.toast(l ? `Redid: ${l}` : 'Nothing to redo');
    this.ui.rebuildPanels();
    this.ui.refreshTop();
  }
  notify(ev) {
    this.tutorial && this.tutorial.notify(ev);
  }
  toast(msg, kind, ms) {
    this.ui && this.ui.toast(msg, kind, ms);
  }
  storagePref(k, v) {
    return storage.pref(k, v);
  }
  savePrefs() {
    const s = this.world.settings;
    storage.pref('settings', { quality: s.quality, units: s.units, reducedMotion: s.reducedMotion, audio: s.audio, popCap: s.popCap, maxParticles: s.maxParticles });
  }
  setQuality(q) {
    this.world.settings.quality = q;
    this.world.settings.maxParticles = q === 'low' ? 700 : q === 'high' ? 2000 : 1200;
    this.renderer.applyPixelRatio();
    this.renderer.rebuildAll();
    this.resize();
    this.savePrefs();
    this.toast(`Quality: ${q}. Visual detail changed; simulation state is untouched.`);
  }

  async loadScene(key) {
    if (this.dirty) {
      const r = await this.ui.confirm('Save the current scene before replacing it?', [{ id: 'save', label: '💾 Save & switch', cls: 'primary' }, { id: 'switch', label: 'Switch without saving' }, { id: 'cancel', label: 'Cancel' }]);
      if (r === 'cancel') return;
      if (r === 'save') await this.saveNamed(`${this.world.sceneName} ${new Date().toLocaleString()}`);
    }
    this.showOverlay('Forging ' + key + '…');
    await new Promise((res) => setTimeout(res, 30));
    this.world.loadScene(key);
    this.undoStack.clear();
    this.dirty = false;
    this.renderer.syncViews();
    const sel = this.world.selected;
    if (sel) this.renderer.focusBody(sel, 'planet');
    else this.renderer.setView('system');
    if (this.world.pendingTool) { this.setTool(this.world.pendingTool); this.world.pendingTool = null; }
    else this.setTool('view');
    this.ui.rebuildPanels();
    this.ui.refreshTop();
    this.ui.renderGoals();
    this.hideOverlay();
    this.notify('scene');
    if (key === 'floodLab') this.toast('Flood Lab: Pour water is armed — drag on the mountains. Water → Run erosion experiment for the accelerated test.', 'info', 7000);
    if (key === 'blank') this.toast('Blank Forge: open ✨ Presets → Body presets to create your first body.', 'info', 7000);
    if (key === 'mars') this.toast('Terraform Mars: goals are tracked from real measurements (top-right).', 'info', 6000);
  }
  resetScene() {
    const key = this.world.sceneKey in { earthMoon: 1, sunEarthMoon: 1, saturn: 1, solar: 1, mars: 1, floodLab: 1, stormWorld: 1, blank: 1 } ? this.world.sceneKey : 'earthMoon';
    this.dirty = false;
    this.loadScene(key);
  }
  resetBody(b) {
    if (!b.presetKey) return this.toast('This body has no preset to reset to (custom). Use Undo instead.', 'warn');
    this.pushUndo('body', 'Reset body');
    const nb = makeBodyFromKey(b.presetKey, { quality: this.world.settings.quality, name: b.name });
    nb.id = b.id;
    nb.pos = b.pos.slice(); nb.vel = b.vel.slice(); nb.parentId = b.parentId;
    nb.clock = {};
    const i = this.world.bodies.indexOf(b);
    this.world.bodies[i] = nb;
    nb.waterBaseline = nb.waterTotal();
    this.world.emit('bodies');
    this.ui.rebuildPanels();
    this.toast(`${nb.name} reset to its preset.`);
  }
  duplicateBody(b) {
    if (this.world.bodies.length >= this.world.settings.maxBodies) return this.toast('Body limit reached.', 'warn');
    this.pushUndo('system', 'Duplicate');
    const data = serializeBody(b);
    data.id = Math.max(...this.world.bodies.map((x) => x.id)) + 1;
    data.name = b.name + ' II';
    const nb = deserializeBody(data, { popCap: this.world.settings.popCap });
    nb.clock = {};
    const parent = this.world.getBody(b.parentId);
    this.world.addBody(nb);
    if (parent) {
      const d = this.world.safeOrbitDistance(parent, nb, Math.hypot(b.pos[0] - parent.pos[0], b.pos[2] - parent.pos[2]) * 1.4);
      const ang = Math.atan2(b.pos[2] - parent.pos[2], b.pos[0] - parent.pos[0]) + Math.PI;
      nb.pos = [parent.pos[0] + Math.cos(ang) * d, parent.pos[1], parent.pos[2] + Math.sin(ang) * d];
      this.world.setOrbit(nb, parent, {});
    } else {
      nb.pos = [b.pos[0] + b.radiusCache * 5, b.pos[1], b.pos[2]];
      this.world.setOrbit(nb, b, {});
    }
    nb.waterBaseline = nb.waterTotal() - nb.ledger.source + nb.ledger.sink + nb.ledger.escaped - nb.ledger.forced;
    this.dirty = true;
    this.toast(`Duplicated ${b.name}.`);
  }
  async deleteBody(b) {
    const r = await this.ui.confirm(`Delete ${b.name}? (Undo can restore it.)`, [{ id: 'yes', label: 'Delete', cls: 'danger' }, { id: 'no', label: 'Cancel' }]);
    if (r !== 'yes') return;
    this.pushUndo('system', 'Delete body');
    this.world.removeBody(b.id);
    this.renderer.syncViews();
    const sel = this.world.selected;
    if (sel) this.renderer.focusBody(sel, 'planet');
    else this.renderer.setView('system');
    this.ui.rebuildPanels();
    this.dirty = true;
  }
  addPresetBody(key) {
    const w = this.world;
    const star = w.stars()[0];
    const sel = w.selected;
    const p = BODY_PRESETS[key];
    try {
      this.pushUndo('system', 'Add body');
      let b;
      if (!w.bodies.length) {
        b = w.spawnBody(key, { pos: [0, 0, 0] });
      } else if (p.type === 'star') {
        if (star) return this.toast('This scene already has a star; add a planet instead.', 'warn');
        const ext = this.renderer.systemExtent();
        b = w.spawnBody(key, { pos: [-(ext + 900), 0, 0] });
        const target = sel || w.bodies[0];
        // put the existing system in orbit around the new star
        for (const o of w.bodies) if (o !== b && (!o.parentId || o === target)) w.setOrbit(o, b, {});
        this.toast('Star added; the existing system now orbits it.');
      } else if (star && (p.type === 'gas' || key === 'earth' || key === 'mars' || key === 'venus' || key === 'mercury' || key === 'ocean' || key === 'lava' || key === 'frozen' || key === 'rocky')) {
        return this.addPlanetToStar(key);
      } else if (sel) {
        b = w.spawnBody(key, { parentId: sel.id });
      } else {
        b = w.spawnBody(key, { pos: [0, 0, 0] });
      }
      if (b) {
        this.select(b.id, true);
        this.toast(`${b.name} forged.`);
        this.notify('orbit-created');
      }
      this.dirty = true;
    } catch (e) { this.toast(e.message, 'warn'); }
  }
  addMoon(key) {
    const w = this.world;
    const sel = w.selected;
    if (!sel) return this.toast('Select a planet first.', 'warn');
    try {
      this.pushUndo('system', 'Add moon');
      const b = w.spawnBody(key, { parentId: sel.id, radius: Math.min(BODY_PRESETS[key].type === 'terrestrial' ? sel.radiusCache * 0.35 : 3, 4), name: key === 'moon' ? `${sel.name} moon` : undefined });
      this.toast(`${b.name} placed in a circular orbit around ${sel.name} (clearance from radii).`);
      this.notify('orbit-created');
      this.dirty = true;
    } catch (e) { this.toast(e.message, 'warn'); }
  }
  addPlanetToStar(key) {
    const w = this.world;
    const star = w.stars()[0];
    if (!star) return this.toast('No star in this scene. Add a Sun-inspired star first (Presets → Body presets).', 'warn');
    try {
      this.pushUndo('system', 'Add planet');
      let maxD = 0;
      for (const o of w.bodies) if (o.parentId === star.id) maxD = Math.max(maxD, Math.hypot(o.pos[0] - star.pos[0], o.pos[2] - star.pos[2]));
      const b = w.spawnBody(key, { parentId: star.id, distance: Math.max(400, maxD * 1.35 + 150) });
      this.select(b.id, true);
      this.toast(`${b.name} now orbits ${star.name}.`);
      this.notify('orbit-created');
      this.dirty = true;
    } catch (e) { this.toast(e.message, 'warn'); }
  }
  autoOrbit(parentId, e, dir) {
    const w = this.world;
    const b = w.selected, p = w.getBody(parentId);
    if (!b || !p) return this.toast('Choose a parent body.', 'warn');
    const d = Math.hypot(b.pos[0] - p.pos[0], b.pos[1] - p.pos[1], b.pos[2] - p.pos[2]);
    if (d < (b.radiusCache + p.radiusCache) * 1.3) return this.toast('Too close to the parent for a safe orbit.', 'warn');
    this.pushUndo('orbit', 'Set orbit');
    w.setOrbit(b, p, { e, dir });
    b.trail = [];
    this.toast(`Initial velocity set for ${e > 0 ? 'an eccentric' : 'a circular'} ${dir < 0 ? 'retrograde ' : ''}orbit around ${p.name}. Gravity does the rest.`);
    this.notify('orbit-created');
    this.dirty = true;
  }
  restabilize() {
    const b = this.world.selected;
    if (!b) return;
    this.pushUndo('orbit', 'Re-stabilize');
    if (this.world.restabilize(b)) this.toast('Velocity reset to circular — an explicit player intervention.');
    else this.toast('No parent to stabilize around.', 'warn');
  }
  nudge(kind) {
    const b = this.world.selected;
    if (!b) return;
    this.pushUndo('orbit', 'Velocity change');
    this.world.nudge(b, kind, 0.05);
    this.dirty = true;
  }
  regenerateTerrain(b, seed, roughness) {
    if (!b.surface) return;
    this.pushUndo('body', 'Regenerate terrain');
    b.seed = seed | 0;
    b.roughness = roughness;
    const s = b.surface;
    const relief = generateRelief(s, b.gen || {}, b.seed, roughness);
    const scale = (b.gen?.relief ?? 0.05) * s.Rs * roughness;
    let W = 0;
    for (let i = 0; i < s.count; i++) { s.bed[i] = relief[i] * scale; s.sed[i] = 0; s.baseE[i] = s.bed[i]; W += s.w[i]; s.susp[i] = 0; }
    s.solveRs(b.solidVolume());
    assignSkins(b);
    s.fillToLevel(W);
    s.version++;
    b.updateCaches();
    this.toast('Terrain regenerated (inventories kept; water re-levelled).');
    this.dirty = true;
  }
  resizeBody(b, R) {
    const rep = b.compositionReport();
    this.pushUndo('body', 'Resize');
    this.world.startRecipe(b, rep.volumeFractions, (4 / 3) * Math.PI * R ** 3);
    this.toast(`Resizing to radius ≈ ${R.toFixed(1)}: material streams in/out with the same recipe.`);
    this.dirty = true;
  }
  erosionExperiment() {
    const b = this.world.selected;
    if (!b || !b.surface) return this.toast('Select a terrestrial body (Flood Lab is ideal).', 'warn');
    this.pushUndo('body', 'Erosion experiment');
    const ex = this.world.startErosionExperiment(b);
    this.ui.refreshTop();
    // look at the spring
    const r = this.renderer;
    r.startBlend(false);
    r.cam.bodyId = b.id;
    r.cam.view = 'surface';
    const v = r.views.get(b.id);
    const d = ex.dir;
    r.cam.anchorLocal = new (r.camera.position.constructor)(d[0], d[1], d[2]).multiplyScalar(v.surfaceAt(d[0], d[1], d[2]));
    r.cam.dist = b.surface.Rs * 0.35;
    r.cam.pitch = 0.75;
    r.cutaway = false;
    this.toast('Erosion experiment running: spring on the highest peak, erosion ×6, surface time ×8. Toggle the Sediment overlay to see deposits.', 'info', 7000);
  }
  channelDepth(b) {
    const s = b.surface;
    let m = 0;
    for (let i = 0; i < s.count; i++) m = Math.max(m, s.baseE[i] - (s.bed[i] + s.sed[i]));
    return m;
  }

  // ---------------- saves ----------------
  async saveNamed(name) {
    const data = serializeWorld(this.world, name);
    const r = await storage.put(name, data);
    if (r.ok) { this.toast(`Saved "${name}" (${(r.bytes / 1024).toFixed(0)} KB, ${r.where}).`, 'good'); this.dirty = false; this.ui.setSaveState('💾 saved'); }
    else this.toast('Save failed: ' + r.error, 'warn', 6000);
    return r;
  }
  async autosave(sync = false) {
    if (!this.dirty && !sync) return;
    try {
      const r = await storage.put('__autosave', serializeWorld(this.world, 'Autosave'));
      this.ui.setSaveState(r.ok ? `⟳ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '⚠ no storage');
    } catch (e) {
      this.ui.setSaveState('⚠ no storage');
    }
  }
  async checkAutosave() {
    try {
      const names = await storage.list();
      if (names.includes('__autosave')) this.ui.setSaveState('⟳ autosave available');
    } catch (e) { /* ignore */ }
  }
  listSaves() {
    return storage.list();
  }
  async loadNamed(name) {
    const txt = await storage.get(name);
    if (!txt) return this.toast('Save not found or storage unavailable.', 'warn');
    this.loadData(txt, name);
  }
  deleteSave(name) {
    return storage.remove(name);
  }
  loadData(txt, label) {
    try {
      validateAndLoad(this.world, txt);
      this.undoStack.clear();
      this.renderer.syncViews();
      const sel = this.world.selected;
      if (sel) this.renderer.focusBody(sel, 'planet', true);
      this.ui.rebuildPanels();
      this.ui.refreshTop();
      this.ui.renderGoals();
      this.dirty = false;
      this.toast(`Loaded ${label === '__autosave' ? 'autosave' : '"' + label + '"'}.`, 'good');
    } catch (e) {
      this.toast('Load rejected: ' + e.message, 'warn', 7000);
    }
  }
  exportJSON() {
    const data = serializeWorld(this.world, this.world.sceneName);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `worldforge-${this.world.sceneKey}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    this.toast('Exported world JSON.');
  }
  importFile(file) {
    if (file.size > 60 * 1024 * 1024) return this.toast('File too large.', 'warn');
    const fr = new FileReader();
    fr.onload = () => this.loadData(String(fr.result), file.name);
    fr.onerror = () => this.toast('Could not read file.', 'warn');
    fr.readAsText(file);
  }

  // ---------------- misc ----------------
  refreshInspector() {
    const f = this.ui.inspectFollow;
    if (f && this.ui.inspector && !this.ui.inspector.classList.contains('hidden')) {
      const b = this.world.selected;
      if (b && b.agents.includes(f)) this.ui.inspectAgent(b, f);
      else if (b) this.ui.showInspector('🔬 Life inspector', [['Status', `This ${SPECIES[f.sp].name} has died (${f.cause || 'unknown'}).`]]);
    }
  }
  updateAudio() {
    if (!this.audio.enabled) return;
    const b = this.world.selected;
    if (!b || !b.surface) return this.audio.update({});
    const s = b.surface;
    let rain = 0, wind = 0, n = 0;
    for (let i = 0; i < s.count; i += 11) { rain += s.precip[i]; wind += Math.hypot(s.windE[i], s.windN[i]); n++; }
    const near = this.renderer.camDist < b.radiusCache * 3 ? 1 : 0.3;
    this.audio.update({ rain: Math.min(1, (rain / n) * 400) * near, wind: Math.min(1, wind / n / 8 + (b.storms.some((x) => x.type === 'tornado' || x.type === 'hurricane') ? 0.5 : 0)) * near, pour: this.stroke && (this.tool.id === 'pour' || this.tool.id === 'pourlava') ? 0.8 : 0, rumble: b.vents?.length ? 0.15 : 0 });
    for (const e of this.world.transient) if (e.type === 'lightning' && !e._aud) { e._aud = true; this.audio.thunder(); }
  }
  updateDiag() {
    if (!this.ui.diagOn) return;
    const w = this.world;
    const b = w.selected;
    const rs = this.renderer.statsAll();
    let cells = 0, agents = 0, reserve = 0;
    for (const x of w.bodies) { if (x.surface) cells += x.surface.count; agents += x.agents.length; reserve += x.reserve.reduce((a, c) => a + c, 0); }
    const cons = b ? w.conservation(b) : null;
    this.ui.updateDiag([
      ['FPS', this.fps.toFixed(0)], ['Frame (JS)', this.frameMs.toFixed(1) + ' ms'], ['Draw calls', rs.calls], ['Triangles', (rs.triangles / 1000).toFixed(0) + 'k'],
      ['Surface cells', `${b && b.surface ? b.surface.count : 0} detailed / ${cells} total`], ['Agents (explicit)', agents], ['Aggregated pop.', Math.floor(reserve)], ['Plants drawn', rs.plants], ['Particles', rs.particles],
      ['Water cons. error', cons ? cons.waterError.toExponential(1) : '—'], ['Solid cons. error', cons ? cons.solidError.toExponential(1) : '—'],
      ['Surface time', w.time.surface.toFixed(0) + ' s' + (w.dilation.surface < 1 ? ' (limited)' : '')], ['Orbit time', w.time.orbit.toFixed(0) + ' s' + (w.dilation.orbit < 1 ? ' (limited)' : '')],
      ['Bodies', w.bodies.length], ['Pixel ratio', this.renderer.renderer.getPixelRatio().toFixed(2)], ['Quality', w.settings.quality],
    ]);
  }
  showOverlay(text) {
    let o = document.getElementById('overlay');
    if (!o) { o = document.createElement('div'); o.id = 'overlay'; document.body.appendChild(o); }
    o.textContent = text;
    o.style.display = 'flex';
  }
  hideOverlay() {
    const o = document.getElementById('overlay');
    if (o) o.style.display = 'none';
  }
  openPanel(id, scroll) {
    this.ui.openPanel(id, scroll);
  }
}

function boot() {
  try {
    new App();
  } catch (e) {
    console.error(e);
    const l = document.getElementById('loading');
    if (l) l.innerHTML = `<div class="err"><b>WORLDFORGE could not start.</b><br>${String(e.message || e)}<br><small>WebGL is required. Try reloading or another browser.</small></div>`;
  }
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();

export { RECIPE_KEYS, bumpId };
