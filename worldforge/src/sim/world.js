// World: bodies, fixed-step scheduler with per-module rates, player tools,
// collisions and conservation bookkeeping. No rendering imports.
import { RNG } from './rng.js';
import { waterStep, settleBasins, thermalStep, lavaStep, removeSolid, depositSolid, iceStep } from './water.js';
import { climateStep } from './climate.js';
import { stormsStep, createStorm, checkStorm, headingVel, gasSpotsStep, STORM_TYPES } from './storms.js';
import { vegetationStep, animalStep, reserveStep, seedPlants, dropAnimals, BIOMES, PLANT_TYPES, SPECIES, makeAgent, speciesSuitability } from './life.js';
import { leapfrog, ORBIT_DT, dominantParent, orbitVelocity, mergeInfo, orbitalElements } from './orbits.js';
import { sculpt, pour, landPackets, drain, brushCells, resolveSolid } from './tools.js';
import { makeRecipeJob, stepRecipeJob } from './transition.js';
import { buildScene, makeBody, BODY_PRESETS, balanceMomentum, AU, spinUpClimate } from './presets.js';
import { newGoalState, evaluateGoals, GOALS } from './goals.js';
import { SOLID_KEYS } from './materials.js';
import { G, resetIds } from './body.js';
import { PLANTS } from './surface.js';

export const DEFAULT_SETTINGS = {
  quality: 'medium',
  popCap: 160,
  erosion: 1,
  weather: 1,
  naturalLife: true,
  autoWeather: true,
  units: 'C',
  reducedMotion: false,
  audio: false,
  surfaceSpeed: 1,
  orbitSpeed: 1,
  paused: false,
  showTrails: true,
  showPredict: true,
  showVectors: false,
  maxBodies: 12,
  overlay: 'none',
  experimentalOverride: false,
  stormForced: false,
  maxParticles: 1200,
};

const RATES = {
  // detailed (selected) body intervals in surface-seconds
  detail: { water: 0.1, settle: 1.0, thermal: 0.5, lava: 0.25, climate: 0.5, storms: 0.2, veg: 1.0, animals: 0.2, reserve: 1.0, job: 0.25, goals: 1.0 },
  coarse: { water: 0.5, settle: 2.0, thermal: 4.0, lava: 1.0, climate: 2.0, storms: 1.0, veg: 4.0, animals: 1.0, reserve: 4.0, job: 0.5, goals: 1.0 },
};
const MAX_STEPS = { water: 4, settle: 1, thermal: 1, lava: 2, climate: 2, storms: 3, veg: 1, animals: 3, reserve: 1, job: 2, goals: 1 };

export class World {
  constructor(settings = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.seed = 12345;
    this.rng = new RNG(this.seed);
    this.bodies = [];
    this.time = { surface: 0, orbit: 0, real: 0 };
    this.jobs = [];
    this.selectedId = null;
    this.virtualSun = { dir: [1, 0, 0], flux: 1 };
    this.mode = 'sandbox';
    this.goals = newGoalState();
    this.unlocks = [];
    this.transient = []; // render events (lightning, impacts)
    this.dilation = { surface: 1, orbit: 1 };
    this.experiment = null;
    this.sceneKey = 'blank';
    this.sceneName = 'Blank Forge';
    this.listeners = new Set();
    this.lastCollision = null;
    this.orbitAcc = 0;
    this._acc = new Float64Array(64 * 3);
  }

  emit(type, data) {
    for (const l of this.listeners) l(type, data);
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get selected() {
    return this.bodies.find((b) => b.id === this.selectedId) || null;
  }
  getBody(id) {
    return this.bodies.find((b) => b.id === id) || null;
  }

  addBody(b) {
    if (this.bodies.length >= this.settings.maxBodies) throw new Error(`Body limit (${this.settings.maxBodies}) reached`);
    b.updateCaches();
    b.clock = {};
    b.waterBaseline = b.waterTotal();
    this.bodies.push(b);
    this.emit('bodies');
    return b;
  }

  removeBody(id) {
    const i = this.bodies.findIndex((b) => b.id === id);
    if (i < 0) return;
    const [b] = this.bodies.splice(i, 1);
    for (const o of this.bodies) if (o.parentId === id) o.parentId = null;
    this.jobs = this.jobs.filter((j) => j.bodyId !== id);
    if (this.selectedId === id) this.selectedId = this.bodies[0]?.id ?? null;
    this.emit('bodies', { removed: b });
  }

  clear() {
    for (const b of this.bodies) this.emit('bodies', { removed: b });
    this.bodies = [];
    this.jobs = [];
    this.transient = [];
    this.experiment = null;
    this.time = { surface: 0, orbit: 0, real: 0 };
    this.orbitAcc = 0;
    this.stormDemo = false;
    this.pendingTool = null;
  }

  loadScene(key, seed) {
    this.clear();
    resetIds(1);
    if (seed !== undefined) this.seed = seed;
    this.rng = new RNG(this.seed);
    this.mode = key === 'mars' ? 'terraform' : this.mode === 'terraform' ? 'terraform' : 'sandbox';
    this.goals = newGoalState();
    buildScene(this, key);
    for (const b of this.bodies) { b.clock = {}; b.waterBaseline = b.waterTotal(); }
    if (this.stormDemo) this.startStormDemo();
    this.emit('scene', key);
    this.emit('bodies');
  }

  startStormDemo() {
    const b = this.selected;
    if (!b) return;
    const s = b.surface;
    // hurricane over warm ocean, tornado on the largest island
    let ocean = -1, land = -1, bestLand = -Infinity;
    s.computeHeads();
    for (let i = 0; i < s.count; i++) {
      const lat = s.grid.lat[i];
      const d = s.head[i] - s.ground[i];
      if (ocean < 0 && d > 0.15 && lat > 0.2 && lat < 0.35) ocean = i;
      if (d <= 0 && Math.abs(lat) < 0.6 && s.bed[i] > bestLand && s.bed[i] < s.Rs * 0.02) { bestLand = s.bed[i]; land = i; }
    }
    const g = s.grid;
    const dirOf = (c) => [g.dir[c * 3], g.dir[c * 3 + 1], g.dir[c * 3 + 2]];
    if (ocean >= 0) {
      const st = createStorm(b, 'hurricane', dirOf(ocean), { natural: false, forced: false, intensity: 0.8, duration: 240, vel: headingVel(dirOf(ocean), Math.PI * 0.9, 0.006) });
      if (st) st.note = 'Natural: strengthens over warm ocean, weakens over land.';
    }
    if (land >= 0) {
      createStorm(b, 'tornado', dirOf(land), { forced: true, intensity: 1, duration: 60, vel: headingVel(dirOf(land), 0.3, 0.012), note: 'Forced demo tornado' });
    }
    this.stormDemoCells = { ocean, land };
  }

  // ---------------- star environment ----------------
  stars() {
    return this.bodies.filter((b) => b.type === 'star');
  }

  // Returns sun direction in planet-local coords and flux relative to Earth.
  starEnv(body) {
    const stars = this.stars().filter((s) => s !== body);
    let dirW, flux = 0;
    if (stars.length) {
      let best = null, bf = -1;
      for (const st of stars) {
        const dx = st.pos[0] - body.pos[0], dy = st.pos[1] - body.pos[1], dz = st.pos[2] - body.pos[2];
        const d = Math.max(st.radiusCache + 1, Math.hypot(dx, dy, dz));
        const f = st.star.luminosity * (AU / d) ** 2;
        flux += f;
        if (f > bf) { bf = f; best = [dx / d, dy / d, dz / d]; }
      }
      dirW = best;
    } else if (this.virtualSun) {
      dirW = this.virtualSun.dir;
      flux = this.virtualSun.flux;
    } else {
      dirW = [1, 0, 0];
      flux = 0;
    }
    return { sunDir: worldToLocalDir(body, dirW), sunDirWorld: dirW, flux };
  }

  // ---------------- main step ----------------
  step(realDt) {
    realDt = Math.min(Math.max(realDt, 0), 0.1); // never catch up big gaps (background/resume)
    this.time.real += realDt;
    if (this.settings.paused) return;
    this.stepOrbits(realDt * this.settings.orbitSpeed);
    this.stepSurface(realDt * this.settings.surfaceSpeed);
  }

  // Manual step: advance a controlled interval even while paused.
  stepOnce(surfaceDt = 1, orbitDt = 0.5) {
    this.stepOrbits(orbitDt, true);
    const n = Math.ceil(surfaceDt / 0.25);
    for (let k = 0; k < n; k++) this.stepSurface(surfaceDt / n, true);
  }

  stepOrbits(dt, unbounded = false) {
    if (dt <= 0 || this.bodies.length === 0) return;
    this.orbitAcc += dt;
    const maxSteps = unbounded ? 100000 : 360;
    let steps = 0;
    if (this._acc.length < this.bodies.length * 3) this._acc = new Float64Array(this.bodies.length * 3 + 12);
    while (this.orbitAcc >= ORBIT_DT && steps < maxSteps) {
      const hits = leapfrog(this.bodies, ORBIT_DT, this._acc);
      this.orbitAcc -= ORBIT_DT;
      this.time.orbit += ORBIT_DT;
      steps++;
      if (hits.length) {
        const [i, j] = hits[0];
        this.handleCollision(this.bodies[i], this.bodies[j]);
        if (this._acc.length < this.bodies.length * 3) this._acc = new Float64Array(this.bodies.length * 3 + 12);
      }
    }
    if (this.orbitAcc >= ORBIT_DT) {
      this.dilation.orbit = steps * ORBIT_DT / Math.max(dt, 1e-9);
      this.orbitAcc = 0;
    } else this.dilation.orbit = 1;
    // trails (relative to parent) and parent tracking
    this._trailT = (this._trailT || 0) + dt;
    if (this._trailT > 0.25) {
      this._trailT = 0;
      for (const b of this.bodies) {
        const p = dominantParent(b, this.bodies);
        b.parentId = p ? p.id : null;
        b.trail = b.trail || [];
        const rel = p ? [b.pos[0] - p.pos[0], b.pos[1] - p.pos[1], b.pos[2] - p.pos[2]] : b.pos.slice();
        b.trail.push(rel);
        if (b.trail.length > 240) b.trail.shift();
        b.trailParent = p ? p.id : null;
      }
    }
  }

  stepSurface(dtS, manual = false) {
    if (dtS <= 0) return;
    dtS = Math.min(dtS, manual ? 2 : 3);
    this.time.surface += dtS;
    const sel = this.selected;
    let limited = false;
    for (const b of this.bodies) {
      // spin and vents run on surface time
      if (b.spinPeriod) b.spinAngle = (b.spinAngle + (2 * Math.PI * dtS) / b.spinPeriod) % (Math.PI * 2);
      if (b.type === 'gas') { gasSpotsStep(b, dtS); continue; }
      if (b.type === 'star' || !b.surface) continue;
      const detail = b === sel || b.forceDetail;
      b.coarse = !detail;
      const rates = detail ? RATES.detail : RATES.coarse;
      const speedScale = Math.max(1, Math.min(3, this.settings.surfaceSpeed / 4));
      const clock = b.clock || (b.clock = {});
      const env = this.starEnv(b);
      landPackets(b, this.time.surface, () => resolveSolid(b));
      for (const mod of Object.keys(rates)) {
        const interval = rates[mod] * (mod === 'water' || mod === 'climate' ? speedScale : 1);
        clock[mod] = (clock[mod] || 0) + dtS;
        let steps = 0;
        const maxS = manual ? 1000 : MAX_STEPS[mod] * (detail ? 1 : 1);
        while (clock[mod] >= interval && steps < maxS) {
          clock[mod] -= interval;
          steps++;
          this.runModule(mod, b, interval, env);
        }
        if (clock[mod] >= interval) {
          clock[mod] = 0;
          if (detail) limited = true;
        }
      }
    }
    this.dilation.surface = limited ? 0.5 : 1;
  }

  runModule(mod, b, dt, env) {
    const st = this.settings;
    const envFull = {
      time: this.time.surface, rng: this.rng, weather: st.weather, autoWeather: st.autoWeather,
      popCap: st.popCap, naturalLife: st.naturalLife, night: false,
    };
    switch (mod) {
      case 'water':
        this.sources(b, dt);
        waterStep(b, dt, { erosion: st.erosion });
        break;
      case 'settle':
        settleBasins(b, 0.35);
        break;
      case 'thermal':
        thermalStep(b, dt, st.erosion);
        iceStep(b, dt);
        break;
      case 'lava':
        lavaStep(b, dt);
        break;
      case 'climate':
        climateStep(b, dt, { sunDir: env.sunDir, flux: env.flux, weather: st.weather });
        break;
      case 'storms': {
        const ev = stormsStep(b, dt, envFull);
        if (ev.length) this.transient.push(...ev.map((e) => ({ ...e, t: this.time.real })));
        if (this.transient.length > 40) this.transient.splice(0, this.transient.length - 40);
        break;
      }
      case 'veg':
        vegetationStep(b, dt, envFull);
        break;
      case 'animals': {
        // night: sun below horizon at the herd location is evaluated per-agent in render; global approx here
        animalStep(b, dt, envFull);
        break;
      }
      case 'reserve':
        reserveStep(b, dt, envFull);
        break;
      case 'job':
        for (const j of this.jobs) if (j.bodyId === b.id && !j.done && !j.cancelled) {
          const fin = stepRecipeJob(j, b, dt, this.time.surface);
          if (fin) { b.logEvent(this.time.surface, 'Composition reconfiguration complete.'); this.emit('job', j); }
        }
        this.jobs = this.jobs.filter((j) => !(j.done && this.time.real - (j.finishedAt ?? (j.finishedAt = this.time.real)) > 4) && !j.cancelled);
        break;
      case 'goals':
        if (b === this.selected && this.mode === 'terraform') {
          const done = evaluateGoals(this, b, dt);
          for (const id of done) {
            const g = GOALS.find((x) => x.id === id);
            if (!this.unlocks.includes(g.reward)) this.unlocks.push(g.reward);
            this.emit('goal', g);
          }
        }
        break;
    }
  }

  // Lava vents and the erosion-experiment spring.
  sources(b, dt) {
    const s = b.surface;
    if (b.vents && b.vents.length) {
      for (const v of b.vents) {
        const act = 0.5 + 0.5 * Math.sin(this.time.surface * 0.05 + v.phase);
        if (act < 0.35) continue;
        const c = s.grid.cellOf(v.dir[0], v.dir[1], v.dir[2]);
        const vol = v.rate * act * dt * 0.2;
        const heat = s.lava[c] * s.lavaT[c] + vol;
        s.lava[c] += vol;
        s.lavaT[c] = heat / s.lava[c];
        b.lavaLedger.source += vol;
      }
    }
    const ex = this.experiment;
    if (ex && ex.bodyId === b.id && this.time.surface < ex.until) {
      pour(b, 'water', ex.dir, ex.radius, ex.rate, dt, this.time.surface, { height: 0.6 });
    }
  }

  // ---------------- tools ----------------
  // Continuous brush application. hit: { bodyId, dir (local unit) }.
  applyBrush(tool, hit, dt) {
    const b = this.getBody(hit.bodyId);
    if (!b) return { ok: false, msg: 'No body' };
    if (!validDir(hit.dir) || !(dt >= 0 && dt < 10)) return { ok: false, msg: 'Invalid target' };
    const size = tool.size, strength = tool.strength;
    if (b.type !== 'terrestrial') return this.applyToNonTerrestrial(b, tool, dt);
    switch (tool.id) {
      case 'raise': case 'lower': case 'smooth': case 'remove':
        if (tool.id === 'remove') this.removeTopLayers(b, hit.dir, size, strength, dt);
        sculpt(b, tool.id === 'remove' ? 'lower' : tool.id, hit.dir, size, strength * (tool.id === 'remove' ? 0.6 : 1), dt, tool.material);
        return { ok: true };
      case 'paint':
        if (tool.material === 'water' || tool.material === 'lava' || tool.material === 'ice') {
          pour(b, tool.material, hit.dir, size, strength * 2.5 * (b.surface.Rs / 10) ** 2, dt, this.time.surface);
        } else sculpt(b, 'paint', hit.dir, size, strength, dt, tool.material);
        return { ok: true };
      case 'addmat':
        pour(b, tool.material, hit.dir, size, strength * 1.2 * (b.surface.Rs / 10) ** 2, dt, this.time.surface);
        return { ok: true };
      case 'pour':
        pour(b, 'water', hit.dir, size, strength * 4 * (b.surface.Rs / 10) ** 2, dt, this.time.surface);
        return { ok: true };
      case 'pourlava':
        pour(b, 'lava', hit.dir, size, strength * 2 * (b.surface.Rs / 10) ** 2, dt, this.time.surface);
        return { ok: true };
      case 'drain':
        drain(b, hit.dir, size, strength * 6 * (b.surface.Rs / 10) ** 2, dt);
        return { ok: true };
      case 'seed': {
        const { cells, wts, sum } = brushCells(b.surface, hit.dir, size);
        const nw = Array.from(wts, (w) => w / (sum / cells.length));
        const r = seedPlants(b, cells, nw, tool.plant, 0.6 * strength * dt, this.settings.experimentalOverride);
        return { ok: r.planted > 0, msg: r.planted === 0 ? `${PLANT_TYPES[tool.plant].name} cannot grow here: ${r.reason}` : r.rejected ? `Planted in ${r.planted} cells; ${r.rejected} unsuitable (${r.reason})` : '' };
      }
      case 'biome': {
        return this.applyBiome(b, tool.biome, hit.dir, size, dt);
      }
    }
    return { ok: false };
  }

  removeTopLayers(b, dir, size, strength, dt) {
    const s = b.surface;
    const { cells, wts } = brushCells(s, dir, size);
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      const area = s.grid.omega[c] * s.ground[c] ** 2;
      const vol = area * 0.3 * strength * wts[k] * dt;
      const l = Math.min(s.lava[c], vol);
      s.lava[c] -= l;
      const i = Math.min(s.ice[c], vol);
      s.ice[c] -= i;
      b.ledger.sink += i;
    }
  }

  applyToNonTerrestrial(b, tool, dt) {
    const vol = tool.strength * 3 * dt;
    if (tool.id === 'pour' || tool.id === 'addmat' || tool.id === 'paint') {
      if (b.type === 'gas') {
        const key = tool.id === 'pour' ? 'water' : tool.material;
        if (key === 'water') b.gas.water += vol;
        else if (SOLID_KEYS.includes(key)) b.inv[key] += vol;
        else if (key === 'envelope') b.gas.envelope += vol * 20;
        b.updateCaches();
        return { ok: true, msg: 'Material sinks into the gas envelope (mass increases, no solid surface forms).' };
      }
      if (b.type === 'star') {
        b.extraMass = (b.extraMass || 0) + vol * 2;
        b.updateCaches();
        return { ok: true, msg: 'The star absorbs the material (mass increases).' };
      }
    }
    return { ok: false, msg: b.type === 'gas' ? 'Gas giants have no walkable surface to sculpt.' : 'Stars cannot be sculpted. Use the star controls in Bodies.' };
  }

  applyBiome(b, key, dir, size, dt) {
    const biome = BIOMES[key];
    const s = b.surface;
    const { cells, wts, sum } = brushCells(s, dir, size);
    const nw = Array.from(wts, (w) => w / (sum / cells.length));
    let planted = 0, why = '';
    for (const [pk, amt] of Object.entries(biome.plants)) {
      const p = PLANT_TYPES.findIndex((x) => x.key === pk);
      const r = seedPlants(b, cells, nw, p, amt * dt, this.settings.experimentalOverride);
      planted += r.planted;
      if (!r.planted) why = r.reason;
    }
    return { ok: planted > 0 || key === 'ocean', msg: planted === 0 && key !== 'ocean' ? `Biome plants cannot establish here: ${why}` : '' };
  }

  // Single-shot tools (tap): weather spawn, organism dropper, biome animals.
  tapTool(tool, hit) {
    const b = this.getBody(hit.bodyId);
    if (!b) return { ok: false, msg: 'Tap a body.' };
    if (!validDir(hit.dir)) return { ok: false, msg: 'Invalid target' };
    if (tool.id === 'weather') {
      const forced = this.settings.stormForced;
      const type = tool.weather;
      const radius = STORM_TYPES[type].radius * (tool.area ?? 1);
      const chk = checkStorm(b, type, hit.dir, radius, forced);
      if (!chk.ok) return { ok: false, msg: chk.reason };
      const vel = tool.speed > 0 ? headingVel(hit.dir, tool.heading ?? 0, tool.speed * (type === 'tornado' ? 0.015 : 0.008)) : [0, 0, 0];
      const st = createStorm(b, type, hit.dir, { forced, intensity: tool.intensity, duration: tool.duration, radius, vel, note: chk.note });
      b.logEvent(this.time.surface, `${forced ? 'Forced' : 'Natural'} ${STORM_TYPES[type].name} spawned.`);
      this.emit('storm', st);
      return { ok: true, msg: chk.note || `${STORM_TYPES[type].name} forming (natural conditions met).` };
    }
    if (b.type !== 'terrestrial') return { ok: false, msg: 'Life needs a terrestrial surface.' };
    if (tool.id === 'animal') {
      const r = dropAnimals(b, tool.species, hit.dir, tool.group || 1, this.rng, this.settings, this.settings.experimentalOverride);
      if (r.placed > 0) b.logEvent(this.time.surface, `${r.placed} ${SPECIES[tool.species].name}${r.placed > 1 ? 's' : ''} released.`);
      return { ok: r.placed > 0, msg: r.placed > 0 ? `Released ${r.placed} ${SPECIES[tool.species].name}. ${r.reason}` : `Cannot thrive here: ${r.reason}` };
    }
    if (tool.id === 'biome') {
      const biome = BIOMES[tool.biome];
      const res = this.applyBiome(b, tool.biome, hit.dir, tool.size, 1.2);
      let placed = 0;
      const msgs = [];
      for (const [k, n] of Object.entries(biome.animals)) {
        const sp = SPECIES.findIndex((x) => x.key === k);
        // try a few spots in the region for each species
        let got = 0;
        for (let t = 0; t < 6 && got < n; t++) {
          const j = this.rng.unit();
          const d = [hit.dir[0] + j[0] * tool.size * 0.6, hit.dir[1] + j[1] * tool.size * 0.6, hit.dir[2] + j[2] * tool.size * 0.6];
          const r = dropAnimals(b, sp, d, Math.min(2, n - got), this.rng, this.settings, false);
          got += r.placed;
          if (!r.placed && t === 5) msgs.push(`${SPECIES[sp].name}: ${r.reason}`);
        }
        placed += got;
      }
      b.logEvent(this.time.surface, `${biome.name} package established (${placed} animals).`);
      return { ok: placed > 0 || res.ok, msg: `${biome.name}: ${placed} animals placed. ${res.msg || ''} ${msgs.slice(0, 2).join('; ')}` };
    }
    if (tool.id === 'experimental') {
      b.adapt = { cold: !!tool.cold, dry: !!tool.dry, lowAir: !!tool.lowAir };
      const { cells, wts, sum } = brushCells(b.surface, hit.dir, tool.size);
      const nw = Array.from(wts, (w) => w / (sum / cells.length));
      let planted = 0;
      for (const p of [0, 2, 3, 5]) planted += seedPlants(b, cells, nw, p, 0.4, false).planted;
      const r1 = dropAnimals(b, 2, hit.dir, 3, this.rng, this.settings, false);
      const r2 = dropAnimals(b, 5, hit.dir, 2, this.rng, this.settings, false);
      const ad = Object.entries(b.adapt).filter(([, v]) => v).map(([k]) => ({ cold: 'cold-hardy', dry: 'drought-tolerant', lowAir: 'low-oxygen' }[k])).join(', ');
      b.logEvent(this.time.surface, `Experimental hardy life (${ad || 'no adaptations'}) introduced.`);
      return { ok: planted + r1.placed + r2.placed > 0, msg: `Hardy strains (${ad || 'none'}): plants in ${planted} cells, ${r1.placed + r2.placed} animals. ${planted + r1.placed + r2.placed === 0 ? r1.reason : ''}` };
    }
    return { ok: false };
  }

  // ---------------- bodies & orbits ----------------
  spawnBody(presetKey, opts = {}) {
    const parent = opts.parentId ? this.getBody(opts.parentId) : null;
    const q = this.bodies.length > 3 ? 'low' : this.settings.quality;
    const b = makeBody(presetKey, { quality: opts.quality || q, name: opts.name, radius: opts.radius, seed: opts.seed ?? Math.floor(this.rng.next() * 99999) });
    b.updateCaches();
    if (parent) {
      const dist = this.safeOrbitDistance(parent, b, opts.distance);
      const ang = opts.angle ?? this.rng.range(0, Math.PI * 2);
      b.pos = [parent.pos[0] + Math.cos(ang) * dist, parent.pos[1], parent.pos[2] + Math.sin(ang) * dist];
      b.vel = orbitVelocity(b, parent, { e: opts.e || 0, dir: opts.dir || 1 });
      b.parentId = parent.id;
    } else if (opts.pos) {
      b.pos = opts.pos.slice();
      b.vel = opts.vel ? opts.vel.slice() : [0, 0, 0];
      // keep clear of other bodies
      for (const o of this.bodies) {
        const d = Math.hypot(o.pos[0] - b.pos[0], o.pos[1] - b.pos[1], o.pos[2] - b.pos[2]);
        const need = (o.radiusCache + b.radiusCache) * 1.6;
        if (d < need) b.pos[0] = o.pos[0] + need * 1.2;
      }
    }
    this.addBody(b);
    if (b.surface) {
      const env = this.starEnv(b);
      spinUpClimate(b, { sunDir: env.sunDir, flux: env.flux }, 30);
    }
    b.waterBaseline = b.waterTotal();
    this.emit('bodies');
    return b;
  }

  // Clearance from radii and existing siblings; keeps the child inside ~0.4 Hill radius when possible.
  safeOrbitDistance(parent, child, want) {
    const minD = (parent.radiusCache + child.radiusCache) * 1.8 + 4;
    let d = Math.max(want || minD * 2.2, minD);
    const sibs = this.bodies.filter((o) => o.parentId === parent.id && o !== child);
    for (let tries = 0; tries < 20; tries++) {
      let ok = true;
      for (const o of sibs) {
        const od = Math.hypot(o.pos[0] - parent.pos[0], o.pos[1] - parent.pos[1], o.pos[2] - parent.pos[2]);
        if (Math.abs(od - d) < (o.radiusCache + child.radiusCache) * 3 + 6) { ok = false; break; }
      }
      if (ok) break;
      d *= 1.25;
    }
    return d;
  }

  setOrbit(body, parent, { e = 0, dir = 1 } = {}) {
    body.updateCaches(); parent.updateCaches();
    body.vel = orbitVelocity(body, parent, { e, dir });
    body.parentId = parent.id;
    body.logEvent(this.time.surface, `Orbit set around ${parent.name} (e=${e.toFixed(2)}${dir < 0 ? ', retrograde' : ''}).`);
  }

  restabilize(body) {
    const parent = this.getBody(body.parentId) || dominantParent(body, this.bodies);
    if (!parent) return false;
    const dir = Math.sign(orbitalElements(body, parent).hy || 1);
    this.setOrbit(body, parent, { e: 0, dir });
    body.logEvent(this.time.surface, 'Re-stabilised: velocity set to circular (player intervention).');
    return true;
  }

  nudge(body, kind, amount = 0.05) {
    const parent = this.getBody(body.parentId);
    const rv = parent ? [body.vel[0] - parent.vel[0], body.vel[1] - parent.vel[1], body.vel[2] - parent.vel[2]] : body.vel.slice();
    const sp = Math.hypot(...rv) || 1;
    let d;
    if (kind === 'prograde') d = rv.map((x) => x / sp);
    else if (kind === 'retrograde') d = rv.map((x) => -x / sp);
    else if (kind === 'radial' && parent) {
      const r = [body.pos[0] - parent.pos[0], body.pos[1] - parent.pos[1], body.pos[2] - parent.pos[2]];
      const rl = Math.hypot(...r) || 1;
      d = r.map((x) => x / rl);
    } else if (kind === 'kick') {
      const u = this.rng.unit();
      d = u;
      amount *= 3;
    } else d = [0, 1, 0];
    const dv = sp * amount;
    for (let k = 0; k < 3; k++) body.vel[k] += d[k] * dv;
    body.logEvent(this.time.surface, `Velocity changed (${kind}, Δv=${dv.toFixed(3)}).`);
  }

  // Predict future path relative to parent (does not modify the real system).
  predict(body, steps = 400, dt = null) {
    if (!body) return [];
    const parent = this.getBody(body.parentId);
    const clones = this.bodies.map((b) => ({ pos: b.pos.slice(), vel: b.vel.slice(), massCache: b.massCache, radiusCache: b.radiusCache, ref: b }));
    const me = clones.find((c) => c.ref === body);
    const pa = parent ? clones.find((c) => c.ref === parent) : null;
    let h = dt;
    if (!h) {
      const el = parent ? orbitalElements(body, parent) : null;
      const period = el && el.bound ? el.period : 600;
      h = Math.min(Math.max(period / steps, ORBIT_DT), 4);
    }
    const sub = Math.max(1, Math.ceil(h / 0.05));
    const acc = new Float64Array(clones.length * 3);
    const out = [];
    for (let s = 0; s < steps; s++) {
      for (let k = 0; k < sub; k++) {
        const hits = leapfrog(clones, h / sub, acc);
        if (hits.some(([i, j]) => clones[i] === me || clones[j] === me)) { out.push(null); return out; }
      }
      out.push(pa ? [me.pos[0] - pa.pos[0], me.pos[1] - pa.pos[1], me.pos[2] - pa.pos[2]] : me.pos.slice());
    }
    return out;
  }

  handleCollision(a, b) {
    const before = a.massCache + b.massCache;
    const info = mergeInfo(a, b);
    const { big, small } = info;
    const impactW = [small.pos[0] - big.pos[0], small.pos[1] - big.pos[1], small.pos[2] - big.pos[2]];
    const il = Math.hypot(...impactW) || 1;
    const impactLocal = worldToLocalDir(big, impactW.map((x) => x / il));
    if (big.type === 'terrestrial' && big.surface) {
      const s = big.surface;
      const cond = small.condensed();
      for (const k of SOLID_KEYS) big.inv[k] += small.type === 'terrestrial' ? small.inv[k] : small.inv[k];
      if (small.type !== 'terrestrial') {
        big.extraMass = (big.extraMass || 0) + small.mass() - Object.values(cond).reduce((x, y) => x + y, 0);
      }
      resolveSolid(big);
      // crater: excavate centre, build rim; melt some rock into lava
      const rad = Math.min(0.6, 0.12 + 0.6 * Math.sqrt(small.radiusCache / big.radiusCache));
      const { cells, wts } = brushCells(s, impactLocal, rad);
      const g = s.grid;
      let pool = 0;
      const rim = [];
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        const d = Math.acos(Math.max(-1, Math.min(1, g.dir[c * 3] * impactLocal[0] + g.dir[c * 3 + 1] * impactLocal[1] + g.dir[c * 3 + 2] * impactLocal[2])));
        if (d < rad * 0.7) {
          const area = g.omega[c] * s.ground[c] ** 2;
          pool += removeSolid(s, c, area * rad * 0.25 * wts[k], true, -s.Rs * 0.1, 1);
          s.temp[c] += 300;
          s.heat[c] = 1;
          for (let p = 0; p < PLANTS; p++) s.veg[c * PLANTS + p] = 0;
        } else rim.push(c);
      }
      for (const c of rim) depositSolid(s, c, pool / Math.max(1, rim.length));
      const lavaV = Math.min(big.inv.rock * 0.5, small.inv.rock * 0.3 + pool * 0.1);
      big.inv.rock -= lavaV;
      const inner = cells.filter((c, k) => k < cells.length * 0.4);
      for (const c of inner) { s.lava[c] += lavaV / inner.length; s.lavaT[c] = 1; }
      // compensate the terrain integral for the rock converted to lava
      resolveSolid(big);
      // water, ice, organics of the impactor land in the crater region (explicit transfer)
      const wAdd = small.type === 'terrestrial' ? small.waterTotal() : small.gas ? small.gas.water || 0 : 0;
      for (const c of cells) {
        s.w[c] += (wAdd * 0.7) / cells.length;
        s.vap[c] += (wAdd * 0.3) / cells.length;
        s.ice[c] += (cond.ice || 0) / cells.length;
        s.org[c] += (cond.organic || 0) / cells.length;
        s.lava[c] += (cond.lava || 0) / cells.length;
      }
      big.ledger.source += wAdd + (cond.ice || 0);
      big.agents = big.agents.filter((ag) => {
        const d = ag.p[0] * impactLocal[0] + ag.p[1] * impactLocal[1] + ag.p[2] * impactLocal[2];
        return d < Math.cos(rad * 1.5);
      });
      s.version++;
    } else if (big.type === 'gas') {
      for (const k of SOLID_KEYS) big.inv[k] += small.inv[k];
      big.gas.water += small.type === 'terrestrial' ? small.waterTotal() : 0;
      const restMass = small.mass() - (small.type === 'terrestrial' ? SOLID_KEYS.reduce((x, k) => x + small.inv[k] * densityOf(k), 0) + small.waterTotal() : 0);
      big.extraMass = (big.extraMass || 0) + Math.max(0, restMass);
      big.gas.spots.push({ id: Date.now() % 100000, lat: Math.asin(impactLocal[1]), lon: Math.atan2(impactLocal[0], impactLocal[2]), size: 0.08, color: [0.2, 0.15, 0.12], life: 120, persistent: false, intensity: 1 });
    } else {
      big.extraMass = (big.extraMass || 0) + small.mass();
    }
    big.atmosphere += small.atmosphere; // atmosphere mass per bar is constant, so this conserves gas mass
    big.pos = info.pos;
    big.vel = info.vel;
    big.updateCaches();
    const after = big.massCache;
    const momAfter = big.vel.map((v) => v * after);
    const momErr = Math.hypot(...momAfter.map((x, k) => x - info.momentum[k])) / Math.max(1e-9, Math.hypot(...info.momentum) + after * 1e-6);
    this.lastCollision = { big: big.name, small: small.name, massBefore: before, massAfter: after, massError: Math.abs(after - before) / before, momentumError: momErr, relSpeed: info.relSpeed, time: this.time.orbit };
    big.logEvent(this.time.surface, `Impact! ${small.name} merged into ${big.name} at ${info.relSpeed.toFixed(2)} u/s.`);
    this.transient.push({ type: 'impact', bodyId: big.id, dir: impactLocal, size: small.radiusCache, t: this.time.real });
    const selWasSmall = this.selectedId === small.id;
    this.removeBody(small.id);
    if (selWasSmall) this.selectedId = big.id;
    big.waterBaseline = big.waterTotal() - big.ledger.source + big.ledger.sink + big.ledger.escaped - big.ledger.forced;
    this.emit('collision', this.lastCollision);
  }

  // ---------------- composition jobs ----------------
  startRecipe(body, fractions, totalVolume, opts = {}) {
    this.jobs = this.jobs.filter((j) => j.bodyId !== body.id);
    const job = makeRecipeJob(body, fractions, totalVolume, { ...opts, seed: Math.floor(this.rng.next() * 1e6) });
    this.jobs.push(job);
    body.logEvent(this.time.surface, 'Composition reconfiguration started.');
    return job;
  }
  jobFor(body) {
    return this.jobs.find((j) => j.bodyId === body.id && !j.cancelled) || null;
  }

  // ---------------- erosion experiment ----------------
  startErosionExperiment(body) {
    if (!body || !body.surface) return null;
    let dir = body.labPeak;
    if (!dir) {
      const s = body.surface;
      let hi = 0;
      for (let i = 0; i < s.count; i++) if (s.bed[i] > s.bed[hi]) hi = i;
      dir = [s.grid.dir[hi * 3], s.grid.dir[hi * 3 + 1], s.grid.dir[hi * 3 + 2]];
    }
    const s = body.surface;
    for (let i = 0; i < s.count; i++) s.baseE[i] = s.bed[i] + s.sed[i];
    this.settings.surfaceSpeed = 8;
    this.settings.erosion = 6;
    this.experiment = { bodyId: body.id, dir: dir.slice(), radius: 0.06, rate: 2.2 * (s.Rs / 8) ** 2, until: this.time.surface + 480 };
    body.logEvent(this.time.surface, 'Accelerated erosion experiment: spring on the highest peak, erosion ×6, surface time ×8.');
    return this.experiment;
  }

  // ---------------- diagnostics ----------------
  conservation(body) {
    if (!body || !body.surface) return null;
    const s = body.surface;
    const W = body.waterTotal();
    const L = body.ledger;
    const expected = body.waterBaseline + L.source - L.sink - L.escaped + L.forced;
    const werr = Math.abs(W - expected) / Math.max(1e-6, Math.abs(expected));
    const terrain = s.terrainVolume();
    let susp = 0;
    for (let i = 0; i < s.count; i++) susp += s.susp[i];
    const solid = body.solidVolume();
    const serr = Math.abs(terrain + susp - solid) / Math.max(1e-6, solid);
    return { water: W, waterExpected: expected, waterError: werr, solid, terrain: terrain + susp, solidError: serr };
  }

  populationSummary(body) {
    const out = SPECIES.map((sp) => ({ name: sp.name, explicit: 0, reserve: 0 }));
    if (!body) return out;
    for (const a of body.agents) out[a.sp].explicit++;
    body.reserve.forEach((r, i) => (out[i].reserve = Math.floor(r)));
    return out;
  }
}

function validDir(d) {
  return Array.isArray(d) && d.length === 3 && d.every(Number.isFinite) && Math.hypot(d[0], d[1], d[2]) > 1e-6;
}

function densityOf(k) {
  return { rock: 3, granite: 2.7, sand: 1.6, soil: 1.4, clay: 1.8, iron: 7.9 }[k] || 1;
}

// world vector -> planet local (inverse of Rz(tilt) * Ry(spin))
export function worldToLocalDir(body, v) {
  const ct = Math.cos(-body.tilt), st = Math.sin(-body.tilt);
  let x = v[0] * ct - v[1] * st, y = v[0] * st + v[1] * ct, z = v[2];
  const cs = Math.cos(-body.spinAngle), ss = Math.sin(-body.spinAngle);
  const x2 = x * cs + z * ss, z2 = -x * ss + z * cs;
  return [x2, y, z2];
}

export function localToWorldDir(body, v) {
  const cs = Math.cos(body.spinAngle), ss = Math.sin(body.spinAngle);
  const x = v[0] * cs + v[2] * ss, z = -v[0] * ss + v[2] * cs, y = v[1];
  const ct = Math.cos(body.tilt), st = Math.sin(body.tilt);
  return [x * ct - y * st, x * st + y * ct, z];
}

export { BODY_PRESETS, STORM_TYPES, PLANT_TYPES, SPECIES, BIOMES, GOALS, makeAgent, speciesSuitability, balanceMomentum, AU, G };
