// mirror.js — retrovisor: uma segunda câmera olhando para trás, desenhada numa textura pequena e mostrada (espelhada) no topo da tela.
import * as THREE from 'three';

export class Mirror {
  constructor(renderer, scene, frameEl, W = 512, H = 144) {
    this.r = renderer; this.scene = scene; this.el = frameEl; this.n = 0; this.has = false;
    this.rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 2 });
    this.cam = new THREE.PerspectiveCamera(48, W / H, 0.3, 900);
    this.qs = new THREE.Scene(); this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.qs.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { tMap: { value: this.rt.texture } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tMap; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tMap, vec2(1.0 - vUv.x, vUv.y)); #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }',
    })));
  }
  /** pos: ponto de origem (mundo); psi: rumo do carro; every: renderiza a textura a cada N quadros */
  render(show, pos, psi, every = 2) {
    this.el.style.display = show ? 'block' : 'none'; if (!show) return;
    if (this.n++ % every === 0 || !this.has) {
      const sn = Math.sin(psi), cs = Math.cos(psi);
      this.cam.position.set(pos.x - sn * 0.4, pos.y, pos.z - cs * 0.4); this.cam.lookAt(pos.x - sn * 60, pos.y - 1.2, pos.z - cs * 60); this.cam.updateMatrixWorld();
      const prev = this.r.getRenderTarget(); this.r.setRenderTarget(this.rt); this.r.clear(); this.r.render(this.scene, this.cam); this.r.setRenderTarget(prev); this.has = true;
    }
    const b = this.el.getBoundingClientRect(), H = this.r.domElement.clientHeight, auto = this.r.autoClear;
    this.r.autoClear = false; this.r.setScissorTest(true); this.r.setViewport(b.left, H - b.bottom, b.width, b.height); this.r.setScissor(b.left, H - b.bottom, b.width, b.height);
    this.r.render(this.qs, this.qc);
    this.r.setScissorTest(false); this.r.setViewport(0, 0, this.r.domElement.clientWidth, H); this.r.autoClear = auto;
  }
}
