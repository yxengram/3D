// housekit.js — the shared small-building kit for the v3 ring (west, north, east, south). Same language as town.js: S-tile roofs that sag,
// timber lines on pale plaster, lapped cedar, lattice shutters, painted boards from one atlas. Every part of a whole module merges into 8 meshes.
//
//   import { createHouseKit } from '../core/housekit.js';
//   const H = createHouseKit(ctx, { name: 'west', seed: 'west' });
//   for (const b of layout.BUILDINGS.filter((b) => b.o === 'west')) {
//     const h = H.build(b, { /* optional overrides, see below */ });
//     h.front.box(-0.2, 0.2, 1.2, 1.5, 0, 0.1, 'wood', '#6e5038');          // details in the building's own frame, merged into the same meshes
//   }
//   const { meshes, tris } = H.finish(group);                                // adds the meshes to group. castShadow on, group.userData.houseKit has per-building tris.
//
// FRAME. A building's local frame has its origin at the centre of its footprint at elev. +z is the front, x runs along w, z along d, y up. It maps to the world by b.x, b.z, b.elev, b.yaw.
// The walls fill the footprint exactly. Only eaves, pent roofs and props go past it (keep rows at es ≤ 0.08: w01/w02 are 0.2 apart).
//
// H.build(b, opts) returns h, with:
//   h.S                 Stage at the local frame (see Stage below)
//   h.front/right/back/left   Stage on each outer wall face: x along the wall (seen from outside, left to right), y up from elev, +z out of the wall, z=0 the wall face
//   h.dims              { w, d, h, fl, f2, eaveY }  floor height, upper-floor height (0 = single storey), wall top
//   h.spec              the resolved spec.   h.rng  this building's own generator.   h.openings  { front:[…], … } after collapse removed some
//   h.pivot             only for watermill: { x,y,z world, r } so a district can rebuild the wheel as an animated Group with opts.wheel=false
//   h.porchSign(cell,w,h) stands a name board on the porch's front beam (the same place a sign in the building's spec goes on a porch building). Any H.props.sign on a wall stage is tested against that building's eaves and moved below or forward of them.
//   Greenery in that same frame: h.ivy(side, cover, {u0,u1}), h.bush(x,z,r), h.sapling(x,y,z,height), h.grass(x,z,r,n), h.clump([x,y,z],rx,ry,n), h.rubble(x,z,rx,rz,n)
//   Props on a wall stage or h.S: H.props.ac(st), .meter(st), .gas(st), .box(st), .drain(st,x,y0,y1), .pots(st,x), .dryPole(st), .crates(st), .ladder(st,h), .sign(st,cell,w,h,{pos,rot}), .noren(st,x0,x1,y,cell)
// H.local(b) is the same Stage without building anything.  H.world is a Stage at world coordinates.  H.rand(b.id) a per-building generator independent of build order.
//
// Stage: s.box(x0,x1,y0,y1,z0,z1,mat,color), s.beam(a,b,w,h,mat,color), s.rod(a,b,r,mat,color,seg,r2), s.quad(a,b,c,d,mat,color), s.tube(pts,r0,r1,mat,color), s.add(geometry,mat,{pos,rot,scale,color}),
//        s.vbar/s.hbar (a box without its unseen faces: 6 tris), s.sub({pos,rot}), s.w([x,y,z]) to world.
// Materials are names, and they all merge into the fixed 8 meshes: 'wood' 'plaster' 'mortar' 'brick' 'tile' 'concrete' 'namako' 'worn' (rusting paint) 'roof' 'flat' (plain colour)
// 'glass' 'atlas' (uv already in the atlas: use H.atlas.quad(w,h,cell) or H.atlas.uvTo(geo,cell)). 'concreteClean' 'rust' 'soil' 'asphalt' 'mossy' are aliases that map onto these.
// A THREE.Material is refused on purpose: anything unusual is yours to build in your module's own batch.
//
// opts (every field optional; omitted fields come from the kind's defaults plus the building's seeded variety):
//   wall 'board'|'boardv'|'plaster'|'mortar'|'brick'|'tile'|'concrete'|'tinsheet'    wallCol '#…'    sides { back:'tinsheet', … } per-side wall
//   band { type:'board'|'tile'|'namako'|'brick'|'mortar', h, col } the lower material band, or null        timbers true|false: dark post-and-rail lines on plaster/mortar
//   roof 'kawara'|'tin'|'thatch'|'flat'|'sawtooth'    shape 'gable'|'hip'|'mono'    ridge 'x'|'z'    pitch    eaveY    es, ef, eb (side, front, back overhang)    tints [4 colours]    detail 'hi'|'lo'
//   open { front:[…], right:[…], back:[…], left:[…] }: openings { t, x0, x1, y0, y1, noren?, curtain? } with t 'sliding'|'lattice'|'shop'|'roll'|'sash'|'broken'|'boarded'|'mushiko'|'shoji'|'door'|'bars'|'bigdoor'
//   hisashi true|false|{ y, out }    falseFront true|height    sign { cell, w, h, y }    vsign cell    noren cell    balcony true    party ['left','right'] walls that touch a neighbour: no vines, props or windows there
//   props ['ac','meter','gas','box','drain','pots','dry','crates'] replaces the seeded choice    wheel false (watermill)
//   pads false: no moss patches and no leaf tufts on this roof (thatch never has patches; it keeps its own leaves and moss).
//   decay { level 0..1, sag, holes (count or [{slope:'front'|'back'|'left'|'right',u,v,ru,rv}]), extraHoles (same array form, added to whatever holes rolled), collapse (false | { corner:'fr'|'fl'|'br'|'bl', r }; thatch and sawtooth trade it for extra holes and sag), vines [{side,cover}], moss 0..1, saplings n, grass 0..1, bushes n }
//
// Decay levels are spread by a golden-ratio walk in build order, so a run of buildings always runs from intact-but-abandoned to half collapsed without clumping.
// "Moss on the north slope" is applied on the slope facing away from the sun, from SUN_DIR. In this scene the sun is at -z, so that is the +z-facing slope.
// The moss creep in ctx.toon is keyed to world y≈0.5, so wall base damp and moss is painted here, relative to each building's elev (shrine and pavilion sit at 2.4).
//
// Signs: H.atlas.cells lists every cell name. Boards h01–h12 (shop names), named boards (inn, clinic, post, hall, works, ware, school, gas, boat, mill, farm, shrine), v1–v8 upright boards, n1–n8 noren, ad1–ad4, graffiti, clock, mark, pump.
// H.nextSign() H.nextVSign() H.nextNoren() deal from a per-kit shuffled deck so no two neighbours share a shop name.
// H.density (default 0.88) scales every leaf and grass count; set it before H.build if a district runs short of budget.
// H.atlas.paint(name, w, h, (g,w,h,tools)=>{…}) adds your own cell to the shared atlas during build (before the first frame).
//
// Draw calls: wood, wall, roof, worn, atlas, glass, leaves, grass = 8 at most, however many buildings. Everything here is static; add wind yourself with your own Groups if a detail deserves it.
import * as THREE from 'three';

const V3 = THREE.Vector3, M4 = THREE.Matrix4;
const v = (p) => (p instanceof V3 ? p.clone() : new V3(p[0], p[1], p[2]));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const Q = Math.PI / 2, TAU = Math.PI * 2;
const FONT = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';
const SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif CJK JP",' + FONT;
const WHITE = [1, 1, 1];
const _rgb = new Map();
const rgb = (c) => {
  if (c == null) return WHITE; if (Array.isArray(c)) return c; if (c.isColor) return [c.r, c.g, c.b];
  let r = _rgb.get(c); if (!r) { const k = new THREE.Color(c); r = [k.r, k.g, k.b]; _rgb.set(c, r); } return r;
};
const shade = (c, m) => { const a = rgb(c); return [a[0] * m, a[1] * m, a[2] * m]; };

/* ------------------------------------------------------------------ shared atlas, one per page ---------------------- */
const AS = 2048, GUTTER = 6;
/** Skyline packer for the shared atlas. Every cell, the kit's own and the districts' paint() cells, goes through here, so no two can overlap and none can run off the 2048 page. */
function skylinePacker() {
  const placed = []; let sky = [{ x: 0, y: 0, w: AS }];
  const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  return {
    extent: () => placed.reduce((m, c) => Math.max(m, c[1] + c[3]), 0), count: () => placed.length,
    place(name, w0, h0) {
      if (w0 > AS || h0 > AS) throw new Error(`housekit atlas: cell "${name}" (${w0}×${h0}) is larger than the ${AS} page`);
      const w = w0 + GUTTER, h = h0 + GUTTER; let bestY = Infinity, bestX = 0, bestI = -1; // gutter is on the far sides only, so the last row may touch the page edge
      for (let i = 0; i < sky.length; i++) {
        if (sky[i].x + w0 > AS) continue;
        let y = 0, need = w0, j = i; while (need > 0 && j < sky.length) { y = Math.max(y, sky[j].y); need -= sky[j].w; j++; }
        if (need > 0 || y + h0 > AS) continue;
        if (y < bestY || (y === bestY && sky[i].x < bestX)) { bestY = y; bestX = sky[i].x; bestI = i; }
      }
      if (bestI < 0) throw new Error(`housekit atlas: no room for "${name}" (${w0}×${h0}): the ${AS} page is full after ${placed.length} cells`);
      const cell = [bestX, bestY, w0, h0];
      for (const c of placed) if (hit(cell, c)) throw new Error(`housekit atlas: "${name}" overlaps another cell`);
      placed.push(cell);
      // raise the skyline over [bestX, bestX + w)
      const out = [], x1 = bestX + w;
      for (const sg of sky) { const end = sg.x + sg.w; if (end <= bestX || sg.x >= x1) { out.push(sg); continue; } if (sg.x < bestX) out.push({ x: sg.x, y: sg.y, w: bestX - sg.x }); if (end > x1) out.push({ x: x1, y: sg.y, w: end - x1 }); }
      out.push({ x: bestX, y: bestY + h, w }); out.sort((a, b) => a.x - b.x);
      sky = out.reduce((m, sg) => { const l = m[m.length - 1]; if (l && l.y === sg.y && l.x + l.w === sg.x) l.w += sg.w; else m.push({ ...sg }); return m; }, []);
      return cell;
    },
  };
}
function buildAtlas(ctx) {
  const R = {}, rr = ctx.seeded('housekit-atlas'), packer = skylinePacker();
  let G;
  const tools = (g) => ({
    wash: (w, h, a = 0.2, c = '#f3ecd9') => { g.fillStyle = c; g.globalAlpha = a; g.fillRect(0, 0, w, h); g.globalAlpha = 1; },
    blot: (w, h, n, cols, r0, r1, a) => { for (let i = 0; i < n; i++) { g.fillStyle = rr.pick(cols); g.globalAlpha = a * (0.5 + rr() * 0.5); g.beginPath(); g.ellipse(rr() * w, rr() * h, rr.range(r0, r1), rr.range(r0, r1) * 0.7, rr() * 3, 0, 6.3); g.fill(); } g.globalAlpha = 1; },
    text: (s, x, y, size, col, { font = FONT, weight = 800, align = 'center', vertical = false, gap = 1.08 } = {}) => { g.font = `${weight} ${size}px ${font}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; if (vertical) [...s].forEach((c, i) => g.fillText(c, x, y + i * size * gap)); else g.fillText(s, x, y); },
    grain: (w, h, c, n = 14) => { g.strokeStyle = c; for (let i = 0; i < n; i++) { const y = rr() * h; g.lineWidth = rr.range(1, 2.4); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rr.range(-6, 6), w * 0.6, y + rr.range(-6, 6), w, y); g.stroke(); } },
    SERIF, FONT, rr,
  });
  const drawCell = (g, name, draw) => { const [x, y, w, h] = R[name]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h, tools(g)); g.restore(); };
  // Cells are declared first and packed tallest-first, then drawn in declaration order, so the paint (and its random blots) doesn't depend on where a cell lands.
  const tex = ctx.canvasTexture(AS, AS, (g) => {
    G = g;
    const decl = [], reg = (_, name, w, h, draw) => decl.push({ name, w, h, draw });
    reg(g, 'white', 16, 16, (w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); });
    // shop boards. Every name invented.
    const board = (name, label, style, size = 76) => reg(g, name, 512, 120, (w, h, T) => {
      const [bg, ink, trim] = style;
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      if (style[3] === 'wood') { T.grain(w, h, 'rgba(50,34,26,.5)', 14); g.strokeStyle = trim; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, h - 16); }
      else { g.fillStyle = trim; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); }
      T.text(label, w / 2, h / 2 + 3, size, ink, { font: SERIF, weight: 900 });
      T.blot(w, h, 10, [bg, '#8b6a4c'], 3, 20, 0.6); T.blot(w, h, 5, ['#b5522f'], 2, 7, 0.5); T.wash(w, h, 0.12);
    });
    const W_ = ['#74523a', '#efe3c4', '#c4a26a', 'wood'], W2 = ['#5e4634', '#e7d9a8', '#a98a58', 'wood'], CR = ['#e6dfca', '#3f6a84', '#4e7f9b'], TL = ['#3b8088', '#f2ecd6', '#e0c25a'], RD = ['#b5493f', '#f6eeda', '#e0c25a'], MU = ['#dcbb66', '#5a4632', '#b5493f'], GN = ['#e4e4cc', '#3f7a60', '#6fae8a'], BL = ['#5f8fb0', '#f4efdc', '#efe4c4'];
    const HB = [['かどや金物店', W_, 72], ['ほたる書房', CR, 80], ['喫茶こもれび', TL, 70], ['八千代米穀店', W2, 72], ['つばめ洋品店', RD, 72], ['大福堂菓子舗', MU, 72], ['みのり青果', GN, 84], ['丸三酒店', W_, 90], ['あおば文具', BL, 82], ['松葉薬局', CR, 88], ['ひばり時計店', W2, 72], ['満月食堂', RD, 88]];
    HB.forEach(([l, s, z], i) => board('h' + String(i + 1).padStart(2, '0'), l, s, z));
    const NB = [['inn', 'すみれ旅館', W2], ['clinic', '緑町診療所', CR], ['post', '緑町郵便局', RD], ['hall', '緑町公民館', W_], ['works', '東雲製作所', TL], ['ware', '第二倉庫', BL], ['school', '緑ヶ丘小学校', W2], ['gas', 'ミドリ石油', RD], ['boat', '舟宿かわせみ', W_], ['mill', '田中精米所', W2], ['farm', '農事組合', GN], ['shrine', '緑乃社', W2]];
    NB.forEach(([n, l, s]) => board(n, l, s, 72));
    // upright boards
    const VB = [['酒', 'たばこ', '#efe4c4', '#b5493f', '#3a5560'], ['米', '八千代', '#6a4c38', '#e7d9a8', '#e7d9a8'], ['薬', '松葉堂', '#3b8088', '#f2ecd6', '#f2ecd6'], ['宿', 'すみれ', '#efe4c4', '#3f6a84', '#3f6a84'], ['菓', '大福堂', '#b5493f', '#f6eeda', '#f6eeda'], ['茶', '小春園', '#e4e4cc', '#3f7a60', '#3f7a60'], ['湯', '千鳥', '#5f8fb0', '#f4efdc', '#f4efdc'], ['本', 'ほたる', '#dcbb66', '#5a4632', '#5a4632']];
    VB.forEach(([k, n, bg, ink1, ink2], i) => reg(g, 'v' + (i + 1), 112, 400, (w, h, T) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = ink1; g.fillRect(0, 0, w, 16); T.text(k, w / 2, 76, 86, ink1, { font: SERIF, weight: 900 }); T.text(n, w / 2, 180, 62, ink2, { font: SERIF, weight: 900, vertical: true, gap: 1.06 }); T.blot(w, h, 12, ['#b5522f', '#7d3a2a'], 2, 11, 0.5); T.wash(w, h, 0.14); }));
    // noren
    const NR = [['#3d5f7e', '#f0e9d6', 'そば'], ['#a84a44', '#f4ecd8', 'ゆ'], ['#7f4a60', '#f0e4d0', '小春'], ['#3f6a58', '#efe6d0', 'お茶'], ['#5a4a3e', '#efe6d0', '呉服'], ['#b47a36', '#3a3026', 'めし'], ['#3f7f88', '#f0e9d6', '酒'], ['#6c5f8a', '#f0e9d6', '宿']];
    NR.forEach(([bg, ink, l], i) => reg(g, 'n' + (i + 1), 256, 128, (w, h, T) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, w, 12); T.text(l, w / 2, h / 2 + 2, 78, ink, { font: SERIF, weight: 900 }); T.blot(w, h, 12, [bg, '#efe6d0'], 4, 16, 0.3); for (let k = 1; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect((k * w) / 4 - 1, 0, 2, h); } }));
    // what stands behind glass: shelves of goods
    for (let n = 0; n < 3; n++) reg(g, 'goods' + n, 512, 128, (w, h, T) => {
      g.fillStyle = '#51484a'; g.fillRect(0, 0, w, h);
      const pal = [['#c8604f', '#e0c25a', '#6fb0ba', '#efe9d6', '#7fae7a'], ['#d9a95a', '#b5493f', '#efe9d6', '#7a5a42', '#6f9fb0'], ['#7fae7a', '#e9dcb0', '#c98a5a', '#5f8fb0', '#efe9d6']][n];
      for (let x = 6; x < w - 8;) { const bw = rr.range(14, 40), bh = rr.range(50, 112); g.fillStyle = rr.pick(pal); g.fillRect(x, h - bh, bw, bh); g.fillStyle = 'rgba(240,235,215,.6)'; g.fillRect(x + 3, h - bh * 0.7, bw - 6, bh * 0.28); x += bw + rr.range(2, 8); }
      T.blot(w, h, 10, ['#6a5f58', '#a89a70'], 6, 22, 0.4);
    });
    reg(g, 'shoji', 128, 128, (w, h, T) => { g.fillStyle = '#ece4cc'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a58c68'; g.lineWidth = 3; for (let i = 0; i <= 3; i++) { g.beginPath(); g.moveTo((i * w) / 3, 0); g.lineTo((i * w) / 3, h); g.stroke(); } for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, (i * h) / 4); g.lineTo(w, (i * h) / 4); g.stroke(); } T.blot(w, h, 6, ['#c9b98f', '#a89a70'], 6, 22, 0.32); });
    reg(g, 'curtain', 128, 128, (w, h, T) => { g.fillStyle = '#d6c79f'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(150,100,74,.34)'; for (let i = 0; i < 6; i++) g.fillRect(i * 24 + 6, 0, 8, h); T.blot(w, h, 6, ['#a89a70'], 6, 22, 0.3); });
    reg(g, 'curtain2', 128, 128, (w, h, T) => { g.fillStyle = '#9fbcb2'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(240,235,215,.36)'; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { g.beginPath(); g.arc(12 + x * 22 + (y % 2) * 11, 12 + y * 22, 5, 0, 6.3); g.fill(); } T.blot(w, h, 5, ['#7e9a8e'], 6, 20, 0.3); });
    reg(g, 'tatami', 256, 128, (w, h, T) => { g.fillStyle = '#c9c07e'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(130,126,70,.32)'; g.lineWidth = 1.4; for (let y = 3; y < h; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.fillStyle = '#3f6a58'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); T.blot(w, h, 10, ['#8fa058', '#a39a5c', '#6f8a4e'], 8, 34, 0.32); });
    const cloth = (n, draw) => reg(g, n, 128, 128, draw);
    cloth('sheet', (w, h, T) => { g.fillStyle = '#efe9d9'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(160,190,176,.22)'; for (let i = 0; i < 4; i++) g.fillRect(0, 12 + i * 30, w, 12); T.blot(w, h, 8, ['#cbb98c', '#a8b58a'], 6, 24, 0.3); });
    cloth('futon', (w, h, T) => { g.fillStyle = '#b5574a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(240,214,180,.55)'; g.lineWidth = 2; for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const cx = 12 + x * 26 + (y % 2) * 13, cy = 12 + y * 26; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * 1.047; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10); } g.stroke(); } T.blot(w, h, 8, ['#8f4a44', '#a89a70'], 6, 20, 0.3); });
    cloth('stripe', (w, h, T) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#efe4c8' : '#c9734f'; g.fillRect((i * w) / 8, 0, w / 8 + 1, h); } T.blot(w, h, 10, ['#a89a70', '#8f6a4c'], 6, 22, 0.32); });
    cloth('stripe2', (w, h, T) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e8e4d0' : '#4e8a90'; g.fillRect((i * w) / 8, 0, w / 8 + 1, h); } T.blot(w, h, 10, ['#a89a70', '#6e8a80'], 6, 22, 0.32); });
    // tin enamel ads, posters, a chalk scrawl
    const ad = (n, bg, l1, l2, ink) => reg(g, n, 96, 176, (w, h, T) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(5, 5, w - 10, h - 10); T.text(l1, w / 2, 34, 28, ink, { font: SERIF, weight: 900, vertical: true, gap: 1.02 }); T.text(l2, w / 2, 140, 16, ink, { weight: 700 }); T.blot(w, h, 18, ['#b5522f', '#7d3a2a'], 2, 11, 0.6); });
    ad('ad1', '#e7d9a8', 'みどり牛乳', '', '#3f7a60'); ad('ad2', '#3f6a84', '仁丹堂', '', '#f4efdc'); ad('ad3', '#b5493f', '金鳥印', '', '#f6eeda'); ad('ad4', '#efe4c4', '福助足袋店', '', '#b5493f');
    reg(g, 'graffiti', 256, 128, (w, h, T) => { g.fillStyle = '#a8b4b4'; g.fillRect(0, 0, w, h); T.text('また明日', w / 2, 56, 58, '#e8e0c8', { font: SERIF, weight: 900 }); g.strokeStyle = '#d88a6a'; g.lineWidth = 5; g.beginPath(); g.moveTo(26, 104); g.bezierCurveTo(70, 80, 170, 122, 232, 96); g.stroke(); });
    reg(g, 'clock', 128, 128, (w, h, T) => { g.fillStyle = '#6a4c38'; g.fillRect(0, 0, w, h); g.fillStyle = '#efe6cf'; g.beginPath(); g.arc(64, 64, 54, 0, 6.3); g.fill(); g.strokeStyle = '#4e5a5e'; g.lineWidth = 4; for (let k = 0; k < 12; k++) { const a = (k * TAU) / 12; g.beginPath(); g.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); g.lineTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); g.stroke(); } g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(38, 50); g.moveTo(64, 64); g.lineTo(80, 26); g.stroke(); T.blot(w, h, 6, ['#a89a70'], 6, 16, 0.3); });
    reg(g, 'mark', 128, 128, (w, h, T) => { g.fillStyle = '#c0483e'; g.fillRect(0, 0, w, h); T.text('〒', w / 2, h / 2 + 4, 104, '#f6eeda', { weight: 900 }); T.blot(w, h, 8, ['#8f3a30'], 3, 12, 0.4); });
    reg(g, 'pump', 128, 192, (w, h, T) => { g.fillStyle = '#d9d2bc'; g.fillRect(0, 0, w, h); g.fillStyle = '#b5493f'; g.fillRect(0, 0, w, 46); T.text('油', w / 2, 24, 34, '#f6eeda', { font: SERIF, weight: 900 }); g.fillStyle = '#3f4a4e'; g.fillRect(16, 60, 96, 52); g.fillStyle = '#d9e2d0'; for (let k = 0; k < 4; k++) g.fillRect(22 + k * 22, 70, 16, 30); g.fillStyle = '#7a8e94'; g.fillRect(20, 130, 88, 8); T.blot(w, h, 18, ['#b5522f', '#7d3a2a'], 3, 16, 0.6); });
    for (const c of [...decl].sort((a, b) => b.h - a.h)) R[c.name] = packer.place(c.name, c.w, c.h);
    for (const c of decl) drawCell(g, c.name, c.draw);
  }, { repeat: false });
  tex.needsUpdate = true;
  const uvTo = (geo, name) => {
    const [x, y, w, h] = R[name], uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + 1.5 + uv.getX(i) * (w - 3)) / AS, 1 - (y + 1.5 + (1 - uv.getY(i)) * (h - 3)) / AS);
    return geo;
  };
  const paint = (name, w, h, draw) => {
    if (R[name]) return name;
    R[name] = packer.place(name, w, h); drawCell(G, name, (w2, h2, T) => draw(G, w2, h2, T)); tex.needsUpdate = true;
    return name;
  };
  const cellUV = (name, s, t) => { const [x, y, w, h] = R[name]; return [(x + 1.5 + s * (w - 3)) / AS, 1 - (y + 1.5 + t * (h - 3)) / AS]; };
  return { tex, uvTo, paint, cellUV, cells: R, packer, cell: (n) => R[n], quad: (w, h, name) => uvTo(new THREE.PlaneGeometry(w, h), name), names: Object.keys(R) };
}

/** Painted steel with hard-edged world-space rust blooms running down the metal (the recipe town.js uses). */
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
  m.customProgramCacheKey = () => key + '|hkworn';
  return m;
}

// wall ids in uv.x. uv.x = id + 0.02 + 0.96*base/16, uv.y = world y of the wall top.
const WALLID = { plaster: 0, mortar: 1, brick: 2, tile: 3, concrete: 4, namako: 5 };
const encodeWall = (id, base, top) => [id + 0.02 + 0.96 * clamp(base / 16), top];

/** Wall surfaces in one material: brick courses, glazed tile, formwork, namako, drawn in world space with hard cel edges that fade out before they alias. Plus rain streaks from the wall top and damp at the base. */
function wallMaterial(ctx) {
  const m = ctx.toon({ color: '#ffffff', vertexColors: true, moss: 0.34 });
  const base = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (s, r) => {
    base(s, r);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPat;').replace('#include <begin_vertex>', 'vPat=uv;\n#include <begin_vertex>');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vPat;
      float hkHash(vec2 p){ return fract(sin(p.x*127.1+p.y*311.7)*43758.5453); }
      float hkLine(float x,float period,float halfw,float fw){ float d=abs(fract(x/period+.5)-.5)*period; return (1.-smoothstep(halfw-.002,halfw+.002+fw*.5,d))*(1.-smoothstep(.22,.5,fw/period)); }`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
      {
        vec3 aN=abs(vWNorm);
        if(aN.y<.5){
          float id=floor(vPat.x), bas=(fract(vPat.x)-.02)/.96*16., top=vPat.y;
          float s=aN.x>aN.z?vWPos.z:vWPos.x, y=vWPos.y-bas;
          vec2 q=vec2(s,y);
          float n=texture2D(uNoise,q*.07+vec2(id*.13,.31)).r, n2=texture2D(uNoise,q*.31+.17).g;
          float fw=max(fwidth(s),fwidth(y));
          vec3 col=diffuseColor.rgb;
          if(id<.5){ col*=n>.56?.94:1.; }
          else if(id<1.5){ col*=n>.5?.9:1.; float sp=step(.68,n*.6+n2*.42); col=mix(col,col*vec3(.76,.72,.66),sp); }
          else if(id<2.5){
            float h=.21,l=.46,row=floor(y/h); float x=s/l+.5*mod(row,2.);
            float t=hkHash(vec2(row,floor(x)));
            float tone=t<.5?1.:t<.78?.9:t<.93?1.12:.76;
            col*=mix(tone,.98,smoothstep(.1,.32,fw/h));
            float ln=max(hkLine(y,h,.012,fw),hkLine(x*l,l,.012,fw));
            col=mix(col,diffuseColor.rgb*.5+vec3(.26,.24,.2),ln);
          }
          else if(id<3.5){
            float g=.24; vec2 c=floor(q/g); float t=hkHash(c);
            col*=mix(t<.6?1.:t<.86?.93:1.06,1.,smoothstep(.12,.4,fw/g));
            float ln=max(hkLine(q.x,g,.012,fw),hkLine(q.y,g,.012,fw));
            col=mix(col,col*.6,ln);
          }
          else if(id<4.5){
            col*=n>.54?.94:1.;
            float a=hkLine(q.x,1.8,.012,fw), b=hkLine(q.y,.9,.012,fw);
            col=mix(col,col*.74,max(a,b));
            vec2 c=fract(q/vec2(.9,.45))-.5; float dot_=1.-smoothstep(.06,.09,length(c*vec2(.9,.45)));
            col=mix(col,col*.62,dot_*(1.-smoothstep(.04,.12,fw)));
          }
          else {
            float g=.34; vec2 p=vec2(q.x+q.y,q.x-q.y)/g; vec2 f=abs(fract(p)-.5);
            float ln=(1.-smoothstep(.07,.1+fw/g,min(f.x,f.y)))*(1.-smoothstep(.1,.4,fw/g));
            col=mix(col*.36+vec3(.02,.03,.04),col*1.02,ln);
          }
          // rain from the wall head: hard-edged tongues, longer where the noise says the eave leaked
          float lead=texture2D(uNoise,vec2(s*.34,.27)).g*.62+texture2D(uNoise,vec2(s*1.3,.61)).r*.38;
          float L=max(0.,(lead-.47))*7.5;
          if(top-vWPos.y<L) col*=vec3(.8,.79,.78);
          // damp and moss rising from the footing, relative to this building's own ground
          float dmp=y-(.08+n2*.26+n*.5);
          if(dmp<.14) col*=vec3(.74,.75,.68);
          if(dmp<0.) col=mix(col,vec3(.13,.3,.1),.9);
          diffuseColor.rgb=col;
        }
      }`);
  };
  m.customProgramCacheKey = () => key + '|hkwall';
  return m;
}

/** Roofs. Tile, tin and board colour stays per-sheet in the vertex colours; moss and thatch are drawn here, in world space, so an outline wanders across tiles and boards instead of following them.
 *  uv.x is a moss weight painted per vertex: where it is high the noise crosses the two cel thresholds and the green goes on, in two value steps. Costs no triangles. */
function roofMaterial(ctx) {
  const { P } = ctx, m = ctx.toon({ vertexColors: true, side: THREE.DoubleSide });
  const c = (h) => { const k = new THREE.Color(h); return `vec3(${k.r.toFixed(3)},${k.g.toFixed(3)},${k.b.toFixed(3)})`; };
  const base = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (s, r) => {
    base(s, r);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRf;').replace('#include <begin_vertex>', 'vRf=uv;\n#include <begin_vertex>');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRf;').replace('#include <alphamap_fragment>', /* glsl */`
      {
        float w=vRf.x, k=vRf.y; vec2 q=vWPos.xz+vWPos.y*vec2(.37,-.29);
        if(k<1.9){                                                           // the scene's world moss overlay (tile and tin only: on straw it read as dirt)
          float up=clamp(vWNorm.y,0.,1.); bool top=up>.55;
          vec2 q2=top?vWPos.xz:vec2(vWPos.x+vWPos.z,vWPos.y*1.3);
          float n1=texture2D(uNoise,q2*.055).r, n2=texture2D(uNoise,q2*.19).g, n=n1*.68+n2*.32;
          float creep=step(vWPos.y-n*1.2-(n2-.5)*1.4,.5), mask=top?1.:creep*step(-.25,vWNorm.y);
          float tm=smoothstep(.604,.616,n)*mask;
          diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.10,.30,.09),vec3(.30,.56,.09),smoothstep(.42,.60,n2)),tm);
        }
        if(k>1.9){                                                           // thatch: few, wandering value steps; combed straw only near the camera
          float t=k-3.; vec3 col=diffuseColor.rgb;
          vec2 nh=normalize(vWNorm.xz+vec2(.0001,.0002)); float sA=dot(vWPos.xz,vec2(-nh.y,nh.x)), fs=fwidth(sA);
          float blo=texture2D(uNoise,q*.11+.2).r*.64+texture2D(uNoise,q*.29+.6).g*.36;
          float near=1.-smoothstep(.04,.2,fs*2.2);
          if(t>1.02){
            float bun=texture2D(uNoise,vec2(sA*.4,vWPos.y*.2)).r;
            col*=mix(.92,1.05,smoothstep(.42,.5,bun));
          } else if(t<0.){                                                   // the cut eave: straw ends, with a ragged shadow at the hem
            float cut=texture2D(uNoise,vec2(sA*2.2,.37)).r;
            col*=mix(.84,1.08,mix(.5,smoothstep(.46,.54,cut),near));
            col*=mix(.62,1.,smoothstep(-1.02,-.74,t+(cut-.5)*.38));
          } else {
            float fw=max(.012,fwidth(t)*.8), b=t+(blo-.5)*.62;
            float aged=1.-smoothstep(.17-fw,.17+fw,b), bleach=smoothstep(.57-fw,.57+fw,b+(blo-.5)*.4);
            col*=mix(1.,.86,aged)*mix(1.,1.09,bleach);
            float st=texture2D(uNoise,vec2(sA*1.8,t*.14+.3)).g;
            col*=mix(1.,step(.55,st)*.08+.93,near);
          }
          {                                                                  // a rotted pit in the straw (uv.x = -(pit+1)/2): a ragged dark hole, combed ends hanging over it, a lip of wet old straw round it. Not an if: fwidth is undefined across a branch edge, and drew a hairline round every pit
            float e=-min(w,0.)*2.-1., nn=texture2D(uNoise,q*.2+.17).r*.66+texture2D(uNoise,q*.37+.53).g*.34, comb=texture2D(uNoise,vec2(sA*.8,.71)).b;
            float a=e+((nn-.5)*1.25+(comb-.5)*.42)*smoothstep(-1.,-.4,e), fa=max(.01,fwidth(a)*1.1);
            col*=mix(1.,.76,smoothstep(-.36-fa,-.36+fa,a));
            col=mix(col,${c('#5a4835')},smoothstep(.1-fa,.1+fa,a));
          }
          diffuseColor.rgb=col;
        }
        if(w>.004){
          float n=texture2D(uNoise,q*.2+.13).r*.6+texture2D(uNoise,q*.37+.41).g*.3+texture2D(uNoise,q*.62+.77).b*.1;
          float a=w+(n-.5)*1.45, fa=max(.006,fwidth(a)*1.1);
          float t1=smoothstep(.45-fa,.45+fa,a), t2=smoothstep(.74-fa,.74+fa,a+(n-.5)*.5);
          vec3 mc=mix(${c(P.moss)}*1.02,${c(P.mossDeep)}*1.04,t2);
          if(k<1.9) mc*=mix(1.,k,.5);                                         // the tiles keep their relief under the green
          diffuseColor.rgb=mix(diffuseColor.rgb,mc,t1);
        }
      }
      #include <alphamap_fragment>`);
  };
  m.customProgramCacheKey = () => key + '|hkroof';
  return m;
}

/* ------------------------------------------------------------------ Buffers: one per material, plain arrays, cheap to push ------- */
class Buf {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; }
  get tris() { return this.p.length / 9; }
  v(x, y, z, nx, ny, nz, ux, uy, r, g, b) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(ux, uy); this.c.push(r, g, b); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.u), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    return g;
  }
}
const FACES = [ // normal, corners as (ix,iy,iz), CCW from outside
  [[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]], [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]], [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
];
const BM = { px: 1, nx: 2, py: 4, ny: 8, pz: 16, nz: 32, all: 63 };
const ALIAS = { concreteClean: 'concrete', rust: 'worn', metal: 'worn', soil: 'flat', asphalt: 'flat', mossy: 'flat' };
const unitCyl = new Map();

class Core {
  constructor(ctx, sh) { this.ctx = ctx; this.sh = sh; this.b = { wood: new Buf(), wall: new Buf(), roof: new Buf(), worn: new Buf(), atlas: new Buf(), glass: new Buf() }; this.leaves = []; this.blades = []; }
  slot(mat, env) {
    if (typeof mat !== 'string') throw new Error('housekit: pass a material name; a THREE.Material belongs in your own batch');
    const name = ALIAS[mat] || mat, id = WALLID[name];
    if (id !== undefined) return { buf: this.b.wall, fix: encodeWall(id, env.base, env.top) };
    if (name === 'flat') return { buf: this.b.atlas, fix: this.sh.whiteUV };
    if (name === 'roof') return { buf: this.b.roof, fix: [0, 1] }; // anything a district lays in 'roof' carries no moss
    const buf = this.b[name]; if (!buf) throw new Error(`housekit: unknown material "${mat}"`);
    return { buf, fix: null };
  }
  tint(mat, col) {
    if (col != null) return rgb(col);
    const { P } = this.ctx;
    return rgb({ wood: '#a98a6a', worn: P.metal, rust: P.rust, soil: P.soil, asphalt: P.asphalt, mossy: P.moss, plaster: P.plaster, mortar: '#d5cdb8', brick: P.rustLit, tile: '#dfeae4', concrete: P.concrete, namako: '#e8e3d4', concreteClean: P.concrete, metal: P.metal }[mat] || '#ffffff');
  }
  /** Any geometry through a matrix. Rotation for normals comes from R, or is derived from M. */
  push(g, mat, M, col, env, R) {
    const { buf, fix } = this.slot(mat, env), c0 = this.tint(mat, col), e = M.elements, P_ = g.attributes.position, N_ = g.attributes.normal, U_ = g.attributes.uv, C_ = g.attributes.color, I = g.index;
    const nm = R || M, ne = nm.elements; let a = ne[0], b = ne[1], c_ = ne[2], d = ne[4], f = ne[5], h = ne[6], k = ne[8], l = ne[9], m = ne[10];
    if (!R) { const n3 = _n3.getNormalMatrix(M).elements; a = n3[0]; b = n3[1]; c_ = n3[2]; d = n3[3]; f = n3[4]; h = n3[5]; k = n3[6]; l = n3[7]; m = n3[8]; }
    const n = I ? I.count : P_.count;
    for (let t = 0; t < n; t++) {
      const i = I ? I.getX(t) : t, x = P_.getX(i), y = P_.getY(i), z = P_.getZ(i), nx = N_.getX(i), ny = N_.getY(i), nz = N_.getZ(i);
      const r = C_ ? C_.getX(i) : 1, gg = C_ ? C_.getY(i) : 1, bb = C_ ? C_.getZ(i) : 1;
      const wx = a * nx + d * ny + k * nz, wy = b * nx + f * ny + l * nz, wz = c_ * nx + h * ny + m * nz, q = Math.hypot(wx, wy, wz) || 1;
      buf.v(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14],
        wx / q, wy / q, wz / q, fix ? fix[0] : U_ ? U_.getX(i) : 0, fix ? fix[1] : U_ ? U_.getY(i) : 0, c0[0] * r, c0[1] * gg, c0[2] * bb);
    }
  }
  box(x0, x1, y0, y1, z0, z1, mat, col, env, M, mask = 63) {
    const { buf, fix } = this.slot(mat, env), c = this.tint(mat, col), e = M.elements, X = [x0, x1], Y = [y0, y1], Z = [z0, z1], ux = fix ? fix[0] : 0, uy = fix ? fix[1] : 0;
    for (let i = 0; i < 6; i++) {
      if (!(mask & (1 << i))) continue;
      const [nn, cs] = FACES[i], nx = e[0] * nn[0] + e[4] * nn[1] + e[8] * nn[2], ny = e[1] * nn[0] + e[5] * nn[1] + e[9] * nn[2], nz = e[2] * nn[0] + e[6] * nn[1] + e[10] * nn[2], q = Math.hypot(nx, ny, nz) || 1;
      for (const j of [0, 1, 2, 0, 2, 3]) {
        const co = cs[j], x = X[co[0]], y = Y[co[1]], z = Z[co[2]];
        buf.v(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], nx / q, ny / q, nz / q, ux, uy, c[0], c[1], c[2]);
      }
    }
  }
  quad(a, b, c, d, mat, col, env, M, uvs) {
    const { buf, fix } = this.slot(mat, env), k = this.tint(mat, col), pts = [a, b, c, d].map((p) => v(p).applyMatrix4(M));
    const n = new V3().subVectors(pts[1], pts[0]).cross(new V3().subVectors(pts[3], pts[0])).normalize();
    for (const j of [0, 1, 2, 0, 2, 3]) { const p = pts[j], u = uvs ? uvs[j] : fix || [0, 0]; buf.v(p.x, p.y, p.z, n.x, n.y, n.z, u[0], u[1], k[0], k[1], k[2]); }
  }
  /** A roof vertex. uv carries data for the roof material: x = moss weight (0..1), y = the fake-relief shade. Thatch writes y = 3 + its height along the slope instead. */
  roofVert(p, n, c, m = 1, w = 0) { this.b.roof.v(p.x, p.y, p.z, n.x, n.y, n.z, w, m, c.r * m, c.g * m, c.b * m); }
}
const _n3 = new THREE.Matrix3();

/* ------------------------------------------------------------------ Stage: a transform over the shared buffers -------------------- */
const _m = new M4(), _basis = new M4();
export class Stage {
  constructor(t, m = new M4(), env = { base: 0, top: 3 }) { this.t = t; this.m = m; this.env = env; }
  sub(o) { return new Stage(this.t, new M4().multiplyMatrices(this.m, this.t.ctx.kit.xf(o)), this.env); }
  mx(o = {}) { return new M4().multiplyMatrices(this.m, this.t.ctx.kit.xf(o)); }
  add(g, mat = 'flat', o = {}) { const G = g.attributes.normal ? g : (g.computeVertexNormals(), g); this.t.push(G, mat, this.mx(o), o.color, this.env); return this; }
  box(x0, x1, y0, y1, z0, z1, mat = 'flat', col) { this.t.box(x0, x1, y0, y1, z0, z1, mat, col, this.env, this.m); return this; }
  /** Bars seen only from the front: upright (front + left + right faces) and level (front + top + bottom). 6 tris. */
  vbar(x0, x1, y0, y1, z0, z1, mat = 'wood', col) { this.t.box(x0, x1, y0, y1, z0, z1, mat, col, this.env, this.m, BM.pz | BM.px | BM.nx); return this; }
  hbar(x0, x1, y0, y1, z0, z1, mat = 'wood', col) { this.t.box(x0, x1, y0, y1, z0, z1, mat, col, this.env, this.m, BM.pz | BM.py | BM.ny); return this; }
  quad(a, b, c, d, mat = 'flat', col, uvs) { this.t.quad(a, b, c, d, mat, col, this.env, this.m, uvs); return this; }
  /** A rectangle in this stage's XY plane at depth z, facing +z. */
  rect(x0, x1, y0, y1, z, mat = 'flat', col) { return this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], mat, col); }
  beam(a, b, w, h, mat = 'flat', col, roll = 0) {
    const A = v(a), B = v(b), Z = B.clone().sub(A), len = Z.length(); if (len < 1e-5) return this; Z.divideScalar(len);
    const up = Math.abs(Z.y) > 0.96 ? new V3(1, 0, 0) : new V3(0, 1, 0), X = up.cross(Z).normalize(), Y = Z.clone().cross(X);
    _basis.makeBasis(X, Y, Z).setPosition(A.add(B).multiplyScalar(0.5));
    if (roll) _basis.multiply(_m.makeRotationZ(roll));
    this.t.box(-w / 2, w / 2, -h / 2, h / 2, -len / 2, len / 2, mat, col, this.env, new M4().multiplyMatrices(this.m, _basis));
    return this;
  }
  rod(a, b, r, mat = 'flat', col, seg = 6, r2 = r, open = false) {
    const A = v(a), B = v(b), Y = B.clone().sub(A), len = Y.length(); if (len < 1e-5) return this; Y.divideScalar(len);
    const up = Math.abs(Y.y) > 0.96 ? new V3(1, 0, 0) : new V3(0, 1, 0), X = up.cross(Y).normalize(), Z = X.clone().cross(Y);
    const R = new M4().multiplyMatrices(this.m, new M4().makeBasis(X, Y, Z).setPosition(A.add(B).multiplyScalar(0.5)));
    if (r2 !== r) { this.t.push(this.t.ctx.kit.cyl(r2, r, len, seg, open), mat, R, col, this.env, R); return this; }
    const key = seg * 2 + (open ? 1 : 0);
    if (!unitCyl.has(key)) unitCyl.set(key, this.t.ctx.kit.cyl(1, 1, 1, seg, open));
    const M = R.clone().multiply(_m.makeScale(r, len, r));
    this.t.push(unitCyl.get(key), mat, M, col, this.env, R);
    return this;
  }
  tube(pts, r0 = 0.03, r1 = r0, mat = 'flat', col, radial = 5, seg = 0) { this.t.push(this.t.ctx.kit.tube(pts, r0, r1, radial, seg || Math.max(6, pts.length * 3)), mat, this.m, col, this.env, this.m); return this; }
  w(p) { return v(p).applyMatrix4(this.m); }
  dir(p) { return v(p).transformDirection(this.m); }
}

/* ------------------------------------------------------------------ roofs: slopes first, then everything that follows them -------- */
// A slope is a function S(u,v,out): u along the eave 0..1, v ridge(0)→eave(1). A sagging ridge carries its tiles, boards, rafters and gutter down with it. Slopes are in world space.
const slope = (A, B, C, D, { sagR = 0, sagE = 0, dish = 0, dents = [] } = {}) => (u, v, o) => {
  const k = 1 - v, l = 1 - u;
  const x = (A.x * l + B.x * u) * k + (C.x * l + D.x * u) * v, z = (A.z * l + B.z * u) * k + (C.z * l + D.z * u) * v;
  let y = (A.y * l + B.y * u) * k + (C.y * l + D.y * u) * v;
  const su = Math.sin(Math.PI * clamp(u));
  y -= (sagR * k + sagE * v) * su + dish * su * Math.sin(Math.PI * clamp(v));
  for (const [du, dv, ru, rv, d] of dents) { const a = (u - du) / ru, b = (v - dv) / rv; y -= d * Math.exp(-(a * a + b * b)); }
  return o.set(x, y, z);
};
const inHole = (holes, u, v, k = 1) => { for (const h of holes) { const a = (u - h[0]) / (h[2] * k), b = (v - h[1]) / (h[3] * k); if (a * a + b * b < 1) return true; } return false; };

const _A = new V3(), _B = new V3(), _C = new V3(), _D = new V3(), _Tu = new V3(), _Tv = new V3(), _N = new V3();
/** Interlocking S-tiles. 16 tris each at this resolution (five stations across, a lip at the tail). */
function layTiles(K, S, { lenU, lenV, tw = 0.5, tl = 0.54, wave = 0.062, holes = [], scatter = 0.02, tint, rand, region = null, moss = null }) {
  const nu = Math.max(2, Math.round(lenU / tw)), nv = Math.max(2, Math.round(lenV / tl)), du = 1 / nu, dv = 1 / nv, NS = 5;
  const a = new V3(), b = new V3(), Tu = new V3(), Tv = new V3(), N = new V3(), p = new V3(), q = new V3(), lipN = new V3();
  const row0 = [], row1 = [], rowN = [], w0 = new Float32Array(NS), w1 = new Float32Array(NS); for (let i = 0; i < NS; i++) { row0.push(new V3()); row1.push(new V3()); rowN.push(new V3()); }
  if (moss) moss.minV = dv * 0.75;
  const ou = 0.01 / lenU; // tile columns overlap a touch, so a sagged slope can't open pinholes between them
  for (let r = 0; r < nv; r++) for (let c = 0; c < nu; c++) {
    const uc = (c + 0.5) * du, vc = (r + 0.5) * dv;
    if (region && !region(uc, vc)) continue;
    const rough = 0.86 + rand() * 0.3;
    if (inHole(holes, uc, vc, rough)) continue;
    if (rand() < scatter) continue;
    S(uc - du / 2, vc, a); S(uc + du / 2, vc, b); Tu.subVectors(b, a); const wid = Tu.length() || 1; Tu.divideScalar(wid);
    S(uc, vc - dv / 2, a); S(uc, vc + dv / 2, b); Tv.subVectors(b, a).normalize();
    N.crossVectors(Tu, Tv); const flip = N.y < 0; if (flip) N.negate(); N.normalize();
    const off = rand() < 0.06 ? rand() * 0.09 : rand() * 0.012, lift = 0.05 + rand() * 0.012, col = tint(uc, vc, rand);
    const u0 = Math.max(0, uc - du / 2 - ou), u1 = Math.min(1, uc + du / 2 + ou), t0 = vc - dv / 2 + off * dv, t1 = vc + dv * 0.62 + off * dv;
    for (let i = 0; i < NS; i++) {
      const s = i / (NS - 1), h = wave * Math.sin(s * TAU), dh = (wave * Math.cos(s * TAU) * TAU) / tw, u = lerp(u0, u1, s);
      S(u, t0, row0[i]).addScaledVector(N, h + 0.015); S(u, t1, row1[i]).addScaledVector(N, h + 0.015 + lift);
      rowN[i].copy(N).addScaledVector(Tu, -dh * 0.6).normalize();
      const valley = i === 3 ? 0.22 : 0; w0[i] = moss ? moss(u, t0, valley) : 0; w1[i] = moss ? moss(u, t1, valley) : 0;
    }
    for (let i = 0; i < NS - 1; i++) {
      const A = row0[i], B = row0[i + 1], C = row1[i], D = row1[i + 1], Na = rowN[i], Nb = rowN[i + 1];
      const ma = 1 + 0.42 * Math.sin((i / (NS - 1)) * TAU), mb = 1 + 0.42 * Math.sin(((i + 1) / (NS - 1)) * TAU);
      const put = (P1, N1, m1, W1, P2, N2, m2, W2, P3, N3, m3, W3) => { K.roofVert(P1, N1, col, m1, W1); if (!flip) { K.roofVert(P2, N2, col, m2, W2); K.roofVert(P3, N3, col, m3, W3); } else { K.roofVert(P3, N3, col, m3, W3); K.roofVert(P2, N2, col, m2, W2); } };
      const wa = w0[i], wb = w0[i + 1], wc = w1[i], wd = w1[i + 1];
      put(A, Na, ma, wa, B, Nb, mb, wb, C, Na, ma, wc); put(B, Nb, mb, wb, D, Nb, mb, wd, C, Na, ma, wc);
      if (i % 2 === 0) { const E = row1[i + 2], we = w1[i + 2]; p.copy(C).addScaledVector(N, -lift - 0.05); q.copy(E).addScaledVector(N, -lift - 0.05); lipN.copy(Tv); put(C, lipN, 0.52, wc, E, lipN, 0.52, we, p, lipN, 0.52, wc); put(E, lipN, 0.52, we, q, lipN, 0.52, we, p, lipN, 0.52, wc); }
    }
  }
}
/** Continuous corrugated courses: the cheap kawara on big roofs, and tin sheet (lip 0). */
function layCorrugated(K, S, { lenU, lenV, wl = 0.5, course = 0.9, amp = 0.05, holes = [], tint, rand, region = null, lip = 0.05, sheet = 1, lift = 0, moss = null }) {
  const nu = Math.max(2, Math.round(lenU / wl)), nv = Math.max(1, Math.round(lenV / course)), du = 1 / nu, dv = 1 / nv;
  const a = new V3(), b = new V3(), Tu = new V3(), Tv = new V3(), N = new V3(), P0 = [new V3(), new V3(), new V3()], P1 = [new V3(), new V3(), new V3()], p = new V3(), q = new V3(), Ns = [new V3(), new V3()], w0 = [0, 0, 0], w1 = [0, 0, 0], ou = 0.012 / lenU;
  if (moss) moss.minV = dv * 0.75;
  for (let r = 0; r < nv; r++) {
    let sheetRand = 0, sheetCol = null, sheetLift = 0;
    for (let c = 0; c < nu; c++) {
      if (c % sheet === 0) { sheetRand = rand(); sheetCol = null; sheetLift = lift > 0 && rand() < 0.16 ? rand() * lift : 0; }
      const uc = (c + 0.5) * du, vc = (r + 0.5) * dv;
      if (region && !region(uc, vc)) continue;
      if (inHole(holes, uc, vc, 0.9 + sheetRand * 0.25)) continue;
      S(uc - du / 2, vc, a); S(uc + du / 2, vc, b); Tu.subVectors(b, a).normalize();
      S(uc, vc - dv / 2, a); S(uc, vc + dv / 2, b); Tv.subVectors(b, a).normalize();
      N.crossVectors(Tu, Tv); const flip = N.y < 0; if (flip) N.negate(); N.normalize();
      if (!sheetCol) sheetCol = tint(uc, vc, rand, sheetRand);
      const u0 = Math.max(0, uc - du / 2 - ou), u1 = Math.min(1, uc + du / 2 + ou), t0 = vc - dv / 2, t1 = vc + dv * 0.56; // columns overlap by a centimetre: each is pushed along its own normal, so under a sag they would otherwise part
      for (let i = 0; i < 3; i++) { const s = i / 2, h = i === 1 ? amp : -amp, u = lerp(u0, u1, s), tip = sheetLift * (r % 2 ? 1 : 0.4); S(u, t0, P0[i]).addScaledVector(N, h + 0.02); S(u, t1, P1[i]).addScaledVector(N, h + 0.02 + lip * 0.9 + tip); if (moss) { const valley = i === 1 ? 0 : 0.18; w0[i] = moss(u, t0, valley); w1[i] = moss(u, t1, valley); } }
      Ns[0].copy(N).addScaledVector(Tu, -0.55).normalize(); Ns[1].copy(N).addScaledVector(Tu, 0.55).normalize();
      const ms = [1.28, 0.74];
      for (let i = 0; i < 2; i++) {
        const A = P0[i], B = P0[i + 1], C = P1[i], D = P1[i + 1], n = Ns[i], m = ms[i], wA = w0[i], wB = w0[i + 1], wC = w1[i], wD = w1[i + 1];
        if (!flip) { K.roofVert(A, n, sheetCol, m, wA); K.roofVert(B, n, sheetCol, m, wB); K.roofVert(C, n, sheetCol, m, wC); K.roofVert(B, n, sheetCol, m, wB); K.roofVert(D, n, sheetCol, m, wD); K.roofVert(C, n, sheetCol, m, wC); }
        else { K.roofVert(A, n, sheetCol, m, wA); K.roofVert(C, n, sheetCol, m, wC); K.roofVert(B, n, sheetCol, m, wB); K.roofVert(B, n, sheetCol, m, wB); K.roofVert(C, n, sheetCol, m, wC); K.roofVert(D, n, sheetCol, m, wD); }
        if (lip > 0) {
          p.copy(C).addScaledVector(N, -lip - 0.04); q.copy(D).addScaledVector(N, -lip - 0.04);
          if (!flip) { K.roofVert(C, Tv, sheetCol, 0.5, wC); K.roofVert(D, Tv, sheetCol, 0.5, wD); K.roofVert(p, Tv, sheetCol, 0.5, wC); K.roofVert(D, Tv, sheetCol, 0.5, wD); K.roofVert(q, Tv, sheetCol, 0.5, wD); K.roofVert(p, Tv, sheetCol, 0.5, wC); }
          else { K.roofVert(C, Tv, sheetCol, 0.5, wC); K.roofVert(p, Tv, sheetCol, 0.5, wC); K.roofVert(D, Tv, sheetCol, 0.5, wD); K.roofVert(D, Tv, sheetCol, 0.5, wD); K.roofVert(p, Tv, sheetCol, 0.5, wC); K.roofVert(q, Tv, sheetCol, 0.5, wD); }
        }
      }
    }
  }
}
/** Sheathing under the covering. Holes here are the real sky gaps. */
function layBoards(K, S, { nu = 4, nv = 3, holes = [], color, rand, k = 0.74, region = null, drop = 0.03, moss = null }) {
  const a = new V3(), b = new V3(), c = new V3(), d = new V3(), n = new V3(), e = new V3(), f = new V3(), col = new THREE.Color(color);
  // every panel is pushed down its own normal, so under a sag neighbours part at the seam: each one overlaps its neighbours by 3 cm so no sky shows through as ink specks
  const ou = 0.03 / (S(0, 0.5, e).distanceTo(S(1, 0.5, f)) || 1), ov = 0.03 / (S(0.5, 0, e).distanceTo(S(0.5, 1, f)) || 1);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv, uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
    if (region && !region(uc, vc)) continue;
    if (inHole(holes, uc, vc, k * (0.92 + rand() * 0.18))) continue;
    const u0o = Math.max(0, u0 - ou), u1o = Math.min(1, u1 + ou), v0o = Math.max(0, v0 - ov), v1o = Math.min(1, v1 + ov);
    S(u0o, v0o, a); S(u1o, v0o, b); S(u0o, v1o, c); S(u1o, v1o, d);
    e.subVectors(b, a); f.subVectors(c, a); n.crossVectors(e, f).normalize(); const flip = n.y < 0; if (flip) n.negate();
    const dr = drop + ((i + j) & 1) * 0.002; a.addScaledVector(n, -dr); b.addScaledVector(n, -dr); c.addScaledVector(n, -dr); d.addScaledVector(n, -dr); // a 2 mm step between neighbours keeps the overlap from z-fighting
    const m = 0.92 + rand() * 0.16;
    const wa = moss ? moss(u0o, v0o, 0) : 0, wb = moss ? moss(u1o, v0o, 0) : 0, wc = moss ? moss(u0o, v1o, 0) : 0, wd = moss ? moss(u1o, v1o, 0) : 0;
    if (!flip) { K.roofVert(a, n, col, m, wa); K.roofVert(b, n, col, m, wb); K.roofVert(c, n, col, m, wc); K.roofVert(b, n, col, m, wb); K.roofVert(d, n, col, m, wd); K.roofVert(c, n, col, m, wc); }
    else { K.roofVert(a, n, col, m, wa); K.roofVert(c, n, col, m, wc); K.roofVert(b, n, col, m, wb); K.roofVert(b, n, col, m, wb); K.roofVert(c, n, col, m, wc); K.roofVert(d, n, col, m, wd); }
  }
}

/* ------------------------------------------------------------------ small geometry helpers on [u,y] outlines ---------------------- */
function slice(pts, c, axis) { // intersect a polygon with the line coord[axis]=c; returns intervals of the other coordinate
  const xs = [], o = 1 - axis;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[axis] > c) !== (b[axis] > c)) xs.push(a[o] + ((c - a[axis]) / (b[axis] - a[axis])) * (b[o] - a[o])); }
  xs.sort((a, b) => a - b); const out = []; for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]); return out;
}
function subtract(spans, cuts) {
  let out = spans.slice();
  for (const [c0, c1] of cuts) { const next = []; for (const [a, b] of out) { if (c1 <= a || c0 >= b) next.push([a, b]); else { if (c0 > a) next.push([a, c0]); if (c1 < b) next.push([c1, b]); } } out = next; }
  return out;
}
function intersect(A, B) { const out = []; for (const [a0, a1] of A) for (const [b0, b1] of B) { const l = Math.max(a0, b0), h = Math.min(a1, b1); if (h > l) out.push([l, h]); } return out; }

/* ------------------------------------------------------------------ the shared materials ----------------------------------------- */
let SHARED = null;
function sharedFor(ctx) {
  if (SHARED) return SHARED;
  const atlas = buildAtlas(ctx);
  const whiteUV = atlas.cellUV('white', 0.5, 0.5);
  const wood = ctx.surface('wood', { vertexColors: true, color: '#ffffff' }); wood.userData.uv = 0.17;
  const shellMat = (() => {
    const m = ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, dapple: false, translucent: 0.6 });
    const baseCompile = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => {
      baseCompile(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aShell;').replace('#include <normal_vertex>', 'transformedNormal=normalize(mat3(viewMatrix)*aShell);\n#include <normal_vertex>');
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
  const blade = ctx.kit.blade(1, 0.15, 0.22, 2); { const nr = blade.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0); }
  SHARED = {
    atlas, whiteUV, shellMat, shellLeaf, blade,
    wood, wall: wallMaterial(ctx), roof: roofMaterial(ctx), worn: wornMaterial(ctx),
    atlasMat: ctx.toon({ map: atlas.tex, vertexColors: true, side: THREE.DoubleSide }),
    glass: ctx.toon({ color: '#bfe8e2', vertexColors: true, transparent: true, opacity: 0.34, side: THREE.DoubleSide, dapple: false, depthWrite: false }),
    grass: ctx.toon({ color: '#ffffff', side: THREE.DoubleSide, translucent: 0.5 }),
  };
  return SHARED;
}

const pick4 = (cols) => { const c = cols.map((x) => new THREE.Color(x)); return (u, v, r) => { const k = r(); return k < 0.62 ? c[0] : k < 0.86 ? c[1] : k < 0.965 ? c[2] : c[3]; }; };
const TILE_TINTS = [['#7a8e9c', '#6b808f', '#8c9ea8', '#a0705a'], ['#64808f', '#587482', '#7890a0', '#566a78'], ['#8c6a58', '#7c5c4c', '#a07a62', '#6b808f'], ['#5c6e7c', '#52626e', '#6e808c', '#8a6a58'], ['#a4674e', '#935a44', '#b67a5c', '#7a8e9c'], ['#7d8a80', '#6f7d74', '#909b90', '#a0705a']];
const TIN_TINTS = [['#b5522f', '#a24a2e', '#c9683f', '#7d3a2a'], ['#7fa0a0', '#6f9090', '#94b0ae', '#b5522f'], ['#a8604a', '#96543f', '#bc7558', '#6f7a7e'], ['#8f8f86', '#7f7f78', '#a0a096', '#b5522f'], ['#c0704a', '#b5522f', '#d08a60', '#8a4a34']];
const CEDAR = { dark: '#8a6e58', mid: '#9a7a5e', silver: '#a89a82', pale: '#bcae96' };
const WALLCOLS = { plaster: ['#ece1c8', '#d9d8c8', '#e5dfcf', '#e7dcc4', '#ded2b4'], mortar: ['#cfc8b4', '#b9b8ae', '#d6cfbc', '#c6bfa8', '#a9d0bb'], brick: ['#b4644a', '#a85a44', '#bc6f54'], tile: ['#dfeae4', '#c9dcd6', '#e6e0d0'], concrete: ['#d9d6cb', '#c6c5ba', '#b9b8ae', '#e0dccf'] };

/* ================================================================== createHouseKit ============================================== */
export function createHouseKit(ctx, { name = 'housekit', seed = 'housekit' } = {}) {
  const { P, kit, THREE: T3 } = ctx, sh = sharedFor(ctx), K = new Core(ctx, sh), SUN = new V3(...ctx.layout.SUN_DIR);
  const H = { atlas: sh.atlas, stats: {}, density: 0.88 };
  const world = new Stage(K);
  H.world = world;
  H.rand = (id) => ctx.seeded(`${seed}:${id}`);
  H.local = (b) => { const env = { base: b.elev || 0, top: (b.elev || 0) + b.h }; return new Stage(K, ctx.kit.xf({ pos: [b.x, b.elev || 0, b.z], rot: [0, b.yaw, 0] }), env); };
  let walk = 0.37 + (ctx.seeded(seed)() * 0.5);
  const deck = (n, prefix, pad) => { const r0 = ctx.seeded(`${seed}:deck:${prefix}`), order = Array.from({ length: n }, (_, i) => i + 1).sort(() => r0() - 0.5); let i = 0; return () => { const k = order[i++ % n]; return prefix + (pad ? String(k).padStart(2, '0') : k); }; };
  H.nextSign = deck(12, 'h', true); H.nextVSign = deck(8, 'v'); H.nextNoren = deck(8, 'n');

  /* ---- leaves and grass ---- */
  const color = (h) => new THREE.Color(h);
  const TONE = [[0.72, color(P.leafLit).lerp(color(P.leafMid), 0.3).multiplyScalar(0.85)], [0.58, color(P.leafMid).multiplyScalar(0.84)], [0.4, color(P.leafDeep).multiplyScalar(0.94)], [-9, color(P.leafShade)]];
  const tone = (x) => TONE.find(([min]) => x > min)[1];
  const GRASSC = [color(P.grass), color(P.grassLit), color(P.moss), color(P.fern), color(P.mossLit)];
  const balls = [0, 1, 2].map((i) => kit.chip(kit.sphere(1, 7, 4), 0.3, ctx.seeded(`hk-ball${i}`))), DARK_LEAF = '#3f9a5c', PAD_LEAF = '#378f58';

  function clump(rng, c, rx, ry, n, { s = 0.36, y0 = -1e3, shift = 0.05, droop = 0.35 } = {}) {
    const C0 = v(c), count = Math.round(n * H.density);
    for (let i = 0; i < count; i++) {
      const th = rng() * TAU, y = rng.range(-0.5, 1), q = Math.sqrt(1 - y * y), rr = 0.82 + rng() * 0.26;
      const d = new V3(q * Math.cos(th), y, q * Math.sin(th)), p = new V3(C0.x + d.x * rx * rr, C0.y + d.y * ry * rr, C0.z + d.z * rx * rr);
      if (p.y < y0) continue;
      const shell = new V3(d.x / rx, d.y / ry, d.z / rx).normalize();
      const tip = shell.clone().multiplyScalar(0.55).add(new V3(rng.range(-0.7, 0.7), rng.range(-0.7, 0.7) - droop, rng.range(-0.7, 0.7))).normalize();
      K.leaves.push({ p, shell, tip, s: s * rng.range(0.8, 1.2), tone: tone(0.48 + shell.dot(SUN) * 0.34 + y * 0.12 + rng.range(-0.14, 0.14) + shift) });
    }
  }
  /** Ring greenery stays on the ring: a mass near the seam is nudged clear of the v2 core and of the plinth edge. */
  const ringClear = (p, r) => { const { CORE, BASE } = ctx.layout, H0 = BASE.half - r; p.x = clamp(p.x, -H0, H0); p.z = clamp(p.z, -H0, H0); const C0 = CORE.half + r; if (Math.max(Math.abs(p.x), Math.abs(p.z)) < C0) { if (Math.abs(p.x) >= Math.abs(p.z)) p.x = Math.sign(p.x || 1) * C0; else p.z = Math.sign(p.z || 1) * C0; } return p; };
  function ballLeaves(st, rng, c, rx, ry, n, o = {}) {
    const p = ringClear(st.w(c), rx * 1.05);
    if (o.core !== false) world.add(balls[Math.floor(rng() * 3)], 'flat', { pos: [p.x, p.y, p.z], rot: [0, rng() * 6, 0], scale: [rx * 0.76, ry * 0.76, rx * 0.76], color: o.coreCol || DARK_LEAF });
    clump(rng, p, rx, ry, n, o);
  }
  /** Ivy held flat to a wall face: a dark pad gives the mass at distance, leaves give the edge and the near view. */
  function ivySheet(side, rng, u0, u1, y0, height, cover, { sCap = null, keepOut = [], scale = 1 } = {}) {
    const st = side.s, O = st.w([0, 0, 0]), U = st.dir([1, 0, 0]), Vu = new V3(0, 1, 0), N = st.dir([0, 0, 1]), ph = rng() * 6, w = u1 - u0;
    // the top edge is a row of rounded lobes, a cloud line rather than peaks
    const nC = Math.max(3, Math.round(w / 0.2)), tops = [], lobes = Array.from({ length: Math.max(2, Math.round(w / 0.9)) }, () => [rng(), rng.range(0.55, 1) , rng.range(0.34, 0.62) * Math.min(1, 1.6 / w)]);
    const lobeAt = (a) => { let m = 0.3; for (const [c, hh, rad] of lobes) { const q = (a - c) / rad; if (q * q < 1) m = Math.max(m, hh * Math.sqrt(1 - q * q)); } return m; };
    const topAt = (a) => { const y = y0 + Math.max(0.25, height * cover * lobeAt(a)); return sCap ? Math.min(y, sCap(u0 + a * w)) : y; };
    const lowTop = (a) => { const y = y0 + Math.max(0.2, height * cover * lobeAt(a) * 0.86); return sCap ? Math.min(y, sCap(u0 + a * w)) : y; };
    for (let i = 0; i <= nC; i++) tops.push(lowTop(i / nC));
    const z = 0.075;
    for (let i = 0; i < nC; i++) {
      const a0 = u0 + (i / nC) * w, a1 = u0 + ((i + 1) / nC) * w;
      if (tops[i] <= y0 + 0.05 && tops[i + 1] <= y0 + 0.05) continue;
      st.quad([a0, y0, z], [a1, y0, z], [a1, tops[i + 1], z], [a0, tops[i], z], 'flat', PAD_LEAF);
    }
    const area = tops.reduce((s, t) => s + (t - y0), 0) * (w / (nC + 1)) * 1.1, n = Math.round(area * 13.5 * H.density * scale);
    for (let i = 0; i < n; i++) {
      const a = rng(), t = Math.pow(rng(), 0.62), top = topAt(a), b = y0 + t * (top - y0 + 0.16);
      const uu = u0 + a * w; if (keepOut.some(([x0, x1, y2, y3]) => uu > x0 && uu < x1 && b > y2 && b < y3)) continue;
      const p = O.clone().addScaledVector(U, uu).addScaledVector(Vu, b).addScaledVector(N, 0.1 + rng() * 0.08);
      const shell = N.clone().add(new V3(rng.range(-0.2, 0.2), 0.3, rng.range(-0.2, 0.2))).normalize();
      const tip = new V3(rng.range(-0.8, 0.8), rng.range(-1, 0.1), rng.range(-0.8, 0.8)).addScaledVector(N, 0.3).normalize();
      K.leaves.push({ p, shell, tip, s: 0.3 * rng.range(0.75, 1.25), tone: tone(0.56 + shell.dot(SUN) * 0.34 + rng.range(-0.18, 0.18) + (t > 0.8 ? 0.08 : 0)) });
    }
    // a couple of runners above the mass
    const runs = Math.max(1, Math.round(w / 2.2));
    for (let i = 0; i < runs; i++) {
      const a = rng(), x = u0 + a * w, top = topAt(a), pts = []; let xx = x;
      for (let y = y0; y <= top + 0.5; y += 0.5) { pts.push([xx, y, 0.09]); xx += rng.range(-0.22, 0.22); }
      if (pts.length >= 2) st.tube(pts, 0.022, 0.01, 'flat', '#6a6a42', 3, Math.max(3, pts.length));
    }
  }
  function grassPatch(st, rng, x, z, r, n, { y = 0.03, h = 0.5, rz = r } = {}) { // blades come in tufts: a few roots, each a fan of blades
    const cn = Math.round(n * H.density), per = 4;
    for (let t = 0; t < Math.ceil(cn / per); t++) {
      const a0 = rng() * TAU, q0 = Math.sqrt(rng()), tx = x + Math.cos(a0) * q0 * r, tz = z + Math.sin(a0) * q0 * rz;
      for (let i = 0; i < per; i++) { const a = rng() * TAU, q = rng() * 0.12, p = st.w([tx + Math.cos(a) * q, y, tz + Math.sin(a) * q]); K.blades.push({ x: p.x, y: p.y, z: p.z, h: h * rng.range(0.6, 1.2), yaw: rng() * TAU, c: rng.pick(GRASSC), rx: rng.range(-0.22, 0.22), rz: rng.range(-0.22, 0.22) }); }
    }
  }
  function sapling(st, rng, p0, h = 1.6, { crown = 1 } = {}) { // a forked stem with three small leaf masses, never a lollipop
    const A = v(p0), B = [A.x + rng.range(-0.28, 0.28), A.y + h * 0.62, A.z + rng.range(-0.28, 0.28)];
    st.tube([[A.x, A.y - 0.05, A.z], [lerp(A.x, B[0], 0.5) + rng.range(-0.08, 0.08), A.y + h * 0.3, lerp(A.z, B[2], 0.5) + rng.range(-0.08, 0.08)], B], 0.055, 0.03, 'flat', '#7a6248', 4);
    for (let i = 0; i < 3; i++) {
      const a = rng() * TAU + i * 2.1, spread = (0.28 + rng() * 0.28) * crown, tip = [B[0] + Math.cos(a) * spread, B[1] + h * rng.range(0.16, 0.38), B[2] + Math.sin(a) * spread], rr = (0.34 + rng() * 0.16) * crown;
      st.tube([B, tip], 0.03, 0.012, 'flat', '#7a6248', 3); ballLeaves(st, rng, tip, rr, rr * 0.8, 13, { s: 0.3 });
    }
  }
  function rubble(st, rng, cx, cz, rx, rz, n, y = 0.04, cols = {}) {
    const WO = cols.wood || ['#c8a884', '#8d8270', '#7a5c46', '#86664c'], PL = cols.plaster || ['#ece1c8', '#d9d8c8', '#c9bfa8'], TI = cols.tile || ['#7a8e9c', '#6b808f', '#8c9ea8'];
    st.add(kit.chip(kit.sphere(1, 8, 4), 0.34, rng), 'flat', { pos: [cx, y - 0.1, cz], scale: [rx * 0.86, Math.min(rx, rz) * 0.42, rz * 0.86], color: '#7b6a58' });
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, q = Math.sqrt(rng()), x = cx + Math.cos(a) * q * rx, z = cz + Math.sin(a) * q * rz, k = rng(), yy = y + (1 - q) * 0.42 + rng() * 0.08;
      if (k < 0.42) { const l = rng.range(0.6, 1.5), th = rng() * TAU, dx = (Math.cos(th) * l) / 2, dz = (Math.sin(th) * l) / 2, t = rng.range(0, 0.4); st.beam([x - dx, yy, z - dz], [x + dx, yy + t, z + dz], rng.range(0.07, 0.15), rng.range(0.04, 0.09), 'wood', rng.pick(WO)); }
      else if (k < 0.74) st.add(kit.chip(kit.box(rng.range(0.22, 0.5), rng.range(0.1, 0.2), rng.range(0.2, 0.42)), 0.04, rng), 'plaster', { pos: [x, yy, z], rot: [rng.range(-0.4, 0.4), rng() * 6, rng.range(-0.4, 0.4)], color: rng.pick(PL) });
      else st.add(kit.box(0.34, 0.035, 0.3), 'flat', { pos: [x, yy, z], rot: [rng.range(-0.6, 0.6), rng() * 6, rng.range(-0.6, 0.6)], color: rng.pick(TI) });
    }
    grassPatch(st, rng, cx, cz, rx, 16, { y: y + 0.1, h: 0.5, rz });
  }

  /* ---- props ---- */
  const props = H.props = {
    ac(st, col = '#ece6d4') {
      st.box(-0.38, 0.38, 0, 0.56, -0.15, 0.15, 'worn', col);
      st.add(kit.cyl(0.21, 0.21, 0.02, 12), 'flat', { pos: [-0.08, 0.28, 0.155], rot: [Q, 0, 0], color: '#4e5a5e' });
      for (let i = -1; i <= 1; i++) st.hbar(-0.3, 0.14, 0.28 + i * 0.09 - 0.008, 0.28 + i * 0.09 + 0.008, 0.16, 0.175, 'flat', '#6f7a7e');
      st.box(0.2, 0.34, 0.06, 0.5, 0.155, 0.17, 'flat', '#b9bdb2');
      st.box(-0.4, -0.33, -0.1, 0, -0.2, 0.16, 'worn', '#6f7a7e'); st.box(0.33, 0.4, -0.1, 0, -0.2, 0.16, 'worn', '#6f7a7e');
      return st;
    },
    meter(st) { // gas meter on its pipework
      st.box(-0.13, 0.13, 0, 0.32, 0, 0.16, 'worn', '#d8d4c2'); st.rect(-0.09, 0.09, 0.14, 0.26, 0.163, 'flat', '#efe9d6');
      st.rod([-0.08, 0, 0.08], [-0.08, -0.3, 0.08], 0.016, 'flat', '#c9a24e', 4); st.rod([0.08, 0.32, 0.08], [0.08, 0.5, 0.08], 0.016, 'flat', '#c9a24e', 4);
      return st;
    },
    box(st, col = '#a8b4b4') { // grey utility cabinet
      st.box(-0.24, 0.24, 0, 0.62, 0, 0.17, 'worn', col); st.hbar(-0.26, 0.26, 0.62, 0.66, 0, 0.2, 'worn', col); st.rect(-0.2, 0.2, 0.07, 0.56, 0.172, 'flat', shade(col, 0.88));
      st.rect(-0.08, 0.08, 0.42, 0.5, 0.174, 'flat', '#efe9d6'); st.rod([0, 0.66, 0.08], [0.05, 1.3, 0.08], 0.02, 'flat', '#3e3a36', 4);
      return st;
    },
    gas(st) { // two propane cylinders, chained to the wall
      for (const x of [-0.2, 0.2]) { st.add(kit.cylBase(0.17, 0.17, 0.82, 9), 'worn', { pos: [x, 0, 0.2], color: '#8fa79a' }); st.add(kit.sphere(0.17, 9, 4), 'worn', { pos: [x, 0.82, 0.2], scale: [1, 0.55, 1], color: '#8fa79a' }); st.add(kit.cyl(0.05, 0.06, 0.1, 6), 'flat', { pos: [x, 0.96, 0.2], color: '#c9a24e' }); }
      st.rod([-0.4, 0.64, 0.38], [0.4, 0.64, 0.38], 0.008, 'flat', '#4a5056', 3);
      return st;
    },
    drain(st, x, y0, y1, col = '#8a7a6a', stain = true) {
      st.box(x - 0.045, x + 0.045, y0, y1, 0.02, 0.1, 'worn', col);
      for (let y = y0 + 0.5; y < y1 - 0.2; y += 1.05) st.box(x - 0.07, x + 0.07, y, y + 0.03, 0, 0.11, 'worn', '#6f7a7e');
      if (stain) { const t = y0 + 0.2, b = y1 - 0.1; st.quad([x - 0.15, t, 0.012], [x + 0.17, t, 0.012], [x + 0.08, b, 0.012], [x - 0.08, b, 0.012], 'flat', '#8f6a50'); st.quad([x - 0.06, y0 + 0.01, 0.013], [x + 0.12, y0 + 0.01, 0.013], [x + 0.05, y1 * 0.6, 0.013], [x - 0.05, y1 * 0.6, 0.013], 'flat', '#a9603f'); }
      return st;
    },
    pots(st, x, n = 3, rng = ctx.rng) {
      for (let i = 0; i < n; i++) {
        const px = x + (i - (n - 1) / 2) * 0.46, r = 0.13 + rng() * 0.08, h = 0.2 + rng() * 0.12, col = ['#b0694a', '#a65a44', '#a39a88', '#c08a60'][Math.floor(rng() * 4)], z = 0.3 + rng() * 0.2;
        st.add(kit.cylBase(r, r * 0.76, h, 8), 'flat', { pos: [px, 0, z], color: col }); st.add(kit.cyl(r + 0.02, r + 0.02, 0.05, 8, true), 'flat', { pos: [px, h, z], color: shade(col, 0.86) });
        ballLeaves(st, rng, [px, h + 0.14, z], 0.24, 0.2, 7, { s: 0.2 });
      }
      return st;
    },
    dryPole(st, rng = ctx.rng, l = 2.4) { // two stands, a bamboo pole, one forgotten cloth
      const H0 = 1.6; for (const x of [-l / 2, l / 2]) { st.rod([x, 0, 0], [x + 0.03, H0, 0], 0.03, 'worn', '#7d8b90', 5); st.rod([x - 0.18, H0 - 0.15, 0], [x + 0.18, H0 - 0.15, 0], 0.012, 'worn', '#7d8b90', 4); st.add(kit.cyl(0.14, 0.17, 0.06, 7), 'concrete', { pos: [x, 0.03, 0] }); }
      st.rod([-l / 2 - 0.3, H0 - 0.13, 0], [l / 2 + 0.3, H0 - 0.13 - 0.08, 0], 0.024, 'wood', '#c8b67a', 6);
      for (let i = 0; i < 2; i++) { const x = lerp(-0.7, 0.5, i + rng() * 0.3), w = 0.5 + rng() * 0.4, cell = ['sheet', 'futon', 'stripe2'][i + (rng() < 0.5 ? 1 : 0)]; const g = new THREE.PlaneGeometry(w, 0.95, 2, 2); g.translate(0, -0.47, 0); const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 5 + i) * 0.05 * (-p.getY(k) + 0.1)); g.computeVertexNormals(); sh.atlas.uvTo(g, cell); st.add(g, 'atlas', { pos: [x, H0 - 0.18, 0], rot: [rng() * 0.2 - 0.1, 0, rng() * 0.04] }); }
      return st;
    },
    crates(st, rng = ctx.rng) {
      const n = 2 + Math.floor(rng() * 2); for (let i = 0; i < n; i++) { const w = 0.5 + rng() * 0.2, h = 0.3 + rng() * 0.14, x = i * 0.55 - 0.4 + rng() * 0.1, c = rng() < 0.5 ? '#c8a884' : '#c9b45a', y = i === 2 ? 0.34 : 0; st.box(x - w / 2, x + w / 2, y, y + h, 0.12, 0.54, 'wood', c); st.hbar(x - w / 2, x + w / 2, y + h * 0.5, y + h * 0.5 + 0.02, 0.1, 0.1, 'wood', shade(c, 0.7)); }
      return st;
    },
    ladder(st, h = 2.8) { for (const x of [-0.18, 0.18]) st.rod([x, 0, 0.42], [x, h, 0.08], 0.024, 'wood', '#a98a6a', 4); for (let y = 0.3; y < h - 0.1; y += 0.34) { const z = lerp(0.42, 0.08, y / h); st.rod([-0.18, y, z], [0.18, y, z], 0.015, 'wood', '#a98a6a', 4); } return st; },
    sign(st, cell, w, h, { pos = [0, 0, 0], rot = [0, 0, 0], board = '#5e4634', t = 0.05, guard = true } = {}) {
      if (guard && st.side) { // a board on a building's own wall must not run into that building's eave; a hand-placed one only ever comes down
        const seat = seatBoard(st.building, st.side, pos[0], pos[1], pos[2], w, h, t, null, { rotY: rot[1], noForward: true });
        if (seat.how !== 'ok') { if (seat.how === 'forward') braceBoard(st, pos[0], seat.y, seat.z, w, h, t, seat.arm, Math.max(0.02, pos[2])); (H.signLog ||= []).push({ id: st.building.id, cell, y: +seat.y.toFixed(3), z: +seat.z.toFixed(3), how: seat.how, late: true }); pos = [pos[0], seat.y, seat.z]; }
      }
      const s2 = st.sub({ pos, rot }); s2.box(-w / 2 - 0.04, w / 2 + 0.04, -h / 2 - 0.04, h / 2 + 0.04, -t, 0, 'wood', board); s2.add(sh.atlas.quad(w, h, cell), 'atlas', { pos: [0, 0, 0.004] });
      return s2;
    },
    noren(st, x0, x1, y, cell, rng = ctx.rng, drop = 0.72) {
      const n = Math.max(3, Math.round((x1 - x0) / 0.42)), [ax, ay, aw, ah] = sh.atlas.cell(cell), ch = rgb('#ffffff');
      st.rod([x0 - 0.06, y, 0.1], [x1 + 0.06, y, 0.1], 0.02, 'wood', '#6e5038', 5);
      const sw = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        const a = x0 + i * sw + 0.008, b = x0 + (i + 1) * sw - 0.008, d = y - drop * (1 - rng() * 0.18), u0 = i / n, u1 = (i + 1) / n, UV = (s, t) => sh.atlas.cellUV(cell, lerp(u0, u1, s), t), z2 = 0.1 + 0.05 * Math.sin(i * 1.7 + rng());
        st.quad([a, d, z2], [b, d, z2], [b, y, 0.1], [a, y, 0.1], 'atlas', ch, [UV(0, 1), UV(1, 1), UV(1, 0), UV(0, 0)]);
      }
      return st;
    },
  };

  /* ---- facades ---- */
  const op = (t, x0, x1, y0, y1, o = {}) => ({ t, x0, x1, y0, y1, ...o });
  const centres = (x0, x1, n) => Array.from({ length: n }, (_, i) => lerp(x0, x1, (i + 0.5) / n));

  function lattice(s, x0, x1, y0, y1, z, { n = 7, f = 0.05, col = '#a98a6a', slat = '#c8a884', t = 0.035, rails = 1 } = {}) {
    s.hbar(x0, x1, y1 - f, y1, z - t, z + t, 'wood', col); s.hbar(x0, x1, y0, y0 + f, z - t, z + t, 'wood', col);
    s.vbar(x0, x0 + f, y0, y1, z - t, z + t, 'wood', col); s.vbar(x1 - f, x1, y0, y1, z - t, z + t, 'wood', col);
    for (let i = 1; i < n; i++) { const x = lerp(x0, x1, i / n); s.vbar(x - 0.014, x + 0.014, y0 + f, y1 - f, z - t * 0.6, z + t * 0.6, 'wood', slat); }
    for (let i = 1; i <= rails; i++) { const y = lerp(y0, y1, i / (rails + 1)); s.hbar(x0, x1, y - 0.014, y + 0.014, z - t * 0.7, z + t * 0.7, 'wood', slat); }
  }
  function glassPanel(s, x0, x1, y0, y1, z, { f = 0.05, col = '#a98a6a', mull = 2, kick = 0.3, panes = true } = {}) {
    s.hbar(x0, x1, y1 - f, y1, z - 0.03, z + 0.03, 'wood', col); s.box(x0, x1, y0, y0 + kick, z - 0.03, z + 0.03, 'wood', col);
    s.vbar(x0, x0 + f, y0, y1, z - 0.03, z + 0.03, 'wood', col); s.vbar(x1 - f, x1, y0, y1, z - 0.03, z + 0.03, 'wood', col);
    for (let i = 1; i < mull; i++) { const y = lerp(y0 + kick, y1, i / mull); s.hbar(x0, x1, y - 0.014, y + 0.014, z - 0.02, z + 0.02, 'wood', col); }
    if (panes) { s.rect(x0 + f, x1 - f, y0 + kick, y1 - f, z, 'glass'); glint(s, x0 + f, x1 - f, y0 + kick, y1 - f, z + 0.002); }
  }
  function glint(s, x0, x1, y0, y1, z) { const w = x1 - x0, a = x0 + w * 0.28, h = y1 - y0; s.quad([a, y0 + h * 0.08, z], [a + w * 0.24, y0 + h * 0.08, z], [a + w * 0.44, y1 - h * 0.08, z], [a + w * 0.2, y1 - h * 0.08, z], 'glass', [1.7, 1.9, 1.8]); }
  const DARKROOM = '#37474c';

  function drawOpening(T, side, o) {
    const s = side.s, { x0, x1, y0, y1 } = o, r = T.rng, C = T.C, mx = (x0 + x1) / 2, w = x1 - x0, h = y1 - y0;
    const back = (col = DARKROOM, z = -0.5) => s.rect(x0 - 0.02, x1 + 0.02, y0 - 0.02, y1 + 0.02, z, 'flat', col);
    const sill = () => s.box(x0 - 0.08, x1 + 0.08, y0 - 0.06, y0, -0.04, 0.09, 'wood', C.frame);
    switch (o.t) {
      case 'lattice': back(); lattice(s, x0 + 0.01, x1 - 0.01, y0, y1, -0.05, { n: Math.max(5, Math.round(w / 0.12)), col: C.frame, slat: C.slat, rails: h > 1.2 ? 2 : 1 }); s.box(x0 - 0.05, x1 + 0.05, y0 - 0.05, y0, -0.1, 0.09, 'wood', C.beam); break;
      case 'mushiko': back(); s.hbar(x0, x1, y1 - 0.05, y1, -0.05, 0.02, 'wood', C.beam); s.hbar(x0, x1, y0, y0 + 0.05, -0.05, 0.02, 'wood', C.beam); for (let i = 0; i < Math.round(w / 0.13); i++) { const x = lerp(x0 + 0.06, x1 - 0.06, i / (Math.round(w / 0.13) - 1 || 1)); s.vbar(x - 0.018, x + 0.018, y0, y1, -0.05, 0, 'wood', C.frame); } break;
      case 'shoji': { back(); const g = sh.atlas.quad(w - 0.04, h - 0.04, 'shoji'); s.add(g, 'atlas', { pos: [mx, (y0 + y1) / 2, -0.06] }); s.hbar(x0, x1, y1 - 0.05, y1, -0.08, 0, 'wood', C.frame); s.hbar(x0, x1, y0, y0 + 0.05, -0.08, 0, 'wood', C.frame); s.vbar(mx - 0.02, mx + 0.02, y0, y1, -0.08, -0.02, 'wood', C.frame); if (r() < 0.5) s.rect(mx + 0.1, mx + 0.44, y0 + h * 0.3, y0 + h * 0.62, -0.055, 'flat', DARKROOM); sill(); break; }
      case 'sliding': {
        back(); const m = lerp(x0, x1, 0.5), openBy = r.range(0.2, 0.75);
        glassPanel(s, x0 + 0.01, m + 0.02, y0, y1 - 0.02, -0.03, { col: C.frame, mull: 3, kick: 0.3 }); glassPanel(s, lerp(m - 0.02, x0 + 0.06, openBy), lerp(x1 - 0.01, m + 0.22, openBy), y0, y1 - 0.02, -0.1, { col: C.frame, mull: 3, kick: 0.3 });
        s.box(x0 - 0.06, x1 + 0.06, y0 - 0.04, y0, -0.14, 0.04, 'wood', C.beam); break;
      }
      case 'shop': {
        const D = Math.min(1.2, T.d * 0.3); s.quad([x0, y0, 0], [x1, y0, 0], [x1, y0, -D], [x0, y0, -D], 'flat', '#b6ad96'); s.rect(x0 - 0.02, x1 + 0.02, y0, y1, -D, 'flat', '#857566');
        s.quad([x0, y0, -D], [x0, y0, 0], [x0, y1, 0], [x0, y1, -D], 'flat', '#8f8270'); s.quad([x1, y0, 0], [x1, y0, -D], [x1, y1, -D], [x1, y1, 0], 'flat', '#8f8270');
        const cell = 'goods' + r.int(0, 2), rows = h > 1.8 ? 3 : 2;
        for (let i = 0; i < rows; i++) { const yy = y0 + 0.34 + i * 0.62; s.add(sh.atlas.quad(w - 0.12, 0.54, cell), 'atlas', { pos: [mx, yy + 0.27, -D + 0.03] }); s.box(x0 + 0.04, x1 - 0.04, yy - 0.03, yy, -D + 0.02, -D + 0.34, 'wood', '#a98a6a'); }
        const n = Math.max(2, Math.round(w / 0.85));
        for (let i = 0; i < n; i++) glassPanel(s, lerp(x0, x1, i / n), lerp(x0, x1, (i + 1) / n), y0, y1, -0.02, { col: C.frame, mull: 2, kick: 0.24, panes: !(o.smashed && i === o.smashed - 1) });
        if (o.smashed) { const a = lerp(x0, x1, (o.smashed - 1) / n); shards(s, a, a + w / n, y0 + 0.24, y1, -0.02, r); }
        break;
      }
      case 'roll': {
        back('#3a4a4c', -0.7); const bottom = lerp(y0 + 0.75, y1 - 0.5, o.openAt ?? r.range(0.15, 0.7));
        s.box(x0 - 0.1, x1 + 0.1, y1, y1 + 0.3, -0.02, 0.18, 'worn', '#8d9ba4');
        const n = Math.round((y1 - bottom) / 0.14);
        s.box(x0, x1, bottom, y1, -0.08, -0.04, 'worn', '#a8b4b4');
        for (let i = 0; i < n; i++) { const y = bottom + (i + 0.5) * 0.14; s.hbar(x0, x1, y, y + 0.03, -0.04, -0.02, 'worn', shade('#a8b4b4', 0.78)); }
        s.box(x0, x1, bottom - 0.05, bottom + 0.02, -0.08, 0, 'worn', '#6f7a7e');
        s.vbar(x0 - 0.07, x0, y0, y1, -0.08, 0.03, 'worn', '#6f7a7e'); s.vbar(x1, x1 + 0.07, y0, y1, -0.08, 0.03, 'worn', '#6f7a7e');
        if (o.graffiti !== false && h > 1.6 && r() < 0.6) s.add(sh.atlas.quad(Math.min(1.4, w * 0.7), 0.5, 'graffiti'), 'atlas', { pos: [mx, bottom + (y1 - bottom) * 0.55, -0.015] });
        break;
      }
      case 'sash': case 'broken': {
        back(); const f = 0.05, broken = o.t === 'broken'; sill();
        s.hbar(x0, x1, y1 - f, y1, -0.08, 0, 'wood', C.frame); s.hbar(x0, x1, y0, y0 + f, -0.08, 0, 'wood', C.frame); s.vbar(x0, x0 + f, y0, y1, -0.08, 0, 'wood', C.frame); s.vbar(x1 - f, x1, y0, y1, -0.08, 0, 'wood', C.frame);
        if (h > 0.9) s.hbar(x0, x1, (y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02, -0.08, -0.01, 'wood', C.frame);
        if (w > 0.8) s.vbar(mx - 0.018, mx + 0.018, y0, y1, -0.08, -0.01, 'wood', C.frame);
        if (o.curtain ?? r() < 0.55) { const cw = w * r.range(0.32, 0.5), left = r() < 0.5, g = sh.atlas.quad(cw, h - 0.1, r.pick(['curtain', 'curtain2'])); s.add(g, 'atlas', { pos: [left ? x0 + cw / 2 + 0.04 : x1 - cw / 2 - 0.04, (y0 + y1) / 2, -0.2], rot: [0, 0, r.range(-0.02, 0.02)] }); }
        if (!broken) { s.rect(x0 + f, x1 - f, y0 + f, y1 - f, -0.045, 'glass'); glint(s, x0 + f, x1 - f, y0 + f, y1 - f, -0.043); }
        else { shards(s, x0 + f, x1 - f, y0 + f, y1 - f, -0.045, r); ballLeaves(s, r, [mx + r.range(-0.2, 0.2), y0 + 0.12, 0.1], 0.3, 0.26, 12, { s: 0.22, core: false }); }
        break;
      }
      case 'boarded': {
        back(); sill(); for (let i = 0; i < 3; i++) { const yy = lerp(y0 + 0.14, y1 - 0.14, i / 2), t = r.range(-0.1, 0.1); s.beam([x0 - 0.08, yy - t, 0.04], [x1 + 0.08, yy + t, 0.04], 0.15, 0.03, 'wood', r.pick([CEDAR.pale, CEDAR.silver, '#c8a884'])); } break;
      }
      case 'bars': { back(); s.hbar(x0, x1, y1 - 0.06, y1, -0.09, 0, 'wood', C.beam); s.hbar(x0, x1, y0, y0 + 0.06, -0.09, 0, 'wood', C.beam); for (const x of centres(x0, x1, 4)) s.rod([x, y0, -0.05], [x, y1, -0.05], 0.018, 'worn', '#4a5056', 5, 0.018, true); break; }
      case 'door': case 'bigdoor': {
        back(DARKROOM, -0.3);
        const big = o.t === 'bigdoor', col = o.col || T.C.door;
        if (big && r() < 0.45) { // one leaf slid aside
          const left = r() < 0.5, m = mx + (left ? 0.15 : -0.15) * w, d0 = left ? x0 : m, d1 = left ? m : x1;
          s.box(d0, d1, y0, y1 - 0.04, -0.06, -0.02, big ? 'worn' : 'wood', col); for (let x = d0 + 0.14; x < d1 - 0.05; x += 0.28) s.vbar(x - 0.02, x + 0.02, y0, y1 - 0.04, -0.02, 0, big ? 'worn' : 'wood', shade(col, 0.8));
        } else {
          s.box(x0 + 0.01, x1 - 0.01, y0, y1 - 0.02, -0.06, -0.02, big ? 'worn' : 'wood', col);
          for (let x = x0 + (big ? 0.2 : 0.14); x < x1 - 0.05; x += big ? 0.32 : 0.28) s.vbar(x - 0.018, x + 0.018, y0, y1 - 0.02, -0.02, 0, big ? 'worn' : 'wood', shade(col, 0.8));
          if (!big) { s.rect(x0 + 0.14, x1 - 0.14, y0 + h * 0.62, y0 + h * 0.86, -0.015, 'glass'); s.add(kit.sphere(0.035, 6, 4), 'flat', { pos: [x1 - 0.12, y0 + 1, 0.02], color: '#c9a24e' }); }
          else { s.hbar(x0, x1, y0 + h * 0.5 - 0.03, y0 + h * 0.5 + 0.03, -0.02, 0.01, 'worn', shade(col, 0.72)); s.hbar(x0, x1, y1 - 0.14, y1 - 0.09, -0.02, 0.05, 'worn', '#6f7a7e'); }
        }
        s.box(x0 - 0.05, x1 + 0.05, y1 - 0.02, y1 + 0.08, -0.08, 0.05, 'wood', C.beam);
        break;
      }
      default: throw new Error(`housekit: unknown opening "${o.t}"`);
    }
    if (o.noren) props.noren(s, x0 + 0.04, x1 - 0.04, y1 + 0.02, o.noren, r, Math.min(0.78, h * 0.42));
  }
  function shards(s, x0, x1, y0, y1, z, r) {
    const tri = (p, q, t) => s.quad(p, q, t, t, 'glass');
    tri([x0, y1, z], [x0 + (x1 - x0) * r.range(0.25, 0.5), y1, z], [x0, y1 - (y1 - y0) * r.range(0.25, 0.55), z]);
    tri([x1, y1, z], [x1, y1 - (y1 - y0) * r.range(0.2, 0.45), z], [x1 - (x1 - x0) * r.range(0.2, 0.5), y1, z]);
    tri([x0, y0, z], [x0 + (x1 - x0) * r.range(0.3, 0.7), y0, z], [x0 + (x1 - x0) * r.range(0.05, 0.3), y0 + (y1 - y0) * r.range(0.15, 0.4), z]);
  }

  /* ---- kinds: defaults and seeded variety. Each returns a spec; the opening plan needs T, so it is a function of T. ---- */
  const defaultBack = (T, n = 1) => { const { w, fl, r } = T, a = -w / 2 + 0.3, b = w / 2 - 0.3; const list = [op('door', a + 0.05, a + 0.9, fl, fl + 1.98)]; centres(a + 1.05, b, n).forEach((x) => list.push(op(r() < 0.3 ? 'boarded' : r() < 0.4 ? 'broken' : 'sash', x - 0.42, x + 0.42, fl + 0.95, fl + 1.85))); return list; };
  const sideWindows = (T, len, n = 1, y0 = 1.15, y1 = 1.95, t) => centres(-len / 2 + 0.4, len / 2 - 0.4, n).map((x) => op(t || (T.r() < 0.18 ? 'boarded' : T.r() < 0.25 ? 'broken' : 'sash'), x - 0.4, x + 0.4, T.fl + y0 - 0.2, T.fl + y1 - 0.2));

  const KINDS = {
    shophouse: (r, b) => ({
      wall: r.pick(['board', 'plaster', 'mortar', 'board', 'brick']), party: ['left', 'right'], roof: r() < 0.82 ? 'kawara' : 'tin', pitch: 0.42, es: 0.05, ef: 0.42, eb: 0.32, hisashi: r() < 0.72, falseFront: r() < 0.3, timbers: true,
      sign: { cell: H.nextSign() }, vsign: r() < 0.45 ? H.nextVSign() : null,
      open: (T) => {
        const { w, fl, r } = T, a = -w / 2 + 0.2, b = w / 2 - 0.2, top = fl + 2.08, m = lerp(a, b, r.range(0.44, 0.6)), v = r.int(0, 3), noren = r() < 0.5 ? H.nextNoren() : undefined;
        const front = v === 0 ? [op('lattice', a, m - 0.05, fl + 0.72, top), op('sliding', m + 0.05, b, fl, top, { noren })] : v === 1 ? [op('shop', a, m + 0.3, fl + 0.02, top, { smashed: r() < 0.5 ? 1 : 0 }), op('door', m + 0.4, b, fl, top, { noren })] : v === 2 ? [op('roll', a, b, fl, top - 0.06)] : [op('shop', a, b - 0.9, fl + 0.02, top), op('sliding', b - 0.82, b, fl, top)];
        const hu = T.eaveY - T.f2;
        if (T.f2) { if (hu < 1.1) front.push(op('mushiko', a + 0.4, b - 0.4, T.f2 + 0.16, T.eaveY - 0.2)); else if (r() < 0.5) front.push(op(r() < 0.5 ? 'sash' : 'broken', -0.95, -0.1, T.f2 + 0.42, T.f2 + 1.28), op(r() < 0.4 ? 'boarded' : 'sash', 0.1, 0.95, T.f2 + 0.42, T.f2 + 1.28)); else front.push(op('shoji', a + 0.35, b - 0.35, T.f2 + 0.42, T.f2 + 1.3)); }
        return { front, back: defaultBack(T, T.w > 3 ? 2 : 1), left: [], right: [] };
      },
    }),
    townhouse: (r) => ({
      wall: r.pick(['plaster', 'board', 'mortar', 'board', 'tinsheet']), band: r() < 0.5 ? { type: 'board', h: 0.95 } : null, party: ['left', 'right'], roof: r() < 0.75 ? 'kawara' : 'tin', pitch: 0.44, es: 0.06, ef: 0.36, eb: 0.32, hisashi: r() < 0.55, balcony: r() < 0.45, timbers: r() < 0.7,
      open: (T) => {
        const { w, fl, r } = T, a = -w / 2 + 0.28, b = w / 2 - 0.28, top = fl + 2.02, doorW = 1.45, left = r() < 0.5;
        const d0 = left ? a : b - doorW, d1 = d0 + doorW, wnd0 = left ? d1 + 0.2 : a, wnd1 = left ? b : d0 - 0.2;
        const front = [op('sliding', d0, d1, fl, top, { noren: r() < 0.25 ? H.nextNoren() : undefined }), op(r() < 0.6 ? 'lattice' : 'sash', wnd0, wnd1, fl + 0.82, top - 0.12)];
        if (T.f2) { const yb = T.f2 + 0.3, yt = Math.min(T.eaveY - 0.22, yb + 1.1); if (w > 2.9) front.push(op(r() < 0.3 ? 'broken' : 'sash', -1.05, -0.12, yb, yt), op(r() < 0.3 ? 'shoji' : 'sash', 0.12, 1.05, yb, yt)); else front.push(op('shoji', -0.8, 0.8, yb, yt)); }
        return { front, back: defaultBack(T, 1), left: [], right: [] };
      },
    }),
    cottage: (r, b) => {
      const roof = r.pick(['kawara', 'kawara', 'kawara', 'tin', 'tin', 'thatch']);
      return {
        wall: r.pick(['board', 'plaster', 'mortar', 'board', 'boardv', 'tinsheet']), band: r() < 0.45 ? { type: r.pick(['board', 'tile', 'mortar']), h: 0.8 } : null, roof, shape: roof === 'thatch' ? 'hip' : r() < 0.3 ? 'hip' : 'gable', ridge: r() < 0.65 ? 'x' : 'z', pitch: roof === 'thatch' ? 0.95 : r.range(0.46, 0.62), es: 0.28, ef: 0.42, eb: 0.36, timbers: r() < 0.7, porch: r() < 0.55,
        open: (T) => {
          const { w, d, fl, r } = T, a = -w / 2 + 0.3, b = w / 2 - 0.3, top = fl + 1.98, v = r.int(0, 2), doorX = r.range(-0.2, 0.2) * w;
          const front = v === 0 ? [op('door', doorX - 0.45, doorX + 0.45, fl, top), op('sash', a, doorX - 0.6, fl + 0.85, fl + 1.8), op(r() < 0.4 ? 'broken' : 'sash', doorX + 0.6, b, fl + 0.85, fl + 1.8)] : v === 1 ? [op('sliding', a, a + 1.6, fl, top), op('shoji', a + 1.8, b, fl + 0.7, top - 0.15)] : [op('sliding', a, b - 1.4, fl, top), op('lattice', b - 1.25, b, fl + 0.82, top - 0.2)];
          return { front, back: defaultBack(T, 1), left: sideWindows(T, d, 1), right: sideWindows(T, d, r.int(1, 2)) };
        },
      };
    },
    farmhouse: (r) => ({
      wall: r.pick(['board', 'plaster', 'boardv']), band: { type: 'board', h: 1 }, roof: r() < 0.7 ? 'thatch' : 'kawara', shape: 'hip', ridge: 'x', pitch: 1.05, es: 0.5, ef: 0.55, eb: 0.5, eaveY: 2.5, timbers: true, foundationH: 0.42,
      open: (T) => { const { w, d, fl, r } = T, a = -w / 2 + 0.4, b = w / 2 - 0.4, top = fl + 1.82; return { front: [op('sliding', a, a + 2.3, fl, top), op('shoji', a + 2.5, b - 1.7, fl + 0.1, top), op('sliding', b - 1.5, b, fl, top)], back: defaultBack(T, 2), left: sideWindows(T, d, 1), right: sideWindows(T, d, 1, 1.1, 1.7) }; },
    }),
    kura: (r) => ({
      wall: 'plaster', wallCol: r.pick(['#ece6d6', '#e4dfd0', '#ded6c2']), band: { type: 'namako', h: r.range(0.9, 1.25) }, roof: 'kawara', pitch: 0.52, es: 0.22, ef: 0.3, eb: 0.3, timbers: false, thick: true, foundationH: 0.32, tints: TILE_TINTS[r.int(0, 1)],
      open: (T) => { const { h, d, fl, r } = T; return { front: [op('bigdoor', -0.55, 0.55, fl, fl + 1.9, { col: '#6f6a5e' })], back: [], left: [op('bars', -0.4, 0.4, T.eaveY - 1.05, T.eaveY - 0.42)], right: [op('bars', -0.4, 0.4, T.eaveY - 1.05, T.eaveY - 0.42)] }; },
    }),
    shed: (r) => ({
      wall: r.pick(['tinsheet', 'boardv', 'board', 'tinsheet']), roof: 'tin', shape: r() < 0.55 ? 'mono' : 'gable', pitch: 0.34, es: 0.14, ef: 0.26, eb: 0.2, f2Off: true, foundationH: 0.1,
      open: (T) => { const { w, fl, r } = T; return { front: [op('door', -0.55, 0.45, fl, fl + 1.9, { col: r.pick(['#8d8270', '#7d8b90', '#a89f8c']) })], back: [], left: r() < 0.5 ? sideWindows(T, T.d, 1, 1.1, 1.75) : [], right: sideWindows(T, T.d, 1, 1.1, 1.75) }; },
    }),
    barn: (r) => ({
      wall: r.pick(['boardv', 'board']), roof: 'tin', pitch: 0.55, es: 0.22, ef: 0.3, eb: 0.3, foundationH: 0.14, f2Off: true,
      open: (T) => { const { w, fl, r } = T, top = fl + 2.3; return { front: [op('bigdoor', -0.95, 0.95, fl, top, { col: '#8d8270' }), op('boarded', -0.42, 0.42, Math.min(T.eaveY + 0.2, T.h - 1.0), Math.min(T.eaveY + 0.74, T.h - 0.45))], back: [], left: sideWindows(T, T.d, 1, 1.5, 2.1), right: [] }; },
    }),
    watermill: (r) => ({
      wall: 'board', band: { type: 'mortar', h: 0.7, col: '#a9a596' }, roof: 'kawara', pitch: 0.5, es: 0.28, ef: 0.34, eb: 0.3, timbers: false, f2Off: true, sign: { cell: 'mill' },
      open: (T) => ({ front: [op('sliding', -1.05, 0.2, T.fl, T.fl + 1.95), op('mushiko', 0.45, 1.25, T.fl + 0.95, T.fl + 1.65)], back: [], left: sideWindows(T, T.d, 1), right: [] }),
    }),
    inn: (r) => ({
      wall: r.pick(['plaster', 'board']), band: { type: 'board', h: 0.9 }, roof: 'kawara', shape: r() < 0.5 ? 'hip' : 'gable', pitch: 0.46, es: 0.3, ef: 0.44, eb: 0.34, hisashi: true, balcony: true, timbers: true, sign: { cell: 'inn' }, vsign: 'v4', detail: 'hi',
      open: (T) => { const { w, fl, r } = T, a = -w / 2 + 0.4, b = w / 2 - 0.4, top = fl + 2.02, front = [op('sliding', -0.85, 0.85, fl, top, { noren: 'n8' }), op('lattice', a, -1.05, fl + 0.72, top - 0.1), op('lattice', 1.05, b, fl + 0.72, top - 0.1)]; if (T.f2) centres(a, b, 3).forEach((x, i) => front.push(op(i === 1 && r() < 0.5 ? 'broken' : 'shoji', x - 0.8, x + 0.8, T.f2 + 0.28, Math.min(T.eaveY - 0.2, T.f2 + 1.3)))); return { front, back: defaultBack(T, 3), left: sideWindows(T, T.d, 1), right: sideWindows(T, T.d, 1) }; },
    }),
    hall: (r) => ({
      wall: r.pick(['plaster', 'mortar', 'board']), band: { type: 'tile', h: 0.7, col: '#c9dcd6' }, roof: 'kawara', pitch: 0.55, ridge: 'z', es: 0.34, ef: 0.5, eb: 0.3, timbers: false, porch: true, sign: { cell: 'hall', y: 2.75 },
      open: (T) => { const { w, fl, r } = T; return { front: [op('door', -0.65, 0.65, fl, fl + 2.1, { col: '#7a5c46' }), op('sash', -w / 2 + 0.4, -0.95, fl + 0.85, fl + 2), op('sash', 0.95, w / 2 - 0.4, fl + 0.85, fl + 2)], back: [], left: centres(-T.d / 2 + 0.4, T.d / 2 - 0.4, 2).map((x) => op('sash', x - 0.48, x + 0.48, fl + 0.8, fl + 2)), right: centres(-T.d / 2 + 0.4, T.d / 2 - 0.4, 2).map((x) => op(r() < 0.5 ? 'broken' : 'sash', x - 0.48, x + 0.48, fl + 0.8, fl + 2)) }; },
    }),
    workshop: (r) => ({
      wall: r.pick(['brick', 'tinsheet']), band: { type: 'concrete', h: 0.55 }, roof: 'sawtooth', eaveY: 3.3, es: 0.08, ef: 0, eb: 0, f2Off: true, timbers: false, sign: { cell: 'works', y: 3.5, w: 2.8, h: 0.52 },
      open: (T) => { const { w, d, fl, r } = T; return { front: [op('roll', -w / 2 + 0.7, -w / 2 + 3.5, fl, fl + 2.7, { openAt: 0.55 }), op('bigdoor', w / 2 - 3.2, w / 2 - 0.9, fl, fl + 2.6, { col: '#7f9a9a' }), op('sash', -0.75, 0.75, fl + 1.1, fl + 2.3)], back: centres(-w / 2 + 0.6, w / 2 - 0.6, 3).map((x) => op('sash', x - 0.6, x + 0.6, fl + 1.2, fl + 2.3)), left: centres(-d / 2 + 0.5, d / 2 - 0.5, 2).map((x) => op(r() < 0.5 ? 'broken' : 'sash', x - 0.6, x + 0.6, fl + 1.1, fl + 2.3)), right: centres(-d / 2 + 0.5, d / 2 - 0.5, 2).map((x) => op('sash', x - 0.6, x + 0.6, fl + 1.1, fl + 2.3)) }; },
    }),
    warehouse: (r) => ({
      wall: 'tinsheet', roof: 'tin', ridge: 'z', pitch: 0.28, es: 0.14, ef: 0.26, eb: 0.2, f2Off: true, foundationH: 0.36, sign: { cell: 'ware', y: 3, w: 2.2, h: 0.5 },
      open: (T) => ({ front: [op('roll', -1.45, 1.45, T.fl, T.fl + 2.5, { openAt: 0.5 })], back: [], left: [], right: [op('sash', -0.8, 0.8, T.fl + 1.4, T.fl + 2.2)] }),
    }),
    office: (r) => ({
      wall: 'concrete', roof: 'flat', es: 0, ef: 0, eb: 0, f2Off: true, timbers: false, foundationH: 0.14,
      open: (T) => { const { w, fl, r } = T; return { front: [op('door', -w / 2 + 0.4, -w / 2 + 1.3, fl, fl + 2.05, { col: '#6f9fb0' }), op('sash', 0.1, w / 2 - 0.35, fl + 0.82, fl + 2.1)], back: [op('sash', -0.7, 0.7, fl + 1, fl + 2)], left: sideWindows(T, T.d, 1), right: sideWindows(T, T.d, 1) }; },
    }),
    clinic: (r) => ({
      wall: r.pick(['mortar', 'plaster']), wallCol: r.pick(['#d6cfbc', '#a9d0bb', '#d9d8c8']), band: { type: 'tile', h: 0.7, col: '#dfeae4' }, roof: r() < 0.5 ? 'flat' : 'kawara', pitch: 0.42, es: 0.2, ef: 0.3, eb: 0.26, timbers: false, f2Off: true, sign: { cell: 'clinic', y: 2.74 },
      open: (T) => { const { w, fl, r } = T, a = -w / 2 + 0.38, b = w / 2 - 0.38; return { front: [op('door', -0.6, 0.6, fl, fl + 2.08), op('sash', a, -0.85, fl + 0.85, fl + 2.08, { curtain: true }), op(r() < 0.5 ? 'broken' : 'sash', 0.85, b, fl + 0.85, fl + 2.08, { curtain: true })], back: defaultBack(T, 2), left: sideWindows(T, T.d, 1), right: sideWindows(T, T.d, 1) }; },
    }),
    postoffice: (r) => ({
      wall: r.pick(['mortar', 'plaster', 'brick']), band: { type: 'tile', h: 0.55, col: '#c9dcd6' }, roof: 'flat', es: 0, ef: 0, eb: 0, f2Off: true, timbers: false, sign: { cell: 'post', y: 2.66 },
      open: (T) => { const { w, fl, r } = T; return { front: [op('sliding', -0.75, 0.75, fl, fl + 2.08), op('sash', -w / 2 + 0.34, -1, fl + 0.85, fl + 2.05), op('sash', 1, w / 2 - 0.34, fl + 0.85, fl + 2.05)], back: defaultBack(T, 2), left: sideWindows(T, T.d, 1), right: sideWindows(T, T.d, 1) }; },
    }),
    school: (r) => ({
      wall: 'board', wallCol: r.pick(['#a39073', '#8d8270']), band: { type: 'concrete', h: 0.45 }, roof: 'kawara', detail: 'lo', ridge: 'x', pitch: 0.45, es: 0.22, ef: 0.34, eb: 0.34, eaveY: 3.65, timbers: false, porch: true,
      open: (T) => { const { w, fl, r } = T, n = Math.floor((w - 1.2) / 2.0), xs = centres(-w / 2 + 0.6, w / 2 - 0.6, n), front = [], back = []; xs.forEach((x, i) => { const center = Math.abs(x) < 1; if (center) front.push(op('sliding', x - 0.75, x + 0.75, fl, fl + 2)); else front.push(op(r() < 0.14 ? 'broken' : 'sash', x - 0.8, x + 0.8, fl + 0.8, fl + 1.86, { curtain: false })); if (T.f2) front.push(op(r() < 0.2 ? 'broken' : 'sash', x - 0.8, x + 0.8, T.f2 + 0.2, Math.min(T.eaveY - 0.14, T.f2 + 0.95), { curtain: false })); back.push(op('sash', x - 0.7, x + 0.7, fl + 0.8, fl + 1.7, { curtain: false })); }); return { front, back, left: sideWindows(T, T.d, 1), right: sideWindows(T, T.d, 1) }; },
    }),
    boathouse: (r) => ({
      wall: 'board', wallCol: CEDAR.silver, roof: 'tin', shape: 'gable', pitch: 0.4, es: 0.2, ef: 0.34, eb: 0.2, foundationH: 0.16, f2Off: true, sign: { cell: 'boat', y: 2.46, w: 1.9, h: 0.42 },
      open: (T) => ({ front: [op('bigdoor', -1.2, 1.2, T.fl, T.fl + 2, { col: '#7a6a58' })], back: [], left: sideWindows(T, T.d, 1), right: [] }),
    }),
  };

  /* ---- walls ---- */
  function chainOf(T, side) {
    const { h, eaveY, spec } = T, half = side.len / 2;
    if (spec.roof === 'flat') return [[half, h], [-half, h]];
    if (spec.roof === 'sawtooth') {
      const low = eaveY, n = T.teeth;
      if (side.name === 'front' || side.name === 'back') { const sg = side.name === 'front' ? 1 : -1, out = []; const X = (i) => lerp(-T.w / 2, T.w / 2, i / n); for (let i = n; i >= 0; i--) { const xw = X(i); if (i < n) out.push([xw * sg + 1e-3, h]); out.push([xw * sg, low]); } if (sg < 0) out.reverse(); return out; }
      return [[half, side.name === 'right' ? h : low], [-half, side.name === 'right' ? h : low]];
    }
    if (spec.falseFront && side.name === 'front') { const top = typeof spec.falseFront === 'number' ? spec.falseFront : h - 0.05, step = Math.min(0.5, side.len * 0.12); const low = Math.max(eaveY + 0.2, top - 0.42), rise = 2e-3; return [[half, low], [half - step + rise, low], [half - step, top], [-half + step, top], [-half + step - rise, low], [-half, low]]; } // the step is a real one: a tiny run in x, so the outline can't collapse it into a slanted top
    if (spec.shape === 'hip') return [[half, eaveY], [-half, eaveY]];
    if (spec.shape === 'mono') { const hi = h - 0.06; if (side.name === 'front') return [[half, eaveY], [-half, eaveY]]; if (side.name === 'back') return [[half, hi], [-half, hi]]; return side.name === 'right' ? [[half, hi], [-half, eaveY]] : [[half, eaveY], [-half, hi]]; }
    const along = spec.ridge === 'x' ? side.name === 'front' || side.name === 'back' : side.name === 'left' || side.name === 'right';
    return along ? [[half, eaveY], [-half, eaveY]] : [[half, eaveY], [0, h - 0.1], [-half, eaveY]];
  }
  function chainY(chain, u) { for (let i = 0; i < chain.length - 1; i++) { const [a, ay] = chain[i], [b, by] = chain[i + 1]; if (u <= a && u >= b) return a === b ? Math.max(ay, by) : lerp(by, ay, (u - b) / (a - b)); } return chain[chain.length - 1][1]; }
  /** Where the corner has come down: end (±1) is which end of this wall, cr how far along. Returns cap(u). */
  function collapseCap(side, c, y0) {
    if (!c) return null;
    const { sx, sz, r: cr } = c, end = side.name === 'front' ? (sz > 0 ? sx : 0) : side.name === 'back' ? (sz < 0 ? -sx : 0) : side.name === 'right' ? (sx > 0 ? -sz : 0) : sx < 0 ? sz : 0;
    if (!end) return null;
    const half = side.len / 2, rng = c.rng, steps = [0.08, 0.26, 0.5, 0.74, 1].map((t, i) => [t, (i === 4 ? 1 : rng.range(0.82, 1.14))]), hi = c.height, lo = c.low;
    return (u) => { const t = (half - u * end) / Math.min(cr, side.len * 0.8); if (t >= 1) return 1e3; let k = 0; for (const [p, j] of steps) if (t <= p) { k = lo + (hi - lo) * Math.pow(p, 1.4) * j; break; } return Math.max(y0 + 0.28, k); };
  }
  function buildOutline(T, side) {
    const y0 = T.spec.foundationTop, chain = chainOf(T, side), half = side.len / 2, cap = side.cap;
    let keys = chain.map((p) => p[0]);
    if (cap) for (let u = -half; u <= half + 1e-3; u += 0.16) keys.push(u);
    keys = [...new Set(keys.map((k) => +k.toFixed(4)))].sort((a, b) => b - a);
    const top = keys.map((u) => [u, Math.min(chainY(chain, u), cap ? cap(u) : 1e3)]);
    // keep the step vertical where a cap's stair changes level
    return [[-half, y0], [half, y0], ...top];
  }

  function skinWall(T, side, type) {
    const { s, outline, ops } = side, y0 = T.spec.foundationTop, r = T.r, half = side.len / 2, maxY = Math.max(...outline.map((p) => p[1]));
    const cuts = (a, b, m) => ops.filter((o) => o.y1 + m > a && o.y0 - m < b).map((o) => [o.x0 - m, o.x1 + m]);
    if (type === 'board') {
      const H0 = 0.25, base = T.spec.wallCol || r.pick([CEDAR.dark, CEDAR.mid, CEDAR.dark, CEDAR.silver]);
      for (let y = y0 + 0.03; y < maxY - 0.04; y += H0) {
        const top = y + H0 * 1.14, spansY = intersect(slice(outline, y + 0.002, 1), slice(outline, Math.min(top, maxY - 0.002), 1)), spans = subtract(spansY, cuts(y, top, 0.03));
        for (const [a, b] of spans) {
          let x = a; while (x < b - 0.02) {
            const end = Math.min(b, x + (side.len > 8 ? r.range(2.6, 4.6) : r.range(1.6, 3.2))), miss = r() < 0.02 + T.decay.level * 0.05;
            if (!miss) { const c = shade(base, r.range(0.92, 1.08)); s.quad([x, y, 0.038], [end, y, 0.038], [end, top, 0.012], [x, top, 0.012], 'wood', c); s.quad([x, y, 0], [end, y, 0], [end, y, 0.038], [x, y, 0.038], 'wood', shade(c, 0.66)); }
            x = end;
          }
        }
      }
    }
    if (type === 'boardv') {
      const base = T.spec.wallCol || r.pick([CEDAR.silver, CEDAR.pale, CEDAR.mid]), step = 0.3;
      for (let x = -half + 0.1; x < half; x += step) {
        const cols = subtract(slice(outline, x, 0), ops.filter((o) => x > o.x0 - 0.05 && x < o.x1 + 0.05).map((o) => [o.y0 - 0.05, o.y1 + 0.05]));
        for (const [a, b] of cols) { if (r() < 0.02 + T.decay.level * 0.04) continue; const c = shade(base, r.range(0.88, 1.12)); s.vbar(x - 0.13, x + 0.13, a, b, 0, 0.02, 'flat', c); s.vbar(x + 0.13, x + 0.17, a, b, 0, 0.04, 'flat', shade(c, 0.72)); }
      }
    }
    if (type === 'tinsheet') {
      const base = T.spec.wallCol || r.pick(['#8f9896', '#a0705a', '#7f9a9a', '#b5522f', '#8d8270']), per = 0.16;
      for (let x = -half + 0.005; x < half - per * 0.5; x += per) {
        const cols = subtract(slice(outline, x + per / 2, 0), ops.filter((o) => x + per > o.x0 - 0.02 && x < o.x1 + 0.02).map((o) => [o.y0, o.y1]));
        const sheet = shade(base, 0.9 + 0.2 * (0.5 + 0.5 * Math.sin(Math.floor(x / 0.8) * 3.7 + T.seedN)));
        for (const [a, b] of cols) { const x1 = x + per / 2, x2 = x + per, up = shade(sheet, 1.1), dn = shade(sheet, 0.78); s.quad([x, a, 0.002], [x1, a, 0.036], [x1, b, 0.036], [x, b, 0.002], 'worn', up); s.quad([x1, a, 0.036], [x2, a, 0.002], [x2, b, 0.002], [x1, b, 0.036], 'worn', dn); }
      }
    }
    if (T.spec.falseFront && side.name === 'front') { // the cap runs along what is still standing, and past each break it snaps: a short length left tilting down over the gap
      const top = Math.max(...outline.map((p) => p[1])), st = Math.min(0.5, side.len * 0.12), spans = slice(outline, top - 0.012, 1), rc = ctx.seeded(`${seed}:${T.b.id}:cap`), aged = T.decay.level >= 0.35, snapEnd = rc() < 0.5 ? 0 : 1; // own stream: this is the only thing that draws here
      for (const [a, b] of spans) {
        let a2 = Math.max(a, -half + st), b2 = Math.min(b, half - st);
        if (b2 - a2 < 0.08) continue;
        const brokenL = a2 > -half + st + 0.02, brokenR = b2 < half - st - 0.02;
        if (aged && !brokenL && !brokenR) { const cut = rc.range(0.32, 0.72); if (snapEnd === 0) a2 += cut; else b2 -= cut; } // on an aged front one end has let go
        s.box(a2 - 0.03, b2 + 0.03, top, top + 0.07, -0.18, 0.05, 'wood', T.C.beam);
        for (const [end, dir, broken] of [[a2, -1, a2 > -half + st + 0.02], [b2, 1, b2 < half - st - 0.02]]) if (broken) {
          const len = rc.range(0.3, 0.55), drop = rc.range(0.12, 0.28);
          s.beam([end, top + 0.045, -0.04], [end + dir * len, top + 0.045 - drop, 0.05 + rc.range(0.02, 0.06)], 0.14, 0.07, 'wood', T.C.beam); // tilts out over the parapet face, not down into it
        }
      }
    }
    // the material band: a separate proud skin between the openings
    const band = T.spec.band;
    if (band) {
      const yTop = y0 + band.h, spans = subtract(intersect(slice(outline, y0 + 0.02, 1), slice(outline, Math.min(yTop, maxY - 0.01), 1)), cuts(y0, yTop, 0.0)), b0 = band.type === 'board' ? 'wood' : band.type, col = band.col || (band.type === 'board' ? shade(CEDAR.mid, r.range(0.9, 1.1)) : null);
      for (const [a, b] of spans) {
        s.box(a, b, y0, yTop, 0, 0.042, b0, col);
        if (band.type === 'board') for (let x = a + 0.11; x < b; x += 0.2) s.vbar(x - 0.008, x + 0.008, y0, yTop, 0.042, 0.05, 'wood', shade(col, 0.55));
        s.box(a - 0.01, b + 0.01, yTop - 0.012, yTop + 0.05, 0, 0.075, 'wood', T.C.beam);
      }
    }
    // post-and-rail lines on pale walls
    if (T.spec.timbers && (type === 'plaster' || type === 'mortar')) {
      const c = T.C.beam, ys = [T.eaveY - 0.1]; if (T.f2) ys.push(T.f2 + 0.05);
      for (const y of ys) for (const [a, b] of subtract(slice(outline, y, 1), cuts(y - 0.07, y + 0.07, 0.01))) s.hbar(a, b, y - 0.06, y + 0.06, 0, 0.035, 'wood', c);
      const n = Math.max(1, Math.round(side.len / 1.4));
      for (let i = 0; i <= n; i++) { const x = lerp(-half + 0.05, half - 0.05, i / n); for (const [a, b] of subtract(slice(outline, x, 0), ops.filter((o) => x > o.x0 - 0.08 && x < o.x1 + 0.08).map((o) => [o.y0, o.y1]))) s.vbar(x - 0.05, x + 0.05, a, b, 0, 0.034, 'wood', c); }
    }
  }

  function collapseSpec(T) {
    const c = T.decay.collapse; if (!c) return null;
    const corner = c.corner || T.r.pick(['fr', 'fl', 'br', 'bl']);
    return { corner, sx: corner[1] === 'r' ? 1 : -1, sz: corner[0] === 'f' ? 1 : -1, r: Math.min(c.r || T.r.range(1.5, 2.3), Math.min(T.w, T.d) * 0.72), height: T.eaveY, low: T.r.range(0.45, 0.95), rng: T.r };
  }

  /* ---- roof construction ---- */
  /** One patch of roof moss: an entry in the slope's moss field (see roofMaterial) plus the small leaves that give it an edge up close. 0 pad triangles. Draws what the old flat mats drew, so everything after it on the building stays put. */
  function greenPad(T, S, cu, cv, ru, rv, n = 26, field = null) {
    const { r } = T, a = new V3(), b = new V3(), c = new V3(), e = new V3(), f = new V3(), Nn = new V3(), G = 5, emit = T.spec.pads !== false;
    r(); for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const u0 = cu - ru + (2 * ru * i) / G, u1 = u0 + (2 * ru) / G, v0 = cv - rv + (2 * rv * j) / G, v1 = v0 + (2 * rv) / G; if (!(u1 > 1 || u0 < 0 || v0 < 0 || v1 > 1.02)) r(); }
    if (field) field.pads.push(field.toTile ? [field.toTile(cu, cv), cv, ru, rv] : [cu, cv, ru, rv]);
    for (let i = 0; i < Math.round(n * H.density); i++) {
      const th = r() * TAU, q = Math.sqrt(r()), uu = clamp(cu + Math.cos(th) * q * ru), vv = clamp(cv + Math.sin(th) * q * rv), p = S(uu, vv, new V3());
      S(clamp(uu - 0.04), vv, a); S(clamp(uu + 0.04), vv, b); S(uu, clamp(vv + 0.04), c); e.subVectors(b, a); f.subVectors(c, p); Nn.crossVectors(e, f).normalize(); if (Nn.y < 0) Nn.negate();
      p.addScaledVector(Nn, 0.14 + r() * 0.1);
      const shell = Nn.clone().add(new V3(r.range(-0.3, 0.3), 0.2, r.range(-0.3, 0.3))).normalize(), tip = new V3(r.range(-1, 1), r.range(-0.6, 0.4), r.range(-1, 1)).normalize(), sz = 0.25 * r.range(0.8, 1.3), tn = 0.5 + shell.dot(SUN) * 0.34 + r.range(-0.1, 0.1);
      if (emit) K.leaves.push({ p, shell, tip, s: sz, tone: tone(tn) });
    }
  }
  function roofGrass(T, S, n) { // weeds rooted along the ridge and in the valleys of the covering
    const { r } = T, p = new V3();
    for (let i = 0; i < n; i++) { const u = r(), vv = r() < 0.55 ? r.range(0.01, 0.06) : r.range(0.6, 0.95); S(u, vv, p); grassPatch(world, r, p.x, p.z, 0.16, 4, { y: p.y + 0.06, h: 0.42 }); }
  }
  function shadedWeight(S) { // 1 on a slope that faces away from the sun, 0 on one facing it
    const a = S(0.5, 0.2, new V3()), b = S(0.5, 0.8, new V3()), c = S(0.3, 0.5, new V3()), d = S(0.7, 0.5, new V3()), n = new V3().subVectors(d, c).cross(new V3().subVectors(b, a)).normalize(); if (n.y < 0) n.negate();
    return clamp(0.55 - n.dot(SUN) * 1.1);
  }
  const blobs = (r, n, sh2) => Array.from({ length: n }, () => [r(), r() < sh2 ? r.range(0.55, 1) : r(), r.range(0.14, 0.32), r.range(0.14, 0.3)]);
  const sst = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  /** The moss weight of one slope, as f(u, v, valley) → 0..1 per vertex: thick along the ridge and the shaded eave, in a few blobs, and a little further along the valleys between tiles. Evaluated at each vertex's own (u,v), never per tile, or the outline would snap to the tiles. */
  function mossFieldFor(T, S, draws) {
    const w = shadedWeight(S), moss = T.decay.moss, amount = moss * (0.3 + 0.7 * w), bl = blobs(draws, 4 + Math.round(amount * 4), 0.7), off = T.spec.pads === false, limit = Math.max(0.05, amount * 0.85), ph = bl[0][0] * 11, ph2 = bl[0][1] * 11, pads = [];
    const f = (u, v, valley = 0) => {
      if (off) return 0;
      const ridge = (0.42 + 0.58 * w) * moss * (1 - sst(0.03, 0.22, v)) * (0.6 + 0.4 * Math.sin(u * 5.3 + ph)), eave = w * moss * sst(0.7, 0.98, v) * (0.62 + 0.38 * Math.sin(u * 7.1 + ph2));
      let m = Math.max(ridge, eave);
      for (const b of bl) { const a = (u - b[0]) / b[2], q = (v - b[1]) / Math.max(b[3], f.minV), d = a * a + q * q; if (d < limit) m = Math.max(m, (1 - d / limit) * (0.78 + 0.34 * w)); }
      for (const b of pads) { const a = (u - b[0]) / b[2], q = (v - b[1]) / Math.max(b[3], f.minV), d = a * a + q * q; if (d < 1) m = Math.max(m, (1 - d) * 1.05); }
      return clamp(m + valley * Math.min(1, m * 2.6));
    };
    f.amount = amount; f.bl = bl; f.pads = pads; f.toTile = null; f.minV = 0; // minV: a coarse course has few vertices along the slope, so a blob is never narrower than the mesh can show
    return f;
  }
  /** Tiles keep their colour, whole-tile green is gone. Takes the same draws as the old moss tint, so the tile stream stays where it was. */
  const mossyTint = (field, base) => (u, v, r, sheet) => { const inside = field.bl.some((b) => { const a = (u - b[0]) / b[2], q = (v - b[1]) / b[3]; return a * a + q * q < field.amount * 0.85; }); const k = r(); return base(u, v, inside && k < 0.84 ? () => k / 0.84 : r, sheet); };

  function gableSlopes(T, R) {
    const { h, eaveY } = T, s = T.spec, L = T.roofL, D = T.roofD, es = s.es, ef = s.falseFront && s.ridge === 'x' && s.shape === 'gable' ? -0.12 : s.ef, eb = s.eb, pitch = (h - eaveY) / D; // a false front is a parapet: the front slope stops behind it
    const sag = T.decay.sag, dents = (r) => [[r.range(0.25, 0.75), r.range(0.25, 0.7), r.range(0.14, 0.24), r.range(0.2, 0.3), sag * r.range(0.3, 0.8)]];
    const mk = (a, b, c, d, o) => slope(R.w(a), R.w(b), R.w(c), R.w(d), o);
    const o = { sagR: sag, sagE: sag * 0.5, dish: sag * 0.35 };
    const eF = eaveY - pitch * ef, eB = eaveY - pitch * eb;
    if (s.shape === 'mono') {
      const f = (h - eaveY) / (2 * D), eL = eaveY - f * ef, top = h + f * eb;
      return { front: { S: mk([-L - es, top, -D - eb], [L + es, top, -D - eb], [-L - es, eL, D + ef], [L + es, eL, D + ef], o), lenU: 2 * (L + es), lenV: Math.hypot(2 * D + ef + eb, top - eL), wallV: (2 * D + eb) / (2 * D + ef + eb), mono: true } };
    }
    if (s.shape === 'hip') { // S is the true trapezoid (boards, rafters, greenery). Tr is the plane it lies in, with a square tile grid clipped by region, so hip ends don't fan.
      const e = (ef + eb) / 2, X = L + e, Z = D + e, hx = Math.max(0, L - D * 0.92), eY = eaveY - pitch * e, rf = hx / X, o2 = { sagR: sag * 0.5, sagE: sag * 0.3, dish: sag * 0.25 }, lv = Math.hypot(Z, h - eY), le = Math.hypot(X - hx, h - eY), wv = D / Z, we = (L - hx) / (X - hx);
      const sl = (tr, re, lenU, lenV, wallV, fr) => ({ S: mk(...tr, o2), Tr: mk(...re, o2), region: (u, v) => Math.abs(u - 0.5) <= 0.5 * lerp(fr, 1, v), rf: fr, lenU, lenV, wallV });
      return {
        front: sl([[-hx, h, 0], [hx, h, 0], [-X, eY, Z], [X, eY, Z]], [[-X, h, 0], [X, h, 0], [-X, eY, Z], [X, eY, Z]], 2 * X, lv, wv, rf),
        back: sl([[hx, h, 0], [-hx, h, 0], [X, eY, -Z], [-X, eY, -Z]], [[X, h, 0], [-X, h, 0], [X, eY, -Z], [-X, eY, -Z]], 2 * X, lv, wv, rf),
        right: sl([[hx, h, 0], [hx, h, 0], [X, eY, Z], [X, eY, -Z]], [[hx, h, Z], [hx, h, -Z], [X, eY, Z], [X, eY, -Z]], 2 * Z, le, we, 0),
        left: sl([[-hx, h, 0], [-hx, h, 0], [-X, eY, -Z], [-X, eY, Z]], [[-hx, h, -Z], [-hx, h, Z], [-X, eY, -Z], [-X, eY, Z]], 2 * Z, le, we, 0),
      };
    }
    const frontS = mk([-L - es, h, 0], [L + es, h, 0], [-L - es, eF, D + ef], [L + es, eF, D + ef], { ...o, dents: dents(T.r) }), backS = mk([-L - es, h, 0], [L + es, h, 0], [-L - es, eB, -D - eb], [L + es, eB, -D - eb], o);
    return { front: { S: frontS, lenU: 2 * (L + es), lenV: Math.hypot(D + ef, h - eF), wallV: D / (D + ef) }, back: { S: backS, lenU: 2 * (L + es), lenV: Math.hypot(D + eb, h - eB), wallV: D / (D + eb) } };
  }

  const _a0 = new V3(), _a1 = new V3();
  function rafterTails(st, S, { n = 6, v0 = 0.8, drop = 0.1, w = 0.07, h = 0.09, color: c }) { for (let i = 0; i <= n; i++) { const u = (i + 0.0001) / (n + 0.0002); const p = S(u, v0, _a0).clone(), q = S(u, 1, _a1).clone(); p.y -= drop; q.y -= drop; st.beam(p, q, w, h, 'wood', c); } }
  function holeFrame(T, S, hole) { // the exposed rafters and battens across a hole
    const [cu, cv, ru, rv] = hole, C = T.C, n = Math.max(2, Math.round((ru * 2) / 0.24)), p = new V3(), q = new V3(), A0 = new V3(), A1 = new V3();
    for (let i = 0; i <= n; i++) {
      const u = lerp(cu - ru, cu + ru, i / n); if (u < 0 || u > 1) continue;
      const v0 = Math.max(0.02, cv - rv * 1.1), v1 = Math.min(1, cv + rv * 1.1), broken = T.r() < 0.34, end = broken ? lerp(v0, v1, T.r.range(0.35, 0.7)) : v1;
      S(u, v0, p); S(u, end, q); p.y -= 0.11; q.y -= 0.11; world.beam(p, q, 0.08, 0.1, 'wood', C.beam);
    }
    for (let j = 1; j <= 3; j++) { const vv = lerp(cv - rv, cv + rv, j / 4); if (vv < 0.02 || vv > 1 || T.r() < 0.3) continue; S(clamp(cu - ru * 0.9), vv, A0); S(clamp(cu + ru * (0.3 + T.r() * 0.6)), vv, A1); A0.y -= 0.05; A1.y -= 0.05; world.beam(A0, A1, 0.05, 0.03, 'wood', C.frame); }
  }

  function buildTiledRoof(T, R) {
    const { spec, r, decay, C } = T, slopes = gableSlopes(T, R), names = Object.keys(slopes), lo = spec.detail === 'lo', tin = spec.roof === 'tin';
    const baseTint = pick4(spec.tints || (tin ? r.pick(TIN_TINTS) : r.pick(TILE_TINTS))), rt = ctx.seeded(`${seed}:${T.b.id}:r`);
    const big = !lo && T.spec.roof === 'kawara' && (T.roofL * T.roofD * 4 > 22);
    const holesBy = {};
    for (const nm of names) holesBy[nm] = [];
    // requested holes
    const reqHoles = decay.holes, h2 = typeof reqHoles === 'number' ? Array.from({ length: reqHoles }, () => { const nm = r.pick(names); return { slope: nm, u: r.range(0.2, 0.8), v: r.range(0.2, 0.75), ru: r.range(0.1, 0.2), rv: r.range(0.13, 0.26) }; }) : reqHoles || [];
    for (const h of h2) (holesBy[h.slope] || holesBy[names[0]]).push([h.u, h.v, h.ru, h.rv]);
    for (const h of decay.extraHoles || []) holesBy[h.slope].push([h.u, h.v, h.ru, h.rv, true]); // placed by hand on top of the rolled ones; framed from their own stream, so the rest of the building doesn't re-roll
    const xr = ctx.seeded(`${seed}:${T.b.id}:xh`);
    // collapsed corner
    if (T.col && spec.shape !== 'mono') {
      const { sx, sz, r: cr } = T.col, rx = spec.ridge === 'x' ? sx : sz, rz = spec.ridge === 'x' ? sz : -sx, us = (rx + 1) / 2, fracU = Math.min(0.8, (cr + 0.3) / (2 * (T.roofL + spec.es))) * 1.02, nm = rz > 0 ? 'front' : 'back', om = rz > 0 ? 'back' : 'front';
      if (holesBy[nm]) holesBy[nm].push([us, 1, fracU, Math.min(1.25, (cr + 0.3) / T.roofD)]);
      if (holesBy[om]) holesBy[om].push([us, 0.0, fracU * 0.6, Math.min(0.7, cr / T.roofD * 0.6)]);
      for (const k of ['left', 'right']) if (holesBy[k] && ((k === 'right') === (rx > 0))) holesBy[k].push([rz > 0 ? 0.25 : 0.75, 0.9, 0.5, 0.6]);
    } else if (T.col) { // a single pitch has one slope to lose
      const { sx, sz, r: cr } = T.col, rx = spec.ridge === 'x' ? sx : sz, rz = spec.ridge === 'x' ? sz : -sx;
      holesBy.front.push([(rx + 1) / 2, rz > 0 ? 1 : 0, Math.min(0.9, (cr + 0.3) / (2 * (T.roofL + spec.es))) * 1.02, Math.min(1.1, (cr + 0.3) / (2 * T.roofD))]);
    }
    const fields = {}, laying = []; // covering is laid after the pads are known; it only reads its own stream, so the order is free
    for (const nm of names) {
      const sl = slopes[nm], S = sl.S, holes = holesBy[nm], field = fields[nm] = mossFieldFor(T, S, T.r), tint = mossyTint(field, baseTint);
      if (sl.Tr) field.toTile = (u, vv) => 0.5 + (u - 0.5) * lerp(sl.rf, 1, vv);
      const St = sl.Tr || S, hT = sl.Tr ? holes.map(([u, vv, ru, rv]) => { const k = lerp(sl.rf, 1, clamp(vv, 0.15, 1)); return [0.5 + (u - 0.5) * k, vv, ru * k, rv]; }) : holes, region = sl.region || null;
      laying.push(() => {
        if (tin) layCorrugated(K, St, { lenU: sl.lenU, lenV: sl.lenV, wl: 0.27, course: 1.5, amp: 0.035, holes: hT, tint, rand: rt, sheet: 3, lip: 0, lift: 0.14 + decay.level * 0.2, region, moss: field });
        else if (lo || big) layCorrugated(K, St, { lenU: sl.lenU, lenV: sl.lenV, wl: lo ? 0.62 : 0.5, course: lo ? 0.95 : 0.7, amp: 0.05, holes: hT, tint, rand: rt, sheet: 1, lip: 0.06, region, moss: field });
        else layTiles(K, St, { lenU: sl.lenU, lenV: sl.lenV, holes: hT, tint, rand: rt, scatter: 0.012 + decay.level * 0.03, region, moss: field });
        layBoards(K, S, { nu: holes.length ? 12 : 4, nv: holes.length ? 9 : 3, holes, color: C.boards, rand: rt, k: tin ? 0.82 : 0.76, moss: (u, vv, n) => field(u, vv, n) * 0.85 });
      });
      for (const hh of holes) holeFrame(hh[4] ? { C: T.C, r: xr } : T, S, hh);
      rafterTails(world, S, { n: Math.max(3, Math.round(sl.lenU / 1.05)), v0: Math.min(0.98, sl.wallV), color: C.beam });
      // the plate the wall top hides under, following the sag
      if (!(spec.falseFront && nm === 'front' && spec.shape === 'gable')) { const nb = 3; for (let i = 0; i < nb; i++) { const u0 = i / nb, u1 = (i + 1) / nb, a = S(u0, sl.wallV, _a0).clone(), b = S(u1, sl.wallV, _a1).clone(); a.y -= 0.25; b.y -= 0.25; if (!inHole(holes, (u0 + u1) / 2, sl.wallV)) world.beam(a, b, 0.14, 0.3, 'wood', C.beam); } }
      if (T.spec.roof !== 'tin' && T.r() < 0.7) gutter(T, S, sl, holes, spec.falseFront && nm === 'front');
    }
    // gable verges, ridge caps
    if (spec.shape === 'gable') {
      const f = slopes.front.S, b = slopes.back.S, n = Math.max(3, Math.round(slopes.front.lenU / 0.72)), Fh = holesBy.front, cap = T.spec.roof === 'tin' ? '#8d7a68' : '#7f93a0';
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n, uc = (u0 + u1) / 2; if (inHole(Fh, uc, 0.02) || inHole(holesBy.back, uc, 0.02)) continue;
        const p = f(u0, 0, _a0).clone(), q = f(u1, 0, _a1).clone(); p.y += 0.07; q.y += 0.07;
        if (tin) { world.beam(p, q, 0.34, 0.06, 'worn', shade(rgb(cap), r.range(0.86, 1.1))); }
        else { world.beam(p, q, 0.3, 0.1, 'concrete', '#8d9ba4'); const p2 = p.clone(), q2 = q.clone(); p2.y += 0.1; q2.y += 0.1; world.rod(p2, q2, 0.105, 'flat', '#71868f', 6); }
      }
      if (!tin) for (const u of [0, 1]) if (!inHole(Fh, u, 0.02)) oni(f, u);
      for (const [S, sl] of [[f, slopes.front], [b, slopes.back]]) for (const u of [0, 1]) { if (inHole(holesBy[S === f ? 'front' : 'back'], u, 0.4)) continue; const nn = 3; for (let i = 0; i < nn; i++) { const p = S(u, i / nn, _a0).clone(), q = S(u, (i + 1) / nn, _a1).clone(); p.y -= 0.03; q.y -= 0.03; world.beam(p, q, 0.05, 0.24, 'wood', T.C.frame); } }
    } else if (spec.shape === 'hip') {
      const f = slopes.front, n = Math.max(2, Math.round((T.roofL - Math.max(0, T.roofL - T.roofD * 0.92)) / 0.72));
      if (T.roofL > T.roofD * 0.95) { const p = f.S(0, 0, _a0).clone(), q = f.S(1, 0, _a1).clone(); p.y += 0.08; q.y += 0.08; world.beam(p, q, 0.28, 0.1, 'concrete', '#8d9ba4'); p.y += 0.1; q.y += 0.1; world.rod(p, q, 0.1, 'flat', '#71868f', 6); }
      for (const [nm, a, uu] of [['front', 'left', 0], ['front', 'right', 1], ['back', 'right', 0], ['back', 'left', 1]]) { const S = slopes[nm].S; for (let i = 0; i < 3; i++) { const p = S(uu, i / 3, _a0).clone(), q = S(uu, (i + 1) / 3, _a1).clone(); p.y += 0.09; q.y += 0.09; world.beam(p, q, 0.3, 0.09, 'concrete', '#8d9ba4'); p.y += 0.08; q.y += 0.08; world.rod(p, q, 0.1, 'flat', '#71868f', 5); } }
    } else if (spec.shape === 'mono') { const S = slopes.front.S; for (let i = 0; i < 3; i++) { if (inHole(holesBy.front, (i + 0.5) / 3, 0.02)) continue; const p = S(i / 3, 0, _a0).clone(), q = S((i + 1) / 3, 0, _a1).clone(); world.beam(p, q, 0.12, 0.14, 'worn', '#8a6a58'); } }
    // the green on the roof
    const main = names.map((n) => ({ n, w: shadedWeight(slopes[n].S) })).sort((a, b) => b.w - a.w);
    const m2 = slopes[main[0].n];
    const patchN = Math.round(decay.moss * 3 + decay.level * 2);
    for (let i = 0; i < patchN; i++) { const nm = i % 3 === 2 && main[1] ? main[1].n : main[0].n; greenPad(T, slopes[nm].S, r.range(0.15, 0.85), r.range(0.45, 0.85), r.range(0.1, 0.2), r.range(0.14, 0.26), 22, fields[nm]); }
    for (const lay of laying) lay();
    roofGrass(T, m2.S, 5 + Math.round(decay.level * 8));
    if (main[1]) roofGrass(T, slopes[main[1].n].S, 3 + Math.round(decay.level * 3));
    for (let i = 0; i < decay.saplings; i++) { const sl = i % 2 && main[1] ? slopes[main[1].n] : m2, p = sl.S(r.range(0.18, 0.82), r.range(0.3, 0.75), new V3()); sapling(world, r, p, r.range(1, 2), { crown: r.range(0.85, 1.25) }); }
    for (let i = 0; i < Math.round(decay.level * 3); i++) { const sl = slopes[r.pick(names)], p = sl.S(r.range(0.1, 0.9), 1, new V3()); drape(world, r, p, r.range(0.5, 1.5)); }
    return slopes;
  }
  function drape(st, r, p, len) { // a curtain of creeper hanging off an eave
    const pts = []; let x = p.x, z = p.z; for (let y = 0; y <= len; y += len / 3) { pts.push([x, p.y - y, z]); x += r.range(-0.08, 0.08); z += r.range(-0.08, 0.08); }
    st.tube(pts, 0.02, 0.008, 'flat', '#6a6a42', 3);
    for (let i = 0; i < Math.round(len * 12 * H.density); i++) { const t = r() * len, shellDir = new V3(r.range(-1, 1), 0.2, r.range(-1, 1)).normalize(); const q = new V3(pts[0][0] + r.range(-0.1, 0.1), p.y - t, pts[0][2] + r.range(-0.1, 0.1)); K.leaves.push({ p: q, shell: shellDir, tip: new V3(r.range(-0.5, 0.5), -1, r.range(-0.5, 0.5)).normalize(), s: 0.2 * r.range(0.8, 1.2), tone: tone(0.5 + shellDir.dot(SUN) * 0.3 + r.range(-0.1, 0.1)) }); }
  }
  function oni(S, u, sz = 0.24) { const p = S(u, 0, _a0).clone(); world.add(kit.boxBase(0.14, sz, sz * 1.25), 'flat', { pos: [p.x, p.y + 0.02, p.z], color: '#6a7f8a' }); world.add(kit.cyl(sz * 0.62, sz * 0.62, 0.16, 8), 'flat', { pos: [p.x, p.y + 0.02 + sz, p.z], rot: [0, 0, Q], color: '#7a8e98' }); }
  function gutter(T, S, sl, holes, hidden = false) {
    const n = 4, out = new V3(), a = new V3(), b = new V3(), c = new V3();
    S(0.5, 1, a); S(0.5, 0.85, b); out.subVectors(a, b).setY(0).normalize();
    for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 1) / n; if (inHole(holes, (u0 + u1) / 2, 1) || T.r() < 0.12 + T.decay.level * 0.2) continue; S(u0, 1, a).addScaledVector(out, 0.06); S(u1, 1, c).addScaledVector(out, 0.06); a.y -= 0.07; c.y -= 0.07 + T.r() * 0.02; if (!hidden) world.rod(a, c, 0.05, 'worn', '#8a7a6a', 5, 0.05, true); }
  }

  /* ---- thatch: one closed heightfield of rounded rings, so the fat eaves and the hip corners have no seams. Its colour is drawn by roofMaterial: uv.x moss, uv.y = 3 + t (t -1..0 down the cut eave, 0..1 up the slope, 1.2 on the ridge roll) ---- */
  function buildThatch(T, R) {
    const { spec, r, decay } = T, X = T.roofL + spec.es, Z = T.roofD + Math.max(spec.ef, spec.eb), M = 32, ridgeX = Math.max(0.1, T.roofL - T.roofD * 0.7);
    const ey = T.eaveY, hh = T.h, steps = 5;
    const pit = Array.from({ length: Math.round(decay.level * 2.2) + (typeof decay.holes === 'number' ? decay.holes : 0) }, () => [r.range(0, TAU), r.range(0.25, 0.72), r.range(0.28, 0.5)]);
    const rings = [[T.roofL - 0.05, T.roofD - 0.05, ey - 0.12], [X - 0.12, Z - 0.12, ey - 0.42], [X, Z, ey - 0.26], [X + 0.04, Z + 0.04, ey - 0.02], [X - 0.1, Z - 0.1, ey + 0.26]];
    for (let k = 1; k <= steps; k++) { const t = k / steps, f = Math.pow(t, 0.92), x = lerp(X - 0.1, ridgeX, t), z = lerp(Z - 0.1, 0.1, t); rings.push([x, z, lerp(ey + 0.26, hh, f)]); }
    const seeds = [r() * TAU, r() * TAU], mossPts = blobs(r, 5, 0.6), rt = ctx.seeded(`${seed}:${T.b.id}:th`), RM = R.m;
    // the old per-quad colour jitter drew from T.r: 3 per quad and more on mossy quads over a 12×32 grid. Replayed here so the rest of the building doesn't re-roll.
    { const sd = new V3(); for (let j = 0; j < 11 * 32; j++) { const ring = Math.floor(j / 32), cc = j % 32, aMid = ((cc + 0.5) / 32) * TAU; r(); r(); r(); sd.set(Math.sign(Math.cos(aMid)) * 0.5, 0.4, Math.sin(aMid)).transformDirection(RM); const sw = clamp(0.5 - sd.dot(SUN) * 1.1), nA = cc / 32, tt = clamp((ring - 4) / 7); if (ring > 3 && mossPts.some((b) => { const a = (nA - b[0]) / (b[2] * 0.7), q = (tt - b[1]) / (b[3] * 1.2); return a * a + q * q < decay.moss * (0.5 + sw); }) && r() < 0.9) r(); } }
    const N_R = rings.length, pos = [], idx = [], W = [], Tv = [], col = [], c3 = rgb('#6a5a48'), straw = rgb(rt() < 0.5 ? '#b9985e' : '#b09058'), off = spec.pads === false, Pw = [];
    const tOf = (i) => (i <= 2 ? -1 : i === 3 ? -0.42 : (i - 4) / steps);
    const sd = new V3();
    for (let i = 0; i < N_R; i++) for (let j = 0; j < M; j++) {
      const a = (j / M) * TAU, ca = Math.cos(a), sa = Math.sin(a), rx = rings[i][0] * Math.sign(ca) * Math.pow(Math.abs(ca), 0.56), rz = rings[i][1] * Math.sign(sa) * Math.pow(Math.abs(sa), 0.56);
      let y = rings[i][2]; if (i > 3) y += 0.035 * Math.sin(a * 5 + seeds[0]) + 0.025 * Math.sin(a * 11 + seeds[1]); else if (i === 2) y -= rt.range(0.02, 0.13); // a slope that rolls as one surface, and a cut hem that isn't ruled
      const t = clamp((i - 4) / steps), tv = tOf(i);
      let pw = -1; // how far inside a pit this vertex is: 1 at the centre, 0 at the rim of the dip, -1 well clear of it
      if (i >= 4 && i < N_R - 1) { y -= decay.sag * 0.7 * Math.sin(Math.PI * t) * Math.abs(ca) * 0.9; for (const [pa, pt, pr] of pit) { const dA = Math.atan2(Math.sin(a - pa), Math.cos(a - pa)) / pr, dT = (t - pt) / 0.2, d2 = dA * dA + dT * dT; if (d2 < 1) y -= 0.4 * (1 - d2); pw = Math.max(pw, 1 - d2); } }
      Pw.push(pw);
      pos.push(rx, y, rz); Tv.push(tv); col.push(i <= 1 ? c3 : straw);
      let w = 0;
      if (!off && i > 3) {
        sd.set(Math.sign(ca) * 0.5, 0.4, sa).transformDirection(RM); const sw = clamp(0.5 - sd.dot(SUN) * 1.1), limit = decay.moss * (0.5 + sw) * 0.62, nA = j / M;
        for (const b of mossPts) { let da = nA - b[0]; da -= Math.round(da); const a2 = da / (b[2] * 0.7), q = (tv - b[1]) / (b[3] * 1.2), d = a2 * a2 + q * q; if (d < limit) w = Math.max(w, (1 - d / limit) * (0.7 + 0.32 * sw)); }
        w = Math.max(w, (0.35 + 0.65 * sw) * decay.moss * (1 - sst(0.02, 0.3, tv)) * (0.55 + 0.45 * Math.sin(a * 3 + seeds[1])) * 0.85, 0.45 * decay.moss * sst(0.82, 1, tv) * (0.6 + 0.4 * Math.sin(a * 7 + seeds[0])));
      }
      W.push(clamp(w));
    }
    const g = new THREE.BufferGeometry(); const id = (i, j) => i * M + (j % M);
    for (let i = 0; i < N_R - 1; i++) for (let j = 0; j < M; j++) idx.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1));
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const P2 = g.attributes.position, Nn = g.attributes.normal, b_ = K.b.roof;
    for (let i = 0; i < idx.length; i += 6) {
      for (let q = 0; q < 6; q++) { const vi = idx[i + q], k = col[vi], pv = _A.set(P2.getX(vi), P2.getY(vi), P2.getZ(vi)).applyMatrix4(RM), n = _B.set(Nn.getX(vi), Nn.getY(vi), Nn.getZ(vi)).transformDirection(RM), pw = Pw[vi]; b_.v(pv.x, pv.y, pv.z, n.x, n.y, n.z, pw > -1 ? -(pw + 1) / 2 : W[vi], 3 + Tv[vi], k[0], k[1], k[2]); }
    }
    // the ridge: a rolled straw bundle, bound with a few bamboo billets
    const y2 = hh + 0.02, NX = 6, roll = rgb('#a68c54'), NA = 4;
    const ridgeP = (ix, ia) => { const x = lerp(-ridgeX - 0.26, ridgeX + 0.26, ix / NX), a = (ia / NA) * Math.PI, end = ix === 0 || ix === NX ? 0.78 : 1, b = 0.04 * Math.sin(ix * 2.3 + seeds[0]); return [x, y2 - 0.07 + b + 0.32 * end * Math.sin(a), 0.36 * end * Math.cos(a)]; };
    const emitRV = (p, nv, t, m = 1) => { const q = _A.set(p[0], p[1], p[2]).applyMatrix4(RM), n = _B.set(nv[0], nv[1], nv[2]).transformDirection(RM); b_.v(q.x, q.y, q.z, n.x, n.y, n.z, 0, 3 + t, roll[0] * m, roll[1] * m, roll[2] * m); };
    for (let ix = 0; ix < NX; ix++) for (let ia = 0; ia < NA; ia++) { const a0 = (ia / NA) * Math.PI, a1 = ((ia + 1) / NA) * Math.PI, n0 = [0, Math.sin(a0), Math.cos(a0)], n1 = [0, Math.sin(a1), Math.cos(a1)], A = ridgeP(ix, ia), B = ridgeP(ix + 1, ia), C = ridgeP(ix, ia + 1), D = ridgeP(ix + 1, ia + 1); for (const [p, nv] of [[A, n0], [C, n1], [B, n0], [B, n0], [C, n1], [D, n1]]) emitRV(p, nv, 1.2); }
    for (const [ix, sg] of [[0, -1], [NX, 1]]) for (let ia = 1; ia < NA - 1; ia++) { const nv = [sg, 0, 0], O = ridgeP(ix, 0), A = ridgeP(ix, ia), B = ridgeP(ix, ia + 1); if (sg > 0) for (const p of [O, A, B]) emitRV(p, nv, 1.2, 0.72); else for (const p of [O, B, A]) emitRV(p, nv, 1.2, 0.72); }
    const nLog = Math.max(1, Math.round(ridgeX / 1.3)); for (let i = 0; i <= nLog; i++) { const x = lerp(-ridgeX, ridgeX, i / nLog); R.rod([x, y2 + 0.25, -0.42], [x, y2 + 0.25, 0.42], 0.055, 'wood', '#5e4a3c', 5); }
    // exposed poles across each pit
    for (const [pa, pt, pr] of pit) { const ca = Math.cos(pa), sa = Math.sin(pa), rx = lerp(X, ridgeX, pt) * Math.sign(ca) * Math.pow(Math.abs(ca), 0.56), rz = lerp(Z, 0.1, pt) * Math.sign(sa) * Math.pow(Math.abs(sa), 0.56), y = pos[id(4 + Math.round(pt * steps), Math.round((((pa % TAU) + TAU) % TAU) / TAU * M) % M) * 3 + 1] + 0.1; for (let i = -1; i <= 2; i++) R.rod([rx + i * 0.16 - 0.5 * sa, y, rz + i * 0.16 * sa + 0.5 * ca], [rx + i * 0.16 + 0.5 * sa, y, rz + i * 0.16 * sa - 0.5 * ca], 0.03, 'wood', '#6e5038', 4); }
    // no pads on straw, only the small leaves and weeds that root in it; then saplings
    const SR = (u, vv, out) => { const a = u * TAU, ca = Math.cos(a), sa = Math.sin(a); const t = clamp(1 - vv), x = lerp(X - 0.1, ridgeX, t) * Math.sign(ca) * Math.pow(Math.abs(ca), 0.56), z = lerp(Z - 0.1, 0.1, t) * Math.sign(sa) * Math.pow(Math.abs(sa), 0.56); return out.set(x, lerp(ey + 0.26, hh, Math.pow(t, 0.92)) + 0.04, z).applyMatrix4(RM); };
    for (let i = 0; i < 2 + Math.round(decay.moss * 3); i++) greenPad(T, SR, r.range(0.12, 0.88), r.range(0.35, 0.7), r.range(0.04, 0.08), r.range(0.14, 0.24), 14);
    for (let i = 0; i < 14; i++) { const p = SR(r(), r.range(0.1, 0.9), new V3()); grassPatch(world, r, p.x, p.z, 0.14, 4, { y: p.y, h: 0.42 }); }
    for (let i = 0; i < decay.saplings; i++) sapling(world, r, SR(r(), r.range(0.3, 0.7), new V3()), r.range(1, 1.8));
    return {};
  }

  /* ---- flat roof with parapet ---- */
  function buildFlat(T, S) {
    const { w, d, h, r, decay } = T, y = h - 0.42, co = T.spec.wallCol || P.concrete, w2 = w / 2, d2 = d / 2;
    const hole = decay.level > 0.45 || decay.holes ? [kit.circlePts(r.range(-w2 + 0.9, w2 - 0.9), r.range(-d2 + 0.9, d2 - 0.9), r.range(0.45, 0.8), 9, r, 0.25)] : [];
    S.add(kit.plate(T.col ? floorOutline(T) : [[-w2, -d2], [w2, -d2], [w2, d2], [-w2, d2]], T.col ? [] : hole, y, 0.16), 'concrete', { color: shade(co, 0.86) });
    if (hole.length && !T.col) { const cx = hole[0].reduce((s, p) => s + p[0], 0) / hole[0].length, cz = hole[0].reduce((s, p) => s + p[1], 0) / hole[0].length; for (const [px, pz] of hole[0]) S.rod([px, y - 0.08, pz], [lerp(px, cx, 0.25) + r.range(-0.1, 0.1), y - 0.24, lerp(pz, cz, 0.25)], 0.012, 'worn', P.rustDark, 3); ballLeaves(S, r, [cx, y - 0.25, cz], 0.5, 0.4, 16); }
    // cap
    const cr = T.col ? T.col.r + 0.3 : 0, sx = T.col?.sx, sz = T.col?.sz;
    for (const [x0, x1, z0, z1, along, zs] of [[-w2 - 0.05, w2 + 0.05, d2 - 0.14, d2 + 0.05, 1, 1], [-w2 - 0.05, w2 + 0.05, -d2 - 0.05, -d2 + 0.14, 1, -1], [-w2 - 0.05, -w2 + 0.14, -d2, d2, 0, -1], [w2 - 0.14, w2 + 0.05, -d2, d2, 0, 1]]) {
      const hit = T.col && (along ? zs === sz : zs === sx), a0 = !hit ? 0 : along ? (sx < 0 ? cr : 0) : (sz < 0 ? cr : 0), a1 = !hit ? 0 : along ? (sx > 0 ? cr : 0) : (sz > 0 ? cr : 0);
      S.box(along ? x0 + a0 : x0, along ? x1 - a1 : x1, h - 0.04, h + 0.04, along ? z0 : z0 + a0, along ? z1 : z1 - a1, 'concrete', shade(co, 1.04));
    }
    for (let i = 0; i < 4 + Math.round(decay.level * 3); i++) { const x = r.range(-w2 + 0.4, w2 - 0.4), z = r.range(-d2 + 0.4, d2 - 0.4); S.add(kit.chip(kit.sphere(1, 7, 4), 0.1, r), 'flat', { pos: [x, y + 0.02, z], scale: [Math.min(r.range(0.3, 0.8), (w2 - 0.16 - Math.abs(x)) / 1.1), 0.06, Math.min(r.range(0.3, 0.7), (d2 - 0.16 - Math.abs(z)) / 1.1)], color: r() < 0.5 ? P.moss : '#7a8078' }); /* 1.1: the chipped sphere's reach; clamped after the draws, so nothing re-rolls */ grassPatch(S, r, x, z, 0.3, 8, { y: y + 0.03, h: 0.42 }); }
    if (r() < 0.6) S.add(kit.box(0.5, 0.5, 0.42), 'worn', { pos: [r.range(-w2 + 0.6, w2 - 0.6), y + 0.25, r.range(-d2 + 0.6, d2 - 0.6)], color: '#b0b2a8' });
    if (decay.saplings) sapling(S, r, [r.range(-w2 + 0.6, w2 - 0.6), y, r.range(-d2 + 0.6, d2 - 0.6)], r.range(1, 1.9));
    // lush fall of creeper over the front parapet for mass at distance
    const fx = r.range(-w2 + 0.5, w2 - 0.5); ballLeaves(S, r, [fx, h + 0.1, d2 + 0.08], 0.75, 0.42, 26, { s: 0.3 });
  }

  /* ---- sawtooth: steep glazed faces toward +x, long tin backs ---- */
  function buildSawtooth(T, S) {
    const { w, d, h, eaveY, r, decay, teeth: n } = T, tw = w / n, d2 = d / 2, tint = mossTintWide(T), rt = ctx.seeded(`${seed}:${T.b.id}:r`);
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + i * tw, x1 = x0 + tw;
      const A = S.w([x1, h, -d2 - 0.08]), B = S.w([x1, h, d2 + 0.08]), C = S.w([x0, eaveY, -d2 - 0.08]), D = S.w([x0, eaveY, d2 + 0.08]);
      const sl = slope(A, B, C, D, { sagR: decay.sag * 0.5, sagE: decay.sag * 0.3, dish: decay.sag * 0.4 });
      const holes = decay.level > 0.3 && r() < 0.6 ? [[r.range(0.25, 0.75), r.range(0.3, 0.7), r.range(0.14, 0.3), r.range(0.2, 0.36)]] : [];
      const field = mossFieldFor(T, sl, ctx.seeded(`${seed}:${T.b.id}:m${i}`));
      for (const hh of holes) holeFrame(T, sl, hh);
      // glazing on the high side
      const glazing = S.sub({ pos: [x1, 0, 0], rot: [0, Q, 0] }), yG0 = eaveY + 0.1, nG = Math.max(3, Math.round(d / 1.1));
      glazing.box(-d2, d2, eaveY - 0.08, eaveY + 0.12, -0.08, 0.04, 'wood', T.C.beam); glazing.box(-d2, d2, h - 0.1, h + 0.04, -0.06, 0.06, 'worn', '#6f7a7e');
      for (let k = 0; k < nG; k++) { const a = lerp(-d2, d2, k / nG), b = lerp(-d2, d2, (k + 1) / nG), broken = r() < 0.25 + decay.level * 0.3; if (!broken) glazing.rect(a + 0.03, b - 0.03, yG0, h - 0.1, -0.02, 'glass'); else shards(glazing, a + 0.03, b - 0.03, yG0, h - 0.1, -0.02, r); glazing.vbar(a - 0.025, a + 0.025, yG0, h - 0.08, -0.04, 0.02, 'worn', '#6f7a7e'); glazing.rect(a, b, eaveY, h, -0.38, 'flat', DARKROOM); }
      glazing.vbar(d2 - 0.03, d2 + 0.02, yG0, h - 0.08, -0.04, 0.02, 'worn', '#6f7a7e');
      if (decay.saplings > i) { const p = sl(r.range(0.25, 0.75), r.range(0.3, 0.7), new V3()); sapling(world, r, p, r.range(1.1, 1.9)); }
      for (let q = 0; q < 2 + Math.round(decay.moss * 2); q++) greenPad(T, sl, r.range(0.2, 0.8), r.range(0.3, 0.8), r.range(0.1, 0.2), r.range(0.18, 0.3), 20, field);
      layCorrugated(K, sl, { lenU: d + 0.16, lenV: Math.hypot(tw, h - eaveY), wl: 0.27, course: 1.6, amp: 0.035, holes, tint, rand: rt, sheet: 3, lip: 0, lift: 0.2, moss: field });
      layBoards(K, sl, { nu: holes.length ? 10 : 3, nv: holes.length ? 8 : 2, holes, color: T.C.boards, rand: rt, k: 0.84, moss: (u, vv, n) => field(u, vv, n) * 0.85 });
      roofGrass(T, sl, 6);
    }
    for (const x of [-w / 2 - 0.1, w / 2 + 0.1]) S.box(x - 0.1, x + 0.1, eaveY - 0.06, eaveY + 0.06, -d2, d2, 'wood', T.C.beam);
  }
  function mossTintWide(T) { const base = pick4(T.spec.tints || T.r.pick(TIN_TINTS)); return base; }

  /* ---- specials: starting points the districts can extend ---- */
  function lookoutLegs(S, r, W0, Wt, Ht, n, col, mat = 'worn') {
    const a = W0 / 2, b = Wt / 2, legs = [[-a, -a, -b, -b], [a, -a, b, -b], [a, a, b, b], [-a, a, -b, b]];
    for (const [x0, z0, x1, z1] of legs) { S.beam([x0, 0, z0], [x1, Ht, z1], 0.14, 0.14, mat, col); S.add(kit.boxBase(0.4, 0.26, 0.4), 'concrete', { pos: [x0, 0, z0], color: P.concreteMid }); }
    const P3 = (t, i) => { const [x0, z0, x1, z1] = legs[i]; return [lerp(x0, x1, t), t * Ht, lerp(z0, z1, t)]; };
    for (let k = 0; k < n; k++) { const t0 = (k + 0.15) / n, t1 = (k + 1) / n; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; S.rod(P3(t0, i), P3(t1, j), 0.022, mat, shade(col, 0.82), 4, 0.022, true); S.rod(P3(t0, j), P3(t1, i), 0.022, mat, shade(col, 0.82), 4, 0.022, true); S.beam(P3(t1, i), P3(t1, j), 0.07, 0.07, mat, col); } }
  }
  function ladderUp(S, x, z, y0, y1) { for (const dx of [-0.17, 0.17]) S.rod([x + dx, y0, z], [x + dx, y1, z], 0.02, 'worn', '#6a6a60', 4); for (let y = y0 + 0.2; y < y1; y += 0.36) S.rod([x - 0.17, y, z], [x + 0.17, y, z], 0.016, 'worn', '#6a6a60', 4); }
  function climbVine(S, r, a, b, n = 18) { const m = new V3().addVectors(v(a), v(b)).multiplyScalar(0.5).add(new V3(r.range(-0.4, 0.4), 0, r.range(-0.4, 0.4))); S.tube([a, m.toArray(), b], 0.04, 0.012, 'flat', '#6a6a42', 4); for (let i = 0; i < n; i++) { const t = Math.pow(r(), 0.8), p = S.w([lerp(a[0], b[0], t) + r.range(-0.2, 0.2), lerp(a[1], b[1], t), lerp(a[2], b[2], t) + r.range(-0.2, 0.2)]), sd = new V3(r.range(-1, 1), 0.3, r.range(-1, 1)).normalize(); K.leaves.push({ p, shell: sd, tip: new V3(r.range(-0.7, 0.7), -1, r.range(-0.7, 0.7)).normalize(), s: 0.28 * r.range(0.8, 1.25), tone: tone(0.5 + sd.dot(SUN) * 0.34 + r.range(-0.1, 0.1)) }); } }

  function buildWaterTower(T, S) {
    const { h, w, r, b } = T, tankR = Math.min(1.25, w * 0.45), tankH = 2.3, legH = h - tankH - 0.5;
    lookoutLegs(S, r, w, w * 0.62, legH, 3, '#7d8b90');
    S.box(-tankR - 0.2, tankR + 0.2, legH, legH + 0.12, -tankR - 0.2, tankR + 0.2, 'worn', '#6f7a7e');
    S.add(kit.cylBase(tankR, tankR, tankH, 16, true), 'worn', { pos: [0, legH + 0.12, 0], color: '#a8b4b4' });
    for (const k of [0.15, 0.5, 0.85]) S.add(kit.cyl(tankR + 0.02, tankR + 0.02, 0.05, 16, true), 'worn', { pos: [0, legH + 0.12 + tankH * k, 0], color: '#6f7a7e' });
    S.add(kit.cylBase(0.05, tankR + 0.05, 0.5, 16), 'worn', { pos: [0, legH + 0.12 + tankH, 0], color: '#8d9ba4' });
    ladderUp(S, 0, tankR + 0.22, 0, legH + tankH); S.rod([0, 0, 0], [0, legH + 0.1, 0], 0.09, 'worn', P.rust, 7);
    climbVine(S, r, [w * 0.4, 0.2, w * 0.4], [w * 0.3, legH * 0.9, w * 0.3], 28); climbVine(S, r, [-w * 0.4, 0.2, w * 0.2], [-w * 0.2, legH * 0.6, w * 0.16], 18);
    ballLeaves(S, r, [0, legH + 0.12 + tankH + 0.26, 0], 0.7, 0.32, 18, { s: 0.28 });
    bushesRing(T, S, 3); grassPatch(S, r, 0, 0, w * 0.9, 80, { h: 0.7 });
  }
  function buildFireTower(T, S) {
    const { h, w, r } = T, deck = h - 2.3, wt = w * 0.5; lookoutLegs(S, r, w, wt, deck, 4, '#b5522f');
    S.box(-wt / 2 - 0.5, wt / 2 + 0.5, deck, deck + 0.1, -wt / 2 - 0.5, wt / 2 + 0.5, 'worn', '#7d3a2a');
    for (const a of [0, 1, 2, 3]) { const st = S.sub({ pos: [0, deck + 0.1, 0], rot: [0, (a * Math.PI) / 2, 0] }), e = wt / 2 + 0.5; st.hbar(-e, e, 0.85, 0.9, e - 0.02, e + 0.02, 'worn', '#7d3a2a'); st.hbar(-e, e, 0.45, 0.48, e - 0.015, e + 0.015, 'worn', '#7d3a2a'); for (const x of [-e, 0, e]) st.vbar(x - 0.025, x + 0.025, 0, 0.9, e - 0.02, e + 0.02, 'worn', '#7d3a2a'); }
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.rod([x * 0.5, deck + 0.1, z * 0.5], [x * 0.55, deck + 1.55, z * 0.55], 0.04, 'worn', '#7d3a2a', 5);
    const rd = wt / 2 + 0.72, tip = [0, h, 0]; for (const [a, b] of [[[-rd, -rd], [rd, -rd]], [[rd, -rd], [rd, rd]], [[rd, rd], [-rd, rd]], [[-rd, rd], [-rd, -rd]]]) S.quad([a[0], deck + 1.45, a[1]], [b[0], deck + 1.45, b[1]], tip, tip, 'worn', '#b5522f');
    S.add(kit.cylBase(0.03, 0.2, 0.32, 8), 'flat', { pos: [0, deck + 1.1, 0], color: '#6a5a48' }); S.add(kit.cyl(0.26, 0.2, 0.3, 8, true), 'flat', { pos: [0, deck + 0.98, 0], color: '#8a6a3a' });
    ladderUp(S, 0, w / 2 + 0.1, 0, deck + 0.1);
    climbVine(S, r, [w * 0.45, 0.2, -w * 0.45], [wt * 0.5, deck * 0.8, -wt * 0.5], 28); climbVine(S, r, [-w * 0.45, 0.2, w * 0.45], [-wt * 0.5, deck * 0.55, wt * 0.5], 20);
    bushesRing(T, S, 3); grassPatch(S, r, 0, 0, w * 0.9, 70, { h: 0.7 });
  }
  function buildPavilion(T, S) {
    const { w, d, h, r, decay } = T; const hw = w / 2 - 0.3, hd = d / 2 - 0.3, eaveY = 2.2;
    S.box(-w / 2 + 0.1, w / 2 - 0.1, -0.2, 0.22, -d / 2 + 0.1, d / 2 - 0.1, 'concrete', P.concreteMid);
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { S.rod([x * hw, 0.22, z * hd], [x * hw * 0.98, eaveY, z * hd * 0.98], 0.09, 'wood', '#7a5c46', 6); S.add(kit.cyl(0.14, 0.17, 0.12, 7), 'concrete', { pos: [x * hw, 0.28, z * hd] }); }
    for (const a of [0, 1, 2]) { const st = S.sub({ pos: [0, 0, 0], rot: [0, (a * Math.PI) / 2, 0] }), e = a % 2 ? hw : hd, l = a % 2 ? hd : hw; st.box(-l, l, 0.55, 0.62, e - 0.12, e + 0.16, 'wood', '#a98a6a'); st.box(-l, l, 0.74, 0.78, e - 0.06, e + 0.06, 'wood', '#86664c'); st.hbar(-l, l, eaveY - 0.14, eaveY - 0.04, e - 0.04, e + 0.04, 'wood', '#7a5c46'); }
    T.spec.shape = 'hip'; T.roofL = w / 2 - 0.1; T.roofD = d / 2 - 0.1; T.eaveY = eaveY; T.spec.es = T.spec.ef = T.spec.eb = 0.34; T.spec.roof = 'kawara'; buildTiledRoof(T, S);
    const p = S.w([0, h + 0.02, 0]); world.add(kit.cylBase(0.04, 0.16, 0.36, 7), 'flat', { pos: [p.x, p.y, p.z], color: '#71868f' });
    climbVine(S, r, [hw, 0.3, hd], [hw, eaveY, hd], 30); bushesRing(T, S, 2); grassPatch(S, r, 0, 0, w * 0.9, 50, { h: 0.6 });
  }
  function buildShrine(T, S) {
    const { w, d, h, r, decay } = T, hw = w / 2 - 0.45, hd = d / 2 - 0.5, fl = 0.85, eaveY = Math.min(3.1, h - 1.5);
    S.box(-w / 2 + 0.15, w / 2 - 0.15, -0.3, 0.2, -d / 2 + 0.15, d / 2 - 0.15, 'concrete', P.concreteMid);
    S.box(-hw - 0.15, hw + 0.15, fl - 0.1, fl, -hd - 0.15, hd + 0.15, 'wood', '#8a6a4e');
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]) { S.rod([x * hw, 0.2, z * hd], [x * hw, eaveY, z * hd], 0.11, 'wood', '#7a4a3a', 7); S.add(kit.cyl(0.18, 0.22, 0.2, 8), 'concrete', { pos: [x * hw, 0.3, z * hd] }); }
    S.box(-hw, hw, eaveY - 0.26, eaveY, -hd - 0.05, -hd + 0.05, 'wood', '#6e3f32'); S.box(-hw, hw, eaveY - 0.26, eaveY, hd - 0.05, hd + 0.05, 'wood', '#6e3f32');
    S.box(-hw + 0.1, hw - 0.1, fl, eaveY - 0.2, -hd, -hd + 0.1, 'wood', '#6e5038');
    for (const sg of [-1, 1]) S.box(sg * hw - 0.05, sg * hw + 0.05, fl, eaveY - 0.2, -hd, hd, 'wood', '#6e5038');
    S.box(-hw + 0.7, hw - 0.7, fl, eaveY - 0.26, hd - 0.04, hd + 0.02, 'wood', '#5a4032');
    for (const x of [-0.9, -0.3, 0.3, 0.9]) lattice(S, x - 0.28, x + 0.28, fl + 0.05, eaveY - 0.35, hd + 0.04, { n: 5, rails: 2, col: '#6e3f32', slat: '#8a6a4e' });
    S.box(-hw - 0.5, hw + 0.5, fl + 0.46, fl + 0.5, hd + 0.5, hd + 0.54, 'wood', '#7a4a3a'); for (const sg of [-1, 1]) S.rod([sg * (hw + 0.5), fl, hd + 0.5], [sg * (hw + 0.5), fl + 0.55, hd + 0.5], 0.03, 'wood', '#7a4a3a', 5);
    for (let i = 0; i < 4; i++) S.box(-0.6, 0.6, 0.2 + i * 0.16 - 0.16, 0.2 + i * 0.16, hd + 1 - i * 0.24, hd + 1.26 - i * 0.24, 'concrete', P.concreteMid);
    S.box(-0.5, 0.5, 0.55, 1.0, hd + 0.55, hd + 0.98, 'wood', '#5e4634'); for (let x = -0.4; x <= 0.4; x += 0.1) S.vbar(x - 0.016, x + 0.016, 0.7, 1.0, hd + 0.99, hd + 1.0, 'wood', '#8a6a4e');
    S.tube([[-0.8, eaveY - 0.32, hd + 0.08], [0, eaveY - 0.62, hd + 0.14], [0.8, eaveY - 0.32, hd + 0.08]], 0.06, 0.06, 'flat', '#d6c79f', 6); for (const x of [-0.42, 0, 0.42]) S.rect(x - 0.09, x + 0.09, eaveY - 1.0, eaveY - 0.62, hd + 0.13, 'flat', '#efe9d6'); S.add(kit.sphere(0.13, 8, 5), 'worn', { pos: [0, eaveY - 0.82, hd + 0.28], color: '#c9a24e' }); S.tube([[0, eaveY - 0.7, hd + 0.3], [0.05, 1.2, hd + 0.35]], 0.016, 0.016, 'flat', '#c9734f', 4);
    props.sign(S, 'shrine', 0.9, 0.26, { pos: [0, eaveY - 0.08, hd + 0.08] });
    T.spec.shape = 'gable'; T.spec.ridge = 'x'; T.roofL = hw + 0.25; T.roofD = hd + 0.25; T.eaveY = eaveY; T.spec.es = 0.4; T.spec.ef = 0.7; T.spec.eb = 0.55; T.spec.roof = 'kawara'; const sl = buildTiledRoof(T, S);
    // crossed gable finials and billets along the ridge
    for (const sg of [-1, 1]) { const x = sg * (T.roofL + T.spec.es - 0.05); for (const z of [-1, 1]) S.beam([x, h - 0.02, z * 0.02], [x + sg * 0.05, h + 0.75, z * 0.42], 0.08, 0.1, 'wood', '#6e3f32'); }
    for (const x of centres(-T.roofL * 0.7, T.roofL * 0.7, 4)) S.rod([x, h + 0.2, -0.22], [x, h + 0.2, 0.22], 0.085, 'wood', '#7a4a3a', 6);
    for (const [x, z, rr] of [[-w / 2 + 0.2, -d / 2 + 0.4, 0.6], [w / 2 - 0.25, 0.1, 0.5], [-w / 2 + 0.3, d / 2 - 0.3, 0.55]]) ballLeaves(S, r, [x, 0.5, z], rr, rr * 0.8, 22);
    grassPatch(S, r, 0, 0, w * 0.82, 56, { h: 0.55, rz: d * 0.82 }); ivyOnPost(T, S, [hw, fl, hd], eaveY); ivyOnPost(T, S, [-hw, fl, -hd], eaveY);
  }
  function ivyOnPost(T, S, base, top) { climbVine(S, T.r, [base[0], base[1], base[2]], [base[0] + 0.05, top - 0.1, base[2] + 0.05], 26); }
  function buildGasStation(T, S) {
    const { w, d, h, r, decay } = T, kx0 = -w / 2 + 0.2, kx1 = -w / 2 + 3.6, cz = 0.4;
    S.box(-w / 2, w / 2, -0.15, 0.1, -d / 2, d / 2, 'concrete', P.concreteMid);
    // canopy, on two columns at the islands
    const cy = h - 0.28, cx0 = -1.2, cx1 = w / 2 - 0.1, cz0 = -d / 2 + 0.3, cz1 = d / 2 - 0.1;
    for (const x of [0.8, w / 2 - 1.5]) { S.box(x - 0.15, x + 0.15, 0.1, cy, 0.1, 0.4, 'concrete', P.concreteLit); S.box(x - 0.7, x + 0.7, 0.1, 0.32, -0.3, 0.8, 'concrete', P.concrete); pump(S, x, 0.32, 0.18, T); pump(S, x, 0.32, -0.25, T); }
    S.box(cx0, cx1, cy, cy + 0.34, cz0, cz1, 'worn', '#efe6d2'); S.box(cx0 - 0.04, cx1 + 0.04, cy + 0.2, cy + 0.34, cz0 - 0.04, cz1 + 0.04, 'worn', '#b5493f'); S.box(cx0 + 0.3, cx1 - 0.3, cy - 0.04, cy, cz0 + 0.3, cz1 - 0.3, 'flat', '#8d9ba4');
    props.sign(S, 'gas', 2.6, 0.32, { pos: [(cx0 + cx1) / 2, cy + 0.14, cz1 + 0.02], board: '#b5493f' });
    for (const a of [0.34, 0.66]) { const sa = lerp(cx0, cx1, a); if (decay.level > 0.3) S.beam([sa - 0.5, cy - 0.04, cz1], [sa, cy - 0.7, cz1 + 0.02], 0.5, 0.03, 'worn', '#efe6d2', 0.1); }
    // the kiosk
    const K2 = { b: T.b, w: kx1 - kx0, d: 3.6, h: 3.1 }, kS = S.sub({ pos: [(kx0 + kx1) / 2, 0.1, -d / 2 + 2] });
    kS.box(-K2.w / 2, K2.w / 2, 0, 3, K2.d / 2 - 0.12, K2.d / 2, 'mortar', '#d9d4c0'); kS.box(-K2.w / 2, K2.w / 2, 0, 3, -K2.d / 2, -K2.d / 2 + 0.12, 'mortar', '#d9d4c0'); kS.box(-K2.w / 2, -K2.w / 2 + 0.12, 0, 3, -K2.d / 2, K2.d / 2, 'mortar', '#d9d4c0'); kS.box(K2.w / 2 - 0.12, K2.w / 2, 0, 3, -K2.d / 2, K2.d / 2, 'mortar', '#d9d4c0'); kS.box(-K2.w / 2 - 0.1, K2.w / 2 + 0.1, 3, 3.14, -K2.d / 2 - 0.1, K2.d / 2 + 0.1, 'concrete', '#b9b8ae');
    const fs = kS.sub({ pos: [0, 0, K2.d / 2 + 0.002] }); fs.rect(-K2.w / 2 + 0.3, K2.w / 2 - 0.3, 0.3, 2.3, 0.002, 'flat', DARKROOM); for (let i = 0; i < 4; i++) glassPanel(fs, lerp(-K2.w / 2 + 0.3, K2.w / 2 - 0.3, i / 4), lerp(-K2.w / 2 + 0.3, K2.w / 2 - 0.3, (i + 1) / 4), 0.3, 2.3, 0.02, { col: '#a8b4b4', mull: 2, kick: 0.2, panes: i !== 1 });
    grassPatch(S, r, 2.2, -1.6, 2.2, 70, { h: 0.7, rz: 1.4 }); ballLeaves(S, r, [cx1 - 0.3, cy + 0.42, cz0 + 0.8], 0.9, 0.5, 36); ballLeaves(S, r, [cx0 + 0.9, 0.5, cz0 - 0.2], 0.8, 0.7, 30); climbVine(S, r, [0.95, 0.3, 0.45], [0.95, cy, 0.42], 26); drape(world, r, S.w([lerp(cx0, cx1, 0.25), cy, cz1]), 1.3); drape(world, r, S.w([lerp(cx0, cx1, 0.7), cy, cz1]), 0.9);
    S.box(0.1, 1.5, 0.1, 2.2, -d / 2 + 0.2, -d / 2 + 0.26, 'worn', '#8d9ba4');
    for (let i = 0; i < 14; i++) grassPatch(S, r, r.range(-w / 2 + 0.4, w / 2 - 0.4), r.range(-d / 2 + 0.4, d / 2 - 0.4), 0.3, 12, { y: 0.1, h: 0.55 });
    const leftWall = { name: 'kiosk', len: K2.d, s: kS.sub({ pos: [-K2.w / 2, 0, 0], rot: [0, -Q, 0] }) }, backWall = { name: 'kiosk', len: K2.w, s: kS.sub({ pos: [0, 0, K2.d / 2 + 0.01] }) };
    ivySheet(leftWall, r, -K2.d / 2 + 0.1, K2.d / 2 - 0.2, 0, 3, 0.7); ivySheet(backWall, r, K2.w / 2 - 1.1, K2.w / 2 - 0.05, 0, 3, 0.8);
    ballLeaves(kS, r, [-K2.w / 2 - 0.3, 0.6, K2.d / 2 + 0.2], 0.8, 0.7, 34, { s: 0.42 }); greenPadFlat(kS, r, 0, 3.14, 0, K2.w * 0.42, K2.d * 0.4);
    return { kS, K2 };
  }
  function greenPadFlat(st, r, cx, y, cz, rx, rz) { for (let i = 0; i < 4; i++) { const x = cx + r.range(-rx, rx) * 0.7, z = cz + r.range(-rz, rz) * 0.7; st.add(kit.chip(kit.sphere(1, 7, 4), 0.1, r), 'flat', { pos: [x, y + 0.02, z], scale: [r.range(0.4, 0.8), 0.07, r.range(0.4, 0.7)], color: r() < 0.5 ? P.moss : P.mossDeep }); } }
  function pump(S, x, y, z, T) { S.box(x - 0.24, x + 0.24, y, y + 1.0, z - 0.18, z + 0.18, 'worn', '#d9d2bc'); S.add(sh.atlas.quad(0.42, 0.72, 'pump'), 'atlas', { pos: [x, y + 0.5, z + 0.185] }); S.rod([x + 0.28, y + 0.7, z], [x + 0.3, y + 0.2, z + 0.18], 0.018, 'flat', '#3f3a3a', 4); }
  function bushesRing(T, S, n) { const { r, w, d } = T; for (let i = 0; i < n; i++) { const a = r() * TAU, rr = r.range(0.5, 0.95); ballLeaves(S, r, [Math.cos(a) * w * 0.55, rr * 0.6, Math.sin(a) * d * 0.55], rr, rr * 0.8, 24); } }

  /* ---- the main assembly ---- */
  function resolveDecay(T, opts) {
    const { r } = T, given = opts.decay || {}; walk = (walk + 0.61803) % 1;
    const level = clamp(given.level ?? 0.14 + walk * 0.86);
    const d = {
      level, sag: given.sag ?? 0.04 + level * r.range(0.14, 0.3), moss: given.moss ?? clamp(0.25 + level * 0.65 + r.range(-0.1, 0.1)),
      holes: given.holes ?? (level < 0.28 ? 0 : level < 0.5 ? 1 : level < 0.8 ? 2 : 3), saplings: given.saplings ?? (level < 0.3 ? (r() < 0.4 ? 1 : 0) : level < 0.7 ? 1 : 2),
      grass: given.grass ?? clamp(0.5 + level * 0.5), bushes: given.bushes ?? 2 + Math.round(level * 2),
      collapse: given.collapse !== undefined ? given.collapse : level > 0.72 && r() < 0.75 ? {} : false, vines: given.vines, extraHoles: given.extraHoles,
    };
    return d;
  }

  function buildHouse(T) {
    const { spec, S, w, d, h, r, b } = T, decay = T.decay;
    const fl = spec.foundationTop;
    // foundation: closed, proud of the walls, sunk into the ground
    const fH = fl, sink = 0.3;
    S.box(-w / 2 - 0.05, w / 2 + 0.05, -sink, fH, -d / 2 - 0.05, d / 2 + 0.05, 'concrete', T.footCol);
    if (fH > 0.3) { const per = 0.6; for (const [a0, a1, z, nrm] of [[-w / 2, w / 2, d / 2 + 0.05, 1]]) for (let x = a0 + per / 2; x < a1; x += per + r.range(-0.1, 0.1)) S.box(x - per * 0.45, x + per * 0.45, 0.02, fH - 0.04, z - 0.02, z + 0.02, 'concrete', shade(T.footCol, r.range(0.86, 1.08))); }
    // sides
    const side = (name, rotY, pos, len) => { const s = S.sub({ pos, rot: [0, rotY, 0] }), sd = { name, s, len, ops: [], outline: null, cap: null }; s.side = sd; s.building = T; return sd; };
    T.sides = { front: side('front', 0, [0, 0, d / 2], w), right: side('right', Q, [w / 2, 0, 0], d), back: side('back', Math.PI, [0, 0, -d / 2], w), left: side('left', -Q, [-w / 2, 0, 0], d) };
    if ((spec.roof === 'thatch' || spec.roof === 'sawtooth') && T.decay.collapse) { T.decay.collapse = false; if (typeof T.decay.holes === 'number') T.decay.holes += 2; T.decay.sag *= 1.4; }
    T.col = collapseSpec(T);
    const planned = spec.open ? (typeof spec.open === 'function' ? spec.open(T) : spec.open) : {};
    for (const nm of Object.keys(T.sides)) {
      const sd = T.sides[nm]; sd.cap = collapseCap(sd, T.col, fl);
      const list = (planned[nm] || []).filter((o) => !sd.cap || Math.min(sd.cap(o.x0), sd.cap(o.x1), sd.cap((o.x0 + o.x1) / 2)) > o.y1 + 0.12);
      sd.ops = list; sd.outline = buildOutline(T, sd);
    }
    const W0 = K.b.wall.p.length, thick = spec.thick ? 0.3 : 0.14;
    // walls
    for (const nm of Object.keys(T.sides)) {
      const sd = T.sides[nm], type = spec.sides?.[nm] || spec.wall, panel = type === 'board' || type === 'boardv' ? 'wood' : type === 'tinsheet' ? 'worn' : type;
      const holes = sd.ops.map((o) => [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]]);
      const col = panel === 'wood' ? shade(CEDAR.dark, 0.72) : panel === 'worn' ? '#57605f' : spec.wallCol || r.pick(WALLCOLS[panel] || ['#d9d6cb']);
      sd.s.add(kit.wallPanel(sd.outline, holes, thick), panel, { pos: [0, 0, -thick / 2], color: col });
      skinWall(T, sd, type);
      for (const o of sd.ops) drawOpening(T, sd, o);
    }
    T.wallRange = [W0, K.b.wall.p.length];
    T.wallBox = wallAABB(K.b.wall.p, W0, K.b.wall.p.length, K.b.wood.p, T.W0wood, K.b.wood.p.length, K.b.worn.p, T.W0worn, K.b.worn.p.length);
    // ground floor and a little interior so holes and the fallen corner show something
    S.box(-w / 2 + 0.02, w / 2 - 0.02, fl - 0.06, fl, -d / 2 + 0.02, d / 2 - 0.02, 'wood', '#6e5a48');
    const exposed = T.col || (typeof decay.holes === 'number' ? decay.holes > 0 : decay.holes?.length);
    if (exposed) { S.box(-w / 2 + 0.14, w / 2 - 0.14, fl, Math.max(fl + 1.6, Math.min(T.eaveY - 0.3, T.h - 0.8)), -0.06, 0.06, 'plaster', '#e3d6b8'); if (T.f2) { const f2 = T.f2, poly = T.col ? floorOutline(T) : [[-w / 2 + 0.05, -d / 2 + 0.05], [w / 2 - 0.05, -d / 2 + 0.05], [w / 2 - 0.05, d / 2 - 0.05], [-w / 2 + 0.05, d / 2 - 0.05]]; S.add(kit.plate(poly, [], f2, 0.12), 'wood', { color: '#7a5c46' }); } if (T.d > 3 && r() < 0.6) S.add(sh.atlas.quad(1.8, 0.9, 'tatami'), 'atlas', { pos: [r.range(-0.8, 0.8), fl + 0.012, d / 4], rot: [-Q, 0, 0] }); }
    // roof
    const R = spec.ridge === 'z' ? S.sub({ rot: [0, -Q, 0] }) : S;
    T.R = R;
    let slopes = null;
    if (spec.roof === 'kawara' || spec.roof === 'tin') slopes = buildTiledRoof(T, R);
    else if (spec.roof === 'thatch') buildThatch(T, R);
    else if (spec.roof === 'flat') buildFlat(T, S);
    else if (spec.roof === 'sawtooth') buildSawtooth(T, S);
    T.slopes = slopes;
    // upper-floor apron and pent roof
    if (spec.hisashi && T.f2) buildHisashi(T);
    if (spec.balcony && T.f2) buildBalcony(T);
    if (spec.porch) buildPorch(T);
    if (T.col) { const { sx, sz, r: cr } = T.col, cx = sx * (w / 2 - cr * 0.42), cz = sz * (d / 2 - cr * 0.36); rubble(S, r, cx + sx * 0.5, cz + sz * 0.5, cr * 0.72, cr * 0.72, 12); }
    if (spec.sign) buildSign(T);
    if (spec.vsign) { const x = spec.signSide ?? (r() < 0.5 ? -1 : 1); let y = Math.min(T.eaveY - 0.25, 3.5); const xv = x * (w / 2 - 0.24); { const seat = seatBoard(T, T.sides.front, xv, y - 0.25, 0.46, 0.4, 1.34, 0.05, null, { noForward: true }); y = seat.y + 0.25; if (seat.how !== 'ok') logSign(T, spec.vsign, seat.y, 0.46, seat.how); } props.sign(T.sides.front.s, spec.vsign, 0.4, 1.34, { pos: [xv, y - 0.25, 0.46], rot: [0, x * -0.08, 0], board: '#6e5038', guard: false }); T.sides.front.s.box(xv - 0.02, xv + 0.02, y + 0.3, y + 0.42, 0, 0.5, 'worn', '#6f7a7e'); }
    if (spec.wheel !== false && b.kind === 'watermill') buildWheel(T);
    decorate(T);
    overgrow(T);
  }
  function floorOutline(T) { const { w, d } = T, { sx, sz, r: cr } = T.col, c = cr + 0.2; const pts = [[-w / 2 + 0.05, -d / 2 + 0.05], [w / 2 - 0.05, -d / 2 + 0.05], [w / 2 - 0.05, d / 2 - 0.05], [-w / 2 + 0.05, d / 2 - 0.05]]; const i = pts.findIndex(([x, z]) => Math.sign(x) === sx && Math.sign(z) === sz), p = pts[i]; pts.splice(i, 1, [p[0] - sx * c, p[1]], [p[0] - sx * c * 0.72, p[1] - sz * c * 0.5], [p[0] - sx * 0.45, p[1] - sz * c * 0.62], [p[0], p[1] - sz * c]); return sx * sz > 0 ? pts : pts.reverse(); }
  function wallAABB(a, a0, a1, b, b0, b1, c, c0, c1) { const out = { x: [1e9, -1e9], y: [1e9, -1e9], z: [1e9, -1e9] }; for (const [arr, i0, i1] of [[a, a0, a1], [b, b0, b1], [c, c0, c1]]) for (let i = i0; i < i1; i += 3) { out.x[0] = Math.min(out.x[0], arr[i]); out.x[1] = Math.max(out.x[1], arr[i]); out.y[0] = Math.min(out.y[0], arr[i + 1]); out.y[1] = Math.max(out.y[1], arr[i + 1]); out.z[0] = Math.min(out.z[0], arr[i + 2]); out.z[1] = Math.max(out.z[1], arr[i + 2]); } return out; }

  function buildHisashi(T) {
    const { spec, w, f2, r, decay, S, d } = T, o = spec.hisashi === true ? {} : spec.hisashi, y = o.y ?? f2 + 0.42, out = o.out ?? 0.9, drop = out * 0.45;
    const s = T.sides.front.s, x0 = -w / 2 - 0.02, x1 = w / 2 + 0.02;
    const Sl = slope(s.w([x0, y, 0]), s.w([x1, y, 0]), s.w([x0, y - drop, out]), s.w([x1, y - drop, out]), { sagE: decay.sag * 0.3, sagR: 0.02 });
    const holes = decay.level > 0.5 ? [[r.range(0.2, 0.8), 0.65, r.range(0.08, 0.14), r.range(0.3, 0.5)]] : [], baseT = pick4(spec.tints || TILE_TINTS[r.int(0, 5)]), field = mossFieldFor(T, Sl, T.r), tint = mossyTint(field, baseT), rt = ctx.seeded(`${seed}:${T.b.id}:h`), tinTint = spec.roof === 'tin' ? pick4(r.pick(TIN_TINTS)) : null;
    T.extraSlopes.push({ S: Sl, kind: 'pent' });
    rafterTails(world, Sl, { n: Math.max(3, Math.round(w / 0.8)), v0: 0.1, color: T.C.beam, drop: 0.08, w: 0.05, h: 0.07 });
    s.box(x0, x1, y - 0.04, y + 0.06, 0, 0.06, 'flat', '#71868f');
    if (r() < 0.6) greenPad(T, Sl, r.range(0.2, 0.8), 0.55, r.range(0.15, 0.25), 0.4, 14, field);
    if (spec.roof === 'tin') layCorrugated(K, Sl, { lenU: w, lenV: out + 0.1, wl: 0.27, course: 1.5, amp: 0.035, holes, tint: tinTint, rand: rt, sheet: 3, lip: 0, moss: field });
    else layTiles(K, Sl, { lenU: w, lenV: out + 0.1, tl: 0.34, holes, tint, rand: rt, scatter: 0.02, moss: field });
    layBoards(K, Sl, { nu: holes.length ? 8 : 3, nv: holes.length ? 4 : 1, holes, color: T.C.boards, rand: rt, k: 0.7, moss: (u, vv, n) => field(u, vv, n) * 0.85 });
    roofGrass(T, Sl, 3);
  }
  function buildBalcony(T) {
    const { w, f2, r, decay } = T, s = T.sides.front.s, x0 = -w / 2 + 0.2, x1 = w / 2 - 0.2, out = 0.62, y = f2 + 0.06;
    s.box(x0, x1, y, y + 0.08, 0, out, 'wood', T.C.beam); s.hbar(x0, x1, y + 0.82, y + 0.87, out - 0.02, out + 0.02, 'wood', T.C.frame);
    const n = Math.round((x1 - x0) / 0.16);
    for (let i = 0; i <= n; i++) { if (r() < decay.level * 0.3) continue; const x = lerp(x0, x1, i / n); s.vbar(x - 0.015, x + 0.015, y + 0.08, y + 0.82, out - 0.015, out + 0.015, 'wood', T.C.slat); }
    for (const x of [x0, x1]) s.box(x - 0.03, x + 0.03, y - 0.5, y + 0.9, out - 0.03, out + 0.03, 'wood', T.C.beam);
    if (r() < 0.6) s.rod([x0 - 0.25, y + 1.5, 0.45], [x1 + 0.25, y + 1.5, 0.48], 0.018, 'wood', '#c8b67a', 5);
  }
  function buildPorch(T) {
    const { w, r, fl, spec } = T, s = T.sides.front.s, cw = Math.min(1.5, w * 0.34), out = 0.85, y = fl + 2.25, h2 = 0.42;
    for (const x of [-cw, cw]) { s.rod([x, fl, out], [x, y, out], 0.05, 'wood', T.C.beam, 6); }
    const roof = spec.roof === 'thatch' || spec.roof === 'tin' ? 'tin' : 'kawara', Sl = slope(s.w([-cw - 0.2, y + h2, 0]), s.w([cw + 0.2, y + h2, 0]), s.w([-cw - 0.2, y, out + 0.25]), s.w([cw + 0.2, y, out + 0.25]), {}), rt = ctx.seeded(`${seed}:${T.b.id}:p`), base = pick4(spec.tints || TILE_TINTS[r.int(0, 5)]);
    const field = mossFieldFor(T, Sl, ctx.seeded(`${seed}:${T.b.id}:pm`));
    T.extraSlopes.push({ S: Sl, kind: 'porch', cw, out, y });
    if (roof === 'tin') layCorrugated(K, Sl, { lenU: cw * 2 + 0.4, lenV: out + 0.4, wl: 0.27, course: 1.5, amp: 0.035, tint: pick4(r.pick(TIN_TINTS)), rand: rt, sheet: 3, lip: 0, moss: field });
    else layTiles(K, Sl, { lenU: cw * 2 + 0.4, lenV: out + 0.4, tl: 0.34, tint: base, rand: rt, scatter: 0.02, moss: field });
    layBoards(K, Sl, { nu: 2, nv: 1, color: T.C.boards, rand: rt });
    const a = Sl(0, 0.75, new V3()), b = Sl(1, 0.75, new V3()); a.y -= 0.14; b.y -= 0.14; world.beam(a, b, 0.1, 0.14, 'wood', T.C.beam);
    s.box(-cw - 0.25, cw + 0.25, 0, fl - 0.02, 0, out + 0.1, 'concrete', T.footCol);
    s.box(-cw - 0.15, cw + 0.15, 0, 0.1, out + 0.1, out + 0.36, 'concrete', T.footCol);
  }
  /* ---- signs and eaves: every board on a wall is tested against the roofs that really exist there, sag and rafters included ---- */
  const _Wp = new V3();
  /** What is roof-shaped over a wall side: bilinear corners of each slope in the wall's own frame, for quick (x,z) → (u,v). */
  function roofFacesOn(T, side) {
    if (side.faces) return side.faces;
    const inv = new M4().copy(side.s.m).invert(), list = [];
    const add = (S, wallV, kind, sl) => {
      const P4 = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v2]) => { S(u, v2, _Wp).applyMatrix4(inv); return [_Wp.x, _Wp.z]; });
      let plate = null;
      if (wallV != null) { const pu = S(0, wallV, _Wp).applyMatrix4(inv).clone(), pv = S(1, wallV, _Wp).applyMatrix4(inv).clone(); if (Math.abs(pu.z - pv.z) < 0.3) plate = (pu.z + pv.z) / 2; } // an eave running along this wall
      list.push({ S, P4, plate, kind, inv });
    };
    if (T.slopes) for (const sl of Object.values(T.slopes)) add(sl.Tr || sl.S, sl.wallV, 'main', sl);
    for (const e of T.extraSlopes) add(e.S, null, e.kind, e);
    return (side.faces = list);
  }
  /** The lowest underside of any roof over wall point (x,z) that the board reaches into, or null when nothing is overhead. */
  function roofOver(T, side, x, z, yBottom, yTop) {
    let best = null;
    for (const f of roofFacesOn(T, side)) {
      const [p0, p1, p2, p3] = f.P4; let u = 0.5, v2 = 0.5; // Newton on the plan quad; sag lives only in y
      for (let it = 0; it < 6; it++) {
        const X0 = lerp(p0[0], p1[0], u), X1 = lerp(p2[0], p3[0], u), Z0 = lerp(p0[1], p1[1], u), Z1 = lerp(p2[1], p3[1], u), ex = lerp(X0, X1, v2) - x, ez = lerp(Z0, Z1, v2) - z;
        const dXu = lerp(p1[0] - p0[0], p3[0] - p2[0], v2), dZu = lerp(p1[1] - p0[1], p3[1] - p2[1], v2), dXv = X1 - X0, dZv = Z1 - Z0, det = dXu * dZv - dXv * dZu;
        if (Math.abs(det) < 1e-6) break; u -= (dZv * ex - dXv * ez) / det; v2 -= (dXu * ez - dZu * ex) / det;
      }
      if (u < 0 || u > 1 || v2 < -0.02 || v2 > 1.06) continue; // tiles lap a little past the eave line
      const y = f.S(u, v2, _Wp).applyMatrix4(f.inv).y;
      const under = y - (f.plate != null && Math.abs(z - f.plate) < 0.12 ? 0.42 : f.kind === 'main' ? 0.17 : 0.11);
      if (y + 0.07 < yBottom) continue; // it runs beneath the board (a pent apron under a sign): no clash
      if (under > yTop + 0.3) continue; // far above
      if (best == null || under < best) best = under;
    }
    return best;
  }
  function seatBoard(T, side, x, y, z, w, h, t, minBottom = null, { rotY = 0, noForward = false } = {}) { // → { y, z, how, arm } with how 'ok' | 'lowered' | 'forward' | 'porch'
    const NS = 8, cs = Math.cos(rotY), sn = Math.sin(rotY), top = () => y + h / 2 + 0.06, bot = () => y - h / 2 - 0.06, sOf = (i) => -w / 2 - 0.06 + ((w + 0.12) * i) / NS;
    const limitAt = (zz) => { let m = null; for (let i = 0; i <= NS; i++) for (const q of [-t - 0.02, 0.02]) { const s0 = sOf(i), u = roofOver(T, side, x + s0 * cs + q * sn, zz - s0 * sn + q * cs, bot(), top()); if (u != null && (m == null || u < m)) m = u; } return m; };
    for (const o of side.ops || []) if (o.t === 'roll' && o.x0 < x + w / 2 && o.x1 > x - w / 2 && bot() < o.y1 + 0.32 && top() > o.y1) z = Math.max(z, 0.18 + t + 0.04); // stand clear of a shutter box
    const lim = limitAt(z);
    if (lim == null || top() <= lim) return { y, z, how: 'ok' };
    const opsUnder = (side.ops || []).filter((o) => o.x0 < x + w / 2 + 0.05 && o.x1 > x - w / 2 - 0.05 && o.y1 < y + h / 2);
    const floorY = Math.max(T.fl + 0.3, minBottom ?? 0, ...opsUnder.map((o) => o.y1 + (o.t === 'roll' ? 0.3 : o.t === 'door' || o.t === 'bigdoor' ? 0.08 : 0))) + 0.05 + h / 2;
    const yl = lim - 0.08 - h / 2;
    if (yl >= floorY || noForward) return { y: yl, z, how: 'lowered' };
    let zz = z; while (zz < 2.4) { zz += 0.05; const m = limitAt(zz); if (m == null || m >= top()) break; }
    return { y, z: zz + 0.1, how: 'forward', arm: limitAt(0.2) };
  }
  function braceBoard(s, x, y, z, w, h, t, armY, z0 = 0.02) { // two steel arms from the wall to the back of the board, kept under the eave
    const ya = Math.min(armY != null ? armY - 0.06 : y, y - h * 0.25), half = Math.max(0.2, w / 2 - 0.22);
    for (const sg of [-1, 1]) { const xa = x + sg * half; s.box(xa - 0.025, xa + 0.025, ya - 0.05, ya, z0, z - t, 'worn', '#6f7a7e'); if (ya < y - h * 0.4) s.box(xa - 0.02, xa + 0.02, ya - 0.05, y, z - t - 0.03, z - t, 'worn', '#6f7a7e'); }
  }
  const logSign = (T, cell, y, z, how) => (H.signLog ||= []).push({ id: T.id, cell, y: +y.toFixed(3), z: +z.toFixed(3), how });
  /** A name board on the porch's front beam, for buildings whose district places its own sign. */
  function porchSign(T, cell, sw, sh2, board) {
    const porch = T.extraSlopes.find((e) => e.kind === 'porch'), s = T.sides.front.s; if (!porch) throw new Error(`housekit: ${T.id} has no porch for its sign`);
    const w2 = Math.min(sw, 2 * (porch.cw + 0.12)), z = porch.out + 0.35, y = porch.y - 0.16 + sh2 / 2;
    braceBoard(s, 0, y, z, w2, sh2, 0.05, porch.y + 0.02, porch.out + 0.02); props.sign(s, cell, w2, sh2, { pos: [0, y, z], guard: false, board }); logSign(T, cell, y, z, 'porch');
  }
  function buildSign(T) {
    const { spec, w, f2, r, eaveY } = T, sg = spec.sign, side = T.sides.front, s = side.s, sh2 = sg.h ?? Math.min(w - 0.5, 2.5) * 0.205, hasPent = spec.hisashi && f2, porch = !hasPent && T.extraSlopes.find((e) => e.kind === 'porch');
    let sw = sg.w ?? Math.min(w - 0.5, 2.5), y = sg.y ?? (hasPent ? (spec.hisashi.y ?? f2 + 0.42) + 0.32 : f2 ? f2 - 0.04 : Math.min(eaveY - 0.22, T.fl + 2.42)), z = hasPent ? 0.32 : 0.14, how;
    const tilt = hasPent ? -0.08 : r.range(-0.02, 0.02), roll = r.range(-0.012, 0.012);
    if (porch && !spec.falseFront) { // a porch building carries its name on the porch fascia, standing on the front beam
      sw = Math.min(sw, 2 * (porch.cw + 0.12)); z = porch.out + 0.25 + 0.1; y = porch.y - 0.16 + sh2 / 2; how = 'porch';
      braceBoard(s, 0, y, z, sw, sh2, 0.05, porch.y + 0.02, porch.out + 0.02);
    } else {
      const seat = seatBoard(T, side, 0, y, z, sw, sh2, 0.05, hasPent ? (spec.hisashi.y ?? f2 + 0.42) + 0.1 : null); y = seat.y; z = seat.z; how = seat.how;
      if (how === 'forward') braceBoard(s, 0, y, z, sw, sh2, 0.05, seat.arm);
    }
    props.sign(s, sg.cell, sw, sh2, { pos: [0, y, z], rot: [tilt, 0, roll], guard: false });
    logSign(T, sg.cell, y, z, how);
    if (hasPent && how !== 'forward') s.box(-sw / 2 - 0.02, sw / 2 + 0.02, y - sh2 / 2 - 0.1, y + sh2 / 2, z - 0.12, z - 0.06, 'wood', T.C.beam);
  }
  function buildWheel(T) {
    const { d, S } = T, st = T.sides.right.s, rad = 1.25, cy = rad + 0.15, x = -0.2, z = 0.38;
    for (const sg of [-1, 1]) st.add(kit.torus(rad, 0.06, 4, 16), 'wood', { pos: [x, cy, z + sg * 0.26], color: '#6e5a48' });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, c = Math.cos(a), s2 = Math.sin(a); st.beam([x + c * rad, cy + s2 * rad, z - 0.26], [x + c * rad, cy + s2 * rad, z + 0.26], 0.36, 0.05, 'wood', '#86664c', a); if (i % 2 === 0) st.beam([x, cy, z], [x + c * rad, cy + s2 * rad, z], 0.08, 0.05, 'wood', '#6e5a48'); }
    st.rod([x, cy, -0.1], [x, cy, z + 0.34], 0.1, 'wood', '#5e4a3c', 8);
    T.pivot = { ...st.w([x, cy, z]), r: rad };
  }

  function decorate(T) {
    const { spec, r, b } = T, sidesFree = Object.values(T.sides).filter((s) => !(spec.party || []).includes(s.name) && s.name !== 'front' && s.ops.length < 4);
    const names = spec.props || (() => { const k = ['drain']; if (!['kura', 'shed', 'barn', 'watermill', 'boathouse'].includes(b.kind)) { if (r() < 0.65) k.push('ac'); if (r() < 0.6) k.push('meter'); if (r() < 0.5) k.push('gas'); } if (r() < 0.55) k.push('pots'); if (r() < 0.4) k.push('crates'); if (r() < 0.3 && spec.roof !== 'flat') k.push('dry'); if (r() < 0.4) k.push('box'); return k; })();
    const place = (sd, w = 0.8, y = 1) => { const spans = subtract([[-sd.len / 2 + 0.3, sd.len / 2 - 0.3]], sd.ops.filter((o) => o.y0 - 0.2 < y + 0.6 && o.y1 > y - 0.2).map((o) => [o.x0 - w / 2 - 0.08, o.x1 + w / 2 + 0.08])); if (!spans.length) return null; const [a, b2] = r.pick(spans); return b2 - a > 0.1 ? r.range(a, b2) : null; };
    const pickSide = () => (sidesFree.length ? r.pick(sidesFree) : T.sides.back);
    for (const n of names) {
      const sd = pickSide(), s = sd.s, x = place(sd); if (x == null && n !== 'pots' && n !== 'dry') continue;
      const fl = T.fl;
      if (n === 'ac') props.ac(s.sub({ pos: [x, fl - 0.02, 0.19] }));
      else if (n === 'meter') props.meter(s.sub({ pos: [x, fl + 1.12, 0.01] }));
      else if (n === 'gas') props.gas(s.sub({ pos: [x, 0, 0.02] }));
      else if (n === 'box') props.box(s.sub({ pos: [x, fl + 0.65, 0.01] }));
      else if (n === 'crates') props.crates(s.sub({ pos: [x, 0, 0.02] }), r);
      else if (n === 'pots') { const sf = T.sides.front; const free = subtract([[-sf.len / 2 + 0.3, sf.len / 2 - 0.3]], sf.ops.filter((o) => o.y0 < 0.6).map((o) => [o.x0 - 0.1, o.x1 + 0.1])); const sp = free.length ? r.pick(free) : null; if (sp && sp[1] - sp[0] > 0.5) props.pots(sf.s, (sp[0] + sp[1]) / 2, r.int(2, 3), r); }
      else if (n === 'dry') { const back = T.sides.back; if (!(spec.party || []).includes('back') && b.kind !== 'school') props.dryPole(back.s.sub({ pos: [r.range(-0.3, 0.3), 0, 1.1 + r.range(0, 0.3)] }), r, Math.min(2.4, T.w * 0.7)); }
      else if (n === 'drain') { const xd = (sd.len / 2 - 0.13) * (r() < 0.5 ? 1 : -1), y1 = Math.min(T.eaveY, ...sd.outline.filter((p) => Math.abs(p[0]) > sd.len / 2 - 0.3).map((p) => p[1])) - 0.05; if (y1 > 1.4) props.drain(s, xd, 0.08, y1); }
    }
  }

  function overgrow(T) {
    const { spec, r, w, d, decay, S, b } = T, party = spec.party || [];
    // vines
    const free = Object.keys(T.sides).filter((n) => !party.includes(n));
    let vines = decay.vines;
    if (!vines) { const n = clamp(Math.round(1 + decay.level * 2.4), 1, free.length), order = free.map((s) => ({ s, k: r() + (s === 'front' ? 0.25 : 0) })).sort((a, c) => a.k - c.k).slice(0, n); vines = order.map(({ s }) => ({ side: s, cover: clamp(0.42 + decay.level * 0.5 + r.range(-0.1, 0.1)) })); if (party.length) vines.push({ side: 'front', cover: 0.25 + decay.level * 0.4, partial: true }); }
    for (const vn of vines) {
      const sd = T.sides[vn.side]; if (!sd) continue;
      const top = Math.max(...sd.outline.map((p) => p[1])), H0 = top - T.fl, cap = (u) => (slice(sd.outline, u, 0)[0] || [0, 0])[1] - 0.05;
      const half = sd.len / 2, u0 = vn.u0 ?? (vn.partial ? (r() < 0.5 ? -half + 0.05 : half - 1.4) : r.range(-half, -half + sd.len * 0.25)), u1 = vn.u1 ?? (vn.partial ? u0 + 1.3 : r.range(u0 + sd.len * 0.55, half));
      ivySheet(sd, r, Math.max(-half + 0.03, u0), Math.min(half - 0.03, u1), T.fl - 0.1, H0, vn.cover, { sCap: cap, scale: T.leafScale });
    }
    // bushes against the base, on the sides that are open
    const openSides = Object.keys(T.sides).filter((n) => !party.includes(n));
    for (let i = 0; i < decay.bushes; i++) {
      const n = r.pick(openSides), sd = T.sides[n], x = r.range(-sd.len / 2, sd.len / 2), hit = sd.ops.find((o) => o.y0 < 0.5 && x > o.x0 - 0.3 && x < o.x1 + 0.3); if (hit) continue;
      const rr = r.range(0.48, 0.95); ballLeaves(sd.s, r, [x, rr * 0.5, rr * 0.55], rr, rr * r.range(0.8, 1.05), Math.round((rr * rr * 56 + 12) * T.leafScale), { y0: 0.05 + (b.elev || 0), s: 0.42 });
    }
    // grass skirt
    const g0 = decay.grass, walk_ = [['front', 0.22], ['back', 0.4], ['left', 0.4], ['right', 0.4]];
    for (const [n, outD] of walk_) {
      if (party.includes(n)) continue;
      const sd = T.sides[n], cnt = Math.round(sd.len * 1.2 * g0 * Math.sqrt(T.leafScale));
      for (let i = 0; i < cnt; i++) { const x = r.range(-sd.len / 2, sd.len / 2), dd = 0.08 + Math.pow(r(), 1.6) * outD * 2.2, o = sd.ops.find((q) => q.y0 < 0.45 && x > q.x0 && x < q.x1); if (o && dd < 0.8 && r() < 0.8) continue; grassPatch(sd.s, r, x, dd, 0.12, 5, { y: 0.02, h: r.range(0.42, 0.72) }); }
    }
    // far-read mass: a big clump at one exposed corner, if the kind allows
    if (!party.includes('left') || decay.level > 0.3) { const sx = r() < 0.5 ? -1 : 1, sz = r() < 0.5 ? -1 : 1; if (party.length && (sx === -1 || sx === 1)) { ballLeaves(S, r, [sx * (w / 2 - 0.5), 0.6, -d / 2 - 0.45], 0.7, 0.62, 18); } else { ballLeaves(S, r, [sx * (w / 2 + 0.3), 0.75, sz * (d / 2 + 0.3)], r.range(0.8, 1.2), r.range(0.8, 1.1), 40); } }
  }

  /* ---- H.build ---- */
  H.build = (b, opts = {}) => {
    const r = H.rand(b.id), kind = b.kind, S = H.local(b), special = ['watertower', 'firetower', 'gasstation', 'shrine', 'pavilion'].includes(kind);
    const def = KINDS[kind] ? KINDS[kind](r, b) : {};
    if (!KINDS[kind] && !special) throw new Error(`housekit: unknown kind "${kind}"`);
    const spec = { wall: 'plaster', roof: 'kawara', shape: 'gable', ridge: 'x', pitch: 0.46, es: 0.25, ef: 0.35, eb: 0.3, foundationH: 0.22, band: null, timbers: false, ...def, ...opts };
    if (typeof opts.open === 'object') spec.open = opts.open;
    const T = { b, spec, S, r, rng: r, w: b.w, d: b.d, h: b.h, id: b.id, seedN: r() * 10, teeth: Math.max(2, Math.round(b.w / 3.1)), extraSlopes: [] };
    T.fl = spec.foundationTop = spec.foundationH; T.leafScale = 1;
    T.C = { beam: r.pick(['#86664c', '#7a5c46', '#7c604a']), frame: r.pick(['#a98a6a', '#94785a', '#c8a884']), slat: r.pick(['#c8a884', '#b89a72']), door: r.pick(['#7a5c46', '#6e5038', '#8d8270', '#6f9fb0']), boards: '#6d5240' };
    T.footCol = r.pick(['#b9b5a8', '#a9a596', '#c6c1b0']);
    T.decay = resolveDecay(T, opts); T.leafScale = clamp(22 / (b.w * b.d), 0.55, 1) * (1 - Math.max(0, T.decay.level - 0.5) * 0.45);
    T.roofL = spec.ridge === 'x' ? b.w / 2 : b.d / 2; T.roofD = spec.ridge === 'x' ? b.d / 2 : b.w / 2;
    const span = T.roofD, rise = spec.shape === 'mono' ? span * 2 * spec.pitch : span * spec.pitch;
    T.eaveY = spec.eaveY ?? Math.max(2.35, b.h - rise);
    T.f2 = spec.f2Off || T.eaveY < 3.1 ? 0 : spec.f2 ?? T.fl + 2.4;
    if (T.f2 && T.eaveY - T.f2 < 0.55) T.f2 = 0;
    if (spec.roof === 'flat') T.eaveY = b.h - 0.04;
    S.env.base = b.elev || 0; S.env.top = (b.elev || 0) + (spec.roof === 'flat' ? b.h : T.eaveY);
    const mark = { wood: K.b.wood.tris, wall: K.b.wall.tris, roof: K.b.roof.tris, worn: K.b.worn.tris, atlas: K.b.atlas.tris, glass: K.b.glass.tris, leaves: K.leaves.length, blades: K.blades.length };
    T.W0wood = K.b.wood.p.length; T.W0worn = K.b.worn.p.length;
    let extra = {};
    if (special) {
      if (kind === 'watertower') buildWaterTower(T, S); else if (kind === 'firetower') buildFireTower(T, S); else if (kind === 'pavilion') buildPavilion(T, S); else if (kind === 'shrine') buildShrine(T, S); else if (kind === 'gasstation') extra = buildGasStation(T, S);
      T.sides = { front: { s: S.sub({ pos: [0, 0, b.d / 2] }), len: b.w }, right: { s: S.sub({ pos: [b.w / 2, 0, 0], rot: [0, Q, 0] }), len: b.d }, back: { s: S.sub({ pos: [0, 0, -b.d / 2], rot: [0, Math.PI, 0] }), len: b.w }, left: { s: S.sub({ pos: [-b.w / 2, 0, 0], rot: [0, -Q, 0] }), len: b.d } };
    } else buildHouse(T);
    const leafT = (K.leaves.length - mark.leaves) * 4, bladeT = (K.blades.length - mark.blades) * 4, shell = (K.b.wood.tris - mark.wood) + (K.b.wall.tris - mark.wall) + (K.b.roof.tris - mark.roof) + (K.b.worn.tris - mark.worn) + (K.b.atlas.tris - mark.atlas) + (K.b.glass.tris - mark.glass);
    H.stats[b.id] = { kind, tris: shell + leafT + bladeT, shell, by: { wood: K.b.wood.tris - mark.wood, wall: K.b.wall.tris - mark.wall, worn: K.b.worn.tris - mark.worn, atlas: K.b.atlas.tris - mark.atlas, glass: K.b.glass.tris - mark.glass }, leaves: leafT, grass: bladeT, roof: K.b.roof.tris - mark.roof, level: +T.decay.level.toFixed(2), wall: spec.wall, roofType: spec.roof, wallBox: T.wallBox || null };
    const sideStages = {}; for (const n of Object.keys(T.sides)) sideStages[n] = T.sides[n].s;
    return {
      S, ...sideStages, dims: { w: b.w, d: b.d, h: b.h, fl: T.fl, f2: T.f2, eaveY: T.eaveY }, spec, rng: r, decay: T.decay, openings: Object.fromEntries(Object.entries(T.sides).map(([k, s]) => [k, s.ops || []])), pivot: T.pivot, ...extra,
      porchSign: (cell, w2, h2, board) => porchSign(T, cell, w2, h2, board),
      ivy: (side, cover = 0.7, o = {}) => { const sd = T.sides[side], half = sd.len / 2; ivySheet(sd, r, o.u0 ?? -half, o.u1 ?? half, o.y0 ?? T.fl - 0.1, (o.height ?? T.eaveY) - T.fl, cover, { sCap: sd.outline ? (u) => (slice(sd.outline, u, 0)[0] || [0, 0])[1] - 0.05 : null }); },
      bush: (x, z, rr = 0.7) => ballLeaves(S, r, [x, rr * 0.5, z], rr, rr * 0.9, Math.round(rr * rr * 56 + 12), { s: 0.42 }), sapling: (x, y, z, hh = 1.6) => sapling(S, r, [x, y, z], hh), grass: (x, z, rad, n, o) => grassPatch(S, r, x, z, rad, n, o), clump: (c, rx, ry, n, o) => ballLeaves(S, r, c, rx, ry, n, o), rubble: (x, z, rx, rz, n) => rubble(S, r, x, z, rx, rz, n),
    };
  };

  /* ---- H.finish: the fixed set of meshes ---- */
  H.finish = (group) => {
    const out = [], { kit: K2 } = ctx, onRing = (p, m) => { const { CORE, BASE } = ctx.layout, q = Math.max(Math.abs(p.x), Math.abs(p.z)); return q > CORE.half + m && q < BASE.half - m; };
    // no single leaf or blade of a ring building may hang over the core or off the plinth
    const n0 = [K.leaves.length, K.blades.length]; K.leaves = K.leaves.filter((l) => onRing(l.p, l.s * 0.85)); K.blades = K.blades.filter((l) => onRing(l, 0.16)); H.seamDrop = [n0[0] - K.leaves.length, n0[1] - K.blades.length];
    const addB = (buf, mat, { castShadow = true, receiveShadow = true, ...o } = {}) => { if (!buf.tris) return; const g = buf.geometry(); if (o.worldUV) K2.worldUV(g, o.worldUV); const m = new THREE.Mesh(g, mat); m.castShadow = castShadow; m.receiveShadow = receiveShadow; m.name = `${name}-${mat.name || 'kit'}`; group.add(m); if (o.noOutline) ctx.noOutline(m); out.push(m); };
    addB(K.b.wood, sh.wood, { worldUV: sh.wood.userData.uv }); addB(K.b.wall, sh.wall); addB(K.b.roof, sh.roof); addB(K.b.worn, sh.worn); addB(K.b.atlas, sh.atlasMat);
    addB(K.b.glass, sh.glass, { castShadow: false, receiveShadow: false, noOutline: true });
    const list = K.leaves;
    if (list.length) {
      const n = list.length, g = new THREE.BufferGeometry(), m = new M4(), Tt = new V3(), U = new V3(), Bn = new V3(), shell = new Float32Array(n * 3), one = new V3();
      for (const k of ['position', 'normal', 'uv', 'color']) g.setAttribute(k, sh.shellLeaf.attributes[k]);
      g.setIndex(sh.shellLeaf.index);
      const mesh = new THREE.InstancedMesh(g, sh.shellMat, n);
      list.forEach((l, i) => {
        Tt.copy(l.tip); U.copy(l.shell).addScaledVector(Tt, -l.shell.dot(Tt)).normalize(); Bn.crossVectors(U, Tt).normalize();
        m.makeBasis(Bn, U, Tt).scale(one.set(l.s, l.s, l.s)); m.setPosition(l.p); mesh.setMatrixAt(i, m); mesh.setColorAt(i, l.tone); shell[i * 3] = l.shell.x; shell[i * 3 + 1] = l.shell.y; shell[i * 3 + 2] = l.shell.z;
      });
      g.setAttribute('aShell', new THREE.InstancedBufferAttribute(shell, 3));
      mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.name = `${name}-leaves`; group.add(ctx.softEdge(mesh)); out.push(mesh);
    }
    if (K.blades.length) {
      const n = K.blades.length, mesh = new THREE.InstancedMesh(sh.blade, sh.grass, n), m = new M4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new V3(), sc = new V3();
      K.blades.forEach((l, i) => { e.set(l.rx, l.yaw, l.rz, 'YXZ'); q.setFromEuler(e); m.compose(p.set(l.x, l.y, l.z), q, sc.set(l.h, l.h, l.h)); mesh.setMatrixAt(i, m); mesh.setColorAt(i, l.c); });
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = `${name}-grass`; group.add(ctx.softEdge(mesh)); out.push(mesh);
    }
    let tris = K.leaves.length * 4 + K.blades.length * 4; for (const b of Object.values(K.b)) tris += b.tris;
    const info = { meshes: out.length, tris, perBuilding: H.stats, signs: H.signLog || [], atlas: { extent: sh.atlas.packer.extent(), cells: sh.atlas.packer.count() }, seamDrop: H.seamDrop }; group.userData.houseKit = info;
    return { meshes: out, tris, info };
  };
  return H;
}
