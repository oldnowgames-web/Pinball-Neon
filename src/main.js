// main.js — liga tudo: lista de carros, cores, acabamentos, demonstração e laço de render.
import { CAR_LIST } from './carData.js';
import { loadGLB, buildCar } from './carModel.js';
import { COLORS, FINISHES } from './paint.js';
import { Showroom } from './showroom.js';

const $ = (id) => document.getElementById(id);

if (location.protocol === 'file:') {
  $('loadText').innerHTML = 'Abra por um servidor local (os módulos e os GLB não carregam via arquivo).<br>Na pasta do projeto: <code>python -m http.server 8000</code> e acesse http://localhost:8000';
  throw new Error('Abra por um servidor local');
}

const room = new Showroom($('gl'));

// ---------- estado salvo ----------
const KEY = 'garage_v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const state = { car: saved.car || CAR_LIST[0].id, colors: saved.colors || {}, finishes: saved.finishes || {} };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

// ---------- carregamento (cada GLB uma vez; cada carro montado uma vez) ----------
const rawCache = new Map(), built = new Map();
const raw = (cfg) => { if (!rawCache.has(cfg.id)) rawCache.set(cfg.id, loadGLB(cfg.file, room.renderer)); return rawCache.get(cfg.id); };
async function getCar(cfg) {
  if (built.has(cfg.id)) return built.get(cfg.id);
  const car = buildCar(await raw(cfg), cfg);
  car.setColor(state.colors[cfg.id] || cfg.defaultColor);
  car.setFinish(state.finishes[cfg.id] || 'gloss');
  built.set(cfg.id, car);
  return car;
}

// ---------- interface ----------
const carsEl = $('cars');
for (const cfg of CAR_LIST) {
  const b = document.createElement('button');
  b.className = 'car'; b.dataset.id = cfg.id;
  b.innerHTML = `<b>${cfg.name}${cfg.beta ? ' <span class="badge" title="Rodas ainda não giram">beta</span>' : ''}</b><small></small>`;
  b.onclick = () => select(cfg.id);
  carsEl.appendChild(b);
}
const swEl = $('swatches');
for (const c of COLORS) {
  const b = document.createElement('button');
  b.className = 'sw'; b.title = c.name; b.style.background = c.hex; b.dataset.hex = c.hex; b.setAttribute('aria-label', c.name);
  b.onclick = () => setColor(c.hex);
  swEl.appendChild(b);
}
const finEl = $('finishes');
for (const [k, f] of Object.entries(FINISHES)) {
  const b = document.createElement('button');
  b.className = 'fin'; b.dataset.k = k; b.textContent = f.label;
  b.onclick = () => setFinish(k);
  finEl.appendChild(b);
}

let current = null, cfgNow = null;

function refreshUI() {
  const hex = state.colors[cfgNow.id] || cfgNow.defaultColor, fin = state.finishes[cfgNow.id] || 'gloss';
  document.querySelectorAll('.car').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === cfgNow.id)));
  let name = 'Personalizada';
  document.querySelectorAll('.sw').forEach((b) => {
    const on = b.dataset.hex.toLowerCase() === hex.toLowerCase();
    b.setAttribute('aria-pressed', String(on)); if (on) name = b.title;
  });
  $('colorName').textContent = name; $('customColor').value = hex;
  document.querySelectorAll('.fin').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === fin)));
  const d = current.dims;
  $('specs').innerHTML = `<b>${cfgNow.name}</b>${d.length.toFixed(2)} m de comprimento · ${d.width.toFixed(2)} m de largura<br>` +
    `entre-eixos ${d.wheelbase ? d.wheelbase.toFixed(2) + ' m' : '—'} · ${current.triangles.toLocaleString('pt-BR')} triângulos`;
}

async function select(id) {
  const cfg = CAR_LIST.find((c) => c.id === id) || CAR_LIST[0];
  const row = carsEl.querySelector(`[data-id="${cfg.id}"] small`);
  if (row && !built.has(cfg.id)) row.textContent = 'carregando…';
  try {
    const car = await getCar(cfg);
    if (row) row.textContent = '';
    cfgNow = cfg; current = car; state.car = cfg.id; persist();
    car.setHeadlights(tog.head); car.setBrake(tog.brake);
    room.show(car); refreshUI(); document.dispatchEvent(new CustomEvent('carchange', { detail: cfg.id }));
  } catch (e) {
    console.error(e);
    if (row) row.textContent = 'erro ao carregar';
  }
}
function setColor(hex) { current.setColor(hex); state.colors[cfgNow.id] = hex; persist(); refreshUI(); }
function setFinish(k) { current.setFinish(k); state.finishes[cfgNow.id] = k; persist(); refreshUI(); }
$('customColor').addEventListener('input', (e) => setColor(e.target.value));

// ---------- demonstração ----------
const tog = { head: false, brake: false, roll: true };
const bind = (id, key, fn) => {
  const el = $(id);
  const set = (v) => { tog[key] = v; el.setAttribute('aria-pressed', String(v)); fn && fn(v); };
  el.onclick = () => set(!tog[key]);
  return set;
};
const setHead = bind('tHead', 'head', (v) => current && current.setHeadlights(v));
const setBrake = bind('tBrake', 'brake', (v) => current && current.setBrake(v));
const setRoll = bind('tRoll', 'roll');
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'KeyH') setHead(!tog.head);
  else if (e.code === 'KeyB') setBrake(!tog.brake);
  else if (e.code === 'Space') { e.preventDefault(); setRoll(!tog.roll); }
  else if (e.code === 'KeyF') $('stats').hidden = !$('stats').hidden;
});

// ---------- laço ----------
let last = performance.now(), t = 0, speed = 0, heat = 0, pitch = 0, fps = 60;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  if (current) {
    speed += ((tog.roll ? (tog.brake ? 4 : 14) : 0) - speed) * Math.min(1, dt * 2.5);
    const steer = tog.roll ? Math.sin(t * 0.7) * 0.5 : 0;
    pitch += ((tog.brake ? 0.04 : 0) - pitch) * Math.min(1, dt * 6);
    heat += ((tog.brake ? 1 : 0) - heat) * Math.min(1, dt * (tog.brake ? 0.8 : 0.4));
    current.update(dt, { speed, steer, pitch, roll: steer * 0.035 * Math.min(1, speed / 8), heat });
  }
  room.render(dt);
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;
  if (!$('stats').hidden) {
    const i = room.renderer.info;
    $('stats').innerHTML = `${fps.toFixed(0)} fps<br>${i.render.calls} draw calls<br>${i.render.triangles.toLocaleString('pt-BR')} triângulos`;
  }
  requestAnimationFrame(frame);
}

// ---------- início ----------
(async () => {
  await select(state.car);
  $('loading').classList.add('done');
  requestAnimationFrame(frame);
  // pré-carrega os outros em segundo plano
  for (const cfg of CAR_LIST) if (!built.has(cfg.id)) { try { await raw(cfg); } catch {} }
})();
