#!/usr/bin/env node
// Interaction check on the real page (not shot mode): tabs, keyboard walking, click-to-move, drag-look, orbit drag/zoom, route plaza -> lobby -> gallery.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), parent = path.resolve(root, '..');
const pagePath = process.argv[2] || 'dev.html';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
const server = http.createServer((q, s) => { const f = path.join(parent, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(d); } }); }).listen(0);
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'), dir = fs.readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'].map((p) => path.join(cache, dir, p)).find(fs.existsSync);
const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--headless=new'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }); const errs = [];
p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text().slice(0, 200)); }); p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:${server.address().port}/${path.basename(root)}/${pagePath}`); await p.waitForFunction('window.__ready===true', null, { timeout: 120000 });
const R = {}; const state = () => p.evaluate(() => { const c = window.__museum.ctl, cam = window.__museum.camera; return { mode: c.mode, pos: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)], yaw: +c.yaw.toFixed(3), fov: +cam.fov.toFixed(1), az: +c.orbit.az.toFixed(3), r: +c.orbit.r.toFixed(1), tab: [...document.querySelectorAll('#tabs button.on')].map((x) => x.textContent).join(), exp: +window.__museum.renderer.toneMappingExposure.toFixed(3) }; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(600); R.start = await state();
await p.mouse.move(640, 400); await p.mouse.down(); await p.mouse.move(840, 360, { steps: 8 }); await p.mouse.up(); await p.mouse.wheel(0, -600); await wait(700); R.orbitDragZoom = await state();
await p.screenshot({ path: path.join(root, '.shots', 'ui_exterior.png') });
await p.click('#tabs button[data-view=lobby]'); await wait(900); R.lobby = await state();
await p.keyboard.down('KeyW'); await wait(1500); await p.keyboard.up('KeyW'); await wait(300); R.afterW = await state();
await p.mouse.move(640, 400); await p.mouse.down(); await p.mouse.move(440, 400, { steps: 8 }); await p.mouse.up(); await wait(400); R.afterDrag = await state();
await p.mouse.click(640, 620); await wait(2500); R.afterClickMove = await state();
await p.screenshot({ path: path.join(root, '.shots', 'ui_lobby.png') });
await p.keyboard.press('3'); await wait(900); R.gallery = await state(); await p.mouse.wheel(0, -500); await wait(500); R.galleryZoom = await state();
await p.screenshot({ path: path.join(root, '.shots', 'ui_gallery.png') });
// route check: every 0.25 m along plaza -> door -> lobby -> portal -> gallery must be walkable; and walls must block
R.route = await p.evaluate(() => {
  const c = window.__museum.ctl; const pts = [[0, -30], [0, -8], [0, -3], [0, 2], [6, 7.7], [10.5, 7.7], [12.5, 7.7], [15, 7.7], [15, 3], [24, 3], [24, 12.5], [34, 12.5], [34, 8]]; const bad = [];
  for (let i = 0; i + 1 < pts.length; i++) { const [a, b] = [pts[i], pts[i + 1]]; const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25); for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n; if (!c.free(x, -y)) bad.push([+x.toFixed(2), +y.toFixed(2)]); } }
  const blocked = [[-11.2, 5], [11.2, 3], [17.2, 8], [0, 15.6], [25, -8], [5, -0.05], [-9, 6], [-6, 10.4], [37.6, 8], [22, 8]].filter(([x, y]) => c.free(x, -y));
  return { unwalkable: bad.slice(0, 6), shouldBeBlockedButFree: blocked };
});
// walk physically from the lobby start to the gallery with the keyboard-free goal mechanism
R.walkToGallery = await p.evaluate(async () => { const m = window.__museum, c = m.ctl; c.setView('lobby', true); for (const g of [[8, 7.7], [13.5, 7.7]]) { c.goal = new m.camera.position.constructor(g[0], 0, -g[1]); c.stuck = 0; for (let i = 0; i < 400 && c.goal; i++) m.step(1 / 60, true); } return [+c.pos.x.toFixed(2), +(-c.pos.z).toFixed(2)]; });
console.log(JSON.stringify(R, null, 1)); console.log('errors:', errs);
await b.close(); server.close();
