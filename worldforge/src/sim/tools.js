// Player edit operations on terrestrial surfaces. Every edit that adds or removes
// material updates inventories explicitly (pour = source, drain = sink).
import { MAT, SOLID_KEYS, KEY_TO_MAT, MATERIALS } from './materials.js';
import { removeSolid, depositSolid, addBedrock, bedFloorOf } from './water.js';
import { G } from './body.js';

// Brush region: cells within angular radius with smooth falloff weights.
export function brushCells(s, dir, radius) {
  const cells = s.grid.cellsWithin(dir[0], dir[1], dir[2], Math.max(radius, s.grid.cellAngle * 0.6), []);
  const wts = new Float32Array(cells.length);
  let sum = 0;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const d = s.grid.dir[c * 3] * dir[0] + s.grid.dir[c * 3 + 1] * dir[1] + s.grid.dir[c * 3 + 2] * dir[2];
    const ang = Math.acos(Math.max(-1, Math.min(1, d)));
    const x = Math.min(1, ang / Math.max(radius, 1e-4));
    wts[k] = (1 - x * x) ** 2 + 0.05;
    sum += wts[k];
  }
  return { cells, wts, sum };
}

function takeFromInventory(body, key, vol) {
  // remove vol of material `key`, falling back to other solids if it runs out
  let left = vol;
  const t = Math.min(body.inv[key], left);
  body.inv[key] -= t;
  left -= t;
  if (left > 1e-12) {
    const keys = SOLID_KEYS.filter((k) => body.inv[k] > 0).sort((a, b) => body.inv[b] - body.inv[a]);
    for (const k of keys) {
      const x = Math.min(body.inv[k], left);
      body.inv[k] -= x;
      left -= x;
      if (left <= 1e-12) break;
    }
  }
  return vol - left;
}

export function sculpt(body, mode, dir, radius, strength, dt, matKey = 'rock') {
  const s = body.surface;
  const { cells, wts } = brushCells(s, dir, radius);
  const g = s.grid;
  const R = s.Rs;
  let changed = 0;
  if (mode === 'raise' || mode === 'lower' || mode === 'remove') {
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      const area = g.omega[c] * (R + s.bed[c] + s.sed[c]) ** 2;
      const dz = 0.25 * strength * wts[k] * dt;
      const vol = area * dz;
      if (mode === 'raise') {
        const key = SOLID_KEYS.includes(matKey) ? matKey : 'rock';
        addBedrock(s, c, vol);
        body.inv[key] += vol;
        if (wts[k] > 0.5) s.mat[c] = KEY_TO_MAT[key];
        changed += vol;
      } else {
        const floor = bedFloorOf(s);
        const key = MATERIALS[s.mat[c]].key;
        const got = removeSolid(s, c, vol, true, floor, 1);
        takeFromInventory(body, key, got);
        changed += got;
      }
    }
  } else if (mode === 'smooth') {
    // conservative diffusion of solid material within the brush
    const tmp = cells.map((c) => s.Rs + s.bed[c] + s.sed[c]);
    let mean = 0, wsum = 0;
    for (let k = 0; k < cells.length; k++) { mean += tmp[k] * wts[k]; wsum += wts[k]; }
    mean /= wsum;
    const moved = [];
    let poolV = 0;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      if (tmp[k] > mean) {
        const area = g.omega[c] * tmp[k] ** 2;
        const vol = area * (tmp[k] - mean) * Math.min(1, strength * wts[k] * dt * 2);
        const got = removeSolid(s, c, vol, true, bedFloorOf(s), 1);
        poolV += got;
      } else moved.push(k);
    }
    let need = 0;
    for (const k of moved) need += (mean - tmp[k]) * g.omega[cells[k]] * tmp[k] ** 2;
    for (const k of moved) {
      const c = cells[k];
      const share = need > 0 ? ((mean - tmp[k]) * g.omega[c] * tmp[k] ** 2) / need : 1 / moved.length;
      depositSolid(s, c, poolV * share);
    }
    changed = poolV;
  } else if (mode === 'paint') {
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      if (wts[k] < 0.3) continue;
      if (matKey === 'organic') {
        const area = g.omega[c] * s.ground[c] ** 2;
        const v = area * 0.004 * strength * dt * wts[k] * 4;
        s.org[c] += v;
        s.nut[c] = Math.min(2, s.nut[c] + 0.05 * strength * dt);
        changed += v;
        continue;
      }
      const target = KEY_TO_MAT[matKey];
      if (target === undefined || target === s.mat[c] || target > 5) continue;
      const area = g.omega[c] * s.ground[c] ** 2;
      const v = area * 0.03; // skin layer volume being replaced
      const oldKey = MATERIALS[s.mat[c]].key;
      const got = takeFromInventory(body, oldKey, v);
      body.inv[matKey] += got;
      s.mat[c] = target;
      changed += got;
    }
  }
  if (changed > 0) {
    s.version++;
    body.updateCaches();
  }
  return changed;
}

// Create falling packets (water, lava, ice, organic, solids) above a target.
// Volume is counted in body.pending until it lands — never twice.
export function pour(body, matKey, dir, radius, rate, dt, time, opts = {}) {
  const s = body.surface;
  const vol = rate * dt;
  if (vol <= 0) return null;
  const { cells, wts, sum } = brushCells(s, dir, radius);
  const nw = new Float32Array(wts.length);
  for (let k = 0; k < wts.length; k++) nw[k] = wts[k] / sum;
  const c0 = s.grid.cellOf(dir[0], dir[1], dir[2]);
  s.computeHeads();
  const surfR = s.head[c0];
  const h0 = opts.height ?? Math.max(0.8, surfR * 0.18);
  const gLocal = (G * body.massCache) / (surfR * surfR);
  const tFall = Math.sqrt((2 * h0) / Math.max(gLocal, 1e-3));
  const packet = {
    mat: matKey,
    vol,
    cells: Int32Array.from(cells),
    wts: nw,
    t0: time,
    tLand: time + tFall,
    dir: dir.slice(),
    r0: surfR + h0,
    rLand: surfR,
    radius,
    src: opts.src || 'pour',
  };
  body.pending.push(packet);
  if (matKey === 'water') body.ledger.source += vol;
  if (matKey === 'lava') body.lavaLedger.source += vol;
  if (matKey === 'ice') body.ledger.source += vol;
  return packet;
}

// Land packets whose fall time elapsed.
export function landPackets(body, time, onSolidTransition) {
  const s = body.surface;
  if (!body.pending.length) return 0;
  let landed = 0;
  const keep = [];
  for (const p of body.pending) {
    if (p.tLand > time) { keep.push(p); continue; }
    landed += p.vol;
    for (let k = 0; k < p.cells.length; k++) {
      const c = p.cells[k];
      const v = p.vol * p.wts[k];
      switch (p.mat) {
        case 'water': s.w[c] += v; break;
        case 'lava': {
          const heat = s.lava[c] * s.lavaT[c] + v * 1.0;
          s.lava[c] += v;
          s.lavaT[c] = heat / s.lava[c];
          break;
        }
        case 'ice': s.ice[c] += v; break;
        case 'organic': s.org[c] += v; break;
        default:
          if (SOLID_KEYS.includes(p.mat)) {
            body.inv[p.mat] += v;
            if (p.src === 'transition') {
              if (p.wts[k] > 0.5 / p.cells.length) s.mat[c] = KEY_TO_MAT[p.mat];
            } else {
              depositSolid(s, c, v);
              s.mat[c] = KEY_TO_MAT[p.mat];
            }
          }
      }
    }
    if (p.src === 'transition' && SOLID_KEYS.includes(p.mat) && onSolidTransition) onSolidTransition();
    s.version++;
  }
  body.pending = keep;
  return landed;
}

// Remove water from a brush region (explicit sink).
export function drain(body, dir, radius, rate, dt) {
  const s = body.surface;
  const { cells, wts, sum } = brushCells(s, dir, radius);
  let want = rate * dt;
  let removed = 0;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const t = Math.min(s.w[c], (want * wts[k]) / sum * 1.5);
    s.w[c] -= t;
    removed += t;
  }
  // also take a little from ice
  body.ledger.sink += removed;
  s.waterVersion++;
  return removed;
}

// Global water add/remove as a recipe-free sandbox action (explicit source/sink).
export function drainGlobal(body, vol) {
  const s = body.surface;
  let total = s.sum('w');
  if (total <= 0) return 0;
  const f = Math.min(1, vol / total);
  for (let i = 0; i < s.count; i++) {
    s.w[i] *= 1 - f;
    if (s.w[i] <= 1e-9 && s.susp[i] > 0) { depositSolid(s, i, s.susp[i]); s.susp[i] = 0; }
  }
  body.ledger.sink += total * f;
  return total * f;
}

// Rescale relief proportionally when the solid radius changes a lot, then solve Rs.
export function resolveSolid(body) {
  const s = body.surface;
  const V = body.solidVolume();
  const est = Math.cbrt((3 * Math.max(V, 1e-6)) / (4 * Math.PI));
  // relief scales with the solid radius (k = 1 when the volume is unchanged)
  let susp = 0;
  for (let i = 0; i < s.count; i++) susp += s.susp[i];
  const Vold = s.terrainVolume() + susp;
  const k = Math.max(0.02, Math.min(50, Math.cbrt(Math.max(V, 1e-6) / Math.max(Vold, 1e-6))));
  if (Math.abs(k - 1) > 1e-4) {
    for (let i = 0; i < s.count; i++) {
      s.bed[i] *= k;
      s.sed[i] *= k;
      s.baseE[i] *= k;
    }
  }
  s.solveRs(Math.max(1e-6, V - susp), Math.min(0.3, est * 0.5));
  s.computeHeads();
  s.version++;
  body.updateCaches();
}
