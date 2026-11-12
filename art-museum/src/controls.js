// Two ways of looking: orbit around the building (exterior) and walking at eye height (plaza, lobby, gallery).
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Controls {
  constructor({ camera, dom, J, B }) {
    this.camera = camera; this.dom = dom; this.J = J; this.B = B; this.mode = 'orbit'; this.touched = false;
    const toXZ = (r) => [r[0], -r[3], r[2], -r[1]];                 // Blender [x0,y0,x1,y1] -> three [x0,z0,x1,z1]
    this.walkRects = J.walk.map(toXZ); this.blocks = J.block.map(toXZ); this.eye = J.eye || 1.62;
    const ex = J.views.exterior; this.target = B(ex.target); const p = B(ex.pos).sub(this.target);
    this.orbit = { az: Math.atan2(p.x, p.z), el: Math.asin(p.y / p.length()), r: p.length() }; this.orbitGoal = { ...this.orbit };
    this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.yawGoal = 0; this.pitchGoal = 0; this.fov = 62; this.fovGoal = 62;
    this.vel = new THREE.Vector3(); this.goal = null; this.stuck = 0; this.keys = new Set(); this.fade = document.getElementById('fade');
    this.pointers = new Map(); this.pinch = 0; this.down = null;
    dom.addEventListener('pointerdown', (e) => this.onDown(e)); dom.addEventListener('pointermove', (e) => this.onMove(e));
    dom.addEventListener('pointerup', (e) => this.onUp(e)); dom.addEventListener('pointercancel', (e) => this.onUp(e, true));
    dom.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY * (e.deltaMode === 1 ? 30 : 1)); this.touched = true; }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => { this.keys.add(e.code); if (/^(Key[WASD]|Arrow)/.test(e.code)) { this.goal = null; this.touched = true; } });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code)); window.addEventListener('blur', () => this.keys.clear());
  }

  // ---- views
  setView(name, instant) {
    const apply = (name) => {
      const v = this.J.views[name]; if (!v) return;
      if (name === 'exterior') { this.mode = 'orbit'; }
      else {
        this.mode = 'walk'; this.pos.copy(this.B(v.pos)); const d = this.B(v.look).sub(this.pos);
        this.yaw = this.yawGoal = Math.atan2(-d.x, -d.z); this.pitch = this.pitchGoal = Math.atan2(d.y, Math.hypot(d.x, d.z)); this.fov = this.fovGoal = 62;
        this.goal = null; this.vel.set(0, 0, 0);
      }
      this.jumped = true;            // tells the main loop to snap exposure instead of adapting slowly
      this.update(0);
    };
    clearTimeout(this.viewTimer);
    if (instant || !this.fade) { this.fade && this.fade.classList.remove('on'); return apply(name); }
    this.pendingView = name; this.fade.classList.add('on');
    this.viewTimer = setTimeout(() => { apply(this.pendingView); this.fade.classList.remove('on'); }, 280);
  }
  freeze(pos, look, fov) { this.mode = 'frozen'; this.camera.position.copy(pos); this.camera.fov = fov || 60; this.camera.updateProjectionMatrix(); this.camera.lookAt(look); }

  // ---- walking surface
  free(x, z) {
    let ok = false; for (const r of this.walkRects) if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) { ok = true; break; }
    if (!ok) return false;
    for (const r of this.blocks) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return false;
    return true;
  }
  tryMove(dx, dz) {
    const p = this.pos;
    if (this.free(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; return true; }
    if (dx && this.free(p.x + dx, p.z)) { p.x += dx; return true; }
    if (dz && this.free(p.x, p.z + dz)) { p.z += dz; return true; }
    return false;
  }

  // ---- input
  onDown(e) {
    this.dom.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) this.down = { x: e.clientX, y: e.clientY, t: performance.now(), far: 0, slop: e.pointerType === 'touch' ? 10 : 5 };
    if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); this.down = null; }
  }
  onMove(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); this.zoom((this.pinch - d) * 2.5); this.pinch = d; return;
    }
    if (this.down) this.down.far = Math.max(this.down.far, Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y));   // displacement, not path length: a shaky finger is still a tap
    if (!this.down || this.down.far <= this.down.slop) return;
    this.touched = true;
    if (this.mode === 'orbit') { this.orbitGoal.az -= dx * 0.0045; this.orbitGoal.el = clamp(this.orbitGoal.el + dy * 0.0035, 0.035, 0.72); }
    else if (this.mode === 'walk') { const k = 0.0032 * this.fov / 62; this.yawGoal += dx * k; this.pitchGoal = clamp(this.pitchGoal + dy * k, -1.15, 1.2); }
  }
  onUp(e, cancel) {
    this.pointers.delete(e.pointerId);
    const d = this.down; this.down = null;
    if (this.pointers.size === 1) { const [q] = [...this.pointers.values()]; this.down = { x: q.x, y: q.y, t: 0, far: Infinity, slop: 0 }; }   // finger left after a pinch can look, not tap
    if (cancel || !d || this.mode !== 'walk' || d.far > d.slop || performance.now() - d.t > 450) return;
    // tap / click: walk to the point on the floor under the pointer
    const r = this.dom.getBoundingClientRect(); const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera); const o = ray.ray.origin, dir = ray.ray.direction;
    if (dir.y > -0.02) return;
    const t = -o.y / dir.y; if (!(t > 0.3) || t > 60) return;
    this.goal = new THREE.Vector3(o.x + dir.x * t, 0, o.z + dir.z * t); this.stuck = 0; this.touched = true;
  }
  zoom(delta) {
    if (this.mode === 'orbit') this.orbitGoal.r = clamp(this.orbitGoal.r * Math.exp(delta * 0.0011), 48, 135);
    else if (this.mode === 'walk') this.fovGoal = clamp(this.fovGoal + delta * 0.035, 26, 74);
  }

  // ---- per frame
  update(dt) {
    const cam = this.camera, k = 1 - Math.exp(-dt * 9);
    if (this.mode === 'orbit') {
      const o = this.orbit, g = this.orbitGoal;
      if (!this.touched) g.az += dt * 0.035;                         // slow turntable until the visitor takes over
      o.az += (g.az - o.az) * (dt ? k : 1); o.el += (g.el - o.el) * (dt ? k : 1); o.r += (g.r - o.r) * (dt ? k : 1);
      const c = Math.cos(o.el); cam.position.set(this.target.x + o.r * c * Math.sin(o.az), this.target.y + o.r * Math.sin(o.el), this.target.z + o.r * c * Math.cos(o.az));
      if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); }
      cam.lookAt(this.target);
    } else if (this.mode === 'walk') {
      const K = this.keys; let f = 0, s = 0;
      if (K.has('KeyW') || K.has('ArrowUp')) f += 1; if (K.has('KeyS') || K.has('ArrowDown')) f -= 1;
      if (K.has('KeyD') || K.has('ArrowRight')) s += 1; if (K.has('KeyA') || K.has('ArrowLeft')) s -= 1;
      const speed = (K.has('ShiftLeft') || K.has('ShiftRight') ? 5.2 : 2.7) * (this.pos.z > 0.6 ? 1.5 : 1);   // a little faster out on the plaza
      const want = new THREE.Vector3();
      if (f || s) {
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw); want.set(-sy * f + cy * s, 0, -cy * f - sy * s).normalize().multiplyScalar(speed);
      } else if (this.goal) {
        const d = new THREE.Vector3(this.goal.x - this.pos.x, 0, this.goal.z - this.pos.z), len = d.length();
        if (len < 0.12) this.goal = null; else want.copy(d).multiplyScalar(Math.min(speed, len * 3 + 0.4) / len);
      }
      this.vel.lerp(want, 1 - Math.exp(-dt * 7));
      if (this.vel.lengthSq() > 1e-5 && dt) {
        const moved = this.tryMove(this.vel.x * dt, this.vel.z * dt);
        if (!moved) { this.vel.multiplyScalar(0.5); if (this.goal && (this.stuck += dt) > 0.35) this.goal = null; }
      }
      this.yaw += (this.yawGoal - this.yaw) * (dt ? 1 - Math.exp(-dt * 16) : 1); this.pitch += (this.pitchGoal - this.pitch) * (dt ? 1 - Math.exp(-dt * 16) : 1);
      this.fov += (this.fovGoal - this.fov) * (dt ? k : 1);
      if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
      cam.position.set(this.pos.x, this.eye, this.pos.z); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
  }
}
