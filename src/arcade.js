// arcade.js — "direção fácil", no jeito do Old Racers: o volante comanda o giro direto, o carro "gruda" na direção que aponta
// (a velocidade lateral some rápido), soltar o acelerador já desacelera e não existe perda de controle por excesso de velocidade.
// Só a mecânica do corpo muda: câmbio, rpm, nitro, rodas, superfícies e colisões continuam iguais, então HUD, som e câmera funcionam igual.
const TAU = Math.PI * 2, G = 9.81;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// top = velocidade máxima (m/s) · acc = aceleração (m/s²) · grip = quão rápido o carro "gruda" na direção do giro (1/s)
const ARC = {
  aventador:    { top: 76, acc: 25, grip: 5.2 },
  camaro:       { top: 68, acc: 20, grip: 4.4 },
  hatch:        { top: 60, acc: 21, grip: 6.4 },
  sport_orange: { top: 68, acc: 23, grip: 5.8 },
  sport_white:  { top: 70, acc: 24, grip: 5.6 },
  sport_atlas:  { top: 72, acc: 24, grip: 5.4 },
};
export function arcSpec(v) { return ARC[v.id] || { top: 52 + v.spec.power * 0.045, acc: 14 + v.spec.power * 0.03, grip: 5 }; }
/** taxa máxima de giro (rad/s) com o volante todo para o lado, na velocidade u */
export const YAW0 = 1.45, YAWK = 50, STEER_CURVE = 1.35;   // giro máximo (rad/s), queda com a velocidade e curva do volante (pequenos toques dão giro menor)
export const yawMax = (u, hb = 0) => YAW0 * clamp(Math.abs(u) / 7, 0, 1) / (1 + Math.abs(u) / YAWK) * (hb > 0.3 ? 1.5 : 1);
/** volante "sentido": toques leves giram menos, o fundo gira o máximo */
export const shapeSteer = (s) => Math.sign(s) * Math.pow(Math.abs(s), STEER_CURVE);

export function stepArcade(v, dt, inp, env) {
  const S = v.spec, as = v.assist, A = arcSpec(v), nG = S.gears.length, wet = (env.wet != null ? env.wet : 0);
  const ramp = (c, t, up, dn) => c + clamp(t - c, -dn * dt, up * dt);
  v.thr = ramp(v.thr, inp.throttle, 7, 12); v.brk = ramp(v.brk, inp.brake, 9, 14); v.hb = ramp(v.hb, inp.handbrake || 0, 12, 12);
  let u = v.u, vl = v.v; v.speed = u;

  // ---- direção: o volante comanda o giro (rad/s) ----
  const sIn = shapeSteer(inp.steer), lock = v.maxSteer(u), tgt = sIn * lock, rate = (Math.abs(tgt) > Math.abs(v.steerAng) ? 1.9 : 3.2) * (0.35 + lock);
  v.steerAng += clamp(tgt - v.steerAng, -rate * dt, rate * dt);                        // só para o desenho das rodas
  const rWant = sIn * Math.sign(u) * yawMax(u, v.hb);                           // (em ré o volante inverte, como no carro de verdade)
  v.r += (rWant - v.r) * Math.min(1, dt * 11);
  const dpsi = v.r * dt, c = Math.cos(dpsi), s = Math.sin(dpsi);
  { const u2 = u * c + vl * s, v2 = -u * s + vl * c; u = u2; vl = v2; }                // a velocidade (mundo) fica; o corpo gira

  // ---- câmbio (por faixas de velocidade, como no Old Racers) ----
  v.shiftT = Math.max(0, v.shiftT - dt); v.shiftCd = Math.max(0, v.shiftCd - dt);
  const gmx = (g) => A.top * Math.pow(g / nG, 0.78);
  const set = (g) => { if (g !== v.gear) { v.gear = g; v.shiftT = 0.12; v.shiftCd = 0.35; } };
  if (as.auto) {
    if (v.gear < 0) { if (u > -1 && inp.throttle > 0.1 && inp.brake < 0.1) set(1); }
    else if (v.gear === 0) set(1);
    else if (u < 1.2 && inp.brake > 0.2 && inp.throttle < 0.1 && !(inp.handbrake > 0.5)) set(-1);
    else if (v.shiftCd <= 0) { if (v.gear < nG && u > gmx(v.gear) * 0.94) set(v.gear + 1); else if (v.gear > 1 && u < gmx(v.gear - 1) * 0.72) set(v.gear - 1); }
  } else {
    if (inp.up && !v._su) { if (v.gear < nG) set(v.gear < 0 ? 0 : v.gear + 1); }
    if (inp.down && !v._sd) { if (v.gear > 1) set(v.gear - 1); else if (v.gear === 1 && u < 2) set(-1); else if (v.gear === 0) set(-1); }
    if (v.gear === 0 && inp.throttle > 0.1) set(1);
  }
  v._su = inp.up; v._sd = inp.down;
  const rev = v.gear < 0; v.rev = rev;

  // ---- aceleração / freio / arrasto ----
  const holding = (inp.handbrake || 0) > 0.5 && Math.abs(u) < 4;                    // freio de mão + parado (largada): não sai do lugar
  const dv = holding ? 0 : rev && as.auto ? inp.brake : inp.throttle;
  v.nitOn = !!(inp.nitro && v.nit > 0.02 && !rev && v.thr > 0.5);
  if (v.nitOn) v.nit = Math.max(0, v.nit - dt / 6.5); else v.nit = Math.min(1, v.nit + dt * 0.02);
  const nitM = v.nitOn ? 1 : 0, gm = rev ? 14 : gmx(Math.max(1, v.gear)) * (nitM ? 1.35 : 1) * (1 + 0.045 * (v.draft || 0));
  let a = 0;
  if (dv > 0 && v.gear !== 0) {
    if (rev) a = -A.acc * 0.6 * dv * clamp(1 - Math.pow(Math.max(-u, 0) / 14, 3), 0, 1);
    else { const f = Math.max(0, 1 - Math.pow(Math.max(u, 0) / gm, 3)); a = A.acc * Math.max(0.55, 1 - 0.07 * (v.gear - 1)) * (nitM ? 2.1 : 1) * f * dv; if (u > gm) a = -4; }
  }
  if (v.shiftT > 0) a *= 0.35;
  { const bkS = rev && as.auto ? v.thr : v.brk; if (bkS > 0.01 && Math.abs(u) > 0.3) a -= Math.sign(u) * 36 * bkS; }   // freio forte, como no Old Racers
  if (v.hb > 0.02 && Math.abs(u) > 0.3) a -= Math.sign(u) * 7 * v.hb;
  a -= u * 0.04 + u * Math.abs(u) * 0.0006;                                            // arrasto: soltar o acelerador já desacelera
  // piso: cascalho/grama seguram o carro
  let off = 0, muAvg = 0; for (const w of v.w) { off += w.surf ? (w.surf.type === 1 ? 0.14 : w.surf.type === 2 ? 0.28 : 0) : 0; muAvg += w.surf ? w.surf.mu : 1; } muAvg /= 4;
  a -= u * off;
  // ladeira
  const sn = Math.sin(v.psi), cs = Math.cos(v.psi);
  const slope = (env.heightAt(v.x + sn * v.L * 0.5, v.z + cs * v.L * 0.5) - env.heightAt(v.x - sn * v.L * 0.5, v.z - cs * v.L * 0.5)) / v.L;
  a -= G * slope * 0.55;
  u += a * dt;
  // ---- aderência lateral: a velocidade lateral some rápido (o carro segue a direção que aponta) ----
  const grip = A.grip * (1 - 0.3 * wet) * (0.55 + 0.45 * clamp(muAvg, 0, 1)) * (v.hb > 0.3 ? 0.25 : 1);
  vl *= Math.exp(-grip * dt);
  if (holding) { const k = Math.exp(-10 * dt); u *= k; vl *= k; v.r *= k; }
  if (Math.abs(u) < 0.35 && inp.throttle < 0.05) { const k = Math.max(0, 1 - 12 * dt); u *= k; vl *= k; v.r *= k; }

  // ---- rodas (posição, piso e giro para o visual, fumaça e marcas) ----
  let slipMax = 0, kapMax = 0;
  for (let i = 0; i < 4; i++) {
    const w = v.w[i];
    w.px = v.x + sn * w.x + cs * w.y; w.pz = v.z + cs * w.x - sn * w.y; w.surf = env.surface(w.px, w.pz, w); w.fz = v.m * G / 4;
    w.omega = u / v.R * (!w.front && v.hb > 0.5 ? 0.15 : 1);
    w.alpha = Math.atan2(vl + v.r * w.x, Math.max(Math.abs(u), 2)) - (w.front ? v.steerAng : 0);
    w.kappa = !w.front && v.hb > 0.3 ? -0.45 * v.hb : (v.brk > 0.9 && Math.abs(u) > 12 ? -0.1 : 0);
    w.fx = 0; w.fy = 0; slipMax = Math.max(slipMax, Math.abs(w.alpha)); kapMax = Math.max(kapMax, Math.abs(w.kappa));
  }
  v.slipMax = slipMax; v.kapMax = kapMax; v.absOn = false; v.tcOn = false;

  // ---- rpm (da velocidade dentro da marcha) ----
  const frac = clamp(Math.abs(u) / gm, 0, 1.05), launch = (v.gear === 1 || rev) && frac < 0.3 ? v.thr * 0.5 : 0;
  v.rpm = v.gear === 0 ? S.idle : S.idle + (S.redline - S.idle) * Math.max(frac, launch);

  // ---- integra ----
  v.u = u; v.v = vl;
  const f = 1 - Math.exp(-dt * 18); v.ax += (a - v.ax) * f; v.ay += (u * v.r - v.ay) * f;
  const wx = u * sn + vl * cs, wz = u * cs - vl * sn;
  v.x += wx * dt; v.z += wz * dt; v.psi += v.r * dt;
  v.drift = clamp((Math.abs(vl) - 2.5) / 5, 0, 1) * clamp(Math.abs(u) / 10, 0, 1);
}
