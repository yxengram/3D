#!/usr/bin/env node
// Headless verification. Renders the real page in Chromium, prints errors + render stats, saves PNGs.
//   node tools/shot.mjs --only banyan,building --cams hero,front --out /some/dir [--t 12] [--w 1280 --h 800] [--js "expr"]
// With no --only, all modules load. Stats are printed as JSON on the last line.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('only'), cams = (arg('cams', 'hero')).split(','), out = arg('out', path.join(root, '.shots')), T = arg('t', '8'), W = +arg('w', 1280), H = +arg('h', 800), JS = arg('js');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((q, s) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); const p = f.endsWith('/') ? f + 'index.html' : f;
  fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); } });
}).listen(0);
const port = server.address().port;
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const dir = fs.readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'].map((p) => path.join(cache, dir, p)).find(fs.existsSync);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--headless=new'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: +arg('dpr', '1') });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 600)); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
const q = new URLSearchParams({ shot: '1', t: T, cam: cams[0] }); if (only) q.set('only', only);
await page.goto(`http://localhost:${port}/index.html?${q}`);
await page.waitForFunction('window.__ready===true', null, { timeout: 180000 }).catch((e) => logs.push('[timeout] ' + e.message));
let result = {};
if (arg('pre')) await page.evaluate(arg('pre'));
for (const c of cams) {
  result = await page.evaluate(async (c) => {
    const d = window.__diorama; d.setCam(c); d.step(0); await new Promise((r) => setTimeout(r, 300));
    const i = d.renderer.info; i.autoReset = false; i.reset(); d.step(0); const calls = i.render.calls, triangles = i.render.triangles; i.autoReset = true;
    return { calls, triangles, geometries: i.memory.geometries, textures: i.memory.textures, modules: d.stats.modules };
  }, c);
  await page.screenshot({ path: path.join(out, `${c}.png`) });
}
const extra = JS ? await page.evaluate(JS) : undefined;
await browser.close(); server.close();
for (const l of [...new Set(logs)].slice(0, 30)) console.log(l);
console.log(JSON.stringify({ ...result, extra, errors: logs.filter((l) => /error/i.test(l)).length }));
