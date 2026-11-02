// trackBuilder.js — traçado da pista: curva fechada, amostras (posição, direção, curvatura), consulta de ponto mais próximo
// e malhas de asfalto, zebras (kerbs) e linha de largada.
import * as THREE from 'three';
import { smooth } from './noise.js';

// pontos de controle (x, z) em metros. Frente do carro = +Z.
export const CONTROL = [
  [0, -260], [160, -285], [330, -250], [430, -150], [405, -20], [300, 40], [335, 150], [250, 265],
  [100, 295], [-60, 235], [-130, 120], [-265, 100], [-385, 10], [-345, -120], [-220, -205], [-100, -170],
];
export const TRACKS = [
  { id: 't1', name: 'Vale Verde', control: CONTROL },
  { id: 't2', name: 'Planalto', control: [[0,-220],[170,-235],[330,-200],[420,-110],[400,10],[290,70],[170,40],[90,110],[120,210],[240,270],[250,380],[120,430],[-40,400],[-150,310],[-130,190],[-250,130],[-340,20],[-300,-110],[-170,-180]] },
  { id: 't3', name: 'Serra', control: [[0,-300],[180,-320],[350,-290],[470,-200],[480,-60],[400,40],[260,60],[170,150],[200,280],[330,360],[290,480],[140,520],[20,450],[-70,340],[-210,360],[-330,290],[-340,160],[-230,70],[-310,-30],[-400,-130],[-330,-250],[-180,-290]] },
];
/** pontos de controle de uma pista (rev = sentido inverso, mantendo o ponto de largada) */
export const trackControl = (id, rev = false) => {
  const t = TRACKS.find((x) => x.id === id) || TRACKS[0], c = t.control.map((p) => p.slice());
  return rev ? [c[0], ...c.slice(1).reverse()] : c;
};
export const HALF = 6;   // meia largura do asfalto (m)

export class Track {
  constructor(control = CONTROL) {
    const curve = new THREE.CatmullRomCurve3(control.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    const L0 = curve.getLength();
    const N = Math.round(L0 / 2.5);
    const pts = curve.getSpacedPoints(N).slice(0, N);
    this.N = N; this.length = L0; this.ds = L0 / N;
    // elevação: ondulação suave ao longo da volta
    const S = [];
    for (let i = 0; i < N; i++) {
      const u = i / N, p = pts[i];
      const y = 8 * Math.sin(2 * Math.PI * u + 0.6) + 4 * Math.sin(6 * Math.PI * u + 2.1) + 2 * Math.sin(10 * Math.PI * u);
      S.push({ x: p.x, y, z: p.z, s: i * this.ds });
    }
    for (let i = 0; i < N; i++) {
      const a = S[(i + N - 1) % N], b = S[(i + 1) % N];
      let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
      S[i].tx = tx; S[i].tz = tz; S[i].nx = tz; S[i].nz = -tx;   // normal = esquerda do carro
      S[i].h = Math.atan2(tx, tz);
    }
    for (let i = 0; i < N; i++) {
      const a = S[(i + N - 2) % N].h, b = S[(i + 2) % N].h;
      let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d));
      S[i].k = d / (4 * this.ds);                                   // curvatura (+ = esquerda)
      const A = S[(i + 3) % N], B = S[(i + N - 3) % N];
      S[i].slope = (A.y - B.y) / (6 * this.ds);
    }
    this.S = S;
    // grade espacial para "ponto mais próximo"
    this.cell = 40; this.grid = new Map();
    S.forEach((p, i) => { const k = this._key(p.x, p.z); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(i); });
  }
  _key(x, z) { return Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); }
  /** retorna { i, d (distância), lat (lateral com sinal, + = esquerda) } do ponto mais próximo da linha central */
  nearest(x, z, maxD = 1e9) {
    const c = this.cell, cx = Math.floor(x / c), cz = Math.floor(z / c);
    let best = -1, bd = Infinity;
    for (let r = 1; r < 40; r++) {
      for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) {
        if (Math.max(Math.abs(a - cx), Math.abs(b - cz)) !== r && r > 1) continue;
        const l = this.grid.get(a + ',' + b); if (!l) continue;
        for (const i of l) { const p = this.S[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
      }
      if (best >= 0 && Math.sqrt(bd) < (r) * c * 0.9) break;
      if (r * c > maxD) break;
    }
    if (best < 0) return { i: 0, d: maxD, lat: 0 };
    const p = this.S[best];
    return { i: best, d: Math.sqrt(bd), lat: (x - p.x) * p.nx + (z - p.z) * p.nz };
  }
  /** busca local (rápida) usando o índice anterior como dica. Retorna { i, d, lat, along } */
  locate(x, z, hint) {
    const N = this.N, S = this.S; let best = -1, bd = 1e18;
    if (hint != null && hint >= 0) {
      for (let k = -14; k <= 14; k++) { const i = (hint + k + N) % N, p = S[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
      if (bd > 900) best = -1;
    }
    if (best < 0) { const q = this.nearest(x, z, 3000); best = q.i; bd = q.d * q.d; }
    const p = S[best];
    return { i: best, d: Math.sqrt(bd), lat: (x - p.x) * p.nx + (z - p.z) * p.nz, along: (x - p.x) * p.tx + (z - p.z) * p.tz };
  }
  at(s) {   // amostra interpolada por distância
    const f = ((s / this.ds) % this.N + this.N) % this.N, i = Math.floor(f), t = f - i, a = this.S[i], b = this.S[(i + 1) % this.N];
    let dh = b.h - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, h: a.h + dh * t, k: a.k + (b.k - a.k) * t, slope: a.slope + (b.slope - a.slope) * t,
      nx: a.nx + (b.nx - a.nx) * t, nz: a.nz + (b.nz - a.nz) * t };
  }

  // ---------- malhas ----------
  roadMesh(material) {
    const N = this.N, cols = [-HALF, -HALF * 0.5, 0, HALF * 0.5, HALF], pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const p = this.S[i % N], v = (i * this.ds) / 12;
      for (let c = 0; c < cols.length; c++) {
        pos.push(p.x + p.nx * cols[c], p.y + 0.09, p.z + p.nz * cols[c]);
        uv.push(c / (cols.length - 1), v);
      }
    }
    const W = cols.length;
    for (let i = 0; i < N; i++) for (let c = 0; c < W - 1; c++) {
      const a = i * W + c, b = a + 1, d = a + W, e = d + 1;
      idx.push(a, d, b, b, d, e);   // sentido anti-horário visto de cima
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; m.name = 'road';
    return m;
  }
  /** zebras vermelhas/brancas nos trechos de curva forte */
  kerbMesh(material, kThresh = 1 / 110) {
    const N = this.N, pos = [], uv = [], idx = [];
    const strong = this.S.map((p) => Math.abs(p.k) > kThresh);
    let vAcc = 0;
    for (let side of [-1, 1]) {
      let run = null;
      const flush = () => {
        if (!run || run.length < 4) { run = null; return; }
        const base = pos.length / 3;
        for (const i of run) {
          const p = this.S[i], o0 = HALF * side, o1 = (HALF + 1.1) * side;
          pos.push(p.x + p.nx * o0, p.y + 0.11, p.z + p.nz * o0, p.x + p.nx * o1, p.y + 0.11, p.z + p.nz * o1);
          uv.push(0, i * this.ds / 2.4, 1, i * this.ds / 2.4);
        }
        for (let q = 0; q < run.length - 1; q++) { const a = base + q * 2; side > 0 ? idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) : idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        run = null;
      };
      for (let i = 0; i < N; i++) {
        // só no lado de fora... as duas margens recebem zebra no trecho (visual de autódromo)
        if (strong[i]) { (run || (run = [])).push(i); } else flush();
      }
      flush();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; m.name = 'kerbs';
    return m;
  }
  startLine(material) {
    const p = this.S[0], w = HALF * 2, g = new THREE.PlaneGeometry(w, 2.4).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, material);
    m.position.set(p.x, p.y + 0.10, p.z); m.rotation.y = p.h + Math.PI / 2 * 0 ; m.receiveShadow = true;
    // plano largura em X local: gira para que X fique na direção lateral (normal)
    m.rotation.y = Math.atan2(p.nx, p.nz) - Math.PI / 2 * 0;
    m.rotation.y = p.h;
    return m;
  }
}
