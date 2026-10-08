import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { rockyWorld, dirOf, runSurface } from './helpers.js';
import { pour } from '../src/sim/tools.js';
import { MAT } from '../src/sim/materials.js';

test('scenario 6: accelerated experiment carves a persistent channel with downstream sediment within ~1 minute of play', (t) => {
  const w = new World({ autoWeather: false });
  w.loadScene('floodLab');
  const b = w.selected;
  const s = b.surface;
  w.startErosionExperiment(b);
  // one minute of real play at the experiment's 8x surface speed and 60 fps
  const series = [];
  for (let i = 0; i < 3600; i++) {
    w.step(1 / 60);
    if (i % 600 === 599) { let c = 0; for (let j = 0; j < s.count; j++) c = Math.max(c, s.baseE[j] - (s.bed[j] + s.sed[j])); series.push(c.toFixed(3)); }
  }
  t.diagnostic(`max incision every 10 s of real time: ${series.join(', ')}`);
  let maxCut = 0, eroded = 0, deposited = 0, depCells = 0;
  for (let i = 0; i < s.count; i++) {
    const dE = s.bed[i] + s.sed[i] - s.baseE[i];
    if (dE < 0) { eroded -= dE; maxCut = Math.max(maxCut, -dE); }
    if (dE > 0.0005) { deposited += dE; depCells++; }
  }
  const cons = w.conservation(b);
  t.diagnostic(`surface time ${w.time.surface.toFixed(0)} s; max channel depth ${maxCut.toFixed(4)} u; cells with deposits ${depCells}; solid conservation error ${cons.solidError.toExponential(2)}`);
  assert.ok(maxCut > 0.02, 'visible channel incised');
  assert.ok(depCells > 5, 'sediment deposited downstream');
  assert.ok(cons.solidError < 1e-4, 'erosion moves material, does not delete terrain');
  // persistence: stop the spring, let water drain — the channel remains
  w.experiment = null;
  w.settings.erosion = 1;
  runSurface(w, 60, 0.25);
  let cut2 = 0;
  for (let i = 0; i < s.count; i++) cut2 = Math.max(cut2, s.baseE[i] - (s.bed[i] + s.sed[i]));
  assert.ok(cut2 > maxCut * 0.7, 'channel persists after the flow stops');
});

test('harder rock erodes less than loose soil under the same conditions', (t) => {
  const depth = {};
  for (const [label, mat] of [['granite', MAT.GRANITE], ['soil', MAT.SOIL], ['sand', MAT.SAND]]) {
    const { w, b, s } = rockyWorld({ N: 20, seed: 42, gen: { continents: 0.4, mountains: 0.9, relief: 0.06 } });
    b.atmosphere = 0;
    w.settings.erosion = 5;
    for (let i = 0; i < s.count; i++) { s.mat[i] = mat; s.baseE[i] = s.bed[i] + s.sed[i]; }
    let hi = 0;
    for (let i = 0; i < s.count; i++) if (s.bed[i] > s.bed[hi]) hi = i;
    const d = dirOf(s, hi);
    for (let k = 0; k < 400; k++) { pour(b, 'water', d, 0.05, 3, 0.25, w.time.surface); runSurface(w, 0.25, 0.25); }
    let cut = 0, total = 0;
    for (let i = 0; i < s.count; i++) { const x = s.baseE[i] - (s.bed[i] + s.sed[i]); cut = Math.max(cut, x); if (x > 0) total += x; }
    depth[label] = { cut, total };
  }
  t.diagnostic(`max incision: granite ${depth.granite.cut.toFixed(4)}, soil ${depth.soil.cut.toFixed(4)}, sand ${depth.sand.cut.toFixed(4)}`);
  assert.ok(depth.soil.cut > depth.granite.cut * 3, 'soil channels much deeper than granite');
  assert.ok(depth.sand.total > depth.granite.total * 3, 'sand erodes more than granite');
});

test('normal settings stay gradual', () => {
  const w = new World({ autoWeather: false });
  w.loadScene('floodLab');
  const b = w.selected;
  const s = b.surface;
  const base = Float32Array.from(s.bed);
  let hi = 0;
  for (let i = 0; i < s.count; i++) if (s.bed[i] > s.bed[hi]) hi = i;
  for (let k = 0; k < 240; k++) { pour(b, 'water', dirOf(s, hi), 0.06, 2, 0.25, w.time.surface); runSurface(w, 0.25, 0.25); }
  let cut = 0;
  for (let i = 0; i < s.count; i++) cut = Math.max(cut, base[i] - s.bed[i]);
  assert.ok(cut < 0.01, `bedrock incision stays gradual at erosion ×1 (${cut})`);
});
