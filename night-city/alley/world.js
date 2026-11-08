import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { indexNodes, surfaceMaterial } from './assets.js';
import { wetify } from './wet.js';
import { registerHaze, registerFill } from './lights.js';
import { neonText, neonSymbol, SYMBOLS, lightbox, bracket, flicker, setSignBrightness } from './signs.js';

// Alley runs along -z. Walls at x = ±halfWidth; the alley opens onto a cross street at zEnd.
export const ALLEY = { halfWidth: 2.8, zStart: 6, zEnd: -45, endZ: -56, backZ: 14 };
const HW = ALLEY.halfWidth;
const V3 = THREE.Vector3;

let seed = 20261108;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const rr = (a, b) => a + (b - a) * rand();
const pick = (a) => a[Math.floor(rand() * a.length)];

const WARM = 0xffb36b;

export function buildWorld({ scene, assets }) {
  const root = new THREE.Group();
  root.name = 'static';
  scene.add(root);
  const dyn = new THREE.Group();
  dyn.name = 'dynamic';
  dyn.userData.dynamic = true;
  scene.add(dyn);
  const updaters = [];
  const { models, textures } = assets;

  const kitGltf = models.modular_urban_apartments_facade;
  const kit = indexNodes(kitGltf);
  const kitMats = {};
  kitGltf.scene.traverse((o) => {
    if (o.isMesh) kitMats[o.material.name] = o.material;
  });
  const nodeCache = new Map();
  const nodesOf = (id) => {
    if (!nodeCache.has(id)) nodeCache.set(id, indexNodes(models[id]));
    return nodeCache.get(id);
  };

  // ---------- materials ----------
  for (const n of ['modular_urban_apartments_facade_trim_01', 'modular_urban_apartments_facade_trim_02', 'modular_urban_apartments_facade_objects']) {
    wetify(kitMats[n], { porosity: 0.45 });
  }
  const kitPlaster = kitMats.modular_urban_apartments_facade_plaster;
  const tinted = (mat, color) => {
    const m = mat.clone();
    m.color.set(color);
    return wetify(m, { porosity: 0.6 });
  };
  const M = {
    pink: wetify(surfaceMaterial(textures.painted_plaster_wall, { repeat: 1.5, flipY: false, color: 0xd8b4ae }), { porosity: 0.6 }),
    ochre: tinted(kitPlaster, 0xc9a48e),
    beige: tinted(kitPlaster, 0xbcae9f),
    grey: wetify(surfaceMaterial(textures.worn_plaster_wall, { repeat: 3 / 1.8, flipY: false, color: 0xb7b2ad }), { porosity: 0.6 }),
    brick: wetify(surfaceMaterial(textures.brick_wall_001, { repeat: 1, flipY: false, normalScale: 1.5 }), { porosity: 0.85, gloss: 0.6 }),
    brickDark: wetify(surfaceMaterial(textures.brick_wall_001, { repeat: 1, flipY: false, color: 0x9c918d, normalScale: 1.5 }), { porosity: 0.85, gloss: 0.6 }),
    brickRed: wetify(surfaceMaterial(textures.medieval_red_brick, { repeat: 1.5, flipY: false, normalScale: 1.4 }), { porosity: 0.85, gloss: 0.6 }),
    concrete: wetify(surfaceMaterial(textures.concrete_wall_006, { repeat: 1.5, flipY: false, color: 0xa9a5a0 }), { porosity: 0.6 }),
    metal: wetify(new THREE.MeshStandardMaterial({ color: 0x7f858c, metalness: 0.85, roughness: 0.38 }), { porosity: 0.1, gloss: 0.5 }),
    darkMetal: wetify(new THREE.MeshStandardMaterial({ color: 0x1d1e22, metalness: 0.7, roughness: 0.42 }), { porosity: 0.1, gloss: 0.5 }),
    cable: wetify(new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.45 }), { porosity: 0.1, gloss: 0.6 }),
    curb: wetify(surfaceMaterial(textures.concrete_wall_006, { repeat: 1, color: 0x8e8b88 }), { porosity: 0.6 }),
  };
  const glass = new THREE.MeshStandardMaterial({
    name: 'glass', color: 0x0a0d12, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false,
  });
  const glassSheen = new THREE.MeshStandardMaterial({
    name: 'glass-sheen', color: 0x000000, roughness: 0.04, metalness: 0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.3,
  });

  // ---------- room interiors seen through the windows ----------
  const ROOM_STYLES = [
    { wall: '#d8b088', glow: 'rgba(255,214,150,0.95)', curtain: '#7a2c2c', k: 1.3 },
    { wall: '#c6c4ae', glow: 'rgba(235,255,240,0.85)', blinds: true, k: 1.15 },
    { wall: '#d39a68', glow: 'rgba(255,165,85,0.95)', curtain: '#33476e', k: 1.35 },
    { wall: '#3d4b6c', glow: 'rgba(110,150,255,0.75)', tv: true, k: 1.0 },
    { wall: '#c9a27c', glow: 'rgba(255,200,140,0.9)', k: 1.2 },
  ];
  const SHOP_STYLE = { wall: '#e6bf8a', glow: 'rgba(255,225,175,1)', shelves: true, k: 2.4 };

  function roomCanvas(style) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = style.wall;
    g.fillRect(0, 0, 256, 256);
    const rg = g.createRadialGradient(128, 10, 8, 128, 70, 240);
    rg.addColorStop(0, style.glow);
    rg.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(25,16,10,0.85)';
    g.fillRect(0, 205, 256, 51);
    if (style.shelves) {
      for (const y of [64, 108, 152]) {
        g.fillStyle = '#4a3324';
        g.fillRect(8, y, 240, 6);
        for (let x = 12; x < 240; x += 9 + Math.floor(rand() * 6)) {
          g.fillStyle = pick(['#c43a3a', '#e8c25a', '#3a8a5a', '#f2f2f2', '#2f5fa8', '#d97a2b', '#7a3a8a']);
          g.fillRect(x, y - 16 - rand() * 10, 7, 26);
        }
      }
      g.fillStyle = 'rgba(20,12,8,0.9)';
      g.fillRect(40, 170, 176, 40);
    } else {
      g.fillStyle = 'rgba(15,10,8,0.8)';
      g.fillRect(30 + rand() * 60, 150, 90 + rand() * 40, 58);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(140 + rand() * 50, 60, 46, 34);
    }
    if (style.tv) {
      g.fillStyle = '#a8ccff';
      g.fillRect(150, 118, 64, 40);
    }
    if (style.blinds) {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = 0; y < 256; y += 9) g.fillRect(0, y, 256, 4);
    }
    if (style.curtain) {
      for (const side of [0, 1]) {
        for (let i = 0; i < 7; i++) {
          g.fillStyle = style.curtain;
          g.globalAlpha = 0.75 + 0.25 * Math.sin(i * 1.7);
          g.fillRect(side ? 256 - 64 + i * 9 : i * 9, 0, 9, 256);
        }
      }
      g.globalAlpha = 1;
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function ceilingCanvas(style) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = style.wall;
    g.fillRect(0, 0, 128, 128);
    const rg = g.createRadialGradient(64, 64, 2, 64, 64, 80);
    rg.addColorStop(0, 'rgba(255,255,240,1)');
    rg.addColorStop(0.15, style.glow);
    rg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const roomMats = (style) => {
    const k = new THREE.Color(1, 1, 1).multiplyScalar(style.k);
    const sideCol = new THREE.Color(style.wall).multiplyScalar(style.k * 0.55);
    return {
      back: new THREE.MeshBasicMaterial({ map: roomCanvas(style), color: k }),
      ceiling: new THREE.MeshBasicMaterial({ map: ceilingCanvas(style), color: k }),
      side: new THREE.MeshBasicMaterial({ color: sideCol }),
      floor: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a1d14).multiplyScalar(style.k) }),
    };
  };
  const litRooms = ROOM_STYLES.map(roomMats);
  const shopRoom = roomMats(SHOP_STYLE);
  const darkRoom = { back: new THREE.MeshBasicMaterial({ color: 0x050506 }) };
  darkRoom.ceiling = darkRoom.side = darkRoom.floor = darkRoom.back;

  // ---------- facade kit ----------
  // Each kit module is 3 m wide; its origin is the bottom right corner, geometry spans local x -3..0.
  function frameFor(side, i, base) {
    switch (side) {
      case 'L': {
        const zLo = base - 3 * i - 3;
        return { origin: new V3(-HW, 0, zLo), rotY: Math.PI / 2, center: new V3(-HW, 0, zLo + 1.5), normal: new V3(1, 0, 0) };
      }
      case 'R': {
        const zHi = base - 3 * i;
        return { origin: new V3(HW, 0, zHi), rotY: -Math.PI / 2, center: new V3(HW, 0, zHi - 1.5), normal: new V3(-1, 0, 0) };
      }
      case 'E': {
        const xLo = base + 3 * i;
        return { origin: new V3(xLo + 3, 0, ALLEY.endZ), rotY: 0, center: new V3(xLo + 1.5, 0, ALLEY.endZ), normal: new V3(0, 0, 1) };
      }
      case 'XL': {
        const xLo = base - 3 * i - 3;
        return { origin: new V3(xLo, 0, ALLEY.zEnd), rotY: Math.PI, center: new V3(xLo + 1.5, 0, ALLEY.zEnd), normal: new V3(0, 0, -1) };
      }
      case 'XR':
      case 'B': {
        const xLo = base + 3 * i;
        const z = side === 'B' ? ALLEY.backZ : ALLEY.zEnd;
        return { origin: new V3(xLo, 0, z), rotY: Math.PI, center: new V3(xLo + 1.5, 0, z), normal: new V3(0, 0, -1) };
      }
    }
  }

  // The kit's wall panels are dense 49x49 grids. Rebuild each as a flat panel with its opening cut out
  // (found by rasterising the original triangles) plus reveal faces, a few dozen triangles instead of thousands.
  const wallCache = new Map();
  function simpleWall(name) {
    if (wallCache.has(name)) return wallCache.get(name);
    const src = kit[name];
    const mesh = src.isMesh ? src : src.getObjectByProperty('isMesh', true);
    const pos = mesh.geometry.attributes.position;
    const idx = mesh.geometry.index;
    const N = 150;
    const cell = 3 / N;
    const covered = new Uint8Array(N * N);
    const tri = idx ? idx.count / 3 : pos.count / 3;
    const p = [new V3(), new V3(), new V3()];
    for (let t = 0; t < tri; t++) {
      for (let k = 0; k < 3; k++) p[k].fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k);
      const minX = Math.max(0, Math.floor((Math.min(p[0].x, p[1].x, p[2].x) + 3) / cell));
      const maxX = Math.min(N - 1, Math.ceil((Math.max(p[0].x, p[1].x, p[2].x) + 3) / cell));
      const minY = Math.max(0, Math.floor(Math.min(p[0].y, p[1].y, p[2].y) / cell));
      const maxY = Math.min(N - 1, Math.ceil(Math.max(p[0].y, p[1].y, p[2].y) / cell));
      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          const cx = -3 + (gx + 0.5) * cell, cy = (gy + 0.5) * cell;
          const d1 = (cx - p[1].x) * (p[0].y - p[1].y) - (p[0].x - p[1].x) * (cy - p[1].y);
          const d2 = (cx - p[2].x) * (p[1].y - p[2].y) - (p[1].x - p[2].x) * (cy - p[2].y);
          const d3 = (cx - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (cy - p[0].y);
          const neg = d1 < 0 || d2 < 0 || d3 < 0, pos3 = d1 > 0 || d2 > 0 || d3 > 0;
          if (!(neg && pos3)) covered[gy * N + gx] = 1;
        }
      }
    }
    // each connected region of uncovered cells is one opening (double windows have two)
    const seen = new Uint8Array(N * N);
    const openings = [];
    for (let gy = 1; gy < N - 1; gy++) {
      for (let gx = 1; gx < N - 1; gx++) {
        const start = gy * N + gx;
        if (covered[start] || seen[start]) continue;
        const stack = [start];
        seen[start] = 1;
        let x0 = gx, x1 = gx, y0 = gy, y1 = gy, count = 0;
        while (stack.length) {
          const c = stack.pop();
          const cx = c % N, cy = (c - cx) / N;
          count++;
          x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
          for (const n of [c - 1, c + 1, c - N, c + N]) {
            const nx = n % N, ny = (n - nx) / N;
            if (nx < 1 || ny < 1 || nx >= N - 1 || ny >= N - 1 || covered[n] || seen[n]) continue;
            seen[n] = 1;
            stack.push(n);
          }
        }
        if (count < 40) continue;
        const door = y0 <= 2;
        openings.push({ x0: -3 + x0 * cell, x1: -3 + (x1 + 1) * cell, y0: door ? 0 : y0 * cell, y1: (y1 + 1) * cell, door });
      }
    }
    let geo;
    if (!openings.length) {
      geo = new THREE.PlaneGeometry(3, 3);
      geo.translate(-1.5, 1.5, 0);
    } else {
      const shape = new THREE.Shape();
      shape.moveTo(-3, 0);
      for (const o of openings.filter((o) => o.door).sort((a, b) => a.x0 - b.x0)) {
        shape.lineTo(o.x0, 0).lineTo(o.x0, o.y1).lineTo(o.x1, o.y1).lineTo(o.x1, 0);
      }
      shape.lineTo(0, 0).lineTo(0, 3).lineTo(-3, 3).closePath();
      for (const o of openings.filter((o) => !o.door)) {
        shape.holes.push(new THREE.Path().moveTo(o.x0, o.y0).lineTo(o.x1, o.y0).lineTo(o.x1, o.y1).lineTo(o.x0, o.y1).closePath());
      }
      const parts = [new THREE.ShapeGeometry(shape)];
      // reveals: the depth of the wall around each opening
      const depth = 0.32;
      const reveal = (w, h, x, yy, ry, rx) => {
        const g = new THREE.PlaneGeometry(w, h);
        g.rotateX(rx);
        g.rotateY(ry);
        g.translate(x, yy, -depth / 2);
        parts.push(g);
      };
      for (const o of openings) {
        reveal(depth, o.y1 - o.y0, o.x0, (o.y0 + o.y1) / 2, Math.PI / 2, 0);
        reveal(depth, o.y1 - o.y0, o.x1, (o.y0 + o.y1) / 2, -Math.PI / 2, 0);
        reveal(o.x1 - o.x0, depth, (o.x0 + o.x1) / 2, o.y1, 0, Math.PI / 2);
        if (!o.door) reveal(o.x1 - o.x0, depth, (o.x0 + o.x1) / 2, o.y0, 0, -Math.PI / 2);
      }
      geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
      parts.forEach((g) => g.dispose());
    }
    // glTF-style UVs (v grows downwards) so the kit plaster and the scanned textures line up as before
    const pa = geo.attributes.position;
    const uv = new Float32Array(pa.count * 2);
    for (let i = 0; i < pa.count; i++) {
      uv[i * 2] = (pa.getX(i) + 3) / 3 + pa.getZ(i) / 3;
      uv[i * 2 + 1] = 1 - pa.getY(i) / 3;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    wallCache.set(name, geo);
    return geo;
  }

  function kitPiece(name, f, y, wallMat) {
    const src = kit[name];
    if (!src) {
      console.warn('missing kit piece', name);
      return null;
    }
    if (name.startsWith('wall_') && wallMat) {
      const wall = new THREE.Mesh(simpleWall(name), wallMat);
      wall.position.set(f.origin.x, y, f.origin.z);
      wall.rotation.set(0, f.rotY, 0);
      wall.castShadow = wall.receiveShadow = true;
      root.add(wall);
      return wall;
    }
    const o = src.clone();
    o.position.set(f.origin.x, y, f.origin.z);
    o.rotation.set(0, f.rotY, 0);
    o.traverse((m) => {
      if (!m.isMesh) return;
      const n = m.material.name;
      if (n.endsWith('_plaster') && wallMat) m.material = wallMat;
      else if (n.endsWith('_glass')) m.material = glass;
      m.castShadow = !n.endsWith('_glass');
      m.receiveShadow = true;
    });
    root.add(o);
    return o;
  }

  // An open box of planes behind a window, so you look into a room rather than into the void.
  function interior(f, y, mats, width = 2.8, height = 2.75, depth = 2.4) {
    const g = new THREE.Group();
    const add = (geo, mat, x, yy, z, rx, ry) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, yy, z);
      m.rotation.set(rx, ry, 0);
      g.add(m);
    };
    const back = new THREE.PlaneGeometry(width, height);
    const cap = new THREE.PlaneGeometry(width, depth);
    const side = new THREE.PlaneGeometry(depth, height);
    add(back, mats.back, 0, height / 2, -depth, 0, 0);
    add(cap, mats.ceiling, 0, height, -depth / 2, Math.PI / 2, 0);
    add(cap, mats.floor, 0, 0, -depth / 2, -Math.PI / 2, 0);
    add(side, mats.side, -width / 2, height / 2, -depth / 2, 0, Math.PI / 2);
    add(side, mats.side, width / 2, height / 2, -depth / 2, 0, -Math.PI / 2);
    g.position.set(f.center.x - f.normal.x * 0.02, y + 0.08, f.center.z - f.normal.z * 0.02);
    g.rotation.y = f.rotY;
    root.add(g);
  }

  const WIN = {
    large: ['wall_window_centered_large_', 'window_centered_large_', ['01', '02', '03']],
    small: ['wall_window_centered_small_', 'window_centered_small_', ['01', '02', '03']],
    double: ['wall_window_centered_double_', 'window_centered_double_', ['01', '02', '03']],
    offset: ['wall_window_offset_small_', 'window_offset_small_', ['01', '03', '05']],
    balcony: ['wall_door_window_small_', 'door_window_small_', ['01', '05', '09']],
  };
  const GROUND = {
    plain: { wall: 'wall_standard_standard_01', dado: 'dado_standard_standard_01' },
    door1: { wall: 'wall_door_centered_small_01', insert: 'door_centered_small_01', dado: 'dado_door_centered_small_01' },
    door2: { wall: 'wall_door_centered_small_02', insert: 'door_centered_small_02', dado: 'dado_door_centered_small_02' },
    doorL: { wall: 'wall_door_centered_large_01', insert: 'door_centered_large_01', dado: 'dado_door_centered_large_01' },
    doorO: { wall: 'wall_door_offset_small_01', insert: 'door_offset_small_01', dado: 'dado_door_offset_small_01' },
    shop: { wall: 'wall_window_centered_double_01', insert: 'window_centered_double_01', shop: true },
    shopL: { wall: 'wall_window_centered_large_01', insert: 'window_centered_large_01', shop: true },
    shutter: { wall: 'wall_standard_standard_01', dado: 'dado_standard_standard_01', shutter: 'window' },
    shutterDoor: { wall: 'wall_standard_standard_01', shutter: 'door' },
  };

  const shutterSpots = [];
  function facade({ side, base, from = 0, count, floors, mat, ground, windows, lit = 0.35 }) {
    const frames = [];
    for (let k = 0; k < count; k++) {
      const f = frameFor(side, from + k, base);
      frames.push(f);
      const G = GROUND[ground[k % ground.length]];
      kitPiece(G.wall, f, 0, mat);
      if (G.insert) kitPiece(G.insert, f, 0, mat);
      if (G.dado) kitPiece(G.dado, f, 0, mat);
      if (G.shop) interior(f, 0, shopRoom, 2.8, 2.8, 3);
      if (G.shutter) shutterSpots.push({ f, type: G.shutter });
      kitPiece('cornice_standard_standard_01', f, 3, mat);

      const wtype = windows[k % windows.length];
      for (let fl = 1; fl < floors; fl++) {
        const y = fl * 3;
        if (wtype === 'plain') {
          kitPiece('wall_standard_standard_01', f, y, mat);
          continue;
        }
        const row = fl === 1 ? 0 : fl === floors - 1 ? 2 : 1;
        const [wallName, insertName, rows] = WIN[wtype];
        kitPiece(wallName + rows[row], f, y, mat);
        kitPiece(insertName + rows[row], f, y, mat);
        interior(f, y, rand() < lit ? pick(litRooms) : darkRoom);
      }
      kitPiece('crown_standard_standard_01', f, floors * 3, mat);
    }
    return frames;
  }

  // Exposed side wall where a taller building rises above its neighbour.
  function partyWall(side, z, yLo, yHi, mat, facing) {
    const w = 7;
    const h = yHi - yLo;
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 3), 1 - uv.getY(i) * (h / 3));
    const m = new THREE.Mesh(geo, mat);
    const x = side === 'L' ? -HW - w / 2 : HW + w / 2;
    m.position.set(x, yLo + h / 2, z);
    m.rotation.y = facing > 0 ? 0 : Math.PI;
    m.receiveShadow = true;
    root.add(m);
  }

  // ---------- buildings ----------
  // left side
  facade({ side: 'L', base: ALLEY.zStart, from: 0, count: 6, floors: 4, mat: M.pink,
    ground: ['plain', 'plain', 'door1', 'plain', 'shop', 'doorO'], windows: ['small', 'large', 'double', 'small', 'large', 'offset'] });
  facade({ side: 'L', base: ALLEY.zStart, from: 6, count: 5, floors: 5, mat: M.ochre,
    ground: ['shutter', 'doorL', 'plain', 'door2', 'plain'], windows: ['double', 'small', 'balcony', 'small', 'double'] });
  facade({ side: 'L', base: ALLEY.zStart, from: 11, count: 6, floors: 3, mat: M.grey,
    ground: ['shop', 'plain', 'shutterDoor', 'doorO', 'plain', 'door1'], windows: ['large', 'large', 'small', 'offset', 'large', 'small'] });
  partyWall('L', -12, 12, 15.75, M.ochre, 1);
  partyWall('L', -27, 9, 15.75, M.ochre, -1);
  // right side
  facade({ side: 'R', base: ALLEY.zStart, from: 0, count: 5, floors: 4, mat: M.brick,
    ground: ['plain', 'plain', 'shutterDoor', 'plain', 'door1'], windows: ['large', 'small', 'large', 'double', 'small'] });
  facade({ side: 'R', base: ALLEY.zStart, from: 5, count: 5, floors: 5, mat: M.brickRed,
    ground: ['plain', 'doorO', 'plain', 'shopL', 'plain'], windows: ['small', 'balcony', 'balcony', 'large', 'small'] });
  facade({ side: 'R', base: ALLEY.zStart, from: 10, count: 7, floors: 4, mat: M.brickDark,
    ground: ['doorL', 'plain', 'shutter', 'plain', 'door2', 'plain', 'shop'], windows: ['double', 'large', 'small', 'large', 'offset', 'double', 'large'] });
  partyWall('R', -9, 12, 15.75, M.brickRed, 1);
  partyWall('R', -24, 12, 15.75, M.brickRed, -1);
  // across the cross street, the corners of the alley, and behind the starting point
  facade({ side: 'E', base: -15, count: 10, floors: 5, mat: M.beige, lit: 0.55,
    ground: ['plain', 'shop', 'shopL', 'doorL', 'shop', 'shop', 'door2', 'shopL', 'plain', 'shop'], windows: ['double', 'large', 'small', 'large', 'double', 'small', 'large', 'offset', 'double', 'large'] });
  facade({ side: 'XL', base: -HW, count: 4, floors: 3, mat: M.grey, ground: ['shop', 'plain', 'door1', 'plain'], windows: ['large', 'small', 'large', 'double'] });
  facade({ side: 'XR', base: HW, count: 4, floors: 4, mat: M.brickDark, ground: ['plain', 'shop', 'plain', 'doorL'], windows: ['small', 'large', 'double', 'large'] });
  facade({ side: 'B', base: -9, count: 6, floors: 4, mat: M.concrete, ground: ['plain', 'door1', 'shop', 'plain', 'doorO', 'plain'], windows: ['large', 'double', 'large', 'small', 'large', 'double'] });

  // ---------- props ----------
  // noReflect: skip in the planar reflection (layer 1 is seen by the main camera only)
  function place(src, { x = 0, y = 0, z = 0, rotY = 0, scale = 1, scaleY = 1, wall = null, gap = 0.004, yAlign = 'bottom', cast = true, wet = { porosity: 0.35 }, parent = root, noReflect = false } = {}) {
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, rotY, 0);
    o.scale.setScalar(scale);
    o.scale.y *= scaleY;
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    let px = x - (box.min.x + box.max.x) / 2;
    let pz = z - (box.min.z + box.max.z) / 2;
    const py = yAlign === 'bottom' ? y - box.min.y : yAlign === 'top' ? y - box.max.y : y - (box.min.y + box.max.y) / 2;
    if (wall === 'L') px = -HW + gap - box.min.x;
    if (wall === 'R') px = HW - gap - box.max.x;
    if (wall === 'E') pz = ALLEY.endZ + gap - box.min.z;
    o.position.set(px, py, pz);
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = cast;
      m.receiveShadow = true;
      if (noReflect) m.layers.set(1);
      if (wet) wetify(m.material, wet);
    });
    parent.add(o);
    o.updateMatrixWorld(true);
    return o;
  }
  const model = (id) => models[id].scene;
  const nodes = (id, names) => {
    const idx = nodesOf(id);
    const g = new THREE.Group();
    for (const n of names) {
      if (idx[n]) g.add(idx[n].clone(true));
      else console.warn('missing node', id, n);
    }
    return g;
  };
  const toWall = { L: Math.PI / 2, R: -Math.PI / 2, E: 0 };

  // roller shutters on the modules reserved for them
  for (const { f, type } of shutterSpots) {
    const side = f.normal.x > 0.5 ? 'L' : f.normal.x < -0.5 ? 'R' : null;
    if (!side) continue;
    const graffiti = rand() < 0.7;
    const src = type === 'door'
      ? nodes('rollershutter_door', [graffiti ? 'rollershutter_door_graffiti' : 'rollershutter_door'])
      : nodes('rollershutter_window_01', [graffiti ? 'rollershutter_window_01_graffiti' : 'rollershutter_window_01']);
    place(src, { wall: side, z: f.center.z, y: type === 'door' ? 0 : 0.5, rotY: toWall[side], wet: { porosity: 0.2 } });
  }

  const trashCan = (rust) => nodes('metal_trash_can', rust
    ? ['metal_trash_can_rust', 'metal_trash_can_rust_handle_left', 'metal_trash_can_rust_handle_right']
    : ['metal_trash_can', 'metal_trash_can_handle_left', 'metal_trash_can_handle_right']);
  const aircon = (rusted) => nodes('exterior_aircon_unit', [rusted ? 'exterior_aircon_unit_rusted' : 'exterior_aircon_unit']);

  // left foreground: utility box, boxes, bags, plant (as in the reference)
  place(model('utility_box_02'), { wall: 'L', z: 1.7, rotY: toWall.L, wet: { porosity: 0.2 } });
  place(model('cardboard_box_01'), { x: -2.3, z: 0.55, rotY: 0.35, wet: { porosity: 0.9, gloss: 0.3 } });
  place(model('cardboard_box_01'), { x: -2.33, z: 0.5, y: 0.335, rotY: -0.2, scale: 0.85, wet: { porosity: 0.9, gloss: 0.3 } });
  place(model('cardboard_box_01'), { x: -2.0, z: -0.15, rotY: 1.2, scale: 0.9, wet: { porosity: 0.9, gloss: 0.3 } });
  place(model('trashbag'), { x: -2.45, z: -0.6, rotY: 0.8, wet: { porosity: 0, gloss: 0.3 } });
  place(model('trashbag'), { x: -2.0, z: -0.85, rotY: 2.4, scale: 0.85, wet: { porosity: 0, gloss: 0.3 } });
  place(model('potted_plant_02'), { x: -2.45, z: 3.2, rotY: 1.0, noReflect: true });
  place(aircon(false), { wall: 'L', z: -3.55, y: 3.4, rotY: toWall.L, wet: { porosity: 0.2 } });
  place(aircon(true), { wall: 'L', z: -10.4, y: 6.4, rotY: toWall.L, wet: { porosity: 0.2 } });
  place(aircon(false), { wall: 'L', z: -19.2, y: 9.5, rotY: toWall.L, wet: { porosity: 0.2 } });
  place(trashCan(true), { wall: 'L', z: -9.55, gap: 0.08, rotY: 0.4 });
  place(trashCan(false), { wall: 'L', z: -10.25, gap: 0.12, rotY: 2.1 });
  place(model('trashbag'), { x: -2.1, z: -8.95, rotY: 0.3, wet: { porosity: 0, gloss: 0.3 } });
  place(model('trashbag'), { x: -2.5, z: -11.0, rotY: 1.6, scale: 0.9, wet: { porosity: 0, gloss: 0.3 } });
  place(model('trashbag'), { x: -1.95, z: -10.1, rotY: 4.0, scale: 0.75, wet: { porosity: 0, gloss: 0.3 } });
  place(model('street_rat'), { x: -1.75, z: -8.55, rotY: 2.3, scale: 1.6, cast: false, noReflect: true });
  place(model('plastic_crate_01'), { x: -2.55, z: -14.6, rotY: Math.PI / 2 });
  place(model('plastic_crate_01'), { x: -2.55, z: -14.6, y: 0.262, rotY: Math.PI / 2 + 0.15 });
  place(model('plastic_crate_01'), { x: -2.5, z: -15.1, rotY: Math.PI / 2 - 0.1 });
  place(model('utility_box_01'), { wall: 'L', z: -19.1, rotY: toWall.L, wet: { porosity: 0.2 } });
  place(model('barrel_03'), { x: -2.4, z: -20.3, rotY: 0.6 });
  place(nodes('modular_industrial_pipes_01', ['modular_industrial_pipes_01_pipe02']), { wall: 'L', z: -20.85, rotY: toWall.L });
  place(nodes('modular_industrial_pipes_01', ['modular_industrial_pipes_01_pipe03']), { wall: 'L', z: -23.8, y: 0.0, rotY: toWall.L });
  place(nodes('wooden_crate_02', ['wooden_crate_02_crate', 'wooden_crate_02_lid']), { x: -2.4, z: -25.3, rotY: 0.05, wet: { porosity: 0.7 } });
  place(model('old_tyre'), { x: -2.55, z: -26.4, y: 0, rotY: Math.PI / 2 - 0.25, wet: { porosity: 0, gloss: 0.4 } });
  place(model('cardboard_box_01'), { x: -2.3, z: -34.6, rotY: -0.4, wet: { porosity: 0.9, gloss: 0.3 } });
  place(model('trashbag'), { x: -2.4, z: -35.3, rotY: 0.9, wet: { porosity: 0, gloss: 0.3 } });
  place(model('barrel_03'), { x: -2.4, z: -40.1, rotY: 2.0 });

  // right side
  place(model('WetFloorSign_01'), { x: 1.45, z: 0.4, rotY: -0.45, wet: { porosity: 0, gloss: 0.4 } });
  place(model('plastic_crate_01'), { x: 2.5, z: -0.35, rotY: 0.1 });
  place(model('plastic_crate_01'), { x: 2.48, z: -0.3, y: 0.262, rotY: -0.12 });
  place(aircon(true), { wall: 'R', z: -4.6, y: 0.33, rotY: toWall.R, wet: { porosity: 0.2 } });
  place(model('cardboard_box_01'), { x: 2.3, z: -5.7, rotY: 0.6, wet: { porosity: 0.9, gloss: 0.3 } });
  place(model('cardboard_box_01'), { x: 2.32, z: -5.75, y: 0.335, rotY: 0.2, scale: 0.8, wet: { porosity: 0.9, gloss: 0.3 } });
  place(model('utility_box_02'), { wall: 'R', z: -10.7, rotY: toWall.R, wet: { porosity: 0.2 } });
  place(model('potted_plant_02'), { x: 2.45, z: -11.75, rotY: 0.3, noReflect: true });
  place(aircon(false), { wall: 'R', z: -7.7, y: 6.35, rotY: toWall.R, wet: { porosity: 0.2 } });
  place(aircon(true), { wall: 'R', z: -28.2, y: 3.35, rotY: toWall.R, wet: { porosity: 0.2 } });
  place(trashCan(false), { wall: 'R', z: -25.9, gap: 0.1, rotY: -0.5 });
  place(model('trashbag'), { x: 2.2, z: -26.6, rotY: 2.0, wet: { porosity: 0, gloss: 0.3 } });
  place(model('barrel_03'), { x: 2.4, z: -30.9, rotY: 1.2 });
  place(model('cardboard_box_01'), { x: 2.35, z: -38.1, rotY: 0.2, wet: { porosity: 0.9, gloss: 0.3 } });
  place(model('trashbag'), { x: 2.3, z: -41.8, rotY: 0.4, wet: { porosity: 0, gloss: 0.3 } });
  // air duct running along the right wall above the shop
  for (let k = 0; k < 3; k++) {
    place(nodes('modular_airduct_rectangular_01', ['modular_airduct_rectangular_01_tripple_01']), { wall: 'R', gap: 0.05, z: -18.6 - k * 1.8, y: 2.45, rotY: 0, wet: { porosity: 0.1 } });
  }
  // manholes
  place(model('water_manhole_cover'), { x: 0.5, z: -6.4, y: -0.025, rotY: 0.4, wet: { porosity: 0.2, gloss: 0.4 } });
  place(model('water_manhole_cover'), { x: -0.7, z: -22.5, y: -0.025, rotY: 1.9, wet: { porosity: 0.2, gloss: 0.4 } });

  // ---------- fire escape on the right building ----------
  {
    const fz = -15;
    for (let fl = 1; fl <= 3; fl++) {
      const y = fl * 3;
      place(nodes('modular_fire_escape', ['modular_fire_escape_platform_middle']), { wall: 'R', gap: 0.02, z: fz, y: y + 0.06, yAlign: 'top', rotY: toWall.R, wet: { porosity: 0.15, gloss: 0.5 } });
      place(nodes('modular_fire_escape', ['modular_fire_escape_railing_middle']), { wall: 'R', gap: 0.02, z: fz, y: y + 0.06, rotY: toWall.R, wet: { porosity: 0.15, gloss: 0.5 } });
      if (fl < 3) {
        place(nodes('modular_fire_escape', ['modular_fire_escape_stairs']), { wall: 'R', gap: 0.05, z: fz + (fl % 2 ? 0.7 : -0.7), y: y + 0.06, scaleY: 3 / 4.01, rotY: toWall.R + (fl % 2 ? 0 : Math.PI), wet: { porosity: 0.15, gloss: 0.5 } });
      }
    }
    place(nodes('modular_fire_escape', ['modular_fire_escape_ladder_bottom']), { wall: 'R', gap: 1.05, z: fz + 1.9, y: 3.0, yAlign: 'top', scaleY: 0.42, rotY: toWall.R, wet: { porosity: 0.15, gloss: 0.5 } });
    // bare bulb hanging under the first landing
    const sock = place(nodes('pull_chain_light_socket', ['pull_chain_light_socket', 'pull_chain_light_socket_chain']), { x: HW - 0.55, z: fz - 1.2, y: 2.3, yAlign: 'top', wet: { porosity: 0.1 } });
    const sb = new THREE.Box3().setFromObject(sock);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 6, 3) }));
    bulb.position.set((sb.min.x + sb.max.x) / 2, sb.min.y + 0.11, (sb.min.z + sb.max.z) / 2);
    root.add(bulb);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.7, 5), M.cable);
    wire.position.set(bulb.position.x, 2.3 + 0.35, bulb.position.z);
    root.add(wire);
    glow(0xffb060, 3, bulb.position.clone().add(new V3(0, -0.05, 0)), 1.4);
  }

  // ---------- drain pipes ----------
  function drainpipe(side, z, top) {
    const x = side === 'L' ? -HW + 0.13 : HW - 0.13;
    const out = side === 'L' ? 1 : -1;
    const r = 0.055;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, top - 0.35, 14), M.metal);
    pipe.position.set(x, 0.35 + (top - 0.35) / 2, z);
    root.add(pipe);
    const shoe = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 0.36, 14), M.metal);
    shoe.position.set(x + out * 0.1, 0.2, z);
    shoe.rotation.z = out * 0.75;
    root.add(shoe);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, r, 0.3, 14, 1, true), M.metal);
    funnel.position.set(x, top - 0.1, z);
    root.add(funnel);
    for (let y = 1.2; y < top - 0.5; y += 1.6) {
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), M.darkMetal);
      clamp.position.set(x - out * 0.05, y, z);
      root.add(clamp);
    }
    for (const m of [pipe, shoe, funnel]) m.castShadow = m.receiveShadow = true;
  }
  drainpipe('L', -12.05, 12.6);
  drainpipe('L', -26.95, 9.6);
  drainpipe('R', -9.05, 12.6);
  drainpipe('R', -23.95, 12.6);
  drainpipe('L', 2.4, 12.6);
  drainpipe('R', -36.2, 12.6);

  // ---------- overhead cables ----------
  function cable(a, b, sag, radius = 0.011) {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const p = a.clone().lerp(b, t);
      p.y -= sag * 4 * t * (1 - t);
      pts.push(p);
    }
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 56, radius, 5, false), M.cable);
    mesh.castShadow = true;
    root.add(mesh);
    return pts;
  }
  const cableSpecs = [
    [3.2, 7.6, 2.4, 6.9, 0.5], [1.0, 8.4, -1.5, 8.8, 0.35], [-4.0, 5.6, -3.1, 5.3, 0.42], [-7.5, 9.6, -9.6, 9.1, 0.6],
    [-11.0, 6.8, -10.0, 7.4, 0.5], [-13.8, 8.8, -15.9, 8.1, 0.4], [-20.5, 7.6, -19.0, 7.2, 0.6], [-25.0, 5.9, -26.2, 6.4, 0.5],
    [-29.5, 8.2, -31.6, 8.6, 0.55], [-33.0, 6.6, -33.4, 6.2, 0.45], [-37.4, 9.1, -36.0, 8.5, 0.6], [-41.0, 7.1, -42.3, 7.6, 0.5],
  ];
  for (const [za, ya, zb, yb, sag] of cableSpecs) {
    cable(new V3(-HW, ya, za), new V3(HW, yb, zb), sag);
    if (rand() < 0.5) cable(new V3(-HW, ya - 0.15, za + 0.2), new V3(HW, yb - 0.12, zb + 0.25), sag * 1.15, 0.008);
  }
  // cable bundles along the walls
  for (const side of ['L', 'R']) {
    const x = side === 'L' ? -HW + 0.05 : HW - 0.05;
    for (const [y, r] of [[3.32, 0.016], [3.4, 0.012]]) {
      cable(new V3(x, y, ALLEY.zStart), new V3(x, y + 0.1, ALLEY.zEnd), 0.08, r);
    }
  }

  // ---------- lights ----------
  function point(color, intensity, pos, { haze = 1, shadow = false, distance = 0 } = {}) {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.copy(pos);
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.set(512, 512);
      l.shadow.bias = -0.003;
      l.shadow.normalBias = 0.03;
      l.shadow.camera.near = 0.1;
      l.shadow.camera.far = 25;
    }
    dyn.add(l);
    if (haze) registerHaze(l, haze);
    return l;
  }
  // A cheap light for signs: glows in the fog, lights the rain and casts diffuse coloured spill.
  function glow(color, intensity, pos, haze = 1) {
    const g = new THREE.Object3D();
    g.color = new THREE.Color(color);
    g.intensity = intensity;
    g.position.copy(pos);
    dyn.add(g);
    registerHaze(g, haze);
    registerFill(g);
    return g;
  }
  function spot(color, intensity, pos, target, angle, { haze = 1, shadow = false, penumbra = 0.6 } = {}) {
    const l = new THREE.SpotLight(color, intensity, 0, angle, penumbra, 2);
    l.position.copy(pos);
    l.target.position.copy(target);
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.bias = -0.0015;
      l.shadow.normalBias = 0.03;
      l.shadow.camera.near = 0.2;
      l.shadow.camera.far = 40;
      l.shadow.camera.layers.enable(1);
    }
    dyn.add(l, l.target);
    if (haze) registerHaze(l, haze);
    return l;
  }
  const bulbMaterial = (m, color, k) => {
    m.emissive = new THREE.Color(color);
    m.emissiveIntensity = k;
    if (m.emissiveMap === null && m.map) m.emissiveMap = m.map;
  };

  // wall lamps
  function wallLamp(side, z, y, intensity, shadow, virtual = false) {
    const o = place(model('industrial_wall_lamp'), { wall: side, z, y, yAlign: 'center', rotY: toWall[side], wet: { porosity: 0.1 } });
    o.traverse((m) => m.isMesh && m.material.name.includes('glass') && bulbMaterial(m.material, WARM, 9));
    const pos = new V3(side === 'L' ? -HW + 0.22 : HW - 0.22, y - 0.05, z);
    return virtual ? glow(WARM, intensity, pos, 1.2) : point(WARM, intensity, pos, { shadow, haze: 1.2 });
  }
  wallLamp('L', -0.45, 2.55, 6, false);
  wallLamp('R', -6.35, 2.5, 5, false);
  wallLamp('L', -21.45, 2.5, 4.5, false);
  wallLamp('R', -36.4, 2.5, 4.5, false, true);

  // bracket lanterns
  function lantern(side, z, y, intensity, shadow, virtual = false) {
    const o = place(model('street_lamp_02'), { wall: side, z, y, yAlign: 'center', rotY: toWall[side], wet: { porosity: 0.1 } });
    o.traverse((m) => {
      if (!m.isMesh) return;
      if (m.material.name.includes('bulb')) bulbMaterial(m.material, 0xffc27a, 14);
    });
    const box = new THREE.Box3().setFromObject(o);
    const pos = new V3((box.min.x + box.max.x) / 2 + (side === 'L' ? 0.12 : -0.12), box.min.y + (box.max.y - box.min.y) * 0.3, z);
    if (virtual) return glow(0xffbd75, intensity, pos, 1.3);
    if (!shadow) return point(0xffbd75, intensity, pos, { haze: 1.3 });
    // a capped lantern throws its light downwards: a wide spot gives it cheap 2D shadows
    const target = new V3(pos.x + (side === 'L' ? 0.8 : -0.8), 0, z);
    return spot(0xffbd75, intensity * 1.3, pos, target, 1.25, { shadow: true, haze: 1.3, penumbra: 0.8 });
  }
  lantern('R', -3.05, 3.15, 9, true);
  lantern('R', -28.6, 3.3, 8, false, true);

  // security flood light over the double door
  {
    const o = place(nodes('security_light', ['security_light', 'security_light_glass']), { wall: 'L', z: -16.5, y: 3.45, yAlign: 'center', rotY: toWall.L, wet: { porosity: 0.1 } });
    o.traverse((m) => m.isMesh && m.material.name.includes('bulb') && bulbMaterial(m.material, 0xe8f0ff, 12));
    spot(0xdce8ff, 55, new V3(-HW + 0.32, 3.2, -16.5), new V3(-0.6, 0, -16.8), 0.78, { shadow: true, haze: 1.1, penumbra: 0.5 });
  }

  // string of bulbs across the alley
  {
    const a = new V3(-HW, 4.9, -21.2);
    const b = new V3(HW, 4.75, -23.4);
    const pts = cable(a, b, 0.55, 0.006);
    const n = 13;
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.9, 1.2) }), n);
    const curve = new THREE.CatmullRomCurve3(pts);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      dummy.position.copy(curve.getPoint((i + 0.5) / n));
      dummy.position.y -= 0.06;
      dummy.updateMatrix();
      bulbs.setMatrixAt(i, dummy.matrix);
    }
    dyn.add(bulbs);
    glow(0xffb070, 3.5, curve.getPoint(0.5).add(new V3(0, -0.2, 0)), 1.5);
  }

  // ---------- signs ----------
  const signs = [];
  // Signs never move, so they go into the static group and get merged; flicker works through their materials.
  function addSign(group, { flick = 0, light = null }) {
    root.add(group);
    signs.push({ group, flick, light, base: light ? light.intensity : 0 });
    return group;
  }
  function onWall(obj, side, z, y, out = 0.06) {
    obj.rotation.y = toWall[side];
    obj.position.set(side === 'L' ? -HW + out : HW - out, y, z);
    return obj;
  }
  function projecting(obj, side, z, y, arm) {
    const s = side === 'L' ? -1 : 1;
    obj.position.set(s * (HW - arm), y, z);
    const br = bracket(arm - 0.02, 0.3, -0.3);
    br.position.set(s * HW, y, z);
    br.rotation.y = side === 'L' ? 0 : Math.PI;
    root.add(br);
    return obj;
  }

  // P0: big mahjong sign high on the left, right by the start, washing the wall in magenta
  {
    const g = projecting(lightbox({ w: 0.8, h: 2.5, bg: ['#b0106a', '#ff2f9a'], fg: '#ffe14a', text: '麻雀', sub: 'MAHJONG', vertical: true, serif: true, intensity: 2.8, border: '#ffe14a' }), 'L', 0.3, 4.6, 0.85);
    addSign(g, { light: glow(0xff3aa0, 16, new V3(-HW + 0.9, 3.7, 0.3), 1.3) });
  }
  // P1: karaoke, magenta vertical box projecting from the left wall
  {
    const g = projecting(lightbox({ w: 0.62, h: 2.1, bg: ['#d0157e', '#ff3fae'], text: 'カラオケ', sub: 'KARAOKE', vertical: true, intensity: 2.6 }), 'L', -3.3, 3.75, 0.75);
    addSign(g, { light: glow(0xff3fb0, 4.5, new V3(-HW + 0.75, 3.75, -3.3), 1.4) });
  }
  // P2: "no entry" neon on a projecting frame, near the camera on the right
  {
    const g = neonSymbol(SYMBOLS.noEntry(0x30ff8a, 0xff3fa8), { size: 0.62, intensity: 9 });
    g.rotation.y = 0;
    addSign(projecting(g, 'R', 1.0, 3.55, 0.62), { light: glow(0x70ffb0, 3.2, new V3(HW - 0.62, 3.55, 1.25), 1.3) });
  }
  // P3: BAR + cocktail neon flat on the left wall
  {
    const bar = onWall(neonText('BAR', { height: 0.34, color: 0xff4fa8, intensity: 8 }), 'L', -4.95, 1.95);
    const glassIcon = onWall(neonSymbol(SYMBOLS.cocktail(0x5ff0ff, 0xb6ff4f), { size: 0.45, intensity: 8 }), 'L', -4.05, 1.97);
    const l = glow(0xff70c0, 2.6, new V3(-HW + 0.45, 1.95, -4.5), 1.2);
    addSign(bar, { light: l });
    addSign(glassIcon, {});
  }
  // P4: yakitori lightbox above the lit shop window
  {
    const g = onWall(lightbox({ w: 2.4, h: 0.5, d: 0.12, bg: ['#f3ead6', '#fff8ea'], fg: '#b3131b', text: 'やきとり 鳥八', serif: true, intensity: 2.0, border: '#b3131b' }), 'L', -7.5, 2.62, 0.08);
    addSign(g, { light: glow(0xffa860, 6, new V3(-HW + 0.6, 1.7, -7.5), 1.0) });
  }
  // P5: green izakaya sign on the right
  {
    const g = projecting(lightbox({ w: 0.58, h: 1.9, bg: ['#0c7a3a', '#1fc463'], text: '居酒屋', sub: 'IZAKAYA', vertical: true, serif: true, intensity: 2.4 }), 'R', -9.25, 3.7, 0.72);
    addSign(g, { light: glow(0x40ff80, 3.2, new V3(HW - 0.72, 3.7, -9.25), 1.3) });
  }
  // P6: small yellow coffee sign, flickering
  {
    const g = projecting(lightbox({ w: 0.46, h: 0.9, bg: ['#e8b400', '#ffd84a'], fg: '#2a1a00', text: '喫茶', vertical: true, intensity: 2.2, border: '#2a1a00' }), 'L', -12.2, 2.45, 0.6);
    addSign(g, { flick: 1.3, light: glow(0xffcf40, 2.2, new V3(-HW + 0.6, 2.45, -12.2), 1.2) });
  }
  // P7: HOTEL lightbox hung across the alley
  {
    const g = lightbox({ w: 3.0, h: 0.62, bg: ['#0e1e5c', '#2546b8'], fg: '#e8f2ff', text: 'HOTEL ホテル', sub: '空室あり · VACANCY', intensity: 2.3, border: '#9fd0ff' });
    g.position.set(0, 5.6, -17.6);
    addSign(g, { light: glow(0x8fb0ff, 5, new V3(0, 5.1, -17.4), 1.3) });
    cable(new V3(-HW, 6.8, -17.6), new V3(-1.3, 5.95, -17.6), 0.02, 0.008);
    cable(new V3(HW, 6.8, -17.6), new V3(1.3, 5.95, -17.6), 0.02, 0.008);
  }
  // P8: OPEN neon inside the right shop window
  {
    const g = neonText('OPEN', { height: 0.22, color: [0xff2a2a, 0xff2a2a, 0xff2a2a, 0xff2a2a], intensity: 9, radius: 0.008, backing: false });
    g.rotation.y = toWall.R;
    g.position.set(HW + 0.28, 1.5, -19.5);
    addSign(g, { flick: 0.4, light: glow(0xff3030, 1.5, new V3(HW - 0.3, 1.5, -19.5), 1) });
  }
  // P9: ramen neon above the left shop window further down
  {
    const g = onWall(neonText('ラーメン', { height: 0.36, color: [0xffa21a, 0xff5a1a, 0xffa21a, 0xff5a1a], intensity: 8, spacing: 0.08 }), 'L', -28.5, 2.66);
    addSign(g, { light: glow(0xff8a30, 3.2, new V3(-HW + 0.6, 2.4, -28.5), 1.2) });
  }
  // P10: purple snack bar sign on the right
  {
    const g = projecting(lightbox({ w: 0.56, h: 1.6, bg: ['#5a1a9a', '#9a3ae8'], text: 'スナック蘭', vertical: true, intensity: 2.4 }), 'R', -32.9, 3.6, 0.7);
    addSign(g, { light: glow(0xb060ff, 3, new V3(HW - 0.7, 3.6, -32.9), 1.3) });
  }
  // P11: small blue BAR neon projecting, flickering
  {
    const g = neonText('BAR', { height: 0.26, color: 0x3fb8ff, intensity: 8, radius: 0.009 });
    addSign(projecting(g, 'L', -37.6, 3.1, 0.55), { flick: 2.1, light: glow(0x50b0ff, 2, new V3(-HW + 0.55, 3.1, -37.6), 1.2) });
  }

  // ---------- vending machine ----------
  {
    const W = 1.0, H = 1.83, D = 0.72;
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 732;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f6f8';
    g.fillRect(0, 0, 400, 732);
    g.fillStyle = '#d8232a';
    g.fillRect(0, 0, 400, 70);
    g.fillStyle = '#fff';
    g.font = 'bold 40px "Hiragino Sans", sans-serif';
    g.textAlign = 'center';
    g.fillText('つめた〜い', 200, 50);
    const drinks = ['#1f63c6', '#e8e8e8', '#d8232a', '#2a8a3a', '#f0b400', '#6b3a1e', '#ff7a1a', '#1aa3b8'];
    for (let row = 0; row < 4; row++) {
      const y0 = 90 + row * 105;
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(14, y0 + 78, 372, 18);
      for (let k = 0; k < 6; k++) {
        const x = 30 + k * 60;
        g.fillStyle = drinks[(row * 3 + k * 5) % drinks.length];
        g.fillRect(x, y0 + 10, 36, 62);
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.fillRect(x + 5, y0 + 14, 6, 52);
        g.fillStyle = '#c9ccd2';
        g.fillRect(x - 2, y0 + 2, 40, 9);
        g.fillStyle = k % 3 ? '#2ad16a' : '#ff3b30';
        g.fillRect(x + 8, y0 + 82, 20, 8);
      }
    }
    g.fillStyle = '#20232a';
    g.fillRect(40, 520, 200, 40);
    g.fillStyle = '#7ff7ff';
    g.font = 'bold 26px monospace';
    g.fillText('¥ 130', 140, 548);
    g.fillStyle = '#1a1c20';
    g.fillRect(40, 600, 320, 90);
    g.fillStyle = '#3a3d44';
    g.fillRect(270, 512, 70, 60);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wetify(new THREE.MeshStandardMaterial({ color: 0xc81e26, roughness: 0.35, metalness: 0.4 }), { porosity: 0, gloss: 0.5 }));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, H * 0.93), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.85, 0.85, 0.9) }));
    const vm = new THREE.Group();
    body.position.y = H / 2;
    front.position.set(0, H / 2, D / 2 + 0.003);
    body.castShadow = body.receiveShadow = true;
    vm.add(body, front);
    vm.rotation.y = toWall.R;
    vm.position.set(HW - D / 2 - 0.05, 0, -27.6);
    root.add(vm);
    glow(0xe6efff, 3, new V3(HW - D - 0.45, 1.1, -27.6), 0.6);
  }

  // ---------- the cross street at the end ----------
  {
    // big neon on the building opposite the alley, like the glowing sign at the end of the reference
    const lin = neonText('リン', { height: 1.1, color: [0xff4fd8, 0x4fd8ff], intensity: 10, radius: 0.022, spacing: 0.1 });
    lin.position.set(0.4, 6.6, ALLEY.endZ + 0.12);
    addSign(lin, { light: glow(0xd070ff, 14, new V3(0.4, 6.4, ALLEY.endZ + 0.9), 1.6) });
    const store = lightbox({ w: 2.6, h: 0.55, bg: ['#f2f6f2', '#ffffff'], fg: '#0b8a3c', text: 'コンビニ 24H', intensity: 2.6, border: '#2a6fd8' });
    store.position.set(-4.5, 3.45, ALLEY.endZ + 0.12);
    addSign(store, {});
    const sushi = lightbox({ w: 0.6, h: 1.8, bg: ['#a8141a', '#e0262c'], text: '寿司', sub: 'SUSHI', vertical: true, serif: true, intensity: 2.4 });
    sushi.position.set(4.6, 4.2, ALLEY.endZ + 0.55);
    sushi.rotation.y = Math.PI / 2;
    addSign(sushi, {});
    // street light with a visible cone in the rain
    const poleX = -3.9, poleZ = ALLEY.zEnd - 2.4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6.6, 12), M.darkMetal);
    pole.position.set(poleX, 3.3, poleZ);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.1), M.darkMetal);
    arm.position.set(poleX + 0.7, 6.5, poleZ);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.3), M.darkMetal);
    head.position.set(poleX + 1.35, 6.42, poleZ);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8, 6.5) }));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(poleX + 1.35, 6.34, poleZ);
    for (const m of [pole, arm, head]) m.castShadow = true;
    root.add(pole, arm, head);
    dyn.add(lens);
    spot(0xfff0d8, 260, new V3(poleX + 1.35, 6.3, poleZ), new V3(poleX + 1.6, 0, poleZ + 0.3), 0.62, { shadow: true, haze: 1.5, penumbra: 0.55 });
    // bright, hazy glow of the street beyond
    point(0xc4d2ff, 13, new V3(1.5, 4.5, ALLEY.endZ + 3), { haze: 2.4 });
    // curbs
    for (const z of [ALLEY.zEnd - 1.6, ALLEY.endZ + 1.6]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(80, 0.14, 0.22), M.curb);
      curb.position.set(0, 0.07, z);
      curb.receiveShadow = true;
      root.add(curb);
    }
  }

  // ---------- a car passing along the cross street now and then ----------
  {
    const car = new THREE.Group();
    car.userData.dynamic = true;
    const paint = wetify(new THREE.MeshStandardMaterial({ color: 0x1a1e27, metalness: 0.7, roughness: 0.22 }), { porosity: 0, gloss: 0.5 });
    // side profile of a small sedan, extruded across its width with rounded (bevelled) edges
    const profile = new THREE.Shape()
      .moveTo(-2.16, 0.3)
      .lineTo(-2.24, 0.52)
      .lineTo(-2.2, 0.84)
      .quadraticCurveTo(-2.0, 0.93, -1.7, 0.94)
      .lineTo(-1.22, 0.96)
      .quadraticCurveTo(-0.95, 1.3, -0.62, 1.4)
      .lineTo(0.3, 1.42)
      .quadraticCurveTo(0.6, 1.36, 1.02, 1.0)
      .quadraticCurveTo(1.6, 0.92, 2.0, 0.86)
      .quadraticCurveTo(2.24, 0.8, 2.26, 0.62)
      .lineTo(2.2, 0.32)
      .lineTo(1.78, 0.3)
      .quadraticCurveTo(1.35, 0.78, 0.92, 0.3)
      .lineTo(-0.92, 0.3)
      .quadraticCurveTo(-1.35, 0.78, -1.78, 0.3)
      .closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(profile, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 4, curveSegments: 10 });
    bodyGeo.translate(0, 0, -0.81);
    const body = new THREE.Mesh(bodyGeo, paint);
    const greenhouse = new THREE.Shape()
      .moveTo(-1.12, 0.99)
      .quadraticCurveTo(-0.9, 1.27, -0.6, 1.35)
      .lineTo(0.28, 1.37)
      .quadraticCurveTo(0.55, 1.31, 0.93, 1.01)
      .closePath();
    const glassGeo = new THREE.ExtrudeGeometry(greenhouse, { depth: 1.8, bevelEnabled: false, curveSegments: 8 });
    glassGeo.translate(0, 0, -0.9);
    const carGlass = new THREE.MeshStandardMaterial({ color: 0x06080c, roughness: 0.04, metalness: 0.3, envMapIntensity: 1.5 });
    const windows = new THREE.Mesh(glassGeo, carGlass);
    // door seams and pillars in black
    const trim = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.5 });
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 1.82), trim);
    pillar.position.set(-0.12, 1.18, 0);
    pillar.rotation.z = 0.12;
    car.add(body, windows, pillar);
    const tire = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.55 });
    const rim = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 });
    for (const [x, z] of [[1.35, 0.8], [1.35, -0.8], [-1.35, 0.8], [-1.35, -0.8]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 24), tire);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.33, z);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.225, 16), rim);
      r.rotation.x = Math.PI / 2;
      r.position.copy(w.position);
      car.add(w, r);
    }
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(12, 11, 9) });
    const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2) });
    for (const z of [0.58, -0.58]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.34), headMat);
      h.position.set(2.27, 0.7, z);
      h.rotation.z = -0.3;
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.36), tailMat);
      t.position.set(-2.24, 0.78, z);
      car.add(h, t);
    }
    dyn.add(car);
    const carLight = spot(0xfff1dc, 0, new V3(), new V3(), 0.42, { haze: 1.0, penumbra: 0.55 });
    const tailLight = glow(0xff2010, 0, new V3(), 1.0);
    const PERIOD = 15;
    updaters.push((dt, t) => {
      const cycle = Math.floor(t / PERIOD);
      const dir = cycle % 2 ? -1 : 1;
      const p = (t % PERIOD) / 9; // seconds 0..9 crossing, then pause
      const x = dir * (-38 + p * 76);
      const z = dir > 0 ? -51.2 : -49.4;
      const active = p <= 1;
      car.visible = active;
      car.position.set(x, 0, z);
      car.rotation.y = dir > 0 ? 0 : Math.PI;
      const fade = active ? THREE.MathUtils.smoothstep(38 - Math.abs(x), 0, 12) : 0;
      carLight.intensity = 70 * fade;
      carLight.position.set(x + dir * 2.35, 0.72, z);
      carLight.target.position.set(x + dir * 14, 0.1, z);
      tailLight.intensity = 3 * fade;
      tailLight.position.set(x - dir * 2.4, 0.8, z);
    });
  }

  // ---------- sky and distant skyline ----------
  const skyUniforms = { uTime: { value: 0 } };
  {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(320, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: skyUniforms,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec3 vDir;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
          }
          float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; } return v; }
          void main() {
            vec3 d = normalize(vDir);
            float h = max(d.y, 0.0);
            vec3 horizon = vec3(0.1, 0.05, 0.12);
            vec3 zenith = vec3(0.012, 0.012, 0.03);
            vec3 col = mix(horizon, zenith, pow(smoothstep(0.0, 0.75, h), 0.6));
            vec2 uv = d.xz / max(d.y, 0.08) * 0.35 + vec2(uTime * 0.006, uTime * 0.003);
            float c = fbm(uv * 1.6);
            col += vec3(0.16, 0.08, 0.17) * smoothstep(0.42, 0.85, c) * (1.0 - smoothstep(0.1, 0.9, h)) * 0.8;
            col += vec3(0.05, 0.04, 0.07) * smoothstep(0.5, 0.9, c) * h;
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    sky.renderOrder = -10;
    sky.userData.dynamic = true;
    dyn.add(sky);

    // a skyline far beyond the cross street, mostly dissolved in the haze
    const wc = document.createElement('canvas');
    wc.width = 128;
    wc.height = 256;
    const g = wc.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 16; x++) {
        if (rand() < 0.36) {
          g.fillStyle = pick(['#ffd9a0', '#ffe8c4', '#cfe4ff', '#ffc070']);
          g.globalAlpha = 0.5 + rand() * 0.5;
          g.fillRect(x * 8 + 2, y * 8 + 2, 4, 5);
        }
      }
    }
    g.globalAlpha = 1;
    const wtex = new THREE.CanvasTexture(wc);
    wtex.colorSpace = THREE.SRGBColorSpace;
    wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping;
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.6, emissive: 0xffffff, emissiveMap: wtex, emissiveIntensity: 1.4 });
    for (let i = 0; i < 26; i++) {
      const w = rr(14, 30), d = rr(14, 30), h = rr(40, 140);
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) {
        const face = Math.floor(k / 4);
        const span = face < 2 ? d : w;
        uv.setXY(k, uv.getX(k) * span / 16 + Math.floor(rand() * 8) / 8, face === 2 || face === 3 ? 0 : uv.getY(k) * h / 32);
      }
      const m = new THREE.Mesh(geo, towerMat);
      m.position.set(rr(-140, 140), h / 2, rr(-170, -320));
      root.add(m);
    }
  }

  // ---------- per-frame updates ----------
  updaters.push((dt, t) => {
    skyUniforms.uTime.value = t;
    for (const s of signs) {
      if (!s.flick) continue;
      const b = flicker(t, s.flick);
      setSignBrightness(s.group, b);
      if (s.light) s.light.intensity = s.base * b;
    }
  });

  // Glass gets an additive reflection layer once the windows have been merged into one mesh.
  function afterBatch() {
    const add = [];
    root.traverse((o) => {
      if (o.isMesh && o.material === glass) add.push(o);
    });
    for (const o of add) {
      const sheen = new THREE.Mesh(o.geometry, glassSheen);
      sheen.matrixAutoUpdate = false;
      sheen.matrix.copy(o.matrix);
      sheen.renderOrder = 2;
      o.parent.add(sheen);
    }
  }

  return {
    root,
    dynamic: dyn,
    afterBatch,
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
  };
}
