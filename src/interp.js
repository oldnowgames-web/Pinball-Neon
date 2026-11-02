// interp.js — suaviza a imagem: a física roda em passos fixos (240 Hz) e o desenho em outro ritmo (60/144 Hz). Sem isto, o carro "pula"
// um passo a mais ou a menos de um quadro para o outro (a 200 km/h, cada passo são ~23 cm) e parece tremer.
// snapPrev() guarda o estado antes de cada passo; blendPose() mistura o estado anterior com o atual para desenhar; restorePose() devolve o estado real.
export function snapPrev(racers) {
  for (const r of racers) { const v = r.veh, p = r.pp || (r.pp = {}); p.x = v.x; p.z = v.z; p.psi = v.psi; p.ok = true; }
}
export function blendPose(racers, a) {
  for (const r of racers) {
    const p = r.pp, v = r.veh; r.real = null;
    if (!p || !p.ok || Math.hypot(v.x - p.x, v.z - p.z) > 3) continue;       // teleporte (reset/reinício): não mistura
    r.real = { x: v.x, z: v.z, psi: v.psi };
    v.x = p.x + (v.x - p.x) * a; v.z = p.z + (v.z - p.z) * a;
    let d = v.psi - p.psi; d = Math.atan2(Math.sin(d), Math.cos(d)); v.psi = p.psi + d * a;
  }
}
export function restorePose(racers) {
  for (const r of racers) if (r.real) { r.veh.x = r.real.x; r.veh.z = r.real.z; r.veh.psi = r.real.psi; r.real = null; }
}
