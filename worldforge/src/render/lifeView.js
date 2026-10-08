// Instanced rendering of vegetation (from cell coverage) and animal agents,
// placed in the body's spinning local frame so they ride with the planet.
import * as THREE from 'three';
import { buildAnimalGeometry, buildPlantGeometry, makeAnimatedMaterial } from './models.js';
import { PLANTS } from '../sim/surface.js';
import { PLANT_TYPES, SPECIES } from '../sim/life.js';

const SLOTS = [3, 2, 2, 2, 2, 2];
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3();

function hash(i) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class LifeView {
  constructor(view, budget) {
    this.view = view;
    this.body = view.body;
    this.group = new THREE.Group();
    this.shared = { uTime: { value: 0 }, uWind: { value: 0.3 } };
    this.material = makeAnimatedMaterial(this.shared);
    this.material.clippingPlanes = view.clip;
    this.plantBudget = budget.plants;
    this.animalCap = budget.animals;
    this.plants = PLANT_TYPES.map((pt) => {
      const geo = buildPlantGeometry(pt.key);
      const cap = Math.ceil(this.plantBudget * (pt.key === 'grass' ? 0.3 : 0.14));
      const mesh = new THREE.InstancedMesh(geo, this.material, cap);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.geometry.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2));
      this.group.add(mesh);
      return { mesh, cap };
    });
    this.animals = SPECIES.map((sp) => {
      const geo = buildAnimalGeometry(sp.key);
      const cap = this.animalCap;
      const mesh = new THREE.InstancedMesh(geo, this.material, cap);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.geometry.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2));
      this.group.add(mesh);
      return { mesh, cap };
    });
    this.plantTimer = 0;
    this.lastCamKey = '';
    this.visibleAgents = [];
  }

  dispose() {
    for (const p of this.plants) { p.mesh.geometry.dispose(); p.mesh.dispose(); }
    for (const a of this.animals) { a.mesh.geometry.dispose(); a.mesh.dispose(); }
    this.material.dispose();
  }

  // camLocal: camera position in body-local coords; scale: model scale (units)
  update(dt, time, camLocal, camDist, visible) {
    this.group.visible = visible;
    if (!visible) return;
    this.shared.uTime.value = time;
    const s = this.body.surface;
    const R = s.Rs;
    const base = 0.075 * Math.pow(R / 10, 0.6) * 1.0;
    // LOD: tiny when far, readable when close; distant aggregates stay visible as markers
    const surfDist = Math.max(0.05, camDist - R);
    const farBoost = Math.min(3.5, Math.max(1, Math.sqrt(surfDist / (R * 0.15))));
    this.plantTimer -= dt;
    const camKey = Math.round(camLocal.x * 2) + ',' + Math.round(camLocal.y * 2) + ',' + Math.round(camLocal.z * 2);
    if (this.plantTimer <= 0 || (camKey !== this.lastCamKey && this.plantTimer < 0.7)) {
      this.plantTimer = 1.2;
      this.lastCamKey = camKey;
      this.updatePlants(camLocal, base * Math.min(2.2, farBoost));
    }
    this.updateAnimals(dt, time, base * farBoost * 0.9);
  }

  updatePlants(camLocal, scale) {
    const s = this.body.surface;
    const g = s.grid;
    const view = this.view;
    const cl = camLocal.length() || 1;
    const cx = camLocal.x / cl, cy = camLocal.y / cl, cz = camLocal.z / cl;
    // candidate cells facing the camera, nearest first
    const cand = [];
    for (let i = 0; i < s.count; i++) {
      const d = g.dir[i * 3] * cx + g.dir[i * 3 + 1] * cy + g.dir[i * 3 + 2] * cz;
      if (d < 0.05) continue;
      let v = 0;
      for (let p = 0; p < PLANTS; p++) v += s.veg[i * PLANTS + p];
      if (v < 0.06) continue;
      cand.push(i, d);
    }
    const order = [];
    for (let k = 0; k < cand.length; k += 2) order.push(k);
    order.sort((a, b) => cand[b + 1] - cand[a + 1]);
    const counts = this.plants.map(() => 0);
    const cw = g.cellAngle;
    for (const k of order) {
      const i = cand[k];
      for (let p = 0; p < PLANTS; p++) {
        const v = s.veg[i * PLANTS + p];
        if (v < 0.05) continue;
        const P = this.plants[p];
        const n = Math.min(SLOTS[p], Math.ceil(v * SLOTS[p] * 1.2));
        for (let q = 0; q < n && counts[p] < P.cap; q++) {
          const hseed = i * 31 + p * 7 + q;
          const ja = (hash(hseed) - 0.5) * cw * 0.95, jb = (hash(hseed + 999) - 0.5) * cw * 0.95;
          const ex = g.east[i * 3], ey = g.east[i * 3 + 1], ez = g.east[i * 3 + 2];
          const nx = g.north[i * 3], ny = g.north[i * 3 + 1], nz = g.north[i * 3 + 2];
          _y.set(g.dir[i * 3] + ex * ja + nx * jb, g.dir[i * 3 + 1] + ey * ja + ny * jb, g.dir[i * 3 + 2] + ez * ja + nz * jb).normalize();
          const r = view.groundAt(_y.x, _y.y, _y.z);
          const wr = view.waterAt(_y.x, _y.y, _y.z);
          if (wr - r > 0.004) continue; // submerged
          const sc = scale * (0.6 + 0.6 * Math.min(1, v)) * (0.8 + hash(hseed + 5) * 0.4) * (p === 3 || p === 4 ? 1.6 : p === 0 ? 0.9 : 1);
          this.writeMatrix(P.mesh, counts[p], _y, r - sc * 0.03, hash(hseed + 3) * 6.28, sc, null);
          P.mesh.geometry.attributes.iAnim.setXY(counts[p], hseed % 100, 1);
          counts[p]++;
        }
      }
    }
    this.plants.forEach((P, p) => {
      P.mesh.count = counts[p];
      P.mesh.instanceMatrix.needsUpdate = true;
      P.mesh.geometry.attributes.iAnim.needsUpdate = true;
    });
    this.plantCount = counts.reduce((a, b) => a + b, 0);
  }

  writeMatrix(mesh, idx, up, radius, yaw, scale, heading) {
    _y.copy(up);
    if (heading) {
      _z.set(heading[0], heading[1], heading[2]);
    } else {
      _z.set(0, 1, 0);
      if (Math.abs(up.y) > 0.95) _z.set(1, 0, 0);
      _z.cross(_y).normalize();
      // yaw rotate around up
      _x.crossVectors(_y, _z);
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      _z.multiplyScalar(c).addScaledVector(_x, sn);
    }
    _z.addScaledVector(_y, -_z.dot(_y)).normalize();
    _x.crossVectors(_y, _z).normalize();
    _p.copy(up).multiplyScalar(radius);
    _m.set(
      _x.x * scale, _y.x * scale, _z.x * scale, _p.x,
      _x.y * scale, _y.y * scale, _z.y * scale, _p.y,
      _x.z * scale, _y.z * scale, _z.z * scale, _p.z,
      0, 0, 0, 1,
    );
    mesh.setMatrixAt(idx, _m);
  }

  updateAnimals(dt, time, scale) {
    const agents = this.body.agents;
    const counts = this.animals.map(() => 0);
    const k = 1 - Math.exp(-dt * 6);
    this.visibleAgents.length = 0;
    for (const a of agents) {
      const A = this.animals[a.sp];
      if (counts[a.sp] >= A.cap) continue;
      if (!a._d) { a._d = a.p.slice(); a._h = a.h.slice(); }
      for (let q = 0; q < 3; q++) { a._d[q] += (a.p[q] - a._d[q]) * k; a._h[q] += (a.h[q] - a._h[q]) * k; }
      _y.set(a._d[0], a._d[1], a._d[2]).normalize();
      const S = SPECIES[a.sp];
      let r = this.view.groundAt(_y.x, _y.y, _y.z);
      const wr = this.view.waterAt(_y.x, _y.y, _y.z);
      let sc = scale * S.size;
      if (S.habitat === 'air') {
        r = Math.max(r, wr) + (0.25 + a.alt) * scale * 4 + Math.sin(time * 0.8 + a.phase) * scale * 0.5;
      } else if (S.habitat === 'water') {
        r = Math.max(r + sc * 0.3, wr - Math.min(0.05, Math.max(0.012, (wr - r) * 0.4)));
      } else if (S.key === 'insect') {
        r = Math.max(r, wr) + scale * (0.6 + 0.3 * Math.sin(time * 3 + a.phase));
        sc *= 1.6;
      } else {
        r = Math.max(r, wr - sc * 0.4);
      }
      const moving = a.state === 'resting' || a.state === 'grazing' || a.state === 'eating' ? 0.0 : a.state === 'fleeing' || a.state === 'hunting' ? 1.0 : 0.6;
      this.writeMatrix(A.mesh, counts[a.sp], _y, r, 0, sc, a._h);
      A.mesh.geometry.attributes.iAnim.setXY(counts[a.sp], a.phase, S.habitat === 'air' || S.key === 'insect' ? 1 : moving);
      this.visibleAgents.push({ agent: a, pos: [_y.x * r, _y.y * r, _y.z * r] });
      counts[a.sp]++;
    }
    this.animals.forEach((A, i) => {
      A.mesh.count = counts[i];
      A.mesh.instanceMatrix.needsUpdate = true;
      A.mesh.geometry.attributes.iAnim.needsUpdate = true;
    });
    this.animalCount = counts.reduce((x, y) => x + y, 0);
  }
}
