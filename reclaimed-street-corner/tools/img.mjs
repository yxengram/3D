#!/usr/bin/env node
// Small PNG helpers for comparing renders (no dependencies):
//   node tools/img.mjs diff a.png b.png [out.png]        pixel difference count, and optionally a difference image
//   node tools/img.mjs crop in.png x y w h out.png [k]   crop, integer upscale k
//   node tools/img.mjs side out.png k x y w h a.png b.png ...   same crop of several renders, side by side
//   node tools/img.mjs sheet out.png cols shrink a.png b.png ... contact sheet, each render shrunk by an integer
import zlib from 'node:zlib'; import fs from 'node:fs';
function read(file) {
  const b = fs.readFileSync(file); let p = 8, w, h, depth, ctype; const idat = [];
  while (p < b.length) {
    const n = b.readUInt32BE(p), t = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + n); p += 12 + n;
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; if (depth !== 8 || d[12]) throw new Error('8-bit non-interlaced only'); }
    if (t === 'IDAT') idat.push(d);
  }
  const ch = { 2: 3, 6: 4, 0: 1 }[ctype], raw = zlib.inflateSync(Buffer.concat(idat)), s = w * ch, px = new Uint8Array(w * h * 4);
  const cur = new Uint8Array(s); let prev = new Uint8Array(s), q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++];
    for (let x = 0; x < s; x++) {
      const a = x >= ch ? cur[x - ch] : 0, u = prev[x], c = x >= ch ? prev[x - ch] : 0; let v = raw[q++];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1; else if (f === 4) { const r = a + u - c, pa = Math.abs(r - a), pb = Math.abs(r - u), pc = Math.abs(r - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      cur[x] = v;
    }
    for (let x = 0; x < w; x++) { px[(y * w + x) * 4] = cur[x * ch]; px[(y * w + x) * 4 + 1] = cur[x * ch + (ch > 2 ? 1 : 0)]; px[(y * w + x) * 4 + 2] = cur[x * ch + (ch > 2 ? 2 : 0)]; px[(y * w + x) * 4 + 3] = 255; }
    prev = Uint8Array.from(cur);
  }
  return { w, h, px };
}
const crc = (buf) => { let c, r = -1 >>> 0; for (const b of buf) { c = (r ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; r = (r >>> 8) ^ c; } return (r ^ -1) >>> 0; };
function write(file, { w, h, px }) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(px.buffer, px.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'latin1'), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 3 })), chunk('IEND', Buffer.alloc(0))]));
}
const crop = (im, x, y, w, h, k = 1) => {
  const px = new Uint8Array(w * k * h * k * 4);
  for (let j = 0; j < h * k; j++) for (let i = 0; i < w * k; i++) { const s = (Math.floor(j / k) + y) * im.w + Math.floor(i / k) + x; for (let c = 0; c < 4; c++) px[(j * w * k + i) * 4 + c] = im.px[s * 4 + c]; }
  return { w: w * k, h: h * k, px };
};
const [, , cmd, ...a] = process.argv;
if (cmd === 'diff') {
  const A = read(a[0]), B = read(a[1]); if (A.w !== B.w || A.h !== B.h) throw new Error('sizes differ');
  let n = 0, big = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; const out = new Uint8Array(A.px.length);
  for (let i = 0; i < A.w * A.h; i++) {
    let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(A.px[i * 4 + c] - B.px[i * 4 + c]));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = Math.min(255, m * 6); out[i * 4 + 3] = 255;
    if (m) { n++; sum += m; if (m > 16) big++; const x = i % A.w, y = (i / A.w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  console.log(JSON.stringify({ pixels: A.w * A.h, differing: n, over16: big, meanDiff: n ? +(sum / n).toFixed(2) : 0, bbox: n ? [x0, y0, x1, y1] : null }));
  if (a[2]) write(a[2], { w: A.w, h: A.h, px: out });
} else if (cmd === 'crop') {
  const [i, x, y, w, h, o, k] = a; write(o, crop(read(i), +x, +y, +w, +h, +(k || 1)));
} else if (cmd === 'side') {
  const [o, k, x, y, w, h, ...files] = a; const imgs = files.map((f) => crop(read(f), +x, +y, +w, +h, +k)), gap = 6, W = imgs.reduce((s, m) => s + m.w, 0) + gap * (imgs.length - 1), H = imgs[0].h, px = new Uint8Array(W * H * 4).fill(255);
  let X = 0; for (const m of imgs) { for (let j = 0; j < m.h; j++) px.set(m.px.subarray(j * m.w * 4, (j + 1) * m.w * 4), (j * W + X) * 4); X += m.w + gap; }
  write(o, { w: W, h: H, px });
} else if (cmd === 'sheet') { // sheet out.png cols shrink a.png b.png ...
  const [o, c, k, ...files] = a, cols = +c, K = +k, imgs = files.map(read), cw = (imgs[0].w / K) | 0, ch = (imgs[0].h / K) | 0, rows = Math.ceil(imgs.length / cols), gap = 4, W = cols * cw + (cols - 1) * gap, H = rows * ch + (rows - 1) * gap, px = new Uint8Array(W * H * 4).fill(255);
  imgs.forEach((m, n) => { const ox = (n % cols) * (cw + gap), oy = ((n / cols) | 0) * (ch + gap); for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const q = ((j + oy) * W + i + ox) * 4; for (let e = 0; e < 3; e++) { let t = 0; for (let v = 0; v < K; v++) for (let u = 0; u < K; u++) t += m.px[((j * K + v) * m.w + i * K + u) * 4 + e]; px[q + e] = t / (K * K); } } });
  write(o, { w: W, h: H, px });
} else { console.error('usage: diff | crop | side | sheet'); process.exit(1); }
