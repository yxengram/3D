// Build the deliverables from dev.html + src/:
//   index.html             the page to deploy next to assets/ (three.js bundled in; assets load in parallel and are cacheable)
//   dist/艺术博物馆.html    everything inlined (three.js, GLB, textures as data URIs) — opens by double-click from file://
import { build } from 'esbuild'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); process.chdir(root);
const nm = fs.existsSync('node_modules/three') ? path.resolve('node_modules') : path.resolve('..', 'node_modules');
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, legalComments: 'none',
  alias: { three: path.join(nm, 'three/build/three.module.js') },
  plugins: [{ name: 'addons', setup(b) { b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(nm, 'three/examples/jsm', a.path.slice('three/addons/'.length)) })); } }] });
const js = r.outputFiles[0].text; if (js.includes('</script')) throw new Error('script terminator in bundle');
const html = fs.readFileSync('dev.html', 'utf8').replace(/<script type="importmap">[\s\S]*?<\/script>\n/, '');
const J = JSON.parse(fs.readFileSync('assets/scene.json', 'utf8'));
const files = ['scene.glb', ...Object.values(J.lm).map((l) => l.file), 'tex/sky.webp', 'tex/treeline.webp', ...new Set(Object.values(J.mats).map((m) => m.tex).filter(Boolean))].filter((f) => fs.existsSync('assets/' + f));
let total = fs.statSync('assets/scene.json').size; for (const f of files) total += fs.statSync('assets/' + f).size;
const multi = html.replace(/<script type="module" src="[^"]*"><\/script>/, () => `<script type="module">${js}</script>`);
fs.writeFileSync('index.html', multi);
const mime = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
const inl = { 'scene.json': J };
for (const f of files) { const b = fs.readFileSync('assets/' + f).toString('base64'); inl[f] = f.endsWith('.glb') ? b : `data:${mime[path.extname(f)]};base64,${b}`; }
const single = html.replace(/<script type="module" src="[^"]*"><\/script>/, () => `<script>window.__ASSETS=${JSON.stringify(inl)}</script>\n<script type="module">${js}</script>`);
fs.rmSync('dist', { recursive: true, force: true }); fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/艺术博物馆.html', single);
// list every file in assets/ that the page does not use (so nothing stale gets published)
const used = new Set([...files, 'scene.json']); const stale = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (!used.has(path.relative('assets', p)) && e.name !== '.DS_Store') stale.push(path.relative('assets', p)); } })('assets');
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(JSON.stringify({ js: mb(js.length), assets: mb(total), files: files.length + 1, page_total: mb(total + multi.length), single: mb(single.length), unused_in_assets: stale }));
