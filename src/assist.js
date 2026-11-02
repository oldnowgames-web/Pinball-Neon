// assist.js — "ajuda nas curvas": se o jogador solta o acelerador (sem apertar o freio) e o carro está rápido demais para a curva
// que vem pela frente, o freio entra sozinho e de forma suave, só o suficiente para chegar na curva numa velocidade segura.
// Assim basta tirar o pé do acelerador. Se o jogador acelera ou freia, a ajuda não interfere. Funciona sem 3D (testável no Node).
import { yawMax } from './arcade.js';
const G = 9.81, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const cornerAssist = { brake: 0, target: 0 };

/** velocidade segura (m/s) para as curvas dos próximos `look` metros, considerando que dá para frear até lá.
 *  Modo realista: limite pela aderência do pneu. Modo arcade: limite pelo giro máximo do volante. */
export function safeSpeed(track, idx, spec, wet = 0, look = 300, veh = null) {
  const s0 = idx * track.ds, arcade = !!(veh && veh.arcade);
  const mu = spec.mu * (1 - 0.28 * wet) * 0.8, aB = arcade ? 16 : spec.brakeG * (1 - 0.25 * wet) * G * 0.6;
  let target = 1e9;
  for (let d = 0; d <= look; d += 8) {
    const k = Math.max(Math.abs(track.at(s0 + d).k), 1e-4); let vc;
    if (arcade) { vc = 40; for (let i = 0; i < 6; i++) vc = clamp(0.9 * yawMax(vc) / k, 8, 120); }   // u tal que u·k = 90% do giro máximo em u
    else vc = Math.sqrt(mu * G / k);
    target = Math.min(target, Math.sqrt(vc * vc + 2 * aB * d));
  }
  return Math.max(target, 13);
}

/** devolve os comandos do jogador, com o freio automático quando preciso. veh: Vehicle; ctx: { track, idx, wet } */
export function applyCornerAssist(inp, veh, ctx, enabled = true) {
  const st = cornerAssist;
  const active = enabled && inp.throttle < 0.05 && inp.brake < 0.05 && veh.u > 9 && veh.gear > 0;
  let want = 0;
  if (active) {
    st.target = safeSpeed(ctx.track, ctx.idx, veh.spec, ctx.wet, 300, veh);
    const over = veh.u - st.target; if (over > 0) want = clamp(over * 0.16, 0, 0.55);
  }
  st.brake += (want - st.brake) * (want > st.brake ? 0.2 : 0.12);          // entra e sai suave
  return st.brake > 0.01 ? { ...inp, brake: st.brake } : inp;
}
