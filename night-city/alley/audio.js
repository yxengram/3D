// Procedural rain ambience: filtered noise for the downpour plus sparse droplet ticks.
export class RainAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.on = false;
  }

  #noiseBuffer(seconds, fill) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) fill(buf.getChannelData(ch), ctx.sampleRate);
    return buf;
  }

  #loop(buffer, nodes) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    let last = src;
    for (const n of nodes) {
      last.connect(n);
      last = n;
    }
    last.connect(this.master);
    src.start();
  }

  #init() {
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // steady downpour: pinkish noise, band-limited
    const hiss = this.#noiseBuffer(6, (d) => {
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      }
    });
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    const g1 = ctx.createGain();
    g1.gain.value = 0.55;
    this.#loop(hiss, [hp, lp, g1]);

    // low rumble of rain on roofs further away
    const rumble = this.#noiseBuffer(5, (d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    });
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.#loop(rumble, [g2]);

    // individual drops hitting puddles and metal
    const drops = this.#noiseBuffer(8, (d, rate) => {
      for (let k = 0; k < 900; k++) {
        const start = Math.floor(Math.random() * d.length);
        const len = Math.floor(rate * (0.004 + Math.random() * 0.02));
        const amp = Math.random() ** 3 * 0.9;
        for (let i = 0; i < len && start + i < d.length; i++) {
          d[start + i] += (Math.random() * 2 - 1) * amp * Math.exp((-i / len) * 5);
        }
      }
    });
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 0.7;
    const g3 = ctx.createGain();
    g3.gain.value = 0.5;
    this.#loop(drops, [bp, g3]);
  }

  toggle() {
    if (!this.ctx) this.#init();
    this.on = !this.on;
    this.ctx.resume();
    const g = this.master.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(this.on ? 0.8 : 0, this.ctx.currentTime, 0.4);
    this.level = this.on ? 1 : 0;
  }

  setIntensity(v) {
    if (!this.ctx || !this.on || Math.abs(v - (this.level ?? -1)) < 0.02) return;
    this.level = v;
    this.master.gain.setTargetAtTime(0.8 * v, this.ctx.currentTime, 0.4);
  }
}
