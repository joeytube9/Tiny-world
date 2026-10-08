import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGrid } from '../src/sim/grid.js';

for (const N of [12, 24, 32]) {
  test(`cube-sphere N=${N}: areas sum to 4π and every seam is connected`, () => {
    const g = getGrid(N);
    assert.equal(g.count, 6 * N * N);
    let sum = 0;
    for (let i = 0; i < g.count; i++) sum += g.omega[i];
    assert.ok(Math.abs(sum - 4 * Math.PI) < 1e-6, `solid angle sum ${sum}`);
    // varying cell areas are tracked (equi-angular is not perfectly uniform)
    let mn = Infinity, mx = 0;
    for (let i = 0; i < g.count; i++) { mn = Math.min(mn, g.omega[i]); mx = Math.max(mx, g.omega[i]); }
    assert.ok(mx / mn > 1.05 && mx / mn < 1.6);
    // neighbours: distinct, near, and (almost always) reciprocal
    let nonRecip = 0;
    for (let c = 0; c < g.count; c++) {
      const ns = new Set();
      for (let k = 0; k < 4; k++) {
        const n = g.nbr[c * 4 + k];
        assert.ok(n >= 0 && n < g.count && n !== c);
        ns.add(n);
        assert.ok(g.nbrDist[c * 4 + k] < g.cellAngle * 1.8, 'neighbour too far');
        let back = false;
        for (let q = 0; q < 4; q++) if (g.nbr[n * 4 + q] === c) back = true;
        if (!back) nonRecip++;
      }
      assert.ok(ns.size >= 3);
    }
    assert.ok(nonRecip <= 24, `non-reciprocal links ${nonRecip}`);
    // flood fill reaches every cell (no broken seams)
    const seen = new Uint8Array(g.count);
    const st = [0];
    seen[0] = 1;
    let cnt = 1;
    while (st.length) {
      const c = st.pop();
      for (let k = 0; k < 4; k++) {
        const n = g.nbr[c * 4 + k];
        if (!seen[n]) { seen[n] = 1; cnt++; st.push(n); }
      }
    }
    assert.equal(cnt, g.count);
  });
}
