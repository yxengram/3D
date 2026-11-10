// Night: what only shows after dark. Fireflies over the water and the long grass, and the halos of the few lamps that still burn.
// Other modules register their lamps in shared.lamps while they build ({ pos, r, color, power, halo, lift, k(t) }); this module, built last,
// (`at` puts the halo somewhere other than the light itself.) It bakes them into the toon shader's lamp map and draws one batch of camera-facing halos. Everything here scales with shared.uNight and draws nothing by day.
export function build(ctx) {
  const { THREE, layout, shared } = ctx, group = new THREE.Group(); group.name = 'night';
  const { WATER, RIVER, MEADOW, RING_ZONES, BUILDING, TOWN, TORII, BASE, RAIL, inBuilding, insideBuilding } = layout;
  const lin = (hex) => new THREE.Color(hex);
  /* ---------- lamps ---------- */
  // Two soft lights that belong to no fixture: the fireflies gathered over the pond and over the flooded ground floor.
  const breathe = (ph) => (t) => 0.72 + 0.28 * Math.sin(t * 0.9 + ph);
  shared.lamps.push({ pos: [WATER.pond.x, 0.9, WATER.pond.z], r: 5.5, color: '#c9ff78', power: 0.34, halo: 0, k: breathe(0) });
  shared.lamps.push({ pos: [-4.6, 1.5, -1.9], r: 5.5, color: '#c9ff78', power: 0.32, halo: 0, k: breathe(2.1) });
  const lamps = shared.lamps.map((l) => ({ power: 1, halo: 1.3, lift: 0.5, k: null, ...l, col: lin(l.color) }));
  // The lamp map: what each lamp adds to each texel is fixed, only its strength flickers, so the bake is a sparse list per lamp and a few thousand additions a frame.
  const SPAN = ctx.lampSpan, YS = ctx.lampY, RES = 256, texel = SPAN / RES, data = new Uint8Array(RES * RES * 4), acc = new Float32Array(RES * RES * 3), best = new Float32Array(RES * RES);
  for (const l of lamps) {
    const idx = [], w = [], x0 = Math.max(0, Math.floor((l.pos[0] - l.r + SPAN / 2) / texel)), x1 = Math.min(RES - 1, Math.ceil((l.pos[0] + l.r + SPAN / 2) / texel));
    const z0 = Math.max(0, Math.floor((l.pos[2] - l.r + SPAN / 2) / texel)), z1 = Math.min(RES - 1, Math.ceil((l.pos[2] + l.r + SPAN / 2) / texel));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const dx = (i + 0.5) * texel - SPAN / 2 - l.pos[0], dz = (j + 0.5) * texel - SPAN / 2 - l.pos[2], h = 1 - (dx * dx + dz * dz) / (l.r * l.r);
      if (h <= 0) continue;
      const t = j * RES + i; idx.push(t); w.push(h * h * l.power);
      if (h > best[t]) { best[t] = h; data[t * 4 + 3] = Math.round(255 * THREE.MathUtils.clamp((l.pos[1] - YS[0]) / (YS[1] - YS[0]), 0, 1)); } // the nearest lamp sets the height the light hangs at
    }
    l.idx = Uint32Array.from(idx); l.w = Float32Array.from(w);
  }
  const touched = Uint32Array.from(new Set(lamps.flatMap((l) => Array.from(l.idx))));
  const map = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; map.name = 'night.lampMap';
  shared.uLampMap.value = map;
  const bake = () => {
    for (let q = 0; q < touched.length; q++) { const t = touched[q] * 3; acc[t] = acc[t + 1] = acc[t + 2] = 0; }
    for (const l of lamps) { const k = l.now, r = l.col.r * k, g = l.col.g * k, b = l.col.b * k, { idx, w } = l; for (let q = 0; q < idx.length; q++) { const t = idx[q] * 3, s = w[q]; acc[t] += r * s; acc[t + 1] += g * s; acc[t + 2] += b * s; } }
    for (let q = 0; q < touched.length; q++) { const t = touched[q]; data[t * 4] = Math.min(255, acc[t * 3] * 255); data[t * 4 + 1] = Math.min(255, acc[t * 3 + 1] * 255); data[t * 4 + 2] = Math.min(255, acc[t * 3 + 2] * 255); }
    map.needsUpdate = true;
  };

  const lit = lamps.filter((l) => l.halo > 0), nh = lit.length;
  const haloK = new Float32Array(Math.max(1, nh) * 4);
  let halos = null;
  if (nh) {
    const g = new THREE.BufferGeometry(), centre = new Float32Array(nh * 12), corner = new Float32Array(nh * 8), tint = new Float32Array(nh * 12), size = new Float32Array(nh * 8), index = [];
    lit.forEach((l, i) => {
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([cx, cy], j) => {
        const v = i * 4 + j;
        centre.set(l.at || l.pos, v * 3); corner.set([cx, cy], v * 2); tint.set([l.col.r, l.col.g, l.col.b], v * 3); size.set([l.halo, l.lift], v * 2);
      });
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    g.setAttribute('position', new THREE.BufferAttribute(centre, 3)); g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 2));
    g.setAttribute('aK', new THREE.BufferAttribute(haloK, 1).setUsage(THREE.DynamicDrawUsage)); g.setIndex(index);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec2 aCorner,aSize; attribute vec3 aTint; attribute float aK; varying vec2 vC; varying vec3 vTint;
        void main(){
          vec4 mv=viewMatrix*vec4(position,1.);
          mv.xyz+=normalize(-mv.xyz)*aSize.y;            // toward the eye, clear of the fixture's own housing
          mv.xy+=aCorner*aSize.x*(.8+.2*aK);
          vC=aCorner; vTint=aTint*aK; gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vC; varying vec3 vTint;
        void main(){ float l=length(vC); float a=exp(-l*l*6.)*.34+smoothstep(.3,.0,l)*.95; a*=smoothstep(1.,.7,l); gl_FragColor=vec4(vTint*a,1.); }`,
    });
    mat.userData.nightKeep = true;
    halos = new THREE.Mesh(g, mat); halos.frustumCulled = false; halos.renderOrder = 6; halos.name = 'night-halos';
    group.add(halos);
  }

  /* ---------- fireflies ---------- */
  const rng = ctx.rng, spots = [];
  const blocked = (x, z) => inBuilding(x, z, 0.4) || insideBuilding(x, z)
    || (x > TOWN.row.x[0] && x < TOWN.row.x[1] && z > TOWN.row.z[0] && z < TOWN.row.z[1])
    || (x > TOWN.bathhouse.x[0] && x < TOWN.bathhouse.x[1] && z > TOWN.bathhouse.z[0] && z < TOWN.bathhouse.z[1])
    || (x > RAIL.bed.x[0] && x < RAIL.bed.x[1]) || Math.max(Math.abs(x), Math.abs(z)) > BASE.half - 0.8;
  /** n fireflies in a box, hovering lo..hi above y. `sync` is the swarm's shared rhythm: neighbours flash almost together. */
  const swarm = (n, x, z, y, lo, hi, { indoor = false } = {}) => {
    const sync = rng.range(0, 6.283), rate = rng.range(1.5, 2.1);
    for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
      const px = rng.range(x[0], x[1]), pz = rng.range(z[0], z[1]);
      if (!indoor && blocked(px, pz)) continue;
      spots.push([px, y + lo + (hi - lo) * Math.pow(rng(), 1.6), pz, sync + rng.range(-1.1, 1.1), rate * rng.range(0.92, 1.08), rng(), rng()]); i++;
    }
  };
  const P = WATER.pond, IP = WATER.indoorPool;
  swarm(64, [P.x - P.rx - 1, P.x + P.rx + 1], [P.z - P.rz - 1.2, P.z + P.rz + 1.2], WATER.y, 0.15, 1.9);
  swarm(40, IP.x, IP.z, WATER.indoorY, 0.2, 2.3, { indoor: true });
  for (let i = 1; i < RIVER.center.length; i++) { // along the canal, bank to bank and a little past
    const [ax, az] = RIVER.center[i - 1], [bx, bz] = RIVER.center[i], len = Math.hypot(bx - ax, bz - az);
    swarm(Math.round(len * 3.4), [Math.min(ax, bx) - 1.8, Math.max(ax, bx) + 1.8], [Math.min(az, bz) - 1.8, Math.max(az, bz) + 1.8], RIVER.y, 0.2, 2.1);
  }
  swarm(80, [-6, 13], [12, 19.8], 0.1, 0.25, 1.8);                                      // the meadow: sunflowers, greenhouse, the lost path
  swarm(36, MEADOW.playground.x, MEADOW.playground.z, 0.1, 0.25, 2.0);
  swarm(44, [1.5, 9.5], [1, 8.5], 0.1, 0.25, 2.2);                                       // the street corner, under the banyan's reach
  swarm(96, RING_ZONES.paddies.x, RING_ZONES.paddies.z, 0.5, 0.2, 1.5);
  swarm(34, RING_ZONES.kitchenFields.x, RING_ZONES.kitchenFields.z, 0.1, 0.3, 1.5);
  swarm(26, RING_ZONES.scrub.x, RING_ZONES.scrub.z, 0.1, 0.4, 2.2);
  swarm(26, RING_ZONES.orchard.x, RING_ZONES.orchard.z, 0.4, 0.4, 2.4);
  swarm(56, [RING_ZONES.shrineHill.x[0] + 1, RING_ZONES.shrineHill.x[1] - 0.6], [RING_ZONES.shrineHill.z[0] + 1, RING_ZONES.shrineHill.z[1] - 0.6], RING_ZONES.shrineHill.y, 0.3, 2.6);
  swarm(18, [TORII.x - 1.5, TORII.x + 3.5], [TORII.z - 2.2, TORII.z + 2.2], 0.2, 0.4, 3.2);
  swarm(46, RING_ZONES.bamboo.x, RING_ZONES.bamboo.z, 0.1, 0.4, 3.4);
  swarm(26, RING_ZONES.pool.x, RING_ZONES.pool.z, -0.2, 0.3, 1.6);
  swarm(150, [-BASE.half + 1, BASE.half - 1], [-BASE.half + 1, BASE.half - 1], 0.15, 0.3, 1.7); // and a thin scatter everywhere else

  const nf = spots.length, pos = new Float32Array(nf * 3), seed = new Float32Array(nf * 4);
  spots.forEach((s, i) => { pos.set(s.slice(0, 3), i * 3); seed.set(s.slice(3), i * 4); });
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); fg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const fu = { uTime: shared.uTime, uNight: { value: 0 }, uScale: { value: 1000 }, uDpr: { value: 1 }, uCol: { value: lin('#d2ff5e') } };
  const fmat = new THREE.ShaderMaterial({
    uniforms: fu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime,uNight,uScale,uDpr; attribute vec4 aSeed; varying float vGlow;
      void main(){
        float t=uTime, a=aSeed.z*6.283, b=aSeed.w*6.283;
        vec3 p=position;                                   // a slow wander, a closed form of t
        p.x+=sin(t*(.21+.2*aSeed.z)+a)*.9+sin(t*.83+b)*.16;
        p.z+=cos(t*(.19+.2*aSeed.w)+b)*.9+cos(t*.71+a)*.16;
        p.y+=sin(t*(.33+.25*aSeed.w)+a*1.7)*.32;
        float flash=sin(t*aSeed.y+aSeed.x);                 // on for a breath, off for a breath; a swarm keeps time
        vGlow=uNight*(.1+.9*smoothstep(-.15,.75,flash));
        vec4 mv=viewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        float px=.2*uScale/-mv.z, lo=2.3*uDpr;
        vGlow*=clamp(px/lo,.3,1.);                          // from across the model they are sparks, not snow
        gl_PointSize=clamp(px,lo,30.*uDpr);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; varying float vGlow;
      void main(){ float l=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.0,l); gl_FragColor=vec4(uCol*(a*a*.8+smoothstep(.5,.15,l)*2.6)*vGlow,1.); }`,
  });
  fmat.userData.nightKeep = true;
  const flies = new THREE.Points(fg, fmat); flies.frustumCulled = false; flies.renderOrder = 5; flies.name = 'night-fireflies';
  group.add(flies);
  ctx.noOutline(group);
  group.visible = false;
  group.userData.night = { lamps: lamps.length, halos: nh, fireflies: nf };

  const size = new THREE.Vector2(); let wasOn = true;
  function update(t) {
    const n = shared.uNight.value, on = n > 0.001;
    if (group.visible !== on) group.visible = on;
    const gain = n * n; // lamps come on late in the dusk
    for (const l of lamps) l.now = on ? gain * (l.k ? l.k(t) : 1) : 0;
    if (on || wasOn) bake(); // once more on the way out, so the map ends black
    wasOn = on;
    if (!on) return;
    if (halos) { lit.forEach((l, i) => haloK.fill(l.now, i * 4, i * 4 + 4)); halos.geometry.attributes.aK.needsUpdate = true; }
    const h = ctx.renderer.getDrawingBufferSize(size).y;
    fu.uNight.value = THREE.MathUtils.smoothstep(n, 0.45, 1); fu.uDpr.value = ctx.renderer.getPixelRatio();
    fu.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov / 2)));
  }
  update(0);
  return { group, update };
}
