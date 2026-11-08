import * as THREE from 'three';
import { rand, rr, pick } from './config.js';

export const NEON_HEX = [0xff2bd6, 0x00e5ff, 0x7c4dff, 0xff3d6e, 0x39ff88, 0xffb300, 0x00a2ff];
export const NEON = NEON_HEX.map((h) => new THREE.Color(h));
const NEON_CSS = NEON_HEX.map((h) => `#${h.toString(16).padStart(6, '0')}`);
export const neon = (k = 2.4) => pick(NEON).clone().multiplyScalar(k);

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif';

function texture(canvas, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Neon sign atlas: 24 horizontal signs (512 x 128) and 16 vertical ones (128 x 768).
export function makeSignAtlas() {
  const W = 2048, H = 1536;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const drawSign = (x, y, w, h, txt, color, vertical) => {
    g.save();
    g.fillStyle = '#0b0a12';
    g.fillRect(x + 3, y + 3, w - 6, h - 6);
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.shadowColor = color;
    g.shadowBlur = 16;
    g.strokeRect(x + 12, y + 12, w - 24, h - 24);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const passes = [[color, 26], [color, 10], ['rgba(255,255,255,0.8)', 4]];
    if (!vertical) {
      let size = h * 0.5;
      g.font = `bold ${size}px ${FONT}`;
      const mw = g.measureText(txt).width;
      if (mw > w - 70) {
        size *= (w - 70) / mw;
        g.font = `bold ${size}px ${FONT}`;
      }
      for (const [fc, blur] of passes) {
        g.fillStyle = fc;
        g.shadowBlur = blur;
        g.fillText(txt, x + w / 2, y + h / 2 + 3);
      }
    } else {
      const chars = [...txt];
      const step = (h - 70) / chars.length;
      g.font = `bold ${Math.min(w * 0.6, step * 0.85)}px ${FONT}`;
      for (const [fc, blur] of passes) {
        g.fillStyle = fc;
        g.shadowBlur = blur;
        chars.forEach((ch, i) => g.fillText(ch, x + w / 2, y + 35 + step * (i + 0.5)));
      }
    }
    g.restore();
  };
  const hTexts = [
    'HOTEL', 'BAR', 'CAFÉ 24H', 'SUSHI', 'KARAOKE', 'CINEMA', 'NOODLES', '大酒店', 'NEON', 'PIZZA', '便利店', 'GAMES',
    'RAMEN', 'OPEN 24H', 'LIVE HOUSE', '茶餐厅', '烧烤', 'JAZZ', '网吧', 'HOSTEL', '奶茶', 'DUMPLINGS', '按摩', 'CLUB',
  ];
  const vTexts = ['大酒店', '拉面馆', '卡拉OK', '电影院', '火锅', '夜市', '书店', '美食街', '旅馆', '药房', '酒吧', '理发', '烧腊', '麻将馆', '茶楼', '足浴'];
  const cells = { h: [], v: [] };
  hTexts.forEach((t, i) => {
    const x = (i % 4) * 512, y = Math.floor(i / 4) * 128;
    drawSign(x, y, 512, 128, t, pick(NEON_CSS), false);
    cells.h.push([x, y, 512, 128]);
  });
  vTexts.forEach((t, i) => {
    const x = i * 128, y = 768;
    drawSign(x, y, 128, 768, t, pick(NEON_CSS), true);
    cells.v.push([x, y, 128, 768]);
  });
  return { tex: texture(c), cells, W, H };
}

// Shop and lobby interiors seen through the ground-floor glass (one tile = 12 x 4.5 m).
export function makeStoreTexture() {
  const W = 768, H = 288;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#fff3dc');
  grad.addColorStop(0.5, '#d9b88c');
  grad.addColorStop(1, '#6e5640');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  for (let x = 30; x < W; x += 64) {
    g.fillStyle = '#ffffff';
    g.fillRect(x, 18, 26, 6);
  }
  for (let x = 0; x < W; x += 128) {
    if (rand() < 0.6) {
      g.fillStyle = 'rgba(40,28,20,0.75)';
      g.fillRect(x + 12, 120, 100, 110);
      for (let y = 135; y < 225; y += 22) {
        g.fillStyle = 'rgba(255,235,200,0.6)';
        g.fillRect(x + 16, y, 92, 3);
        for (let k = x + 18; k < x + 104; k += 9) {
          g.fillStyle = pick(['#c43a3a', '#e8c25a', '#3a8a5a', '#f2f2f2', '#2f5fa8']);
          g.fillRect(k, y - 12, 6, 11);
        }
      }
    } else {
      g.fillStyle = 'rgba(30,22,16,0.7)';
      g.fillRect(x + 20, 180, 90, 60);
    }
  }
  for (let i = 0; i < 7; i++) {
    const x = rr(10, W - 30), s = rr(0.85, 1.1);
    g.fillStyle = 'rgba(15,10,8,0.8)';
    g.beginPath();
    g.arc(x + 10 * s, 150 * s + (1 - s) * 200, 11 * s, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x, 162 * s + (1 - s) * 200, 20 * s, 90 * s);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 250, W, 38);
  g.fillStyle = '#1b1c22';
  for (let x = 0; x < W; x += 192) g.fillRect(x, 0, 8, H);
  g.fillRect(0, 0, W, 8);
  return texture(c, { repeat: true });
}

// Photovoltaic panel: blue cells in a silver frame.
export function makeSolarTexture() {
  const W = 256, H = 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#b9bec6';
  g.fillRect(0, 0, W, H);
  const cols = 10, rows = 6, m = 6;
  const cw = (W - 2 * m) / cols, ch = (H - 2 * m) / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = m + k * cw, y = m + r * ch;
      const grad = g.createLinearGradient(x, y, x + cw, y + ch);
      grad.addColorStop(0, '#16285a');
      grad.addColorStop(1, '#0a1634');
      g.fillStyle = grad;
      g.fillRect(x + 1, y + 1, cw - 2, ch - 2);
      g.fillStyle = 'rgba(200,210,230,0.25)';
      g.fillRect(x + 1, y + ch / 2, cw - 2, 1);
    }
  }
  return texture(c);
}

// Twelve full-screen adverts for the LED video walls, laid out 2 x 6 (512 x 256 each).
export const AD_COUNT = 12;
export function makeAdAtlas() {
  const W = 1024, H = 1536;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const cell = (i) => [(i % 2) * 512, Math.floor(i / 2) * 256];
  const bg = (i, stops) => {
    const [x, y] = cell(i);
    const grad = g.createLinearGradient(x, y, x + 512, y + 256);
    stops.forEach((s, k) => grad.addColorStop(k / (stops.length - 1), s));
    g.fillStyle = grad;
    g.fillRect(x, y, 512, 256);
    return [x, y];
  };
  const text = (str, x, y, size, color, weight = 'bold', align = 'center') => {
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(str, x, y);
  };

  // 0: city brand
  let [x, y] = bg(0, ['#2a0b5c', '#7a1fa8', '#0b4a8c']);
  for (let k = 0; k < 7; k++) {
    g.strokeStyle = `rgba(120,240,255,${0.15 + k * 0.08})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x + 400, y + 128, 30 + k * 18, 0, Math.PI * 2);
    g.stroke();
  }
  text('NEON CITY', x + 200, y + 105, 64, '#ffffff');
  text('夜色 · 未眠', x + 200, y + 175, 40, '#7ff4ff');
  // 1: music festival
  [x, y] = bg(1, ['#ff2a6d', '#ff8a00']);
  for (let k = 0; k < 24; k++) {
    const hgt = 40 + Math.abs(Math.sin(k * 1.7)) * 120;
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(x + 20 + k * 20, y + 236 - hgt, 12, hgt);
  }
  text('LIVE MUSIC', x + 256, y + 92, 66, '#ffffff');
  text('11.20  城市音乐节', x + 256, y + 164, 36, '#2a0b20');
  // 2: drink
  [x, y] = bg(2, ['#0a3d2e', '#1fb26b']);
  g.fillStyle = '#e8fff2';
  g.beginPath();
  g.roundRect(x + 380, y + 40, 70, 180, 18);
  g.fill();
  g.fillStyle = '#1fb26b';
  g.fillRect(x + 380, y + 110, 70, 50);
  text('极光汽水', x + 190, y + 105, 64, '#ffffff');
  text('清爽一夏 · FRESH', x + 190, y + 172, 30, '#d9ffe9');
  // 3: car
  [x, y] = bg(3, ['#020814', '#0f2c6e', '#020814']);
  g.strokeStyle = '#8fd0ff';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(x + 90, y + 190);
  g.quadraticCurveTo(x + 150, y + 120, x + 250, y + 112);
  g.quadraticCurveTo(x + 330, y + 108, x + 400, y + 150);
  g.lineTo(x + 440, y + 190);
  g.stroke();
  for (const cx of [170, 370]) {
    g.beginPath();
    g.arc(x + cx, y + 195, 24, 0, Math.PI * 2);
    g.stroke();
  }
  text('未来驾驶', x + 256, y + 60, 46, '#ffffff');
  // 4: sale
  [x, y] = bg(4, ['#ffd400', '#ff6a00']);
  text('SALE', x + 150, y + 128, 110, '#c4001a');
  text('50%', x + 380, y + 100, 80, '#ffffff');
  text('全场五折', x + 380, y + 170, 38, '#5a0010');
  // 5: night market
  [x, y] = bg(5, ['#3a0010', '#a01440', '#3a0010']);
  for (let k = 0; k < 9; k++) {
    g.fillStyle = `hsl(${k * 40}, 90%, 60%)`;
    g.beginPath();
    g.arc(x + 40 + k * 54, y + 40, 12, 0, Math.PI * 2);
    g.fill();
  }
  text('城市之光', x + 256, y + 130, 76, '#ffe9b8');
  text('NIGHT MARKET', x + 256, y + 200, 34, '#ffb3c8');
  // 6: phone
  [x, y] = bg(6, ['#05050a', '#1a1030', '#05050a']);
  g.fillStyle = '#2a2a33';
  g.beginPath();
  g.roundRect(x + 360, y + 28, 100, 200, 16);
  g.fill();
  const scr = g.createLinearGradient(x + 366, y + 34, x + 454, y + 222);
  scr.addColorStop(0, '#ff3d9a');
  scr.addColorStop(0.5, '#7c4dff');
  scr.addColorStop(1, '#00d4ff');
  g.fillStyle = scr;
  g.beginPath();
  g.roundRect(x + 366, y + 34, 88, 188, 12);
  g.fill();
  text('NOVA X', x + 180, y + 100, 70, '#ffffff');
  text('影像旗舰 · 全新登场', x + 180, y + 168, 30, '#c9b8ff');
  // 7: bubble tea
  [x, y] = bg(7, ['#ffb7c9', '#ffd9a8']);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.moveTo(x + 380, y + 50);
  g.lineTo(x + 470, y + 50);
  g.lineTo(x + 455, y + 230);
  g.lineTo(x + 395, y + 230);
  g.closePath();
  g.fill();
  g.fillStyle = '#c98a5a';
  g.fillRect(x + 389, y + 110, 72, 118);
  g.fillStyle = '#3a2016';
  for (let k = 0; k < 14; k++) {
    g.beginPath();
    g.arc(x + 400 + (k % 5) * 12, y + 212 - Math.floor(k / 5) * 11, 5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ff4f8b';
  g.fillRect(x + 432, y + 20, 8, 60);
  text('珍珠奶茶', x + 190, y + 100, 72, '#7a1838');
  text('第二杯半价', x + 190, y + 170, 40, '#ffffff');
  // 8: concert
  [x, y] = bg(8, ['#14002a', '#4b0a6e', '#14002a']);
  for (let k = 0; k < 6; k++) {
    g.fillStyle = `rgba(${k % 2 ? '255,80,220' : '90,200,255'},0.22)`;
    g.beginPath();
    g.moveTo(x + 60 + k * 80, y + 256);
    g.lineTo(x + 20 + k * 90, y);
    g.lineTo(x + 70 + k * 90, y);
    g.closePath();
    g.fill();
  }
  text('星光演唱会', x + 256, y + 105, 70, '#ffffff');
  text('12.31 跨年夜 · 不见不散', x + 256, y + 178, 32, '#ffb3f0');
  // 9: game
  [x, y] = bg(9, ['#001a1f', '#003a44']);
  g.strokeStyle = 'rgba(0,255,220,0.35)';
  g.lineWidth = 2;
  for (let k = 0; k <= 16; k++) {
    g.beginPath();
    g.moveTo(x + 256, y + 120);
    g.lineTo(x + k * 32, y + 256);
    g.stroke();
  }
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    g.moveTo(x, y + 140 + k * k * 6);
    g.lineTo(x + 512, y + 140 + k * k * 6);
    g.stroke();
  }
  text('赛博纪元', x + 256, y + 70, 72, '#00ffd5');
  text('GAME ON', x + 256, y + 140, 40, '#ff2bd6');
  // 10: airline
  [x, y] = bg(10, ['#04122e', '#0d3b7a', '#3a7bd5']);
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x + 20, y + 230);
  g.quadraticCurveTo(x + 250, y + 210, x + 470, y + 50);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.save();
  g.translate(x + 430, y + 80);
  g.rotate(-0.6);
  g.fillRect(-36, -5, 72, 10);
  g.fillRect(-8, -30, 14, 60);
  g.fillRect(-36, -12, 8, 24);
  g.restore();
  text('飞向远方', x + 200, y + 95, 66, '#ffffff');
  text('SKYWAY AIR', x + 200, y + 160, 34, '#a9d4ff');
  // 11: fashion
  [x, y] = bg(11, ['#000000', '#1c1608', '#000000']);
  g.strokeStyle = '#d4af37';
  g.lineWidth = 3;
  g.strokeRect(x + 24, y + 24, 464, 208);
  text('MODE', x + 256, y + 105, 92, '#f5e2a8', '300');
  text('秋冬新品 · 限时发售', x + 256, y + 185, 30, '#d4af37');
  return texture(c);
}
