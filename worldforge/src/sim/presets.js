// Stylized educational body and scene presets (gameplay scale, not real values).
import { Body, buildTerrestrial, buildGasGiant, buildStar, qualityN, distributeIce, saturateSubmerged } from './body.js';
import { climateStep } from './climate.js';
import { PLANTS } from './surface.js';
import { plantSuitability, makeAgent, speciesSuitability, SPECIES } from './life.js';
import { RNG } from './rng.js';
import { orbitVelocity } from './orbits.js';

export const AU = 1000; // gameplay distance where a Sun-like star gives Earth-like flux

export const BODY_PRESETS = {
  earth: {
    label: 'Earth-inspired', icon: '🌍', type: 'terrestrial', desc: 'Continents, oceans, atmosphere, polar ice and life-friendly climate.',
    make: (o) => terrestrial(o, {
      name: 'Earth', radius: 10, seed: 4021, kind: 'planet', atmosphere: 1, spinPeriod: 120, tilt: 0.41, albedo: 0.3,
      recipe: { rock: 0.56, granite: 0.12, sand: 0.04, soil: 0.06, clay: 0.03, iron: 0.19, organic: 0.0004, ice: 0.0015 },
      oceanCoverage: 0.64, gen: { continents: 0.8, mountains: 0.55, relief: 0.035, sedimentCover: 0.01 }, temp0: 14, life: true,
    }),
  },
  moon: {
    label: 'Moon-inspired', icon: '🌕', type: 'terrestrial', desc: 'Airless, cratered rocky body.',
    make: (o) => terrestrial(o, {
      name: 'Moon', radius: 2.7, seed: 77, kind: 'moon', atmosphere: 0, spinPeriod: 400, tilt: 0.03, albedo: 0.12,
      recipe: { rock: 0.62, granite: 0.3, iron: 0.06, sand: 0.02 }, gen: { continents: 0.25, mountains: 0.12, craters: 46, craterMax: 0.32, relief: 0.05 }, temp0: -20,
    }),
  },
  mars: {
    label: 'Mars-inspired', icon: '🔴', type: 'terrestrial', desc: 'Dry red terrain, thin air, icy poles and dust storms.',
    make: (o) => terrestrial(o, {
      name: 'Mars', radius: 5.3, seed: 1877, kind: 'planet', atmosphere: 0.012, spinPeriod: 125, tilt: 0.44, albedo: 0.25, tint: [1.42, 0.72, 0.48],
      recipe: { rock: 0.6, sand: 0.12, clay: 0.08, iron: 0.17, granite: 0.03, ice: 0.006 }, gen: { continents: 0.6, mountains: 0.4, craters: 22, craterMax: 0.25, basins: 1, relief: 0.05, dunes: true, sedimentCover: 0.015 }, tempBias: 22,
      temp0: -55, atmoColor: [0.95, 0.6, 0.4], flux: 0.43,
    }),
  },
  venus: {
    label: 'Venus-inspired', icon: '🟡', type: 'terrestrial', desc: 'Thick hot cloud deck. Unsuitable for normal wildlife.',
    make: (o) => terrestrial(o, {
      name: 'Venus', radius: 9.5, seed: 2401, kind: 'planet', atmosphere: 90, greenhouse: 1.45, spinPeriod: -2400, tilt: 0.05, albedo: 0.75, tint: [1.15, 0.95, 0.75],
      recipe: { rock: 0.7, granite: 0.08, iron: 0.2, clay: 0.02 }, gen: { continents: 0.45, mountains: 0.3, relief: 0.03, craters: 6 }, temp0: 450, atmoColor: [1.0, 0.85, 0.5], cloudDeck: true, flux: 1.9,
    }),
  },
  mercury: {
    label: 'Mercury-inspired', icon: '⚫', type: 'terrestrial', desc: 'Airless iron-rich world with extreme day/night contrast.',
    make: (o) => terrestrial(o, {
      name: 'Mercury', radius: 3.8, seed: 909, kind: 'planet', atmosphere: 0, spinPeriod: 360, tilt: 0.0, albedo: 0.1, tint: [0.95, 0.92, 0.88],
      recipe: { iron: 0.6, rock: 0.3, granite: 0.1 }, gen: { continents: 0.3, mountains: 0.15, craters: 40, craterMax: 0.28, relief: 0.045 }, temp0: 100, flux: 6.7,
    }),
  },
  jupiter: {
    label: 'Jupiter-inspired', icon: '🟠', type: 'gas', desc: 'Banded gas giant with a persistent giant storm.',
    make: (o) => gas(o, { name: 'Jupiter', radius: 28, density: 0.4, spinPeriod: 50, tilt: 0.05, bands: { c1: [0.88, 0.78, 0.62], c2: [0.66, 0.44, 0.3], c3: [0.97, 0.94, 0.86], contrast: 1, speed: 1.2, count: 16 }, storms: [{ lat: -0.38, lon: 0.6, size: 0.24, color: [0.78, 0.36, 0.24], persistent: true, intensity: 1 }], atmoColor: [0.95, 0.8, 0.6] }),
  },
  saturn: {
    label: 'Saturn-inspired', icon: '🪐', type: 'gas', desc: 'Pale bands and stable rings in the equatorial plane.',
    make: (o) => gas(o, { name: 'Saturn', radius: 24, density: 0.3, spinPeriod: 55, tilt: 0.47, bands: { c1: [0.92, 0.85, 0.66], c2: [0.8, 0.68, 0.48], c3: [0.97, 0.93, 0.8], contrast: 0.6, speed: 1, count: 12 }, rings: { inner: 1.3, outer: 2.3, color: [0.92, 0.85, 0.7], opacity: 0.85 }, storms: [], atmoColor: [0.95, 0.88, 0.7] }),
  },
  neptune: {
    label: 'Neptune-inspired', icon: '🔵', type: 'gas', desc: 'Deep blue envelope with fast atmospheric motion.',
    make: (o) => gas(o, { name: 'Neptune', radius: 14, density: 0.6, spinPeriod: 40, tilt: 0.49, bands: { c1: [0.25, 0.45, 0.95], c2: [0.15, 0.3, 0.75], c3: [0.55, 0.75, 1.0], contrast: 0.5, speed: 3, count: 8 }, storms: [{ lat: -0.35, lon: 1.2, size: 0.16, color: [0.08, 0.15, 0.45], persistent: true, intensity: 1 }], atmoColor: [0.4, 0.6, 1.0] }),
  },
  sun: {
    label: 'Sun-inspired', icon: '☀️', type: 'star', desc: 'Luminous star: light, heat and most of the mass.',
    make: (o) => {
      const b = new Body({ name: o.name || 'Sun', kind: 'star', pos: o.pos, vel: o.vel, spinPeriod: 600, tilt: 0.12 });
      return buildStar(b, { radius: o.radius ?? 40, temperatureK: o.temperatureK ?? 5800, luminosity: o.luminosity ?? 1 });
    },
  },
  ocean: {
    label: 'Ocean world', icon: '🌊', type: 'terrestrial', desc: 'Deep water envelope around a small solid core.',
    make: (o) => terrestrial(o, {
      name: 'Oceanus', radius: 8, seed: 3131, kind: 'ocean', atmosphere: 1.3, spinPeriod: 100, tilt: 0.3, albedo: 0.25,
      recipe: { rock: 0.15, iron: 0.06, granite: 0.02, water: 0.77 }, gen: { continents: 0.6, mountains: 0.5, relief: 0.06 }, temp0: 18,
    }),
  },
  lava: {
    label: 'Lava world', icon: '🌋', type: 'terrestrial', desc: 'Hot crust, glowing flows and cooling basalt.',
    make: (o) => terrestrial(o, {
      name: 'Vulcan', radius: 7, seed: 6660, kind: 'lava', atmosphere: 0.4, greenhouse: 2.5, spinPeriod: 90, tilt: 0.1, albedo: 0.1, tempBias: 120, tint: [0.75, 0.68, 0.65],
      recipe: { rock: 0.84, iron: 0.12, granite: 0.02, lava: 0.02 }, gen: { continents: 0.5, mountains: 0.5, relief: 0.045, vents: 7, craters: 8 }, temp0: 200, atmoColor: [1.0, 0.55, 0.3],
    }),
  },
  frozen: {
    label: 'Frozen world', icon: '🧊', type: 'terrestrial', desc: 'Ice-rich surface with meltable deposits.',
    make: (o) => terrestrial(o, {
      name: 'Glacia', radius: 6, seed: 5150, kind: 'frozen', atmosphere: 0.5, spinPeriod: 110, tilt: 0.3, albedo: 0.6, tempBias: -35,
      recipe: { rock: 0.62, granite: 0.08, iron: 0.1, ice: 0.2 }, gen: { continents: 0.5, mountains: 0.4, relief: 0.04, iceEverywhere: true, craters: 4 }, temp0: -45, atmoColor: [0.7, 0.85, 1.0],
    }),
  },
  rocky: {
    label: 'Rocky planet', icon: '🪨', type: 'terrestrial', desc: 'Bare rock: a blank terrestrial canvas.',
    make: (o) => terrestrial(o, {
      name: 'Terra Nova', radius: 7, seed: 1111, kind: 'planet', atmosphere: 1, spinPeriod: 120, tilt: 0.3,
      recipe: { rock: 0.75, granite: 0.08, soil: 0.04, sand: 0.03, iron: 0.1 }, gen: { continents: 0.6, mountains: 0.5, relief: 0.06 }, temp0: 15,
    }),
  },
};

function terrestrial(o, p) {
  const quality = o.quality || 'medium';
  const radius = o.radius ?? p.radius;
  const b = new Body({
    name: o.name || p.name, kind: p.kind, seed: o.seed ?? p.seed, roughness: o.roughness ?? 1, spinPeriod: p.spinPeriod, tilt: p.tilt,
    atmosphere: p.atmosphere, greenhouse: p.greenhouse ?? 1, tempBias: p.tempBias ?? 0, albedo: p.albedo, tint: p.tint, atmoColor: p.atmoColor, pos: o.pos, vel: o.vel,
  });
  b.cloudDeck = !!p.cloudDeck;
  b.presetFlux = p.flux ?? 1;
  const N = o.N || qualityN(quality, radius);
  buildTerrestrial(b, { radius, recipe: p.recipe, N, gen: p.gen, temp0: p.temp0 });
  if (p.oceanCoverage) setOceanCoverage(b, p.oceanCoverage);
  b.vents = [];
  if (p.gen.vents) {
    const rng = new RNG(b.seed + 99);
    for (let k = 0; k < p.gen.vents; k++) b.vents.push({ dir: rng.unit(), rate: 0.25 * (radius / 7) ** 2, phase: rng.next() * 10 });
  }
  b.updateCaches();
  return b;
}

// Fill water so the given fraction of the surface area is ocean (coherent init).
export function setOceanCoverage(body, coverage) {
  const s = body.surface;
  s.computeHeads();
  const order = [...Array(s.count).keys()].sort((a, b) => s.ground[a] - s.ground[b]);
  let acc = 0, L = s.ground[order[0]];
  const total = 4 * Math.PI;
  for (const i of order) {
    acc += s.grid.omega[i];
    L = s.ground[i];
    if (acc / total >= coverage) break;
  }
  let vol = 0;
  for (let i = 0; i < s.count; i++) if (L > s.ground[i]) vol += (s.grid.omega[i] / 3) * (L ** 3 - s.ground[i] ** 3);
  s.fillToLevel(vol);
  saturateSubmerged(s);
  return vol;
}

function gas(o, p) {
  const b = new Body({ name: o.name || p.name, kind: 'gas', spinPeriod: p.spinPeriod, tilt: p.tilt, atmosphere: 50, atmoColor: p.atmoColor, pos: o.pos, vel: o.vel });
  buildGasGiant(b, { radius: o.radius ?? p.radius, coreFraction: 0.03, bands: p.bands, rings: p.rings ? { ...p.rings } : null, storms: p.storms });
  b.gas.density = p.density;
  b.updateCaches();
  return b;
}

export function makeBody(key, opts = {}) {
  const p = BODY_PRESETS[key];
  if (!p) throw new Error('Unknown preset ' + key);
  const b = p.make(opts);
  b.presetKey = key;
  return b;
}

// Bring climate near equilibrium and optionally seed initial life.
export function spinUpClimate(body, env, steps = 60) {
  if (!body.surface) return;
  const s = body.surface;
  for (let k = 0; k < steps; k++) {
    // rotate the sun around the spin axis to average day/night
    const a = (k / steps) * Math.PI * 2 * 3;
    const d = env.sunDir;
    const c = Math.cos(a), sn = Math.sin(a);
    const sunDir = [d[0] * c + d[2] * sn, d[1], -d[0] * sn + d[2] * c];
    climateStep(body, 2, { sunDir, flux: env.flux, weather: 1 });
  }
  // put initial vapour near saturation over water without creating water: take from ocean
  s.computeHeads();
}

export function seedInitialLife(body, rng, popCap, animalsPerSpecies = 8) {
  const s = body.surface;
  if (!s) return;
  s.computeHeads();
  // soil moisture start
  for (let i = 0; i < s.count; i++) {
    if (s.head[i] - s.ground[i] > 0.01) continue;
    const cap = s.soilCapacity(i);
    const lat = Math.abs(s.grid.lat[i]);
    const wetness = 0.35 + 0.35 * Math.cos(lat * 3) * Math.cos(lat * 3);
    const give = Math.min(cap * wetness, findWater(s, cap * wetness));
    s.sw[i] += give;
  }
  for (let i = 0; i < s.count; i++) {
    for (let p = 0; p < PLANTS; p++) {
      const suit = plantSuitability(body, i, p);
      if (suit > 0.2 && rng.next() < 0.75) s.veg[i * PLANTS + p] = Math.min(0.9, suit * (p >= 3 ? 0.6 : 0.5) * (0.5 + rng.next()));
    }
  }
  // normalise totals
  for (let i = 0; i < s.count; i++) {
    let t = 0;
    for (let p = 0; p < PLANTS - 1; p++) t += s.veg[i * PLANTS + p];
    if (t > 1) for (let p = 0; p < PLANTS - 1; p++) s.veg[i * PLANTS + p] /= t;
  }
  for (let sp = 0; sp < SPECIES.length; sp++) {
    let placed = 0;
    for (let tries = 0; tries < 600 && placed < animalsPerSpecies; tries++) {
      const d = rng.unit();
      if (speciesSuitability(body, sp, d) > 0.35 && body.agents.length < popCap) {
        const n = Math.min(3, animalsPerSpecies - placed);
        for (let k = 0; k < n; k++) {
          const j = rng.unit();
          body.agents.push(makeAgent(body, sp, [d[0] + j[0] * 0.01, d[1] + j[1] * 0.01, d[2] + j[2] * 0.01], rng));
        }
        placed += n;
      }
    }
  }
  // seed a reserve so planet-scale populations exist beyond the explicit cap
  for (let sp = 0; sp < SPECIES.length; sp++) {
    const present = body.agents.filter((a) => a.sp === sp).length;
    if (present > 0) body.reserve[sp] = present * 4;
  }

  function findWater(s, need) {
    // soil moisture is taken from the ocean (conservative)
    let best = -1, bw = 0;
    for (let k = 0; k < 20; k++) {
      const c = Math.floor(rng.next() * s.count);
      if (s.w[c] > bw) { bw = s.w[c]; best = c; }
    }
    if (best < 0) return 0;
    const t = Math.min(s.w[best] * 0.5, need);
    s.w[best] -= t;
    return t;
  }
}

// ---------------- scenes ----------------
export const SCENES = {
  earthMoon: { name: 'Earth–Moon', icon: '🌍', desc: 'Earth with an orbiting Moon, weather and life.' },
  sunEarthMoon: { name: 'Sun–Earth–Moon', icon: '☀️', desc: 'Nested gravity: Earth orbits the Sun, the Moon orbits Earth.' },
  saturn: { name: 'Saturn & moons', icon: '🪐', desc: 'Ringed Saturn with three orbiting moons.' },
  solar: { name: 'Solar neighborhood', icon: '🌌', desc: 'Sun, Mercury, Venus, Earth+Moon, Mars and Jupiter.' },
  mars: { name: 'Terraform Mars', icon: '🔴', desc: 'Dry red world: add water, air and life. Goals enabled.' },
  floodLab: { name: 'Flood Lab', icon: '💧', desc: 'Mountains and basins. Pour water and run the erosion experiment.' },
  stormWorld: { name: 'Storm World', icon: '🌀', desc: 'Warm ocean with islands, a hurricane and a tornado.' },
  blank: { name: 'Blank Forge', icon: '✨', desc: 'Empty space. Build your first body.' },
};

function place(body, pos) {
  body.pos = pos.slice();
}

// Build scene contents into world (world API: addBody, settings, rng, virtualSun).
export function buildScene(world, key) {
  const q = world.settings.quality;
  const rng = new RNG(world.seed ^ 0x51ed);
  const life = (b, n = 8) => seedInitialLife(b, rng, world.settings.popCap, n);
  const settle = (b, flux, sunDir = [1, 0.1, 0.3]) => spinUpClimate(b, { sunDir: norm(sunDir), flux }, 50);
  world.virtualSun = null;
  world.sceneKey = key;
  world.sceneName = SCENES[key].name;
  const orbit = (child, parent, dist, opts = {}) => {
    const ang = opts.angle ?? 0;
    child.pos = [parent.pos[0] + Math.cos(ang) * dist, parent.pos[1], parent.pos[2] + Math.sin(ang) * dist];
    child.updateCaches();
    parent.updateCaches();
    child.vel = orbitVelocity(child, parent, { e: opts.e || 0, dir: opts.dir || 1 });
    child.parentId = parent.id;
  };
  switch (key) {
    case 'earthMoon': {
      world.virtualSun = { dir: norm([1, 0.05, 0.35]), flux: 1 };
      const earth = makeBody('earth', { quality: q, pos: [0, 0, 0] });
      const moon = makeBody('moon', { quality: q });
      world.addBody(earth);
      world.addBody(moon);
      orbit(moon, earth, 60, { angle: 2.2 });
      balanceMomentum([earth, moon]);
      settle(earth, 1, world.virtualSun.dir);
      settle(moon, 1, world.virtualSun.dir);
      life(earth, 9);
      world.selectedId = earth.id;
      break;
    }
    case 'sunEarthMoon': {
      const sun = makeBody('sun', { pos: [0, 0, 0], radius: 40 });
      const earth = makeBody('earth', { quality: q });
      const moon = makeBody('moon', { quality: q });
      world.addBody(sun); world.addBody(earth); world.addBody(moon);
      orbit(earth, sun, AU, { angle: 0 });
      orbit(moon, earth, 40, { angle: 1.0 });
      moon.vel = orbitVelocity(moon, earth, {});
      balanceMomentum([sun, earth, moon]);
      settle(earth, 1, [-1, 0, 0]);
      settle(moon, 1, [-1, 0, 0]);
      life(earth, 7);
      world.selectedId = earth.id;
      break;
    }
    case 'saturn': {
      world.virtualSun = { dir: norm([1, 0.25, 0.2]), flux: 0.3 };
      const sat = makeBody('saturn', { pos: [0, 0, 0] });
      world.addBody(sat);
      const m1 = makeBody('moon', { name: 'Titanis', radius: 3.4, seed: 31, quality: q });
      m1.atmosphere = 1.4; m1.atmoColor = [1.0, 0.7, 0.35]; m1.tint = [1.1, 0.95, 0.75]; m1.presetFlux = 0.44;
      const m2 = makeBody('frozen', { name: 'Enceladia', radius: 1.9, seed: 32, quality: q });
      const m3 = makeBody('moon', { name: 'Rhean', radius: 2.3, seed: 33, quality: q });
      world.addBody(m1); world.addBody(m2); world.addBody(m3);
      orbit(m2, sat, 72, { angle: 0.5 });
      orbit(m3, sat, 105, { angle: 2.6 });
      orbit(m1, sat, 150, { angle: 4.4 });
      balanceMomentum(world.bodies);
      for (const m of [m1, m2, m3]) settle(m, 0.3, world.virtualSun.dir);
      world.selectedId = sat.id;
      break;
    }
    case 'solar': {
      const sun = makeBody('sun', { pos: [0, 0, 0], radius: 40 });
      world.addBody(sun);
      const list = [
        ['mercury', 350, 0.4], ['venus', 650, 2.1], ['earth', AU, 3.9], ['mars', 1450, 5.2], ['jupiter', 3000, 1.3],
      ];
      let earth = null;
      for (const [k, d, a] of list) {
        const b = makeBody(k, { quality: k === 'earth' ? q : 'low' });
        world.addBody(b);
        orbit(b, sun, d, { angle: a });
        if (k === 'earth') earth = b;
      }
      const moon = makeBody('moon', { quality: 'low' });
      world.addBody(moon);
      orbit(moon, earth, 40, { angle: 0.3 });
      balanceMomentum(world.bodies);
      for (const b of world.bodies) if (b.surface) {
        const dx = sun.pos[0] - b.pos[0], dz = sun.pos[2] - b.pos[2];
        const d = Math.hypot(dx, dz);
        settle(b, (AU / d) ** 2, [dx / d, 0, dz / d]);
      }
      life(earth, 6);
      world.selectedId = earth.id;
      break;
    }
    case 'mars': {
      world.virtualSun = { dir: norm([1, 0.05, 0.3]), flux: 0.43 };
      const mars = makeBody('mars', { quality: q, pos: [0, 0, 0] });
      world.addBody(mars);
      const phobos = makeBody('moon', { name: 'Phobetor', radius: 0.9, seed: 404, quality: 'low' });
      world.addBody(phobos);
      orbit(phobos, mars, 26, { angle: 1 });
      balanceMomentum(world.bodies);
      settle(mars, 0.43, world.virtualSun.dir);
      world.selectedId = mars.id;
      world.mode = 'terraform';
      break;
    }
    case 'floodLab': {
      world.virtualSun = { dir: norm([1, 0.2, 0.4]), flux: 1 };
      const b = new Body({ name: 'Flood Lab', seed: 2222, atmosphere: 1, spinPeriod: 160, tilt: 0.2, pos: [0, 0, 0] });
      buildTerrestrial(b, {
        radius: 8, N: qualityN(q, 8),
        recipe: { rock: 0.55, granite: 0.15, soil: 0.12, sand: 0.08, clay: 0.04, iron: 0.06, water: 0.0008 },
        gen: { continents: 0.5, mountains: 0.9, basins: 5, relief: 0.06, sedimentCover: 0.02 }, temp0: 18,
      });
      b.presetFlux = 1;
      world.addBody(b);
      settle(b, 1, world.virtualSun.dir);
      // ready-made experiment source: the highest mountain
      let hi = 0;
      for (let i = 0; i < b.surface.count; i++) if (b.surface.bed[i] > b.surface.bed[hi]) hi = i;
      const g = b.surface.grid;
      b.labPeak = [g.dir[hi * 3], g.dir[hi * 3 + 1], g.dir[hi * 3 + 2]];
      life(b, 3);
      world.selectedId = b.id;
      world.pendingTool = 'pour';
      break;
    }
    case 'stormWorld': {
      world.virtualSun = { dir: norm([1, 0.0, 0.2]), flux: 1.05 };
      const b = new Body({ name: 'Tempest', seed: 7373, atmosphere: 1.2, spinPeriod: 100, tilt: 0.25, tempBias: 6, pos: [0, 0, 0] });
      buildTerrestrial(b, { radius: 9, N: qualityN(q, 9), recipe: { rock: 0.6, granite: 0.08, soil: 0.06, sand: 0.06, clay: 0.03, iron: 0.17 }, gen: { continents: 0.9, mountains: 0.4, relief: 0.035, seaBias: -0.25 }, temp0: 26 });
      b.presetFlux = 1.05;
      setOceanCoverage(b, 0.86);
      world.addBody(b);
      settle(b, 1.05, world.virtualSun.dir);
      life(b, 6);
      world.selectedId = b.id;
      world.stormDemo = true;
      break;
    }
    case 'blank':
    default:
      world.virtualSun = { dir: norm([1, 0.1, 0.3]), flux: 1 };
      world.selectedId = null;
      break;
  }
  for (const b of world.bodies) b.updateCaches();
}

// Zero total momentum so the system's barycentre stays put.
export function balanceMomentum(bodies) {
  let M = 0;
  const p = [0, 0, 0];
  for (const b of bodies) {
    b.updateCaches();
    M += b.massCache;
    for (let k = 0; k < 3; k++) p[k] += b.massCache * b.vel[k];
  }
  for (const b of bodies) for (let k = 0; k < 3; k++) b.vel[k] -= p[k] / M;
}

export function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export { distributeIce };
