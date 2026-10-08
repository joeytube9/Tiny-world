import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rockyWorld, dirOf, angle, runSurface } from './helpers.js';
import { pour, drain } from '../src/sim/tools.js';
import { waterStep, settleBasins } from '../src/sim/water.js';

function wetCells(s, minDepth = 0.003) {
  s.computeHeads();
  const out = [];
  for (let i = 0; i < s.count; i++) if (s.head[i] - s.ground[i] > minDepth) out.push(i);
  return out;
}

test('scenario 3: pours on opposite sides fall toward the centre, pool locally, flow downhill and flood higher terrain', () => {
  const { w, b, s } = rockyWorld();
  w.settings.erosion = 0;
  b.atmosphere = 0.0; // isolate hydrology from weather
  // pick a high cell and its antipode region
  let hi = 0;
  for (let i = 0; i < s.count; i++) if (s.bed[i] > s.bed[hi]) hi = i;
  const A = dirOf(s, hi);
  const Bd = [-A[0], -A[1], -A[2]];
  const W0 = b.waterTotal();
  for (let k = 0; k < 20; k++) {
    pour(b, 'water', A, 0.08, 4, 0.1, w.time.surface);
    pour(b, 'water', Bd, 0.08, 4, 0.1, w.time.surface);
  }
  // packets are in flight above the surface (counted once, as pending)
  assert.ok(b.pending.length === 40);
  const p0 = b.pending[0];
  assert.ok(p0.r0 > p0.rLand && p0.tLand > p0.t0, 'falls inward over time');
  assert.ok(Math.abs(b.waterTotal() - W0 - 16) < 1e-6, 'in-flight water counted exactly once');
  // let it land and flow a little
  runSurface(w, 3, 0.1);
  assert.equal(b.pending.length, 0);
  let nearA = 0, nearB = 0, far = 0;
  for (let i = 0; i < s.count; i++) {
    const d = dirOf(s, i);
    if (angle(d, A) < 0.6) nearA += s.w[i];
    else if (angle(d, Bd) < 0.6) nearB += s.w[i];
    else far += s.w[i];
  }
  assert.ok(nearA > 5 && nearB > 5, `both sides received water (${nearA.toFixed(2)}, ${nearB.toFixed(2)})`);
  assert.ok(far < 0.15 * (nearA + nearB), `not instantly redistributed (${far.toFixed(3)} far)`);
  // downhill: the water-weighted mean ground radius drops as it flows from the peak
  const meanGround = () => {
    s.computeHeads();
    let a = 0, m = 0;
    for (let i = 0; i < s.count; i++) { a += s.w[i] * s.ground[i]; m += s.w[i]; }
    return a / m;
  };
  const g1 = meanGround();
  runSurface(w, 20, 0.1);
  const g2 = meanGround();
  assert.ok(g2 < g1, `water moved downhill (${g1.toFixed(4)} -> ${g2.toFixed(4)})`);
  // more volume floods higher terrain: highest wet ground rises
  const maxWetGround = () => { const c = wetCells(s); let m = 0; for (const i of c) m = Math.max(m, s.ground[i]); return { m, n: c.length }; };
  const before = maxWetGround();
  for (let k = 0; k < 120; k++) pour(b, 'water', Bd, 0.15, 30, 0.1, w.time.surface);
  runSurface(w, 40, 0.1);
  const after = maxWetGround();
  assert.ok(after.n > before.n * 1.5, `flooded area grew (${before.n} -> ${after.n} cells)`);
  assert.ok(after.m >= before.m, 'reached higher terrain');
  const cons = w.conservation(b);
  assert.ok(cons.waterError < 1e-5, `water conserved (${cons.waterError})`);
});

test('scenario 4: draining reveals the submerged terrain unchanged (not deleted)', () => {
  const { w, b, s } = rockyWorld({ seed: 7 });
  w.settings.erosion = 0;
  b.atmosphere = 0;
  const bed0 = Float32Array.from(s.bed), sed0 = Float32Array.from(s.sed);
  const dryCells0 = s.count - wetCells(s).length;
  // flood a region heavily
  const A = dirOf(s, 100);
  for (let k = 0; k < 100; k++) pour(b, 'water', A, 0.3, 40, 0.1, w.time.surface);
  runSurface(w, 15, 0.1);
  const flooded = wetCells(s).length;
  assert.ok(flooded > 200, `region submerged (${flooded} wet cells)`);
  // drain everything back out with the brush and global drain
  for (let k = 0; k < 400; k++) drain(b, A, 1.2, 200, 0.1);
  for (let i = 0; i < s.count; i++) { b.ledger.sink += s.w[i]; s.w[i] = 0; }
  s.computeHeads();
  const wetAfter = wetCells(s).length;
  assert.ok(wetAfter < 5, `water gone (${wetAfter})`);
  let maxDiff = 0;
  for (let i = 0; i < s.count; i++) maxDiff = Math.max(maxDiff, Math.abs(s.bed[i] + s.sed[i] - bed0[i] - sed0[i]));
  assert.ok(maxDiff < 1e-5, `terrain under the water is intact (max change ${maxDiff})`);
  assert.ok(s.count - wetAfter >= dryCells0 - 5, 'land reappeared');
  // leaves wet ground temporarily
  let wet = 0;
  for (let i = 0; i < s.count; i++) if (s.wet[i] > 0.3) wet++;
  assert.ok(wet > 50, 'recently drained ground is still wet');
});

test('conservative flow: never negative, exact total, local pour does not jump to distant basins', () => {
  const { w, b, s } = rockyWorld({ N: 16, seed: 3 });
  b.atmosphere = 0;
  for (let i = 0; i < s.count; i += 13) s.w[i] = 0.05;
  const W = s.sum('w');
  for (let k = 0; k < 300; k++) waterStep(b, 0.25, { erosion: 0 });
  let neg = 0;
  for (let i = 0; i < s.count; i++) if (s.w[i] < 0) neg++;
  assert.equal(neg, 0);
  // infiltration moves water into soil only, so liquid+soil+ice is conserved
  const total = s.sum('w') + s.sum('sw') + s.sum('ice');
  assert.ok(Math.abs(total - W) / W < 1e-5, `conserved ${total} vs ${W}`);
});

test('adjacent basins connect only when their level reaches the saddle; disconnected basins keep their own water', () => {
  const { w, b, s } = rockyWorld({ N: 24, gen: { continents: 0, mountains: 0, relief: 0.0001 } });
  b.atmosphere = 0;
  w.settings.erosion = 0;
  // sculpt two basins separated by a ridge along the equator
  const cA = [1, 0, 0];
  const cB = [Math.cos(0.7), 0, Math.sin(0.7)];
  for (let i = 0; i < s.count; i++) {
    const d = dirOf(s, i);
    const a = angle(d, cA), bb = angle(d, cB);
    let e = 0.3;
    e -= 0.35 * Math.exp(-(a * a) / 0.03);
    e -= 0.35 * Math.exp(-(bb * bb) / 0.03);
    s.bed[i] = e;
    s.sed[i] = 0;
  }
  s.solveRs(b.solidVolume());
  s.computeHeads();
  const inB = (i) => angle(dirOf(s, i), cB) < 0.25;
  const inA = (i) => angle(dirOf(s, i), cA) < 0.25;
  let pouredA = 0;
  let firstSpill = null;
  for (let k = 0; k < 120; k++) {
    pour(b, 'water', cA, 0.05, 6, 0.25, w.time.surface);
    pouredA += 1.5;
    runSurface(w, 0.5, 0.1);
    settleBasins(b);
    let wb = 0;
    for (let i = 0; i < s.count; i++) if (inB(i)) wb += s.w[i];
    if (wb > 0.05 && firstSpill === null) firstSpill = pouredA;
  }
  let wa = 0, wb = 0;
  for (let i = 0; i < s.count; i++) { if (inA(i)) wa += s.w[i]; if (inB(i)) wb += s.w[i]; }
  assert.ok(firstSpill !== null && firstSpill > 10, `B stayed dry until A filled to the saddle (spill after ${firstSpill} u³)`);
  assert.ok(wb > 0.5, 'B eventually connected and received water');
  assert.ok(wa > wb, 'source basin holds more');
});
