// layout.js — THE shared spatial contract. Every module reads coordinates from here.
// Units: 1 unit ≈ 1 m-ish (miniature). y up. Ground y=0. Base top is y=0, spans x,z ∈ [-12,12].
// Default camera looks from (+x,+y,+z) toward the origin.
//
//   z=-12 (back)
//   ┌────────────────────────────┬─────────┬───────┐
//   │ BUILDING  x[-11,1.5]       │sw│ ROAD │sw│ footbridge stairs
//   │           z[-11,0.5]       │  │x-arm │  │ / car on soil band
//   │       (trunk at -4.75,-5.25)│  │[3.2, │  │ x[9,12]
//   │                            │  │ 7.8] │  │
//   ├────────────────────────────┘  │      │  │
//   │ inner sidewalk z[.5,2.2]      └      │  │
//   │ ROAD z-arm z[2.2,6.8] ─────────────┐ │  │
//   │ outer sidewalk z[6.8,8]                 kiosk
//   │ raised terrace(left) │ POND(center) soil band z[8,12]
//   └────────────────────────────────────────────────┘ z=+12 (front, nearest camera)
//                                                    x=+12 (right, near camera)

const n = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

export const SUN_DIR = n([0.42, 0.8, -0.42]); // unit vector pointing TOWARD the sun

// The `base` block is solid only up to coreTopY (hidden). Ground plates run from their surface down to -0.8,
// so basins can be cut through them. Side-wall strata (base module) cover the outer faces from y=-3.4 up to y=0.
export const BASE = { half: 12, height: 3.4, topY: 0, coreTopY: -0.75 };

export const GROUND = {
  roadY: 0.0,
  sidewalkY: 0.12,
  soilY: 0.05,
  road: {
    zArm: { x: [-12, 7.8], z: [2.2, 6.8] },
    xArm: { x: [3.2, 7.8], z: [-12, 6.8] },
    innerCorner: { x: 3.2, z: 2.2, radius: 1.2 }, // curb corner around the building
    outerCorner: { x: 7.8, z: 6.8, radius: 1.8 },
  },
  innerSidewalk: { eastX: [1.5, 3.2], southZ: [0.5, 2.2] },
  outerSidewalk: { southZ: [6.8, 8.0], eastX: [7.8, 9.0] },
  soilFront: { z: [8.0, 12] },   // front soil band
  soilRight: { x: [9.0, 12] },   // right soil band
  terrace: { x: [-12, -5], z: [8.8, 12], y: 0.9 }, // raised planted terrace (front-left)
  // mossy stone steps: climb west up the terrace's east wall, so they face the default camera. Treads run along x, lowest nose at x[1].
  // path: worn stepping-stone line from the stair foot to the outer sidewalk, bending east of the flower clump at FLOWER_SPOTS[8].
  steps: { x: [-5.16, -3.66], z: [10.0, 11.6], count: 5, path: [[-3.42, 10.8], [-3.12, 10.15], [-2.76, 9.55], [-2.36, 9.0], [-2.26, 8.08]] },
  planters: [ { x: -10.2, z: 10.4, w: 2.2, d: 1.1 }, { x: -6.6, z: 10.9, w: 1.8, d: 1.0 } ],
  manhole: { x: 4.6, z: -0.8, r: 0.55 }, // cover pushed open, ferns burst from it
  cracks: [ // road crack polylines (x,z)
    [[-1.6, 4.2], [-2.8, 3.3], [-3.3, 2.5]],
    [[-1.6, 4.2], [-1.0, 5.6], [0.2, 6.9], [0.9, 8.1]],
    [[5.2, 4.2], [4.3, 2.8], [5.8, 0.6], [5.1, -2.4]],
    [[-8.8, 2.8], [-7.4, 4.2], [-8.2, 6.4]],
    [[6.8, -5.2], [5.2, -7.4], [6.2, -11.8]],
  ],
};

export const WATER = {
  y: -0.06,           // pond surface. The pond sits in a real basin: ground module cuts an elliptical hole in the soil plate.
  // The stream is a shallow film ABOVE the ground that the water module lays on top of the broken road, then spills
  // over a small pebble lip into the pond. Heights along it (same order as `stream`):
  streamY: [0.05, 0.05, 0.05, 0.1, 0.1],
  sidewalkGap: { x: [-0.5, 1.3] }, // ground module leaves the outer sidewalk broken away here so the stream passes through
  spring: [-1.6, 4.2],                    // water wells up from the road crack here
  stream: [[-1.6, 4.2], [-1.0, 5.6], [0.2, 6.9], [0.9, 8.1], [1.4, 8.8]], // center-line, flows into pond
  streamWidth: [0.35, 0.9],               // width at spring → at pond
  pond: { x: 1.8, z: 10.0, rx: 3.6, rz: 1.75 },
  indoorY: 0.32,      // indoor shallow water surface on the ground floor
  indoorPool: { x: [-9.6, 1.0], z: [-3.6, 0.2] }, // rough extent, avoid trunk
};

const LEVEL_Y = [0.16, 2.86, 5.56, 8.26, 10.96];

// Slab outlines as [x,z] CCW-ish polygons (jagged edges are the collapse). Top of slab at `y`.
export const BUILDING = {
  x: [-11, 1.5], z: [-11, 0.5],
  wallT: 0.28, slabT: 0.26, floorH: 2.7,
  levelY: LEVEL_Y,
  // The +x+z corner has collapsed in terraces toward the camera, doll-house style.
  slabs: [
    { y: LEVEL_Y[0], outline: [[-11, -11], [1.5, -11], [1.5, 0.5], [-11, 0.5]], holes: [] },
    { y: LEVEL_Y[1],
      outline: [[-11, -11], [1.5, -11], [1.5, -3.0], [0.9, -2.6], [1.2, -1.7], [0.4, -1.0], [0.7, -0.3], [-0.3, 0.5], [-11, 0.5]],
      holes: [{ x: -4.75, z: -5.25, r: 2.7 }, { x: -1.2, z: -2.0, r: 1.05 }] },
    { y: LEVEL_Y[2],
      outline: [[-11, -11], [1.5, -11], [1.5, -5.6], [0.7, -5.0], [0.2, -5.2], [-0.6, -3.9], [-1.4, -3.6], [-2.0, -2.5], [-2.9, -2.2], [-3.4, -1.0], [-4.2, -0.8], [-4.6, 0.1], [-5.2, 0.5], [-11, 0.5]],
      holes: [{ x: -4.75, z: -5.25, r: 2.4 }, { x: -9.45, z: -6.35, r: 0.95 }] },
    { y: LEVEL_Y[3],
      outline: [[-11, -11], [1.5, -11], [1.5, -7.6], [0.6, -7.3], [0.1, -6.2], [-0.9, -6.0], [-1.6, -4.6], [-2.2, -2.9], [-3.0, -2.6], [-4.4, -1.9], [-5.0, -0.9], [-6.1, -0.7], [-6.6, 0.1], [-7.4, 0.5], [-11, 0.5]],
      holes: [{ x: -4.75, z: -5.25, r: 2.2 }, { x: -8.0, z: -7.8, r: 1.0 }] },
    { y: LEVEL_Y[4], // roof
      outline: [[-11, -11], [1.5, -11], [1.5, -9.2], [0.6, -8.8], [0.2, -7.7], [-0.8, -7.4], [-1.0, -6.0], [-1.6, -4.9], [-1.9, -3.4], [-2.9, -2.7], [-3.6, -2.0], [-4.6, -1.8], [-5.6, -1.6], [-6.6, -0.6], [-7.6, -0.4], [-8.4, 0.1], [-8.8, 0.5], [-11, 0.5]],
      holes: [{ x: -4.75, z: -5.25, r: 2.3 }, { x: -6.6, z: -9.2, r: 0.95 }, { x: -8.2, z: -3.8, r: 1.1 }] },
  ],
  // Facade requirements. Walls follow the slab outlines upward; their tops are jagged.
  facades: {
    south: { z: 0.5, x: [-11, 1.5] },  // faces +z toward camera
    east: { x: 1.5, z: [-11, 0.5] },   // faces +x toward camera
    north: { z: -11, x: [-11, 1.5] },
    west: { x: -11, z: [-11, 0.5] },
  },
  shopWindow: { face: 'south', x: [-9.6, -0.8], y: [0.4, 2.5] }, // shattered floor-to-ceiling glazing
  eastHole: { face: 'east', z: [-6.5, -3.6], y: [0.3, 2.45] },   // collapsed wall hole, ground floor
  southHole1F: { face: 'south', x: [-7.5, -5.6], y: [3.2, 5.0] },// hole in 1F south wall
};

export const insideBuilding = (x, z) => x > BUILDING.x[0] && x < BUILDING.x[1] && z > BUILDING.z[0] && z < BUILDING.z[1];
export function pointInPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
/** true if (x,z) stands on solid slab of level i (not over the collapse or a hole). margin in units. */
export function onSlab(level, x, z, margin = 0) {
  const s = BUILDING.slabs[level];
  if (!pointInPoly(x, z, s.outline)) return false;
  for (const h of s.holes) if (Math.hypot(x - h.x, z - h.z) < h.r + margin) return false;
  if (margin > 0) for (let a = 0; a < 8; a++) {
    const px = x + Math.cos(a * 0.785) * margin, pz = z + Math.sin(a * 0.785) * margin;
    if (!pointInPoly(px, pz, s.outline)) return false;
  }
  return true;
}

// Interior program. Coordinates must satisfy onSlab(level,x,z).
export const ROOMS = {
  ground: { level: 0, name: 'convenience store', note: 'flooded shop floor seen through the south shop window and the east hole' },
  first: { level: 1, name: 'living room', note: 'seen from the collapsed corner; sofa, piano, fallen chandelier' },
  second: { level: 2, name: 'cafe / study', note: 'tables, chairs, crates, loose pages' },
  third: { level: 3, name: 'overgrown attic', note: 'ferns, moss, crates, torn curtains' },
};

export const TREE = {
  x: -4.75, z: -5.25,
  trunkR: 1.45,           // at ground floor; flares into roots wider than this
  crownBaseY: 11.5,       // limbs fork around here, just above the roof
  // Canopy lobes: [x,y,z,radiusXZ,radiusY]. Biased to the back-left so upper floors stay visible
  // from the default camera; two front lobes droop over the street as a frame.
  lobes: [
    [-4.5, 17.5, -5.0, 6.5, 3.9], [-9.5, 16.0, -7.5, 4.8, 3.2], [-1.0, 16.4, -9.0, 5.0, 3.1],
    [-9.8, 15.4, -1.8, 4.6, 3.0], [-4.0, 15.8, 0.2, 4.6, 2.8], [1.2, 15.6, -4.2, 4.2, 2.7],
    [5.2, 14.9, -8.0, 3.5, 2.2], [-11.0, 14.4, 3.2, 3.2, 2.1], [-5.8, 20.2, -4.2, 4.6, 2.4],
    [-0.6, 19.2, -5.2, 3.8, 2.1], [-7.0, 14.2, 4.4, 2.8, 1.8], [3.0, 14.0, -0.8, 2.6, 1.7],
  ],
  // Facade anchor points where aerial roots drape down the outside walls: [x,topY,z]
  aerialRootAnchors: [
    [1.5, 10.6, -9.6], [1.5, 9.8, -8.2], [-1.2, 10.2, 0.5], [-8.4, 10.4, 0.5], [-9.6, 10.6, 0.5],
    [-6.6, 8.1, 0.5], [1.5, 7.8, -6.6],
  ],
};

// Sunbeams (Tyndall shafts). Each runs along SUN_DIR through real openings. bottom→top.
const beam = (x, y, z, up = 8) => ({ bottom: [x, y, z], top: [x + SUN_DIR[0] * up, y + SUN_DIR[1] * up, z + SUN_DIR[2] * up] });
export const SHAFTS = [
  { ...beam(-2.62, 0.3, -0.58), r0: 1.15, r1: 0.95 }, // through 1F slab hole, onto the flooded shop floor
  { ...beam(0.25, 0.3, -3.75), r0: 1.3, r1: 1.0 },    // through the east wall hole
  { ...beam(-0.3, 0.3, -0.6), r0: 0.8, r1: 0.7 },     // through the broken 1F slab corner
  { ...beam(-9.6, 8.3, -2.4), r0: 1.1, r1: 1.0 },     // roof hole → 3F
  { ...beam(-10.9, 2.9, -4.9), r0: 0.95, r1: 0.85 },  // stacked roof+3F+2F holes → 1F
  { ...beam(-1.0, 5.6, -5.2), r0: 0.9, r1: 0.8 },     // past the 3F slab edge, beside the trunk → 2F
];

// Street furniture. pos = base of object on the ground. yaw radians about +y.
export const STREET = {
  lamp: { x: -5.8, z: 1.7, height: 6.6, lean: [0.03, 0.12] },    // leaning, arm overhangs the road
  // outer corner. The arm runs just south of the TLTOP→LAMPTOP wire (which sags to y≈5.2 at x≈5.2, z≈6.1): `head` hangs under its tip, clear of the wire and of its own pole from the default camera.
  trafficLight: { x: 8.0, z: 7.05, height: 6.0, lean: [-0.09, 0.05], armToward: [4.62, 6.74], head: { x: 5.2, y: 4.96, z: 6.6, yaw: 0.27 } },
  utilityPole: { x: 8.6, z: 3.2, height: 8.2 },
  busStop: { x: -5.4, z: 7.45, yaw: 0 },
  vending: { x: 2.1, z: -2.0, yaw: Math.PI / 2 },   // back against the east wall, facing +x
  kiosk: { x: 10.0, z: 8.9, yaw: -Math.PI / 4 },    // swallowed by vines, front-right corner
  billboard: { baseX: -10.8, baseZ: 8.0, tipX: -5.2, tipZ: 4.2 }, // fallen pillar lying across the road, panel near tip
  neonWreck: { x: 2.55, z: -6.6, yaw: Math.PI / 2 },  // dead neon sign leaning on the east wall
  bicycle: { x: 1.2, z: 7.45, yaw: 0.5 },             // rusted, against a fence stub on the outer sidewalk
  tires: { x: 9.7, z: 4.9 },                          // stacked tyres on the right soil band
  barricades: [{ x: 5.5, z: 1.4, yaw: 0.7 }, { x: 4.7, z: -4.0, yaw: -0.4 }, { x: 6.8, z: -1.6, yaw: 2.1 }],
};

export const WRECK = {
  car: { x: 10.25, z: -0.9, yaw: 0.16, sink: 0.72, pitch: 0.09, length: 4.0, width: 1.8 },
  footbridge: {
    z: [-10.1, -8.1], deckY: 4.6, deckT: 0.42,
    x: [12, 5.0],                 // from the right edge toward the road, snapped mid-span at x=5.0
    stubX: [1.5, 3.1],            // short stub still bolted to the building's east wall
    pier: { x: 10.3, z: -9.1 },
    stairs: { x: [9.5, 11.4], z: [-8.1, -3.4] }, // descends to y=0 at z=-3.4
  },
};

// Hanging wires. a/b world points, sag = downward droop at midpoint. Birds perch on these.
const LAMPTOP = [-5.75, 6.5, 1.15], POLETOP = [8.6, 7.9, 3.2], TLTOP = [7.7, 6.0, 7.2];
export const WIRES = [
  { a: POLETOP, b: [1.55, 7.7, -8.2], sag: 0.9, perch: true },
  { a: POLETOP, b: TLTOP, sag: 0.55, perch: false },
  { a: TLTOP, b: LAMPTOP, sag: 1.5, perch: true },
  { a: LAMPTOP, b: [-9.4, 8.1, 0.55], sag: 0.45, perch: false },
  { a: POLETOP, b: [10.7, 0.5, 3.9], sag: 2.2, perch: false, trellis: true }, // snapped, drooping to ground, vines climb it
  { a: [8.6, 7.1, 3.2], b: [1.55, 6.9, -9.3], sag: 1.15, perch: true, trellis: true }, // sagging, vine-laced
];
/** Point on wire w at u∈[0,1] → [x,y,z]. */
export function wirePoint(w, u) {
  const p = [0, 1, 2].map((i) => w.a[i] + (w.b[i] - w.a[i]) * u);
  p[1] -= w.sag * 4 * u * (1 - u);
  return p;
}

// Where flying insects loiter (flower clumps). Ground and interior modules must plant blooms here.
export const FLOWER_SPOTS = [
  [-9.2, 1.2, 10.4], [-6.6, 1.2, 10.9], [4.4, 0.4, 8.6], [-1.45, 0.3, 11.25], [10.4, 2.1, -0.9],
  [9.9, 0.9, 7.2], [0.35, 3.2, -2.15], [-1.3, 3.3, -0.4], [-3.2, 0.6, 8.45],
];

// Points that drip water: eaves and leaf tips. atmosphere module animates them. [x,y,z] start; ends at the surface below.
// `from` is only the intended source: the drop really hangs from what an upward ray finds over `to` in the finished scene.
export const DRIPS = [
  { from: [0.45, 2.5, -2.5], to: [0.45, 0.34, -2.5], onWater: true },
  { from: [-2.0, 2.9, -1.5], to: [-2.0, 0.34, -1.5], onWater: true },  // leaf tip at the rim of the slab hole
  { from: [-4.3, 2.5, -1.2], to: [-4.3, 0.34, -1.2], onWater: true },
  { from: [-3.8, 5.3, -1.4], to: [-3.8, 2.93, -1.4], onWater: false },
  { from: [-1.4, 5.3, -3.6], to: [-1.4, 2.9, -3.6], onWater: false },
];

// Per-module soft footprints & budgets (draw calls exclude the outline/shadow multiplier).
export const BUDGET = {
  base:     { tris: 90_000,  draws: 12 },
  ground:   { tris: 180_000, draws: 25 },
  building: { tris: 140_000, draws: 20 },
  interior: { tris: 160_000, draws: 30 },
  banyan:   { tris: 320_000, draws: 70 },
  street:   { tris: 110_000, draws: 20 },
  wreck:    { tris: 90_000,  draws: 18 },
  water:    { tris: 50_000,  draws: 12 },
  atmos:    { tris: 30_000,  draws: 30 },
};
