// Conservative finite-volume surface water flow, soil absorption, freeze/melt,
// connected-basin settling, hydraulic/thermal erosion and viscous lava flow.
import { MATERIALS, MAT } from './materials.js';
import { PLANTS } from './surface.js';

const EPS = 1e-9;

// Remove up to `vol` of solid from the top of cell i. Loose sediment goes first;
// bedrock only if allowBed, and never below bedFloor. Returns removed volume.
export function removeSolid(s, i, vol, allowBed, bedFloor, bedFactor = 1) {
  if (vol <= 0) return 0;
  const om = s.grid.omega[i];
  let removed = 0;
  // sediment
  if (s.sed[i] > 0) {
    const r0 = s.Rs + s.bed[i] + s.sed[i];
    const rMin = r0 - s.sed[i];
    const vAvail = (om / 3) * (r0 * r0 * r0 - rMin * rMin * rMin);
    const take = Math.min(vol, vAvail);
    const r1 = Math.cbrt(Math.max(0, r0 * r0 * r0 - (3 * take) / om));
    s.sed[i] = Math.max(0, s.sed[i] - (r0 - r1));
    removed += take;
    vol -= take;
  }
  if (vol > 0 && allowBed) {
    vol *= bedFactor;
    const r0 = s.Rs + s.bed[i] + s.sed[i];
    const rMin = Math.min(r0, s.Rs + bedFloor + s.sed[i]);
    const vAvail = (om / 3) * (r0 * r0 * r0 - rMin * rMin * rMin);
    const take = Math.min(vol, Math.max(0, vAvail));
    if (take > 0) {
      const r1 = Math.cbrt(Math.max(0, r0 * r0 * r0 - (3 * take) / om));
      s.bed[i] -= r0 - r1;
      removed += take;
    }
  }
  return removed;
}

// Deposit `vol` of loose solid on top of cell i (raises sediment layer exactly by volume).
export function depositSolid(s, i, vol) {
  if (vol <= 0) return;
  const om = s.grid.omega[i];
  const r0 = s.Rs + s.bed[i] + s.sed[i];
  const r1 = Math.cbrt(r0 * r0 * r0 + (3 * vol) / om);
  s.sed[i] += r1 - r0;
}

// Raise bedrock by volume (e.g. cooled lava, sculpt raise).
export function addBedrock(s, i, vol) {
  if (vol <= 0) return;
  const om = s.grid.omega[i];
  const r0 = s.Rs + s.bed[i] + s.sed[i];
  const r1 = Math.cbrt(r0 * r0 * r0 + (3 * vol) / om);
  s.bed[i] += r1 - r0;
}

export function rootStability(s, i) {
  const v = s.veg;
  const b = i * PLANTS;
  // grass, flowers, shrubs, conifer, broadleaf hold soil; fungi do not
  return Math.min(0.85, v[b] * 0.35 + v[b + 1] * 0.2 + v[b + 2] * 0.45 + v[b + 3] * 0.6 + v[b + 4] * 0.6);
}

export function bedFloorOf(s) {
  return -Math.max(0.15, s.Rs * 0.06);
}

/**
 * One water step. dt in surface-seconds.
 * opts: { erosion (multiplier), cold (bool) }
 */
export function waterStep(body, dt, opts = {}) {
  const s = body.surface;
  const g = s.grid;
  const n = s.count;
  s.computeHeads();
  const { w, head, ground, susp, sw, ice, temp, mat } = s;
  const dw = s._dw, ds = s._ds;
  dw.fill(0);
  ds.fill(0);
  const nbr = g.nbr, om = g.omega, nd = g.nbrDist;
  const K = 2.4;
  const erosion = opts.erosion ?? 1;
  const cellW = g.cellAngle;
  const outQ = s._outQ || (s._outQ = new Float32Array(n));
  const slopeA = s._slope || (s._slope = new Float32Array(n));
  const q = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    outQ[i] = 0;
    const wi = w[i];
    const hi = head[i];
    // slope for erosion (solid-ish surface)
    let maxDrop = 0;
    for (let k = 0; k < 4; k++) {
      const nb = nbr[i * 4 + k];
      const d = (hi - head[nb]) / (nd[i * 4 + k] * hi);
      if (d > maxDrop) maxDrop = d;
    }
    slopeA[i] = maxDrop;
    if (wi <= EPS) continue;
    const depth = hi - ground[i];
    const fric = Math.min(1, Math.max(0.04, depth / 0.04));
    const rate = Math.min(0.24, K * dt * fric);
    const ai = om[i] * hi * hi;
    let tot = 0;
    for (let k = 0; k < 4; k++) {
      const nb = nbr[i * 4 + k];
      const dh = hi - head[nb];
      if (dh <= 0) { q[k] = 0; continue; }
      const an = om[nb] * head[nb] * head[nb];
      const eq = (dh * ai * an) / (ai + an);
      const qk = eq * rate * (cellW / nd[i * 4 + k]);
      q[k] = qk;
      tot += qk;
    }
    if (tot <= 0) continue;
    const scale = tot > wi ? wi / tot : 1;
    const sFrac = susp[i] > 0 ? susp[i] / wi : 0;
    for (let k = 0; k < 4; k++) {
      if (q[k] <= 0) continue;
      const nb = nbr[i * 4 + k];
      const qq = q[k] * scale;
      dw[i] -= qq;
      dw[nb] += qq;
      const sq = qq * sFrac;
      ds[i] -= sq;
      ds[nb] += sq;
    }
    outQ[i] = tot * scale;
  }
  for (let i = 0; i < n; i++) {
    w[i] += dw[i];
    if (w[i] < 0) w[i] = 0; // guards float noise only (limiter ensures non-negative)
    susp[i] += ds[i];
    if (susp[i] < 0) susp[i] = 0;
  }

  // flow intensity for overlays and erosion
  const fl = s.flow;
  for (let i = 0; i < n; i++) {
    const area = om[i] * ground[i] * ground[i];
    const rateDepth = outQ[i] / (area * dt); // depth per second leaving
    fl[i] += (rateDepth - fl[i]) * Math.min(1, dt * 0.8);
  }

  // hydraulic erosion / deposition (sediment capacity = concentration x water volume,
  // concentration ~ slope x flow velocity; bedrock erodibility scales with hardness)
  if (erosion > 0) {
    const floor = bedFloorOf(s);
    const Kc = 0.025, Ks = 0.17, Kd = 0.35;
    const width = cellW * s.Rs;
    let changed = false;
    for (let i = 0; i < n; i++) {
      const wi = w[i];
      if (wi <= EPS && susp[i] <= EPS) continue;
      const depth = Math.max(head[i] - ground[i], 1e-4);
      const Q = outQ[i] / dt; // volume per second leaving
      const vel = Math.min(6, Q / Math.max(depth * width, 1e-5));
      const slope = Math.min(1, slopeA[i]);
      const capV = Kc * slope * vel * wi;
      if (susp[i] < capV && wi > EPS) {
        const m = MATERIALS[mat[i]];
        const root = rootStability(s, i);
        const want = Ks * (capV - susp[i]) * dt * erosion * (1 - root * 0.85);
        const hard = m.hardness ?? 0.5;
        const bedFactor = Math.pow(1 - hard, 2.2) * 0.6;
        const got = removeSolid(s, i, want, true, floor, bedFactor);
        if (got > 0) { susp[i] += got; changed = true; }
      } else if (susp[i] > capV) {
        const dep = Math.min(susp[i], Kd * (susp[i] - capV) * dt + (wi <= EPS ? susp[i] : 0));
        depositSolid(s, i, dep);
        susp[i] -= dep;
        changed = true;
      }
    }
    if (changed) s.version++;
  }

  // infiltration / seepage, freeze / melt
  for (let i = 0; i < n; i++) {
    const area = om[i] * ground[i] * ground[i];
    const cap = s.soilCapacity(i);
    const m = MATERIALS[mat[i]];
    const t = temp[i];
    if (w[i] > EPS && t > -1 && sw[i] < cap) {
      const a = Math.min(w[i], cap - sw[i], (m.perm + Math.min(s.sed[i], 0.05) * 4) * cap * dt * 0.5);
      if (a > 0) { w[i] -= a; sw[i] += a; }
    }
    if (sw[i] > cap * 0.85 && cap >= 0) {
      const e = Math.min(sw[i], (sw[i] - cap * 0.85) * 0.08 * dt + Math.max(0, sw[i] - cap));
      sw[i] -= e;
      w[i] += e;
    }
    if (t < 0 && w[i] > EPS && (ice[i] / area < 0.012 || head[i] - ground[i] < 0.01)) {
      // sea ice insulates the water below once it is ~0.012 thick
      const f = Math.min(w[i], area * 0.00025 * -t * dt);
      w[i] -= f;
      ice[i] += f;
    } else if (t > 0 && ice[i] > EPS) {
      const m2 = Math.min(ice[i], area * 0.0022 * t * dt + (s.lava[i] > 0 ? ice[i] * 0.2 * dt : 0));
      ice[i] -= m2;
      w[i] += m2;
    }
    // dropped sediment when a cell dries
    if (w[i] <= EPS && susp[i] > 0) {
      depositSolid(s, i, susp[i]);
      susp[i] = 0;
    }
    // wetness for visuals
    const depth = head[i] - ground[i];
    const target = Math.min(1, depth > 0.002 ? 1 : (cap > 0 ? sw[i] / cap : 0) * 0.8);
    s.wet[i] += (target - s.wet[i]) * Math.min(1, dt * (target > s.wet[i] ? 2 : 0.05));
  }
  s.waterVersion++;
}

// Connected-basin settling: wet components relax toward their own equilibrium
// level (disconnected basins keep their own water). Conservative per component.
export function settleBasins(body, alpha = 0.35, minDepth = 0.02, minCells = 10) {
  const s = body.surface;
  const g = s.grid;
  s.computeHeads();
  const n = s.count;
  const comp = s._comp || (s._comp = new Int32Array(n));
  comp.fill(-1);
  const stack = [];
  const cells = [];
  let id = 0;
  let largest = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0 || s.head[i] - s.ground[i] < minDepth) continue;
    cells.length = 0;
    stack.length = 0;
    stack.push(i);
    comp[i] = id;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      for (let k = 0; k < 4; k++) {
        const nb = g.nbr[c * 4 + k];
        if (comp[nb] < 0 && s.head[nb] - s.ground[nb] >= minDepth) {
          comp[nb] = id;
          stack.push(nb);
        }
      }
    }
    id++;
    if (cells.length > largest) largest = cells.length;
    if (cells.length < minCells) continue;
    let W = 0, S = 0;
    for (const c of cells) { W += s.w[c]; S += s.susp[c]; }
    const L = s.levelFor(W, cells);
    let placed = 0;
    const eqs = new Float64Array(cells.length);
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      const gg = s.ground[c];
      eqs[k] = L > gg ? (g.omega[c] / 3) * (L * L * L - gg * gg * gg) : 0;
      placed += eqs[k];
    }
    const corr = placed > 0 ? W / placed : 0;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      const target = eqs[k] * corr;
      s.w[c] = s.w[c] + (target - s.w[c]) * alpha;
    }
    // suspended sediment is redistributed with the water (conservative)
    if (S > 0 && W > EPS) for (const c of cells) s.susp[c] = (S * s.w[c]) / W;
  }
  return { components: id, largest };
}

// Thermal erosion: collapse slopes steeper than the material talus angle.
export function thermalStep(body, dt, mult = 1) {
  const s = body.surface;
  const g = s.grid;
  const n = s.count;
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const ri = s.Rs + s.bed[i] + s.sed[i];
    const m = MATERIALS[s.mat[i]];
    const loose = s.sed[i] > 0.0005;
    const talus = loose ? 0.75 : m.talus;
    const looseBed = s.mat[i] === MAT.SAND || s.mat[i] === MAT.SOIL;
    if (!loose && !looseBed) continue;
    let best = -1, bestS = 0;
    for (let k = 0; k < 4; k++) {
      const nb = g.nbr[i * 4 + k];
      const rn = s.Rs + s.bed[nb] + s.sed[nb];
      const sl = (ri - rn) / (g.nbrDist[i * 4 + k] * ri);
      if (sl > bestS) { bestS = sl; best = nb; }
    }
    if (best < 0 || bestS <= talus) continue;
    const root = rootStability(s, i);
    const om = g.omega[i];
    const dz = (bestS - talus) * g.nbrDist[i * 4] * ri * 0.25;
    const vol = Math.min(om * ri * ri * dz, om * ri * ri * 0.02) * Math.min(1, dt * 2 * mult) * (1 - root);
    const got = removeSolid(s, i, vol, looseBed, bedFloorOf(s), 1);
    if (got > 0) {
      depositSolid(s, best, got);
      moved += got;
    }
  }
  if (moved > 0) s.version++;
  return moved;
}

// Viscous lava flow, cooling into basalt, heating, boiling water and burning life.
export function lavaStep(body, dt) {
  const s = body.surface;
  const g = s.grid;
  const n = s.count;
  let any = false;
  for (let i = 0; i < n; i++) if (s.lava[i] > 0) { any = true; break; }
  if (!any) {
    for (let i = 0; i < n; i++) s.heat[i] *= Math.max(0, 1 - dt * 0.05);
    return;
  }
  s.computeHeads();
  const dl = s._dw;
  dl.fill(0);
  const dT = s._ds;
  dT.fill(0);
  for (let i = 0; i < n; i++) {
    const L = s.lava[i];
    if (L <= EPS) continue;
    const hi = s.ground[i];
    const ai = g.omega[i] * hi * hi;
    const thick = L / ai;
    const visc = Math.max(0.02, s.lavaT[i]);
    let tot = 0;
    const q = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const nb = g.nbr[i * 4 + k];
      const dh = hi - s.ground[nb];
      const yieldH = 0.004; // Bingham-like yield
      if (dh <= yieldH) continue;
      const an = g.omega[nb] * s.ground[nb] ** 2;
      const eq = ((dh - yieldH) * ai * an) / (ai + an);
      q[k] = eq * Math.min(0.2, 0.9 * dt * visc * Math.min(1, thick / 0.02));
      tot += q[k];
    }
    if (tot <= 0) continue;
    const sc = tot > L ? L / tot : 1;
    for (let k = 0; k < 4; k++) {
      if (q[k] <= 0) continue;
      const nb = g.nbr[i * 4 + k];
      const qq = q[k] * sc;
      dl[i] -= qq;
      dl[nb] += qq;
      // carry heat (mixing)
      dT[nb] += qq * s.lavaT[i];
      dT[i] -= qq * s.lavaT[i];
    }
  }
  let cooled = 0;
  for (let i = 0; i < n; i++) {
    const before = s.lava[i];
    const heatBefore = before * s.lavaT[i];
    s.lava[i] = Math.max(0, before + dl[i]);
    s.lavaT[i] = s.lava[i] > EPS ? Math.min(1.2, Math.max(0, (heatBefore + dT[i]) / s.lava[i])) : 0;
    if (s.lava[i] <= EPS) { s.lava[i] = 0; continue; }
    const area = g.omega[i] * s.ground[i] ** 2;
    // cooling: faster when thin or under water
    const thick = s.lava[i] / area;
    const wet = s.w[i] > EPS ? 1 : 0;
    s.lavaT[i] -= dt * (0.012 + 0.0015 / Math.max(0.003, thick) * 0.01 + wet * 0.08);
    // boil water into the atmosphere (vapour reservoir)
    if (wet && s.lavaT[i] > 0.2) {
      const e = Math.min(s.w[i], area * 0.05 * s.lavaT[i] * dt);
      s.w[i] -= e;
      s.vap[i] += e;
    }
    // melt ice
    if (s.ice[i] > 0) {
      const m = Math.min(s.ice[i], area * 0.05 * dt);
      s.ice[i] -= m;
      s.w[i] += m;
    }
    // destroy vegetation and start fires around
    for (let p = 0; p < PLANTS; p++) {
      const v = s.veg[i * PLANTS + p];
      if (v > 0) {
        s.org[i] += v * 0.0005 * area;
        s.veg[i * PLANTS + p] = 0;
      }
    }
    s.heat[i] = Math.max(s.heat[i], s.lavaT[i]);
    if (s.lavaT[i] > 0.4) {
      for (let k = 0; k < 4; k++) {
        const nb = g.nbr[i * 4 + k];
        if (s.fire[nb] < 0.3 && vegTotal(s, nb) > 0.2) s.fire[nb] = 0.5;
      }
    }
    // solidify
    if (s.lavaT[i] <= 0.12) {
      const v = s.lava[i];
      s.lava[i] = 0;
      s.lavaT[i] = 0;
      addBedrock(s, i, v);
      s.mat[i] = MAT.ROCK;
      body.inv.rock += v;
      body.lavaLedger.cooled += v;
      cooled += v;
    }
  }
  for (let i = 0; i < n; i++) if (s.lava[i] <= 0) s.heat[i] *= Math.max(0, 1 - dt * 0.05);
  s.version++;
  return cooled;
}

export function vegTotal(s, i) {
  let v = 0;
  for (let p = 0; p < PLANTS - 1; p++) v += s.veg[i * PLANTS + p];
  return v;
}

// Glacier flow and calving: ice creeps downhill and calves/melts into adjacent
// open water, giving polar ice an equilibrium instead of unbounded growth.
export function iceStep(body, dt) {
  const s = body.surface;
  const g = s.grid;
  const n = s.count;
  s.computeHeads();
  const d = s._dw;
  d.fill(0);
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const I = s.ice[i];
    if (I <= EPS) continue;
    const area = g.omega[i] * s.ground[i] ** 2;
    const thick = I / area;
    if (thick > 0.01) {
      for (let k = 0; k < 4; k++) {
        const nb = g.nbr[i * 4 + k];
        const dh = s.ground[i] - s.ground[nb];
        if (dh <= 0) continue;
        const q = Math.min(I * 0.05, area * dh * 0.02 * dt * Math.min(1, thick / 0.05));
        d[i] -= q;
        d[nb] += q;
        moved += q;
      }
    }
    // calving into open water (own cell or a coastal neighbour) and margin ablation
    const depth = s.head[i] - s.ground[i];
    let coast = depth > 0.02;
    if (!coast) for (let k = 0; k < 4; k++) { const nb = g.nbr[i * 4 + k]; if (s.head[nb] - s.ground[nb] > 0.02) { coast = true; break; } }
    let c = 0;
    if (coast) c += I * 0.015 * dt;
    if (s.temp[i] > -8) c += area * 0.0004 * (s.temp[i] + 8) * dt;
    c = Math.min(I + d[i], c);
    if (c > 0) {
      d[i] -= c;
      s.w[i] += c;
    }
  }
  for (let i = 0; i < n; i++) {
    s.ice[i] += d[i];
    if (s.ice[i] < 0) { s.w[i] = Math.max(0, s.w[i] + s.ice[i]); s.ice[i] = 0; }
  }
  if (moved > 0) s.version++;
}
