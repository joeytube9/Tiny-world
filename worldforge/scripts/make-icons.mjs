// Generates PNG app icons procedurally (no external assets) with a tiny PNG encoder.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(root, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h >>> 0) / 4294967296; };
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function draw(size, pad) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2, R = size * (0.5 - pad) * 0.78;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    // background: deep space gradient
    const g = 1 - Math.hypot(x - cx, y - cy) / (size * 0.75);
    let r = 6 + 20 * g, gg = 9 + 26 * g, b = 20 + 50 * g;
    const st = hash(x, y);
    if (st > 0.9975) { r = gg = b = 200 + st * 55; }
    const dx = (x - cx) / R, dy = (y - cy) / R;
    const d2 = dx * dx + dy * dy;
    // orbit ring
    const ring = Math.abs(Math.hypot(dx * 1.0, (dy + dx * 0.35) * 2.6) - 1.45);
    if (ring < 0.035 && !(d2 < 1 && dy + dx * 0.35 < 0)) { r = 255; gg = 207; b = 106; }
    if (d2 < 1) {
      const z = Math.sqrt(1 - d2);
      const light = Math.max(0.08, (-dx * 0.55 - dy * 0.45 + z * 0.7));
      const n = noise(dx * 3 + 10, dy * 3 + 10) * 0.65 + noise(dx * 7, dy * 7) * 0.35;
      const land = n > 0.55;
      let cr, cg, cb;
      if (land) { cr = 70 + n * 60; cg = 140 + n * 40; cb = 70; if (n > 0.72) { cr = 150; cg = 130; cb = 105; } }
      else { cr = 25; cg = 90 + n * 50; cb = 190 + n * 40; }
      if (Math.abs(dy) > 0.82) { cr = cg = cb = 235; }
      r = cr * light; gg = cg * light; b = cb * light;
      const rim = Math.pow(1 - z, 3);
      r += 60 * rim; gg += 140 * rim; b += 255 * rim;
    } else if (d2 < 1.12) {
      const t = 1 - (Math.sqrt(d2) - 1) / 0.06;
      r += 40 * t; gg += 120 * t; b += 220 * t;
    }
    buf[i] = Math.min(255, r); buf[i + 1] = Math.min(255, gg); buf[i + 2] = Math.min(255, b); buf[i + 3] = 255;
  }
  return png(size, size, buf);
}
writeFileSync(join(root, 'icon-192.png'), draw(192, 0.04));
writeFileSync(join(root, 'icon-512.png'), draw(512, 0.04));
writeFileSync(join(root, 'icon-maskable-512.png'), draw(512, 0.14));
writeFileSync(join(root, 'apple-touch-icon.png'), draw(180, 0.04));
console.log('icons written to', root);
