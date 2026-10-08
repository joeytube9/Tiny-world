// Weather systems attached to a body's local surface (planet-local unit vectors).
// Natural storms are constrained by atmosphere, moisture and temperature; forced
// storms are explicit sandbox overrides that supply artificial energy/moisture,
// which is recorded in body.ledger.forced so water conservation stays auditable.
import { PLANTS } from './surface.js';
import { removeSolid, depositSolid, vegTotal } from './water.js';
import { atmFactor } from './climate.js';
import { RNG } from './rng.js';

export const STORM_TYPES = {
  cloud: { name: 'Cloud formation', radius: 0.35, duration: 60, icon: '☁️' },
  clear: { name: 'Clear skies', radius: 0.4, duration: 30, icon: '☀️' },
  rain: { name: 'Light rain', radius: 0.25, duration: 60, icon: '🌦️' },
  heavyrain: { name: 'Heavy rain', radius: 0.22, duration: 60, icon: '🌧️' },
  thunder: { name: 'Thunderstorm', radius: 0.18, duration: 60, icon: '⛈️' },
  snow: { name: 'Snowfall', radius: 0.25, duration: 70, icon: '🌨️' },
  blizzard: { name: 'Blizzard', radius: 0.22, duration: 60, icon: '❄️' },
  heatwave: { name: 'Heatwave', radius: 0.35, duration: 80, icon: '🔥' },
  drought: { name: 'Drought', radius: 0.4, duration: 120, icon: '🏜️' },
  gust: { name: 'Wind gust', radius: 0.2, duration: 15, icon: '💨' },
  wind: { name: 'Sustained wind', radius: 0.35, duration: 120, icon: '🌬️' },
  tornado: { name: 'Tornado / waterspout', radius: 0.035, duration: 45, icon: '🌪️' },
  hurricane: { name: 'Hurricane / cyclone', radius: 0.28, duration: 150, icon: '🌀' },
  dust: { name: 'Dust / sandstorm', radius: 0.3, duration: 70, icon: '🟫' },
};

let stormSeq = 1;
export function bumpStormId(id) { if (id >= stormSeq) stormSeq = id + 1; }

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l; v[1] /= l; v[2] /= l;
  return v;
}

function regionStats(body, pos, radius) {
  const s = body.surface;
  const g = s.grid;
  const cells = g.cellsWithin(pos[0], pos[1], pos[2], radius, []);
  let T = 0, moist = 0, water = 0, wet = 0, area = 0, dryLoose = 0, vap = 0;
  for (const c of cells) {
    const a = g.omega[c];
    area += a;
    T += s.temp[c] * a;
    vap += s.vap[c] + s.cloud[c];
    const depth = s.head[c] - s.ground[c];
    if (depth > 0.04) wet += a;
    water += s.w[c];
    if (depth < 0.005 && s.sw[c] < s.soilCapacity(c) * 0.3 && (s.sed[c] > 0.002 || s.mat[c] === 2)) dryLoose += a;
  }
  const n = Math.max(area, 1e-9);
  return { cells, T: T / n, wetFrac: wet / n, vapor: vap, water, dryLooseFrac: dryLoose / n, area };
}

// Returns { ok, reason, note } for natural spawning, or a forced note.
export function checkStorm(body, type, pos, radius, forced) {
  if (body.type === 'star') return { ok: false, reason: 'Stars have no weather layer to edit.' };
  if (body.type === 'gas') {
    if (['hurricane', 'thunder', 'wind', 'gust', 'cloud', 'tornado'].includes(type)) return { ok: true, note: 'Gas giant: adds a storm vortex to the envelope.' };
    return { ok: false, reason: 'Gas giants have no surface: only vortex storms, wind and clouds apply.' };
  }
  const A = body.atmosphere;
  if (forced) {
    return { ok: true, note: A < 0.01 ? 'FORCED: no atmosphere — artificial energy and moisture are being supplied by the sandbox.' : 'FORCED: sandbox supplies any missing energy/moisture.' };
  }
  if (A < 0.005) return { ok: false, reason: `No atmosphere (${A.toFixed(3)} bar). Natural weather is impossible here. Add atmosphere or switch to Forced.` };
  const st = regionStats(body, pos, radius);
  const needMoist = st.area * 0.00015 * atmFactor(A) * (body.surface.Rs ** 2);
  switch (type) {
    case 'rain': case 'heavyrain': case 'thunder': case 'cloud':
      if (st.vapor + st.water * 0.02 < needMoist * (type === 'heavyrain' || type === 'thunder' ? 2 : 1))
        return { ok: false, reason: 'Too little moisture in this region. Pour water/add an ocean nearby or use Forced.' };
      if (type === 'thunder' && st.T < 8) return { ok: false, reason: `Too cold for convection (${st.T.toFixed(0)}°C, need ≥ 8°C).` };
      if (A < 0.05 && type !== 'cloud') return { ok: false, reason: 'Atmosphere too thin for rain (need ≥ 0.05 bar).' };
      return { ok: true };
    case 'snow': case 'blizzard':
      if (st.T > 3) return { ok: false, reason: `Too warm for snow (${st.T.toFixed(0)}°C). Natural snow needs ≤ 3°C.` };
      if (st.vapor + st.water * 0.02 < needMoist) return { ok: false, reason: 'Too little moisture for snow.' };
      return { ok: true };
    case 'hurricane': {
      if (A < 0.3) return { ok: false, reason: 'Atmosphere too thin for a hurricane (need ≥ 0.3 bar).' };
      const spin = Math.abs(120 / Math.max(5, Math.abs(body.spinPeriod)));
      if (spin < 0.2) return { ok: false, reason: 'Planet spins too slowly to organise a cyclone.' };
      if (st.wetFrac < 0.6) return { ok: false, reason: 'Hurricanes need open ocean to form.' };
      if (st.T < 24) return { ok: false, reason: `Ocean too cold (${st.T.toFixed(0)}°C). Natural hurricanes need ≥ 24°C water.` };
      const lat = Math.asin(pos[1]);
      if (Math.abs(lat) < 0.06) return { ok: false, reason: 'Too close to the equator: no Coriolis spin.' };
      return { ok: true };
    }
    case 'tornado':
      if (A < 0.3) return { ok: false, reason: 'Atmosphere too thin for a tornado.' };
      if (st.T < 5) return { ok: false, reason: 'Too cold for the instability tornadoes need.' };
      return { ok: true };
    case 'dust':
      if (st.dryLooseFrac < 0.3) return { ok: false, reason: 'Needs dry loose sand or sediment on the ground.' };
      return { ok: true };
    default:
      return { ok: true };
  }
}

export function createStorm(body, type, pos, opts = {}) {
  const def = STORM_TYPES[type];
  const p = norm3(pos.slice());
  const st = {
    id: opts.id ?? stormSeq++,
    type,
    pos: p,
    radius: opts.radius ?? def.radius,
    intensity: opts.intensity ?? 0.8,
    target: opts.intensity ?? 0.8,
    duration: opts.duration ?? def.duration,
    age: 0,
    vel: opts.vel ? opts.vel.slice() : [0, 0, 0], // tangent velocity (rad/s, local vector)
    forced: !!opts.forced,
    natural: !!opts.natural,
    spin: 1,
    track: [],
    surgeMax: 0,
    note: opts.note || '',
    waterspout: false,
    rainTotal: 0,
    damageTotal: 0,
    sedimentMoved: 0,
  };
  if (bumpStormId) bumpStormId(st.id);
  // cyclonic rotation from hemisphere and spin direction
  const lat = Math.asin(Math.max(-1, Math.min(1, p[1])));
  st.spin = (lat >= 0 ? 1 : -1) * Math.sign(body.spinPeriod || 1);
  if (body.type === 'gas') {
    body.gas.spots.push({ id: st.id, lat, lon: Math.atan2(p[0], p[2]), size: type === 'hurricane' ? 0.2 : 0.1, color: [0.85, 0.45, 0.3], life: st.duration, persistent: false, intensity: st.intensity });
    return null;
  }
  if (body.storms.length >= 12) body.storms.shift();
  body.storms.push(st);
  return st;
}

// Directional velocity helper: heading in radians (0 = east, pi/2 = north), speed rad/s.
export function headingVel(pos, heading, speed) {
  const [x, y, z] = pos;
  let ex = z, ey = 0, ez = -x;
  let el = Math.hypot(ex, ey, ez);
  if (el < 1e-6) { ex = 1; ez = 0; el = 1; }
  ex /= el; ez /= el;
  const nx = y * ez - z * ey, ny = z * ex - x * ez, nz = x * ey - y * ex;
  const c = Math.cos(heading) * speed, sn = Math.sin(heading) * speed;
  return [ex * c + nx * sn, ey * c + ny * sn, ez * c + nz * sn];
}

function moveStorm(st, dt) {
  const p = st.pos, v = st.vel;
  p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
  norm3(p);
  // keep velocity tangent
  const d = v[0] * p[0] + v[1] * p[1] + v[2] * p[2];
  v[0] -= d * p[0]; v[1] -= d * p[1]; v[2] -= d * p[2];
}

/**
 * Step all storms on a terrestrial body. env: { time, weather, autoWeather, rng }
 * Returns list of transient events (lightning) for rendering.
 */
export function stormsStep(body, dt, env) {
  const s = body.surface;
  if (!s) return [];
  const g = s.grid;
  const events = [];
  const forcing = s._forcing || (s._forcing = new Float32Array(s.count));
  const pboost = s._pboost || (s._pboost = new Float32Array(s.count));
  const rng = env.rng;
  const A = body.atmosphere;
  body.windZones.length = 0;
  for (const st of body.storms) {
    st.age += dt;
    const lat = Math.asin(Math.max(-1, Math.min(1, st.pos[1])));
    const c0 = g.cellOf(st.pos[0], st.pos[1], st.pos[2]);
    const depth0 = s.head[c0] - s.ground[c0];
    const T0 = s.temp[c0];
    // natural steering
    if (st.type === 'hurricane' && !st.forced) {
      const R = s.Rs;
      const steer = headingVel(st.pos, Math.atan2(s.windN[c0], s.windE[c0]), Math.hypot(s.windE[c0], s.windN[c0]) * 0.35 / R);
      const pole = headingVel(st.pos, lat >= 0 ? Math.PI / 2 : -Math.PI / 2, 0.0025);
      for (let k = 0; k < 3; k++) st.vel[k] += (steer[k] + pole[k] - st.vel[k]) * Math.min(1, dt * 0.2);
    }
    moveStorm(st, dt);
    if (st.track.length === 0 || st.age - st.track[st.track.length - 1].t > 1.5) {
      st.track.push({ t: st.age, p: st.pos.slice() });
      if (st.track.length > 60) st.track.shift();
    }
    // intensity evolution
    const lifeFrac = st.age / st.duration;
    if (st.forced) {
      st.intensity += (st.target * (lifeFrac > 0.85 ? (1 - lifeFrac) / 0.15 : 1) - st.intensity) * Math.min(1, dt * 0.5);
    } else if (st.type === 'hurricane') {
      const warmOcean = depth0 > 0.04 && T0 >= 26;
      const coolOcean = depth0 > 0.04 && T0 < 24;
      let d = warmOcean ? 0.02 : coolOcean ? -0.035 : depth0 <= 0.04 ? -0.07 : 0.004;
      if (A < 0.3) d -= 0.1;
      st.intensity = Math.min(1.4, st.intensity + d * dt);
      st.state = warmOcean ? 'strengthening over warm ocean' : depth0 <= 0.04 ? 'weakening over land' : coolOcean ? 'weakening over cold water' : 'steady';
    } else {
      // generic natural lifecycle with moisture dependence
      const env2 = lifeFrac < 0.15 ? lifeFrac / 0.15 : lifeFrac > 0.75 ? Math.max(0, (1 - lifeFrac) / 0.25) : 1;
      st.intensity += (st.target * env2 - st.intensity) * Math.min(1, dt * 0.6);
      if (A < 0.005) st.intensity -= dt * 0.2;
    }
    st.waterspout = st.type === 'tornado' && depth0 > 0.02;
    if (st.age >= st.duration || st.intensity <= 0.02) {
      st.dead = true;
      body.logEvent(env.time, `${STORM_TYPES[st.type].name} dissipated${st.state ? ' (' + st.state + ')' : ''}.`);
      continue;
    }
    applyStorm(body, st, dt, env, events, forcing, pboost, lat);
  }
  body.storms = body.storms.filter((st) => !st.dead);
  // natural automatic weather
  if (env.autoWeather && A >= 0.005 && rng) {
    body._autoT = (body._autoT || 0) + dt;
    if (body._autoT > 8) {
      body._autoT = 0;
      autoSpawn(body, env, rng);
    }
  }
  fireStep(body, dt, env);
  return events;
}

function autoSpawn(body, env, rng) {
  const s = body.surface;
  const nat = body.storms.filter((x) => x.natural);
  if (nat.length >= 3 || body.storms.length >= 8) return;
  const types = ['hurricane', 'thunder', 'dust', 'snow', 'rain', 'cloud'];
  const type = types[rng.int(types.length)];
  if (type === 'hurricane' && nat.some((x) => x.type === 'hurricane')) return;
  const p = rng.unit();
  // hurricanes prefer tropics
  if (type === 'hurricane') {
    const lat = (rng.next() < 0.5 ? 1 : -1) * rng.range(0.15, 0.4);
    const lon = rng.range(0, Math.PI * 2);
    p[0] = Math.cos(lat) * Math.sin(lon); p[1] = Math.sin(lat); p[2] = Math.cos(lat) * Math.cos(lon);
  }
  const radius = STORM_TYPES[type].radius;
  const chk = checkStorm(body, type, p, radius, false);
  const chance = { hurricane: 0.25, thunder: 0.5, dust: 0.5, snow: 0.4, rain: 0.4, cloud: 0.3 }[type] * (env.weather ?? 1);
  if (chk.ok && rng.next() < chance) {
    const st = createStorm(body, type, p, { natural: true, intensity: type === 'hurricane' ? 0.45 : 0.7, vel: headingVel(p, rng.range(0, 6.28), 0.004) });
    if (st) body.logEvent(env.time, `Natural ${STORM_TYPES[type].name.toLowerCase()} formed.`);
  }
}

function forcedMoisture(body, s, c, amount) {
  s.cloud[c] += amount;
  body.ledger.forced += amount;
}

function applyStorm(body, st, dt, env, events, forcing, pboost, lat) {
  const s = body.surface;
  const g = s.grid;
  const I = st.intensity * (env.weather ?? 1);
  const R = s.Rs;
  const range = st.type === 'tornado' ? st.radius * 4 : st.radius;
  const cells = g.cellsWithin(st.pos[0], st.pos[1], st.pos[2], range, s._stormCells || (s._stormCells = []));
  const [px, py, pz] = st.pos;
  const natural = !st.forced;
  // available natural moisture (vapour) in region feeds precipitation
  let moistureUsed = 0;
  for (const c of cells) {
    const dx = g.dir[c * 3], dy = g.dir[c * 3 + 1], dz = g.dir[c * 3 + 2];
    const dot = Math.max(-1, Math.min(1, dx * px + dy * py + dz * pz));
    const ang = Math.acos(dot);
    const fall = Math.max(0, 1 - ang / range);
    const area = g.omega[c] * s.ground[c] ** 2;
    // tangent direction from storm centre to cell
    let tx = dx - px * dot, ty = dy - py * dot, tz = dz - pz * dot;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const re = tx * g.east[c * 3] + ty * g.east[c * 3 + 1] + tz * g.east[c * 3 + 2];
    const rn = tx * g.north[c * 3] + ty * g.north[c * 3 + 1] + tz * g.north[c * 3 + 2];
    // tangential direction (counter-clockwise around outward normal) = n x r
    const te = -rn * st.spin, tn = re * st.spin;
    const precipType = st.type;
    switch (precipType) {
      case 'cloud': {
        const amt = Math.min(s.vap[c], s.vap[c] * 0.3 * fall * dt);
        s.vap[c] -= amt; s.cloud[c] += amt;
        if (!natural) forcedMoisture(body, s, c, area * 0.0004 * fall * I * dt);
        pboost[c] = Math.min(pboost[c], -0.1);
        break;
      }
      case 'clear': {
        const amt = s.cloud[c] * Math.min(1, 0.8 * fall * dt);
        s.cloud[c] -= amt; s.vap[c] += amt;
        pboost[c] = Math.min(pboost[c], -0.3);
        break;
      }
      case 'rain': case 'heavyrain': case 'thunder': case 'snow': case 'blizzard': {
        const strength = { rain: 0.5, heavyrain: 1.4, thunder: 1.8, snow: 0.6, blizzard: 1.2 }[precipType] * I * fall;
        // gather vapour into cloud (natural) or supply it (forced)
        const conv = Math.min(s.vap[c], s.vap[c] * 0.5 * strength * dt);
        s.vap[c] -= conv; s.cloud[c] += conv; moistureUsed += conv;
        if (!natural) forcedMoisture(body, s, c, area * 0.0035 * strength * dt);
        pboost[c] = Math.max(pboost[c], strength * 1.5);
        if (precipType === 'snow' || precipType === 'blizzard') {
          forcing[c] = Math.min(forcing[c], natural ? -4 * fall : -20 * fall * I);
          // cold air mass: direct cooling toward a snow-making temperature
          const tgt = natural ? s.temp[c] - 2 : -8 * I;
          if (s.temp[c] > tgt) s.temp[c] += (tgt - s.temp[c]) * Math.min(1, dt * 0.15 * fall);
        }
        if (precipType === 'blizzard' || precipType === 'thunder') {
          s.windE[c] += (te * 3 * I * fall + 4 * I * fall - s.windE[c]) * 0.3;
        }
        break;
      }
      case 'heatwave':
        forcing[c] = Math.max(forcing[c], 14 * I * fall);
        s.temp[c] += 12 * I * fall * Math.min(1, dt * 0.08);
        pboost[c] = Math.min(pboost[c], -0.4 * I);
        break;
      case 'drought':
        forcing[c] = Math.max(forcing[c], 6 * I * fall);
        pboost[c] = Math.min(pboost[c], -0.9 * I * fall);
        break;
      case 'dust': {
        const vE = (te * 2 + 5) * I * fall, vN = tn * 2 * I * fall;
        s.windE[c] += (vE - s.windE[c]) * 0.5;
        s.windN[c] += (vN - s.windN[c]) * 0.5;
        windErodeCell(body, c, dt * I * fall * 3, st);
        break;
      }
      case 'hurricane': {
        const rmax = st.radius * 0.18;
        const r = ang;
        const vmax = 9 * I;
        const vt = r < rmax ? vmax * (r / rmax) : vmax * Math.pow(rmax / Math.max(r, 1e-4), 0.55);
        const inflow = 0.35;
        const vE = (te * vt - re * vt * inflow) * fall + s.windE[c] * 0.2;
        const vN = (tn * vt - rn * vt * inflow) * fall + s.windN[c] * 0.2;
        s.windE[c] += (vE - s.windE[c]) * 0.6;
        s.windN[c] += (vN - s.windN[c]) * 0.6;
        // spiral rain bands + eyewall
        const band = 0.5 + 0.5 * Math.sin(r / st.radius * 18 - Math.atan2(rn, re) * 2 * st.spin + st.age * 0.5);
        const eye = r < rmax * 0.4 ? 0.05 : 1;
        const rainS = I * fall * eye * (0.5 + band) * 1.5;
        const conv = Math.min(s.vap[c], s.vap[c] * 0.6 * rainS * dt);
        s.vap[c] -= conv; s.cloud[c] += conv; moistureUsed += conv;
        const depth = s.head[c] - s.ground[c];
        if (natural && depth > 0.03 && s.temp[c] > 24) {
          // warm ocean evaporation feeding the storm
          const e = Math.min(s.w[c], area * 0.004 * I * fall * dt);
          s.w[c] -= e; s.cloud[c] += e; moistureUsed += e;
        }
        if (!natural) forcedMoisture(body, s, c, area * 0.004 * rainS * dt);
        pboost[c] = Math.max(pboost[c], rainS * 1.2);
        // storm surge: push existing water downwind (redistribution, no creation)
        if (depth > 0.003 && vt > 2) {
          let best = -1, bd = 0;
          for (let k = 0; k < 4; k++) {
            const d = vE * g.nbrE[c * 4 + k] + vN * g.nbrN[c * 4 + k];
            if (d > bd) { bd = d; best = g.nbr[c * 4 + k]; }
          }
          if (best >= 0) {
            const mv = Math.min(s.w[c] * 0.5, area * 0.006 * (vt / 9) * dt * 3);
            s.w[c] -= mv;
            s.w[best] += mv;
            const nd = s.head[best] - s.ground[best];
            const rise = mv / (g.omega[best] * s.ground[best] ** 2);
            if (nd < 0.05) st.surgeMax = Math.max(st.surgeMax, rise);
          }
        }
        windDamage(body, c, vt * fall, dt, st);
        break;
      }
      case 'tornado': {
        const core = st.radius;
        const vt = (ang < core ? 14 * (ang / core) : 14 * Math.pow(core / ang, 1.2)) * I;
        s.windE[c] += (te * vt - re * vt * 0.4 - s.windE[c]) * 0.7;
        s.windN[c] += (tn * vt - rn * vt * 0.4 - s.windN[c]) * 0.7;
        if (ang < core * 1.6) {
          // damage path
          s.damage[c] = Math.min(1, s.damage[c] + dt * 1.2 * I);
          windDamage(body, c, 20 * I, dt * 2, st);
          // bounded sediment lift, flung to the side/downstream
          const lift = removeSolid(s, c, area * 0.0025 * I * dt, s.mat[c] === 2 || s.mat[c] === 3, -0.05, 0.5);
          if (lift > 0) {
            const nb = g.nbr[c * 4 + ((st.age * 7) | 0) % 4];
            depositSolid(s, nb, lift);
            st.sedimentMoved += lift;
            s.version++;
          }
          // disturb shallow water (spray to neighbours)
          if (s.w[c] > 0) {
            const mv = Math.min(s.w[c] * 0.2, area * 0.01 * I * dt);
            s.w[c] -= mv;
            for (let k = 0; k < 4; k++) s.w[g.nbr[c * 4 + k]] += mv / 4;
          }
        }
        break;
      }
      case 'gust': case 'wind':
        break;
    }
  }
  st.rainTotal += moistureUsed;
  if (natural && ['rain', 'heavyrain', 'thunder', 'snow', 'blizzard', 'cloud'].includes(st.type)) {
    // natural storms fade when local moisture is exhausted
    let moist = 0;
    for (const c of cells) moist += s.vap[c] + s.cloud[c];
    if (moist < 1e-4 * cells.length) st.intensity -= dt * 0.1;
  }
  if (st.type === 'gust' || st.type === 'wind') {
    const dirV = st.vel[0] || st.vel[1] || st.vel[2] ? norm3(st.vel.slice()) : headingVel(st.pos, 0, 1);
    body.windZones.push({ pos: st.pos, radius: st.radius, dir: dirV, speed: (st.type === 'gust' ? 12 : 7) * I, gust: st.type === 'gust', age: st.age });
    for (const c of cells) windDamage(body, c, (st.type === 'gust' ? 12 : 7) * I, dt * 0.5, st);
    if (st.type === 'wind') for (const c of cells) windErodeCell(body, c, dt * I * 0.5, st);
  }
  // lightning
  if (st.type === 'thunder' && env.rng && env.rng.next() < dt * 0.8 * I) {
    const c = cells[env.rng.int(cells.length)];
    events.push({ type: 'lightning', cell: c, bodyId: body.id });
    const dry = s.sw[c] < s.soilCapacity(c) * 0.5;
    if (vegTotal(s, c) > 0.25 && (dry || env.rng.next() < 0.25)) {
      s.fire[c] = Math.max(s.fire[c], 0.6);
      body.logEvent(env.time, 'Lightning ignited a fire.');
    } else {
      for (let p = 0; p < PLANTS - 1; p++) s.veg[c * PLANTS + p] *= 0.8;
    }
  }
}

function windDamage(body, c, speed, dt, st) {
  if (speed < 6) return;
  const s = body.surface;
  const k = Math.min(0.9, (speed - 6) * 0.06 * dt);
  const area = s.grid.omega[c] * s.ground[c] ** 2;
  let lost = 0;
  // trees and shrubs uproot more than grass
  const res = [0.4, 0.7, 0.8, 1.2, 1.2, 0.2];
  for (let p = 0; p < PLANTS; p++) {
    const i = c * PLANTS + p;
    const d = s.veg[i] * k * res[p];
    s.veg[i] -= d;
    lost += d;
  }
  if (lost > 0) {
    s.org[c] += lost * area * 0.002;
    s.damage[c] = Math.min(1, s.damage[c] + lost * 0.5);
    if (st) st.damageTotal += lost;
  }
}

export function windErodeCell(body, c, rate, st) {
  const s = body.surface;
  const g = s.grid;
  const depth = s.head[c] - s.ground[c];
  if (depth > 0.002) return;
  const cap = s.soilCapacity(c);
  if (cap > 0 && s.sw[c] > cap * 0.4) return;
  const loose = s.sed[c] > 0.0005 || s.mat[c] === 2;
  if (!loose) return;
  const area = g.omega[c] * s.ground[c] ** 2;
  const veg = vegTotal(s, c);
  const amount = area * 0.0012 * rate * Math.max(0, 1 - veg);
  const lift = removeSolid(s, c, amount, s.mat[c] === 2, -0.05, 1);
  if (lift <= 0) return;
  let best = g.nbr[c * 4], bd = -Infinity;
  for (let k = 0; k < 4; k++) {
    const d = s.windE[c] * g.nbrE[c * 4 + k] + s.windN[c] * g.nbrN[c * 4 + k];
    if (d > bd) { bd = d; best = g.nbr[c * 4 + k]; }
  }
  depositSolid(s, best, lift);
  s.version++;
  if (st) st.sedimentMoved += lift;
}

// Bounded wildfire: spreads through dry vegetation, extinguished by rain/water.
export function fireStep(body, dt, env) {
  const s = body.surface;
  const g = s.grid;
  let burning = 0;
  const ignite = s._ign || (s._ign = []);
  ignite.length = 0;
  for (let c = 0; c < s.count; c++) {
    const f = s.fire[c];
    if (f <= 0) continue;
    burning++;
    const area = g.omega[c] * s.ground[c] ** 2;
    const veg = vegTotal(s, c) + s.veg[c * PLANTS + 5];
    const wetness = s.head[c] - s.ground[c] > 0.002 ? 1 : s.sw[c] / (s.soilCapacity(c) + 1e-9);
    let burned = 0;
    for (let p = 0; p < PLANTS; p++) {
      const i = c * PLANTS + p;
      const d = Math.min(s.veg[i], s.veg[i] * f * 0.6 * dt + 0.02 * f * dt);
      s.veg[i] -= d;
      burned += d;
    }
    s.org[c] += burned * area * 0.001;
    s.burnt[c] = Math.min(1, s.burnt[c] + burned * 0.8);
    // fuel and water control intensity
    s.fire[c] = Math.max(0, f + dt * (veg > 0.1 ? 0.2 : -0.5) - dt * wetness * 0.9 - (s.precip[c] > 0.0005 ? dt * 1.5 : 0));
    if (s.fire[c] > 1) s.fire[c] = 1;
    if (s.fire[c] > 0.3 && env.rng) {
      for (let k = 0; k < 4; k++) {
        const nb = g.nbr[c * 4 + k];
        if (s.fire[nb] > 0 || vegTotal(s, nb) < 0.2) continue;
        const align = 1 + Math.max(0, s.windE[c] * g.nbrE[c * 4 + k] + s.windN[c] * g.nbrN[c * 4 + k]) * 0.3;
        const dryN = 1 - Math.min(1, s.sw[nb] / (s.soilCapacity(nb) + 1e-9));
        if (env.rng.next() < f * 0.35 * align * dryN * dt) ignite.push(nb);
      }
    }
  }
  const maxBurning = 400;
  for (const c of ignite) {
    if (burning >= maxBurning) break;
    if (s.head[c] - s.ground[c] > 0.002) continue;
    s.fire[c] = 0.4;
    burning++;
  }
  body.burning = burning;
}

export function gasSpotsStep(body, dt) {
  const spots = body.gas.spots;
  for (const sp of spots) {
    sp.lon += dt * 0.02 * (sp.lat > 0 ? 1 : -1) * (Math.cos(sp.lat * 6) * 0.5 + 0.5);
    if (!sp.persistent) {
      sp.life -= dt;
      sp.intensity = Math.max(0, Math.min(sp.intensity, sp.life / 20));
    }
  }
  body.gas.spots = spots.filter((sp) => sp.persistent || sp.life > 0);
}

export { RNG };
