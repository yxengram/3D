// Bakes the canopy-light gobo: R=canopy cover, G,B=blob fields combined & thresholded in the shader.
import * as THREE from 'three';
import { CANOPIES, SHAFTS, SUN_DIR } from './layout.js';
import { CANOPY_PLANE_Y, GOBO_SIZE } from './toon.js';

export function bakeGobo() {
  const S = 1024, W = (x) => (x / GOBO_SIZE + 0.5) * S, U = S / GOBO_SIZE;
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
  const field = () => layer((g) => {
    for (let i = 0; i < 1500; i++) {
      const x = R() * S, y = R() * S, big = R() < 0.16;
      blob(g, x, y, (big ? 0.85 + R() * 0.8 : 0.3 + R() * 0.4) * U, 1);
    }
  });
  const a = field(), b = field();
  const d = new Uint8Array(S * S * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = cover[i]; d[i + 1] = a[i]; d[i + 2] = b[i]; d[i + 3] = 255; }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.flipY = false; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
