// vehicle.js — física do carro (sem 3D). Passo fixo de 240 Hz.
//
// Modelo: corpo rígido plano (u = velocidade à frente, v = para a esquerda, r = giro, + = esquerda) com 4 rodas.
// Cada roda tem: carga vertical (peso + transferência longitudinal/lateral + downforce), velocidade angular própria,
// escorregamento longitudinal (κ) e lateral (α) e uma curva de pneu tipo "Magic Formula" com círculo de atrito (força
// combinada). Motor com curva de torque, câmbio de marchas, diferencial (aberto/LSD), freio com ABS e controle de tração opcionais.
import { SPECS } from './carSpecs.js';
import { stepArcade } from './arcade.js';

const G = 9.81, RHO = 1.2, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// curva normalizada do pneu: f(s) com pico 1 em s = 1 e queda suave depois
function makeCurve(C = 1.35, E = -0.5) {
  const raw = (s, B) => { const x = B * s; return Math.sin(C * Math.atan(x - E * (x - Math.atan(x)))); };
  const argmax = (B) => { let bs = 0, bv = -1; for (let s = 0.02; s < 5; s += 0.02) { const v = raw(s, B); if (v > bv) { bv = v; bs = s; } } return bs; };
  let lo = 0.3, hi = 40;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (argmax(m) > 1) lo = m; else hi = m; }
  const B = (lo + hi) / 2, pk = raw(1, B);
  return (s) => raw(s, B) / pk;
}
const CURVE = makeCurve();

const KPEAK = 0.11, APEAK = 0.125;       // escorregamento do pico (razão e ângulo em rad)

/** força do pneu. κ razão de patinagem, α ângulo, Fz carga, μ aderência. Retorna [Fx, Fy] no referencial da roda. */
function tire(kappa, alpha, Fz, mu, ld = 1) {
  const kn = kappa / KPEAK, an = alpha / (APEAK * ld), s = Math.hypot(kn, an);
  if (s < 1e-6) return [0, 0];
  const f = CURVE(s) * mu * Fz / s;
  return [f * kn, -f * an];
}

function torqueShape(x) { return (0.62 + 0.38 * smooth(0.08, 0.45, x)) * (1 - 0.26 * smooth(0.62, 1.0, x)); }

export class Vehicle {
  /** dims: { length, width, wheelbase, track, wheelRadius } em metros (vindo do carModel) */
  constructor(id, dims) {
    const S = this.spec = SPECS[id] || SPECS.sport_white; this.id = id;
    const L = this.L = dims.wheelbase || 2.6, T = this.T = dims.track || 1.55;
    this.R = dims.wheelRadius || 0.33; this.m = S.mass; this.h = S.cg;
    this.a = L * (1 - S.front);        // eixo dianteiro até o centro de gravidade
    this.b = L - this.a;               // centro de gravidade até o eixo traseiro
    this.Iz = S.mass * 0.26 * L * L;
    this.Iw = 1.6;                     // inércia de cada roda + pneu + freio
    this.Ie = 0.25;                    // inércia do motor
    // motor: escala o torque para a potência de pico pedida
    let best = 0; for (let x = 0.2; x <= 1.0; x += 0.01) best = Math.max(best, torqueShape(x) * x * S.redline * TAU / 60);
    this.Tpk = S.power * 1000 / best;
    // rodas: x à frente (+), y à esquerda (+)
    this.w = [
      { x: this.a, y: T / 2, front: true }, { x: this.a, y: -T / 2, front: true },
      { x: -this.b, y: T / 2, front: false }, { x: -this.b, y: -T / 2, front: false },
    ].map((w) => ({ ...w, omega: 0, kappa: 0, alpha: 0, fz: 0, fx: 0, fy: 0, px: 0, pz: 0, surf: null, load: 0 }));
    this.brakeT = S.mass * G * S.brakeG * this.R;       // torque de freio total (N·m nas rodas)
    this.assist = { abs: true, tc: true, stab: 0.6, auto: true };
    this.reset(0, 0, 0, 0);
  }

  reset(x, z, psi, speed = 0) {
    Object.assign(this, { x, z, psi, u: speed, v: 0, r: 0, ax: 0, ay: 0, gear: 1, rpm: this.spec.idle, steerAng: 0, steerIn: 0, thr: 0, brk: 0,
      shiftT: 0, shiftCd: 0, nit: 1, nitOn: false, hb: 0, drift: 0, slipMax: 0, kapMax: 0, rev: false, tcut: 0, absOn: false, tcOn: false, speed: 0, _su: 0, _sd: 0 });
    for (const w of this.w) { w.omega = speed / this.R; w.kappa = w.alpha = w.fx = w.fy = 0; }
  }

  get forward() { return [Math.sin(this.psi), Math.cos(this.psi)]; }
  get left() { return [Math.cos(this.psi), -Math.sin(this.psi)]; }
  maxSteer(u) { return 0.58 / (1 + Math.pow(Math.abs(u) / 24, 2)) + 0.055; }

  engineTorque(rpm, thr) {
    const S = this.spec, x = clamp(rpm / S.redline, 0, 1.2);
    if (rpm >= S.redline) return 0;
    const drive = this.Tpk * torqueShape(x) * thr;
    const eb = -this.Tpk * 0.28 * (rpm / S.redline) * (1 - thr);           // freio-motor
    return drive + eb;
  }
  ratio(g) { return g > 0 ? this.spec.gears[g - 1] * this.spec.final : g < 0 ? 3.2 * this.spec.final * 0.9 : 0; }

  /**
   * in: { steer -1..1, throttle 0..1, brake 0..1, handbrake 0..1, nitro bool, up bool, down bool }
   * env: { surface(x,z) -> {mu, rr}, heightAt(x,z), wet 0..1 }
   */
  step(dt, inp, env) {
    if (this.arcade) { stepArcade(this, dt, inp, env); return; }   // direção fácil (arcade.js)
    const S = this.spec, as = this.assist;
    const u = this.u, v = this.v, r = this.r, sp = Math.hypot(u, v);
    this.speed = u;
    // ---- entradas suavizadas ----
    const ramp = (cur, tgt, up, dn) => cur + clamp(tgt - cur, -dn * dt, up * dt);
    this.thr = ramp(this.thr, inp.throttle, 7, 12);
    this.brk = ramp(this.brk, inp.brake, 9, 14);
    this.hb = ramp(this.hb, inp.handbrake || 0, 12, 12);
    const lock = this.maxSteer(u);
    let tgt = inp.steer * lock;
    // ajuda de estabilidade: contra-esterça um pouco quando a traseira escapa
    if (as.stab > 0 && Math.abs(u) > 6) tgt += clamp(Math.atan2(v - this.r * this.b, Math.abs(u)) * 0.9, -0.2, 0.2) * as.stab * (1 - Math.abs(inp.steer) * 0.5);
    tgt = clamp(tgt, -lock * 1.15, lock * 1.15);
    const rate = (Math.abs(tgt) > Math.abs(this.steerAng) ? 1.9 : 3.2) * (0.35 + lock);
    this.steerAng += clamp(tgt - this.steerAng, -rate * dt, rate * dt);
    const d = this.steerAng, cd = Math.cos(d), sd = Math.sin(d);

    // ---- câmbio ----
    this._gearbox(dt, inp, u);

    // ---- cargas verticais ----
    const q = 0.5 * RHO * u * Math.abs(u), down = q * S.clA, dragK = 0.5 * RHO * S.cdA;
    const Wf = this.m * G * this.b / this.L, Wr = this.m * G * this.a / this.L;
    const dFl = clamp(this.m * this.ax * this.h / this.L, -Wf * 0.7, Wr * 0.7);
    const rsF = 0.55, dyF = clamp(this.m * this.ay * this.h * rsF / this.T, -Wf * 0.45, Wf * 0.45), dyR = clamp(this.m * this.ay * this.h * (1 - rsF) / this.T, -Wr * 0.45, Wr * 0.45);
    const fzF = (Wf - dFl + down * S.aeroFront) / 2, fzR = (Wr + dFl + down * (1 - S.aeroFront)) / 2;
    const fz = [fzF - dyF, fzF + dyF, fzR - dyR, fzR + dyR];

    // ---- superfície e posição de cada roda ----
    const sn = Math.sin(this.psi), cs = Math.cos(this.psi);
    for (let i = 0; i < 4; i++) {
      const w = this.w[i];
      w.px = this.x + sn * w.x + cs * w.y; w.pz = this.z + cs * w.x - sn * w.y;
      w.surf = env.surface(w.px, w.pz, w);
      w.fz = Math.max(120, fz[i]);
    }

    // ---- trem de força ----
    const driven = S.drive === 'AWD' ? [0, 1, 2, 3] : S.drive === 'FWD' ? [0, 1] : [2, 3];
    const G_ = this.ratio(this.gear), reverse = this.gear < 0;
    let avgW = 0; for (const i of driven) avgW += Math.abs(this.w[i].omega); avgW /= driven.length;
    const rpmWheel = avgW * Math.abs(G_) * 60 / TAU;
    const slow = Math.abs(G_) > 0 && rpmWheel < S.idle * 1.8 && Math.abs(u) < 7;
    const launch = S.idle + 0.55 * (S.redline - S.idle) * this.thr * (this.gear === 1 || reverse ? 1 : 0.5);
    this.rpm = this.gear === 0 ? S.idle : Math.max(S.idle, slow ? Math.max(rpmWheel, launch) : rpmWheel);
    const wantThr = reverse && as.auto ? inp.brake : inp.throttle;
    const thrEff = (as.auto && reverse) ? this.thr : this.thr;
    let nitM = 1; this.nitOn = !!(inp.nitro && this.nit > 0.02 && !reverse && this.thr > 0.5);
    if (this.nitOn) { nitM = 1.38; this.nit = Math.max(0, this.nit - dt / (6.5)); } else this.nit = Math.min(1, this.nit + dt * 0.02);
    let Te = this.shiftT > 0 ? 0 : this.engineTorque(this.rpm, (as.auto && reverse) ? clamp(inp.brake, 0, 1) * 1 : this.thr) * nitM;
    if (this.gear === 0) Te = 0;
    const Twheel = Te * Math.abs(G_) * 0.9 * (reverse ? -1 : 1);       // torque total nas rodas motrizes
    const Ieff = this.Iw + (slow ? 0 : this.Ie * G_ * G_ / driven.length);
    // distribuição
    const T = [0, 0, 0, 0];
    if (S.drive === 'AWD') { const fr = S.awdFront; [0, 1].forEach((i) => (T[i] = Twheel * fr / 2)); [2, 3].forEach((i) => (T[i] = Twheel * (1 - fr) / 2)); }
    else driven.forEach((i) => (T[i] = Twheel / 2));
    // diferencial autoblocante leve entre as rodas do mesmo eixo
    for (const [a, b] of [[0, 1], [2, 3]]) if (T[a] !== 0) {
      const dw = this.w[a].omega - this.w[b].omega, tl = clamp(dw * 18, -Math.abs(T[a]) * 0.45, Math.abs(T[a]) * 0.45);
      T[a] -= tl; T[b] += tl;
    }

    // ---- frenagem ----
    const braking = reverse && as.auto ? inp.throttle : inp.brake;
    const bk = this.brk, bf = [0.7, 0.7, 0.3, 0.3];
    const Tb = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) Tb[i] = this.brakeT * bf[i] / 2 * (reverse && as.auto ? clamp(inp.throttle, 0, 1) : bk);
    if (this.hb > 0.01) { Tb[2] += this.brakeT * 0.35 * this.hb; Tb[3] += this.brakeT * 0.35 * this.hb; }

    // ---- forças dos pneus + atualização das rodas ----
    let Fx = 0, Fy = 0, Mz = 0; this.slipMax = 0; this.kapMax = 0; this.absOn = false; this.tcOn = false;
    const R = this.R;
    for (let i = 0; i < 4; i++) {
      const w = this.w[i], front = w.front;
      const vx = u - r * w.y, vy = v + r * w.x;                        // velocidade do ponto da roda (corpo)
      const vxw = front ? vx * cd + vy * sd : vx, vyw = front ? -vx * sd + vy * cd : vy;
      const den = Math.max(Math.abs(vxw), 2.2), denA = Math.max(Math.abs(vxw), 1.6);
      let mu = S.mu * w.surf.mu * (front ? 1 : 1 - 0.38 * this.hb);
      mu *= 1 - 0.07 * (w.fz / (this.m * G / 4) - 1);                    // sensibilidade à carga
      mu = Math.max(0.15, mu);
      const kappa = (w.omega * R - vxw) / den, alpha = Math.atan2(vyw, denA) * Math.sign(vxw || 1);
      const ld = Math.pow(w.fz / (this.m * G / 4), 0.4) * (front ? 1 : 1 / (S.rearGrip || 1.06));
      let [fxw, fyw] = tire(kappa, alpha, w.fz, mu, ld);
      const [fx2] = tire(kappa + 0.01, alpha, w.fz, mu, ld);
      const kw = Math.max(0, (fx2 - fxw) / 0.01 * R / den);               // dFx/dω
      // ABS / controle de tração
      let tb = Tb[i], td = T[i];
      if (as.abs && tb > 0 && kappa < -0.13) { tb *= clamp(1 - (-kappa - 0.13) / 0.07, 0.1, 1); this.absOn = true; }
      if (as.tc && Math.abs(td) > 0 && Math.abs(kappa) > 0.17 && this.hb < 0.1) { td *= clamp(1 - (Math.abs(kappa) - 0.17) / 0.07, 0.03, 1); this.tcOn = true; }
      // roda: I dω/dt = td - tb·sinal(ω) - R·Fx   (semi-implícito)
      const net = td - R * fxw;
      let om = w.omega, dom = dt * net / (Ieff + dt * R * kw);
      // freio opõe a rotação e nunca inverte sozinho
      const tbDom = dt * tb / Ieff;
      if (Math.abs(om + dom) <= tbDom) om = 0; else om = om + dom - Math.sign(om + dom) * tbDom;
      w.omega = om; w.kappa = kappa; w.alpha = alpha; w.fx = fxw; w.fy = fyw;
      // para o corpo (referencial do carro)
      const fxb = front ? fxw * cd - fyw * sd : fxw, fyb = front ? fxw * sd + fyw * cd : fyw;
      Fx += fxb; Fy += fyb; Mz += w.x * fyb - w.y * fxb;
      this.slipMax = Math.max(this.slipMax, Math.abs(alpha)); this.kapMax = Math.max(this.kapMax, Math.abs(kappa));
    }
    // ---- resistências ----
    const vs = Math.max(sp, 0.3);
    const rr = 0.012 + 0.03 * (1 - (this.w[0].surf.mu + this.w[2].surf.mu) / 2) + 0.5 * ((this.w[0].surf.rr + this.w[2].surf.rr) / 2);
    const drag = dragK * sp * (1 - 0.3 * (this.draft || 0)), rolling = rr * this.m * G / vs;
    Fx -= (drag + rolling) * u; Fy -= (drag + rolling) * v;
    // aclive
    const fxP = this.x + sn * (this.L * 0.5), fzP = this.z + cs * (this.L * 0.5), rxP = this.x - sn * (this.L * 0.5), rzP = this.z - cs * (this.L * 0.5);
    const slope = (env.heightAt(fxP, fzP) - env.heightAt(rxP, rzP)) / this.L;
    Fx -= this.m * G * slope / Math.sqrt(1 + slope * slope);
    if (this.nitOn) Fx += this.m * 3.0;

    // ---- integra o corpo ----
    const ax = Fx / this.m, ay = Fy / this.m;
    let nu = u + (ax + v * r) * dt, nv = v + (ay - u * r) * dt, nr = r + (Mz / this.Iz) * dt;
    nr -= nr * 0.15 * dt;
    // anti-rodopio: se a traseira escorrega demais, um torque de guinada recoloca o carro na direção do movimento
    if (Math.abs(nu) > 4 && this.hb < 0.3) {
      const rearSlip = Math.atan2(nv - nr * this.b, Math.abs(nu)), ex = Math.abs(rearSlip) - 0.14;
      if (ex > 0) nr += Math.sign(rearSlip) * Math.min(ex, 0.6) * 9 * dt * Math.min(1, Math.abs(nu) / 12);
      const rMax = 2.2 * Math.max(0.35, Math.min(1, 14 / Math.abs(nu)));      // limite da velocidade de giro
      nr = clamp(nr, -rMax, rMax);
    }
    // quase parado: segura o carro (evita deslizar sozinho e tremer)
    if (Math.abs(nu) < 0.35 && inp.throttle < 0.05 && (inp.brake > 0.05 || this.hb > 0.3 || Math.abs(slope) < 0.04)) { nu *= Math.max(0, 1 - 12 * dt); nv *= Math.max(0, 1 - 12 * dt); nr *= Math.max(0, 1 - 12 * dt); }
    this.u = nu; this.v = nv; this.r = nr;
    const f = 1 - Math.exp(-dt * 18); this.ax += (ax - this.ax) * f; this.ay += (ay - this.ay) * f;
    const wx = this.u * sn + this.v * cs, wz = this.u * cs - this.v * sn;
    this.x += wx * dt; this.z += wz * dt; this.psi += this.r * dt;
    this.drift = clamp((Math.abs(this.v) - 2.5) / 5, 0, 1) * clamp(Math.abs(this.u) / 10, 0, 1);
  }

  _gearbox(dt, inp, u) {
    const S = this.spec, as = this.assist;
    this.shiftT = Math.max(0, this.shiftT - dt); this.shiftCd = Math.max(0, this.shiftCd - dt);
    const nG = S.gears.length;
    const driven = S.drive === 'FWD' ? [0, 1] : S.drive === 'AWD' ? [0, 1, 2, 3] : [2, 3];
    let avgW = 0; for (const i of driven) avgW += Math.abs(this.w[i].omega); avgW /= driven.length;
    const rpmAt = (g) => avgW * Math.abs(this.ratio(g)) * 60 / TAU;
    const set = (g) => { if (g !== this.gear) { this.gear = g; this.shiftT = 0.14; this.shiftCd = 0.35; } };
    if (as.auto) {
      if (this.gear < 0) { if (u > -1 && inp.throttle > 0.1 && inp.brake < 0.1) set(1); }
      else if (this.gear === 0) set(1);
      else {
        if (u < 1.2 && inp.brake > 0.2 && inp.throttle < 0.1 && !(inp.handbrake > 0.5)) set(-1);   // (com freio de mão, como na largada, não engata ré)
        else if (this.shiftCd <= 0) {
          if (this.gear < nG && rpmAt(this.gear) > S.redline * (0.86 + 0.07 * this.thr) && this.thr > 0.15) set(this.gear + 1);
          else if (this.gear > 1 && rpmAt(this.gear - 1) < S.redline * (0.74 - 0.10 * (1 - this.thr)) && rpmAt(this.gear) < S.redline * 0.42) set(this.gear - 1);
          else if (this.gear > 1 && this.thr > 0.9 && rpmAt(this.gear) < S.redline * 0.55 && rpmAt(this.gear - 1) < S.redline * 0.88) set(this.gear - 1);
        }
      }
    } else {
      if (inp.up && !this._su) { if (this.gear < nG) set(this.gear < 0 ? 0 : this.gear + 1); }
      if (inp.down && !this._sd) { if (this.gear > 1) set(this.gear - 1); else if (this.gear === 1 && u < 2) set(-1); else if (this.gear === 0) set(-1); }
      if (this.gear === 0 && inp.throttle > 0.1) set(1);
      if (this.gear === 1 && u < 0.5 && false) set(1);
    }
    this._su = inp.up; this._sd = inp.down;
  }
}
