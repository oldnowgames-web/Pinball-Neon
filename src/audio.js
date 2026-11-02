// audio.js — som do carro sintetizado (sem arquivos): motor por perfil de carro (cilindros, timbre, turbo), pneus, vento, cascalho e batidas.
import { S } from './settings.js';

// firing = pulsos por rotação (cilindros/2); bright = timbre; rasp = aspereza; turbo = assobio + alívio; pops = estouros ao tirar o pé
export const PROFILES = {
  aventador:    { firing: 6, bright: 1.5, rasp: 0.55, rumble: 0.6, turbo: 0, pops: 0.05, waves: ['sawtooth', 'sawtooth', 'square'] },
  camaro:       { firing: 4, bright: 0.8, rasp: 0.5, rumble: 1.5, turbo: 0, pops: 0.04, waves: ['sawtooth', 'square', 'sawtooth'] },
  hatch:        { firing: 3, bright: 1.0, rasp: 0.4, rumble: 0.7, turbo: 1, pops: 0.02, waves: ['sawtooth', 'triangle', 'sawtooth'] },
  sport_orange: { firing: 2, bright: 1.25, rasp: 0.6, rumble: 0.4, turbo: 0, pops: 0.02, waves: ['sawtooth', 'square', 'sawtooth'] },
  sport_white:  { firing: 2, bright: 1.2, rasp: 0.55, rumble: 0.45, turbo: 0, pops: 0.02, waves: ['sawtooth', 'square', 'sawtooth'] },
  sport_atlas:  { firing: 3, bright: 1.1, rasp: 0.5, rumble: 0.6, turbo: 1, pops: 0.03, waves: ['sawtooth', 'sawtooth', 'triangle'] },
};

export class CarAudio {
  constructor() { this.ctx = null; this.muted = false; this.on = false; this.prof = PROFILES.camaro; this.boost = 0; this.lastThr = 0; this.hitT = 0; this.popped = 0; }
  get vol() { return 0.5 * S.volume; }
  setProfile(id) { this.prof = PROFILES[id] || PROFILES.camaro; if (this.on) this._wave(); }
  _wave() { const w = this.prof.waves; this.o.forEach(([o], i) => { o.type = w[i]; }); }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = this.master = C.createGain(); master.gain.value = this.muted ? 0 : this.vol; master.connect(C.destination);
    const mkOsc = (type, g) => { const o = C.createOscillator(); o.type = type; const gn = C.createGain(); gn.gain.value = g; o.connect(gn); o.start(); return [o, gn]; };
    this.filter = C.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 800; this.filter.Q.value = 1.2;
    this.eg = C.createGain(); this.eg.gain.value = 0;
    this.o = [mkOsc('sawtooth', 0.5), mkOsc('square', 0.42), mkOsc('sawtooth', 0.07)];
    this.sub = mkOsc('sine', 0.8);                                            // rumor grave (corpo do motor)
    // timbre "grosso": satura levemente (harmônicos graves e quentes) e corta o agudo depois
    this.shaper = C.createWaveShaper(); { const n = 1024, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(x * 2.6) / Math.tanh(2.6); } this.shaper.curve = cv; this.shaper.oversample = '2x'; }
    this.lp2 = C.createBiquadFilter(); this.lp2.type = 'lowpass'; this.lp2.frequency.value = 2400; this.lp2.Q.value = 0.5;
    this.o.forEach(([, g]) => g.connect(this.filter)); this.sub[1].connect(this.filter); this.filter.connect(this.shaper); this.shaper.connect(this.lp2); this.lp2.connect(this.eg); this.eg.connect(master);
    const buf = this.buf = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = (freq, q, type = 'bandpass') => { const s = C.createBufferSource(); s.buffer = buf; s.loop = true; const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = C.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(); return { f, g }; };
    this.tire = noise(1300, 3); this.wind = noise(500, 0.4, 'lowpass'); this.gravel = noise(2500, 0.8);
    this.rasp = noise(1800, 0.9);                                              // aspereza do motor
    this.turbo = mkOsc('sine', 0); this.turbo[1].gain.value = 0; this.turbo[1].connect(master);   // assobio do turbo
    this._wave(); this.on = true;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.vol; }
  _burst(freq, dur, vol, type = 'lowpass') {
    const C = this.ctx, t = C.currentTime, s = C.createBufferSource(); s.buffer = this.buf; const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = C.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  /** batida (0..1) */
  impact(k) {
    if (!this.on || this.muted) return; const C = this.ctx, t = C.currentTime; if (t < this.hitT) return; this.hitT = t + 0.18;
    this._burst(500 + 1800 * k, 0.35, 0.1 + 0.6 * k);
    const o = C.createOscillator(), og = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.3); og.gain.setValueAtTime(0.15 + 0.7 * k, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.4);
  }
  /** troca de marcha: corte breve do motor (+ estouro nos carros esportivos) */
  shift() {
    if (!this.on || this.muted) return; const t = this.ctx.currentTime; this.eg.gain.cancelScheduledValues(t); this.eg.gain.setTargetAtTime(0.03, t, 0.012);
    if (Math.random() < this.prof.pops * 6) { this._burst(700, 0.09, 0.22); this.popped = 1; }
  }
  /** estouro do escapamento: 1 a 4 estalos seguidos (+ labareda, lida em gameMain por `popped`) */
  _crackle() {
    this.popped = 1; const n = 1 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) setTimeout(() => { if (this.on && !this.muted) this._burst(480 + Math.random() * 520, 0.05 + Math.random() * 0.04, 0.09 + Math.random() * 0.1); }, i * (55 + Math.random() * 45));
  }
  update(s) {
    if (!this.on) return; const C = this.ctx, t = C.currentTime, P = this.prof, thr = s.thr, red = s.redline || 7500, rr = Math.min(1, s.rpm / red);
    const f = (s.rpm / 60) * P.firing;
    this.o[0][0].frequency.setTargetAtTime(f, t, 0.03); this.o[1][0].frequency.setTargetAtTime(f * 0.5, t, 0.03); this.o[2][0].frequency.setTargetAtTime(f * 2.01, t, 0.03);
    this.sub[0].frequency.setTargetAtTime(Math.max(26, f * 0.25), t, 0.05); this.sub[1].gain.setTargetAtTime(0.8 * Math.max(0.6, P.rumble) * (0.55 + 0.45 * thr), t, 0.08);
    this.filter.frequency.setTargetAtTime(260 + s.rpm * 0.36 * P.bright + thr * 650, t, 0.05); this.lp2.frequency.setTargetAtTime(1500 + thr * 1400 + rr * 900, t, 0.08);
    this.eg.gain.setTargetAtTime((0.14 + 0.2 * thr) * (0.6 + 0.4 * Math.min(1, s.rpm / 5000)), t, 0.05);
    this.rasp.g.gain.setTargetAtTime(P.rasp * 0.035 * (0.3 + 0.7 * thr) * (0.4 + rr), t, 0.06); this.rasp.f.frequency.setTargetAtTime(900 + s.rpm * 0.35, t, 0.1);
    // turbo: assobio sobe com a pressão; ao largar o acelerador soa o alívio (blow-off)
    this.boost += (thr * (0.3 + 0.7 * rr) - this.boost) * 0.04;
    if (P.turbo) {
      this.turbo[0].frequency.setTargetAtTime(1800 + this.boost * 3600, t, 0.05); this.turbo[1].gain.setTargetAtTime(this.boost * this.boost * 0.03, t, 0.06);
      if (this.lastThr > 0.7 && thr < 0.25 && this.boost > 0.45) this._burst(3200, 0.45, 0.16, 'highpass');
    } else this.turbo[1].gain.setTargetAtTime(0, t, 0.05);
    // estouros ao tirar o pé em alta rotação
    if (P.pops && thr < 0.05 && rr > 0.55 && Math.random() < P.pops * 0.04) this._crackle();
    this.lastThr = thr;
    this.tire.g.gain.setTargetAtTime(Math.min(0.22, s.squeal * 0.25), t, 0.05); this.tire.f.frequency.setTargetAtTime(1000 + s.squeal * 700, t, 0.1);
    this.wind.g.gain.setTargetAtTime(Math.min(0.3, (s.speed / 80) ** 2 * 0.3), t, 0.1); this.wind.f.frequency.setTargetAtTime(300 + s.speed * 14, t, 0.2);
    this.gravel.g.gain.setTargetAtTime(s.offroad ? Math.min(0.16, s.speed / 120) : 0, t, 0.08); this.gravel.f.frequency.setTargetAtTime(1500 + s.speed * 28, t, 0.15);
  }
}
