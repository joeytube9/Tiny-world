// Optional procedural audio (Web Audio). Only starts after a user gesture.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.nodes = {};
  }

  unlock() {
    if (this.ctx || !this.enabled) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const ctx = this.ctx;
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 3; }
      const mk = (type, freq, q) => {
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start();
        return { src, f, g };
      };
      this.master = ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(ctx.destination);
      this.nodes.wind = mk('lowpass', 500, 0.5);
      this.nodes.rain = mk('highpass', 2500, 0.3);
      this.nodes.pour = mk('bandpass', 900, 0.8);
      this.nodes.rumble = mk('lowpass', 120, 0.7);
    } catch (e) {
      this.ctx = null;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.unlock();
    if (this.ctx) {
      if (on && this.ctx.state === 'suspended') this.ctx.resume();
      this.master.gain.value = on ? 0.5 : 0;
    }
  }

  // levels 0..1
  update(levels) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    for (const k of ['wind', 'rain', 'pour', 'rumble']) {
      const n = this.nodes[k];
      if (n) n.g.gain.setTargetAtTime(Math.min(0.8, (levels[k] || 0) * (k === 'rumble' ? 1.2 : 0.6)), t, 0.25);
    }
  }

  thunder() {
    if (!this.ctx || !this.enabled) return;
    const n = this.nodes.rumble;
    const t = this.ctx.currentTime;
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setValueAtTime(1.0, t);
    n.g.gain.exponentialRampToValueAtTime(0.01, t + 2.2);
  }
}
