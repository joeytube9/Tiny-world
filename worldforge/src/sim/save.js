// Save format (JSON) with schema validation. Float arrays are base64 Float32 LE.
import { Body, bumpId, resetIds } from './body.js';
import { Surface, FLOAT_FIELDS, DOUBLE_FIELDS, PLANTS } from './surface.js';
import { SOLID_KEYS } from './materials.js';
import { bumpStormId, STORM_TYPES } from './storms.js';
import { bumpAgentId, SPECIES } from './life.js';
import { RECIPE_KEYS } from './materials.js';
import { RNG } from './rng.js';
import { newGoalState, GOALS } from './goals.js';

export const SAVE_FORMAT = 'worldforge-save';
export const SAVE_VERSION = 1;

function toB64(u8) {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function fromB64(str) {
  if (typeof Buffer !== 'undefined') {
    const b = Buffer.from(str, 'base64');
    const u8 = new Uint8Array(b.length);
    u8.set(b);
    return u8;
  }
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
const f32ToB64 = (a) => toB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
const f64ToB64 = (a) => toB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
function b64ToF64(str, n) {
  const u8 = fromB64(str);
  if (u8.length !== n * 8) throw new Error(`array length mismatch (${u8.length / 8} vs ${n})`);
  const out = new Float64Array(n);
  new Uint8Array(out.buffer).set(u8);
  for (let i = 0; i < n; i++) if (!Number.isFinite(out[i])) throw new Error('non-finite value in surface array');
  return out;
}
function b64ToF32(str, n) {
  const u8 = fromB64(str);
  if (u8.length !== n * 4) throw new Error(`array length mismatch (${u8.length / 4} vs ${n})`);
  const out = new Float32Array(n);
  new Uint8Array(out.buffer).set(u8);
  for (let i = 0; i < n; i++) if (!Number.isFinite(out[i])) throw new Error('non-finite value in surface array');
  return out;
}

const r6 = (x) => Math.round(x * 1e6) / 1e6;

export function serializeBody(b) {
  const o = {
    id: b.id, name: b.name, type: b.type, kind: b.kind, presetKey: b.presetKey || null, seed: b.seed, roughness: b.roughness,
    spinPeriod: b.spinPeriod, spinAngle: b.spinAngle, tilt: b.tilt, atmosphere: b.atmosphere, greenhouse: b.greenhouse,
    tempBias: b.tempBias, albedo: b.albedo, tint: b.tint, atmoColor: b.atmoColor, pos: b.pos.slice(), vel: b.vel.slice(),
    parentId: b.parentId, inv: { ...b.inv }, ledger: { ...b.ledger }, lavaLedger: { ...b.lavaLedger }, waterBaseline: b.waterBaseline ?? 0,
    reserve: b.reserve.slice(), extraMass: b.extraMass || 0, cloudDeck: !!b.cloudDeck, vents: b.vents || [], labPeak: b.labPeak || null,
    adapt: b.adapt || null, lifeNatural: b.lifeNatural, gen: b.gen || {}, events: b.events.slice(-15),
  };
  if (b.surface) {
    const s = b.surface;
    const fields = {};
    for (const f of FLOAT_FIELDS) fields[f] = DOUBLE_FIELDS.includes(f) ? f64ToB64(s[f]) : f32ToB64(s[f]);
    o.surface = { N: s.N, Rs: s.Rs, fields, mat: toB64(s.mat), veg: f32ToB64(s.veg) };
  }
  if (b.gas) o.gas = JSON.parse(JSON.stringify(b.gas));
  if (b.star) o.star = { ...b.star };
  o.storms = b.storms.map((st) => ({ id: st.id, type: st.type, pos: st.pos, radius: st.radius, intensity: st.intensity, target: st.target, duration: st.duration, age: st.age, vel: st.vel, forced: st.forced, natural: st.natural, spin: st.spin, note: st.note }));
  o.agents = b.agents.map((a) => [a.id, a.sp, r6(a.p[0]), r6(a.p[1]), r6(a.p[2]), r6(a.h[0]), r6(a.h[1]), r6(a.h[2]), r6(a.age), r6(a.energy), r6(a.health), r6(a.lifespan), r6(a.alt), a.override ? 1 : 0, a.gen]);
  o.pending = b.pending.map((p) => ({ mat: p.mat, vol: p.vol, cells: Array.from(p.cells), wts: Array.from(p.wts), t0: p.t0, tLand: p.tLand, dir: p.dir, r0: p.r0, rLand: p.rLand, radius: p.radius, src: p.src }));
  return o;
}

export function serializeWorld(world, name = 'Untitled') {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    name,
    seed: world.seed,
    rngState: world.rng.state,
    scene: world.sceneKey,
    sceneName: world.sceneName,
    mode: world.mode,
    time: { ...world.time },
    selectedId: world.selectedId,
    virtualSun: world.virtualSun,
    goals: world.goals,
    unlocks: world.unlocks.slice(),
    experiment: world.experiment,
    jobs: world.jobs.map((j) => ({ ...j })),
    settings: { surfaceSpeed: world.settings.surfaceSpeed, orbitSpeed: world.settings.orbitSpeed, erosion: world.settings.erosion, weather: world.settings.weather },
    bodies: world.bodies.map(serializeBody),
  };
}

// ---------------- validation ----------------
class SaveError extends Error {}
const fin = (v, name, lo = -1e12, hi = 1e12) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SaveError(`${name} must be a finite number`);
  if (v < lo || v > hi) throw new SaveError(`${name} out of range (${v})`);
  return v;
};
const vec3 = (v, name, lim = 1e7) => {
  if (!Array.isArray(v) || v.length !== 3) throw new SaveError(`${name} must be [x,y,z]`);
  return v.map((x, i) => fin(x, `${name}[${i}]`, -lim, lim));
};

export function deserializeBody(o, limits) {
  if (!o || typeof o !== 'object') throw new SaveError('body must be an object');
  if (!['terrestrial', 'gas', 'star'].includes(o.type)) throw new SaveError(`unknown body type ${o.type}`);
  const b = new Body({
    id: fin(o.id, 'body.id', 1, 1e9) | 0, name: String(o.name || 'Body').slice(0, 40), type: o.type, kind: String(o.kind || 'planet'),
    seed: fin(o.seed ?? 1, 'seed', 0, 1e10), roughness: fin(o.roughness ?? 1, 'roughness', 0, 4),
    spinPeriod: fin(o.spinPeriod ?? 120, 'spinPeriod', -1e6, 1e6), spinAngle: fin(o.spinAngle ?? 0, 'spinAngle', -1e4, 1e4),
    tilt: fin(o.tilt ?? 0, 'tilt', -Math.PI, Math.PI), atmosphere: fin(o.atmosphere ?? 0, 'atmosphere', 0, 200),
    greenhouse: fin(o.greenhouse ?? 1, 'greenhouse', 0, 10), tempBias: fin(o.tempBias ?? 0, 'tempBias', -300, 1000),
    albedo: fin(o.albedo ?? 0.3, 'albedo', 0, 1), tint: o.tint ? vec3(o.tint, 'tint', 5) : [1, 1, 1], atmoColor: o.atmoColor ? vec3(o.atmoColor, 'atmoColor', 5) : undefined,
    pos: vec3(o.pos, 'pos'), vel: vec3(o.vel, 'vel', 1e4), parentId: o.parentId ?? null,
  });
  if (b.spinPeriod !== 0 && Math.abs(b.spinPeriod) < 5) b.spinPeriod = 5 * Math.sign(b.spinPeriod);
  b.presetKey = o.presetKey || null;
  for (const k of SOLID_KEYS) b.inv[k] = fin(o.inv?.[k] ?? 0, `inv.${k}`, 0, 1e9);
  b.ledger = { source: fin(o.ledger?.source ?? 0, 'ledger.source', 0), sink: fin(o.ledger?.sink ?? 0, 'ledger.sink', 0), escaped: fin(o.ledger?.escaped ?? 0, 'ledger.escaped', 0), forced: fin(o.ledger?.forced ?? 0, 'ledger.forced', 0) };
  b.lavaLedger = { source: fin(o.lavaLedger?.source ?? 0, 'lava.source', 0), cooled: fin(o.lavaLedger?.cooled ?? 0, 'lava.cooled', 0) };
  b.waterBaseline = fin(o.waterBaseline ?? 0, 'waterBaseline', 0);
  b.reserve = SPECIES.map((_, i) => fin(o.reserve?.[i] ?? 0, 'reserve', 0, 1e5));
  b.extraMass = fin(o.extraMass ?? 0, 'extraMass', 0, 1e10);
  b.cloudDeck = !!o.cloudDeck;
  b.vents = Array.isArray(o.vents) ? o.vents.slice(0, 16).map((v) => ({ dir: vec3(v.dir, 'vent.dir', 2), rate: fin(v.rate, 'vent.rate', 0, 100), phase: fin(v.phase ?? 0, 'vent.phase', -1e6, 1e6) })) : [];
  b.labPeak = o.labPeak ? vec3(o.labPeak, 'labPeak', 2) : null;
  b.adapt = o.adapt ? { cold: !!o.adapt.cold, dry: !!o.adapt.dry, lowAir: !!o.adapt.lowAir } : null;
  b.lifeNatural = o.lifeNatural !== false;
  b.gen = typeof o.gen === 'object' && o.gen ? o.gen : {};
  b.events = Array.isArray(o.events) ? o.events.slice(-15).map((e) => ({ t: Number(e.t) || 0, text: String(e.text).slice(0, 200) })) : [];
  if (o.type === 'terrestrial') {
    const sv = o.surface;
    if (!sv) throw new SaveError('terrestrial body needs surface data');
    const N = fin(sv.N, 'surface.N', 8, 64) | 0;
    if (N % 2) throw new SaveError('surface.N must be even');
    const s = new Surface(N);
    s.Rs = fin(sv.Rs, 'surface.Rs', 0.05, 1e4);
    for (const f of FLOAT_FIELDS) {
      if (typeof sv.fields?.[f] !== 'string') throw new SaveError(`missing surface field ${f}`);
      s[f] = DOUBLE_FIELDS.includes(f) ? b64ToF64(sv.fields[f], s.count) : b64ToF32(sv.fields[f], s.count);
    }
    const mat = fromB64(sv.mat);
    if (mat.length !== s.count) throw new SaveError('surface.mat length mismatch');
    for (let i = 0; i < mat.length; i++) if (mat[i] > 5) mat[i] = 0;
    s.mat = mat;
    s.veg = b64ToF32(sv.veg, s.count * PLANTS);
    for (let i = 0; i < s.veg.length; i++) s.veg[i] = Math.min(1, Math.max(0, s.veg[i]));
    for (const f of ['w', 'sw', 'ice', 'lava', 'susp', 'vap', 'cloud', 'org', 'sed']) {
      const a = s[f];
      for (let i = 0; i < a.length; i++) if (a[i] < 0) throw new SaveError(`negative ${f}`);
    }
    b.surface = s;
    s.computeHeads();
  } else if (o.type === 'gas') {
    const gsv = o.gas || {};
    b.gas = {
      envelope: fin(gsv.envelope, 'gas.envelope', 0, 1e10), water: fin(gsv.water ?? 0, 'gas.water', 0, 1e10), density: fin(gsv.density ?? 0.4, 'gas.density', 0.01, 20),
      bands: gsv.bands || {}, rings: gsv.rings ? { inner: fin(gsv.rings.inner, 'rings.inner', 1, 10), outer: fin(gsv.rings.outer, 'rings.outer', 1, 12), color: vec3(gsv.rings.color || [0.9, 0.8, 0.7], 'rings.color', 2), opacity: fin(gsv.rings.opacity ?? 0.8, 'rings.opacity', 0, 1) } : null,
      spots: Array.isArray(gsv.spots) ? gsv.spots.slice(0, 12).map((sp) => ({ id: sp.id | 0, lat: fin(sp.lat, 'spot.lat', -2, 2), lon: fin(sp.lon, 'spot.lon', -1e6, 1e6), size: fin(sp.size, 'spot.size', 0, 1), color: vec3(sp.color, 'spot.color', 2), life: fin(sp.life ?? 100, 'spot.life', -1e6, 1e6), persistent: !!sp.persistent, intensity: fin(sp.intensity ?? 1, 'spot.int', 0, 2) })) : [],
    };
    for (const k of ['c1', 'c2', 'c3']) b.gas.bands[k] = b.gas.bands[k] ? vec3(b.gas.bands[k], `bands.${k}`, 2) : [0.8, 0.7, 0.6];
    for (const k of ['contrast', 'speed', 'count']) b.gas.bands[k] = fin(b.gas.bands[k] ?? 1, `bands.${k}`, 0, 40);
  } else {
    const st = o.star || {};
    b.star = { volume: fin(st.volume, 'star.volume', 1, 1e10), temperatureK: fin(st.temperatureK ?? 5800, 'star.T', 1000, 60000), luminosity: fin(st.luminosity ?? 1, 'star.L', 0, 1000), density: fin(st.density ?? 10, 'star.density', 0.1, 1000) };
  }
  // storms (bounded)
  b.storms = (Array.isArray(o.storms) ? o.storms : []).filter((st) => STORM_TYPES[st.type]).slice(0, 12).map((st) => {
    const pos = vec3(st.pos, 'storm.pos', 2);
    const l = Math.hypot(...pos) || 1;
    const x = { id: st.id | 0, type: st.type, pos: pos.map((v) => v / l), radius: fin(st.radius, 'storm.radius', 0.001, 2), intensity: fin(st.intensity, 'storm.intensity', 0, 2), target: fin(st.target ?? st.intensity, 'storm.target', 0, 2), duration: fin(st.duration, 'storm.duration', 0, 1e5), age: fin(st.age, 'storm.age', 0, 1e6), vel: vec3(st.vel, 'storm.vel', 1), forced: !!st.forced, natural: !!st.natural, spin: st.spin < 0 ? -1 : 1, track: [], surgeMax: 0, note: String(st.note || '').slice(0, 200), rainTotal: 0, damageTotal: 0, sedimentMoved: 0 };
    bumpStormId(x.id);
    return x;
  });
  // agents (bounded)
  const maxAgents = limits.popCap;
  const ag = Array.isArray(o.agents) ? o.agents : [];
  b.agents = [];
  for (const r of ag) {
    if (b.agents.length >= maxAgents) { if (Array.isArray(r) && r[1] >= 0 && r[1] < SPECIES.length) b.reserve[r[1]] += 1; continue; }
    if (!Array.isArray(r) || r.length < 15) throw new SaveError('bad agent record');
    const sp = r[1] | 0;
    if (sp < 0 || sp >= SPECIES.length) throw new SaveError('bad species');
    const p = [fin(r[2], 'agent.p'), fin(r[3], 'agent.p'), fin(r[4], 'agent.p')];
    const pl = Math.hypot(...p) || 1;
    const h = [fin(r[5], 'agent.h'), fin(r[6], 'agent.h'), fin(r[7], 'agent.h')];
    const a = { id: r[0] | 0, sp, p: p.map((v) => v / pl), h, age: fin(r[8], 'agent.age', 0, 1e7), energy: fin(r[9], 'agent.energy', -1, 2), health: fin(r[10], 'agent.health', -1, 2), lifespan: fin(r[11], 'agent.life', 0, 1e7), alt: fin(r[12], 'agent.alt', 0, 10), override: !!r[13], gen: r[14] | 0, state: 'wander', phase: Math.random() * 6.28 };
    bumpAgentId(a.id);
    b.agents.push(a);
  }
  // in-flight packets
  b.pending = (Array.isArray(o.pending) ? o.pending : []).slice(0, 400).map((p) => {
    const n = b.surface ? b.surface.count : 0;
    const cells = Int32Array.from(p.cells || []).filter((c) => c >= 0 && c < n);
    if (cells.length !== (p.cells || []).length) throw new SaveError('packet cell index out of range');
    return { mat: String(p.mat), vol: fin(p.vol, 'packet.vol', 0, 1e9), cells, wts: Float32Array.from((p.wts || []).map((w) => fin(w, 'packet.w', 0, 1))), t0: fin(p.t0, 't0', -1e9, 1e12), tLand: fin(p.tLand, 'tLand', -1e9, 1e12), dir: vec3(p.dir, 'packet.dir', 2), r0: fin(p.r0, 'r0', 0, 1e5), rLand: fin(p.rLand, 'rLand', 0, 1e5), radius: fin(p.radius, 'radius', 0, 4), src: String(p.src || 'pour') };
  });
  bumpId(b.id);
  b.updateCaches();
  return b;
}

export function validateAndLoad(world, data) {
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { throw new SaveError('Not valid JSON'); }
  }
  if (!data || data.format !== SAVE_FORMAT) throw new SaveError('Not a WORLDFORGE save file');
  if (typeof data.version !== 'number' || data.version > SAVE_VERSION) throw new SaveError(`Unsupported save version ${data.version}`);
  if (!Array.isArray(data.bodies)) throw new SaveError('bodies missing');
  if (data.bodies.length > world.settings.maxBodies) throw new SaveError(`Too many bodies (${data.bodies.length} > ${world.settings.maxBodies})`);
  const limits = { popCap: world.settings.popCap };
  resetIds(1);
  const bodies = data.bodies.map((o) => deserializeBody(o, limits));
  const ids = new Set(bodies.map((b) => b.id));
  if (ids.size !== bodies.length) throw new SaveError('duplicate body ids');
  for (const b of bodies) if (b.parentId !== null && !ids.has(b.parentId)) b.parentId = null;
  // commit
  world.clear();
  world.seed = fin(data.seed ?? 1, 'seed', 0, 1e12);
  world.rng = new RNG(world.seed);
  if (Number.isFinite(data.rngState)) world.rng.state = data.rngState >>> 0;
  world.sceneKey = String(data.scene || 'custom');
  world.sceneName = String(data.sceneName || data.name || 'Loaded world').slice(0, 60);
  world.mode = data.mode === 'terraform' ? 'terraform' : 'sandbox';
  world.time = { surface: fin(data.time?.surface ?? 0, 'time.surface', 0), orbit: fin(data.time?.orbit ?? 0, 'time.orbit', 0), real: 0 };
  world.virtualSun = data.virtualSun ? { dir: vec3(data.virtualSun.dir, 'sun.dir', 2), flux: fin(data.virtualSun.flux, 'sun.flux', 0, 100) } : null;
  const goals = newGoalState();
  if (data.goals) for (const g of GOALS) if (data.goals[g.id]) goals[g.id] = { done: !!data.goals[g.id].done, held: 0, progress: Number(data.goals[g.id].progress) || 0 };
  world.goals = goals;
  world.unlocks = Array.isArray(data.unlocks) ? data.unlocks.map(String).slice(0, 20) : [];
  if (data.settings) {
    world.settings.surfaceSpeed = fin(data.settings.surfaceSpeed ?? 1, 'surfaceSpeed', 0, 64);
    world.settings.orbitSpeed = fin(data.settings.orbitSpeed ?? 1, 'orbitSpeed', 0, 200);
    world.settings.erosion = fin(data.settings.erosion ?? 1, 'erosion', 0, 20);
    world.settings.weather = fin(data.settings.weather ?? 1, 'weather', 0, 5);
  }
  for (const b of bodies) { world.bodies.push(b); b.clock = {}; }
  world.selectedId = ids.has(data.selectedId) ? data.selectedId : bodies[0]?.id ?? null;
  world.jobs = (Array.isArray(data.jobs) ? data.jobs : []).filter((j) => ids.has(j.bodyId) && j.target).map((j) => {
    const t = {};
    for (const k of RECIPE_KEYS) t[k] = fin(j.target[k] ?? 0, `job.${k}`, 0, 1e10);
    return { ...j, target: t, removed: j.removed || {}, added: j.added || {}, done: !!j.done, paused: !!j.paused, cancelled: !!j.cancelled };
  });
  world.experiment = data.experiment && ids.has(data.experiment.bodyId) ? { ...data.experiment, dir: vec3(data.experiment.dir, 'exp.dir', 2) } : null;
  world.emit('scene', world.sceneKey);
  world.emit('bodies');
  return world;
}

export { SaveError };
