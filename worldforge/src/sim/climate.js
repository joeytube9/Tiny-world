// Simplified energy / moisture climate on the cell graph.
// Temperatures relax toward a local radiative equilibrium driven by the star
// direction (day/night, latitude, tilt seasons), albedo, greenhouse and lapse rate.
// Water moves between liquid, soil, vapour, cloud and ice reservoirs conservatively;
// on airless bodies evaporated water escapes to space through an explicit ledger.
import { MAT } from './materials.js';
import { PLANTS } from './surface.js';
import { vegTotal } from './water.js';

const EPS = 1e-9;

export function satDepth(tC) {
  const t = Math.max(-60, Math.min(70, tC));
  return 0.0007 * Math.exp(0.062 * t);
}

export function atmFactor(A) {
  return A <= 0 ? 0 : Math.min(2.2, Math.pow(A, 0.7));
}

function cellAlbedo(s, i, body) {
  const g = s.ground[i];
  const area = s.grid.omega[i] * g * g;
  const d = s.head[i] - g;
  let a;
  if (d > 0.01) a = 0.07;
  else {
    const m = s.mat[i];
    a = m === MAT.SAND ? 0.36 : m === MAT.GRANITE ? 0.28 : m === MAT.SOIL ? 0.17 : m === MAT.CLAY ? 0.22 : 0.16;
    const v = vegTotal(s, i);
    a = a * (1 - Math.min(1, v)) + 0.14 * Math.min(1, v);
  }
  const iceT = s.ice[i] / area;
  if (iceT > 0.002) a = a + (0.7 - a) * Math.min(1, iceT / 0.02);
  const cl = Math.min(1, s.cloud[i] / (area * 0.0007 + EPS));
  a = a + (0.6 - a) * cl * 0.6;
  return a * (body.albedoScale || 1);
}

/**
 * env: { sunDir:[x,y,z] (planet-local unit), flux (relative to Earth), weather (multiplier) }
 */
export function climateStep(body, dt, env) {
  const s = body.surface;
  const g = s.grid;
  const n = s.count;
  s.computeHeads();
  const A = Math.max(0, body.atmosphere);
  const atmF = atmFactor(A);
  // atmospheric redistribution, with a floor from ground heat storage (day->night)
  const redistribute = Math.max(0.08, A / (A + 0.3));
  const gh = 33 * body.greenhouse * Math.sqrt(A);
  const flux = env.flux ?? 1;
  const [sx, sy, sz] = env.sunDir;
  const weather = env.weather ?? 1;
  const tauBase = 60 * (1 + 1.5 * Math.min(A, 3));
  const lapse = 22;
  let seaRef = s.Rs;
  // approximate sea reference: mean ground of wet cells
  {
    let ws = 0, wc = 0;
    for (let i = 0; i < n; i++) if (s.head[i] - s.ground[i] > 0.02) { ws += s.head[i]; wc++; }
    if (wc > n * 0.05) seaRef = ws / wc;
  }
  const T = s.temp;
  const forcing = s._forcing || (s._forcing = new Float32Array(n)); // storm temperature forcing (deg C)
  const precipBoost = s._pboost || (s._pboost = new Float32Array(n));
  // --- temperature ---
  for (let i = 0; i < n; i++) {
    const dx = g.dir[i * 3], dy = g.dir[i * 3 + 1], dz = g.dir[i * 3 + 2];
    const mu = Math.max(0, dx * sx + dy * sy + dz * sz);
    const alb = cellAlbedo(s, i, body);
    const X = 4 * mu * (1 - redistribute) + redistribute;
    let Tk = 278.6 * Math.pow(Math.max(0, flux * (1 - alb) * X), 0.25);
    Tk = Math.max(Tk, 45) + gh;
    let target = Tk - 273.15 + body.tempBias - Math.max(0, s.ground[i] - seaRef) * lapse;
    target += s.heat[i] * 350 + s.fire[i] * 60 + forcing[i];
    const depth = s.head[i] - s.ground[i];
    const tau = tauBase * (depth > 0.02 ? 3.5 : 1) * (s.ice[i] > 0 && target > 0 ? 1.8 : 1);
    T[i] += (target - T[i]) * Math.min(1, dt / tau);
  }
  // atmospheric heat mixing
  if (A > 0.001) {
    const kd = Math.min(0.2, 0.25 * redistribute * dt);
    const tmp = s._dw;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += T[g.nbr[i * 4 + k]] - T[i];
      tmp[i] = sum;
    }
    for (let i = 0; i < n; i++) T[i] += tmp[i] * kd * 0.25;
  }

  // --- winds ---
  const spinF = Math.max(0.15, Math.min(3, 120 / Math.max(5, Math.abs(body.spinPeriod)))) * Math.sign(body.spinPeriod || 1);
  const U0 = 1.6 * atmF * spinF * weather;
  for (let i = 0; i < n; i++) {
    const lat = g.lat[i];
    let ue = -Math.cos(3 * lat) * U0;
    let vn = -Math.sin(2 * lat) * 0.25 * Math.abs(U0) * (Math.abs(lat) < 0.55 ? 1 : -0.6);
    // thermal gradient: toward warmer air
    let gE = 0, gN = 0;
    for (let k = 0; k < 4; k++) {
      const nb = g.nbr[i * 4 + k];
      const dT = (T[nb] - T[i]) / g.nbrDist[i * 4 + k];
      gE += dT * g.nbrE[i * 4 + k];
      gN += dT * g.nbrN[i * 4 + k];
    }
    const kt = 0.0025 * atmF;
    ue += gE * kt * 0.5;
    vn += gN * kt * 0.5;
    s.windE[i] += (ue - s.windE[i]) * Math.min(1, dt * 0.5);
    s.windN[i] += (vn - s.windN[i]) * Math.min(1, dt * 0.5);
  }
  // player wind zones (gusts / sustained fields) in planet-local coordinates
  for (const z of body.windZones) applyWindZone(s, z);

  // --- moisture ---
  const vap = s.vap, cloud = s.cloud, w = s.w, sw = s.sw;
  let escaped = 0;
  for (let i = 0; i < n; i++) {
    const gr = s.ground[i];
    const area = g.omega[i] * gr * gr;
    const cap = area * satDepth(T[i]) * atmF;
    const wind = Math.hypot(s.windE[i], s.windN[i]);
    const depth = s.head[i] - gr;
    const dry = precipBoost[i] < 0 ? 1 - precipBoost[i] * 3 : 1; // drought boost
    if (atmF > 0) {
      // evaporation from free water (needs liquid, above freezing-ish)
      if (w[i] > EPS && T[i] > -5) {
        const deficit = Math.max(0, cap - vap[i]);
        const e = Math.min(w[i], deficit * 0.12 * (0.6 + wind * 0.25) * dt * dry * Math.min(1, depth / 0.002 + 0.2));
        w[i] -= e;
        vap[i] += e;
      }
      // soil drying & transpiration
      if (sw[i] > EPS && T[i] > 0) {
        const deficit = Math.max(0, cap - vap[i]);
        const v = vegTotal(s, i);
        const e = Math.min(sw[i], deficit * (0.015 + 0.03 * v) * dt * dry);
        sw[i] -= e;
        vap[i] += e;
      }
      // sublimation of ice in dry air
      if (s.ice[i] > EPS && T[i] < 0 && T[i] > -60) {
        const e = Math.min(s.ice[i], Math.max(0, cap - vap[i]) * 0.004 * dt);
        s.ice[i] -= e;
        vap[i] += e;
      }
      // condensation
      if (vap[i] > cap) {
        const c = (vap[i] - cap) * Math.min(1, 0.6 * dt);
        vap[i] -= c;
        cloud[i] += c;
      } else if (vap[i] > cap * 0.8) {
        const c = (vap[i] - cap * 0.8) * 0.05 * dt;
        vap[i] -= c;
        cloud[i] += c;
      } else if (cloud[i] > 0) {
        const c = Math.min(cloud[i], cloud[i] * 0.12 * dt);
        cloud[i] -= c;
        vap[i] += c;
      }
      // precipitation
      const thr = area * 0.00045 * atmF * (precipBoost[i] < 0 ? 4 : 1);
      let p = 0;
      if (cloud[i] > thr) p = (cloud[i] - thr) * Math.min(1, (0.25 + Math.max(0, precipBoost[i])) * dt);
      if (precipBoost[i] > 0 && cloud[i] > 0) p = Math.max(p, Math.min(cloud[i], cloud[i] * precipBoost[i] * 0.5 * dt));
      if (p > 0) {
        cloud[i] -= p;
        if (T[i] > 0.5) w[i] += p;
        else s.ice[i] += p;
        if (s.fire[i] > 0) s.fire[i] = Math.max(0, s.fire[i] - (p / area) * 600);
      }
      s.precip[i] += ((p / (area * dt + EPS)) - s.precip[i]) * Math.min(1, dt * 1.5);
    } else {
      // airless: no weather. Exposed water/ice slowly escape to space (explicit sink)
      s.precip[i] = 0;
      if (cloud[i] > 0 || vap[i] > 0) {
        escaped += cloud[i] + vap[i];
        cloud[i] = 0;
        vap[i] = 0;
      }
      if (w[i] > EPS && T[i] > 0) {
        const e = Math.min(w[i], area * 0.00005 * (T[i] / 20) * dt);
        w[i] -= e;
        escaped += e;
      }
    }
  }
  if (escaped > 0) body.ledger.escaped += escaped;

  // advection of vapour and cloud by wind (conservative upwind)
  if (atmF > 0) {
    const R = s.Rs + 0.1;
    advect(s, vap, dt, R);
    advect(s, cloud, dt, R);
  }
  for (let i = 0; i < n; i++) { forcing[i] *= 0.6; precipBoost[i] *= 0.6; }
}

function advect(s, field, dt, R) {
  const g = s.grid;
  const n = s.count;
  const d = s._ds;
  d.fill(0);
  for (let i = 0; i < n; i++) {
    const f = field[i];
    if (f <= EPS) continue;
    const we = s.windE[i], wn = s.windN[i];
    let tot = 0;
    const fr = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const c = we * g.nbrE[i * 4 + k] + wn * g.nbrN[i * 4 + k];
      if (c <= 0) continue;
      fr[k] = (c * dt) / (g.nbrDist[i * 4 + k] * R);
      tot += fr[k];
    }
    if (tot <= 0) continue;
    const sc = tot > 0.5 ? 0.5 / tot : 1;
    for (let k = 0; k < 4; k++) {
      if (fr[k] <= 0) continue;
      const m = f * fr[k] * sc;
      d[i] -= m;
      d[g.nbr[i * 4 + k]] += m;
    }
  }
  for (let i = 0; i < n; i++) {
    field[i] += d[i];
    if (field[i] < 0) field[i] = 0;
  }
}

export function applyWindZone(s, z) {
  const g = s.grid;
  const cells = g.cellsWithin(z.pos[0], z.pos[1], z.pos[2], z.radius, s._zoneCells || (s._zoneCells = []));
  for (const c of cells) {
    const dx = g.dir[c * 3], dy = g.dir[c * 3 + 1], dz = g.dir[c * 3 + 2];
    const ang = Math.acos(Math.max(-1, Math.min(1, dx * z.pos[0] + dy * z.pos[1] + dz * z.pos[2])));
    const fall = 1 - ang / z.radius;
    // direction vector (world-local tangent) projected on this cell's frame
    const ve = z.dir[0] * g.east[c * 3] + z.dir[1] * g.east[c * 3 + 1] + z.dir[2] * g.east[c * 3 + 2];
    const vn = z.dir[0] * g.north[c * 3] + z.dir[1] * g.north[c * 3 + 1] + z.dir[2] * g.north[c * 3 + 2];
    const gust = z.gust ? 0.6 + 0.4 * Math.sin(z.age * 3 + c) : 1;
    s.windE[c] += (ve * z.speed * gust - s.windE[c]) * fall * 0.8;
    s.windN[c] += (vn * z.speed * gust - s.windN[c]) * fall * 0.8;
  }
}

export function vegAt(s, i, p) {
  return s.veg[i * PLANTS + p];
}
