// carModel.js — transforma um GLB (modelo bruto) num carro do jogo.
//
// Estrutura do objeto 3D:
//   root                 posição/rotação do carro no mundo (a física vai mexer aqui)
//   └ chassis            inclina (pitch/roll) para a suspensão visual
//     └ placer           escala, rotação de correção e centralização do modelo (origem = chão, entre os eixos)
//       └ nat            espaço nativo do GLB
//         ├ src          o modelo original
//         └ pivots       um por roda: pivot (esterça) → spin (gira) → malhas da roda
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Paint } from './paint.js';

const TAU = Math.PI * 2;
const match = (name, spec) => (spec instanceof RegExp ? spec.test(name) : name === spec);
const matchAny = (name, specs) => !!specs && specs.some((s) => match(name || '', s));

// ---------- carregamento ----------
export async function loadGLB(url, renderer) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const aniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k]) m[k].anisotropy = aniso;
    }
  });
  return gltf;
}

// ---------- utilitários ----------
function toPhysical(m) {
  if (m.isMeshPhysicalMaterial) return m.clone();
  const p = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(p, m);
  return p;
}

// pega só o nó mais alto que combina (não desce em nós já encontrados)
function collectTop(root, re) {
  const out = [];
  const walk = (o) => {
    for (const c of o.children) {
      if (matchAny(c.name, [re])) out.push(c);
      else walk(c);
    }
  };
  walk(root);
  return out;
}

function findNode(root, spec) {
  let found = null;
  root.traverse((o) => { if (!found && o !== root && matchAny(o.name, [spec])) found = o; });
  return found;
}

function bounds(root, rotY) {
  root.updateMatrixWorld(true);
  const R = new THREE.Matrix4().makeRotationY(rotY || 0);
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) b.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).applyMatrix4(R));
  });
  return b;
}

function splitByZ(mesh, zMid) {
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : pos.count;
  const front = [], rear = [], v = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    const tri = idx ? [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)] : [t, t + 1, t + 2];
    let z = 0;
    for (const k of tri) z += v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld).z;
    (z / 3 > zMid ? front : rear).push(...tri);
  }
  const make = (arr) => {
    const ng = new THREE.BufferGeometry();
    for (const k in g.attributes) ng.setAttribute(k, g.attributes[k]);
    ng.setIndex(arr);
    return ng;
  };
  const mk = (arr, tag) => {
    const m = new THREE.Mesh(make(arr), mesh.material.clone());
    m.name = mesh.name + tag;
    m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
    return m;
  };
  const parent = mesh.parent;
  const mf = mk(front, '_front'), mr = mk(rear, '_rear');
  parent.add(mf, mr);
  parent.remove(mesh);
  return { head: mf.material, tail: mr.material };
}

// ---------- estilos de materiais ----------
const styleGlass = (m) => {
  m.color.set(0x05080b); m.map = null; m.metalness = 0; m.roughness = 0.04;
  m.transparent = true; m.opacity = 0.88; m.envMapIntensity = 1.8; m.clearcoat = 1; m.clearcoatRoughness = 0;
  m.needsUpdate = true;
};
const styleTire = (m) => { m.roughness = 0.9; m.metalness = 0; m.clearcoat = 0; m.envMapIntensity = 0.5; };
const styleRim = (m) => { m.metalness = 0.9; m.roughness = 0.28; m.envMapIntensity = 1.3; };
const styleMetal = (m) => { m.metalness = 0.85; m.roughness = 0.4; m.envMapIntensity = 1.2; };

// ---------- montagem ----------
export function buildCar(gltf, cfg) {
  const src = gltf.scene.clone(true);
  const placer = new THREE.Group();
  const nat = new THREE.Group();
  placer.add(nat); nat.add(src);

  // materiais próprios deste carro (para pintar cada instância de uma cor)
  const matMap = new Map();
  const own = (m) => { if (!matMap.has(m)) matMap.set(m, toPhysical(m)); return matMap.get(m); };
  src.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
    o.castShadow = true; o.receiveShadow = true;
  });
  placer.updateMatrixWorld(true);

  // ----- rodas -----
  const wdesc = [];
  if (Array.isArray(cfg.wheels)) {
    for (const w of cfg.wheels) {
      const o = findNode(src, w.node);
      if (o) wdesc.push({ objs: [o], front: !!w.front, left: !!w.left, pair: !!w.pair });
    }
  } else if (cfg.wheels && cfg.wheels.pairNodes) {
    const [reA, reB] = cfg.wheels.pairNodes;
    const A = collectTop(src, reA), B = collectTop(src, reB);
    const pa = new THREE.Vector3(), pb = new THREE.Vector3();
    for (const a of A) {
      a.getWorldPosition(pa);
      let best = null, bd = 1e-2;
      for (const b of B) { b.getWorldPosition(pb); const d = pa.distanceTo(pb); if (d < bd) { bd = d; best = b; } }
      wdesc.push({ objs: best ? [a, best] : [a], center0: pa.clone() });
    }
  }
  // metrics
  const wheels = [];
  for (const d of wdesc) {
    const box = new THREE.Box3();
    d.objs.forEach((o) => box.expandByObject(o, true));
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    wheels.push({ ...d, center: c, radius: Math.max(sz.y, sz.z) / 2, width: sz.x });
  }
  if (wheels.length && wheels.some((w) => w.front === undefined)) {
    const zs = wheels.map((w) => w.center.z), xs = wheels.map((w) => w.center.x);
    const zm = (Math.max(...zs) + Math.min(...zs)) / 2, xm = (Math.max(...xs) + Math.min(...xs)) / 2;
    wheels.forEach((w) => { w.front = w.center.z > zm; w.left = w.center.x > xm; });
  }
  nat.updateMatrixWorld(true);
  for (const w of wheels) {
    const pivot = new THREE.Group(); pivot.name = 'wheelPivot';
    const spin = new THREE.Group(); spin.name = 'wheelSpin';
    pivot.position.copy(w.center);
    nat.add(pivot); pivot.add(spin); pivot.updateMatrixWorld(true);
    w.objs.forEach((o) => spin.attach(o));
    w.pivot = pivot; w.spin = spin; w.baseY = w.center.y; w.angle = 0;
    w.steer = !!w.front && !w.pair;
  }

  // ----- desfoque de movimento das rodas: disco translúcido sobre os raios, ganha opacidade conforme a roda gira rápido -----
  {
    const cxs = wheels.map((w) => w.center.x), cxm = cxs.length ? (Math.max(...cxs) + Math.min(...cxs)) / 2 : 0;
    for (const w of wheels) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(w.radius * 0.74, 28).rotateY(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x2b2d31, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      disc.position.x = (w.center.x >= cxm ? 1 : -1) * w.width * 0.47; disc.visible = false; disc.renderOrder = 2; disc.name = 'wheelBlur';
      w.pivot.add(disc); w.blur = disc;
    }
  }

  // ----- luzes (separa faróis e lanternas quando estão no mesmo material) -----
  const mats = [...matMap.values()];
  let headMats = [], tailMats = [];
  if (cfg.lights && cfg.lights.splitMat) {
    const fz = wheels.filter((w) => w.front).map((w) => w.center.z), rz = wheels.filter((w) => !w.front).map((w) => w.center.z);
    const zMid = fz.length && rz.length ? (avg(fz) + avg(rz)) / 2 : 0;
    const targets = [];
    src.traverse((o) => { if (o.isMesh && !Array.isArray(o.material) && o.material.name === cfg.lights.splitMat) targets.push(o); });
    for (const m of targets) { const r = splitByZ(m, zMid); headMats.push(r.head); tailMats.push(r.tail); }
  } else if (cfg.lights) {
    headMats = mats.filter((m) => matchAny(m.name, cfg.lights.head));
    tailMats = mats.filter((m) => matchAny(m.name, cfg.lights.tail));
  }
  headMats.forEach((m) => m.emissive.set('#ffe9c4'));
  tailMats.forEach((m) => m.emissive.set('#ff1410'));

  // ----- materiais por papel -----
  const paintEntries = [];
  for (const spec of cfg.paint.mats) {
    const [s, k] = Array.isArray(spec) ? spec : [spec, 1];
    mats.filter((m) => match(m.name, s)).forEach((m) => paintEntries.push({ mat: m, mode: cfg.paint.mode, k }));
  }
  const paintSet = new Set(paintEntries.map((e) => e.mat));
  for (const m of mats) {
    if (paintSet.has(m)) continue;
    if (matchAny(m.name, cfg.glass)) styleGlass(m);
    else if (matchAny(m.name, cfg.tires)) styleTire(m);
    else if (matchAny(m.name, cfg.rims)) styleRim(m);
    else if (matchAny(m.name, cfg.metals)) styleMetal(m);
  }
  const discMats = mats.filter((m) => matchAny(m.name, cfg.discs));
  const paint = new Paint(paintEntries, cfg.paint.ref || '#ffffff');
  paint.setFinish('gloss');
  paint.setColor(cfg.defaultColor);

  // ----- escala, orientação e centralização -----
  const rotY = cfg.rotY || 0;
  const b0 = bounds(nat, rotY);
  const s = cfg.length / (b0.max.z - b0.min.z);
  const R = new THREE.Matrix4().makeRotationY(rotY);
  const wm = wheels.map((w) => {
    const c = w.center.clone().applyMatrix4(R).multiplyScalar(s);
    return { w, x: c.x, y: c.y, z: c.z, r: w.radius * s };
  });
  const bx = (b0.max.x + b0.min.x) / 2 * s;
  let cz, ground;
  if (wm.length) {
    const fz = wm.filter((e) => e.w.front).map((e) => e.z), rz = wm.filter((e) => !e.w.front).map((e) => e.z);
    cz = fz.length && rz.length ? (avg(fz) + avg(rz)) / 2 : avg(wm.map((e) => e.z));
    ground = Math.min(...wm.map((e) => e.y - e.r));
  } else { cz = (b0.max.z + b0.min.z) / 2 * s; ground = b0.min.y * s; }
  placer.rotation.y = rotY;
  placer.scale.setScalar(s);
  placer.position.set(-bx, -ground, -cz);
  for (const e of wm) { e.w.mx = e.x - bx; e.w.mz = e.z - cz; e.w.radiusM = e.r; }

  const dims = {
    length: cfg.length,
    width: (b0.max.x - b0.min.x) * s,
    height: (b0.max.y - b0.min.y) * s,
    wheelRadius: wm.length ? avg(wm.map((e) => e.r)) : 0.34,
    wheelbase: 0, track: 0,
  };
  const fw = wm.filter((e) => e.w.front), rw = wm.filter((e) => !e.w.front);
  if (fw.length && rw.length) dims.wheelbase = Math.abs(avg(fw.map((e) => e.z)) - avg(rw.map((e) => e.z)));
  if (fw.length > 1) dims.track = Math.abs(fw[0].x - fw[1].x);

  // ----- faróis (luzes de verdade, só ligam no showroom e no carro do jogador) -----
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis); chassis.add(placer);
  const beams = [];
  for (const sx of [-1, 1]) {
    const sp = new THREE.SpotLight(0xfff0d8, 0, 34, 0.42, 0.65, 1.2);
    sp.position.set(sx * dims.width * 0.3, dims.height * 0.32, dims.length * 0.5 - 0.25);
    sp.target.position.set(sx * dims.width * 0.18, 0, dims.length * 0.5 + 12);
    chassis.add(sp, sp.target);
    beams.push(sp);
  }

  return new Car({ cfg, root, chassis, wheels, paint, dims, scale: s, headMats, tailMats, discMats, beams });
}

const avg = (a) => a.reduce((p, c) => p + c, 0) / a.length;

export class Car {
  constructor(o) {
    Object.assign(this, o);
    this.maxSteer = 0.5;
    this.headOn = false; this.braking = false;
    this.setHeadlights(false);
    this.setBrake(false);
  }
  get object() { return this.root; }
  get triangles() {
    let n = 0;
    this.root.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    return Math.round(n);
  }
  setColor(hex) { this.paint.setColor(hex); }
  setFinish(key) { this.paint.setFinish(key); }
  setHeadlights(on) {
    this.headOn = on;
    this.headMats.forEach((m) => { m.emissiveIntensity = on ? 4.5 : 0.12; });
    this.beams.forEach((b) => { b.intensity = on ? 90 : 0; });
    this._tail();
  }
  setBrake(on) { this.braking = on; this._tail(); }
  _tail() {
    const v = this.braking ? 6 : this.headOn ? 1.6 : 0.3;
    this.tailMats.forEach((m) => { m.emissiveIntensity = v; });
  }
  /** st: speed (m/s), steer (-1..1, + = esquerda), pitch/roll (rad), heat (0..1 discos de freio) */
  update(dt, st = {}) {
    const { speed = 0, steer = 0, pitch = 0, roll = 0, heat = 0, omega = null, steerAngle = null } = st;
    for (const w of this.wheels) {
      let om;
      if (omega) om = w.pair ? (omega[2] + omega[3]) / 2 : omega[w.front ? (w.left ? 0 : 1) : (w.left ? 2 : 3)];
      else om = speed / w.radiusM;
      w.angle = (w.angle + om * dt) % TAU;
      if (w.blur) { const a = Math.min(0.78, Math.max(0, (Math.abs(om) - 28) / 85)); w.blur.visible = a > 0.01; if (a > 0.01) w.blur.material.opacity = a; }
      w.spin.rotation.x = w.angle;
      if (w.steer) w.pivot.rotation.y = steerAngle != null ? steerAngle : steer * this.maxSteer;
      w.pivot.position.y = w.baseY + (w.mz * pitch - w.mx * roll) / this.scale;
    }
    this.chassis.rotation.set(pitch, 0, roll);
    if (this.discMats.length) this.discMats.forEach((m) => { m.emissive.setRGB(1, 0.22, 0.03); m.emissiveIntensity = heat * 2.2; });
  }
}
