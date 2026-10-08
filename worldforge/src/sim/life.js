// Ecology: vegetation channels per cell + explicit animal agents with an
// aggregated reserve population per species (explicit + reserve = population).
import { PLANTS } from './surface.js';
import { MATERIALS, MAT } from './materials.js';
import { vegTotal } from './water.js';
import { clamp, smoothstep } from './rng.js';

export const PLANT_TYPES = [
  { key: 'grass', name: 'Grass', tMin: -8, tMax: 42, tOpt: 20, mMin: 0.08, mOpt: 0.3, fert: 0.15, growth: 0.1, spread: 0.08, food: 1.0 },
  { key: 'flowers', name: 'Flowering plants', tMin: 2, tMax: 36, tOpt: 21, mMin: 0.2, mOpt: 0.45, fert: 0.35, growth: 0.07, spread: 0.05, food: 0.8 },
  { key: 'shrubs', name: 'Shrubs', tMin: -14, tMax: 48, tOpt: 26, mMin: 0.03, mOpt: 0.18, fert: 0.08, growth: 0.035, spread: 0.03, food: 0.5 },
  { key: 'conifer', name: 'Conifer trees', tMin: -30, tMax: 28, tOpt: 5, mMin: 0.18, mOpt: 0.4, fert: 0.15, growth: 0.02, spread: 0.015, food: 0.1 },
  { key: 'broadleaf', name: 'Broadleaf trees', tMin: 3, tMax: 38, tOpt: 22, mMin: 0.3, mOpt: 0.55, fert: 0.3, growth: 0.018, spread: 0.012, food: 0.2 },
  { key: 'fungi', name: 'Fungi', tMin: 0, tMax: 32, tOpt: 15, mMin: 0.3, mOpt: 0.6, fert: 0.0, growth: 0.06, spread: 0.04, food: 0.3, decomposer: true },
];

export const SPECIES = [
  { key: 'grazer', name: 'Grazer', desc: 'Deer-like grazing quadruped', habitat: 'land', diet: 'plants', foods: [0, 1, 2], tMin: -12, tMax: 36, speed: 0.22, life: 520, mature: 70, repro: 0.025, cost: 0.4, litter: 1, metab: 0.012, size: 1.0, atm: 0.25 },
  { key: 'predator', name: 'Fox', desc: 'Small predator', habitat: 'land', diet: 'prey', prey: [2, 0, 3], tMin: -22, tMax: 36, speed: 0.34, life: 460, mature: 60, repro: 0.016, cost: 0.5, litter: 1, metab: 0.014, size: 0.8, atm: 0.25 },
  { key: 'rabbit', name: 'Hopper', desc: 'Rabbit-like herbivore', habitat: 'land', diet: 'plants', foods: [0, 1], tMin: -16, tMax: 36, speed: 0.26, life: 260, mature: 30, repro: 0.05, cost: 0.35, litter: 2, metab: 0.016, size: 0.5, atm: 0.25 },
  { key: 'bird', name: 'Bird', desc: 'Flying seed/insect eater', habitat: 'air', diet: 'mixed', foods: [1, 3, 4], tMin: -14, tMax: 40, speed: 0.6, life: 380, mature: 50, repro: 0.03, cost: 0.4, litter: 2, metab: 0.014, size: 0.5, atm: 0.3 },
  { key: 'fish', name: 'Fish', desc: 'Needs water deeper than 0.03', habitat: 'water', diet: 'plankton', tMin: -1, tMax: 33, speed: 0.28, life: 300, mature: 40, repro: 0.04, cost: 0.35, litter: 2, metab: 0.012, size: 0.5, atm: 0.0 },
  { key: 'insect', name: 'Insect swarm', desc: 'Pollinators that need flowers', habitat: 'land', diet: 'nectar', foods: [1, 2, 5], tMin: 4, tMax: 40, speed: 0.2, life: 150, mature: 20, repro: 0.07, cost: 0.3, litter: 2, metab: 0.02, size: 0.3, atm: 0.2 },
];

export const BIOMES = {
  forest: { name: 'Temperate forest', plants: { broadleaf: 0.6, conifer: 0.3, grass: 0.4, fungi: 0.3, flowers: 0.2 }, animals: { grazer: 4, predator: 2, bird: 3, insect: 3, rabbit: 3 } },
  taiga: { name: 'Taiga / tundra', plants: { conifer: 0.6, shrubs: 0.4, grass: 0.4 }, animals: { grazer: 4, predator: 2, rabbit: 3 } },
  grassland: { name: 'Grassland', plants: { grass: 0.7, flowers: 0.4, shrubs: 0.2 }, animals: { grazer: 5, rabbit: 5, insect: 3, bird: 2, predator: 1 } },
  wetland: { name: 'Wetland', plants: { grass: 0.6, flowers: 0.4, fungi: 0.4, broadleaf: 0.2 }, animals: { fish: 6, bird: 3, insect: 3 } },
  desert: { name: 'Desert scrub', plants: { shrubs: 0.5, grass: 0.15 }, animals: { rabbit: 3, insect: 2 } },
  ocean: { name: 'Ocean', plants: {}, animals: { fish: 10, bird: 3 } },
};

const EPS = 1e-9;

function adapt(body) {
  return body.adapt || { cold: false, dry: false, lowAir: false };
}

export function moistureIndex(s, i) {
  const cap = s.soilCapacity(i);
  const m = cap > 0 ? s.sw[i] / cap : 0;
  return Math.min(1, m + Math.min(0.3, s.precip[i] * 200));
}

export function plantSuitability(body, i, p, details = null) {
  const s = body.surface;
  const pt = PLANT_TYPES[p];
  const ad = adapt(body);
  const T = s.temp[i];
  const tMin = pt.tMin - (ad.cold ? 25 : 0);
  const mMin = pt.mMin * (ad.dry ? 0.3 : 1);
  const atmNeed = ad.lowAir ? 0.005 : 0.08;
  const depth = s.head[i] - s.ground[i];
  let reason = '';
  let suit = 1;
  if (body.atmosphere < atmNeed) { suit = 0; reason = `Needs atmosphere ≥ ${atmNeed} bar`; }
  else if (depth > 0.03) { suit = 0; reason = 'Submerged under water'; }
  else if (s.lava[i] > 0) { suit = 0; reason = 'Covered by lava'; }
  else if (T < tMin) { suit = 0; reason = `Too cold (${T.toFixed(0)}°C, needs ≥ ${tMin}°C)`; }
  else if (T > pt.tMax) { suit = 0; reason = `Too hot (${T.toFixed(0)}°C, needs ≤ ${pt.tMax}°C)`; }
  else {
    const tr = Math.max(pt.tOpt - tMin, pt.tMax - pt.tOpt);
    const tS = clamp(1 - ((T - pt.tOpt) / tr) ** 2, 0.05, 1);
    const m = moistureIndex(s, i);
    const mS = m < mMin ? 0 : smoothstep(mMin, Math.max(mMin + 0.01, pt.mOpt * (ad.dry ? 0.4 : 1)), m) * 0.8 + 0.2;
    if (mS === 0) reason = `Too dry (moisture ${(m * 100).toFixed(0)}%, needs ≥ ${(mMin * 100).toFixed(0)}%)`;
    const fert = s.nut[i] + (MATERIALS[s.mat[i]].fertility || 0) * 0.5 + Math.min(0.5, s.org[i] / (s.grid.omega[i] * s.ground[i] ** 2 * 0.01 + EPS));
    let fS = pt.decomposer ? clamp(s.org[i] / (s.grid.omega[i] * s.ground[i] ** 2 * 0.002 + EPS), 0, 1) : clamp(0.25 + fert / (pt.fert + 0.2), 0, 1);
    if (pt.decomposer && fS < 0.05 && !reason) reason = 'Needs dead organic matter to decompose';
    const iceT = s.ice[i] / (s.grid.omega[i] * s.ground[i] ** 2);
    const snow = iceT > 0.01 ? 0.15 : 1;
    if (snow < 1 && !reason) reason = 'Buried under snow/ice';
    suit = tS * mS * fS * snow;
    if (ad.cold || ad.dry || ad.lowAir) suit *= 0.75;
  }
  if (details) details.reason = reason;
  return suit;
}

export function speciesSuitability(body, sp, pos, details = null) {
  const s = body.surface;
  const S = SPECIES[sp];
  const ad = adapt(body);
  const i = s.grid.cellOf(pos[0], pos[1], pos[2]);
  const T = s.temp[i];
  const depth = s.head[i] - s.ground[i];
  const tMin = S.tMin - (ad.cold ? 25 : 0);
  const atm = ad.lowAir ? 0.01 : S.atm;
  let suit = 1, reason = '';
  if (body.atmosphere < atm) { suit = 0; reason = `Atmosphere ${body.atmosphere.toFixed(2)} bar is too thin (needs ≥ ${atm})`; }
  else if (S.habitat === 'water' && depth < 0.03) { suit = 0; reason = 'Fish need water deeper than 0.03 units'; }
  else if (S.habitat === 'land' && depth > 0.02) { suit = 0; reason = 'Land animal placed in water'; }
  else if (s.lava[i] > 0) { suit = 0; reason = 'Lava!'; }
  else if (T < tMin) { suit = 0; reason = `Too cold (${T.toFixed(0)}°C, needs ≥ ${tMin}°C)`; }
  else if (T > S.tMax) { suit = 0; reason = `Too hot (${T.toFixed(0)}°C, needs ≤ ${S.tMax}°C)`; }
  else {
    suit = clamp(1 - Math.max(0, T - (S.tMax - 8)) / 8 - Math.max(0, tMin + 8 - T) / 8, 0.1, 1);
    const food = foodAt(body, S, i);
    if (S.diet === 'plants' || S.diet === 'nectar') {
      if (food < 0.05) reason = 'No suitable food plants here — it will starve';
      suit *= 0.3 + 0.7 * Math.min(1, food * 2);
    }
  }
  if (details) { details.reason = reason; details.cell = i; details.temp = T; details.depth = depth; }
  return suit;
}

function foodAt(body, S, i) {
  const s = body.surface;
  if (S.diet === 'plankton') {
    const depth = s.head[i] - s.ground[i];
    return depth > 0.03 ? 0.6 + Math.min(0.4, s.nut[i]) : 0;
  }
  if (!S.foods) return 0.5;
  let f = 0;
  for (const p of S.foods) f += s.veg[i * PLANTS + p] * PLANT_TYPES[p].food;
  return f;
}

// Seed vegetation in a brush region. Returns { planted, rejected, reason }.
export function seedPlants(body, cells, weights, p, amount, override = false) {
  const s = body.surface;
  let planted = 0, rejected = 0;
  const det = {};
  let reason = '';
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const suit = plantSuitability(body, c, p, det);
    if (suit < 0.05 && !override) { rejected++; reason = det.reason || reason; continue; }
    const idx = c * PLANTS + p;
    const add = amount * weights[k];
    s.veg[idx] = Math.min(1, s.veg[idx] + add);
    if (override && suit < 0.05) s.veg[idx] = Math.max(s.veg[idx], 0.3);
    planted++;
  }
  return { planted, rejected, reason };
}

let agentSeq = 1;
export function bumpAgentId(id) { if (id >= agentSeq) agentSeq = id + 1; }

export function makeAgent(body, sp, pos, rng, opts = {}) {
  const p = pos.slice();
  const l = Math.hypot(p[0], p[1], p[2]) || 1;
  p[0] /= l; p[1] /= l; p[2] /= l;
  // random tangent heading
  const r = rng.unit();
  const d = r[0] * p[0] + r[1] * p[1] + r[2] * p[2];
  const h = [r[0] - d * p[0], r[1] - d * p[1], r[2] - d * p[2]];
  const hl = Math.hypot(h[0], h[1], h[2]) || 1;
  const S = SPECIES[sp];
  return {
    id: opts.id ?? agentSeq++,
    sp,
    p,
    h: [h[0] / hl, h[1] / hl, h[2] / hl],
    age: opts.age ?? S.mature * (0.8 + rng.next() * 0.6),
    energy: opts.energy ?? 0.7,
    health: 1,
    state: 'wander',
    lifespan: S.life * (0.8 + rng.next() * 0.4),
    phase: rng.next() * 6.28,
    alt: S.habitat === 'air' ? 0.25 + rng.next() * 0.2 : 0,
    override: !!opts.override,
    gen: opts.gen ?? 0,
    lastEvent: '',
  };
}

// explicit agents per species are limited to a fair share of the cap
export function speciesCap(cap) {
  return Math.max(8, Math.round((cap / SPECIES.length) * 1.4));
}

export function totalPopulation(body) {
  const out = SPECIES.map(() => 0);
  for (const a of body.agents) out[a.sp]++;
  return out;
}

// Drop an individual or small group. Returns { placed, reason }.
export function dropAnimals(body, sp, pos, count, rng, settings, override = false) {
  const det = {};
  const suit = speciesSuitability(body, sp, pos, det);
  if (suit < 0.05 && !override) return { placed: 0, reason: det.reason || 'Unsuitable habitat' };
  const cap = settings.popCap;
  let placed = 0;
  for (let k = 0; k < count; k++) {
    if (body.agents.length >= cap) {
      body.reserve[sp] += count - k;
      break;
    }
    const jitter = rng.unit();
    const q = [pos[0] + jitter[0] * 0.02, pos[1] + jitter[1] * 0.02, pos[2] + jitter[2] * 0.02];
    if (!override && speciesSuitability(body, sp, q) < 0.05) continue;
    body.agents.push(makeAgent(body, sp, q, rng, { override: suit < 0.05 }));
    placed++;
  }
  const aggregated = count - placed;
  if (placed === 0 && body.agents.length >= cap) return { placed: 0, aggregated, reason: `Explicit population cap (${cap}) reached — ${aggregated} added to the aggregated population instead.` };
  return { placed, aggregated: 0, reason: placed === 0 ? det.reason || 'Unsuitable habitat' : suit < 0.05 ? 'EXPERIMENTAL OVERRIDE: unsuitable habitat, likely to die.' : det.reason || '' };
}

// ---------------- vegetation step ----------------
export function vegetationStep(body, dt, env) {
  const s = body.surface;
  const g = s.grid;
  const n = s.count;
  const rng = env.rng;
  const natural = body.lifeNatural && env.naturalLife !== false;
  for (let i = 0; i < n; i++) {
    const area = g.omega[i] * s.ground[i] ** 2;
    const base = i * PLANTS;
    let total = 0;
    for (let p = 0; p < PLANTS - 1; p++) total += s.veg[base + p];
    // decomposition of organic matter (fungi accelerate)
    const fungi = s.veg[base + 5];
    if (s.org[i] > 0) {
      const dec = Math.min(s.org[i], s.org[i] * (0.002 + fungi * 0.03) * dt * (s.temp[i] > 0 ? 1 : 0.1));
      s.org[i] -= dec;
      s.nut[i] = Math.min(2, s.nut[i] + (dec / (area * 0.01 + EPS)) * 0.5);
    }
    if (total <= EPS && fungi <= EPS) continue;
    let deadTotal = 0;
    for (let p = 0; p < PLANTS; p++) {
      const v = s.veg[base + p];
      if (v <= 0) continue;
      const pt = PLANT_TYPES[p];
      const suit = plantSuitability(body, i, p);
      const K = p === 5 ? 1 : 1.0;
      const crowd = p === 5 ? v : total;
      let dv = pt.growth * suit * v * (1 - crowd / K) * dt;
      let die = 0;
      if (suit < 0.08) die = v * (0.06 + (0.08 - suit)) * dt;
      // water use: growth requires soil water
      if (dv > 0 && p !== 5) {
        const need = dv * area * 0.005;
        if (s.sw[i] < need) dv *= s.sw[i] / need;
        const used = Math.min(s.sw[i], need);
        s.sw[i] -= used;
        s.vap[i] += used; // transpired
      }
      s.nut[i] = Math.max(0, s.nut[i] - Math.max(0, dv) * 0.05);
      const nv = clamp(v + dv - die, 0, 1);
      s.veg[base + p] = nv < 0.002 ? 0 : nv;
      deadTotal += Math.max(0, v - s.veg[base + p]);
      // natural colonisation
      if (natural && nv > 0.3 && rng.next() < pt.spread * dt * 4) {
        const nb = g.nbr[i * 4 + rng.int(4)];
        if (s.veg[nb * PLANTS + p] < 0.02 && plantSuitability(body, nb, p) > 0.15) s.veg[nb * PLANTS + p] = 0.03;
      }
    }
    if (deadTotal > 0) s.org[i] += deadTotal * area * 0.001;
    // storm/fire damage marks recover slowly
    if (s.damage[i] > 0) s.damage[i] = Math.max(0, s.damage[i] - dt * 0.004);
    if (s.burnt[i] > 0) s.burnt[i] = Math.max(0, s.burnt[i] - dt * 0.003);
  }
}

// ---------------- animal step ----------------
function tangentStep(a, dist) {
  const p = a.p, h = a.h;
  p[0] += h[0] * dist; p[1] += h[1] * dist; p[2] += h[2] * dist;
  let l = Math.hypot(p[0], p[1], p[2]);
  p[0] /= l; p[1] /= l; p[2] /= l;
  const d = h[0] * p[0] + h[1] * p[1] + h[2] * p[2];
  h[0] -= d * p[0]; h[1] -= d * p[1]; h[2] -= d * p[2];
  l = Math.hypot(h[0], h[1], h[2]) || 1;
  h[0] /= l; h[1] /= l; h[2] /= l;
}

function steerToward(a, target, k) {
  const p = a.p;
  const d = target[0] * p[0] + target[1] * p[1] + target[2] * p[2];
  let tx = target[0] - d * p[0], ty = target[1] - d * p[1], tz = target[2] - d * p[2];
  const l = Math.hypot(tx, ty, tz);
  if (l < 1e-6) return;
  tx /= l; ty /= l; tz /= l;
  a.h[0] += (tx - a.h[0]) * k; a.h[1] += (ty - a.h[1]) * k; a.h[2] += (tz - a.h[2]) * k;
  const hl = Math.hypot(a.h[0], a.h[1], a.h[2]) || 1;
  a.h[0] /= hl; a.h[1] /= hl; a.h[2] /= hl;
}

function cellDirOf(s, c) {
  return [s.grid.dir[c * 3], s.grid.dir[c * 3 + 1], s.grid.dir[c * 3 + 2]];
}

function recordDeath(body, a, cause, env) {
  const s = body.surface;
  const c = s.grid.cellOf(a.p[0], a.p[1], a.p[2]);
  const S = SPECIES[a.sp];
  s.org[c] += 0.0004 * S.size * s.grid.omega[c] * s.ground[c] ** 2 * 10;
  body.lifeStats = body.lifeStats || { births: 0, deaths: 0, causes: {} };
  body.lifeStats.deaths++;
  body.lifeStats.causes[cause] = (body.lifeStats.causes[cause] || 0) + 1;
  if (rngEventGate(body, cause)) body.logEvent(env.time, `${S.name} died (${cause}).`);
}

function rngEventGate(body, cause) {
  body._evGate = body._evGate || {};
  const t = Date.now();
  if (body._evGate[cause] && t - body._evGate[cause] < 3000) return false;
  body._evGate[cause] = t;
  return true;
}

export function animalStep(body, dt, env) {
  const s = body.surface;
  if (!s) return;
  const g = s.grid;
  const rng = env.rng;
  const R = s.Rs;
  const agents = body.agents;
  const cap = env.popCap;
  // spatial buckets
  const buckets = new Map();
  for (const a of agents) {
    const c = g.cellOf(a.p[0], a.p[1], a.p[2]);
    a._c = c;
    let b = buckets.get(c);
    if (!b) buckets.set(c, (b = []));
    b.push(a);
  }
  const counts = totalPopulation(body);
  const newborn = [];
  const storms = body.storms;
  for (const a of agents) {
    if (a.dead) continue;
    const S = SPECIES[a.sp];
    const c = a._c;
    a.age += dt;
    a.energy -= S.metab * dt;
    const T = s.temp[c];
    const depth = s.head[c] - s.ground[c];
    const det = {};
    const suit = speciesSuitability(body, a.sp, a.p, det);
    a.suit = suit;
    a.need = det.reason || '';
    let speed = S.speed;
    a.state = 'wander';
    // threats: storms, fire, predators
    let threat = null;
    for (const st of storms) {
      const dot = st.pos[0] * a.p[0] + st.pos[1] * a.p[1] + st.pos[2] * a.p[2];
      const ang = Math.acos(Math.min(1, Math.max(-1, dot)));
      const danger = st.type === 'tornado' ? st.radius * 5 : st.type === 'hurricane' ? st.radius * 0.6 : st.type === 'blizzard' || st.type === 'dust' ? st.radius * 0.7 : 0;
      if (ang < danger) {
        threat = st.pos;
        const windHit = st.type === 'tornado' ? (ang < st.radius * 1.5 ? 0.6 : 0.05) : 0.02;
        a.health -= windHit * st.intensity * dt * (S.habitat === 'water' ? 0.1 : 1);
        if (a.health <= 0) a.cause = st.type === 'tornado' ? 'tornado' : 'storm';
      }
    }
    if (s.fire[c] > 0.2 && S.habitat !== 'water') { a.health -= 0.3 * dt; threat = cellDirOf(s, c); a.cause = 'fire'; }
    if (s.lava[c] > 0) { a.health -= 2 * dt; a.cause = 'lava'; }
    if (suit < 0.05) {
      a.health -= (S.habitat === 'water' && depth < 0.03 ? 0.25 : S.habitat === 'land' && depth > 0.02 ? 0.12 : 0.04) * dt * (a.override ? 0.5 : 1);
      if (!a.cause || a.health > 0.5) a.cause = det.reason ? det.reason.split(' (')[0].toLowerCase() : 'unsuitable habitat';
      // seek better habitat
      let bestC = -1, bestS = suit;
      for (let k = 0; k < 4; k++) {
        const nb = g.nbr[c * 4 + k];
        const ss = speciesSuitability(body, a.sp, cellDirOf(s, nb));
        if (ss > bestS) { bestS = ss; bestC = nb; }
      }
      if (bestC >= 0) { steerToward(a, cellDirOf(s, bestC), 0.6); a.state = 'seeking habitat'; }
    }
    // predators nearby → flee (prey)
    if (!threat && (a.sp === 2 || a.sp === 0 || a.sp === 3)) {
      for (let k = -1; k < 4; k++) {
        const cc = k < 0 ? c : g.nbr[c * 4 + k];
        const b = buckets.get(cc);
        if (!b) continue;
        for (const o of b) if (o.sp === 1 && !o.dead) { threat = o.p; break; }
        if (threat) break;
      }
    }
    if (threat) {
      // steer away
      const away = [2 * a.p[0] - threat[0], 2 * a.p[1] - threat[1], 2 * a.p[2] - threat[2]];
      steerToward(a, away, 0.7);
      speed *= 1.8;
      a.state = 'fleeing';
    } else if (a.energy < 0.6 || (a.foraging && a.energy < 0.92)) {
      // hysteresis: once hungry, keep feeding until well fed (enables reproduction)
      a.foraging = a.energy < 0.92;
      a.state = 'foraging';
      if (S.diet === 'prey') {
        // hunt
        let target = null;
        for (let k = -1; k < 4 && !target; k++) {
          const cc = k < 0 ? c : g.nbr[c * 4 + k];
          const b = buckets.get(cc);
          if (!b) continue;
          for (const o of b) if (!o.dead && S.prey.includes(o.sp) && (o.sp !== 0 || o.age < SPECIES[0].mature * 1.5)) { target = o; break; }
        }
        if (target) {
          a.state = 'hunting';
          steerToward(a, target.p, 0.8);
          speed *= 1.5;
          const dd = Math.acos(Math.min(1, target.p[0] * a.p[0] + target.p[1] * a.p[1] + target.p[2] * a.p[2])) * R;
          if (dd < 0.12 && rng.next() < 0.6) {
            target.dead = true;
            target.cause = 'predation';
            a.energy = Math.min(1, a.energy + 0.55);
            a.state = 'eating';
          }
        } else {
          // follow scent: nearest prey within ~0.35 rad
          let best = null, bd = Math.cos(0.35);
          for (const o of agents) {
            if (o.dead || !S.prey.includes(o.sp)) continue;
            const d = o.p[0] * a.p[0] + o.p[1] * a.p[1] + o.p[2] * a.p[2];
            if (d > bd) { bd = d; best = o; }
          }
          if (best) { steerToward(a, best.p, 0.5); a.state = 'tracking prey'; }
          else steerToward(a, cellDirOf(s, g.nbr[c * 4 + rng.int(4)]), 0.2);
        }
      } else {
        const food = foodAt(body, S, c);
        if (food > 0.05) {
          // eat
          a.state = S.diet === 'plankton' ? 'feeding' : 'grazing';
          speed *= 0.25;
          const eat = Math.min(0.06 * dt, food * 0.1);
          a.energy = Math.min(1, a.energy + eat * 4.5);
          if (S.foods && S.diet !== 'nectar') {
            let left = eat * 0.25 * S.size;
            for (const p of S.foods) {
              const idx = c * PLANTS + p;
              const take = Math.min(s.veg[idx] * 0.5, left);
              s.veg[idx] -= take;
              left -= take;
              if (left <= 0) break;
            }
          } else if (S.diet === 'nectar') {
            // pollination boosts flowers
            s.veg[c * PLANTS + 1] = Math.min(1, s.veg[c * PLANTS + 1] + 0.002 * dt);
          }
        } else {
          let bestC = -1, bestF = food;
          for (let k = 0; k < 4; k++) {
            const nb = g.nbr[c * 4 + k];
            const f = foodAt(body, S, nb);
            if (f > bestF && speciesSuitability(body, a.sp, cellDirOf(s, nb)) > 0.05) { bestF = f; bestC = nb; }
          }
          if (bestC >= 0) steerToward(a, cellDirOf(s, bestC), 0.5);
          else steerToward(a, cellDirOf(s, g.nbr[c * 4 + rng.int(4)]), 0.3);
        }
      }
    } else if (env.night && S.habitat === 'land' && rng.next() < 0.7) {
      a.state = 'resting';
      speed = 0;
    } else {
      // wander, comfortable temperature seeking
      if (T > S.tMax - 5 || T < S.tMin + 5) {
        let bestC = -1, bestD = Math.abs(T - (S.tMin + S.tMax) / 2);
        for (let k = 0; k < 4; k++) {
          const nb = g.nbr[c * 4 + k];
          const d = Math.abs(s.temp[nb] - (S.tMin + S.tMax) / 2);
          if (d < bestD && speciesSuitability(body, a.sp, cellDirOf(s, nb)) > 0.05) { bestD = d; bestC = nb; }
        }
        if (bestC >= 0) { steerToward(a, cellDirOf(s, bestC), 0.4); a.state = T > S.tMax - 5 ? 'seeking shade' : 'seeking warmth'; }
      } else if (rng.next() < 0.3) {
        const r = rng.unit();
        steerToward(a, [a.p[0] + r[0] * 0.5, a.p[1] + r[1] * 0.5, a.p[2] + r[2] * 0.5], 0.3);
      }
    }
    // starvation
    if (a.energy <= 0) { a.energy = 0; a.health -= 0.05 * dt; if (a.health <= 0.3) a.cause = 'starvation'; }
    else if (a.energy > 0.4 && suit > 0.2) a.health = Math.min(1, a.health + 0.02 * dt);
    // movement with habitat look-ahead
    if (speed > 0) {
      const step = (speed * dt) / R;
      const ahead = [a.p[0] + a.h[0] * step * 3, a.p[1] + a.h[1] * step * 3, a.p[2] + a.h[2] * step * 3];
      const ca = g.cellOf(ahead[0], ahead[1], ahead[2]);
      const dA = s.head[ca] - s.ground[ca];
      const bad = (S.habitat === 'land' && dA > 0.02 && depth <= 0.02) || (S.habitat === 'water' && dA < 0.03 && depth >= 0.03);
      if (bad) {
        a.h[0] = -a.h[0]; a.h[1] = -a.h[1]; a.h[2] = -a.h[2];
      }
      tangentStep(a, step);
      // wind drift (birds and insects more)
      const drift = S.habitat === 'air' ? 0.03 : S.key === 'insect' ? 0.02 : 0.004;
      const we = s.windE[c], wn = s.windN[c];
      if (Math.abs(we) + Math.abs(wn) > 3) {
        const ex = g.east[c * 3], ey = g.east[c * 3 + 1], ez = g.east[c * 3 + 2];
        const nx = g.north[c * 3], ny = g.north[c * 3 + 1], nz = g.north[c * 3 + 2];
        const dx = (ex * we + nx * wn) * drift * dt / R, dy = (ey * we + ny * wn) * drift * dt / R, dz = (ez * we + nz * wn) * drift * dt / R;
        a.p[0] += dx; a.p[1] += dy; a.p[2] += dz;
        const l = Math.hypot(a.p[0], a.p[1], a.p[2]);
        a.p[0] /= l; a.p[1] /= l; a.p[2] /= l;
      }
    }
    // reproduction (density + capacity + energy limited)
    if (a.age > S.mature && a.energy > 0.75 && a.health > 0.6 && suit > 0.25 && a.age - (a.lastBirth || 0) > S.mature * 0.6 && rng.next() < S.repro * 0.35 * dt) {
      a.lastBirth = a.age;
      let local = 0;
      for (let k = -1; k < 4; k++) {
        const b = buckets.get(k < 0 ? c : g.nbr[c * 4 + k]);
        if (b) for (const o of b) if (o.sp === a.sp) local++;
      }
      const localCap = S.diet === 'prey' ? 2 : S.key === 'insect' ? 8 : 5;
      const food = foodAt(body, S, c);
      if (local < localCap * Math.max(0.2, Math.min(1.5, food + (S.diet === 'prey' ? 1 : 0)))) {
        a.energy -= S.cost;
        for (let l = 0; l < S.litter; l++) {
          if (agents.length + newborn.length < cap && counts[a.sp] < speciesCap(cap)) {
            const baby = makeAgent(body, a.sp, a.p, rng, { age: 0, energy: 0.5, gen: a.gen + 1 });
            newborn.push(baby);
            counts[a.sp]++;
          } else {
            body.reserve[a.sp] += 1; // aggregated population beyond explicit cap
          }
        }
        body.lifeStats = body.lifeStats || { births: 0, deaths: 0, causes: {} };
        body.lifeStats.births += S.litter;
        a.state = 'reproducing';
      }
    }
    if (a.age > a.lifespan) { a.dead = true; a.cause = 'old age'; }
    if (a.health <= 0) a.dead = true;
  }
  for (const a of agents) if (a.dead) recordDeath(body, a, a.cause || 'unknown', env);
  body.agents = agents.filter((a) => !a.dead).concat(newborn);
}

// Aggregated reserve populations: logistic dynamics bounded by habitat capacity.
export function reserveStep(body, dt, env) {
  const s = body.surface;
  if (!s) return;
  body._capT = (body._capT || 0) - dt;
  if (body._capT <= 0 || !body.capacity) {
    body._capT = 5;
    const capArr = [0, 0, 0, 0, 0, 0];
    const stride = Math.max(1, Math.floor(s.count / 1500));
    for (let i = 0; i < s.count; i += stride) {
      const dir = cellDirOf(s, i);
      for (let sp = 0; sp < SPECIES.length; sp++) {
        const suit = speciesSuitability(body, sp, dir);
        if (suit > 0.2) capArr[sp] += suit * (SPECIES[sp].diet === 'prey' ? 0.08 : 0.4) * stride;
      }
    }
    body.capacity = capArr.map((x) => Math.round(x));
  }
  const counts = totalPopulation(body);
  for (let sp = 0; sp < SPECIES.length; sp++) {
    let r = body.reserve[sp];
    const K = body.capacity[sp];
    const total = r + counts[sp];
    if (r > 0) {
      if (counts[sp] === 0 && K <= 0) r -= Math.max(1, r * 0.2 * dt);
      else r += r * 0.01 * dt * (1 - total / Math.max(1, K));
      r = Math.max(0, Math.min(r, Math.max(0, K - counts[sp]), 100000));
    }
    // promote reserve into explicit agents when room appears
    if (r >= 1 && body.agents.length < env.popCap && counts[sp] > 0 && counts[sp] < speciesCap(env.popCap) && env.rng.next() < 0.5) {
      const parent = body.agents.find((a) => a.sp === sp);
      if (parent) {
        body.agents.push(makeAgent(body, sp, parent.p, env.rng, { age: SPECIES[sp].mature, energy: 0.6 }));
        r -= 1;
      }
    }
    body.reserve[sp] = Math.floor(r * 1000) / 1000;
  }
}
