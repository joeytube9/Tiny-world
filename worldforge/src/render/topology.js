// Render topology for a cube-sphere grid at S render subdivisions per cell.
// Vertex values are bilinear interpolations of "corner" values, where each
// corner is the mean of the (3 or 4) cells touching it, so seams match exactly.
import { faceToDir, dirToFace } from '../sim/grid.js';

const cache = new Map();

export function getTopology(grid, S) {
  const key = grid.N + ':' + S;
  if (!cache.has(key)) cache.set(key, new Topology(grid, S));
  return cache.get(key);
}

export class Topology {
  constructor(grid, S) {
    this.grid = grid;
    const N = (this.N = grid.N);
    this.S = S;
    const C = N + 1;
    this.cornerCount = 6 * C * C;
    this.cornerCells = new Int32Array(this.cornerCount * 4).fill(-1);
    this.cornerN = new Uint8Array(this.cornerCount);
    const step = 2 / N;
    const d = step * 0.25;
    const tmp = [0, 0, 0];
    for (let f = 0; f < 6; f++) {
      for (let cj = 0; cj <= N; cj++) {
        for (let ci = 0; ci <= N; ci++) {
          const k = f * C * C + cj * C + ci;
          const a = -1 + ci * step, b = -1 + cj * step;
          let n = 0;
          for (const [da, db] of [[-d, -d], [d, -d], [-d, d], [d, d]]) {
            faceToDir(f, a + da, b + db, tmp);
            const c = grid.cellOf(tmp[0], tmp[1], tmp[2]);
            let dup = false;
            for (let q = 0; q < n; q++) if (this.cornerCells[k * 4 + q] === c) dup = true;
            if (!dup) this.cornerCells[k * 4 + n++] = c;
          }
          this.cornerN[k] = n;
        }
      }
    }
    // face vertex grids
    const M = N * S;
    const V = (M + 1) * (M + 1);
    this.M = M;
    this.vertsPerFace = V;
    this.faces = [];
    for (let f = 0; f < 6; f++) {
      const dir = new Float32Array(V * 3);
      const ci4 = new Int32Array(V * 4);
      const w4 = new Float32Array(V * 4);
      const cell = new Int32Array(V);
      for (let vj = 0; vj <= M; vj++) {
        for (let vi = 0; vi <= M; vi++) {
          const v = vj * (M + 1) + vi;
          faceToDir(f, -1 + (2 * vi) / M, -1 + (2 * vj) / M, tmp);
          dir[v * 3] = tmp[0]; dir[v * 3 + 1] = tmp[1]; dir[v * 3 + 2] = tmp[2];
          const i = Math.min(Math.floor(vi / S), N - 1), j = Math.min(Math.floor(vj / S), N - 1);
          const fa = vi / S - i, fb = vj / S - j;
          ci4[v * 4] = f * C * C + j * C + i;
          ci4[v * 4 + 1] = f * C * C + j * C + i + 1;
          ci4[v * 4 + 2] = f * C * C + (j + 1) * C + i;
          ci4[v * 4 + 3] = f * C * C + (j + 1) * C + i + 1;
          w4[v * 4] = (1 - fa) * (1 - fb);
          w4[v * 4 + 1] = fa * (1 - fb);
          w4[v * 4 + 2] = (1 - fa) * fb;
          w4[v * 4 + 3] = fa * fb;
          cell[v] = f * N * N + j * N + i;
        }
      }
      const idx = new (V > 65535 ? Uint32Array : Uint16Array)(M * M * 6);
      let p = 0;
      for (let vj = 0; vj < M; vj++) {
        for (let vi = 0; vi < M; vi++) {
          const a = vj * (M + 1) + vi, b = a + 1, c = a + (M + 1), d2 = c + 1;
          // CCW when viewed from outside (u x v = outward normal)
          idx[p++] = a; idx[p++] = b; idx[p++] = d2;
          idx[p++] = a; idx[p++] = d2; idx[p++] = c;
        }
      }
      this.faces.push({ dir, ci4, w4, cell, index: idx });
    }
    // seam groups: coincident edge vertices across faces
    const map = new Map();
    for (let f = 0; f < 6; f++) {
      const dir = this.faces[f].dir;
      for (let vj = 0; vj <= M; vj++) {
        for (let vi = 0; vi <= M; vi++) {
          if (vi !== 0 && vi !== M && vj !== 0 && vj !== M) continue;
          const v = vj * (M + 1) + vi;
          const key = Math.round(dir[v * 3] * 1e5) + ',' + Math.round(dir[v * 3 + 1] * 1e5) + ',' + Math.round(dir[v * 3 + 2] * 1e5);
          let g = map.get(key);
          if (!g) map.set(key, (g = []));
          g.push(f, v);
        }
      }
    }
    this.seams = [];
    for (const g of map.values()) if (g.length > 2) this.seams.push(Int32Array.from(g));
    // per face list of seam groups touching it
    this.faceSeams = [[], [], [], [], [], []];
    this.seams.forEach((g, gi) => {
      for (let k = 0; k < g.length; k += 2) if (!this.faceSeams[g[k]].includes(gi)) this.faceSeams[g[k]].push(gi);
    });
    this.cornerVals = null;
  }

  // corner means of a per-cell field into out (Float32Array cornerCount)
  cornerMean(field, out, stride = 1, offset = 0) {
    const cc = this.cornerCells, cn = this.cornerN;
    for (let k = 0; k < this.cornerCount; k++) {
      const n = cn[k];
      let s = 0;
      for (let q = 0; q < n; q++) s += field[cc[k * 4 + q] * stride + offset];
      out[k] = s / n;
    }
    return out;
  }

  // Sample a corner field at an arbitrary unit direction (bilinear).
  sample(cornerField, x, y, z, fo = { f: 0, a: 0, b: 0 }) {
    const l = Math.hypot(x, y, z) || 1;
    dirToFace(x / l, y / l, z / l, fo);
    const N = this.N, C = N + 1;
    const u = ((fo.a + 1) / 2) * N, v = ((fo.b + 1) / 2) * N;
    const i = Math.min(Math.max(Math.floor(u), 0), N - 1), j = Math.min(Math.max(Math.floor(v), 0), N - 1);
    const fa = Math.min(1, Math.max(0, u - i)), fb = Math.min(1, Math.max(0, v - j));
    const base = fo.f * C * C;
    const c00 = cornerField[base + j * C + i], c10 = cornerField[base + j * C + i + 1];
    const c01 = cornerField[base + (j + 1) * C + i], c11 = cornerField[base + (j + 1) * C + i + 1];
    return (c00 * (1 - fa) + c10 * fa) * (1 - fb) + (c01 * (1 - fa) + c11 * fa) * fb;
  }
}
