// clouds.js — camada de nuvens em movimento (um plano grande que acompanha a câmera, shader com ruído fractal).
import * as THREE from 'three';

export class Clouds {
  constructor(scene, camera) {
    this.camera = camera;
    this.u = { uTime: { value: 0 }, uCover: { value: 0.45 }, uBright: { value: 0.9 }, uSunC: { value: new THREE.Color(1, 1, 1) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uWind: { value: new THREE.Vector2(1, 0.3) }, uWarm: { value: 0 } };
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vRel; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vRel = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        varying vec3 vRel; uniform float uTime, uCover, uBright, uWarm; uniform vec3 uSunC, uSunDir; uniform vec2 uWind;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*n(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
        void main(){
          float dist = length(vRel.xz); float fade = 1.0 - smoothstep(2600.0, 5200.0, dist);
          if (fade <= 0.001) discard;
          vec2 p = (vRel.xz + cameraPosition.xz) * 0.00042 + uWind * uTime * 0.0006;
          float d = fbm(p);
          float dl = fbm(p + uSunDir.xz * 0.05);
          float cov = smoothstep(0.62 - uCover * 0.32, 0.86 - uCover * 0.3, d);
          float lit = clamp(0.55 + (d - dl) * 3.2, 0.0, 1.0);
          vec3 shade = vec3(0.50, 0.55, 0.64) * uBright;
          vec3 sunl = mix(vec3(1.0), uSunC, 0.45 + 0.5 * uWarm) * (1.05 * uBright + 0.2);
          vec3 col = mix(shade, sunl, lit);
          // lado do sol mais quente/brilhante
          vec3 vd = normalize(vRel); float sd = max(dot(vd, normalize(uSunDir)), 0.0);
          col += uSunC * pow(sd, 6.0) * 0.35 * uWarm;
          gl_FragColor = vec4(col, cov * fade * 0.92);
        }`,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.scale.setScalar(12000); this.mesh.frustumCulled = false; this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }
  setPreset(key, P, sunDir) {
    const cfg = { manha: [0.40, 0.95, 0.55], meio: [0.34, 1.0, 0.2], por: [0.5, 0.8, 1.0], nublado: [0.9, 0.55, 0.0] }[key] || [0.4, 0.9, 0.3];
    this.base = { cover: cfg[0], bright: cfg[1], warm: cfg[2] };
    this.u.uSunC.value.setHex(P.sunC); this.u.uSunDir.value.copy(sunDir);
  }
  /** durante o ciclo de horário: cobertura/brilho/calor interpolados pelo progresso u (0 manhã, 0,5 meio-dia, 1 pôr do sol) */
  setCycle(u, P, sunDir) {
    const K = [[0.40, 0.95, 0.55], [0.34, 1.0, 0.2], [0.5, 0.8, 1.0]], a = u < 0.5 ? K[0] : K[1], b = u < 0.5 ? K[1] : K[2], k = u < 0.5 ? u * 2 : (u - 0.5) * 2, l = (x, y) => x + (y - x) * k;
    this.base = { cover: l(a[0], b[0]), bright: l(a[1], b[1]), warm: l(a[2], b[2]) };
    this.u.uSunC.value.setHex(P.sunC); this.u.uSunDir.value.copy(sunDir);
  }
  update(dt, time, rain, wind) {
    const b = this.base || { cover: 0.4, bright: 0.9, warm: 0 };
    this.u.uTime.value = time; this.u.uWind.value.set(wind, wind * 0.3);
    this.u.uCover.value = Math.min(1, b.cover + rain * 0.45); this.u.uBright.value = b.bright * (1 - 0.4 * rain); this.u.uWarm.value = b.warm;
    this.mesh.position.set(this.camera.position.x, 1700, this.camera.position.z);
  }
}
