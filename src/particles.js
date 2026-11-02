// particles.js — partículas leves em um único Points (pool circular): faíscas (aditivas), pedrinhas/cascalho e
// respingos de chuva. Têm gravidade e quicam no chão.
import * as THREE from 'three';

export class Burst {
  /** additive: faíscas brilhantes · normal: pedrinhas/respingos */
  constructor(scene, { N = 360, additive = false, gravity = 9.8 } = {}) {
    this.N = N; this.i = 0; this.g = gravity;
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N).fill(1);
    this.gy = new Float32Array(N); this.size = new Float32Array(N); this.col = new Float32Array(N * 3); this.alpha = new Float32Array(N); this.sz = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aS', new THREE.BufferAttribute(this.sz, 1)); g.setAttribute('aC', new THREE.BufferAttribute(this.col, 3));
    this.m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float aA; attribute float aS; attribute vec3 aC; varying float vA; varying vec3 vC; uniform float uScale;
        void main(){ vA = aA; vC = aC; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aS * uScale / max(-mv.z, 0.5); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = smoothstep(1.0, 0.25, r) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }`,
    });
    this.mesh = new THREE.Points(g, this.m); this.mesh.frustumCulled = false; scene.add(this.mesh); this.geo = g; this.additive = additive;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, gr, b, groundY) {
    const i = this.i = (this.i + 1) % this.N, j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.life[i] = this.max[i] = life; this.size[i] = size; this.col[j] = r; this.col[j + 1] = gr; this.col[j + 2] = b; this.gy[i] = groundY != null ? groundY : y - 0.2;
  }
  update(dt, scale) {
    if (scale) this.m.uniforms.uScale.value = scale;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const j = i * 3, t = 1 - this.life[i] / this.max[i];
      this.v[j + 1] -= this.g * dt; this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < this.gy[i]) { this.p[j + 1] = this.gy[i]; this.v[j + 1] *= -0.32; this.v[j] *= 0.6; this.v[j + 2] *= 0.6; }
      this.alpha[i] = this.additive ? (1 - t) * (1 - t) : Math.min(1, (1 - t) * 2.2) * 0.9; this.sz[i] = this.size[i] * (this.additive ? 1 - 0.5 * t : 1);
    }
    const a = this.geo.attributes; a.position.needsUpdate = a.aA.needsUpdate = a.aS.needsUpdate = a.aC.needsUpdate = true;
  }
}
