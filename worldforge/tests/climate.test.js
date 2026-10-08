import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rockyWorld, runSurface } from './helpers.js';
import { setOceanCoverage } from '../src/sim/presets.js';
import { World } from '../src/sim/world.js';

test('scenario 5: on a cold world water freezes, later melts, and total water stays within tolerance', (t) => {
  const { w, b, s } = rockyWorld({ N: 16, radius: 6, atmosphere: 0.8 });
  setOceanCoverage(b, 0.4);
  b.waterBaseline = b.waterTotal();
  const W0 = b.waterTotal();
  b.tempBias = -70;
  runSurface(w, 300, 0.25);
  const r1 = s.waterReservoirs();
  t.diagnostic(`cold: liquid ${r1.liquid.toFixed(3)} ice ${r1.ice.toFixed(3)} mean T ${s.stats().meanTemp.toFixed(1)}`);
  assert.ok(r1.ice > W0 * 0.2, 'substantial freezing');
  const W1 = b.waterTotal();
  b.tempBias = +45;
  runSurface(w, 400, 0.25);
  const r2 = s.waterReservoirs();
  t.diagnostic(`warm: liquid ${r2.liquid.toFixed(3)} ice ${r2.ice.toFixed(3)} vapour ${(r2.vapor + r2.cloud).toFixed(3)} mean T ${s.stats().meanTemp.toFixed(1)}`);
  assert.ok(r2.ice < r1.ice * 0.3, 'ice melted back');
  assert.ok(r2.liquid > r1.liquid, 'meltwater is liquid again');
  const cons = w.conservation(b);
  t.diagnostic(`water ${W0.toFixed(4)} → ${W1.toFixed(4)} → ${b.waterTotal().toFixed(4)}; ledger error ${cons.waterError.toExponential(2)}`);
  assert.ok(cons.waterError < 1e-5, 'conserved to 1e-5 (no sources/sinks besides ledger)');
});

test('rain, evaporation and soil absorption conserve water on Earth (ledger-checked)', (t) => {
  const w = new World({ autoWeather: true });
  w.loadScene('earthMoon');
  const b = w.selected;
  const s = b.surface;
  const before = s.waterReservoirs();
  w.settings.surfaceSpeed = 4;
  for (let i = 0; i < 1800; i++) w.step(1 / 30);
  const after = s.waterReservoirs();
  let rainCells = 0;
  for (let i = 0; i < s.count; i++) if (s.precip[i] > 1e-5) rainCells++;
  const cons = w.conservation(b);
  t.diagnostic(`reservoirs before ${JSON.stringify(Object.fromEntries(Object.entries(before).map(([k, v]) => [k, +v.toFixed(2)])))} after ${JSON.stringify(Object.fromEntries(Object.entries(after).map(([k, v]) => [k, +v.toFixed(2)])))}; raining cells ${rainCells}; error ${cons.waterError.toExponential(2)}`);
  assert.ok(after.vapor + after.cloud > 0.1, 'evaporation produced atmospheric water');
  assert.ok(rainCells > 50, 'precipitation is falling');
  assert.ok(after.soil > 0.5, 'soil holds absorbed water');
  assert.ok(cons.waterError < 1e-5, 'conservation within 1e-5');
});

test('airless bodies cannot hold weather: natural storm refused with a reason; forced storm labelled', () => {
  const w = new World({ autoWeather: false });
  w.loadScene('earthMoon');
  const moon = w.bodies.find((b) => b.name === 'Moon');
  w.settings.stormForced = false;
  const r = w.tapTool({ id: 'weather', weather: 'rain', intensity: 1, duration: 30, area: 1, speed: 0 }, { bodyId: moon.id, dir: [0, 1, 0] });
  assert.equal(r.ok, false);
  assert.match(r.msg, /atmosphere/i);
  w.settings.stormForced = true;
  const r2 = w.tapTool({ id: 'weather', weather: 'rain', intensity: 1, duration: 30, area: 1, speed: 0 }, { bodyId: moon.id, dir: [0, 1, 0] });
  assert.equal(r2.ok, true);
  assert.match(r2.msg, /FORCED/);
});
