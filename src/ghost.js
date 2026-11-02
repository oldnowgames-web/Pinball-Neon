// ghost.js — recordes de volta por carro/pista/sentido e "fantasma" (reprodução da melhor volta).
const KEY = 'rec_v1';
export const recKey = (car, track, rev) => `${car}|${track}|${rev ? 1 : 0}`;
const all = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
export const getRec = (k) => all()[k] || null;
export const getRecordTime = (k) => { const r = all()[k]; return r ? r.time : null; };
export function saveRec(k, rec) { const a = all(); a[k] = rec; try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {} }

export class GhostRecorder {
  constructor() { this.s = []; this.acc = 0; }
  reset() { this.s = []; this.acc = 0; }
  sample(t, v, idx, dt) {
    this.acc += dt;
    if (this.s.length === 0 || this.acc >= 0.05) { this.acc = 0; this.s.push([+t.toFixed(2), +v.x.toFixed(1), +v.z.toFixed(1), +v.psi.toFixed(3), idx]); }
  }
}
export class GhostPlayer {
  constructor(rec) { this.rec = rec; this.s = rec.samples; this.out = { x: 0, z: 0, psi: 0 }; }
  /** posição do fantasma no instante t da volta (null se a volta dele já acabou) */
  at(t) {
    const s = this.s; if (!s.length || t < 0 || t > s[s.length - 1][0] + 0.5) return null;
    let lo = 0, hi = s.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m][0] <= t) lo = m; else hi = m - 1; }
    const a = s[lo], b = s[Math.min(lo + 1, s.length - 1)], u = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 0, o = this.out;
    let dp = b[3] - a[3]; dp = Math.atan2(Math.sin(dp), Math.cos(dp));
    o.x = a[1] + (b[1] - a[1]) * u; o.z = a[2] + (b[2] - a[2]) * u; o.psi = a[3] + dp * u; return o;
  }
  /** tempo (s) em que o fantasma passou pelo índice idx da pista */
  timeAtIdx(idx) {
    const s = this.s; let lo = 0, hi = s.length - 1; if (!s.length) return null;
    while (lo < hi) { const m = (lo + hi) >> 1; if (s[m][4] < idx) lo = m + 1; else hi = m; }
    return s[lo][0];
  }
}
