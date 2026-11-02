// skid.js — marcas de pneu no asfalto: faixas escuras num buffer circular (as mais antigas vão sendo sobrescritas).
import * as THREE from 'three';

export class Skid {
  constructor(scene, N = 9000) {
    this.N = N; this.n = 0; this.last = new Map(); this.dirty = false;
    this.pos = new Float32Array(N * 4 * 3); this.col = new Float32Array(N * 4 * 4);
    for (let i = 0; i < N * 4; i++) { this.col[i * 4] = this.col[i * 4 + 1] = this.col[i * 4 + 2] = 0.02; }
    const idx = new Uint16Array(N * 6); for (let i = 0; i < N; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage); this.ca = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pa); g.setAttribute('color', this.ca); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; scene.add(this.mesh);
  }
  /** key: id da roda; (x,y,z) ponto de contato; alpha 0 interrompe a faixa */
  add(key, x, y, z, alpha, hw = 0.12) {
    if (alpha <= 0.03) { this.last.delete(key); return; }
    const L = this.last.get(key);
    if (!L) { this.last.set(key, { x, y, z, a: alpha }); return; }
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    if (d < 0.4) return;
    if (d > 4) { this.last.set(key, { x, y, z, a: alpha }); return; }
    const px = dz / d * hw, pz = -dx / d * hw, v = (this.n % this.N) * 4, P = this.pos, C = this.col;
    const set = (k, X, Y, Z, a) => { P[(v + k) * 3] = X; P[(v + k) * 3 + 1] = Y; P[(v + k) * 3 + 2] = Z; C[(v + k) * 4 + 3] = a; };
    set(0, L.x + px, L.y, L.z + pz, L.a); set(1, L.x - px, L.y, L.z - pz, L.a); set(2, x + px, y, z + pz, alpha); set(3, x - px, y, z - pz, alpha);
    this.n++; this.dirty = true; L.x = x; L.y = y; L.z = z; L.a = alpha;
  }
  flush() {
    if (!this.dirty) return; this.dirty = false; this.pa.needsUpdate = this.ca.needsUpdate = true;
    this.geo.setDrawRange(0, Math.min(this.n, this.N) * 6);
  }
}
