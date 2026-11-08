// Bakes the canopy-light gobo: R=canopy cover, G,B=blob fields combined & thresholded in the shader.
import * as THREE from 'three';
import { CANOPIES, SHAFTS, SUN_DIR } from './layout.js';
import { CANOPY_PLANE_Y, GOBO_SIZE } from './toon.js';

export function bakeGobo() {
  const S = 2048, W = (x) => (x / GOBO_SIZE + 0.5) * S, U = S / GOBO_SIZE;
  const layer = (paint) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S, S); paint(g);
    return g.getImageData(0, 0, S, S).data;
  };
  let rs = 77; const R = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  const blob = (g, x, y, r, a = 1, s = 'lighter') => {
    g.globalCompositeOperation = s;
    const l = g.createRadialGradient(x, y, 0, x, y, r);
    l.addColorStop(0, `rgba(255,255,255,${a})`); l.addColorStop(0.55, `rgba(255,255,255,${a * 0.75})`); l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
    g.globalCompositeOperation = 'source-over';
  };
  // Canopy presence projected onto the plane (lobes shifted to the plane along the sun).
  const cover = layer((g) => {
    for (const [x, y, z, rxz] of CANOPIES) {
      const t = (CANOPY_PLANE_Y - y) / SUN_DIR[1];
      blob(g, W(x + SUN_DIR[0] * t), W(z + SUN_DIR[2] * t), rxz * 1.28 * U, 0.9);
    }
    for (const s of SHAFTS) { // clearings above each sunbeam so it really is lit
      const t = (CANOPY_PLANE_Y - s.bottom[1]) / SUN_DIR[1];
      const l = g.createRadialGradient(W(s.bottom[0] + SUN_DIR[0] * t), W(s.bottom[2] + SUN_DIR[2] * t), 0, W(s.bottom[0] + SUN_DIR[0] * t), W(s.bottom[2] + SUN_DIR[2] * t), 3.0 * U);
      l.addColorStop(0, 'rgba(0,0,0,1)'); l.addColorStop(0.55, 'rgba(0,0,0,.95)'); l.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = l; g.beginPath(); g.arc(W(s.bottom[0] + SUN_DIR[0] * t), W(s.bottom[2] + SUN_DIR[2] * t), 3 * U, 0, 6.3); g.fill();
    }
  });
  // The central ±32 units keep v2's blobs, from v2's random stream, so the core's dapples stay where they were. The ring gets its own stream at the same density.
  const CORE = S / 4, CORE_N = 1500; // canvas pixels from the centre to the old edge; blobs per field over that square
  let rs2 = 3141; const R2 = () => { rs2 = (rs2 * 1664525 + 1013904223) >>> 0; return rs2 / 4294967296; };
  const spot = (g, x, y, r, big) => blob(g, x, y, (big ? 0.85 + r * 0.8 : 0.3 + r * 0.4) * U, 1);
  const field = () => layer((g) => {
    for (let i = 0; i < CORE_N; i++) { const x = S / 2 - CORE + R() * 2 * CORE, y = S / 2 - CORE + R() * 2 * CORE, big = R() < 0.16; spot(g, x, y, R(), big); }
    for (let i = 0; i < CORE_N * 3; i++) { // same count per area as the core: the outer area is 3× the old square
      let x, y; do { x = R2() * S; y = R2() * S; } while (Math.abs(x - S / 2) < CORE && Math.abs(y - S / 2) < CORE);
      const big = R2() < 0.16; spot(g, x, y, R2(), big);
    }
  });
  const a = field(), b = field();
  const d = new Uint8Array(S * S * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = cover[i]; d[i + 1] = a[i]; d[i + 2] = b[i]; d[i + 3] = 255; }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.flipY = false; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
