// reflect.js — reflexo dinâmico na lataria do carro do jogador: um cubemap pequeno (96 px) é recapturado aos poucos
// (uma face a cada 3 quadros, sem árvores nem outros carros) e vira o "envMap" dos materiais do carro.
import * as THREE from 'three';

export class Reflect {
  constructor(renderer, scene, car, size = 96) {
    this.r = renderer; this.scene = scene; this.car = car; this.on = false; this.n = 0; this.hide = []; this.dead = false;
    this.rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    this.cc = new THREE.CubeCamera(0.4, 2500, this.rt);
    this.mats = [];
    car.object.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m && m.isMeshStandardMaterial && !this.mats.includes(m)) this.mats.push(m); });
  }
  setHidden(list) { this.hide = list; }
  _capture(pos, faces) {
    const r = this.r, cc = this.cc, rt0 = r.getRenderTarget(), f0 = r.getActiveCubeFace(), m0 = r.getActiveMipmapLevel(), xr = r.xr.enabled;
    const sNU = r.shadowMap.needsUpdate, sAU = r.shadowMap.autoUpdate;
    r.xr.enabled = false; r.shadowMap.needsUpdate = false; r.shadowMap.autoUpdate = false;
    const vis = this.hide.map((o) => o.visible); this.hide.forEach((o) => { o.visible = false; });
    cc.position.copy(pos); cc.updateMatrixWorld(true);
    try { for (const f of faces) { r.setRenderTarget(this.rt, f); r.render(this.scene, cc.children[f]); } }
    finally {
      this.hide.forEach((o, i) => { o.visible = vis[i]; });
      r.setRenderTarget(rt0, f0, m0); r.xr.enabled = xr; r.shadowMap.needsUpdate = sNU; r.shadowMap.autoUpdate = sAU;
    }
  }
  setEnabled(on, pos) {
    if (this.dead || on === this.on) return; this.on = on;
    if (on) { this._capture(pos, [0, 1, 2, 3, 4, 5]); this.rt.texture.needsPMREMUpdate = true; }
    for (const m of this.mats) m.envMap = on ? this.rt.texture : null;
  }
  /** chamar a cada quadro (só tem efeito quando ligado) */
  update(pos) {
    if (!this.on || this.dead) return;
    if (++this.n % 3 !== 0) return;
    const face = (this.n / 3) % 6;
    try { this._capture(pos, [face]); if (face === 5) this.rt.texture.needsPMREMUpdate = true; }
    catch (e) { console.warn('reflect', e); this.dead = true; this.on = false; for (const m of this.mats) m.envMap = null; }
  }
}
