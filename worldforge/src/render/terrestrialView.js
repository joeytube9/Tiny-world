// Terrestrial body: deformable terrain (6 cube-sphere face meshes), simulated
// water surface, cloud layer, atmosphere rim, weather visuals, particles, life,
// brush preview and cutaway caps. Everything sits in the body's spin group.
import * as THREE from 'three';
import { getTopology } from './topology.js';
import { cellColors } from './colors.js';
import { makeWaterMaterial, makeAtmosphereMaterial, makeCloudMaterial, patchGlow, makeSpiralMaterial, makeFunnelMaterial, makePointsMaterial } from './shaders.js';
import { fbm3 } from '../sim/rng.js';
import { LifeView } from './lifeView.js';
import { PLANTS } from '../sim/surface.js';

export class BodyViewBase {
  constructor(body) {
    this.body = body;
    this.root = new THREE.Group();
    this.tiltG = new THREE.Group();
    this.spinG = new THREE.Group();
    this.root.add(this.tiltG);
    this.tiltG.add(this.spinG);
    this.root.name = 'body-' + body.id;
  }
  syncTransform() {
    const b = this.body;
    this.root.position.set(b.pos[0], b.pos[1], b.pos[2]);
    this.tiltG.rotation.set(0, 0, b.tilt);
    this.spinG.rotation.set(0, b.spinAngle, 0);
  }
}

const tmpV = new THREE.Vector3();

export class TerrestrialView extends BodyViewBase {
  constructor(body, ctx) {
    super(body);
    this.ctx = ctx;
    this.kind = 'terrestrial';
    this.detail = -1;
    this.faceCursor = 0;
    this.cloudCursor = 0;
    this.time = 0;
    this.stormVis = new Map();
    this.flash = [];
    this.clip = ctx.clipPlanes;
    this.setDetail(ctx.selected ? 2 : 0);
    this.buildAtmosphere();
    this.buildParticles();
    this.buildBrush();
    this.buildCutaway();
  }

  // detail 0: coarse (S=1), 1: medium (S=2), 2: full (quality-based S)
  setDetail(level) {
    const q = this.ctx.settings.quality;
    const S = level === 0 ? 1 : level === 1 ? 2 : q === 'low' ? 2 : 3;
    if (this.S === S && this.terrain) return;
    this.disposeMeshes();
    this.S = S;
    this.detail = level;
    const s = this.body.surface;
    this.topo = getTopology(s.grid, S);
    this.cloudTopo = getTopology(s.grid, 1);
    const T = this.topo;
    this.cornerGround = new Float32Array(T.cornerCount);
    this.cornerHead = new Float32Array(T.cornerCount); // mean water-surface radius x wetness
    this.cornerWet = new Float32Array(T.cornerCount); // fraction of touching cells that are wet
    this.cellWet = new Float32Array(s.count);
    this.cellHW = new Float32Array(s.count);
    this.cornerR = new Float32Array(T.cornerCount);
    this.cornerG = new Float32Array(T.cornerCount);
    this.cornerB = new Float32Array(T.cornerCount);
    this.cornerGlow = new Float32Array(T.cornerCount);
    this.cornerRain = new Float32Array(T.cornerCount);
    this.cornerCloud = new Float32Array(T.cornerCount);
    this.cornerStorm = new Float32Array(T.cornerCount);
    this.cellRGB = new Float32Array(s.count * 3);
    this.cellGlow = new Float32Array(s.count);
    this.cellDepth = new Float32Array(s.count);
    this.cellCloud = new Float32Array(s.count);
    this.cellStorm = new Float32Array(s.count);
    this.cellBase = new Float32Array(s.count);
    // terrain material
    this.terrainMat = patchGlow(new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: this.clip }));
    this.waterMat = makeWaterMaterial(Math.max(0.3, s.Rs / 10));
    this.waterMat.clippingPlanes = this.clip;
    this.cloudMat = makeCloudMaterial(Math.max(0.3, s.Rs), !!this.body.cloudDeck);
    this.cloudMat.clippingPlanes = this.clip;
    this.terrain = [];
    this.water = [];
    this.micro = [];
    const amp = 0.0055 * s.Rs * (this.body.roughness || 1);
    this.microK = 0.22 / Math.max(1e-6, amp);
    const seed = this.body.seed + 17;
    for (let f = 0; f < 6; f++) {
      const F = T.faces[f];
      const V = T.vertsPerFace;
      const micro = new Float32Array(V);
      for (let v = 0; v < V; v++) {
        const x = F.dir[v * 3], y = F.dir[v * 3 + 1], z = F.dir[v * 3 + 2];
        micro[v] = fbm3(x * 14, y * 14, z * 14, seed, S >= 2 ? 3 : 2) * amp;
      }
      this.micro.push(micro);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
      g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(V), 1));
      g.setIndex(new THREE.BufferAttribute(F.index, 1));
      const mesh = new THREE.Mesh(g, this.terrainMat);
      mesh.frustumCulled = false;
      mesh.name = 'terrain';
      this.spinG.add(mesh);
      this.terrain.push(mesh);
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
      wg.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(V), 1));
      wg.setAttribute('aRain', new THREE.BufferAttribute(new Float32Array(V), 1));
      wg.setIndex(new THREE.BufferAttribute(F.index, 1));
      const wmesh = new THREE.Mesh(wg, this.waterMat);
      wmesh.frustumCulled = false;
      wmesh.renderOrder = 2;
      this.spinG.add(wmesh);
      this.water.push(wmesh);
    }
    // clouds (S=1)
    this.clouds = [];
    const CT = this.cloudTopo;
    for (let f = 0; f < 6; f++) {
      const F = CT.faces[f];
      const V = CT.vertsPerFace;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
      g.setAttribute('aCloud', new THREE.BufferAttribute(new Float32Array(V), 1));
      g.setAttribute('aStorm', new THREE.BufferAttribute(new Float32Array(V), 1));
      g.setIndex(new THREE.BufferAttribute(F.index, 1));
      const m = new THREE.Mesh(g, this.cloudMat);
      m.frustumCulled = false;
      m.renderOrder = 4;
      this.spinG.add(m);
      this.clouds.push(m);
    }
    this.cloudCorner = new Float32Array(CT.cornerCount);
    this.cloudStormCorner = new Float32Array(CT.cornerCount);
    this.prepareCorners();
    for (let f = 0; f < 6; f++) this.updateFace(f);
    this.fixSeams(null);
    for (let f = 0; f < 6; f++) this.updateCloudFace(f, true);
    if (this.life) { this.spinG.remove(this.life.group); this.life.dispose(); this.life = null; }
  }

  disposeMeshes() {
    for (const m of [...(this.terrain || []), ...(this.water || []), ...(this.clouds || [])]) {
      this.spinG.remove(m);
      m.geometry.dispose();
    }
    for (const mat of [this.terrainMat, this.waterMat, this.cloudMat]) if (mat) mat.dispose();
    this.terrain = this.water = this.clouds = null;
  }

  dispose() {
    this.disposeMeshes();
    if (this.life) this.life.dispose();
    for (const o of [this.atmo, this.points, this.brush, ...this.capMeshes]) if (o) { o.geometry.dispose(); o.material.dispose(); }
    for (const v of this.stormVis.values()) this.disposeStormVis(v);
    if (this.boltGeo) this.boltGeo.dispose();
  }

  // ---------- corner data ----------
  prepareCorners() {
    const b = this.body;
    const s = b.surface;
    s.computeHeads();
    const T = this.topo;
    const before = this.ctx.settings.beforeAfter === 'before';
    if (before) {
      for (let i = 0; i < s.count; i++) this.cellBase[i] = s.Rs + s.baseE[i];
      T.cornerMean(this.cellBase, this.cornerGround);
    } else T.cornerMean(s.ground, this.cornerGround);
    // water surface from wet cells only: the sea level extends flat and the terrain
    // itself cuts the shoreline (no averaging of ocean depth onto beaches)
    for (let i = 0; i < s.count; i++) {
      const wet = s.head[i] - s.ground[i] > 0.0015 ? 1 : 0;
      this.cellWet[i] = wet;
      this.cellHW[i] = wet * s.head[i];
    }
    T.cornerMean(this.cellHW, this.cornerHead);
    T.cornerMean(this.cellWet, this.cornerWet);
    cellColors(b, this.cellRGB, this.cellGlow, this.ctx.settings.overlay);
    T.cornerMean(this.cellRGB, this.cornerR, 3, 0);
    T.cornerMean(this.cellRGB, this.cornerG, 3, 1);
    T.cornerMean(this.cellRGB, this.cornerB, 3, 2);
    T.cornerMean(this.cellGlow, this.cornerGlow);
    T.cornerMean(s.precip, this.cornerRain);
    this.version = s.version;
  }

  groundAt(x, y, z) {
    return this.topo.sample(this.cornerGround, x, y, z);
  }
  waterAt(x, y, z) {
    const g = this.topo.sample(this.cornerGround, x, y, z);
    const wet = this.topo.sample(this.cornerWet, x, y, z);
    if (wet < 0.25) return g - 0.01;
    const h = this.topo.sample(this.cornerHead, x, y, z) / wet;
    return h > g + 0.0015 ? h : g - 0.01;
  }
  // highest surface (for picking)
  surfaceAt(x, y, z) {
    const g = this.topo.sample(this.cornerGround, x, y, z);
    return Math.max(g, this.waterAt(x, y, z));
  }

  updateFace(f) {
    const T = this.topo;
    const F = T.faces[f];
    const V = T.vertsPerFace;
    const mesh = this.terrain[f];
    const wmesh = this.water[f];
    const pos = mesh.geometry.attributes.position.array;
    const col = mesh.geometry.attributes.color.array;
    const glow = mesh.geometry.attributes.aGlow.array;
    const wpos = wmesh.geometry.attributes.position.array;
    const wdep = wmesh.geometry.attributes.aDepth.array;
    const wrain = wmesh.geometry.attributes.aRain.array;
    const micro = this.micro[f];
    const { ci4, w4, dir } = F;
    const cg = this.cornerGround, ch = this.cornerHead, cw = this.cornerWet, cr = this.cornerR, cgc = this.cornerG, cb = this.cornerB, cgl = this.cornerGlow, crn = this.cornerRain;
    for (let v = 0; v < V; v++) {
      const k0 = ci4[v * 4], k1 = ci4[v * 4 + 1], k2 = ci4[v * 4 + 2], k3 = ci4[v * 4 + 3];
      const a0 = w4[v * 4], a1 = w4[v * 4 + 1], a2 = w4[v * 4 + 2], a3 = w4[v * 4 + 3];
      const gr = cg[k0] * a0 + cg[k1] * a1 + cg[k2] * a2 + cg[k3] * a3;
      const wsum = cw[k0] * a0 + cw[k1] * a1 + cw[k2] * a2 + cw[k3] * a3;
      const hsum = ch[k0] * a0 + ch[k1] * a1 + ch[k2] * a2 + ch[k3] * a3;
      const r = gr + micro[v];
      const head = wsum > 0.2 ? hsum / wsum : 0;
      const dx = dir[v * 3], dy = dir[v * 3 + 1], dz = dir[v * 3 + 2];
      pos[v * 3] = dx * r; pos[v * 3 + 1] = dy * r; pos[v * 3 + 2] = dz * r;
      // subtle texture: brighten micro-ridges, darken hollows
      const tex = 1 + micro[v] * this.microK;
      col[v * 3] = (cr[k0] * a0 + cr[k1] * a1 + cr[k2] * a2 + cr[k3] * a3) * tex;
      col[v * 3 + 1] = (cgc[k0] * a0 + cgc[k1] * a1 + cgc[k2] * a2 + cgc[k3] * a3) * tex;
      col[v * 3 + 2] = (cb[k0] * a0 + cb[k1] * a1 + cb[k2] * a2 + cb[k3] * a3) * tex;
      glow[v] = cgl[k0] * a0 + cgl[k1] * a1 + cgl[k2] * a2 + cgl[k3] * a3;
      const wd = head > 0 ? head - r : -1;
      const wr = wd > 0 ? head : gr - 0.02;
      wpos[v * 3] = dx * wr; wpos[v * 3 + 1] = dy * wr; wpos[v * 3 + 2] = dz * wr;
      wdep[v] = Math.max(0, wd);
      wrain[v] = crn[k0] * a0 + crn[k1] * a1 + crn[k2] * a2 + crn[k3] * a3;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.color.needsUpdate = true;
    mesh.geometry.attributes.aGlow.needsUpdate = true;
    gridNormals(pos, mesh.geometry.attributes.normal.array, T.M);
    mesh.geometry.attributes.normal.needsUpdate = true;
    wmesh.geometry.attributes.position.needsUpdate = true;
    wmesh.geometry.attributes.aDepth.needsUpdate = true;
    wmesh.geometry.attributes.aRain.needsUpdate = true;
  }

  // average normals of coincident seam vertices so faces join smoothly
  fixSeams(face) {
    const T = this.topo;
    const groups = face === null ? T.seams.map((_, i) => i) : T.faceSeams[face];
    const normals = this.terrain.map((m) => m.geometry.attributes.normal.array);
    for (const gi of groups) {
      const g = T.seams[gi];
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < g.length; k += 2) {
        const n = normals[g[k]], v = g[k + 1];
        x += n[v * 3]; y += n[v * 3 + 1]; z += n[v * 3 + 2];
      }
      const l = Math.hypot(x, y, z) || 1;
      x /= l; y /= l; z /= l;
      for (let k = 0; k < g.length; k += 2) {
        const n = normals[g[k]], v = g[k + 1];
        n[v * 3] = x; n[v * 3 + 1] = y; n[v * 3 + 2] = z;
      }
    }
    for (const m of this.terrain) m.geometry.attributes.normal.needsUpdate = true;
  }

  updateCloudFace(f, positions = false) {
    const T = this.cloudTopo;
    const F = T.faces[f];
    const V = T.vertsPerFace;
    const m = this.clouds[f];
    const a = m.geometry.attributes.aCloud.array;
    const st = m.geometry.attributes.aStorm.array;
    const p = m.geometry.attributes.position.array;
    const R = this.cloudRadius();
    for (let v = 0; v < V; v++) {
      const k0 = F.ci4[v * 4], k1 = F.ci4[v * 4 + 1], k2 = F.ci4[v * 4 + 2], k3 = F.ci4[v * 4 + 3];
      const w0 = F.w4[v * 4], w1 = F.w4[v * 4 + 1], w2 = F.w4[v * 4 + 2], w3 = F.w4[v * 4 + 3];
      a[v] = this.cloudCorner[k0] * w0 + this.cloudCorner[k1] * w1 + this.cloudCorner[k2] * w2 + this.cloudCorner[k3] * w3;
      st[v] = this.cloudStormCorner[k0] * w0 + this.cloudStormCorner[k1] * w1 + this.cloudStormCorner[k2] * w2 + this.cloudStormCorner[k3] * w3;
      if (positions || this._cloudR !== R) {
        p[v * 3] = F.dir[v * 3] * R; p[v * 3 + 1] = F.dir[v * 3 + 1] * R; p[v * 3 + 2] = F.dir[v * 3 + 2] * R;
      }
    }
    if (positions || this._cloudR !== R) m.geometry.attributes.position.needsUpdate = true;
    m.geometry.attributes.aCloud.needsUpdate = true;
    m.geometry.attributes.aStorm.needsUpdate = true;
  }

  cloudRadius() {
    const s = this.body.surface;
    const top = this.body.updateCaches ? this.body.radiusCache : s.Rs;
    return Math.max(s.Rs * 1.04, top) + s.Rs * 0.022 + 0.05;
  }

  prepareClouds() {
    const s = this.body.surface;
    const g = s.grid;
    const A = this.body.atmosphere;
    for (let i = 0; i < s.count; i++) {
      const area = g.omega[i] * s.ground[i] ** 2;
      this.cellCloud[i] = A < 0.005 ? 0 : Math.min(1.1, Math.sqrt(s.cloud[i] / (area * 0.0016 + 1e-9)) * 0.75);
      this.cellStorm[i] = Math.min(1, s.precip[i] * 120);
    }
    this.cloudTopo.cornerMean(this.cellCloud, this.cloudCorner);
    this.cloudTopo.cornerMean(this.cellStorm, this.cloudStormCorner);
  }

  // ---------- atmosphere, particles, brush, cutaway ----------
  buildAtmosphere() {
    const geo = new THREE.SphereGeometry(1, 48, 32);
    this.atmo = new THREE.Mesh(geo, makeAtmosphereMaterial(this.body.atmoColor || [0.45, 0.7, 1], 1));
    this.atmo.material.clippingPlanes = this.clip;
    this.atmo.renderOrder = 5;
    this.tiltG.add(this.atmo);
  }

  buildParticles() {
    const N = this.ctx.settings.maxParticles;
    this.pCap = N;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(N * 4), 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(N), 1));
    this.points = new THREE.Points(g, makePointsMaterial());
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.spinG.add(this.points);
    this.pCount = 0;
    this.boltGeo = new THREE.BufferGeometry();
    this.boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2 * 12 * 4), 3));
    this.bolt = new THREE.LineSegments(this.boltGeo, new THREE.LineBasicMaterial({ color: 0xeef4ff, transparent: true, opacity: 1 }));
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.spinG.add(this.bolt);
  }

  buildBrush() {
    const g = new THREE.RingGeometry(0.86, 1, 48);
    this.brush = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
    this.brush.renderOrder = 20;
    this.brush.visible = false;
    this.spinG.add(this.brush);
    const dg = new THREE.CircleGeometry(1, 32);
    this.brushFill = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.12, depthTest: false, side: THREE.DoubleSide }));
    this.brushFill.renderOrder = 19;
    this.brush.add(this.brushFill);
  }

  showBrush(hit, radiusAng, color, blocked) {
    if (!hit) { this.brush.visible = false; return; }
    const d = new THREE.Vector3(...hit.dir);
    const r = this.surfaceAt(d.x, d.y, d.z) + 0.02 * this.body.surface.Rs / 10;
    this.brush.position.copy(d).multiplyScalar(r);
    this.brush.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    const sc = Math.max(0.05, Math.sin(radiusAng) * r);
    this.brush.scale.set(sc, sc, sc);
    this.brush.material.color.set(blocked ? 0xff5050 : color);
    this.brushFill.material.color.set(blocked ? 0xff5050 : color);
    this.brush.visible = true;
  }

  buildCutaway() {
    this.capMeshes = [];
    this.capGroup = new THREE.Group();
    const mk = (color, order) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order }));
      m.renderOrder = 1 + order;
      this.capGroup.add(m);
      this.capMeshes.push(m);
      return m;
    };
    this.capWater = mk(0x1a5fa8, 0);
    this.capIce = mk(0xdfeefa, 1);
    this.capRock = mk(0x6b5a4c, 2);
    this.capMantle = mk(0x9c4a24, 3);
    this.capCore = mk(0xc9a35a, 4);
    this.capGroup.visible = false;
    this.root.add(this.capGroup);
  }

  updateCutaway(camPos, enabled) {
    this.capGroup.visible = enabled;
    if (!enabled) return;
    const b = this.body;
    const s = b.surface;
    const toCam = tmpV.set(camPos.x - b.pos[0], camPos.y - b.pos[1], camPos.z - b.pos[2]).normalize();
    this.capGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toCam);
    const iron = Math.cbrt((3 * b.inv.iron) / (4 * Math.PI));
    let solidMean = 0, headMean = 0, iceMean = 0;
    for (let i = 0; i < s.count; i++) { solidMean += s.Rs + s.bed[i] + s.sed[i]; headMean += s.head[i]; iceMean += s.ground[i]; }
    solidMean /= s.count; headMean /= s.count; iceMean /= s.count;
    const rock = Math.max(iron, solidMean);
    this.capCore.scale.setScalar(Math.max(0.01, iron));
    this.capMantle.scale.setScalar(Math.max(0.01, Math.min(rock * 0.985, Math.max(iron * 1.05, rock * 0.6))));
    this.capRock.scale.setScalar(Math.max(0.01, rock));
    this.capIce.scale.setScalar(Math.max(0.01, Math.max(rock, iceMean)));
    this.capWater.scale.setScalar(Math.max(0.01, Math.max(rock, iceMean, headMean)));
    this.capWater.visible = headMean > iceMean + 0.003;
    this.capIce.visible = iceMean > rock + 0.003;
    this.cutawayInfo = { core: iron, rock, ice: iceMean, water: headMean };
  }

  // ---------- storms ----------
  disposeStormVis(v) {
    for (const o of v.objs) { o.parent && o.parent.remove(o); o.geometry.dispose(); o.material.dispose(); }
  }

  syncStorms(time, sunLocal) {
    const b = this.body;
    const s = b.surface;
    const seen = new Set();
    const cloudR = this.cloudRadius();
    for (const st of b.storms) {
      seen.add(st.id);
      let v = this.stormVis.get(st.id);
      if (!v) {
        v = { objs: [] };
        if (st.type === 'hurricane' || st.type === 'dust' || st.type === 'heatwave' || st.type === 'drought' || st.type === 'blizzard') {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), makeSpiralMaterial());
          m.renderOrder = 7;
          m.material.uniforms.uKind.value = st.type === 'hurricane' ? 0 : 1;
          if (st.type === 'heatwave' || st.type === 'drought') m.material.uniforms.uTint.value.setRGB(1, 0.55, 0.25);
          if (st.type === 'blizzard') m.material.uniforms.uTint.value.setRGB(0.92, 0.95, 1);
          this.spinG.add(m);
          v.disc = m;
          v.objs.push(m);
        }
        if (st.type === 'tornado') {
          const prof = [];
          for (let k = 0; k <= 16; k++) { const y = k / 16; prof.push(new THREE.Vector2(0.06 + 0.94 * Math.pow(y, 2.4), y)); }
          const geo = new THREE.LatheGeometry(prof, 20);
          const m = new THREE.Mesh(geo, makeFunnelMaterial());
          m.renderOrder = 8;
          this.spinG.add(m);
          v.funnel = m;
          v.objs.push(m);
        }
        if (st.type === 'hurricane' || st.type === 'tornado') {
          const tg = new THREE.BufferGeometry();
          tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
          const line = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: st.type === 'tornado' ? 0xffb070 : 0xb8e0ff, transparent: true, opacity: 0.7, depthTest: true }));
          line.frustumCulled = false;
          line.renderOrder = 9;
          this.spinG.add(line);
          v.track = line;
          v.objs.push(line);
        }
        this.stormVis.set(st.id, v);
      }
      if (v.track) {
        // storm track drawn on the surface (planet-local, so it rotates with the body)
        const arr = v.track.geometry.attributes.position.array;
        const pts = st.track.concat([{ p: st.pos }]).slice(-64);
        for (let k = 0; k < pts.length; k++) {
          const q = pts[k].p;
          const r = this.surfaceAt(q[0], q[1], q[2]) + 0.03 * (s.Rs / 10);
          arr[k * 3] = q[0] * r; arr[k * 3 + 1] = q[1] * r; arr[k * 3 + 2] = q[2] * r;
        }
        v.track.geometry.setDrawRange(0, pts.length);
        v.track.geometry.attributes.position.needsUpdate = true;
      }
      const p = new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2]);
      const R = this.surfaceAt(p.x, p.y, p.z);
      if (v.disc) {
        const size = Math.sin(st.radius) * cloudR * (st.type === 'hurricane' ? 1.15 : 1);
        v.disc.position.copy(p).multiplyScalar(cloudR + 0.04);
        v.disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p);
        v.disc.scale.setScalar(size);
        const u = v.disc.material.uniforms;
        u.uTime.value = time;
        u.uSpin.value = st.spin;
        u.uIntensity.value = Math.min(1, st.intensity * (st.type === 'hurricane' ? 1 : 0.6));
        u.uSun.value.copy(sunLocal);
        u.uMotion.value = this.ctx.settings.reducedMotion ? 0.3 : 1;
      }
      if (v.funnel) {
        const h = Math.max(cloudR - R, R * 0.13);
        const w = Math.max(0.06, Math.min(h * 0.3, st.radius * R * 1.6));
        v.funnel.position.copy(p).multiplyScalar(R - 0.01);
        v.funnel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p);
        v.funnel.scale.set(w, h, w);
        const u = v.funnel.material.uniforms;
        u.uTime.value = time;
        u.uIntensity.value = Math.min(1, 0.4 + st.intensity * 0.7);
        u.uColor.value.setRGB(st.waterspout ? 0.75 : 0.5, st.waterspout ? 0.82 : 0.47, st.waterspout ? 0.9 : 0.42);
      }
    }
    for (const [id, v] of this.stormVis) if (!seen.has(id)) { this.disposeStormVis(v); this.stormVis.delete(id); }
  }

  // ---------- particles ----------
  emitParticles(time, dt, camLocal, settings) {
    const b = this.body;
    const s = b.surface;
    const g = s.grid;
    const pos = this.points.geometry.attributes.position.array;
    const colA = this.points.geometry.attributes.aColor.array;
    const size = this.points.geometry.attributes.aSize.array;
    const cap = Math.min(this.pCap, settings.maxParticles);
    let n = 0;
    const R = s.Rs;
    const unit = R / 10;
    const add = (x, y, z, r, gg, bb, a, sz) => {
      if (n >= cap) return false;
      pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z;
      colA[n * 4] = r; colA[n * 4 + 1] = gg; colA[n * 4 + 2] = bb; colA[n * 4 + 3] = a;
      size[n] = sz;
      n++;
      return true;
    };
    const jitterDir = (d, ang, seed, out) => {
      const e = [0, 0, 0];
      let ex = d[2], ez = -d[0];
      let el = Math.hypot(ex, ez);
      if (el < 1e-5) { ex = 1; ez = 0; el = 1; }
      ex /= el; ez /= el;
      const nx = d[1] * ez, ny = d[2] * ex - d[0] * ez, nz = -d[1] * ex;
      const a = rand(seed) * 6.283, rr = Math.sqrt(rand(seed + 1)) * ang;
      const ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
      out[0] = d[0] + ex * ca + nx * sa; out[1] = d[1] + ny * sa; out[2] = d[2] + ez * ca + nz * sa;
      const l = Math.hypot(out[0], out[1], out[2]);
      out[0] /= l; out[1] /= l; out[2] /= l;
      return e;
    };
    const tmp = [0, 0, 0];
    const t = b.pendingTime ?? 0;
    // 1) falling material packets (representative particles, not one per unit)
    const COL = { water: [0.55, 0.78, 1.0], lava: [1.0, 0.45, 0.1], ice: [0.95, 0.97, 1.0], sand: [0.9, 0.8, 0.55], soil: [0.45, 0.33, 0.2], clay: [0.7, 0.45, 0.32], rock: [0.45, 0.43, 0.42], granite: [0.7, 0.64, 0.6], iron: [0.55, 0.5, 0.5], organic: [0.3, 0.22, 0.12] };
    const pend = b.pending;
    const per = Math.max(1, Math.min(6, Math.floor(cap * 0.35 / Math.max(1, pend.length))));
    for (let k = 0; k < pend.length && n < cap * 0.4; k++) {
      const p = pend[k];
      const span = Math.max(1e-3, p.tLand - p.t0);
      const f = Math.min(1, Math.max(0, (t - p.t0) / span));
      const r = p.r0 + (p.rLand - p.r0) * f * f;
      const c = COL[p.mat] || COL.rock;
      const spread = p.src === 'transition' ? p.radius * 0.5 : p.radius * 0.45;
      for (let q = 0; q < per; q++) {
        jitterDir(p.dir, spread, k * 13 + q * 7 + (p.t0 * 100 | 0), tmp);
        const rr = r + (rand(k * 3 + q) - 0.5) * 0.15 * unit;
        add(tmp[0] * rr, tmp[1] * rr, tmp[2] * rr, c[0], c[1], c[2], 0.85, (p.mat === 'lava' ? 0.09 : 0.06) * unit * (p.src === 'transition' ? 1.6 : 1));
      }
      // splash at landing
      if (f > 0.85 && p.mat === 'water') {
        jitterDir(p.dir, p.radius * 0.5, k * 5, tmp);
        const rr = p.rLand + rand(k + time) * 0.08 * unit;
        add(tmp[0] * rr, tmp[1] * rr, tmp[2] * rr, 0.9, 0.95, 1, 0.6, 0.05 * unit);
      }
    }
    // camera-near precipitation
    const camD = camLocal.length();
    const near = camD < R * 4;
    if (near && n < cap) {
      if (!this._rainCells || this._rainT <= time) {
        this._rainT = time + 0.4;
        const cl = camLocal.clone().normalize();
        this._rainCells = [];
        for (let i = 0; i < s.count; i++) {
          if (s.precip[i] < 0.00008) continue;
          const d = g.dir[i * 3] * cl.x + g.dir[i * 3 + 1] * cl.y + g.dir[i * 3 + 2] * cl.z;
          if (d > 0.4) this._rainCells.push(i);
        }
      }
      const cells = this._rainCells;
      const cloudR = this.cloudRadius();
      const budget = Math.min(cap - n, Math.floor(cap * 0.4));
      if (cells.length) {
        const each = Math.max(1, Math.floor(budget / cells.length));
        for (let k = 0; k < cells.length && n < cap; k++) {
          const i = cells[k];
          const snow = s.temp[i] < 0.5;
          const d = [g.dir[i * 3], g.dir[i * 3 + 1], g.dir[i * 3 + 2]];
          const gr = s.head[i];
          const intensity = Math.min(1, s.precip[i] * 300);
          const cnt = Math.max(1, Math.round(each * intensity));
          for (let q = 0; q < cnt; q++) {
            const seed = i * 17 + q * 31;
            jitterDir(d, g.cellAngle * 0.7, seed, tmp);
            const fall = (rand(seed + 3) + time * (snow ? 0.25 : 1.2)) % 1;
            const rr = cloudR - (cloudR - gr) * fall;
            if (snow) add(tmp[0] * rr, tmp[1] * rr, tmp[2] * rr, 1, 1, 1, 0.9, 0.035 * unit);
            else add(tmp[0] * rr, tmp[1] * rr, tmp[2] * rr, 0.7, 0.82, 1, 0.55, 0.022 * unit);
          }
        }
      }
    }
    // storms: tornado debris, dust, wind streaks
    for (const st of b.storms) {
      const p = st.pos;
      const R0 = this.surfaceAt(p[0], p[1], p[2]);
      if (st.type === 'tornado') {
        const m = Math.min(260, cap - n);
        const fh = Math.max(this.cloudRadius() - R0, R * 0.13);
        for (let q = 0; q < m; q++) {
          const h = rand(q * 7) ;
          const ang = time * (4 + h * 6) * st.spin + q;
          const rad = (st.radius * 0.5 + (h * fh * 0.38) / R) * (0.6 + 0.5 * rand(q + 3));
          const lift = h * h * fh * 0.9 + (rand(q + 9) * 0.05 * unit);
          let ex = p[2], ez = -p[0];
          const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
          const nx = p[1] * ez, ny = p[2] * ex - p[0] * ez, nz = -p[1] * ex;
          const ca = Math.cos(ang) * rad, sa = Math.sin(ang) * rad;
          const dx = p[0] + ex * ca + nx * sa, dy = p[1] + ny * sa, dz = p[2] + ez * ca + nz * sa;
          const l = Math.hypot(dx, dy, dz);
          const rr = R0 + lift;
          const spout = st.waterspout;
          add(dx / l * rr, dy / l * rr, dz / l * rr, spout ? 0.85 : 0.5, spout ? 0.9 : 0.4, spout ? 1 : 0.28, 0.75, (0.008 + rand(q) * 0.018) * unit);
        }
      } else if (st.type === 'dust' || st.type === 'gust' || st.type === 'wind' || st.type === 'blizzard') {
        const m = Math.min(st.type === 'dust' ? 180 : 120, cap - n);
        for (let q = 0; q < m; q++) {
          jitterDir(p, st.radius, q * 11, tmp);
          const c = s.grid.cellOf(tmp[0], tmp[1], tmp[2]);
          const we = s.windE[c], wn = s.windN[c];
          const ph = (rand(q * 3) + time * 0.5) % 1;
          const ex = g.east[c * 3], ey = g.east[c * 3 + 1], ez = g.east[c * 3 + 2];
          const nx = g.north[c * 3], ny = g.north[c * 3 + 1], nz = g.north[c * 3 + 2];
          const off = (ph - 0.5) * 0.12 / R;
          const dx = tmp[0] + (ex * we + nx * wn) * off, dy = tmp[1] + (ey * we + ny * wn) * off, dz = tmp[2] + (ez * we + nz * wn) * off;
          const l = Math.hypot(dx, dy, dz);
          const rr = this.surfaceAt(tmp[0], tmp[1], tmp[2]) + (0.05 + rand(q) * 0.3) * unit;
          if (st.type === 'dust') add(dx / l * rr, dy / l * rr, dz / l * rr, 0.75, 0.58, 0.38, 0.5, 0.07 * unit);
          else if (st.type === 'blizzard') add(dx / l * rr, dy / l * rr, dz / l * rr, 1, 1, 1, 0.8, 0.035 * unit);
          else add(dx / l * rr, dy / l * rr, dz / l * rr, 0.9, 0.95, 1, 0.35 * Math.sin(ph * 3.14), 0.03 * unit);
        }
      }
    }
    // fire embers / lava sparks / smoke
    if (near && n < cap) {
      let budget = Math.min(200, cap - n);
      for (let i = 0; i < s.count && budget > 0; i++) {
        const f = s.fire[i], L = s.lavaT[i] > 0.5 && s.lava[i] > 0;
        if (f <= 0.05 && !L) continue;
        const d = [g.dir[i * 3], g.dir[i * 3 + 1], g.dir[i * 3 + 2]];
        for (let q = 0; q < 3 && budget > 0; q++, budget--) {
          jitterDir(d, g.cellAngle * 0.5, i * 7 + q, tmp);
          const ph = (rand(i + q * 5) + time * 0.6) % 1;
          const rr = s.ground[i] + ph * 0.3 * unit;
          if (f > 0.05) add(tmp[0] * rr, tmp[1] * rr, tmp[2] * rr, 1, 0.5 + ph * 0.3, 0.1, 1 - ph, 0.05 * unit);
          else add(tmp[0] * rr, tmp[1] * rr, tmp[2] * rr, 1, 0.6, 0.15, (1 - ph) * 0.8, 0.035 * unit);
        }
      }
    }
    // impact debris
    for (const ev of this.flash) {
      if (ev.type !== 'impact') continue;
      const age = ev.age;
      const m = Math.min(260, cap - n);
      for (let q = 0; q < m; q++) {
        jitterDir(ev.dir, 0.25, q * 3, tmp);
        const v = (0.5 + rand(q) * 2) * unit;
        const rr = s.Rs * 1.01 + v * age - 0.4 * age * age * unit;
        if (rr < s.Rs) continue;
        add(tmp[0] * rr, tmp[1] * rr, tmp[2] * rr, 1, 0.5 + rand(q + 1) * 0.4, 0.2, Math.max(0, 1 - age / 4), 0.08 * unit);
      }
    }
    this.pCount = n;
    this.points.geometry.setDrawRange(0, n);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aColor.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }

  updateLightning(time) {
    const bolt = this.bolt;
    const live = this.flash.filter((e) => e.type === 'lightning' && e.age < 0.35);
    if (!live.length) { bolt.visible = false; return; }
    const s = this.body.surface;
    const pos = this.boltGeo.attributes.position.array;
    let k = 0;
    for (const e of live.slice(0, 4)) {
      const c = e.cell;
      const d = [s.grid.dir[c * 3], s.grid.dir[c * 3 + 1], s.grid.dir[c * 3 + 2]];
      const top = this.cloudRadius(), bot = s.ground[c];
      let prev = [d[0] * top, d[1] * top, d[2] * top];
      for (let q = 1; q <= 12; q++) {
        const f = q / 12;
        const r = top + (bot - top) * f;
        const j = q < 12 ? (rand(c * 31 + q + Math.floor(time * 20)) - 0.5) * 0.025 : 0;
        const pt = [(d[0] + j) * r, (d[1] + j * 0.7) * r, (d[2] - j) * r];
        pos.set(prev, k * 3); pos.set(pt, k * 3 + 3);
        k += 2;
        prev = pt;
      }
    }
    this.boltGeo.setDrawRange(0, k);
    this.boltGeo.attributes.position.needsUpdate = true;
    bolt.material.opacity = 0.6 + 0.4 * Math.random();
    bolt.visible = true;
  }

  // ---------- per-frame ----------
  update(frame) {
    const { dt, time, sunWorld, camera, settings, selected, camDist } = frame;
    this.syncTransform();
    this.time = time;
    const b = this.body;
    const s = b.surface;
    b.pendingTime = frame.surfaceTime;
    // detail switching
    const want = selected ? 2 : camDist < s.Rs * 6 ? 1 : 0;
    if (want !== this.detail && !(this._detailCooldown > 0)) {
      this.setDetail(want);
      this._detailCooldown = 1.0;
    }
    this._detailCooldown = (this._detailCooldown || 0) - dt;
    // progressive mesh refresh
    this._faceTimer = (this._faceTimer || 0) + dt;
    // one face per frame for the selected body; faces turned away from the camera
    // refresh at a quarter of the rate. Unselected bodies: one face every 0.25 s.
    const interval = selected ? 0 : 0.25;
    if (this._faceTimer >= interval) {
      this._faceTimer = 0;
      this._frameN = (this._frameN || 0) + 1;
      const invS = new THREE.Matrix4().copy(this.spinG.matrixWorld).invert();
      const cam = camera.position.clone().applyMatrix4(invS).normalize();
      const FN = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      for (let tries = 0; tries < 6; tries++) {
        const f = this.faceCursor;
        const facing = FN[f][0] * cam.x + FN[f][1] * cam.y + FN[f][2] * cam.z;
        const skip = selected && facing < -0.35 && this._frameN % 4 !== 0;
        if (f === 0) this.prepareCorners();
        this.faceCursor = (f + 1) % 6;
        if (skip) continue;
        this.updateFace(f);
        this.fixSeams(f);
        break;
      }
    }
    if (this.cloudCursor === 0) this.prepareClouds();
    this.updateCloudFace(this.cloudCursor);
    this.cloudCursor = (this.cloudCursor + 1) % 6;
    this._cloudR = this.cloudRadius();
    // local sun direction for shaders (world -> tilt/spin is handled via modelMatrix in shaders; world vector works)
    const sun = sunWorld;
    const motion = settings.reducedMotion ? 0.25 : 1;
    this.waterMat.uniforms.uTime.value = time;
    this.waterMat.uniforms.uSun.value.copy(sun);
    this.waterMat.uniforms.uMotion.value = motion;
    this.cloudMat.uniforms.uTime.value = time;
    this.cloudMat.uniforms.uSun.value.copy(sun);
    this.cloudMat.uniforms.uMotion.value = motion;
    // fade the cloud layer when the camera is down near the surface so close-up play stays readable
    const alt = camDist - s.Rs;
    this.cloudMat.uniforms.uFade.value = selected ? Math.min(1, Math.max(0.3, (alt - s.Rs * 0.15) / (s.Rs * 0.6))) : 1;
    // wind wave amplitude: mean wind speed over water
    if (!this._windT || this._windT < time) {
      this._windT = time + 1;
      let ws = 0, wn = 0;
      for (let i = 0; i < s.count; i += 7) { ws += Math.hypot(s.windE[i], s.windN[i]); wn++; }
      this.meanWind = ws / Math.max(1, wn);
    }
    this.waterMat.uniforms.uWave.value = Math.min(1.5, (this.meanWind || 0) / 4);
    // skip the water pass entirely on bodies with no liquid water (e.g. airless moons)
    if (!this._wT || this._wT < time) {
      this._wT = time + 1;
      let W = 0;
      for (let i = 0; i < s.count; i++) W += s.w[i];
      this.hasWater = W > 1e-6 || b.pending.length > 0;
    }
    for (const m of this.water) m.visible = this.hasWater;
    // atmosphere
    const A = b.atmosphere;
    const top = Math.max(b.radiusCache, s.Rs);
    const thick = A > 0 ? Math.min(0.12, 0.03 + 0.02 * Math.sqrt(Math.min(A, 10))) : 0.0;
    this.atmo.visible = A > 0.002;
    this.atmo.scale.setScalar(top * (1 + thick) + 0.1);
    this.atmo.material.uniforms.uSun.value.copy(sun);
    this.atmo.material.uniforms.uStrength.value = Math.min(1.6, 0.35 + Math.sqrt(A) * 0.8) + (frame.unlocks && frame.unlocks.includes('Aurora rim glow') ? 0.35 : 0);
    const baseCol = b.atmoColor || [0.45, 0.7, 1];
    const aqua = frame.unlocks && frame.unlocks.includes('Aqua atmosphere tint');
    this.atmo.material.uniforms.uColor.value.setRGB(aqua ? baseCol[0] * 0.5 + 0.1 : baseCol[0], aqua ? baseCol[1] * 0.5 + 0.48 : baseCol[1], aqua ? baseCol[2] * 0.5 + 0.45 : baseCol[2]);
    this.cloudMat.uniforms.uDeckColor.value.setRGB(...(b.cloudDeck ? [0.95, 0.85, 0.6] : frame.unlocks && frame.unlocks.includes('Storm-chaser cloud style') ? [0.8, 0.88, 1.0] : [0.95, 0.85, 0.6]));
    for (const m of this.clouds) m.visible = A > 0.004;
    // sun in local (for storm disc lighting)
    const inv = new THREE.Matrix4().copy(this.spinG.matrixWorld).invert();
    this.syncStorms(time, sun);
    // transient events
    for (const e of frame.events) if (e.bodyId === b.id && !e._seen) { e._seen = true; this.flash.push({ ...e, age: 0 }); }
    for (const e of this.flash) e.age += dt;
    this.flash = this.flash.filter((e) => e.age < 4);
    this.updateLightning(time);
    // camera local position
    const camLocal = camera.position.clone().applyMatrix4(inv);
    if (selected && !frame.cutaway) this.emitParticles(time, dt, camLocal, settings);
    else { this.points.geometry.setDrawRange(0, 0); this.pCount = 0; }
    this.points.material.uniforms.uScale.value = frame.pointScale;
    // life
    const showLife = selected && camDist < s.Rs * 12;
    if (showLife && !this.life) {
      const q = settings.quality;
      this.life = new LifeView(this, { plants: q === 'low' ? 700 : q === 'high' ? 2400 : 1400, animals: Math.max(8, settings.popCap) });
      this.spinG.add(this.life.group);
    }
    if (this.life) {
      if (this.life.animalCap < settings.popCap) { this.spinG.remove(this.life.group); this.life.dispose(); this.life = null; }
      else {
        this.life.shared.uWind.value = Math.min(2, (this.meanWind || 0) / 5);
        this.life.update(dt, time * motion, camLocal, camDist, showLife);
      }
    }
    this.updateCutaway(camera.position, frame.cutaway && selected);
  }

  stats() {
    return { particles: this.pCount || 0, plants: this.life ? this.life.plantCount || 0 : 0, animals: this.life ? this.life.animalCount || 0 : 0 };
  }
}

// Fast normals for a regular (M+1)x(M+1) face grid: central differences along the
// grid axes (one-sided at edges; seams are then averaged across faces by fixSeams).
function gridNormals(p, n, M) {
  const W = M + 1;
  for (let j = 0; j <= M; j++) {
    const j0 = j > 0 ? j - 1 : j, j1 = j < M ? j + 1 : j;
    for (let i = 0; i <= M; i++) {
      const i0 = i > 0 ? i - 1 : i, i1 = i < M ? i + 1 : i;
      const a = (j * W + i0) * 3, b = (j * W + i1) * 3, c = (j0 * W + i) * 3, d = (j1 * W + i) * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[d] - p[c], vy = p[d + 1] - p[c + 1], vz = p[d + 2] - p[c + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      const o = (j * W + i) * 3;
      n[o] = nx / l; n[o + 1] = ny / l; n[o + 2] = nz / l;
    }
  }
}

function rand(i) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
