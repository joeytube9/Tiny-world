// Body model: inventories, mass, radius, terrain generation.
import { Surface, PLANTS } from './surface.js';
import { RNG, fbm3, ridged3, valueNoise3, clamp, smoothstep, hashString } from './rng.js';
import { MAT, DENSITY, SOLID_KEYS, RECIPE_KEYS } from './materials.js';

export const G = 0.0257; // gameplay gravitational constant
export const ENVELOPE_DENSITY = 0.9;
export const STAR_DENSITY = 10;
export const ATM_MASS_PER_BAR = 6; // atmosphere mass per bar (constant, see README)

let nextId = 1;
export function resetIds(n = 1) { nextId = n; }
export function bumpId(id) { if (id >= nextId) nextId = id + 1; }

export function qualityN(quality, radius) {
  const base = quality === 'low' ? 24 : quality === 'high' ? 40 : 32;
  const n = Math.round(base * Math.pow(Math.max(radius, 0.5) / 10, 0.45));
  return clamp(n - (n % 2), 12, base);
}

export class Body {
  constructor(opts = {}) {
    this.id = opts.id ?? nextId++;
    bumpId(this.id);
    this.name = opts.name || `Body ${this.id}`;
    this.type = opts.type || 'terrestrial'; // terrestrial | gas | star
    this.kind = opts.kind || 'planet'; // preset family label
    this.seed = opts.seed ?? 1234;
    this.roughness = opts.roughness ?? 1;
    this.spinPeriod = opts.spinPeriod ?? 120; // surface-seconds per rotation (negative = retrograde)
    this.spinAngle = opts.spinAngle ?? 0;
    this.tilt = opts.tilt ?? 0.4; // radians
    this.atmosphere = opts.atmosphere ?? 0; // bar (Earth = 1)
    this.greenhouse = opts.greenhouse ?? 1; // multiplier
    this.tempBias = opts.tempBias ?? 0; // internal heating / player bias (deg C)
    this.albedo = opts.albedo ?? 0.3;
    this.tint = opts.tint || [1, 1, 1];
    this.atmoColor = opts.atmoColor || [0.45, 0.7, 1.0];
    this.pos = opts.pos ? opts.pos.slice() : [0, 0, 0];
    this.vel = opts.vel ? opts.vel.slice() : [0, 0, 0];
    this.parentId = opts.parentId ?? null;
    this.inv = Object.fromEntries(SOLID_KEYS.map((k) => [k, 0]));
    this.surface = null;
    this.gas = null;
    this.star = null;
    this.storms = [];
    this.windZones = [];
    this.agents = [];
    this.reserve = [0, 0, 0, 0, 0, 0];
    this.pending = []; // falling packets {cells, wts, vol, mat, t, tLand, src}
    this.ledger = { source: 0, sink: 0, escaped: 0, forced: 0 }; // water accounting of explicit sources/sinks
    this.lavaLedger = { source: 0, cooled: 0 };
    this.events = [];
    this.gen = opts.gen || {};
    this.coarse = false;
    this.lifeNatural = true;
    this.massCache = 0;
    this.radiusCache = 1;
    this.collisionCooldown = 0;
    this.crust = opts.crust || null;
  }

  logEvent(t, text) {
    this.events.push({ t, text });
    if (this.events.length > 30) this.events.shift();
  }

  // ---------------- inventories ----------------
  waterTotal() {
    if (!this.surface) return this.gas ? this.gas.water || 0 : 0;
    const r = this.surface.waterReservoirs();
    let pend = 0;
    for (const p of this.pending) if (p.mat === 'water') pend += p.vol;
    return r.liquid + r.soil + r.ice + r.vapor + r.cloud + pend;
  }

  pendingOf(mat) {
    let s = 0;
    for (const p of this.pending) if (p.mat === mat) s += p.vol;
    return s;
  }

  // Condensed volumes per recipe key. Ice is stored as water-equivalent volume
  // (mass density 1), so freezing and melting never change mass.
  condensed() {
    const out = Object.fromEntries(RECIPE_KEYS.map((k) => [k, 0]));
    for (const k of SOLID_KEYS) out[k] = this.inv[k];
    if (this.surface) {
      const s = this.surface;
      out.water = s.sum('w') + s.sum('sw') + s.sum('vap') + s.sum('cloud') + this.pendingOf('water');
      out.ice = s.sum('ice');
      out.organic = s.sum('org') + this.pendingOf('organic');
      out.lava = s.sum('lava') + this.pendingOf('lava');
      for (const k of SOLID_KEYS) out[k] += this.pendingOf(k);
    } else if (this.gas) {
      out.water = this.gas.water || 0;
    }
    return out;
  }

  condensedVolume() {
    const c = this.condensed();
    let v = 0;
    for (const k in c) v += c[k];
    return v;
  }

  massBreakdown() {
    const c = this.condensed();
    const m = {};
    for (const k in c) m[k] = c[k] * (k === 'ice' ? 1 : DENSITY[k] ?? 1);
    if (this.type === 'gas') m.envelope = this.gas.envelope * (this.gas.density ?? ENVELOPE_DENSITY);
    if (this.type === 'star') m.plasma = this.star.volume * (this.star.density ?? STAR_DENSITY);
    if (this.extraMass) m.accreted = this.extraMass;
    // atmosphere inventory: fixed mass per bar (gameplay approximation, independent of radius)
    m.atmosphere = this.atmosphere * ATM_MASS_PER_BAR;
    return m;
  }

  mass() {
    const b = this.massBreakdown();
    let s = 0;
    for (const k in b) s += b[k];
    return Math.max(s, 1e-6);
  }

  // Volume-equivalent outer radius (condensed + envelope).
  radius() {
    let v = 0;
    if (this.type === 'star') v = this.star.volume;
    else {
      const c = this.condensed();
      for (const k in c) v += c[k];
      if (this.type === 'gas') v += this.gas.envelope;
    }
    return Math.max(0.3, Math.cbrt((3 * v) / (4 * Math.PI)));
  }

  // Visual outer radius of a terrestrial body (max water/ground) for collisions and camera.
  outerRadius() {
    if (!this.surface) return this.radius();
    const s = this.surface;
    let m = 0;
    for (let i = 0; i < s.count; i++) if (s.head[i] > m) m = s.head[i];
    return m || this.radius();
  }

  updateCaches() {
    this.massCache = this.mass();
    this.radiusCache = this.surface ? Math.max(this.surface.Rs, this.outerRadius()) : this.radius();
    return this;
  }

  surfaceGravity() {
    const R = this.radiusCache || this.radius();
    return (G * (this.massCache || this.mass())) / (R * R);
  }

  solidVolume() {
    let v = 0;
    for (const k of SOLID_KEYS) v += this.inv[k];
    return v;
  }

  // Volume fractions of the condensed body (normalised) and mass fractions.
  compositionReport() {
    const c = this.condensed();
    let vt = 0, mt = 0;
    const mass = {};
    for (const k in c) {
      vt += c[k];
      mass[k] = c[k] * (k === 'ice' ? 1 : DENSITY[k] ?? 1);
      mt += mass[k];
    }
    const vf = {}, mf = {};
    for (const k in c) {
      vf[k] = vt > 0 ? c[k] / vt : 0;
      mf[k] = mt > 0 ? mass[k] / mt : 0;
    }
    return { volumes: c, volumeTotal: vt, volumeFractions: vf, massFractions: mf, condensedMass: mt };
  }
}

// ---------------- terrain generation ----------------

function craterProfile(d, r) {
  // d: angular distance, r: crater angular radius. returns height in units of depth.
  const x = d / r;
  if (x > 1.6) return 0;
  if (x < 1) return -1 + x * x * 1.1 + 0.15 * smoothstep(0.6, 1, x);
  return 0.25 * Math.exp(-((x - 1) * (x - 1)) / 0.04) * (1.6 - x) / 0.6;
}

export function generateRelief(surface, gen, seed, roughness) {
  const g = surface.grid;
  const s = seed >>> 0;
  const rng = new RNG(s ^ 0xabc);
  const craters = [];
  const nCr = gen.craters || 0;
  for (let k = 0; k < nCr; k++) {
    const d = rng.unit();
    const r = Math.pow(rng.next(), 2.2) * (gen.craterMax || 0.35) + 0.04;
    craters.push({ d, r, depth: r * (0.6 + rng.next() * 0.4) });
  }
  const basins = [];
  for (let k = 0; k < (gen.basins || 0); k++) {
    basins.push({ d: rng.unit(), r: rng.range(0.25, 0.5), depth: rng.range(0.5, 1.0) });
  }
  const out = new Float32Array(g.count);
  const cont = gen.continents ?? 0.6;
  const mtn = gen.mountains ?? 0.5;
  const seaBias = gen.seaBias ?? 0;
  for (let i = 0; i < g.count; i++) {
    const x = g.dir[i * 3], y = g.dir[i * 3 + 1], z = g.dir[i * 3 + 2];
    let e = 0;
    const c = fbm3(x * 1.4 + 11, y * 1.4, z * 1.4 - 3, s, 5);
    e += cont * (c + seaBias);
    const ridge = ridged3(x * 2.3, y * 2.3, z * 2.3, s + 5, 4);
    e += mtn * ridge * ridge * smoothstep(-0.1, 0.35, c + seaBias) * 1.6;
    e += 0.25 * fbm3(x * 5, y * 5, z * 5, s + 9, 3) * roughness;
    if (gen.dunes) e += 0.08 * Math.sin((x * 7 + valueNoise3(x * 3, y * 3, z * 3, s) * 2) * 5);
    for (const cr of craters) {
      const dd = Math.acos(clamp(x * cr.d[0] + y * cr.d[1] + z * cr.d[2], -1, 1));
      if (dd < cr.r * 1.7) e += craterProfile(dd, cr.r) * cr.depth * 2.2;
    }
    for (const b of basins) {
      const dd = Math.acos(clamp(x * b.d[0] + y * b.d[1] + z * b.d[2], -1, 1));
      e -= b.depth * Math.exp(-(dd * dd) / (b.r * b.r));
    }
    out[i] = e;
  }
  // normalise: the 97th percentile of |e - mean| maps to 1, extremes are soft-clipped,
  // giving a broad hypsometric curve (oceans need real volume to cover the surface)
  let mean = 0;
  for (let i = 0; i < out.length; i++) mean += out[i];
  mean /= out.length;
  const absd = Float32Array.from(out, (v) => Math.abs(v - mean)).sort();
  const p97 = Math.max(1e-6, absd[Math.floor(absd.length * 0.97)]);
  for (let i = 0; i < out.length; i++) {
    const x = (out[i] - mean) / p97;
    out[i] = Math.sign(x) * (Math.abs(x) <= 1 ? Math.abs(x) : 1 + Math.tanh((Math.abs(x) - 1) * 0.8) * 0.5);
  }
  return out;
}

// Assign skin material from elevation, latitude and the solid recipe.
export function assignSkins(body, opts = {}) {
  const s = body.surface;
  const g = s.grid;
  const inv = body.inv;
  const solidTotal = SOLID_KEYS.reduce((a, k) => a + inv[k], 0) || 1;
  const frac = Object.fromEntries(SOLID_KEYS.map((k) => [k, inv[k] / solidTotal]));
  let minE = Infinity, maxE = -Infinity;
  for (let i = 0; i < s.count; i++) {
    const e = s.bed[i];
    minE = Math.min(minE, e);
    maxE = Math.max(maxE, e);
  }
  const span = Math.max(1e-6, maxE - minE);
  const seed = body.seed;
  const only = opts.cells;
  const list = only || null;
  const n = list ? list.length : s.count;
  for (let k = 0; k < n; k++) {
    const i = list ? list[k] : k;
    const h = (s.bed[i] - minE) / span; // 0..1
    const nz = valueNoise3(g.dir[i * 3] * 6, g.dir[i * 3 + 1] * 6, g.dir[i * 3 + 2] * 6, seed + 3) * 0.5 + 0.5;
    // weights per material using fraction and preferred altitude bands
    const wts = [
      frac.rock * (0.6 + 0.8 * smoothstep(0.35, 0.7, h)) * (0.7 + nz * 0.6),
      frac.granite * (0.2 + 2.5 * smoothstep(0.6, 0.85, h)),
      frac.sand * (0.4 + 2.2 * (1 - smoothstep(0.25, 0.5, h))) * (body.gen.dunes ? 2 : 1),
      frac.soil * (0.5 + 2.0 * smoothstep(0.35, 0.5, h) * (1 - smoothstep(0.6, 0.8, h))) * (0.8 + nz * 0.4),
      frac.clay * (0.4 + 1.5 * (1 - smoothstep(0.2, 0.45, h))) * (1.2 - nz * 0.4),
      frac.iron * 0.4 * (nz > 0.85 ? 4 : 0.3),
    ];
    let best = 0, bw = -1;
    for (let m = 0; m < wts.length; m++) if (wts[m] > bw) { bw = wts[m]; best = m; }
    s.mat[i] = best;
  }
}

// Build a terrestrial body from a recipe of condensed volume fractions.
export function buildTerrestrial(body, { radius, recipe, N, gen = {}, temp0 = 15 }) {
  body.type = 'terrestrial';
  body.gen = gen;
  const s = (body.surface = new Surface(N));
  const Vtot = (4 / 3) * Math.PI * radius ** 3;
  const total = RECIPE_KEYS.reduce((a, k) => a + (recipe[k] || 0), 0) || 1;
  const vol = Object.fromEntries(RECIPE_KEYS.map((k) => [k, ((recipe[k] || 0) / total) * Vtot]));
  for (const k of SOLID_KEYS) body.inv[k] = vol[k];
  const Vsolid = body.solidVolume();
  let Rs = Math.cbrt((3 * Vsolid) / (4 * Math.PI));
  const relief = generateRelief(s, gen, body.seed, body.roughness);
  const reliefScale = (gen.relief ?? 0.05) * Rs * body.roughness;
  for (let i = 0; i < s.count; i++) {
    s.bed[i] = relief[i] * reliefScale;
    s.sed[i] = 0;
  }
  s.solveRs(Vsolid, Math.min(0.3, Rs * 0.5));
  for (let i = 0; i < s.count; i++) s.baseE[i] = s.bed[i] + s.sed[i];
  assignSkins(body);
  if (gen.sedimentCover) for (let i = 0; i < s.count; i++) {
    // convert a thin top layer of bed into loose sediment (geometry unchanged)
    const t = gen.sedimentCover * (s.mat[i] === MAT.SAND || s.mat[i] === MAT.SOIL ? 1 : 0.3);
    s.bed[i] -= t;
    s.sed[i] += t;
  }
  s.computeHeads();
  // temperatures
  for (let i = 0; i < s.count; i++) {
    const lat = s.grid.lat[i];
    s.temp[i] = temp0 + 18 - 45 * Math.sin(lat) ** 2 - Math.max(0, s.bed[i]) * 25;
  }
  // ice to cold cells first
  if (vol.ice > 0) distributeIce(s, vol.ice, gen.iceEverywhere);
  // lava into lows
  if (vol.lava > 0) {
    s.computeHeads();
    const order = [...Array(s.count).keys()].sort((a, b) => s.ground[a] - s.ground[b]);
    const take = order.slice(0, Math.max(10, Math.floor(s.count * 0.25)));
    const per = vol.lava / take.length;
    for (const i of take) { s.lava[i] = per; s.lavaT[i] = 1; }
  }
  // liquid water to equilibrium level
  s.computeHeads();
  if (vol.water > 0) { s.fillToLevel(vol.water); saturateSubmerged(s); }
  // organic into soils
  if (vol.organic > 0) {
    let wsum = 0;
    for (let i = 0; i < s.count; i++) wsum += s.mat[i] === MAT.SOIL ? 3 : 0.2;
    for (let i = 0; i < s.count; i++) s.org[i] = (vol.organic * (s.mat[i] === MAT.SOIL ? 3 : 0.2)) / wsum;
  }
  for (let i = 0; i < s.count; i++) s.nut[i] = s.mat[i] === MAT.SOIL ? 0.6 : 0.15;
  s.computeHeads();
  s.version++;
  body.updateCaches();
  return body;
}

export function distributeIce(s, volume, everywhere = false) {
  const wts = new Float32Array(s.count);
  let sum = 0;
  for (let i = 0; i < s.count; i++) {
    const lat = Math.abs(s.grid.lat[i]);
    const w = everywhere ? 0.3 + lat : Math.pow(smoothstep(1.0, 1.4, lat), 1.5) + 0.002;
    wts[i] = w * s.grid.omega[i];
    sum += wts[i];
  }
  if (sum <= 0) { for (let i = 0; i < s.count; i++) wts[i] = s.grid.omega[i]; sum = 4 * Math.PI; }
  for (let i = 0; i < s.count; i++) s.ice[i] += (volume * wts[i]) / sum;
}

export function buildGasGiant(body, { radius, coreFraction = 0.06, bands, rings = null, storms = [] }) {
  body.type = 'gas';
  const Vtot = (4 / 3) * Math.PI * radius ** 3;
  const core = Vtot * coreFraction;
  body.inv.rock = core * 0.6;
  body.inv.iron = core * 0.4;
  body.gas = {
    envelope: Vtot - core,
    water: 0,
    bands: bands || { c1: [0.85, 0.72, 0.55], c2: [0.62, 0.42, 0.3], c3: [0.95, 0.9, 0.8], contrast: 1, speed: 1, count: 14 },
    rings,
    spots: storms.map((st) => ({ ...st })),
  };
  body.updateCaches();
  return body;
}

export function buildStar(body, { radius, temperatureK = 5800, luminosity = 1 }) {
  body.type = 'star';
  body.star = { volume: (4 / 3) * Math.PI * radius ** 3, temperatureK, luminosity };
  body.updateCaches();
  return body;
}

export function starColor(T) {
  // approximate blackbody tint
  const t = clamp((T - 2500) / 9000, 0, 1);
  const r = t < 0.4 ? 1 : 1 - (t - 0.4) * 0.6;
  const g = 0.45 + t * 0.55 - Math.max(0, t - 0.6) * 0.25;
  const b = 0.15 + t * 0.95;
  return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
}

export function seedFromName(name) {
  return hashString(name) % 100000;
}

export { PLANTS };

// Pre-fill soil storage under initial water (taken from that water) so initial
// coverage does not visibly drop as the sea floor soaks up water.
export function saturateSubmerged(s) {
  s.computeHeads();
  let total = 0, moved = 0;
  for (let i = 0; i < s.count; i++) total += s.w[i];
  for (let i = 0; i < s.count; i++) {
    if (s.head[i] - s.ground[i] < 0.005) continue;
    const need = Math.max(0, s.soilCapacity(i) - s.sw[i]);
    const t = Math.min(need, s.w[i]);
    s.w[i] -= t;
    s.sw[i] += t;
    moved += t;
  }
  if (moved > 0 && total - moved > 0) s.fillToLevel(total - moved);
}
