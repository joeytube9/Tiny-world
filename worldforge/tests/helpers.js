import { World } from '../src/sim/world.js';
import { Body, buildTerrestrial } from '../src/sim/body.js';

export function rockyWorld({ N = 24, radius = 8, recipe = { rock: 0.8, granite: 0.1, iron: 0.1 }, gen = { continents: 0.5, mountains: 0.6, relief: 0.05 }, atmosphere = 1, tempBias = 0, seed = 99 } = {}) {
  const w = new World({ autoWeather: false });
  w.virtualSun = { dir: [1, 0, 0], flux: 1 };
  const b = new Body({ name: 'Test', seed, atmosphere, tempBias, pos: [0, 0, 0] });
  buildTerrestrial(b, { radius, recipe, N, gen, temp0: 15 });
  w.addBody(b);
  w.selectedId = b.id;
  return { w, b, s: b.surface };
}

export function dirOf(s, c) {
  return [s.grid.dir[c * 3], s.grid.dir[c * 3 + 1], s.grid.dir[c * 3 + 2]];
}

export function angle(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}

export function runSurface(w, seconds, dt = 0.1) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) w.stepSurface(dt, true);
}
