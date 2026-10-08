// Surface state of a terrestrial body on a cube-sphere grid.
// All volumes are in game units^3; heights/radii are in game units.
// Terrain integral invariant: sum_i omega_i/3 * (Rs + bed_i + sed_i)^3 == solid inventory volume.
import { getGrid } from './grid.js';
import { MATERIALS, SOIL_DEPTH } from './materials.js';

export const PLANTS = 6; // vegetation channels per cell

// Field names saved/serialised as Float32 arrays (per cell).
export const FLOAT_FIELDS = [
  'bed', 'sed', 'w', 'sw', 'ice', 'lava', 'lavaT', 'susp', 'temp', 'vap', 'cloud',
  'windE', 'windN', 'precip', 'org', 'nut', 'fire', 'damage', 'wet', 'flow', 'baseE', 'heat', 'burnt',
];

// Conserved reservoirs use Float64 so millions of tiny transfers do not drift.
export const DOUBLE_FIELDS = ['bed', 'sed', 'w', 'sw', 'ice', 'lava', 'susp', 'vap', 'cloud', 'org'];

export class Surface {
  constructor(N) {
    this.grid = getGrid(N);
    this.N = N;
    const n = (this.count = this.grid.count);
    for (const f of FLOAT_FIELDS) this[f] = DOUBLE_FIELDS.includes(f) ? new Float64Array(n) : new Float32Array(n);
    this.mat = new Uint8Array(n);
    this.veg = new Float32Array(n * PLANTS);
    this.Rs = 1;
    // scratch
    this.ground = new Float32Array(n); // radius of top of solid+ice+lava
    this.head = new Float32Array(n); // radius of water surface
    this._dw = new Float64Array(n);
    this._ds = new Float64Array(n);
    this.version = 0; // bump when visible terrain changes
    this.waterVersion = 0;
  }

  solidRadius(i) {
    return this.Rs + this.bed[i] + this.sed[i];
  }

  // Volume of a spherical shell segment over a cell from r0 to r1.
  shellVol(i, r0, r1) {
    return (this.grid.omega[i] / 3) * (r1 * r1 * r1 - r0 * r0 * r0);
  }
  // Radius reached by adding volume v on top of radius r0 in cell i.
  radiusAfter(i, r0, v) {
    const r3 = r0 * r0 * r0 + (3 * v) / this.grid.omega[i];
    return r3 > 0 ? Math.cbrt(r3) : 0;
  }

  computeHeads() {
    const n = this.count, om = this.grid.omega;
    const { ground, head, bed, sed, ice, lava, w } = this;
    const Rs = this.Rs;
    for (let i = 0; i < n; i++) {
      const rs = Rs + bed[i] + sed[i];
      let r3 = rs * rs * rs;
      const extra = ice[i] + lava[i];
      if (extra > 0) r3 += (3 * extra) / om[i];
      const g = Math.cbrt(r3);
      ground[i] = g;
      head[i] = w[i] > 0 ? Math.cbrt(r3 + (3 * w[i]) / om[i]) : g;
    }
  }

  depth(i) {
    return this.head[i] - this.ground[i];
  }

  // Total solid terrain volume implied by geometry.
  terrainVolume() {
    let v = 0;
    const om = this.grid.omega;
    for (let i = 0; i < this.count; i++) {
      const r = this.Rs + this.bed[i] + this.sed[i];
      v += (om[i] / 3) * r * r * r;
    }
    return v;
  }

  // Solve Rs so that terrain integral equals targetVolume, keeping relief e_i.
  solveRs(targetVolume, minRadius = 0.2) {
    const om = this.grid.omega;
    let Rs = Math.cbrt((3 * Math.max(targetVolume, 1e-6)) / (4 * Math.PI));
    let minE = Infinity;
    for (let i = 0; i < this.count; i++) minE = Math.min(minE, this.bed[i] + this.sed[i]);
    for (let it = 0; it < 30; it++) {
      let f = -targetVolume, df = 0;
      for (let i = 0; i < this.count; i++) {
        const r = Rs + this.bed[i] + this.sed[i];
        f += (om[i] / 3) * r * r * r;
        df += om[i] * r * r;
      }
      const d = f / df;
      Rs -= d;
      if (Math.abs(d) < 1e-9 * Math.max(1, Rs)) break;
    }
    if (Rs + minE < minRadius) Rs = minRadius - minE;
    this.Rs = Rs;
    return Rs;
  }

  sum(field) {
    let s = 0;
    const a = this[field];
    for (let i = 0; i < a.length; i++) s += a[i];
    return s;
  }

  waterReservoirs() {
    return {
      liquid: this.sum('w'),
      soil: this.sum('sw'),
      ice: this.sum('ice'),
      vapor: this.sum('vap'),
      cloud: this.sum('cloud'),
    };
  }

  soilCapacity(i) {
    const m = MATERIALS[this.mat[i]];
    const area = this.grid.omega[i] * this.ground[i] * this.ground[i];
    // Sediment adds porous storage
    const sedCap = Math.min(this.sed[i], 0.1) * 0.3;
    return area * (SOIL_DEPTH * (m.porosity || 0) + sedCap);
  }

  // Global equilibrium level for a given volume over a set of cells (or all).
  levelFor(volume, cells = null) {
    const om = this.grid.omega, g = this.ground;
    const list = cells || null;
    const n = list ? list.length : this.count;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = list ? list[k] : k;
      if (g[i] < lo) lo = g[i];
      if (g[i] > hi) hi = g[i];
    }
    if (volume <= 0) return lo;
    // upper bound: all cells under level
    let hiB = hi;
    const vAt = (L) => {
      let v = 0;
      for (let k = 0; k < n; k++) {
        const i = list ? list[k] : k;
        if (L > g[i]) v += (om[i] / 3) * (L * L * L - g[i] * g[i] * g[i]);
      }
      return v;
    };
    while (vAt(hiB) < volume) hiB = hiB * 1.25 + 0.1;
    let a = lo, b = hiB;
    for (let it = 0; it < 50; it++) {
      const m = (a + b) / 2;
      if (vAt(m) < volume) a = m;
      else b = m;
    }
    return (a + b) / 2;
  }

  // Place `volume` of water into cells to a common level (initialisation / settling).
  fillToLevel(volume, cells = null) {
    this.computeHeads();
    const L = this.levelFor(volume, cells);
    const om = this.grid.omega, g = this.ground;
    const n = cells ? cells.length : this.count;
    let placed = 0;
    for (let k = 0; k < n; k++) {
      const i = cells ? cells[k] : k;
      const v = L > g[i] ? (om[i] / 3) * (L * L * L - g[i] * g[i] * g[i]) : 0;
      this.w[i] = v;
      placed += v;
    }
    // exact conservation correction
    if (placed > 0 && volume > 0) {
      const s = volume / placed;
      for (let k = 0; k < n; k++) this.w[cells ? cells[k] : k] *= s;
    }
    this.computeHeads();
    return L;
  }

  stats() {
    this.computeHeads();
    let wetArea = 0, area = 0, landArea = 0, vegArea = 0, tSum = 0, iceArea = 0;
    const om = this.grid.omega;
    for (let i = 0; i < this.count; i++) {
      const a = om[i];
      area += a;
      const d = this.head[i] - this.ground[i];
      if (d > 0.005) wetArea += a;
      else landArea += a;
      if (this.ice[i] / (om[i] * this.ground[i] ** 2) > 0.004) iceArea += a;
      let v = 0;
      for (let p = 0; p < PLANTS - 1; p++) v += this.veg[i * PLANTS + p];
      if (v > 0.15 && d <= 0.005) vegArea += a;
      tSum += this.temp[i] * a;
    }
    return {
      oceanCoverage: wetArea / area,
      landFraction: landArea / area,
      vegCoverage: vegArea / area,
      iceCoverage: iceArea / area,
      meanTemp: tSum / area,
    };
  }
}
