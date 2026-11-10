// street.js — street furniture of the reclaimed corner. Every prop is built in world space through a
// handful of shared batches (one merged mesh per material) plus a few small swaying groups.
// All painted detail (posters, timetables, magazine covers, labels, cracked glass) lives in ONE canvas atlas.
import * as THREE from 'three';

const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion;
const UP = new V3(0, 1, 0);
const v = (p) => (p instanceof V3 ? p.clone() : new V3(p[0], p[1], p[2]));
const lerp3 = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans CJK JP","Noto Sans JP",sans-serif';
const SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif CJK JP",serif';

/* ------------------------------------------------------------------ painted atlas ------------------------------- */
function buildAtlas(ctx) {
  const { P } = ctx, S = 2048, R = {}, rr = ctx.seeded('street-atlas');
  const tex = ctx.canvasTexture(S, S, (g) => {
    const reg = (name, x, y, w, h, draw) => { R[name] = [x, y, w, h]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h); g.restore(); };
    const wash = (w, h, a = 0.25, c = '#f3ecd9') => { g.fillStyle = c; g.globalAlpha = a; g.fillRect(0, 0, w, h); g.globalAlpha = 1; };
    const blot = (w, h, n, cols, r0, r1, a) => { for (let i = 0; i < n; i++) { g.fillStyle = rr.pick(cols); g.globalAlpha = a * (0.5 + rr() * 0.5); g.beginPath(); g.ellipse(rr() * w, rr() * h, rr.range(r0, r1), rr.range(r0, r1) * 0.7, rr() * 3, 0, 6.3); g.fill(); } g.globalAlpha = 1; };
    const scratches = (w, h, n, c = 'rgba(255,250,235,.55)') => { g.strokeStyle = c; for (let i = 0; i < n; i++) { g.lineWidth = rr.range(0.6, 2); g.beginPath(); const x = rr() * w, y = rr() * h; g.moveTo(x, y); g.lineTo(x + rr.range(-40, 40), y + rr.range(10, 70)); g.stroke(); } };
    const text = (s, x, y, size, col, { font = FONT, weight = 800, align = 'center', vertical = false } = {}) => {
      g.font = `${weight} ${size}px ${font}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle';
      if (vertical) [...s].forEach((c, i) => g.fillText(c, x, y + i * size * 1.08)); else g.fillText(s, x, y);
    };

    // billboard poster: a faded summer soda ad (invented brand), landscape
    reg('poster', 0, 0, 1024, 580, (w, h) => {
      const l = g.createLinearGradient(0, 0, 0, h); l.addColorStop(0, '#8fd6d8'); l.addColorStop(0.58, '#d7efd8'); l.addColorStop(1, '#f7e7b6');
      g.fillStyle = l; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd98a'; g.beginPath(); g.arc(770, 210, 150, 0, 6.3); g.fill();
      g.fillStyle = '#ffeec4'; g.beginPath(); g.arc(770, 210, 104, 0, 6.3); g.fill();
      g.fillStyle = '#7cc8c4'; g.beginPath(); g.moveTo(0, 420);
      for (let x = 0; x <= w; x += 40) g.quadraticCurveTo(x + 20, 390 + Math.sin(x * 0.02) * 16, x + 40, 420);
      g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.fillStyle = '#f5f0e0'; for (const [x, y, s] of [[170, 80, 1], [430, 60, 1.3], [980, 90, 0.7]]) { g.beginPath(); g.ellipse(x, y, 90 * s, 22 * s, 0, 0, 6.3); g.ellipse(x + 40 * s, y - 16 * s, 54 * s, 22 * s, 0, 0, 6.3); g.fill(); }
      // bottle
      g.fillStyle = '#5fb6a8'; g.beginPath(); g.moveTo(560, 120); g.lineTo(610, 120); g.lineTo(612, 190); g.quadraticCurveTo(662, 240, 660, 300); g.lineTo(660, 500); g.quadraticCurveTo(585, 524, 510, 500); g.lineTo(510, 300); g.quadraticCurveTo(508, 240, 558, 190); g.fill();
      g.fillStyle = '#cfeee0'; g.fillRect(530, 330, 110, 110); g.fillStyle = '#d0655a'; g.fillRect(556, 104, 58, 24);
      text('南風', 585, 368, 44, '#c8605a', { font: SERIF }); text('SODA', 585, 412, 26, '#3f8f8c');
      text('夏、ふたたび。', 56, 210, 84, '#c8605a', { font: SERIF, align: 'left' });
      text('南風ソーダ', 60, 330, 58, '#2f8b8c', { align: 'left' });
      text('冷やして、海へ行こう。', 62, 404, 30, '#3d7f88', { weight: 600, align: 'left' });
      wash(w, h, 0.2); blot(w, h, 60, ['#ffffff', '#f5e7c8', '#d7c9a8'], 8, 46, 0.22); scratches(w, h, 70);
      blot(w, 90, 14, ['#b5522f', '#7d3a2a'], 3, 12, 0.5);
    });
    // older poster layer showing through the tear
    reg('poster2', 0, 580, 512, 288, (w, h) => {
      g.fillStyle = '#d9c9a0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8705e'; g.fillRect(0, 0, w, 90);
      text('大売出し', 256, 46, 66, '#f6ecd0', { font: SERIF });
      for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(95,90,80,.55)'; g.fillRect(40, 120 + i * 30, 280 + rr() * 130, 14); }
      blot(w, h, 40, ['#efe4c6', '#b9a57e'], 6, 28, 0.35);
    });
    // route board
    reg('route', 1024, 0, 640, 380, (w, h) => {
      g.fillStyle = '#e9e6d4'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a93a4'; g.fillRect(0, 0, w, 62);
      text('路線案内  みどり坂 系統', 20, 32, 34, '#f4f0e0', { align: 'left' });
      const line = (pts, c) => { g.strokeStyle = c; g.lineWidth = 11; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
      line([[40, 150], [220, 150], [300, 230], [600, 230]], '#c8705e');
      line([[40, 300], [260, 300], [340, 230], [430, 130], [600, 130]], '#6f9fb0');
      line([[140, 340], [140, 90]], '#d7b84e');
      const stops = [[40, 150, '港口'], [140, 150, '市場前'], [220, 150, '桜橋'], [300, 230, '駅前'], [430, 230, 'みどり坂'], [600, 230, '市民の森'], [40, 300, '海浜公園'], [260, 300, '第二団地'], [430, 130, '図書館'], [600, 130, '山手']];
      for (const [x, y, n] of stops) { g.fillStyle = '#fbf6e6'; g.strokeStyle = '#3f4a50'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 12, 0, 6.3); g.fill(); g.stroke(); text(n, x + 2, y - 28, 22, '#4b5459', { weight: 700 }); }
      wash(w, h, 0.22); blot(w, h, 26, ['#f3ecd9', '#cfc7ae'], 10, 50, 0.3); scratches(w, h, 40); blot(w, h, 10, ['#b5522f'], 2, 9, 0.5);
    });
    // timetable
    reg('timetable', 1664, 0, 256, 380, (w, h) => {
      g.fillStyle = '#efe9d6'; g.fillRect(0, 0, w, h); g.fillStyle = '#6f9fb0'; g.fillRect(0, 0, w, 54);
      text('時刻表', w / 2, 28, 34, '#f8f3e2');
      g.fillStyle = '#58626a'; for (let i = 0; i < 15; i++) { const y = 66 + i * 20.5; text(String(6 + i), 24, y + 6, 15, '#58626a', { weight: 700 }); for (let k = 0; k < rr.int(2, 6); k++) g.fillRect(48 + k * 32, y, 22, 12); g.fillRect(8, y + 16, w - 16, 1); }
      wash(w, h, 0.34); blot(w, h, 20, ['#f3ecd9', '#d8cfae'], 8, 36, 0.4);
    });
    // bus stop head
    reg('busHead', 1792, 380, 256, 256, (w, h) => {
      g.fillStyle = '#e9e4d0'; g.fillRect(0, 0, w, h); g.fillStyle = '#6f9fb0'; g.beginPath(); g.arc(128, 128, 122, 0, 6.3); g.fill();
      g.fillStyle = '#efe9d6'; g.beginPath(); g.arc(128, 128, 96, 0, 6.3); g.fill();
      g.fillStyle = '#c8705e'; g.fillRect(40, 96, 176, 64);
      g.fillStyle = '#5b8795'; g.fillRect(70, 62, 116, 26); g.fillStyle = '#efe9d6'; g.fillRect(82, 68, 24, 14); g.fillRect(114, 68, 24, 14); g.fillRect(146, 68, 24, 14);
      g.fillStyle = '#5b8795'; g.beginPath(); g.arc(96, 92, 9, 0, 6.3); g.arc(160, 92, 9, 0, 6.3); g.fill();
      text('みどり坂', 128, 128, 36, '#f7f1dd'); text('のりば', 128, 186, 26, '#55707c');
      wash(w, h, 0.18); blot(w, h, 22, ['#b5522f', '#7d3a2a', '#d9764a'], 3, 16, 0.55);
    });
    // vending machine: side graphic, header, label strips
    reg('vendSide', 1024, 380, 300, 620, (w, h) => {
      const l = g.createLinearGradient(0, 0, 0, h); l.addColorStop(0, '#ec9f7e'); l.addColorStop(1, '#e08a70'); g.fillStyle = l; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f2e6c8'; g.beginPath(); g.moveTo(0, 360); for (let x = 0; x <= w; x += 10) g.lineTo(x, 340 + Math.sin(x * 0.03) * 30); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      g.fillStyle = '#6fb0ba'; g.beginPath(); g.moveTo(0, 450); for (let x = 0; x <= w; x += 10) g.lineTo(x, 440 + Math.sin(x * 0.03 + 2) * 26); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      text('つゆくさ', 150, 100, 58, '#f7eed6', { font: SERIF }); text('飲料', 150, 176, 72, '#f7eed6', { font: SERIF });
      g.fillStyle = '#f7eed6'; g.beginPath(); g.arc(150, 268, 34, 0, 6.3); g.fill(); g.fillStyle = '#ec9f7e'; g.beginPath(); g.arc(164, 258, 28, 0, 6.3); g.fill();
      wash(w, h, 0.16); blot(w, h, 24, ['#f3ecd9', '#ecd3a8'], 8, 40, 0.22); blot(w, h, 9, ['#a8553a'], 3, 12, 0.4); scratches(w, h, 50);
    });
    reg('vendHead', 1324, 380, 468, 110, (w, h) => {
      g.fillStyle = '#efe6cd'; g.fillRect(0, 0, w, h); g.fillStyle = '#5f97b3'; g.fillRect(0, 0, w * 0.62, h); g.fillStyle = '#c8604f'; g.fillRect(w * 0.62, 0, w * 0.38, h);
      text('つめたい', w * 0.31, 56, 58, '#f8f2de'); text('あったか', w * 0.81, 56, 40, '#f8f2de');
      wash(w, h, 0.18); blot(w, h, 12, ['#f3ecd9'], 5, 20, 0.35);
    });
    reg('vendPick', 1324, 490, 468, 70, (w, h) => { g.fillStyle = '#3c4e52'; g.fillRect(0, 0, w, h); text('取り出し口', w / 2, 36, 40, '#c9d2c8', { weight: 700 }); wash(w, h, 0.08); });
    reg('vendInfo', 1324, 560, 234, 128, (w, h) => {
      g.fillStyle = '#ded6bf'; g.fillRect(0, 0, w, h); g.fillStyle = '#4e5a5e'; for (let i = 0; i < 4; i++) g.fillRect(16, 16 + i * 26, 200 - i * 20, 10);
      g.fillStyle = '#c8604f'; g.fillRect(16, 110, 64, 8);
    });
    // kiosk sign
    reg('kioskSign', 1024, 1000, 800, 130, (w, h) => {
      g.fillStyle = '#e9e1c6'; g.fillRect(0, 0, w, h); g.fillStyle = '#5f8f7a'; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
      text('新聞・雑誌', 230, 68, 74, '#b4543f', { font: SERIF }); text('みどり堂', 610, 68, 80, '#3f7a70', { font: SERIF });
      wash(w, h, 0.16); blot(w, h, 16, ['#b5522f', '#8b5a3c'], 3, 20, 0.45);
    });
    // magazine covers (all invented)
    const covers = [
      ['週刊みどり', '#7fb6a6', '#f4e9c6', (w, h) => { g.fillStyle = '#f0c76a'; g.beginPath(); g.arc(w * 0.5, h * 0.6, 56, 0, 6.3); g.fill(); g.fillStyle = '#5a9a88'; g.fillRect(0, h * 0.78, w, h); }],
      ['月刊 猫日和', '#e4b98a', '#7d4d3a', (w, h) => { g.fillStyle = '#7d5a48'; g.beginPath(); g.ellipse(w * 0.5, h * 0.66, 46, 42, 0, 0, 6.3); g.fill(); g.beginPath(); g.moveTo(w * 0.28, h * 0.52); g.lineTo(w * 0.34, h * 0.4); g.lineTo(w * 0.44, h * 0.5); g.moveTo(w * 0.72, h * 0.52); g.lineTo(w * 0.66, h * 0.4); g.lineTo(w * 0.56, h * 0.5); g.fill(); }],
      ['星の庭', '#51708e', '#f0e6bd', (w, h) => { g.fillStyle = '#f0e6bd'; for (let i = 0; i < 26; i++) g.fillRect(rr() * w, 50 + rr() * (h - 50), 4, 4); g.beginPath(); g.arc(w * 0.66, h * 0.42, 30, 0, 6.3); g.fill(); }],
      ['海と旅', '#8fcdd2', '#2f6f88', (w, h) => { g.fillStyle = '#f4efdc'; g.beginPath(); g.moveTo(w * 0.3, h * 0.72); g.lineTo(w * 0.6, h * 0.34); g.lineTo(w * 0.62, h * 0.72); g.fill(); g.fillStyle = '#4f9fb0'; g.fillRect(0, h * 0.74, w, h); }],
      ['少年ポケット', '#d8705a', '#f8efcf', (w, h) => { g.fillStyle = '#f2cf62'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * 0.628 - 1.57, r = i % 2 ? 26 : 62; g.lineTo(w * 0.5 + Math.cos(a) * r, h * 0.62 + Math.sin(a) * r); } g.fill(); }],
      ['台所だより', '#e7dcc0', '#7a5a42', (w, h) => { g.fillStyle = '#c98a6a'; g.fillRect(w * 0.2, h * 0.4, w * 0.6, h * 0.42); g.fillStyle = '#7fae7a'; g.beginPath(); g.arc(w * 0.5, h * 0.4, 34, 0, 6.3); g.fill(); }],
      ['朝刊', '#ecead9', '#4e5659', (w, h) => { g.fillStyle = '#7a8488'; for (let c = 0; c < 4; c++) for (let i = 0; i < 12; i++) g.fillRect(12 + c * 36, 60 + i * 14, 28, 7); g.fillStyle = '#b6b4a2'; g.fillRect(12, 150, 96, 60); }],
      ['電波ラジオ', '#b6d27a', '#3e6a52', (w, h) => { g.strokeStyle = '#3e6a52'; g.lineWidth = 7; for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(w * 0.5, h * 0.8, i * 38, 3.6, 5.8); g.stroke(); } }],
    ];
    covers.forEach(([title, bg, ink, art], i) => reg(`mag${i}`, 512 + (i % 4) * 128, 580 + ((i / 4) | 0) * 180, 128, 180, (w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.save(); g.scale(w / 160, h / 220); art(160, 220); g.restore();
      const size = title.length > 5 ? 19 : 25; text(title, w / 2, 24, size, ink, { font: SERIF });
      wash(w, h, 0.22); blot(w, h, 9, ['#f3ecd9', '#cdbf9f'], 3, 16, 0.4);
    }));
    // guard sleeve for the utility pole
    reg('tiger', 0, 868, 256, 256, (w, h) => { g.fillStyle = '#e8c656'; g.fillRect(0, 0, w, h); g.fillStyle = '#39444a'; g.save(); g.rotate(-0.6); for (let i = -8; i < 12; i++) g.fillRect(-300, i * 46, 900, 23); g.restore(); wash(w, h, 0.18); blot(w, h, 16, ['#b5522f', '#7d3a2a'], 3, 13, 0.5); });
    // barricade stripe
    reg('stripe', 256, 868, 256, 40, (w, h) => { g.fillStyle = '#f2ead6'; g.fillRect(0, 0, w, h); g.fillStyle = '#d0473a'; g.save(); g.transform(1, 0, 0.9, 1, -30, 0); for (let i = 0; i < 7; i++) g.fillRect(i * 44, 0, 22, h); g.restore(); blot(w, h, 10, ['#f6ecd8', '#b5522f'], 2, 7, 0.5); });
    // dark signal lenses
    [['#6f2d2f', '#a35247'], ['#7a5a26', '#b08a42'], ['#1f5f5a', '#3f8a7d']].forEach(([d, l], i) => reg(`lens${i}`, 256 + i * 96, 912, 96, 96, (w, h) => {
      g.fillStyle = d; g.fillRect(0, 0, w, h); g.fillStyle = l; g.beginPath(); g.ellipse(36, 32, 22, 13, -0.6, 0, 6.3); g.fill();
      g.strokeStyle = 'rgba(235,240,225,.7)'; g.lineWidth = 2; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(52, 54); let x = 52, y = 54, a = k * 1.3 + i; for (let s = 0; s < 4; s++) { a += rr.range(-0.5, 0.5); x += Math.cos(a) * 15; y += Math.sin(a) * 15; g.lineTo(x, y); } g.stroke(); }
    }));
    // small plates
    reg('plate', 256, 1008, 256, 96, (w, h) => { g.fillStyle = '#e4dfc8'; g.fillRect(0, 0, w, h); g.fillStyle = '#5f8f8a'; g.fillRect(0, 0, 14, h); text('みどり坂 二丁目', 134, 50, 26, '#3f6a6a'); blot(w, h, 8, ['#b5522f'], 3, 12, 0.5); });
    reg('shelterAd', 1324, 688, 234, 312, (w, h) => {
      g.fillStyle = '#d7e6cf'; g.fillRect(0, 0, w, h); g.fillStyle = '#f0c76a'; g.beginPath(); g.arc(w * 0.5, 120, 72, 0, 6.3); g.fill();
      text('市民の森', w / 2, 232, 40, '#3f7a70', { font: SERIF }); text('花の季節です', w / 2, 278, 22, '#5f8f7a', { weight: 600 });
      wash(w, h, 0.26); blot(w, h, 18, ['#f3ecd9', '#c9c0a2'], 6, 30, 0.4);
    });
    // cracked glass: transparent background, tint + cracks + glare band
    const glass = (name, x, y, hub) => reg(name, x, y, 512, 512, (w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(190,232,226,.26)'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.26)'; g.save(); g.rotate(-0.5); g.fillRect(-120, 120, 900, 54); g.fillRect(-120, 200, 900, 18); g.restore();
      g.strokeStyle = 'rgba(245,255,250,.95)';
      for (let k = 0; k < 15; k++) { g.lineWidth = rr.range(1.4, 3.2); g.beginPath(); let px = hub[0], py = hub[1], a = (k / 15) * 6.28 + rr() * 0.3; g.moveTo(px, py); for (let s = 0; s < 8; s++) { a += rr.range(-0.3, 0.3); px += Math.cos(a) * rr.range(30, 70); py += Math.sin(a) * rr.range(30, 70); g.lineTo(px, py); if (rr() < 0.25) { g.lineTo(px + rr.range(-40, 40), py + rr.range(-40, 40)); g.moveTo(px, py); } } g.stroke(); }
      for (const r of [52, 110, 180]) { g.lineWidth = 1.5; g.beginPath(); for (let a = 0; a < 6.4; a += 0.52) { const q = r + rr.range(-12, 12); g.lineTo(hub[0] + Math.cos(a) * q, hub[1] + Math.sin(a) * q); } g.closePath(); g.stroke(); }
    });
    glass('glassA', 1024, 1130, [330, 330]); glass('glassB', 1536, 1130, [160, 250]);
  }, { repeat: false });
  tex.needsUpdate = true;
  /** Remap 0..1 uvs into a named atlas cell. */
  const uvTo = (geo, name) => {
    const [x, y, w, h] = R[name], uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + 1.5 + uv.getX(i) * (w - 3)) / S, 1 - (y + 1.5 + (1 - uv.getY(i)) * (h - 3)) / S);
    return geo;
  };
  const quad = (w, h, name) => uvTo(new THREE.PlaneGeometry(w, h), name);
  /** Flat polygon (with holes) in a w×h rect centered at 0; uv follows the rect, so it looks torn from the full image. */
  const poly = (w, h, name, outline, holes = []) => {
    const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const o of holes) sh.holes.push(new THREE.Path(o.map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ShapeGeometry(sh), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
    return uvTo(g, name);
  };
  return { tex, quad, poly, uvTo };
}

/* ------------------------------------------------------------------ materials ----------------------------------- */
/** Painted steel with hard-edged, world-space rust blooms that run down the metal. Still the shared toon ramp. */
function wornMaterial(ctx) {
  const { P } = ctx, m = ctx.toon({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide });
  const c = (h) => { const k = new THREE.Color(h); return `vec3(${k.r.toFixed(3)},${k.g.toFixed(3)},${k.b.toFixed(3)})`; };
  const base = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (s, r) => {
    base(s, r);
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
      {
        vec2 q=vec2(vWPos.x*.8+vWPos.z*1.05+(vWNorm.x*1.1-vWNorm.z*.9+vWNorm.y*.8)*.42,vWPos.y*.42);
        float n=texture2D(uNoise,q*.31).r*.56+texture2D(uNoise,q*.9+.3).g*.44;
        float low=smoothstep(2.6,0.,vWPos.y)*.03;
        float a=smoothstep(.565-low,.572-low,n), b=smoothstep(.615-low,.622-low,n);
        diffuseColor.rgb=mix(diffuseColor.rgb,mix(${c(P.rust)},${c(P.rustDark)},b),a);
      }`);
  };
  m.customProgramCacheKey = () => key + '|worn';
  return m;
}

/* ------------------------------------------------------------------ stage: a transform plus target batches ------- */
class Stage {
  constructor(t, m = new M4()) { this.t = t; this.m = m; }
  sub(o) { return new Stage(this.t, new M4().multiplyMatrices(this.m, this.t.kit.xf(o))); }
  mx(o) { return new M4().multiplyMatrices(this.m, this.t.kit.xf(o)); }
  add(g, mat = 'flat', o = {}) { this.t.main.add(g, mat, { matrix: this.mx(o), color: o.color }); return this; }
  soft(g, mat, o = {}) { this.t.soft.add(g, mat, { matrix: this.mx(o), color: o.color }); return this; }
  glass(g, o = {}) { this.t.glass.add(g, this.t.glassMat, { matrix: this.mx(o), color: o.color }); return this; }
  w(p) { return v(p).applyMatrix4(this.m); }
}

export function build(ctx) {
  const { P, kit, layout } = ctx, { STREET, GROUND, WIRES } = layout;
  const rng = ctx.rng, group = new THREE.Group();
  const SW = GROUND.sidewalkY, SOIL = GROUND.soilY;
  const atlas = buildAtlas(ctx), worn = wornMaterial(ctx);
  const leafMat = ctx.toon({ color: '#ffffff', vertexColors: true, translucent: 0.85, side: THREE.DoubleSide });
  const signMat = ctx.toon({ map: atlas.tex, color: '#ffffff', vertexColors: true, side: THREE.DoubleSide });
  const glassMat = ctx.toon({ map: atlas.tex, color: '#ffffff', vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const main = ctx.batch(), softB = ctx.batch(), glassB = ctx.batch();
  const T = { main, soft: softB, glass: glassB, glassMat, kit };
  const W = new Stage(T);
  const at = (x, y, z, yaw = 0, rx = 0, rz = 0) => new Stage(T, kit.xf({ pos: [x, y, z], rot: [rx, yaw, rz] }));

  const steel = '#8fa39f', steelDark = '#5f6f70', cream = '#e8e0c8', ink = '#3a474b';
  const ivyPal = [P.ivy, P.ivyLit, P.leafMid, P.leafDeep, P.ivy, P.leafLit];
  const grassPal = [P.grass, P.grassLit, P.leafMid, P.moss, P.leafLit];
  const fernPal = [P.fern, P.leafMid, P.leafDeep, P.ivyLit];
  const pick = rng.pick;

  /* ---------- geometry helpers ---------- */
  const rod = (a, b, r0, r1 = r0, seg = 6) => {
    const A = v(a), d = v(b).sub(A), L = d.length(), g = kit.cyl(r1, r0, L, seg).translate(0, L / 2, 0);
    g.applyQuaternion(new Q().setFromUnitVectors(UP, d.normalize())).translate(A.x, A.y, A.z); return g;
  };
  const bar = (a, b, w, h) => {
    const A = v(a), d = v(b).sub(A), L = d.length(), g = kit.box(w, L, h).translate(0, L / 2, 0);
    g.applyQuaternion(new Q().setFromUnitVectors(UP, d.normalize())).translate(A.x, A.y, A.z); return g;
  };
  const chipped = (g, a) => kit.chip(g, a, rng);
  /** Rim teeth on an open shell: any vertex selected by test() gets a hashed offset. */
  const jagRim = (g, amt, test, axis = 'y') => {
    const p = g.attributes.position, seen = new Map(), idx = { x: 0, y: 1, z: 2 }[axis];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (!test(x, y, z)) continue;
      const k = `${x.toFixed(3)},${z.toFixed(3)},${y.toFixed(3)}`;
      if (!seen.has(k)) seen.set(k, rng() * amt);
      p.setComponent(i, idx, p.getComponent(i, idx) + seen.get(k) * (seen.size % 2 ? 1 : 0.25));
    }
    g.computeVertexNormals(); return g;
  };
  const roundRect = (w, h, r) => {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  };
  const roundBox = (w, h, d, r) => new THREE.ExtrudeGeometry(roundRect(w, h, r), { depth: d, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -d / 2);
  /** Thin-walled pipe along +y, base at y=0, torn at the top. height(a) sets the tear line; teeth are cut into it, the tallest curling outward.
   *  Returns {outer, inner}: inked outer wall plus rim, and inner wall on its own so it can take a darker colour. */
  const tornPipe = (r, t, len, height, rr, n = 28) => {
    const top = [], flare = [], A = (i) => (i / n) * 6.283186;
    for (let i = 0; i < n; i++) { const tooth = i % 2 ? rr.range(0.03, 0.07) : rr.range(0.09, 0.26) * (rr() < 0.3 ? 1.5 : 1); top.push(Math.min(len, height(A(i)) + tooth)); flare.push(i % 2 ? 0 : rr.range(0, 0.05)); }
    const wall = (rad, s, withRim) => {
      const pos = [], nor = [], idx = [], ring = (y, k) => { for (let i = 0; i <= n; i++) { const j = i % n, a = A(i), c = Math.cos(a), o = Math.sin(a), q = rad + flare[j] * k; pos.push(c * q, y === null ? top[j] : y, o * q); nor.push(c * s, 0, o * s); } };
      ring(0, 0); ring(null, 1);
      for (let i = 0; i < n; i++) { const a = i, b = i + 1, c = n + 1 + i, d = c + 1; s > 0 ? idx.push(a, c, b, b, c, d) : idx.push(a, b, c, b, d, c); }
      if (withRim) { // the cut edge of the wall: a sliver of bright bare steel
        for (let i = 0; i < n; i++) {
          const k = pos.length / 3, j = (i + 1) % n, a = A(i), b = A(i + 1), r0 = rad + flare[i], r1 = rad + flare[j];
          pos.push(Math.cos(a) * r0, top[i], Math.sin(a) * r0, Math.cos(b) * r1, top[j], Math.sin(b) * r1, Math.cos(b) * (r1 - t), top[j], Math.sin(b) * (r1 - t), Math.cos(a) * (r0 - t), top[i], Math.sin(a) * (r0 - t));
          for (let m = 0; m < 4; m++) nor.push(0, 1, 0);
          idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)); g.setIndex(idx); return g;
    };
    return { outer: wall(r, 1, true), inner: wall(r - t, -1, false), top, flare, r, n, A };
  };
  /** Rust scorch on the outside of a torn pipe, following its tear line down the wall by a jagged depth. */
  const tornBand = (p, depth, rr) => {
    const pos = [], nor = [], idx = [], { n, r, top, flare, A } = p, R1 = r + 0.003;
    for (let i = 0; i <= n; i++) {
      const j = i % n, a = A(i), c = Math.cos(a), o = Math.sin(a), q = R1 + flare[j];
      pos.push(c * R1, Math.max(0.01, top[j] - depth - rr.range(0.0, 0.07) * (i % 3 ? 1 : 2.4)), o * R1, c * q, top[j], o * q); nor.push(c, 0, o, c, 0, o);
    }
    for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)); g.setIndex(idx); return g;
  };
  /** Half-pipe visor along +z from z=0, centered on the top of a circle of radius r. */
  const hoodGeo = (r, len, arc, teeth = 0) => {
    const g = new THREE.CylinderGeometry(r, r * 1.02, len, 12, 2, true, Math.PI - arc / 2, arc).rotateX(Math.PI / 2).translate(0, 0, len / 2);
    return teeth ? jagRim(g, -teeth, (x, y, z) => z > len * 0.99, 'z') : g;
  };

  /* ---------- plant helpers ---------- */
  // rounder ivy leaf than kit.leaf: 8 triangles, center fold, base at origin, tip toward +z
  const LEAF = (() => {
    const w = 0.42, f = 0.13, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -w, f, 0.3, 0, 0, 0.28, w, f, 0.3, -w * 0.72, f * 0.7, 0.68, 0, 0, 0.66, w * 0.72, f * 0.7, 0.68, 0, 0.02, 1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 0, 0.3, 0.5, 0.3, 1, 0.3, 0.1, 0.7, 0.5, 0.7, 0.9, 0.7, 0.5, 1], 2));
    g.setIndex([0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 5, 4, 2, 3, 5, 3, 6, 5, 4, 5, 7, 5, 6, 7]); g.computeVertexNormals(); return g;
  })();
  const BLADES = [kit.blade(1, 0.1, 0.32, 3), kit.blade(1, 0.085, 0.55, 3), kit.blade(1, 0.12, 0.18, 3)];
  const FRONDS = [kit.frond(1, 6, 0.3), kit.frond(0.8, 5, 0.34)];
  const LUMPS = [0, 1, 2].map(() => chipped(kit.sphere(1, 14, 7), 0.16));
  const qa = new Q(), qb = new Q();
  const leafAt = (st, p, n, size, color, method = 'soft') => {
    qa.setFromUnitVectors(UP, n.clone().normalize()); qb.setFromAxisAngle(UP, rng() * 6.283); qa.multiply(qb);
    st[method](LEAF, leafMat, { matrix: new M4().compose(v(p), qa, new V3(size, size, size)), color });
  };
  const randDir = (upBias = 0.5) => { const d = new V3(rng() - 0.5, rng() - 0.5 + upBias, rng() - 0.5); return d.lengthSq() < 1e-3 ? UP.clone() : d.normalize(); };
  const sprig = (st, p, n, size, spread, pal = ivyPal, method = 'soft') => {
    for (let i = 0; i < n; i++) leafAt(st, [p[0] + (rng() - 0.5) * spread, p[1] + (rng() - 0.5) * spread, p[2] + (rng() - 0.5) * spread], randDir(0.45), size * rng.range(0.7, 1.2), pick(pal), method);
  };
  const tuft = (st, p, n = 9, h = 0.55, spread = 0.13, pal = grassPal, method = 'soft') => {
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.283, r = spread * Math.sqrt(rng()), s = h * rng.range(0.6, 1.25);
      st[method](pick(BLADES), leafMat, { pos: [p[0] + Math.cos(a) * r, p[1], p[2] + Math.sin(a) * r], rot: [0, rng() * 6.283, 0], scale: [s * 1.3, s, s], color: pick(pal) });
    }
  };
  const fern = (st, p, n = 5, s = 0.7, method = 'soft') => {
    for (let i = 0; i < n; i++) st[method](pick(FRONDS), leafMat, { pos: p, rot: [rng.range(-0.15, 0.25), (i / n) * 6.283 + rng() * 0.6, 0], scale: s * rng.range(0.75, 1.2), color: pick(fernPal) });
  };
  const posy = (st, p, n = 5, spread = 0.2, col = P.flowerWhite, method = 'soft') => {
    for (let i = 0; i < n; i++) {
      const x = p[0] + (rng() - 0.5) * spread, z = p[2] + (rng() - 0.5) * spread, h = rng.range(0.14, 0.34), y = p[1] + h;
      st[method](BLADES[0], leafMat, { pos: [x, p[1], z], rot: [0, rng() * 6.28, 0], scale: [0.5, h, 0.3], color: P.leafMid });
      st[method](leafFlower, leafMat, { pos: [x, y, z], rot: [rng.range(-0.3, 0.3), rng() * 6.28, 0], color: col });
      st[method](leafDot, leafMat, { pos: [x, y + 0.012, z], color: P.flowerYellow });
    }
  };
  const leafFlower = kit.flower(0.11, 5), leafDot = kit.ico(0.03, 0);
  /** Moss cushion: a squashed lumpy cap, draws no ink. */
  const moss = (st, p, r, col = P.moss) => {
    st.soft(pick(LUMPS), leafMat, { pos: p, rot: [rng.range(-0.06, 0.06), rng() * 6.28, rng.range(-0.06, 0.06)], scale: r, color: col });
    const top = col === P.mossLit ? P.grassLit : col === P.mossDeep ? P.moss : P.mossLit, a = rng() * 6.28;
    st.soft(pick(LUMPS), leafMat, { pos: [p[0] + Math.cos(a) * r[0] * 0.22, p[1] + r[1] * 0.42, p[2] + Math.sin(a) * r[2] * 0.22], rot: [0, rng() * 6.28, 0], scale: [r[0] * 0.62, r[1] * 0.72, r[2] * 0.62], color: top });
  };
  /** Vine: woody tube with leaves strung along it. */
  const vine = (st, pts, r0, r1, { leaves = 6, size = 0.2, pal = ivyPal, stem = '#7c6547', out = 0.04, method = 'add', emit = null } = {}) => {
    const c = new THREE.CatmullRomCurve3(pts.map(v)), L = c.getLength(), n = Math.round(L * leaves * 1.7);
    if (method === 'add') st.add(kit.tube(pts, r0, r1, 5, Math.max(6, Math.round(L * 5))), 'flat', { color: stem });
    else st[method](kit.tube(pts, r0, r1, 4, Math.max(6, Math.round(L * 4))), leafMat, { color: stem });
    if (emit) return emit(c, n, size, out); // the caller places the leaves itself
    const lm = method === 'add' ? 'soft' : method;
    for (let i = 0; i < n; i++) {
      const p = c.getPointAt(rng()), d = randDir(0.3);
      leafAt(st, [p.x + d.x * out, p.y + d.y * out, p.z + d.z * out], d, size * rng.range(0.62, 1.05), pick(pal), lm);
    }
  };
  /** Helix around a curve segment, for vines that climb poles. */
  const climb = (curve, t0, t1, r, turns, y = 0, n = 26) => Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1), p = curve.getPointAt(t0 + (t1 - t0) * u), a = u * turns * 6.283 + y;
    return [p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r];
  });
  const curveOf = (pts) => new THREE.CatmullRomCurve3(pts.map(v));

  /* ---------- shell foliage: the banyan recipe, for the one mass that sits close to the camera ---------- */
  // Every leaf is lit by a smooth normal of the clump it belongs to, so the cel terminator draws big readable masses instead of a lit/shade coin toss per leaf.
  const SUN = new V3(...layout.SUN_DIR);
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
  // Unit-length ovate leaf, four triangles. Base dark, tip light, so overlaps stay legible inside one tone band.
  const shellLeaf = new THREE.BufferGeometry();
  { const w = 0.8, c = 0.09;
    shellLeaf.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -w / 2, c, 0.3, -w * 0.4, c, 0.68, 0, 0, 1, w * 0.4, c, 0.68, w / 2, c, 0.3], 3));
    shellLeaf.setAttribute('color', new THREE.Float32BufferAttribute([0.72, 0.74, 0.72, 0.92, 0.92, 0.9, 1, 1, 0.98, 1.05, 1.05, 1, 1, 1, 0.98, 0.92, 0.92, 0.9], 3));
    shellLeaf.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    shellLeaf.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    shellLeaf.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4]); }
  const SHELL_TONE = [[0.72, new THREE.Color(P.leafLit).lerp(new THREE.Color(P.leafMid), 0.35).multiplyScalar(0.8)], [0.6, new THREE.Color(P.leafMid).multiplyScalar(0.8)], [0.4, new THREE.Color(P.leafDeep).multiplyScalar(0.92)], [-9, new THREE.Color(P.leafShade)]];
  const shellTone = (v) => SHELL_TONE.find(([min]) => v > min)[1];
  /** list: {p, shell, tip, s, tone}, all world-space. Instance positions are relative to pivot. */
  const shellMesh = (list, pivot, castShadow) => {
    const n = list.length, g = new THREE.BufferGeometry(), m = new M4(), T = new V3(), U = new V3(), B = new V3(), shell = new Float32Array(n * 3);
    for (const k of ['position', 'normal', 'uv', 'color']) g.setAttribute(k, shellLeaf.attributes[k]);
    g.setIndex(shellLeaf.index);
    const mesh = new THREE.InstancedMesh(g, shellMat, n);
    list.forEach((l, i) => {
      T.copy(l.tip); U.copy(l.shell).addScaledVector(T, -l.shell.dot(T)).normalize(); B.crossVectors(U, T).normalize();
      m.makeBasis(B, U, T).scale(new V3(l.s, l.s, l.s)); m.setPosition(l.p.x - pivot[0], l.p.y - pivot[1], l.p.z - pivot[2]);
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, l.tone); shell[i * 3] = l.shell.x; shell[i * 3 + 1] = l.shell.y; shell[i * 3 + 2] = l.shell.z;
    });
    g.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 3));
    mesh.position.set(...pivot); mesh.castShadow = castShadow; mesh.receiveShadow = false;
    return ctx.softEdge(mesh);
  };

  /* ---------- swaying groups (no shadows, one small mesh each) ---------- */
  const swayers = [];
  const sway = (pivot, build, { amp = 0.04, speed = 1, soft = true, axis = 'xz' } = {}) => {
    const b = ctx.batch(), t = { main: b, soft: b, glass: b, glassMat, kit };
    build(new Stage(t, new M4().makeTranslation(-pivot[0], -pivot[1], -pivot[2])));
    const g = b.build({ castShadow: false, receiveShadow: true });
    g.position.set(...pivot); if (soft) ctx.softEdge(g);
    swayers.push({ g, x: pivot[0], z: pivot[2], amp, speed, axis, ph: rng() * 6.28 }); group.add(g); return g;
  };

  /* ================================================================= lamp ================================ */
  function lamp() {
    const s = STREET.lamp, top = WIRES[3].a, x = s.x, z = s.z;
    W.add(chipped(kit.cylBase(0.34, 0.44, 0.2, 9), 0.035), 'concrete', { pos: [x, SW - 0.08, z] });
    W.add(kit.cylBase(0.15, 0.2, 0.62, 10), worn, { pos: [x, SW + 0.1, z], color: steel });
    W.add(kit.cylBase(0.21, 0.23, 0.08, 10), worn, { pos: [x, SW + 0.1, z], color: steelDark });
    W.add(kit.cylBase(0.17, 0.16, 0.06, 10), worn, { pos: [x, SW + 0.68, z], color: steelDark });
    W.add(kit.box(0.14, 0.3, 0.02), 'rust', { pos: [x + 0.09, SW + 0.42, z + 0.14], rot: [0, 0.55, 0] });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; W.add(kit.cylBase(0.018, 0.022, 0.05, 5), 'flat', { pos: [x + Math.cos(a) * 0.19, SW + 0.18, z + Math.sin(a) * 0.19], color: steelDark }); }
    const pts = [[x, 0.2, z], [x + 0.01, 1.1, z - 0.03], [x + 0.05, 3.0, z - 0.3], [x + 0.06, 5.0, z - 0.47], top,
      [top[0] + 0.01, 6.8, top[2] + 0.15], [top[0] + 0.03, 6.96, top[2] + 0.6], [top[0] + 0.07, 6.9, top[2] + 1.15], [top[0] + 0.13, 6.68, top[2] + 1.65], [top[0] + 0.18, 6.42, top[2] + 1.98]];
    const c = curveOf(pts);
    W.add(kit.tube(pts, 0.105, 0.05, 8, 48), worn, { color: steel });
    for (const u of [0.13, 0.3, 0.46]) { const p = c.getPointAt(u); W.add(kit.cylBase(0.105 - u * 0.06, 0.112 - u * 0.06, 0.05, 9), 'rust', { pos: [p.x, p.y, p.z] }); }
    // wire clamp exactly at the wire end point
    W.add(kit.cylBase(0.085, 0.085, 0.09, 9), 'flat', { pos: [top[0], top[1] - 0.045, top[2]], color: steelDark });
    for (const a of [2.6, -2.2]) {
      const dx = Math.cos(a) * 0.23, dz = Math.sin(a) * 0.23;
      W.add(rod([top[0], top[1], top[2]], [top[0] + dx, top[1] + 0.05, top[2] + dz], 0.02), 'flat', { color: steelDark });
      for (let k = 0; k < 2; k++) W.add(kit.cylBase(0.045 - k * 0.012, 0.055 - k * 0.012, 0.045, 7), 'flat', { pos: [top[0] + dx, top[1] + 0.05 + k * 0.05, top[2] + dz], color: cream });
    }
    // street-name plate strapped to the shaft
    const pl = c.getPointAt(0.34);
    W.add(kit.box(0.72, 0.28, 0.025), worn, { pos: [pl.x + 0.3, pl.y, pl.z + 0.1], rot: [0, 0.32, -0.1], color: steelDark });
    W.add(atlas.quad(0.68, 0.25, 'plate'), signMat, { pos: [pl.x + 0.303, pl.y, pl.z + 0.115], rot: [0, 0.32, -0.1] });
    W.add(kit.cylBase(0.098, 0.098, 0.03, 9), 'flat', { pos: [pl.x, pl.y + 0.1, pl.z], color: steelDark });

    // broken head at the arm's end
    const e = pts[pts.length - 1], hd = at(e[0], e[1], e[2], 0.12, 0.5, 0.2);
    hd.add(kit.cyl(0.07, 0.07, 0.3, 8).rotateX(Math.PI / 2), worn, { pos: [0, 0, 0.1], color: steelDark });
    const shell = (r) => new THREE.SphereGeometry(r, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const outer = jagRim(shell(1), 0.34, (x, y) => y < 0.02);
    hd.add(outer, worn, { pos: [0, 0.03, 0.45], scale: [0.27, 0.22, 0.48], color: '#dfe8dc' });
    hd.add(kit.sphere(1, 8, 5), 'flat', { pos: [0, 0.2, 0.26], scale: [0.09, 0.05, 0.2], color: '#b9c6be' });
    hd.add(kit.torus(0.72, 0.1, 5, 14, 3.4).rotateX(Math.PI / 2), 'rust', { pos: [0, 0.03, 0.45], scale: [0.36, 0.36, 0.62] });
    hd.add(kit.cylBase(0.04, 0.05, 0.14, 7).rotateX(Math.PI), 'flat', { pos: [0, 0.04, 0.4], color: ink });
    hd.glass(jagRim(new THREE.SphereGeometry(0.075, 8, 4, 0, 6.3, Math.PI * 0.45, Math.PI * 0.55), 0.05, (x, y) => y > -0.006), { pos: [0, -0.14, 0.4], color: '#ffffff' });
    // the lens ring hanging by one hinge
    const ring = hd.sub({ pos: [0.2, -0.02, 0.72], rot: [1.15, 0, 0.5] });
    ring.add(kit.torus(0.22, 0.016, 5, 14), 'flat', { color: steelDark, pos: [-0.16, -0.08, 0] });
    ring.glass(atlas.poly(0.4, 0.4, 'glassB', [[-0.18, -0.16], [0.03, -0.2], [0.04, 0.0], [-0.07, 0.1], [-0.2, 0.02]]), { pos: [-0.16, -0.08, 0.002] });
    // climbing ivy and a hanging swag
    vine(W, climb(c, 0.02, 0.5, 0.115, 3.2, 0.4), 0.032, 0.012, { leaves: 2.6, size: 0.25 });
    vine(W, climb(c, 0.04, 0.27, 0.11, 2.2, 3.2), 0.024, 0.01, { leaves: 2, size: 0.22, pal: [P.ivy, P.ivyRed, P.ivyLit, P.leafMid] });
    sprig(W, [x + 0.05, 1.4, z - 0.06], 16, 0.26, 0.5);
    tuft(W, [x - 0.26, SW, z + 0.1], 12, 0.6, 0.16); tuft(W, [x + 0.3, SW, z - 0.05], 8, 0.45, 0.1); fern(W, [x + 0.28, SW, z + 0.22], 5, 0.62);
    moss(W, [x - 0.14, SW + 0.12, z - 0.22], [0.22, 0.07, 0.17]);
    const hangP = c.getPointAt(0.8);
    sway([hangP.x, hangP.y, hangP.z], (st) => {
      const h = [hangP.x, hangP.y, hangP.z];
      vine(st, [h, [h[0] + 0.04, h[1] - 0.7, h[2] + 0.02], [h[0] - 0.05, h[1] - 1.5, h[2] + 0.06], [h[0] + 0.03, h[1] - 2.3, h[2] + 0.02]], 0.022, 0.008, { leaves: 13, size: 0.2, method: 'soft' });
      vine(st, [[h[0], h[1], h[2] + 0.24], [h[0] + 0.05, h[1] - 0.5, h[2] + 0.28], [h[0] - 0.02, h[1] - 1.15, h[2] + 0.3]], 0.018, 0.008, { leaves: 13, size: 0.19, method: 'soft' });
    }, { amp: 0.05, speed: 0.9 });
  }

  /* ================================================================= traffic light ======================= */
  const flick = { lens: [] };
  let strandSwing = () => {};
  function trafficLight() {
    const s = STREET.trafficLight, top = WIRES[1].b, b = [s.x, SW, s.z];
    const onPole = (y) => { const t = (y - b[1]) / (top[1] - b[1]); return [b[0] + (top[0] - b[0]) * t, y, b[2] + (top[2] - b[2]) * t]; };
    W.add(chipped(kit.cylBase(0.42, 0.5, 0.16, 8), 0.04), 'concrete', { pos: [b[0], SW - 0.08, b[2]] });
    W.add(kit.cylBase(0.17, 0.22, 0.45, 10), worn, { pos: [b[0], SW + 0.06, b[2]], color: steelDark });
    const pts = [onPole(0.3), [onPole(2.5)[0] + 0.03, 2.5, onPole(2.5)[2]], onPole(4.6), top, onPole(6.28)];
    W.add(kit.tube(pts, 0.12, 0.075, 9, 22), worn, { color: '#7f9490' });
    W.add(kit.sphere(0.092, 8, 5), 'flat', { pos: onPole(6.3), color: steelDark });
    W.add(kit.cylBase(0.1, 0.1, 0.1, 9), 'flat', { pos: [top[0], top[1] - 0.05, top[2]], color: steelDark }); // wire clamp at TLTOP
    W.add(rod(top, [top[0] + 0.3, top[1] + 0.05, top[2] - 0.12], 0.02), 'flat', { color: steelDark });
    for (let k = 0; k < 3; k++) W.add(kit.cylBase(0.05 - k * 0.01, 0.06 - k * 0.01, 0.05, 7), 'flat', { pos: [top[0] + 0.3, top[1] + 0.05 + k * 0.055, top[2] - 0.12], color: cream });

    // mast arm with tie rod
    const root = onPole(5.3), end = [s.armToward[0], 5.46, s.armToward[1]];
    const armPts = [root, lerp3(root, end, 0.35).map((c, i) => (i === 1 ? c + 0.12 : c)), lerp3(root, end, 0.7).map((c, i) => (i === 1 ? c + 0.1 : c)), end];
    const arm = curveOf(armPts);
    W.add(kit.tube(armPts, 0.085, 0.045, 8, 24), worn, { color: '#7f9490' });
    W.add(kit.cylBase(0.13, 0.13, 0.16, 9), 'flat', { pos: [root[0], 5.22, root[2]], color: steelDark });
    W.add(kit.cyl(0.05, 0.05, 0.03, 8).rotateX(Math.PI / 2), 'flat', { pos: end, rot: [0, Math.atan2(end[0] - root[0], end[2] - root[2]), 0], color: steelDark });
    const tieA = arm.getPointAt(0.62);
    W.add(rod(onPole(6.08), tieA, 0.016), 'flat', { color: steelDark });
    W.add(kit.cylBase(0.09, 0.09, 0.05, 8), 'flat', { pos: onPole(6.06), color: steelDark });
    W.add(kit.sphere(0.03, 6, 4), 'flat', { pos: [tieA.x, tieA.y, tieA.z], color: steelDark });

    // horizontal Japanese three-lens head hung below the arm, slumped on one snapped hanger
    const ha = arm.getPointAt(0.97), hb = arm.getPointAt(0.72), hy = s.head; // clamp at the tip, the snapped hanger toward the pole: that end has dropped
    const head = at(hy.x, hy.y, hy.z, hy.yaw, -0.05, -0.13); flick.head = head;
    head.add(roundBox(1.42, 0.46, 0.17, 0.14), worn, { pos: [0, 0, -0.03], color: '#7d9088' });
    head.add(roundBox(1.34, 0.4, 0.02, 0.11), 'flat', { pos: [0, 0, 0.065], color: '#46555a' });
    head.add(kit.box(0.5, 0.1, 0.08), worn, { pos: [0, 0, -0.13], color: steelDark });
    const LX = [-0.46, 0, 0.46];
    LX.forEach((x, i) => {
      const lens = atlas.uvTo(new THREE.CircleGeometry(0.165, 16), `lens${2 - i === 2 ? 2 : i === 1 ? 1 : 0}`);
      head.add(lens, signMat, { pos: [x, 0, 0.078] });
      head.add(kit.torus(0.175, 0.018, 5, 18), 'flat', { pos: [x, 0, 0.076], color: '#59696c' });
      flick.lens.push(head.w([x, 0, 0.095]));
    });
    flick.colors = ['#39e6b0', '#ffc24a', '#ff4a3a']; // left to right: green, amber, red
    // hood 0 survived but cracked, hood 1 half broken; hood 2 dangles (below)
    head.add(hoodGeo(0.178, 0.34, 3.6, 0.14), worn, { pos: [LX[0], 0, 0.08], color: '#6f8484' });
    head.add(hoodGeo(0.178, 0.26, 2.2, 0.14), worn, { pos: [LX[1] + 0.02, 0, 0.08], rot: [0, 0, 0.5], color: '#6f8484' });
    head.add(kit.box(0.03, 0.05, 0.03), 'flat', { pos: [LX[2], 0.19, 0.09], color: steelDark });
    // hangers: one intact clamp, one snapped stub with a curl of strap
    const hA = head.w([-0.42, 0.22, -0.1]), hB = head.w([0.42, 0.21, -0.1]);
    W.add(rod(hA, ha, 0.022), 'flat', { color: steelDark });
    W.add(kit.sphere(0.06, 7, 5), 'flat', { pos: [ha.x, ha.y, ha.z], color: steelDark, scale: [1.2, 0.8, 1.2] });
    W.add(rod(hb, lerp3([hb.x, hb.y, hb.z], [hB.x, hB.y, hB.z], 0.55), 0.02), 'rust');
    W.add(kit.tube([[hB.x, hB.y, hB.z], [hB.x + 0.02, hB.y + 0.08, hB.z], [hB.x + 0.08, hB.y + 0.12, hB.z + 0.01], [hB.x + 0.1, hB.y + 0.06, hB.z + 0.02]], 0.014, 0.01, 4, 10), 'rust');
    // dangling visor: hangs in front of the lens from a single bolt and a bent strap. The group is yawed with the head, so its x swing stays square to the face
    const pv = head.w([LX[2], 0.2, 0.1]);
    const dang = ctx.batch(), dt = { main: dang, soft: dang, glass: dang, glassMat, kit };
    const dgS = new Stage(dt);
    const flap = dgS.sub({ rot: [0, 0, 0.3] }); // hangs askew off the bolt, so the lower-left of the lens still shows
    flap.add(hoodGeo(0.178, 0.32, 3.5, 0.12), worn, { pos: [0.05, -0.06, 0.105], rot: [Math.PI / 2 - 0.22, 0, 0.1], color: '#6f8484' });
    flap.add(kit.box(0.045, 0.014, 0.29), 'flat', { pos: [0.05, -0.024, 0.14], color: steelDark });
    dgS.add(kit.box(0.03, 0.07, 0.03), 'flat', { pos: [0, -0.02, 0], color: steelDark });
    const dangG = dang.build({ castShadow: false, receiveShadow: true }); dangG.position.copy(pv); dangG.rotation.order = 'YXZ'; dangG.rotation.y = hy.yaw; group.add(dangG);
    swayers.push({ g: dangG, x: pv.x, z: pv.z, amp: 0.13, speed: 0.75, axis: 'x', ph: 1.1 });

    // grass tuft on top of the signal head, nest at the arm root
    tuft(head, [-0.2, 0.2, -0.02], 7, 0.3, 0.1, grassPal); tuft(head, [-0.5, 0.17, 0], 4, 0.22, 0.06, grassPal);
    moss(head, [-0.32, 0.22, -0.02], [0.3, 0.05, 0.11]);
    const nest = arm.getPointAt(0.15);
    for (let i = 0; i < 26; i++) {
      const a = rng() * 6.283, r = rng.range(0.1, 0.17), y = nest.y + 0.09 + rng() * 0.08, l = rng.range(0.1, 0.17), b = a + 1.57 + rng.range(-0.5, 0.5);
      W.add(rod([nest.x + Math.cos(a) * r - Math.cos(b) * l, y, nest.z + Math.sin(a) * r - Math.sin(b) * l], [nest.x + Math.cos(a) * r + Math.cos(b) * l, y + rng.range(-0.04, 0.04), nest.z + Math.sin(a) * r + Math.sin(b) * l], 0.01, 0.007, 3), 'flat', { color: pick(['#a58a5f', '#7f6a4a', '#b89a6a']) });
    }
    W.add(kit.sphere(1, 7, 4), 'flat', { pos: [nest.x, nest.y + 0.09, nest.z], scale: [0.13, 0.05, 0.13], color: '#6e5a40' });

    // controller box, push button, pedestrian head
    const b1 = onPole(2.25);
    W.add(kit.box(0.46, 0.8, 0.28), worn, { pos: [b1[0] - 0.22, 2.25, b1[2] + 0.1], rot: [0, -0.7, 0], color: '#97a69d' });
    W.add(kit.box(0.4, 0.72, 0.022), 'rust', { pos: [b1[0] - 0.33, 2.25, b1[2] + 0.22], rot: [0, -0.2, 0] });
    W.add(kit.box(0.5, 0.05, 0.32), 'flat', { pos: [b1[0] - 0.22, 2.67, b1[2] + 0.1], rot: [0, -0.7, 0], color: steelDark });
    const b2 = onPole(1.12);
    W.add(kit.box(0.16, 0.26, 0.1), worn, { pos: [b2[0] - 0.1, 1.12, b2[2] - 0.12], rot: [0, 0.6, 0], color: P.fadedYellow });
    const pd = at(onPole(3.3)[0] - 0.2, 3.3, onPole(3.3)[2] - 0.08, -2.2);
    pd.add(kit.box(0.34, 0.56, 0.16), worn, { color: '#7d9088' }); pd.add(kit.box(0.26, 0.2, 0.012), 'flat', { pos: [0, 0.13, 0.085], color: '#6f2d2f' }); pd.add(kit.box(0.26, 0.2, 0.012), 'flat', { pos: [0, -0.13, 0.085], color: '#1f5f5a' });
    pd.add(kit.box(0.32, 0.02, 0.14), 'flat', { pos: [0, 0.27, 0.15], color: steelDark });
    W.add(rod(onPole(3.3), [onPole(3.3)[0] - 0.2, 3.3, onPole(3.3)[2] - 0.08], 0.03), 'flat', { color: steelDark });

    // overgrowth
    const pc = curveOf(pts);
    vine(W, climb(pc, 0.01, 0.46, 0.12, 2.6, 1.0), 0.03, 0.012, { leaves: 3, size: 0.25 });
    sprig(W, [b[0], 0.9, b[2]], 14, 0.26, 0.5);
    tuft(W, [b[0] + 0.35, SW, b[2] + 0.2], 10, 0.55, 0.14); tuft(W, [b[0] - 0.3, SW, b[2] - 0.32], 8, 0.42, 0.1);
    moss(W, [b[0] + 0.2, SW + 0.07, b[2] - 0.25], [0.2, 0.06, 0.16]);
    fern(W, [b[0] - 0.32, SW, b[2] + 0.26], 4, 0.55);
  }

  /* ================================================================= utility pole ======================== */
  function utilityPole() {
    const s = STREET.utilityPole, x = s.x, z = s.z, H = s.height, tA = WIRES[0].a, tB = WIRES[5].a;
    W.add(chipped(kit.cylBase(0.32, 0.38, 0.14, 8), 0.04), 'concrete', { pos: [x, SW - 0.08, z] });
    W.add(kit.cylBase(0.095, 0.175, H, 12), 'concrete', { pos: [x, SW - 0.02, z], color: '#d4d2c6' });
    for (let y = 1.9; y < 7; y += 1.65) W.add(kit.cylBase(0.17 - (y / H) * 0.08 + 0.004, 0.17 - (y / H) * 0.08 + 0.006, 0.03, 12), 'flat', { pos: [x, y, z], color: '#a9aba4' });
    W.add(atlas.uvTo(kit.cylBase(0.178, 0.186, 1.55, 12, true), 'tiger'), signMat, { pos: [x, SW + 0.14, z] });
    W.add(kit.box(0.26, 0.36, 0.015), worn, { pos: [x - 0.13, 2.9, z + 0.11], rot: [0, -0.8, 0], color: cream });
    // climbing steps
    for (let i = 0; i < 12; i++) { const a = i % 2 ? 2.4 : -0.4, y = 2.6 + i * 0.38, r = 0.17 - (y / H) * 0.08; W.add(rod([x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(a) * (r + 0.2), y + 0.02, z + Math.sin(a) * (r + 0.2)], 0.014, 0.014, 4), 'rust'); }
    W.add(kit.sphere(0.1, 8, 5), 'flat', { pos: [x, H + SW - 0.02, z], color: '#9a9c95', scale: [1, 0.6, 1] });
    // wire end clamps sit exactly on the wire points
    const yaw = 0.56;
    W.add(kit.cylBase(0.112, 0.112, 0.1, 10), 'flat', { pos: [tA[0], tA[1] - 0.05, tA[2]], color: steelDark });
    W.add(kit.cylBase(0.122, 0.122, 0.1, 10), 'flat', { pos: [tB[0], tB[1] - 0.05, tB[2]], color: steelDark });
    const crossarm = (y, L, tilt, ins) => {
      const a = at(x, y, z, yaw, 0, tilt);
      a.add(kit.box(L, 0.075, 0.09), worn, { color: '#7e8c86' });
      a.add(kit.box(L * 0.98, 0.012, 0.11), 'flat', { pos: [0, 0.046, 0], color: '#677572' });
      a.add(rod([-L * 0.3, -0.03, 0.05], [0, -0.42, 0.13], 0.014), 'rust'); a.add(rod([L * 0.3, -0.03, 0.05], [0, -0.42, 0.13], 0.014), 'rust');
      for (const px of ins) {
        a.add(kit.cylBase(0.016, 0.016, 0.1, 5), 'flat', { pos: [px, 0.03, 0], color: steelDark });
        for (let k = 0; k < 3; k++) a.add(kit.cylBase(0.042 + (k === 1 ? 0.018 : 0), 0.064 - k * 0.008, 0.048, 8), 'flat', { pos: [px, 0.1 + k * 0.05, 0], color: k === 2 ? '#d3ded8' : '#ece7d7' });
      }
      return a;
    };
    crossarm(7.56, 2.1, 0.03, [-0.9, -0.42, 0.42, 0.9]);
    crossarm(6.74, 1.5, -0.07, [-0.6, 0.6]);
    // pole transformer, drooping service loop
    const tr = at(x + 0.32, 5.55, z - 0.18, 1.2);
    tr.add(kit.cylBase(0.27, 0.27, 0.86, 12), worn, { color: '#8fa09a' }); tr.add(kit.cylBase(0.3, 0.3, 0.04, 12), 'flat', { pos: [0, 0.84, 0], color: steelDark });
    tr.add(kit.cylBase(0.04, 0.3, 0.1, 12), 'flat', { pos: [0, 0.88, 0], color: '#7a8a84' }); tr.add(kit.cylBase(0.285, 0.285, 0.05, 12), 'rust', { pos: [0, 0.05, 0] });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 3.1 + 1.2; tr.add(kit.box(0.03, 0.62, 0.04), 'flat', { pos: [Math.cos(a) * 0.285, 0.42, Math.sin(a) * 0.285], rot: [0, -a, 0], color: '#7a8a84' }); }
    tr.add(rod([0, 0.45, 0], [-0.32, 0.45, 0.18], 0.03), 'flat', { color: steelDark });
    for (const dx of [-0.12, 0.12]) { tr.add(kit.cylBase(0.03, 0.05, 0.14, 6), 'flat', { pos: [dx, 0.95, 0], color: '#ece7d7' }); W.add(kit.tube([tr.w([dx, 1.08, 0]), [x + 0.2 + dx, 6.45, z], [x + dx * 2, 6.72, z + 0.05]], 0.012, 0.012, 4, 10), 'flat', { color: ink }); }
    W.add(kit.tube([[x + 0.15, 6.3, z + 0.1], [x + 0.38, 5.2, z + 0.34], [x + 0.2, 4.55, z + 0.4], [x + 0.08, 4.9, z + 0.2], [x + 0.14, 4.4, z + 0.15]], 0.016, 0.016, 4, 22), 'flat', { color: ink });
    W.add(kit.box(0.2, 0.3, 0.14), 'rust', { pos: [x + 0.04, 3.6, z - 0.2], rot: [0, 0.3, 0] });
    // overgrowth
    const pc = curveOf([[x, 0.1, z], [x, 3.0, z], [x, 5.4, z]]);
    vine(W, climb(pc, 0, 0.98, 0.17, 2.4, 0.5), 0.038, 0.014, { leaves: 3, size: 0.27 });
    vine(W, climb(pc, 0, 0.6, 0.17, 1.6, 3.6), 0.03, 0.012, { leaves: 3, size: 0.24, pal: [P.ivy, P.ivyRed, P.leafMid, P.ivyLit] });
    for (const y of [1.2, 2.3, 3.9, 5.0]) sprig(W, [x, y, z], 14, 0.27, 0.55);
    tuft(W, [x + 0.3, SW, z + 0.2], 12, 0.6, 0.15); tuft(W, [x - 0.25, SW, z - 0.3], 9, 0.45, 0.14); fern(W, [x - 0.3, SW, z + 0.25], 5, 0.65);
    moss(W, [x + 0.15, SW + 0.06, z - 0.26], [0.23, 0.06, 0.18]);
  }

  /* ================================================================= bus stop ============================ */
  function busStop() {
    const s = STREET.busStop;
    const sg = at(s.x, SW, s.z, s.yaw + 0.16, 0.035, -0.055);
    sg.add(chipped(kit.cylBase(0.32, 0.37, 0.14, 12), 0.018), 'concrete', { color: P.concreteMid });
    sg.add(kit.torus(0.335, 0.03, 5, 16).rotateX(Math.PI / 2), 'rust', { pos: [0, 0.09, 0] });
    sg.add(kit.cylBase(0.055, 0.075, 0.26, 8), 'rust', { pos: [0, 0.12, 0] });
    sg.add(kit.cylBase(0.042, 0.048, 2.66, 8), 'rust', { pos: [0, 0.12, 0] });
    sg.add(kit.cylBase(0.052, 0.052, 0.04, 8), 'flat', { pos: [0, 2.78, 0], color: steelDark });
    // round head
    sg.add(kit.cyl(0.42, 0.42, 0.03, 20).rotateX(Math.PI / 2), worn, { pos: [0, 2.4, 0.05], color: P.fadedBlue });
    sg.add(atlas.uvTo(new THREE.CircleGeometry(0.4, 20), 'busHead'), signMat, { pos: [0, 2.4, 0.068] });
    sg.add(kit.torus(0.415, 0.022, 5, 22), 'rust', { pos: [0, 2.4, 0.06] });
    sg.add(kit.box(0.2, 0.08, 0.05), 'flat', { pos: [0, 2.72, 0.03], color: steelDark }); sg.add(kit.box(0.2, 0.08, 0.05), 'flat', { pos: [0, 2.08, 0.03], color: steelDark });
    // timetable case
    sg.add(kit.box(0.54, 0.8, 0.06), worn, { pos: [0, 1.42, 0.06], color: '#8f9f9a' });
    sg.add(atlas.quad(0.46, 0.7, 'timetable'), signMat, { pos: [0, 1.42, 0.092] });
    sg.add(kit.box(0.56, 0.035, 0.09), 'rust', { pos: [0, 1.84, 0.06], rot: [0.12, 0, 0] });
    sg.glass(atlas.poly(0.46, 0.7, 'glassB', [[-0.23, -0.35], [0.23, -0.35], [0.23, 0.12], [0.05, 0.2], [0.0, 0.05], [-0.1, 0.24], [-0.23, 0.14]]), { pos: [0, 1.42, 0.1] });
    // overgrowth on the sign
    vine(sg, climb(curveOf([[0, 0.14, 0], [0, 1.1, 0], [0, 2.1, 0]]), 0, 0.97, 0.06, 2.3, 0.3, 18), 0.022, 0.009, { leaves: 3.4, size: 0.19 });
    sprig(sg, [0.1, 1.0, 0.05], 8, 0.2, 0.32);
    tuft(sg, [0.28, 0.08, 0.2], 9, 0.5, 0.12); tuft(sg, [-0.3, 0.08, -0.05], 7, 0.38, 0.1);
    moss(sg, [-0.1, 0.14, 0.14], [0.2, 0.05, 0.14]);

    // shelter: rear frame, cantilever curved roof, bench. West of the pole: from the hero camera it clears the fallen poster.
    const sh = at(-7.72, SW, 7.62, 0.03, 0, 0.012), L = 2.62, hx = L / 2 - 0.09;
    const prof = new THREE.Shape(); prof.moveTo(0.34, 2.28); prof.quadraticCurveTo(-0.15, 2.42, -0.72, 2.32); prof.lineTo(-0.74, 2.26); prof.quadraticCurveTo(-0.15, 2.36, 0.34, 2.22);
    const roof = new THREE.ExtrudeGeometry(prof, { depth: L, bevelEnabled: false, curveSegments: 7 }).translate(0, 0, -L / 2).rotateY(Math.PI / 2);
    sh.add(roof, worn, { color: '#8fb5a8', scale: [1, 1, -1] }); // mirror: profile +x (rear) maps to +z
    for (let i = 0; i <= 6; i++) { const x = -L / 2 + 0.06 + (i / 6) * (L - 0.12); sh.add(kit.tube([[x, 2.3, 0.34], [x, 2.38, -0.15], [x, 2.34, -0.73]], 0.016, 0.016, 4, 8), i % 3 ? worn : 'rust', { color: steelDark }); }
    for (const x of [-hx, -0.02, hx]) {
      sh.add(kit.box(0.09, 2.26, 0.09), worn, { pos: [x, 1.13, 0.3], color: '#7a8f8a' });
      sh.add(kit.cylBase(0.09, 0.11, 0.06, 6), 'flat', { pos: [x, 0, 0.3], color: steelDark });
      sh.add(kit.tube([[x, 1.9, 0.3], [x, 2.2, 0.1], [x, 2.28, -0.22], [x, 2.27, -0.55]], 0.032, 0.022, 5, 10), worn, { color: '#7a8f8a' });
    }
    sh.add(kit.box(L, 0.07, 0.06), worn, { pos: [0, 2.1, 0.3], color: '#7a8f8a' }); sh.add(kit.box(L, 0.06, 0.05), worn, { pos: [0, 0.32, 0.3], color: '#7a8f8a' });
    sh.add(kit.box(0.05, 1.78, 0.03), 'flat', { pos: [-0.62, 1.2, 0.3], color: steelDark });
    // left bay: cracked polycarbonate with a hole, right bay: route board and ad panel
    sh.glass(atlas.poly(1.18, 1.74, 'glassA', [[-0.58, -0.85], [0.58, -0.85], [0.58, 0.86], [-0.58, 0.86]], [[[-0.26, -0.1], [-0.1, 0.24], [0.16, 0.16], [0.3, -0.2], [0.08, -0.5], [-0.12, -0.3]]]), { pos: [-0.62, 1.21, 0.3] });
    sh.add(kit.box(1.14, 0.84, 0.05), worn, { pos: [0.6, 1.5, 0.31], color: '#a8b6ae' });
    sh.add(atlas.quad(1.06, 0.72, 'route'), signMat, { pos: [0.6, 1.5, 0.34], rot: [0, 0, 0.012] });
    sh.add(atlas.quad(1.06, 0.72, 'route'), signMat, { pos: [0.6, 1.5, 0.282], rot: [0, Math.PI, 0] });
    sh.add(kit.box(0.42, 0.54, 0.04), worn, { pos: [0.94, 0.72, 0.31], color: '#a8b6ae' }); sh.add(atlas.quad(0.38, 0.5, 'shelterAd'), signMat, { pos: [0.94, 0.72, 0.335] });
    // bench
    for (const x of [-0.9, 0.86]) { sh.add(kit.box(0.06, 0.44, 0.34), 'rust', { pos: [x, 0.22, 0.02] }); sh.add(kit.box(0.08, 0.04, 0.42), 'rust', { pos: [x, 0.02, 0.02] }); }
    for (let i = 0; i < 3; i++) sh.add(chipped(kit.box(2.14, 0.05, 0.1, 6, 1, 1), 0.006), 'wood', { pos: [0, 0.46, -0.1 + i * 0.125], rot: [0, 0, i === 2 ? -0.03 : 0], color: i === 1 ? '#e2c49c' : '#d2b48c' });
    sh.add(chipped(kit.box(2.05, 0.09, 0.03, 5, 1, 1), 0.006), 'wood', { pos: [0, 0.76, 0.23], rot: [0.18, 0, 0.02], color: '#d2b48c' });
    // moss and turf on the roof, drooping vine, weeds at the bench
    moss(sh, [-0.62, 2.39, -0.1], [0.66, 0.08, 0.42]); moss(sh, [0.62, 2.39, 0.02], [0.5, 0.06, 0.3], P.mossLit); moss(sh, [0.0, 2.37, -0.42], [0.38, 0.05, 0.2], P.mossDeep);
    tuft(sh, [-0.7, 2.42, -0.1], 16, 0.42, 0.34); tuft(sh, [0.66, 2.42, 0.0], 12, 0.34, 0.24); posy(sh, [-0.2, 2.42, -0.15], 4, 0.3, P.flowerYellow);
    vine(sh, [[-1.26, 0.05, 0.42], [-1.22, 0.9, 0.38], [-1.26, 1.8, 0.4], [-1.1, 2.42, 0.2], [-0.6, 2.48, 0.05], [-0.2, 2.42, -0.2]], 0.03, 0.012, { leaves: 4.5, size: 0.22 });
    tuft(sh, [-0.4, 0.0, 0.05], 13, 0.5, 0.26); tuft(sh, [1.14, 0.0, -0.05], 11, 0.55, 0.14); fern(sh, [-1.1, 0, 0.1], 5, 0.62); posy(sh, [0.34, 0, 0.12], 5, 0.3, P.flowerWhite);
    moss(sh, [0.4, 0.5, -0.02], [0.4, 0.025, 0.09], P.mossLit);
    const hp = sh.w([0.3, 2.3, -0.72]);
    sway([hp.x, hp.y, hp.z], (st) => {
      const a = [hp.x, hp.y, hp.z];
      vine(st, [a, [a[0] + 0.05, a[1] - 0.45, a[2] - 0.03], [a[0] - 0.02, a[1] - 1.05, a[2]]], 0.016, 0.007, { leaves: 13, size: 0.17, method: 'soft' });
      vine(st, [[a[0] + 0.5, a[1], a[2]], [a[0] + 0.48, a[1] - 0.3, a[2] - 0.02], [a[0] + 0.53, a[1] - 0.72, a[2]]], 0.014, 0.007, { leaves: 13, size: 0.16, method: 'soft' });
    }, { amp: 0.06, speed: 1.1 });
  }

  /* ================================================================= vending machine ===================== */
  function vending() {
    const s = STREET.vending, st = at(s.x, SW, s.z, s.yaw), Wd = 1.3, Hg = 2.05, D = 0.96, red = '#c9705c', redD = '#b05a4a';
    const fz = D / 2;
    // night: the display still has power. A tube that hums, and drops out for a moment now and then.
    ctx.shared.lamps.push({ pos: st.w([-0.14, 1.3, fz + 0.8]).toArray(), at: st.w([-0.14, 1.4, fz + 0.03]).toArray(), r: 4.6, color: '#d4ecff', power: 0.62, halo: 1.25, lift: 0.3,
      k: (t) => (Math.sin(t * 0.83) * Math.sin(t * 0.31 + 1) > 0.93 ? 0.35 + 0.3 * Math.sin(t * 41) : 0.95 + 0.05 * Math.sin(t * 17)) });
    st.add(kit.boxBase(Wd, 0.1, D), 'rust', { color: '#b4876a' });
    st.add(kit.boxBase(0.05, Hg - 0.1, D), worn, { pos: [-Wd / 2 + 0.025, 0.1, 0], color: red });
    st.add(kit.boxBase(0.05, Hg - 0.1, D), worn, { pos: [Wd / 2 - 0.025, 0.1, 0], color: red });
    st.add(kit.box(Wd, 0.06, D), worn, { pos: [0, Hg - 0.03, 0], color: redD });
    st.add(kit.box(Wd + 0.05, 0.03, D + 0.05), 'flat', { pos: [0, Hg + 0.005, 0], color: '#a24f42' });
    st.add(kit.box(Wd, Hg, 0.05), worn, { pos: [0, Hg / 2, -D / 2 + 0.025], color: redD });
    st.add(kit.box(Wd - 0.1, 0.96, 0.04), 'flat', { pos: [0, 1.4, -0.1], color: '#274e55' }); // dark interior back
    st.add(kit.box(Wd - 0.1, 0.06, 0.62), 'flat', { pos: [0, 0.94, 0.18], color: '#3e5f60' });
    // door frame around the display window
    const wx0 = -0.59, wx1 = 0.3, wy0 = 0.92, wy1 = 1.86;
    st.add(kit.box(Wd, 0.2, 0.06), worn, { pos: [0, 1.95, fz - 0.03], color: cream });
    st.add(atlas.quad(Wd - 0.08, 0.17, 'vendHead'), signMat, { pos: [0, 1.95, fz + 0.002] });
    st.add(kit.boxBase(0.06, wy1 - wy0, 0.07), worn, { pos: [wx0 - 0.03 + 0.0, wy0, fz - 0.03], color: cream });
    st.add(kit.box(wx1 - wx0 + 0.1, 0.045, 0.07), worn, { pos: [(wx0 + wx1) / 2, wy1 + 0.0, fz - 0.03], color: cream });
    st.add(kit.box(wx1 - wx0 + 0.1, 0.05, 0.07), worn, { pos: [(wx0 + wx1) / 2, wy0, fz - 0.03], color: cream });
    // right control column
    st.add(kit.boxBase(Wd / 2 - wx1, wy1 - 0.1, 0.07), worn, { pos: [wx1 + (Wd / 2 - wx1) / 2, 0.1, fz - 0.03], color: cream });
    const cx = wx1 + 0.17;
    st.add(kit.box(0.24, 0.42, 0.015), 'flat', { pos: [cx, 1.42, fz + 0.012], color: '#8c9a98' });
    st.add(kit.box(0.09, 0.015, 0.02), 'flat', { pos: [cx, 1.54, fz + 0.022], color: ink });
    st.add(kit.box(0.015, 0.09, 0.02), 'flat', { pos: [cx + 0.0, 1.46, fz + 0.022], color: ink });
    st.add(kit.box(0.16, 0.05, 0.016), 'flat', { pos: [cx, 1.36, fz + 0.022], color: '#2d3f3e' });
    st.add(kit.cyl(0.03, 0.035, 0.05, 8).rotateX(Math.PI / 2), 'flat', { pos: [cx + 0.06, 1.26, fz + 0.03], color: P.metalDark });
    st.add(kit.box(0.1, 0.08, 0.02), 'flat', { pos: [cx - 0.04, 1.27, fz + 0.022], color: P.metalDark });
    st.add(atlas.quad(0.25, 0.14, 'vendInfo'), signMat, { pos: [cx, 1.72, fz + 0.012] });
    st.add(kit.box(0.14, 0.1, 0.03), 'flat', { pos: [cx, 0.8, fz + 0.02], color: P.metalDark }); // coin return cup
    st.add(kit.box(0.1, 0.05, 0.02), 'flat', { pos: [cx, 0.79, fz + 0.04], color: ink });
    // lower door with pickup flap, kicked in and rusting
    st.add(kit.boxBase(wx1 - wx0 + 0.13, 0.82, 0.07), worn, { pos: [(wx0 + wx1) / 2 - 0.01, 0.1, fz - 0.03], color: cream });
    st.add(kit.box(0.72, 0.3, 0.02), 'flat', { pos: [-0.13, 0.42, fz + 0.01], color: '#2e4347' });
    st.add(kit.box(0.7, 0.26, 0.02), 'rust', { pos: [-0.13, 0.42, fz + 0.03], rot: [-0.3, 0, 0] });
    st.add(atlas.quad(0.6, 0.09, 'vendPick'), signMat, { pos: [-0.13, 0.64, fz + 0.013] });
    st.add(kit.box(0.76, 0.03, 0.03), 'flat', { pos: [-0.13, 0.25, fz + 0.015], color: steelDark });
    // cans on three shelves, some missing or tipped
    const canCols = [P.fadedRed, P.fadedBlue, P.fadedYellow, '#8fbda0', cream, '#d9a06a'];
    [1.0, 1.31, 1.62].forEach((y, row) => {
      st.add(kit.box(0.88, 0.03, 0.42), 'flat', { pos: [-0.14, y - 0.02, 0.2], color: '#5f7f7a' });
      st.add(kit.box(0.88, 0.05, 0.02), 'flat', { pos: [-0.14, y - 0.03, 0.41], color: '#c9c8b4' });
      for (let i = 0; i < 6; i++) {
        if ((row === 0 && i < 3) || (row === 1 && i === 4)) continue; // weeds shoulder through here
        const x = -0.5 + i * 0.145, c = canCols[(i * 2 + row * 5) % 6], tip = row === 2 && i === 2;
        const cn = st.sub({ pos: [x, y, tip ? 0.28 : 0.32], rot: [tip ? 1.5 : 0, tip ? 0.5 : 0, 0] });
        cn.add(kit.cylBase(0.058, 0.058, 0.2, 8), 'flat', { color: c }); cn.add(kit.cylBase(0.059, 0.059, 0.06, 8), 'flat', { pos: [0, 0.08, 0], color: '#f0e9d6' });
        cn.add(kit.cylBase(0.05, 0.058, 0.012, 8), 'flat', { pos: [0, 0.2, 0], color: '#a9b0ac' });
        st.add(kit.box(0.09, 0.022, 0.02), 'flat', { pos: [x, y - 0.03, 0.425], color: row === 1 && i % 2 ? '#c8705e' : '#d7e0da' });
      }
    });
    // shattered glass: frame-hugging remains with a big jagged hole, a few loose shards
    const gw = wx1 - wx0, gh = wy1 - wy0, gs = st.sub({ pos: [(wx0 + wx1) / 2, (wy0 + wy1) / 2, fz - 0.035] });
    const hw = gw / 2, hh = gh / 2;
    gs.glass(atlas.poly(gw, gh, 'glassA', [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], [[[-hw + 0.02, -hh + 0.04], [-0.18, -hh + 0.03], [-0.02, -0.06], [0.1, -0.2], [0.2, 0.02], [0.08, 0.17], [-0.06, 0.08], [-0.16, 0.3], [-0.3, 0.12], [-hw + 0.03, 0.2]]]));
    for (let i = 0; i < 7; i++) {
      const a = rng() * 6.28, r = rng.range(0.07, 0.15), sh = atlas.poly(0.4, 0.4, 'glassB', [[-r, -r * 0.5], [r * 0.9, -r * 0.2], [rng.range(-r, r), r]]);
      st.glass(sh, { pos: [rng.range(-0.3, 0.5), 0.02, fz + rng.range(0.1, 0.6)], rot: [-1.55 + rng.range(-0.06, 0.06), a, 0] });
    }
    // dented side panel graphic facing the street (local -x)
    st.add(atlas.quad(0.84, 1.74, 'vendSide'), signMat, { pos: [-Wd / 2 - 0.003, 1.02, 0.0], rot: [0, -Math.PI / 2, 0] });
    st.add(atlas.quad(0.84, 1.74, 'vendSide'), signMat, { pos: [Wd / 2 + 0.003, 1.02, 0.0], rot: [0, Math.PI / 2, 0] });
    // recycling bin beside it
    const bin = at(s.x - 0.24, SW, s.z - 0.93, 0.3, 0, 0.03); // tight to the machine: clears the east hole from the hero camera
    bin.add(kit.cylBase(0.27, 0.23, 0.74, 10), worn, { color: '#7fa59a' }); bin.add(kit.cylBase(0.285, 0.285, 0.05, 10), 'flat', { pos: [0, 0.74, 0], color: steelDark });
    bin.add(kit.cylBase(0.09, 0.29, 0.1, 10), 'flat', { pos: [0, 0.78, 0], color: '#6f8f88' }); bin.add(kit.cyl(0.1, 0.1, 0.02, 10), 'flat', { pos: [0, 0.885, 0], color: ink });
    for (let i = 0; i < 3; i++) {
      const p = [s.x + 0.62 + rng() * 0.45, SW + 0.058, s.z - 0.5 - rng() * 0.6];
      W.add(kit.cyl(0.058, 0.058, 0.2, 8), 'flat', { pos: p, rot: [Math.PI / 2, rng() * 3, 0], color: pick(canCols) });
    }
    // dirt, moss, weeds. Soil piled inside and spilling over the sill
    st.add(chipped(kit.sphere(1, 9, 6), 0.1), 'flat', { pos: [-0.26, 0.98, 0.26], scale: [0.36, 0.14, 0.26], color: P.soil });
    moss(st, [-0.26, 1.06, 0.3], [0.33, 0.08, 0.22], P.mossLit); moss(st, [-0.05, 0.98, fz], [0.16, 0.05, 0.09]);
    moss(st, [0.2, Hg + 0.03, 0.05], [0.42, 0.09, 0.3]); moss(st, [-0.35, Hg + 0.03, -0.1], [0.26, 0.06, 0.26], P.mossLit);
    tuft(st, [0.15, Hg + 0.02, 0.05], 14, 0.42, 0.26); fern(st, [-0.32, Hg + 0.02, -0.1], 4, 0.46); posy(st, [0.36, Hg + 0.02, 0.2], 3, 0.16, P.flowerYellow);
    tuft(st, [-0.5, 0.0, fz + 0.1], 12, 0.62, 0.14); tuft(st, [0.55, 0.0, fz + 0.1], 10, 0.5, 0.12); fern(st, [-0.72, 0, fz - 0.1], 4, 0.6); moss(st, [0.05, 0.03, fz + 0.14], [0.5, 0.05, 0.12]);
    vine(W, [[s.x - 0.42, 3.4, s.z - 0.6], [s.x - 0.25, 2.5, s.z - 0.52], [s.x + 0.2, 2.24, s.z - 0.35], [s.x + 0.52, 2.14, s.z - 0.45], [s.x + 0.54, 1.7, s.z - 0.5], [s.x + 0.52, 1.25, s.z - 0.58]], 0.03, 0.012, { leaves: 6, size: 0.24 });
    // weeds bursting out through the hole: they sway together from the sill
    const piv = st.w([-0.24, 1.0, 0.3]);
    sway([piv.x, piv.y, piv.z], (ws) => {
      const l = ws.sub({}); const m = new M4().multiplyMatrices(l.m, st.m); l.m = m;
      for (let i = 0; i < 46; i++) {
        const a = rng.range(-1.1, 1.1), sz = rng.range(0.42, 0.9);
        l.soft(pick(BLADES), leafMat, { pos: [-0.24 + rng.range(-0.24, 0.24), 0.99, 0.3 + rng.range(-0.1, 0.14)], rot: [rng.range(0.15, 0.6), a, 0], scale: [sz * 1.25, sz, sz * 1.2], color: pick(grassPal) });
      }
      for (let i = 0; i < 6; i++) l.soft(pick(FRONDS), leafMat, { pos: [-0.2 + rng.range(-0.2, 0.2), 1.02, 0.34], rot: [rng.range(-0.25, 0.15), rng.range(-1.1, 1.1), 0], scale: rng.range(0.62, 0.95), color: pick(fernPal) });
      for (let i = 0; i < 4; i++) { const x = -0.2 + rng.range(-0.25, 0.28), y = 1.42 + rng.range(-0.1, 0.32), z = 0.6 + rng.range(0, 0.22); l.soft(BLADES[2], leafMat, { pos: [x, 1, 0.4], rot: [0.5, 0, 0], scale: [0.5, 0.7, 0.5], color: P.leafMid }); l.soft(leafFlower, leafMat, { pos: [x, y, z], rot: [0.9, rng() * 6, 0], scale: 1.1, color: pick([P.flowerWhite, P.flowerYellow]) }); }
    }, { amp: 0.035, speed: 1.2 });
  }

  /* ================================================================= kiosk =============================== */
  function kiosk() {
    const s = STREET.kiosk, st = at(s.x, SOIL, s.z, s.yaw), Wd = 2.3, Dp = 1.7, wall = '#d9cfae', trim = '#6f9a88';
    st.add(chipped(kit.boxBase(Wd + 0.26, 0.16, Dp + 0.22, 3, 1, 3), 0.02), 'concrete', { pos: [0, -0.02, 0] });
    // shell: back and left walls full height, right side rack wall, front counter
    st.add(kit.boxBase(Wd, 2.1, 0.08), 'flat', { pos: [0, 0.14, -Dp / 2], color: wall });
    st.add(kit.boxBase(0.08, 2.1, Dp), 'flat', { pos: [-Wd / 2, 0.14, 0], color: wall });
    st.add(kit.boxBase(0.08, 0.72, Dp), 'flat', { pos: [Wd / 2, 0.14, 0], color: wall });
    st.add(kit.boxBase(Wd, 0.84, 0.08), 'flat', { pos: [0, 0.14, Dp / 2], color: wall });
    st.add(kit.box(Wd + 0.14, 0.05, 0.3), 'wood', { pos: [0, 1.0, Dp / 2 + 0.06], color: '#c4a177' });
    st.add(kit.box(Wd + 0.1, 0.05, Dp + 0.1), 'flat', { pos: [0, 0.5, 0], color: '#47696a' }); // floor inside reads dark teal
    st.add(kit.boxBase(Wd - 0.1, 1.9, 0.02), 'flat', { pos: [0, 0.2, -Dp / 2 + 0.05], color: '#355e63' });
    for (const [x, z] of [[Wd / 2, Dp / 2], [Wd / 2, -Dp / 2], [-Wd / 2, Dp / 2]]) st.add(kit.boxBase(0.1, 2.14, 0.1), worn, { pos: [x, 0.14, z], color: trim });
    st.add(kit.box(Wd + 0.12, 0.06, 0.1), worn, { pos: [0, 0.14 + 0.82, Dp / 2 + 0.01], color: trim });
    st.add(kit.box(0.1, 0.06, Dp), worn, { pos: [Wd / 2 + 0.01, 0.9, 0], color: trim });
    // what the gaps in the leaves show: lapped boards, a seam of rust, one faded poster
    for (const y of [0.52, 1.0, 1.48, 1.96]) { st.add(kit.box(Wd + 0.02, 0.022, 0.012), 'flat', { pos: [0, y, -Dp / 2 - 0.046], color: '#b6aa8a' }); st.add(kit.box(0.012, 0.022, Dp + 0.02), 'flat', { pos: [-Wd / 2 - 0.046, y, 0], color: '#b6aa8a' }); }
    st.add(atlas.quad(0.5, 0.67, 'shelterAd'), signMat, { pos: [-Wd / 2 - 0.054, 1.34, 0.22], rot: [0, -Math.PI / 2, 0.03] });
    st.add(atlas.quad(0.44, 0.62, 'mag4'), signMat, { pos: [-0.02, 1.3, -Dp / 2 - 0.054], rot: [0, Math.PI, -0.05] });
    // interior shelves with paper bundles
    for (const y of [1.15, 1.55, 1.95]) {
      st.add(kit.box(Wd - 0.2, 0.03, 0.34), 'wood', { pos: [0, y, -Dp / 2 + 0.22], color: '#a98a68' });
      for (let i = 0; i < 6; i++) { if (rng() < 0.25) continue; const h = rng.range(0.1, 0.24); st.add(kit.boxBase(0.26, h, 0.22), 'flat', { pos: [-0.85 + i * 0.34, y + 0.015, -Dp / 2 + 0.22], rot: [0, rng.range(-0.12, 0.12), 0], color: pick(['#ece3c8', '#dcd0ad', '#c9c0a2', '#e2c9a0']) }); }
    }
    // roof slab
    st.add(chipped(kit.box(Wd + 0.42, 0.13, Dp + 0.36, 3, 1, 3), 0.018), 'concreteClean', { pos: [0.02, 2.3, 0.02], color: '#c9c8ba' });
    st.add(kit.box(Wd + 0.46, 0.04, Dp + 0.4), worn, { pos: [0.02, 2.24, 0.02], color: trim });
    // sign band, slipped on one side
    const sb = st.sub({ pos: [0.05, 2.56, Dp / 2 + 0.14], rot: [0.05, 0, -0.055] });
    sb.add(kit.box(2.3, 0.42, 0.07), worn, { color: trim }); sb.add(atlas.quad(2.2, 0.35, 'kioskSign'), signMat, { pos: [0, 0, 0.038] });
    st.add(rod([-0.9, 2.36, Dp / 2 + 0.1], [-0.9, 2.5, Dp / 2 + 0.1], 0.02), 'rust'); st.add(rod([0.9, 2.36, Dp / 2 + 0.1], [0.9, 2.44, Dp / 2 + 0.1], 0.02), 'rust');
    // striped awnings on the two open sides
    const awning = (o, len, n, tear) => {
      const a = st.sub(o), dx = len / n, drop = 0.72;
      for (let i = 0; i < n; i++) {
        if (tear.includes(i)) continue;
        const x = -len / 2 + dx * (i + 0.5), c = i % 2 ? '#e9dfc4' : '#c8705e', jl = (i % 3) * 0.03;
        a.add(kit.box(dx * 0.98, 0.022, drop - jl), 'flat', { pos: [x, -0.23, drop / 2 - jl / 2], rot: [0.66, 0, 0], color: c });
        a.add(new THREE.CircleGeometry(dx * 0.49, 8, Math.PI, Math.PI), 'flat', { pos: [x, -0.46 - jl * 0.5, drop * 0.78 - jl * 0.4], rot: [0.05, 0, 0], color: c });
      }
      a.add(kit.tube([[-len / 2, 0, 0.0], [len / 2, 0, 0.0]], 0.022, 0.022, 5, 4), 'rust', { pos: [0, 0, 0] });
      a.add(kit.tube([[-len / 2, -0.46, 0.56], [len / 2, -0.46, 0.56]], 0.018, 0.018, 5, 4), 'rust');
      for (const x of [-len / 2, 0, len / 2]) a.add(rod([x, 0, 0], [x, -0.46, 0.56], 0.016), 'rust');
    };
    awning({ pos: [0, 2.18, Dp / 2 + 0.2] }, Wd + 0.1, 9, [2]);
    awning({ pos: [Wd / 2 + 0.2, 2.18, 0], rot: [0, Math.PI / 2, 0] }, Dp, 7, [5]);
    // magazine racks on the +x side (hero-facing) and the front counter
    const mags = [0, 1, 2, 3, 4, 5, 6, 7];
    const rack = (o, cols, rows, gapx = 0.3) => {
      const r = st.sub(o), w = cols * gapx;
      r.add(kit.box(w + 0.1, rows * 0.42 + 0.1, 0.04), 'wood', { pos: [0, (rows * 0.42) / 2, -0.06], color: '#9e7f60' });
      for (let j = 0; j < rows; j++) {
        const y = 0.14 + j * 0.42;
        r.add(kit.box(w, 0.025, 0.12), 'wood', { pos: [0, y - 0.11, 0.02], color: '#b89470' });
        r.add(kit.box(w, 0.05, 0.015), 'rust', { pos: [0, y - 0.075, 0.08] });
        for (let i = 0; i < cols; i++) {
          if (rng() < 0.12) continue;
          r.add(atlas.quad(0.26, 0.36, `mag${pick(mags)}`), signMat, { pos: [-w / 2 + gapx * (i + 0.5), y + 0.05, 0.03], rot: [-0.14, 0, rng.range(-0.05, 0.05)] });
        }
      }
    };
    rack({ pos: [Wd / 2 + 0.06, 0.95, 0.18], rot: [0, Math.PI / 2, 0] }, 3, 3, 0.31);
    rack({ pos: [0.62, 1.03, Dp / 2 + 0.02] }, 3, 2, 0.3);
    // free-standing wire newspaper stand tipped against the kiosk
    const nw = st.sub({ pos: [Wd / 2 + 0.34, 0.14, -0.55], rot: [0, Math.PI / 2 + 0.15, -0.12] });
    for (const x of [-0.3, 0.3]) nw.add(kit.box(0.03, 1.0, 0.03), 'rust', { pos: [x, 0.5, 0] });
    for (const y of [0.32, 0.7]) { nw.add(kit.box(0.66, 0.02, 0.1), 'rust', { pos: [0, y, 0.04] }); nw.add(atlas.quad(0.26, 0.36, `mag${6}`), signMat, { pos: [-0.16, y + 0.16, 0.06], rot: [-0.14, 0, 0.02] }); nw.add(atlas.quad(0.26, 0.36, `mag${y < 0.5 ? 3 : 7}`), signMat, { pos: [0.16, y + 0.16, 0.06], rot: [-0.14, 0, -0.03] }); }
    // little goods on the counter
    st.add(kit.box(0.16, 0.05, 0.12), 'rust', { pos: [-0.7, 1.05, Dp / 2 + 0.08] });
    const ph = st.sub({ pos: [-0.25, 1.03, Dp / 2 + 0.05], rot: [0, 0.2, 0] });
    ph.add(kit.boxBase(0.26, 0.18, 0.2), 'flat', { color: '#d8938a' }); ph.add(kit.cyl(0.024, 0.024, 0.26, 6).rotateZ(Math.PI / 2), 'flat', { pos: [0, 0.2, 0.03], color: '#c97f76' }); ph.add(kit.cyl(0.055, 0.055, 0.012, 10).rotateX(Math.PI / 2), 'flat', { pos: [0, 0.1, 0.105], color: '#efe6cd' });

    // A plant, not a hedge: woody stems carry it up the posts and over the awnings, loose clumps hang off them with gaps between,
    // and the roof line, the counter and the walls stay readable. Each clump has its own leaf size and value, lit by its own smooth normal.
    const fr = ctx.seeded('kiosk-foliage'), jungle = [], trail = [];
    const sunL = SUN.clone().transformDirection(new M4().copy(st.m).invert()), HEART = new V3(0, 1.5, -0.1);
    const Y = new THREE.Color('#fff2a0'), DEEP = new THREE.Color('#bfe0d0'), REDISH = new THREE.Color('#ffc9a0');
    const CLUMPS = [ // centre, radii, leaf size, how much of the skin is leafed, tone lift, tint, loose (how shaggy the edge)
      // roof: a heap at the back-left falling away to lobes that spill over the edges in a few places, each its own leaf and value
      [[-0.56, 2.66, -0.3], [0.86, 0.46, 0.64], 0.16, 1, 0.02, null, 0.12], [[0.2, 2.56, -0.56], [0.46, 0.28, 0.36], 0.21, 0.95, 0.09, Y, 0.16], [[-0.92, 2.86, -0.52], [0.38, 0.32, 0.34], 0.13, 1, -0.05, DEEP, 0.12],
      [[0.74, 2.5, -0.1], [0.42, 0.24, 0.34], 0.12, 0.95, 0.04, null, 0.18], [[-0.9, 2.52, 0.56], [0.4, 0.26, 0.34], 0.19, 0.9, 0.07, Y, 0.18], [[-0.2, 2.5, 0.4], [0.42, 0.18, 0.3], 0.13, 0.9, -0.02, DEEP, 0.16],
      [[1.24, 2.36, -0.58], [0.26, 0.3, 0.34], 0.17, 0.95, 0.06, Y, 0.16], [[-0.5, 2.3, 1.0], [0.5, 0.2, 0.16], 0.14, 0.9, 0.0, null, 0.16], [[0.62, 2.44, 0.72], [0.3, 0.17, 0.2], 0.2, 0.85, -0.03, DEEP, 0.2],
      // left and back walls: tall sheets broken into patches
      [[-1.3, 1.62, -0.5], [0.2, 0.76, 0.44], 0.15, 0.95, -0.04, DEEP, 0.1], [[-1.3, 0.62, 0.42], [0.2, 0.62, 0.42], 0.2, 0.92, 0.04, null, 0.12], [[-0.62, 1.55, -1.0], [0.56, 0.74, 0.18], 0.13, 0.95, 0.0, null, 0.1],
      [[0.56, 0.72, -1.0], [0.5, 0.66, 0.18], 0.19, 0.85, -0.06, DEEP, 0.12], [[0.92, 1.8, -1.0], [0.26, 0.42, 0.17], 0.11, 0.85, 0.08, Y, 0.14],
      // foot of the posts and the counter
      [[1.27, 0.34, -0.6], [0.17, 0.34, 0.3], 0.14, 0.9, 0.0, null, 0.1], [[-0.62, 0.36, 0.95], [0.5, 0.34, 0.14], 0.18, 0.9, 0.06, null, 0.12], [[1.2, 0.34, 0.94], [0.2, 0.3, 0.16], 0.13, 0.9, -0.04, REDISH, 0.12],
    ].map(([c, r, size, cover, lift, tint, loose]) => ({ c: v(c), r: v(r), size, cover, lift, tint, loose }));
    const local = (p, c) => new V3((p.x - c.c.x) / c.r.x, (p.y - c.c.y) / c.r.y, (p.z - c.c.z) / c.r.z);
    const shaded = (p) => CLUMPS.some((c) => { // does the ray to the sun cross this clump?
      const o = local(p, c), d = new V3(sunL.x / c.r.x, sunL.y / c.r.y, sunL.z / c.r.z), b = o.dot(d), k = o.lengthSq() - 1;
      return k > 0 && b < 0 && b * b - d.lengthSq() * k > 0;
    });
    /** One leaf, local space. shell: the smooth normal it is lit by. lift: tone nudge. */
    const skin = (p, shell, s, lift = 0, list = jungle, tint = null) => {
      const dn = new V3(0, -1, 0).addScaledVector(shell, shell.y).normalize();
      dn.applyAxisAngle(shell, Math.abs(shell.y) > 0.72 ? fr() * 6.283 : fr.range(-1.1, 1.1));
      const tip = dn.multiplyScalar(0.8).addScaledVector(shell, fr.range(0.05, 0.75)).normalize();
      const patch = Math.sin(p.x * 2.7 + 1) * Math.sin(p.y * 2.3 + 0.6) * Math.sin(p.z * 3.1 + 2), hid = inside(p) || shaded(p.clone().addScaledVector(shell, 0.12));
      let t = shell.dot(sunL) * 0.5 + 0.5 + patch * 0.1 + fr.range(-0.03, 0.03) - Math.max(0, -shell.y) * 0.16 + lift;
      const nrm = shell.clone();
      if (hid) { t = Math.min(t, 0.5) + fr.range(-0.1, 0.06); nrm.addScaledVector(sunL, -(nrm.dot(sunL) + 0.1)).normalize(); }
      const tone = tint ? shellTone(t).clone().multiply(tint) : shellTone(t);
      list.push({ p: p.clone().applyMatrix4(st.m), shell: nrm.transformDirection(st.m), tip: tip.transformDirection(st.m), s, tone });
    };
    const inside = (p, m = 0) => Math.abs(p.x) < Wd / 2 - m && Math.abs(p.z) < Dp / 2 - m && p.y < 2.3; // the shop itself
    // Windows kept clear of leaves: the hero-side roof line and corner, and bites out of the wall sheets where boards, poster and counter show.
    const WINDOWS = [[1.32, 2.4, 0.42, 0.42, 0.3, 0.42], [1.3, 2.4, -0.12, 0.2, 0.26, 0.14], [0.2, 2.36, 1.12, 0.3, 0.3, 0.2], [-1.34, 1.3, 0.22, 0.3, 0.46, 0.34], [-1.3, 2.0, 0.42, 0.3, 0.36, 0.3], [-0.05, 1.28, -1.0, 0.36, 0.46, 0.3], [-0.98, 0.72, -1.02, 0.3, 0.4, 0.3], [0.95, 2.45, -0.92, 0.24, 0.3, 0.26]];
    const bare = (p) => WINDOWS.some(([x, y, z, a, b, c]) => ((p.x - x) / a) ** 2 + ((p.y - y) / b) ** 2 + ((p.z - z) / c) ** 2 < 1) || Math.sin(p.x * 4.3 + 1.2) * Math.sin(p.y * 3.7 + 0.4) * Math.sin(p.z * 4.9 + 2.1) + 0.45 * Math.sin(p.x * 9.1 + p.y * 7.3 - p.z * 8.3) > 0.46;
    for (const c of CLUMPS) {
      const { r } = c, wx = r.y * r.z, wy = r.x * r.z, wz = r.x * r.y;
      const area = 4 * Math.PI * ((wx ** 1.6 + wy ** 1.6 + wz ** 1.6) / 3) ** (1 / 1.6), n = Math.round(area * 175 * (0.137 / c.size) ** 2 * c.cover);
      for (let i = 0; i < n; i++) {
        // even coverage on squashed ellipsoids: pick a face by projected area, then a golden-angle disc point on it, so no bald patches beyond the ones wanted
        const ax = (i * 0.7548777) % 1 * (wx + wy + wz), ang = i * 2.39996 + fr() * 0.5, rad = Math.sqrt((i + 0.5) / n), p0 = Math.cos(ang) * rad, p1 = Math.sin(ang) * rad;
        const h = Math.sqrt(Math.max(0, 1 - rad * rad)) * ((i * 0.5698403) % 1 < 0.82 ? 1 : -1), e = i % 2 ? 1 : -1;
        const d = ax < wx ? new V3(h * e, p0, p1) : ax < wx + wy ? new V3(p0, h, p1) : new V3(p0, p1, h * e);
        const bump = 1 + 0.14 * Math.sin(d.x * 5 + c.c.x * 3) * Math.sin(d.y * 4 + 1) * Math.sin(d.z * 5 + c.c.z * 3) + fr.range(-c.loose, c.loose);
        const p = new V3(c.c.x + d.x * r.x * bump, c.c.y + d.y * r.y * bump, c.c.z + d.z * r.z * bump);
        if (inside(p, 0.05) || bare(p) || CLUMPS.some((o) => o !== c && local(p, o).lengthSq() < 0.7)) continue;
        const crease = Math.min(...CLUMPS.filter((o) => o !== c).map((o) => local(p, o).lengthSq()));
        const shell = new V3(d.x / r.x, d.y / r.y, d.z / r.z).normalize().lerp(new V3(p.x - HEART.x, (p.y - HEART.y) * 1.4, p.z - HEART.z).normalize(), 0.28).normalize();
        skin(p, shell, c.size * fr.range(0.74, 1.3), c.lift + (crease < 1.3 ? -0.14 * (1.3 - crease) / 0.5 : 0), jungle, c.tint);
      }
    }
    /** Leaves strung along a vine: they belong to the kiosk's mass, so they take its overall shell. */
    const strung = (list, lift) => (c, n, sz, out) => {
      for (let i = 0; i < n * 2; i++) {
        const p = c.getPointAt(fr()), a = fr() * 6.283, y = fr.range(-0.4, 1), k = Math.sqrt(1 - y * y), d = new V3(Math.cos(a) * k, y, Math.sin(a) * k);
        p.addScaledVector(d, out);
        skin(p, new V3(p.x - HEART.x, (p.y - HEART.y) * 0.9, p.z - HEART.z).normalize().addScaledVector(d, 0.3).normalize(), sz * 0.65 * fr.range(0.62, 1.05), lift, list);
      }
    };
    const emit = strung(jungle, 0), bark = '#6f5840', barkLit = '#8a7052';
    const post = (x, z, ph, turns, top) => climb(curveOf([[x, 0.08, z], [x, 1.2, z], [x, top, z]]), 0, 1, 0.082, turns, ph, 24);
    const stem = (pts, r0, r1, leaves, size = 0.26, col = bark) => vine(st, pts, r0, r1, { leaves, size, emit, stem: col });
    // the two stems the default camera sees whole: up the open-side posts, one along the roof edge, one down across the awning
    stem([...post(Wd / 2, Dp / 2, 0.4, 1.7, 2.12), [1.2, 2.34, 0.93], [1.3, 2.42, 0.58], [1.24, 2.43, 0.16], [0.92, 2.47, -0.2], [0.42, 2.56, -0.42]], 0.062, 0.02, 1.1);
    stem([...post(Wd / 2, -Dp / 2, 2.2, 1.5, 2.02), [1.28, 2.2, -0.88], [1.42, 2.17, -0.62], [1.6, 2.03, -0.44], [1.78, 1.89, -0.34], [1.93, 1.77, -0.3]], 0.058, 0.018, 1.0, 0.24, barkLit);
    stem([[1.14, 2.08, 0.93], [0.92, 2.16, 1.06], [0.72, 2.11, 1.2], [0.46, 1.98, 1.36], [0.3, 1.86, 1.5], [0.2, 1.78, 1.61]], 0.03, 0.014, 1.0, 0.24, barkLit);
    stem([[1.42, 2.17, -0.62], [1.56, 2.07, -0.2], [1.72, 1.94, 0.12], [1.93, 1.77, 0.2]], 0.024, 0.012, 0.9, 0.24, barkLit);
    stem([[1.5, 2.1, 0.1], [1.6, 2.04, 0.34], [1.78, 1.9, 0.5], [1.92, 1.78, 0.58]], 0.018, 0.01, 0.8, 0.22, barkLit);
    // the old wood at the back-left, and a counter runner
    stem([...post(-Wd / 2, Dp / 2, 1.1, 1.5, 2.06), [-1.24, 2.34, 0.96], [-1.0, 2.46, 0.8], [-0.8, 2.56, 0.6]], 0.06, 0.02, 1.2);
    stem([[-1.36, 0, -1.0], [-1.27, 0.8, -0.96], [-1.3, 1.7, -0.97], [-1.1, 2.44, -0.8], [-0.4, 2.62, -0.5], [0.3, 2.56, -0.28]], 0.095, 0.028, 1.2);
    stem([[1.34, 0, -1.02], [1.3, 0.9, -0.97], [1.26, 1.9, -0.96], [1.0, 2.46, -0.7]], 0.075, 0.03, 1.0);
    stem([[-0.5, 0, -1.02], [-0.42, 1.1, -0.92], [0.15, 1.9, -0.92], [0.2, 2.42, -0.74]], 0.066, 0.025, 1.2);
    stem([[0.05, 0.03, 1.1], [0.32, 0.42, 0.95], [0.62, 0.36, 0.93], [0.86, 0.72, 0.93], [1.12, 0.9, 0.95]], 0.04, 0.018, 3);
    // a little leaf where the awning stems have rooted, not a blanket over the stripes
    const spill = (p, s) => { skin(p, new V3(p.x * 0.3, 1, p.z * 0.45).normalize(), s); };
    for (let i = 0; i < 46; i++) { const x = fr.range(0.1, 1.05), t = fr() * fr(), z = Dp / 2 + 0.25 + t * 0.34; spill(v([x - t * 0.5, 2.2 - (z - Dp / 2 - 0.2) * 0.82, z]), fr.range(0.1, 0.17)); }
    for (let i = 0; i < 44; i++) { const z = fr.range(-Dp / 2, 0.3), t = fr() * fr(), xo = 0.25 + t * 0.34; spill(v([Wd / 2 + xo, 2.2 - (xo - 0.2) * 0.82, z - t * 0.3]), fr.range(0.11, 0.18)); }
    group.add(shellMesh(jungle, [s.x, SOIL + 1.3, s.z], true));
    for (const c of [[-1.45, 0, -0.1, 0.5], [1.5, 0, -0.9, 0.4], [-0.7, 0, 1.12, 0.32], [1.6, 0, 0.6, 0.3]]) { tuft(st, [c[0], 0.03, c[2]], 14, 0.7, c[3]); fern(st, [c[0] * 0.95, 0.03, c[2] * 0.95], 5, 0.72); }
    posy(st, [0.2, 0.03, 1.12], 6, 0.5, P.flowerYellow); posy(st, [1.54, 0.03, 0.15], 5, 0.44, P.flowerWhite);
    moss(st, [0.4, 0.15, Dp / 2 + 0.1], [0.5, 0.04, 0.14], P.mossLit); moss(st, [Wd / 2 + 0.06, 0.15, 0.3], [0.1, 0.03, 0.46]);
    // Trailing strands: fixed at the roof or awning edge, swinging more the further down they hang. One merged mesh, its vertices rewritten in update().
    const STRANDS = [ // start, length. Past the awning lips and off the roof corners
      [1.93, 1.77, -0.3, 1.25], [1.93, 1.77, 0.2, 0.86], [1.92, 1.78, 0.58, 1.08], [1.33, 2.12, 1.04, 1.5], [0.2, 1.78, 1.61, 1.02], [-0.42, 1.74, 1.6, 0.78], [-0.8, 1.74, 1.6, 1.22],
      [-1.39, 2.28, 0.74, 1.3], [-1.39, 2.28, -0.92, 0.92], [0.3, 2.28, -1.07, 1.12], [1.16, 2.28, -1.07, 1.34], [1.34, 2.28, -1.02, 0.7],
    ];
    const pos = [], col = [], shl = [], weight = [], idx = [], runs = [];
    const lc = shellLeaf.attributes.color, lp = shellLeaf.attributes.position, bk = new THREE.Color(barkLit), c0 = new THREE.Color();
    STRANDS.forEach(([x, y, z, L], si) => {
      const A = new V3(x, y, z).applyMatrix4(st.m), first = pos.length / 3, drift = fr.range(0.05, 0.14) * fr.sign(), w0 = fr() * 6.28;
      const curve = curveOf(Array.from({ length: 6 }, (_, i) => { const q = i / 5; return [A.x + Math.sin(q * 3 + w0) * 0.05 + drift * q * q, A.y - L * q, A.z + Math.cos(q * 2.4 + w0) * 0.05 + drift * 0.6 * q * q]; }));
      const wt = (py) => Math.max(0, (A.y - py) / L) ** 1.5;
      const tb = kit.tube(curve.points, 0.021, 0.008, 4, 12, { capEnds: false }), tp = tb.attributes.position, tn = tb.attributes.normal, tu = pos.length / 3;
      for (let i = 0; i < tp.count; i++) { pos.push(tp.getX(i), tp.getY(i), tp.getZ(i)); col.push(bk.r, bk.g, bk.b); shl.push(tn.getX(i), tn.getY(i), tn.getZ(i)); weight.push(wt(tp.getY(i))); }
      const ti = tb.index; for (let i = 0; i < ti.count; i++) idx.push(ti.getX(i) + tu);
      const list = [], back = new V3(0, 0, 0).applyMatrix4(st.m), n = Math.round(L * 19);
      for (let i = 0; i < n; i++) {
        const q = (i + 0.5) / n, p = curve.getPointAt(q), a = i * 2.4 + fr() * 0.8, o = new V3(Math.cos(a), fr.range(-0.1, 0.25), Math.sin(a)).normalize();
        const lp0 = p.clone().addScaledVector(o, 0.022).applyMatrix4(new M4().copy(st.m).invert());
        const sh = new V3(lp0.x - HEART.x, 0.2 + (lp0.y - HEART.y) * 0.5, lp0.z - HEART.z).normalize().addScaledVector(o, 0.5).normalize();
        skin(lp0, sh, (0.1 + 0.075 * Math.sin(Math.min(1, q * 1.15) * 3.14) + (i % 5 === 0 ? 0.03 : 0)) * fr.range(0.85, 1.2), si % 3 === 1 ? 0.07 : 0, list);
      }
      const T = new V3(), U = new V3(), B = new V3();
      for (const l of list) {
        T.copy(l.tip); U.copy(l.shell).addScaledVector(T, -l.shell.dot(T)).normalize(); B.crossVectors(U, T).normalize();
        const k = pos.length / 3;
        for (let i = 0; i < lp.count; i++) {
          const q = l.p.clone().addScaledVector(B, lp.getX(i) * l.s).addScaledVector(U, lp.getY(i) * l.s).addScaledVector(T, lp.getZ(i) * l.s);
          pos.push(q.x, q.y, q.z); c0.copy(l.tone); col.push(c0.r * lc.getX(i), c0.g * lc.getY(i), c0.b * lc.getZ(i)); shl.push(l.shell.x, l.shell.y, l.shell.z); weight.push(wt(q.y));
        }
        const si2 = shellLeaf.index; for (let i = 0; i < si2.count; i++) idx.push(k + si2.getX(i));
      }
      runs.push({ a: first, b: pos.length / 3, x: A.x, z: A.z, L, ph: fr() * 6.28, sp: fr.range(0.85, 1.25) });
    });
    const tg = new THREE.BufferGeometry(), nv = pos.length / 3, rest = new Float32Array(pos);
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    tg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); tg.setAttribute('aShell', new THREE.Float32BufferAttribute(shl, 3)); tg.setIndex(idx);
    const tm = new THREE.Mesh(tg, shellMat); tm.frustumCulled = false; tm.castShadow = false; tm.receiveShadow = false; group.add(ctx.softEdge(tm));
    const wgt = new Float32Array(weight), TP = tg.attributes.position;
    strandSwing = (t) => { // closed form in t, so frozen frames hold
      for (const r of runs) {
        const gx = (ctx.wind(t * r.sp, r.x, r.z) * 0.13 + Math.sin(t * 1.9 * r.sp + r.ph) * 0.045) * r.L, gz = (ctx.wind(t * r.sp * 0.8 + 3, r.x, r.z) * 0.07 + Math.cos(t * 1.4 * r.sp + r.ph) * 0.04) * r.L;
        for (let i = r.a; i < r.b; i++) { const w = wgt[i]; TP.setXYZ(i, rest[i * 3] + gx * w, rest[i * 3 + 1] - 0.5 * (gx * gx + gz * gz) * w * w / r.L, rest[i * 3 + 2] + gz * w); }
      }
      TP.needsUpdate = true;
    };
    for (let i = 49538; i > 0; i--) rng(); // the leaves above draw from their own stream now; this keeps every prop built after the kiosk exactly where it was
  }

  /* ================================================================= fallen billboard ==================== */
  function billboard() {
    const s = STREET.billboard, bx = s.baseX, bz = s.baseZ;
    const L = Math.hypot(s.tipX - bx, s.tipZ - bz), u = new V3((s.tipX - bx) / L, 0, (s.tipZ - bz) / L), n = new V3(-u.z, 0, u.x);
    if (n.z < 0) n.negate(); // n points at the camera side of the pillar
    const along = (d, y = 0, off = 0) => [bx + u.x * d + n.x * off, y, bz + u.z * d + n.z * off];
    // footing and the snapped stump
    W.add(chipped(kit.boxBase(1.25, 0.46, 1.25, 3, 1, 3), 0.05), 'concrete', { pos: [bx, 0, bz], rot: [0, 0.59, 0] });
    W.add(chipped(kit.boxBase(0.86, 0.16, 0.86), 0.02), 'flat', { pos: [bx, 0.44, bz], rot: [0, 0.59, 0], color: steelDark });
    for (let i = 0; i < 4; i++) { const a = 0.59 + 0.785 + i * 1.571; W.add(kit.cylBase(0.04, 0.04, 0.14, 6), 'rust', { pos: [bx + Math.cos(a) * 0.5, 0.56, bz + Math.sin(a) * 0.5] }); }
    // Galvanised like the pillar it was: a thin tube wall torn low on the side that fell, its two lips standing away from it.
    const fall = Math.atan2(u.z, u.x), tf = ctx.seeded('billboard-tear');
    const pipeCol = '#9ab0aa', pipeIn = '#46565a';
    const stump = tornPipe(0.285, 0.03, 0.74, (a) => { const q = Math.abs(Math.atan2(Math.sin(a - fall), Math.cos(a - fall))) / Math.PI; return 0.1 + 0.58 * q * q; }, tf);
    W.add(stump.outer, worn, { pos: [bx, 0.58, bz], color: pipeCol }); W.add(stump.inner, 'flat', { pos: [bx, 0.58, bz], color: pipeIn });
    W.add(kit.cyl(0.25, 0.25, 0.02, 14), 'flat', { pos: [bx, 0.84, bz], color: '#2f4044' }); // the dark inside of the tube, not a fill
    W.add(kit.cyl(0.32, 0.32, 0.06, 14), 'flat', { pos: [bx, 0.8, bz], color: steelDark }); // same flange as the pillar's
    W.add(tornBand(stump, 0.03, tf), 'rust', { pos: [bx, 0.58, bz] });
    // a bent tongue of steel still joining stump and pillar
    const j0 = [bx + u.x * 0.3, 0.92, bz + u.z * 0.3], j1 = along(0.9, 0.9, 0);
    W.add(kit.tube([[bx + u.x * 0.27, 0.72, bz + u.z * 0.27], j0, lerp3(j0, j1, 0.5).map((c, i) => (i === 1 ? c + 0.1 : c)), j1], 0.04, 0.05, 4, 12), 'rust');
    // pillar: one long tube with a flange every section, lifting at the torn end
    const pts = [along(0.75, 0.86), along(1.8, 0.5), along(3.0, 0.27), along(4.6, 0.205), along(L - 0.45, 0.2)];
    W.add(kit.tube(pts, 0.25, 0.19, 10, 30), worn, { color: '#9ab0aa' });
    const ang = Math.atan2(u.x, u.z);
    const pc = curveOf(pts);
    // the broken end: the tube wall runs on past the cap and tears into teeth, a rust scorch following the tear
    const brk = tornPipe(0.258, 0.028, 0.56, (a) => 0.14 + 0.14 * Math.abs(Math.sin(a * 1.5 + 0.7)), tf, 18); // len stays above the tallest tooth, or the tear clips flat
    const bT = pc.getTangentAt(0).negate(), bP = pc.getPointAt(0.0), bM = new M4().compose(bP.clone().addScaledVector(bT, -0.06), new Q().setFromUnitVectors(UP, bT), new V3(1, 1, 1));
    W.add(brk.outer, worn, { matrix: bM, color: '#9ab0aa' }); W.add(brk.inner, 'flat', { matrix: bM, color: '#46565a' });
    W.add(tornBand(brk, 0.03, tf), 'rust', { matrix: bM });
    W.add(kit.cyl(0.232, 0.232, 0.02, 14), 'flat', { matrix: bM.clone().multiply(kit.xf({ pos: [0, 0.1, 0] })), color: '#2f4044' });
    for (const t of [0.26, 0.5, 0.74]) { const p = pc.getPointAt(t), T = pc.getTangentAt(t); W.add(kit.cyl(0.295, 0.295, 0.06, 12), 'flat', { matrix: new M4().compose(p, new Q().setFromUnitVectors(UP, T), new V3(1, 1, 1)), color: steelDark }); }
    for (let i = 0; i < 7; i++) { const t = 0.08 + i * 0.075, p = pc.getPointAt(t), A = [p.x - n.x * 0.1, p.y + 0.27, p.z - n.z * 0.1]; W.add(kit.torus(0.1, 0.014, 4, 8, Math.PI), 'rust', { pos: A, rot: [0, ang + Math.PI / 2, 0] }); }
    // panel, propped up on the pillar with its near edge on the road
    // the panel tore loose from its brackets: skewed off the pillar's axis, resting on the pillar with its near edge on the road
    const tilt = 0.4, cu = 5.0, cn = 0.05, skew = 0.2, Wd = 3.7, Hg = 2.1;
    const X = u.clone().multiplyScalar(Math.cos(skew)).addScaledVector(n, Math.sin(skew));
    const nn = n.clone().multiplyScalar(Math.cos(skew)).addScaledVector(u, -Math.sin(skew));
    const Yv = nn.clone().multiplyScalar(-Math.cos(tilt)).add(new V3(0, Math.sin(tilt), 0)), Z = new V3().crossVectors(X, Yv);
    const c = along(cu, 0.05 + (Hg / 2) * Math.sin(tilt) + 0.03, cn);
    const m = new M4().makeBasis(X, Yv, Z).setPosition(c[0], c[1], c[2]);
    const pn = new Stage(T, m);
    pn.add(kit.box(Wd, Hg, 0.05), worn, { color: '#8a9a96' });
    for (const [a, b, w] of [[[-Wd / 2, Hg / 2 + 0.03, 0], [Wd / 2, Hg / 2 + 0.03, 0], 0.09], [[-Wd / 2, -Hg / 2 - 0.03, 0], [Wd / 2, -Hg / 2 - 0.03, 0], 0.09], [[-Wd / 2 - 0.03, -Hg / 2 - 0.05, 0], [-Wd / 2 - 0.03, Hg / 2 + 0.05, 0], 0.09], [[Wd / 2 + 0.03, -Hg / 2 - 0.05, 0], [Wd / 2 + 0.03, Hg / 2 - 0.25, 0], 0.09]]) pn.add(bar(a, b, w, 0.14), worn, { color: '#6f8280' });
    for (const x of [-1.2, 0, 1.2]) pn.add(bar([x, -Hg / 2, -0.08], [x, Hg / 2, -0.08], 0.07, 0.07), worn, { color: steelDark });
    pn.add(bar([-Wd / 2, 0.45, -0.08], [Wd / 2, 0.45, -0.08], 0.06, 0.06), worn, { color: steelDark }); pn.add(bar([-Wd / 2, -0.45, -0.08], [Wd / 2, -0.45, -0.08], 0.06, 0.06), worn, { color: steelDark });
    pn.add(rod([0.6, 0, -0.1], [0.6, -0.05, -0.42], 0.05), 'rust'); pn.add(rod([-0.9, 0, -0.1], [-0.9, -0.05, -0.42], 0.05), 'rust');
    // torn poster: older poster beneath, bare steel at the worst tear
    const W2 = 3.56, H2 = 1.96, a = W2 / 2, b = H2 / 2;
    const under = pn.sub({ pos: [0, 0, 0.03] });
    under.add(atlas.poly(W2, H2, 'poster2', [[0.4, -b], [a, -b], [a, b], [0.8, b], [1.0, 0.2]]), signMat);
    const tear = (pts0, jit) => kit.jag(pts0, 0.17, jit, rng, true);
    const out = tear([[-a, -b], [0.55, -b], [0.92, -0.42], [0.7, -0.05], [1.2, 0.3], [1.06, 0.62], [1.42, b], [-a, b]], 0.07).map(([x, y]) => [Math.max(-a, Math.min(a, x)), Math.max(-b, Math.min(b, y))]);
    pn.add(atlas.poly(W2, H2, 'poster', out), signMat, { pos: [0, 0, 0.042] });
    // goosenecks
    for (const x of [-1.1, 1.0]) { const k = x < 0 ? 0.0 : 0.5; pn.add(kit.tube([[x, Hg / 2, 0.02], [x, Hg / 2 + 0.3, 0.22], [x + k * 0.3, Hg / 2 + 0.22, 0.52], [x + k * 0.5, Hg / 2 + 0.02 - k * 0.2, 0.6]], 0.025, 0.018, 5, 10), 'rust'); pn.add(kit.cylBase(0.09, 0.13, 0.07, 8), worn, { pos: [x + k * 0.5, Hg / 2 - 0.03 - k * 0.2, 0.6], color: steelDark, rot: [0.4, 0, 0] }); }
    // torn flap peeling up from the tear
    const hinge = pn.w([0.62, -0.38, 0.06]);
    const flap = ctx.batch(), ft = { main: flap, soft: flap, glass: flap, glassMat, kit };
    new Stage(ft, new M4().multiplyMatrices(new M4().makeTranslation(-hinge.x, -hinge.y, -hinge.z), m)).add(atlas.poly(W2, H2, 'poster', [[0.62, -0.38], [0.9, -0.42], [1.34, -0.72], [1.1, -0.2], [0.84, -0.02]]), signMat, { pos: [0, 0, 0.1], rot: [0, -0.5, 0] });
    const fg = flap.build({ castShadow: false }); fg.position.copy(hinge);
    group.add(fg); swayers.push({ g: fg, x: hinge.x, z: hinge.z, amp: 0.09, speed: 1.5, axis: 'xz', ph: 0.3 });
    // reclaiming plants along pillar and around the panel
    vine(W, [along(1.2, 0.05, -0.28), along(1.9, 0.75, -0.14), along(2.5, 0.62, 0.05), along(3.0, 0.05, 0.3)], 0.03, 0.014, { leaves: 6, size: 0.25 });
    vine(W, [along(2.2, 0.03, 0.34), along(2.7, 0.6, 0.14), along(3.5, 0.64, -0.2), along(4.1, 0.22, -0.4)], 0.028, 0.012, { leaves: 6, size: 0.24 });
    vine(W, [along(0.2, 0, -0.62), [bx - 0.24, 0.72, bz + 0.26], [bx + 0.2, 0.95, bz + 0.27], [bx + 0.33, 1.14, bz - 0.06]], 0.035, 0.012, { leaves: 5, size: 0.24 });
    moss(W, [bx + 0.2, 0.47, bz + 0.3], [0.34, 0.06, 0.26], P.mossLit); moss(W, [bx - 0.42, 0.46, bz - 0.1], [0.22, 0.05, 0.3]);
    for (const t of [0.12, 0.3, 0.46]) { const p = pc.getPointAt(t); moss(W, [p.x, p.y + 0.06, p.z], [0.4, 0.215, 0.29], t > 0.2 ? P.mossDeep : P.moss); }
    for (const d of [1.7, 2.4, 2.9, 3.4]) { tuft(W, along(d, 0.0, 0.33), 10, 0.5, 0.14); tuft(W, along(d + 0.2, 0.0, -0.34), 8, 0.42, 0.12); }
    tuft(W, [bx + 0.8, 0.1, bz - 0.3], 14, 0.7, 0.2); fern(W, [bx - 0.7, 0.05, bz - 0.5], 5, 0.72); fern(W, along(1.2, 0.05, 0.5), 5, 0.65); posy(W, along(2.6, 0.0, 0.42), 5, 0.32, P.flowerWhite);
    // creeping up over the panel corner and bottom edge
    const edgeA = pn.w([-Wd / 2 + 0.08, -Hg / 2 - 0.05, 0.14]);
    vine(pn, [[-Wd / 2 - 0.1, -Hg / 2 - 0.12, -0.1], [-Wd / 2 + 0.1, -Hg / 2 + 0.25, 0.1], [-Wd / 2 + 0.34, -Hg / 2 + 0.6, 0.1], [-Wd / 2 + 0.2, -Hg / 2 + 1.1, 0.12]], 0.024, 0.01, { leaves: 9, size: 0.24 });
    moss(pn, [-1.25, -Hg / 2 + 0.03, 0.06], [0.5, 0.09, 0.06]); moss(pn, [1.2, -Hg / 2 + 0.02, 0.06], [0.36, 0.07, 0.05], P.mossLit);
    tuft(W, [edgeA.x, 0, edgeA.z + 0.05], 12, 0.5, 0.2); tuft(W, along(cu + 1.7, 0, cn + 0.95), 9, 0.5, 0.14); fern(W, along(L - 0.35, 0.02, cn + 0.92), 4, 0.5);
  }

  /* ================================================================= neon wreck ========================== */
  function neon() {
    const s = STREET.neonWreck, st = at(s.x + 0.18, SW, s.z, s.yaw, -0.27, 0.05), Wd = 1.5, Hg = 3.75;
    const frameC = '#6f7f80', hw = Wd / 2;
    // back plate with a torn top corner (local +x is toward the back of the street, -z world)
    const back = kit.jag([[-hw, 0.05], [hw, 0.05], [hw, Hg - 0.75], [hw - 0.34, Hg - 0.42], [hw - 0.22, Hg - 0.12], [-hw, Hg - 0.02]], 0.5, 0.05, rng);
    st.add(new THREE.ExtrudeGeometry(new THREE.Shape(back.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.03, bevelEnabled: false }), 'flat', { pos: [0, 0, -0.03], color: '#2c5863' });
    st.add(bar([-hw, 0, 0], [-hw, Hg, 0], 0.09, 0.14), worn, { color: frameC }); st.add(bar([hw, 0, 0], [hw, Hg - 0.8, 0], 0.09, 0.14), worn, { color: frameC });
    st.add(bar([-hw - 0.05, 0.02, 0], [hw + 0.05, 0.02, 0], 0.1, 0.14), worn, { color: frameC }); st.add(bar([-hw, Hg, 0], [hw - 0.3, Hg - 0.08, 0], 0.08, 0.14), worn, { color: frameC });
    for (const y of [1.15, 2.3]) st.add(bar([-hw, y, -0.04], [hw, y + 0.03, -0.04], 0.05, 0.05), worn, { color: steelDark });
    st.add(kit.tube([[hw, Hg - 0.8, 0], [hw + 0.02, Hg - 0.62, 0.06], [hw + 0.12, Hg - 0.52, 0.16]], 0.04, 0.03, 4, 8), 'rust');
    st.add(rod([hw, 0.55, -0.02], [hw + 0.05, 0.08, -0.5], 0.03), 'rust'); st.add(rod([-hw, 0.55, -0.02], [-hw - 0.05, 0.08, -0.5], 0.03), 'rust'); // feet props
    st.add(kit.box(0.5, 0.26, 0.12), 'rust', { pos: [0.3, 0.3, -0.12] }); // transformer box behind
    // glass tube letters: 三日月 with スナック beside it, dead and pale. Coordinates in [0,1] with y down.
    const chars = {
      三: [[[0.14, 0.17], [0.86, 0.17]], [[0.24, 0.5], [0.76, 0.5]], [[0.08, 0.84], [0.92, 0.84]]],
      日: [[[0.22, 0.08], [0.78, 0.08], [0.78, 0.92], [0.22, 0.92], [0.22, 0.08]], [[0.22, 0.5], [0.78, 0.5]]],
      月: [[[0.3, 0.08], [0.3, 0.6], [0.14, 0.94]], [[0.3, 0.08], [0.76, 0.08], [0.76, 0.9], [0.62, 0.84]], [[0.3, 0.36], [0.76, 0.36]], [[0.3, 0.62], [0.76, 0.62]]],
      ス: [[[0.2, 0.15], [0.8, 0.15], [0.55, 0.55], [0.15, 0.9]], [[0.52, 0.52], [0.88, 0.9]]],
      ナ: [[[0.1, 0.38], [0.9, 0.38]], [[0.55, 0.08], [0.55, 0.55], [0.25, 0.92]]],
      ッ: [[[0.25, 0.42], [0.33, 0.6]], [[0.5, 0.36], [0.56, 0.55]], [[0.8, 0.36], [0.7, 0.7], [0.45, 0.92]]],
      ク: [[[0.4, 0.08], [0.15, 0.45]], [[0.35, 0.22], [0.82, 0.22], [0.7, 0.62], [0.35, 0.92]]],
    };
    const writeChar = (ch, cx, cy, size, col, r, skip = -1, droop = -1) => {
      chars[ch].forEach((stroke, si) => {
        if (si === skip) return;
        const p = stroke.map(([x, y], i) => [cx + (x - 0.5) * size, cy - (y - 0.5) * size + (si === droop && i > 0 ? -0.12 * i : 0), 0.09 + (si === droop ? 0.03 * i : 0)]);
        const g = p.length === 2 ? rod(p[0], p[1], r, r, 6) : kit.tube(p, r, r, 6, p.length * 7, { tension: 0.18 });
        st.soft(g, leafMat, { color: col });
        for (const q of [p[0], p[p.length - 1]]) { st.add(kit.cyl(0.03, 0.03, 0.08, 5).rotateX(Math.PI / 2), 'flat', { pos: [q[0], q[1], 0.04], color: '#9fb0ae' }); st.soft(kit.sphere(r * 1.02, 5, 4), leafMat, { pos: q, color: '#b9b7a8' }); }
      });
    };
    const pink = '#f2c3cf', aqua = '#bfeee3', pale = '#f4efd8';
    writeChar('三', -0.2, 2.95, 0.92, pink, 0.042);
    writeChar('日', -0.2, 1.96, 0.92, pink, 0.042);
    writeChar('月', -0.2, 0.95, 0.92, pink, 0.042, -1, 2);
    writeChar('ス', 0.52, 2.5, 0.42, aqua, 0.03); writeChar('ナ', 0.52, 2.04, 0.42, aqua, 0.03); writeChar('ッ', 0.52, 1.6, 0.42, aqua, 0.03); writeChar('ク', 0.52, 1.14, 0.42, aqua, 0.03, 0);
    // crescent outline at the top right plus broken border tube
    const arc = (r, a0, a1, n = 8) => Array.from({ length: n }, (_, i) => { const a = a0 + ((a1 - a0) * i) / (n - 1); return [0.5 + Math.cos(a) * r, 3.04 + Math.sin(a) * r, 0.09]; });
    st.soft(kit.tube(arc(0.22, 0.9, 5.2), 0.03, 0.03, 5, 22), leafMat, { color: pale });
    st.soft(kit.tube([...arc(0.14, 0.9, 5.2, 6).map((p, i) => [p[0] + 0.1, p[1], p[2]])], 0.026, 0.026, 5, 18), leafMat, { color: pale });
    const by = [[-hw + 0.1, 0.14], [hw - 0.1, 0.14], [hw - 0.1, 0.8]];
    st.soft(kit.tube(by.map(([x, y]) => [x, y, 0.09]), 0.03, 0.03, 5, 14, { tension: 0.02 }), leafMat, { color: aqua });
    st.soft(kit.tube([[-hw + 0.1, Hg - 0.12, 0.09], [-hw + 0.1, 1.3, 0.09]], 0.03, 0.03, 5, 6), leafMat, { color: aqua });
    // broken tube swinging off the plate
    st.soft(kit.tube([[hw - 0.1, 0.8, 0.09], [hw - 0.06, 0.62, 0.22], [hw + 0.02, 0.5, 0.3]], 0.03, 0.03, 5, 8), leafMat, { color: aqua });
    W.add(kit.tube([st.w([0.3, 0.3, -0.05]), st.w([0.0, 0.05, -0.3]), st.w([-0.3, 0.02, 0.2]), st.w([-0.55, 0.06, 0.45])], 0.016, 0.016, 4, 14), 'flat', { color: ink });
    // reclaiming: a vine up the near rail, moss on the base, weeds around its feet, leaves caught along the top
    vine(st, [[-hw - 0.05, 0.02, 0.1], [-hw + 0.02, 0.8, 0.12], [-hw - 0.04, 1.7, 0.12], [-hw + 0.05, 2.6, 0.12], [-hw - 0.02, 3.3, 0.12], [-hw + 0.3, Hg - 0.02, 0.1]], 0.036, 0.012, { leaves: 5.5, size: 0.25 });
    vine(st, [[0.15, 0.03, 0.14], [0.4, 0.45, 0.15], [0.95, 0.62, 0.15], [0.86, 1.05, 0.14]], 0.024, 0.01, { leaves: 6, size: 0.2 });
    moss(st, [-0.2, 0.08, 0.05], [0.64, 0.08, 0.13], P.mossLit); moss(st, [-0.5, Hg - 0.04, 0.03], [0.34, 0.07, 0.1]);
    tuft(W, [s.x + 0.4, SW, s.z + 0.5], 13, 0.7, 0.2); tuft(W, [s.x + 0.5, SW, s.z - 0.6], 12, 0.62, 0.2); fern(W, [s.x + 0.1, SW, s.z + 0.78], 5, 0.72); fern(W, [s.x + 0.42, SW, s.z - 0.1], 4, 0.55); posy(W, [s.x + 0.52, SW, s.z + 0.1], 5, 0.4, P.flowerYellow);
  }

  /* ================================================================= bicycle + fence ===================== */
  function bicycle() {
    const s = STREET.bicycle, cx = s.x + 0.98, cz = s.z + 0.08; // the stream takes the sidewalk up to x=1.3: stand just east of it
    const fen = at(cx - 0.17, SW, cz - 0.3, s.yaw);
    const fc = '#b4bdb0';
    for (const x of [-0.72, 0.1, 0.92]) { const k = x > 0.5 ? 0.12 : 0; fen.add(kit.cylBase(0.038, 0.042, 1.0, 7), worn, { pos: [x, -0.02, 0], rot: [k, 0, k * 0.7], color: fc }); fen.add(kit.cylBase(0.09, 0.1, 0.1, 7), 'concrete', { pos: [x, -0.04, 0], color: P.concreteMid }); fen.add(kit.sphere(0.044, 7, 5), worn, { pos: [x, 0.98 - k * 0.2, -k * 0.1], color: fc }); }
    fen.add(kit.tube([[-0.72, 0.84, 0], [0.1, 0.84, 0], [0.8, 0.82, -0.04], [1.04, 0.72, -0.14]], 0.024, 0.024, 6, 16, { tension: 0.2 }), worn, { color: fc });
    fen.add(kit.tube([[-0.72, 0.5, 0], [0.1, 0.5, 0], [0.5, 0.47, 0.03], [0.66, 0.33, 0.1]], 0.024, 0.024, 6, 12, { tension: 0.2 }), worn, { color: fc });
    fen.add(kit.cyl(0.033, 0.033, 0.03, 7).rotateZ(Math.PI / 2), 'rust', { pos: [0.1, 0.84, 0] });
    vine(fen, [[-0.72, 0, 0.05], [-0.65, 0.5, 0.05], [-0.25, 0.84, 0.05], [0.3, 0.88, 0.04], [0.5, 0.56, 0.05]], 0.022, 0.01, { leaves: 7, size: 0.21 });
    tuft(fen, [-0.74, 0, 0.1], 9, 0.5, 0.12); tuft(fen, [0.9, 0, 0.0], 8, 0.5, 0.1); moss(fen, [0.1, 0.05, 0.02], [0.18, 0.05, 0.12]);

    const b = at(cx, SW, cz, s.yaw, -0.2, 0), rust = 'rust', r = 0.335;
    const rear = [-0.53, r, 0], bb = [-0.07, 0.3, 0], seatTop = [-0.235, 0.84, 0], headTop = [0.3, 0.92, 0], headBot = [0.345, 0.74, 0];
    const wheel = (st, c) => {
      st.add(kit.torus(r, 0.028, 6, 30), 'flat', { pos: c, color: '#4d4a46' });
      st.add(kit.torus(r - 0.03, 0.014, 4, 30), rust, { pos: c });
      st.add(kit.cyl(0.03, 0.03, 0.1, 8).rotateX(Math.PI / 2), rust, { pos: c });
      for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283, a2 = a + 0.5, zz = (i % 2 ? 1 : -1) * 0.035; st.add(rod([c[0] + Math.cos(a2) * 0.025, c[1] + Math.sin(a2) * 0.025, zz], [c[0] + Math.cos(a) * (r - 0.032), c[1] + Math.sin(a) * (r - 0.032), 0], 0.0065, 0.0065, 3), 'flat', { color: '#b98a6a' }); }
    };
    wheel(b, rear);
    const t = (a, c, r0 = 0.021, mat = rust) => b.add(rod(a, c, r0, r0, 7), mat, { color: mat === rust ? undefined : P.rustDark });
    t(bb, seatTop, 0.023); // seat tube
    b.add(kit.tube([headBot, [0.2, 0.52, 0], [0.04, 0.36, 0], bb], 0.027, 0.024, 7, 16), worn, { color: '#a26a52' }); // step-through down tube
    b.add(kit.tube([[0.33, 0.8, 0], [0.12, 0.66, 0], [-0.04, 0.5, 0], [-0.13, 0.5, 0]], 0.02, 0.02, 6, 12), worn, { color: '#a26a52' });
    for (const z of [-0.05, 0.05]) { t([bb[0], bb[1], z * 0.5], [rear[0], rear[1], z], 0.012); t([-0.225, 0.74, z * 0.4], [rear[0], rear[1], z], 0.011); }
    t(seatTop, [-0.245, 0.96, 0], 0.016);
    // saddle with springs
    b.add(kit.sphere(1, 9, 6), 'flat', { pos: [-0.28, 1.0, 0], scale: [0.17, 0.05, 0.095], color: '#6a4a3a' });
    b.add(kit.sphere(1, 8, 5), 'flat', { pos: [-0.16, 1.01, 0], scale: [0.1, 0.032, 0.04], color: '#6a4a3a' });
    for (const z of [-0.05, 0.05]) b.add(kit.torus(0.024, 0.008, 4, 8).rotateY(Math.PI / 2), rust, { pos: [-0.33, 0.965, z], scale: [1, 1.3, 1] });
    // drivetrain
    const cr = 0.092, sp = 0.038;
    b.add(kit.cyl(cr, cr, 0.012, 16).rotateX(Math.PI / 2), rust, { pos: [bb[0], bb[1], 0.052] }); b.add(kit.cyl(0.03, 0.03, 0.12, 8).rotateX(Math.PI / 2), 'flat', { pos: [bb[0], bb[1], 0.03], color: steelDark });
    b.add(kit.cyl(sp, sp, 0.012, 10).rotateX(Math.PI / 2), rust, { pos: [rear[0], rear[1], 0.052] });
    const ang = Math.atan2(rear[1] - bb[1], rear[0] - bb[0]) , nx = -Math.sin(ang), ny = Math.cos(ang);
    const chainPts = [[bb[0] + nx * cr, bb[1] + ny * cr], [rear[0] + nx * sp, rear[1] + ny * sp], [rear[0] - 0.045, rear[1]], [rear[0] - nx * sp, rear[1] - ny * sp], [bb[0] - nx * cr, bb[1] - ny * cr - 0.02], [bb[0] + 0.1, bb[1]], [bb[0] + nx * cr, bb[1] + ny * cr]].map(([x, y]) => [x, y, 0.052]);
    b.add(kit.tube(chainPts, 0.009, 0.009, 4, 34, { tension: 0.2 }), 'flat', { color: '#5a4038' });
    const guard = new THREE.ExtrudeGeometry(new THREE.Shape([[-0.5, 0.385], [0.02, 0.4], [0.08, 0.34], [0.02, 0.28], [-0.45, 0.36]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.01, bevelEnabled: false });
    b.add(guard, worn, { pos: [0, 0, 0.074], color: '#a26a52' });
    const crank = [[bb[0], bb[1], 0.07], [bb[0] + 0.1, bb[1] - 0.14, 0.09]], crank2 = [[bb[0], bb[1], -0.07], [bb[0] - 0.1, bb[1] + 0.14, -0.09]];
    b.add(bar(crank[0], crank[1], 0.024, 0.014), rust); b.add(bar(crank2[0], crank2[1], 0.024, 0.014), rust);
    b.add(kit.box(0.08, 0.016, 0.09), 'flat', { pos: [bb[0] + 0.1, bb[1] - 0.14, 0.14], rot: [0, 0, 0.3], color: '#4d4a46' }); b.add(kit.box(0.08, 0.016, 0.09), 'flat', { pos: [bb[0] - 0.1, bb[1] + 0.14, -0.14], color: '#4d4a46' });
    // rear mudguard, rack, kickstand
    b.add(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.075, 16, 1, true, 3.75, 3.1).rotateX(Math.PI / 2), worn, { pos: rear, rot: [0, 0, 0], color: '#a26a52' });
    const rk = [[-0.82, 0.74, 0.09], [-0.28, 0.74, 0.09], [-0.28, 0.74, -0.09], [-0.82, 0.74, -0.09], [-0.82, 0.74, 0.09]];
    b.add(kit.tube(rk, 0.011, 0.011, 4, 26, { tension: 0.1 }), rust);
    for (const z of [-0.03, 0.03]) t([-0.82, 0.74, z], [-0.28, 0.74, z], 0.008);
    for (const z of [-0.09, 0.09]) t([-0.55, 0.74, z], [rear[0], rear[1], z * 0.7], 0.009);
    t([-0.44, 0.33, 0.05], [-0.5, 0.0, 0.12], 0.012);
    // steering assembly turned toward the fence
    const fr = b.sub({ pos: [0.33, 0, 0], rot: [0, -0.32, 0] });
    const fa = [0.2, r, 0];
    wheel(fr, fa);
    fr.add(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.075, 16, 1, true, 0.3, 2.2).rotateX(Math.PI / 2), worn, { pos: fa, color: '#a26a52' });
    for (const z of [-0.048, 0.048]) fr.add(kit.tube([[0.01, 0.74, 0], [0.04, 0.62, z], [0.11, 0.48, z], fa.map((c, i) => (i === 2 ? z : c))], 0.014, 0.011, 5, 10), rust);
    fr.add(rod([0.012, 0.73, 0], [-0.03, 0.94, 0], 0.028, 0.028, 8), rust); // head tube
    fr.add(rod([-0.03, 0.94, 0], [-0.05, 1.06, 0], 0.016, 0.016, 6), rust);
    for (const z of [-1, 1]) fr.add(kit.tube([[-0.05, 1.06, 0], [-0.05, 1.07, z * 0.1], [-0.12, 1.08, z * 0.25], [-0.23, 1.07, z * 0.3]], 0.0125, 0.0125, 5, 12), rust);
    for (const z of [-1, 1]) fr.add(rod([-0.15, 1.08, z * 0.28], [-0.25, 1.07, z * 0.3], 0.019, 0.019, 6), 'flat', { color: '#4d4a46' });
    fr.add(kit.cylBase(0.024, 0.026, 0.024, 8), 'flat', { pos: [-0.1, 1.09, 0.2], color: P.fadedYellow });
    fr.add(kit.cyl(0.05, 0.04, 0.08, 8).rotateZ(Math.PI / 2), 'flat', { pos: [0.2, 0.74, 0.0], color: cream }); // headlamp
    // wire basket with a plant in it
    const bs = fr.sub({ pos: [0.22, 0.86, 0], rot: [0, 0, -0.1] });
    const hoop = (w, d, y) => { const p = [[-w, y, -d], [w, y, -d], [w, y, d], [-w, y, d], [-w, y, -d]]; bs.add(kit.tube(p, 0.008, 0.008, 4, 24, { tension: 0.02 }), rust); };
    hoop(0.16, 0.18, 0.16); hoop(0.145, 0.165, 0.09); hoop(0.13, 0.15, 0.0);
    for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) { const x = -0.13 + i * 0.052; bs.add(rod([x, 0, sd * 0.15], [x * 1.2, 0.16, sd * 0.18], 0.0055, 0.0055, 3), rust); }
    for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) { const z = -0.12 + i * 0.06; bs.add(rod([sd * 0.13, 0, z], [sd * 0.16, 0.16, z * 1.15], 0.0055, 0.0055, 3), rust); }
    bs.add(kit.box(0.26, 0.012, 0.3), rust, { pos: [0, 0, 0] });
    bs.add(chipped(kit.sphere(1, 8, 6), 0.1), 'flat', { pos: [0, 0.07, 0], scale: [0.13, 0.07, 0.15], color: P.soil });
    moss(bs, [0, 0.11, 0], [0.13, 0.05, 0.15], P.mossLit); fern(bs, [0, 0.1, 0], 4, 0.42); posy(bs, [0.03, 0.12, 0.04], 3, 0.12, P.flowerWhite);
    // a vine threads the rear wheel, grass pushes through the spokes
    vine(b, [[-1.0, 0.02, 0.12], [-0.72, 0.18, 0.1], [-0.52, 0.36, 0.0], [-0.36, 0.2, -0.04], [-0.2, 0.33, 0.02], [-0.12, 0.56, 0.0], [-0.22, 0.74, 0.02]], 0.015, 0.008, { leaves: 11, size: 0.17 });
    tuft(W, b.w([-0.5, 0, 0.12]).toArray(), 12, 0.42, 0.16); tuft(W, b.w([0.55, 0, 0.14]).toArray(), 11, 0.4, 0.15);
    moss(W, b.w([-0.05, 0.03, 0.16]).toArray(), [0.3, 0.04, 0.12]);
    moss(b, [-0.55, 0.76, 0], [0.18, 0.03, 0.08], P.mossLit);
  }

  /* ================================================================= tyre stack ========================== */
  function tires() {
    const s = STREET.tires, st = at(s.x, SOIL, s.z, 0.4), R = 0.3, r = 0.13, H = 2 * r * 0.86; // car-scale: 0.86 m across, as tall as the wreck's own wheels
    const tyre = (o, shade = '#566570') => {
      const t = st.sub(o);
      t.add(kit.torus(R, r, 10, 30).rotateX(Math.PI / 2), 'flat', { scale: [1, 0.86, 1], color: shade });
      for (const y of [-0.085, 0.085]) t.add(kit.torus(R + 0.1, 0.009, 4, 30).rotateX(Math.PI / 2), 'flat', { pos: [0, y, 0], color: '#6b7a84' });
      for (let i = 0; i < 26; i++) { const a = (i / 26) * 6.283, skew = i % 2 ? 0.35 : -0.35; t.add(kit.box(0.024, 0.14, 0.024), 'flat', { pos: [Math.cos(a) * (R + r - 0.005), 0, Math.sin(a) * (R + r - 0.005)], rot: [0, -a, skew], color: '#46535c' }); } // shallow lugs: a worn road tyre, not a tractor's
    };
    const shades = ['#5a6a74', '#52626a', '#5f6e7a', '#4d5c64'];
    const lift = (i) => H / 2 + 0.005 + i * (H + 0.004), top = lift(3) + H / 2;
    tyre({ pos: [0, lift(0), 0] }, shades[0]); tyre({ pos: [0.035, lift(1), -0.02], rot: [0, 0.8, 0.01] }, shades[1]); tyre({ pos: [-0.04, lift(2), 0.03], rot: [0.015, 1.7, -0.01] }, shades[2]);
    tyre({ pos: [0.06, lift(3) + 0.012, 0.015], rot: [0.05, 2.5, 0.07] }, shades[3]);
    tyre({ pos: [0.66, 0.4, 0.3], rot: [1.15, 0.5, 0.25] }, shades[1]); // leaning on the stack
    const rim = at(s.x - 0.72, SOIL + 0.05, s.z + 0.44, 1.0, 0.18, 0);
    rim.add(kit.torus(0.2, 0.034, 6, 20).rotateX(Math.PI / 2), 'rust', {}); rim.add(kit.cyl(0.165, 0.165, 0.028, 16), 'rust', { pos: [0, -0.014, 0] }); rim.add(kit.cyl(0.055, 0.055, 0.042, 10), 'flat', { pos: [0, 0.007, 0], color: steelDark });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28; rim.add(kit.cyl(0.018, 0.018, 0.042, 6), 'flat', { pos: [Math.cos(a) * 0.105, 0.014, Math.sin(a) * 0.105], color: steelDark }); }
    // soil plug, grass bursting from the top, weeds in the leaning tyre, ivy over the shoulder
    st.add(chipped(kit.cyl(0.215, 0.205, top - 0.14, 10), 0.014), 'flat', { pos: [0, (top + 0.14) / 2 - 0.02, 0], color: P.soil });
    moss(st, [0.06, top - 0.02, 0.015], [0.25, 0.07, 0.25], P.mossLit);
    fern(st, [0.04, top - 0.04, 0], 5, 0.54); posy(st, [0.14, top - 0.03, -0.06], 5, 0.18, P.flowerYellow);
    const tp = st.w([0.06, top - 0.03, 0.015]);
    sway([tp.x, tp.y, tp.z], (ws) => { tuft(ws, [tp.x, tp.y, tp.z], 42, 0.72, 0.18, grassPal, 'soft'); }, { amp: 0.045, speed: 1.15 });
    tuft(st, [0.68, 0.16, 0.32], 12, 0.42, 0.11); tuft(st, [-0.42, 0, 0.3], 12, 0.5, 0.14); tuft(st, [0.2, 0, -0.56], 10, 0.42, 0.16); fern(st, [-0.48, 0, -0.28], 5, 0.6);
    vine(st, [[-0.48, 0, -0.26], [-0.46, 0.32, -0.08], [-0.4, 0.58, 0.15], [-0.2, top, 0.27], [0.08, top + 0.06, 0.13]], 0.024, 0.01, { leaves: 7, size: 0.2 });
    vine(st, [[0.4, 0, -0.42], [0.43, 0.38, -0.36], [0.46, 0.66, -0.12], [0.3, top + 0.02, 0.08]], 0.02, 0.009, { leaves: 6, size: 0.19, pal: [P.ivy, P.ivyRed, P.ivyLit] });
  }

  /* ================================================================= barricades ========================== */
  function barricades() {
    const leg = '#b9bcb2';
    STREET.barricades.forEach((s, i) => {
      // A-frame lying where it fell. Pivot sits on the front foot.
      const th = [1.62, 1.9, 1.42][i], roll = [0.2, -0.05, 0.1][i], lift = [0.24, 0.07, 0.22][i];
      const m = new M4().multiplyMatrices(kit.xf({ pos: [s.x, lift, s.z], rot: [0, s.yaw, roll] }), kit.xf({ rot: [th, 0, 0] }));
      const st = new Stage(T, m.multiply(kit.xf({ pos: [0, 0, -0.34] })));
      if (i === 0) { // ballast block: clean concrete (the moss overlay turns a low block solid lime), a pad of real moss at its foot
        const bp = [s.x + Math.cos(s.yaw) * 0.72, 0, s.z - Math.sin(s.yaw) * 0.72 + 0.24];
        W.add(chipped(kit.boxBase(0.62, 0.42, 0.5, 2, 1, 2), 0.05), 'concreteClean', { pos: bp, rot: [0, 0.5, 0], color: '#d9d8cc' });
        moss(W, [bp[0] + 0.1, 0.03, bp[2] + 0.2], [0.24, 0.06, 0.15]);
      }
      const Lp = 1.76, X = Lp / 2 - 0.12;
      for (const x of [-X, X]) {
        st.add(bar([x, 1.04, -0.0], [x, 0.0, 0.34], 0.055, 0.04), worn, { color: leg }); st.add(bar([x, 1.04, 0.0], [x, 0.0, -0.34], 0.055, 0.04), worn, { color: leg });
        st.add(bar([x, 0.42, -0.2], [x, 0.42, 0.2], 0.03, 0.02), 'rust');
        for (const z of [-0.34, 0.34]) st.add(kit.box(0.09, 0.07, 0.2), 'flat', { pos: [x, 0.03, z], color: '#3f4a4f' });
      }
      st.add(kit.cyl(0.03, 0.03, Lp - 0.24, 6).rotateZ(Math.PI / 2), worn, { pos: [0, 1.05, 0], color: leg });
      const plank = (y, tiltZ, broke) => {
        const p = st.sub({ pos: [0, y, -0.205 * (1.04 - y) / 0.52 * 0.5 - 0.035], rot: [0.31, 0, tiltZ] });
        const len = broke ? Lp * 0.7 : Lp, off = broke ? -Lp * 0.15 : 0;
        p.add(kit.box(len, 0.2, 0.025), worn, { pos: [off, 0, 0], color: '#d7d2c0' });
        const q = atlas.quad(len - 0.01, 0.19, 'stripe');
        p.add(q, signMat, { pos: [off, 0, -0.0135], rot: [0, Math.PI, 0] }); p.add(q, signMat, { pos: [off, 0, 0.0135] });
      };
      plank(0.84, 0, false); plank(0.44, i === 1 ? 0.14 : -0.03, i === 0);
      // small amber flasher on one, sprouting weeds on all
      if (i !== 1) { st.add(kit.cylBase(0.09, 0.09, 0.05, 8), 'flat', { pos: [X - 0.1, 1.07, 0], color: '#a49a86' }); st.add(kit.sphere(0.075, 8, 5), 'flat', { pos: [X - 0.1, 1.12, 0], scale: [1, 1.1, 1], color: '#c9a44f' }); }
      const g = v([s.x, 0, s.z]);
      vine(st, [[-X, 0.02, 0.34], [-X + 0.05, 0.42, 0.18], [-0.2, 0.86, 0.08], [0.35, 0.9, 0.06]], 0.018, 0.009, { leaves: 6, size: 0.2 });
      tuft(W, [g.x + Math.cos(s.yaw) * 0.72, 0, g.z - Math.sin(s.yaw) * 0.72], 11, 0.46, 0.15);
      tuft(W, [g.x - Math.cos(s.yaw) * 0.4, 0, g.z + Math.sin(s.yaw) * 0.4 + 0.35], 8, 0.36, 0.12);
      moss(st, [X, 0.5, 0.15], [0.05, 0.28, 0.06]);
    });
    // two stray cones tie the barricades to the corner
    for (const [x, z, ry, rz, y] of [[6.45, 0.25, 0.8, 1.3, 0.18], [4.05, -2.55, 2.4, 1.5, 0.2]]) {
      const c = at(x, y, z, ry, 0, rz);
      c.add(kit.cylBase(0.035, 0.19, 0.62, 10), worn, { pos: [0, -0.28, 0], color: '#d9674f' }); c.add(kit.cylBase(0.09, 0.128, 0.14, 10), 'flat', { pos: [0, -0.02, 0], color: '#f0e8d4' });
      c.add(kit.box(0.46, 0.04, 0.46), 'flat', { pos: [0, -0.3, 0], color: '#4a4f50' });
    }
  }

  lamp(); trafficLight(); utilityPole(); busStop(); vending(); kiosk(); billboard(); neon(); bicycle(); tires(); barricades();

  /* ---------- assemble ---------- */
  group.add(main.build({ castShadow: true, receiveShadow: true }));
  const softG = ctx.softEdge(softB.build({ castShadow: true, receiveShadow: true }));
  const leafDepth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 8 }); // no acne on thin folded leaves
  softG.traverse((o) => { if (o.isMesh) o.customDepthMaterial = leafDepth; });
  group.add(softG);
  group.add(ctx.noOutline(glassB.build({ castShadow: false, receiveShadow: false })));

  /* ---------- signal flicker: a seeded schedule, pure function of t ---------- */
  const fr = ctx.seeded('street-flicker'), events = [];
  let tt = fr.range(40, 60); // one early flash for whoever is watching, then minutes apart: a ghost of power, not a blinker
  for (let i = 0; i < 240; i++) { events.push({ t: tt, lens: fr.int(0, 2), d: fr.range(0.26, 0.34) }); tt += fr.range(150, 420); }
  const period = tt + fr.range(150, 420);
  const lampMat = ctx.toon({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 2.2, dapple: false, glow: true });
  const flare = new THREE.Mesh(new THREE.CircleGeometry(0.15, 18), lampMat);
  const q0 = new Q().setFromRotationMatrix(flick.head.m); flare.quaternion.copy(q0); flare.visible = false; flare.castShadow = false;
  ctx.noOutline(flare); group.add(flare);
  const glowTex = ctx.canvasTexture(64, 64, (g, w) => {
    const l = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); l.addColorStop(0, 'rgba(255,255,255,.9)'); l.addColorStop(0.3, 'rgba(255,255,255,.3)'); l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l; g.fillRect(0, 0, w, w);
  }, { repeat: false });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
  glow.scale.setScalar(1.15); glow.visible = false; ctx.noOutline(glow); group.add(glow); glow.material.userData.nightKeep = true;
  // After dark the signal does what a controller with nobody to answer to does: it blinks amber. The lens is its own halo; the lamp slot lights the pole and the road under it.
  const AMBER = 1, blink = (t) => Math.min(1, Math.max(0, Math.sin(t * 3.6) * 3 + 0.6));
  ctx.shared.lamps.push({ pos: [flick.lens[AMBER].x, flick.lens[AMBER].y - 0.35, flick.lens[AMBER].z], r: 6.5, color: flick.colors[AMBER], power: 0.8, halo: 0, k: blink });
  const stutter = [1, 0.1, 0.85, 1, 0.25, 0.95, 0.55, 0];
  const lensCol = new THREE.Color();
  let cursor = 0;
  group.userData.flickerEvents = events;

  function update(t) {
    for (const s of swayers) {
      const w = ctx.wind(t * s.speed, s.x, s.z) * s.amp + Math.sin(t * 1.7 * s.speed + s.ph) * s.amp * 0.3;
      if (s.axis.includes('x')) s.g.rotation.x = w;
      if (s.axis.includes('z')) s.g.rotation.z = w * 0.7;
    }
    strandSwing(t);
    if (ctx.shared.uNight.value > 0.5) {
      const k = blink(t);
      flare.visible = glow.visible = k > 0.05;
      lensCol.set(flick.colors[AMBER]);
      lampMat.color.copy(lensCol); lampMat.emissive.copy(lensCol); lampMat.emissiveIntensity = 3.2 * k;
      flare.position.copy(flick.lens[AMBER]); glow.position.copy(flick.lens[AMBER]); glow.material.color.copy(lensCol); glow.material.opacity = 0.9 * k;
      return;
    }
    const tm = t % period;
    if (cursor > 0 && events[cursor - 1].t > tm) cursor = 0;
    while (cursor < events.length - 1 && events[cursor].t + events[cursor].d < tm) cursor++;
    const e = events[cursor], u = (tm - e.t) / e.d;
    if (u >= 0 && u < 1) {
      const k = stutter[Math.floor(u * stutter.length)];
      flare.visible = glow.visible = k > 0.05;
      lensCol.set(flick.colors[e.lens]);
      lampMat.color.copy(lensCol); lampMat.emissive.copy(lensCol); lampMat.emissiveIntensity = 2.4 * k;
      flare.position.copy(flick.lens[e.lens]);
      glow.position.copy(flick.lens[e.lens]); glow.material.color.copy(lensCol); glow.material.opacity = 0.75 * k;
    } else flare.visible = glow.visible = false;
  }
  update(0);
  return { group, update };
}
