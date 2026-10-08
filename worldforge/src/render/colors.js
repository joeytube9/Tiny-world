// Per-cell colour (RGB) and glow for terrain rendering + analysis overlays.
import { MATERIALS } from '../sim/materials.js';
import { PLANTS } from '../sim/surface.js';

const VEG_COL = [
  [0.4, 0.62, 0.24], // grass
  [0.55, 0.62, 0.3], // flowers (green with blossoms)
  [0.5, 0.5, 0.27], // shrubs
  [0.17, 0.38, 0.2], // conifer
  [0.24, 0.5, 0.18], // broadleaf
];
const SED = [0.6, 0.5, 0.36];

function ramp(t, stops) {
  t = Math.max(0, Math.min(1, t));
  const n = stops.length - 1;
  const i = Math.min(n - 1, Math.floor(t * n));
  const f = t * n - i;
  const a = stops[i], b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const TEMP_RAMP = [[0.15, 0.1, 0.5], [0.1, 0.5, 0.95], [0.3, 0.8, 0.4], [0.95, 0.85, 0.2], [0.9, 0.25, 0.1], [0.5, 0.0, 0.1]];

export function cellColors(body, out, glow, overlay = 'none') {
  const s = body.surface;
  const g = s.grid;
  const tint = body.tint || [1, 1, 1];
  const n = s.count;
  let maxFlow = 0;
  if (overlay === 'runoff') for (let i = 0; i < n; i++) maxFlow = Math.max(maxFlow, s.flow[i]);
  for (let i = 0; i < n; i++) {
    const m = MATERIALS[s.mat[i]];
    let r = m.color[0] * tint[0], gg = m.color[1] * tint[1], b = m.color[2] * tint[2];
    // per-cell variation
    const v = ((i * 2654435761) >>> 0) / 4294967296;
    const vv = 0.92 + v * 0.16;
    r *= vv; gg *= vv; b *= vv;
    const area = g.omega[i] * s.ground[i] * s.ground[i];
    // loose sediment
    const sed = Math.min(1, s.sed[i] / 0.02);
    if (sed > 0) {
      r += (SED[0] * tint[0] - r) * sed * 0.7; gg += (SED[1] * tint[1] - gg) * sed * 0.7; b += (SED[2] * tint[2] - b) * sed * 0.7;
    }
    // organic darkening
    const org = Math.min(1, s.org[i] / (area * 0.01 + 1e-9));
    r *= 1 - org * 0.35; gg *= 1 - org * 0.3; b *= 1 - org * 0.35;
    // vegetation
    let vt = 0, vr = 0, vg = 0, vb = 0;
    for (let p = 0; p < PLANTS - 1; p++) {
      const x = s.veg[i * PLANTS + p];
      vt += x; vr += VEG_COL[p][0] * x; vg += VEG_COL[p][1] * x; vb += VEG_COL[p][2] * x;
    }
    if (vt > 0.001) {
      const k = Math.min(1, vt * 1.2);
      r += (vr / vt - r) * k; gg += (vg / vt - gg) * k; b += (vb / vt - b) * k;
    }
    // wetness
    const wet = s.wet[i];
    r *= 1 - wet * 0.38; gg *= 1 - wet * 0.32; b *= 1 - wet * 0.22;
    // storm damage and burn scars
    if (s.damage[i] > 0.01) {
      const d = Math.min(1, s.damage[i]) * 0.7;
      r += (0.48 - r) * d; gg += (0.36 - gg) * d; b += (0.22 - b) * d;
    }
    if (s.burnt[i] > 0.01) {
      const d = Math.min(1, s.burnt[i]) * 0.85;
      r += (0.1 - r) * d; gg += (0.09 - gg) * d; b += (0.08 - b) * d;
    }
    // snow / ice
    const iceT = s.ice[i] / (area + 1e-9);
    if (iceT > 0.0003) {
      const k = Math.min(1, iceT / 0.006);
      r += (0.93 - r) * k; gg += (0.96 - gg) * k; b += (1.0 - b) * k;
    }
    // cooled-lava crust is dark
    let gl = 0;
    if (s.lava[i] > 0) {
      const lt = s.lava[i] / (area + 1e-9);
      const k = Math.min(1, lt / 0.004);
      const T = s.lavaT[i];
      r += (0.16 - r) * k; gg += (0.1 - gg) * k; b += (0.08 - b) * k;
      gl = k * Math.min(1, T * 1.4);
    }
    gl = Math.max(gl, s.fire[i] * 0.9, s.heat[i] * 0.4);
    // overlays
    if (overlay !== 'none') {
      let c = null;
      switch (overlay) {
        case 'runoff': {
          const f = maxFlow > 0 ? Math.sqrt(s.flow[i] / maxFlow) : 0;
          c = [0.08 + 0.1 * f, 0.1 + 0.5 * f, 0.15 + 0.85 * f];
          break;
        }
        case 'sediment': {
          const dE = s.bed[i] + s.sed[i] - s.baseE[i];
          const k = Math.max(-1, Math.min(1, dE / 0.03));
          c = k < 0 ? [0.35 + 0.65 * -k, 0.3 * (1 + k), 0.25 * (1 + k)] : [0.3 * (1 - k), 0.35 + 0.6 * k, 0.25 * (1 - k)];
          if (s.susp[i] > 1e-5) c[2] = Math.min(1, c[2] + 0.5);
          break;
        }
        case 'temperature': c = ramp((s.temp[i] + 50) / 110, TEMP_RAMP); break;
        case 'moisture': {
          const cap = s.soilCapacity(i);
          const mm = cap > 0 ? s.sw[i] / cap : 0;
          c = ramp(mm, [[0.55, 0.4, 0.2], [0.85, 0.8, 0.4], [0.3, 0.7, 0.4], [0.1, 0.35, 0.8]]);
          break;
        }
        case 'clouds': {
          const cl = Math.min(1, s.cloud[i] / (area * 0.0008 + 1e-9));
          const hum = Math.min(1, s.vap[i] / (area * 0.002 + 1e-9));
          c = [0.15 + cl * 0.8, 0.2 + hum * 0.5 + cl * 0.5, 0.35 + hum * 0.4 + cl * 0.25];
          break;
        }
        case 'wind': {
          const w = Math.min(1, Math.hypot(s.windE[i], s.windN[i]) / 12);
          c = ramp(w, [[0.1, 0.15, 0.3], [0.2, 0.6, 0.6], [0.9, 0.9, 0.3], [0.95, 0.3, 0.2]]);
          break;
        }
        case 'life': {
          c = [0.2 + vt * 0.1, 0.2 + Math.min(1, vt) * 0.7, 0.2];
          break;
        }
      }
      if (c) { r = r * 0.25 + c[0] * 0.75; gg = gg * 0.25 + c[1] * 0.75; b = b * 0.25 + c[2] * 0.75; }
    }
    out[i * 3] = r; out[i * 3 + 1] = gg; out[i * 3 + 2] = b;
    glow[i] = gl;
  }
}
