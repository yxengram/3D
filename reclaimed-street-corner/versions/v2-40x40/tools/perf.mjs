// Real-time fps probe of the shipped page. node tools/perf.mjs [dpr=2] [w=1440] [h=900]
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dpr = +(process.argv[2] || 2), W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900);
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(d); } }); }).listen(0);
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'].map((p) => path.join(cache, dir, p)).find(fs.existsSync);
const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--headless=new', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
const t0 = Date.now(); await p.goto(`http://localhost:${server.address().port}/index.html`);
await p.waitForFunction('window.__ready===true', null, { timeout: 180000 }); const load = Date.now() - t0;
const r = await p.evaluate(async () => {
  const d = window.__diorama, c = d.renderer.getContext();
  const ext = c.getExtension('WEBGL_debug_renderer_info');
  await new Promise((r) => setTimeout(r, 1500));
  const ts = []; let last = performance.now();
  await new Promise((res) => { const f = () => { const n = performance.now(); ts.push(n - last); last = n; ts.length < 120 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
  ts.sort((a, b) => a - b); const i = d.renderer.info; i.autoReset = false; i.reset(); d.step(0.016); const calls = i.render.calls, tris = i.render.triangles; i.autoReset = true;
  const t1 = performance.now(); for (let k = 0; k < 20; k++) d.step(0.016, 1); c.finish(); const cpu = (performance.now() - t1) / 20;
  return { gpu: ext && c.getParameter(ext.UNMASKED_RENDERER_WEBGL), fpsMedian: +(1000 / ts[60]).toFixed(1), p95ms: +ts[114].toFixed(1), calls, tris, stepMs: +cpu.toFixed(1), size: [d.renderer.domElement.width, d.renderer.domElement.height] };
});
console.log(JSON.stringify({ load, ...r })); await b.close(); server.close();
