// Procedural multi-part organism and plant models with vertex colours and an
// aAnim attribute (part type, pivot y, pivot z/x, phase) used by a cheap
// vertex-shader animation (gait, wing flaps, tail sway, plant sway).
import * as THREE from 'three';

const A_STATIC = 0, A_LEG = 1, A_WING = 2, A_SWIM = 3, A_HEAD = 4, A_SWAY = 5;

function part(geo, { color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], anim = [A_STATIC, 0, 0, 0], shade = 0 }) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
  g.applyMatrix4(m);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const an = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    // subtle vertical shading so parts read as volumes
    const y = g.attributes.position.getY(i);
    const k = 1 - shade * (0.5 - Math.min(1, Math.max(0, y)));
    col[i * 3] = color[0] * k; col[i * 3 + 1] = color[1] * k; col[i * 3 + 2] = color[2] * k;
    an.set(anim, i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aAnim', new THREE.BufferAttribute(an, 4));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), an = new Float32Array(total * 4);
  let o = 0;
  for (const p of parts) {
    const n = p.attributes.position.count;
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    an.set(p.attributes.aAnim.array, o * 4);
    o += n;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aAnim', new THREE.BufferAttribute(an, 4));
  g.computeBoundingSphere();
  return g;
}

const sph = (w = 10, h = 8) => new THREE.SphereGeometry(1, w, h);
const cyl = (rt = 1, rb = 1, s = 8) => new THREE.CylinderGeometry(rt, rb, 1, s, 1);
const cone = (s = 8) => new THREE.ConeGeometry(1, 1, s, 1);
const box = () => new THREE.BoxGeometry(1, 1, 1);

function quadruped({ body, belly, leg, head, len = 1, legH = 0.55, extra = [] }) {
  const P = [];
  P.push(part(sph(12, 10), { color: body, pos: [0, legH + 0.18, 0], scale: [0.27, 0.3, 0.55 * len], shade: 0.4 }));
  P.push(part(sph(10, 8), { color: belly, pos: [0, legH + 0.08, 0.02], scale: [0.22, 0.18, 0.42 * len] }));
  const lz = 0.32 * len;
  const legs = [[0.13, lz, 0], [-0.13, lz, Math.PI], [0.13, -lz, Math.PI], [-0.13, -lz, 0]];
  for (const [x, z, ph] of legs) {
    P.push(part(cyl(0.05, 0.035, 6), { color: leg, pos: [x, legH / 2, z], scale: [1, legH, 1], anim: [A_LEG, legH, z, ph] }));
    P.push(part(sph(6, 4), { color: [leg[0] * 0.6, leg[1] * 0.6, leg[2] * 0.6], pos: [x, 0.02, z + 0.02], scale: [0.045, 0.03, 0.06], anim: [A_LEG, legH, z, ph] }));
  }
  return P.concat(extra);
}

export function buildAnimalGeometry(key) {
  let P;
  switch (key) {
    case 'grazer': {
      const body = [0.56, 0.38, 0.22], belly = [0.86, 0.76, 0.6], leg = [0.4, 0.28, 0.18];
      const extra = [
        part(cyl(0.07, 0.1, 8), { color: body, pos: [0, 0.98, 0.42], rot: [-0.7, 0, 0], scale: [1, 0.42, 1], anim: [A_HEAD, 0, 0, 0] }),
        part(sph(10, 8), { color: body, pos: [0, 1.17, 0.58], scale: [0.12, 0.12, 0.2], anim: [A_HEAD, 0, 0, 0] }),
        part(sph(8, 6), { color: [0.25, 0.18, 0.12], pos: [0, 1.13, 0.76], scale: [0.06, 0.06, 0.05], anim: [A_HEAD, 0, 0, 0] }),
        part(cone(6), { color: body, pos: [0.09, 1.3, 0.55], rot: [0, 0, -0.5], scale: [0.04, 0.12, 0.03], anim: [A_HEAD, 0, 0, 0] }),
        part(cone(6), { color: body, pos: [-0.09, 1.3, 0.55], rot: [0, 0, 0.5], scale: [0.04, 0.12, 0.03], anim: [A_HEAD, 0, 0, 0] }),
        // antlers
        part(cyl(0.012, 0.018, 5), { color: [0.85, 0.8, 0.68], pos: [0.07, 1.42, 0.52], rot: [0.2, 0, -0.45], scale: [1, 0.3, 1], anim: [A_HEAD, 0, 0, 0] }),
        part(cyl(0.012, 0.018, 5), { color: [0.85, 0.8, 0.68], pos: [-0.07, 1.42, 0.52], rot: [0.2, 0, 0.45], scale: [1, 0.3, 1], anim: [A_HEAD, 0, 0, 0] }),
        part(cyl(0.01, 0.012, 5), { color: [0.85, 0.8, 0.68], pos: [0.12, 1.52, 0.5], rot: [-0.6, 0, -0.1], scale: [1, 0.14, 1], anim: [A_HEAD, 0, 0, 0] }),
        part(cyl(0.01, 0.012, 5), { color: [0.85, 0.8, 0.68], pos: [-0.12, 1.52, 0.5], rot: [-0.6, 0, 0.1], scale: [1, 0.14, 1], anim: [A_HEAD, 0, 0, 0] }),
        part(cone(6), { color: [0.95, 0.92, 0.88], pos: [0, 0.82, -0.58], rot: [-2.2, 0, 0], scale: [0.05, 0.14, 0.05] }),
      ];
      P = quadruped({ body, belly, leg, len: 1, legH: 0.6, extra });
      break;
    }
    case 'predator': {
      const body = [0.86, 0.42, 0.12], belly = [0.96, 0.92, 0.86], leg = [0.18, 0.12, 0.1];
      const extra = [
        part(sph(10, 8), { color: body, pos: [0, 0.78, 0.5], scale: [0.14, 0.13, 0.16], anim: [A_HEAD, 0, 0, 0] }),
        part(cone(8), { color: body, pos: [0, 0.74, 0.7], rot: [Math.PI / 2, 0, 0], scale: [0.07, 0.18, 0.06], anim: [A_HEAD, 0, 0, 0] }),
        part(sph(6, 4), { color: [0.08, 0.06, 0.06], pos: [0, 0.74, 0.8], scale: [0.025, 0.025, 0.025], anim: [A_HEAD, 0, 0, 0] }),
        part(cone(4), { color: body, pos: [0.08, 0.93, 0.48], scale: [0.05, 0.13, 0.03], anim: [A_HEAD, 0, 0, 0] }),
        part(cone(4), { color: body, pos: [-0.08, 0.93, 0.48], scale: [0.05, 0.13, 0.03], anim: [A_HEAD, 0, 0, 0] }),
        part(cone(8), { color: body, pos: [0, 0.6, -0.68], rot: [-1.9, 0, 0], scale: [0.11, 0.48, 0.11] }),
        part(cone(8), { color: belly, pos: [0, 0.47, -0.9], rot: [-1.9, 0, 0], scale: [0.06, 0.14, 0.06] }),
      ];
      P = quadruped({ body, belly, leg, len: 0.95, legH: 0.42, extra });
      break;
    }
    case 'rabbit': {
      const body = [0.66, 0.58, 0.5], belly = [0.92, 0.9, 0.86], leg = [0.6, 0.52, 0.46];
      P = [
        part(sph(12, 10), { color: body, pos: [0, 0.32, -0.05], scale: [0.25, 0.26, 0.36], shade: 0.4, anim: [A_HEAD, 0, 0, 0] }),
        part(sph(10, 8), { color: body, pos: [0, 0.52, 0.28], scale: [0.16, 0.15, 0.18], anim: [A_HEAD, 0, 0, 0] }),
        part(sph(6, 4), { color: [0.9, 0.5, 0.55], pos: [0, 0.5, 0.45], scale: [0.03, 0.025, 0.02], anim: [A_HEAD, 0, 0, 0] }),
        part(box(), { color: body, pos: [0.06, 0.78, 0.22], rot: [-0.25, 0, -0.12], scale: [0.06, 0.32, 0.03], anim: [A_HEAD, 0, 0, 0] }),
        part(box(), { color: body, pos: [-0.06, 0.78, 0.22], rot: [-0.25, 0, 0.12], scale: [0.06, 0.32, 0.03], anim: [A_HEAD, 0, 0, 0] }),
        part(box(), { color: [0.92, 0.7, 0.72], pos: [0.06, 0.78, 0.236], rot: [-0.25, 0, -0.12], scale: [0.035, 0.26, 0.01], anim: [A_HEAD, 0, 0, 0] }),
        part(box(), { color: [0.92, 0.7, 0.72], pos: [-0.06, 0.78, 0.236], rot: [-0.25, 0, 0.12], scale: [0.035, 0.26, 0.01], anim: [A_HEAD, 0, 0, 0] }),
        part(sph(6, 4), { color: belly, pos: [0, 0.38, -0.42], scale: [0.08, 0.08, 0.08] }),
        part(sph(8, 6), { color: leg, pos: [0.13, 0.12, -0.2], scale: [0.08, 0.12, 0.2], anim: [A_LEG, 0.25, -0.2, 0] }),
        part(sph(8, 6), { color: leg, pos: [-0.13, 0.12, -0.2], scale: [0.08, 0.12, 0.2], anim: [A_LEG, 0.25, -0.2, 0] }),
        part(cyl(0.035, 0.03, 6), { color: leg, pos: [0.09, 0.1, 0.2], scale: [1, 0.2, 1], anim: [A_LEG, 0.2, 0.2, Math.PI] }),
        part(cyl(0.035, 0.03, 6), { color: leg, pos: [-0.09, 0.1, 0.2], scale: [1, 0.2, 1], anim: [A_LEG, 0.2, 0.2, Math.PI] }),
      ];
      break;
    }
    case 'bird': {
      const body = [0.22, 0.42, 0.86], belly = [0.95, 0.95, 0.92], wing = [0.15, 0.3, 0.7];
      P = [
        part(sph(10, 8), { color: body, pos: [0, 0, 0], scale: [0.14, 0.14, 0.32], shade: 0.4 }),
        part(sph(8, 6), { color: belly, pos: [0, -0.04, 0.02], scale: [0.11, 0.1, 0.26] }),
        part(sph(10, 8), { color: body, pos: [0, 0.08, 0.28], scale: [0.11, 0.11, 0.12] }),
        part(cone(6), { color: [0.98, 0.7, 0.15], pos: [0, 0.07, 0.43], rot: [Math.PI / 2, 0, 0], scale: [0.035, 0.12, 0.035] }),
        part(sph(4, 4), { color: [0.05, 0.05, 0.05], pos: [0.07, 0.11, 0.33], scale: [0.02, 0.02, 0.02] }),
        part(sph(4, 4), { color: [0.05, 0.05, 0.05], pos: [-0.07, 0.11, 0.33], scale: [0.02, 0.02, 0.02] }),
        part(box(), { color: wing, pos: [0.36, 0.02, 0.0], rot: [0, 0.15, 0.05], scale: [0.52, 0.02, 0.22], anim: [A_WING, 0.02, 0.1, 0] }),
        part(box(), { color: wing, pos: [-0.36, 0.02, 0.0], rot: [0, -0.15, -0.05], scale: [0.52, 0.02, 0.22], anim: [A_WING, 0.02, 0.1, 0] }),
        part(box(), { color: [0.12, 0.22, 0.55], pos: [0.62, 0.02, -0.04], rot: [0, 0.35, 0], scale: [0.16, 0.015, 0.14], anim: [A_WING, 0.02, 0.1, 0] }),
        part(box(), { color: [0.12, 0.22, 0.55], pos: [-0.62, 0.02, -0.04], rot: [0, -0.35, 0], scale: [0.16, 0.015, 0.14], anim: [A_WING, 0.02, 0.1, 0] }),
        part(box(), { color: wing, pos: [0, 0.01, -0.4], rot: [0.1, 0, 0], scale: [0.18, 0.015, 0.2] }),
      ];
      break;
    }
    case 'fish': {
      const body = [0.95, 0.55, 0.18], belly = [0.98, 0.9, 0.75], fin = [0.9, 0.35, 0.12];
      P = [
        part(sph(12, 8), { color: body, pos: [0, 0, 0], scale: [0.1, 0.18, 0.42], shade: 0.5, anim: [A_SWIM, 0, 0, 0] }),
        part(sph(8, 6), { color: belly, pos: [0, -0.06, 0.04], scale: [0.08, 0.1, 0.34], anim: [A_SWIM, 0, 0, 0] }),
        part(cone(4), { color: fin, pos: [0, 0, -0.5], rot: [-Math.PI / 2, 0, 0], scale: [0.18, 0.2, 0.02], anim: [A_SWIM, 0, 0, 0] }),
        part(cone(4), { color: fin, pos: [0, 0.2, -0.02], rot: [0.3, 0, 0], scale: [0.02, 0.14, 0.14], anim: [A_SWIM, 0, 0, 0] }),
        part(box(), { color: fin, pos: [0.1, -0.06, 0.1], rot: [0, 0.6, 0.4], scale: [0.1, 0.01, 0.06], anim: [A_SWIM, 0, 0, 0] }),
        part(box(), { color: fin, pos: [-0.1, -0.06, 0.1], rot: [0, -0.6, -0.4], scale: [0.1, 0.01, 0.06], anim: [A_SWIM, 0, 0, 0] }),
        part(sph(4, 4), { color: [0.05, 0.05, 0.05], pos: [0.07, 0.05, 0.3], scale: [0.025, 0.025, 0.025], anim: [A_SWIM, 0, 0, 0] }),
        part(sph(4, 4), { color: [0.05, 0.05, 0.05], pos: [-0.07, 0.05, 0.3], scale: [0.025, 0.025, 0.025], anim: [A_SWIM, 0, 0, 0] }),
      ];
      break;
    }
    case 'insect': {
      // butterfly
      const w1 = [0.98, 0.72, 0.12], w2 = [0.6, 0.25, 0.75];
      P = [
        part(cyl(0.03, 0.025, 6), { color: [0.12, 0.1, 0.08], pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.36, 1] }),
        part(sph(6, 4), { color: [0.12, 0.1, 0.08], pos: [0, 0, 0.2], scale: [0.04, 0.04, 0.04] }),
        part(box(), { color: w1, pos: [0.2, 0, 0.06], rot: [0, 0.3, 0], scale: [0.34, 0.01, 0.26], anim: [A_WING, 0, 0.02, 0] }),
        part(box(), { color: w1, pos: [-0.2, 0, 0.06], rot: [0, -0.3, 0], scale: [0.34, 0.01, 0.26], anim: [A_WING, 0, 0.02, 0] }),
        part(box(), { color: w2, pos: [0.16, 0, -0.13], rot: [0, -0.3, 0], scale: [0.24, 0.01, 0.2], anim: [A_WING, 0, 0.02, 0] }),
        part(box(), { color: w2, pos: [-0.16, 0, -0.13], rot: [0, 0.3, 0], scale: [0.24, 0.01, 0.2], anim: [A_WING, 0, 0.02, 0] }),
        part(cyl(0.006, 0.006, 4), { color: [0.1, 0.1, 0.1], pos: [0.04, 0.06, 0.28], rot: [1.0, 0, -0.3], scale: [1, 0.14, 1] }),
        part(cyl(0.006, 0.006, 4), { color: [0.1, 0.1, 0.1], pos: [-0.04, 0.06, 0.28], rot: [1.0, 0, 0.3], scale: [1, 0.14, 1] }),
      ];
      break;
    }
  }
  return merge(P);
}

export function buildPlantGeometry(key) {
  const P = [];
  const sway = (h) => [A_SWAY, h, 0, 0];
  switch (key) {
    case 'grass': {
      const greens = [[0.36, 0.62, 0.2], [0.3, 0.55, 0.16], [0.45, 0.66, 0.25]];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const r = 0.06 + (k % 3) * 0.05;
        P.push(part(cone(3), { color: greens[k % 3], pos: [Math.cos(a) * r, 0.14 + (k % 2) * 0.03, Math.sin(a) * r], rot: [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], scale: [0.025, 0.3 + (k % 4) * 0.05, 0.025], anim: sway(1) }));
      }
      break;
    }
    case 'flowers': {
      const petals = [[0.95, 0.4, 0.6], [0.98, 0.85, 0.2], [0.95, 0.95, 0.98], [0.7, 0.45, 0.95]];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        const r = 0.05 + (k % 2) * 0.08;
        const h = 0.25 + (k % 3) * 0.08;
        P.push(part(cyl(0.01, 0.012, 4), { color: [0.25, 0.5, 0.18], pos: [Math.cos(a) * r, h / 2, Math.sin(a) * r], scale: [1, h, 1], anim: sway(1) }));
        P.push(part(sph(6, 4), { color: petals[k % 4], pos: [Math.cos(a) * r, h + 0.02, Math.sin(a) * r], scale: [0.06, 0.035, 0.06], anim: sway(1) }));
        P.push(part(sph(4, 3), { color: [0.98, 0.8, 0.1], pos: [Math.cos(a) * r, h + 0.045, Math.sin(a) * r], scale: [0.02, 0.015, 0.02], anim: sway(1) }));
      }
      P.push(part(sph(6, 4), { color: [0.3, 0.55, 0.2], pos: [0, 0.04, 0], scale: [0.16, 0.05, 0.16] }));
      break;
    }
    case 'shrubs': {
      const c = [[0.42, 0.48, 0.2], [0.36, 0.42, 0.17], [0.48, 0.52, 0.26]];
      P.push(part(cyl(0.025, 0.035, 5), { color: [0.35, 0.25, 0.15], pos: [0, 0.1, 0], scale: [1, 0.2, 1] }));
      const pts = [[0, 0.28, 0, 0.2], [0.14, 0.22, 0.05, 0.15], [-0.12, 0.2, 0.08, 0.14], [0.02, 0.2, -0.14, 0.15], [-0.05, 0.38, -0.03, 0.12]];
      pts.forEach(([x, y, z, r], k) => P.push(part(sph(8, 6), { color: c[k % 3], pos: [x, y, z], scale: [r, r * 0.85, r], shade: 0.5, anim: sway(0.6) })));
      break;
    }
    case 'conifer': {
      P.push(part(cyl(0.035, 0.06, 6), { color: [0.36, 0.24, 0.14], pos: [0, 0.18, 0], scale: [1, 0.36, 1] }));
      const tiers = [[0.38, 0.34, 0.42], [0.62, 0.27, 0.36], [0.84, 0.19, 0.3], [1.02, 0.11, 0.22]];
      tiers.forEach(([y, r, h], k) => P.push(part(cone(9), { color: [0.1 + k * 0.02, 0.32 + k * 0.03, 0.18], pos: [0, y, 0], scale: [r, h, r], shade: 0.6, anim: sway(0.5) })));
      break;
    }
    case 'broadleaf': {
      const bark = [0.4, 0.28, 0.17];
      P.push(part(cyl(0.04, 0.07, 7), { color: bark, pos: [0, 0.28, 0], scale: [1, 0.56, 1] }));
      P.push(part(cyl(0.02, 0.035, 5), { color: bark, pos: [0.12, 0.6, 0], rot: [0, 0, -0.7], scale: [1, 0.32, 1], anim: sway(0.4) }));
      P.push(part(cyl(0.02, 0.035, 5), { color: bark, pos: [-0.1, 0.62, 0.05], rot: [0.3, 0, 0.6], scale: [1, 0.3, 1], anim: sway(0.4) }));
      const greens = [[0.2, 0.5, 0.15], [0.16, 0.42, 0.12], [0.26, 0.56, 0.18], [0.22, 0.46, 0.14]];
      const blobs = [[0, 0.86, 0, 0.3], [0.22, 0.76, 0.06, 0.22], [-0.2, 0.78, 0.1, 0.22], [0.05, 0.74, -0.2, 0.22], [-0.04, 1.02, -0.04, 0.2], [0.14, 0.95, 0.15, 0.18]];
      blobs.forEach(([x, y, z, r], k) => P.push(part(sph(9, 7), { color: greens[k % 4], pos: [x, y, z], scale: [r, r * 0.9, r], shade: 0.6, anim: sway(0.5) })));
      break;
    }
    case 'fungi': {
      const caps = [[0.85, 0.18, 0.12], [0.72, 0.5, 0.3], [0.9, 0.85, 0.75]];
      const ms = [[0, 0, 0, 1], [0.12, 0, 0.06, 0.7], [-0.08, 0, 0.1, 0.55]];
      ms.forEach(([x, , z, s], k) => {
        P.push(part(cyl(0.025, 0.035, 6), { color: [0.95, 0.93, 0.88], pos: [x, 0.08 * s, z], scale: [s, 0.16 * s, s] }));
        P.push(part(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), { color: caps[k], pos: [x, 0.15 * s, z], scale: [0.09 * s, 0.07 * s, 0.09 * s] }));
        P.push(part(sph(4, 3), { color: [0.98, 0.98, 0.95], pos: [x + 0.03 * s, 0.205 * s, z], scale: [0.015 * s, 0.01 * s, 0.015 * s] }));
      });
      break;
    }
  }
  return merge(P);
}

// Lambert material with instanced animation (uTime, per-instance iAnim: phase, motion).
export function makeAnimatedMaterial(shared) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aAnim; attribute vec2 iAnim; uniform float uTime; uniform float uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ph = uTime*9.0 + iAnim.x + aAnim.w;
          float mv = iAnim.y;
          if (aAnim.x > 0.5 && aAnim.x < 1.5) {
            float ang = sin(ph) * 0.65 * mv;
            vec3 p = transformed - vec3(0.0, aAnim.y, aAnim.z);
            float c = cos(ang), s = sin(ang);
            p = vec3(p.x, p.y*c - p.z*s, p.y*s + p.z*c);
            transformed = p + vec3(0.0, aAnim.y, aAnim.z);
          } else if (aAnim.x > 1.5 && aAnim.x < 2.5) {
            float side = sign(transformed.x);
            float ang = sin(ph*1.7) * 0.9 * side * (0.3 + 0.7*mv);
            vec3 p = transformed - vec3(aAnim.z*side, aAnim.y, 0.0);
            p = vec3(p.x*cos(ang) - p.y*sin(ang), p.x*sin(ang) + p.y*cos(ang), p.z);
            transformed = p + vec3(aAnim.z*side, aAnim.y, 0.0);
          } else if (aAnim.x > 2.5 && aAnim.x < 3.5) {
            transformed.x += sin(ph*1.1 - transformed.z*6.0) * 0.08 * (0.4 + 0.6*mv) * clamp(0.3 - transformed.z, 0.0, 1.0);
          } else if (aAnim.x > 3.5 && aAnim.x < 4.5) {
            transformed.y += (1.0 - mv) * (sin(ph*0.25)*0.5 - 0.5) * 0.12 * step(0.3, transformed.z);
          } else if (aAnim.x > 4.5) {
            float h = max(transformed.y, 0.0);
            float w = (0.3 + uWind) * aAnim.y;
            transformed.x += sin(uTime*1.7 + iAnim.x) * 0.05 * h * h * w;
            transformed.z += cos(uTime*1.3 + iAnim.x*1.3) * 0.035 * h * h * w;
          }
        }`);
  };
  mat.customProgramCacheKey = () => 'animated-life';
  return mat;
}
