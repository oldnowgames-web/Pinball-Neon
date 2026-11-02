// hud.js — painel do jogo: velocidade, marcha, RPM, posição, voltas, tempos, minimapa, contagem, avisos e resultado.
import { S, t } from './settings.js';
const $ = (id) => document.getElementById(id);
export const fmt = (t) => { if (t == null || !isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(2).padStart(5, '0'); };

export class Hud {
  constructor(track, laps) {
    this.track = track; this.laps = laps; this.toastT = 0;
    this.el = { kmh: $('kmh'), gear: $('gear'), rpm: $('rpmFill'), pos: $('pos'), lap: $('lap'), time: $('ltime'), best: $('lbest'), cd: $('cd'), toast: $('toast'), nit: $('nitFill'), board: $('board'), flags: $('flags'), shift: $('shiftLight'), turn: $('turn'), dmg: $('dmg'), dmgFill: $('dmgFill'), delta: $('delta'), rec: $('lrec'), unit: document.querySelector('#gauge .unit') };
    this.mm = $('mm'); this.mx = this.mm.getContext('2d');
    // minimapa: camada fixa do traçado
    const S = track.S; let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const p of S) { a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.z); d = Math.max(d, p.z); }
    this.bb = { a, b, c, d }; const W = this.mm.width, H = this.mm.height, pad = 14; this.sc = Math.min((W - pad * 2) / (b - a), (H - pad * 2) / (d - c)); this.ox = (W - (b - a) * this.sc) / 2; this.oz = (H - (d - c) * this.sc) / 2;
    this.base = document.createElement('canvas'); this.base.width = W; this.base.height = H; const x = this.base.getContext('2d');
    x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 9; this._path(x); x.strokeStyle = 'rgba(233,238,230,.85)'; x.lineWidth = 4; this._path(x);
  }
  _pt(p) { return [this.ox + (p.x - this.bb.a) * this.sc, this.oz + (p.z - this.bb.c) * this.sc]; }
  _path(x) { x.beginPath(); this.track.S.forEach((p, i) => { const [u, v] = this._pt(p); i ? x.lineTo(u, v) : x.moveTo(u, v); }); x.closePath(); x.stroke(); }
  toast(msg, ms = 2200) { this.el.toast.textContent = msg; this.el.toast.classList.add('on'); clearTimeout(this._tt); this._tt = setTimeout(() => this.el.toast.classList.remove('on'), ms); }
  countdown(tm) {
    const e = this.el.cd, tr = t;
    if (tm < 0) { const n = Math.ceil(-tm); e.textContent = n <= 3 ? String(n) : ''; e.className = n <= 3 ? 'on' : ''; }
    else if (tm < 1.2) { e.textContent = tr('go'); e.className = 'on go'; } else e.className = '';
  }
  _set(el, k, val, prop = 'textContent') { if (this._c === undefined) this._c = new Map(); if (this._c.get(k) === val) return; this._c.set(k, val); el[prop] = val; }
  update(s) {
    const e = this.el, v = s.veh, T = (el, k, val) => this._set(el, k, val);
    const mph = S.units === 'mph'; T(e.kmh, 'kmh', String(Math.round(Math.abs(v.u) * (mph ? 2.23694 : 3.6)))); T(e.unit, 'unit', mph ? 'mph' : 'km/h');
    T(e.gear, 'gear', String(v.gear < 0 ? 'R' : v.gear === 0 ? 'N' : v.gear));
    const rr = (v.rpm - v.spec.idle) / (v.spec.redline - v.spec.idle); { const w = Math.round(Math.max(2, Math.min(100, rr * 100))) + '%'; if (this._c.get('rpmw') !== w) { this._c.set('rpmw', w); e.rpm.style.width = w; } }
    e.shift.classList.toggle('on', v.rpm > v.spec.redline * 0.93);
    e.rpm.classList.toggle('red', rr > 0.88);
    e.nit.style.width = Math.round(v.nit * 50) / 50 * 100 + '%'; e.nit.classList.toggle('on', v.nitOn);
    this._set(e.pos, 'pos', `<b>${s.pos}</b><span>/${s.total}</span>`, 'innerHTML');
    T(e.lap, 'lap', s.finished ? t('finish2') : s.lapNo < 1 ? `${t('lap')} 1/${this.laps}` : `${t('lap')} ${Math.min(s.lapNo, this.laps)}/${this.laps}`);
    T(e.time, 'time', s.state === 'race' ? fmt(s.lapTime) : '0:00.00'); T(e.best, 'best', s.best != null ? t('best') + ' ' + fmt(s.best) : '');
    const X = s.extra || {};
    T(e.rec, 'rec', X.rec != null ? t('record') + ' ' + fmt(X.rec) : '');
    { const dl = X.delta; const txt = dl == null ? '' : (dl > 0 ? '+' : '−') + Math.abs(dl).toFixed(2); T(e.delta, 'delta', txt); if (this._dc !== (dl > 0)) { this._dc = dl > 0; e.delta.className = dl > 0 ? 'slow' : 'fast'; } }
    { const tn = X.turn; const key = tn ? tn.dir + '|' + tn.sev + '|' + Math.round(tn.dist / 10) : ''; if (this._tk !== key) { this._tk = key; e.turn.className = tn ? 'on s' + tn.sev : ''; e.turn.innerHTML = tn ? `<b>${tn.dir < 0 ? '⮜' : '⮞'}</b><span>${Math.round(tn.dist / 10) * 10} m</span><small>${tn.sev === 1 ? t('hairpin') : tn.dir < 0 ? t('arrowL') : t('arrowR')}</small>` : ''; } }
    { const on = S.damageHud, d = X.damage || 0; e.dmg.style.display = on ? '' : 'none'; if (on) { const w = Math.round(d * 50) * 2 + '%'; if (this._dw !== w) { this._dw = w; e.dmgFill.style.width = w; e.dmgFill.className = d > 0.66 ? 'hi' : d > 0.33 ? 'mid' : ''; } } }
    this._set(e.flags, 'flags', [['ABS', v.assist.abs, v.absOn], ['TC', v.assist.tc, v.tcOn], [v.assist.auto ? 'Auto' : 'Manual', true, false], ['Estab. ' + (v.assist.stab ? Math.round(v.assist.stab * 10) / 10 : 'off'), v.assist.stab > 0, false]]
      .map(([n, on, act]) => `<i class="${on ? 'on' : ''}${act ? ' act' : ''}">${n}</i>`).join(''), 'innerHTML');
    // classificação
    this._board(s.order, s.player);
    this._mini(s.order, s.player);
  }
  _board(order, player) {
    const h = order.slice(0, 6).map((r, i) => `<li class="${r === player ? 'me' : ''}"><em>${i + 1}</em><span>${r.name}</span><small>${r.finished ? '✓' : 'V' + Math.max(1, Math.min(r.lapNo, this.laps))}</small></li>`).join('');
    if (h !== this._bh) { this._bh = h; this.el.board.innerHTML = h; }
  }
  _mini(order, player) {
    const x = this.mx, W = this.mm.width, H = this.mm.height; x.clearRect(0, 0, W, H); x.drawImage(this.base, 0, 0);
    for (const r of order) { const [u, v] = this._pt({ x: r.veh.x, z: r.veh.z }); x.fillStyle = r === player ? '#ffb703' : 'rgba(233,238,230,.9)'; x.beginPath();
      if (r === player) { const a = r.veh.psi, c = Math.sin(a), d = Math.cos(a); x.moveTo(u + c * 11, v + d * 11); x.lineTo(u - c * 6 - d * 6, v - d * 6 + c * 6); x.lineTo(u - c * 6 + d * 6, v - d * 6 - c * 6); x.closePath(); x.fill(); x.strokeStyle = '#000'; x.lineWidth = 2; x.stroke(); }
      else { x.arc(u, v, 4.2, 0, 7); x.fill(); } }
  }
  /** opts: { gained, totals, champFinal, nextUrl, onAgain, round, rounds, trackName, newRecord } */
  results(order, player, opts = {}) {
    const best = {}; const nl = Math.min(this.laps, 6);
    for (let i = 0; i < nl; i++) { let m = 1e9; for (const r of order) if (r.laps[i] != null && r.laps[i] < m) m = r.laps[i]; best[i] = m; }
    const G = opts.gained, T = opts.totals;
    const lapsH = Array.from({ length: nl }, (_, i) => `<th>V${i + 1}</th>`).join('');
    const rows = order.map((r, i) => `<tr class="${r === player ? 'me' : ''}"><td>${i + 1}</td><td>${r.name}</td><td>${r.finished ? fmt(r.finishT) : '—'}</td><td>${fmt(r.best)}</td>` +
      Array.from({ length: nl }, (_, k) => `<td class="lp${r.laps[k] != null && r.laps[k] === best[k] ? ' fast' : ''}">${r.laps[k] != null ? fmt(r.laps[k]) : '—'}</td>`).join('') +
      (G ? `<td>+${G[r.name] || 0}</td><td><b>${T[r.name] || 0}</b></td>` : '') + '</tr>').join('');
    const pod = [1, 0, 2].filter((i) => order[i]).map((i) => `<div class="pd p${i + 1}"><span>${order[i].name}</span><div><b>${i + 1}</b></div></div>`).join('');
    let tbl = `<table><tr><th></th><th>${t('driver')}</th><th>${t('time')}</th><th>${t('bestLap')}</th>${lapsH}${G ? `<th>${t('points')}</th><th>${t('total')}</th>` : ''}</tr>${rows}</table>`;
    if (opts.champFinal) {
      const st = Object.entries(T).sort((a, b) => b[1] - a[1]);
      tbl = `<h3>${t('champEnd')}</h3><table>${st.map(([n, p], i) => `<tr class="${n === player.name ? 'me' : ''}"><td>${i + 1}</td><td>${n}</td><td><b>${p}</b></td></tr>`).join('')}</table>`;
    }
    const sub = [opts.rounds ? `${t('round')} ${opts.round} ${t('of')} ${opts.rounds}` : '', opts.trackName || '', opts.newRecord ? t('tNewRecord') : ''].filter(Boolean).join(' · ');
    $('results').innerHTML = `<div class="card big"><h2>${t('result')}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}<div class="podium">${pod}</div>${opts.champFinal ? '' : ''}<div class="scroll">${tbl}</div>` +
      `<div class="row">${opts.onAgain ? `<button id="again" class="pri">${t('again')}</button>` : ''}${opts.nextUrl ? `<a id="next" class="btn pri" href="${opts.nextUrl}">${t('nextRace')}</a>` : ''}<a class="btn" href="garagem.html">${t('garage')}</a></div></div>`;
    $('results').classList.add('on'); if (opts.onAgain) $('again').onclick = opts.onAgain;
  }
  hideResults() { $('results').classList.remove('on'); }
}
