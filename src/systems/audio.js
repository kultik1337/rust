// Procedural audio — every sound is synthesised with the Web Audio API at run
// time (oscillators + filtered noise). No audio files are used. The context is
// created lazily on the first user gesture (the Play click).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this._stepAcc = 0;
    this._crackleAcc = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._noise = this._makeNoise(2);
    this._startWind();
  }

  _makeNoise(sec) {
    const n = this.ctx.sampleRate * sec;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _startWind() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise; src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = this.ctx.createGain(); g.gain.value = 0.02;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    this._windGain = g; this._windLp = lp;
    // Slow gusts via an LFO on the filter.
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 200;
    lfo.connect(lfoG).connect(lp.frequency); lfo.start();
  }

  // --- primitive voices ---
  _tone(freq, type, dur, gain = 0.2, freqEnd = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  _noiseBurst(dur, type, freq, gain = 0.2, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // --- named sfx ---
  footstep() { const p = 0.9 + Math.random() * 0.3; this._noiseBurst(0.09, 'lowpass', 360 * p, 0.10); }
  chop() { this._tone(120, 'triangle', 0.16, 0.28, 70); this._noiseBurst(0.09, 'bandpass', 900, 0.16, 1.2); }
  mine() { this._tone(1250, 'square', 0.05, 0.12, 900); this._noiseBurst(0.08, 'highpass', 1400, 0.14); }
  gather() { this._noiseBurst(0.2, 'lowpass', 1200, 0.10, 0.7); }
  pickup() { this._tone(680, 'sine', 0.08, 0.2); setTimeout(() => this._tone(1020, 'sine', 0.09, 0.18), 70); }
  craft() { this._tone(440, 'triangle', 0.1, 0.18, 660); setTimeout(() => this._tone(880, 'triangle', 0.12, 0.16), 90); }
  place() { this._tone(90, 'sine', 0.18, 0.3, 60); this._noiseBurst(0.1, 'lowpass', 300, 0.12); }
  bow() { this._tone(420, 'triangle', 0.16, 0.22, 130); this._noiseBurst(0.05, 'highpass', 2000, 0.08); }
  hurt() { this._tone(170, 'square', 0.18, 0.28, 90); this._noiseBurst(0.12, 'bandpass', 500, 0.2); }
  hitFlesh() { this._tone(200, 'sine', 0.1, 0.2, 120); this._noiseBurst(0.08, 'lowpass', 700, 0.12); }
  splash() { this._noiseBurst(0.35, 'lowpass', 900, 0.18, 0.6); }

  // Called each frame with movement + environment to drive footsteps + fire.
  update(dt, { moving, grounded, speed, nearFire, dayFactor }) {
    if (!this.ctx) return;
    if (this._windGain) this._windGain.gain.setTargetAtTime(0.02 + (1 - (dayFactor ?? 1)) * 0.03, this.ctx.currentTime, 1.5);
    if (moving && grounded) {
      this._stepAcc += dt * (speed > 6 ? 2.6 : 1.7);
      if (this._stepAcc >= 1) { this._stepAcc = 0; this.footstep(); }
    }
    if (nearFire > 0) {
      this._crackleAcc -= dt;
      if (this._crackleAcc <= 0) { this._crackleAcc = 0.15 + Math.random() * 0.35; this._noiseBurst(0.05, 'bandpass', 1600 + Math.random() * 800, 0.05 * Math.min(1, nearFire / 6)); }
    }
  }
}
