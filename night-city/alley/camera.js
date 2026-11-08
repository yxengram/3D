import * as THREE from 'three';

// Slow handheld-style walk down the alley. Drag to look around, wheel / W S to move,
// A D to step sideways, Space to pause the walk.
export class CameraRig {
  constructor(camera, dom, { zStart, zEnd, halfWidth, onLoop }) {
    this.camera = camera;
    this.zStart = zStart;
    this.zEnd = zEnd;
    this.xLimit = halfWidth - 0.6;
    this.onLoop = onLoop;

    this.z = zStart;
    this.zSmooth = zStart;
    this.x = 0.35;
    this.xSmooth = 0.35;
    this.yaw = 0;
    this.pitch = 0;
    this.yawSmooth = 0;
    this.pitchSmooth = 0;
    this.walking = true;
    this.speed = 0.55;
    this.keys = new Set();
    this.looping = false;

    let dragging = false;
    let last = null;
    dom.addEventListener('pointerdown', (e) => {
      dragging = true;
      last = [e.clientX, e.clientY];
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointerup', () => (dragging = false));
    dom.addEventListener('pointercancel', () => (dragging = false));
    dom.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - last[0];
      const dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      this.yaw -= dx * 0.0035;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0035, -0.9, 1.1);
    });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.z += e.deltaY * 0.004;
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.walking = !this.walking;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  update(dt, t) {
    const k = this.keys;
    const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    // move relative to where the camera is looking (only its horizontal component)
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.z -= (forward * c + strafe * s) * 2.2 * dt;
    this.x += (strafe * c - forward * s) * 2.2 * dt;
    if (this.walking && !this.looping) this.z -= this.speed * dt;

    this.x = THREE.MathUtils.clamp(this.x, -this.xLimit, this.xLimit);
    if (this.z < this.zEnd && this.walking && !this.looping && this.onLoop) {
      this.looping = true;
      this.onLoop(() => {
        this.z = this.zSmooth = this.zStart;
        this.looping = false;
      });
    }
    this.z = THREE.MathUtils.clamp(this.z, this.zEnd - 4, this.zStart + 1);

    const a = 1 - Math.exp(-dt * 4);
    this.zSmooth += (this.z - this.zSmooth) * a;
    this.xSmooth += (this.x - this.xSmooth) * a;
    this.yawSmooth += (this.yaw - this.yawSmooth) * (1 - Math.exp(-dt * 8));
    this.pitchSmooth += (this.pitch - this.pitchSmooth) * (1 - Math.exp(-dt * 8));

    // gentle handheld sway and footstep bob
    const swayX = Math.sin(t * 0.37) * 0.05 + Math.sin(t * 0.91) * 0.015;
    const bob = this.walking ? Math.sin(t * 3.6) * 0.012 : 0;
    const y = 1.25 + Math.sin(t * 0.53) * 0.03 + bob;
    this.camera.position.set(this.xSmooth + swayX, y, this.zSmooth);
    const roll = Math.sin(t * 0.41) * 0.008;
    const breathe = Math.sin(t * 0.7) * 0.006;
    this.camera.rotation.set(0.06 + this.pitchSmooth + breathe, this.yawSmooth + Math.sin(t * 0.23) * 0.02, roll, 'YXZ');
  }
}
