// Exercises the shipped single HTML over file:// : repeated loads, real pointer input, live console, DOM cleanliness.
import { chromium } from 'playwright-core'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { pathToFileURL } from 'node:url';
const file = path.resolve('被自然收回的城市街角.html'), out = process.argv[2] || '.shots/final';
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright'), dir = fs.readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'].map((p) => path.join(cache, dir, p)).find(fs.existsSync);
const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--headless=new'] });
const logs = []; const report = {};
const bad = [];
for (let i = 0; i < 6; i++) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 300)); }); p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await p.goto(pathToFileURL(file).href); await p.waitForFunction('window.__ready===true', null, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1500));
  const png = await p.screenshot({ path: path.join(out, `load${i}.png`) });
  const mean = await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 64; c.height = 40; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(document.querySelector('canvas'), 0, 0, 64, 40); const d = g.getImageData(0, 0, 64, 40).data; let m = [0, 0, 0]; for (let k = 0; k < d.length; k += 4) for (let j = 0; j < 3; j++) m[j] += d[k + j]; return m.map((v) => Math.round(v / (d.length / 4))); });
  bad.push(mean);
  if (i === 5) {
    report.dom = await p.evaluate(() => [...document.body.children].map((e) => e.tagName).filter((t) => t !== 'SCRIPT'));
    const cam = () => p.evaluate(() => { const c = window.__diorama.camera.position; return [c.x, c.y, c.z].map((v) => +v.toFixed(2)); });
    report.cam0 = await cam();
    await p.mouse.move(640, 400); await p.mouse.down(); await p.mouse.move(420, 340, { steps: 12 }); await p.mouse.up(); await new Promise((r) => setTimeout(r, 900)); report.afterRotate = await cam();
    await p.mouse.wheel(0, -900); await new Promise((r) => setTimeout(r, 900)); report.afterZoom = await cam();
    await p.mouse.move(640, 400); await p.mouse.down({ button: 'right' }); for (let k = 0; k < 6; k++) await p.mouse.move(640 - 200 * (k + 1), 400, { steps: 4 }); await p.mouse.up(); await new Promise((r) => setTimeout(r, 900));
    report.panTarget = await p.evaluate(() => window.__diorama.controls.target.toArray().map((v) => +v.toFixed(2)));
    await p.screenshot({ path: path.join(out, 'interact.png') });
    await p.setViewportSize({ width: 900, height: 1100 }); await new Promise((r) => setTimeout(r, 800)); await p.screenshot({ path: path.join(out, 'portrait.png') });
    await new Promise((r) => setTimeout(r, 15000));
    // The ring's verification views: every name must exist in CAMS, and each lands where it says.
    const ring = ['level', 'railN', 'paddies', 'works', 'school', 'shrine', 'waterfall', 'waterfall2'];
    report.camsMissing = await p.evaluate((n) => n.filter((c) => !window.__diorama.CAMS[c]), ring);
    await p.setViewportSize({ width: 1280, height: 800 });
    for (const c of ring) { await p.evaluate(async (c) => { const d = window.__diorama; d.setCam(c); d.step(0); d.step(0); await new Promise((r) => setTimeout(r, 300)); }, c); await p.screenshot({ path: path.join(out, `cam-${c}.png`) }); }
  }
  if (i === 0) { // turning a phone re-fits the camera while nobody has touched it
    const reach = () => p.evaluate(() => { const d = window.__diorama; return +d.camera.position.distanceTo(d.controls.target).toFixed(1); });
    report.refit = [await reach()]; await p.setViewportSize({ width: 390, height: 844 }); await new Promise((r) => setTimeout(r, 900)); report.refit.push(await reach()); await p.setViewportSize({ width: 1280, height: 800 }); await new Promise((r) => setTimeout(r, 900)); report.refit.push(await reach());
  }
  await p.close();
}
await b.close();
console.log(JSON.stringify({ ...report, means: bad, logs: [...new Set(logs)] }));
