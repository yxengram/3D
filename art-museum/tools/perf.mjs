#!/usr/bin/env node
// Frame-rate / draw-call / GPU-memory probe of the built page (dist/index.html), vsync off so the number is the real ceiling.
//   node tools/perf.mjs [--dpr 2] [--w 1440] [--h 900] [--page dist/index.html]
// GPU memory = tally of every buffer / texture / renderbuffer the page asks WebGL for (live objects), plus an estimate of the canvas back buffer.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), parent = path.resolve(root, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const dpr = +arg('dpr', 2), W = +arg('w', 1440), H = +arg('h', 900), pagePath = arg('page', 'index.html');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
let bytes = 0, reqs = 0;
const server = http.createServer((q, s) => { const f = path.join(parent, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { bytes += d.length; reqs++; s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(d); } }); }).listen(0);
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'), dir = fs.readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'].map((p) => path.join(cache, dir, p)).find(fs.existsSync);
const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--headless=new', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
await p.addInitScript(() => {
  const BPP = { 0x8058: 4, 0x8C43: 4, 0x881A: 8, 0x8814: 16, 0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822F: 4, 0x8230: 8, 0x8D62: 4, 0x8059: 4, 0x8C3A: 4, 0x81A5: 2, 0x81A6: 4, 0x8CAC: 4, 0x88F0: 4, 0x8CAD: 8, 0x1908: 4, 0x1907: 4, 0x1909: 1, 0x190A: 2, 0x1903: 1, 0x8227: 2, 0x8C41: 3, 0x8051: 3, 0x8C40: 3 };
  const P = WebGL2RenderingContext.prototype, buffers = new Map(), textures = new Map(), rbs = new Map(), bound = new WeakMap();
  const st = (gl) => { let s = bound.get(gl); if (!s) bound.set(gl, s = { unit: 0, tex: {}, buf: {}, rb: null }); return s; };
  const wrap = (name, f) => { const o = P[name]; P[name] = function (...a) { const r = o.apply(this, a); f.call(this, a, r); return r; }; };
  wrap('activeTexture', function ([u]) { st(this).unit = u; });
  wrap('bindTexture', function ([t, x]) { st(this).tex[st(this).unit + ':' + t] = x; });
  wrap('bindBuffer', function ([t, x]) { st(this).buf[t] = x; });
  wrap('bindRenderbuffer', function ([, x]) { st(this).rb = x; });
  wrap('bufferData', function ([t, d]) { const x = st(this).buf[t]; if (x) buffers.set(x, typeof d === 'number' ? d : d ? d.byteLength : 0); });
  const cur = (gl, t) => st(gl).tex[st(gl).unit + ':' + (t >= 0x8515 && t <= 0x851A ? 0x8513 : t)];
  const add = (gl, t, w, h, fmt, levels) => { const cube = t === 0x8513 || (t >= 0x8515 && t <= 0x851A) ? 6 : 1; let s = 0, a = w, c = h; for (let i = 0; i < levels; i++) { s += a * c; a = Math.max(1, a >> 1); c = Math.max(1, c >> 1); } textures.set(cur(gl, t), { bytes: s * (BPP[fmt] || 4) * cube, w, h, fmt, cube, mip: levels > 1 ? 1 : 0 }); };
  wrap('texStorage2D', function ([t, levels, fmt, w, h]) { add(this, t, w, h, fmt, levels); });
  const tex2d = P.texImage2D; P.texImage2D = function (...a) {
    const r = tex2d.apply(this, a); const [t, lvl, fmt] = a; if (lvl !== 0) return r;
    let w, h; if (a.length >= 8) { w = a[3]; h = a[4]; } else { const src = a[5]; w = src.videoWidth || src.width; h = src.videoHeight || src.height; }
    if (t >= 0x8515 && t <= 0x851A) { const e = textures.get(cur(this, t)); if (!e) add(this, t, w, h, fmt, 1); } else add(this, t, w, h, fmt, 1); return r;
  };
  wrap('generateMipmap', function ([t]) { const e = textures.get(cur(this, t)); if (e && !e.mip) { e.mip = 1; e.bytes = Math.round(e.bytes * 4 / 3); } });
  wrap('renderbufferStorage', function ([, fmt, w, h]) { rbs.set(st(this).rb, { bytes: w * h * (BPP[fmt] || 4), w, h, fmt }); });
  wrap('renderbufferStorageMultisample', function ([, s, fmt, w, h]) { rbs.set(st(this).rb, { bytes: w * h * (BPP[fmt] || 4) * Math.max(1, s), w, h, fmt, s }); });
  wrap('deleteBuffer', function ([x]) { buffers.delete(x); }); wrap('deleteTexture', function ([x]) { textures.delete(x); }); wrap('deleteRenderbuffer', function ([x]) { rbs.delete(x); });
  window.__gpuTally = () => {
    const mb = (n) => +(n / 1048576).toFixed(1), sum = (m) => [...m.values()].reduce((s, v) => s + (typeof v === 'number' ? v : v.bytes), 0);
    const top = (m) => [...m.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 10).map((e) => `${e.w}x${e.h}${e.cube > 1 ? ' cube' : ''} 0x${e.fmt.toString(16)}${e.mip ? ' mip' : ''} ${mb(e.bytes)}MB`);
    return { buffersMB: mb(sum(buffers)), texturesMB: mb(sum(textures)), renderbuffersMB: mb(sum(rbs)), counts: [buffers.size, textures.size, rbs.size], topTextures: top(textures), topRenderbuffers: top(rbs) };
  };
});
const t0 = Date.now();
await p.goto(`http://localhost:${server.address().port}/${path.basename(root)}/${pagePath}?dpr=${dpr}${arg('query') ? '&' + arg('query') : ''}`);
await p.waitForFunction('window.__ready===true', null, { timeout: 180000 }); const load = Date.now() - t0;
const startTex = await p.evaluate(async () => { await new Promise((r) => setTimeout(r, 800)); return window.__gpuTally().texturesMB; });
const views = {};
for (const v of ['exterior', 'lobby', 'gallery', 'medieval']) {
  views[v] = await p.evaluate(async (v) => {
    const m = window.__museum; m.ctl.setView(v, true); m.ctl.touched = false; await new Promise((r) => setTimeout(r, 1200));
    const ts = []; let last = performance.now();
    await new Promise((res) => { const f = () => { const n = performance.now(); ts.push(n - last); last = n; ts.length < 240 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
    ts.shift(); ts.sort((a, b) => a - b); const i = m.renderer.info; i.autoReset = false; i.reset(); m.step(0.016); const calls = i.render.calls, tris = i.render.triangles; i.autoReset = true;
    const c = m.renderer.getContext(); const t1 = performance.now(); for (let k = 0; k < 30; k++) m.step(0.016); c.finish(); const ms = (performance.now() - t1) / 30;
    return { fpsMedian: +(1000 / ts[Math.floor(ts.length / 2)]).toFixed(0), frameP95ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2), calls, tris, cpuGpuFrameMs: +ms.toFixed(2) };
  }, v);
}
const g = await p.evaluate(() => { const m = window.__museum, c = m.renderer.getContext(), e = c.getExtension('WEBGL_debug_renderer_info'); const t = window.__gpuTally();
  const w = m.renderer.domElement.width, h = m.renderer.domElement.height, samples = c.getParameter(c.SAMPLES) || 1;
  const back = (w * h * 4 * (samples + 1) + w * h * 4 * samples) / 1048576;   // MSAA colour + resolve + depth
  return { gpu: e && c.getParameter(e.UNMASKED_RENDERER_WEBGL), canvas: [w, h], samples, ...t, backbufferEstMB: +back.toFixed(1), totalMB: +(t.buffersMB + t.texturesMB + t.renderbuffersMB + back).toFixed(1), loadMsInPage: m.loadMs }; });
console.log(JSON.stringify({ viewport: [W, H], dpr, loadMs: load, texturesAtStartMB: startTex, downloadMB: +(bytes / 1048576).toFixed(2), requests: reqs, views, gpu: g }, null, 1));
await b.close(); server.close();
