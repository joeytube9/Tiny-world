import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';

test('scenario 12: pause stops simulation, step advances a controlled interval, resume never jumps', () => {
  const w = new World({ autoWeather: false });
  w.loadScene('earthMoon');
  const moon = w.bodies[1];
  w.settings.paused = true;
  const t0 = { ...w.time }, p0 = moon.pos.slice();
  for (let i = 0; i < 100; i++) w.step(1 / 60);
  assert.equal(w.time.surface, t0.surface);
  assert.deepEqual(moon.pos, p0, 'paused: no motion');
  w.stepOnce(1, 0.5);
  assert.ok(Math.abs(w.time.surface - t0.surface - 1) < 1e-9, 'step = 1 surface-second');
  assert.ok(Math.abs(w.time.orbit - t0.orbit - 0.5) < 0.02, 'step = 0.5 orbit-second');
  w.settings.paused = false;
  // a backgrounded tab returns with a huge dt: it is clamped
  const t1 = w.time.surface, o1 = w.time.orbit, p1 = moon.pos.slice();
  w.step(3600);
  assert.ok(w.time.surface - t1 <= 0.1 + 1e-9, 'surface catch-up clamped');
  assert.ok(w.time.orbit - o1 <= 0.1 + 0.01, 'orbit catch-up clamped');
  const jump = Math.hypot(...moon.pos.map((x, k) => x - p1[k]));
  assert.ok(jump < 1, `no launch after resume (moved ${jump})`);
  // accelerated time is bounded per frame
  w.settings.surfaceSpeed = 16;
  w.settings.orbitSpeed = 50;
  const t2 = w.time.surface;
  w.step(0.1);
  assert.ok(w.time.surface - t2 <= 3 + 1e-9, 'surface time per frame bounded');
  for (const b of w.bodies) for (const v of b.pos.concat(b.vel)) assert.ok(Number.isFinite(v));
});
