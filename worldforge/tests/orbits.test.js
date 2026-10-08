import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { orbitalElements } from '../src/sim/orbits.js';

const dist = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);

test('scenario 9: Earth–Moon orbit stays bounded for several orbits; changing velocity changes the path', (t) => {
  const w = new World({ autoWeather: false });
  w.loadScene('earthMoon');
  const [earth, moon] = w.bodies;
  const el0 = orbitalElements(moon, earth);
  const d0 = dist(earth, moon);
  let mn = Infinity, mx = 0;
  const T = el0.period;
  w.stepOrbits(T * 4, true);
  // sample during another 1 orbit
  for (let k = 0; k < 200; k++) { w.stepOrbits(T / 200, true); const d = dist(earth, moon); mn = Math.min(mn, d); mx = Math.max(mx, d); }
  assert.equal(w.bodies.length, 2, 'no collision');
  const el1 = orbitalElements(moon, earth);
  t.diagnostic(`period ${T.toFixed(1)} orbit-s; distance ${d0.toFixed(2)} → range [${mn.toFixed(2)}, ${mx.toFixed(2)}] after 5 orbits; e ${el0.e.toFixed(4)} → ${el1.e.toFixed(4)}`);
  assert.ok(mn > d0 * 0.95 && mx < d0 * 1.05, 'bounded near-circular orbit');
  // now a prograde burn: orbit becomes eccentric and the path changes
  w.nudge(moon, 'prograde', 0.12);
  const el2 = orbitalElements(moon, earth);
  w.stepOrbits(el2.period * 0.5, true);
  const dHalf = dist(earth, moon);
  t.diagnostic(`after +12% prograde: e ${el2.e.toFixed(3)}, apoapsis ${el2.apoapsis.toFixed(1)}, distance half an orbit later ${dHalf.toFixed(1)}`);
  assert.ok(el2.e > 0.15, 'eccentricity increased');
  assert.ok(dHalf > d0 * 1.3, 'body actually travelled to a higher apoapsis (simulated, not pinned)');
});

test('scenario 10: Sun–Earth–Moon nested orbits stay stable; switching presets leaves no hidden bodies', (t) => {
  const w = new World({ autoWeather: false });
  w.loadScene('sunEarthMoon');
  const sun = w.bodies.find((b) => b.type === 'star');
  const earth = w.bodies.find((b) => b.name === 'Earth');
  const moon = w.bodies.find((b) => b.name === 'Moon');
  const yearT = orbitalElements(earth, sun).period;
  const de0 = dist(sun, earth), dm0 = dist(earth, moon);
  let emin = Infinity, emax = 0, mmin = Infinity, mmax = 0;
  for (let k = 0; k < 400; k++) {
    w.stepOrbits(yearT / 200, true);
    const de = dist(sun, earth), dm = dist(earth, moon);
    emin = Math.min(emin, de); emax = Math.max(emax, de); mmin = Math.min(mmin, dm); mmax = Math.max(mmax, dm);
  }
  t.diagnostic(`year ${yearT.toFixed(0)} orbit-s; Earth–Sun ${de0.toFixed(0)} → [${emin.toFixed(0)}, ${emax.toFixed(0)}]; Moon–Earth ${dm0.toFixed(1)} → [${mmin.toFixed(1)}, ${mmax.toFixed(1)}] over 2 years`);
  assert.equal(w.bodies.length, 3);
  assert.ok(emin > de0 * 0.97 && emax < de0 * 1.03, 'Earth orbit stable');
  assert.ok(mmin > dm0 * 0.85 && mmax < dm0 * 1.15, 'Moon stays bound to Earth');
  assert.ok(orbitalElements(moon, earth).bound);
  w.loadScene('solar');
  assert.equal(w.bodies.length, 7);
  w.loadScene('earthMoon');
  assert.equal(w.bodies.length, 2, 'no duplicate hidden bodies after switching');
  w.loadScene('blank');
  assert.equal(w.bodies.length, 0);
});

test('deliberate collision merges bodies conserving mass and momentum; presets keep clearance', (t) => {
  const w = new World({ autoWeather: false });
  w.loadScene('earthMoon');
  const [earth, moon] = w.bodies;
  const mBefore = earth.massCache + moon.massCache;
  const water0 = earth.waterTotal() + moon.waterTotal();
  // aim the moon straight at Earth
  const dx = earth.pos.map((x, k) => x - moon.pos[k]);
  const l = Math.hypot(...dx);
  moon.vel = dx.map((x, k) => (x / l) * 3 + earth.vel[k]);
  // total momentum is conserved by gravity too, so compare against the pre-impact total
  const pBefore = [0, 1, 2].map((k) => earth.massCache * earth.vel[k] + moon.massCache * moon.vel[k]);
  w.stepOrbits(60, true);
  assert.equal(w.bodies.length, 1, 'merged');
  const b = w.bodies[0];
  const c = w.lastCollision;
  const pAfter = b.vel.map((v) => v * b.massCache);
  const perr = Math.hypot(...pAfter.map((x, k) => x - pBefore[k])) / (b.massCache * 3);
  t.diagnostic(`mass ${mBefore.toFixed(2)} → ${b.massCache.toFixed(2)} (rel err ${c.massError.toExponential(2)}); momentum err ${perr.toExponential(2)}; impact speed ${c.relSpeed.toFixed(2)}`);
  assert.ok(c.massError < 1e-9, 'mass conserved');
  assert.ok(perr < 1e-9, 'system momentum conserved through approach and merge');
  assert.ok(c.momentumError < 1e-9, 'momentum conserved in the merge');
  assert.ok(b.waterTotal() >= water0 - 1e-6, 'water inventories transferred');
  for (const v of b.pos.concat(b.vel)) assert.ok(Number.isFinite(v));
  // auto-added moon gets clearance from radii
  const m2 = w.spawnBody('moon', { parentId: b.id });
  assert.ok(dist(m2, b) > (m2.radiusCache + b.radiusCache) * 1.8);
});

test('mass edits perturb orbits; re-stabilize is an explicit velocity change', () => {
  const w = new World({ autoWeather: false });
  w.loadScene('earthMoon');
  const [earth, moon] = w.bodies;
  earth.inv.iron *= 1.6;
  earth.updateCaches();
  const el = orbitalElements(moon, earth);
  assert.ok(el.e > 0.05, 'heavier Earth makes the old velocity eccentric');
  w.restabilize(moon);
  assert.ok(orbitalElements(moon, earth).e < 0.01);
  assert.ok(moon.events.some((e) => /Re-stabilised/.test(e.text)));
});
