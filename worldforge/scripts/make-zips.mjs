// Builds release/worldforge-source.zip and release/worldforge-dist.zip with a
// small built-in ZIP writer (deflate via node:zlib) — no external tools needed.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'release');
mkdirSync(out, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zip(files, dest) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = deflateRawSync(data, { level: 9 });
    const useComp = comp.length < data.length;
    const body = useComp ? comp : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(useComp ? 8 : 0, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(useComp ? 8 : 0, 10);
    cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(dest, Buffer.concat([...chunks, cenBuf, end]));
  return statSync(dest).size;
}

function collect(dir, base, prefix, skip) {
  const files = [];
  (function walk(d) {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      const rel = relative(base, p).split('\\').join('/');
      if (skip(rel, f)) continue;
      if (statSync(p).isDirectory()) walk(p);
      else files.push({ name: prefix + rel, data: readFileSync(p) });
    }
  })(dir);
  return files;
}

const skipSrc = (rel, f) => ['node_modules', 'dist', 'release', 'test-results', '.git'].includes(rel.split('/')[0]) || f === '.DS_Store';
const src = collect(root, root, 'worldforge/', skipSrc);
const s1 = zip(src, join(out, 'worldforge-source.zip'));
console.log(`release/worldforge-source.zip  ${src.length} files, ${(s1 / 1024).toFixed(0)} KB`);
if (!existsSync(join(root, 'dist', 'index.html'))) { console.error('dist/ missing: run npm run build first'); process.exit(1); }
const distFiles = collect(join(root, 'dist'), join(root, 'dist'), 'worldforge/', () => false);
const s2 = zip(distFiles, join(out, 'worldforge-dist.zip'));
console.log(`release/worldforge-dist.zip    ${distFiles.length} files, ${(s2 / 1024).toFixed(0)} KB`);
