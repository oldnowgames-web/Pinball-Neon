// noise.js — números aleatórios com semente e ruído suave (para terreno, florestas e variações).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Noise {
  constructor(seed = 1) {
    const r = rng(seed), p = new Uint8Array(512), a = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    for (let i = 0; i < 512; i++) p[i] = a[i & 255];
    this.p = p;
  }
  // Perlin 2D, resultado em ~[-1, 1]
  n(x, y) {
    const p = this.p, X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = x * x * x * (x * (x * 6 - 15) + 10), v = y * y * y * (y * (y * 6 - 15) + 10);
    const g = (h, dx, dy) => { h &= 7; const a = h < 4 ? dx : dy, b = h < 4 ? dy : dx; return ((h & 1) ? -a : a) + ((h & 2) ? -2 * b : 2 * b); };
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const l1 = g(aa, x, y) + u * (g(ba, x - 1, y) - g(aa, x, y));
    const l2 = g(ab, x, y - 1) + u * (g(bb, x - 1, y - 1) - g(ab, x, y - 1));
    return (l1 + v * (l2 - l1)) * 0.38;
  }
  fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let s = 0, a = 1, f = 1, m = 0;
    for (let i = 0; i < oct; i++) { s += a * this.n(x * f, y * f); m += a; a *= gain; f *= lac; }
    return s / m;
  }
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
