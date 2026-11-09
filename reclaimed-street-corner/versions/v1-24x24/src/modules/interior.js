// interior.js — the indoor life of the ruined building: flooded convenience store, living room, cafe/study, attic.
// Static props go through one shared Batch per material; plants, pages, cloth and chains are the only moving parts.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const BOUNCE = 0.3;

export function build(ctx) {
  const { THREE, layout, P, kit } = ctx;
  const { BUILDING, WATER, TREE, FLOWER_SPOTS, onSlab, pointInPoly, insideBuilding } = layout;
  const R = ctx.rng, PI = Math.PI;
  const group = new THREE.Group(); group.name = 'interior';
  const offSlab = []; group.userData.offSlab = offSlab;

  const FLOOR = (l) => BUILDING.levelY[l] + 0.045;              // finished floor (tiles sit proud of the slab)
  const CEIL = (l) => BUILDING.levelY[l + 1] - BUILDING.slabT;  // underside of the slab above
  const WN = -10.69, WW = -10.69, WS = 0.19;                    // wall-hung items: just proud of the inner faces

  /* ---------- materials ---------- */
  const dustify = (m) => {
    const c = m.clone(), base = m.onBeforeCompile, key = m.customProgramCacheKey();
    c.userData = { ...m.userData };
    c.onBeforeCompile = (s, r) => {
      base.call(m, s, r);
      s.fragmentShader = s.fragmentShader.replace('vec3 mc=mix(vec3(.10,.30,.09),vec3(.30,.56,.09),smoothstep(.42,.60,n2));',
        'vec3 mc=mix(vec3(.66,.64,.58),vec3(.84,.81,.73),smoothstep(.42,.60,n2));');
    };
    c.customProgramCacheKey = () => key + '|dust';
    return c;
  };
  // Warm bounce light: an albedo-scaled lift private to this module, so rooms glow without the point lights doing all the work.
  const bounce = (m, amt = BOUNCE) => {
    const base = m.onBeforeCompile, key = m.customProgramCacheKey(), tag = amt.toFixed(2);
    m.onBeforeCompile = (s, r) => {
      base.call(m, s, r);
      s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance+=diffuseColor.rgb*vec3(${(amt * 1.12).toFixed(3)},${amt.toFixed(3)},${(amt * 0.74).toFixed(3)});`);
    };
    m.customProgramCacheKey = () => key + '|bounce' + tag;
    return m;
  };
  const own = (m, amt) => { const c = m.clone(); c.userData = { ...m.userData }; c.onBeforeCompile = m.onBeforeCompile; const k = m.customProgramCacheKey(); c.customProgramCacheKey = () => k; return bounce(c, amt); };
  const dust = bounce(dustify(ctx.toon({ color: '#ffffff', moss: 0.44, vertexColors: true })));
  const dustWood = bounce(dustify(ctx.surface('wood', { moss: 0.44, vertexColors: true, color: '#ffffff' })));
  const planks = own(ctx.surface('wood', { moss: 0.4, vertexColors: true, color: '#ffffff' }));
  const leafMat = bounce(ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, translucent: 1.15, vertexColors: true }), BOUNCE * 1.25);
  const frondMat = bounce(ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, translucent: 1.15 }), BOUNCE * 1.25);
  const SURF = {
    flat: bounce(ctx.toon({ color: '#ffffff', vertexColors: true })),
    tile: own(ctx.surface('tile', { vertexColors: true })),
    rust: own(ctx.surface('rust', { vertexColors: true, color: '#ffffff' })),
    mossy: own(ctx.surface('mossy', { vertexColors: true, color: '#ffffff' }), BOUNCE * 0.8),
  };
  const glassMat = ctx.toon({ color: '#c8f3ea', transparent: true, opacity: 0.32, dapple: false, depthWrite: false, vertexColors: true });

  /* ---------- atlas of everything printed ---------- */
  const AS = 1024, CELL = 128, slots = {}, painters = [];
  const slot = (name, cx, cy, cw, ch, draw) => {
    const x = cx * CELL + 3, y = cy * CELL + 3, w = cw * CELL - 6, h = ch * CELL - 6;
    slots[name] = { u0: x / AS, u1: (x + w) / AS, v0: 1 - (y + h) / AS, v1: 1 - y / AS };
    painters.push((g) => { g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); draw(g, w, h); g.restore(); });
  };
  const JP = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';
  const label = (bg, fg, txt, band) => (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = band; g.fillRect(0, h * 0.62, w, h * 0.2);
    g.fillStyle = fg; g.beginPath(); g.arc(w * 0.5, h * 0.3, w * 0.2, 0, 7); g.fill();
    g.fillStyle = bg; g.font = `900 ${h * 0.2}px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w * 0.5, h * 0.31);
    g.fillStyle = '#fff8e6'; g.font = `800 ${h * 0.13}px ${JP}`; g.fillText('NEW', w * 0.5, h * 0.72);
  };
  [['#e8664f', '#ffe9b0', '茶', '#b5402f'], ['#4fb2a6', '#fff2d0', '水', '#2d8a84'], ['#f2c14e', '#d0473a', '米', '#d0473a'], ['#6f9fb0', '#fff', '乳', '#4d7f94'],
    ['#b583f0', '#fff0c0', '飴', '#8656c8'], ['#79c26a', '#fff6cc', '緑', '#4c9a55'], ['#f08fb0', '#fff', '桃', '#d0607e'], ['#d98a44', '#fff0c0', '餅', '#a8602c'],
  ].forEach(([bg, fg, t, band], i) => slot('l' + i, i, 0, 1, 1, label(bg, fg, t, band)));
  const labelCount = 8;
  slot('clock', 0, 2, 2, 2, (g, w, h) => {
    g.fillStyle = '#f7efd9'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6e5038'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h / 2, w * 0.47, 0, 7); g.stroke();
    g.fillStyle = '#3a3f46'; g.font = `800 ${h * 0.11}px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) { const a = (i / 12) * PI * 2 - PI / 2; g.fillText(String(i), w / 2 + Math.cos(a) * w * 0.37, h / 2 + Math.sin(a) * h * 0.37); }
    g.strokeStyle = 'rgba(181,82,47,.35)'; g.lineWidth = 9; g.beginPath(); g.moveTo(w * 0.75, h * 0.1); g.lineTo(w * 0.72, h * 0.34); g.stroke();
  });
  slot('picSea', 2, 2, 3, 2, (g, w, h) => {
    const s = g.createLinearGradient(0, 0, 0, h * 0.6); s.addColorStop(0, '#8fd6e6'); s.addColorStop(1, '#fbeec8'); g.fillStyle = s; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd77a'; g.beginPath(); g.arc(w * 0.72, h * 0.34, h * 0.13, 0, 7); g.fill();
    g.fillStyle = '#3fa8ad'; g.fillRect(0, h * 0.56, w, h); g.fillStyle = '#7cd6cf'; for (let i = 0; i < 9; i++) g.fillRect((i * 83) % w, h * (0.6 + i * 0.04), 60, 4);
    g.fillStyle = '#5d9a6a'; g.beginPath(); g.moveTo(0, h * 0.58); g.lineTo(w * 0.2, h * 0.36); g.lineTo(w * 0.42, h * 0.58); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w * 0.4, h * 0.62); g.lineTo(w * 0.47, h * 0.34); g.lineTo(w * 0.55, h * 0.62); g.fill(); g.fillStyle = '#c8705e'; g.fillRect(w * 0.38, h * 0.62, w * 0.19, h * 0.04);
  });
  slot('picFlower', 5, 2, 2, 2, (g, w, h) => {
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, h); g.fillStyle = '#6f9fb0'; g.beginPath(); g.moveTo(w * 0.38, h * 0.92); g.lineTo(w * 0.62, h * 0.92); g.lineTo(w * 0.68, h * 0.6); g.lineTo(w * 0.32, h * 0.6); g.fill();
    for (let i = 0; i < 9; i++) { const a = -PI * (0.1 + i * 0.1), x = w / 2 + Math.cos(a) * w * 0.26, y = h * 0.42 + Math.sin(a) * h * 0.2; g.strokeStyle = '#4c9a55'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, h * 0.62); g.lineTo(x, y); g.stroke(); g.fillStyle = ['#e8488f', '#ffd84f', '#d0473a'][i % 3]; g.beginPath(); g.arc(x, y, w * 0.07, 0, 7); g.fill(); }
  });
  slot('picHouse', 7, 2, 1, 2, (g, w, h) => {
    g.fillStyle = '#bfe3d6'; g.fillRect(0, 0, w, h); g.fillStyle = '#7cc08a'; g.fillRect(0, h * 0.68, w, h); g.fillStyle = '#efe6d2'; g.fillRect(w * 0.24, h * 0.42, w * 0.52, h * 0.28); g.fillStyle = '#b5522f'; g.beginPath(); g.moveTo(w * 0.14, h * 0.44); g.lineTo(w * 0.5, h * 0.26); g.lineTo(w * 0.86, h * 0.44); g.fill(); g.fillStyle = '#6e5038'; g.fillRect(w * 0.44, h * 0.56, w * 0.14, h * 0.14);
  });
  const spines = (g, w, h) => {
    const cols = ['#c8705e', '#6f9fb0', '#e0c25a', '#5d9a6a', '#b5522f', '#efe6d2', '#8a6fb0', '#3f8a8a', '#d98a44', '#a87c52']; let x = 0, i = 0;
    while (x < w) { const b = 16 + ((i * 7) % 13) * 2; g.fillStyle = cols[(i * 3 + (h | 0)) % cols.length]; g.fillRect(x, 0, b - 2, h); g.fillStyle = 'rgba(255,245,210,.75)'; g.fillRect(x + 3, h * 0.16, b - 8, 6); g.fillRect(x + 3, h * 0.78, b - 8, 4); x += b; i++; }
  };
  slot('spines', 0, 4, 4, 1, spines);
  const pagePaint = (lines) => (g, w, h) => { g.fillStyle = '#fbf4e0'; g.fillRect(0, 0, w, h); g.fillStyle = '#8c8f8a'; for (let i = 0; i < lines; i++) g.fillRect(w * 0.12, h * (0.12 + i * 0.075), w * (i % 5 === 4 ? 0.45 : 0.76), h * 0.024); };
  slot('page', 4, 4, 1, 1, pagePaint(10));
  slot('page2', 5, 4, 1, 1, (g, w, h) => { pagePaint(5)(g, w, h); g.fillStyle = '#9fcab8'; g.fillRect(w * 0.14, h * 0.52, w * 0.72, h * 0.34); });
  slot('sheet', 6, 4, 1, 1, (g, w, h) => {
    g.fillStyle = '#f7efd9'; g.fillRect(0, 0, w, h); g.strokeStyle = '#555f5f'; g.fillStyle = '#3a3f46'; g.lineWidth = 2;
    for (let s = 0; s < 3; s++) { const y0 = h * (0.14 + s * 0.28); for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(w * 0.08, y0 + i * 7); g.lineTo(w * 0.92, y0 + i * 7); g.stroke(); } for (let n = 0; n < 7; n++) { const x = w * (0.14 + n * 0.11), y = y0 + ((n * 5) % 5) * 7; g.beginPath(); g.ellipse(x, y, 6, 4.5, -0.4, 0, 7); g.fill(); g.fillRect(x + 4, y - 24, 2, 24); } }
  });
  slot('keypad', 7, 4, 1, 1, (g, w, h) => { g.fillStyle = '#6d7a7d'; g.fillRect(0, 0, w, h); const c = ['#efe6d2', '#efe6d2', '#e0c25a', '#efe6d2', '#efe6d2', '#c8705e', '#efe6d2', '#efe6d2', '#79c26a']; for (let i = 0; i < 16; i++) { g.fillStyle = c[i % 9]; g.fillRect(8 + (i % 4) * 28, 8 + ((i / 4) | 0) * 28, 22, 22); } });
  slot('stain', 4, 5, 3, 1, (g, w, h) => {
    g.fillStyle = '#ecebdf'; g.fillRect(0, 0, w, h); g.fillStyle = '#6fb7c4'; g.fillRect(0, h * 0.1, w, h * 0.13);
    g.fillStyle = '#4c97a8'; g.font = `900 ${h * 0.3}px ${JP}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('アイス', w * 0.07, h * 0.46);
    g.fillStyle = '#e8664f'; g.beginPath(); g.moveTo(w * 0.62, h * 0.72); g.lineTo(w * 0.57, h * 0.4); g.lineTo(w * 0.67, h * 0.4); g.fill(); g.fillStyle = '#fbeec8'; g.beginPath(); g.arc(w * 0.62, h * 0.34, h * 0.13, 0, 7); g.fill();
    for (let i = 0; i < 26; i++) { const x = (i * 149 + 31) % w, l = h * (0.12 + ((i * 37) % 53) / 80), wd = 3 + (i * 7) % 12; const c = i % 3 ? '#b5522f' : '#d9764a'; g.fillStyle = c; g.globalAlpha = 0.5 + (i % 4) * 0.13; g.beginPath(); g.moveTo(x - wd, 0); g.lineTo(x + wd, 0); g.lineTo(x + wd * 0.3, l); g.lineTo(x - wd * 0.3, l); g.fill(); }
    g.globalAlpha = 0.9; g.fillStyle = '#b5522f'; for (let i = 0; i < 40; i++) { const x = (i * 61) % w, r = 8 + (i * 13) % 26; g.beginPath(); g.ellipse(x, h + 2, r * 1.6, r, 0, 0, 7); g.fill(); } g.fillStyle = '#7d3a2a'; for (let i = 0; i < 16; i++) { g.beginPath(); g.ellipse((i * 113) % w, h, 16, 8 + (i % 3) * 5, 0, 0, 7); g.fill(); } g.globalAlpha = 1;
  });
  slot('rug', 0, 6, 3, 2, (g, w, h) => {
    g.fillStyle = '#b5523f'; g.fillRect(0, 0, w, h); g.strokeStyle = '#efdcb0'; g.lineWidth = 7; g.strokeRect(16, 16, w - 32, h - 32); g.strokeStyle = '#2f7f7c'; g.lineWidth = 12; g.strokeRect(36, 36, w - 72, h - 72);
    g.fillStyle = '#e0c25a'; g.save(); g.translate(w / 2, h / 2); for (let i = 0; i < 4; i++) { g.rotate(PI / 2); g.beginPath(); g.moveTo(0, 0); g.lineTo(44, 24); g.lineTo(82, 0); g.lineTo(44, -24); g.fill(); } g.fillStyle = '#2f7f7c'; g.beginPath(); g.arc(0, 0, 24, 0, 7); g.fill(); g.restore();
    g.fillStyle = '#efdcb0'; for (let i = 0; i < 14; i++) for (const y of [52, h - 52]) { g.beginPath(); g.arc(60 + i * (w - 120) / 13, y, 5, 0, 7); g.fill(); }
  });
  slot('sign', 3, 6, 3, 1, (g, w, h) => {
    g.fillStyle = '#f7efd9'; g.fillRect(0, 0, w, h); g.fillStyle = '#4fa79b'; g.fillRect(0, 0, w, h * 0.3); g.fillStyle = '#e8664f'; g.fillRect(0, h * 0.3, w, h * 0.1);
    g.fillStyle = '#2f7f7c'; g.font = `900 ${h * 0.4}px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('まちかど商店', w / 2, h * 0.68);
  });
  slot('menu', 6, 6, 2, 2, (g, w, h) => {
    g.fillStyle = '#3e5a52'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a87c52'; g.lineWidth = 10; g.strokeRect(0, 0, w, h); g.fillStyle = '#f2ecd8'; g.font = `900 ${h * 0.14}px ${JP}`; g.textAlign = 'center'; g.fillText('本日の珈琲', w / 2, h * 0.24);
    g.font = `700 ${h * 0.08}px ${JP}`; ['ブレンド  350', 'カフェオレ  400', '紅茶  300', 'ケーキ  380'].forEach((t, i) => g.fillText(t, w / 2, h * (0.44 + i * 0.13)));
  });
  slot('poster', 3, 7, 1, 1, (g, w, h) => { g.fillStyle = '#ffd84f'; g.fillRect(0, 0, w, h); g.fillStyle = '#d0473a'; g.font = `900 ${h * 0.3}px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('特売', w / 2, h * 0.36); g.fillText('¥98', w / 2, h * 0.72); });
  slot('wet', 4, 7, 1, 1, (g, w, h) => {
    g.fillStyle = '#f5c93f'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a3f46'; g.font = `900 ${h * 0.16}px ${JP}`; g.textAlign = 'center'; g.fillText('注意', w / 2, h * 0.22);
    g.lineWidth = 9; g.strokeStyle = '#3a3f46'; g.beginPath(); g.moveTo(w * 0.22, h * 0.82); g.lineTo(w * 0.78, h * 0.82); g.moveTo(w * 0.34, h * 0.62); g.lineTo(w * 0.56, h * 0.42); g.lineTo(w * 0.7, h * 0.56); g.stroke(); g.fillStyle = '#3a3f46'; g.beginPath(); g.arc(w * 0.62, h * 0.32, h * 0.07, 0, 7); g.fill();
  });
  slot('crate', 5, 7, 1, 1, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#b48a5c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6e5038'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28); g.fillStyle = '#6e5038'; g.font = `900 ${h * 0.36}px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('果', w / 2, h / 2); });

  const atlasTex = ctx.canvasTexture(AS, AS, (g) => { g.fillStyle = '#e9e3d2'; g.fillRect(0, 0, AS, AS); for (const p of painters) p(g); }, { repeat: false });
  const atlas = bounce(ctx.toon({ color: '#ffffff', map: atlasTex, vertexColors: true, side: THREE.DoubleSide }));
  const pageMat = bounce(ctx.toon({ color: '#ffffff', map: atlasTex, side: THREE.DoubleSide }));

  const uvTo = (g, name) => { const s = slots[name], uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, s.u0 + uv.getX(i) * (s.u1 - s.u0), s.v0 + uv.getY(i) * (s.v1 - s.v0)); return g; };
  const quad = (w, h, name) => uvTo(new THREE.PlaneGeometry(w, h), name);

  /* ---------- batching ---------- */
  const b = ctx.batch(), fb = ctx.batch(), gb = ctx.batch(), pb = ctx.batch();
  class Node {
    constructor(m, bt) { this.m = m; this.bt = bt; }
    at(o) { return new Node(this.m.clone().multiply(kit.xf(o)), this.bt); }
    add(g, mat = 'flat', o = {}) { const { color, ...t } = o; this.bt.add(g, SURF[mat] ?? mat, { matrix: this.m.clone().multiply(kit.xf(t)), color }); return this; }
  }
  const root = new Node(new THREE.Matrix4(), b);
  const N = (pos, rot = [0, 0, 0], scale = 1) => root.at({ pos, rot, scale });
  const rb = (w, h, d, r = 0.03, s = 1) => new RoundedBoxGeometry(w, h, d, s, r);
  const Yv = new THREE.Vector3(0, 1, 0);
  const rod = (a, b_, r = 0.04, seg = 5) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b_), d = B.clone().sub(A), l = d.length();
    const g = kit.cyl(r, r, l, seg, false); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Yv, d.normalize()));
    const c = A.add(B).multiplyScalar(0.5); g.translate(c.x, c.y, c.z); return g;
  };
  const warp = (g, fn) => { const p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); } return g; };

  /* ---------- footprints: water shores, plant exclusion, keep-clear spots ---------- */
  const foot = [];
  const reg = (level, x, z, hx, hz, yaw = 0) => {
    foot.push({ level, x, z, hx, hz, c: Math.cos(yaw), s: Math.sin(yaw) });
    if (!onSlab(level, x, z, 0)) offSlab.push([level, x, z]);
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const dx = a * hx, dz = c * hz, px = x + dx * Math.cos(yaw) + dz * Math.sin(yaw), pz = z - dx * Math.sin(yaw) + dz * Math.cos(yaw); if (!onSlab(level, px, pz, 0)) offSlab.push([level, +px.toFixed(2), +pz.toFixed(2)]); }
  };
  const footD = (f, x, z) => { const dx = x - f.x, dz = z - f.z, lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c, ax = Math.abs(lx) - f.hx, az = Math.abs(lz) - f.hz; return Math.hypot(Math.max(ax, 0), Math.max(az, 0)) + Math.min(Math.max(ax, az), 0); };
  const keep = [ // shaft feet + drip landings: stay open
    [0, -2.62, -0.58, 1.0], [0, -0.3, -0.6, 0.7], [0, 0.25, -3.75, 0.9], [1, -10.3, -4.9, 0.7], [2, -2.2, -7.0, 0.8], [3, -9.6, -2.4, 0.6],
    [0, 0.9, -2.3, 0.2], [0, -1.6, -1.6, 0.2], [0, -4.3, -1.2, 0.2], [1, -0.2, 0.1, 0.3], [1, -1.4, -3.6, 0.3],
  ];
  const free = (level, x, z, m = 0.2) => {
    for (const f of foot) if (f.level === level && footD(f, x, z) < m) return false;
    for (const [l, kx, kz, r] of keep) if (l === level && Math.hypot(x - kx, z - kz) < r) return false;
    return true;
  };
  const segD = (px, pz, a, c) => { const dx = c[0] - a[0], dz = c[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t); };
  const slabD = (level, x, z) => { // signed distance to the slab's boundary (+ inside)
    const s = BUILDING.slabs[level]; let d = 1e9;
    for (let i = 0; i < s.outline.length; i++) d = Math.min(d, segD(x, z, s.outline[i], s.outline[(i + 1) % s.outline.length]));
    let inside = pointInPoly(x, z, s.outline);
    for (const h of s.holes) { const e = Math.hypot(x - h.x, z - h.z) - h.r; if (e < 0) inside = false; d = Math.min(d, Math.abs(e)); }
    return inside ? d : -d;
  };

  /* ---------- floors ---------- */
  const inner = (x, z) => x > -10.72 && x < 1.22 && z > -10.72 && z < 0.24;
  const tileS = 2.2222 / 4, tileG = kit.box(tileS - 0.012, 0.05, tileS - 0.012);
  function tiles(level, tint, loss = 0.03) {
    const y = BUILDING.levelY[level] + 0.02;
    for (let gx = -21; gx <= 3; gx++) for (let gz = -21; gz <= 1; gz++) {
      const cx = (gx + 0.5) * tileS, cz = (gz + 0.5) * tileS;
      if (!inner(cx, cz)) continue;
      const d = slabD(level, cx, cz); if (d < 0.26) continue;
      const tr = Math.hypot(cx - TREE.x, cz - TREE.z);
      if (level === 0 && tr < TREE.trunkR + 0.35) continue;
      if (R() < (d < 0.85 ? 0.42 : loss)) continue;
      const heave = level === 0 ? Math.max(0, 1 - (tr - TREE.trunkR) / 2.1) : (d < 0.9 ? 0.3 : 0);
      const tx = R.range(-1, 1) * 0.22 * heave, tz = R.range(-1, 1) * 0.22 * heave, lift = heave * R.range(0, 0.1);
      b.add(tileG, SURF.tile, { pos: [cx, y + lift, cz], rot: [tx, 0, tz], color: tint(gx, gz) });
    }
  }
  tiles(0, () => R.pick(['#ffffff', '#f4fbf6', '#e7f4ee']));
  tiles(2, (x, z) => ((x + z) & 1 ? '#f6efdf' : '#9ccfc2'));
  function boards(level, wMain, tints, loss) {
    const y = BUILDING.levelY[level] + 0.018, bw = wMain;
    for (let gz = -40; gz < 2; gz++) {
      const cz = (gz + 0.5) * bw; let x = -10.7 + (gz & 1 ? 0 : -0.7) + R() * 0.3;
      while (x < 1.2) {
        const l = R.range(1.2, 2.1), cx = x + l / 2, ok = [x + 0.1, cx, x + l - 0.1].every((px) => inner(px, cz) && slabD(level, px, cz) > 0.2);
        if (ok && R() > loss) b.add(kit.box(l - 0.02, 0.05, bw - 0.014), planks, { pos: [cx, y, cz], rot: [0, 0, R.range(-0.004, 0.004)], color: R.pick(tints) });
        x += l;
      }
    }
  }
  boards(1, 0.34, ['#c9976a', '#d5a678', '#bb8a5e', '#dcb186'], 0.03);
  boards(3, 0.42, ['#a98a66', '#bb9a74', '#9c7e5e'], 0.09);

  /* ---------- small goods ---------- */
  const packs = [];
  for (let i = 0; i < labelCount; i++) packs.push([uvTo(kit.box(0.27, 0.36, 0.1), 'l' + i), uvTo(kit.box(0.2, 0.26, 0.14), 'l' + i), uvTo(kit.box(0.34, 0.24, 0.12), 'l' + i)]);
  const bottleG = new THREE.LatheGeometry([[0.001, 0], [0.066, 0], [0.076, 0.03], [0.076, 0.26], [0.034, 0.36], [0.03, 0.44], [0.001, 0.44]].map(([x, y]) => new THREE.Vector2(x, y)), 7);
  const capG = kit.cylBase(0.036, 0.036, 0.05, 6), canG = kit.cylBase(0.075, 0.075, 0.24, 7);
  const bottleCols = ['#6fcfb8', '#e0a050', '#8fd6e6', '#7fcf55'];
  let G = R; // goods draw from this, so extras added later can use their own stream and leave R's sequence (and every prop after them) alone
  const packet = (n, o) => n.add(G.pick(packs)[G.int(0, 2)], atlas, o);
  const bottle = (n, o) => { const m = n.at(o); const c = G.pick(bottleCols); m.add(bottleG, 'flat', { color: c }); m.add(capG, 'flat', { pos: [0, 0.44, 0], color: G.pick([P.red, P.flowerWhite, P.fadedBlue]) }); };
  const can = (n, o) => n.add(canG, 'flat', { ...o, color: G.pick([P.fadedRed, P.fadedBlue, P.fadedYellow, P.leafDeep]) });
  function stock(n, L, ys, z, fill, tint) {
    for (const y of ys) {
      let x = -L / 2 + 0.14;
      while (x < L / 2 - 0.14) {
        const w = 0.2 + R() * 0.12;
        if (R() < fill) {
          const k = R(), lean = R() < 0.14 ? R.range(-0.5, 0.5) : 0, o = { pos: [x, y, z + R.range(-0.09, 0.09)], rot: [0, R.range(-0.25, 0.25), lean] };
          if (k < 0.6) packet(n, { ...o, pos: [o.pos[0], y + 0.15, o.pos[2]], color: tint }); else if (k < 0.82) bottle(n, o); else can(n, o);
        }
        x += w + 0.02;
      }
    }
  }
  /** Shelves of a unit tipped on its back are seen from underneath at street level, so only the front 0.2 m of each bay shows: heap goods up to the lip, a few hanging over it. */
  const DUSTY = '#cfc8b8'; // years of dust on the packets: keeps the heap under the fittings in the value order
  function slumped(n, L, ys, z, fill) {
    const S = ctx.seeded('interior-toppled'), keepG = G; G = S;
    for (const y of ys) {
      let x = -L / 2 + 0.16;
      while (x < L / 2 - 0.16) {
        const w = 0.17 + S() * 0.14, k = S(), roll = S.range(-0.5, 0.5);
        if (S() < fill) {
          const o = { pos: [x, y + 0.04, z + S.range(-0.02, 0.05)], rot: [S.range(-0.12, 0.12), S.range(-0.2, 0.2), roll] };
          if (S() < 0.2) packet(n, { pos: [x, y + 0.13, z + 0.13], rot: [S.range(0.5, 0.95), S.range(-0.3, 0.3), roll], color: DUSTY });
          else if (k < 0.56) packet(n, { ...o, pos: [x, y + 0.2, o.pos[2]], color: DUSTY });
          else if (k < 0.8) bottle(n, { ...o, pos: [x + 0.16, y + 0.11, o.pos[2]], rot: [0, 0, PI / 2 + roll * 0.3] });
          else can(n, { ...o, pos: [x, y + 0.03, o.pos[2]] });
        }
        x += w;
      }
    }
    G = keepG;
  }
  /** Goods fallen across the floor or bobbing in the shallows. */
  function spill(level, cx, cz, rx, rz, count, floatY = null) {
    for (let i = 0; i < count; i++) {
      const a = R() * 6.28, r = Math.sqrt(R()), x = cx + Math.cos(a) * rx * r, z = cz + Math.sin(a) * rz * r, y = floatY ?? FLOOR(level);
      if (!onSlab(level, x, z, 0.1)) continue;
      const k = R(), o = { pos: [x, y + 0.03, z], rot: [PI / 2 + R.range(-0.25, 0.25), R() * 6.28, R.range(-0.3, 0.3)] };
      if (k < 0.62) packet(root, o); else if (k < 0.85) bottle(root, { ...o, pos: [x, y + 0.09, z], rot: [PI / 2, R() * 6.28, 0] }); else can(root, { ...o, pos: [x, y + 0.075, z], rot: [PI / 2, R() * 6.28, 0] });
    }
  }

  /* ---------- store fittings ---------- */
  function gondola(n, L, H, { fill = 0.7, shelves = 4, slip = false, col = '#4fa79b', wreck = false } = {}) {
    const D = 0.64, ys = Array.from({ length: shelves }, (_, i) => 0.3 + (i * (H - 0.5)) / shelves);
    const end = (s) => { // wreck only: open ladder frame instead of a solid end slab, so a fallen unit reads as fittings and not as one flat shape
      const x = s * (L / 2 - 0.02), dark = '#7d5a4e', zs = [D / 2 - 0.05, -D / 2 + 0.06];
      for (const z of zs) n.add(kit.boxBase(0.09, H + 0.06, 0.09), 'rust', { pos: [x, 0, z], color: '#a9796a' });
      n.add(kit.boxBase(0.03, H * 0.42, D - 0.2), 'flat', { pos: [x - s * 0.015, 0.12, 0], color: dark });
      for (let i = 0; i < 6; i++) n.add(kit.box(0.012, 0.05, 0.26), 'flat', { pos: [x + s * 0.004, 0.26 + i * 0.13, 0], color: '#5a4238' });
      n.add(rod([x, H * 0.5, -D / 2 + 0.08], [x, H - 0.06, D / 2 - 0.07], 0.02, 4), 'flat', { color: col });
      n.add(kit.box(0.08, 0.06, D - 0.02), 'flat', { pos: [x, H + 0.02, 0], color: col });
      for (const y of ys) { n.add(kit.box(0.05, 0.05, D - 0.14), 'flat', { pos: [x, y, 0], color: col }); for (const z of [-0.14, 0.15]) n.add(kit.box(0.2, 0.035, 0.05), 'flat', { pos: [x + s * 0.09, y + 0.03, z], color: P.metal }); }
    };
    n.add(kit.boxBase(L, 0.16, D), 'flat', { color: wreck ? '#4d7570' : '#2f7f7c' });
    n.add(kit.boxBase(L + 0.02, 0.03, D + 0.02), 'flat', { pos: [0, 0.16, 0], color: col });
    n.add(kit.boxBase(L, H, 0.05), 'flat', { pos: [0, 0, -D / 2 + 0.03], color: wreck ? '#bdb9a9' : '#eee8d6' });
    for (let i = 0; i < 9; i++) n.add(kit.box(L - 0.1, 0.012, 0.01), 'flat', { pos: [0, 0.36 + i * 0.2, -D / 2 + 0.06], color: wreck ? '#94958a' : '#c9c7b8' });
    const k = Math.max(1, Math.round(L / 1.2));
    for (let i = 0; i <= k; i++) { const x = -L / 2 + (i * L) / k; if (wreck && !(i % k)) end(i ? 1 : -1); else n.add(kit.boxBase(0.07, H + 0.04, D - 0.02), 'flat', { pos: [x, 0, 0], color: i % k ? '#cfd6d2' : col }); }
    ys.forEach((y, i) => {
      const off = slip && i === shelves - 2;
      const s = n.at({ pos: [off ? 0.1 : 0, y, 0.03], rot: [off ? 0.42 : 0, 0, off ? -0.16 : 0] });
      s.add(kit.box(L - 0.08, 0.04, D - 0.1), 'flat', { color: '#dfe3dc' });
      if (wreck) {
        s.add(kit.box(L - 0.08, 0.12, 0.03), 'flat', { pos: [0, 0.03, D / 2 - 0.05], color: i % 2 ? '#c9b47c' : '#c2a48a' });  // tall retaining lip
        s.add(kit.box(L - 0.14, 0.05, 0.012), 'flat', { pos: [0, 0.03, D / 2 - 0.03], color: '#efe6d2' });                       // price rail
        for (let t = 0; t < 7; t++) if ((t * 5 + i * 3) % 4) s.add(kit.box(0.14, 0.05, 0.008), 'flat', { pos: [-L / 2 + 0.3 + (t * (L - 0.6)) / 6, 0.03, D / 2 - 0.022], color: (t + i) % 3 ? '#fbf4e0' : P.fadedYellow });
      } else s.add(kit.box(L - 0.08, 0.075, 0.025), 'flat', { pos: [0, -0.012, D / 2 - 0.05], color: i % 2 ? P.fadedYellow : '#ef8a5a' });
    });
    n.add(uvTo(kit.box(L + 0.1, 0.3, 0.09), 'sign'), atlas, { pos: [0, H + 0.14, -D / 2 + 0.06] });
    stock(wreck ? n.at({ pos: [0, 0, 0.1] }) : n, L, ys.map((y) => y + 0.03), 0.04, fill, wreck ? DUSTY : undefined);
    if (wreck) slumped(n, L, ys.map((y) => y + 0.03), 0.15, 0.72);
  }
  function freezer(x, z, yaw) {
    const y = FLOOR(0), n = N([x, y, z], [0.012, yaw, -0.018]); reg(0, x, z, 1.1, 0.52, yaw);
    n.add(kit.boxBase(2.02, 0.12, 0.86), 'flat', { color: P.metalDark });
    n.add(rb(2.16, 0.84, 0.98, 0.05), 'flat', { pos: [0, 0.52, 0], color: '#ecebdf' });
    n.add(quad(2.1, 0.76, 'stain'), atlas, { pos: [0, 0.5, 0.495] });
    n.add(quad(0.94, 0.76, 'stain'), atlas, { pos: [1.085, 0.5, 0], rot: [0, PI / 2, 0] });
    n.add(quad(0.94, 0.76, 'stain'), atlas, { pos: [-1.085, 0.5, 0], rot: [0, -PI / 2, 0] });
    for (let i = 0; i < 6; i++) n.add(kit.box(0.34, 0.018, 0.02), 'flat', { pos: [0.72, 0.22 + i * 0.035, 0.5], color: P.metal });
    n.add(rb(2.2, 0.06, 1.02, 0.02), 'flat', { pos: [0, 0.94, 0], color: P.metal });
    n.add(kit.box(1.96, 0.02, 0.78), 'flat', { pos: [0, 0.965, 0], color: '#2c6f75' });
    // lid halves split along a jagged crack; the right half has lifted off its seat
    const lidA = [[-1.08, -0.5], [0.06, -0.5], [-0.03, -0.27], [0.15, -0.12], [0.0, 0.05], [0.11, 0.27], [-0.03, 0.5], [-1.08, 0.5]];
    const lidB = [[0.2, -0.5], [1.08, -0.5], [1.08, 0.5], [0.14, 0.5], [0.27, 0.27], [0.16, 0.05], [0.31, -0.12], [0.13, -0.27]];
    n.add(kit.plate(lidA, null, 1.05, 0.08), 'flat', { rot: [0, 0, 0], color: '#e8e6d8' });
    const lb = n.at({ pos: [1.08, 0.99, -0.5], rot: [0.05, 0, 0.2] }); lb.add(kit.plate(lidB, null, 0.06, 0.08), 'flat', { pos: [-1.08, 0, 0.5], color: '#e8e6d8' });
    n.add(kit.box(0.3, 0.05, 0.05), 'flat', { pos: [-0.5, 1.03, 0.52], color: P.metalDark });
    for (const [a, c] of [[[-0.03, 1.058, -0.27], [-0.4, 1.058, -0.1]], [[-0.4, 1.058, -0.1], [-0.62, 1.058, 0.16]], [[0, 1.058, 0.05], [-0.28, 1.058, 0.22]]]) n.add(rod(a, c, 0.012, 4), 'flat', { color: '#5a6a70' });
    const rs = [[-0.8, 0.14, 0.51, 0.34, 0.2], [0.55, 0.12, 0.51, 0.46, 0.16], [-1.0, 1.03, 0.2, 0.18, 0.1]];
    for (const [px, py, pz, w, h] of rs) n.add(kit.rock(0.5, R, 0.32), 'rust', { pos: [px, py, pz - 0.02], scale: [w * 1.4, h * 1.6, 0.08] });
    for (let i = 0; i < 7; i++) packet(n, { pos: [R.range(0.14, 0.92), 0.93 + R() * 0.06, R.range(-0.34, 0.34)], rot: [PI / 2 + R.range(-0.2, 0.2), R() * 6, 0] });
    return n;
  }
  function checkout(x, z, yaw) {
    const y = FLOOR(0), n = N([x, y, z], [0, yaw, 0]); reg(0, x, z, 1.0, 0.42, yaw);
    n.add(kit.boxBase(1.95, 0.1, 0.66), 'flat', { color: '#2f7f7c' });
    n.add(rb(1.98, 0.8, 0.72, 0.02), 'flat', { pos: [0, 0.5, 0], color: '#efe6d2' });
    n.add(kit.box(1.99, 0.14, 0.725), 'flat', { pos: [0, 0.3, 0], color: '#e8664f' });
    n.add(kit.box(1.99, 0.06, 0.725), 'flat', { pos: [0, 0.42, 0], color: '#f5c93f' });
    n.add(rb(2.14, 0.07, 0.86, 0.02), 'flat', { pos: [0, 0.93, 0], color: '#c79a6c' });
    n.add(kit.box(0.84, 0.03, 0.42), 'flat', { pos: [-0.55, 0.975, 0], color: '#4b5560' });
    n.add(kit.box(0.05, 0.08, 0.42), 'flat', { pos: [-0.14, 0.99, 0], color: P.fadedYellow });
    // register
    const r = n.at({ pos: [0.5, 0.965, 0.02], rot: [0, -0.28, 0.0] });
    r.add(rb(0.56, 0.16, 0.54, 0.02), 'flat', { pos: [0, 0.08, 0], color: '#d6d3c4' });
    r.add(rb(0.5, 0.1, 0.46, 0.02), 'flat', { pos: [0, 0.03, 0.2], color: '#b9b8ae' });
    r.add(kit.box(0.42, 0.02, 0.34), 'flat', { pos: [0, 0.09, 0.26], color: '#c7a64e' });
    const k = r.at({ pos: [0, 0.2, -0.02], rot: [-0.55, 0, 0] });
    k.add(rb(0.5, 0.1, 0.42, 0.02), 'flat', { color: '#cfccbc' });
    k.add(quad(0.34, 0.3, 'keypad'), atlas, { pos: [-0.04, 0.052, 0.02], rot: [-PI / 2, 0, 0] });
    r.add(kit.box(0.34, 0.2, 0.08), 'flat', { pos: [0, 0.38, -0.22], rot: [0.2, 0, 0], color: '#7d8b90' });
    r.add(kit.box(0.28, 0.14, 0.012), 'flat', { pos: [0, 0.385, -0.178], rot: [0.2, 0, 0], color: '#a6dcc6' });
    r.add(kit.cyl(0.05, 0.05, 0.14, 8), 'flat', { pos: [0.32, 0.26, -0.1], rot: [0, 0, PI / 2], color: '#fbf4e0' });
    r.add(kit.box(0.09, 0.012, 0.3), 'flat', { pos: [0.33, 0.2, 0.12], rot: [-0.3, 0, 0.1], color: '#fbf4e0' });
    // impulse rack on the customer side
    const q = n.at({ pos: [-0.46, 0.14, 0.42] }); q.add(kit.box(0.9, 0.04, 0.16), 'flat', { pos: [0, 0.18, 0], color: '#cfd6d2' }); q.add(kit.box(0.9, 0.04, 0.16), 'flat', { pos: [0, 0.46, 0], color: '#cfd6d2' });
    for (let i = 0; i < 5; i++) for (const yy of [0.2, 0.48]) if (R() < 0.72) n.add(R.pick(packs)[1], atlas, { pos: [-0.8 + i * 0.17, 0.14 + yy + 0.13, 0.43], scale: 0.8, rot: [0, 0, R.range(-0.14, 0.14)] });
  }
  function cart(x, z, yaw) {
    const y = FLOOR(0), n = N([x, y + 0.26, z], [0.12, yaw, 1.28]); reg(0, x, z, 0.5, 0.65, yaw);
    const H = 0.52, l = 0.62, w = 0.36, l2 = 0.46, w2 = 0.28, c = '#c2ccce', top = [[-l, H, -w], [l, H, -w], [l, H, w], [-l, H, w]], bot = [[-l2 + 0.1, 0, -w2], [l2 + 0.1, 0, -w2], [l2 + 0.1, 0, w2], [-l2 + 0.1, 0, w2]];
    for (let i = 0; i < 4; i++) { n.add(rod(top[i], top[(i + 1) % 4], 0.026), 'flat', { color: c }); n.add(rod(bot[i], bot[(i + 1) % 4], 0.02), 'flat', { color: c }); n.add(rod(top[i], bot[i], 0.018), 'flat', { color: c }); }
    for (let t = 1; t < 6; t++) { const u = t / 6; const mix = (a, c2, k) => a.map((v, j) => v + (c2[j] - v) * k); for (const [i, j] of [[0, 1], [3, 2]]) { n.add(rod(mix(top[i], top[j], u), mix(bot[i], bot[j], u), 0.012, 3), 'flat', { color: c }); } }
    for (let t = 1; t < 3; t++) { const f = t / 3; for (let i = 0; i < 4; i++) { const a = top[i].map((v, j) => bot[i][j] + (v - bot[i][j]) * f), e = top[(i + 1) % 4].map((v, j) => bot[(i + 1) % 4][j] + (v - bot[(i + 1) % 4][j]) * f); n.add(rod(a, e, 0.012, 3), 'flat', { color: c }); } }
    n.add(rod([-l - 0.16, H + 0.12, -w], [-l - 0.16, H + 0.12, w], 0.032), 'flat', { color: '#e8664f' });
    n.add(rod([-l, H, -w], [-l - 0.16, H + 0.12, -w], 0.022), 'flat', { color: c }); n.add(rod([-l, H, w], [-l - 0.16, H + 0.12, w], 0.022), 'flat', { color: c });
    for (const [px, pz] of [[-0.3, -0.26], [0.5, -0.26], [-0.3, 0.26], [0.5, 0.26]]) { n.add(rod([px, 0, pz], [px, -0.17, pz], 0.02), 'flat', { color: c }); n.add(kit.cyl(0.08, 0.08, 0.05, 9), 'flat', { pos: [px, -0.2, pz], rot: [PI / 2, 0, 0], color: '#3e5158' }); }
  }
  function basket(x, y, z, yaw, tilt) {
    const n = N([x, y, z], [tilt, yaw, 0.1]), l = 0.34, w = 0.22, c = P.red;
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const px = -l + (i * 2 * l) / 4; n.add(rod([px, 0, s * w * 0.8], [px * 1.1, 0.3, s * w], 0.012, 3), 'flat', { color: c }); }
    for (const yy of [0, 0.15, 0.3]) { const f = 1 + yy * 0.3; for (const s of [-1, 1]) { n.add(rod([-l * f, yy, s * w * f * 0.9], [l * f, yy, s * w * f * 0.9], 0.016, 4), 'flat', { color: c }); n.add(rod([s * l * f, yy, -w * f * 0.9], [s * l * f, yy, w * f * 0.9], 0.016, 4), 'flat', { color: c }); } }
    n.add(kit.box(l * 2, 0.012, w * 1.6), 'flat', { pos: [0, 0.01, 0], color: '#a8352c' });
    n.add(kit.torus(0.3, 0.016, 4, 12, PI), 'flat', { pos: [0, 0.3, 0], rot: [0, 0, 0], color: P.metal });
  }
  function wetSign(x, z, yaw) {
    const y = FLOOR(0), n = N([x, y, z], [0, yaw, 0.14]); reg(0, x, z, 0.26, 0.2, yaw);
    for (const s of [-1, 1]) { const p = n.at({ pos: [0, 0.42, s * 0.14], rot: [s * 0.32, 0, 0] }); p.add(kit.box(0.5, 0.92, 0.025), 'flat', { color: '#f5c93f' }); p.add(quad(0.44, 0.44, 'wet'), atlas, { pos: [0, 0.14, s * 0.014], rot: [0, s > 0 ? 0 : PI, 0] }); }
    n.add(kit.box(0.26, 0.05, 0.05), 'flat', { pos: [0, 0.86, 0], color: '#3a3f46' });
  }
  function tubeLight(x, y, z, yaw, tip, drop) {
    const n = N([x, y - drop, z], [0, yaw, tip]);
    n.add(rb(1.5, 0.07, 0.3, 0.02), 'flat', { color: '#d9d6cb' });
    for (const s of [-1, 1]) n.add(kit.cyl(0.026, 0.026, 1.36, 6), 'flat', { pos: [0, -0.05, s * 0.07], rot: [0, 0, PI / 2], color: '#fff8e0' });
    const c = N([0, 0, 0]), a = Math.cos(yaw), s = Math.sin(yaw), ti = Math.sin(tip);
    for (const e of [-0.68, 0.68]) { const wx = x + a * e, wz = z - s * e, wy = y - drop + ti * e; if (wy < y) c.add(rod([wx, y, wz], [wx, wy, wz], 0.016, 4), 'flat', { color: P.metalDark }); }
    c.add(kit.boxBase(0.5, 0.04, 0.2), 'flat', { pos: [x, y - 0.04, z], color: '#c8c6ba' });
  }

  /* ---------- living room ---------- */
  function sofa(x, z, yaw) {
    const y = FLOOR(1), n = N([x, y, z], [0, yaw, 0]); reg(1, x, z, 1.34, 0.58, yaw);
    const C = '#c8705e', D_ = '#a95a4c', L = '#d98a74';
    n.add(rb(2.5, 0.3, 0.98, 0.05), dust, { pos: [0, 0.3, 0], color: D_ });
    n.add(rb(2.56, 0.84, 0.26, 0.07), dust, { pos: [0, 0.6, -0.42], rot: [-0.05, 0, 0], color: C });
    for (const s of [-1, 1]) {
      n.add(rb(0.28, 0.58, 1.02, 0.06), dust, { pos: [s * 1.2, 0.46, 0.02], color: C });
      n.add(kit.cyl(0.18, 0.18, 1.04, 12), dust, { pos: [s * 1.22, 0.76, 0.02], rot: [PI / 2, 0, 0], color: L });
      n.add(kit.cyl(0.1, 0.1, 0.02, 10), 'flat', { pos: [s * 1.22, 0.76, 0.54], rot: [PI / 2, 0, 0], color: P.fadedYellow });
      for (const zz of [-0.4, 0.42]) n.add(kit.cylBase(0.075, 0.05, 0.16, 7), dustWood, { pos: [s * 1.12, 0, zz], color: '#6e5038' });
    }
    const seat = () => warp(rb(0.72, 0.2, 0.82, 0.08, 2), (v) => { v.y -= (1 - (v.x * v.x) / 0.13) * (1 - (v.z * v.z) / 0.17) * (v.y > 0 ? 0.05 : 0); });
    for (let i = -1; i <= 1; i++) {
      n.add(seat(), dust, { pos: [i * 0.72, 0.53, 0.08 + (i === 1 ? 0.07 : 0)], rot: [i === 1 ? -0.08 : 0, i === 1 ? 0.08 : 0, i === 1 ? 0.04 : 0], color: L });
      if (i !== 1) n.add(rb(0.72, 0.6, 0.24, 0.09, 2), dust, { pos: [i * 0.72, 0.9, -0.24], rot: [-0.2, 0, i * 0.03], color: C });
    }
    // third back cushion has slumped forward on to the seat, split open
    const sl = n.at({ pos: [0.72, 0.78, 0.02], rot: [-1.05, 0.1, 0.16] }); sl.add(rb(0.72, 0.56, 0.22, 0.09, 2), dust, { color: C });
    for (const [px, py, pz, r] of [[-0.14, 0.2, 0.1, 0.1], [0.0, 0.26, 0.1, 0.13], [0.15, 0.2, 0.08, 0.09]]) sl.add(kit.ico(r, 1), 'flat', { pos: [px, py, pz], color: '#fbf4e0' });
    n.add(rb(0.44, 0.42, 0.16, 0.07, 1), dust, { pos: [-0.86, 0.82, 0.02], rot: [-0.4, 0.3, 0.3], color: P.fadedYellow });
    n.add(warp(new THREE.PlaneGeometry(0.8, 1.15, 5, 6).rotateX(-PI / 2), (v) => { v.y = v.z > 0.05 ? -(v.z - 0.05) * 1.2 : 0; v.y += Math.sin(v.x * 9) * 0.015; }), 'flat', { pos: [-0.2, 0.66, 0.1], color: '#efe6d2' });
  }
  function piano(x, z, yaw) {
    const y = FLOOR(1), n = N([x, y, z], [0, yaw, 0], 0.9); reg(1, x, z, 0.85, 0.4, yaw);
    const W = '#7b4d38', Wd = '#5e3a2c', Wl = '#96634a', brass = '#d8b35a';
    n.add(kit.boxBase(1.78, 0.68, 0.36), dustWood, { pos: [0, 0.06, -0.14], color: W });
    n.add(kit.boxBase(1.8, 0.07, 0.42), dustWood, { pos: [0, 0, -0.12], color: Wd });
    n.add(rb(1.5, 0.5, 0.03, 0.01), dustWood, { pos: [0, 0.38, 0.045], color: Wl });
    for (const s of [-1, 1]) {
      n.add(rb(0.09, 0.72, 0.5, 0.02), dustWood, { pos: [s * 0.9, 0.4, -0.06], color: W });
      n.add(rb(0.1, 0.1, 0.72, 0.02), dustWood, { pos: [s * 0.9, 0.8, -0.04], color: Wd });
      n.add(kit.cylBase(0.05, 0.075, 0.68, 8), dustWood, { pos: [s * 0.86, 0, 0.27], color: W });
      n.add(rb(0.09, 0.52, 0.42, 0.02), dustWood, { pos: [s * 0.91, 1.1, -0.12], color: W });
      n.add(kit.cylBase(0.03, 0.05, 0.05, 6), 'flat', { pos: [s * 0.62, 1.03, 0.1], color: brass });
      n.add(rod([s * 0.62, 1.0, 0.08], [s * 0.62, 1.0, -0.02], 0.016, 4), 'flat', { color: brass });
      n.add(kit.cylBase(0.024, 0.024, 0.15, 6), 'flat', { pos: [s * 0.62, 1.07, 0.1], color: '#fbf4e0' });
    }
    n.add(kit.boxBase(1.72, 0.1, 0.46), dustWood, { pos: [0, 0.72, 0.09], color: Wd });
    n.add(kit.boxBase(1.68, 0.03, 0.26), 'flat', { pos: [0, 0.82, 0.16], color: '#efe9d8' });
    const whites = 25, kw = 1.62 / whites;
    for (let i = 0; i < whites; i++) {
      const dip = i === 7 || i === 16 ? -0.022 : 0, loose = i === 19 ? 0.1 : 0;
      n.add(kit.box(kw - 0.008, 0.04, 0.27), 'flat', { pos: [-0.81 + (i + 0.5) * kw, 0.86 + dip, 0.17], rot: [loose, 0, 0], color: i === 12 ? '#e6e0ca' : '#fdfaee' });
      if ([0, 1, 3, 4, 5].includes(i % 7) && i < whites - 1) n.add(kit.box(kw * 0.56, 0.045, 0.16), 'flat', { pos: [-0.81 + (i + 1) * kw, 0.895, 0.115], color: '#3a3238' });
    }
    n.add(kit.box(1.72, 0.05, 0.05), dustWood, { pos: [0, 0.86, 0.33], color: Wl });
    n.add(rb(1.74, 0.56, 0.34, 0.015), dustWood, { pos: [0, 1.14, -0.16], color: W });
    n.add(rb(1.5, 0.3, 0.025, 0.01), dustWood, { pos: [0, 1.15, 0.022], color: Wl });
    n.add(kit.box(1.4, 0.24, 0.03), dustWood, { pos: [0, 0.98, 0.07], rot: [-0.25, 0, 0], color: Wd }); // open fallboard
    n.add(kit.box(0.5, 0.03, 0.07), 'flat', { pos: [0, 1.16, 0.09], color: brass });
    n.add(quad(0.3, 0.36, 'sheet'), atlas, { pos: [-0.17, 1.3, 0.05], rot: [-0.16, 0.05, 0.02] });
    n.add(quad(0.3, 0.36, 'sheet'), atlas, { pos: [0.16, 1.29, 0.05], rot: [-0.16, -0.05, -0.05] });
    n.add(rb(1.9, 0.05, 0.5, 0.015), dustWood, { pos: [0, 1.45, -0.14], color: Wd });
    n.add(warp(new THREE.PlaneGeometry(0.7, 0.42, 6, 2).rotateX(-PI / 2), (v) => { v.y = Math.sin(v.x * 7) * 0.008; }), 'flat', { pos: [0.3, 1.482, -0.13], color: '#efe2c4' });
    for (let i = 0; i < 3; i++) n.add(kit.box(0.07, 0.11 + i * 0.012, 0.06), 'flat', { pos: [-0.09 + i * 0.09, 0.03, 0.34], color: brass });
    // top: photo, metronome, jar of dried stems
    const f = n.at({ pos: [-0.5, 1.48, -0.16], rot: [-0.18, 0.3, 0] }); f.add(kit.boxBase(0.3, 0.38, 0.03), dustWood, { color: '#a87c52' }); f.add(quad(0.22, 0.3, 'picHouse'), atlas, { pos: [0, 0.19, 0.018] });
    n.add(kit.cylBase(0.045, 0.1, 0.34, 4), dustWood, { pos: [0.22, 1.48, -0.14], rot: [0, 0.8, 0], color: '#6e5038' });
    n.add(kit.cylBase(0.06, 0.09, 0.22, 8), 'flat', { pos: [0.66, 1.48, -0.13], color: P.fadedBlue });
    for (let i = 0; i < 5; i++) fb.add(rod([0, 0, 0], [(i - 2) * 0.09, 0.42, R.range(-0.08, 0.08)], 0.008, 3), leafMat, { matrix: n.m.clone().multiply(kit.xf({ pos: [0.66, 1.66, -0.13] })), color: P.fadedYellow });
    // stool, knocked on its side
    const st = N([x + 0.5, y + 0.26, z + 0.86], [0.1, yaw + 0.6, 1.5]);
    st.add(kit.cyl(0.26, 0.26, 0.09, 12), dustWood, { pos: [0, 0.3, 0], color: Wd }); st.add(kit.cyl(0.24, 0.24, 0.07, 12), dust, { pos: [0, 0.37, 0], color: '#8a4a55' });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.28; st.add(rod([Math.cos(a) * 0.16, 0.28, Math.sin(a) * 0.16], [Math.cos(a) * 0.24, -0.26, Math.sin(a) * 0.24], 0.03), dustWood, { color: Wd }); }
    reg(1, st.m.elements[12], st.m.elements[14], 0.35, 0.35);
  }
  function chandelier(x, z) {
    const y = FLOOR(1), n = N([x, y + 0.3, z], [0.2, 0.5, -0.24], 1.0), brass = '#deb95c', brassD = '#b08a3e', crystal = '#d6f6ee'; reg(1, x, z, 0.44, 0.44);
    const prof = [[0.001, 0.7], [0.03, 0.64], [0.05, 0.5], [0.035, 0.42], [0.09, 0.3], [0.05, 0.2], [0.16, 0.06], [0.2, -0.02], [0.13, -0.1], [0.04, -0.14], [0.001, -0.22]].map(([a, c]) => new THREE.Vector2(a, c));
    n.add(new THREE.LatheGeometry(prof, 10), 'flat', { color: brass });
    n.add(kit.torus(0.8, 0.036, 6, 34, 5.5), 'flat', { rot: [PI / 2, 0, 0.3], pos: [0, -0.06, 0], color: brass });
    n.add(kit.torus(0.42, 0.026, 6, 24), 'flat', { rot: [PI / 2, 0, 0], pos: [0, 0.3, 0], color: brassD });
    const arms = 8;
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * 6.28 + 0.2, c = Math.cos(a), s = Math.sin(a), bent = i === 2 ? 0.35 : i === 5 ? -0.3 : 0, ry = 0.14 + bent;
      n.add(kit.tube([[c * 0.1, 0.1, s * 0.1], [c * 0.42, -0.1, s * 0.42], [c * 0.72, -0.04 + bent * 0.4, s * 0.72], [c * 0.8, ry, s * 0.8]], 0.026, 0.02, 5, 9, { capEnds: false }), 'flat', { color: brass });
      n.add(kit.cylBase(0.09, 0.05, 0.05, 8), 'flat', { pos: [c * 0.8, ry, s * 0.8], color: brassD });
      if (i !== 3) { n.add(kit.cylBase(0.03, 0.03, 0.16, 6), 'flat', { pos: [c * 0.8, ry + 0.05, s * 0.8], color: '#fbf4e0' }); n.add(kit.ico(0.05, 0), 'flat', { pos: [c * 0.8, ry + 0.26, s * 0.8], color: '#fff3c9' }); }
      for (let k = 0; k < 3; k++) { const px = Math.cos(a + 0.2 + k * 0.26) * 0.8, pz = Math.sin(a + 0.2 + k * 0.26) * 0.8; n.add(kit.ico(0.05, 0), 'flat', { pos: [px, -0.15, pz], scale: [0.8, 1.5, 0.8], color: crystal }); n.add(kit.ico(0.024, 0), 'flat', { pos: [px, -0.06, pz], color: crystal }); }
    }
    for (let i = 0; i < 16; i++) { const a = R() * 6.28, r = 0.85 + R() * 0.6; if (slabD(1, x + Math.cos(a) * r, z + Math.sin(a) * r * 0.7) > 0.08) root.add(kit.ico(0.05, 0), 'flat', { pos: [x + Math.cos(a) * r, y + 0.04, z + Math.sin(a) * r * 0.7], scale: [0.9, 0.6, 1.4], rot: [0, R() * 6, 0], color: crystal }); }
  }
  /* A hanging run of chain: its own Group so it can sway. */
  function hangingChain(x, z, topY, len, links) {
    const parts = [], g = new THREE.Group(); g.position.set(x, topY, z);
    for (let i = 0; i < links; i++) { const l = kit.torus(0.075, 0.021, 5, 10); l.scale(0.8, 1.3, 1); l.rotateY(i & 1 ? PI / 2 : 0); l.translate(0, -0.1 - (i * len) / links, 0); parts.push(l); }
    const hook = kit.tube([[0, -len - 0.1, 0], [0.03, -len - 0.2, 0], [-0.06, -len - 0.26, 0.02], [-0.1, -len - 0.2, 0.03]], 0.02, 0.012, 4, 8); parts.push(hook);
    const m = new THREE.Mesh(kit.merge(parts), ctx.toon({ color: '#c8a24e' })); m.castShadow = false; g.add(m); group.add(g);
    return g;
  }
  function coffeeTable(x, z, yaw) {
    const y = FLOOR(1), n = N([x, y + 0.33, z], [0.06, yaw, 0.2]), w = '#8e5f42'; reg(1, x, z, 0.75, 0.45, yaw);
    n.add(rb(1.4, 0.06, 0.74, 0.02), dustWood, { pos: [0, 0, 0], color: w });
    n.add(kit.box(1.2, 0.04, 0.56), dustWood, { pos: [0, -0.3, 0], color: '#a87c52' });
    for (const [a, c, broken] of [[-0.6, -0.3, 0], [0.6, -0.3, 0], [-0.6, 0.3, 0], [0.6, 0.3, 1]]) n.add(kit.cylBase(0.04, 0.03, broken ? 0.22 : 0.46, 6), dustWood, { pos: [a, -0.48 + (broken ? 0.24 : 0), c], color: w });
  }
  function floorLamp(x, z, yaw) {
    const y = FLOOR(1), n = N([x, y + 0.08, z], [0, yaw, PI / 2 - 0.03]);
    n.add(kit.cylBase(0.2, 0.22, 0.05, 12), 'flat', { pos: [0, -0.04, 0], rot: [0.08, 0, 0], color: P.metal });
    n.add(rod([0, 0, 0], [0, 1.62, 0], 0.024), 'flat', { color: '#c6a95a' });
    n.add(kit.cylBase(0.17, 0.3, 0.36, 12, true), dust, { pos: [0.02, 1.56, 0.0], rot: [0, 0, 0.16], color: '#efd9a8' });
  }
  function sideboard(n, L = 1.8) {
    n.add(rb(L, 0.8, 0.46, 0.02), dustWood, { pos: [0, 0.5, 0], color: '#a87c52' });
    n.add(rb(L + 0.1, 0.05, 0.52, 0.012), dustWood, { pos: [0, 0.92, 0], color: '#7b4d38' });
    for (let i = 0; i < 3; i++) { const x = -L / 3 + (i * L) / 3; n.add(kit.box(L / 3 - 0.06, 0.62, 0.02), dustWood, { pos: [x, 0.5, 0.235], color: '#bb9068' }); n.add(kit.ico(0.025, 0), 'flat', { pos: [x + 0.2, 0.52, 0.255], color: P.fadedYellow }); }
    for (const a of [-1, 1]) for (const c of [-1, 1]) n.add(kit.cylBase(0.04, 0.03, 0.1, 6), dustWood, { pos: [a * (L / 2 - 0.08), 0, c * 0.17], color: '#6e5038' });
  }
  /** Boxy CRT television */
  function tv(n) {
    n.add(rb(0.72, 0.56, 0.54, 0.05), dust, { pos: [0, 0.28, 0], color: '#8c8a7c' });
    n.add(rb(0.52, 0.42, 0.04, 0.05), 'flat', { pos: [-0.06, 0.29, 0.26], color: '#3c5a5e' });
    for (let i = 0; i < 2; i++) n.add(kit.cyl(0.03, 0.03, 0.04, 8), 'flat', { pos: [0.28, 0.4 - i * 0.12, 0.27], rot: [PI / 2, 0, 0], color: '#d9d6cb' });
    n.add(rod([0.05, 0.56, 0], [0.34, 0.92, -0.05], 0.009, 3), 'flat', { color: P.metal }); n.add(rod([-0.05, 0.56, 0], [-0.26, 0.9, 0.03], 0.009, 3), 'flat', { color: P.metal });
  }

  /* ---------- general furniture ---------- */
  function chair(n, { col = '#8e5f42', seat = '#c8705e' } = {}) {
    n.add(kit.cyl(0.27, 0.25, 0.06, 12), dustWood, { pos: [0, 0.54, 0], color: col });
    n.add(kit.cyl(0.235, 0.235, 0.03, 12), dust, { pos: [0, 0.58, 0], color: seat });
    for (const [a, c] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) n.add(rod([a * 0.17, 0.52, c * 0.17], [a * 0.25, 0, c * 0.25], 0.03), dustWood, { color: col });
    n.add(kit.torus(0.19, 0.016, 4, 12), dustWood, { pos: [0, 0.26, 0], rot: [PI / 2, 0, 0], color: col });
    n.add(kit.tube([[-0.22, 0.56, -0.18], [-0.24, 0.92, -0.25], [-0.14, 1.18, -0.28], [0.14, 1.18, -0.28], [0.24, 0.92, -0.25], [0.22, 0.56, -0.18]], 0.024, 0.024, 5, 18, { capEnds: false }), dustWood, { color: col });
    n.add(kit.tube([[-0.11, 0.56, -0.19], [-0.12, 0.85, -0.25], [0, 0.98, -0.27], [0.12, 0.85, -0.25], [0.11, 0.56, -0.19]], 0.016, 0.016, 4, 12, { capEnds: false }), dustWood, { color: col });
  }
  /** Chair lying on its back, legs toward the viewer. */
  const chairDown = (l, x, z, yaw, opts) => { const y = FLOOR(l); chair(N([x, y + 0.3, z], [PI / 2 - 0.1, yaw, 0]), opts); reg(l, x, z, 0.45, 0.6, yaw); };
  const chairUp = (l, x, z, yaw, tip = 0, opts) => { chair(N([x, FLOOR(l), z], [0, yaw, tip]), opts); reg(l, x, z, 0.3, 0.3, yaw); };
  function bistro(n) {
    n.add(kit.cyl(0.68, 0.68, 0.05, 20), dust, { pos: [0, 0.98, 0], color: '#f1ebdd' });
    n.add(kit.torus(0.68, 0.022, 5, 24), 'flat', { pos: [0, 0.98, 0], rot: [PI / 2, 0, 0], color: '#c6a95a' });
    n.add(kit.cylBase(0.04, 0.06, 0.92, 8), 'flat', { pos: [0, 0.04, 0], color: '#4a6a66' });
    n.add(kit.cylBase(0.12, 0.06, 0.12, 8), 'flat', { pos: [0, 0.82, 0], color: '#4a6a66' });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.28 + 0.4; n.add(kit.tube([[0, 0.2, 0], [Math.cos(a) * 0.22, 0.08, Math.sin(a) * 0.22], [Math.cos(a) * 0.44, 0.02, Math.sin(a) * 0.44]], 0.036, 0.024, 5, 7), 'flat', { color: '#4a6a66' }); }
  }
  const tableUp = (l, x, z) => { bistro(N([x, FLOOR(l), z])); reg(l, x, z, 0.68, 0.68); };
  const tableDown = (l, x, z, yaw) => { bistro(N([x, FLOOR(l) + 0.67, z], [0.08, yaw, 1.5]).at({ pos: [-0.02, 0, 0] })); reg(l, x, z, 0.36, 0.36, yaw); reg(l, x - Math.cos(yaw) * 0.98, z + Math.sin(yaw) * 0.98, 0.12, 0.68, yaw); };
  function cupSet(n) {
    const c = n.at({}); c.add(kit.cyl(0.13, 0.11, 0.02, 10), 'flat', { pos: [0, 0.015, 0], color: '#fbf4e0' }); c.add(kit.cylBase(0.075, 0.055, 0.1, 8, true), 'flat', { pos: [0, 0.02, 0], color: '#e8664f' });
    c.add(kit.torus(0.03, 0.009, 3, 8), 'flat', { pos: [0.08, 0.075, 0], color: '#e8664f' });
  }
  function crate(n, s = 0.9, opts = {}) {
    const w = '#b48a5c', d = '#8e6a44', slat = (s - 0.12) / 3;
    n.add(kit.boxBase(s - 0.1, s - 0.1, s - 0.1), 'flat', { pos: [0, 0.05, 0], color: '#5f4a38' });
    for (const a of [-1, 1]) for (const c of [-1, 1]) n.add(kit.boxBase(0.08, s, 0.08), dustWood, { pos: [(a * (s - 0.08)) / 2, 0, (c * (s - 0.08)) / 2], color: d });
    for (let i = 0; i < 3; i++) {
      const y = 0.09 + slat * (i + 0.5);
      for (const f of [-1, 1]) {
        if (!(opts.broken && i === 2 && f === 1)) n.add(kit.box(s - 0.02, slat - 0.04, 0.03), dustWood, { pos: [0, y, (f * s) / 2], rot: [0, 0, R.range(-0.015, 0.015)], color: i % 2 ? w : '#c49a6a' });
        n.add(kit.box(0.03, slat - 0.04, s - 0.02), dustWood, { pos: [(f * s) / 2, y, 0], rot: [R.range(-0.015, 0.015), 0, 0], color: i % 2 ? '#c49a6a' : w });
      }
    }
    n.add(quad(s * 0.56, s * 0.56, 'crate'), atlas, { pos: [0, s * 0.5, s / 2 + 0.018] });
    if (!opts.open) for (let i = 0; i < 4; i++) n.add(kit.box(s + 0.02, 0.035, s / 4 - 0.025), dustWood, { pos: [0, s + 0.015, -s * 0.375 + (i * s) / 4], rot: [R.range(-0.012, 0.012), 0, R.range(-0.012, 0.012)], color: i % 2 ? '#c49a6a' : w });
  }
  function bookcase(n, W = 2.6, H = 2.2, { fill = 0.8 } = {}) {
    const w = '#8e5f42', D = 0.42, rows = 5;
    n.add(kit.boxBase(W, H, 0.04), dustWood, { pos: [0, 0, -D / 2 + 0.03], color: '#6e5038' });
    for (const s of [-1, 1]) n.add(kit.boxBase(0.07, H, D), dustWood, { pos: [(s * W) / 2, 0, 0], color: w });
    n.add(kit.boxBase(W + 0.2, 0.09, D + 0.1), dustWood, { pos: [0, H, 0], color: w });
    n.add(kit.boxBase(W + 0.1, 0.14, D + 0.04), dustWood, { pos: [0, 0, 0], color: '#6e5038' });
    for (let i = 0; i < rows; i++) {
      const y = 0.14 + (i * (H - 0.16)) / rows, h = (H - 0.16) / rows;
      n.add(kit.box(W, 0.045, D), dustWood, { pos: [0, y, 0], color: w });
      let x = -W / 2 + 0.06;
      while (x < W / 2 - 0.3) {
        const run = R.range(0.3, 0.9), hh = h * R.range(0.62, 0.84);
        if (R() < fill && x + run < W / 2 - 0.04) {
          const g = kit.box(run, hh, 0.26); const s = slots.spines, a = R(), wf = run / 3.2, uv = g.attributes.uv;
          for (let k = 0; k < uv.count; k++) uv.setXY(k, s.u0 + (a * (1 - wf) + uv.getX(k) * wf) * (s.u1 - s.u0), s.v0 + uv.getY(k) * (s.v1 - s.v0));
          n.add(g, atlas, { pos: [x + run / 2, y + 0.02 + hh / 2, 0.02] });
          x += run + 0.02;
        } else if (R() < 0.5) {
          const g = kit.box(0.08, hh, 0.26); n.add(uvTo(g, 'spines'), atlas, { pos: [x + 0.2, y + 0.03 + hh / 2, 0.02], rot: [0, 0, -0.38] });
          x += 0.45;
        } else x += 0.42;
      }
    }
  }
  function bookStack(n, k = 4) {
    let y = 0;
    for (let i = 0; i < k; i++) {
      const h = R.range(0.05, 0.09), w = R.range(0.34, 0.46), d = R.range(0.26, 0.34), a = R.range(-0.5, 0.5);
      n.add(kit.box(w, h, d), 'flat', { pos: [0, y + h / 2, 0], rot: [0, a, 0], color: R.pick([P.fadedRed, P.fadedBlue, '#5d9a6a', P.fadedYellow, '#8a6fb0']) });
      n.add(kit.box(w - 0.035, h * 0.72, d + 0.005), 'flat', { pos: [0.02, y + h / 2, 0], rot: [0, a, 0], color: '#fbf4e0' });
      y += h;
    }
  }
  function openBook(n) {
    const f = warp(new THREE.PlaneGeometry(0.34, 0.46, 4, 1), (v) => { v.z = 0.05 * Math.sin((Math.abs(v.x) / 0.34) * PI); }).rotateX(-PI / 2);
    n.add(kit.box(0.72, 0.02, 0.5), 'flat', { pos: [0, 0.01, 0], color: P.fadedRed });
    n.add(f.clone().translate(-0.17, 0.05, 0).rotateZ(0.04), 'flat', { color: '#fbf4e0' }); n.add(f.clone().translate(0.17, 0.05, 0).rotateZ(-0.04), 'flat', { color: '#fbf4e0' });
  }
  function desk(n) {
    n.add(rb(1.9, 0.07, 0.9, 0.015), dustWood, { pos: [0, 0.92, 0], color: '#8e5f42' });
    for (const s of [-1, 1]) { n.add(rb(0.56, 0.84, 0.8, 0.012), dustWood, { pos: [s * 0.64, 0.46, 0], color: '#a87c52' }); for (let i = 0; i < 3; i++) { n.add(kit.box(0.46, 0.2, 0.015), dustWood, { pos: [s * 0.64, 0.22 + i * 0.26, 0.405 + (i === 1 && s > 0 ? 0.12 : 0)], color: '#bb9068' }); n.add(kit.box(0.14, 0.03, 0.03), 'flat', { pos: [s * 0.64, 0.24 + i * 0.26, 0.425 + (i === 1 && s > 0 ? 0.12 : 0)], color: '#c6a95a' }); } }
    const l = n.at({ pos: [0.62, 0.955, -0.12], rot: [0, -0.4, 0] }); l.add(kit.cylBase(0.13, 0.15, 0.03, 10), 'flat', { color: '#3f8a58' }); l.add(rod([0, 0.02, 0], [0.03, 0.46, 0], 0.016), 'flat', { color: '#c6a95a' }); l.add(kit.cyl(0.11, 0.1, 0.34, 10), 'flat', { pos: [0.03, 0.5, 0.06], rot: [0, 0, PI / 2], color: '#3f8a58' });
  }
  /** Long serving counter with an espresso machine. */
  function cafeBar(n, L) {
    n.add(rb(L, 1.02, 0.66, 0.02), dustWood, { pos: [0, 0.52, 0], color: '#a87c52' });
    for (let i = 0; i < Math.round(L / 0.3); i++) n.add(kit.box(0.2, 0.88, 0.014), dustWood, { pos: [-L / 2 + 0.16 + i * 0.3, 0.5, 0.335], color: '#bb9068' });
    n.add(rb(L + 0.14, 0.07, 0.82, 0.02), dust, { pos: [0, 1.06, 0.03], color: '#efe9da' });
    const m = n.at({ pos: [-L * 0.2, 1.1, 0], rot: [0, 0.06, 0] });
    m.add(rb(0.8, 0.14, 0.52, 0.03), 'flat', { pos: [0, 0.07, 0], color: '#cfd6d2' });
    m.add(rb(0.8, 0.26, 0.4, 0.04), 'flat', { pos: [0, 0.48, -0.03], color: '#d86a50' });
    m.add(rb(0.84, 0.05, 0.46, 0.02), 'flat', { pos: [0, 0.62, -0.03], color: '#cfd6d2' });
    for (const s of [-1, 1]) { m.add(rod([s * 0.42, 0.14, -0.2], [s * 0.42, 0.36, -0.2], 0.025), 'flat', { color: P.metal }); m.add(kit.cylBase(0.05, 0.05, 0.08, 8), 'flat', { pos: [s * 0.22, 0.3, 0.1], color: P.metalDark }); m.add(rod([s * 0.22, 0.3, 0.1], [s * 0.22, 0.26, 0.28], 0.02), 'flat', { color: '#3a3f46' }); }
    for (let i = 0; i < 3; i++) m.add(kit.cylBase(0.06, 0.045, 0.08, 7), 'flat', { pos: [-0.14 + i * 0.14, 0.66, 0], color: '#fbf4e0' });
    const g = n.at({ pos: [L * 0.24, 1.1, 0.02] }); g.add(kit.cylBase(0.14, 0.17, 0.24, 8), 'flat', { color: '#3f5450' }); g.add(kit.cylBase(0.1, 0.05, 0.22, 8), 'flat', { pos: [0, 0.24, 0], color: '#cfd6d2' });
    const j = n.at({ pos: [L * 0.36, 1.1, 0.06] }); for (let i = 0; i < 3; i++) j.add(kit.cylBase(0.1, 0.1, 0.26 - i * 0.03, 8), 'flat', { pos: [i * 0.2 - 0.2, 0, 0], color: ['#d8b35a', '#8fd6e6', '#c8705e'][i] });
  }
  function pendant(x, z, level, drop, tip) {
    const top = CEIL(level), b0 = [x + tip * drop, top - drop, z]; const c = N(b0, [0, 0, -tip]);
    root.add(rod([x, top, z], b0, 0.012, 3), 'flat', { color: P.metalDark });
    c.add(kit.cylBase(0.08, 0.42, 0.3, 12, true), 'flat', { pos: [0, -0.32, 0], color: '#3f8a78' });
    c.add(kit.cylBase(0.09, 0.09, 0.06, 8), 'flat', { pos: [0, -0.04, 0], color: '#c6a95a' });
    c.add(kit.ico(0.08, 1), 'flat', { pos: [0, -0.3, 0], color: '#fff3c9' });
  }
  /* ---------- attic ---------- */
  function steamer(n) {
    const c = '#7b4d38', t = '#c6a95a';
    n.add(rb(1.5, 0.58, 0.82, 0.03), dust, { pos: [0, 0.31, 0], color: c });
    const lid = n.at({ pos: [0, 0.6, -0.41], rot: [-0.46, 0, 0] });
    lid.add(warp(rb(1.5, 0.3, 0.82, 0.05), (v) => { if (v.y > 0) v.y += 0.12 * (1 - (v.z * v.z) / 0.17); }), dust, { pos: [0, 0.15, 0.41], color: '#8e5f42' });
    for (const s of [-0.5, 0.5]) { n.add(kit.box(0.09, 0.6, 0.84), 'flat', { pos: [s, 0.31, 0], color: '#a87c52' }); lid.add(kit.box(0.09, 0.08, 0.84), 'flat', { pos: [s, 0.2, 0.41], color: '#a87c52' }); }
    for (const a of [-1, 1]) for (const c2 of [-1, 1]) n.add(kit.box(0.14, 0.6, 0.14), 'flat', { pos: [a * 0.7, 0.31, c2 * 0.35], color: t });
    n.add(kit.box(0.24, 0.16, 0.04), 'flat', { pos: [0, 0.55, 0.42], color: t });
    n.add(kit.box(1.4, 0.04, 0.72), 'flat', { pos: [0, 0.55, 0], color: '#bfa98a' });
    for (let i = 0; i < 4; i++) n.add(warp(new THREE.PlaneGeometry(0.6, 0.5, 3, 3).rotateX(-PI / 2), (v) => { v.y = Math.sin(v.x * 7 + i) * 0.04; }), 'flat', { pos: [-0.4 + i * 0.26, 0.6, -0.06 + (i % 2) * 0.14], rot: [0, i, 0], color: i % 2 ? '#d8cdb2' : '#c8705e' });
  }
  function birdcage(n) {
    const c = '#d8b35a', H = 0.7, r = 0.3;
    n.add(kit.cylBase(0.34, 0.36, 0.08, 14), 'flat', { color: '#b08a3e' });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r; n.add(kit.tube([[x, 0.05, z], [x, H * 0.72, z], [x * 0.55, H * 0.95, z * 0.55], [0, H * 1.05, 0]], 0.009, 0.009, 3, 7, { capEnds: false }), 'flat', { color: c }); }
    n.add(kit.torus(r, 0.014, 4, 18), 'flat', { pos: [0, H * 0.72, 0], rot: [PI / 2, 0, 0], color: c });
    n.add(kit.torus(0.08, 0.012, 4, 10), 'flat', { pos: [0, H * 1.12, 0], color: c });
  }
  function wardrobe(n) {
    const c = '#8e5f42', l = '#a87c52';
    n.add(rb(1.5, 2.0, 0.66, 0.02), dustWood, { pos: [0, 1.12, 0], color: c }); n.add(rb(1.68, 0.1, 0.78, 0.02), dustWood, { pos: [0, 2.17, 0], color: '#6e5038' }); n.add(kit.boxBase(1.6, 0.13, 0.72), dustWood, { color: '#6e5038' });
    n.add(kit.box(0.7, 1.84, 0.03), dustWood, { pos: [-0.37, 1.12, 0.34], color: l });
    const d = n.at({ pos: [0.72, 0.2, 0.34], rot: [0, 1.0, 0] }); d.add(kit.box(0.7, 1.84, 0.03), dustWood, { pos: [-0.35, 0.92, 0], color: l }); d.add(kit.box(0.5, 1.5, 0.012), 'flat', { pos: [-0.35, 0.92, 0.02], color: '#c9e6df' });
    n.add(kit.ico(0.03, 0), 'flat', { pos: [-0.1, 1.15, 0.37], color: '#c6a95a' });
    n.add(kit.box(0.72, 1.82, 0.01), 'flat', { pos: [0.37, 1.12, 0.335], color: '#3f3530' });
    n.add(rod([0.03, 1.8, 0.2], [0.68, 1.8, 0.2], 0.012, 4), 'flat', { pos: [0, 0, 0], color: P.metal });
  }
  function rolledRug(n) {
    n.add(kit.cyl(0.22, 0.22, 2.2, 10), 'flat', { rot: [0, 0, PI / 2], pos: [0, 0.22, 0], color: '#b5523f' });
    n.add(kit.torus(0.1, 0.03, 5, 12), 'flat', { pos: [1.11, 0.22, 0], rot: [0, PI / 2, 0], color: '#efdcb0' });
    n.add(kit.torus(0.17, 0.018, 4, 14), 'flat', { pos: [1.11, 0.22, 0], rot: [0, PI / 2, 0], color: P.fadedYellow });
    for (const x of [-0.6, 0.6]) n.add(kit.torus(0.225, 0.016, 4, 14), 'flat', { pos: [x, 0.22, 0], rot: [0, PI / 2, 0], color: '#efdcb0' });
  }

  /* ---------- wall hangings ---------- */
  const onNorth = (x, y) => [[x, y, WN], [0, 0, 0]];
  const onWest = (z, y) => [[WW, y, z], [0, PI / 2, 0]];
  const onSouth = (x, y) => [[x, y, WS], [0, PI, 0]];
  function hang([pos, rot], crook) { return N(pos, rot).at({ rot: [0, 0, crook] }); }
  function frame(place, crook, w, h, pic, col = '#a87c52') {
    const n = hang(place, crook), t = 0.08, d = 0.06;
    for (const s of [-1, 1]) { n.add(kit.box(w + t * 2, t, d), dustWood, { pos: [0, s * (h / 2 + t / 2), d / 2], color: col }); n.add(kit.box(t, h, d), dustWood, { pos: [s * (w / 2 + t / 2), 0, d / 2], color: col }); }
    n.add(kit.box(w, h, 0.016), 'flat', { pos: [0, 0, 0.012], color: '#f4ecd8' });
    n.add(quad(w * 0.84, h * 0.84, pic), atlas, { pos: [0, 0, 0.024] });
    return n;
  }
  function clock(place, crook, r) {
    const n = hang(place, crook), bz = 0.075;
    n.add(kit.cyl(r + 0.05, r + 0.09, 0.12, 24), dustWood, { rot: [PI / 2, 0, 0], pos: [0, 0, 0.06], color: '#8e5f42' });
    n.add(kit.torus(r + 0.02, 0.034, 6, 28), 'flat', { pos: [0, 0, 0.125], color: '#d8b35a' });
    const face = new THREE.CircleGeometry(r, 24); uvTo(face, 'clock'); n.add(face, atlas, { pos: [0, 0, 0.122] });
    const hr = n.at({ pos: [0, 0, 0.128], rot: [0, 0, 1.15] }), mn = n.at({ pos: [0, 0, 0.134], rot: [0, 0, -2.25] });
    hr.add(kit.box(0.045, r * 0.55, 0.012), 'flat', { pos: [0, r * 0.25, 0], color: '#3a3f46' }); mn.add(kit.box(0.03, r * 0.82, 0.012), 'flat', { pos: [0, r * 0.38, 0], color: '#3a3f46' });
    n.add(kit.cyl(0.04, 0.04, 0.02, 10), 'flat', { pos: [0, 0, 0.14], rot: [PI / 2, 0, 0], color: '#d8b35a' });
    // drop case + stilled pendulum
    n.add(rb(r * 0.9, r * 1.1, 0.1, 0.02), dustWood, { pos: [0, -r - r * 0.5, 0.05], color: '#7b4d38' });
    n.add(kit.box(r * 0.62, r * 0.82, 0.01), 'flat', { pos: [0, -r - r * 0.5, 0.1], color: '#ded9c2' });
    n.add(rod([0, -r, bz + 0.03], [0.02, -r - r * 0.68, bz + 0.03], 0.012, 4), 'flat', { color: '#d8b35a' }); n.add(kit.cyl(0.075, 0.075, 0.02, 12), 'flat', { pos: [0.02, -r - r * 0.72, bz + 0.03], rot: [PI / 2, 0, 0], color: '#d8b35a' });
    return n;
  }

  /* ---------- pages ---------- */
  const pageGeo = warp(new THREE.PlaneGeometry(0.34, 0.46, 2, 2), (v) => { v.z = 0.03 * Math.cos(v.x * 7) + 0.02 * Math.sin(v.y * 6); }).rotateX(-PI / 2);
  const pageA = uvTo(pageGeo.clone(), 'page'), pageB = uvTo(pageGeo.clone(), 'page2');
  const scatterPages = (l, x, z, rx, rz, n) => { for (let i = 0; i < n; i++) { const a = R() * 6.28, r = Math.sqrt(R()), px = x + Math.cos(a) * rx * r, pz = z + Math.sin(a) * rz * r; if (onSlab(l, px, pz, 0.15)) root.add(R() < 0.7 ? pageA : pageB, atlas, { pos: [px, FLOOR(l) + 0.04 + R() * 0.03, pz], rot: [R.range(-0.04, 0.04), R() * 6.28, R.range(-0.04, 0.04)] }); } };
  const liveOnes = []; const stirPage = (l, x, z) => { if (onSlab(l, x, z, 0.1)) liveOnes.push({ x, y: FLOOR(l) + 0.07, z, yaw: R() * 6.28, ph: R() * 40, sp: R.range(0.24, 0.42) }); };

  /* ---------- plants ---------- */
  const fronds = [];
  const fernTint = [P.fern, P.leafMid, P.leafDeep, P.ivyLit, P.fern];
  function fern(x, y, z, size = 1, count = 7, tint = fernTint) {
    const base = R() * 6.28, m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const yaw = base + (i / count) * 6.28 + R.range(-0.25, 0.25), s = size * R.range(0.75, 1.2), pitch = R.range(-0.45, 0.2);
      m.copy(kit.xf({ pos: [x + R.range(-0.05, 0.05), y, z + R.range(-0.05, 0.05)], rot: [pitch, yaw, 0], scale: s }));
      fronds.push({ m: m.clone(), ph: R() * 6.28, amp: 0.05 + R() * 0.05, x, z, c: new THREE.Color(R.pick(tint)).offsetHSL(0, 0, R.range(-0.03, 0.03)) });
    }
  }
  const leafG = kit.leaf(0.26, 0.15, 0.3), leafS = kit.leaf(0.16, 0.1, 0.3), bladeG = kit.blade(0.5, 0.05, 0.16, 3), stemG = kit.blade(0.5, 0.022, 0.08, 2), petal = kit.flower(0.1, 5), dot = kit.ico(0.032, 0);
  const mossDome = new THREE.SphereGeometry(1, 11, 4, 0, PI * 2, 0, PI / 2);
  function moss(l, x, y, z, rx, rz, h = 0.14) {
    const g = mossDome.clone(), ph = R() * 6.28, ph2 = R() * 6.28;
    warp(g, (v) => { const k = 1 + 0.14 * Math.sin(Math.atan2(v.z, v.x) * 3 + ph) + 0.08 * Math.sin(Math.atan2(v.z, v.x) * 5 + ph2); v.x *= k; v.z *= k; });
    root.add(g, 'mossy', { pos: [x, y, z], scale: [rx, h * 1.5, rz], rot: [0, R() * 6, 0], color: R.pick([P.moss, '#6fae4c', P.moss, P.mossLit, '#5f9f52']) });
  }
  function bloom(x, y, z, count, spread, cols, h = 0.5) {
    for (let i = 0; i < count; i++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * spread, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, hh = h * R.range(0.65, 1.25), yaw = R() * 6.28;
      const n = new Node(new THREE.Matrix4().multiply(kit.xf({ pos: [px, y, pz], rot: [0, yaw, 0] })), fb);
      n.add(stemG, leafMat, { scale: [1.3, hh * 2, 1.3], color: P.leafMid });
      n.add(leafS, leafMat, { pos: [0, hh * 0.4, 0], rot: [-0.5, 1.2, 0], color: P.leafLit });
      const hd = n.at({ pos: [0, hh, hh * 0.3], rot: [0.3, 0, 0], scale: R.range(0.9, 1.45) }); hd.add(petal, leafMat, { color: R.pick(cols) }); hd.add(dot, leafMat, { pos: [0, 0.018, 0], color: P.flowerYellow });
    }
  }
  function tuft(x, y, z, count, spread, h = 0.5, cols = [P.grass, P.grassLit, P.leafMid]) {
    for (let i = 0; i < count; i++) { const a = R() * 6.28, r = Math.sqrt(R()) * spread; fb.add(bladeG, leafMat, { pos: [x + Math.cos(a) * r, y, z + Math.sin(a) * r], rot: [0, R() * 6.28, 0], scale: [1, R.range(0.6, 1.3) * (h / 0.5), 1], color: R.pick(cols) }); }
  }
  /** Stem wandering along a surface with leaves. Stems are static; a tube + a sleeve of leaves. */
  function vine(pts, r = 0.03, every = 0.14, cols = [P.ivy, P.ivyLit, P.leafMid, P.leafDeep], batch = fb) {
    batch.add(kit.tube(pts, r, r * 0.45, 5, Math.max(8, pts.length * 3), { capEnds: false }), leafMat, { color: '#5e8a4a' });
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), L = curve.getLength(), k = Math.floor(L / every);
    for (let i = 0; i < k; i++) {
      const p = curve.getPointAt((i + 0.5) / k), yaw = R() * 6.28;
      batch.add(R() < 0.6 ? leafG : leafS, leafMat, { pos: [p.x, p.y, p.z], rot: [R.range(-0.9, 0.5), yaw, R.range(-0.5, 0.5)], color: R.pick(cols) });
    }
  }
  /** Lush wall-base band following polyline pts. */
  function band(level, pts, { ferns = 6, pads = 8, flowers = 3, tufts = 4, w = 0.4, cols = [P.flowerWhite, P.flowerYellow, P.flowerBlue] } = {}) {
    const y = FLOOR(level), segs = []; let tot = 0;
    for (let i = 0; i + 1 < pts.length; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push([pts[i], pts[i + 1], tot, l]); tot += l; }
    const sample = (t) => { const d = t * tot, s = segs.find((q) => d <= q[2] + q[3]) || segs.at(-1), u = (d - s[2]) / s[3]; return [s[0][0] + (s[1][0] - s[0][0]) * u + R.range(-w, w), s[0][1] + (s[1][1] - s[0][1]) * u + R.range(-w, w)]; };
    const ok = (x, z, m) => slabD(level, x, z) > m && inner(x, z) && free(level, x, z, m);
    for (let i = 0; i < pads; i++) { const [x, z] = sample(R()); if (ok(x, z, 0.14)) moss(level, x, y + 0.01, z, R.range(0.2, 0.46), R.range(0.18, 0.4), R.range(0.07, 0.15)); }
    for (let i = 0; i < ferns; i++) { const [x, z] = sample(R()); if (ok(x, z, 0.2)) fern(x, y + 0.03, z, R.range(0.85, 1.2), R.int(5, 8)); }
    for (let i = 0; i < flowers; i++) { const [x, z] = sample(R()); if (ok(x, z, 0.16)) bloom(x, y + 0.02, z, R.int(5, 9), 0.34, cols, 0.42); }
    for (let i = 0; i < tufts; i++) { const [x, z] = sample(R()); if (ok(x, z, 0.12)) tuft(x, y + 0.02, z, 10, 0.24, 0.42); }
  }

  /* ========== PLACEMENT: ground floor, the flooded corner store ========== */
  {
    const y = FLOOR(0);
    // standing gondola with a second one toppled against it, domino style
    gondola(N([-7.05, y, -3.2], [-0.045, 0.03, 0.01]), 2.6, 2.0, { fill: 0.55, slip: true }); reg(0, -7.05, -3.2, 1.35, 0.36, 0.03);
    gondola(N([-7.4, y + 0.02, -0.98], [-1.02, -0.07, 0.03]), 2.8, 2.05, { fill: 0.42, slip: true, col: '#b57563', wreck: true }); reg(0, -7.4, -1.9, 1.5, 0.98, -0.07);
    spill(0, -7.5, -0.5, 2.0, 0.55, 26, 0.3); spill(0, -6.0, -1.8, 0.8, 0.9, 12, 0.3);
    gondola(N([-0.3, y + 0.2, -5.5], [-1.42, 1.4, 0.05]), 2.3, 1.55, { fill: 0.4, col: '#6f9fb0', shelves: 3 }); reg(0, -1.1, -5.65, 0.95, 1.2);
    spill(0, 0.15, -5.2, 0.5, 1.0, 12);
    gondola(N([-6.6, y, -10.2]), 3.3, 2.1, { fill: 0.5 }); reg(0, -6.6, -10.2, 1.7, 0.34);
    gondola(N([-9.95, y, -6.6], [0, PI / 2, 0]), 3.0, 2.0, { fill: 0.6, col: '#6f9fb0' }); reg(0, -9.95, -6.6, 0.34, 1.55);

    freezer(-2.95, -2.75, -0.1);
    checkout(-0.45, -2.3, PI / 2 + 0.06);
    // cigarette/back shelf bolted to the east wall behind the till
    const bk = N([1.14, y, -2.3], [0, -PI / 2, 0]);
    bk.add(kit.box(2.2, 0.05, 0.3), 'flat', { pos: [0, 1.3, 0.14], color: '#dfe3dc' }); bk.add(kit.box(2.2, 0.05, 0.3), 'flat', { pos: [0, 1.75, 0.14], color: '#dfe3dc' });
    bk.add(kit.box(2.2, 0.8, 0.03), 'flat', { pos: [0, 1.56, 0.02], color: '#4fa79b' });
    stock(bk, 2.1, [1.33, 1.78], 0.15, 0.7);
    cart(-4.75, -0.42, 0.55);
    basket(-3.75, 0.24, -0.5, 0.5, 0.26); basket(-9.2, y, -2.0, 1.2, 0);
    wetSign(-1.5, -0.32, -0.5);
    tubeLight(-6.1, CEIL(0), -2.0, 0.08, 0.22, 0.35);
    tubeLight(-2.1, CEIL(0), -3.55, PI / 2, -0.1, 0.26);
    N([-5.3, CEIL(0) - 0.72, -1.8], [0, -0.1, 0.09]).add(kit.box(1.5, 0.34, 0.03), 'flat', { color: '#f7efd9' }).add(quad(1.42, 0.3, 'sign'), atlas, { pos: [0, 0, 0.018] });
    root.add(rod([-5.9, CEIL(0), -1.8], [-5.9, CEIL(0) - 0.6, -1.8], 0.008, 3), 'flat', { color: P.metalDark }); root.add(rod([-4.7, CEIL(0), -1.8], [-4.7, CEIL(0) - 0.82, -1.8], 0.008, 3), 'flat', { color: P.metalDark });
    // drinks cooler on the north wall, glass doors, seen past the trunk through the east hole
    const dc = N([-0.6, y, -10.34]); reg(0, -0.6, -10.34, 1.8, 0.36);
    dc.add(rb(3.5, 2.2, 0.68, 0.02), 'flat', { pos: [0, 1.1, 0], color: '#d9d6cb' }); dc.add(kit.box(3.36, 0.3, 0.02), 'flat', { pos: [0, 2.0, 0.345], color: '#4fa79b' });
    dc.add(kit.box(3.3, 1.66, 0.02), 'flat', { pos: [0, 1.0, 0.345], color: '#2c6f75' });
    for (let s = 0; s < 3; s++) { for (let i = 0; i < 12; i++) if (R() < 0.75) bottle(dc, { pos: [-1.55 + i * 0.28, 0.25 + s * 0.56, 0.42], scale: 0.95 }); dc.add(kit.box(3.3, 0.03, 0.2), 'flat', { pos: [0, 0.24 + s * 0.56, 0.42], color: '#cfd6d2' }); }
    for (let i = 0; i <= 3; i++) dc.add(kit.box(0.05, 1.7, 0.05), 'flat', { pos: [-1.65 + i * 1.1, 1.0, 0.54], color: '#cfd6d2' });
    gb.add(kit.box(3.3, 1.7, 0.02), glassMat, { pos: [-0.6, y + 1.0, -10.34 + 0.54] });
    // crates tucked in the south-west corner, posters on the walls
    crate(N([-10.1, y, -0.45], [0, 0.22, 0]), 0.92, { broken: true }); crate(N([-10.05, y + 0.95, -0.5], [0, -0.3, 0]), 0.74); crate(N([-9.95, y, -1.5], [0, -0.1, 0]), 0.82, { open: true }); reg(0, -10.1, -0.95, 0.6, 1.1);
    crate(N([-9.9, y, -9.3], [0, 0.35, 0]), 0.95); crate(N([-9.9, y + 0.98, -9.3], [0, -0.1, 0]), 0.76, { open: true }); reg(0, -9.9, -9.3, 0.6, 0.6);
    root.add(quad(0.7, 0.7, 'poster'), atlas, { pos: [-10.68, 1.7, -2.8], rot: [0, PI / 2, 0.07] });
    root.add(quad(0.6, 0.6, 'poster'), atlas, { pos: [0.0, 1.8, -10.68 + 0.02], rot: [0, 0, -0.1] });
  }

  /* ========== first floor, the living room ========== */
  {
    const y = FLOOR(1);
    const rug = uvTo(new THREE.PlaneGeometry(3.7, 2.5, 14, 10), 'rug'); rug.rotateX(-PI / 2);
    warp(rug, (v) => { const k = Math.max(0, v.x * 0.8 + v.z * 0.8 - 1.6); v.y = 0.016 + k * k * 0.22 + 0.006 * Math.sin(v.x * 4 + v.z * 3); });
    rug.computeVertexNormals();
    root.add(rug, atlas, { pos: [-2.95, y, -0.78], rot: [0, 0.2, 0] }); foot.push({ level: 1, x: -2.95, z: -0.78, hx: 1.8, hz: 1.05, c: Math.cos(0.2), s: Math.sin(0.2) });
    sofa(-4.12, -0.64, 0.26); // clear of the facade pier and the blooms outside: this is the spot the collapse view sees best
    coffeeTable(-2.1, -0.25, 0.12);
    piano(-0.42, -3.74, 0.03);
    chandelier(-2.74, -2.57); // the floor between the two slab holes is barely ring-wide here
    floorLamp(-7.2, -2.5, 2.7);
    const sb = N([-10.42, y, -2.1], [0, PI / 2, 0]); sideboard(sb, 2.2); reg(1, -10.42, -2.1, 0.3, 1.1); tv(sb.at({ pos: [-0.3, 0.95, 0], rot: [0, 0.14, 0] }));
    bookcase(N([-8.0, y, -10.42]), 2.8, 2.25, { fill: 0.72 }); reg(1, -8.0, -10.42, 1.45, 0.26);
    sideboard(N([0.92, y, -7.15], [0, -PI / 2, 0]), 1.9); reg(1, 0.92, -7.15, 0.3, 0.98);
    // armchair angled at the fallen chandelier
    const ac = N([-7.55, y, -1.1], [0, 1.1, 0]); reg(1, -7.55, -1.1, 0.7, 0.7, 1.1);
    ac.add(rb(1.1, 0.34, 1.0, 0.06), dust, { pos: [0, 0.3, 0], color: '#5f9a8a' }); ac.add(rb(1.12, 0.86, 0.24, 0.08), dust, { pos: [0, 0.68, -0.44], rot: [-0.08, 0, 0], color: '#4f8c80' });
    for (const s of [-1, 1]) ac.add(rb(0.22, 0.62, 1.0, 0.07), dust, { pos: [s * 0.54, 0.46, 0], color: '#4f8c80' });
    ac.add(rb(0.84, 0.18, 0.82, 0.08, 2), dust, { pos: [0, 0.54, 0.05], color: '#79b3a3' });
    for (const a of [-1, 1]) for (const c of [-1, 1]) ac.add(kit.cylBase(0.05, 0.035, 0.14, 6), dustWood, { pos: [a * 0.46, 0, c * 0.4], color: '#6e5038' });
    bookStack(N([-1.8, y, -0.8], [0, 0.5, 0]), 3);
    scatterPages(1, -1.6, -3.0, 1.0, 0.8, 7); scatterPages(1, -6.8, -1.9, 1.3, 0.9, 7); stirPage(1, -2.2, 0.0); stirPage(1, -0.9, -0.5); stirPage(1, -6.3, -2.1);
    clock(onNorth(-0.5, 4.7), 0.16, 0.44);
    frame(onNorth(-3.0, 4.45), -0.09, 0.8, 0.6, 'picSea');
    frame(onWest(-4.4, 4.3), 0.12, 0.92, 0.66, 'picSea', '#8e5f42');
    frame(onWest(-1.6, 4.5), -0.18, 0.56, 0.56, 'picFlower', '#c6a95a');
    frame(onWest(-7.3, 4.4), 0.05, 0.42, 0.7, 'picHouse');
    frame(onSouth(-8.2, 4.3), 0.1, 0.8, 0.6, 'picFlower');
    frame(onNorth(-5.65, 4.6), -0.1, 0.5, 0.5, 'picFlower');
  }

  /* ========== second floor, the cafe / study ========== */
  {
    const y = FLOOR(2);
    tableUp(2, -6.25, -1.45);
    cupSet(N([-6.05, y + 1.005, -1.3])); cupSet(N([-6.55, y + 1.005, -1.65], [0, 1, 0])); openBook(N([-6.2, y + 1.005, -1.72], [0, 0.4, 0], 0.7));
    chairUp(2, -7.25, -1.2, 1.3); chairUp(2, -6.4, -0.35, 3.3);
    tableDown(2, -6.3, -2.75, 0.05);
    chairDown(2, -4.7, -1.9, 0.5, { seat: '#6f9fb0' });
    tableUp(2, -0.3, -6.42); cupSet(N([-0.1, y + 1.005, -6.27]));
    chairUp(2, -1.6, -8.55, 0.7, 0.05, { seat: '#79c26a' }); chairDown(2, 0.66, -6.72, PI / 2 + 0.1, { seat: P.fadedYellow });
    chairDown(2, -1.2, -5.9, -0.9);
    desk(N([-0.15, y, -7.76], [0, -0.05, 0])); reg(2, -0.15, -7.76, 1.0, 0.5, -0.05);
    openBook(N([-0.35, y + 0.97, -7.7], [0, 0.2, 0])); bookStack(N([-0.85, y + 0.955, -7.82]), 5);
    bookcase(N([-0.2, y, -10.44]), 2.9, 2.3); reg(2, -0.2, -10.44, 1.5, 0.26);
    bookStack(N([-2.3, y, -9.6], [0, 0.4, 0]), 6); bookStack(N([-2.75, y, -9.75], [0, 1, 0]), 4); bookStack(N([-2.0, y, -8.95], [0, 1.1, 0]), 5);
    cafeBar(N([-10.35, y, -1.72], [0, PI / 2, 0]), 2.5); reg(2, -10.35, -1.72, 0.42, 1.3);
    pendant(-6.25, -1.45, 2, 1.0, 0.03); pendant(-7.7, -2.4, 2, 0.9, -0.06);
    root.add(quad(0.9, 0.9, 'menu'), atlas, { pos: [-10.67, 7.05, -1.55], rot: [0, PI / 2, -0.04] });
    clock(onNorth(-8.4, 7.3), -0.13, 0.42);
    frame(onNorth(-3.0, 7.2), 0.14, 0.56, 0.56, 'picFlower');
    frame(onWest(-7.3, 7.2), -0.1, 0.9, 0.62, 'picSea');
    frame(onSouth(-8.5, 7.1), 0.08, 0.42, 0.7, 'picHouse');
    crate(N([-8.8, y, -9.9], [0, 0.3, 0]), 0.9); crate(N([-7.85, y, -10.0], [0, -0.2, 0]), 0.8, { open: true }); crate(N([-8.65, y + 0.93, -9.95], [0, 0.65, 0]), 0.7); reg(2, -8.3, -9.95, 1.0, 0.55);
    scatterPages(2, -0.9, -8.6, 1.0, 0.36, 8); scatterPages(2, 0.1, -6.95, 0.9, 0.3, 5); scatterPages(2, -6.3, -2.1, 1.3, 1.0, 8);
    stirPage(2, -1.1, -8.6); stirPage(2, 0.5, -8.45); stirPage(2, -5.6, -0.3); stirPage(2, -7.0, -0.5); stirPage(2, -1.3, -6.0);
  }

  /* ========== third floor, the overgrown attic ========== */
  {
    const y = FLOOR(3);
    crate(N([-9.95, y, -0.55], [0, 0.15, 0]), 1.0); crate(N([-8.9, y, -0.5], [0, -0.25, 0]), 0.86, { broken: true }); crate(N([-9.85, y + 1.03, -0.55], [0, 0.5, 0]), 0.8, { open: true }); reg(3, -9.5, -0.55, 1.1, 0.6);
    steamer(N([-8.0, y, -1.75], [0, 0.42, 0])); reg(3, -8.0, -1.75, 0.8, 0.5, 0.42);
    rolledRug(N([-10.0, y, -2.0], [0, 1.45, 0], 0.9));
    rolledRug(N([-0.5, y, -7.25], [0, 0.32, 0], 0.8)); reg(3, -0.5, -7.25, 0.92, 0.2, 0.32);
    wardrobe(N([0.3, y, -10.3])); reg(3, 0.3, -10.3, 0.85, 0.42);
    crate(N([0.75, y, -8.5], [0, 0.4, 0]), 0.86); reg(3, 0.75, -8.5, 0.5, 0.5);
    birdcage(N([-1.0, y, -8.75], [0.0, 0.3, 0.0])); reg(3, -1.0, -8.75, 0.36, 0.36);
    bookStack(N([-7.3, y, -0.45], [0, 0.4, 0]), 5);
    bookStack(N([-6.85, y, -2.75], [0, 1.0, 0]), 3);
    frame(onNorth(-3.0, 9.8), -0.11, 0.7, 0.56, 'picFlower', '#8e5f42');
    frame(onWest(-4.6, 9.7), 0.15, 0.92, 0.66, 'picSea', '#a87c52');
    frame(onWest(-7.3, 9.6), -0.08, 0.42, 0.7, 'picHouse', '#c6a95a');
    clock(onWest(-6.0, 10.15), 0.2, 0.34);
    scatterPages(3, -8.2, -1.0, 1.2, 0.6, 6); scatterPages(3, -0.5, -8.0, 1.0, 0.7, 6); stirPage(3, -7.3, -1.2); stirPage(3, -1.3, -7.6);
  }

  /* ---------- a ladder up through the 3F hole, faded cafe bunting, pages adrift ---------- */
  {
    const fy = FLOOR(2), top = BUILDING.levelY[3] + 0.55, c = '#a87c52', foot2 = [-7.55, fy, -7.0], head = [-7.9, top, -7.72];
    for (const s of [-1, 1]) root.add(rod([foot2[0] + s * 0.26, fy, foot2[2]], [head[0] + s * 0.26, top, head[2]], 0.04, 6), dustWood, { color: c });
    for (let i = 1; i < 8; i++) { const u = i / 8, x = foot2[0] + (head[0] - foot2[0]) * u, y = fy + (top - fy) * u, z = foot2[2] + (head[2] - foot2[2]) * u; root.add(rod([x - 0.27, y, z], [x + 0.27, y, z], 0.03, 5), dustWood, { color: i === 5 ? '#8e6a44' : '#c49a6a' }); }
    const bunting = (a, e, sag, n, cols) => {
      const P3 = (u) => [a[0] + (e[0] - a[0]) * u, a[1] + (e[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (e[2] - a[2]) * u];
      fb.add(kit.tube(Array.from({ length: 7 }, (_, i) => P3(i / 6)), 0.012, 0.012, 3, 14, { capEnds: false }), leafMat, { color: '#e9dfc6' });
      const yaw = Math.atan2(-(e[2] - a[2]), e[0] - a[0]), tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.14, 0, 0, 0.14, 0, 0, 0, -0.34, 0], 3)); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); tri.computeVertexNormals();
      for (let i = 0; i < n; i++) fb.add(tri, leafMat, { pos: P3((i + 0.5) / n), rot: [R.range(-0.14, 0.14), yaw, R.range(-0.05, 0.05)], color: cols[i % cols.length] });
    };
    const cols = [P.fadedRed, P.fadedYellow, P.fadedBlue, '#efe6d2', P.leafMid];
    bunting([-10.65, 10.42, -0.7], [-7.2, 10.2, -0.5], 0.42, 9, cols);
    bunting([-7.2, 10.2, -0.5], [-6.55, 10.3, -2.9], 0.24, 6, cols);
    bunting([-5.3, 7.75, -1.2], [-8.6, 7.75, -3.3], 0.5, 10, cols);
    bunting([-1.4, 7.72, -7.4], [1.2, 7.7, -6.4], 0.4, 7, cols);
    for (let i = 0; i < 7; i++) root.add(R() < 0.6 ? pageA : pageB, atlas, { pos: [R.range(-6.4, -1.4), WATER.indoorY + 0.012, R.range(-1.6, -0.1)], rot: [R.range(-0.04, 0.04), R() * 6.28, R.range(-0.04, 0.04)], color: '#eee8d6' });
  }

  /* ---------- plants: wall bases, sills, broken edges ---------- */
  const W_ = [P.flowerWhite, P.flowerYellow], B_ = [P.flowerBlue, P.flowerWhite, P.flowerPurple], H_ = [P.bougain, P.bougainLit, P.flowerWhite];
  // ground: east hole spills in, the back half of the shop has gone to fern
  band(0, [[1.0, -6.6], [0.6, -4.1]], { ferns: 12, pads: 14, flowers: 6, tufts: 8, w: 0.55, cols: B_ });
  band(0, [[-10.5, -3.8], [-10.5, -8.2]], { ferns: 9, pads: 9, flowers: 3, tufts: 4 });
  band(0, [[-6.8, -9.9], [-2.6, -9.9]], { ferns: 9, pads: 12, flowers: 3, tufts: 4 });
  band(0, [[-8.9, -4.2], [-7.0, -4.2], [-7.1, -6.0], [-7.0, -8.0], [-4.8, -8.4], [-2.2, -7.0], [-2.3, -4.2], [-4.2, -3.3]], { ferns: 22, pads: 26, flowers: 8, tufts: 10, w: 0.5, cols: W_ });
  // shallows: reeds, lily pads, wet moss along the sill
  for (const [x, z, n] of [[-9.1, -0.2, 16], [-8.2, -0.05, 12], [-1.0, -0.15, 12], [-4.3, -0.1, 8], [0.75, -0.3, 10], [0.9, -3.3, 14], [-9.45, -2.7, 12], [-6.1, -2.9, 10]]) tuft(x, 0.2, z, n, 0.28, 0.72, [P.grass, P.leafMid, P.grassLit, P.fern]);
  for (const [x, z] of [[-3.5, -1.4], [-2.05, -0.15], [-5.9, -0.15], [-4.9, -2.0], [-1.25, -1.1], [0.55, -0.55], [-8.9, -1.2]]) {
    const p = new THREE.CircleGeometry(0.27, 12, 0.5, 5.6); p.rotateX(-PI / 2); fb.add(p, leafMat, { pos: [x, WATER.indoorY + 0.012, z], rot: [0, R() * 6, 0], color: R.pick([P.leafMid, P.leafLit, P.fern]) });
    if (R() < 0.55) { const n = new Node(kit.xf({ pos: [x + 0.08, WATER.indoorY + 0.03, z] }), fb); n.add(petal, leafMat, { scale: 1.3, color: R.pick([P.bougainLit, P.flowerWhite]) }); n.add(dot, leafMat, { pos: [0, 0.02, 0], color: P.flowerYellow }); }
  }
  // first floor
  band(1, [[-10.45, -3.6], [-10.45, -8.6], [-9.6, -9.8]], { ferns: 8, pads: 10, flowers: 4, tufts: 4, cols: W_ });
  band(1, [[-0.8, -9.7], [0.95, -9.9], [0.95, -5.6]], { ferns: 9, pads: 11, flowers: 4, tufts: 5, cols: B_ });
  band(1, [[-1.0, 0.05], [-0.5, -0.5], [0.3, -1.3], [0.55, -2.5], [1.0, -3.2]], { ferns: 4, pads: 7, flowers: 6, tufts: 8, w: 0.2, cols: H_ });
  band(1, [[-7.6, -2.0], [-7.4, -4.8], [-7.4, -7.2], [-5.3, -8.2], [-2.6, -7.7], [-1.9, -5.1]], { ferns: 12, pads: 14, flowers: 5, tufts: 8, w: 0.3 });
  band(1, [[-4.4, -2.0], [-2.6, -3.2]], { ferns: 4, pads: 6, flowers: 3, tufts: 4, w: 0.2, cols: W_ });
  // second floor
  band(2, [[-1.6, -4.3], [-0.2, -4.7], [1.0, -5.9]], { ferns: 5, pads: 10, flowers: 5, tufts: 6, w: 0.25, cols: H_ });
  band(2, [[-10.4, -5.0], [-10.4, -8.6]], { ferns: 5, pads: 6, flowers: 2, tufts: 3 });
  band(2, [[-6.6, -9.9], [-2.9, -9.6], [-2.2, -8.0]], { ferns: 6, pads: 8, flowers: 3, tufts: 3 });
  band(2, [[-4.9, 0.0], [-4.5, -0.9], [-3.6, -1.4]], { ferns: 3, pads: 9, flowers: 5, tufts: 6, w: 0.18, cols: B_ });
  band(2, [[-7.2, -3.3], [-7.4, -6.0], [-7.2, -7.8]], { ferns: 8, pads: 8, flowers: 4, tufts: 4, w: 0.3, cols: W_ });
  // attic: ferns have the run of the place
  band(3, [[-10.4, -3.0], [-10.4, -9.6], [-9.0, -10.4]], { ferns: 12, pads: 12, flowers: 4, tufts: 6, cols: W_ });
  band(3, [[-9.5, -2.8], [-8.3, -2.8], [-7.0, -3.1], [-6.9, -1.3]], { ferns: 14, pads: 14, flowers: 7, tufts: 8, w: 0.45, cols: B_ });
  band(3, [[-1.5, -5.2], [-0.7, -6.3], [0.2, -6.7], [1.0, -7.8]], { ferns: 9, pads: 12, flowers: 5, tufts: 6, w: 0.25, cols: H_ });
  band(3, [[-6.5, -9.9], [-2.0, -10.2], [-1.8, -8.2]], { ferns: 10, pads: 9, flowers: 3, tufts: 4, w: 0.35 });
  // the insects' indoor flower spot: a proper bank of blooms
  group.userData.flowerSpots = FLOWER_SPOTS.filter(([x, , z]) => insideBuilding(x, z));
  for (const [fx, , fz] of group.userData.flowerSpots) {
    bloom(fx + 0.12, FLOOR(1) + 0.02, fz + 0.1, 30, 0.5, [P.bougain, P.bougainLit, P.flowerYellow, P.flowerWhite], 0.5);
    moss(1, fx + 0.12, FLOOR(1) + 0.01, fz + 0.1, 0.56, 0.46, 0.1); tuft(fx + 0.12, FLOOR(1), fz + 0.1, 14, 0.46, 0.44);
  }
  // creepers in over the sills
  vine([[1.5, 0.5, -5.9], [0.9, 0.3, -5.5], [0.3, 0.26, -5.0], [-0.5, 0.26, -4.6], [-1.3, 0.28, -3.9]], 0.04);
  vine([[1.5, 2.3, -3.8], [1.1, 1.3, -3.9], [0.9, 0.5, -4.2], [0.3, 0.26, -4.4]], 0.035);
  vine([[-9.7, 2.4, 0.42], [-10.0, 1.5, 0.1], [-10.55, 1.0, -0.2], [-10.6, 0.9, -1.7], [-10.6, 1.4, -3.2]], 0.03);
  vine([[-7.4, 3.3, 0.45], [-7.1, 3.0, -0.1], [-7.2, 2.95, -0.9], [-8.1, 2.95, -1.9], [-7.5, 2.95, -3.0]], 0.035);
  vine([[-5.7, 3.3, 0.45], [-5.2, 3.0, 0.1], [-4.4, 2.95, 0.05], [-3.1, 2.95, 0.05]], 0.03);
  vine([[-0.8, 2.92, 0.1], [-1.4, 2.95, -0.5], [-2.0, 2.95, -0.3]], 0.03);
  vine([[-5.3, 5.62, 0.3], [-5.9, 5.62, -0.1], [-7.5, 5.62, -0.2], [-8.4, 5.65, -1.0]], 0.03);
  vine([[-8.3, 10.8, -3.0], [-8.5, 10.0, -3.0], [-8.9, 9.2, -2.9], [-9.1, 8.36, -2.6], [-8.2, 8.34, -2.2]], 0.03);
  vine([[-6.4, 10.7, -9.8], [-6.5, 9.8, -9.7], [-6.0, 8.8, -9.9], [-5.0, 8.34, -9.5], [-3.6, 8.34, -9.7]], 0.03);

  // sills: a fern perched on each, a runner spilling down to the skirting
  const sillN = (x, l) => { const sy = BUILDING.levelY[l] + 0.86; fern(x, sy, -10.62, 0.66, 5); vine([[x - 0.1, sy + 0.02, -10.72], [x + 0.1, sy - 0.1, -10.62], [x + 0.28, sy - 0.5, -10.6], [x + 0.36, FLOOR(l) + 0.05, -10.5], [x + 0.9, FLOOR(l) + 0.03, -10.2]], 0.024); };
  const sillW = (z, l) => { const sy = BUILDING.levelY[l] + 0.86; fern(-10.6, sy, z, 0.66, 5); vine([[-10.72, sy + 0.02, z - 0.1], [-10.62, sy - 0.1, z + 0.1], [-10.6, sy - 0.5, z + 0.28], [-10.5, FLOOR(l) + 0.05, z + 0.36], [-10.2, FLOOR(l) + 0.03, z + 0.9]], 0.024); };
  [[-1.7, 1], [-7.0, 2], [-1.7, 2], [-4.3, 3], [-9.7, 3]].forEach(([x, l]) => sillN(x, l));
  [[-5.8, 1], [-8.9, 2], [-5.8, 2], [-8.9, 3], [-2.9, 3]].forEach(([z, l]) => sillW(z, l));

  /* ---------- swaying strands from the window head ---------- */
  function strandGroup(px, py, pz, list) {
    const g = new THREE.Group(); g.position.set(px, py, pz);
    const bt = ctx.batch();
    for (const [x, z, l] of list) {
      const pts = [[x, 0, z], [x + R.range(-0.06, 0.06), -l * 0.4, z - 0.05], [x + R.range(-0.1, 0.1), -l * 0.75, z + 0.02], [x + R.range(-0.12, 0.12), -l, z]];
      vine(pts, 0.016, 0.11, [P.ivyLit, P.leafLit, P.leafMid], bt);
    }
    const built = bt.build({ castShadow: false, receiveShadow: false }); ctx.softEdge(built); g.add(built); group.add(g); return g;
  }
  const strands = [
    strandGroup(-5, 2.55, 0.2, [[-4.4, 0, 0.9], [-3.9, -0.1, 1.5], [-3.2, 0, 1.0], [2.6, -0.05, 1.1], [3.0, 0.02, 1.7], [3.6, -0.1, 0.8], [-1.5, 0, 0.7], [-1.1, -0.05, 1.2]]),
    strandGroup(-6.5, 5.1, 0.2, [[-0.8, 0, 1.0], [-0.3, -0.05, 1.4], [0.4, 0, 0.9], [0.8, -0.04, 1.2]]),
  ];

  /* ---------- curtains: two torn panels on the attic rod ---------- */
  function curtain(x, y, z, yaw, w, h, col) {
    const g = kit.cloth(w, h, 10, 12), p = g.attributes.position, base = Float32Array.from(p.array);
    for (let i = 0; i < p.count; i++) { const t = -base[i * 3 + 1] / h; if (t > 0.45) { const u = base[i * 3] / w, tear = 0.34 * Math.abs(Math.sin(u * 13 + 1.7)) + 0.2 * Math.abs(Math.sin(u * 29)); base[i * 3 + 1] += tear * h * Math.pow((t - 0.45) / 0.55, 1.5); } }
    const m = new THREE.Mesh(g, ctx.toon({ color: col, side: THREE.DoubleSide, translucent: 0.9, dapple: false })); m.position.set(x, y, z); m.rotation.y = yaw; m.castShadow = false; group.add(m);
    return { g, m, base, h, w, x, z, ph: R() * 6.28 };
  }
  const curtains = [curtain(-2.05, 10.46, -10.58, 0, 0.8, 1.75, '#efe2c4'), curtain(-1.32, 10.46, -10.58, 0, 0.6, 1.45, '#e9b9a0')];
  N([-1.7, 10.5, -10.58]).add(rod([-0.9, 0, 0], [0.9, 0, 0], 0.024), 'flat', { color: P.metalDark });

  /* ---------- chandelier chain ---------- */
  const chainTop = [-3.15, CEIL(1), -2.77];
  N(chainTop).add(kit.cylBase(0.28, 0.16, 0.05, 12), 'flat', { pos: [0, -0.05, 0], color: '#efe6d2' }).add(kit.cyl(0.05, 0.05, 0.1, 8), 'flat', { pos: [0, -0.1, 0], color: '#c8a24e' });
  const chain = hangingChain(chainTop[0], chainTop[2], chainTop[1] - 0.1, 1.45, 10);
  // chain trail from the crown of the fallen chandelier
  for (let i = 0; i < 8; i++) { const l = kit.torus(0.075, 0.021, 5, 10).scale(0.8, 1.3, 1); root.add(l, 'flat', { pos: [-2.85 - i * 0.05, FLOOR(1) + 0.06 + (i < 3 ? 0.56 - i * 0.26 : 0), -2.53 - i * 0.03], rot: [i & 1 ? 1.3 : 1.5, i, 0], color: '#c8a24e' }); }

  /* ---------- water ---------- */
  const pool = WATER.indoorPool;
  const shore = (x, z) => {
    const back = z - (pool.z[0] + 0.35 * Math.sin(x * 1.3 + 0.6) + 0.22 * Math.sin(x * 2.9 + 2.0)), west = x - (pool.x[0] + 0.2 * Math.sin(z * 2.1));
    let e = Math.min(back / 1.0, west / 1.0, (pool.x[1] + 0.15 - x) / 0.4, (pool.z[1] + 0.12 - z) / 0.3);
    e = Math.min(e, (Math.hypot(x - TREE.x, z - TREE.z) - 2.15 - 0.15 * Math.sin(Math.atan2(z - TREE.z, x - TREE.x) * 5)) / 0.8);
    for (const f of foot) if (f.level === 0) e = Math.min(e, footD(f, x, z) / 0.55 + 0.02);
    return e;
  };
  const wg = kit.waterField(pool.x[0] - 0.6, pool.x[1] + 0.2, pool.z[0] - 0.7, pool.z[1] + 0.14, 112, 46, shore);
  const water = new THREE.Mesh(wg, ctx.water({ indoor: 1, opacity: 0.66, shallow: '#a8f2df', deep: '#46c9bb', scale: 1.5 }));
  water.position.y = WATER.indoorY; water.renderOrder = 2; ctx.noOutline(water); group.add(water);

  /* ---------- reflected water light: ceiling (follows the slab shape) + every lit face around the pool ---------- */
  const shimmer = (m, fine = 0.8) => { // finer, softer web than the stock ribbons: two octaves of wide bands reads as water, not lightning
    const key = 'float c=smoothstep(.76,.86,1.-abs(a-b)*6.);';
    if (!m.fragmentShader.includes(key) || !m.fragmentShader.includes('float t=uTime;')) console.error('interior: caustic shader changed');
    m.fragmentShader = m.fragmentShader.replace('float t=uTime;', 'float t=uTime*.42;').replace(key, `float c=smoothstep(.5,.94,1.-abs(a-b)*5.5)*.62;
      float a2=texture2D(uNoise,p*.33+w*.55-t*vec2(.03,.018)).b, b2=texture2D(uNoise,p*.41-w*.65+t*vec2(.026,.034)).g;
      c=max(c,smoothstep(.6,.92,1.-abs(a2-b2)*6.)*${fine.toFixed(2)});`);
    return m;
  };
  const SHIMMER = '#dcffee', CEIL_Y = BUILDING.levelY[1] - BUILDING.slabT;
  {
    // Full strength to the window wall and to the broken slab edge (that strip is all a low camera sees); only the far ends deep in the shop fade.
    const fn = (x, z) => Math.min(0.5, 0.22 * Math.min((z - (pool.z[0] - 0.5)) / 0.9, (x - (pool.x[0] - 0.3)) / 0.9, (slabD(1, x, z) + 0.02) / 0.1));
    const g = kit.waterField(pool.x[0] - 0.4, pool.x[1] + 0.3, pool.z[0] - 0.6, 0.23, 112, 52, fn), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getX(i));
    const m = new THREE.Mesh(g, shimmer(ctx.caustic({ intensity: 0.95, scale: 1.25, color: SHIMMER })));
    m.position.y = CEIL_Y - 0.02; m.userData.caustic = true; group.add(ctx.noOutline(m));
  }
  /* Vertical faces and soffits above the pool. Cameras can only reach these from outside, so this is where the water light is really seen.
     Trunk, walls and columns belong to other modules, so the pass is cut from the finished scene on the first frame: a single overlay of the
     static faces inside the pool's volume, lying exactly on them. Moving or transparent meshes stay out. */
  const SHIMMER_BOX = { x: [-10.8, 1.32], y: [0.3, 2.88], z: [-4.95, 0.52] };
  function buildFaceShimmer() {
    const B_ = SHIMMER_BOX, pos = [], nor = [], box = new THREE.Box3(new THREE.Vector3(B_.x[0], B_.y[0], B_.z[0]), new THREE.Vector3(B_.x[1], B_.y[1], B_.z[1]));
    const A = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3(), n = new THREE.Vector3(), I = new THREE.Matrix4();
    ctx.scene.updateMatrixWorld(true);
    ctx.scene.traverseVisible((o) => {
      const g = o.geometry, p = g?.attributes.position, nm = g?.attributes.normal;
      if (!o.isMesh || o.isInstancedMesh || !nm || !o.layers.isEnabled(0) || o.material.transparent || p.usage !== THREE.StaticDrawUsage || !o.matrixWorld.equals(I)) return;
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingBox.intersectsBox(box)) return;
      const idx = g.index, tris = (idx ? idx.count : p.count) / 3, at = (k) => (idx ? idx.getX(k) : k);
      for (let t = 0; t < tris; t++) {
        const i = at(t * 3), j = at(t * 3 + 1), k = at(t * 3 + 2);
        A.fromBufferAttribute(p, i); C.fromBufferAttribute(p, j); D.fromBufferAttribute(p, k);
        const lo = (c) => Math.min(A[c], C[c], D[c]), hi = (c) => Math.max(A[c], C[c], D[c]);
        if (hi('x') < B_.x[0] || lo('x') > B_.x[1] || hi('y') < B_.y[0] || lo('y') > B_.y[1] || hi('z') < B_.z[0] || lo('z') > B_.z[1]) continue;
        n.crossVectors(C.clone().sub(A), D.clone().sub(A)); const area = n.length() / 2; if (area < 0.0016) continue; n.normalize();
        if (n.y > 0.42) continue;                                                // water light never lands on faces looking up
        if (n.y < -0.85 && lo('y') > CEIL_Y - 0.05) continue;                    // the slab underside already has the ceiling mesh
        if (n.z > 0.7 && lo('z') > 0.42) continue;                               // street face of the facade
        for (const v of [i, j, k]) { pos.push(p.getX(v), p.getY(v), p.getZ(v)); nor.push(nm.getX(v), nm.getY(v), nm.getZ(v)); }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const mat = shimmer(ctx.caustic({ intensity: 0.34, scale: 0.6, color: SHIMMER }), 0.5);
    mat.side = THREE.FrontSide; mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -1;
    mat.vertexShader = 'varying vec3 vW; varying vec3 vN; void main(){ vN=normal; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }';
    const f = (a, b) => { if (!mat.fragmentShader.includes(a)) console.error('interior: caustic shader changed'); mat.fragmentShader = mat.fragmentShader.replace(a, b); };
    f('varying vec2 vUv;', 'varying vec3 vN;');
    // One oblique world-to-plane map on every face: the web wraps column corners and the trunk without a seam, and only a +x-z face (unseen) could streak.
    f('vec2 p=vW.xz*uS;', 'vec2 p=vec2(vW.x-vW.z*.6,vW.y*1.6+(vW.x+vW.z)*.35)*uS;');
    f('vec2 e=min(vUv,1.-vUv); float f=smoothstep(.0,.22,min(e.x,e.y));', `vec2 q=max(max(vec2(${(pool.x[0] - 0.2).toFixed(2)},${(pool.z[0] - 0.2).toFixed(2)})-vW.xz,vW.xz-vec2(${(pool.x[1] + 0.3).toFixed(2)},.6)),vec2(0.));
        float f=(1.-smoothstep(.1,1.05,length(q)))*smoothstep(.36,.56,vW.y)*(1.-smoothstep(2.8,2.87,vW.y))*(1.-smoothstep(.06,.42,normalize(vN).y));`);
    const m = new THREE.Mesh(g, mat); m.name = 'pool-shimmer'; m.renderOrder = 3; m.frustumCulled = false; m.userData.caustic = true;
    ctx.noOutline(m); group.add(m);
    return m;
  }

  /* ---------- warm fill: no shadows, kept deep inside ---------- */
  const lights = [[-4.6, 1.5, -2.2, 6, 7.5], [-0.4, 1.5, -4.6, 4.5, 5.5], [-6.4, 4.15, -2.6, 6, 8], [-7.7, 6.85, -5.2, 4, 8], [-1.1, 4.1, -1.6, 2.4, 6.5]];
  for (const [x, y, z, i, d] of lights) { const l = new THREE.PointLight(P.sunGold, i, d, 2); l.position.set(x, y, z); group.add(l); }

  /* ---------- assemble ---------- */
  group.add(b.build({ castShadow: true, receiveShadow: true }));
  const leaves = fb.build({ castShadow: false, receiveShadow: true }); ctx.softEdge(leaves); group.add(leaves);
  if (gb.parts.size) { const gl = gb.build({ castShadow: false, receiveShadow: false }); ctx.noOutline(gl); group.add(gl); }

  const frondGeo = kit.frond(1.0, 6, 0.32);
  const ferns = new THREE.InstancedMesh(frondGeo, frondMat, fronds.length);
  fronds.forEach((f, i) => { ferns.setMatrixAt(i, f.m); ferns.setColorAt(i, f.c); });
  ferns.castShadow = false; ferns.receiveShadow = true; ferns.frustumCulled = false; ctx.softEdge(ferns); group.add(ferns);

  const pages = new THREE.InstancedMesh(pageA, pageMat, liveOnes.length);
  pages.castShadow = false; pages.frustumCulled = false; group.add(pages);

  /* ---------- motion ---------- */
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), vS = new THREE.Vector3(1, 1, 1), vP = new THREE.Vector3();
  let live = false, faceShimmer = null;
  function update(t) {
    if (live && !faceShimmer) faceShimmer = buildFaceShimmer(); // every module's meshes exist by the first real frame
    for (let i = 0; i < fronds.length; i++) {
      const f = fronds[i], s = ctx.wind(t, f.x, f.z) * f.amp + Math.sin(t * 1.1 + f.ph) * 0.016;
      mB.makeRotationX(s); mA.multiplyMatrices(f.m, mB); ferns.setMatrixAt(i, mA);
    }
    ferns.instanceMatrix.needsUpdate = true;
    liveOnes.forEach((p, i) => {
      const c = t * p.sp + p.ph, gust = Math.max(0, Math.sin(c) * Math.sin(c * 0.37 + 1)), lift = gust * gust;
      vP.set(p.x + Math.cos(p.yaw) * lift * 0.2, p.y + lift * 0.3, p.z + Math.sin(p.yaw) * lift * 0.2);
      e.set(-lift * 1.3, p.yaw, Math.sin(c * 3) * lift * 0.5, 'YXZ'); q.setFromEuler(e);
      mA.compose(vP, q, vS); pages.setMatrixAt(i, mA);
    });
    pages.instanceMatrix.needsUpdate = true;
    for (const g of strands) { g.rotation.x = ctx.wind(t, g.position.x, g.position.z) * 0.035 + 0.01; g.rotation.z = Math.sin(t * 0.7) * 0.008; }
    chain.rotation.z = Math.sin(t * 0.62) * 0.022 + ctx.wind(t, -5, -1) * 0.012; chain.rotation.x = Math.sin(t * 0.47 + 1) * 0.016;
    for (const c of curtains) {
      const p = c.g.attributes.position, gust = 0.55 + 0.45 * ctx.wind(t, c.x, c.z);
      for (let i = 0; i < p.count; i++) {
        const x = c.base[i * 3], y = c.base[i * 3 + 1], k = -y / c.h;
        p.setZ(i, k * k * (0.32 * gust + 0.09 * Math.sin(t * 1.7 + x * 3.5 + y * 2.2 + c.ph) + 0.05 * Math.sin(t * 2.9 + x * 7 + c.ph)) + 0.05 * Math.sin(x * 11));
        p.setX(i, x + k * k * 0.04 * Math.sin(t * 1.1 + y * 3 + c.ph));
      }
      p.needsUpdate = true; c.g.computeVertexNormals();
    }
  }
  update(0); live = true;
  return { group, update };
}
