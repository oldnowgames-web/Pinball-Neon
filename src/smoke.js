// smoke.js — fumaça de pneu (asfalto) e poeira (cascalho/grama), em um único Points com pool de partículas.
import * as THREE from 'three';

export class Smoke {
  constructor(scene, N = 700) {
    this.N = N; this.i = 0;
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N).fill(1); this.size = new Float32Array(N); this.col = new Float32Array(N * 3);
    this.alpha = new Float32Array(N); this.sz = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('aS', new THREE.BufferAttribute(this.sz, 1)); g.setAttribute('aC', new THREE.BufferAttribute(this.col, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float aA; attribute float aS; attribute vec3 aC; varying float vA; varying vec3 vC; uniform float uScale;
        void main(){ vA=aA; vC=aC; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aS*uScale/max(-mv.z,0.5); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0; float a=smoothstep(1.0,0.2,r)*vA; if(a<0.01) discard; gl_FragColor=vec4(vC,a); }`,
    });
    this.mesh = new THREE.Points(g, m); this.mesh.frustumCulled = false; scene.add(this.mesh); this.g = g; this.m = m;
  }
  emit(x, y, z, vx, vz, type, k = 1) {
    const i = this.i = (this.i + 1) % this.N, j = i * 3;
    this.p[j] = x + (Math.random() - 0.5) * 0.3; this.p[j + 1] = y + 0.1; this.p[j + 2] = z + (Math.random() - 0.5) * 0.3;
    this.v[j] = vx * 0.3 + (Math.random() - 0.5) * 1.4; this.v[j + 1] = type === 3 ? 1.8 + Math.random() * 2.2 : 0.5 + Math.random() * 1.2; this.v[j + 2] = vz * 0.3 + (Math.random() - 0.5) * 1.4;
    this.life[i] = this.max[i] = (type === 0 ? 1.3 : type === 3 ? 1.1 : 1.7) * (0.7 + Math.random() * 0.6); this.size[i] = (type === 0 ? 1.3 : type === 3 ? 0.3 : 1.7) * k;
    const lf = Math.random(), c = type === 0 ? [0.85, 0.85, 0.88] : type === 1 ? [0.5, 0.45, 0.38] : type === 3 ? (lf < 0.6 ? [0.3 + lf * 0.2, 0.42, 0.12] : [0.5, 0.36, 0.12]) : [0.38, 0.4, 0.3];
    this.col[j] = c[0]; this.col[j + 1] = c[1]; this.col[j + 2] = c[2];
  }
  update(dt, height) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const j = i * 3, t = 1 - this.life[i] / this.max[i];
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt; this.v[j + 1] *= 1 - dt * 1.2; this.v[j] *= 1 - dt * 0.8; this.v[j + 2] *= 1 - dt * 0.8;
      this.alpha[i] = Math.sin(Math.min(1, t * 6) * 1.57) * (1 - t) * 0.5; this.sz[i] = this.size[i] * (0.5 + t * 2.2);
    }
    this.g.attributes.position.needsUpdate = this.g.attributes.aA.needsUpdate = this.g.attributes.aS.needsUpdate = this.g.attributes.aC.needsUpdate = true;
  }
}
