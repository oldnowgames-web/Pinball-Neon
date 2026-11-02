// venue.js — arquibancada com plateia (lado esquerdo) e boxes (lado direito) perto da largada. Tudo em InstancedMesh.
import * as THREE from 'three';
import { HALF } from './trackBuilder.js';

const SEG = 10, NSEG = 9, S0 = -50;           // 9 trechos de 10 m, de s=-50 até s=+40
const STAND_LAT = HALF + 12, PIT_LAT = -(HALF + 15);

/** círculos onde a vegetação é removida */
export function venueZones(track) {
  const z = [];
  for (let i = 0; i < NSEG; i += 2) {
    const s = S0 + (i + 0.5) * SEG;
    for (const [lat, r] of [[STAND_LAT + 7, 17], [PIT_LAT - 3, 14]]) { const p = track.at(s), x = p.x + p.nx * lat, zz = p.z + p.nz * lat; z.push({ x, z: zz, r }); }
  }
  return z;
}

export function buildVenue(scene, track, terrain, colliders) {
  const root = new THREE.Group(), D = new THREE.Object3D(); scene.add(root);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mkInst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.matrixAutoUpdate = false; m.castShadow = false; root.add(m); m.userData.i = 0; return m; };
  const put = (m, x, y, z, ry, sx, sy, sz) => { D.position.set(x, y, z); D.rotation.set(0, ry, 0); D.scale.set(sx, sy, sz); D.updateMatrix(); m.setMatrixAt(m.userData.i++, D.matrix); };
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8e9296, roughness: 0.9 }), roofM = new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.6 }), roofRed = new THREE.MeshStandardMaterial({ color: 0xb5121b, roughness: 0.6 });
  const TIERS = 4, SPEC_PER = 9;
  const steps = mkInst(box, concrete, NSEG * TIERS), roofs = mkInst(box, roofM, NSEG), roofStripe = mkInst(box, roofRed, NSEG), posts = mkInst(box, new THREE.MeshStandardMaterial({ color: 0x555a5e, roughness: 0.6, metalness: 0.5 }), NSEG);
  const bodies = mkInst(new THREE.BoxGeometry(0.4, 0.62, 0.28).translate(0, 0.31, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), NSEG * TIERS * SPEC_PER);
  const heads = mkInst(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.76, 0), new THREE.MeshStandardMaterial({ color: 0xd8a98a, roughness: 0.8 }), NSEG * TIERS * SPEC_PER);
  const pal = [0xe63946, 0x1d7dd7, 0xf4c20d, 0xffffff, 0x2a9d4a, 0xf08a24, 0x222222, 0x9b5de5], col = new THREE.Color();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let nb = 0;
  for (let i = 0; i < NSEG; i++) {
    const s = S0 + (i + 0.5) * SEG, p = track.at(s), ry = p.h, nx = p.nx, nz = p.nz, tx = Math.sin(p.h), tz = Math.cos(p.h);
    const px = (lat) => p.x + nx * lat, pz = (lat) => p.z + nz * lat, ground = terrain.heightAt(px(STAND_LAT + 5), pz(STAND_LAT + 5));
    for (let t = 0; t < TIERS; t++) {
      const lat = STAND_LAT + t * 2.2, h = 0.7 + t * 0.7, top = ground + h;
      put(steps, px(lat), ground + (h - 3) / 2, pz(lat), ry, 2.2, h + 3, SEG * 0.98);   // degrau (fundação enterrada)
      for (let k = 0; k < SPEC_PER; k++) {
        const along = (-0.5 + (k + 0.5 + (rnd() - 0.5) * 0.4) / SPEC_PER) * SEG * 0.96, x = px(lat) + tx * along, z = pz(lat) + tz * along;
        // quem está na plateia olha para a pista (-normal)
        const face = ry + Math.PI; col.setHex(pal[(rnd() * pal.length) | 0]).multiplyScalar(0.75 + rnd() * 0.4);
        put(bodies, x, top, z, face, 1, 0.9 + rnd() * 0.25, 1); bodies.setColorAt(bodies.userData.i - 1, col);
        put(heads, x, top, z, face, 1, 1, 1);
      }
    }
    const rl = STAND_LAT + 4.4, rh = ground + 6.2;
    put(roofs, px(rl), rh, pz(rl), ry, 8.6, 0.18, SEG * 0.98); put(roofStripe, px(rl - 4.4), rh + 0.02, pz(rl - 4.4), ry, 0.5, 0.2, SEG * 0.98);
    put(posts, px(STAND_LAT + 9), ground + 3, pz(STAND_LAT + 9), ry, 0.25, 6.2, 0.25);
  }
  // boxes (garagens) do lado direito
  const white = new THREE.MeshStandardMaterial({ color: 0xe9ecee, roughness: 0.8 }), door = new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.6 }), stripe = new THREE.MeshStandardMaterial({ color: 0x1456f0, roughness: 0.5 }), stripe2 = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.5 });
  const NB = NSEG, bld = mkInst(box, white, NB), doors = mkInst(box, door, NB), st1 = mkInst(box, stripe, NB), st2 = mkInst(box, stripe2, NB), roofB = mkInst(box, new THREE.MeshStandardMaterial({ color: 0x6b7278, roughness: 0.7 }), NB);
  for (let i = 0; i < NB; i++) {
    const s = S0 + (i + 0.5) * SEG, p = track.at(s), ry = p.h, g = terrain.heightAt(p.x + p.nx * PIT_LAT, p.z + p.nz * PIT_LAT), lat = PIT_LAT, depth = 7;
    put(bld, p.x + p.nx * (lat - depth / 2), g + (3.6 - 2) / 2 , p.z + p.nz * (lat - depth / 2), ry, depth, 5.6, SEG * 0.96);
    put(roofB, p.x + p.nx * (lat - depth / 2), g + 3.7, p.z + p.nz * (lat - depth / 2), ry, depth + 0.6, 0.25, SEG * 0.98);
    put(doors, p.x + p.nx * (lat + 0.02), g + 1.5, p.z + p.nz * (lat + 0.02), ry, 0.15, 3.0, SEG * 0.72);
    put(i % 2 ? st1 : st2, p.x + p.nx * (lat + 0.05), g + 3.25, p.z + p.nz * (lat + 0.05), ry, 0.2, 0.35, SEG * 0.96);
  }
  st1.count = Math.floor(NB / 2); st2.count = Math.ceil(NB / 2);
  for (const m of [steps, roofs, roofStripe, posts, bodies, heads, bld, doors, st1, st2, roofB]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
  // colisão: barreira de círculos na frente da arquibancada e dos boxes
  for (let s = S0; s <= S0 + NSEG * SEG; s += 6) {
    const p = track.at(s);
    colliders.push({ x: p.x + p.nx * (STAND_LAT - 1.2), z: p.z + p.nz * (STAND_LAT - 1.2), r: 3.2 });
    colliders.push({ x: p.x + p.nx * (PIT_LAT + 1.2), z: p.z + p.nz * (PIT_LAT + 1.2), r: 3.2 });
  }
}
