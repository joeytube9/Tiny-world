// Scene management, camera rig, picking and orbit visualisation.
import * as THREE from 'three';
import { TerrestrialView } from './terrestrialView.js';
import { GasView, StarView } from './otherViews.js';
import { makeSkyMaterial } from './shaders.js';

THREE.ColorManagement.enabled = false;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class GameRenderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.settings = world.settings;
    this.contextLost = false;
    this.createRenderer();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 20000);
    this.camera.position.set(0, 10, 40);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.clipPlanes = [];
    // sky + stars
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), makeSkyMaterial());
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.stars = this.makeStarfield();
    this.scene.add(this.stars);
    // lights
    this.ambient = new THREE.AmbientLight(0x8a9cc8, 0.5);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x9fb8ff, 0x1a1408, 0.22);
    this.scene.add(this.hemi);
    this.sunLight = new THREE.DirectionalLight(0xfff4e6, 2.4);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.views = new Map();
    this.orbitGroup = new THREE.Group();
    this.scene.add(this.orbitGroup);
    this.trails = new Map();
    this.predLine = this.makeLine(0xffd36b, 600, true);
    this.orbitGroup.add(this.predLine);
    this.velArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x7cff9a);
    this.orbitGroup.add(this.velArrow);
    this.cam = { bodyId: null, view: 'planet', yaw: 0.6, pitch: 0.35, dist: 35, anchorLocal: null, pan: new THREE.Vector3(), followSpin: false };
    this.camSmooth = { pos: new THREE.Vector3(0, 10, 40), quat: new THREE.Quaternion(), blend: 1, fromPos: new THREE.Vector3(), fromQuat: new THREE.Quaternion() };
    this.time = 0;
    this.frameStats = { calls: 0, triangles: 0 };
    this.cutaway = false;
    this.predT = 0;
    world.on((type) => { if (type === 'bodies' || type === 'scene') this.syncViews(); });
    this.syncViews();
  }

  createRenderer() {
    const q = this.settings.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q !== 'low', powerPreference: 'high-performance', alpha: false, stencil: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    this.applyPixelRatio();
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; if (this.onContextLost) this.onContextLost(); }, false);
    this.canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; this.rebuildAll(); if (this.onContextRestored) this.onContextRestored(); }, false);
  }

  applyPixelRatio() {
    const q = this.settings.quality;
    const cap = q === 'low' ? 1 : q === 'high' ? 2 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }

  rebuildAll() {
    for (const v of this.views.values()) { this.scene.remove(v.root); v.dispose(); }
    this.views.clear();
    this.syncViews();
  }

  makeStarfield() {
    const N = 2600;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const z = rnd() * 2 - 1, t = rnd() * 6.283, r = Math.sqrt(1 - z * z);
      pos[i * 3] = r * Math.cos(t); pos[i * 3 + 1] = z; pos[i * 3 + 2] = r * Math.sin(t);
      const b = 0.4 + Math.pow(rnd(), 3) * 0.6;
      const tint = rnd();
      col[i * 3] = b * (tint > 0.8 ? 1 : 0.85); col[i * 3 + 1] = b * 0.9; col[i * 3 + 2] = b * (tint < 0.3 ? 1 : 0.85);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, depthTest: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.renderOrder = -9;
    return p;
  }

  makeLine(color, n, dashed = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setDrawRange(0, 0);
    const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5, transparent: true, opacity: 0.85 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
    const l = new THREE.Line(g, m);
    l.frustumCulled = false;
    return l;
  }

  syncViews() {
    const ids = new Set(this.world.bodies.map((b) => b.id));
    for (const [id, v] of this.views) {
      if (!ids.has(id) || v.body !== this.world.getBody(id)) {
        this.scene.remove(v.root);
        v.dispose();
        this.views.delete(id);
        const tr = this.trails.get(id);
        if (tr) { this.orbitGroup.remove(tr); tr.geometry.dispose(); tr.material.dispose(); this.trails.delete(id); }
      }
    }
    for (const b of this.world.bodies) {
      if (this.views.has(b.id)) continue;
      const ctx = { settings: this.settings, clipPlanes: this.clipPlanes, selected: b.id === this.world.selectedId };
      const v = b.type === 'terrestrial' ? new TerrestrialView(b, ctx) : b.type === 'gas' ? new GasView(b, ctx) : new StarView(b, ctx);
      this.views.set(b.id, v);
      this.scene.add(v.root);
    }
    if (this.cam.bodyId === null || !ids.has(this.cam.bodyId)) {
      const sel = this.world.selected;
      if (sel) this.focusBody(sel, 'planet', true);
      else this.setView('system', true);
    }
  }

  // ---------------- camera ----------------
  focusBody(body, view = 'planet', instant = false) {
    this.startBlend(instant);
    this.cam.bodyId = body ? body.id : null;
    this.cam.view = view;
    this.cam.anchorLocal = null;
    this.cam.pan.set(0, 0, 0);
    const R = body ? body.radiusCache * (body.type === 'gas' && body.gas.rings ? body.gas.rings.outer : body.type === 'star' ? 1.6 : 1.12) : 50;
    if (view === 'planet' || view === 'cutaway') { this.cam.dist = this.fitDistance(R); this.cam.pitch = 0.3; }
    this.cutaway = view === 'cutaway';
  }

  setView(view, instant = false) {
    const body = this.world.selected;
    if (view === 'system') {
      this.startBlend(instant);
      this.cam.view = 'system';
      this.cam.bodyId = null;
      this.cam.anchorLocal = null;
      this.cam.pan.set(0, 0, 0);
      this.cam.dist = this.fitDistance(this.systemExtent() * 1.05 + 10) * 0.9;
      this.cam.pitch = 0.85;
      this.cutaway = false;
    } else if (view === 'surface' && body && body.type === 'terrestrial') {
      // anchor at the surface point under the screen centre (or nearest visible point)
      const hit = this.pickSurfaceAt(this.width / 2, this.height / 2, body) || null;
      const v = this.views.get(body.id);
      let dir;
      if (hit) {
        dir = new THREE.Vector3(...hit.dir);
        // prefer a nearby coastline/land point so the close-up shows terrain, water and life
        const s = body.surface;
        const near = s.grid.cellsWithin(dir.x, dir.y, dir.z, 0.45, []);
        let best = -1, bs = -Infinity;
        for (const c of near) {
          const dep = s.head[c] - s.ground[c];
          if (dep > 0.005) continue;
          let wetN = 0;
          for (let k = 0; k < 4; k++) { const nb = s.grid.nbr[c * 4 + k]; if (s.head[nb] - s.ground[nb] > 0.01) wetN++; }
          const dd = s.grid.dir[c * 3] * dir.x + s.grid.dir[c * 3 + 1] * dir.y + s.grid.dir[c * 3 + 2] * dir.z;
          const score = dd * 2 + (wetN > 0 ? 0.6 : 0) + Math.min(0.3, (s.veg[c * 6] + s.veg[c * 6 + 4]) * 0.3);
          if (score > bs) { bs = score; best = c; }
        }
        if (best >= 0) dir.set(s.grid.dir[best * 3], s.grid.dir[best * 3 + 1], s.grid.dir[best * 3 + 2]);
      }
      else {
        const inv = new THREE.Matrix4().copy(v.spinG.matrixWorld).invert();
        dir = this.camera.position.clone().applyMatrix4(inv).normalize();
      }
      this.startBlend(instant);
      this.cam.bodyId = body.id;
      this.cam.view = 'surface';
      this.cam.anchorLocal = dir.multiplyScalar(v.surfaceAt(dir.x, dir.y, dir.z));
      this.cam.dist = Math.max(0.6, body.surface.Rs * 0.12);
      this.cam.pitch = 0.42;
      this.cutaway = false;
    } else if (body) {
      this.focusBody(body, view === 'surface' ? 'planet' : view, instant);
    }
  }

  startBlend(instant) {
    this.camSmooth.fromPos.copy(this.camera.position);
    this.camSmooth.fromQuat.copy(this.camera.quaternion);
    this.camSmooth.blend = instant ? 1 : 0;
  }

  // camera distance so a sphere of radius R fits the narrower screen axis
  fitDistance(R) {
    const v = (this.camera.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(v / 2) * this.camera.aspect);
    const f = Math.min(v, hf);
    return (R / Math.sin(f / 2)) * 1.12;
  }

  systemExtent() {
    const bs = this.world.bodies;
    if (!bs.length) return 60;
    const c = this.barycenter();
    let m = 0;
    for (const b of bs) m = Math.max(m, Math.hypot(b.pos[0] - c[0], b.pos[1] - c[1], b.pos[2] - c[2]) + b.radiusCache);
    return m;
  }

  barycenter() {
    let M = 0;
    const c = [0, 0, 0];
    for (const b of this.world.bodies) { M += b.massCache; for (let k = 0; k < 3; k++) c[k] += b.pos[k] * b.massCache; }
    return M > 0 ? c.map((x) => x / M) : c;
  }

  orbitCamera(dx, dy) {
    this.cam.yaw -= dx * 0.006;
    const minP = this.cam.view === 'surface' ? 0.08 : -1.45;
    this.cam.pitch = Math.max(minP, Math.min(1.5, this.cam.pitch + dy * 0.006));
  }

  zoomCamera(factor) {
    const body = this.world.getBody(this.cam.bodyId);
    let min = 0.3, max = 8000;
    if (this.cam.view === 'surface') { min = 0.12; max = body ? body.radiusCache * 0.9 : 50; }
    else if (body) { min = body.radiusCache * 1.08; max = body.radiusCache * 60; }
    else { min = 20; max = this.systemExtent() * 8 + 500; }
    this.cam.dist = Math.max(min, Math.min(max, this.cam.dist * factor));
    // zooming far out of surface view returns to planet view
    if (this.cam.view === 'surface' && factor > 1 && this.cam.dist >= max * 0.98 && body) this.focusBody(body, 'planet');
  }

  panCamera(dx, dy) {
    const body = this.world.getBody(this.cam.bodyId);
    if (this.cam.view === 'surface' && body) {
      const v = this.views.get(body.id);
      const a = this.cam.anchorLocal.clone();
      const up = a.clone().normalize();
      const { t1, t2 } = basis(up, 0.995);
      const fwd = t1.clone().multiplyScalar(-Math.cos(this.cam.yaw)).addScaledVector(t2, -Math.sin(this.cam.yaw));
      const right = new THREE.Vector3().crossVectors(fwd, up);
      const k = (this.cam.dist / body.radiusCache) * 0.0035;
      const nd = up.addScaledVector(fwd, dy * k).addScaledVector(right, -dx * k).normalize();
      this.cam.anchorLocal = nd.multiplyScalar(v.surfaceAt(nd.x, nd.y, nd.z));
    } else {
      const k = this.cam.dist * 0.0015;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.cam.pan.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      const lim = body ? body.radiusCache * 2 : this.systemExtent();
      if (this.cam.pan.length() > lim) this.cam.pan.setLength(lim);
    }
  }

  updateCamera(dt) {
    const c = this.cam;
    const body = this.world.getBody(c.bodyId);
    let anchor, up;
    if (c.view === 'system' || !body) {
      anchor = new THREE.Vector3(...this.barycenter()).add(c.pan);
      up = new THREE.Vector3(0, 1, 0);
    } else if (c.view === 'surface' && c.anchorLocal) {
      const v = this.views.get(body.id);
      v.root.updateMatrixWorld(true);
      // keep anchor on the (possibly changing) surface
      const d = c.anchorLocal.clone().normalize();
      c.anchorLocal.copy(d).multiplyScalar(v.surfaceAt(d.x, d.y, d.z) + 0.02);
      anchor = c.anchorLocal.clone().applyMatrix4(v.spinG.matrixWorld);
      // tangent frame in the body's local frame (north-referenced, rotates with the planet)
      const upL = d.clone();
      const bl = basis(upL, 0.995);
      const rot = new THREE.Matrix4().extractRotation(v.spinG.matrixWorld);
      up = upL.applyMatrix4(rot).normalize();
      this._surfBasis = { t1: bl.t1.applyMatrix4(rot).normalize(), t2: bl.t2.applyMatrix4(rot).normalize() };
    } else {
      anchor = new THREE.Vector3(...body.pos).add(c.pan);
      up = new THREE.Vector3(0, 1, 0);
    }
    const { t1, t2 } = c.view === 'surface' && this._surfBasis && c.anchorLocal ? this._surfBasis : basis(up);
    let yaw = c.yaw;
    if (c.followSpin && body && c.view !== 'surface') yaw += body.spinAngle;
    const off = t1.multiplyScalar(Math.cos(c.pitch) * Math.cos(yaw)).addScaledVector(t2, Math.cos(c.pitch) * Math.sin(yaw)).addScaledVector(up, Math.sin(c.pitch));
    const pos = anchor.clone().addScaledVector(off, c.dist);
    // never put the camera inside the surface
    if (body && body.type === 'terrestrial' && c.view === 'surface') {
      const v = this.views.get(body.id);
      const inv = new THREE.Matrix4().copy(v.spinG.matrixWorld).invert();
      const pl = pos.clone().applyMatrix4(inv);
      const l = pl.length();
      const minR = v.surfaceAt(pl.x / l, pl.y / l, pl.z / l) + 0.08;
      if (l < minR) { pl.setLength(minR); pos.copy(pl.applyMatrix4(v.spinG.matrixWorld)); }
    }
    const m = new THREE.Matrix4().lookAt(pos, anchor, up);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const s = this.camSmooth;
    if (s.blend < 1) {
      s.blend = Math.min(1, s.blend + dt / (this.settings.reducedMotion ? 0.25 : 0.9));
      const e = ease(s.blend);
      this.camera.position.lerpVectors(s.fromPos, pos, e);
      this.camera.quaternion.slerpQuaternions(s.fromQuat, q, e);
    } else {
      this.camera.position.copy(pos);
      this.camera.quaternion.copy(q);
    }
    this.camera.up.copy(up);
    // near/far from distance to nearest surface
    let dSurf = Infinity;
    for (const b of this.world.bodies) {
      const d = Math.hypot(this.camera.position.x - b.pos[0], this.camera.position.y - b.pos[1], this.camera.position.z - b.pos[2]) - b.radiusCache * 1.02;
      dSurf = Math.min(dSurf, d);
    }
    if (!isFinite(dSurf)) dSurf = 100;
    const near = Math.max(0.01, Math.min(20, dSurf * 0.25));
    const far = Math.max(near * 2000, (this.systemExtent() + this.camera.position.length()) * 2.5);
    this.camera.near = near;
    this.camera.far = Math.min(far, near * 400000);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.camDist = body ? this.camera.position.distanceTo(new THREE.Vector3(...body.pos)) : 1e9;
  }

  // ---------------- picking ----------------
  ray(x, y) {
    const ndc = new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    return rc.ray;
  }

  // Returns nearest body along the ray (sphere test).
  bodiesAlong(ray) {
    const out = [];
    for (const b of this.world.bodies) {
      const c = new THREE.Vector3(...b.pos);
      const R = b.type === 'gas' && b.gas.rings ? b.radiusCache : b.radiusCache * 1.02;
      const oc = ray.origin.clone().sub(c);
      const bb = oc.dot(ray.direction);
      const cc = oc.lengthSq() - R * R;
      const disc = bb * bb - cc;
      if (disc < 0) continue;
      const t = -bb - Math.sqrt(disc);
      if (t > 0 || cc < 0) out.push({ body: b, t: Math.max(0, t) });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  pickSurfaceAt(x, y, body) {
    const ray = this.ray(x, y);
    const v = this.views.get(body.id);
    if (!v || v.kind !== 'terrestrial') return null;
    v.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(v.spinG.matrixWorld).invert();
    const o = ray.origin.clone().applyMatrix4(inv);
    const d = ray.direction.clone().transformDirection(inv);
    const s = body.surface;
    let rMax = 0;
    for (let i = 0; i < s.count; i++) rMax = Math.max(rMax, s.head[i]);
    rMax += 0.1;
    const bb = o.dot(d), cc = o.lengthSq() - rMax * rMax, disc = bb * bb - cc;
    if (disc < 0) return null;
    let t0 = Math.max(0, -bb - Math.sqrt(disc));
    const t1 = -bb + Math.sqrt(disc);
    const steps = 220;
    const dt = (t1 - t0) / steps;
    const p = new THREE.Vector3();
    let prev = t0, hitT = -1;
    for (let k = 0; k <= steps; k++) {
      const t = t0 + dt * k;
      p.copy(o).addScaledVector(d, t);
      const r = p.length();
      if (r <= v.surfaceAt(p.x / r, p.y / r, p.z / r)) { hitT = t; break; }
      prev = t;
    }
    if (hitT < 0) return null;
    let a = prev, c2 = hitT;
    for (let k = 0; k < 10; k++) {
      const m = (a + c2) / 2;
      p.copy(o).addScaledVector(d, m);
      const r = p.length();
      if (r <= v.surfaceAt(p.x / r, p.y / r, p.z / r)) c2 = m; else a = m;
    }
    p.copy(o).addScaledVector(d, c2);
    const dir = p.clone().normalize();
    const world = p.clone().applyMatrix4(v.spinG.matrixWorld);
    return { bodyId: body.id, dir: [dir.x, dir.y, dir.z], local: p.toArray(), world, t: world.distanceTo(ray.origin), cell: s.grid.cellOf(dir.x, dir.y, dir.z) };
  }

  // General pick: agent > surface/body > space.
  pick(x, y, opts = {}) {
    const sel = this.world.selected;
    if (opts.agents !== false && sel) {
      const v = this.views.get(sel.id);
      if (v && v.life && v.life.group.visible) {
        let best = null, bd = 26 * 26;
        const p = new THREE.Vector3();
        for (const va of v.life.visibleAgents) {
          p.set(...va.pos).applyMatrix4(v.spinG.matrixWorld).project(this.camera);
          if (p.z > 1) continue;
          const sx = (p.x * 0.5 + 0.5) * this.width, sy = (-p.y * 0.5 + 0.5) * this.height;
          const d2 = (sx - x) ** 2 + (sy - y) ** 2;
          if (d2 < bd) { bd = d2; best = va.agent; }
        }
        if (best) return { type: 'agent', agent: best, body: sel };
      }
    }
    const ray = this.ray(x, y);
    const along = this.bodiesAlong(ray);
    if (along.length) {
      const first = along[0].body;
      if (first.type === 'terrestrial') {
        const hit = this.pickSurfaceAt(x, y, first);
        if (hit) {
          // occlusion: another body's sphere in front of the surface point?
          const blocker = along.find((a) => a.body !== first && a.t < hit.t);
          return { type: 'surface', body: first, hit, blocked: !!blocker };
        }
      }
      const c = new THREE.Vector3(...first.pos);
      const wp = ray.origin.clone().addScaledVector(ray.direction, along[0].t);
      const v = this.views.get(first.id);
      v.root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(v.spinG.matrixWorld).invert();
      const dir = wp.clone().applyMatrix4(inv).normalize();
      return { type: 'body', body: first, hit: { bodyId: first.id, dir: [dir.x, dir.y, dir.z], world: wp, t: along[0].t }, center: c };
    }
    // small bodies: accept taps within a comfortable screen radius (≥ 24 px)
    if (opts.loose !== false) {
      let best = null, bd = Infinity;
      const f = this.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
      for (const b of this.world.bodies) {
        const c = new THREE.Vector3(...b.pos);
        const pr = this.project(c);
        if (!pr.visible) continue;
        const pixR = (b.radiusCache / Math.max(1e-3, c.distanceTo(this.camera.position))) * f;
        const d = Math.hypot(pr.x - x, pr.y - y);
        if (d < Math.max(24, pixR * 1.2) && d < bd) { bd = d; best = b; }
      }
      if (best) return { type: 'body', body: best, hit: null, loose: true };
    }
    // space: intersect the ecliptic plane through the focus point
    const focusY = sel ? sel.pos[1] : 0;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -focusY);
    const pt = new THREE.Vector3();
    const ok = ray.intersectPlane(plane, pt);
    return { type: 'space', point: ok ? pt : null };
  }

  project(worldPos) {
    const p = worldPos.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height, visible: p.z < 1 && p.z > -1 };
  }

  // ---------------- per-frame ----------------
  resize(w, h) {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render(dt, events) {
    if (this.contextLost) return;
    this.time += dt;
    const world = this.world;
    const sel = world.selected;
    for (const v of this.views.values()) v.ctx && (v.ctx.selected = v.body === sel);
    this.updateCamera(dt);
    // cutaway clip plane: remove the hemisphere facing the camera
    if (this.cutaway && sel) {
      const c = new THREE.Vector3(...sel.pos);
      const n = c.clone().sub(this.camera.position).normalize();
      this.clipPlane.setFromNormalAndCoplanarPoint(n, c);
      if (!this.clipPlanes.length) this.clipPlanes.push(this.clipPlane);
    } else this.clipPlanes.length = 0;
    // sun light: brightest star or virtual sun
    const stars = world.stars();
    this.sunLight.visible = stars.length === 0;
    if (!stars.length && world.virtualSun) {
      const d = world.virtualSun.dir;
      const f = sel ? sel.pos : [0, 0, 0];
      this.sunLight.position.set(f[0] + d[0] * 1000, f[1] + d[1] * 1000, f[2] + d[2] * 1000);
      this.sunLight.target.position.set(f[0], f[1], f[2]);
      this.sunLight.intensity = 2.4 * Math.min(1.6, Math.pow(world.virtualSun.flux, 0.35));
    }
    const pointScale = this.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    for (const v of this.views.values()) {
      const env = world.starEnv(v.body);
      const sunWorld = new THREE.Vector3(...env.sunDirWorld);
      v.update({
        dt, time: this.time, surfaceTime: world.time.surface, sunWorld, camera: this.camera, settings: this.settings,
        selected: v.body === sel, camDist: this.camera.position.distanceTo(new THREE.Vector3(...v.body.pos)),
        events, cutaway: this.cutaway, pointScale, unlocks: world.unlocks,
      });
    }
    this.updateOrbitVisuals(dt);
    // sky/stars follow camera
    const far = this.camera.far * 0.9;
    this.sky.position.copy(this.camera.position);
    this.sky.scale.setScalar(far);
    this.stars.position.copy(this.camera.position);
    this.stars.scale.setScalar(far * 0.95);
    this.renderer.render(this.scene, this.camera);
    this.frameStats.calls = this.renderer.info.render.calls;
    this.frameStats.triangles = this.renderer.info.render.triangles;
  }

  updateOrbitVisuals(dt) {
    const world = this.world;
    const st = this.settings;
    const sel = world.selected;
    // trails relative to their parent's current position
    for (const b of world.bodies) {
      let line = this.trails.get(b.id);
      if (!line) { line = this.makeLine(b.type === 'star' ? 0xffcc66 : 0x6fb8ff, 240); this.trails.set(b.id, line); this.orbitGroup.add(line); }
      line.visible = st.showTrails && !!b.trail && b.trail.length > 1;
      if (!line.visible) continue;
      const parent = world.getBody(b.trailParent);
      const base = parent ? parent.pos : [0, 0, 0];
      const arr = line.geometry.attributes.position.array;
      const n = Math.min(240, b.trail.length);
      for (let k = 0; k < n; k++) {
        const p = b.trail[b.trail.length - n + k];
        arr[k * 3] = p[0] + base[0]; arr[k * 3 + 1] = p[1] + base[1]; arr[k * 3 + 2] = p[2] + base[2];
      }
      line.geometry.setDrawRange(0, n);
      line.geometry.attributes.position.needsUpdate = true;
      line.material.opacity = b === sel ? 0.8 : 0.4;
      line.material.color.set(world.unlocks.includes('Gilded orbit trails') ? 0xffd75e : b === sel ? 0x8fd0ff : 0x5d8fc4);
    }
    // predicted path of the selected body
    this.predT -= dt;
    if (sel && st.showPredict && this.predT <= 0) {
      this.predT = 0.6;
      this.pred = world.predict(sel, 300);
      this.predParent = sel.parentId;
    }
    const line = this.predLine;
    line.visible = !!(sel && st.showPredict && this.pred && this.pred.length);
    if (line.visible) {
      const parent = world.getBody(this.predParent);
      const base = parent ? parent.pos : [0, 0, 0];
      const arr = line.geometry.attributes.position.array;
      let n = 0;
      for (const p of this.pred) {
        if (!p || n >= 600) break;
        arr[n * 3] = p[0] + base[0]; arr[n * 3 + 1] = p[1] + base[1]; arr[n * 3 + 2] = p[2] + base[2];
        n++;
      }
      line.geometry.setDrawRange(0, n);
      line.geometry.attributes.position.needsUpdate = true;
      line.computeLineDistances();
      const scale = Math.max(1, (parent ? parent.radiusCache : 10) * 0.3);
      line.material.dashSize = scale; line.material.gapSize = scale * 0.7;
    }
    // velocity vector relative to parent
    this.velArrow.visible = !!(sel && st.showVectors);
    if (this.velArrow.visible) {
      const parent = world.getBody(sel.parentId);
      const rv = new THREE.Vector3(sel.vel[0] - (parent ? parent.vel[0] : 0), sel.vel[1] - (parent ? parent.vel[1] : 0), sel.vel[2] - (parent ? parent.vel[2] : 0));
      const len = rv.length();
      if (len > 1e-6) {
        this.velArrow.position.set(...sel.pos);
        this.velArrow.setDirection(rv.clone().normalize());
        const L = sel.radiusCache * 1.5 + len * 4;
        this.velArrow.setLength(L, L * 0.2, L * 0.1);
      }
    }
  }

  setSelected() {
    for (const v of this.views.values()) if (v.ctx) v.ctx.selected = v.body === this.world.selected;
  }

  brushPreview(hit, radiusAng, color, blocked) {
    for (const v of this.views.values()) if (v.kind === 'terrestrial') v.showBrush(hit && hit.bodyId === v.body.id ? hit : null, radiusAng, color, blocked);
  }

  statsAll() {
    let particles = 0, plants = 0, animals = 0;
    for (const v of this.views.values()) {
      const s = v.stats();
      particles += s.particles; plants += s.plants; animals += s.animals;
    }
    return { particles, plants, animals, ...this.frameStats };
  }
}

export function basis(up, thr = 0.9) {
  const ref = Math.abs(up.y) < thr ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t1 = ref.clone().addScaledVector(up, -ref.dot(up)).normalize();
  const t2 = new THREE.Vector3().crossVectors(up, t1).normalize();
  return { t1, t2 };
}
