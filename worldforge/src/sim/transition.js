// Recipe reconfiguration: a deliberate player edit that moves the body's condensed
// inventory toward target volume fractions at a chosen total condensed volume.
// Additions arrive as visible falling streams (pending packets, counted once);
// removals leave through an explicit replacement sink recorded in the ledger.
import { RECIPE_KEYS, SOLID_KEYS, KEY_TO_MAT, MATERIALS } from './materials.js';
import { pour, resolveSolid } from './tools.js';
import { RNG } from './rng.js';

export function makeRecipeJob(body, fractions, totalVolume, opts = {}) {
  let sum = 0;
  for (const k of RECIPE_KEYS) sum += Math.max(0, fractions[k] || 0);
  if (sum <= 0) throw new Error('Recipe is empty');
  const target = {};
  for (const k of RECIPE_KEYS) target[k] = (Math.max(0, fractions[k] || 0) / sum) * totalVolume;
  // a body must keep some solid core
  const solid = SOLID_KEYS.reduce((a, k) => a + target[k], 0);
  if (solid < totalVolume * 0.005) {
    const add = totalVolume * 0.005 - solid;
    target.rock += add;
  }
  const cur = body.condensed();
  let startDelta = 0;
  for (const k of RECIPE_KEYS) startDelta += Math.abs(target[k] - cur[k]);
  return {
    bodyId: body.id,
    target,
    totalVolume,
    startDelta: Math.max(startDelta, 1e-9),
    progress: 0,
    paused: false,
    cancelled: false,
    done: false,
    rate: opts.rate ?? 0.03, // fraction of total volume per surface-second
    removed: Object.fromEntries(RECIPE_KEYS.map((k) => [k, 0])),
    added: Object.fromEntries(RECIPE_KEYS.map((k) => [k, 0])),
    seed: opts.seed ?? 1,
    tick: 0,
  };
}

function removeKey(body, key, vol) {
  const s = body.surface;
  let left = vol;
  const take = (arr) => {
    let total = 0;
    for (let i = 0; i < s.count; i++) total += arr[i];
    if (total <= 0) return 0;
    const f = Math.min(1, left / total);
    for (let i = 0; i < s.count; i++) arr[i] *= 1 - f;
    return total * f;
  };
  let got = 0;
  if (key === 'water') {
    // drain free liquid first (deepest water goes first), then vapour/cloud/soil
    got += take(s.w);
    left = vol - got;
    if (left > 1e-9) { got += take(s.cloud); left = vol - got; }
    if (left > 1e-9) { got += take(s.vap); left = vol - got; }
    if (left > 1e-9) { got += take(s.sw); left = vol - got; }
    body.ledger.sink += got;
  } else if (key === 'ice') {
    got = take(s.ice);
    body.ledger.sink += got;
  } else if (key === 'organic') {
    got = take(s.org);
  } else if (key === 'lava') {
    got = take(s.lava);
  } else if (SOLID_KEYS.includes(key)) {
    got = Math.min(body.inv[key], vol);
    body.inv[key] -= got;
    // convert skins of the removed type to the dominant remaining solid
    if (body.inv[key] < 1e-6) {
      let best = 'rock', bv = -1;
      for (const k of SOLID_KEYS) if (body.inv[k] > bv) { bv = body.inv[k]; best = k; }
      const id = KEY_TO_MAT[key];
      for (let i = 0; i < s.count; i++) if (s.mat[i] === id) s.mat[i] = KEY_TO_MAT[best];
    }
  }
  return got;
}

// Advance the job by dt surface-seconds. Returns true when finished.
export function stepRecipeJob(job, body, dt, time) {
  if (job.done || job.cancelled || job.paused) return job.done;
  const s = body.surface;
  const cur = body.condensed();
  const maxMove = job.rate * job.totalVolume * dt;
  let remaining = 0;
  let solidChanged = false;
  const rng = new RNG((job.seed + job.tick++ * 7919) >>> 0);
  for (const k of RECIPE_KEYS) {
    const delta = job.target[k] - cur[k];
    remaining += Math.abs(delta);
    if (Math.abs(delta) < job.totalVolume * 1e-5) continue;
    const mv = Math.max(-maxMove, Math.min(maxMove, delta));
    if (mv < 0) {
      const got = removeKey(body, k, -mv);
      job.removed[k] += got;
      if (SOLID_KEYS.includes(k)) solidChanged = true;
    } else {
      // additions fall in as several streams spread around the globe
      const streams = 6;
      for (let st = 0; st < streams; st++) {
        const dir = rng.unit();
        const matKey = k === 'ice' ? 'ice' : k;
        pour(body, matKey, dir, 0.35, mv / streams / dt, dt, time, { src: 'transition', height: Math.max(1.5, s.Rs * 0.3) });
      }
      // pour() records water/ice as explicit sources; transition additions are a
      // deliberate edit, so keep them in the source ledger as well.
      job.added[k] += mv;
    }
  }
  if (solidChanged) resolveSolid(body);
  job.progress = Math.max(job.progress, Math.min(1, 1 - remaining / job.startDelta));
  if (remaining < job.totalVolume * 0.0005 * RECIPE_KEYS.length) {
    job.done = true;
    job.progress = 1;
  }
  body.updateCaches();
  return job.done;
}

export function describeRecipe(fr) {
  return RECIPE_KEYS.filter((k) => fr[k] > 0.0005).map((k) => `${(fr[k] * 100).toFixed(1)}% ${MATERIALS[KEY_TO_MAT[k]].name}`).join(', ');
}
