#!/usr/bin/env node
// Headless check of the real page: node tools/shot.mjs [--assets build/t1] [--cams name,name|all] [--out .shots] [--w 1440 --h 900] [--dpr 1] [--page index.html] [--js expr]
// Cameras are Blender coordinates (x east, y north, z up): [pos, look, fov]. Prints console errors and render stats.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), parent = path.resolve(root, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
export const CAMS = {
  ext_se: [[40, -62, 15], [3, 2, 5], 40], ext_sw: [[-48, -50, 9], [-2, 2, 5], 40], ext_front: [[2, -70, 6], [2, 0, 6], 38], ext_top: [[30, -55, 60], [6, 0, 0], 40],
  ext_ne: [[62, 54, 22], [6, 8, 5], 40], ext_nw: [[-60, 46, 18], [0, 8, 5], 40], ext_pool: [[40, -20, 2.2], [10, 2, 5], 50], ext_door: [[4, -17, 1.62], [-1, 4, 4.6], 62],
  ext_portico: [[-9.5, -2.6, 1.62], [10, -2.0, 4.5], 68], ext_sculpt: [[-22, -34, 1.62], [-27, -24, 3.5], 55],
  lob_in: [[0.6, 1.6, 1.62], [-2.5, 12, 4.6], 68], lob_e: [[-9, 2.0, 1.62], [8, 9, 4.0], 68], lob_w: [[9.5, 12.5, 1.62], [-6, 4, 3.6], 68], lob_up: [[3, 5, 1.62], [1, 8, 10], 75],
  lob_out: [[2, 12.2, 1.62], [-1, 0, 3.2], 68], lob_desk: [[-5.5, 6.2, 1.62], [-10, 5.6, 1.5], 60], lob_portal: [[5, 7.7, 1.62], [14, 7.7, 1.7], 60], lob_floor: [[7, 9, 1.62], [-4, 2, 0.2], 60],
  lob_stair: [[-3, 6.5, 1.62], [-7, 10.4, 2.4], 62], lob_mezz: [[6, 9.0, 1.62], [2, 15, 3.0], 62],
  gal_in: [[12.2, 7.7, 1.62], [17, 7.2, 1.7], 62], gal_mid: [[22.3, 5.0, 1.62], [30, 13, 1.8], 68], gal_e: [[36.4, 13.8, 1.62], [24, 4, 1.5], 68], gal_n: [[20, 9.5, 1.62], [19.6, 15, 1.6], 55],
  gal_close: [[23.2, 12.6, 1.62], [23.2, 15, 1.56], 50], gal_s: [[26, 6, 1.62], [27.1, 1, 1.5], 60], gal_hero: [[31.5, 8, 1.62], [37.4, 8, 1.6], 60], gal_floor: [[14, 3, 1.62], [24, 9, 0.3], 62],
  gal_ceil: [[19.5, 3.4, 1.62], [26, 9, 5.6], 70], gal_back: [[33, 3.2, 1.62], [14, 9, 1.8], 68],
  gal_label: [[19.9, 13.9, 1.45], [20.55, 15, 1.25], 40], gal_corner: [[34.5, 3.6, 1.62], [37.4, 1, 0.4], 55], gal_title: [[14.2, 9.6, 1.62], [17, 9.85, 1.8], 55], gal_west: [[16, 12.6, 1.62], [11.4, 12.4, 1.7], 60],
  lob_corner: [[-7, 12.6, 1.62], [-11, 15.4, 1.2], 60], lob_glass: [[-6.5, 1.6, 1.62], [-8.8, 0, 2.6], 55], lob_door: [[0, 3.2, 1.62], [0, -6, 1.8], 62], lob_bench: [[4.2, 4.6, 1.62], [6.4, 2.95, 0.3], 50],
  lob_tap: [[0, 6, 1.62], [0, 15.4, 7.3], 50], lob_ne: [[2, 3, 1.62], [11, 15.4, 5], 68],
  ext_back: [[6, 70, 12], [6, 20, 6], 40], ext_fins: [[20, -3.2, 1.62], [30, 0.4, 3.2], 55], ext_roof: [[-4, -24, 40], [0, 8, 10], 35], ext_name: [[-20, -14, 1.62], [-21, -5.5, 3.6], 62],
  med_in: [[-12.6, 13.5, 1.62], [-31, 13.5, 2.6], 62], med_mid: [[-18, 14.6, 1.62], [-31, 13.2, 2.6], 68], med_altar: [[-26.6, 13.5, 1.62], [-31, 13.5, 2.5], 60], med_n: [[-18.2, 11.6, 1.62], [-18.2, 16.5, 1.9], 70],
  med_s: [[-19.5, 15.4, 1.62], [-19.8, 10.5, 1.6], 70], med_vault: [[-14, 12.2, 1.62], [-26, 14.5, 8], 75], med_back: [[-27.2, 12.4, 1.62], [-11.8, 13.6, 2.2], 68], med_close: [[-16.6, 14.3, 1.62], [-16.6, 16.5, 1.8], 55],
  med_label: [[-13.1, 15.5, 1.5], [-12.6, 16.5, 1.25], 40], med_title: [[-14.2, 13.4, 1.62], [-13.4, 10.5, 1.9], 60], med_floor: [[-14, 15.5, 1.62], [-22, 12, 0], 62], med_leaves: [[-26.2, 12.4, 1.62], [-26.2, 10.5, 1.55], 50],
  lob_meddoor: [[-6.5, 13.4, 1.62], [-11.4, 13.5, 1.9], 60], lob_nw: [[-3, 6.5, 1.62], [-11, 13.5, 2.2], 62], ext_nave: [[-62, -14, 16], [-21, 13, 7], 38], ext_navew: [[-58, 13.5, 6], [-31, 13.5, 8], 40],
  ext_far: [[95, -95, 11], [3, 3, 5], 40], ext_low: [[-30, -40, 2.4], [3, 3, 5], 40], ext_west: [[-70, 4, 9], [-20, 6, 4], 40], ext_east: [[75, 6, 8], [30, 8, 3], 40], ext_plaza: [[-14, -38, 1.62], [-8, -10, 3], 62],
};
if (process.argv[1] && process.argv[1].endsWith('shot.mjs')) {
  const out = path.resolve(root, arg('out', '.shots')); fs.mkdirSync(out, { recursive: true });
  const raw = arg('cams', 'ext_se,lob_in,gal_in'); const cams = raw === 'all' ? Object.keys(CAMS) : raw.trim().startsWith('[') ? raw.split(';') : raw.split(',');   // names, or JSON cameras separated by ';'
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
  const server = http.createServer((q, s) => {
    const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(parent, u);
    fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(d); } });
  }).listen(0);
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'); const dir = fs.readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
  const exe = ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'].map((p) => path.join(cache, dir, p)).find(fs.existsSync);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--headless=new'] });
  const page = await browser.newPage({ viewport: { width: +arg('w', 1440), height: +arg('h', 900) }, deviceScaleFactor: +arg('dpr', 1) });
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 500)); });
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  const q = new URLSearchParams({ shot: '1' }); if (arg('assets')) q.set('assets', arg('assets')); for (const [k, v] of new URLSearchParams(arg('query', ''))) q.set(k, v);
  await page.goto(`http://localhost:${server.address().port}/${path.basename(root)}/${arg('page', 'dev.html')}?${q}`);
  await page.waitForFunction('window.__ready===true', null, { timeout: 120000 }).catch((e) => logs.push('[timeout] ' + e.message));
  if (!(await page.evaluate('window.__ready===true'))) { for (const l of [...new Set(logs)].slice(0, 30)) console.log(l); await browser.close(); server.close(); process.exit(1); }
  let stat = {};
  for (const c of cams) {
    const [pos, look, fov] = CAMS[c] || JSON.parse(c);
    stat[c] = await page.evaluate(async ([pos, look, fov]) => {
      const m = window.__museum; m.setCam(pos, look, fov); m.step(0.016); await new Promise((r) => setTimeout(r, 120));
      const i = m.renderer.info; i.autoReset = false; i.reset(); m.step(0.016); const r = { calls: i.render.calls, tris: i.render.triangles }; i.autoReset = true; return r;
    }, [pos, look, fov]);
    await page.screenshot({ path: path.join(out, `${c.replace(/[^\w]/g, '_').slice(0, 40)}.png`) });
  }
  const extra = arg('js') ? await page.evaluate(arg('js')) : undefined;
  const mem = await page.evaluate(() => { const i = window.__museum.renderer.info; return { geometries: i.memory.geometries, textures: i.memory.textures, loadMs: window.__museum.loadMs }; }).catch(() => ({}));
  await browser.close(); server.close();
  for (const l of [...new Set(logs)].slice(0, 30)) console.log(l);
  console.log(JSON.stringify({ stat, mem, extra, errors: logs.filter((l) => /error/i.test(l)).length }));
}
