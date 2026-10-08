// Terraforming goals measured from the actual simulation state.
import { orbitalElements } from './orbits.js';

export const GOALS = [
  { id: 'water', name: 'Establish liquid water', desc: 'Ocean/lake coverage ≥ 8% of the surface.', reward: 'Aqua atmosphere tint', hold: 10 },
  { id: 'land', name: 'Preserve exposed land', desc: 'Keep ≥ 25% of the surface above water while water exists.', reward: 'Shoreline foam style', hold: 10 },
  { id: 'climate', name: 'Stabilize climate', desc: 'Mean temperature between 0°C and 30°C for 60 s.', reward: 'Aurora rim glow', hold: 60 },
  { id: 'veg', name: 'Grow vegetation', desc: 'Vegetation covers ≥ 10% of the surface.', reward: 'Golden forest palette', hold: 10 },
  { id: 'animals', name: 'Sustain animals', desc: '≥ 12 living animals for 60 s.', reward: 'Herd trail badge', hold: 60 },
  { id: 'storm', name: 'Survive a storm', desc: 'A tornado or hurricane passes and animals still live.', reward: 'Storm-chaser cloud style', hold: 0 },
  { id: 'moon', name: 'Create a stable moon orbit', desc: 'A moon stays bound to this planet for 2 full orbits.', reward: 'Gilded orbit trails', hold: 0 },
];

export function newGoalState() {
  return Object.fromEntries(GOALS.map((g) => [g.id, { done: false, held: 0, progress: 0 }]));
}

// Called ~1 Hz with surface dt. Returns newly completed goal ids.
export function evaluateGoals(world, body, dt) {
  if (!body || !body.surface) return [];
  const st = world.goals;
  const done = [];
  const s = body.surface;
  const stats = s.stats();
  const animals = body.agents.length;
  const check = (id, cond, progress) => {
    const g = st[id];
    const def = GOALS.find((x) => x.id === id);
    if (g.done) return;
    g.progress = Math.max(0, Math.min(1, progress));
    if (cond) g.held += dt;
    else g.held = 0;
    if (cond && g.held >= def.hold) {
      g.done = true;
      g.progress = 1;
      done.push(id);
    }
  };
  check('water', stats.oceanCoverage >= 0.08, stats.oceanCoverage / 0.08);
  check('land', stats.oceanCoverage > 0.02 && stats.landFraction >= 0.25, stats.oceanCoverage > 0.02 ? stats.landFraction / 0.25 : 0);
  check('climate', stats.meanTemp >= 0 && stats.meanTemp <= 30, stats.meanTemp < 0 ? 1 - Math.min(1, -stats.meanTemp / 60) : stats.meanTemp > 30 ? 1 - Math.min(1, (stats.meanTemp - 30) / 60) : 1);
  check('veg', stats.vegCoverage >= 0.1, stats.vegCoverage / 0.1);
  check('animals', animals >= 12, animals / 12);
  // storm survival: a destructive storm ended recently and animals remain
  const hadStorm = body.events.some((e) => /Tornado|Hurricane/.test(e.text) && /dissipated/.test(e.text));
  check('storm', hadStorm && animals > 0, hadStorm ? 1 : body.storms.some((x) => x.type === 'tornado' || x.type === 'hurricane') ? 0.5 : 0);
  // moon: count accumulated orbital angle of bound moons
  let best = 0;
  for (const m of world.bodies) {
    if (m === body || m.parentId !== body.id) continue;
    const el = orbitalElements(m, body);
    if (!el.bound || el.periapsis < body.radiusCache + m.radiusCache) { m._orbitAngle = 0; continue; }
    const ang = Math.atan2(m.pos[2] - body.pos[2], m.pos[0] - body.pos[0]);
    if (m._lastAng !== undefined) {
      let d = ang - m._lastAng;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      m._orbitAngle = (m._orbitAngle || 0) + Math.abs(d);
    }
    m._lastAng = ang;
    best = Math.max(best, (m._orbitAngle || 0) / (4 * Math.PI));
  }
  check('moon', best >= 1, best);
  return done;
}
