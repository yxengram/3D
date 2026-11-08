#!/usr/bin/env node
// GPU memory of the real page: tallies every buffer, texture and renderbuffer the page asks WebGL for (live objects only), at the budget's 2880×1800.
//   node tools/gpumem.mjs [dpr=2] [w=1440] [h=900] [--only a,b]
// Also prints the macOS "In use system memory" of the GPU before and after; that is whole-system and noisy, the tally is the number to trust.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pos = process.argv.slice(2).filter((a, i, l) => !a.startsWith('--') && !(l[i - 1] || '').startsWith('--'));
const dpr = +(pos[0] || 2), W = +(pos[1] || 1440), H = +(pos[2] || 900), oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1] : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(d); } }); }).listen(0);
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'), dir = fs.readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'].map((p) => path.join(cache, dir, p)).find(fs.existsSync);
const sys = () => { try { const m = execSync('ioreg -r -d 1 -c IOAccelerator').toString().match(/"In use system memory"=(\d+)/); return m ? Math.round(+m[1] / 1048576) : null; } catch { return null; } };
const before = sys();
const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--headless=new'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
await p.addInitScript(() => {
  const BPP = { 0x8058: 4, 0x8C43: 4, 0x881A: 8, 0x8814: 16, 0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822F: 4, 0x8230: 8, 0x8D62: 4, 0x8059: 4, 0x8C3A: 4, 0x81A5: 2, 0x81A6: 4, 0x8CAC: 4, 0x88F0: 4, 0x8CAD: 8, 0x1908: 4, 0x1907: 4, 0x1909: 1, 0x190A: 2, 0x1903: 1, 0x8227: 2 };
  const P = WebGL2RenderingContext.prototype, buffers = new Map(), textures = new Map(), rbs = new Map(), bound = new WeakMap();
  const st = (gl) => { let s = bound.get(gl); if (!s) bound.set(gl, s = { unit: 0, tex: {}, buf: {}, rb: null }); return s; };
  const wrap = (name, f) => { const o = P[name]; P[name] = function (...a) { const r = o.apply(this, a); f.call(this, a, r); return r; }; };
  wrap('activeTexture', function ([u]) { st(this).unit = u; });
  wrap('bindTexture', function ([t, x]) { st(this).tex[st(this).unit + ':' + t] = x; });
  wrap('bindBuffer', function ([t, x]) { st(this).buf[t] = x; });
  wrap('bindRenderbuffer', function ([, x]) { st(this).rb = x; });
  wrap('bufferData', function ([t, d]) { const x = st(this).buf[t]; if (x) buffers.set(x, typeof d === 'number' ? d : d ? d.byteLength : 0); });
  const cur = (gl, t) => st(gl).tex[st(gl).unit + ':' + t];
  wrap('texStorage2D', function ([t, levels, fmt, w, h]) { let s = 0, a = w, b = h; for (let i = 0; i < levels; i++) { s += a * b; a = Math.max(1, a >> 1); b = Math.max(1, b >> 1); } textures.set(cur(this, t), { bytes: s * (BPP[fmt] || 4), w, h, fmt }); });

  const tex2d = P.texImage2D; P.texImage2D = function (...a) {
    const r = tex2d.apply(this, a); const [t, lvl, fmt] = a; if (lvl !== 0) return r;
    let w, h, src; if (a.length >= 8) { w = a[3]; h = a[4]; } else { src = a[5]; w = src.videoWidth || src.width; h = src.videoHeight || src.height; }
    textures.set(cur(this, t), { bytes: w * h * (BPP[fmt] || 4), w, h, fmt }); return r;
  };
  wrap('generateMipmap', function ([t]) { const e = textures.get(cur(this, t)); if (e && !e.mip) { e.mip = 1; e.bytes = Math.round(e.bytes * 4 / 3); } });
  wrap('renderbufferStorage', function ([, fmt, w, h]) { rbs.set(st(this).rb, { bytes: w * h * (BPP[fmt] || 4), w, h, fmt }); });
  wrap('renderbufferStorageMultisample', function ([, s, fmt, w, h]) { rbs.set(st(this).rb, { bytes: w * h * (BPP[fmt] || 4) * s, w, h, fmt, s }); });
  wrap('deleteBuffer', function ([x]) { buffers.delete(x); });
  wrap('deleteTexture', function ([x]) { textures.delete(x); });
  wrap('deleteRenderbuffer', function ([x]) { rbs.delete(x); });
  window.__gpuTally = () => {
    const mb = (n) => +(n / 1048576).toFixed(1), sum = (m) => [...m.values()].reduce((s, v) => s + (typeof v === 'number' ? v : v.bytes), 0);
    const top = (m) => [...m.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 12).map((e) => `${e.w}x${e.h} 0x${e.fmt.toString(16)}${e.s ? ' x' + e.s : ''}${e.mip ? ' mip' : ''} ${mb(e.bytes)}MB`);
    const bu = sum(buffers), te = sum(textures), rb = sum(rbs);
    return { totalMB: mb(bu + te + rb), buffersMB: mb(bu), texturesMB: mb(te), renderbuffersMB: mb(rb), counts: [buffers.size, textures.size, rbs.size], topTextures: top(textures), topRenderbuffers: top(rbs) };
  };
});
const qi = process.argv.indexOf('--query'), extra = qi > 0 ? '&' + process.argv[qi + 1] : '';
const url = `http://localhost:${server.address().port}/index.html?shot=1&t=8&cam=hero${only ? '&only=' + only : ''}${extra}`;
await p.goto(url); await p.waitForFunction('window.__ready===true', null, { timeout: 180000 });
await p.evaluate(async () => { const d = window.__diorama; d.step(0); d.step(0); await new Promise((r) => setTimeout(r, 2000)); });
const r = await p.evaluate(() => ({ ...window.__gpuTally(), size: [window.__diorama.renderer.domElement.width, window.__diorama.renderer.domElement.height], shadow: window.__diorama.scene.children.find((c) => c.isDirectionalLight)?.shadow.mapSize.x }));
const after = sys(); await b.close(); server.close();
console.log(JSON.stringify({ ...r, systemInUseMB: { before, after, delta: after - before } }, null, 1));
