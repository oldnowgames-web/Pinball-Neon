// carfx.js — efeitos por carro: sombra suave no chão (blob) e brilho dos faróis/lanternas (sprites aditivos, sem sombra).
import * as THREE from 'three';

const tex = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
let blobT, glowT;
const blobTex = () => blobT || (blobT = tex((g) => { const r = g.createRadialGradient(64, 64, 6, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.85)'); r.addColorStop(0.55, 'rgba(0,0,0,.45)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }));
const glowTex = () => glowT || (glowT = tex((g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }));

export function makeCarFx(scene, car, d) {
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(d.width * 1.55, d.length * 1.3).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  blob.renderOrder = 1; blob.frustumCulled = false; scene.add(blob);
  // sombra de contato: núcleo escuro sob a carroceria + manchas escuras sob cada pneu (o carro deixa de "flutuar")
  const mkPatch = (w, l, x, z, op) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
    m.position.set(x, 0.012, z); m.renderOrder = 1; m.frustumCulled = false; car.object.add(m); return m;
  };
  const patches = [mkPatch(d.width * 0.82, d.length * 0.78, 0, 0, 0.42)];
  for (const w of car.wheels || []) if (w.mx != null && w.radiusM) patches.push(mkPatch(Math.max(0.22, (w.width || 0.3) * (car.scale || 1) * 1.15), w.radiusM * 2.3, w.mx, w.mz, 0.6));
  const mkSp = (x, y, z, size, color) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false, opacity: 0 }));
    s.position.set(x, y, z); s.scale.setScalar(size); car.object.add(s); return s;
  };
  const hx = d.width * 0.32, hy = d.height * 0.36, hz = d.length * 0.5 + 0.12, tx = d.width * 0.34, ty = d.height * 0.42, tz = -d.length * 0.5 - 0.1;
  // posição real das lanternas: centro dos vértices dos materiais de lanterna traseira (esquerda/direita), no espaço do carro
  const lamp = (() => {
    const root = car.object, tm = car.tailMats || [], pts = { L: [], R: [] }; if (!tm.length) return null;
    root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4(), v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const mats = [].concat(o.material), pos = o.geometry.attributes.position, idx = o.geometry.index; if (!mats.some((m) => tm.includes(m))) return;
      M.multiplyMatrices(inv, o.matrixWorld);
      const add = (i) => { v.fromBufferAttribute(pos, i).applyMatrix4(M); if (v.z > -d.length * 0.2) return; (v.x < 0 ? pts.L : pts.R).push(v.x, v.y, v.z); };
      if (!Array.isArray(o.material)) { for (let i = 0; i < pos.count; i++) add(i); }
      else for (const g of o.geometry.groups) if (tm.includes(mats[g.materialIndex])) for (let k = g.start; k < g.start + g.count; k++) add(idx ? idx.getX(k) : k);
    });
    const one = (a) => { if (a.length < 9) return null; let sx = 0, sy = 0, mz = 1e9, x0 = 1e9, x1 = -1e9, n = a.length / 3; for (let i = 0; i < a.length; i += 3) { sx += a[i]; sy += a[i + 1]; mz = Math.min(mz, a[i + 2]); x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); } return { x: sx / n, y: sy / n, z: mz - 0.05, w: x1 - x0 }; };
    const l = one(pts.L), r = one(pts.R); return l && r && l.z < -0.5 ? [l, r] : null;
  })();
  // sem material de lanterna no modelo (Aventador, Camaro): posição relativa medida no próprio carro (lanterna ≈ 24% da largura, ≈ 79% da altura, na traseira)
  const rearZ = (() => { const root = car.object; root.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(car.chassis).applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert()); return bb.min.z; })();
  const fb = [{ x: -d.width * 0.24, y: d.height * 0.79, z: rearZ - 0.04 }, { x: d.width * 0.24, y: d.height * 0.79, z: rearZ - 0.04 }];
  const tsz = lamp ? Math.min(0.75, Math.max(0.45, Math.max(lamp[0].w, lamp[1].w) * 1.1 + 0.2)) : 0.6;
  const head = [mkSp(-hx, hy, hz, 1.5, 0xfff1d0), mkSp(hx, hy, hz, 1.5, 0xfff1d0)],
    tail = (lamp || fb).map((l) => mkSp(l.x, l.y, l.z, tsz, 0xff2a1a));
  // labareda do escapamento (estouro ao tirar o pé)
  const fl = [-1, 1].map((sx) => mkSp(sx * d.width * 0.22, d.height * 0.2, -d.length * 0.5 - 0.15, 0.1, 0xff8a2a)); let flT = 0;
  return {
    blob, patches,
    flame(k = 1) { flT = 0.09 * k; },
    tick(dt) { if (flT > 0) { flT -= dt; const a = Math.max(0, flT / 0.09); for (const s of fl) { s.material.opacity = Math.min(1, a * 1.2); s.scale.setScalar(0.35 + 0.5 * (1 - a)); } } else if (fl[0].material.opacity > 0) for (const s of fl) s.material.opacity = 0; },
    update(night, braking, dist) {
      const near = dist < 140;
      for (const s of head) s.material.opacity = night && near ? 0.9 : 0;
      for (const s of tail) s.material.opacity = near ? (braking ? 0.85 : night ? 0.45 : 0) : 0;
    },
  };
}
