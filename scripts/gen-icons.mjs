/**
 * Generates the PWA PNG icon set from code (no native deps) so the app installs
 * cleanly on Android (maskable), iOS (apple-touch-icon) and desktop.
 *
 * Draws the brand mark: three ascending chartreuse bars on the dark base,
 * matching public/icon.svg. Run: `node scripts/gen-icons.mjs`.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = resolve(ROOT, "public");

const BG = [0x14, 0x16, 0x1a]; // --bg #14161A
const FG = [0xc7, 0xf2, 0x4a]; // --signal chartreuse

/* --- CRC32 (for PNG chunks) --- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Draw the icon into an RGBA buffer. `pad` is the safe-zone inset fraction. */
function draw(size, pad) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = BG[0];
    buf[i * 4 + 1] = BG[1];
    buf[i * 4 + 2] = BG[2];
    buf[i * 4 + 3] = 255;
  }
  const inset = Math.round(size * pad);
  const area = size - inset * 2;
  const gap = Math.round(area * 0.12);
  const barW = Math.round((area - gap * 2) / 3);
  const bottom = size - inset;
  const heights = [0.42, 0.68, 1.0]; // ascending
  for (let b = 0; b < 3; b++) {
    const x0 = inset + b * (barW + gap);
    const h = Math.round(area * heights[b]);
    const y0 = bottom - h;
    const radius = Math.round(barW * 0.18);
    for (let y = y0; y < bottom; y++) {
      for (let x = x0; x < x0 + barW; x++) {
        // round only the TOP corners of each bar
        const dxL = x - x0;
        const dxR = x0 + barW - 1 - x;
        const dyT = y - y0;
        if (dyT < radius) {
          const dx = Math.min(dxL, dxR);
          if (dx < radius) {
            const ddx = radius - dx;
            const ddy = radius - dyT;
            if (ddx * ddx + ddy * ddy > radius * radius) continue;
          }
        }
        const i = (y * size + x) * 4;
        buf[i] = FG[0];
        buf[i + 1] = FG[1];
        buf[i + 2] = FG[2];
        buf[i + 3] = 255;
      }
    }
  }
  return buf;
}

mkdirSync(PUBLIC, { recursive: true });
const targets = [
  { file: "icon-192.png", size: 192, pad: 0.2 },
  { file: "icon-512.png", size: 512, pad: 0.2 },
  // maskable: keep the mark inside the inner 60% safe zone
  { file: "icon-512-maskable.png", size: 512, pad: 0.28 },
  { file: "apple-touch-icon.png", size: 180, pad: 0.18 },
];
for (const t of targets) {
  writeFileSync(resolve(PUBLIC, t.file), encodePNG(t.size, draw(t.size, t.pad)));
  console.log("wrote public/" + t.file);
}
