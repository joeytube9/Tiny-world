// Equi-angular cube-sphere cell graph. Each of 6 faces holds N x N cells.
// Neighbours across seams are found by stepping past the face edge in face
// coordinates and re-projecting the 3D direction, so every seam is connected.
// Planet-local frame: spin axis is +Y.

const FACES = [
  // normal, uAxis, vAxis (right-handed so u x v = normal)
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
export { FACES };

const Q = Math.PI / 4;

// face coords a,b in [-1,1] (equi-angular) -> unit direction
export function faceToDir(f, a, b, out = [0, 0, 0]) {
  const F = FACES[f];
  const u = Math.tan(Q * a), v = Math.tan(Q * b);
  const x = F.n[0] + u * F.u[0] + v * F.v[0];
  const y = F.n[1] + u * F.u[1] + v * F.v[1];
  const z = F.n[2] + u * F.u[2] + v * F.v[2];
  const l = Math.hypot(x, y, z);
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

// unit direction -> face and equi-angular coords
export function dirToFace(x, y, z, out = { f: 0, a: 0, b: 0 }) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let f;
  if (ax >= ay && ax >= az) f = x > 0 ? 0 : 1;
  else if (ay >= az) f = y > 0 ? 2 : 3;
  else f = z > 0 ? 4 : 5;
  const F = FACES[f];
  const dn = x * F.n[0] + y * F.n[1] + z * F.n[2];
  const u = (x * F.u[0] + y * F.u[1] + z * F.u[2]) / dn;
  const v = (x * F.v[0] + y * F.v[1] + z * F.v[2]) / dn;
  out.f = f;
  out.a = Math.atan(u) / Q;
  out.b = Math.atan(v) / Q;
  return out;
}

function triSolidAngle(a, b, c) {
  // Van Oosterom & Strackee
  const cx = b[1] * c[2] - b[2] * c[1];
  const cy = b[2] * c[0] - b[0] * c[2];
  const cz = b[0] * c[1] - b[1] * c[0];
  const num = a[0] * cx + a[1] * cy + a[2] * cz;
  const den = 1 + (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) + (b[0] * c[0] + b[1] * c[1] + b[2] * c[2]) + (c[0] * a[0] + c[1] * a[1] + c[2] * a[2]);
  return Math.abs(2 * Math.atan2(num, den));
}

const cache = new Map();

export function getGrid(N) {
  if (!cache.has(N)) cache.set(N, new CubeSphereGrid(N));
  return cache.get(N);
}

export class CubeSphereGrid {
  constructor(N) {
    this.N = N;
    const count = (this.count = 6 * N * N);
    this.dir = new Float32Array(count * 3);
    this.omega = new Float32Array(count); // solid angle (sr); area = omega * r^2
    this.lat = new Float32Array(count);
    this.lon = new Float32Array(count);
    this.east = new Float32Array(count * 3);
    this.north = new Float32Array(count * 3);
    this.nbr = new Int32Array(count * 4);
    this.nbrDist = new Float32Array(count * 4); // angular distance (rad)
    this.nbrE = new Float32Array(count * 4); // unit tangent toward neighbour, east comp
    this.nbrN = new Float32Array(count * 4); // north comp
    const tmp = [0, 0, 0];
    const fo = { f: 0, a: 0, b: 0 };
    const step = 2 / N;
    for (let f = 0; f < 6; f++) {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const c = f * N * N + j * N + i;
          const a = -1 + (i + 0.5) * step, b = -1 + (j + 0.5) * step;
          faceToDir(f, a, b, tmp);
          this.dir[c * 3] = tmp[0]; this.dir[c * 3 + 1] = tmp[1]; this.dir[c * 3 + 2] = tmp[2];
          const c00 = faceToDir(f, a - step / 2, b - step / 2, [0, 0, 0]);
          const c10 = faceToDir(f, a + step / 2, b - step / 2, [0, 0, 0]);
          const c11 = faceToDir(f, a + step / 2, b + step / 2, [0, 0, 0]);
          const c01 = faceToDir(f, a - step / 2, b + step / 2, [0, 0, 0]);
          this.omega[c] = triSolidAngle(c00, c10, c11) + triSolidAngle(c00, c11, c01);
          this.lat[c] = Math.asin(Math.max(-1, Math.min(1, tmp[1])));
          this.lon[c] = Math.atan2(tmp[0], tmp[2]);
          // tangent frame: east = Y x d
          let ex = tmp[2], ey = 0, ez = -tmp[0];
          let el = Math.hypot(ex, ey, ez);
          if (el < 1e-6) { ex = 1; ey = 0; ez = 0; el = 1; }
          ex /= el; ey /= el; ez /= el;
          const nx = tmp[1] * ez - tmp[2] * ey, ny = tmp[2] * ex - tmp[0] * ez, nz = tmp[0] * ey - tmp[1] * ex;
          this.east[c * 3] = ex; this.east[c * 3 + 1] = ey; this.east[c * 3 + 2] = ez;
          this.north[c * 3] = nx; this.north[c * 3 + 1] = ny; this.north[c * 3 + 2] = nz;
        }
      }
    }
    // neighbours
    const offs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let f = 0; f < 6; f++) {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const c = f * N * N + j * N + i;
          for (let k = 0; k < 4; k++) {
            const ni = i + offs[k][0], nj = j + offs[k][1];
            let n;
            if (ni >= 0 && ni < N && nj >= 0 && nj < N) n = f * N * N + nj * N + ni;
            else {
              const a = -1 + (ni + 0.5) * step, b = -1 + (nj + 0.5) * step;
              // Clamp the in-face coordinate so we land on the neighbouring face centre row.
              faceToDir(f, a, b, tmp);
              n = this.cellOf(tmp[0], tmp[1], tmp[2], fo);
            }
            this.nbr[c * 4 + k] = n;
          }
        }
      }
    }
    // distances and tangent directions
    for (let c = 0; c < count; c++) {
      const dx = this.dir[c * 3], dy = this.dir[c * 3 + 1], dz = this.dir[c * 3 + 2];
      for (let k = 0; k < 4; k++) {
        const n = this.nbr[c * 4 + k];
        const nx = this.dir[n * 3], ny = this.dir[n * 3 + 1], nz = this.dir[n * 3 + 2];
        const dot = Math.max(-1, Math.min(1, dx * nx + dy * ny + dz * nz));
        this.nbrDist[c * 4 + k] = Math.max(1e-5, Math.acos(dot));
        // tangent component of (n - d)
        let tx = nx - dx * dot, ty = ny - dy * dot, tz = nz - dz * dot;
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl; ty /= tl; tz /= tl;
        this.nbrE[c * 4 + k] = tx * this.east[c * 3] + ty * this.east[c * 3 + 1] + tz * this.east[c * 3 + 2];
        this.nbrN[c * 4 + k] = tx * this.north[c * 3] + ty * this.north[c * 3 + 1] + tz * this.north[c * 3 + 2];
      }
    }
    this.meanOmega = (4 * Math.PI) / count;
    this.cellAngle = Math.sqrt(this.meanOmega); // typical cell width (rad)
  }

  cellOf(x, y, z, fo = { f: 0, a: 0, b: 0 }) {
    const l = Math.hypot(x, y, z) || 1;
    dirToFace(x / l, y / l, z / l, fo);
    const N = this.N;
    let i = Math.floor(((fo.a + 1) / 2) * N), j = Math.floor(((fo.b + 1) / 2) * N);
    if (i < 0) i = 0; else if (i >= N) i = N - 1;
    if (j < 0) j = 0; else if (j >= N) j = N - 1;
    return fo.f * N * N + j * N + i;
  }

  // Cells whose centres lie within angular radius `ang` (rad) of unit dir d.
  // Uses BFS over the neighbour graph (bounded).
  cellsWithin(dx, dy, dz, ang, out = [], maxCells = 4000) {
    out.length = 0;
    const start = this.cellOf(dx, dy, dz);
    const cosA = Math.cos(ang);
    const seen = this._seen || (this._seen = new Uint32Array(this.count));
    this._stamp = (this._stamp || 0) + 1;
    const stamp = this._stamp;
    const queue = [start];
    seen[start] = stamp;
    out.push(start);
    let qi = 0;
    while (qi < queue.length && out.length < maxCells) {
      const c = queue[qi++];
      for (let k = 0; k < 4; k++) {
        const n = this.nbr[c * 4 + k];
        if (seen[n] === stamp) continue;
        seen[n] = stamp;
        const dot = this.dir[n * 3] * dx + this.dir[n * 3 + 1] * dy + this.dir[n * 3 + 2] * dz;
        if (dot >= cosA) {
          out.push(n);
          queue.push(n);
        }
      }
    }
    return out;
  }
}
