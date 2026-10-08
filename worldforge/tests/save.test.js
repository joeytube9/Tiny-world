import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { serializeWorld, validateAndLoad } from '../src/sim/save.js';
import { FLOAT_FIELDS } from '../src/sim/surface.js';
import { dirOf, runSurface } from './helpers.js';

function modifiedWorld() {
  const w = new World({ autoWeather: false });
  w.loadScene('earthMoon');
  const b = w.selected;
  const s = b.surface;
  w.applyBrush({ id: 'raise', size: 0.2, strength: 1, material: 'granite' }, { bodyId: b.id, dir: [0, 1, 0] }, 1);
  w.applyBrush({ id: 'pour', size: 0.15, strength: 1 }, { bodyId: b.id, dir: [1, 0, 0] }, 1);
  w.settings.stormForced = true;
  w.tapTool({ id: 'weather', weather: 'hurricane', intensity: 1, duration: 200, area: 1, speed: 1, heading: 1 }, { bodyId: b.id, dir: dirOf(s, 500) });
  runSurface(w, 5, 0.1);
  w.stepOrbits(20, true);
  return w;
}

test('scenario 11: save → JSON → load preserves terrain, inventories, populations, storms and orbits', (t) => {
  const w = modifiedWorld();
  const json = JSON.stringify(serializeWorld(w, 'test'));
  t.diagnostic(`save size ${(json.length / 1024).toFixed(0)} KB`);
  const w2 = new World({ autoWeather: false });
  validateAndLoad(w2, json);
  assert.equal(w2.bodies.length, w.bodies.length);
  for (let k = 0; k < w.bodies.length; k++) {
    const a = w.bodies[k], b = w2.bodies[k];
    assert.equal(a.name, b.name);
    assert.deepEqual(a.pos, b.pos);
    assert.deepEqual(a.vel, b.vel);
    assert.deepEqual(a.inv, b.inv);
    assert.equal(a.agents.length, b.agents.length);
    assert.equal(a.storms.length, b.storms.length);
    assert.deepEqual(a.reserve, b.reserve);
    if (a.surface) {
      assert.equal(a.surface.Rs, b.surface.Rs);
      for (const f of FLOAT_FIELDS) assert.deepEqual(Array.from(a.surface[f]), Array.from(b.surface[f]), `field ${f}`);
      assert.deepEqual(Array.from(a.surface.veg), Array.from(b.surface.veg));
      assert.ok(Math.abs(a.waterTotal() - b.waterTotal()) < 1e-9);
    }
  }
  assert.equal(w2.time.surface, w.time.surface);
  assert.equal(w2.selectedId, w.selectedId);
  // the loaded world keeps simulating consistently
  runSurface(w2, 5, 0.1);
  assert.ok(w2.conservation(w2.selected).waterError < 1e-5);
});

test('imported saves are validated: bad format, non-finite physics and oversized populations are rejected or bounded', () => {
  const w = modifiedWorld();
  const data = serializeWorld(w, 'x');
  const w2 = new World({ autoWeather: false, popCap: 10 });
  assert.throws(() => validateAndLoad(w2, '{"format":"nope"}'), /Not a WORLDFORGE save/);
  assert.throws(() => validateAndLoad(w2, 'not json'), /JSON/);
  const v2 = structuredClone(data); v2.version = 99;
  assert.throws(() => validateAndLoad(w2, v2), /version/);
  const bad = structuredClone(data); bad.bodies[0].vel[0] = 'NaN';
  assert.throws(() => validateAndLoad(w2, bad), /finite/);
  const bad2 = JSON.parse(JSON.stringify(data)); bad2.bodies[1].pos = [1e300, 0, 0];
  assert.throws(() => validateAndLoad(w2, bad2), /range|finite/);
  const bad3 = structuredClone(data); bad3.bodies[0].surface.fields.w = bad3.bodies[0].surface.fields.w.slice(0, 100);
  assert.throws(() => validateAndLoad(w2, bad3));
  // population is truncated to the local cap; the rest becomes aggregated reserve
  validateAndLoad(w2, data);
  assert.ok(w2.bodies[0].agents.length <= 10);
  assert.ok(w2.bodies[0].reserve.reduce((a, b) => a + b, 0) >= w.bodies[0].reserve.reduce((a, b) => a + b, 0));
  // a failed import must not have wiped the previous world
  const before = w2.bodies.length;
  assert.throws(() => validateAndLoad(w2, bad));
  assert.equal(w2.bodies.length, before);
});
