// Gas giant and star views.
import * as THREE from 'three';
import { BodyViewBase } from './terrestrialView.js';
import { makeGasMaterial, makeRingMaterial, makeStarMaterial, makeAtmosphereMaterial, makeGlowTexture } from './shaders.js';
import { starColor } from '../sim/body.js';

let glowTex = null;

export class GasView extends BodyViewBase {
  constructor(body, ctx) {
    super(body);
    this.ctx = ctx;
    this.kind = 'gas';
    const R = body.radiusCache;
    this.mat = makeGasMaterial(body.gas.bands, body.gas.spots);
    this.mat.clippingPlanes = ctx.clipPlanes;
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), this.mat);
    this.spinG.add(this.sphere);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), makeAtmosphereMaterial(body.atmoColor || [0.9, 0.8, 0.6], 0.8));
    this.tiltG.add(this.atmo);
    this.buildRings();
    this.lastR = R;
  }
  buildRings() {
    const r = this.body.gas.rings;
    if (this.ring) { this.tiltG.remove(this.ring); this.ring.geometry.dispose(); this.ring.material.dispose(); this.ring = null; }
    if (!r) return;
    const geo = new THREE.RingGeometry(r.inner, r.outer, 160, 2);
    this.ring = new THREE.Mesh(geo, makeRingMaterial(r.inner, r.outer, r.color, r.opacity));
    // rings lie in the equatorial plane (stable: they live in the tilt frame, not the spin frame)
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 3;
    this.tiltG.add(this.ring);
    this.ringKey = JSON.stringify(r);
  }
  update(frame) {
    this.syncTransform();
    const b = this.body;
    const R = b.radiusCache;
    this.sphere.scale.setScalar(R);
    this.atmo.scale.setScalar(R * 1.03);
    const u = this.mat.uniforms;
    u.uTime.value = frame.time;
    u.uSun.value.copy(frame.sunWorld);
    u.uMotion.value = frame.settings.reducedMotion ? 0.25 : 1;
    const bands = b.gas.bands;
    u.uC1.value.setRGB(...bands.c1); u.uC2.value.setRGB(...bands.c2); u.uC3.value.setRGB(...bands.c3);
    u.uContrast.value = bands.contrast; u.uSpeed.value = bands.speed; u.uCount.value = bands.count;
    const spots = b.gas.spots;
    for (let i = 0; i < 6; i++) {
      const sp = spots[i];
      if (sp) { u.uSpots.value[i].set(sp.lat, sp.lon, sp.size, Math.min(1, sp.intensity)); u.uSpotCol.value[i].setRGB(...sp.color); }
      else u.uSpots.value[i].set(0, 0, 0, 0);
    }
    this.atmo.material.uniforms.uSun.value.copy(frame.sunWorld);
    if (JSON.stringify(b.gas.rings) !== this.ringKey) this.buildRings();
    if (this.ring) {
      this.ring.scale.setScalar(R);
      const ru = this.ring.material.uniforms;
      ru.uSun.value.copy(frame.sunWorld);
      ru.uCenter.value.set(b.pos[0], b.pos[1], b.pos[2]);
      ru.uPlanetR.value = R;
    }
  }
  dispose() {
    this.sphere.geometry.dispose(); this.mat.dispose();
    this.atmo.geometry.dispose(); this.atmo.material.dispose();
    if (this.ring) { this.ring.geometry.dispose(); this.ring.material.dispose(); }
  }
  stats() { return { particles: 0, plants: 0, animals: 0 }; }
}

export class StarView extends BodyViewBase {
  constructor(body, ctx) {
    super(body);
    this.ctx = ctx;
    this.kind = 'star';
    const col = starColor(body.star.temperatureK);
    this.mat = makeStarMaterial(col);
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), this.mat);
    this.spinG.add(this.sphere);
    if (!glowTex) glowTex = makeGlowTexture();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(...col), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.root.add(this.glow);
    this.glow2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(...col), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.root.add(this.glow2);
    this.light = new THREE.PointLight(new THREE.Color(...col).lerp(new THREE.Color(1, 1, 1), 0.6), 2.2, 0, 0);
    this.root.add(this.light);
  }
  update(frame) {
    this.syncTransform();
    const b = this.body;
    const R = b.radiusCache;
    const col = starColor(b.star.temperatureK);
    this.sphere.scale.setScalar(R);
    this.mat.uniforms.uTime.value = frame.time;
    this.mat.uniforms.uColor.value.setRGB(...col);
    this.mat.uniforms.uMotion.value = frame.settings.reducedMotion ? 0.2 : 1;
    const L = Math.max(0.05, b.star.luminosity);
    this.glow.scale.setScalar(R * (4 + Math.sqrt(L)));
    this.glow.material.color.setRGB(...col);
    this.glow2.scale.setScalar(R * (11 + 3 * Math.sqrt(L)));
    this.glow2.material.color.setRGB(...col);
    this.light.intensity = Math.min(4, 1.9 * Math.pow(L, 0.25));
    this.light.color.setRGB(col[0] * 0.4 + 0.6, col[1] * 0.4 + 0.6, col[2] * 0.4 + 0.6);
  }
  dispose() {
    this.sphere.geometry.dispose(); this.mat.dispose();
    this.glow.material.dispose(); this.glow2.material.dispose();
    this.light.dispose();
  }
  stats() { return { particles: 0, plants: 0, animals: 0 }; }
}
