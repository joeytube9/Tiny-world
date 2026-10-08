// Bounded undo/redo of discrete player edits using body snapshots.
// Semantics: undo restores the edited body (terrain, water, inventories, life,
// storms) to the moment before the edit, including any natural change on that
// body since then; other bodies and the orbital positions keep running.
// Body creation/deletion and orbit edits restore the system's body list or
// velocities captured before the edit.
import { serializeBody, deserializeBody } from './sim/save.js';

export class UndoStack {
  constructor(world, limit = 12) {
    this.world = world;
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  capture(kind, label, bodyId) {
    const w = this.world;
    if (kind === 'body') {
      const b = w.getBody(bodyId);
      if (!b) return null;
      return { kind, label, bodyId, snap: serializeBody(b) };
    }
    if (kind === 'system') {
      return { kind, label, snaps: w.bodies.map(serializeBody), selectedId: w.selectedId };
    }
    if (kind === 'orbit') {
      return { kind, label, states: w.bodies.map((b) => ({ id: b.id, pos: b.pos.slice(), vel: b.vel.slice(), parentId: b.parentId })) };
    }
    return null;
  }

  push(kind, label, bodyId) {
    const e = this.capture(kind, label, bodyId);
    if (!e) return;
    this.undoStack.push(e);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  apply(entry) {
    const w = this.world;
    const inverse = entry.kind === 'body' ? this.capture('body', entry.label, entry.bodyId) : this.capture(entry.kind, entry.label);
    if (entry.kind === 'body') {
      const cur = w.getBody(entry.bodyId);
      if (!cur) return null;
      const b = deserializeBody(entry.snap, { popCap: w.settings.popCap });
      b.pos = cur.pos.slice();
      b.vel = cur.vel.slice();
      b.spinAngle = cur.spinAngle;
      b.trail = cur.trail;
      b.clock = {};
      const i = w.bodies.indexOf(cur);
      w.bodies[i] = b;
      w.jobs = w.jobs.filter((j) => j.bodyId !== b.id);
      w.emit('bodies');
    } else if (entry.kind === 'system') {
      for (const b of w.bodies) w.emit('bodies', { removed: b });
      w.bodies = entry.snaps.map((s) => {
        const b = deserializeBody(s, { popCap: w.settings.popCap });
        b.clock = {};
        return b;
      });
      w.selectedId = w.getBody(entry.selectedId) ? entry.selectedId : w.bodies[0]?.id ?? null;
      w.jobs = w.jobs.filter((j) => w.getBody(j.bodyId));
      w.emit('bodies');
    } else if (entry.kind === 'orbit') {
      for (const s of entry.states) {
        const b = w.getBody(s.id);
        if (b) { b.pos = s.pos.slice(); b.vel = s.vel.slice(); b.parentId = s.parentId; b.trail = []; }
      }
    }
    return inverse;
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return null;
    const inv = this.apply(e);
    if (inv) this.redoStack.push(inv);
    return e.label;
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return null;
    const inv = this.apply(e);
    if (inv) this.undoStack.push(inv);
    return e.label;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
