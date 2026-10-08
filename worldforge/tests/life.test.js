import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, worldToLocalDir, localToWorldDir } from '../src/sim/world.js';
import { totalPopulation, SPECIES, plantSuitability } from '../src/sim/life.js';
import { PLANTS } from '../src/sim/surface.js';
import { dirOf, runSurface } from './helpers.js';
import { pour } from '../src/sim/tools.js';

test('scenario 8: seeded vegetation grows; animals move, feed, reproduce within the cap', (t) => {
  const w = new World({ autoWeather: false, popCap: 60 });
  w.loadScene('earthMoon');
  const b = w.selected;
  const s = b.surface;
  b.agents.length = 0;
  b.reserve.fill(0);
  // clear vegetation in a suitable patch and reseed it
  s.computeHeads();
  const c = (() => { for (let i = 0; i < s.count; i++) if (plantSuitability(b, i, 0) > 0.5 && s.head[i] - s.ground[i] <= 0 && Math.abs(s.grid.lat[i]) < 0.7) return i; return -1; })();
  assert.ok(c >= 0);
  const d = dirOf(s, c);
  const cells = s.grid.cellsWithin(d[0], d[1], d[2], 0.2, []);
  for (const i of cells) for (let p = 0; p < PLANTS; p++) s.veg[i * PLANTS + p] = 0;
  const r = w.applyBrush({ id: 'seed', plant: 0, size: 0.2, strength: 1 }, { bodyId: b.id, dir: d }, 0.3);
  const v0 = cells.reduce((a, i) => a + s.veg[i * PLANTS], 0);
  assert.ok(v0 > 0, `seed brush planted grass (${r.msg || 'ok'})`);
  runSurface(w, 60, 0.5);
  const v1 = cells.reduce((a, i) => a + s.veg[i * PLANTS], 0);
  t.diagnostic(`grass in patch ${v0.toFixed(2)} → ${v1.toFixed(2)} after 60 s`);
  assert.ok(v1 > v0 * 1.3, 'vegetation grew');
  // drop rabbits on the patch
  const res = w.tapTool({ id: 'animal', species: 2, group: 6 }, { bodyId: b.id, dir: d });
  assert.ok(res.ok, res.msg);
  const a0 = b.agents.map((a) => ({ id: a.id, p: a.p.slice(), e: a.energy }));
  let fed = false, maxPop = 0;
  for (let k = 0; k < 400; k++) {
    runSurface(w, 1, 0.2);
    maxPop = Math.max(maxPop, b.agents.length);
    for (const a of b.agents) if (a.state === 'grazing' || a.state === 'eating') fed = true;
    assert.ok(b.agents.length <= w.settings.popCap, 'never exceeds the explicit cap');
  }
  const moved = a0.some((x) => { const a = b.agents.find((y) => y.id === x.id); return a && Math.acos(Math.min(1, a.p[0] * x.p[0] + a.p[1] * x.p[1] + a.p[2] * x.p[2])) > 0.002; }) || b.agents.length !== a0.length;
  const pop = totalPopulation(b);
  t.diagnostic(`rabbits ${a0.length} → ${pop[2]} visible (+${Math.floor(b.reserve[2])} aggregated), max ${maxPop}; births ${b.lifeStats?.births}, deaths ${b.lifeStats?.deaths}`);
  assert.ok(moved, 'animals moved');
  assert.ok(fed, 'animals fed on vegetation');
  assert.ok((b.lifeStats?.births || 0) > 0, 'reproduction happened');
  assert.ok(pop[2] <= w.settings.popCap, 'bounded');
});

test('scenario 8b: habitat loss (flooding) and severe weather reduce populations; unsuitable placement explained', (t) => {
  const w = new World({ autoWeather: false, popCap: 80 });
  w.loadScene('earthMoon');
  const b = w.selected;
  const s = b.surface;
  b.agents.length = 0;
  b.reserve.fill(0);
  s.computeHeads();
  let c = -1;
  for (let i = 0; i < s.count; i++) if (s.head[i] - s.ground[i] <= 0 && plantSuitability(b, i, 0) > 0.4) { c = i; break; }
  const d = dirOf(s, c);
  w.tapTool({ id: 'animal', species: 0, group: 6 }, { bodyId: b.id, dir: d });
  w.tapTool({ id: 'animal', species: 2, group: 6 }, { bodyId: b.id, dir: d });
  const n0 = b.agents.length;
  // drown the area
  for (let k = 0; k < 100; k++) pour(b, 'water', d, 0.2, 3, 0.1, w.time.surface);
  w.settings.stormForced = true;
  w.tapTool({ id: 'weather', weather: 'tornado', intensity: 1.4, duration: 60, area: 1.5, speed: 0 }, { bodyId: b.id, dir: d });
  runSurface(w, 60, 0.2);
  const n1 = b.agents.length;
  t.diagnostic(`land animals ${n0} → ${n1}; death causes ${JSON.stringify(b.lifeStats?.causes)}`);
  assert.ok(n1 < n0, 'population fell after flooding + tornado');
  // fish on land are refused with a reason unless override
  w.settings.experimentalOverride = false;
  let land = -1;
  s.computeHeads();
  for (let i = 0; i < s.count; i++) if (land < 0 || s.head[i] - s.ground[i] < s.head[land] - s.ground[land]) land = i;
  assert.ok(s.head[land] - s.ground[land] < 0.01, 'found dry land');
  const r = w.tapTool({ id: 'animal', species: 4, group: 1 }, { bodyId: b.id, dir: dirOf(s, land) });
  assert.equal(r.ok, false);
  assert.match(r.msg, /water/i);
  w.settings.experimentalOverride = true;
  const r2 = w.tapTool({ id: 'animal', species: 4, group: 1 }, { bodyId: b.id, dir: dirOf(s, land) });
  assert.ok(r2.ok);
  assert.match(r2.msg, /EXPERIMENTAL OVERRIDE/);
});

test('organisms live in planet-local coordinates: spin/tilt do not move them relative to terrain', () => {
  const w = new World({ autoWeather: false });
  w.loadScene('earthMoon');
  const b = w.selected;
  const a = b.agents[0];
  const p = a.p.slice();
  const c0 = b.surface.grid.cellOf(...p);
  w.settings.paused = false;
  w.settings.naturalLife = false;
  b.spinAngle += 2.0;
  b.tilt += 0.3;
  assert.equal(b.surface.grid.cellOf(...a.p), c0);
  const v = [0.3, 0.5, -0.8];
  const back = worldToLocalDir(b, localToWorldDir(b, v));
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(back[k] - v[k]) < 1e-12);
  assert.equal(SPECIES.length, 6);
});
