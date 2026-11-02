// skyWeather.js — céu físico, sol com sombra que acompanha o foco, neblina, vento, chuva e pista molhada.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { lerp } from './noise.js';
import { Clouds } from './clouds.js';

const COLOR_KEYS = ['sunC', 'hemiS', 'hemiG', 'fog'];
export const PRESETS = {
  manha:   { label: 'Manhã',        elev: 11, azim: 108, turb: 4,  rayl: 1.5, mie: 0.004, g: 0.82, exposure: 0.62, sunC: 0xffd8a6, sunI: 2.5, hemiS: 0xbdd0ea, hemiG: 0x3c3d2c, hemiI: 0.38, fog: 0xb4bcc4, dens: 0.00115 },
  meio:    { label: 'Meio-dia',     elev: 52, azim: 150, turb: 2.5,rayl: 1.2, mie: 0.003, g: 0.8,  exposure: 0.54, sunC: 0xfff4e4, sunI: 2.8, hemiS: 0xa8c6ee, hemiG: 0x40422f, hemiI: 0.42, fog: 0xa2b9d0, dens: 0.00085 },
  por:     { label: 'Pôr do sol',   elev: 2.4,azim: 250, turb: 10, rayl: 3.2, mie: 0.008, g: 0.92, exposure: 0.68, sunC: 0xff6a22, sunI: 2.6, hemiS: 0xb98aa6, hemiG: 0x3a2a20, hemiI: 0.34, fog: 0xd98a54, dens: 0.0013 },
  nublado: { label: 'Nublado',      elev: 30, azim: 150, turb: 22, rayl: 0.35,mie: 0.02,  g: 0.6,  exposure: 0.56, sunC: 0xdfe6ee, sunI: 0.55, hemiS: 0xaab6c2, hemiG: 0x383b36, hemiI: 0.65, fog: 0x7d8890, dens: 0.0021 },
};

export class SkyWeather {
  constructor(scene, renderer, camera) {
    this.scene = scene; this.renderer = renderer; this.camera = camera;
    this.sky = new Sky(); this.sky.scale.setScalar(15000); scene.add(this.sky);
    this.envSky = new Sky(); this.envSky.scale.setScalar(15000);
    this.envScene = new THREE.Scene(); this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true; this.shadowSize = 62; this.shadowRes = 2048; this.sun.shadow.mapSize.set(this.shadowRes, this.shadowRes);
    Object.assign(this.sun.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 1, far: 380 });
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.5); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xffffff, 0.001);
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.expScale = 0.88;   // iluminação geral um pouco menor (teclas [ e ] ajustam) this.preset = 'manha'; this.rain = 0; this.rainTarget = 0; this.wet = 0; this.wind = 1;
    this._buildRain();
    this.clouds = new Clouds(scene, camera);
    this.setPreset('manha');
  }

  setPreset(key) {
    if (!PRESETS[key]) return; this.cyc = null; this.preset = key; this.P = PRESETS[key];
    this._apply(this.P, true); this.clouds.setPreset(key, this.P, this.sunDir);
  }
  /** ciclo de horário: manhã → meio-dia → pôr do sol ao longo de `seconds` segundos */
  startCycle(seconds, u0 = 0) { this.cyc = { t: u0 * seconds, T: seconds, envT: 0 }; this.preset = 'manha'; this._cycleStep(0, true); }
  stopCycle() { this.cyc = null; }
  _cycleStep(dt, force) {
    const c = this.cyc; c.t += dt; c.envT -= dt; const u = Math.min(1, c.t / c.T);
    const A = u < 0.5 ? PRESETS.manha : PRESETS.meio, B = u < 0.5 ? PRESETS.meio : PRESETS.por, k = u < 0.5 ? u * 2 : (u - 0.5) * 2, P = {};
    for (const key in A) P[key] = key === 'label' ? A[key] : COLOR_KEYS.includes(key) ? new THREE.Color(A[key]).lerp(new THREE.Color(B[key]), k).getHex() : lerp(A[key], B[key], k);
    this.P = P; this.u = u; this.preset = u > 0.8 ? 'por' : 'manha';
    const regen = force || c.envT <= 0; if (regen) c.envT = 10;
    this._apply(P, regen); this.clouds.setCycle(u, P, this.sunDir);
  }
  _apply(P, regenEnv) {
    const phi = THREE.MathUtils.degToRad(90 - P.elev), theta = THREE.MathUtils.degToRad(P.azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms;
      u.turbidity.value = P.turb; u.rayleigh.value = P.rayl; u.mieCoefficient.value = P.mie; u.mieDirectionalG.value = P.g; u.sunPosition.value.copy(this.sunDir);
    }
    if (regenEnv) {
      if (this.envTex) this.envTex.dispose();
      this.envTex = this.pmrem.fromScene(this.envScene, 0.015).texture; this.scene.environment = this.envTex;
    }
    this.sun.color.setHex(P.sunC); this.sun.intensity = P.sunI;
    this.hemi.color.setHex(P.hemiS); this.hemi.groundColor.setHex(P.hemiG); this.hemi.intensity = P.hemiI;
    this.scene.fog.color.setHex(P.fog); this.scene.fog.density = P.dens;
    this.scene.background = null;
    this.renderer.toneMappingExposure = P.exposure * this.expScale;
    this.baseFog = P.dens;
  }
  /** ajuste fino do brilho geral (1 = padrão) */
  setBrightness(k) { this.expScale = Math.max(0.5, Math.min(1.6, k)); this.renderer.toneMappingExposure = this.P.exposure * this.expScale; }
  setRain(on) { this.rainTarget = on ? 1 : 0; }

  follow(focus) {
    // sombra do sol seguindo o foco, "encaixada" na grade de texels para não tremer
    const d = this.sunDir, up = new THREE.Vector3(0, 1, 0);
    const lx = new THREE.Vector3().crossVectors(up, d).normalize(), ly = new THREE.Vector3().crossVectors(d, lx);
    const tex = (this.shadowSize * 2) / this.shadowRes;
    const fx = focus.dot(lx), fy = focus.dot(ly);
    const sx = Math.round(fx / tex) * tex - fx, sy = Math.round(fy / tex) * tex - fy;
    const f = focus.clone().addScaledVector(lx, sx).addScaledVector(ly, sy);
    this.sun.target.position.copy(f); this.sun.position.copy(f).addScaledVector(d, 170);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
  }

  _buildRain() {
    const N = 7000, pos = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 70, y = Math.random() * 30, z = (Math.random() - 0.5) * 70, s = Math.random();
      for (let k = 0; k < 2; k++) { const j = i * 2 + k; pos.set([x, y, z], j * 3); end[j] = k; seed[j] = s; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.rainU = { uTime: { value: 0 }, uAmt: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false,
      vertexShader: `
        uniform float uTime, uAmt, uWind; uniform vec3 uCam; attribute float aEnd, aSeed; varying float vA;
        void main(){
          float sp = 24.0 + aSeed * 10.0;
          vec3 p = position;
          float y = mod(p.y - uTime * sp, 30.0);
          vec2 xz = mod(p.xz - uCam.xz + 35.0, 70.0) - 35.0;
          vec3 w = vec3(uCam.x + xz.x, uCam.y - 8.0 + y, uCam.z + xz.y);
          vec3 dir = normalize(vec3(uWind * 0.18, -1.0, 0.06));
          w -= dir * (aEnd * 0.8);
          vA = (aSeed < uAmt ? 0.3 : 0.0) * (aEnd < 0.5 ? 0.35 : 1.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.78, 0.84, 0.92, vA); }`,
    });
    this.rainMesh = new THREE.LineSegments(g, m); this.rainMesh.frustumCulled = false; this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);
  }

  update(dt, time) {
    if (this.cyc) this._cycleStep(this.cycPaused ? 0 : dt, false);
    this.rain += (this.rainTarget - this.rain) * Math.min(1, dt * 0.6);
    this.wet += (this.rainTarget - this.wet) * Math.min(1, dt * (this.rainTarget > this.wet ? 0.15 : 0.04));
    const r = this.rain, ru = this.rainU;
    this.clouds.update(dt, time, r, this.wind);
    this.rainMesh.visible = r > 0.02; ru.uTime.value = time; ru.uAmt.value = r; ru.uCam.value.copy(this.camera.position); ru.uWind.value = this.wind;
    // chuva escurece o céu e fecha a neblina
    this.scene.fog.density = this.baseFog * (1 + r * 1.6);
    this.sun.intensity = this.P.sunI * (1 - 0.8 * r);
    this.hemi.intensity = this.P.hemiI * (1 - 0.15 * r);
  }
}
