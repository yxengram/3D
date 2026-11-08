import * as THREE from 'three';
import { BLOCKS, BLOCK, HALF, LOBBY, MID, blockCenter, rand, rr, pick, weighted } from './config.js';
import { STYLES, facadeBox, facadeCyl } from './facade.js';
import { boxUV } from './textures.js';
import { neon } from './canvas.js';

// Buckets whose geometry gets metre-based box-mapped UVs for the scanned textures.
const TEXTURED = new Set(['concrete', 'stone', 'roof', 'roofLight', 'slab', 'park', 'hvac', 'path']);

// Generates every building, block and park. Geometry is collected per material bucket and merged later.
export function buildCity({ signs }) {
  const B = {};
  const push = (k, g) => {
    if (TEXTURED.has(k)) boxUV(g);
    (B[k] ||= []).push(g);
  };
  const antennaTips = [];
  const screenSpots = [];
  const treeSpots = [];
  let landmarkTop = 0;

  // ---------- geometry helpers ----------
  function colored(geo, color) {
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([color.r, color.g, color.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }
  // box in a building's local frame, then rotated and moved to (cx, cz)
  function lbox(w, h, d, lx, y0, lz, cx = 0, cz = 0, rot = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(lx, y0 + h / 2, lz);
    if (rot) g.rotateY(rot);
    g.translate(cx, 0, cz);
    return g;
  }
  // box in a facade frame: t along the facade, nOff out from the building centre, a = facade angle
  function fbox(w, h, d, t, y0, nOff, a, cx, cz) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(t, y0 + h / 2, nOff);
    g.rotateY(a);
    g.translate(cx, 0, cz);
    return g;
  }
  const faceOf = (w, d, rot, k) => ({
    a: rot + (k * Math.PI) / 2,
    half: (k % 2 === 0 ? d : w) / 2,
    width: k % 2 === 0 ? w : d,
  });
  function cyl(rt, rb, h, seg, x, y0, z, open = false) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
    g.translate(x, y0 + h / 2, z);
    return g;
  }
  function facade(style, w, h, d, x, y0, z, rot = 0) {
    const g = facadeBox(style, w, h, d, rot);
    g.translate(x, y0, z);
    push('f_' + style, g);
  }
  function facadeRound(style, rt, rb, h, seg, x, y0, z, flat = false) {
    const g = facadeCyl(style, rt, rb, h, seg, flat);
    g.translate(x, y0, z);
    push('f_' + style, g);
  }

  // ---------- neon signs ----------
  // A plane showing one cell of the sign atlas. `aFlick` > 0 makes a sign flicker like a failing tube.
  function signPlane(cell, sw, sh, flick) {
    const [px, py, pw, ph] = cell;
    const g = new THREE.PlaneGeometry(sw, sh);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, (px + 2 + u * (pw - 4)) / signs.W, 1 - (py + 2 + (1 - v) * (ph - 4)) / signs.H);
    }
    g.setAttribute('aFlick', new THREE.BufferAttribute(new Float32Array(uv.count).fill(flick), 1));
    return g;
  }
  const flicker = () => (rand() < 0.12 ? rr(1, 50) : 0);

  // flat sign on a facade
  function addSign(kind, a, nOff, t, y0, sw, cx, cz, backing = true) {
    const cell = pick(signs.cells[kind]);
    const sh = sw * (cell[3] / cell[2]);
    const g = signPlane(cell, sw, sh, flicker());
    g.translate(t, y0 + sh / 2, nOff + 0.12);
    g.rotateY(a);
    g.translate(cx, 0, cz);
    push('sign', g);
    if (backing) push('dark', fbox(sw + 0.3, sh + 0.3, 0.2, t, y0 - 0.15, nOff, a, cx, cz));
    return sh;
  }

  // vertical blade sign sticking out of a facade, readable from both directions along the street
  function bladeSign(f, t, y0, sw, cx, cz) {
    const cell = pick(signs.cells.v);
    const sh = sw * (cell[3] / cell[2]);
    const out = f.half + 0.5 + sw / 2;
    const flick = flicker();
    for (const side of [-1, 1]) {
      const g = signPlane(cell, sw, sh, flick);
      g.rotateY((side * Math.PI) / 2);
      g.translate(t + side * 0.14, y0 + sh / 2, out);
      g.rotateY(f.a);
      g.translate(cx, 0, cz);
      push('sign', g);
    }
    push('dark', fbox(0.22, sh + 0.3, sw + 0.3, t, y0 - 0.15, out, f.a, cx, cz));
    for (const yy of [y0 + 0.4, y0 + sh - 0.4]) push('metal', fbox(0.1, 0.1, 0.7, t, yy, f.half + 0.3, f.a, cx, cz));
    return sh;
  }

  // shop signs above the ground floor and blade signs further up; `level` 0..1 = how busy the street is
  function streetSigns(x, z, w, d, level, maxY, bladeFaces = [0, 1, 2, 3]) {
    for (let k = 0; k < 4; k++) {
      const f = faceOf(w, d, 0, k);
      if (rand() < level) {
        const n = f.width > 20 && rand() < 0.6 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? rr(-0.15, 0.15) * f.width : (i - 0.5) * f.width * 0.5;
          addSign('h', f.a, f.half + 0.05, t, LOBBY + 0.25, Math.min(f.width / n - 1.5, rr(4.5, 7.5)), x, z);
        }
      }
      if (bladeFaces.includes(k) && rand() < level * 0.8) {
        const t = (rand() < 0.5 ? -1 : 1) * (f.width / 2 - rr(1.2, 2.5));
        const sw = rr(1.3, 2.0);
        if (LOBBY + 1.5 + sw * 6 < maxY) bladeSign(f, t, LOBBY + 1.5, sw, x, z);
      }
    }
  }

  function storefront(geo, faceWidths) {
    const uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setX(i, uv.getX(i) * Math.max(1, Math.round((faceWidths[f] / 12) * 2) / 2) + f * 0.37);
      }
    }
    return geo;
  }

  function lobbyBox(cx, cz, w, d, bright = 1) {
    const warm = new THREE.Color(1.0, 0.9, 0.8).multiplyScalar(rr(0.6, 0.95) * bright);
    const lw = w - 1.4, ld = d - 1.4;
    push('store', colored(storefront(lbox(lw, LOBBY, ld, 0, 0, 0, cx, cz), [ld, ld, lw, lw, lw, lw]), warm));
    push('dark', lbox(w + 1.4, 0.45, d + 1.4, 0, LOBBY - 0.45, 0, cx, cz));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      push('concrete', lbox(1.0, LOBBY, 1.0, sx * (w / 2 - 0.5), 0, sz * (d / 2 - 0.5), cx, cz));
    }
    for (let k = 0; k < 4; k++) {
      const f = faceOf(w, d, 0, k);
      const n = Math.floor(f.width / 4.5);
      for (let i = 1; i < n; i++) {
        const t = -f.width / 2 + (f.width / n) * i;
        push('metal', fbox(0.22, LOBBY - 0.45, 0.22, t, 0, f.half - 0.6, f.a, cx, cz));
      }
    }
  }

  function lobbyCyl(cx, cz, r, seg = 32) {
    const warm = new THREE.Color(1.0, 0.9, 0.8).multiplyScalar(rr(0.6, 0.95));
    const lg = cyl(r - 0.7, r - 0.7, LOBBY, seg, cx, 0, cz);
    const luv = lg.attributes.uv;
    const reps = Math.max(1, Math.round((2 * Math.PI * (r - 0.7)) / 12));
    for (let i = 0; i < luv.count; i++) luv.setX(i, luv.getX(i) * reps);
    push('store', colored(lg, warm));
    push('dark', cyl(r + 1.2, r + 1.2, 0.45, seg, cx, LOBBY - 0.45, cz));
    const n = Math.max(6, Math.round((2 * Math.PI * r) / 4.5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      push('concrete', lbox(0.7, LOBBY, 0.7, Math.sin(a) * (r - 0.4), 0, Math.cos(a) * (r - 0.4), cx, cz));
    }
  }

  function parapet(cx, cz, w, d, y, rot = 0, hgt = 1.1) {
    push('concrete', lbox(w, hgt, 0.35, 0, y, d / 2 - 0.175, cx, cz, rot));
    push('concrete', lbox(w, hgt, 0.35, 0, y, -d / 2 + 0.175, cx, cz, rot));
    push('concrete', lbox(0.35, hgt, d - 0.7, w / 2 - 0.175, y, 0, cx, cz, rot));
    push('concrete', lbox(0.35, hgt, d - 0.7, -w / 2 + 0.175, y, 0, cx, cz, rot));
  }

  function antenna(cx, cz, y, h) {
    push('metal', lbox(0.7, h, 0.7, 0, y, 0, cx, cz));
    push('metal', lbox(0.35, h * 0.55, 0.35, 1.8, y, 1.2, cx, cz));
    for (const f of [0.35, 0.65]) {
      push('metal', lbox(4, 0.2, 0.2, 0, y + h * f, 0, cx, cz));
      push('metal', lbox(0.2, 0.2, 4, 0, y + h * f, 0, cx, cz));
    }
    const dish = new THREE.CylinderGeometry(1.1, 0.3, 0.5, 16);
    dish.rotateX(Math.PI / 2.4);
    dish.translate(cx + 0.9, y + h * 0.45, cz);
    push('white', dish);
    antennaTips.push(new THREE.Vector3(cx, y + h, cz));
    antennaTips.push(new THREE.Vector3(cx + 1.8, y + h * 0.55, cz + 1.2));
  }

  function helipad(cx, cz, r, y) {
    push('dark', cyl(r, r, 0.5, 40, cx, y, cz));
    const ring = new THREE.TorusGeometry(r * 0.9, 0.12, 6, 48);
    ring.rotateX(Math.PI / 2);
    ring.translate(cx, y + 0.55, cz);
    push('glow', colored(ring, new THREE.Color(0.4, 2.6, 1.0)));
    push('white', lbox(0.7, 0.08, r * 0.9, r * 0.28, y + 0.5, 0, cx, cz));
    push('white', lbox(0.7, 0.08, r * 0.9, -r * 0.28, y + 0.5, 0, cx, cz));
    push('white', lbox(r * 0.56, 0.08, 0.7, 0, y + 0.5, 0, cx, cz));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      push('glow', colored(lbox(0.3, 0.3, 0.3, Math.sin(a) * r, y + 0.5, Math.cos(a) * r, cx, cz), new THREE.Color(3, 2.4, 1)));
    }
  }

  function waterTank(x, z, y) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) push('metal', lbox(0.18, 2.6, 0.18, x + sx, y, z + sz));
    push('tank', cyl(1.6, 1.6, 3, 16, x, y + 2.6, z));
    const roof = new THREE.ConeGeometry(1.7, 1.0, 16);
    roof.translate(x, y + 6.1, z);
    push('tank', roof);
    for (let k = 1; k < 3; k++) push('metal', cyl(1.63, 1.63, 0.1, 16, x, y + 2.6 + k, z));
  }

  // rows of tilted photovoltaic panels
  function solarArray(cx, cz, w, d, y) {
    const pw = 1.7, pd = 1.0;
    const cols = Math.floor((w - 3) / (pw + 0.2));
    const rows = Math.floor((d - 3) / 2.1);
    if (cols < 2 || rows < 1) return false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = cx - ((cols - 1) * (pw + 0.2)) / 2 + c * (pw + 0.2);
        const pz = cz - ((rows - 1) * 2.1) / 2 + r * 2.1;
        const g = new THREE.BoxGeometry(pw, 0.05, pd);
        g.rotateX(-0.42);
        g.translate(px, y + 0.75, pz);
        push('solar', g);
        push('metal', lbox(0.06, 0.6, 0.06, 0, y, 0.35, px, pz));
      }
    }
    return true;
  }

  // planted roof terrace with shrubs and a few small trees
  function roofGarden(cx, cz, w, d, y) {
    if (w < 9 || d < 9) return false;
    push('park', lbox(w - 2.2, 0.35, d - 2.2, 0, y, 0, cx, cz));
    const px = rr(-0.2, 0.2) * w;
    const n = Math.max(2, Math.floor((w * d) / 70));
    for (let i = 0; i < n; i++) {
      const sx = rr(-0.5, 0.5) * (w - 6), sz = rr(-0.5, 0.5) * (d - 6);
      if (Math.abs(sx - px) < 2) continue;
      treeSpots.push({ kind: 'bush', x: cx + sx, y: y + 0.35, z: cz + sz, s: rr(0.5, 0.75) });
    }
    push('path', lbox(1.2, 0.38, d - 2.2, px, y, 0, cx, cz));
    return true;
  }

  // lit rooftop pool on a paved deck
  function roofPool(cx, cz, w, d, y) {
    if (w < 14 || d < 14) return false;
    const pw = w * rr(0.38, 0.5), pd = d * rr(0.22, 0.32);
    push('path', lbox(pw + 4, 0.25, pd + 4, 0, y, 0, cx, cz));
    push('glow', colored(lbox(pw, 0.12, pd, 0, y + 0.2, 0, cx, cz), new THREE.Color(0.2, 1.25, 1.55)));
    for (let i = 0; i < 4; i++) push('white', lbox(0.7, 0.35, 1.9, -pw / 2 + 1 + i * 1.6, y + 0.25, pd / 2 + 1.3, cx, cz));
    return true;
  }

  // roof slab, parapet, HVAC units, lift room and one of: helipad, pool, solar panels, garden, water tank
  function roofKit(cx, cz, w, d, y, rot = 0, opt = {}) {
    push(rand() < 0.62 ? 'roof' : 'roofLight', lbox(w, 0.4, d, 0, y, 0, cx, cz, rot));
    parapet(cx, cz, w, d, y, rot);
    if (opt.helipad && Math.min(w, d) >= 16) {
      helipad(cx, cz, Math.min(w, d) * 0.38, y + 0.4);
      return;
    }
    if (!rot && opt.pool && roofPool(cx, cz, w, d, y + 0.4)) return;
    if (!rot && opt.garden && roofGarden(cx, cz, w, d, y + 0.4)) return;
    if (!rot && opt.solar && solarArray(cx, cz, w, d, y + 0.4)) {
      if (opt.tank && w > 8 && d > 8) waterTank(cx + (w / 2 - 2.5), cz + (d / 2 - 2.5), y + 0.4);
      return;
    }
    const n = Math.min(6, 1 + Math.floor((w * d) / 140));
    for (let i = 0; i < n; i++) {
      const s = rr(1.8, 3.4), hh = rr(1.2, 2.2);
      const lx = rr(-1, 1) * Math.max(0, w / 2 - s / 2 - 1.2);
      const lz = rr(-1, 1) * Math.max(0, d / 2 - s / 2 - 1.2);
      push('hvac', lbox(s, hh, s * rr(0.8, 1.6), lx, y + 0.4, lz, cx, cz, rot));
      const fan = new THREE.CylinderGeometry(s * 0.3, s * 0.3, 0.3, 16);
      fan.translate(lx, y + 0.4 + hh + 0.15, lz);
      if (rot) fan.rotateY(rot);
      fan.translate(cx, 0, cz);
      push('dark', fan);
    }
    if (w > 9 && d > 9) {
      const ew = rr(3, 5), ed = rr(3, 5);
      push('concrete', lbox(ew, rr(2.5, 3.6), ed, rr(-1, 1) * (w / 2 - ew / 2 - 1), y + 0.4, rr(-1, 1) * (d / 2 - ed / 2 - 1), cx, cz, rot));
    }
    if (opt.tank && w > 8 && d > 8 && !rot) waterTank(cx + rr(-0.3, 0.3) * w, cz + rr(-0.3, 0.3) * d, y + 0.4);
  }

  // rooftop billboard on a steel frame: a neon sign, or (led = true) an LED video screen
  function billboard(cx, cz, w, d, y, led = false) {
    const f = faceOf(w, d, 0, Math.floor(rand() * 4));
    const sw = Math.min(f.width * 0.85, led ? rr(10, 18) : rr(8, 14));
    const sh = led ? sw * 0.5625 : sw / 4;
    const nOff = f.half - 1.5;
    const legH = 2.2;
    for (const t of [-sw * 0.35, sw * 0.35]) push('metal', fbox(0.3, legH + sh, 0.3, t, y, nOff - 0.5, f.a, cx, cz));
    for (const t of [-sw * 0.35, sw * 0.35]) push('metal', fbox(0.2, 0.2, 3, t, y + legH + sh * 0.5, nOff - 1.6, f.a, cx, cz));
    push('metal', fbox(sw, 0.15, 1.0, 0, y + legH - 0.2, nOff - 0.1, f.a, cx, cz));
    if (led) {
      push('dark', fbox(sw + 0.6, sh + 0.6, 0.4, 0, y + legH - 0.3, nOff - 0.1, f.a, cx, cz));
      screenSpots.push({ x: cx, z: cz, a: f.a, nOff: nOff + 0.12, w: sw, h: sh, y0: y + legH });
    } else {
      addSign('h', f.a, nOff, 0, y + legH, sw, cx, cz);
    }
  }

  function cornerStrips(w, d, h, x, y0, z, color) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      push('glow', colored(lbox(0.5, h, 0.5, sx * (w / 2 + 0.1), y0, sz * (d / 2 + 0.1), x, z), color));
    }
  }

  function fins(bucket, w, d, x, y0, z, h, spacing, depth = 0.6, faces = [0, 1, 2, 3]) {
    for (const k of faces) {
      const f = faceOf(w, d, 0, k);
      const n = Math.floor(f.width / spacing);
      for (let i = 1; i < n; i++) {
        const t = -f.width / 2 + (f.width / n) * i;
        push(bucket, fbox(0.25, h, depth, t, y0, f.half + depth / 2, f.a, x, z));
      }
    }
  }

  // facade sides that have room for a blade sign (no video wall, no sun fins)
  function freeFaces(w, d, screen, finFaces) {
    const screenA = screen ? screenSpots[screenSpots.length - 1].a : null;
    return [0, 1, 2, 3].filter((k) => !finFaces.includes(k) && faceOf(w, d, 0, k).a !== screenA);
  }

  // reserve a spot for a big LED video wall on one side of a building
  function screenSpot(x, z, w, d, yLo, yHi, high = false) {
    const f = faceOf(w, d, 0, Math.floor(rand() * 4));
    const sw = Math.min(f.width * (high ? 0.88 : 0.8), high ? rr(20, 32) : rr(11, 24));
    const sh = sw * 0.5625;
    if (yHi - yLo < sh + 6) return false;
    const y0 = high ? yHi - sh - rr(3, 6) : yLo + rr(3, Math.min(14, yHi - yLo - sh - 2));
    screenSpots.push({ x, z, a: f.a, nOff: f.half + 0.35, w: sw, h: sh, y0 });
    push('dark', fbox(sw + 0.8, sh + 0.8, 0.3, 0, y0 - 0.4, f.half + 0.15, f.a, x, z));
    return true;
  }

  // ---------- building types ----------
  // 1. setback skyscraper (glass curtain wall or punched-window office)
  function setbackTower(x, z, w, d, h, style, opts) {
    lobbyBox(x, z, w, d);
    const tiers = h > 90 && rand() < 0.75 ? (rand() < 0.5 ? 2 : 3) : 1;
    const ratios = tiers === 1 ? [1] : tiers === 2 ? [0.66, 0.34] : [0.5, 0.3, 0.2];
    const H = h - LOBBY;
    let y = LOBBY, cw = w, cd = d;
    let screen = opts.screen && screenSpot(x, z, w, d, LOBBY, LOBBY + H * ratios[0]);
    streetSigns(x, z, w, d, opts.neon * 0.7, h, freeFaces(w, d, screen, []));
    // a giant video wall high up on tall towers, visible across the city
    if (opts.led && h > 70 && rand() < 0.55) screen = screenSpot(x, z, w, d, LOBBY + H * ratios[0] * 0.5, LOBBY + H * ratios[0], true) || screen;
    for (let t = 0; t < tiers; t++) {
      const th = H * ratios[t];
      facade(style, cw, th, cd, x, y, z);
      if (style === 'office' && !screen && rand() < 0.5) fins('metal', cw, cd, x, y, z, th, STYLES.office.cell[0] * 2, 0.5);
      if (t === 0 && !screen && rand() < 0.25) cornerStrips(cw, cd, th, x, y, z, neon(2.2));
      for (let k = 35; k < th - 4; k += 35) push('metal', lbox(cw + 0.4, 1.2, cd + 0.4, 0, y + k, 0, x, z));
      y += th;
      if (t < tiers - 1) {
        const r = rand();
        roofKit(x, z, cw, cd, y, 0, { garden: r < 0.4, pool: r >= 0.4 && r < 0.6 });
        cw *= rr(0.68, 0.85);
        cd *= rr(0.68, 0.85);
      }
    }
    if (rand() < 0.45) push('glow', colored(lbox(cw + 0.9, 0.7, cd + 0.9, 0, y - 2.5, 0, x, z), neon(2.6)));
    if (rand() < 0.3) {
      fins('metal', cw - 1, cd - 1, x, y, z, rr(3, 6), 1.2, 0.2);
      roofKit(x, z, cw, cd, y);
    } else {
      const r = rand();
      const helipad = h > 120 && r < 0.45;
      const pool = r >= 0.45 && r < 0.7;
      roofKit(x, z, cw, cd, y, 0, { helipad, pool });
      if (helipad || pool) return;
      if (opts.led && cw > 14 && rand() < 0.35) {
        billboard(x, z, cw, cd, y + 0.4, true);
        return;
      }
    }
    if (h > 110 && rand() < 0.55) antenna(x, z, y + 0.4, rr(14, 34));
  }

  // 2. round glass tower, optionally tapered, with a dome or a helipad
  function cylTower(x, z, r, h) {
    lobbyCyl(x, z, r);
    const H = h - LOBBY;
    const rt = r * (rand() < 0.45 ? rr(0.72, 0.9) : 1);
    facadeRound('glass', rt, r, H, 40, x, LOBBY, z);
    for (let k = 28; k < H - 4; k += 28) {
      const rk = r + (rt - r) * (k / H) + 0.35;
      push('metal', cyl(rk, rk, 0.8, 40, x, LOBBY + k, z));
    }
    const y = h;
    const crown = new THREE.TorusGeometry(rt + 0.2, 0.25, 8, 64);
    crown.rotateX(Math.PI / 2);
    crown.translate(x, y - 1.5, z);
    push('glow', colored(crown, neon(2.8)));
    if (rand() < 0.5) {
      const dome = new THREE.SphereGeometry(rt, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, 0.45, 1);
      dome.translate(x, y, z);
      push('metal', dome);
      push('metal', cyl(0.3, 0.6, 18, 8, x, y + rt * 0.45, z));
      antennaTips.push(new THREE.Vector3(x, y + rt * 0.45 + 18, z));
    } else {
      push('roof', cyl(rt, rt, 0.4, 40, x, y, z));
      push('concrete', cyl(rt, rt, 1.1, 40, x, y, z, true));
      helipad(x, z, rt * 0.7, y + 0.4);
    }
  }

  // 3. twisting tower: every two floors rotate a little further
  function twistTower(x, z, s, h) {
    lobbyBox(x, z, s, s);
    const pieceH = 7.2;
    const n = Math.max(4, Math.floor((h - LOBBY) / pieceH));
    const total = rr(Math.PI / 3, Math.PI * 0.7) * (rand() < 0.5 ? 1 : -1);
    const style = rand() < 0.7 ? 'glass' : 'ribbon';
    let a = 0;
    for (let i = 0; i < n; i++) {
      a = (total * i) / n;
      const y = LOBBY + i * pieceH;
      facade(style, s, pieceH, s, x, y, z, a);
      push('concrete', lbox(s + 0.6, 0.35, s + 0.6, 0, y + pieceH - 0.2, 0, x, z, a));
    }
    const top = LOBBY + n * pieceH;
    push('glow', colored(lbox(s + 0.9, 0.6, s + 0.9, 0, top - 1.8, 0, x, z, a), neon(2.6)));
    roofKit(x, z, s, s, top, a);
    if (rand() < 0.6) antenna(x, z, top + 0.4, rr(16, 30));
  }

  // 4. art deco tower: stone setbacks, piers, cornices and a pyramid cap
  function decoTower(x, z, w, h) {
    lobbyBox(x, z, w, w);
    const widths = [1, 0.8, 0.62, 0.46];
    const ratios = [0.44, 0.26, 0.17, 0.13];
    const H = (h - LOBBY) * 0.9;
    let y = LOBBY, s = w;
    const gold = new THREE.Color(2.4, 1.6, 0.55);
    for (let t = 0; t < 4; t++) {
      s = w * widths[t];
      const th = H * ratios[t];
      facade('deco', s, th, s, x, y, z);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) push('stone', lbox(1.6, th, 1.6, (sx * s) / 2, y, (sz * s) / 2, x, z));
      for (let k = 0; k < 4; k++) {
        const f = faceOf(s, s, 0, k);
        const ts = s > 18 ? [-s / 4, 0, s / 4] : [0];
        for (const tt of ts) push('stone', fbox(0.9, th, 0.6, tt, y, f.half + 0.3, f.a, x, z));
      }
      push('stone', lbox(s + 1.2, 1.0, s + 1.2, 0, y + th - 1.0, 0, x, z));
      push('glow', colored(lbox(s + 0.5, 0.25, s + 0.5, 0, y + th - 1.5, 0, x, z), gold));
      y += th;
    }
    const capH = h * 0.1;
    const cap = new THREE.ConeGeometry(s * 0.7, capH, 4);
    cap.rotateY(Math.PI / 4);
    cap.translate(x, y + capH / 2, z);
    push('metal', cap);
    push('metal', cyl(0.25, 0.5, 16, 8, x, y + capH - 1, z));
    antennaTips.push(new THREE.Vector3(x, y + capH + 15, z));
  }

  // 5. hexagonal / octagonal prism tower with neon edges
  function prismTower(x, z, r, h) {
    const seg = rand() < 0.5 ? 6 : 8;
    lobbyCyl(x, z, r, seg);
    const H = h - LOBBY;
    facadeRound(rand() < 0.6 ? 'glass' : 'office', r, r, H, seg, x, LOBBY, z, true);
    const color = neon(2.4);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      push('glow', colored(lbox(0.45, H, 0.45, Math.sin(a) * (r + 0.05), LOBBY, Math.cos(a) * (r + 0.05), x, z), color));
    }
    for (let k = 42; k < H - 4; k += 42) push('metal', cyl(r + 0.4, r + 0.4, 0.9, seg, x, LOBBY + k, z));
    const capH = rr(10, 22);
    const cap = new THREE.ConeGeometry(r, capH, seg);
    cap.translate(x, h + capH / 2, z);
    push('metal', cap);
    antennaTips.push(new THREE.Vector3(x, h + capH + 0.5, z));
  }

  // 6. apartment block: balconies with glass railings, roof tank, garden or solar panels
  function apartment(x, z, w, d, h, opts) {
    lobbyBox(x, z, w, d, 0.8);
    const H = h - LOBBY;
    const style = pick(['resi', 'resi', 'resi2', 'brick']);
    facade(style, w, H, d, x, LOBBY, z);
    const floorH = STYLES[style].cell[1];
    const floors = Math.floor(H / floorH);
    const faces = w >= d ? [0, 2] : [1, 3];
    const bw0 = (w >= d ? w : d) * rr(0.55, 0.85);
    for (const k of faces) {
      const f = faceOf(w, d, 0, k);
      for (let i = 1; i < floors; i++) {
        const y = LOBBY + i * floorH;
        push('concrete', fbox(bw0, 0.25, 1.4, 0, y - 0.25, f.half + 0.7, f.a, x, z));
        push('railing', fbox(bw0, 1.0, 0.08, 0, y, f.half + 1.35, f.a, x, z));
      }
      push('concrete', fbox(0.3, H, 1.4, -bw0 / 2, LOBBY, f.half + 0.7, f.a, x, z));
      push('concrete', fbox(0.3, H, 1.4, bw0 / 2, LOBBY, f.half + 0.7, f.a, x, z));
    }
    const r = rand();
    roofKit(x, z, w, d, h, 0, { tank: true, garden: r < 0.25, solar: r >= 0.25 && r < 0.55 });
    // blade signs only on the sides without balconies
    streetSigns(x, z, w, d, opts.neon, h, w >= d ? [1, 3] : [0, 2]);
  }

  // 7. office slab with ribbon windows, sun fins and a rooftop billboard
  function officeSlab(x, z, w, d, h, opts) {
    lobbyBox(x, z, w, d);
    const H = h - LOBBY;
    facade(rand() < 0.75 ? 'ribbon' : 'office2', w, H, d, x, LOBBY, z);
    const screen = opts.screen && screenSpot(x, z, w, d, LOBBY, h);
    const finFaces = !screen && rand() < 0.6 ? (w >= d ? [0, 2] : [1, 3]) : [];
    if (finFaces.length) fins('metal', w, d, x, LOBBY, z, H, 3, 0.9, finFaces);
    if (rand() < 0.25) push('glow', colored(lbox(w + 0.9, 0.6, d + 0.9, 0, h - 2.2, 0, x, z), neon(2.4)));
    streetSigns(x, z, w, d, opts.neon, h, freeFaces(w, d, screen, finFaces));
    roofKit(x, z, w, d, h, 0, { solar: rand() < 0.35 });
    if (rand() < 0.55) billboard(x, z, w, d, h + 0.4, opts.led && rand() < 0.5);
  }

  // 8. low-rise shops: coloured awnings, shop signs, rooftop billboard
  const AWNING = [0x8a1c1c, 0x1d5a3a, 0x1c3d7a, 0xb0601a, 0x6a2a7a, 0x2a2a2a].map((c) => new THREE.Color(c));
  function shop(x, z, w, d, opts) {
    const floors = 1 + Math.floor(rand() * 3);
    const h = LOBBY + floors * 3;
    lobbyBox(x, z, w, d, 1.35);
    facade(pick(['resi2', 'brick', 'resi']), w, h - LOBBY, d, x, LOBBY, z);
    for (let k = 0; k < 4; k++) {
      const f = faceOf(w, d, 0, k);
      if (rand() < 0.75) {
        const aw = f.width * rr(0.5, 0.85);
        const awn = new THREE.BoxGeometry(aw, 0.15, 1.8);
        awn.rotateX(0.25);
        awn.translate(0, LOBBY - 1.1, f.half + 0.9);
        awn.rotateY(f.a);
        awn.translate(x, 0, z);
        push('paint', colored(awn, pick(AWNING)));
      }
      if (rand() < 0.75) addSign('h', f.a, f.half + 0.05, 0, LOBBY + 0.3, Math.min(f.width * 0.6, rr(5, 8)), x, z);
      if (rand() < 0.45) bladeSign(f, (rand() < 0.5 ? -1 : 1) * (f.width / 2 - rr(1, 2)), LOBBY + 0.8, rr(1.0, 1.4), x, z);
    }
    const r = rand();
    roofKit(x, z, w, d, h, 0, { tank: r < 0.3, garden: r >= 0.3 && r < 0.55, solar: r >= 0.55 && r < 0.75 });
    if (rand() < 0.5) billboard(x, z, w, d, h + 0.4, opts.led && rand() < 0.3);
  }

  // landmark: octagonal setback tower with a spire
  function landmark(cx, cz) {
    const tiers = [[21, 136], [17, 90], [13, 62], [9, 42]];
    const cyan = new THREE.Color(0x00e5ff).multiplyScalar(3);
    lobbyCyl(cx, cz, 22, 8);
    push('glow', colored(cyl(23, 23, 0.6, 8, cx, LOBBY + 0.2, cz), cyan));
    let y = LOBBY;
    for (const [r, h] of tiers) {
      facadeRound('glass', r, r, h, 8, cx, y, cz, true);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        push('metal', lbox(0.8, h, 0.8, Math.sin(a) * r, y, Math.cos(a) * r, cx, cz));
        // animated LED fin on every edge of the octagon
        push('led', lbox(0.35, h - 1, 0.35, Math.sin(a) * (r + 0.55), y + 0.5, Math.cos(a) * (r + 0.55), cx, cz));
      }
      push('glow', colored(cyl(r + 0.6, r + 0.6, 0.9, 8, cx, y + h - 1.6, cz), cyan));
      push('dark', cyl(r + 1.2, r + 1.2, 1.2, 8, cx, y + h, cz));
      y += h + 1.2;
    }
    push('metal', cyl(1.2, 4.5, 70, 8, cx, y, cz));
    for (let k = 1; k <= 4; k++) {
      const ring = new THREE.TorusGeometry(4.2 - k * 0.7, 0.18, 6, 24);
      ring.rotateX(Math.PI / 2);
      ring.translate(cx, y + k * 12, cz);
      push('glow', colored(ring, cyan));
    }
    antennaTips.push(new THREE.Vector3(cx, y + 70, cz));
    landmarkTop = y;
  }

  // park: lawn, crossing paths, fountain, mixed trees and lamp posts
  function park(cx, cz) {
    push('park', lbox(BLOCK - 2, 0.5, BLOCK - 2, 0, 0.4, 0, cx, cz));
    push('path', lbox(BLOCK - 10, 0.55, 2.5, 0, 0.4, 0, cx, cz));
    push('path', lbox(2.5, 0.55, BLOCK - 10, 0, 0.4, 0, cx, cz));
    push('concrete', cyl(5, 5, 0.9, 24, cx, 0.4, cz));
    push('glow', colored(cyl(3.6, 3.6, 0.3, 24, cx, 1.3, cz), new THREE.Color(0.3, 1.2, 2.4)));
    // one big shade tree per quarter, smaller trees around it
    for (const [qx, qz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      treeSpots.push({ kind: 'park', x: cx + qx * rr(9, 12), y: 0.9, z: cz + qz * rr(9, 12), s: rr(0.8, 1.1) });
      for (let i = 0; i < 3; i++) {
        const tx = qx * rr(4, 19), tz = qz * rr(4, 19);
        if (Math.abs(tx) < 3 || Math.abs(tz) < 3 || Math.hypot(tx, tz) < 8) continue;
        treeSpots.push({ kind: rand() < 0.5 ? 'bush' : 'street', x: cx + tx, y: 0.9, z: cz + tz, s: rr(0.75, 1.15) });
      }
    }
    for (const [lx, lz] of [[-9, 2], [9, -2], [2, 9], [-2, -9], [-15, 2], [15, -2], [2, 15], [-2, -15]]) {
      push('metal', cyl(0.06, 0.08, 3.4, 6, cx + lx, 0.9, cz + lz));
      push('glow', colored(new THREE.SphereGeometry(0.22, 10, 8).translate(cx + lx, 4.4, cz + lz), new THREE.Color(3, 2.2, 1.2)));
    }
  }

  // ---------- blocks ----------
  const INNER = BLOCK - 7;
  for (let i = 0; i < BLOCKS; i++) {
    for (let j = 0; j < BLOCKS; j++) {
      const cx = blockCenter(i);
      const cz = blockCenter(j);
      push('slab', lbox(BLOCK, 0.4, BLOCK, 0, 0, 0, cx, cz));
      push('concrete', lbox(BLOCK, 0.42, 0.3, 0, 0, BLOCK / 2 - 0.15, cx, cz));
      push('concrete', lbox(BLOCK, 0.42, 0.3, 0, 0, -BLOCK / 2 + 0.15, cx, cz));
      push('concrete', lbox(0.3, 0.42, BLOCK, BLOCK / 2 - 0.15, 0, 0, cx, cz));
      push('concrete', lbox(0.3, 0.42, BLOCK, -BLOCK / 2 + 0.15, 0, 0, cx, cz));

      if (i === MID && j === MID) {
        landmark(cx, cz);
        continue;
      }
      const dn = Math.hypot(cx, cz) / HALF;
      if (dn > 0.4 && rand() < 0.06) {
        park(cx, cz);
        continue;
      }
      const hMax = 18 + 210 * Math.exp(-dn * dn * 3.5);
      const n = dn < 0.3 ? pick([1, 2, 2]) : dn < 0.7 ? pick([2, 2, 3]) : pick([2, 3, 3]);
      const cell = INNER / n;
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const lx = cx - INNER / 2 + cell * (a + 0.5);
          const lz = cz - INNER / 2 + cell * (b + 0.5);
          const w = cell * rr(0.66, 0.92);
          const d = cell * rr(0.66, 0.92);
          let h = hMax * (0.3 + 0.7 * Math.pow(rand(), 0.8));
          if (rand() < 0.04) h *= 1.6;
          h = Math.max(10, h);
          const x = lx + rr(-0.5, 0.5) * (cell - w);
          const z = lz + rr(-0.5, 0.5) * (cell - d);
          let type = dn < 0.3
            ? weighted([['tower', 3], ['cyl', 2], ['twist', 1.4], ['deco', 1.6], ['prism', 2]])
            : dn < 0.65
              ? weighted([['tower', 2], ['slab', 2.5], ['deco', 0.8], ['prism', 0.8], ['apartment', 2.5], ['cyl', 0.6]])
              : weighted([['apartment', 3], ['slab', 1.2], ['shop', 2.5]]);
          const m = Math.min(w, d);
          if ((type === 'cyl' || type === 'prism' || type === 'twist') && (h < 60 || m < 12)) type = 'tower';
          if (type === 'deco' && h < 50) type = 'tower';
          const opts = {
            screen: dn < 0.75 && h > 30 && m > 11 && rand() < 0.55,
            led: dn < 0.75,
            neon: Math.max(0.3, 0.75 - 0.45 * dn), // busier streets towards the centre
          };
          switch (type) {
            case 'tower': setbackTower(x, z, w, d, h, weighted([['glass', 5], ['office', 3], ['office2', 2]]), opts); break;
            case 'cyl': cylTower(x, z, m / 2, h); break;
            case 'twist': twistTower(x, z, m * 0.82, h); break;
            case 'deco': decoTower(x, z, m, h); break;
            case 'prism': prismTower(x, z, m / 2, h); break;
            case 'apartment': apartment(x, z, w, d, Math.min(h, 95), opts); break;
            case 'slab': officeSlab(x, z, w, d, Math.min(h, 120), opts); break;
            case 'shop': shop(x, z, w, d, opts); break;
          }
        }
      }
    }
  }

  return { buckets: B, antennaTips, screenSpots, treeSpots, landmarkTop };
}
