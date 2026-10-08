import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rockyWorld, runSurface } from './helpers.js';
import { SOLID_KEYS } from '../src/sim/materials.js';

test('scenario 2: a 99% rock / 1% water world becomes a 1% rock / 99% water world via the recipe editor', (t) => {
  const { w, b, s } = rockyWorld({ N: 24, radius: 10, recipe: { rock: 0.99, water: 0.01 }, gen: { continents: 0.6, mountains: 0.5, relief: 0.05 } });
  b.atmosphere = 0; // keep the inventory on the surface for the measurement
  const V0 = b.condensedVolume();
  const st0 = s.stats();
  const rep0 = b.compositionReport();
  t.diagnostic(`start: rock ${(rep0.volumeFractions.rock * 100).toFixed(2)}% water ${(rep0.volumeFractions.water * 100).toFixed(2)}% → ocean coverage ${(st0.oceanCoverage * 100).toFixed(1)}%, land ${(st0.landFraction * 100).toFixed(1)}%`);
  assert.ok(Math.abs(rep0.volumeFractions.water - 0.01) < 0.002, 'starts at 1% water by volume');
  assert.ok(st0.landFraction > 0.6, 'predominantly rocky: most of the surface is exposed land');
  assert.ok(st0.oceanCoverage > 0.02, 'water collects in the low terrain');
  const job = w.startRecipe(b, { rock: 0.01, water: 0.99 }, V0, {});
  let maxR = 0, minRs = Infinity, guard = 0, sawProgress = 0;
  while (!job.done && guard++ < 4000) {
    runSurface(w, 1, 0.25);
    assert.ok(Number.isFinite(b.radiusCache) && b.radiusCache > 0, 'radius stays finite');
    assert.ok(Number.isFinite(b.massCache) && b.massCache > 0, 'mass stays finite');
    maxR = Math.max(maxR, b.radiusCache);
    minRs = Math.min(minRs, s.Rs);
    if (job.progress > 0.4 && job.progress < 0.6) sawProgress++;
  }
  assert.ok(job.done, `transition completed (${job.progress})`);
  assert.ok(sawProgress > 0, 'progress indicator moved through intermediate values');
  // let the ocean settle
  runSurface(w, 30, 0.25);
  const rep = b.compositionReport();
  const st = s.stats();
  t.diagnostic(`end: rock ${(rep.volumeFractions.rock * 100).toFixed(2)}% water ${(rep.volumeFractions.water * 100).toFixed(2)}% → ocean coverage ${(st.oceanCoverage * 100).toFixed(1)}%, Rs ${s.Rs.toFixed(2)} (from ~9.97), outer radius ${b.radiusCache.toFixed(2)}`);
  assert.ok(Math.abs(rep.volumeFractions.water - 0.99) < 0.01, 'reached 99% water');
  assert.ok(rep.volumeFractions.rock < 0.015, 'rock reduced to ~1%');
  assert.ok(st.oceanCoverage > 0.98, 'predominantly watery: solid terrain submerged');
  // solid core still represented, with consistent volume
  const Vsolid = SOLID_KEYS.reduce((a, k) => a + b.inv[k], 0);
  const RsExpected = Math.cbrt((3 * Vsolid) / (4 * Math.PI));
  assert.ok(s.Rs > 0.5 && Math.abs(s.Rs - RsExpected) / RsExpected < 0.1, `core radius ${s.Rs} vs ${RsExpected}`);
  const cons = w.conservation(b);
  assert.ok(cons.solidError < 1e-4, `terrain integral matches inventory (${cons.solidError})`);
  // water surface radius ≈ volume-equivalent sphere (thick shell handled exactly)
  const Vtot = b.condensedVolume();
  const Req = Math.cbrt((3 * Vtot) / (4 * Math.PI));
  let mean = 0;
  for (let i = 0; i < s.count; i++) mean += s.head[i];
  mean /= s.count;
  t.diagnostic(`mean water surface ${mean.toFixed(3)} vs volume-equivalent radius ${Req.toFixed(3)} (total condensed ${Vtot.toFixed(0)} vs ${V0.toFixed(0)})`);
  assert.ok(Math.abs(mean - Req) / Req < 0.02, 'spherical shell volume, not thin-water extrapolation');
  // removed rock left through the explicit replacement sink; water was an explicit source
  assert.ok(job.removed.rock > 0.9 * V0 * 0.97, 'rock removal recorded');
  assert.ok(b.ledger.source > 0.9 * V0, 'water addition recorded as explicit source');
  // removing the water later re-exposes the remaining terrain
  for (let i = 0; i < s.count; i++) { b.ledger.sink += s.w[i]; s.w[i] = 0; }
  s.computeHeads();
  assert.ok(s.stats().landFraction > 0.9, 'submerged core terrain reappears when drained');
});

test('pouring adds inventory and mass; recipe pause/cancel keeps inventories valid', () => {
  const { w, b, s } = rockyWorld({ N: 16, radius: 6 });
  const m0 = b.mass();
  const rock0 = b.inv.rock;
  w.applyBrush({ id: 'pour', size: 0.2, strength: 1 }, { bodyId: b.id, dir: [0, 1, 0] }, 1);
  b.updateCaches();
  assert.ok(b.mass() > m0, 'pouring water increased mass');
  assert.equal(b.inv.rock, rock0, 'pouring does not delete rock');
  const job = w.startRecipe(b, { rock: 0.5, iron: 0.5 }, b.condensedVolume());
  runSurface(w, 3, 0.25);
  job.paused = true;
  runSurface(w, 4, 0.25); // let already-falling packets land
  const p = job.progress;
  const inv = { ...b.inv };
  runSurface(w, 5, 0.25);
  assert.equal(job.progress, p, 'paused job does not advance');
  assert.deepEqual({ ...b.inv }, inv, 'paused job does not change inventory');
  job.cancelled = true;
  runSurface(w, 5, 0.25);
  for (const k of Object.keys(b.inv)) assert.ok(Number.isFinite(b.inv[k]) && b.inv[k] >= 0);
  assert.ok(w.conservation(b).solidError < 1e-4);
  // iron addition increases mass coherently
  const m1 = b.massBreakdown().iron;
  const M1 = b.mass();
  b.inv.iron += 10;
  assert.ok(Math.abs(b.massBreakdown().iron - m1 - 79) < 1e-6, 'iron density 7.9 per unit volume');
  assert.ok(b.mass() > M1 + 78, 'body mass grows with added iron');
});
