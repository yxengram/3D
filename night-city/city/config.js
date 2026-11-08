// City layout constants (1 unit = 1 metre) and a seeded random generator,
// so the city looks the same every time it is opened.
export const BLOCKS = 13; // blocks per side (odd, so the centre is a block)
export const BLOCK = 44; // block size
export const ROAD = 14; // road width
export const PITCH = BLOCK + ROAD;
export const HALF = (BLOCKS * PITCH) / 2;
export const LOBBY = 4.5; // ground floor (lobby / shops) height
export const MID = (BLOCKS - 1) / 2;
export const LANES = [1.2, 3.5]; // driving lanes, offset from the road centre line
export const PARKING_LANE = 5.8;

export const blockCenter = (i) => -HALF + ROAD / 2 + BLOCK / 2 + i * PITCH;
export const roadCenter = (i) => -HALF + i * PITCH;
// is coordinate t (along a road) within `pad` metres of a crossing road?
export const inIntersection = (t, pad) => {
  const rel = (((t + HALF) % PITCH) + PITCH) % PITCH;
  return rel < ROAD / 2 + pad || rel > PITCH - ROAD / 2 - pad;
};

let state = 20261108;
export function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rr = (a, b) => a + (b - a) * rand();
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];
export const weighted = (list) => {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[list.length - 1][0];
};
