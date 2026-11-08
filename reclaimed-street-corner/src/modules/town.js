// town.js — the old neighbourhood west of and behind the corner: three wooden shophouses (one with its front fallen away),
// their yards, the みどり湯 sento with its brick chimney, and the walled back lot. Static parts go through a few shared batches.
// All painted detail (signboards, noren, mural, chimney brick, tatami, labels) lives in ONE canvas atlas.
import * as THREE from 'three';

const V3 = THREE.Vector3, M4 = THREE.Matrix4;
const v = (p) => (p instanceof V3 ? p.clone() : new V3(p[0], p[1], p[2]));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';
const SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif CJK JP",' + FONT;

/* ------------------------------------------------------------------ painted atlas ------------------------------- */
function buildAtlas(ctx) {
  const S = 2048, R = {}, rr = ctx.seeded('town-atlas');
  const tex = ctx.canvasTexture(S, S, (g) => {
    const reg = (name, x, y, w, h, draw) => { R[name] = [x, y, w, h]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h); g.restore(); };
    const wash = (w, h, a = 0.22, c = '#f3ecd9') => { g.fillStyle = c; g.globalAlpha = a; g.fillRect(0, 0, w, h); g.globalAlpha = 1; };
    const blot = (w, h, n, cols, r0, r1, a) => { for (let i = 0; i < n; i++) { g.fillStyle = rr.pick(cols); g.globalAlpha = a * (0.5 + rr() * 0.5); g.beginPath(); g.ellipse(rr() * w, rr() * h, rr.range(r0, r1), rr.range(r0, r1) * 0.7, rr() * 3, 0, 6.3); g.fill(); } g.globalAlpha = 1; };
    const text = (s, x, y, size, col, { font = FONT, weight = 800, align = 'center', vertical = false, gap = 1.08 } = {}) => {
      g.font = `${weight} ${size}px ${font}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle';
      if (vertical) [...s].forEach((c, i) => g.fillText(c, x, y + i * size * gap)); else g.fillText(s, x, y);
    };
    const grain = (w, h, c, n = 14) => { g.strokeStyle = c; for (let i = 0; i < n; i++) { const y = rr() * h; g.lineWidth = rr.range(1, 2.4); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rr.range(-6, 6), w * 0.6, y + rr.range(-6, 6), w, y); g.stroke(); } };

    // chimney: u wraps once round. Warm brick in big flat courses, soot toward the top, kanji down two sides.
    reg('chimney', 0, 0, 512, 1536, (w, h) => {
      g.fillStyle = '#b4644a'; g.fillRect(0, 0, w, h);
      const ch = 24;
      for (let r = 0; r * ch < h; r++) {
        const off = (r % 2) * 20;
        for (let c = -1; c < 13; c++) {
          const k = rr();
          g.fillStyle = k < 0.55 ? '#b4644a' : k < 0.8 ? '#a85a44' : k < 0.93 ? '#c0735a' : '#8f4d3e';
          g.fillRect(off + c * 40 + 1, r * ch + 1, 38, ch - 2);
        }
        g.fillStyle = 'rgba(240,214,186,.38)'; g.fillRect(0, r * ch, w, 1.6);
      }
      const soot = g.createLinearGradient(0, 0, 0, 420); soot.addColorStop(0, 'rgba(66,70,78,.74)'); soot.addColorStop(0.35, 'rgba(78,70,72,.42)'); soot.addColorStop(1, 'rgba(90,76,72,0)');
      g.fillStyle = soot; g.fillRect(0, 0, w, 420);
      for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(70,68,74,.22)'; const x = rr() * w, l = rr.range(120, 420); g.fillRect(x, 0, rr.range(5, 18), l); }
      // the painted name, once white, on two faces
      const face = (u) => {
        const x = u * w; g.fillStyle = 'rgba(232,226,204,.2)'; g.fillRect(x - 58, 300, 116, 900);
        g.globalAlpha = 0.86; text('緑', x, 400, 104, '#efe6cc', { font: SERIF, weight: 900 }); text('乃', x, 640, 104, '#efe6cc', { font: SERIF, weight: 900 }); text('湯', x, 880, 104, '#efe6cc', { font: SERIF, weight: 900 }); g.globalAlpha = 1;
        // flaking: brick rows showing back through the paint
        for (let i = 0; i < 30; i++) { g.fillStyle = rr() < 0.6 ? '#a85a44' : '#b4644a'; const y = 300 + Math.floor(rr() * 38) * ch; g.fillRect(x - 60 + rr() * 100, y, rr.range(20, 62), ch - 3); }
      };
      face(0.05); face(0.665);
      // the crack, running down from the broken rim
      g.strokeStyle = '#4a3a3c'; g.lineCap = 'round';
      for (const [u, len] of [[0.12, 560], [0.72, 340], [0.41, 240]]) {
        let x = u * w, y = 0; g.lineWidth = 7; g.beginPath(); g.moveTo(x, y);
        while (y < len) { x += rr.range(-1, 1) * 18; y += ch * rr.int(1, 2); g.lineTo(x, y); g.lineWidth = 5; }
        g.stroke();
      }
      blot(w, h, 26, ['#7f8f58', '#6f8a4e'], 8, 32, 0.32);
      const moss = g.createLinearGradient(0, h - 220, 0, h); moss.addColorStop(0, 'rgba(82,132,72,0)'); moss.addColorStop(1, 'rgba(82,132,72,.85)'); g.fillStyle = moss; g.fillRect(0, h - 220, w, 220);
    });

    // bath mural: tile-painted mountain over a bay, the moss got into it from the bottom and the seams
    reg('mural', 512, 0, 1024, 320, (w, h) => {
      const l = g.createLinearGradient(0, 0, 0, h); l.addColorStop(0, '#7fcbe6'); l.addColorStop(0.6, '#c6ecec'); l.addColorStop(1, '#f6eecb'); g.fillStyle = l; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fbf4dc'; for (const [x, y, s] of [[140, 60, 1], [320, 96, 0.7], [800, 54, 1.2], [930, 110, 0.7]]) { g.beginPath(); g.ellipse(x, y, 74 * s, 17 * s, 0, 0, 6.3); g.ellipse(x + 34 * s, y - 13 * s, 44 * s, 15 * s, 0, 0, 6.3); g.fill(); }
      // far range
      g.fillStyle = '#9fc8cf'; g.beginPath(); g.moveTo(0, 210); g.lineTo(180, 150); g.lineTo(330, 196); g.lineTo(760, 186); g.lineTo(900, 140); g.lineTo(w, 190); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      // the mountain
      g.save(); g.translate(0, 46);
      g.fillStyle = '#5a98c0'; g.beginPath(); g.moveTo(170, 226); g.quadraticCurveTo(350, 170, 452, 56); g.lineTo(556, 56); g.quadraticCurveTo(660, 170, 860, 226); g.fill();
      g.fillStyle = '#4a84ae'; g.beginPath(); g.moveTo(520, 56); g.lineTo(556, 56); g.quadraticCurveTo(660, 170, 860, 226); g.lineTo(600, 226); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(452, 56); g.lineTo(556, 56); g.lineTo(612, 118); g.lineTo(578, 102); g.lineTo(554, 140); g.lineTo(522, 104); g.lineTo(488, 146); g.lineTo(466, 106); g.lineTo(428, 128); g.lineTo(404, 106); g.fill();
      g.restore();
      // bay, pine spit
      g.fillStyle = '#5ab6c0'; g.fillRect(0, 252, w, 70);
      g.strokeStyle = '#d8f2ec'; g.lineWidth = 3; for (let i = 0; i < 18; i++) { const x = rr() * w, y = 262 + rr() * 50; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 18, y - 7, x + 38, y); g.stroke(); }
      g.fillStyle = '#e9dcb0'; g.beginPath(); g.ellipse(170, 266, 190, 15, 0, 0, 6.3); g.fill();
      for (const [x, s] of [[80, 1], [136, 1.3], [214, 0.9], [270, 1.1]]) { g.fillStyle = '#6a5246'; g.fillRect(x - 3 * s, 226 - 6 * s, 6 * s, 40 * s); g.fillStyle = '#2f7a5f'; for (const [dx, dy, r] of [[0, 214, 26], [-20, 226, 17], [22, 224, 18]]) { g.beginPath(); g.ellipse(x + dx * s, dy - 10 * (s - 1), r * s, r * s * 0.5, 0, 0, 6.3); g.fill(); } }
      // tile grid
      g.strokeStyle = 'rgba(70,96,100,.5)'; g.lineWidth = 2; for (let x = 0; x <= w; x += w / 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += h / 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      wash(w, h, 0.1); blot(w, h, 16, ['#f3ecd9', '#d9d0b0'], 8, 26, 0.28);
      // missing tiles
      for (let i = 0; i < 9; i++) { g.fillStyle = '#b9b5a6'; g.fillRect(Math.floor(rr() * 26) * (w / 26), Math.floor(rr() * 8) * (h / 8), w / 26, h / 8); }
      // moss rising from the base and bleeding along the seams
      for (let k = 0; k < 2; k++) { g.fillStyle = k ? '#5fa84c' : '#3f8a58'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 22) g.lineTo(x, h - (k ? 18 : 40) - rr() * 40 - 38 * Math.pow(Math.sin(x * 0.0075 + 1.2), 2) * (k ? 0.5 : 1.5)); g.lineTo(w, h); g.fill(); }
      blot(w, 200, 12, ['#3f8a58', '#5fa84c'], 6, 22, 0.75);
    });

    // shop boards (all invented)
    reg('tofu', 512, 320, 640, 130, (w, h) => {
      g.fillStyle = '#74523a'; g.fillRect(0, 0, w, h); grain(w, h, 'rgba(50,34,26,.5)', 16);
      g.strokeStyle = '#c4a26a'; g.lineWidth = 5; g.strokeRect(9, 9, w - 18, h - 18);
      text('まるみ豆腐店', w / 2, h / 2 + 3, 86, '#efe3c4', { font: SERIF, weight: 900 });
      blot(w, h, 10, ['#74523a', '#5e4432'], 4, 26, 0.75); blot(w, h, 6, ['#b5522f'], 2, 7, 0.5);
    });
    reg('barber', 1152, 320, 512, 130, (w, h) => {
      g.fillStyle = '#e6dfca'; g.fillRect(0, 0, w, h); g.fillStyle = '#4e7f9b'; g.fillRect(0, 0, w, 16); g.fillStyle = '#c8604f'; g.fillRect(0, h - 16, w, 16);
      text('理容 カトレア', w / 2, h / 2, 66, '#3f6a84', { font: SERIF, weight: 900 });
      blot(w, h, 16, ['#b5522f', '#8b5a3c'], 3, 14, 0.5); wash(w, h, 0.14);
    });
    reg('snack', 1664, 0, 150, 560, (w, h) => {
      g.fillStyle = '#efe4c4'; g.fillRect(0, 0, w, h); g.fillStyle = '#b5493f'; g.fillRect(0, 0, w, 74); g.fillRect(0, h - 40, w, 40);
      text('酒', w / 2, 40, 58, '#f6eeda', { font: SERIF, weight: 900 });
      text('スナック', w / 2, 112, 44, '#3a5560', { vertical: true, gap: 1.06 }); text('小灯', w / 2, 340, 88, '#b5493f', { font: SERIF, weight: 900, vertical: true });
      blot(w, h, 14, ['#b5522f', '#7d3a2a'], 3, 12, 0.5); wash(w, h, 0.16);
    });
    reg('yu', 1152, 450, 512, 132, (w, h) => {
      g.fillStyle = '#6a4c38'; g.fillRect(0, 0, w, h); grain(w, h, 'rgba(46,30,24,.5)', 14);
      text('みどり湯', w / 2, h / 2 + 3, 92, '#e7d9a8', { font: SERIF, weight: 900 });
      blot(w, h, 8, ['#6a4c38'], 4, 22, 0.8);
    });
    // cloth cells: noren and the forgotten sheet
    const noren = (name, x, y, bg, ink, label, size) => reg(name, x, y, 256, 128, (w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, w, 12);
      text(label, w / 2, h / 2 + 2, size, ink, { font: SERIF, weight: 900 });
      blot(w, h, 12, [bg, '#efe6d0'], 4, 16, 0.3);
      for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect((i + 1) * w / 4 - 1, 0, 2, h); }
    });
    noren('norenTofu', 512, 450, '#3d5f7e', '#f0e9d6', 'とうふ', 78);
    noren('norenYu', 768, 450, '#a84a44', '#f4ecd8', 'ゆ', 112);
    noren('norenBar', 512, 578, '#7f4a60', '#f0e4d0', '小灯', 86);
    reg('sheet', 768, 578, 256, 256, (w, h) => { g.fillStyle = '#efe9d9'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(160,190,176,.2)'; for (let i = 0; i < 5; i++) g.fillRect(0, 30 + i * 46, w, 16); blot(w, h, 12, ['#cbb98c', '#a8b58a'], 12, 44, 0.3); const dirt = g.createLinearGradient(0, h - 90, 0, h); dirt.addColorStop(0, 'rgba(120,120,80,0)'); dirt.addColorStop(1, 'rgba(120,120,80,.4)'); g.fillStyle = dirt; g.fillRect(0, h - 90, w, 90); });
    reg('futon', 1408, 838, 256, 256, (w, h) => {
      g.fillStyle = '#b5574a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(240,214,180,.55)'; g.lineWidth = 3;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const cx = 16 + x * 32 + (y % 2) * 16, cy = 16 + y * 32; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * 1.047; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); } g.stroke(); }
      g.fillStyle = '#e6d6b8'; g.fillRect(0, 0, w, 30); blot(w, h, 12, ['#8f4a44', '#a89a70'], 8, 30, 0.3);
    });
    reg('curtain', 1024, 582, 128, 256, (w, h) => { g.fillStyle = '#d6c79f'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(170,110,80,.35)'; for (let i = 0; i < 6; i++) g.fillRect(i * 24 + 6, 0, 8, h); blot(w, h, 8, ['#a89a70'], 8, 26, 0.3); });
    // tatami: rush mats with a green cloth border. u across the short side.
    reg('tatami', 1152, 582, 256, 128, (w, h) => {
      g.fillStyle = '#c9c07e'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(130,126,70,.32)'; g.lineWidth = 1.4; for (let y = 3; y < h; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = '#3f6a58'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      blot(w, h, 10, ['#8fa058', '#a39a5c', '#6f8a4e'], 8, 34, 0.32);
    });
    // fusuma: pale paper with a faded pine-and-crane wash
    reg('fusuma', 1408, 582, 256, 256, (w, h) => {
      g.fillStyle = '#e7dcc0'; g.fillRect(0, 0, w, h); g.fillStyle = '#b6c8b0'; g.beginPath(); g.moveTo(0, 200); g.quadraticCurveTo(90, 120, 170, 176); g.quadraticCurveTo(220, 196, 256, 150); g.lineTo(256, 256); g.lineTo(0, 256); g.fill();
      g.fillStyle = '#d9b77c'; g.beginPath(); g.arc(190, 74, 36, 0, 6.3); g.fill();
      blot(w, h, 14, ['#c7b48c', '#a89a70'], 6, 28, 0.28);
      g.fillStyle = '#6b5a48'; g.beginPath(); g.ellipse(216, 148, 8, 12, 0, 0, 6.3); g.fill();
      g.strokeStyle = '#7d705c'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(30 + i * 34, 256); g.lineTo(44 + i * 30, 190 + i * 14); g.stroke(); }
    });
    // hanging scroll, wall calendar, barber shelf, poster
    reg('scroll', 1664, 560, 96, 256, (w, h) => { g.fillStyle = '#a9a07e'; g.fillRect(0, 0, w, h); g.fillStyle = '#ece4cc'; g.fillRect(10, 26, w - 20, h - 62); text('山', w / 2, 96, 46, '#46505a', { font: SERIF, weight: 900 }); text('水', w / 2, 152, 46, '#46505a', { font: SERIF, weight: 900 }); blot(w, h, 6, ['#a89a70'], 3, 10, 0.3); });
    reg('calendar', 1760, 560, 96, 128, (w, h) => { g.fillStyle = '#efe9d6'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8604f'; g.fillRect(0, 0, w, 26); text('昭和', w / 2, 14, 18, '#f6eeda'); g.fillStyle = '#4e5a5e'; for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) g.fillRect(8 + x * 14, 36 + y * 16, 8, 8); });
    reg('cat', 1024, 838, 128, 180, (w, h) => { g.fillStyle = '#e9e2c8'; g.fillRect(0, 0, w, h); text('迷い猫', w / 2, 24, 26, '#b5493f', { font: SERIF, weight: 900 }); g.fillStyle = '#7d6a58'; g.beginPath(); g.ellipse(64, 92, 34, 30, 0, 0, 6.3); g.moveTo(34, 74); g.lineTo(38, 44); g.lineTo(56, 64); g.moveTo(94, 74); g.lineTo(90, 44); g.lineTo(72, 64); g.fill(); g.fillStyle = '#58626a'; for (let i = 0; i < 3; i++) g.fillRect(20, 138 + i * 13, 88 - i * 16, 6); blot(w, h, 8, ['#c9bf9f'], 4, 14, 0.5); });
    reg('pole', 1152, 710, 128, 128, (w, h) => { g.fillStyle = '#efe9d9'; g.fillRect(0, 0, w, h); g.save(); g.transform(1, 0.6, 0, 1, 0, -60); for (let i = -1; i < 7; i++) { g.fillStyle = i % 2 ? '#c8604f' : '#5f8fb0'; g.fillRect(0, i * 42, w, 18); } g.restore(); wash(w, h, 0.16); });
    reg('milk', 1280, 710, 128, 64, (w, h) => { g.fillStyle = '#d8e0d6'; g.fillRect(0, 0, w, h); text('みどり牛乳', w / 2, 34, 22, '#3f7a70'); });
    // vending machine front (invented drinks) and a green-grocer's door lettering for the kei truck
    reg('vend', 0, 1536, 300, 512, (w, h) => {
      g.fillStyle = '#d9ded0'; g.fillRect(0, 0, w, h); g.fillStyle = '#6f9fb0'; g.fillRect(0, 0, w, 66); text('つめたい', w / 2, 34, 44, '#f4efdc');
      g.fillStyle = '#39505a'; g.fillRect(18, 78, 264, 222);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) { const x = 28 + c * 50, y = 86 + r * 72; g.fillStyle = rr.pick(['#c8604f', '#e0c25a', '#6fb0ba', '#7fae7a', '#efe9d6']); g.fillRect(x + 8, y + 6, 28, 50); g.fillStyle = 'rgba(240,240,220,.5)'; g.fillRect(x + 12, y + 10, 5, 42); g.fillStyle = '#f0ead4'; g.fillRect(x + 6, y + 58, 32, 7); }
      g.fillStyle = '#b9bfb2'; g.fillRect(208, 314, 72, 96); g.fillStyle = '#4e5a5e'; g.fillRect(222, 330, 44, 12); g.fillRect(232, 356, 20, 28);
      g.fillStyle = '#3c4e52'; g.fillRect(24, 424, 180, 56); text('取り出し口', 114, 452, 28, '#c9d2c8', { weight: 700 });
      blot(w, h, 34, ['#b5522f', '#7d3a2a', '#d9764a'], 4, 26, 0.6); wash(w, h, 0.1);
    });
    reg('truckDoor', 300, 1536, 256, 96, (w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#e7ebdd'; g.fillRect(0, 0, w, h); text('八百みどり', w / 2, 40, 46, '#3f7a60', { font: SERIF, weight: 900 }); text('青果 配達', w / 2, 78, 20, '#6a8a72', { weight: 700 }); blot(w, h, 12, ['#b5522f', '#7d3a2a'], 2, 12, 0.55); });
    reg('plate', 300, 1632, 128, 64, (w, h) => { g.fillStyle = '#e6e2c8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4b6a58'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8); text('みどり 40', w / 2, 34, 22, '#3f6a58'); });
    reg('labels', 428, 1632, 128, 64, (w, h) => { for (let i = 0; i < 9; i++) { g.fillStyle = rr.pick(['#3f8a58', '#b5493f', '#6f9fb0', '#c7a64e', '#7a5a42', '#d9d3bc']); g.fillRect(i * 14 + 2, rr.int(6, 26), 11, 64); g.fillStyle = 'rgba(240,235,215,.7)'; g.fillRect(i * 14 + 4, 34, 7, 14); } });
  }, { repeat: false });
  tex.needsUpdate = true;
  const uvTo = (geo, name) => {
    const [x, y, w, h] = R[name], uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + 1.5 + uv.getX(i) * (w - 3)) / S, 1 - (y + 1.5 + (1 - uv.getY(i)) * (h - 3)) / S);
    return geo;
  };
  return { tex, uvTo, cell: (name) => R[name], quad: (w, h, name) => uvTo(new THREE.PlaneGeometry(w, h), name) };
}

/** Painted steel with hard-edged world-space rust blooms running down the metal (same recipe as the street furniture). */
function wornMaterial(ctx) {
  const { P } = ctx, m = ctx.toon({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide });
  const c = (h) => { const k = new THREE.Color(h); return `vec3(${k.r.toFixed(3)},${k.g.toFixed(3)},${k.b.toFixed(3)})`; };
  const base = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (s, r) => {
    base(s, r);
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
      {
        vec2 q=vec2(vWPos.x*.8+vWPos.z*1.05+(vWNorm.x*1.1-vWNorm.z*.9+vWNorm.y*.8)*.42,vWPos.y*.42+(vWPos.x-vWPos.z*.7)*abs(vWNorm.y)*.9);
        float n=texture2D(uNoise,q*.31+.17).r*.56+texture2D(uNoise,q*.9+.3).g*.44;
        float a=smoothstep(.552,.559,n), b=smoothstep(.61,.617,n);
        diffuseColor.rgb=mix(diffuseColor.rgb,mix(${c(P.rust)},${c(P.rustDark)},b),a);
      }`);
  };
  m.customProgramCacheKey = () => key + '|townworn';
  return m;
}

/* ------------------------------------------------------------------ stage: a transform plus the shared batches ---- */
class Stage {
  constructor(t, m = new M4()) { this.t = t; this.m = m; }
  sub(o) { return new Stage(this.t, new M4().multiplyMatrices(this.m, this.t.kit.xf(o))); }
  mx(o = {}) { return new M4().multiplyMatrices(this.m, this.t.kit.xf(o)); }
  add(g, mat = 'flat', o = {}) { this.t.b.add(g, mat, { matrix: this.mx(o), color: o.color }); return this; }
  /** Axis-aligned box from min/max corners. */
  box(x0, x1, y0, y1, z0, z1, mat = 'flat', color) { return this.add(this.t.kit.box(x1 - x0, y1 - y0, z1 - z0), mat, { pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color }); }
  /** Box stretched between two points. w across, h up. */
  beam(a, b, w, h, mat = 'flat', color, roll = 0) {
    const A = v(a), B = v(b), Z = B.clone().sub(A), len = Z.length(); Z.divideScalar(len);
    const up = Math.abs(Z.y) > 0.96 ? new V3(1, 0, 0) : new V3(0, 1, 0), X = up.cross(Z).normalize(), Y = Z.clone().cross(X);
    const m = new M4().makeBasis(X, Y, Z).setPosition(A.add(B).multiplyScalar(0.5));
    if (roll) m.multiply(new M4().makeRotationZ(roll));
    this.t.b.add(this.t.kit.box(w, h, len), mat, { matrix: new M4().multiplyMatrices(this.m, m), color });
    return this;
  }
  rod(a, b, r, mat = 'flat', color, seg = 6, r2 = r) {
    const A = v(a), B = v(b), Y = B.clone().sub(A), len = Y.length(); Y.divideScalar(len);
    const up = Math.abs(Y.y) > 0.96 ? new V3(1, 0, 0) : new V3(0, 1, 0), X = up.cross(Y).normalize(), Z = X.clone().cross(Y);
    const m = new M4().makeBasis(X, Y, Z).setPosition(A.add(B).multiplyScalar(0.5));
    this.t.b.add(this.t.kit.cyl(r2, r, len, seg), mat, { matrix: new M4().multiplyMatrices(this.m, m), color });
    return this;
  }
  w(p) { return v(p).applyMatrix4(this.m); }
}

/* ------------------------------------------------------------------ tiled roofs ---------------------------------- */
// A slope is a function S(u,v,out): u along the eave 0..1, v ridge(0)→eave(1). Everything on a roof is laid through it, so a sagging
// ridge carries its tiles, boards, rafters and gutter down with it.
const slope = (A, B, C, D, { sagR = 0, sagE = 0, dish = 0, dents = [] } = {}) => (u, v, o) => {
  const k = 1 - v, l = 1 - u;
  const x = (A[0] * l + B[0] * u) * k + (C[0] * l + D[0] * u) * v, z = (A[2] * l + B[2] * u) * k + (C[2] * l + D[2] * u) * v;
  let y = (A[1] * l + B[1] * u) * k + (C[1] * l + D[1] * u) * v;
  const su = Math.sin(Math.PI * clamp(u));
  y -= (sagR * k + sagE * v) * su + dish * su * Math.sin(Math.PI * clamp(v));
  for (const [du, dv, ru, rv, d] of dents) { const a = (u - du) / ru, b = (v - dv) / rv; y -= d * Math.exp(-(a * a + b * b)); }
  return o.set(x, y, z);
};
const inHole = (holes, u, v, k = 1) => { for (const [cu, cv, ru, rv] of holes) { const a = (u - cu) / (ru * k), b = (v - cv) / (rv * k); if (a * a + b * b < 1) return true; } return false; };

class Roofing {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  vert(p, n, c, m = 1) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.col.push(c.r * m, c.g * m, c.b * m); }
  /** Interlocking S-tiles, one small strip each. holes [[u,v,ru,rv]…] leave bare boards; scatter drops odd tiles. */
  tiles(S, { lenU, lenV, tw = 0.4, tl = 0.44, wave = 0.05, holes = [], scatter = 0.02, tint, rand, slip = 0.03, region = null }) {
    const nu = Math.max(2, Math.round(lenU / tw)), nv = Math.max(2, Math.round(lenV / tl)), du = 1 / nu, dv = 1 / nv;
    const a = new V3(), b = new V3(), Tu = new V3(), Tv = new V3(), N = new V3(), p = new V3(), q = new V3(), n = new V3(), lipN = new V3(), wv = tw;
    const NS = 6, row0 = [], row1 = [], rowN = []; for (let i = 0; i < NS; i++) { row0.push(new V3()); row1.push(new V3()); rowN.push(new V3()); }
    for (let r = 0; r < nv; r++) for (let c = 0; c < nu; c++) {
      const uc = (c + 0.5) * du, vc = (r + 0.5) * dv;
      if (region && !region(uc, vc)) continue;
      const rough = 0.86 + rand() * 0.3;
      if (inHole(holes, uc, vc, rough)) continue;
      if (rand() < scatter) continue;
      S(uc - du / 2, vc, a); S(uc + du / 2, vc, b); Tu.subVectors(b, a); const wid = Tu.length() || 1; Tu.divideScalar(wid);
      S(uc, vc - dv / 2, a); S(uc, vc + dv / 2, b); Tv.subVectors(b, a).normalize();
      N.crossVectors(Tu, Tv); const flip = N.y < 0; if (flip) N.negate(); N.normalize();
      const off = rand() < 0.06 ? rand() * slip * 3 : rand() * slip * 0.4, lift = 0.05 + rand() * 0.012, col = tint(uc, vc, rand);
      const u0 = uc - du / 2, u1 = uc + du / 2, t0 = vc - dv / 2 + off * dv, t1 = vc + dv * 0.62 + off * dv;
      for (let i = 0; i < NS; i++) {
        const s = i / (NS - 1), h = wave * Math.sin(s * Math.PI * 2), dh = wave * Math.cos(s * Math.PI * 2) * Math.PI * 2 / wv, u = lerp(u0, u1, s);
        S(u, t0, row0[i]).addScaledVector(N, h + 0.015); S(u, t1, row1[i]).addScaledVector(N, h + 0.015 + lift);
        rowN[i].copy(N).addScaledVector(Tu, -dh).normalize();
      }
      for (let i = 0; i < NS - 1; i++) {
        const A = row0[i], B = row0[i + 1], C = row1[i], D = row1[i + 1], Na = rowN[i], Nb = rowN[i + 1];
        const ma = 1 + 0.42 * Math.sin((i / (NS - 1)) * 6.2832), mb = 1 + 0.42 * Math.sin(((i + 1) / (NS - 1)) * 6.2832); // crest and trough stay legible where the sun flattens the cel ramp
        if (!flip) { this.vert(A, Na, col, ma); this.vert(B, Nb, col, mb); this.vert(C, Na, col, ma); this.vert(B, Nb, col, mb); this.vert(D, Nb, col, mb); this.vert(C, Na, col, ma); } else { this.vert(A, Na, col, ma); this.vert(C, Na, col, ma); this.vert(B, Nb, col, mb); this.vert(B, Nb, col, mb); this.vert(C, Na, col, ma); this.vert(D, Nb, col, mb); }
        p.copy(C).addScaledVector(N, -lift - 0.05); q.copy(D).addScaledVector(N, -lift - 0.05); lipN.copy(Tv);
        if (!flip) { this.vert(C, lipN, col, 0.52); this.vert(D, lipN, col, 0.52); this.vert(p, lipN, col, 0.52); this.vert(D, lipN, col, 0.52); this.vert(q, lipN, col, 0.52); this.vert(p, lipN, col, 0.52); } else { this.vert(C, lipN, col, 0.52); this.vert(p, lipN, col, 0.52); this.vert(D, lipN, col, 0.52); this.vert(D, lipN, col, 0.52); this.vert(p, lipN, col, 0.52); this.vert(q, lipN, col, 0.52); }
      }
    }
    return { nu, nv };
  }
  /** Bare sheathing boards under the tiles; holes here are the real sky gaps. */
  boards(S, { nu = 10, nv = 8, holes = [], color, rand, k = 0.74, region = null, drop = 0.03 }) {
    const a = new V3(), b = new V3(), c = new V3(), d = new V3(), n = new V3(), e = new V3(), f = new V3();
    const col = new THREE.Color(color);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv, uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      if (region && !region(uc, vc)) continue;
      if (inHole(holes, uc, vc, k * (0.92 + rand() * 0.18))) continue;
      S(u0, v0, a); S(u1, v0, b); S(u0, v1, c); S(u1, v1, d);
      e.subVectors(b, a); f.subVectors(c, a); n.crossVectors(e, f).normalize(); const flip = n.y < 0; if (flip) n.negate();
      a.addScaledVector(n, -drop); b.addScaledVector(n, -drop); c.addScaledVector(n, -drop); d.addScaledVector(n, -drop);
      const m = 0.92 + rand() * 0.16;
      if (!flip) { this.vert(a, n, col, m); this.vert(b, n, col, m); this.vert(c, n, col, m); this.vert(b, n, col, m); this.vert(d, n, col, m); this.vert(c, n, col, m); } else { this.vert(a, n, col, m); this.vert(c, n, col, m); this.vert(b, n, col, m); this.vert(b, n, col, m); this.vert(c, n, col, m); this.vert(d, n, col, m); }
    }
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
  }
}

export function build(ctx) {
  const { layout, P, kit, rng } = ctx;
  const { TOWN, SUN_DIR } = layout;
  const SUN = new V3(...SUN_DIR);
  const group = new THREE.Group(); group.name = 'town';
  const atlas = buildAtlas(ctx);
  const b = ctx.batch(), softB = ctx.batch(), glassB = ctx.batch();
  const W = new Stage({ b, kit });
  const atlasMat = ctx.toon({ map: atlas.tex, vertexColors: true, side: THREE.DoubleSide });
  const worn = wornMaterial(ctx);
  const WOOD = ctx.surface('wood', { vertexColors: true, color: '#ffffff' }); WOOD.userData.uv = 0.17; // vertex tint is the true colour; broad grain, no hatching
  const roofMat = ctx.toon({ vertexColors: true, moss: 0.46, side: THREE.DoubleSide });
  const glassMat = ctx.toon({ color: '#bfe8e2', transparent: true, opacity: 0.34, side: THREE.DoubleSide, dapple: false, depthWrite: false });
  const roof = new Roofing();
  const color = (h) => new THREE.Color(h);
  const C = {
    cedar: '#c8a884', cedarDark: '#7a5c46', silver: '#c2b7a4', beam: '#86664c', frame: '#a98a6a',
    footing: '#b9b5a8', slate: '#7f93a0', plasterWarm: '#ece1c8', plasterCool: '#d9d8c8', mint: '#a9d0bb', mintDark: '#7fae9c',
    boards: '#6d5240', iron: '#6f7a7e', steel: '#a8b4b4', white: '#ece6d4', tileBath: '#d9efe8', brick: '#b4644a',
  };
  const roofTints = (cols) => { const c = cols.map(color); return (u, v, r) => { const k = r(); return k < 0.62 ? c[0] : k < 0.86 ? c[1] : k < 0.965 ? c[2] : c[3]; }; };
  const TINT_ROW = roofTints(['#7a8e9c', '#6b808f', '#8c9ea8', '#a0705a']);
  const TINT_BATH = roofTints(['#64808f', '#587482', '#7890a0', '#566a78']);

  /* ---- roof parts following a slope ---- */
  const a0 = new V3(), a1 = new V3();
  function ridgeCap(S, { n = 12, gaps = [], w = 0.3, s = W } = {}) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, uc = (u0 + u1) / 2;
      if (gaps.some(([p, q]) => uc > p && uc < q)) continue;
      const p = S(u0, 0, a0).clone(), q = S(u1, 0, a1).clone(); p.y += 0.07; q.y += 0.07;
      s.beam(p, q, w, 0.1, 'concrete', '#8d9ba4');
      const p2 = p.clone(), q2 = q.clone(); p2.y += 0.1; q2.y += 0.1;
      s.rod(p2, q2, 0.105, 'flat', '#71868f', 7);
    }
  }
  /** Ridge-end demon tile: a plain chunky disc-and-block, enough to read as the ornament. */
  function oni(S, u, face = 1, s = W, sz = 0.24) {
    const p = S(u, 0, a0).clone();
    s.add(kit.boxBase(0.14, sz, sz * 1.25), 'flat', { pos: [p.x, p.y + 0.02, p.z], color: '#6a7f8a' });
    s.add(kit.cyl(sz * 0.62, sz * 0.62, 0.16, 12), 'flat', { pos: [p.x, p.y + 0.02 + sz, p.z], rot: [0, 0, Math.PI / 2], color: '#7a8e98' });
  }
  /** Board along the sloped verge. side: u (0 or 1). */
  function verge(S, u, { n = 5, h = 0.2, t = 0.05, color: c = C.silver, offset = 0, s = W } = {}) {
    for (let i = 0; i < n; i++) { const p = S(u, i / n, a0).clone(), q = S(u, (i + 1) / n, a1).clone(); p.x += offset; q.x += offset; p.y -= h * 0.3; q.y -= h * 0.3; s.beam(p, q, t, h, WOOD, c); }
  }
  function gutter(S, { n = 10, gaps = [], drop = 0.07, r = 0.05, out = 0.06, dx = 0, dz = 1, s = W } = {}) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, uc = (u0 + u1) / 2; if (gaps.some(([p, q]) => uc > p && uc < q)) continue;
      const p = S(u0, 1, a0).clone(), q = S(u1, 1, a1).clone(); p.y -= drop; q.y -= drop; p.x += dx * out; q.x += dx * out; p.z += dz * out; q.z += dz * out;
      s.rod(p, q, r, worn, '#8a7a6a', 6); s.beam(S(uc, 1, a0).clone().setY(a0.y - 0.02), S(uc, 0.9, a1).clone().setY(a1.y - 0.04), 0.06, 0.03, worn, '#6f7a7e');
    }
    for (let i = 0; i < n; i++) { const uc = (i + 0.5) / n; if (gaps.some(([p, q]) => uc > p && uc < q)) continue; const p = S(uc, 1, a0).clone(); p.y -= 0.12; s.box(p.x - 0.05, p.x + 0.05, p.y, p.y + 0.09, p.z - 0.04, p.z + 0.04, WOOD, C.cedarDark); }
  }
  function rafters(S, { n = 6, cut = () => 1, drop = 0.14, w = 0.09, h = 0.12, color: c = C.beam, seg = 4, s = W } = {}) {
    for (let i = 0; i <= n; i++) {
      const u = i / n, end = cut(u);
      for (let k = 0; k < seg; k++) {
        const v0 = (k / seg) * end, v1 = ((k + 1) / seg) * end, p = S(u, v0, a0).clone(), q = S(u, v1, a1).clone(); p.y -= drop; q.y -= drop;
        s.beam(p, q, w, h, WOOD, c);
      }
    }
  }
  function battens(S, { vs = [0.2, 0.35, 0.5, 0.65, 0.8], u0 = 0, u1 = 1, drop = 0.09, s = W } = {}) {
    for (const vv of vs) { const n = 4; for (let k = 0; k < n; k++) { const p = S(lerp(u0, u1, k / n), vv, a0).clone(), q = S(lerp(u0, u1, (k + 1) / n), vv, a1).clone(); p.y -= drop; q.y -= drop; s.beam(p, q, 0.06, 0.03, WOOD, C.cedarDark); } }
  }
  const rand = ctx.seeded('town-tiles');
  let saplingPivot = null;

  /* ---- facade pieces ---- */
  function lattice(s, x0, x1, y0, y1, z, { n = 9, f = 0.05, col = C.frame, slat = C.cedar, t = 0.035, rails = 1 } = {}) {
    s.box(x0, x1, y1 - f, y1, z - t, z + t, WOOD, col); s.box(x0, x1, y0, y0 + f, z - t, z + t, WOOD, col);
    s.box(x0, x0 + f, y0, y1, z - t, z + t, WOOD, col); s.box(x1 - f, x1, y0, y1, z - t, z + t, WOOD, col);
    for (let i = 1; i < n; i++) { const x = lerp(x0, x1, i / n); s.box(x - 0.012, x + 0.012, y0 + f, y1 - f, z - t * 0.6, z + t * 0.6, WOOD, slat); }
    for (let i = 1; i <= rails; i++) { const y = lerp(y0, y1, i / (rails + 1)); s.box(x0, x1, y - 0.012, y + 0.012, z - t * 0.7, z + t * 0.7, WOOD, slat); }
  }
  function glassPanel(s, x0, x1, y0, y1, z, opts = {}) {
    const { f = 0.05, col = C.frame, mull = 2, kick = 0.3, panes = true } = opts;
    s.box(x0, x1, y1 - f, y1, z - 0.03, z + 0.03, WOOD, col); s.box(x0, x1, y0, y0 + kick, z - 0.03, z + 0.03, WOOD, col);
    s.box(x0, x0 + f, y0, y1, z - 0.03, z + 0.03, WOOD, col); s.box(x1 - f, x1, y0, y1, z - 0.03, z + 0.03, WOOD, col);
    for (let i = 1; i < mull; i++) { const y = lerp(y0 + kick, y1, i / mull); s.box(x0, x1, y - 0.014, y + 0.014, z - 0.02, z + 0.02, WOOD, col); }
    if (panes) new Stage({ b: glassB, kit }, s.m).add(kit.box(x1 - x0 - f, y1 - y0 - kick, 0.01), glassMat, { pos: [(x0 + x1) / 2, (y0 + kick + y1) / 2, z] });
  }
  /** Square-post frame gives the wall its Japanese read: pale fill, dark timber lines. */
  function timbers(s, x0, x1, z, ys, posts) {
    for (const y of ys) s.box(x0, x1, y - 0.06, y + 0.06, z - 0.03, z + 0.03, WOOD, C.beam);
    for (const x of posts) s.box(x - 0.06, x + 0.06, 0.2, ys[ys.length - 1], z - 0.03, z + 0.03, WOOD, C.beam);
  }
  const wallX = (s, z, outline, holes, t, mat, col) => s.add(kit.wallPanel(outline, holes, t), mat, { pos: [0, 0, z], color: col });
  /** Wall running along z: outline is [z,y]. */
  const wallZ = (s, x, outline, holes, t, mat, col) => s.add(kit.wallPanel(outline, holes, t), mat, { pos: [x, 0, 0], rot: [0, -Math.PI / 2, 0], color: col });
  const rect = (a0, a1, y0, y1) => [[a0, y0], [a1, y0], [a1, y1], [a0, y1]];
  /** Box-section rain pipe from an eave down a wall. */
  const pipe = (s, pts, r = 0.05, col = '#8a7a6a') => { for (let i = 0; i < pts.length - 1; i++) s.rod(pts[i], pts[i + 1], r, worn, col, 6); };
  function acUnit(s, col = C.white) {
    s.box(-0.38, 0.38, 0, 0.56, -0.15, 0.15, worn, col);
    s.add(kit.cyl(0.21, 0.21, 0.02, 14), 'flat', { pos: [-0.08, 0.28, 0.155], rot: [Math.PI / 2, 0, 0], color: '#4e5a5e' });
    for (let i = -2; i <= 2; i++) s.box(-0.3, 0.14, 0.28 + i * 0.06 - 0.008, 0.28 + i * 0.06 + 0.008, 0.16, 0.175, 'flat', C.iron);
    s.box(0.2, 0.34, 0.06, 0.5, 0.155, 0.17, 'flat', '#b9bdb2');
    s.box(-0.4, -0.33, -0.1, 0, -0.2, 0.16, worn, C.iron); s.box(0.33, 0.4, -0.1, 0, -0.2, 0.16, worn, C.iron);
    s.rod([0.34, 0.2, -0.1], [0.5, 0.1, -0.1], 0.02, 'flat', '#e6e0cc'); s.rod([0.5, 0.1, -0.1], [0.5, -0.9, -0.12], 0.02, 'flat', '#e6e0cc');
  }
  function gasMeter(s) {
    s.box(-0.13, 0.13, 0, 0.32, -0.08, 0.08, worn, '#d8d4c2');
    s.box(-0.09, 0.09, 0.14, 0.26, 0.08, 0.09, 'flat', '#efe9d6');
    s.rod([-0.08, 0, 0], [-0.08, -0.3, 0], 0.016, 'flat', '#c9a24e'); s.rod([0.08, 0, 0], [0.08, -0.3, 0], 0.016, 'flat', '#c9a24e');
    s.rod([-0.08, 0.32, 0], [-0.08, 0.5, 0], 0.016, 'flat', '#c9a24e'); s.rod([0.08, 0.32, 0], [0.08, 0.5, 0], 0.016, 'flat', '#c9a24e');
    s.rod([-0.12, 0.5, 0], [0.5, 0.5, 0], 0.016, 'flat', '#c9a24e');
  }

  /* ================================================================== the row ===================================== */
  const HX = [TOWN.row.x[0], -16.95, -14.2, -11.55], ZF = 0.34, ZB = -6.0, ZR = -2.85, ZFE = 0.76, ZBE = -6.34, FL = 0.22, F2 = 2.62;
  const HOUSE = [{ ridge: 6.36, eave: 4.68, sag: 0.16 }, { ridge: 6.48, eave: 4.8, sag: 0.3 }, { ridge: 6.22, eave: 4.66, sag: 0.13 }];
  const eaveAtWall = (h) => lerp(h.ridge, h.eave, (ZF - ZR) / (ZFE - ZR)) - 0.08;
  const front = [], back = [];
  HOUSE.forEach((h, i) => {
    const x0 = HX[i] - (i === 0 ? 0.24 : 0.02), x1 = HX[i + 1] + (i === 2 ? 0.1 : 0.02);
    const dents = i === 1 ? [[0.55, 0.3, 0.2, 0.3, 0.22]] : i === 0 ? [[0.3, 0.7, 0.2, 0.2, 0.09]] : [[0.62, 0.55, 0.2, 0.3, 0.07]];
    front[i] = slope([x0, h.ridge, ZR], [x1, h.ridge, ZR], [x0, h.eave, ZFE], [x1, h.eave, ZFE], { sagR: h.sag, sagE: h.sag * 0.55, dish: 0.08, dents });
    back[i] = slope([x0, h.ridge, ZR], [x1, h.ridge, ZR], [x0, h.eave, ZBE], [x1, h.eave, ZBE], { sagR: h.sag, sagE: h.sag * 0.4, dish: 0.08, dents: i === 1 ? [[0.45, 0.3, 0.2, 0.3, 0.12]] : [] });
    const len = x1 - x0, lenV = Math.hypot(ZFE - ZR, h.ridge - h.eave);
    W.box(HX[i] + 0.02, HX[i + 1] - 0.02, 0, FL, ZB - 0.05, ZF + 0.08, 'concrete', C.footing);
    W.box(HX[i] + 0.02, HX[i + 1] - 0.02, F2 - 0.14, F2, ZB, i === 1 ? -3 : ZF, WOOD, C.cedarDark);
    const holesF = [[[0.72, 0.26, 0.1, 0.11], [0.2, 0.76, 0.1, 0.09]], [[0.46, 0.92, 0.72, 0.52], [0.9, 0.32, 0.12, 0.15]], [[0.3, 0.6, 0.14, 0.14]]][i];
    const holesB = [[[0.36, 0.52, 0.17, 0.2], [0.84, 0.82, 0.09, 0.1]], [[0.72, 0.2, 0.14, 0.2], [0.2, 0.7, 0.12, 0.16]], [[0.58, 0.72, 0.15, 0.15]]][i];
    const stop = i === 2 ? (u, vv) => vv < 0.8 : null;
    roof.tiles(front[i], { lenU: len, lenV, holes: holesF, scatter: 0.018, tint: TINT_ROW, rand, region: stop });
    roof.tiles(back[i], { lenU: len, lenV, holes: holesB, scatter: 0.018, tint: TINT_ROW, rand });
    roof.boards(front[i], { nu: 16, nv: 16, holes: holesF, color: C.boards, rand, k: 0.84, region: stop });
    roof.boards(back[i], { nu: 16, nv: 16, holes: holesB, color: C.boards, rand, k: 0.84 });
    rafters(front[i], { n: 5, cut: i === 1 ? (u) => 0.42 + 0.18 * Math.abs(Math.sin(u * 9)) : i === 2 ? () => 0.8 : () => 1 });
    rafters(back[i], { n: 5 });
    battens(front[i], { vs: i === 1 ? [0.14, 0.26, 0.38] : [0.16, 0.3, 0.44, 0.58, 0.72, 0.86] }); battens(back[i], { vs: [0.2, 0.34, 0.48, 0.62, 0.76, 0.9] });
    ridgeCap(front[i], { n: 7, gaps: i === 1 ? [[0.56, 0.74]] : i === 0 ? [[0.82, 0.92]] : [] });
    if (i === 0) gutter(front[i], { n: 6, gaps: [[0.6, 0.76]], dz: 1 });
    gutter(back[i], { n: 6, gaps: i === 2 ? [[0.3, 0.5]] : [], dz: -1 });
  });
  oni(front[0], 0); oni(front[2], 1);
  verge(front[0], 0); verge(back[0], 0); verge(front[2], 1); verge(back[2], 1);

  // party walls and the two gable ends. Timber lines drawn on both outer gables.
  const gableOutline = (r, e, y0 = 0) => [[ZB, y0], [ZF, y0], [ZF, e], [ZR, r], [ZB, e]];
  const WX = HX[0] + 0.07, EX = HX[3] - 0.07;
  wallZ(W, WX, gableOutline(HOUSE[0].ridge - 0.1, eaveAtWall(HOUSE[0])), [rect(-2.5, -1.3, 3.2, 4.15), rect(-5.05, -4.25, 1.15, 2.0), rect(-1.6, -0.9, 1.1, 1.9)], 0.14, 'plaster', C.plasterWarm);
  wallZ(W, EX, gableOutline(HOUSE[2].ridge - 0.1, eaveAtWall(HOUSE[2])), [], 0.14, 'plaster', C.plasterCool);
  for (const k of [1, 2]) {
    const hA = HOUSE[k - 1], hB = HOUSE[k], r = Math.max(hA.ridge, hB.ridge) - 0.14, e = Math.max(eaveAtWall(hA), eaveAtWall(hB));
    wallZ(W, HX[k], gableOutline(r, e), [], 0.16, 'plaster', k === 1 ? C.plasterWarm : C.plasterCool);
    // udatsu: the little fire wing with its own tile cap, the row's rhythm from the street
    if (k === 1) {
      W.box(HX[k] - 0.1, HX[k] + 0.1, F2 - 0.02, 5.02, ZF, 0.96, 'plaster', C.plasterCool);
      W.beam([HX[k], 5.04, ZF - 0.05], [HX[k], 5.0, 1.08], 0.36, 0.1, 'flat', '#71868f');
      W.rod([HX[k], 5.1, ZF - 0.05], [HX[k], 5.06, 1.1], 0.08, 'flat', '#7f93a0', 7);
    } else wallZ(W, HX[k], [[ZF, F2 - 0.02], [0.62, F2 - 0.02], [0.56, 3.1], [0.66, 3.5], [0.5, 3.9], [ZF, 4.3]], [], 0.18, 'plaster', C.plasterCool); // the fire wing beside the fall has gone with it
    W.box(HX[k] - 0.11, HX[k] + 0.11, 0.2, F2, ZF - 0.02, ZF + 0.12, WOOD, C.beam);
  }
  timbers(W.sub({ pos: [WX - 0.09, 0, 0], rot: [0, -Math.PI / 2, 0] }), ZB, ZF, 0, [F2 + 0.06, 4.74], [-5.2, -3.6, -0.7]);
  // west gable service clutter, for the west view
  for (const [z0, z1, y0, y1] of [[-2.5, -1.3, 3.2, 4.15], [-5.05, -4.25, 1.15, 2.0], [-1.6, -0.9, 1.1, 1.9]]) {
    const s = W.sub({ pos: [WX, 0, 0], rot: [0, -Math.PI / 2, 0] });
    glassPanel(s, z0, z1, y0, y1, 0, { kick: 0.06, mull: y1 - y0 > 0.9 ? 3 : 2, f: 0.05 }); s.box(z0 - 0.08, z1 + 0.08, y0 - 0.05, y0, -0.02, 0.12, WOOD, C.beam);
  }
  pipe(W, [[WX - 0.14, 4.72, -5.75], [WX - 0.14, 0.15, -5.75]], 0.045);
  pipe(W, [[WX - 0.14, 4.75, 0.1], [WX - 0.14, 3.0, 0.1], [WX - 0.24, 2.84, 0.1], [WX - 0.24, 0.15, 0.1]], 0.045);
  acUnit(W.sub({ pos: [WX - 0.2, 0.24, -3.1], rot: [0, -Math.PI / 2, 0] }));
  gasMeter(W.sub({ pos: [WX - 0.16, 1.2, -2.9], rot: [0, -Math.PI / 2, 0] }));

  { const q = new V3(); back[2](0.7, 0.02, q); const x = q.x, y = q.y - 0.05, z = q.z; W.rod([x, y, z], [x, 6.76, z], 0.016, worn, '#7d8b90', 5); for (const [yy, l] of [[6.74, 0.36], [6.6, 0.28], [6.46, 0.2]]) W.rod([x - l, yy, z], [x + l, yy, z], 0.009, worn, '#7d8b90', 4); W.rod([x, 6.7, z], [x + 0.46, 5.5, z - 1.5], 0.005, 'flat', '#3e3a36', 3); }

  /* ---- tofu shop ---- */
  {
    const x0 = HX[0], x1 = HX[1], m = x0 + 1.46;
    for (const x of [x0 + 0.1, m, x1 - 0.1]) W.box(x - 0.07, x + 0.07, FL, F2, ZF - 0.07, ZF + 0.07, WOOD, C.beam);
    W.box(x0, x1, 2.46, F2 + 0.02, ZF - 0.09, ZF + 0.09, WOOD, C.beam);
    // left bay: white tile counter front, half-open lattice sliders above it
    W.box(x0 + 0.17, m - 0.07, FL, 0.92, ZF - 0.06, ZF + 0.05, 'tile', '#ffffff');
    W.box(x0 + 0.12, m - 0.02, 0.92, 0.98, ZF - 0.12, ZF + 0.16, WOOD, C.silver);
    lattice(W, x0 + 0.16, x0 + 0.84, 0.98, 2.44, ZF + 0.03, { n: 8, rails: 2 });
    lattice(W, x0 + 0.5, x0 + 1.18, 0.98, 2.44, ZF - 0.05, { n: 8, rails: 2 });
    // right bay: sliding doors, one pulled back
    glassPanel(W, m + 0.07, m + 0.72, FL + 0.02, 2.44, ZF + 0.02, { mull: 3 });
    glassPanel(W, m + 0.3, m + 0.96, FL + 0.02, 2.44, ZF - 0.06, { mull: 3 });
    // upper storey
    wallX(W, ZF - 0.02, rect(x0, x1, F2, eaveAtWall(HOUSE[0]) + 0.04), [rect(x0 + 0.5, x1 - 0.5, 3.78, 4.46)], 0.12, 'plaster', C.plasterWarm);
    timbers(W, x0, x1, ZF + 0.05, [F2 + 0.06, 3.76, 4.5], [x0 + 0.5, x1 - 0.5]);
    W.box(x0 + 0.42, x1 - 0.42, 3.7, 3.76, ZF - 0.04, ZF + 0.18, WOOD, C.beam);
    for (let i = 0; i < 9; i++) { const x = lerp(x0 + 0.56, x1 - 0.56, i / 8); W.box(x - 0.012, x + 0.012, 3.76, 4.46, ZF - 0.01, ZF + 0.01, WOOD, C.frame); } // mushiko bars on the fixed half
    // hisashi
    const hs = slope([x0 - 0.04, 3.2, ZF], [x1 + 0.02, 3.2, ZF], [x0 - 0.04, 2.76, 1.16], [x1 + 0.02, 2.76, 1.16], { sagE: 0.06, sagR: 0.02 });
    const hh = [[0.78, 0.7, 0.1, 0.34]];
    roof.tiles(hs, { lenU: x1 - x0, lenV: 0.95, holes: hh, scatter: 0.03, tint: TINT_ROW, rand, tl: 0.32 }); roof.boards(hs, { nu: 6, nv: 3, holes: hh, color: C.boards, rand, k: 0.6 });
    rafters(hs, { n: 4, seg: 1, drop: 0.09, w: 0.06, h: 0.08 });
    W.box(x0, x1, 3.16, 3.26, ZF - 0.02, ZF + 0.06, 'flat', '#71868f');
    // signboard stands on the pent roof
    W.add(atlas.quad(2.3, 0.47, 'tofu'), atlasMat, { pos: [(x0 + x1) / 2, 3.46, ZF + 0.26], rot: [-0.1, 0, 0] });
    W.box((x0 + x1) / 2 - 1.2, (x0 + x1) / 2 + 1.2, 3.18, 3.72, ZF + 0.18, ZF + 0.235, WOOD, C.beam);
  }

  /* ---- barber: the front has fallen away ---- */
  {
    const x0 = HX[1], x1 = HX[2];
    wallX(W, -3.0, rect(x0, x1, FL, 5.5), [rect(x0 + 0.3, x0 + 1.0, FL, 2.2)], 0.14, 'plaster', '#e7dcc4');
  }

  /* ---- bar: a little mortar false front ---- */
  {
    const x0 = HX[2], x1 = HX[3];
    const o = [[x0, FL], [x1, FL], [x1, 5.02], [x1 - 0.42, 5.02], [x1 - 0.42, 5.3], [x0 + 0.42, 5.3], [x0 + 0.42, 5.02], [x0, 5.02]];
    wallX(W, ZF, o, [rect(x0 + 0.32, x0 + 1.14, FL + 0.03, 2.26), rect(x0 + 1.42, x1 - 0.28, 1.02, 2.22), rect(x0 + 0.72, x1 - 0.72, 3.2, 4.26)], 0.16, 'plaster', C.mint);
    W.box(x0 + 0.02, x1 - 0.02, FL, 0.46, ZF + 0.08, ZF + 0.12, 'flat', C.mintDark);
    W.box(x0 + 0.38, x1 - 0.38, 5.3, 5.36, ZF - 0.11, ZF + 0.11, 'plaster', C.plasterCool); W.box(x0, x1, 2.5, 2.62, ZF + 0.08, ZF + 0.14, 'plaster', C.plasterCool); W.box(x0 + 0.02, x1 - 0.02, 4.96, 5.04, ZF + 0.08, ZF + 0.12, 'plaster', C.plasterCool);
  }
  // cross walls so no one sees straight through a house
  for (const i of [0, 2]) { W.box(HX[i] + 0.04, HX[i + 1] - 0.04, FL, 4.9, -3.08, -2.96, 'plaster', '#e3d6b8'); }
  // back walls
  HOUSE.forEach((h, i) => {
    const x0 = HX[i], x1 = HX[i + 1];
    wallX(W, ZB, rect(x0, x1, 0.1, eaveAtWall(h) + 0.04), [rect(x0 + 0.3, x0 + 1.1, FL + 0.02, 2.2), rect(x0 + 1.45, x1 - 0.35, 1.05, 1.95), rect(x0 + 0.6, x1 - 0.6, 3.2, 4.2)], 0.14, 'plaster', i === 1 ? C.plasterWarm : C.plasterCool);
  });

  /* ================================================================== the sento ==================================== */
  const BX0 = TOWN.bathhouse.x[0] + 0.05, BX1 = TOWN.bathhouse.x[1] - 0.05, BZN = TOWN.bathhouse.z[0] + 0.1, BZM = -16.45, BZS = TOWN.bathhouse.z[1] - 0.1, WEX = -17.0;
  const RY = 5.08, EY = 2.96;
  const bN = slope([BX0 - 0.26, RY, -18], [BX1 + 0.3, RY, -18], [BX0 - 0.26, EY, -19.82], [BX1 + 0.3, EY, -19.82], { sagR: 0.2, sagE: 0.1, dish: 0.12, dents: [[0.47, 0.06, 0.16, 0.3, 0.3]] });
  const bS = slope([BX0 - 0.26, RY, -18], [BX1 + 0.3, RY, -18], [BX0 - 0.26, EY, -16.12], [BX1 + 0.3, EY, -16.12], { sagR: 0.2, sagE: 0.08, dish: 0.1, dents: [[0.47, 0.06, 0.16, 0.3, 0.3]] });
  const holeN = [[0.36, 0.7, 0.21, 0.82], [0.58, 0.7, 0.2, 0.8]], holeS = [[0.47, 0.1, 0.1, 0.2], [0.14, 0.7, 0.05, 0.08]];
  const bW = slope([-18.25, 4.46, -17.6], [-18.25, 4.46, -11.96], [-19.72, 2.96, -17.6], [-19.72, 2.96, -11.96], { sagR: 0.1, sagE: 0.06, dish: 0.05 });
  const bE = slope([-18.25, 4.46, -17.6], [-18.25, 4.46, -11.96], [-16.72, 2.96, -17.6], [-16.72, 2.96, -11.96], { sagR: 0.1, sagE: 0.05, dish: 0.05 });
  const lenBV = Math.hypot(1.82, RY - EY), lenWV = Math.hypot(1.5, 1.5);
  roof.tiles(bN, { lenU: BX1 - BX0 + 0.56, lenV: lenBV, holes: holeN, scatter: 0.02, tint: TINT_BATH, rand });
  roof.tiles(bS, { lenU: BX1 - BX0 + 0.56, lenV: lenBV, holes: holeS, scatter: 0.02, tint: TINT_BATH, rand });
  roof.tiles(bW, { lenU: 5.6, lenV: lenWV, holes: [[0.6, 0.5, 0.1, 0.14]], scatter: 0.02, tint: TINT_BATH, rand });
  roof.tiles(bE, { lenU: 5.6, lenV: lenWV, holes: [[0.75, 0.35, 0.09, 0.15]], scatter: 0.02, tint: TINT_BATH, rand });
  for (const [S, h] of [[bN, holeN], [bS, holeS], [bW, [[0.6, 0.5, 0.1, 0.14]]], [bE, [[0.75, 0.35, 0.09, 0.15]]]]) roof.boards(S, { nu: 30, nv: 16, holes: h, color: C.boards, rand, k: 0.86 });
  rafters(bN, { n: 12, cut: (u) => (Math.abs(u - 0.47) < 0.14 ? 0.03 : Math.abs(u - 0.47) < 0.3 ? 0.1 + 0.2 * Math.abs(Math.sin(u * 31)) : 1) });
  rafters(bS, { n: 12 }); battens(bN, { u0: 0.16, u1: 0.78, vs: [0.07] }); battens(bN, { u0: 0, u1: 0.16 }); battens(bN, { u0: 0.78, u1: 1 });
  ridgeCap(bN, { n: 12, gaps: [[0.38, 0.58]], w: 0.34 }); ridgeCap(bW, { n: 7 });
  oni(bN, 0, 1, W, 0.3); oni(bN, 1, 1, W, 0.3);
  verge(bN, 0); verge(bN, 1); verge(bS, 0); verge(bS, 1); verge(bW, 1, { n: 3 }); verge(bE, 1, { n: 3 });
  gutter(bN, { n: 12, gaps: [[0.2, 0.74]], dz: -1 }); gutter(bS, { n: 12, gaps: [[0.05, 0.3]], dz: 1 }); gutter(bW, { n: 8, gaps: [[0.1, 0.2]], dx: -1, dz: 0 });

  // walls
  const bWall = C.plasterCool;
  const northO = [[BX0, 0], [BX1, 0], [BX1, 3.0], [-13.46, 3.0], [-13.66, 2.3], [-14.08, 2.42], [-14.36, 1.42], [-14.86, 1.22], [-15.28, 0.66], [-16.2, 0.82], [-16.7, 0.52], [-17.16, 1.26], [-17.5, 1.14], [-17.9, 2.3], [-18.2, 2.2], [-18.34, 3.0], [BX0, 3.0]];
  wallX(W, BZN, northO, [rect(-19.15, -18.6, 1.2, 2.5), rect(-13.3, -12.6, 1.2, 2.5)], 0.18, 'plaster', bWall);
  wallX(W, BZM, [[BX0, 0], [BX1, 0], [BX1, 3.14], [BX0, 3.14]], [], 0.2, 'plaster', '#e2e0cf');
  const westH = [rect(-19.0, -18.0, 1.5, 2.55), rect(-17.0, -16.0, 1.5, 2.55), rect(-15.2, -14.2, 1.5, 2.55), rect(-13.6, -12.8, 1.5, 2.55)];
  wallZ(W, BX0, rect(BZN, BZS, 0, 3.05), westH, 0.18, 'plaster', bWall);
  wallZ(W, BX1, [[BZN, 0], [BZM, 0], [BZM, 3.05], [-18, RY - 0.12], [BZN, 3.05]], [rect(-18.8, -17.2, 0.12, 2.25)], 0.18, 'plaster', bWall);
  wallZ(W, WEX, rect(BZM, BZS, 0, 3.05), [rect(-15.4, -14.1, 1.3, 2.4)], 0.16, 'plaster', bWall);
  wallX(W, BZS, [[BX0, 0], [WEX, 0], [WEX, 3.05], [-18.25, 4.36], [BX0, 3.05]], [rect(-18.7, -17.8, 0.1, 2.1)], 0.16, 'plaster', bWall);
  // bath hall floor
  W.box(BX0 + 0.05, BX1 - 0.05, 0, 0.14, BZN + 0.05, BZM, 'tile', '#ffffff');
  // mural wall
  W.add(atlas.quad(6.6, 2.06, 'mural'), atlasMat, { pos: [(BX0 + BX1) / 2, 2.06, BZM - 0.11], rot: [0, Math.PI, 0], color: new THREE.Color(1.5, 1.5, 1.44) }); // a shaded wall that must still read as the room's bright painted heart

  /* ---- chimney ---- */
  {
    const CH = TOWN.chimney, H = CH.height, Y0 = 1.35, r0 = 0.74, r1 = 0.42, seg = 28, rows = 36;
    const radius = (y) => lerp(r0, r1, (y - Y0) / (H - Y0));
    const topAt = (th) => {
      const a = Math.sin(th * 2 + 1) * 0.16 + Math.sin(th * 5 + 0.4) * 0.14, d = Math.atan2(Math.sin(th - 1.9), Math.cos(th - 1.9));
      const notch = 1.25 * Math.exp(-(d * d) / 0.3);
      return H - 0.34 + a - notch * 0.8 - 0.12 * Math.sin(Math.floor(th * 3.5) * 2.4);
    };
    const brick = 0.19, qtop = (th) => Math.floor(topAt(th) / brick) * brick;
    const pos = [], nor = [], uv = [], idx = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2, y = Math.min(lerp(Y0, H, j / rows), qtop(th)), r = radius(y);
      pos.push(CH.x + r * Math.sin(th), y, CH.z + r * Math.cos(th)); nor.push(Math.sin(th), 0.03, Math.cos(th)); uv.push(i / seg, (y - Y0) / (H - Y0));
    }
    const w = seg + 1; for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) { const a = j * w + i, c = a + w; idx.push(a, a + 1, c, a + 1, c + 1, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    W.add(atlas.uvTo(g, 'chimney'), atlasMat);
    // inner throat + broken rim
    const rp = [], rc = [], Rn = 0.13;
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * 6.2832, t1 = ((i + 1) / seg) * 6.2832, y0 = qtop(t0), y1 = qtop(t1), r0a = radius(y0), r1a = radius(y1);
      const O0 = [CH.x + r0a * Math.sin(t0), y0, CH.z + r0a * Math.cos(t0)], O1 = [CH.x + r1a * Math.sin(t1), y1, CH.z + r1a * Math.cos(t1)];
      const I0 = [CH.x + (r0a - Rn) * Math.sin(t0), y0, CH.z + (r0a - Rn) * Math.cos(t0)], I1 = [CH.x + (r1a - Rn) * Math.sin(t1), y1, CH.z + (r1a - Rn) * Math.cos(t1)];
      rp.push(...O0, ...O1, ...I0, ...I0, ...O1, ...I1);
      const D0 = [I0[0], y0 - 3, I0[2]], D1 = [I1[0], y1 - 3, I1[2]];
      rc.push(...I0, ...I1, ...D0, ...D0, ...I1, ...D1);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.computeVertexNormals();
    W.add(rg, 'flat', { color: '#c98a6e' });
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(rc, 3)); cg.computeVertexNormals();
    W.add(cg, 'flat', { color: '#465058' });
    // square brick foot, iron soot door, bands, climbing rungs
    const P0 = 0.76;
    W.box(CH.x - P0, CH.x + P0, 0, Y0, CH.z - P0, CH.z + P0, 'flat', '#a85a44');
    W.box(CH.x - P0 - 0.06, CH.x + P0 + 0.06, 0, 0.3, CH.z - P0 - 0.06, CH.z + P0 + 0.06, 'concrete', C.footing);
    W.box(CH.x - P0 - 0.05, CH.x + P0 + 0.05, Y0 - 0.1, Y0 + 0.02, CH.z - P0 - 0.05, CH.z + P0 + 0.05, 'concrete', C.footing);
    W.box(CH.x + P0 - 0.02, CH.x + P0 + 0.05, 0.42, 1.05, CH.z - 0.32, CH.z + 0.32, worn, '#5a5650');
    for (const y of [2.9, 4.7, 6.5, 8.3, 10.1, 11.9]) { const r = radius(y) + 0.03; W.add(kit.cyl(r, r, 0.11, seg, true), worn, { pos: [CH.x, y, CH.z], color: '#6f5a50' }); }
    const ra = 2.5, cx = Math.sin(ra), cz = Math.cos(ra), tx = Math.cos(ra), tz = -Math.sin(ra);
    for (let y = 2.2; y < 12.6; y += 0.42) {
      const r = radius(y), o = r + 0.15, A = [CH.x + cx * r + tx * 0.2, y, CH.z + cz * r + tz * 0.2], B = [CH.x + cx * r - tx * 0.2, y, CH.z + cz * r - tz * 0.2], a = [CH.x + cx * o + tx * 0.2, y, CH.z + cz * o + tz * 0.2], d = [CH.x + cx * o - tx * 0.2, y, CH.z + cz * o - tz * 0.2];
      W.rod(A, a, 0.018, worn, '#6a5a50', 4); W.rod(a, d, 0.018, worn, '#6a5a50', 4); W.rod(d, B, 0.018, worn, '#6a5a50', 4);
    }
  }

  /* ================================================================== foliage, cloth and small-part kits ============ */
  const softS = new Stage({ b: softB, kit });
  const softMat = (() => { // both faces of a petal take the same light
    const m = ctx.toon({ vertexColors: true, side: THREE.DoubleSide, translucent: 0.5 }), base = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => { base(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')); };
    m.customProgramCacheKey = () => key + '|oneface';
    return m;
  })();
  // Every leaf is lit by the smooth normal of the clump it belongs to, so the cel terminator draws broad bands, not a per-leaf coin toss.
  const shellMat = (() => {
    const m = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, dapple: false, translucent: 0.6 });
    const baseCompile = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => {
      baseCompile(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aShell;')
        .replace('#include <normal_vertex>', 'transformedNormal=normalize(mat3(viewMatrix)*aShell);\n#include <normal_vertex>');
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => key + '|shell';
    return m;
  })();
  const shellLeaf = new THREE.BufferGeometry();
  { const w = 0.8, c = 0.09;
    shellLeaf.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -w / 2, c, 0.3, -w * 0.4, c, 0.68, 0, 0, 1, w * 0.4, c, 0.68, w / 2, c, 0.3], 3));
    shellLeaf.setAttribute('color', new THREE.Float32BufferAttribute([0.72, 0.74, 0.72, 0.92, 0.92, 0.9, 1, 1, 0.98, 1.05, 1.05, 1, 1, 1, 0.98, 0.92, 0.92, 0.9], 3));
    shellLeaf.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    shellLeaf.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    shellLeaf.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]); }
  const TONE = [[0.72, color(P.leafLit).lerp(color(P.leafMid), 0.3).multiplyScalar(0.85)], [0.58, color(P.leafMid).multiplyScalar(0.84)], [0.4, color(P.leafDeep).multiplyScalar(0.94)], [-9, color(P.leafShade)]];
  const tone = (x) => TONE.find(([min]) => x > min)[1];
  const leaves = [], swayLeaves = [];
  const shellMesh = (list, pivot, castShadow) => {
    const n = list.length, g = new THREE.BufferGeometry(), m = new M4(), T = new V3(), U = new V3(), Bn = new V3(), shell = new Float32Array(n * 3), one = new V3();
    for (const k of ['position', 'normal', 'uv', 'color']) g.setAttribute(k, shellLeaf.attributes[k]);
    g.setIndex(shellLeaf.index);
    const mesh = new THREE.InstancedMesh(g, shellMat, n);
    list.forEach((l, i) => {
      T.copy(l.tip); U.copy(l.shell).addScaledVector(T, -l.shell.dot(T)).normalize(); Bn.crossVectors(U, T).normalize();
      m.makeBasis(Bn, U, T).scale(one.set(l.s, l.s, l.s)); m.setPosition(l.p.x - pivot[0], l.p.y - pivot[1], l.p.z - pivot[2]);
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, l.tone); shell[i * 3] = l.shell.x; shell[i * 3 + 1] = l.shell.y; shell[i * 3 + 2] = l.shell.z;
    });
    g.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 3));
    mesh.position.set(...pivot); mesh.castShadow = castShadow; mesh.receiveShadow = false; mesh.frustumCulled = false;
    return ctx.softEdge(mesh);
  };
  /** Rounded leaf mass. c world point. y0 clips the bottom (bushes sit on the ground). */
  function clump(c, rx, ry, n, { s = 0.2, y0 = -1e3, shift = 0, list = leaves, droop = 0.35 } = {}) {
    const C0 = v(c);
    for (let i = 0; i < n; i++) {
      const th = rng() * 6.2832, y = rng.range(-0.5, 1), q = Math.sqrt(1 - y * y), rr = 0.74 + rng() * 0.28;
      const d = new V3(q * Math.cos(th), y, q * Math.sin(th)), p = new V3(C0.x + d.x * rx * rr, C0.y + d.y * ry * rr, C0.z + d.z * rx * rr);
      if (p.y < y0) continue;
      const shell = new V3(d.x / rx, d.y / ry, d.z / rx).normalize();
      const tip = shell.clone().multiplyScalar(0.55).add(new V3(rng.range(-0.7, 0.7), rng.range(-0.7, 0.7) - droop, rng.range(-0.7, 0.7))).normalize();
      list.push({ p, shell, tip, s: s * rng.range(0.8, 1.2), tone: tone(0.48 + shell.dot(SUN) * 0.34 + y * 0.12 + rng.range(-0.06, 0.06) + shift) });
    }
  }
  /** Ivy held flat to a wall: o corner, U along, Vv up, N out. Density falls off toward a wandering top edge. */
  function ivy(o, U, Vv, N, w, h, n, { s = 0.15, shift = 0, keep = null } = {}) {
    const O = v(o), Uu = v(U), Vu = v(Vv), Nn = v(N), ph = rng() * 6;
    for (let i = 0; i < n; i++) {
      const a = rng(), top = h * (0.55 + 0.3 * Math.sin(a * 7 + ph) + 0.15 * Math.sin(a * 17 + ph * 2)), b = Math.pow(rng(), 1.5) * top;
      const p = O.clone().addScaledVector(Uu, a * w).addScaledVector(Vu, b).addScaledVector(Nn, 0.03 + rng() * 0.09);
      const shell = Nn.clone().add(new V3(rng.range(-0.2, 0.2), 0.3, rng.range(-0.2, 0.2))).normalize();
      const tip = new V3(rng.range(-0.8, 0.8), rng.range(-1, 0.1), rng.range(-0.8, 0.8)).addScaledVector(Nn, 0.3).normalize();
      const leaf = { p, shell, tip, s: s * rng.range(0.75, 1.2), tone: tone(0.5 + shell.dot(SUN) * 0.34 + rng.range(-0.1, 0.1) + shift) };
      if (!keep || keep(p)) leaves.push(leaf); // tested after the draws, so a filtered patch leaves the rng sequence alone
    }
  }
  const blades = [];
  const GRASSC = [color(P.grass), color(P.grassLit), color(P.moss), color(P.fern), color(P.mossLit)];
  function grass(x, z, r, n, { y = 0.04, h = 0.55, rz = r } = {}) {
    for (let i = 0; i < n; i++) { const a = rng() * 6.2832, q = Math.sqrt(rng()); blades.push({ x: x + Math.cos(a) * q * r, y, z: z + Math.sin(a) * q * rz, h: h * rng.range(0.55, 1.25), yaw: rng() * 6.2832, c: rng.pick(GRASSC) }); }
  }
  const FERN = kit.frond(0.8, 6, 0.24);
  const fern = (x, y, z, s = 1, n = 6, col = P.fern) => { for (let i = 0; i < n; i++) softS.add(FERN, softMat, { pos: [x, y, z], rot: [rng.range(-0.15, 0.1), (i / n) * 6.28 + rng() * 0.6, 0], scale: s * rng.range(0.75, 1.15), color: rng() < 0.4 ? P.leafLit : col }); };
  const blooms = (x, y, z, r, n, cols, fr = 0.1) => { for (let i = 0; i < n; i++) { const a = rng() * 6.28, q = Math.sqrt(rng()) * r; softS.add(kit.flower(fr * rng.range(0.8, 1.3), 5), softMat, { pos: [x + Math.cos(a) * q, y + rng() * r * 0.4, z + Math.sin(a) * q], rot: [rng.range(-0.3, 0.3), rng() * 6, rng.range(-0.3, 0.3)], color: rng.pick(cols) }); } };
  const mossPad = (x, y, z, rx, rz, col = P.moss) => W.add(kit.chip(kit.sphere(1, 10, 6), 0.1, rng), 'flat', { pos: [x, y, z], scale: [rx, Math.min(rx, rz) * 0.32, rz], color: col });
  /** Vine: a wobbling tube along a path. */
  const vine = (pts, r0 = 0.03, r1 = 0.012, col = '#6a6a42') => W.add(kit.tube(pts, r0, r1, 5, Math.max(8, pts.length * 3)), 'flat', { color: col });

  /* ---- animated cloth: everything in one mesh, rest pose rewritten on the CPU ---- */
  const cl = { pos: [], nor: [], uv: [], col: [], idx: [], w: [], ph: [], sheets: [] };
  function cloth({ o, U, D, w, h, nx = 3, ny = 5, cell, u0 = 0, u1 = 1, v0 = 0, v1 = 1, amp = 0.1, tear = 0, N = null, tint = [1, 1, 1] }) {
    const O = v(o), Uu = v(U), Dd = v(D), Nn = N ? v(N) : Uu.clone().cross(Dd).normalize(), base = cl.pos.length / 3, [ax, ay, aw, ah] = atlas.cell(cell), ph = rng() * 6.28, S = 2048;
    const bottom = Array.from({ length: nx + 1 }, () => 1 - rng() * tear);
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const a = i / nx, b = (j / ny) * (j === ny ? bottom[i] : 1), p = O.clone().addScaledVector(Uu, a * w).addScaledVector(Dd, b * h);
      cl.pos.push(p.x, p.y, p.z); cl.nor.push(Nn.x, Nn.y, Nn.z); cl.col.push(...tint);
      cl.uv.push((ax + 1.5 + lerp(u0, u1, a) * (aw - 3)) / S, 1 - (ay + 1.5 + lerp(v0, v1, b) * (ah - 3)) / S);
      cl.w.push(Math.pow(j / ny, 1.25)); cl.ph.push(ph + j * 0.95 + i * 0.7);
    }
    const r = nx + 1; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = base + j * r + i, c = a + r; cl.idx.push(a, c, a + 1, a + 1, c, c + 1); }
    cl.sheets.push({ i0: base, i1: cl.pos.length / 3, x: O.x, z: O.z, nx: Nn.x, ny: Nn.y, nz: Nn.z, amp });
  }
  /** Row of noren strips hanging from a rod. */
  function noren(o, U, w, h, cell, strips = 4, N = null) {
    const O = v(o), Uu = v(U), gap = 0.015, sw = (w - gap * (strips - 1)) / strips;
    for (let i = 0; i < strips; i++) cloth({ o: O.clone().addScaledVector(Uu, i * (sw + gap)), U: Uu, D: [0, -1, 0], w: sw, h, nx: 2, ny: 5, cell, u0: i / strips, u1: (i + 1) / strips, amp: 0.1, tear: 0.2, N });
    W.rod(O.clone().addScaledVector(Uu, -0.08), O.clone().addScaledVector(Uu, w + 0.08), 0.022, WOOD, C.cedarDark, 6);
  }

  /* ---- small props ---- */
  function rubble(s, cx, cz, rx, rz, n, y = 0.05) {
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, q = Math.sqrt(rng()), x = cx + Math.cos(a) * q * rx, z = cz + Math.sin(a) * q * rz, k = rng(), yy = y + (1 - q) * 0.45 + rng() * 0.08;
      if (k < 0.42) { const l = rng.range(0.7, 1.9), th = rng() * 6.28, dx = Math.cos(th) * l / 2, dz = Math.sin(th) * l / 2, t = rng.range(0, 0.45); s.beam([x - dx, yy, z - dz], [x + dx, yy + t, z + dz], rng.range(0.07, 0.16), rng.range(0.04, 0.1), WOOD, rng.pick([C.cedar, C.silver, C.cedarDark, C.beam])); }
      else if (k < 0.74) s.add(kit.chip(kit.box(rng.range(0.25, 0.6), rng.range(0.1, 0.22), rng.range(0.2, 0.5), 2, 1, 2), 0.05, rng), 'plaster', { pos: [x, yy, z], rot: [rng.range(-0.4, 0.4), rng() * 6, rng.range(-0.4, 0.4)], color: rng.pick([C.plasterWarm, C.plasterCool, '#c9bfa8']) });
      else s.add(kit.box(0.34, 0.035, 0.3), 'flat', { pos: [x, yy, z], rot: [rng.range(-0.6, 0.6), rng() * 6, rng.range(-0.6, 0.6)], color: rng.pick(['#7a8e9c', '#6b808f', '#8c9ea8']) });
    }
  }
  function crateWood(s, w = 0.62, h = 0.42, d = 0.44, col = C.cedar) {
    for (const y of [0.04, h * 0.36, h * 0.68]) for (const zz of [-d / 2, d / 2]) s.box(-w / 2, w / 2, y, y + h * 0.24, zz - 0.012, zz + 0.012, WOOD, col);
    for (const y of [0.04, h * 0.36, h * 0.68]) for (const xx of [-w / 2, w / 2]) s.box(xx - 0.012, xx + 0.012, y, y + h * 0.24, -d / 2, d / 2, WOOD, col);
    for (const xx of [-1, 1]) for (const zz of [-1, 1]) s.box(xx * w / 2 - 0.03, xx * w / 2 + 0.03, 0, h, zz * d / 2 - 0.03, zz * d / 2 + 0.03, WOOD, C.frame);
    s.box(-w / 2, w / 2, 0.02, 0.05, -d / 2, d / 2, WOOD, C.cedarDark);
  }
  function crateMilk(s, col = '#c9b45a') {
    const w = 0.56, d = 0.38, h = 0.3;
    s.box(-w / 2, w / 2, 0, 0.03, -d / 2, d / 2, 'flat', col);
    for (const y of [0.03, 0.17]) { s.box(-w / 2, w / 2, y, y + 0.08, -d / 2, -d / 2 + 0.025, 'flat', col); s.box(-w / 2, w / 2, y, y + 0.08, d / 2 - 0.025, d / 2, 'flat', col); s.box(-w / 2, -w / 2 + 0.025, y, y + 0.08, -d / 2, d / 2, 'flat', col); s.box(w / 2 - 0.025, w / 2, y, y + 0.08, -d / 2, d / 2, 'flat', col); }
    for (const xx of [-1, 1]) for (const zz of [-1, 1]) s.box(xx * w / 2 - 0.02, xx * w / 2 + 0.02, 0, h, zz * d / 2 - 0.02, zz * d / 2 + 0.02, 'flat', col);
    s.box(-w / 2 + 0.02, w / 2 - 0.02, h - 0.06, h, -d / 2 - 0.004, -d / 2 + 0.02, 'flat', col); s.box(-w / 2 + 0.02, w / 2 - 0.02, h - 0.06, h, d / 2 - 0.02, d / 2 + 0.004, 'flat', col);
    s.add(atlas.quad(0.3, 0.09, 'milk'), atlasMat, { pos: [0, 0.15, d / 2 + 0.003] });
  }
  function drum(s, r = 0.29, h = 0.86, col = '#8fa79a') {
    s.add(kit.cylBase(r, r, h, 14), worn, { color: col });
    for (const y of [h * 0.33, h * 0.66, 0.02, h - 0.02]) s.add(kit.cyl(r + 0.012, r + 0.012, 0.03, 14, true), worn, { pos: [0, y, 0], color: '#6f7a7e' });
  }
  function pot(s, r = 0.2, h = 0.28, col = '#b0694a') {
    s.add(kit.cylBase(r, r * 0.72, h, 10), 'flat', { color: col }); s.add(kit.cyl(r + 0.02, r + 0.02, 0.05, 10), 'flat', { pos: [0, h, 0], color: col }); s.add(kit.cyl(r - 0.02, r - 0.02, 0.01, 10), 'flat', { pos: [0, h - 0.02, 0], color: P.soilDark });
  }
  const wildPot = (x, y, z, r, h, cr, cry, n, col) => { pot(W.sub({ pos: [x, y, z] }), r, h, col); clump([x, y + h + cry * 0.75, z], cr, cry, n, { s: 0.17, y0: y + h - 0.05 }); };
  function corr(w, l, n = 6) { const g = new THREE.PlaneGeometry(w, l, n * 4, 1); g.rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, 0.03 * Math.sin((p.getX(i) / w) * n * Math.PI * 2)); g.computeVertexNormals(); return g; }

  function fence(a, bb, { h = 1.7, board = 0.16, col = C.silver, missing = 0.06, lean = 0.02, posts = 1.9 } = {}) {
    const dx = bb[0] - a[0], dz = bb[1] - a[1], len = Math.hypot(dx, dz), s = W.sub({ pos: [a[0], 0, a[1]], rot: [0, -Math.atan2(dz, dx), 0] });
    const n = Math.floor(len / (board + 0.02));
    for (const y of [h * 0.26, h * 0.8]) s.box(0, len, y - 0.035, y + 0.035, -0.03, 0.03, WOOD, C.cedarDark);
    for (let x = 0; x <= len + 0.01; x += posts) s.box(x - 0.05, x + 0.05, 0, h + 0.1, -0.09, -0.03, WOOD, C.beam);
    for (let i = 0; i < n; i++) {
      if (rng() < missing) continue;
      const x = (i + 0.5) * (len / n), hh = h * rng.range(0.94, 1.03) - (rng() < 0.07 ? rng.range(0.2, 0.6) : 0);
      s.add(kit.boxBase(board, hh, 0.025), WOOD, { pos: [x, 0.03, 0.04], rot: [0, 0, rng.range(-lean, lean)], color: rng() < 0.3 ? '#c4b8a4' : col });
    }
    return s;
  }
  /** Concrete block wall along a→b. broken(t)→0..1 fraction of courses left. breach[r] = [from,to] along the wall: blocks burst out of course r, footing cut at breach[0]. */
  function blockWall(a, bb, { courses = 5, broken = () => 1, gaps = [], t = 0.16, breach = null } = {}) {
    const dx = bb[0] - a[0], dz = bb[1] - a[1], len = Math.hypot(dx, dz), s = W.sub({ pos: [a[0], 0, a[1]], rot: [0, -Math.atan2(dz, dx), 0] }), bl = 0.5, bh = 0.24;
    for (const [f0, f1] of breach ? [[-0.02, breach[0][0]], [breach[0][1], len + 0.02]] : [[-0.02, len + 0.02]]) s.box(f0, f1, 0, 0.1, -t, t, 'concrete', C.footing);
    for (let r = 0; r < courses; r++) for (let i = -1; i * bl < len; i++) {
      const x0 = Math.max(0, i * bl + (r % 2) * bl / 2), x1 = Math.min(len, x0 + bl - 0.018), xc = (x0 + x1) / 2, u = xc / len;
      if (x1 - x0 < 0.08 || gaps.some(([p, q]) => xc > p && xc < q)) continue;
      const lim = broken(u) * courses + 0.5 * Math.sin(u * 37);
      if (r >= lim) continue;
      const m = rng.range(0.92, 1.05), top = r === courses - 1, col = new THREE.Color(top ? '#d6d2c4' : '#c3c1b4').multiplyScalar(m);
      if (breach && xc > breach[r][0] && xc < breach[r][1]) continue; // after the draw: a breach must not reshuffle what follows
      s.box(x0, x1, 0.1 + r * bh, 0.1 + r * bh + bh - 0.016, -t / 2 - (top ? 0.03 : 0), t / 2 + (top ? 0.03 : 0), 'concrete', col);
    }
    return s;
  }
  function tank(s, r = 0.56, h = 1.25, legs = 0.8) {
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) s.beam([x * r * 0.9, 0, z * r * 0.9], [x * r * 0.62, legs, z * r * 0.62], 0.07, 0.07, worn, '#5e5a54');
    s.beam([-r * 0.8, legs * 0.45, -r * 0.8], [r * 0.8, legs * 0.45, r * 0.8], 0.04, 0.04, worn, '#5e5a54'); s.beam([r * 0.8, legs * 0.45, -r * 0.8], [-r * 0.8, legs * 0.45, r * 0.8], 0.04, 0.04, worn, '#5e5a54');
    s.box(-r * 0.8, r * 0.8, legs - 0.05, legs + 0.02, -r * 0.8, r * 0.8, worn, '#6a6054');
    s.add(kit.cylBase(r, r, h, 18), worn, { pos: [0, legs, 0], color: '#a39a84' });
    s.add(new THREE.SphereGeometry(r, 18, 5, 0, 6.2832, 0, 1.0).scale(1, 0.42, 1), worn, { pos: [0, legs + h, 0], color: '#a39a84' });
    for (const y of [legs + h * 0.32, legs + h * 0.66]) s.add(kit.cyl(r + 0.015, r + 0.015, 0.035, 18, true), worn, { pos: [0, y, 0], color: '#6a5a50' });
    s.add(kit.cylBase(0.13, 0.13, 0.08, 10), worn, { pos: [0, legs + h + 0.2, 0], color: '#6a6054' });
    s.rod([r, legs + 0.16, 0], [r + 0.16, legs + 0.16, 0], 0.03, worn, '#6a5a50'); s.rod([r + 0.16, legs + 0.16, 0], [r + 0.16, 0.05, 0.1], 0.03, worn, '#6a5a50');
  }

  /** Kei truck. Local: width ±0.7 on x, nose at +z, body rests on flat tyres. */
  function keiTruck(s0) {
    const s = s0.sub({ pos: [0, -0.05, 0], rot: [0.02, 0, -0.025] }), BODY = '#dfe8da', TRIM = '#b9c4bc';
    for (const [x, z, sq] of [[-0.64, 1.12, 0.86], [0.64, 1.12, 0.92], [-0.64, -1.0, 0.8], [0.64, -1.0, 0.9]]) {
      const w = s.sub({ pos: [x, 0.27 * sq, z], rot: [0, 0, Math.PI / 2], scale: [sq, 1, 1] });
      w.add(kit.cyl(0.28, 0.28, 0.17, 16), 'flat', { color: '#4c5158' }); w.add(kit.cyl(0.16, 0.16, 0.18, 12), worn, { color: '#a8b4b4' }); w.add(kit.cyl(0.05, 0.05, 0.19, 8), worn, { color: '#6f7a7e' });
    }
    s.box(-0.6, 0.6, 0.3, 0.44, -1.72, 1.66, worn, '#5a5650');            // frame
    // cab: lower tub + pillars + roof, so the windscreen is a real opening
    const side = (o, h = []) => kit.wallPanel(o, h, 1.42).rotateY(-Math.PI / 2);
    s.add(side([[0.52, 0.42], [1.72, 0.42], [1.74, 0.98], [1.58, 1.14], [0.52, 1.14]], []), worn, { color: BODY });
    s.box(-0.712, -0.706, 0.5, 1.1, 0.74, 1.46, 'flat', '#dfe8da'); s.box(0.706, 0.712, 0.5, 1.1, 0.74, 1.46, 'flat', '#dfe8da');
    for (const xs of [-1, 1]) {
      s.add(atlas.quad(0.66, 0.25, 'truckDoor'), atlasMat, { pos: [xs * 0.72, 0.84, 1.1], rot: [0, xs * Math.PI / 2, 0] });
      s.beam([xs * 0.68, 1.14, 1.6], [xs * 0.6, 1.92, 1.32], 0.07, 0.07, worn, BODY);                 // A pillar
      s.beam([xs * 0.68, 1.14, 0.56], [xs * 0.62, 1.92, 0.56], 0.08, 0.1, worn, BODY);                // B pillar
      s.box(xs * 0.72 - 0.02, xs * 0.72 + 0.02, 0.56, 0.6, 1.1, 1.3, 'flat', TRIM);                    // door handle strip
      s.box(xs * 0.74 - 0.03, xs * 0.74 + 0.03, 1.2, 1.36, 1.5, 1.58, 'flat', '#4e5a5e'); s.rod([xs * 0.68, 1.14, 1.5], [xs * 0.76, 1.28, 1.54], 0.012, worn, '#6f7a7e', 4); // mirror
    }
    s.add(kit.chip(kit.box(1.32, 0.07, 1.14, 3, 1, 3), 0.008, rng), worn, { pos: [0, 1.95, 0.92], rot: [0.02, 0, 0], color: BODY });
    s.box(-0.67, 0.67, 1.14, 1.92, 0.5, 0.56, worn, BODY);                                                 // cab back
    new Stage({ b: glassB, kit }, s.m).add(kit.box(0.72, 0.3, 0.012), glassMat, { pos: [0.28, 1.34, 1.5], rot: [-0.34, 0, 0.32] });     // what's left of the windscreen
    // cab interior: bench, wheel, moss on the dash
    s.box(-0.56, 0.56, 0.5, 0.86, 0.62, 1.0, 'flat', '#7a5a4e'); s.box(-0.56, 0.56, 0.86, 1.3, 0.56, 0.68, 'flat', '#7a5a4e');
    s.box(-0.62, 0.62, 1.1, 1.18, 1.3, 1.58, 'flat', '#6a6a60'); s.add(kit.torus(0.14, 0.014, 5, 16), 'flat', { pos: [0.3, 1.24, 1.26], rot: [0.9, 0, 0], color: '#3c4044' }); s.rod([0.3, 1.1, 1.4], [0.3, 1.2, 1.3], 0.016, 'flat', '#3c4044', 5);
    // nose: lights, grille, bumper, plate
    for (const xs of [-1, 1]) { s.add(kit.cyl(0.09, 0.09, 0.03, 12), 'flat', { pos: [xs * 0.5, 0.82, 1.74], rot: [Math.PI / 2, 0, 0], color: '#e4eee6' }); s.add(kit.torus(0.09, 0.012, 4, 14), worn, { pos: [xs * 0.5, 0.82, 1.752], color: '#a8b4b4' }); s.box(xs * 0.5 - 0.07, xs * 0.5 + 0.07, 0.68, 0.72, 1.725, 1.75, 'flat', '#dd9a4e'); }
    for (let i = 0; i < 5; i++) s.box(-0.3, 0.3, 0.68 + i * 0.05, 0.7 + i * 0.05, 1.725, 1.75, 'flat', '#8a948e');
    s.box(-0.72, 0.72, 0.42, 0.54, 1.72, 1.84, worn, '#6f7a7e'); s.add(atlas.quad(0.3, 0.15, 'plate'), atlasMat, { pos: [0, 0.48, 1.85] });
    s.box(-0.71, 0.71, 0.98, 1.0, 1.7, 1.72, 'flat', TRIM);
    s.rod([-0.3, 1.16, 1.62], [-0.04, 1.22, 1.56], 0.008, 'flat', '#3c4044', 4);
    // bed: floor, head-board frame, side gates (one dropped)
    s.box(-0.72, 0.72, 0.46, 0.54, -1.72, 0.46, worn, '#94a099');
    s.box(-0.72, 0.72, 0.54, 1.5, 0.42, 0.48, worn, '#94a099'); for (const x of [-0.5, -0.17, 0.17, 0.5]) s.box(x - 0.018, x + 0.018, 1.5, 2.0, 0.44, 0.47, worn, '#6f7a7e'); s.box(-0.7, 0.7, 2.0, 2.04, 0.42, 0.49, worn, '#6f7a7e');
    s.box(-0.72, -0.68, 0.54, 0.86, -1.72, 0.42, worn, BODY); s.box(-0.72, 0.72, 0.54, 0.86, -1.74, -1.7, worn, BODY); for (let i = 0; i < 4; i++) s.box(-0.735, -0.72, 0.56, 0.84, -1.5 + i * 0.6, -1.46 + i * 0.6, 'flat', TRIM);
    s.add(kit.box(0.03, 0.32, 2.12), worn, { pos: [0.89, 0.42, -0.65], rot: [0, 0, 1.2], color: BODY });
    // gone to soil in the bed
    s.add(kit.chip(kit.box(1.3, 0.26, 1.96, 6, 1, 8), 0.05, rng), 'soil', { pos: [0, 0.66, -0.64], color: '#7f6650' });
    crateWood(s.sub({ pos: [-0.26, 0.76, -0.1], rot: [0, 0.2, 0] }), 0.56, 0.38, 0.42, C.silver); crateMilk(s.sub({ pos: [0.3, 0.76, -1.2], rot: [0, -0.4, 0] }), '#6f9fb0');
    const p = s.w([0.1, 0.8, -0.84]), q = s.w([-0.3, 0.8, -1.2]), r = s.w([0.34, 0.8, 0.1]);
    clump([p.x, p.y + 0.28, p.z], 0.56, 0.5, 130, { s: 0.17, y0: p.y - 0.02 }); clump([q.x, q.y + 0.24, q.z], 0.36, 0.4, 70, { s: 0.16, y0: q.y - 0.02 }); grass(r.x, r.z, 0.36, 40, { y: r.y, h: 0.6 }); grass(q.x, q.z, 0.5, 50, { y: q.y, h: 0.5 });
    const f = s.w([0.46, 1.2, -1.0]); blooms(f.x, f.y, f.z, 0.34, 10, [P.flowerYellow, P.flowerWhite]);
    const k = s.w([0, 1.2, 1.0]); fern(k.x, k.y, k.z, 0.5, 5);
  }

  /* ================================================================== the row: filling in ========================== */
  // ---- tofu shop interior and street edge
  {
    const x0 = HX[0], x1 = HX[1], m = x0 + 1.46;
    W.box(x0 + 0.16, x1 - 0.1, FL, 2.4, -2.94, -2.9, 'tile', '#ffffff');
    W.box(x0 + 0.2, x0 + 1.5, FL, 0.84, -2.86, -1.9, 'concrete', '#d8dcd6'); W.box(x0 + 0.26, x0 + 1.44, 0.84, 0.86, -2.8, -1.96, 'flat', '#7fd0c6');
    W.box(x0 + 0.2, x1 - 0.2, 1.5, 1.54, -2.9, -2.6, WOOD, C.frame); W.add(atlas.quad(1.8, 0.24, 'labels'), atlasMat, { pos: [(x0 + x1) / 2, 1.68, -2.72] });
    W.box(x1 - 0.8, x1 - 0.22, FL, 0.8, -1.6, -1.0, worn, '#b9bfb2');
    noren([m + 0.08, 2.42, ZF + 0.14], [1, 0, 0], 1.14, 0.72, 'norenTofu', 4, [0, 0, 1]);
    W.add(kit.boxBase(0.5, 0.06, 0.34), 'concrete', { pos: [m + 0.62, 0.1, ZF + 0.4], color: C.footing });
    // wild pots and a bench on the sidewalk
    wildPot(x0 + 0.34, 0.13, 0.86, 0.22, 0.3, 0.46, 0.5, 90);
    wildPot(x0 + 0.8, 0.13, 0.76, 0.16, 0.22, 0.28, 0.36, 40, '#a85f46');
    wildPot(x0 + 1.14, 0.13, 0.92, 0.2, 0.3, 0.36, 0.72, 90, '#8d7a64');
    const bench = W.sub({ pos: [x1 - 1.4, 0.13, 0.86] });
    bench.box(0, 1.1, 0.34, 0.38, -0.16, 0.16, WOOD, C.silver); for (const x of [0.1, 1.0]) bench.box(x - 0.03, x + 0.03, 0, 0.34, -0.14, 0.14, WOOD, C.frame);
    crateMilk(W.sub({ pos: [x1 - 1.1, 0.51, 0.86], rot: [0, 0.2, 0] }));
    // upper room glimpsed through the bars: curtain, shelf
    W.box(x0 + 0.1, x1 - 0.06, F2, 4.7, -3.02, -2.94, 'plaster', '#9c7f5c');
    W.add(atlas.quad(0.8, 1.6, 'curtain'), atlasMat, { pos: [x0 + 0.86, 3.68, -2.92] });
  }
  // the loose upper shutter is its own little mesh, see below; the closed one is static
  { const s = W.sub({ pos: [HX[0] + 0.52, 0, ZF + 0.1], rot: [0, -0.28, 0] }); lattice(s, 0, 0.84, 3.8, 4.44, 0, { n: 7, rails: 1, slat: C.silver }); }

  // ---- barber: front gone. Tatami room above, barber's parlour below, the rest of it spilled on the pavement
  {
    const x0 = HX[1] + 0.09, x1 = HX[2] - 0.09, xm = (x0 + x1) / 2;
    // torn floor plate with joists
    const edge = [[x0, -3.0], [x1, -3.0], [x1, -0.42], [x1 - 0.34, -0.06], [x1 - 0.72, -0.5], [x1 - 1.08, -0.16], [x1 - 1.46, -0.62], [x1 - 1.86, -0.34], [x0 + 0.22, -0.78], [x0, -0.5]];
    W.add(kit.plate(edge, [], F2, 0.14), WOOD, { color: C.cedarDark });
    for (let i = 0; i < 6; i++) { const x = lerp(x0 + 0.1, x1 - 0.1, i / 5), e = -0.1 - Math.abs(Math.sin(i * 2.3)) * 0.5, dr = i % 2 ? 0.24 : 0.06; W.beam([x, F2 - 0.2, -3], [x, F2 - 0.2 - dr, e + 0.26], 0.09, 0.12, WOOD, C.beam); }
    W.beam([x0 + 0.1, F2 - 0.2, -0.9], [x1 - 0.1, F2 - 0.34, -0.72], 0.1, 0.14, WOOD, C.beam);
    // tatami
    const mat = (cx, cz, along, m = 1) => W.add(atlas.quad(1.64, 0.8, 'tatami'), atlasMat, { pos: [cx, F2 + 0.012, cz], rot: [-Math.PI / 2, along ? Math.PI / 2 : 0, 0], color: new THREE.Color('#ffffff').multiplyScalar(m) });
    mat(x0 + 0.42, -2.16, true); mat(x0 + 1.22, -2.16, true, 0.96); mat(x0 + 2.02, -2.16, true, 1.02); mat(x0 + 0.84, -0.94, false, 0.92); mat(x0 + 1.88, -1.0, false, 1);
    W.box(x0, x1, F2 + 0.005, F2 + 0.01, -3.0, -0.8, 'flat', '#8f8a58');
    // sliding screens on the back wall, alcove with scroll
    const Z = -2.92, hd = 4.46;
    for (const [a, c] of [[x0 + 0.06, x0 + 0.7], [x0 + 0.66, x0 + 1.3]]) { W.add(atlas.quad(c - a - 0.06, hd - F2 - 0.06, 'fusuma'), atlasMat, { pos: [(a + c) / 2, (F2 + hd) / 2, Z + (a < x0 + 0.5 ? 0.012 : 0.04)] }); for (const [p, q, r, u] of [[a, a + 0.03, F2, hd], [c - 0.03, c, F2, hd], [a, c, hd - 0.03, hd], [a, c, F2, F2 + 0.03]]) W.box(p, q, r, u, Z, Z + 0.06, WOOD, C.cedarDark); }
    W.box(x0, x1, hd, hd + 0.08, Z - 0.02, Z + 0.06, WOOD, C.beam);
    W.box(x0 + 1.33, x0 + 1.42, F2, hd, Z - 0.01, Z + 0.08, WOOD, C.cedarDark);
    W.box(x0 + 1.42, x1, F2, F2 + 0.12, Z - 0.01, Z + 0.3, WOOD, C.frame);
    W.add(atlas.quad(0.36, 0.96, 'scroll'), atlasMat, { pos: [x0 + 1.96, 3.62, Z + 0.015], rot: [0, 0, 0.02] });
    pot(W.sub({ pos: [x0 + 1.68, F2 + 0.12, Z + 0.16] }), 0.09, 0.2, '#6f8a9c');
    clump([x0 + 1.68, F2 + 0.42, Z + 0.16], 0.16, 0.2, 18, { s: 0.09 });
    W.add(atlas.quad(0.22, 0.3, 'calendar'), atlasMat, { pos: [x1 - 0.006 - 0.02, 3.5, -1.6], rot: [0, -Math.PI / 2, 0.08] });
    // side-wall timber lines and a split panel of lath
    for (const x of [x0 + 0.02, x1 - 0.02]) { W.box(x - 0.03, x + 0.03, F2, 4.74, -0.95, -0.82, WOOD, C.beam); W.box(x - 0.03, x + 0.03, hd, hd + 0.08, -3, -0.5, WOOD, C.beam); }
    for (let i = 0; i < 6; i++) W.box(x0 - 0.0, x0 + 0.03, 3.3 + i * 0.1, 3.34 + i * 0.1, -0.86 - i * 0.04, -0.2 - i * 0.08, WOOD, C.cedar);
    // low round table, tea things, cushions
    const t = W.sub({ pos: [xm + 0.06, F2 + 0.01, -1.72] });
    t.add(kit.cyl(0.46, 0.46, 0.035, 22), WOOD, { pos: [0, 0.3, 0], color: '#b8875e' }); t.add(kit.cyl(0.42, 0.44, 0.03, 22), WOOD, { pos: [0, 0.27, 0], color: C.frame });
    for (const a of [0.5, 2.1, 3.7, 5.3]) t.add(kit.cylBase(0.025, 0.022, 0.27, 6), WOOD, { pos: [Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32], color: C.beam });
    t.add(new THREE.SphereGeometry(0.09, 10, 7).scale(1, 0.8, 1), 'flat', { pos: [-0.08, 0.385, 0.06], color: '#4f7e78' }); t.add(kit.cyl(0.05, 0.055, 0.03, 8), 'flat', { pos: [-0.08, 0.46, 0.06], color: '#3f6a66' }); t.rod([-0.01, 0.39, 0.06], [0.07, 0.43, 0.06], 0.012, 'flat', '#4f7e78', 5); t.add(kit.torus(0.05, 0.008, 4, 10, 3.14), 'flat', { pos: [-0.08, 0.47, 0.06], color: '#6a5a50' });
    for (const [x, z] of [[0.18, -0.12], [0.08, 0.24]]) t.add(kit.cylBase(0.032, 0.026, 0.07, 8), 'flat', { pos: [x, 0.317, z], color: '#ece6d4' });
    t.add(kit.cylBase(0.09, 0.05, 0.04, 10), 'flat', { pos: [-0.2, 0.317, -0.16], color: '#ece6d4' });
    for (const [x, z, a, c] of [[-0.7, 0.04, 0.3, '#b5574a'], [0.64, 0.2, -0.2, '#b5574a'], [0.08, 0.72, 1.1, '#5f7f8f']]) t.add(kit.chip(kit.box(0.5, 0.08, 0.5, 3, 1, 3), 0.018, rng), 'flat', { pos: [x, 0.05, z], rot: [0, a, 0], color: c });
    // chest, radio, books
    const tansu = W.sub({ pos: [x1 - 0.3, F2 + 0.01, -2.32] });
    tansu.box(-0.25, 0.25, 0, 1.28, -0.5, 0.5, WOOD, '#9a6a44');
    for (let i = 0; i < 4; i++) { tansu.box(-0.27, -0.25, 0.08 + i * 0.3, 0.34 + i * 0.3, -0.45, 0.45, WOOD, '#b5824f'); for (const z of [-0.2, 0.2]) tansu.add(kit.torus(0.035, 0.008, 4, 10, 3.14), worn, { pos: [-0.285, 0.18 + i * 0.3, z], rot: [0, Math.PI / 2, 3.14], color: '#6f7a7e' }); }
    tansu.box(-0.24, 0.2, 1.28, 1.5, -0.2, 0.14, WOOD, C.cedarDark); tansu.add(kit.cyl(0.06, 0.06, 0.02, 12), 'flat', { pos: [-0.25, 1.39, -0.1], rot: [0, 0, Math.PI / 2], color: '#d9cfae' });
    W.box(x0 + 0.26, x0 + 0.6, F2 + 0.01, F2 + 0.09, -1.15, -0.9, 'flat', '#b5574a'); W.box(x0 + 0.3, x0 + 0.62, F2 + 0.09, F2 + 0.16, -1.14, -0.92, 'flat', '#6f9fb0'); W.box(x0 + 0.28, x0 + 0.56, F2 + 0.16, F2 + 0.2, -1.12, -0.92, 'flat', '#e0c25a');
    // ceiling boards, torn, and the pendant lamp still on its cord
    const cy = 4.76;
    for (let i = 0; i < 12; i++) { const x = lerp(x0, x1, (i + 0.5) / 12), l = -1.5 - Math.abs(Math.sin(i * 1.9)) * 0.9 - (i > 6 && i < 11 ? 0.4 : 0); W.box(x - 0.1, x + 0.1, cy, cy + 0.02, -3, l, WOOD, C.cedar); }
    W.beam([x0, cy + 0.06, -1.7], [x1, cy + 0.04, -1.7], 0.08, 0.1, WOOD, C.beam);
    W.rod([xm - 0.1, cy, -1.7], [xm - 0.06, 3.96, -1.68], 0.008, 'flat', '#3e3a36', 4);
    W.add(new THREE.ConeGeometry(0.26, 0.15, 14, 1, true), worn, { pos: [xm - 0.06, 3.92, -1.68], rot: [0.06, 0, 0.1], color: '#dfe3cf' }); W.add(kit.sphere(0.05, 8, 6), 'flat', { pos: [xm - 0.06, 3.86, -1.68], color: '#f3ecd0' });
    // the quilt sliding over the torn edge, a rag of curtain on the side post
    cloth({ o: [x0 + 1.26, F2 + 0.05, -0.74], U: [1, 0, 0], D: [0, -0.1, 0.99], w: 0.74, h: 0.56, nx: 4, ny: 2, cell: 'futon', v1: 0.38, amp: 0.006 });
    cloth({ o: [x0 + 1.26, F2 - 0.01, -0.18], U: [1, 0, 0], D: [0, -1, 0.04], w: 0.74, h: 0.9, nx: 4, ny: 6, cell: 'futon', v0: 0.38, amp: 0.08, tear: 0.14, N: [0, 0, 1] });
    cloth({ o: [x1 - 0.1, 4.68, 0.0], U: [-1, 0, 0], D: [0, -1, 0], w: 0.5, h: 1.3, nx: 3, ny: 7, cell: 'curtain', amp: 0.16, tear: 0.35, N: [0, 0, 1] });
    W.rod([x1 - 0.72, 4.7, 0], [x1 + 0.04, 4.72, 0], 0.016, 'flat', '#8d8a7c');
    // surviving front corner: one post, a hanging lintel, a stub of upper wall
    W.box(x1 - 0.1, x1 + 0.04, FL, 4.8, ZF - 0.07, ZF + 0.07, WOOD, C.beam);
    W.beam([x1 + 0.02, 2.56, ZF], [x1 - 1.3, 1.62, ZF + 0.22], 0.09, 0.14, WOOD, C.beam, 0.2);
    wallX(W, ZF - 0.03, [[x1 - 0.1, 3.5], [x1 - 0.1, 4.72], [x1 - 0.42, 4.64], [x1 - 0.3, 4.2], [x1 - 0.36, 3.86]], [], 0.1, 'plaster', C.plasterWarm);
    // ground floor: mirror wall, chair, sink
    W.box(x0 + 1.05, x1, 1.0, 2.1, -2.93, -2.9, 'flat', '#bfe0dd'); W.box(x0 + 1.0, x1 + 0.02, 0.92, 1.0, -2.93, -2.72, 'tile', '#ffffff');
    W.add(new THREE.PlaneGeometry(0.55, 1.1).translate(0, 0, 0), 'flat', { pos: [x0 + 1.5, 1.55, -2.885], rot: [0, 0, 0.16], color: '#e4f4ee' });
    const chair = W.sub({ pos: [xm + 0.34, FL, -2.0], rot: [0, 0.3, 0] });
    chair.add(kit.cylBase(0.26, 0.3, 0.06, 12), worn, { color: '#b9bfb2' }); chair.add(kit.cylBase(0.07, 0.09, 0.34, 8), worn, { pos: [0, 0.06, 0], color: '#b9bfb2' });
    chair.box(-0.26, 0.26, 0.4, 0.56, -0.26, 0.26, 'flat', '#a84a44'); chair.beam([0, 0.52, -0.24], [0, 1.2, -0.42], 0.46, 0.14, 'flat', '#a84a44'); chair.box(-0.09, 0.09, 1.2, 1.36, -0.5, -0.38, 'flat', '#a84a44');
    for (const x of [-0.31, 0.31]) { chair.box(x - 0.04, x + 0.04, 0.72, 0.77, -0.26, 0.28, 'flat', '#b9bfb2'); chair.rod([x, 0.5, 0.1], [x, 0.72, 0.1], 0.016, worn, '#b9bfb2'); }
    chair.box(-0.2, 0.2, 0.12, 0.17, 0.3, 0.54, worn, '#b9bfb2'); chair.rod([0, 0.42, 0.26], [0, 0.17, 0.4], 0.02, worn, '#b9bfb2');
    // fallen pent roof, leaning on its own wreckage
    const fr = slope([x0 + 0.02, 1.56, 0.1], [x0 + 1.3, 1.84, -0.12], [x0 + 0.04, 0.2, 1.38], [x0 + 1.46, 0.24, 1.52], { dish: 0.1, sagE: 0.04, sagR: 0.05 });
    const hf = [[0.72, 0.42, 0.2, 0.22]];
    roof.tiles(fr, { lenU: 1.4, lenV: 1.95, holes: hf, scatter: 0.1, tint: TINT_ROW, rand, slip: 0.08 }); roof.boards(fr, { nu: 6, nv: 8, holes: hf, color: C.boards, rand, k: 0.6 });
    rafters(fr, { n: 3, seg: 3, drop: 0.11 });
    // rubble bank
    W.add(kit.chip(kit.sphere(1, 14, 7), 0.12, rng), 'soil', { pos: [xm + 0.1, 0.12, 0.42], scale: [1.5, 0.62, 1.06], color: '#a89a84' });
    rubble(W, xm + 0.12, 0.48, 1.34, 1.05, 74, 0.2);
    W.beam([x0 + 0.5, 0.4, -0.5], [x1 - 0.2, 1.3, 1.1], 0.14, 0.16, WOOD, C.beam);
    // the shop board and pole lie where they landed
    W.add(atlas.quad(1.9, 0.48, 'barber'), atlasMat, { pos: [xm + 0.62, 0.72, 1.3], rot: [-0.86, 0.24, 0.1] });
    { const s = W.sub({ pos: [HX[2] + 0.06, 0.12, 1.2], rot: [0.26, 0, 0.3] }); const g = kit.cylBase(0.09, 0.09, 1.1, 14), u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i), u.getY(i)); s.add(atlas.uvTo(g, 'pole'), atlasMat); s.add(kit.sphere(0.1, 10, 7), 'flat', { pos: [0, 1.14, 0], color: '#ece6d4' }); s.add(kit.cylBase(0.12, 0.12, 0.05, 12), worn, { color: '#b9bfb2' }); s.add(kit.cylBase(0.12, 0.12, 0.05, 12), worn, { pos: [0, 1.08, 0], color: '#b9bfb2' }); }
    // what grew in afterwards
    grass(xm + 0.3, 1.0, 1.2, 150, { y: 0.14, h: 0.5, rz: 0.7 }); grass(xm - 0.2, 0.2, 0.9, 80, { y: 0.5, h: 0.5, rz: 0.5 });
    clump([x0 + 0.52, 0.5, 1.44], 0.5, 0.42, 110, { y0: 0.1 }); clump([xm + 0.8, 0.86, 0.6], 0.4, 0.34, 70, {});
    fern(x0 + 1.5, 0.82, 0.6, 0.9); fern(xm + 0.9, 0.3, 1.4, 0.8); blooms(x0 + 1.5, 0.36, 1.46, 0.4, 14, [P.flowerWhite, P.flowerYellow]);
    grass(xm - 0.6, -1.0, 0.5, 34, { y: F2 + 0.02, h: 0.34, rz: 0.22 }); grass(x1 - 0.6, -0.8, 0.4, 28, { y: F2 + 0.02, h: 0.36, rz: 0.2 }); fern(x0 + 0.34, F2 + 0.02, -0.92, 0.55, 5); mossPad(x0 + 0.5, F2 + 0.02, -1.0, 0.4, 0.26); mossPad(x1 - 0.9, F2 + 0.02, -0.75, 0.46, 0.18, P.mossLit);
    ivy([x1 - 0.04, 2.7, -0.2], [0, 0, -1], [0, 1, 0], [-1, 0, 0], 0.8, 1.7, 80, { s: 0.11 });
  }

  // ---- bar: door ajar, counter inside, vertical sign, paper lantern
  {
    const x0 = HX[2], x1 = HX[3], ZO = ZF + 0.09;
    for (const [a, c, r, u] of [[x0 + 0.26, x0 + 1.2, 2.26, 2.34], [x0 + 0.26, x0 + 0.34, FL, 2.34], [x0 + 1.12, x0 + 1.2, FL, 2.34]]) W.box(a, c, r, u, ZF - 0.1, ZO + 0.01, WOOD, C.cedarDark);
    const d = W.sub({ pos: [x0 + 0.34, 0, ZO], rot: [0, -0.62, 0] });
    d.box(0, 0.78, FL + 0.03, 2.25, -0.03, 0.03, 'flat', '#8f4a44');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) { if (j > 4 && j < 7 && i > 0 && i < 3) continue; d.add(kit.sphere(0.018, 5, 4), 'flat', { pos: [0.12 + i * 0.18, 0.42 + j * 0.25, 0.034], color: '#c9a24e' }); }
    d.add(kit.torus(0.13, 0.024, 6, 18), 'flat', { pos: [0.39, 1.72, 0.04], color: '#c9a24e' }); d.add(kit.cyl(0.13, 0.13, 0.01, 18), 'flat', { pos: [0.39, 1.72, 0.03], rot: [Math.PI / 2, 0, 0], color: '#54707a' });
    d.rod([0.68, 1.02, 0.05], [0.68, 1.26, 0.05], 0.014, 'flat', '#c9a24e', 5); d.rod([0.68, 1.02, 0], [0.68, 1.02, 0.05], 0.012, 'flat', '#c9a24e', 5); d.rod([0.68, 1.26, 0], [0.68, 1.26, 0.05], 0.012, 'flat', '#c9a24e', 5);
    glassPanel(W, x0 + 1.42, x1 - 0.28, 1.02, 2.22, ZF + 0.02, { kick: 0.03, mull: 3, f: 0.05, col: C.cedarDark });
    W.box(x0 + 1.34, x1 - 0.2, 0.96, 1.02, ZF - 0.04, ZO + 0.08, 'plaster', C.plasterCool);
    // interior
    W.box(x0 + 0.04, x1 - 0.04, FL, FL + 0.02, -3, ZF, 'flat', '#7a5a4e');
    W.box(x0 + 0.1, x1 - 0.1, FL, 2.56, -2.94, -2.9, 'plaster', '#b7655a');
    W.box(x0 + 1.0, x1 - 0.14, FL, 1.02, -1.74, -1.42, WOOD, '#9a6a44'); W.box(x0 + 0.92, x1 - 0.1, 1.02, 1.08, -1.8, -1.36, WOOD, '#c79a64');
    for (let k = 0; k < 3; k++) { const x = x0 + 1.2 + k * 0.42; W.add(kit.cylBase(0.03, 0.03, 0.6, 6), worn, { pos: [x, FL, -1.12], color: '#a8b4b4' }); W.add(kit.cylBase(0.15, 0.15, 0.06, 10), 'flat', { pos: [x, FL + 0.6, -1.12], color: '#a84a44' }); }
    for (const y of [1.34, 1.78]) { W.box(x0 + 0.5, x1 - 0.16, y - 0.03, y, -2.9, -2.72, WOOD, C.frame); W.add(atlas.quad(1.9, 0.32, 'labels'), atlasMat, { pos: [(x0 + 0.5 + x1 - 0.16) / 2, y + 0.16, -2.78] }); }
    // vertical sign on its bracket
    const sx = x1 - 0.22;
    W.box(sx - 0.03, sx + 0.03, 2.82, 4.3, ZO + 0.02, ZO + 0.62, 'flat', '#e8decc');
    W.add(atlas.quad(0.46, 1.4, 'snack'), atlasMat, { pos: [sx + 0.04, 3.56, ZO + 0.32], rot: [0, Math.PI / 2, 0] }); W.add(atlas.quad(0.46, 1.4, 'snack'), atlasMat, { pos: [sx - 0.04, 3.56, ZO + 0.32], rot: [0, -Math.PI / 2, 0] });
    for (const y of [2.92, 4.2]) W.rod([sx, y, ZO - 0.04], [sx, y, ZO + 0.06], 0.02, worn, '#6f7a7e', 5);
    W.box(sx - 0.02, sx + 0.02, 4.2, 4.5, ZO + 0.0, ZO + 0.02, 'flat', '#b9bfb2');
    // tin hood over the door
    W.add(corr(1.3, 0.6, 5), worn, { pos: [x0 + 0.74, 2.5, ZO + 0.26], rot: [0.22, 0, 0], color: '#6f9fa0' });
    for (const x of [x0 + 0.2, x0 + 1.28]) W.beam([x, 2.56, ZO], [x, 2.44, ZO + 0.5], 0.03, 0.03, worn, '#6f7a7e');
    // upper window: lattice slider half across
    W.box(x0 + 0.66, x1 - 0.66, 3.14, 3.2, ZF - 0.08, ZO + 0.08, 'plaster', C.plasterCool);
    lattice(W, x0 + 0.74, x0 + 1.34, 3.22, 4.24, ZF + 0.02, { n: 7, rails: 2, col: C.cedarDark, slat: C.frame });
    glassPanel(W, x0 + 1.24, x1 - 0.74, 3.22, 4.24, ZF - 0.04, { kick: 0.04, mull: 2, col: C.cedarDark });
    W.box(x0 + 0.1, x1 - 0.06, F2, 4.7, -3.02, -2.94, 'plaster', '#8f6a58');
    acUnit(W.sub({ pos: [x0 + 0.42, 2.92, ZO + 0.16] }), '#e4e0cc');
    gasMeter(W.sub({ pos: [x0 + 1.34, 1.2, ZO + 0.08] }));
    pipe(W, [[x1 - 0.1, 4.92, ZO + 0.04], [x1 - 0.1, 0.16, ZO + 0.04]], 0.042, '#8a9a94');
    for (const [dy, dz] of [[0, 0], [0.3, 0.02]]) crateMilk(W.sub({ pos: [x1 - 0.72, 0.13 + dy, ZF + 0.5 + dz], rot: [0, 0.14 - dy, 0] }), '#b5574a');
    crateMilk(W.sub({ pos: [x1 - 1.32, 0.13, ZF + 0.46], rot: [0, -0.3, 0] }), '#6f9fb0');
    for (let i = 0; i < 5; i++) { const x = x1 - 0.86 + i * 0.07, y = 0.73; W.add(kit.cylBase(0.026, 0.03, 0.16, 6), 'flat', { pos: [x, y, ZF + 0.5], color: '#5f8f7a' }); W.add(kit.cylBase(0.012, 0.024, 0.08, 6), 'flat', { pos: [x, y + 0.16, ZF + 0.5], color: '#5f8f7a' }); }
    wildPot(x0 + 1.5, 0.13, 0.86, 0.16, 0.24, 0.3, 0.34, 56, '#8d7a64');
    noren([x0 + 0.36, 2.28, ZO + 0.05], [1, 0, 0], 0.8, 0.46, 'norenBar', 3, [0, 0, 1]);
    // a shelf of neglected bonsai by the bar window has run away into the gutter line
    W.box(x0 + 1.4, x1 - 0.26, 0.82, 0.86, ZO, ZO + 0.22, WOOD, C.silver);
    for (const dx of [0.1, 0.42, 0.74]) wildPot(x0 + 1.4 + dx, 0.86, ZO + 0.12, 0.08, 0.1, 0.17, 0.2, 22, '#a85f46');
  }
  // service clutter along the street: wires from the eaves, down-pipes
  pipe(W, [[HX[1] - 0.12, 4.86, ZF + 0.42], [HX[1] - 0.12, 4.86, ZF + 0.16], [HX[1] - 0.12, 2.9, ZF + 0.16]], 0.04);
  pipe(W, [[HX[1] - 0.12, 2.52, ZF + 0.2], [HX[1] - 0.12, 0.2, ZF + 0.2]], 0.04);

  // ---- rear faces, for the back view
  HOUSE.forEach((h, i) => {
    const x0 = HX[i], x1 = HX[i + 1], Zb = ZB - 0.09;
    W.box(x0 + 0.06, x1 - 0.06, FL, 4.7, -5.0, -4.94, 'plaster', '#94785a');
    timbers(W, x0, x1, Zb + 0.03, [F2 + 0.06, 4.7], []);
    // back door, half pushed in
    W.box(x0 + 0.24, x0 + 0.3, FL, 2.22, Zb, ZB + 0.06, WOOD, C.beam); W.box(x0 + 1.1, x0 + 1.16, FL, 2.22, Zb, ZB + 0.06, WOOD, C.beam); W.box(x0 + 0.24, x0 + 1.16, 2.2, 2.28, Zb, ZB + 0.06, WOOD, C.beam);
    const dd = W.sub({ pos: [x0 + 0.3, 0, ZB], rot: [0, i === 1 ? 1.1 : 0.5 + i * 0.1, 0] });
    for (let k = 0; k < 5; k++) dd.box(k * 0.16, k * 0.16 + 0.15, FL + 0.03, 2.18, -0.02, 0.02, WOOD, k % 2 ? C.cedar : C.silver);
    dd.box(0, 0.78, 0.5, 0.56, -0.04, -0.015, WOOD, C.beam); dd.box(0, 0.78, 1.7, 1.76, -0.04, -0.015, WOOD, C.beam);
    W.box(x0 + 0.26, x0 + 1.14, 0.1, 0.2, ZB - 0.5, ZB - 0.06, 'concrete', C.footing);
    // kitchen window with bars and a tin hood
    const wx0 = x0 + 1.45, wx1 = x1 - 0.35;
    glassPanel(W, wx0, wx1, 1.05, 1.95, ZB, { kick: 0.04, mull: 2, col: C.beam });
    for (let k = 0; k < 6; k++) { const x = lerp(wx0 + 0.06, wx1 - 0.06, k / 5); W.rod([x, 1.03, Zb], [x, 1.97, Zb], 0.01, worn, '#7d8b90', 5); }
    W.add(corr(wx1 - wx0 + 0.26, 0.42, 4), worn, { pos: [(wx0 + wx1) / 2, 2.08, Zb - 0.16], rot: [-0.32, 0, 0], color: '#8fa0a0' });
    // upper window + drying rail
    const ux0 = x0 + 0.6, ux1 = x1 - 0.6;
    glassPanel(W, ux0, (ux0 + ux1) / 2 + 0.06, 3.2, 4.2, ZB + 0.03, { kick: 0.04, mull: 2, col: C.beam });
    lattice(W, (ux0 + ux1) / 2 - 0.1, ux1, 3.2, 4.2, ZB - 0.03, { n: 7, rails: 2, col: C.beam, slat: C.frame });
    W.box(ux0 - 0.24, ux1 + 0.24, 3.06, 3.1, Zb - 0.4, Zb, WOOD, C.silver);
    for (const x of [ux0 - 0.2, (ux0 + ux1) / 2, ux1 + 0.2]) W.box(x - 0.02, x + 0.02, 3.1, 3.5, Zb - 0.38, Zb - 0.34, WOOD, C.frame);
    W.box(ux0 - 0.24, ux1 + 0.24, 3.48, 3.52, Zb - 0.39, Zb - 0.33, WOOD, C.frame);
    for (const x of [ux0 - 0.2, ux1 + 0.2]) W.beam([x, 2.72, Zb], [x, 3.06, Zb - 0.36], 0.05, 0.05, WOOD, C.beam);
    pipe(W, [[x1 - 0.16, 4.78, Zb - 0.05], [x1 - 0.16, 0.12, Zb - 0.05]], 0.042, i === 1 ? '#8a7a6a' : '#7d8b90');
    gasMeter(W.sub({ pos: [x0 + 1.32, 1.06, Zb - 0.02], rot: [0, Math.PI, 0] }));
    if (i !== 1) acUnit(W.sub({ pos: [x0 + 1.9 + i * 0.1, 0.24, Zb - 0.24], rot: [0, Math.PI, 0] }), '#dcdccc');
    else { W.add(kit.cylBase(0.17, 0.17, 0.96, 12), worn, { pos: [x0 + 1.34, 0.08, Zb - 0.3], color: '#7f9fb0' }); W.add(kit.cylBase(0.17, 0.17, 0.96, 12), worn, { pos: [x0 + 1.7, 0.08, Zb - 0.28], color: '#a8b4b4' }); for (const dx of [1.34, 1.7]) W.add(new THREE.SphereGeometry(0.17, 12, 4, 0, 6.28, 0, 1.57), worn, { pos: [x0 + dx, 1.04, Zb - 0.3], color: '#7f9fb0' }); }
  });

  /* ================================================================== the sento: filling in ======================== */
  {
    // wooden wainscot on the outer walls, broken windows
    const clad = (ax, az, bx, bz, y1, n) => { const len = Math.hypot(bx - ax, bz - az), yaw = -Math.atan2(bz - az, bx - ax), s = W.sub({ pos: [ax, 0, az], rot: [0, yaw, 0] }); s.box(0, len, y1, y1 + 0.06, -0.04, 0.05, WOOD, C.beam); for (let i = 0; i < n; i++) { const x = (i + 0.5) * (len / n); s.add(kit.boxBase(len / n - 0.012, y1, 0.02), WOOD, { pos: [x, 0, 0.02], color: i % 3 === 1 ? C.silver : C.cedar }); } };
    clad(BX0 - 0.1, BZS, BX0 - 0.1, BZN, 1.12, 42);                 // west
    clad(BX0, BZN - 0.1, -18.2, BZN - 0.1, 1.12, 8); clad(-13.5, BZN - 0.1, BX1, BZN - 0.1, 1.12, 8);
    clad(BX1 + 0.1, BZN, BX1 + 0.1, -18.84, 1.12, 5);
    for (const [z0, z1] of [[-19.0, -18.0], [-17.0, -16.0], [-15.2, -14.2], [-13.6, -12.8]]) {
      const s = W.sub({ pos: [BX0, 0, 0], rot: [0, -Math.PI / 2, 0] });
      glassPanel(s, z0, z1, 1.5, 2.55, 0, { kick: 0.04, mull: 3, f: 0.06, col: C.frame, panes: z0 !== -15.2 });
      s.box(z0 - 0.06, z1 + 0.06, 1.44, 1.5, -0.02, 0.14, WOOD, C.beam); s.box(z0 + (z1 - z0) / 2 - 0.02, z0 + (z1 - z0) / 2 + 0.02, 1.5, 2.55, -0.03, 0.03, WOOD, C.frame);
    }
    for (const [x0, x1] of [[-19.15, -18.6], [-13.3, -12.6]]) { glassPanel(W, x0, x1, 1.2, 2.5, BZN, { kick: 0.04, mull: 3, f: 0.05 }); W.box((x0 + x1) / 2 - 0.02, (x0 + x1) / 2 + 0.02, 1.2, 2.5, BZN - 0.03, BZN + 0.03, WOOD, C.frame); }
    // west-wing changing room seen through the windows: boards, lockers, a shelf of baskets
    W.box(BX0 + 0.1, WEX - 0.08, 0, 0.14, BZM + 0.1, BZS - 0.08, WOOD, C.cedar);
    W.box(WEX - 0.34, WEX - 0.1, 0.14, 2.3, -15.9, -12.6, WOOD, C.frame);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) { const z = -15.84 + i * 0.36, y = 0.22 + j * 0.52; W.box(WEX - 0.355, WEX - 0.34, y, y + 0.46, z, z + 0.32, WOOD, (i + j * 2) % 3 ? C.cedar : C.silver); W.box(WEX - 0.368, WEX - 0.35, y + 0.18, y + 0.26, z + 0.24, z + 0.28, 'flat', '#c9a24e'); }
    // bath hall wall tile, tub, wash line
    W.box(BX0 + 0.1, BX1 - 0.1, 0.14, 1.02, BZM - 0.12, BZM - 0.1, 'tile', '#ffffff');
    W.box(BX0 + 0.1, BX1 - 0.1, 3.06, 3.14, BZM - 0.13, BZM - 0.1, WOOD, C.frame);
    W.box(BX0 + 0.1, BX1 - 0.1, 0.96, 1.04, BZM - 0.13, BZM - 0.09, 'flat', '#8fb7a8');
    const tx0 = -18.72, tx1 = -13.5, tz0 = -17.86, tz1 = BZM - 0.12, TH = 0.74, Tt = 0.18;
    W.box(tx0, tx1, 0.14, 0.2, tz0, tz1, 'tile', '#ffffff');
    W.box(tx0, tx1, 0.14, TH, tz0, tz0 + Tt, 'tile', '#ffffff'); W.box(tx0, tx0 + Tt, 0.14, TH, tz0, tz1, 'tile', '#ffffff'); W.box(tx1 - Tt, tx1, 0.14, TH, tz0, tz1, 'tile', '#ffffff');
    W.box(tx0 - 0.03, tx1 + 0.03, TH, TH + 0.05, tz0 - 0.03, tz0 + Tt + 0.03, 'concrete', '#e6efe6'); W.box(tx0 - 0.03, tx0 + Tt + 0.03, TH, TH + 0.05, tz0, tz1, 'concrete', '#e6efe6'); W.box(tx1 - Tt - 0.03, tx1 + 0.03, TH, TH + 0.05, tz0, tz1, 'concrete', '#e6efe6');
    W.box(-15.9, -15.74, 0.2, TH, tz0 + Tt, tz1, 'tile', '#ffffff'); W.box(-15.93, -15.71, TH, TH + 0.05, tz0, tz1, 'concrete', '#e6efe6'); // the divider between the deep and shallow pools
    W.box(tx0 + Tt, -15.9, 0.2, 0.34, tz0 + Tt, tz0 + Tt + 0.26, 'tile', '#ffffff');
    // brass spout on the mural wall
    W.rod([-14.6, 1.12, BZM - 0.12], [-14.6, 1.12, BZM - 0.42], 0.04, 'flat', '#c9a24e', 8); W.rod([-14.6, 1.12, BZM - 0.42], [-14.6, 0.96, BZM - 0.46], 0.04, 'flat', '#c9a24e', 8);
    // the pool held the rain: clear and green
    const wmx0 = tx0 + Tt, wmx1 = tx1 - Tt, wmz0 = tz0 + Tt, wmz1 = tz1;
    const shore = (x, z) => Math.min(1, Math.min(x - wmx0, wmx1 - x, z - wmz0 + 0.1, wmz1 - z + 0.1) / 0.28 + 0.02);
    const wg = kit.waterField(wmx0, wmx1, wmz0, wmz1, 36, 12, shore);
    const water = new THREE.Mesh(wg, ctx.water({ opacity: 0.74, shallow: '#a8f2cf', deep: '#3fb79c', scale: 1.4 })); water.position.y = 0.56; water.renderOrder = 2; group.add(ctx.noOutline(water));
    // wash line along the west wall
    W.box(BX0 + 0.12, BX0 + 0.56, 0.14, 0.34, -19.3, -17.2, 'tile', '#ffffff');
    W.box(BX0 + 0.1, BX0 + 0.2, 0.34, 0.9, -19.3, -17.2, 'tile', '#ffffff');
    for (let i = 0; i < 4; i++) { const z = -19.1 + i * 0.54; W.rod([BX0 + 0.2, 0.74, z], [BX0 + 0.42, 0.74, z], 0.024, 'flat', '#c9a24e', 6); W.rod([BX0 + 0.42, 0.74, z], [BX0 + 0.42, 0.62, z], 0.022, 'flat', '#c9a24e', 6); W.add(kit.cyl(0.05, 0.05, 0.03, 8), 'flat', { pos: [BX0 + 0.34, 0.8, z], color: '#ece6d4' }); W.box(BX0 + 0.1, BX0 + 0.12, 1.3, 1.9, z - 0.2, z + 0.2, 'flat', '#d4ecea'); }
    const stool = (x, z, a = 0, tip = 0) => { const s = W.sub({ pos: [x, 0.14, z], rot: [tip, a, 0] }); s.box(-0.14, 0.14, 0.16, 0.2, -0.1, 0.1, 'flat', '#e8e2cc'); for (const dx of [-0.11, 0.11]) s.box(dx - 0.02, dx + 0.02, 0, 0.16, -0.08, 0.08, 'flat', '#e8e2cc'); };
    const basin = (x, y, z, c = '#dcc97a', r = 0.14, a = 0) => W.add(kit.cylBase(r, r * 0.74, 0.1, 12, true), 'flat', { pos: [x, y, z], rot: [a, 0, 0], color: c });
    stool(-18.4, -18.5, 0.3); stool(-18.5, -18.0, 1.1, 0.0); stool(-17.2, -18.9, 0.6, 1.57); basin(-18.1, 0.16, -18.7); basin(-18.34, 0.34, -18.5); basin(-16.4, 0.18, -18.3, '#dcc97a', 0.14, 1.2); basin(-17.6, 0.8, -17.72, '#e8e2cc');
    // the fallen roof, in the hall
    rubble(W, -15.8, -19.0, 1.7, 0.42, 34, 0.14);
    for (const [a, c, r] of [[[-16.6, 2.5, -18.3], [-15.9, 0.72, -19.3], 0.12], [[-15.1, 3.1, -18.1], [-14.6, 0.5, -19.4], 0.12], [[-14.9, 1.2, -17.1], [-16.2, 0.76, -19.1], 0.1], [[-17.1, 1.0, -18.9], [-15.6, 0.82, -17.7], 0.08]]) W.beam(a, c, r, r * 1.1, WOOD, C.beam);
    for (let i = 0; i < 12; i++) W.add(kit.box(0.36, 0.04, 0.3), 'flat', { pos: [rng.range(-16.8, -14.8), TH + 0.06 * rng(), -17.77], rot: [rng.range(-0.3, 0.3), rng() * 6, rng.range(-0.3, 0.3)], color: '#6f8a96' });
    // moss and ferns on the tile
    mossPad(-17.9, 0.16, -18.4, 0.7, 0.42); mossPad(-14.3, 0.16, -18.7, 0.8, 0.5, P.mossLit); mossPad(-16.0, 0.8, -17.78, 0.52, 0.12); mossPad(tx0 + 0.1, TH + 0.05, -17.0, 0.12, 0.6, P.mossLit); mossPad(-13.6, TH + 0.05, -17.0, 0.12, 0.42);
    fern(-13.7, 0.16, -18.0, 0.9); fern(-18.95, TH + 0.02, -17.7, 0.5); fern(-15.6, 0.2, -18.9, 0.8); fern(-17.2, 0.16, -19.2, 0.85); grass(-14.6, -18.8, 0.8, 70, { y: 0.14, h: 0.5, rz: 0.5 }); grass(-17.4, -18.6, 0.9, 80, { y: 0.14, h: 0.46, rz: 0.5 });
    blooms(-14.0, 0.5, -18.6, 0.5, 12, [P.flowerWhite, P.flowerYellow]);
    // east gable: the entrance
    const P0 = BX1 + 0.08;
    W.box(P0 - 0.12, P0, 2.25, 2.33, -18.9, -17.1, WOOD, C.beam);
    for (const z of [-18.86, -18.0, -17.14]) W.box(P0 - 0.14, P0 + 0.02, 0.12, 2.3, z - 0.05, z + 0.05, WOOD, C.beam);
    { const s = W.sub({ pos: [P0 - 0.06, 0, 0], rot: [0, -Math.PI / 2, 0] }); lattice(s, -18.8, -18.05, 0.14, 2.24, 0, { n: 7, rails: 3 }); lattice(s, -18.4, -17.65, 0.14, 2.24, -0.07, { n: 7, rails: 3 }); }
    W.box(BX1 - 1.0, BX1 - 0.15, 0, 0.14, -18.9, -17.1, WOOD, C.cedarDark);
    W.box(-13.24, -13.14, 0.14, 3.0, BZN + 0.08, BZM - 0.1, 'plaster', C.plasterWarm);
    // shoe boxes in the lobby
    W.box(-13.1, -12.9, 0.14, 2.0, -19.3, -18.86, WOOD, C.frame); for (let j = 0; j < 6; j++) W.box(-12.895, -12.885, 0.2 + j * 0.3, 0.46 + j * 0.3, -19.26, -18.9, WOOD, C.cedar);
    // karahafu: the rolling gable, tiled, on two posts
    const PX0 = BX1 + 0.06, PX1 = BX1 + 0.68;
    const ogee = (q0) => { const q = clamp(q0); return 2.66 + 0.78 * Math.pow(Math.cos(q * Math.PI / 2), 2.2) + 0.1 * Math.pow(Math.sin(q * Math.PI), 2) - 0.12 * q - 0.3 * (q0 - q); };
    const kara = (side) => (u, vv, o) => o.set(lerp(PX0, PX1, u), ogee(vv), -18 + side * vv * 1.24);
    for (const side of [-1, 1]) {
      roof.tiles(kara(side), { lenU: PX1 - PX0, lenV: 1.5, tw: 0.2, tl: 0.26, wave: 0.03, scatter: 0.04, tint: TINT_BATH, rand }); roof.boards(kara(side), { nu: 3, nv: 8, color: C.boards, rand });
      const pts = []; for (let i = 0; i <= 12; i++) { const q = i / 12; pts.push([PX1 + 0.02, ogee(q) - 0.03, -18 + side * q * 1.26]); }
      W.add(kit.tube(pts, 0.05, 0.05, 6, 24), WOOD, { color: C.cedar });
    }
    W.beam([PX0, ogee(0) + 0.05, -18], [PX1 + 0.04, ogee(0) + 0.05, -18], 0.16, 0.08, 'flat', '#71868f');
    W.add(kit.cyl(0.14, 0.14, 0.05, 12), 'flat', { pos: [PX1 + 0.08, ogee(0) - 0.06, -18], rot: [0, 0, Math.PI / 2], color: '#c9a24e' });
    for (const z of [-18.92, -17.08]) { W.box(PX1 - 0.16, PX1 - 0.04, 0.1, 2.72, z - 0.06, z + 0.06, WOOD, C.beam); W.add(kit.cylBase(0.11, 0.13, 0.12, 10), 'concrete', { pos: [PX1 - 0.1, 0, z], color: C.footing }); }
    W.box(PX1 - 0.17, PX1 - 0.03, 2.54, 2.7, -18.96, -17.04, WOOD, C.beam);
    W.box(BX1 + 0.08, PX1 + 0.02, 0, 0.1, -19.06, -16.94, 'concrete', C.footing);
    noren([PX1 - 0.03, 2.5, -17.16], [0, 0, -1], 1.68, 0.72, 'norenYu', 5, [1, 0, 0]);
    // name board up in the gable and a louvred vent above it
    W.add(atlas.quad(1.5, 0.39, 'yu'), atlasMat, { pos: [BX1 + 0.12, 3.84, -18], rot: [0, Math.PI / 2, 0] });
    W.box(BX1 + 0.08, BX1 + 0.1, 3.6, 4.08, -18.8, -17.2, WOOD, C.beam);
    for (let i = 0; i < 4; i++) W.box(BX1 + 0.09, BX1 + 0.15, 4.2 + i * 0.1, 4.24 + i * 0.1, -18.2 + i * 0.05, -17.8 - i * 0.05, WOOD, C.cedarDark);
    // steam lantern on the ridge
    const lu0 = 0.7, lu1 = 0.9, q = new V3();
    const lx0 = bN(lu0, 0, q).x, lx1 = bN(lu1, 0, q).x, ly = bN((lu0 + lu1) / 2, 0, q).y + 0.04;
    W.box(lx0, lx1, ly - 0.2, ly + 0.05, -18.28, -17.72, 'plaster', C.plasterCool);
    for (let i = 0; i < 9; i++) { const x = lerp(lx0 + 0.04, lx1 - 0.04, i / 8); for (const z of [-18.29, -17.71]) W.box(x - 0.018, x + 0.018, ly - 0.15, ly + 0.05, z - 0.012, z + 0.012, WOOD, C.frame); }
    const lm = slope([lx0 - 0.1, ly + 0.3, -18], [lx1 + 0.1, ly + 0.3, -18], [lx0 - 0.1, ly + 0.05, -18.48], [lx1 + 0.1, ly + 0.05, -18.48]), lmS = slope([lx0 - 0.1, ly + 0.3, -18], [lx1 + 0.1, ly + 0.3, -18], [lx0 - 0.1, ly + 0.05, -17.52], [lx1 + 0.1, ly + 0.05, -17.52]);
    for (const S of [lm, lmS]) { roof.tiles(S, { lenU: lx1 - lx0 + 0.2, lenV: 0.55, tw: 0.3, tl: 0.26, wave: 0.03, scatter: 0.03, tint: TINT_BATH, rand }); roof.boards(S, { nu: 4, nv: 2, color: C.boards, rand }); }
    ridgeCap(lm, { n: 3, w: 0.2 });

    // boiler yard: lean-to, boiler, flue, firewood
    const yard = { x0: -15.3, x1: -12.6, z0: BZM + 0.1, z1: -14.0 };
    for (const [x, z] of [[yard.x0, yard.z1], [yard.x1, yard.z1], [yard.x1, yard.z0]]) W.rod([x, 0, z], [x, 2.05, z], 0.05, worn, '#6a5a50', 6);
    W.beam([yard.x0, 2.05, yard.z1], [yard.x1, 2.05, yard.z1], 0.06, 0.1, worn, '#6a5a50'); W.beam([yard.x1, 2.05, yard.z1], [yard.x1, 2.5, yard.z0], 0.06, 0.1, worn, '#6a5a50');
    W.add(corr(3.1, 2.7, 9), worn, { pos: [(yard.x0 + yard.x1) / 2, 2.34, (yard.z0 + yard.z1) / 2], rot: [Math.atan2(0.5, 2.36) * -1, 0, 0], color: '#9a6a50' });
    const bo = W.sub({ pos: [-13.82, 0.92, -15.25] });
    bo.add(kit.cyl(0.62, 0.62, 2.2, 18), worn, { rot: [0, 0, Math.PI / 2], color: '#7a6a5c' });
    for (const x of [-0.8, -0.3, 0.3, 0.8]) bo.add(kit.cyl(0.635, 0.635, 0.05, 18, true), worn, { pos: [x, 0, 0], rot: [0, 0, Math.PI / 2], color: '#5a4c44' });
    bo.add(kit.cyl(0.64, 0.64, 0.06, 18), worn, { pos: [1.1, 0, 0], rot: [0, 0, Math.PI / 2], color: '#4e4a48' }); bo.box(1.13, 1.2, -0.3, 0.18, -0.26, 0.26, worn, '#6f5a50'); bo.rod([1.22, -0.06, -0.16], [1.22, -0.06, 0.16], 0.02, worn, '#a8a08c');
    for (const dz of [-0.45, 0.45]) { bo.box(-0.9, -0.74, -0.92, -0.4, dz - 0.08, dz + 0.08, 'concrete', C.footing); bo.box(0.74, 0.9, -0.92, -0.4, dz - 0.08, dz + 0.08, 'concrete', C.footing); }
    bo.add(kit.cylBase(0.08, 0.08, 0.3, 8), worn, { pos: [0.3, 0.6, 0], color: '#6a5a50' });
    W.rod([-14.9, 1.0, -15.3], [-15.46, 1.0, -15.5], 0.2, worn, '#5a4c44', 10);
    // firewood wall + coal heap
    for (let r = 0; r < 7; r++) for (let i = 0; i < 16 - (r % 2); i++) { const x = -15.9 + i * 0.19 + (r % 2) * 0.09, y = 0.13 + r * 0.17 - (r % 2) * 0.0; if (r > 4 && i > 8) continue; W.add(kit.cyl(0.085, 0.09, 0.62, 7), WOOD, { pos: [x, y, -12.85], rot: [Math.PI / 2, 0, 0], color: rng.pick([C.cedar, C.silver, '#b7936e']) }); }
    W.add(kit.chip(kit.sphere(1, 12, 7), 0.14, rng), 'flat', { pos: [-16.0, 0, -13.7], scale: [0.8, 0.62, 0.7], color: '#55606a' });
    fence([-12.26, BZS + 0.02], [-16.9, BZS + 0.02], { h: 1.5, col: C.silver, missing: 0.08 });
    fence([BX1 + 0.02, BZM + 0.14], [BX1 + 0.02, BZS], { h: 1.5, col: C.silver, missing: 0.1 });
    wildPot(-12.9, 0.02, -13.5, 0.2, 0.26, 0.34, 0.4, 60, '#8d7a64');
    grass(-14.4, -13.4, 1.4, 130, { h: 0.6, rz: 0.7 }); clump([-15.0, 0.34, -13.2], 0.7, 0.42, 110, { y0: 0.02 });

    // ivy and weeds on the sento itself
    ivy([BX0 - 0.13, 0, -15.6], [0, 0, 1], [0, 1, 0], [-1, 0, 0], 3.3, 3.6, 520, { s: 0.16 });
    ivy([BX0 - 0.13, 0, -19.5], [0, 0, 1], [0, 1, 0], [-1, 0, 0], 1.3, 2.4, 170, { s: 0.15 });
    ivy([-14.0, 0, BZN - 0.13], [1, 0, 0], [0, 1, 0], [0, 0, -1], 1.7, 3.4, 240, { s: 0.16 });
    ivy([BX1 + 0.13, 0, -16.5], [0, 0, -1], [0, 1, 0], [1, 0, 0], 0.9, 3.2, 130, { s: 0.15 });
    for (const [x, z, r] of [[BX0 - 0.3, -16.0, 0.9], [-19.0, BZN - 0.3, 0.8], [-13.4, BZN - 0.3, 0.8], [BX1 + 0.3, -19.2, 0.5]]) grass(x, z, r, 60, { h: 0.6, rz: 0.3 });
    clump([BX0 - 0.15, 0.3, -13.0], 0.5, 0.42, 80, { y0: 0.02 }); clump([-12.0, 0.26, -19.3], 0.42, 0.36, 60, { y0: 0.02 });
  }

  /* ---- chimney greenery ---- */
  {
    const CH = TOWN.chimney, rAt = (y) => lerp(0.74, 0.42, (y - 1.35) / (CH.height - 1.35)) + 0.03;
    const paths = [[0.2, 12.2, 1.7], [3.4, 9.2, 1.2], [4.9, 6.2, 0.9]];
    for (const [a0x, topY, turns] of paths) {
      const pts = [], n = 22;
      for (let i = 0; i <= n; i++) { const u = i / n, y = 0.2 + u * (topY - 0.2), a = a0x + u * turns * 6.28 + 0.3 * Math.sin(u * 9), r = (y < 1.35 ? 1.08 : rAt(y)) + 0.01; pts.push([CH.x + Math.sin(a) * r, y, CH.z + Math.cos(a) * r]); }
      vine(pts, 0.05, 0.012, '#7c6a4a');
      for (let i = 0; i < 26 * (topY / 12) * 5.4; i++) {
        const f = rng(), k = Math.floor(f * n), P1 = v(pts[k]), a = Math.atan2(P1.x - CH.x, P1.z - CH.z) + rng.range(-0.45, 0.45), y = P1.y + rng.range(-0.34, 0.34), r = (y < 1.35 ? 1.08 : rAt(y)) + rng() * 0.11;
        const p = new V3(CH.x + Math.sin(a) * r, y, CH.z + Math.cos(a) * r), shell = new V3(Math.sin(a), 0.3, Math.cos(a)).normalize();
        const tip = new V3(rng.range(-0.7, 0.7), rng.range(-1, 0.1), rng.range(-0.7, 0.7)).addScaledVector(shell, 0.35).normalize();
        leaves.push({ p, shell, tip, s: 0.17 * rng.range(0.75, 1.25) * (1.15 - f * 0.4), tone: y > 3 && rng() < 0.14 && a0x > 3 ? color(P.ivyRed) : tone(0.52 + shell.dot(SUN) * 0.34 + rng.range(-0.1, 0.1)) });
      }
    }
    // base shrub
    clump([CH.x - 1.0, 0.36, CH.z + 1.1], 0.62, 0.44, 90, { y0: 0.02 }); fern(CH.x + 1.1, 0.3, CH.z + 0.3, 0.8);
    // sapling rooted in the broken rim
    const th = 0.15, ry = CH.height - 0.36, rr = 0.36, bx = CH.x + Math.sin(th) * rr, bz = CH.z + Math.cos(th) * rr, top = [bx + 0.16, ry + 1.32, bz + 0.2];
    W.add(kit.tube([[bx, ry - 0.12, bz], [bx + 0.05, ry + 0.3, bz + 0.1], [bx + 0.02, ry + 0.8, bz + 0.1], top], 0.05, 0.016, 6, 14), 'flat', { color: '#7c6250' });
    W.add(kit.tube([[bx + 0.03, ry + 0.66, bz + 0.09], [bx - 0.14, ry + 0.96, bz - 0.02], [bx - 0.3, ry + 1.06, bz - 0.06]], 0.018, 0.008, 5, 8), 'flat', { color: '#7c6250' });
    W.add(kit.tube([[bx + 0.05, ry - 0.1, bz], [bx + 0.3, ry - 0.34, bz + 0.1], [bx + 0.34, ry - 0.7, bz + 0.2]], 0.03, 0.01, 5, 8), 'flat', { color: '#7c6250' });
    const pv = [bx + 0.02, ry + 0.4, bz + 0.08];
    clump(top, 0.42, 0.34, 80, { s: 0.15, list: swayLeaves, shift: 0.1 }); clump([bx - 0.28, ry + 1.12, bz - 0.04], 0.3, 0.24, 46, { s: 0.14, list: swayLeaves, shift: 0.08 }); clump([bx + 0.34, ry + 0.86, bz + 0.34], 0.24, 0.2, 34, { s: 0.13, list: swayLeaves, shift: 0.04 });
    saplingPivot = pv;
    grass(CH.x - 0.2, CH.z + 0.1, 0.28, 12, { y: ry - 0.32, h: 0.34 });
  }

  /* ================================================================== yards ======================================== */
  {
    const Z0 = TOWN.yard.z[1] + 0.02, Z1 = TOWN.yard.z[0] + 0.08;
    fence([HX[0] + 0.05, Z1], [HX[3], Z1], { h: 1.75 });                                 // along the rear
    fence([HX[1], Z0], [HX[1], Z1 + 0.1], { h: 1.6 }); fence([HX[2], Z0], [HX[2], Z1 + 0.1], { h: 1.6, missing: 0.1 });
    fence([HX[0] + 0.05, Z0], [HX[0] + 0.05, Z1 + 0.1], { h: 1.7, missing: 0.04 }); fence([HX[3] + 0.02, Z0], [HX[3] + 0.02, Z1 + 0.1], { h: 1.7 });
    W.add(atlas.quad(0.3, 0.42, 'cat'), atlasMat, { pos: [HX[1] + 0.09, 1.16, -8.6], rot: [0, Math.PI / 2, 0.04] });
    // the laundry poles with the forgotten sheet
    const ly = 2.08, a = [-16.5, -8.4], c = [-14.6, -8.72];
    for (const [x, z] of [a, c]) { W.rod([x, 0, z], [x, ly + 0.2, z], 0.04, worn, '#7f8f8a', 6); W.rod([x - 0.06, ly, z - 0.38], [x + 0.06, ly, z + 0.38], 0.028, worn, '#7f8f8a', 6); W.add(kit.cylBase(0.16, 0.2, 0.14, 8), 'concrete', { pos: [x, 0, z], color: C.footing }); }
    const rail = (o) => { const A = [a[0] - 0.05, ly + 0.05, a[1] + o], B = [c[0] + 0.05, ly + 0.05, c[1] + o]; W.rod([A[0] - 0.22, A[1], A[2]], [B[0] + 0.24, B[1], B[2]], 0.026, 'flat', '#b9b77a', 7); };
    rail(0.34); rail(-0.34);
    const U = new V3(c[0] - a[0], 0, c[1] - a[1]), L = U.length(); U.divideScalar(L);
    cloth({ o: [a[0] + U.x * 0.16, ly + 0.03, a[1] + 0.34 + U.z * 0.16], U, D: [0, -1, 0], w: 1.5, h: 1.46, nx: 11, ny: 9, cell: 'sheet', amp: 0.2, tear: 0.03, N: [U.z, 0, -U.x] });
    for (const f of [0.2, 0.62, 0.95]) W.add(kit.box(0.024, 0.09, 0.05), 'flat', { pos: [a[0] + U.x * (0.16 + f * 1.5), ly + 0.06, a[1] + 0.34 + U.z * (0.16 + f * 1.5)], color: '#d9cfae' });
    cloth({ o: [a[0] + U.x * 0.6, ly + 0.03, a[1] - 0.34 + U.z * 0.6], U, D: [0, -1, 0], w: 0.5, h: 0.62, nx: 4, ny: 4, cell: 'curtain', amp: 0.12, tear: 0.1, N: [U.z, 0, -U.x], tint: [0.7, 0.86, 0.9] });
    // rusted water tanks, east yard
    tank(W.sub({ pos: [-12.7, 0, -9.9], rot: [0, 0.5, 0] }));
    { const s = W.sub({ pos: [-13.3, 0.56, -7.7], rot: [0.08, 0.7, Math.PI / 2 - 0.02] }); s.add(kit.cyl(0.46, 0.46, 1.5, 16), worn, { color: '#94806a' }); for (const y of [-0.74, -0.36, 0.36, 0.74]) s.add(kit.cyl(0.475, 0.475, 0.04, 16, true), worn, { pos: [0, y, 0], color: '#6a5a50' }); s.add(kit.cyl(0.47, 0.47, 0.02, 16), worn, { pos: [0, 0.75, 0], color: '#7a6a5c' }); s.add(kit.cyl(0.47, 0.47, 0.02, 16), worn, { pos: [0, -0.75, 0], color: '#7a6a5c' }); }
    drum(W.sub({ pos: [-11.98, 0, -7.6] }), 0.27, 0.8, '#7f9a8e');
    { const s = W.sub({ pos: [-13.7, 0, -10.9], rot: [0, 0.3, 0] }); for (const x of [-0.26, 0.26]) s.beam([x, 0, 0.5], [x * 0.9, 2.5, -0.28], 0.06, 0.08, WOOD, C.silver); for (let i = 1; i < 8; i++) { const t = i / 8; s.box(-0.25, 0.25, t * 2.5 - 0.02, t * 2.5 + 0.02, lerp(0.5, -0.28, t) - 0.03, lerp(0.5, -0.28, t) + 0.03, WOOD, C.silver); } }
    vine([[-12.3, 0.1, -9.4], [-12.2, 0.5, -9.5], [-12.3, 1.2, -9.5], [-12.5, 1.9, -9.5], [-12.7, 2.4, -9.5]], 0.03, 0.01, '#6a6a42');
    ivy([HX[3] - 0.08, 0, -11.2], [0, 0, 1], [0, 1, 0], [-1, 0, 0], 3, 1.7, 180, { s: 0.14 });
    // west yard: the camphor heaves the ground; tubs, pots, a clothes-washing sink
    W.box(-19.4, -18.7, 0.02, 0.56, -7.2, -6.6, 'concrete', '#c9c6b6'); W.box(-19.34, -18.76, 0.56, 0.58, -7.14, -6.66, 'flat', '#8fcfc6'); W.rod([-19.05, 0.6, -6.62], [-19.05, 0.96, -6.46], 0.02, 'flat', '#c9a24e', 5);
    wildPot(-17.4, 0.02, -7.2, 0.24, 0.32, 0.46, 0.52, 100); wildPot(-16.98 - 0.42, 0.02, -7.9, 0.17, 0.24, 0.3, 0.4, 56, '#8d7a64');
    W.add(kit.cylBase(0.42, 0.36, 0.26, 16, true), worn, { pos: [-17.5, 0.02, -10.6], rot: [0.14, 0, 0.1], color: '#8fa79a' });
    for (const [x, z] of [[-19.1, -10.9], [-19.0, -10.5], [-18.7, -10.9]]) pot(W.sub({ pos: [x, 0.02, z], rot: [rng() * 0.2, rng() * 6, 0] }), 0.13, 0.2);
    // low growth
    for (const [x, z, r, n] of [[-15.6, -10.4, 1.2, 180], [-15.4, -7.0, 1.0, 130], [-12.8, -7.0, 0.8, 90], [-18.6, -8.0, 1.0, 130], [-17.8, -10.5, 1.0, 130], [-12.6, -11.2, 0.7, 70]]) grass(x, z, r, n, { h: 0.62 });
    clump([-15.2, 0.48, -11.0], 0.9, 0.56, 200, { y0: 0.02 }); clump([-19.0, 0.42, -9.4], 0.66, 0.5, 130, { y0: 0.02 }); clump([-14.8, 0.32, -6.9], 0.5, 0.36, 70, { y0: 0.02 }); clump([-12.2, 0.3, -11.3], 0.44, 0.36, 70, { y0: 0.02 });
    fern(-16.4, 0.03, -10.2, 1); fern(-13.4, 0.03, -11.3, 0.9); fern(-17.1, 0.03, -6.8, 0.8);
    blooms(-15.7, 0.5, -10.2, 0.6, 16, [P.flowerWhite, P.flowerPurple, P.flowerYellow]); blooms(-13.0, 0.56, -7.1, 0.3, 8, [P.flowerWhite]);
  }

  /* ---- sidewalk edges and roofs: weeds, moss, a roof-top sapling ---- */
  {
    // the west gable is a show face from the far side of the plinth: ivy off the north corner, a vine reaching the eave pipe, weeds at the foot
    ivy([WX - 0.16, 0.1, -6.0], [0, 0, 1], [0, 1, 0], [-1, 0, 0], 2.6, 5.6, 620, { s: 0.17 });
    ivy([WX - 0.16, 0.1, -0.9], [0, 0, 1], [0, 1, 0], [-1, 0, 0], 1.2, 2.6, 150, { s: 0.15 });
    vine([[WX - 0.2, 0.1, -4.2], [WX - 0.22, 1.6, -4.0], [WX - 0.2, 3.0, -3.3], [WX - 0.2, 4.2, -3.4], [WX - 0.2, 4.9, -2.9]], 0.03, 0.01);
    grass(WX - 0.3, -3.0, 0.3, 90, { h: 0.6, rz: 2.8 });
    for (const [x, r] of [[-19.3, 0.5], [-17.4, 0.45], [-11.8, 0.35]]) grass(x, 0.62, r, 44, { y: 0.13, h: 0.42, rz: 0.15 });
    const q = new V3();
    const onRoof = (S, u, vv, fn) => { S(u, vv, q); fn(q.x, q.y, q.z); };
    onRoof(front[0], 0.56, 0.3, (x, y, z) => { clump([x, y + 0.2, z], 0.42, 0.3, 80, { s: 0.14, y0: y - 0.02 }); });
    onRoof(back[2], 0.3, 0.12, (x, y, z) => { clump([x, y + 0.16, z], 0.36, 0.26, 56, { s: 0.14, y0: y - 0.02 }); grass(x + 0.3, z, 0.3, 20, { y, h: 0.42, rz: 0.2 }); });
    onRoof(bS, 0.2, 0.3, (x, y, z) => grass(x, z, 0.6, 40, { y, h: 0.5, rz: 0.2 }));
    onRoof(bN, 0.12, 0.12, (x, y, z) => { clump([x, y + 0.14, z], 0.3, 0.2, 40, { s: 0.13, y0: y - 0.02 }); grass(x + 0.3, z - 0.1, 0.24, 18, { y: y - 0.05, h: 0.4, rz: 0.2 }); });
    for (const [S, u0, u1] of [[front[0], 0, 1], [front[2], 0, 1], [back[0], 0, 1], [bN, 0, 0.36]]) for (let i = 0; i < 9; i++) { S(lerp(u0, u1, rng()), 0, q); grass(q.x, q.z, 0.12, 5, { y: q.y + 0.1, h: 0.25, rz: 0.1 }); }
    // loose tiles slid onto the eaves
    for (const [x, y, z] of [[-18.2, 2.74, 1.16], [-15.2, 0.2, 1.8], [-14.8, 0.15, 2.0], [-16.1, 0.14, 2.05]]) W.add(kit.box(0.36, 0.04, 0.3), 'flat', { pos: [x, y, z], rot: [0.1, rng() * 6, 0.2], color: '#7a8e9c' });
  }

  /* ================================================================== back lot ===================================== */
  {
    const L = TOWN.backLot, XE = 1.36, ZN = L.z[0] + 0.14, ZW = -13.35, XW = L.x[0] + 0.14;
    blockWall([XW, ZN], [XE, ZN], { courses: 5, broken: (u) => (u > 0.68 && u < 0.78 ? 0.36 : 1) });
    blockWall([XE, -19.7], [XE, ZW], { courses: 5, gaps: [[1.0, 2.9]], broken: (u) => (u > 0.72 ? 0.6 : 1) });
    blockWall([XW, ZN], [XW, ZW], { courses: 4, broken: (u) => (u < 0.3 ? 0.7 : 1) });
    // the banyan's pillar root at (-9.4,-13.6) came down on the wall line and burst it: a stepped breach, wider at the top, the blocks thrown either side
    const BREACH = [[1.48, 3.0], [1.23, 2.75], [0.98, 3.0], [0.73, 3.25]];
    const inner = blockWall([XW, ZW], [XE, ZW], { courses: 4, gaps: [[8.6, 10.2]], broken: (u) => (u > 0.3 && u < 0.42 ? 0.42 : u > 0.8 ? 0.6 : 1), breach: BREACH });
    const inBreach = (p) => { const [a, b] = BREACH[THREE.MathUtils.clamp(Math.floor((p.y - 0.1) / 0.24), 0, 3)], u = p.x - XW; return u > a - 0.1 && u < b + 0.1; };
    {
      const rr = ctx.seeded('town-breach'), G = 0.05; // own stream: nothing below may shift the module's rng
      const block = (pos, rot, { cope = false, l = 0.482, chip = 0.012 } = {}) => inner.add(kit.chip(kit.box(l, 0.224, cope ? 0.22 : 0.16, 2, 1, 1), chip, rr), 'concrete', { pos, rot, color: new THREE.Color(cope ? '#d6d2c4' : '#c3c1b4').multiplyScalar(rr.range(0.92, 1.05)) });
      block([1.2, 0.78, 0], [0.05, 0.08, -0.76], { cope: true });                                       // slid down the stepped edge and stuck on the corners
      block([0.92, G + 0.1, 0.5], [0, 0.62, 0.03]); block([1.46, G + 0.08, 0.86], [Math.PI / 2, -0.9, 0]); // thrown south, toward the building
      block([3.02, G + 0.1, 0.5], [0, -0.3, 0], { cope: true }); block([2.93, G + 0.3, 0.46], [0.1, 0.42, 0.2]); block([3.36, G + 0.14, 0.34], [-0.62, 0.08, 0.04]);
      block([0.42, G + 0.1, -0.42], [0, -0.42, 0.06]); block([3.0, G + 0.1, -0.5], [0.08, 0.8, 0]); block([3.08, G + 0.08, -0.78], [Math.PI / 2, 0.3, 0], { l: 0.3, chip: 0.03 }); // and north, into the plots, clear of the spurs
      inner.add(kit.chip(kit.box(0.62, 0.1, 0.32, 3, 1, 2), 0.012, rr), 'concrete', { pos: [1.3, 0.11, 0.03], rot: [0.08, -0.1, 0.16], color: C.footing }); // footing snapped and tipped up by the spurs
      for (const [u, z] of [[1.16, 0.3], [1.72, 0.62], [2.5, 0.72], [3.3, 0.66], [0.8, -0.27], [0.1, -0.3], [3.32, -0.3]]) inner.add(kit.chip(kit.box(rr.range(0.14, 0.26), rr.range(0.08, 0.14), rr.range(0.1, 0.16), 2, 1, 1), 0.03, rr), 'concrete', { pos: [u, G + 0.05, z], rot: [rr.range(-0.3, 0.3), rr() * 6.28, rr.range(-0.3, 0.3)], color: '#b8b6a8' }); // broken halves
    }
    inner.box(8.5, 8.68, 0, 1.3, -0.14, 0.14, 'concrete', C.footing); inner.box(10.14, 10.32, 0, 1.3, -0.14, 0.14, 'concrete', C.footing);
    // plots: long soil beds run down to seed
    const PX0 = XW + 0.3, PX1 = -7.6;
    W.box(PX0, PX1, 0, 0.06, ZN + 0.3, ZW - 0.3, 'soil', '#a78a6c');
    const bed = (x, z0, z1, wd = 0.62) => W.add(kit.chip(kit.box(wd, 0.26, z1 - z0, 3, 1, 8), 0.05, rng), 'soil', { pos: [x, 0.13, (z0 + z1) / 2], color: '#93775c' });
    const beds = [PX0 + 0.5, PX0 + 1.42, PX0 + 2.34, PX0 + 3.26];
    beds.forEach((x, i) => bed(x, ZN + 0.56, ZW - 0.56 - (i === 2 ? 0.6 : 0)));
    // bean rows: A-frames of bamboo, tied at a ridge pole, sagging
    const bean = (x, z0, z1, sag) => {
      const n = 6, tops = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, z = lerp(z0, z1, t), H0 = 1.82 - sag * Math.sin(t * Math.PI) * 1.1 - (i === 2 ? 0.2 : 0), lean = 0.34 + 0.34 * Math.sin(t * Math.PI) * sag, tilt = (i === 2 ? 0.38 : 0.12) * Math.sin(i * 2.1);
        const P1 = [x + tilt, H0, z + 0.06 * Math.sin(i * 3)];
        W.rod([x - lean, 0.1, z], [P1[0] + 0.1, P1[1] + 0.12, P1[2]], 0.017, 'flat', '#c7b37e', 5); W.rod([x + lean, 0.1, z + 0.04], [P1[0] - 0.1, P1[1] + 0.12, P1[2]], 0.017, 'flat', '#c7b37e', 5);
        tops.push(P1);
      }
      vine(tops.map((p) => [p[0], p[1] + 0.03, p[2]]), 0.016, 0.014, '#c7b37e');
      for (let i = 0; i < n; i++) {
        const A = tops[i], Bb = tops[i + 1];
        vine([[x - 0.3, 0.1, A[2]], [x - 0.16, 0.9, A[2] + 0.06], A, [(A[0] + Bb[0]) / 2, (A[1] + Bb[1]) / 2 - 0.1, (A[2] + Bb[2]) / 2], [x + 0.2, 0.7, Bb[2] - 0.1]], 0.012, 0.007, '#9a8a54');
        const c0 = [(A[0] + Bb[0]) / 2, 1.3, (A[2] + Bb[2]) / 2];
        clump(c0, 0.28, 0.5, 34, { s: 0.15, shift: -0.05 });
        for (let k = 0; k < 7; k++) { const px = c0[0] + rng.range(-0.3, 0.3), py = rng.range(0.7, 1.7), pz = c0[2] + rng.range(-0.3, 0.3); softS.add(kit.box(0.03, 0.2, 0.012), softMat, { pos: [px, py, pz], rot: [rng.range(-0.3, 0.3), rng() * 6, rng.range(-0.3, 0.3)], color: rng() < 0.6 ? '#c9b46a' : '#a8c060' }); }
      }
    };
    bean(beds[0], ZN + 0.7, ZW - 1.1, 0.5); bean(beds[1], ZN + 0.7, -15.8, 0.3);
    // mustard and daikon bolted to flower around the bloom spot
    const FS = layout.FLOWER_SPOTS[14];
    const bolt = (x, z, h, n = 3) => {
      for (let k = 0; k < n; k++) {
        const a = rng() * 6.28, tx = x + Math.cos(a) * 0.14, tz = z + Math.sin(a) * 0.14, H = h * rng.range(0.75, 1.1);
        softS.rod([x, 0.2, z], [tx, H, tz], 0.012, softMat, P.mossDeep, 5);
        for (let j = 0; j < 7; j++) softS.add(kit.flower(0.075, 4), softMat, { pos: [tx + rng.range(-0.1, 0.1), H - j * 0.06 + rng.range(-0.02, 0.02), tz + rng.range(-0.1, 0.1)], rot: [rng.range(-0.4, 0.4), rng() * 6, rng.range(-0.4, 0.4)], color: j % 3 === 2 ? P.flowerWhite : P.flowerYellow });
      }
      clump([x, 0.3, z], 0.22, 0.16, 16, { s: 0.14, y0: 0.2 });
    };
    for (let i = 0; i < 22; i++) { const x = FS[0] + rng.range(-1.1, 0.9), z = FS[2] + rng.range(-0.9, 0.9); bolt(x, z, rng.range(0.56, 1.0)); }
    blooms(FS[0], FS[1], FS[2], 0.4, 12, [P.flowerYellow, P.flowerWhite], 0.11);
    for (let i = 0; i < 12; i++) bolt(beds[2] + rng.range(-0.24, 0.24), lerp(ZN + 0.7, -15.2, rng()), rng.range(0.6, 1.25), 2);
    for (let i = 0; i < 6; i++) { const x = beds[3], z = lerp(ZN + 0.8, ZW - 0.8, (i + 0.5) / 6); clump([x, 0.4, z], 0.3, 0.2, 34, { s: 0.2, y0: 0.24, shift: 0.05 }); }
    grass(PX0 + 1.8, -16.6, 2.2, 240, { y: 0.06, h: 0.5, rz: 3.0 });
    // a watering can and a rusty hoe, left mid-row
    { const s = W.sub({ pos: [PX0 + 2.8, 0.06, ZN + 0.5], rot: [0, 0.8, 0] }); s.add(kit.cylBase(0.15, 0.17, 0.26, 12), worn, { color: '#8fa79a' }); s.rod([0.15, 0.08, 0], [0.4, 0.3, 0], 0.03, worn, '#8fa79a', 6, 0.018); s.add(kit.torus(0.13, 0.012, 4, 12, 3.14), worn, { pos: [0, 0.27, 0], color: '#6f7a7e' }); }
    W.rod([PX0 + 3.7, 0.04, -14.1], [PX0 + 3.0, 1.46, -14.05], 0.016, WOOD, C.silver, 5); W.box(PX0 + 3.66, PX0 + 3.82, 0.02, 0.18, -14.13, -14.07, worn, '#6a5a50');
    // the kei truck, nose out toward the back wall
    keiTruck(W.sub({ pos: [-3.3, 0, -16.1], rot: [0, 2.72, 0] }));
    // crates
    let s = W.sub({ pos: [-4.5, 0, -14.1], rot: [0, 0.3, 0] });
    crateWood(s); crateWood(s.sub({ pos: [0.04, 0.42, 0], rot: [0, -0.2, 0] })); crateWood(s.sub({ pos: [-0.68, 0, 0.04], rot: [0, 0.1, 0] }), 0.62, 0.42, 0.44, C.silver); crateMilk(s.sub({ pos: [-0.66, 0.42, 0.04], rot: [0, 0.3, 0] }), '#c9b45a');
    crateMilk(s.sub({ pos: [0.6, 0, 0.36], rot: [0, -0.5, 0] }), '#6f9fb0'); crateMilk(s.sub({ pos: [0.6, 0.3, 0.36], rot: [0, -0.3, 0] }), '#6f9fb0'); crateMilk(s.sub({ pos: [0.62, 0.6, 0.34], rot: [0, -0.8, 0] }), '#b5574a');
    clump([-4.9, 0.3, -13.8], 0.5, 0.36, 60, { y0: 0.02 });
    s = W.sub({ pos: [0.1, 0, -14.1], rot: [0, -0.2, 0] }); crateWood(s, 0.7, 0.46, 0.5, C.silver); crateWood(s.sub({ pos: [0, 0.46, 0], rot: [0, 0.5, 0] })); drum(W.sub({ pos: [-0.86, 0, -14.1] })); drum(W.sub({ pos: [-1.4, 0.3, -13.92], rot: [Math.PI / 2 - 0.06, 0, 1.3] }), 0.29, 0.86, '#b5805a');
    // vending-machine shed, opening onto the east sidewalk
    const sh = W.sub({ pos: [0.42, 0, -17.5] }), w = 0.84, d = 1.32, hF = 2.54, hB = 2.3;
    for (const [x, z, h] of [[-w, -d, hB], [-w, d, hB], [w, -d, hF], [w, d, hF]]) sh.box(x - 0.04, x + 0.04, 0, h, z - 0.04, z + 0.04, worn, '#7a6a5c');
    for (const z of [-d, d]) sh.beam([-w, hB, z], [w, hF, z], 0.05, 0.09, worn, '#7a6a5c');
    sh.add(corr(2.2, 3.0, 8).rotateY(Math.PI / 2), worn, { pos: [0, (hB + hF) / 2 + 0.07, 0], rot: [0, 0, Math.atan2(hF - hB, 2 * w)], color: '#a56a4e' });
    sh.add(corr(2.7, 1.6, 7), worn, { pos: [-w, 1.2, 0], rot: [0, Math.PI / 2, Math.PI / 2], color: '#8f6a56' });
    sh.add(corr(1.68, 1.34, 5), worn, { pos: [0, 0.72, -d], rot: [Math.PI / 2, 0, 0], color: '#94705a' });
    sh.box(-w, w, 0, 0.06, -d, d, 'concrete', C.footing);
    const vm = sh.sub({ pos: [-0.06, 0.06, 0.3], rot: [0, Math.PI / 2, 0.012] });
    vm.box(-0.5, 0.5, 0, 1.86, -0.38, 0.38, worn, '#d6dccc'); vm.add(atlas.quad(0.96, 1.72, 'vend'), atlasMat, { pos: [0, 0.96, 0.385] });
    vm.box(-0.4, 0.4, 1.68, 1.78, 0.38, 0.42, 'flat', '#efe9d6');
    const vm2 = sh.sub({ pos: [-0.2, 0.06, -0.8], rot: [0, Math.PI / 2, 0] }); vm2.box(-0.4, 0.4, 0, 1.2, -0.28, 0.28, worn, '#b9c4b4'); vm2.box(-0.36, 0.36, 0.86, 1.14, 0.28, 0.3, 'flat', '#3c4e52');
    vine([[0.1, 0.06, -16.2], [0.2, 1.0, -16.26], [0.6, 2.0, -16.2], [1.1, 2.56, -16.4], [0.9, 2.62, -17.6]], 0.02, 0.008);
    clump([1.15, 2.6, -16.5], 0.42, 0.24, 70, { s: 0.15 }); clump([0.1, 0.4, -15.9], 0.46, 0.36, 60, { y0: 0.02 }); ivy([-0.42, 0, -16.14], [1, 0, 0], [0, 1, 0], [0, 0, 1], 1.7, 1.6, 90, { s: 0.14 });
    // weeds along the walls and the lane
    for (const [x, z, rx, rz, n] of [[-5.0, ZN + 0.4, 5, 0.3, 200], [-3.0, ZW - 0.32, 3.4, 0.26, 130], [-6.0, ZW + 0.3, 5, 0.26, 200], [-9.0, -12.4, 1.8, 0.6, 90], [-3.2, -14.6, 1.8, 1.0, 120], [-3.8, -18.8, 1.8, 0.5, 90]]) grass(x, z, rx, n, { h: 0.56, rz });
    fern(-1.2, 0.03, -18.9, 1); fern(-5.3, 0.03, -14.8, 0.9); fern(XW + 0.4, 0.03, -13.9, 0.9);
    ivy([XW + 0.12, 0, -17.5], [0, 0, 1], [0, 1, 0], [1, 0, 0], 3.2, 1.2, 110, { s: 0.13 });
    ivy([-4.6, 0, ZN + 0.12], [1, 0, 0], [0, 1, 0], [0, 0, 1], 3, 1.3, 110, { s: 0.13 });
    ivy([-9.6, 0, ZW - 0.12], [1, 0, 0], [0, 1, 0], [0, 0, -1], 3, 1.2, 100, { s: 0.13, keep: (p) => !inBreach(p) });
    clump([-1.6, 0.3, -19.0], 0.56, 0.42, 80, { y0: 0.02 });
  }

  /* ================================================================== assembly ===================================== */
  group.add(b.build());
  group.add(roof.mesh(roofMat));
  const soft = ctx.softEdge(softB.build({ castShadow: false, receiveShadow: true })); group.add(soft);
  group.add(ctx.noOutline(glassB.build({ castShadow: false, receiveShadow: false })));
  group.add(shellMesh(leaves, [0, 0, 0], true));
  const sapling = shellMesh(swayLeaves, saplingPivot, false); group.add(sapling);
  // the loose upper shutter on the tofu shop
  const shutB = ctx.batch(), shutS = new Stage({ b: shutB, kit });
  const hingeX = HX[1] - 0.52, shutter = new THREE.Group(); shutter.position.set(hingeX, 0, ZF + 0.1);
  lattice(shutS, -0.84, 0, 3.8, 4.44, 0, { n: 7, rails: 1, slat: C.silver }); shutter.add(shutB.build({ castShadow: false, receiveShadow: true })); group.add(shutter);
  // red paper lantern outside the bar
  const lanB = ctx.batch(), lanS = new Stage({ b: lanB, kit }), lantern = new THREE.Group(); lantern.position.set(HX[2] + 1.26, 2.58, ZF + 0.66);
  lanS.rod([0, 0, 0], [0, -0.16, 0], 0.006, 'flat', '#3e3a36', 4); lanS.add(kit.cyl(0.05, 0.05, 0.03, 8), 'flat', { pos: [0, -0.17, 0], color: '#2f3036' });
  { const pts = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push(new THREE.Vector2(0.03 + Math.sin(a) * 0.15, -Math.cos(a) * 0.23)); }
    lanS.add(new THREE.LatheGeometry(pts, 14), 'flat', { pos: [0, -0.42, 0], rot: [Math.PI, 0, 0], color: '#c8483a' });
    for (const y of [-0.3, -0.42, -0.54]) lanS.add(kit.torus(0.17 - Math.abs(y + 0.42) * 0.55, 0.004, 3, 16), 'flat', { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], color: '#8f3a30' });
    lanS.add(kit.box(0.09, 0.24, 0.005), 'flat', { pos: [0, -0.42, 0.178], color: '#efe4c4' }); lanS.add(kit.cyl(0.055, 0.055, 0.03, 8), 'flat', { pos: [0, -0.665, 0], color: '#2f3036' }); }
  lantern.add(lanB.build({ castShadow: false, receiveShadow: false })); group.add(lantern);
  // grass
  if (blades.length) {
    const g = kit.blade(1, 0.075, 0.26, 2), nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
    const mesh = new THREE.InstancedMesh(g, ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, translucent: 0.5 }), blades.length), m = new M4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new V3();
    blades.forEach((l, i) => { e.set(rng.range(-0.1, 0.1), l.yaw, rng.range(-0.1, 0.1), 'YXZ'); q.setFromEuler(e); m.compose(one.set(l.x, l.y, l.z), q, new V3(l.h, l.h, l.h)); mesh.setMatrixAt(i, m); mesh.setColorAt(i, l.c); });
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; group.add(ctx.softEdge(mesh));
  }
  // cloth
  const clothMat = ctx.toon({ map: atlas.tex, vertexColors: true, side: THREE.DoubleSide, translucent: 0.7, dapple: false });
  const cg = new THREE.BufferGeometry(), cPos = new Float32Array(cl.pos), cRest = cPos.slice(), cW = new Float32Array(cl.w), cPh = new Float32Array(cl.ph);
  cg.setAttribute('position', new THREE.BufferAttribute(cPos, 3)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(cl.nor, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(cl.uv, 2)); cg.setAttribute('color', new THREE.Float32BufferAttribute(cl.col, 3)); cg.setIndex(cl.idx);
  cg.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const clothMesh = new THREE.Mesh(cg, clothMat); clothMesh.frustumCulled = false; clothMesh.castShadow = false; clothMesh.receiveShadow = true; group.add(clothMesh);

  return {
    group,
    update(t) {
      for (let n = 0; n < cl.sheets.length; n++) {
        const s = cl.sheets[n], g = ctx.wind(t, s.x, s.z), base = s.amp * (0.5 + 0.8 * g);
        for (let i = s.i0; i < s.i1; i++) {
          const w = cW[i], d = w * (base + s.amp * 0.42 * Math.sin(t * 2.3 + cPh[i])), k = i * 3;
          cPos[k] = cRest[k] + s.nx * d; cPos[k + 1] = cRest[k + 1] + Math.abs(d) * w * 0.3; cPos[k + 2] = cRest[k + 2] + s.nz * d;
        }
      }
      cg.attributes.position.needsUpdate = true;
      const g0 = ctx.wind(t, -16, -15), g1 = ctx.wind(t, -18, 0), g2 = ctx.wind(t, -13, 1);
      sapling.rotation.x = 0.05 * g0 + 0.012 * Math.sin(t * 2.7); sapling.rotation.z = 0.045 * Math.sin(t * 0.8 + 1) + 0.012 * Math.sin(t * 2.2);
      shutter.rotation.y = 1.04 + 0.1 * g1 + 0.022 * Math.sin(t * 1.9);
      lantern.rotation.x = 0.12 * g2 + 0.03 * Math.sin(t * 1.7); lantern.rotation.z = 0.05 * Math.sin(t * 1.1 + 2) + 0.03 * g2;
    },
  };
}
