// showroom.js — estúdio para ver os carros: reflexos de softbox, piso, sombra, câmera orbital e bloom.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Cena só para gerar o mapa de reflexos: sala escura com faixas de luz (é o que dá o brilho "de revista" na lataria)
function buildEnvScene() {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 40), new THREE.MeshBasicMaterial({ color: 0x07090b, side: THREE.BackSide }));
  room.position.y = 7; s.add(room);
  const panel = (w, h, pos, rot, rgb, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k), side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(...pos); m.rotation.set(...rot); s.add(m);
  };
  const P = Math.PI;
  panel(26, 2.2, [0, 13.5, -4], [P / 2, 0, 0], [1, 1, 0.97], 9);      // faixa de teto 1
  panel(26, 2.2, [0, 13.5, 5], [P / 2, 0, 0], [1, 1, 0.97], 9);       // faixa de teto 2
  panel(3, 9, [-14, 6, 2], [0, P / 2, 0], [1, 0.86, 0.7], 8);         // softbox quente à esquerda
  panel(3, 9, [14, 6, -2], [0, P / 2, 0], [0.75, 0.88, 1], 8);        // softbox frio à direita
  panel(18, 2, [0, 5, -18], [0, 0, 0], [1, 1, 1], 5);                 // faixa de fundo
  panel(10, 1.4, [0, 4, 18], [0, P, 0], [1, 1, 1], 4);                // faixa de frente
  return s;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Showroom {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f10);
    scene.fog = new THREE.Fog(0x0b0f10, 16, 40);

    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(buildEnvScene(), 0.02).texture;
    pm.dispose();

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120);
    this.camera.position.set(6.2, 1.7, 7.2);
    const ctl = this.controls = new OrbitControls(this.camera, canvas);
    ctl.target.set(0, 0.55, 0);
    ctl.enableDamping = true; ctl.dampingFactor = 0.07;
    ctl.enablePan = false; ctl.minDistance = 4.5; ctl.maxDistance = 12;
    ctl.minPolarAngle = 0.25; ctl.maxPolarAngle = Math.PI / 2 - 0.03;
    ctl.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches; ctl.autoRotateSpeed = 0.7;
    let idle;
    ctl.addEventListener('start', () => { clearTimeout(idle); this.userRotating = true; ctl.autoRotate = false; });
    ctl.addEventListener('end', () => { this.userRotating = false; idle = setTimeout(() => { ctl.autoRotate = this.allowAuto; }, 4000); });
    this.allowAuto = ctl.autoRotate;

    // luz principal com sombra suave
    const key = new THREE.DirectionalLight(0xfff3e4, 2.2);
    key.position.set(6, 10, 5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0x9db8ff, 0x1a1410, 0.35));

    // piso espelhado + plataforma + anel âmbar (brilha no bloom)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x15191b, roughness: 0.38, metalness: 0.55, envMapIntensity: 0.7 }));
    floor.receiveShadow = true; scene.add(floor);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.3, 0.05, 96),
      new THREE.MeshStandardMaterial({ color: 0x0e1112, roughness: 0.22, metalness: 0.8, envMapIntensity: 0.9 }));
    plat.position.y = 0.0; plat.receiveShadow = true; scene.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.022, 8, 160).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 3.1, 0.25), toneMapped: false }));
    ring.position.y = 0.03; scene.add(ring);

    // sombra de contato (escurece sob o carro)
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,.75)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
    this.blob.position.y = 0.032; scene.add(this.blob);

    // pós-processamento: MSAA em HDR + bloom + tone mapping
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    const comp = this.composer = new EffectComposer(r, rt);
    comp.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.32, 0.55, 0.95);
    comp.addPass(this.bloom);
    comp.addPass(new OutputPass());

    this.car = null;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // em telas estreitas afasta a câmera para o carro caber
    this.camera.fov = w / h < 1 ? 46 : 32;
    this.camera.updateProjectionMatrix();
  }

  show(car) {
    if (this.car) this.scene.remove(this.car.object);
    this.car = car;
    this.scene.add(car.object);
    this.blob.scale.set(car.dims.width * 1.9, 1, car.dims.length * 1.35);
    // enquadra: o centro do carro fica um pouco acima do chão
    this.controls.target.set(0, car.dims.height * 0.42, 0);
  }

  render(dt) {
    this.controls.update(dt);
    this.composer.render(dt);
  }
}
