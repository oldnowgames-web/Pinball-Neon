// textures.js — texturas procedurais (sem arquivos): grama, terra, cascalho, asfalto, folhas de grama, zebra e linha de largada.
import * as THREE from 'three';
import { rng } from './noise.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// desenha um traço também deslocado (+-S) para a textura emendar sem costura
function wrapDraw(S, f) { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) f(dx, dy); }

export function grassTexture(S = 512, seed = 3) {
  const r = rng(seed), c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#44702b'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const px = r() * S, py = r() * S, l = 4 + r() * 11, a = (r() - 0.5) * 0.9 - Math.PI / 2;
    const g = 70 + r() * 80, rd = 40 + r() * 40, b = 20 + r() * 25;
    x.strokeStyle = `rgba(${rd},${g},${b},${0.35 + r() * 0.4})`; x.lineWidth = 1 + r() * 1.5;
    wrapDraw(S, (dx, dy) => { x.beginPath(); x.moveTo(px + dx, py + dy); x.lineTo(px + dx + Math.cos(a) * l, py + dy + Math.sin(a) * l); x.stroke(); });
  }
  for (let i = 0; i < 260; i++) { // manchas secas / terra
    const px = r() * S, py = r() * S, rad = 6 + r() * 20;
    wrapDraw(S, (dx, dy) => { const g = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, rad); g.addColorStop(0, 'rgba(120,110,50,.22)'); g.addColorStop(1, 'rgba(120,110,50,0)'); x.fillStyle = g; x.fillRect(px + dx - rad, py + dy - rad, rad * 2, rad * 2); });
  }
  return tex(c);
}
export function dirtTexture(S = 512, seed = 5) {
  const r = rng(seed), c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#6b5136'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 14000; i++) { const v = 60 + r() * 90; x.fillStyle = `rgba(${v + 25},${v},${v - 25},${0.15 + r() * 0.3})`; x.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3); }
  for (let i = 0; i < 400; i++) { const px = r() * S, py = r() * S, rad = 1.5 + r() * 4, v = 90 + r() * 70;
    wrapDraw(S, (dx, dy) => { x.fillStyle = `rgba(${v},${v - 8},${v - 20},.8)`; x.beginPath(); x.arc(px + dx, py + dy, rad, 0, 7); x.fill(); }); }
  return tex(c);
}
export function gravelTexture(S = 512, seed = 7) {
  const r = rng(seed), c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#7d7a72'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) { const px = r() * S, py = r() * S, rad = 1 + r() * 3.2, v = 80 + r() * 120;
    wrapDraw(S, (dx, dy) => { x.fillStyle = `rgba(${v},${v - 4},${v - 10},.9)`; x.beginPath(); x.arc(px + dx, py + dy, rad, 0, 7); x.fill(); x.fillStyle = 'rgba(0,0,0,.25)'; x.beginPath(); x.arc(px + dx + 0.8, py + dy + 0.8, rad * 0.8, 0, 7); x.fill(); }); }
  return tex(c);
}
export function asphaltTexture(S = 1024, seed = 11) {
  const r = rng(seed), W = 512, H = S, c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#383a40'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 40000; i++) { const v = r() < 0.5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.08})`; x.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 10; i++) { const px = 30 + r() * (W - 60), py = r() * H, pw = 40 + r() * 120, ph = 40 + r() * 160, l = r() < 0.5;
    for (const o of [-H, 0, H]) { x.fillStyle = l ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.12)'; x.fillRect(px, py + o, pw, ph); } }
  for (const cx of [0.34, 0.66]) { const g = x.createLinearGradient(W * cx - 50, 0, W * cx + 50, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(W * cx - 50, 0, 100, H); }
  for (let i = 0; i < 6; i++) { const sx = W * (0.3 + r() * 0.4), sy = r() * H; for (const o of [-H, 0, H]) { x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 3 + r() * 4; x.beginPath(); x.moveTo(sx, sy + o); x.quadraticCurveTo(sx + 14, sy + 80 + o, sx + (r() - 0.5) * 60, sy + 200 + o); x.stroke(); } }
  // linhas laterais e tracejado central
  x.fillStyle = 'rgba(238,238,232,.93)';
  x.fillRect(W * 0.035, 0, W * 0.022, H); x.fillRect(W * 0.943, 0, W * 0.022, H);
  const dash = H / 3; for (let k = 0; k < 3; k++) x.fillRect(W / 2 - 4, k * dash, 8, dash * 0.38);
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(48,48,52,${0.25 + r() * 0.5})`; const px = r() < 0.5 ? W * 0.035 + r() * W * 0.022 : W * 0.943 + r() * W * 0.022; x.fillRect(px, r() * H, 1 + r() * 2, 1 + r() * 3); }
  const t = tex(c, { aniso: 16 }); t.wrapS = THREE.ClampToEdgeWrapping; return t;
}
export function kerbTexture() {
  const c = canvas(64, 128), x = c.getContext('2d');
  for (let i = 0; i < 2; i++) { x.fillStyle = i ? '#f1f1ee' : '#c8161d'; x.fillRect(0, i * 64, 64, 64); }
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`; x.fillRect(Math.random() * 64, Math.random() * 128, 2, 2); }
  return tex(c);
}
export function checkerTexture() {
  const c = canvas(256, 64), x = c.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#f4f4f2' : '#16171a'; x.fillRect(i * 16, j * 16, 16, 16); }
  return tex(c, { repeat: false });
}
export function bladeTexture() {
  const c = canvas(128, 128), x = c.getContext('2d'), r = rng(21);
  for (let i = 0; i < 26; i++) {
    const bx = 8 + r() * 112, h = 50 + r() * 70, lean = (r() - 0.5) * 40, w = 3 + r() * 4;
    const g = x.createLinearGradient(0, 128, 0, 128 - h); g.addColorStop(0, '#223a14'); g.addColorStop(1, `rgb(${110 + r() * 40},${160 + r() * 50},${50 + r() * 30})`);
    x.fillStyle = g; x.beginPath(); x.moveTo(bx - w, 128); x.quadraticCurveTo(bx, 128 - h * 0.6, bx + lean, 128 - h); x.quadraticCurveTo(bx + w * 0.2, 128 - h * 0.6, bx + w, 128); x.closePath(); x.fill();
  }
  const t = tex(c, { repeat: false }); return t;
}
export function noiseTexture(S = 256, seed = 9) {
  const r = rng(seed), c = canvas(S, S), x = c.getContext('2d'), d = x.createImageData(S, S);
  // ruído de valor suave emendável
  const G = 16, grid = Array.from({ length: G * G }, () => r());
  const sm = (t) => t * t * (3 - 2 * t);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    let v = 0, a = 1, m = 0;
    for (let o = 0; o < 4; o++) { const f = G / (1 << 0) * (1 << o) / 1, fx = (i / S) * (G << o) , fy = (j / S) * (G << o); const gx = Math.floor(fx), gy = Math.floor(fy), tx = sm(fx - gx), ty = sm(fy - gy), Gm = G << o;
      const hv = (X, Y) => { const k = ((X % Gm) * 73856093 ^ (Y % Gm) * 19349663 ^ o * 83492791) >>> 0; return (k % 1000) / 1000; };
      v += a * ((hv(gx, gy) * (1 - tx) + hv(gx + 1, gy) * tx) * (1 - ty) + (hv(gx, gy + 1) * (1 - tx) + hv(gx + 1, gy + 1) * tx) * ty); m += a; a *= 0.5; }
    v = v / m * 255; const k = (j * S + i) * 4; d.data[k] = d.data[k + 1] = d.data[k + 2] = v; d.data[k + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  return tex(c, { srgb: false });
}
