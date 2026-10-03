// All sound is synthesised with the Web Audio API - no external files.
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const dbToGain = db => Math.pow(10, db / 20);
// Loudness calibration shared with cyber-kit v0.3.0 (music ≈ -20 LUFS, median SFX ≈ music level).
// Same chain as the kit: buses -> glue compressor -> limiter -> soft clip -> out (mute) -> speakers.
const MUSIC_TRIM_DB = 3.9, SFX_TRIM_DB = 3.5;
const MUSIC_GAIN = 0.42 * dbToGain(MUSIC_TRIM_DB), SFX_GAIN = 0.9 * dbToGain(SFX_TRIM_DB);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('cyberSnake.muted') === '1';
    this.musicPlaying = false;
    this.level = 1;
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 2.5; comp.attack.value = 0.006; comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    const clip = ctx.createWaveShaper(); const cc = new Float32Array(2049);
    for (let i = 0; i < cc.length; i++) { const x = i / 1024 - 1, ax = Math.abs(x); cc[i] = ax < 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((ax - 0.8) / 0.2)); }
    clip.curve = cc; clip.oversample = '2x';
    this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : 1;
    this.master.connect(comp); comp.connect(lim); lim.connect(clip); clip.connect(this.out); this.out.connect(ctx.destination);

    this.sfx = ctx.createGain(); this.sfx.gain.value = SFX_GAIN; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000;
    this.musicFilter.connect(this.music);

    // tempo-synced echo send
    this.delay = ctx.createDelay(1.0); this.delay.delayTime.value = 0.21;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay);
    this.delayOut = ctx.createGain(); this.delayOut.gain.value = 0.5;
    dlp.connect(this.delayOut); this.delayOut.connect(this.master);
    this.delaySend = ctx.createGain(); this.delaySend.gain.value = 1; this.delaySend.connect(this.delay);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // distortion curve
    this.distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; this.distCurve[i] = Math.tanh(x * 4); }
  }

  get ready() { return !!this.ctx; }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('cyberSnake.muted', m ? '1' : '0');
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // ---------- primitives ----------
  osc({ type = 'sine', f = 440, f2 = null, t = 0, dur = 0.1, vol = 0.2, a = 0.005, out = null, send = 0, detune = 0, q = null, lp = null }) {
    const ctx = this.ctx; const now = ctx.currentTime + t;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, now); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    let node = o;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; if (q) fl.Q.value = q; o.connect(fl); node = fl; }
    node.connect(g); g.connect(out || this.sfx);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(this.delaySend); }
    o.start(now); o.stop(now + dur + 0.05);
    return o;
  }

  noiseHit({ t = 0, dur = 0.1, vol = 0.2, type = 'highpass', f = 6000, f2 = null, q = 0.7, out = null, a = 0.002 }) {
    const ctx = this.ctx; const now = ctx.currentTime + t;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, now); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + a); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(fl); fl.connect(g); g.connect(out || this.sfx);
    s.start(now, Math.random() * 1.5); s.stop(now + dur + 0.05);
  }

  // ---------- sound effects ----------
  eat(combo = 1) {
    if (!this.ctx) return;
    const up = Math.min(combo - 1, 6) * 2; // pitch climbs with combo
    const base = 72 + up;
    this.osc({ type: 'square', f: mtof(base), t: 0, dur: 0.07, vol: 0.12, lp: 4000, send: 0.25 });
    this.osc({ type: 'square', f: mtof(base + 7), t: 0.055, dur: 0.09, vol: 0.12, lp: 4500, send: 0.25 });
    this.osc({ type: 'sine', f: mtof(base + 19), t: 0.05, dur: 0.22, vol: 0.12, send: 0.4 });
    this.osc({ type: 'triangle', f: 180, f2: 600, t: 0, dur: 0.08, vol: 0.18 });
  }

  turn() {
    if (!this.ctx) return;
    this.osc({ type: 'triangle', f: 2100, f2: 1500, dur: 0.03, vol: 0.035 });
    this.noiseHit({ dur: 0.025, vol: 0.03, f: 7000 });
  }

  click() {
    if (!this.ctx) return;
    this.osc({ type: 'square', f: 1200, f2: 1800, dur: 0.05, vol: 0.06, lp: 5000 });
  }

  spawn() {
    if (!this.ctx) return;
    this.osc({ type: 'sine', f: 1400, f2: 2400, dur: 0.12, vol: 0.04, send: 0.5 });
  }

  levelUp() {
    if (!this.ctx) return;
    const root = 57 + ((this.level - 1) % 4) * 2;
    const notes = [0, 4, 7, 12, 16, 19, 24, 28];
    notes.forEach((n, i) => {
      this.osc({ type: 'sawtooth', f: mtof(root + n), t: i * 0.065, dur: 0.28, vol: 0.09, lp: 2400 + i * 500, q: 6, send: 0.45 });
      this.osc({ type: 'square', f: mtof(root + n + 12), t: i * 0.065, dur: 0.12, vol: 0.04, lp: 6000, send: 0.3 });
    });
    // big chord swell
    [0, 7, 12, 16].forEach(n => this.osc({ type: 'sawtooth', f: mtof(root + n), t: 0.52, dur: 1.2, vol: 0.06, a: 0.05, lp: 3000, detune: (Math.random() - .5) * 14, send: 0.35 }));
    this.noiseHit({ t: 0, dur: 0.7, vol: 0.08, type: 'bandpass', f: 500, f2: 9000, q: 1.5, a: 0.4 });
    this.osc({ type: 'sine', f: 55, f2: 40, t: 0.52, dur: 0.6, vol: 0.4 });
  }

  death() {
    if (!this.ctx) return;
    const ctx = this.ctx; const now = ctx.currentTime;
    // distorted low drop
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, now); o.frequency.exponentialRampToValueAtTime(28, now + 0.9);
    const ws = ctx.createWaveShaper(); ws.curve = this.distCurve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2000, now); lp.frequency.exponentialRampToValueAtTime(80, now + 1.0);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.35, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    o.connect(ws); ws.connect(lp); lp.connect(g); g.connect(this.sfx);
    o.start(now); o.stop(now + 1.2);
    // crash noise
    this.noiseHit({ dur: 1.1, vol: 0.45, type: 'lowpass', f: 6000, f2: 120, q: 1, a: 0.003 });
    this.osc({ type: 'sine', f: 120, f2: 30, dur: 0.5, vol: 0.6 });
    // digital glitch chirps
    for (let i = 0; i < 7; i++) {
      this.osc({ type: 'square', f: 200 + Math.random() * 1800, t: 0.05 + i * 0.045, dur: 0.035, vol: 0.06, send: 0.2 });
    }
    this.duckMusic();
  }

  duckMusic() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.cancelScheduledValues(t);
    this.musicFilter.frequency.setTargetAtTime(300, t, 0.15);
  }

  // ---------- procedural synthwave loop ----------
  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(MUSIC_GAIN, t, 0.4);
    this.musicFilter.frequency.cancelScheduledValues(t);
    this.musicFilter.frequency.setTargetAtTime(18000, t, 0.2);
    this.step = 0;
    this.nextTime = t + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic(fade = 0.5) {
    if (!this.ctx || !this.musicPlaying) return;
    this.musicPlaying = false;
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0, t, fade / 3);
  }

  setLevel(l) { this.level = l; }

  schedule() {
    const ctx = this.ctx;
    const bpm = Math.min(100 + (this.level - 1) * 4, 132);
    const s16 = 60 / bpm / 4;
    this.delay.delayTime.setTargetAtTime(s16 * 3, ctx.currentTime, 0.1);
    while (this.nextTime < ctx.currentTime + 0.14) {
      this.playStep(this.step, this.nextTime, s16);
      this.nextTime += s16;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, time, s16) {
    const ctx = this.ctx; const out = this.musicFilter;
    const t = time - ctx.currentTime;
    if (t < -0.01) return;
    const bar = Math.floor(step / 16) % 4, s = step % 16;
    // Am - F - C - G
    const roots = [45, 41, 48, 43];
    const chords = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const root = roots[bar], chord = chords[bar];
    const lvl = this.level;

    // kick
    if (s % 4 === 0) {
      this.osc({ type: 'sine', f: 150, f2: 42, t, dur: 0.28, vol: 0.55, out });
      this.osc({ type: 'triangle', f: 900, f2: 120, t, dur: 0.02, vol: 0.12, out });
    }
    // snare / clap
    if (s === 4 || s === 12) {
      this.noiseHit({ t, dur: 0.18, vol: 0.2, type: 'bandpass', f: 1900, q: 0.9, out });
      this.osc({ type: 'triangle', f: 230, f2: 160, t, dur: 0.09, vol: 0.12, out });
    }
    // hats
    if (s % 2 === 0) this.noiseHit({ t, dur: s % 4 === 2 ? 0.07 : 0.025, vol: s % 4 === 2 ? 0.07 : 0.03, f: 8500, out });
    else if (lvl >= 3) this.noiseHit({ t, dur: 0.02, vol: 0.02, f: 9500, out });

    // bass: driving 8ths with octave jumps
    if (s % 2 === 0) {
      const oct = (s % 8 === 6) ? 12 : 0;
      this.osc({ type: 'sawtooth', f: mtof(root - 12 + oct), t, dur: s16 * 1.8, vol: 0.16, lp: 520 + (s % 4 === 0 ? 300 : 0), q: 5, a: 0.004, out });
    }
    // pad: new chord each bar
    if (s === 0) {
      chord.forEach(iv => {
        for (const det of [-9, 9]) this.osc({ type: 'sawtooth', f: mtof(root + 12 + iv), t, dur: s16 * 16, vol: 0.022, a: 0.35, lp: 1100, detune: det, out });
      });
    }
    // arpeggio (from level 2 on, or always quietly)
    const arpPattern = [0, 1, 2, 1, 0, 2, 1, 2];
    const iv = chord[arpPattern[s % 8]] + (s >= 8 ? 12 : 0);
    const arpVol = lvl >= 2 ? 0.045 : 0.025;
    this.osc({ type: 'square', f: mtof(root + 24 + iv), t, dur: s16 * 0.9, vol: arpVol, lp: 2200 + Math.sin(step / 10) * 900, q: 4, out, send: 0.25 });
  }
}
