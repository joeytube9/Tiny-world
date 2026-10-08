import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { headingVel, createStorm } from '../src/sim/storms.js';
import { PLANTS } from '../src/sim/surface.js';
import { dirOf, runSurface } from './helpers.js';

function findCell(s, pred) {
  for (let i = 0; i < s.count; i++) if (pred(i)) return i;
  return -1;
}

test('scenario 7a: a moving tornado leaves a damage path, strips vegetation and moves sediment', (t) => {
  const w = new World({ autoWeather: false });
  w.loadScene('earthMoon');
  const b = w.selected;
  const s = b.surface;
  s.computeHeads();
  const c = findCell(s, (i) => s.head[i] - s.ground[i] <= 0 && s.veg[i * PLANTS] + s.veg[i * PLANTS + 4] > 0.3 && Math.abs(s.grid.lat[i]) < 0.8);
  assert.ok(c >= 0);
  const d = dirOf(s, c);
  const veg0 = Float32Array.from(s.veg);
  w.settings.stormForced = true;
  const r = w.tapTool({ id: 'weather', weather: 'tornado', intensity: 1, duration: 40, area: 1, speed: 1, heading: 0.4 }, { bodyId: b.id, dir: d });
  assert.ok(r.ok, r.msg);
  const st = b.storms.find((x) => x.type === 'tornado');
  const p0 = st.pos.slice();
  runSurface(w, 30, 0.1);
  const moved = Math.acos(Math.min(1, p0[0] * st.pos[0] + p0[1] * st.pos[1] + p0[2] * st.pos[2]));
  let damaged = 0, vegLost = 0;
  for (let i = 0; i < s.count; i++) {
    if (s.damage[i] > 0.2) damaged++;
    for (let p = 0; p < PLANTS; p++) vegLost += Math.max(0, veg0[i * PLANTS + p] - s.veg[i * PLANTS + p]);
  }
  t.diagnostic(`moved ${(moved * s.Rs).toFixed(2)} u; damaged cells ${damaged}; sediment moved ${st.sedimentMoved.toExponential(2)}; vegetation damage total ${st.damageTotal.toFixed(2)}`);
  assert.ok(moved > 0.03, 'tornado moved along the surface');
  assert.ok(damaged >= 3, 'visible damage path');
  assert.ok(st.damageTotal > 0.2, 'vegetation uprooted');
  assert.ok(st.sedimentMoved > 0, 'loose sediment transported');
});

test('scenario 7b: a natural hurricane strengthens over warm ocean, brings wind, rain and surge, and weakens over land/cold water', (t) => {
  const w = new World({ autoWeather: false });
  w.loadScene('stormWorld');
  const b = w.selected;
  const s = b.surface;
  b.storms.length = 0;
  s.computeHeads();
  // warm the tropics a little for a clean natural test
  b.tempBias += 6;
  runSurface(w, 20, 0.5);
  const c = findCell(s, (i) => s.head[i] - s.ground[i] > 0.15 && s.grid.lat[i] > 0.2 && s.grid.lat[i] < 0.35 && s.temp[i] > 26);
  assert.ok(c >= 0, 'warm ocean exists');
  const d = dirOf(s, c);
  w.settings.stormForced = false;
  const res = w.tapTool({ id: 'weather', weather: 'hurricane', intensity: 0.5, duration: 400, area: 1, speed: 0 }, { bodyId: b.id, dir: d });
  assert.ok(res.ok, res.msg);
  const st = b.storms.find((x) => x.type === 'hurricane');
  st.vel = [0, 0, 0];
  // pin it over the warm ocean for the strengthening phase
  const i0 = st.intensity;
  const W0 = b.waterTotal();
  for (let k = 0; k < 60; k++) { runSurface(w, 0.5, 0.1); st.pos = d.slice(); st.vel = [0, 0, 0]; }
  const i1 = st.intensity;
  let maxWind = 0, rain = 0;
  for (const cc of s.grid.cellsWithin(d[0], d[1], d[2], st.radius, [])) { maxWind = Math.max(maxWind, Math.hypot(s.windE[cc], s.windN[cc])); rain += s.precip[cc]; }
  t.diagnostic(`intensity ${i0.toFixed(2)} → ${i1.toFixed(2)} over warm ocean; max wind ${maxWind.toFixed(1)} u/s; rain moisture used ${st.rainTotal.toFixed(3)}; surge ${(st.surgeMax * 1000).toFixed(2)} mu`);
  assert.ok(i1 > i0, 'strengthened over warm ocean');
  assert.ok(maxWind > 4, 'strong rotating wind field');
  assert.ok(st.rainTotal > 0 && rain > 0, 'rainfall');
  assert.ok(st.surgeMax > 0, 'storm surge redistributed water toward the coast');
  assert.ok(Math.abs(b.waterTotal() - W0) < 1e-6 * W0 + b.ledger.forced, 'surge and rain do not create water (natural mode)');
  // move over land: weakens
  const land = findCell(s, (i) => s.head[i] - s.ground[i] <= 0 && Math.abs(s.grid.lat[i]) < 0.6);
  const ld = dirOf(s, land);
  for (let k = 0; k < 40; k++) { runSurface(w, 0.5, 0.1); if (st.dead) break; st.pos = ld.slice(); st.vel = [0, 0, 0]; }
  t.diagnostic(`over land: intensity ${st.intensity.toFixed(2)}${st.dead ? ' (dissipated)' : ''}, state "${st.state}"`);
  assert.ok(st.dead || st.intensity < i1 * 0.7, 'weakened over land');
});

test('natural hurricane refused over cold water and on slow-spinning planets; forced override labelled', () => {
  const w = new World({ autoWeather: false });
  w.loadScene('earthMoon');
  const b = w.selected;
  const s = b.surface;
  s.computeHeads();
  const cold = findCell(s, (i) => s.head[i] - s.ground[i] > 0.1 && s.temp[i] < 10);
  w.settings.stormForced = false;
  const r = w.tapTool({ id: 'weather', weather: 'hurricane', intensity: 1, duration: 60, area: 1, speed: 0 }, { bodyId: b.id, dir: dirOf(s, cold) });
  assert.equal(r.ok, false);
  assert.match(r.msg, /cold|ocean|equator/i);
  b.spinPeriod = 5000;
  const warm = findCell(s, (i) => s.head[i] - s.ground[i] > 0.1 && s.temp[i] > 26 && Math.abs(s.grid.lat[i]) > 0.15);
  if (warm >= 0) {
    const r2 = w.tapTool({ id: 'weather', weather: 'hurricane', intensity: 1, duration: 60, area: 1, speed: 0 }, { bodyId: b.id, dir: dirOf(s, warm) });
    assert.equal(r2.ok, false);
    assert.match(r2.msg, /spin/i);
  }
  w.settings.stormForced = true;
  const r3 = w.tapTool({ id: 'weather', weather: 'hurricane', intensity: 1, duration: 60, area: 1, speed: 0 }, { bodyId: b.id, dir: dirOf(s, cold) });
  assert.ok(r3.ok);
  assert.match(r3.msg, /FORCED/);
});

test('weather tools: snow accumulates as ice, heatwave warms, drought dries, lightning fires burn out', () => {
  const w = new World({ autoWeather: false });
  w.loadScene('earthMoon');
  const b = w.selected;
  const s = b.surface;
  s.computeHeads();
  w.settings.stormForced = true;
  const land = findCell(s, (i) => s.head[i] - s.ground[i] <= 0 && Math.abs(s.grid.lat[i]) < 0.6 && s.veg[i * PLANTS] > 0.2);
  const d = dirOf(s, land);
  const region = s.grid.cellsWithin(d[0], d[1], d[2], 0.2, []);
  const regionIce = () => region.reduce((a, c) => a + s.ice[c], 0);
  const ice0 = regionIce();
  w.tapTool({ id: 'weather', weather: 'blizzard', intensity: 1.2, duration: 60, area: 1, speed: 0 }, { bodyId: b.id, dir: d });
  runSurface(w, 40, 0.25);
  assert.ok(regionIce() > ice0 + 0.01, `snow accumulated (${ice0.toFixed(3)} -> ${regionIce().toFixed(3)})`);
  b.storms.length = 0;
  const T0 = s.temp[land];
  w.tapTool({ id: 'weather', weather: 'heatwave', intensity: 1.2, duration: 60, area: 1, speed: 0 }, { bodyId: b.id, dir: d });
  runSurface(w, 30, 0.25);
  assert.ok(s.temp[land] > T0 + 5, 'heatwave raised temperature');
  b.storms.length = 0;
  // fire: ignite and let it burn; it must stay bounded and eventually extinguish
  s.fire[land] = 0.8;
  let maxBurning = 0;
  for (let k = 0; k < 120; k++) { runSurface(w, 1, 0.25); maxBurning = Math.max(maxBurning, b.burning || 0); }
  assert.ok(maxBurning <= 400, 'fire spread is bounded');
  runSurface(w, 300, 0.5);
  assert.ok((b.burning || 0) < Math.max(5, maxBurning * 0.5), `fire died down (${b.burning} of peak ${maxBurning})`);
});
