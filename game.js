(() => {
'use strict';
/* ================= Constantes da mesa ================= */
const W = 600, H = 900, R = 10;
const G = 1300, VMAX = 2000, DT = 1 / 360;
const REST = 0.52, UP = -0.52, FSPEED = 22, FLEN = 80;
const MAX_BALLS = 4;
const STORE_KEY = 'pinball-neon-ranking-v1';
const LANE_X = 555, LANE_Y = 842;

const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const sc = document.createElement('canvas'), sctx = sc.getContext('2d');
let S = 1;

/* ================= Geometria ================= */
const segs = [];
function seg(x1, y1, x2, y2, o) {
  const s = Object.assign({ x1, y1, x2, y2, e: .4, kind: 'wall', vis: true, color: '#35e0ff', w: 5 }, o || {});
  segs.push(s); return s;
}
// arco superior
{
  const cx = 300, cy = 300, r = 280, N = 48;
  let px = cx - r, py = cy;
  for (let i = 1; i <= N; i++) {
    const a = Math.PI + Math.PI * i / N, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    seg(px, py, x, y, { e: .25 }); px = x; py = y;
  }
}
seg(20, 300, 20, 905);
seg(580, 300, 580, 905);
seg(530, 250, 530, 905);
seg(530, 141, 530, 250, { ow: true, nx: -1, ny: 0, vis: false });          // portão de mão única
seg(530, 852, 580, 852, { ow: true, nx: 0, ny: -1, vis: false });          // fundo da rampa de lançamento
// guias das raias e estilingues
const PINK = '#ff3d8b';
seg(80, 610, 80, 700, { color: PINK }); seg(80, 700, 168, 782, { color: PINK });
seg(470, 610, 470, 700, { color: PINK }); seg(470, 700, 382, 782, { color: PINK });
// postes entre as raias do topo
seg(247, 95, 247, 150, { color: '#9b7bff', e: .5 });
seg(303, 95, 303, 150, { color: '#9b7bff', e: .5 });
// estilingues (triângulos)
function sling(T, B, F, dir) {
  const face = seg(T[0], T[1], F[0], F[1], { kind: 'sling', vis: false, e: .3 });
  const dx = F[0] - T[0], dy = F[1] - T[1], l = Math.hypot(dx, dy);
  face.nx = dir * dy / l; face.ny = -dir * dx / l;
  if (face.nx * dir < 0) { face.nx = -face.nx; face.ny = -face.ny; }
  face.hit = 0; face.tri = [T, B, F];
  seg(T[0], T[1], B[0], B[1], { vis: false, e: .3 });
  seg(B[0], B[1], F[0], F[1], { vis: false, e: .3 });
  return face;
}
const slingL = sling([118, 585], [118, 682], [172, 702], 1);
const slingR = sling([432, 585], [432, 682], [378, 702], -1);
// garante normal apontando para o centro da mesa
slingL.nx = Math.abs(slingL.nx); slingL.ny = -Math.abs(slingL.ny);
slingR.nx = -Math.abs(slingR.nx); slingR.ny = -Math.abs(slingR.ny);

// alvos laterais
const targets = [];
function target(x, y1, y2, group) {
  const s = seg(x, y1, x, y2, { kind: 'target', vis: false, e: .5, lit: false, hit: 0, group });
  targets.push(s);
}
target(523, 370, 410, 'R'); target(523, 420, 460, 'R'); target(523, 470, 510, 'R');
target(27, 500, 540, 'L'); target(27, 550, 590, 'L');
const groups = { R: { pts: 3000 }, L: { pts: 2000 } };

// bumpers e pinos
const bumpers = [
  { x: 190, y: 270, r: 28, hit: 0 },
  { x: 360, y: 270, r: 28, hit: 0 },
  { x: 275, y: 365, r: 28, hit: 0 },
];
const pegs = [{ x: 100, y: 200, r: 8 }, { x: 450, y: 200, r: 8 }];

// raias do topo (A B C)
const lanes = [
  { x: 219, y: 125, r: 17, lit: false, ch: 'A', in: false },
  { x: 275, y: 125, r: 17, lit: false, ch: 'B', in: false },
  { x: 331, y: 125, r: 17, lit: false, ch: 'C', in: false },
];
// raias inferiores
const sensors = [
  { x: 92, y: 650, r: 13, pts: 250, flash: 0, in: false },
  { x: 458, y: 650, r: 13, pts: 250, flash: 0, in: false },
  { x: 50, y: 650, r: 13, pts: 500, flash: 0, in: false },
  { x: 500, y: 650, r: 13, pts: 500, flash: 0, in: false },
];
const saucer = { x: 78, y: 430, r: 17, cool: 0 };

// flippers
const flippers = [
  { px: 175, py: 790, sx: 1, a: REST, w: 0, on: false },
  { px: 375, py: 790, sx: -1, a: REST, w: 0, on: false },
];

/* ================= Estado ================= */
const ball = { x: LANE_X, y: LANE_Y, vx: 0, vy: 0, held: false, heldT: 0, trail: [], still: 0 };
const st = {
  mode: 'menu', score: 0, ball: 1, mult: 1, bonus: 0, charge: 0,
  msg: '', msgT: 0, paused: false, drainT: 0, popups: [], nudgeCool: 0, t: 0, lastRank: -1,
};
const inp = { l: false, r: false, plunge: false };

/* ================= Áudio ================= */
let ac = null, soundOn = true;
function snd(f, d = .08, type = 'square', v = .05, slide = 0) {
  if (!soundOn) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(t + d);
  } catch (e) { /* sem áudio */ }
}

/* ================= Ranking ================= */
let memRank = [];
function loadRank() {
  try { const r = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); if (Array.isArray(r)) return r; } catch (e) { }
  return memRank;
}
function saveRank(r) { memRank = r; try { localStorage.setItem(STORE_KEY, JSON.stringify(r)); } catch (e) { } }
let ranking = loadRank();
const fmt = n => n.toLocaleString('pt-BR');
function renderRank(el, hl) {
  el.textContent = '';
  if (!ranking.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Ninguém jogou ainda. Seja o primeiro.'; el.appendChild(li); return; }
  ranking.forEach((e, i) => {
    const li = document.createElement('li'); if (i === hl) li.className = 'me';
    const n = document.createElement('span'); n.className = 'n'; n.textContent = e.name;
    const p = document.createElement('span'); p.className = 'p'; p.textContent = fmt(e.score);
    li.append(n, p); el.appendChild(li);
  });
}
function refreshRanks(hl) { renderRank($('rank'), hl); renderRank($('ovRank'), hl); $('best').textContent = fmt(ranking.length ? ranking[0].score : 0); }

/* ================= HUD ================= */
function hud() {
  $('score').textContent = fmt(st.score);
  $('mult').textContent = 'x' + st.mult;
  const d = $('dots'); d.textContent = '';
  for (let i = 1; i <= MAX_BALLS; i++) {
    const e = document.createElement('i');
    if (st.mode !== 'menu' && i < st.ball) e.className = 'used';
    else if (st.mode !== 'menu' && i === st.ball && st.mode !== 'over') e.className = 'now';
    d.appendChild(e);
  }
}
function flash(text) { st.msg = text; st.msgT = 1.8; }
function popup(x, y, text, col) { st.popups.push({ x, y, text, t: 0, col: col || '#ffc83d' }); }
function award(p, x, y) {
  const v = p * st.mult; st.score += v; popup(x, y - 18, '+' + fmt(v)); hud();
}

/* ================= Fluxo do jogo ================= */
function resetBallState() {
  st.mult = 1; st.bonus = 0; st.charge = 0;
  lanes.forEach(l => l.lit = false); targets.forEach(t => t.lit = false);
}
function placeBall() {
  Object.assign(ball, { x: LANE_X, y: LANE_Y, vx: 0, vy: 0, held: false, heldT: 0, trail: [], still: 0 });
  st.mode = 'ready'; st.charge = 0; $('hint').textContent = 'Segure ESPAÇO';
}
function newGame() {
  st.score = 0; st.ball = 1; resetBallState(); placeBall(); st.lastRank = -1;
  $('overlay').hidden = true; flash('Bola 1'); hud();
}
function drain() {
  st.mode = 'drain';
  const b = st.bonus * st.mult; st.score += b;
  flash(b ? 'Bônus ' + fmt(b) : 'Bola perdida');
  snd(300, .5, 'sawtooth', .06, -220);
  st.drainT = 2.3; hud();
}
function afterDrain() {
  if (st.ball >= MAX_BALLS) return gameOver();
  st.ball++; resetBallState(); placeBall(); flash('Bola ' + st.ball); hud();
}
function qualifies() { return st.score > 0 && (ranking.length < 8 || st.score > ranking[ranking.length - 1].score); }
function gameOver() {
  st.mode = 'over'; hud();
  $('ovTitle').textContent = 'Fim de jogo';
  $('ovText').textContent = qualifies() ? 'Você entrou na classificação. Digite seu nome.' : 'Fim das 4 bolas. Tente de novo para subir no ranking.';
  $('ovScore').hidden = false; $('ovScore').textContent = fmt(st.score);
  $('nameForm').hidden = !qualifies();
  $('btnPlay').textContent = 'Jogar de novo';
  $('overlay').hidden = false;
  if (qualifies()) setTimeout(() => $('nameIn').focus(), 50);
  refreshRanks(-1);
}
$('nameForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = ($('nameIn').value.trim() || 'Jogador').slice(0, 12);
  const entry = { name, score: st.score, date: Date.now() };
  ranking.push(entry); ranking.sort((a, b) => b.score - a.score); ranking = ranking.slice(0, 8);
  saveRank(ranking);
  refreshRanks(ranking.indexOf(entry));
  $('nameForm').hidden = true; $('ovText').textContent = 'Pontuação salva.'; $('nameIn').value = '';
});
$('btnPlay').addEventListener('click', () => { snd(520, .1, 'square', .05, 300); newGame(); });
$('btnNew').addEventListener('click', () => { newGame(); });
$('btnSound').addEventListener('click', e => { soundOn = !soundOn; e.target.textContent = 'Som: ' + (soundOn ? 'ligado' : 'desligado'); });
function togglePause() {
  if (st.mode === 'menu' || st.mode === 'over') return;
  st.paused = !st.paused; $('btnPause').textContent = st.paused ? 'Continuar' : 'Pausar';
}
$('btnPause').addEventListener('click', togglePause);

/* ================= Entrada ================= */
const KL = ['ArrowLeft', 'KeyA', 'KeyZ', 'ShiftLeft'], KR = ['ArrowRight', 'KeyD', 'Slash', 'ShiftRight'], KP = ['Space', 'ArrowDown'];
const down = new Set();
function recompute() {
  const l = KL.some(k => down.has(k)) || touchL, r = KR.some(k => down.has(k)) || touchR;
  setFlip(0, l); setFlip(1, r);
  inp.plunge = KP.some(k => down.has(k)) || touchP;
}
function rotateLanes() { const v = lanes.map(l => l.lit); lanes.forEach((l, i) => l.lit = v[(i + 2) % 3]); }
function setFlip(i, on) {
  const f = flippers[i];
  if (on && !f.on) {
    snd(i ? 180 : 200, .05, 'triangle', .07, -60);
    if (st.mode === 'play') rotateLanes();
  }
  f.on = on;
}
let touchL = false, touchR = false, touchP = false;
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if ([...KL, ...KR, ...KP, 'ArrowUp'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyP') { togglePause(); return; }
  if ((e.code === 'Enter' || e.code === 'Space') && !$('overlay').hidden) { if ($('nameForm').hidden) { newGame(); } return; }
  if (e.code === 'ArrowUp' && !e.repeat) nudge();
  down.add(e.code); recompute();
});
addEventListener('keyup', e => { down.delete(e.code); recompute(); });
addEventListener('blur', () => { down.clear(); touchL = touchR = touchP = false; recompute(); });
function bindTouch(id, set) {
  const b = $(id);
  const on = e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) { } set(true); b.classList.add('on'); recompute(); };
  const off = e => { e.preventDefault(); set(false); b.classList.remove('on'); recompute(); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
  b.addEventListener('contextmenu', e => e.preventDefault());
}
bindTouch('tL', v => touchL = v); bindTouch('tR', v => touchR = v); bindTouch('tP', v => touchP = v);
function nudge() {
  if (st.mode !== 'play' || st.nudgeCool > 0 || ball.held) return;
  st.nudgeCool = 0.9;
  ball.vx += (Math.random() < .5 ? -1 : 1) * (120 + Math.random() * 120); ball.vy -= 120;
  snd(90, .12, 'sawtooth', .05, -30);
}

/* ================= Física ================= */
function updateFlippers(dt) {
  for (const f of flippers) {
    const target = f.on && st.mode !== 'menu' && st.mode !== 'over' ? UP : REST, prev = f.a;
    if (f.a !== target) {
      const d = Math.sign(target - f.a) * FSPEED * dt;
      f.a = Math.abs(target - f.a) <= Math.abs(d) ? target : f.a + d;
    }
    f.w = (f.a - prev) / dt;
  }
}
function collideSeg(b, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy;
  let t = ((b.x - s.x1) * dx + (b.y - s.y1) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = s.x1 + t * dx, cy = s.y1 + t * dy;
  let nx = b.x - cx, ny = b.y - cy; const d = Math.hypot(nx, ny);
  if (d >= R) return 0;
  if (s.ow && (b.x - s.x1) * s.nx + (b.y - s.y1) * s.ny <= 0) return 0;
  if (d < 1e-6) { nx = s.nx || 0; ny = s.ny || -1; } else { nx /= d; ny /= d; }
  b.x += nx * (R - d); b.y += ny * (R - d);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const e = -vn < 60 ? 0 : s.e;
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
  }
  s.nxHit = nx; s.nyHit = ny;
  return vn;
}
function collideCircle(b, c, kick, e) {
  let nx = b.x - c.x, ny = b.y - c.y; const d = Math.hypot(nx, ny), rr = c.r + R;
  if (d >= rr) return 0;
  if (d < 1e-6) { nx = 0; ny = -1; } else { nx /= d; ny /= d; }
  b.x = c.x + nx * rr; b.y = c.y + ny * rr;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    if (kick) {
      const cur = b.vx * nx + b.vy * ny;
      if (cur < kick) { b.vx += nx * (kick - cur); b.vy += ny * (kick - cur); }
    }
  }
  return vn;
}
function collideFlipper(b, f) {
  const tx = f.px + f.sx * Math.cos(f.a) * FLEN, ty = f.py + Math.sin(f.a) * FLEN;
  const dx = tx - f.px, dy = ty - f.py, l2 = dx * dx + dy * dy;
  let t = ((b.x - f.px) * dx + (b.y - f.py) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = f.px + t * dx, cy = f.py + t * dy, rad = 11 - 4 * t;
  let nx = b.x - cx, ny = b.y - cy; const d = Math.hypot(nx, ny);
  if (d >= R + rad) return;
  if (d < 1e-6) { nx = 0; ny = -1; } else { nx /= d; ny /= d; }
  b.x = cx + nx * (R + rad); b.y = cy + ny * (R + rad);
  const s = t * FLEN, sa = f.a;
  const vsx = s * f.w * (-f.sx * Math.sin(sa)), vsy = s * f.w * Math.cos(sa);
  const rel = (b.vx - vsx) * nx + (b.vy - vsy) * ny;
  if (rel < 0) { const e = .25; b.vx -= (1 + e) * rel * nx; b.vy -= (1 + e) * rel * ny; }
}
function physics(dt) {
  const b = ball;
  if (b.held) {
    b.heldT -= dt;
    if (b.heldT <= 0) {
      b.held = false; b.vx = 380 + Math.random() * 120; b.vy = -(430 + Math.random() * 100);
      snd(700, .15, 'square', .05, 400); saucer.cool = 1;
    }
    return;
  }
  b.vy += G * dt; b.x += b.vx * dt; b.y += b.vy * dt;
  const sp = Math.hypot(b.vx, b.vy); if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
  const mp = st.mult;
  for (const s of segs) {
    const vn = collideSeg(b, s);
    if (vn < -50) {
      if (s.kind === 'sling') {
        const cur = b.vx * s.nx + b.vy * s.ny, k = 560;
        if (cur < k) { b.vx += s.nx * (k - cur); b.vy += s.ny * (k - cur); }
        s.hit = .15; award(10, b.x, b.y); st.bonus += 10; snd(420, .06, 'square', .06, 200);
      } else if (s.kind === 'target') {
        s.hit = .25; snd(880, .08, 'triangle', .07, 200);
        if (!s.lit) { s.lit = true; award(500, s.x1, (s.y1 + s.y2) / 2); st.bonus += 500; checkGroup(s.group); }
        else award(100, s.x1, (s.y1 + s.y2) / 2);
      } else if (s.e >= .5 && vn < -120) snd(260, .04, 'triangle', .04);
    }
  }
  for (const c of bumpers) {
    const vn = collideCircle(b, c, 650, .5);
    if (vn < -30) { c.hit = .18; award(100, c.x, c.y); st.bonus += 100; snd(300 + Math.random() * 120, .1, 'square', .07, 300); }
  }
  for (const c of pegs) {
    const vn = collideCircle(b, c, 0, .7);
    if (vn < -80) { snd(500, .04, 'triangle', .04); award(10, c.x, c.y); }
  }
  for (const f of flippers) collideFlipper(b, f);

  // raias superiores
  for (const l of lanes) {
    const inside = Math.hypot(b.x - l.x, b.y - l.y) < l.r;
    if (inside && !l.in) {
      l.in = true;
      if (!l.lit) { l.lit = true; award(50, l.x, l.y); snd(660, .08, 'triangle', .07, 150); }
      if (lanes.every(x => x.lit)) {
        st.score += 2000 * st.mult; popup(275, 170, '+' + fmt(2000 * st.mult), '#35e0ff');
        st.mult = Math.min(5, st.mult + 1); st.bonus += 1000; flash('Multiplicador x' + st.mult);
        snd(520, .3, 'square', .07, 600); hud();
        setTimeout(() => lanes.forEach(x => x.lit = false), 450);
      }
    } else if (!inside) l.in = false;
  }
  // raias inferiores
  for (const s of sensors) {
    const inside = Math.hypot(b.x - s.x, b.y - s.y) < s.r;
    if (inside && !s.in) { s.in = true; s.flash = .6; award(s.pts, s.x, s.y); st.bonus += s.pts / 5; snd(s.pts > 300 ? 450 : 600, .1, 'triangle', .06, 120); }
    else if (!inside) s.in = false;
  }
  // caçapa
  if (saucer.cool <= 0 && Math.hypot(b.x - saucer.x, b.y - saucer.y) < 14) {
    b.held = true; b.heldT = 1.1; b.x = saucer.x; b.y = saucer.y; b.vx = b.vy = 0;
    award(1000, saucer.x, saucer.y); st.bonus += 1000; flash('Caçapa! +' + fmt(1000 * st.mult));
    snd(200, .4, 'sawtooth', .06, 500);
  }
  // voltou para a rampa de lançamento
  if (b.x > 535 && b.y > 835 && Math.abs(b.vy) < 400) { placeBall(); return; }
  // bola parada
  if (Math.hypot(b.vx, b.vy) < 8 && b.y < 760 && b.x < 530) {
    b.still += dt; if (b.still > 3) { b.vx = (Math.random() - .5) * 300; b.vy = -200; b.still = 0; flash('Sacudida automática'); }
  } else b.still = 0;
  // dreno
  if (b.y > H + 30) drain();
}
function checkGroup(g) {
  const list = targets.filter(t => t.group === g);
  if (list.every(t => t.lit)) {
    const p = groups[g].pts * st.mult; st.score += p; st.bonus += 1500;
    popup(g === 'R' ? 440 : 120, 330, '+' + fmt(p), '#35e0ff'); flash('Alvos completos! +' + fmt(p));
    snd(740, .35, 'square', .07, 500); hud();
    setTimeout(() => list.forEach(t => t.lit = false), 500);
  }
}

/* ================= Loop ================= */
function tick(dt) {
  st.t += dt;
  updateFlippers(dt);
  if (st.nudgeCool > 0) st.nudgeCool -= dt;
  if (saucer.cool > 0) saucer.cool -= dt;
  if (st.msgT > 0) st.msgT -= dt;
  bumpers.forEach(b => b.hit > 0 && (b.hit -= dt));
  targets.forEach(t => t.hit > 0 && (t.hit -= dt));
  segs.forEach(s => s.kind === 'sling' && s.hit > 0 && (s.hit -= dt));
  sensors.forEach(s => s.flash > 0 && (s.flash -= dt));
  st.popups.forEach(p => p.t += dt); st.popups = st.popups.filter(p => p.t < 1.1);
  if (st.mode === 'ready') {
    if (inp.plunge) { st.charge = Math.min(1, st.charge + dt / .9); }
    else if (st.charge > 0) {
      const p = st.charge; st.charge = 0;
      if (p > .06) {
        ball.vy = -(700 + 1300 * p); ball.vx = 0; st.mode = 'play'; snd(150, .25, 'sawtooth', .08, 500);
      }
    }
    ball.y = LANE_Y + st.charge * 38; ball.x = LANE_X;
    $('hint').textContent = st.charge > 0 ? Math.round(st.charge * 100) + '%' : 'Segure ESPAÇO';
  } else if (st.mode === 'play') {
    trail();
  } else if (st.mode === 'drain') {
    st.drainT -= dt; if (st.drainT <= 0) afterDrain();
  }
  if (st.mode !== 'ready') $('hint').textContent = st.mode === 'play' ? 'Em jogo' : '';
}
function trail() {
  ball.trail.push(ball.x, ball.y); if (ball.trail.length > 12) ball.trail.splice(0, 2);
}
let last = 0, acc = 0, fi = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
  if (!st.paused) {
    acc += dt;
    while (acc >= DT) {
      if (st.mode === 'play') physics(DT);
      acc -= DT;
    }
    tick(dt);
  }
  $('powerFill').style.width = (st.charge * 100) + '%';
  draw();
}

/* ================= Desenho ================= */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.round(cv.width * H / W);
  S = cv.width / W; buildStatic();
}
function glowLine(c, x1, y1, x2, y2, col, w) {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.shadowColor = col; c.shadowBlur = 14;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.shadowBlur = 0;
}
function buildStatic() {
  sc.width = cv.width; sc.height = cv.height;
  const c = sctx; c.setTransform(S, 0, 0, S, 0, 0);
  c.fillStyle = '#03040b'; c.fillRect(0, 0, W, H);
  c.beginPath(); c.moveTo(20, 905); c.lineTo(20, 300); c.arc(300, 300, 280, Math.PI, 2 * Math.PI); c.lineTo(580, 905); c.closePath();
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a0f46'); g.addColorStop(.45, '#0c1236'); g.addColorStop(1, '#070a1e');
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  // anéis decorativos
  c.lineWidth = 2;
  [[275, 470, 110, 'rgba(255,61,139,.10)'], [275, 470, 160, 'rgba(53,224,255,.08)'], [275, 470, 215, 'rgba(155,123,255,.07)']].forEach(a => {
    c.strokeStyle = a[3]; c.beginPath(); c.arc(a[0], a[1], a[2], 0, 7); c.stroke();
  });
  // estrelas
  let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) { c.fillStyle = 'rgba(255,255,255,' + (.08 + rnd() * .25) + ')'; c.fillRect(25 + rnd() * 555, 25 + rnd() * 700, 1.6, 1.6); }
  // rampa de lançamento
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(530, 100, 50, 800);
  // texto
  c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.06)'; c.font = '66px Bungee, Impact, sans-serif';
  c.fillText('PINBALL', 275, 560); c.fillStyle = 'rgba(255,61,139,.16)'; c.font = '36px Bungee, Impact, sans-serif'; c.fillText('NEON', 275, 600);
  // setas das raias internas
  c.fillStyle = 'rgba(255,200,61,.25)';
  [[92, 600], [458, 600]].forEach(a => { c.beginPath(); c.moveTo(a[0] - 8, a[1]); c.lineTo(a[0] + 8, a[1]); c.lineTo(a[0], a[1] + 14); c.fill(); });
  c.restore();
  // paredes
  for (const s of segs) if (s.vis) glowLine(c, s.x1, s.y1, s.x2, s.y2, s.color, s.w);
  // borda inferior da mesa
  c.fillStyle = '#03040b'; c.fillRect(0, 898, W, 4);
  // ícones das raias
  c.font = '700 18px "Chakra Petch", sans-serif'; c.textAlign = 'center';
}
function drawFlipper(c, f) {
  const tx = f.px + f.sx * Math.cos(f.a) * FLEN, ty = f.py + Math.sin(f.a) * FLEN;
  const ang = Math.atan2(ty - f.py, tx - f.px), nx = -Math.sin(ang), ny = Math.cos(ang);
  c.beginPath();
  c.moveTo(f.px + nx * 11, f.py + ny * 11); c.lineTo(tx + nx * 7, ty + ny * 7);
  c.arc(tx, ty, 7, ang - Math.PI / 2 + Math.PI, ang + Math.PI / 2 + Math.PI, true);
  c.lineTo(f.px - nx * 11, f.py - ny * 11);
  c.arc(f.px, f.py, 11, ang + Math.PI / 2, ang - Math.PI / 2, false);
  c.closePath();
  const g = c.createLinearGradient(f.px, f.py - 11, f.px, f.py + 11);
  g.addColorStop(0, f.on ? '#ffe3a0' : '#ffc83d'); g.addColorStop(1, '#c4561c');
  c.fillStyle = g; c.shadowColor = '#ffc83d'; c.shadowBlur = f.on ? 18 : 8; c.fill(); c.shadowBlur = 0;
  c.strokeStyle = '#2a1204'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = '#2a1204'; c.beginPath(); c.arc(f.px, f.py, 4, 0, 7); c.fill();
}
function draw() {
  const c = ctx;
  c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(sc, 0, 0);
  c.setTransform(S, 0, 0, S, 0, 0);
  const t = st.t;
  // luzes de multiplicador
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    const x = 215 + i * 40, on = st.mult >= i + 2;
    c.beginPath(); c.arc(x, 195, 13, 0, 7);
    c.fillStyle = on ? '#35e0ff' : '#10173a'; c.shadowColor = '#35e0ff'; c.shadowBlur = on ? 16 : 0; c.fill(); c.shadowBlur = 0;
    c.strokeStyle = '#2b3f7a'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = on ? '#04202a' : '#55629a'; c.font = '700 12px "Chakra Petch",sans-serif'; c.fillText('x' + (i + 2), x, 196);
  }
  // raias superiores
  for (const l of lanes) {
    c.beginPath(); c.arc(l.x, l.y, 14, 0, 7);
    c.fillStyle = l.lit ? '#ffc83d' : '#161c44'; c.shadowColor = '#ffc83d'; c.shadowBlur = l.lit ? 18 : 0; c.fill(); c.shadowBlur = 0;
    c.strokeStyle = '#4a3a10'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = l.lit ? '#2a1c00' : '#6a73a8'; c.font = '700 15px "Chakra Petch",sans-serif'; c.fillText(l.ch, l.x, l.y + 1);
  }
  // raias inferiores
  for (const s of sensors) {
    const on = s.flash > 0;
    c.beginPath(); c.arc(s.x, s.y, 7, 0, 7);
    c.fillStyle = on ? '#ffc83d' : '#1a2150'; c.shadowColor = '#ffc83d'; c.shadowBlur = on ? 14 : 0; c.fill(); c.shadowBlur = 0;
  }
  // caçapa
  c.beginPath(); c.arc(saucer.x, saucer.y, saucer.r, 0, 7); c.fillStyle = '#020309'; c.fill();
  c.strokeStyle = ball.held ? '#ffc83d' : '#9b7bff'; c.lineWidth = 4; c.shadowColor = c.strokeStyle; c.shadowBlur = 14; c.stroke(); c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,200,61,.8)'; c.font = '700 11px "Chakra Petch",sans-serif'; c.fillText('1000', saucer.x + 4, saucer.y + 32);
  // alvos
  for (const s of targets) {
    const on = s.lit || s.hit > 0;
    glowLine(c, s.x1, s.y1, s.x2, s.y2, on ? '#ffc83d' : '#ff3d8b', 9);
    if (!on) glowLine(c, s.x1, s.y1 + 2, s.x2, s.y2 - 2, '#2a0a1a', 4);
  }
  // pinos
  for (const p of pegs) {
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fillStyle = '#9b7bff'; c.shadowColor = '#9b7bff'; c.shadowBlur = 10; c.fill(); c.shadowBlur = 0;
    c.fillStyle = '#e4dcff'; c.beginPath(); c.arc(p.x - 2, p.y - 2, 2.6, 0, 7); c.fill();
  }
  // bumpers
  for (const b of bumpers) {
    const h = b.hit > 0, k = h ? 1 + b.hit * 1.1 : 1;
    c.beginPath(); c.arc(b.x, b.y, b.r * k, 0, 7);
    c.fillStyle = h ? '#fff3b0' : '#ff3d8b'; c.shadowColor = '#ff3d8b'; c.shadowBlur = h ? 36 : 16; c.fill(); c.shadowBlur = 0;
    c.beginPath(); c.arc(b.x, b.y, b.r * .68 * k, 0, 7); c.fillStyle = h ? '#ffc83d' : '#2a0b2f'; c.fill();
    c.beginPath(); c.arc(b.x, b.y, b.r * .32 * k, 0, 7); c.fillStyle = h ? '#fff' : '#35e0ff'; c.fill();
  }
  // estilingues
  for (const s of [slingL, slingR]) {
    const [T, B, F] = s.tri;
    c.beginPath(); c.moveTo(T[0], T[1]); c.lineTo(B[0], B[1]); c.lineTo(F[0], F[1]); c.closePath();
    c.fillStyle = s.hit > 0 ? '#ffc83d' : '#12183f'; c.fill();
    c.strokeStyle = '#ff3d8b'; c.lineWidth = 4; c.lineJoin = 'round'; c.shadowColor = '#ff3d8b'; c.shadowBlur = 10; c.stroke(); c.shadowBlur = 0;
    glowLine(c, T[0], T[1], F[0], F[1], s.hit > 0 ? '#fff' : '#35e0ff', 4);
  }
  // portão
  glowLine(c, 530, 141, 530, 250, 'rgba(155,123,255,.5)', 2);
  // flippers
  flippers.forEach(f => drawFlipper(c, f));
  // plunger
  const py = LANE_Y + 10 + (st.mode === 'ready' ? st.charge * 38 : 0);
  c.strokeStyle = '#8e98c4'; c.lineWidth = 2; c.beginPath();
  const top = py + 2, bot = 896; c.moveTo(LANE_X, top);
  for (let i = 1; i <= 8; i++) c.lineTo(LANE_X + (i % 2 ? 11 : -11), top + (bot - top) * i / 8);
  c.stroke();
  c.fillStyle = '#c4cbe8'; c.fillRect(LANE_X - 14, py - 2, 28, 5);
  // rastro e bola
  if (st.mode === 'play' || st.mode === 'ready') {
    for (let i = 0; i < ball.trail.length; i += 2) {
      const a = i / ball.trail.length * .22;
      c.beginPath(); c.arc(ball.trail[i], ball.trail[i + 1], R * .8, 0, 7); c.fillStyle = 'rgba(180,220,255,' + a + ')'; c.fill();
    }
    const g = c.createRadialGradient(ball.x - 3, ball.y - 4, 1, ball.x, ball.y, R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#b9c3e2'); g.addColorStop(1, '#4a5478');
    c.beginPath(); c.arc(ball.x, ball.y, R, 0, 7); c.fillStyle = g; c.shadowColor = '#bfe9ff'; c.shadowBlur = 8; c.fill(); c.shadowBlur = 0;
  }
  // pop-ups de pontos
  c.textAlign = 'center'; c.font = '700 18px "Chakra Petch",sans-serif';
  for (const p of st.popups) {
    c.globalAlpha = Math.max(0, 1 - p.t / 1.1); c.fillStyle = p.col; c.fillText(p.text, p.x, p.y - p.t * 36);
  }
  c.globalAlpha = 1;
  // mensagem central
  if (st.msgT > 0 && st.msg) {
    c.globalAlpha = Math.min(1, st.msgT * 2);
    c.font = '34px Bungee, Impact, sans-serif'; c.fillStyle = '#ffc83d'; c.shadowColor = '#ffc83d'; c.shadowBlur = 18;
    c.fillText(st.msg, 275, 480, 480); c.shadowBlur = 0; c.globalAlpha = 1;
  }
  if (st.mode === 'ready' && $('overlay').hidden) {
    c.globalAlpha = .5 + .5 * Math.sin(st.t * 5); c.font = '700 15px "Chakra Petch",sans-serif'; c.fillStyle = '#35e0ff';
    c.textAlign = 'center'; c.fillText('Segure Espaço e solte para lançar', 275, 700); c.globalAlpha = 1;
  }
  if (st.paused) {
    c.fillStyle = 'rgba(3,4,11,.7)'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#35e0ff'; c.font = '44px Bungee, Impact, sans-serif'; c.fillText('PAUSA', 300, 440);
  }
}

/* ================= Início ================= */
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe($('stage')); else addEventListener('resize', resize);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
resize(); refreshRanks(-1); hud();
requestAnimationFrame(frame);
window.__pin = { st, ball, physics, tick, DT, flippers, inp, newGame, bumpers, lanes };
})();
