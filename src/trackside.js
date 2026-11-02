// trackside.js — objetos ao longo da pista, todos em InstancedMesh (poucos draw calls):
//   balizas brancas, placas de curva (chevrons), placas de frenagem 150/100/50, postes de luz na reta de largada e o pórtico de largada.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HALF } from './trackBuilder.js';

const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
};
const glowTex = () => canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  r.addColorStop(0, 'rgba(255,244,214,1)'); r.addColorStop(0.25, 'rgba(255,226,160,.55)'); r.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});

export function buildTrackside(scene, track, terrain) {
  const D = new THREE.Object3D(), root = new THREE.Group(), colliders = []; scene.add(root);
  const L = track.length;
  const place = (s, lat) => { const p = track.at(s), x = p.x + p.nx * lat, z = p.z + p.nz * lat; return { p, x, z, y: terrain.heightAt(x, z) }; };
  const inst = (geo, mat, list) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length;
    list.forEach((o, i) => { D.position.set(o.x, o.y + (o.dy || 0), o.z); D.rotation.set(0, o.rot || 0, 0); D.scale.set(o.sx || 1, 1, 1); D.updateMatrix(); m.setMatrixAt(i, D.matrix); });
    m.instanceMatrix.needsUpdate = true; m.matrixAutoUpdate = false; m.computeBoundingSphere(); root.add(m); return m;
  };
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.55, metalness: 0.6 });

  // ---- balizas (a cada 30 m, dos dois lados) ----
  {
    const list = []; for (let s = 0; s < L; s += 30) for (const side of [1, -1]) list.push(place(s, side * (HALF + 2.6)));
    inst(new THREE.BoxGeometry(0.12, 1.0, 0.12).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 }), list);
    inst(new THREE.BoxGeometry(0.135, 0.2, 0.135).translate(0, 0.78, 0), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4, emissive: 0xff5a00, emissiveIntensity: 0.35 }), list);
  }

  // ---- placas de curva (chevrons) no lado de fora das curvas fechadas ----
  {
    const list = [];
    for (let s = 0; s < L; s += 14) {
      const k = track.at(s).k; if (Math.abs(k) < 1 / 95) continue;
      const o = place(s, (k > 0 ? -1 : 1) * (HALF + 3.4)); o.rot = o.p.h + Math.PI; o.sx = k > 0 ? -1 : 1; o.dy = 1.45; o.px = o.x; o.pz = o.z; list.push(o);
    }
    const tex = canvasTex(128, 160, (g, w, h) => {
      g.fillStyle = '#f2c200'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
      g.lineWidth = 16; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(w * 0.32, h * 0.2); g.lineTo(w * 0.7, h * 0.5); g.lineTo(w * 0.32, h * 0.8); g.stroke();
    });
    inst(new THREE.PlaneGeometry(0.95, 1.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide }), list);
    inst(new THREE.BoxGeometry(0.07, 1.6, 0.07).translate(0, -0.6, -0.06), metal, list.map((o) => ({ ...o, sx: 1, dy: 1.45 })));
  }

  // ---- placas de frenagem antes das curvas fortes ----
  {
    const lists = [[], [], []]; let inC = false;
    for (let s = 0; s < L; s += 2.5) {
      const k = Math.abs(track.at(s).k);
      if (!inC && k > 1 / 75) { inC = true; [150, 100, 50].forEach((d, i) => { const o = place(s - d, -(HALF + 3.6)); o.rot = o.p.h + Math.PI; o.dy = 1.3; lists[i].push(o); }); }
      else if (inC && k < 1 / 200) inC = false;
    }
    [150, 100, 50].forEach((n, i) => {
      const tex = canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c4161c'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
        g.fillStyle = '#111'; g.font = '700 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 3);
      });
      inst(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide }), lists[i]);
      inst(new THREE.BoxGeometry(0.07, 1.5, 0.07).translate(0, -0.55, -0.06), metal, lists[i].map((o) => ({ ...o, dy: 1.3 })));
    });
  }

  // ---- postes de luz na reta de largada ----
  const lamps = [], lampGlow = [];
  {
    const list = [];
    for (const s of [-120, -80, -40, 0, 40, 80, 120]) {
      const o = place(s, HALF + 4.5), dx = -o.p.nx, dz = -o.p.nz;   // aponta para a pista
      o.rot = Math.atan2(-dz, dx); list.push(o); colliders.push({ x: o.x, z: o.z, r: 0.22 });
      lamps.push({ x: o.x + dx * 2.1, y: o.y + 8.9, z: o.z + dz * 2.1, rot: o.rot });
    }
    const pole = mergeGeometries([new THREE.CylinderGeometry(0.11, 0.17, 9, 8).translate(0, 4.5, 0), new THREE.BoxGeometry(2.4, 0.12, 0.12).translate(1.1, 8.95, 0)]);
    inst(pole, metal, list);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffe6b0, emissiveIntensity: 0.05, roughness: 0.4 });
    this_lamp.mat = headMat;
    inst(new THREE.BoxGeometry(0.9, 0.14, 0.38), headMat, lamps.map((l) => ({ x: l.x, y: l.y - 0.06, z: l.z, rot: l.rot })));
    const gt = glowTex();
    for (const l of lamps) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false, opacity: 0.9 }));
      sp.position.set(l.x, l.y - 0.2, l.z); sp.scale.setScalar(7); sp.visible = false; root.add(sp); lampGlow.push(sp);
    }
  }

  // ---- pórtico de largada ----
  {
    const p = track.S[0], ox = HALF + 3.6, g = new THREE.Group(); g.position.set(p.x, terrain.heightAt(p.x, p.z), p.z); g.rotation.y = p.h;
    const pillar = new THREE.BoxGeometry(0.5, 8, 0.5).translate(0, 4, 0);
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(pillar, metal); m.position.x = sx * ox; g.add(m); colliders.push({ x: p.x + p.nx * sx * ox, z: p.z + p.nz * sx * ox, r: 0.36 }); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ox * 2 + 0.5, 1.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x20262a, roughness: 0.6, metalness: 0.3 })); beam.position.y = 7.6; g.add(beam);
    const tex = canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = '#111'; c.fillRect(0, 0, w, h);
      const n = 2, sq = h / n; for (let i = 0; i < w / sq; i++) for (let j = 0; j < n; j++) if ((i + j) % 2 === 0 && (i < 5 || i > w / sq - 6)) { c.fillStyle = '#f4f4f0'; c.fillRect(i * sq, j * sq, sq, sq); }
      c.fillStyle = '#ffb703'; c.font = '700 80px "Barlow Condensed", Arial Narrow, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LARGADA · CHEGADA', w / 2, h / 2 + 4);
    });
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(ox * 2 - 0.4, 1.3), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    ban.position.set(0, 7.6, -0.27); ban.rotation.y = Math.PI; g.add(ban); root.add(g);
  }

  return {
    colliders,
    setNight(on) { this_lamp.mat.emissiveIntensity = on ? 3.5 : 0.05; for (const s of lampGlow) s.visible = on; },
  };
}
const this_lamp = { mat: null };
