// Gravity: N-body velocity-Verlet (kick-drift-kick leapfrog) with softening.
// World positions are in gameplay distance units; time in orbit-seconds.
import { G } from './body.js';

export const ORBIT_DT = 1 / 120; // orbit-seconds per substep
export const SOFTENING = 0.5;

export function accelerations(bodies, out) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) { out[i * 3] = 0; out[i * 3 + 1] = 0; out[i * 3 + 2] = 0; }
  const e2 = SOFTENING * SOFTENING;
  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx = bj.pos[0] - bi.pos[0], dy = bj.pos[1] - bi.pos[1], dz = bj.pos[2] - bi.pos[2];
      const r2 = dx * dx + dy * dy + dz * dz + e2;
      const inv = 1 / (r2 * Math.sqrt(r2));
      const fi = G * bj.massCache * inv, fj = G * bi.massCache * inv;
      out[i * 3] += dx * fi; out[i * 3 + 1] += dy * fi; out[i * 3 + 2] += dz * fi;
      out[j * 3] -= dx * fj; out[j * 3 + 1] -= dy * fj; out[j * 3 + 2] -= dz * fj;
    }
  }
  return out;
}

// Advance one substep. Returns list of colliding pairs [i,j].
export function leapfrog(bodies, dt, acc) {
  const n = bodies.length;
  if (!acc || acc.length < n * 3) acc = new Float64Array(n * 3);
  accelerations(bodies, acc);
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (b.pinned) continue;
    b.vel[0] += 0.5 * dt * acc[i * 3]; b.vel[1] += 0.5 * dt * acc[i * 3 + 1]; b.vel[2] += 0.5 * dt * acc[i * 3 + 2];
    b.pos[0] += dt * b.vel[0]; b.pos[1] += dt * b.vel[1]; b.pos[2] += dt * b.vel[2];
  }
  accelerations(bodies, acc);
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (b.pinned) continue;
    b.vel[0] += 0.5 * dt * acc[i * 3]; b.vel[1] += 0.5 * dt * acc[i * 3 + 1]; b.vel[2] += 0.5 * dt * acc[i * 3 + 2];
  }
  const hits = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.pos[0] - a.pos[0], dy = b.pos[1] - a.pos[1], dz = b.pos[2] - a.pos[2];
      const rr = (a.radiusCache + b.radiusCache) * 0.97;
      if (dx * dx + dy * dy + dz * dz < rr * rr) hits.push([i, j]);
    }
  }
  return hits;
}

// Choose the gravitational parent: the body producing the strongest pull among
// more massive bodies (Hill-style dominance).
export function dominantParent(b, bodies) {
  let best = null, bestA = 0;
  for (const o of bodies) {
    if (o === b || o.massCache <= b.massCache) continue;
    const dx = o.pos[0] - b.pos[0], dy = o.pos[1] - b.pos[1], dz = o.pos[2] - b.pos[2];
    const r2 = dx * dx + dy * dy + dz * dz;
    // Prefer the nearest massive body whose Hill sphere contains us
    const a = (o.massCache / r2) * hillWeight(o, b, bodies, Math.sqrt(r2));
    if (a > bestA) { bestA = a; best = o; }
  }
  return best;
}

function hillWeight(o, b, bodies, r) {
  // find o's own parent to estimate its Hill radius
  let p = null, pa = 0;
  for (const q of bodies) {
    if (q === o || q.massCache <= o.massCache) continue;
    const dx = q.pos[0] - o.pos[0], dy = q.pos[1] - o.pos[1], dz = q.pos[2] - o.pos[2];
    const a = q.massCache / (dx * dx + dy * dy + dz * dz);
    if (a > pa) { pa = a; p = q; }
  }
  if (!p) return 1;
  const d = Math.hypot(p.pos[0] - o.pos[0], p.pos[1] - o.pos[1], p.pos[2] - o.pos[2]);
  const hill = d * Math.cbrt(o.massCache / (3 * p.massCache));
  return r < hill ? 1e6 : 1;
}

// Circular (or eccentric, starting at periapsis) orbit velocity relative to parent.
// plane normal defaults to +Y (ecliptic). dir: +1 prograde, -1 retrograde.
export function orbitVelocity(body, parent, { e = 0, dir = 1, normal = [0, 1, 0] } = {}) {
  const rx = body.pos[0] - parent.pos[0], ry = body.pos[1] - parent.pos[1], rz = body.pos[2] - parent.pos[2];
  const r = Math.hypot(rx, ry, rz) || 1;
  const mu = G * (parent.massCache + body.massCache);
  const v = Math.sqrt((mu * (1 + e)) / r);
  // tangent = normal x r̂
  let tx = normal[1] * rz - normal[2] * ry, ty = normal[2] * rx - normal[0] * rz, tz = normal[0] * ry - normal[1] * rx;
  let tl = Math.hypot(tx, ty, tz);
  if (tl < 1e-6) { tx = 0; ty = 0; tz = 1; tl = 1; }
  tx /= tl; ty /= tl; tz /= tl;
  return [parent.vel[0] + tx * v * dir, parent.vel[1] + ty * v * dir, parent.vel[2] + tz * v * dir];
}

// Osculating orbital elements relative to parent.
export function orbitalElements(body, parent) {
  const rx = body.pos[0] - parent.pos[0], ry = body.pos[1] - parent.pos[1], rz = body.pos[2] - parent.pos[2];
  const vx = body.vel[0] - parent.vel[0], vy = body.vel[1] - parent.vel[1], vz = body.vel[2] - parent.vel[2];
  const r = Math.hypot(rx, ry, rz);
  const v2 = vx * vx + vy * vy + vz * vz;
  const mu = G * (parent.massCache + body.massCache);
  const energy = v2 / 2 - mu / r;
  const a = -mu / (2 * energy);
  const hx = ry * vz - rz * vy, hy = rz * vx - rx * vz, hz = rx * vy - ry * vx;
  const h2 = hx * hx + hy * hy + hz * hz;
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h2) / (mu * mu)));
  const period = energy < 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;
  return { r, speed: Math.sqrt(v2), a, e, period, bound: energy < 0, periapsis: a * (1 - e), apoapsis: a * (1 + e), hy };
}

// Merge two colliding bodies conserving mass, condensed inventories and momentum.
// Returns { survivor, removed, report } — survivor is the more massive body.
export function mergeInfo(a, b) {
  const big = a.massCache >= b.massCache ? a : b;
  const small = big === a ? b : a;
  const m1 = big.massCache, m2 = small.massCache;
  const M = m1 + m2;
  const vel = [0, 1, 2].map((k) => (m1 * big.vel[k] + m2 * small.vel[k]) / M);
  const pos = [0, 1, 2].map((k) => (m1 * big.pos[k] + m2 * small.pos[k]) / M);
  const rel = Math.hypot(big.vel[0] - small.vel[0], big.vel[1] - small.vel[1], big.vel[2] - small.vel[2]);
  return { big, small, vel, pos, totalMass: M, momentum: [0, 1, 2].map((k) => m1 * big.vel[k] + m2 * small.vel[k]), relSpeed: rel };
}
