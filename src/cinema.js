// cinema.js — replay dos últimos segundos e modo foto.
//   Y  = replay (setas ←/→ mudam a velocidade, Espaço pausa, Y/Esc sai)
//   H  = modo foto (arraste o mouse para girar, roda do mouse para zoom, Enter salva a imagem, H/Esc sai)
// O replay grava a pose já "desenhada" de todos os carros (30 vezes por segundo, últimos 25 s).
const TAU = Math.PI * 2, K = 18;   // K = números guardados por carro e amostra
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpA = (a, b, t) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; };

export class Cinema {
  constructor(canvas, hudEl) {
    this.canvas = canvas; this.hud = hudEl; this.cap = 750; this.rate = 30;
    this.buf = null; this.n = 0; this.head = 0; this.acc = 0;
    this.replay = false; this.photo = false; this.rt = 0; this.rspeed = 1; this.rpause = false; this.phase = -1; this.sideCam = null;
    this.pv = { yaw: 0.6, pitch: 0.18, dist: 7.5, fov: 50 };
    this.shot = false;
    const css = 'position:fixed;left:50%;transform:translateX(-50%);font:600 14px/1.4 Barlow,system-ui,sans-serif;color:#fff;background:rgba(10,20,20,.72);padding:8px 16px;border-radius:999px;z-index:15;pointer-events:none;display:none;text-shadow:0 1px 3px #000;white-space:nowrap';
    this.bar = document.createElement('div'); this.bar.style.cssText = css + ';bottom:22px'; document.body.appendChild(this.bar);
    this.prog = document.createElement('div'); this.prog.style.cssText = 'position:fixed;left:8%;right:8%;bottom:8px;height:4px;background:rgba(255,255,255,.2);border-radius:3px;z-index:15;pointer-events:none;display:none';
    this.prog.innerHTML = '<i style="display:block;height:100%;width:0;background:#ffb020;border-radius:3px"></i>'; document.body.appendChild(this.prog);
    this.flash = document.createElement('div'); this.flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:16;transition:opacity .35s'; document.body.appendChild(this.flash);
    let drag = false, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', (e) => { if (!this.photo) return; drag = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
    addEventListener('pointerup', () => { drag = false; });
    addEventListener('pointermove', (e) => { if (!this.photo || !drag) return; this.pv.yaw -= (e.clientX - lx) * 0.006; this.pv.pitch = clamp(this.pv.pitch + (e.clientY - ly) * 0.004, -0.15, 1.35); lx = e.clientX; ly = e.clientY; });
    canvas.addEventListener('wheel', (e) => { if (!this.photo) return; e.preventDefault(); this.pv.dist = clamp(this.pv.dist * (1 + Math.sign(e.deltaY) * 0.08), 2.4, 40); }, { passive: false });
  }
  get active() { return this.replay || this.photo; }
  // ---------- gravação ----------
  /** racers: lista; dt: segundos reais; sample(rc) → array de K números */
  record(dt, racers) {
    if (!this.buf) this.buf = racers.map(() => new Float32Array(this.cap * K));
    this.acc += dt; if (this.acc < 1 / this.rate) return; this.acc = 0;
    racers.forEach((rc, i) => {
      const v = rc.veh, vis = rc.vis, w = v.w, o = rc.car.object, b = this.buf[i], j = this.head * K;
      b[j] = o.position.x; b[j + 1] = o.position.y; b[j + 2] = o.position.z; b[j + 3] = v.psi; b[j + 4] = vis.pitch; b[j + 5] = vis.roll; b[j + 6] = vis.sp; b[j + 7] = vis.rl;
      b[j + 8] = v.steerAng; b[j + 9] = w[0].omega; b[j + 10] = w[1].omega; b[j + 11] = w[2].omega; b[j + 12] = w[3].omega; b[j + 13] = v.brk > 0.25 && v.u > 0.5 ? 1 : 0; b[j + 14] = vis.heat; b[j + 15] = v.u; b[j + 16] = v.thr; b[j + 17] = vis.y;
    });
    this.head = (this.head + 1) % this.cap; this.n = Math.min(this.cap, this.n + 1);
  }
  get seconds() { return this.n / this.rate; }
  // ---------- replay ----------
  startReplay() { if (this.n < 30) return false; this.replay = true; this.photo = false; this.rt = 0; this.rspeed = 1; this.rpause = false; this.phase = -1; this._ui(); return true; }
  stop() { this.replay = false; this.photo = false; this._ui(); }
  togglePhoto() { this.photo = !this.photo; if (this.photo) this.replay = false; this._ui(); return this.photo; }
  /** devolve a amostra interpolada do carro i no instante do replay (índice 0 = mais antigo) */
  at(i, out) {
    const b = this.buf[i], f = clamp(this.rt * this.rate, 0, this.n - 1.001), a = Math.floor(f), t = f - a, start = (this.head - this.n + this.cap * 2) % this.cap;
    const ja = ((start + a) % this.cap) * K, jb = ((start + a + 1) % this.cap) * K;
    for (let k = 0; k < K; k++) out[k] = b[ja + k] + (b[jb + k] - b[ja + k]) * t;
    out[3] = lerpA(b[ja + 3], b[jb + 3], t); return out;
  }
  stepReplay(dt) {
    if (!this.replay) return false;
    if (!this.rpause) this.rt += dt * this.rspeed;
    if (this.rt >= (this.n - 1.01) / this.rate) { this.rt = 0; }   // volta ao começo (loop)
    const bar = this.prog.firstChild; bar.style.width = (100 * this.rt / (this.seconds || 1)) + '%';
    return true;
  }
  key(code) {
    if (this.replay) {
      if (code === 'ArrowLeft') this.rspeed = Math.max(0.125, this.rspeed / 2); else if (code === 'ArrowRight') this.rspeed = Math.min(4, this.rspeed * 2);
      else if (code === 'Space') this.rpause = !this.rpause; else if (code === 'KeyY' || code === 'Escape') this.stop();
      this._ui(); return true;
    }
    if (this.photo) {
      if (code === 'KeyH' || code === 'Escape') this.stop(); else if (code === 'Enter' || code === 'Space') { this.shot = true; this.flash.style.opacity = '0.8'; setTimeout(() => { this.flash.style.opacity = '0'; }, 90); }
      else if (code === 'ArrowUp') this.pv.fov = clamp(this.pv.fov - 4, 18, 90); else if (code === 'ArrowDown') this.pv.fov = clamp(this.pv.fov + 4, 18, 90);
      this._ui(); return true;
    }
    return false;
  }
  /** chamar logo depois de composer.render(): salva a imagem se foi pedido */
  grab() {
    if (!this.shot) return; this.shot = false;
    this.canvas.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'corrida-foto-' + Date.now() + '.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }, 'image/png');
  }
  // ---------- câmeras ----------
  /** replay: posiciona câmera de TV em volta do carro do jogador (s = amostra dele) */
  replayCam(s, camera, dt) {
    const ph = Math.floor(this.rt / 4.5) % 3, sn = Math.sin(s[3]), cs = Math.cos(s[3]);
    let px, py, pz, fov = 55;
    if (ph === 0) { px = s[0] - sn * 7.5; py = s[17] + 2.4; pz = s[2] - cs * 7.5; }
    else if (ph === 1) { px = s[0] + sn * 10 + cs * 3.6; py = s[17] + 1.0; pz = s[2] + cs * 10 - sn * 3.6; fov = 48; }
    else { if (this.phase !== 2 || !this.sideCam) this.sideCam = [s[0] + cs * 11 + sn * 6, s[17] + 1.7, s[2] - sn * 11 + cs * 6]; [px, py, pz] = this.sideCam; fov = 38; }
    if (ph !== 2) this.sideCam = null; this.phase = ph;
    const k = this.phase === 2 ? 1 : 1 - Math.exp(-dt * 8);
    camera.position.x += (px - camera.position.x) * k; camera.position.y += (py - camera.position.y) * k; camera.position.z += (pz - camera.position.z) * k;
    camera.lookAt(s[0], s[17] + 0.8, s[2]); camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  }
  photoCam(base, camera) {
    const p = this.pv, cp = Math.cos(p.pitch);
    camera.position.set(base.x + Math.sin(p.yaw) * cp * p.dist, base.y + 0.7 + Math.sin(p.pitch) * p.dist, base.z + Math.cos(p.yaw) * cp * p.dist);
    camera.lookAt(base.x, base.y + 0.55, base.z); camera.fov = p.fov; camera.updateProjectionMatrix();
  }
  _ui() {
    const on = this.replay || this.photo;
    if (this.hud) this.hud.style.visibility = on ? 'hidden' : '';
    this.bar.style.display = on ? 'block' : 'none'; this.prog.style.display = this.replay ? 'block' : 'none';
    if (this.replay) this.bar.textContent = `REPLAY  ·  ${this.rpause ? 'pausado' : this.rspeed + 'x'}  ·  ← → velocidade  ·  Espaço pausa  ·  Y ou Esc sai`;
    else if (this.photo) this.bar.textContent = 'MODO FOTO  ·  arraste: girar  ·  roda: zoom  ·  ↑ ↓: lente  ·  Enter: salvar imagem  ·  H ou Esc: sair';
  }
}
