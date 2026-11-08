// Bundles everything (three included) into one self-contained HTML that opens by double-click.
import { build } from 'esbuild'; import fs from 'node:fs'; import path from 'node:path';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'esm', target: 'es2022', write: false, legalComments: 'none',
  alias: { three: './node_modules/three/build/three.module.js' }, plugins: [{ name: 'addons', setup(b) { b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.resolve('node_modules/three/examples/jsm', a.path.slice('three/addons/'.length)) })); } }] });
const js = r.outputFiles[0].text;
if (js.includes('</script')) throw new Error('script terminator in bundle');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\n/, '').replace(/<script type="module" src="[^"]*"><\/script>/, () => `<script type="module">${js}</script>`);
fs.writeFileSync('被自然收回的城市街角.html', html);
console.log('bundle', (html.length / 1048576).toFixed(2), 'MB');
