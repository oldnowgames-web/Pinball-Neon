// aiaudio.js — motores dos bots com som posicional: cada carro tem uma voz própria que fica à esquerda/direita conforme
// a posição, soa mais baixo e abafado com a distância e muda de tom ao passar por você (efeito Doppler).
import { PROFILES } from './audio.js';

const fwd = { x: 0, y: 0, z: -1 };
export class AiAudio {
  constructor(audio, racers, player) { this.audio = audio; this.racers = racers.filter((r) => r !== player); this.v = new Map(); this.on = false; this.max = 4; }
  _init() {
    const A = this.audio, C = A.ctx; if (!C || !A.master) return false;
    for (const rc of this.racers) {
      const P = PROFILES[rc.specId] || PROFILES.camaro;
      const o1 = C.createOscillator(), o2 = C.createOscillator(); o1.type = P.waves[0]; o2.type = 'square';
      const g1 = C.createGain(), g2 = C.createGain(); g1.gain.value = 0.6; g2.gain.value = 0.22;
      const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.8;
      const vg = C.createGain(); vg.gain.value = 0;
      const pan = C.createPanner(); pan.panningModel = 'equalpower'; pan.distanceModel = 'linear'; pan.rolloffFactor = 0;   // a atenuação é feita à mão (vg)
      o1.connect(g1); o2.connect(g2); g1.connect(lp); g2.connect(lp); lp.connect(vg); vg.connect(pan); pan.connect(A.master);
      o1.start(); o2.start();
      this.v.set(rc, { o1, o2, lp, vg, pan, P, d0: 0 });
    }
    this.on = true; return true;
  }
  update(camera, dt) {
    const A = this.audio; if (!A.ctx || !A.on || dt <= 0) return;
    if (!this.on && !this._init()) return;
    const C = A.ctx, t = C.currentTime, L = C.listener, cp = camera.position;
    const d = this._d || (this._d = cp.clone()); camera.getWorldDirection(d);
    if (L.positionX) { L.positionX.value = cp.x; L.positionY.value = cp.y; L.positionZ.value = cp.z; L.forwardX.value = d.x; L.forwardY.value = d.y; L.forwardZ.value = d.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else if (L.setPosition) { L.setPosition(cp.x, cp.y, cp.z); L.setOrientation(d.x, d.y, d.z, 0, 1, 0); }
    // só as N vozes mais próximas ficam audíveis
    const list = [];
    for (const rc of this.racers) { const v = rc.veh, dist = Math.hypot(v.x - cp.x, (rc.car.object.position.y - cp.y), v.z - cp.z); list.push([rc, dist]); }
    list.sort((a, b) => a[1] - b[1]);
    list.forEach(([rc, dist], i) => {
      const o = this.v.get(rc); if (!o) return; const v = rc.veh, P = o.P;
      const vr = (dist - o.d0) / dt; o.d0 = dist;                                           // velocidade de afastamento (m/s)
      const dop = Math.min(1.22, Math.max(0.82, 343 / (343 + Math.max(-120, Math.min(120, vr)))));
      const f = Math.max(25, (v.rpm / 60) * P.firing) * dop;
      o.o1.frequency.setTargetAtTime(f, t, 0.04); o.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
      const thr = v.thr || 0, near = 1 / (1 + Math.pow(dist / 14, 1.6));
      const g = i < this.max && dist < 170 ? 0.11 * near * (0.5 + 0.5 * thr) : 0;
      o.vg.gain.setTargetAtTime(g, t, 0.06);
      o.lp.frequency.setTargetAtTime((280 + v.rpm * 0.34 * P.bright) / (1 + dist / 70), t, 0.08);
      const p = rc.car.object.position; o.pan.positionX.value = p.x; o.pan.positionY.value = p.y; o.pan.positionZ.value = p.z;
    });
  }
  silence() { if (!this.on) return; const t = this.audio.ctx.currentTime; for (const o of this.v.values()) o.vg.gain.setTargetAtTime(0, t, 0.05); }
  setMuted() { /* o ganho geral (master) já silencia tudo */ }
}
