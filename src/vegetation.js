// vegetation.js — árvores, pinheiros, pedras, seixos e grama, usando SOMENTE os seus modelos GLB.
//
// CENÁRIO JÁ DESENHADO: nada é remontado durante o jogo. Na carga, tudo é plantado uma única vez em blocos fixos de
// InstancedMesh (matrizes estáticas). O que muda com a distância é decidido pela GPU, pixel a pixel, com transição
// "pontilhada" (dither), então nada aparece nem some de repente:
//   · árvores/pinheiros: modelo completo até `range` m; depois dissolvem para o "impostor" (2 cartões com a imagem do SEU modelo)
//   · impostores vão até `farRange` m (dissolvem na neblina)
//   · pedras até `rockRange` m, seixos até `pebbleRange` m, grama até `grassRange` m (todas dissolvem suavemente)
// Por frame, só se liga/desliga a visibilidade de blocos inteiros que a GPU já está escondendo (nenhuma matriz é reescrita).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smooth, lerp } from './noise.js';
import { HALF } from './trackBuilder.js';

const FILES = {
  tree: ['tree1', 'tree2', 'tree3', 'tree4'], pine: ['pine1', 'pine2', 'pine3', 'pine4'],
  rock: ['pedra1', 'pedra2', 'pedra3'], pebble: ['seixo1', 'seixo2'],
};
// peso de sorteio (favorece os modelos mais leves) e altura nativa aproximada (para o proxy)
const TREE_W = [1.0, 1.0, 0.6, 0.5], PINE_W = [0.6, 0.6, 1.2, 0.8];

// ---------------------------------------------------------------- planejamento (sem 3D, testável)
export function planForest(track, terrain, { density = 1, seed = 11 } = {}) {
  const R = rng(seed), n = terrain.noise, out = { trees: [], rocks: [], pebbles: [], grass: [] };
  const step = 7 / Math.sqrt(density), pick = (w) => { let t = R() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { t -= w[i]; if (t <= 0) return i; } return w.length - 1; };
  for (let z = terrain.z0; z < terrain.z0 + terrain.h; z += step) for (let x = terrain.x0; x < terrain.x0 + terrain.w; x += step) {
    const px = x + (R() - 0.5) * step * 0.95, pz = z + (R() - 0.5) * step * 0.95, d = terrain.distAt(px, pz);
    if (d < 16 || d > 480) continue;
    const forest = smooth(-0.12, 0.32, n.fbm(px / 170 + 30, pz / 170 - 12, 3)), edge = smooth(16, 50, d);
    if (R() > forest * edge * 0.95 + edge * 0.03) continue;
    if (terrain.slopeAt(px, pz) > 0.75) continue;
    const y = terrain.heightAt(px, pz);
    const pineP = smooth(-0.2, 0.25, n.fbm(px / 260 - 50, pz / 260 + 80, 2)) * 0.65 + smooth(25, 85, y) * 0.5;
    const pine = R() < pineP, v = pine ? pick(PINE_W) : pick(TREE_W);
    out.trees.push({ pine, v, x: px, y, z: pz, rot: R() * 6.283, sc: 0.8 + R() * R() * 0.9 + (pine ? 0.15 : 0), tx: (R() - 0.5) * 0.06, tz: (R() - 0.5) * 0.06, tint: [0.88 + R() * 0.24, 0.9 + R() * 0.2, 0.7 + R() * 0.3] });
  }
  const S = track.S;
  for (let i = 0; i < track.N; i += 4) for (const side of [-1, 1]) {
    if (R() < 0.55) continue;
    const o = side * (HALF + 5 + R() * 35), p = S[i], x = p.x + p.nx * o, z = p.z + p.nz * o;
    out.rocks.push({ v: (R() * 3) | 0, x, y: terrain.heightAt(x, z), z, rot: R() * 6.283, sc: 0.7 + R() * R() * 2.4, tilt: [(R() - 0.5) * 0.3, (R() - 0.5) * 0.3] });
  }
  let clusters = 0;
  for (let k = 0; k < 6000 && clusters < 260; k++) {
    const x = terrain.x0 + R() * terrain.w, z = terrain.z0 + R() * terrain.h, d = terrain.distAt(x, z);
    if (d < 28 || d > 420 || terrain.slopeAt(x, z) < 0.42) continue;
    clusters++;
    const cnt = 3 + ((R() * 4) | 0), big = 2.5 + R() * 4;
    for (let q = 0; q < cnt; q++) { const rx = x + (R() - 0.5) * big * 3, rz = z + (R() - 0.5) * big * 3;
      out.rocks.push({ v: (R() * 3) | 0, x: rx, y: terrain.heightAt(rx, rz), z: rz, rot: R() * 6.283, sc: big * (0.55 + R() * 0.7), tilt: [(R() - 0.5) * 0.5, (R() - 0.5) * 0.5] }); }
  }
  for (let i = 0; i < track.N; i++) for (const side of [-1, 1]) {
    const p = S[i];
    for (let q = 0; q < 10; q++) { const o = side * (HALF + 0.5 + R() * R() * 18), x = p.x + p.nx * o + (R() - 0.5) * 2, z = p.z + p.nz * o + (R() - 0.5) * 2;
      out.pebbles.push({ v: (R() * 2) | 0, x, y: terrain.heightAt(x, z), z, rot: R() * 6.283, sc: 0.6 + R() * 1.6 }); }
    for (let q = 0; q < 24; q++) { const o = side * (HALF + 3 + R() * 36), x = p.x + p.nx * o + (R() - 0.5) * 2.4, z = p.z + p.nz * o + (R() - 0.5) * 2.4;
      out.grass.push({ x, y: terrain.heightAt(x, z), z, rot: R() * 6.283, sc: 0.7 + R() * 0.9, tint: [0.85 + R() * 0.3, 0.9 + R() * 0.25, 0.7 + R() * 0.3] }); }
  }
  const Z = track.zones || [];
  if (Z.length) for (const k of Object.keys(out)) out[k] = out[k].filter((o) => !Z.some((q) => (o.x - q.x) * (o.x - q.x) + (o.z - q.z) * (o.z - q.z) < q.r * q.r));
  return out;
}


/**
 * Os pixels transparentes das texturas de folha são PRETOS. Ao gerar os mipmaps (objetos distantes) esse preto se mistura
 * com a folha: a copa escurece e vira "borrão". Aqui o RGB dos pixels transparentes recebe a cor média da folha
 * (o alpha continua igual), então a copa distante mantém a cor certa.
 */
function fixLeafTexture(tex) {
  const img = tex && tex.image; if (!img) return tex;
  const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h).data, out = new Uint8Array(d.length);
  let r = 0, gr = 0, b = 0, wsum = 0;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (a > 200) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; wsum++; } }
  const mr = wsum ? r / wsum : 60, mg = wsum ? gr / wsum : 90, mb = wsum ? b / wsum : 20;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3], k = a >= 200 ? 1 : a / 200;   // quanto do pixel é "folha de verdade"
    out[i] = d[i] * k + mr * (1 - k); out[i + 1] = d[i + 1] * k + mg * (1 - k); out[i + 2] = d[i + 2] * k + mb * (1 - k); out[i + 3] = a;
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = tex.colorSpace; t.flipY = false; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true;
  tex.dispose(); return t;
}

// ---------------------------------------------------------------- materiais / vento / dissolução por distância
function windPatch(mat, U, leaf) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uLeaf = { value: leaf ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind; uniform float uLeaf;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
vec3 ip = vec3(0.0);
#endif
float hh = max(transformed.y, 0.0);
float ph = ip.x * 0.11 + ip.z * 0.17;
float gust = 0.6 + 0.4 * sin(uTime * 0.23 + ip.x * 0.004);
float sw = (sin(uTime * 1.25 + ph) * 0.016 + sin(uTime * 0.6 + ph * 0.7) * 0.028) * hh * uWind * gust;
float fl = sin(uTime * 8.0 + transformed.x * 2.7 + transformed.z * 2.1 + ph) * 0.035 * uLeaf * uWind * smoothstep(1.5, 6.0, hh);
transformed.x += sw + fl; transformed.z += sw * 0.6 + fl * 0.8;`);
    if (leaf) sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
#ifdef USE_ALPHATEST
#ifdef USE_MAP
{ // com a distância o mipmap dilui o alpha das folhas; baixa o corte conforme o nível do mip para a copa não virar pontinhos
  vec2 ts = vec2(textureSize(map, 0)); vec2 gx = dFdx(vMapUv * ts), gy = dFdy(vMapUv * ts);
  float lod = 0.5 * log2(max(max(dot(gx, gx), dot(gy, gy)), 1.0));
  float cut = alphaTest * (1.0 - 0.62 * smoothstep(0.6, 4.0, lod));
  if (diffuseColor.a < cut) discard; }
#else
if (diffuseColor.a < alphaTest) discard;
#endif
#endif
`);
  };
  mat.customProgramCacheKey = () => 'wind' + (leaf ? 'L2' : 'B');
}
function grassPatch(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uGr = U.uGr;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind; uniform vec2 uGr;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
vec3 wip = (modelMatrix * vec4(ip, 1.0)).xyz;
float fade = 1.0 - smoothstep(uGr.x, uGr.y, distance(wip, cameraPosition));
float tipw = transformed.y / 0.6;
transformed.x += sin(uTime * 2.1 + ip.x * 0.6 + ip.z * 0.4) * 0.07 * tipw * tipw * uWind;
transformed.z += cos(uTime * 1.7 + ip.z * 0.5) * 0.05 * tipw * tipw * uWind;
transformed *= fade;`);
  };
  mat.customProgramCacheKey = () => 'grassWind2';
}
/**
 * Dissolve o objeto por distância com pontilhado (dither), sem pop.
 * U = { value: Vector4(a, b, c, d) }.  far=false: some entre a→b (1 - smoothstep).
 * far=true: aparece entre a→b e some entre c→d (para impostores).
 */
function distFade(mat, U, far, key) {
  const prev = mat.onBeforeCompile, pk = mat.customProgramCacheKey;
  const base = pk ? pk.call(mat) : '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.uFd = U;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFd;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 fw = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
fw = instanceMatrix * fw;
#endif
vFd = distance((modelMatrix * fw).xyz, cameraPosition); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFd; uniform vec4 uFd;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{ float k = ${far ? 'smoothstep(uFd.x, uFd.y, vFd) * (1.0 - smoothstep(uFd.z, uFd.w, vFd))' : '1.0 - smoothstep(uFd.x, uFd.y, vFd)'};
float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
if (k < dn) discard; }`);
  };
  mat.customProgramCacheKey = () => base + 'fd' + key;
}

// imagem do modelo (2 vistas, cor sem sombra) renderizada uma vez numa textura
function bakeImpostor(renderer, P) {
  const mkBasic = (m, cut) => new THREE.MeshBasicMaterial({ map: m.map, vertexColors: true, alphaTest: cut ? 0.45 : 0, side: THREE.DoubleSide });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(P.bark.geo, mkBasic(P.bark.mat, false)), new THREE.Mesh(P.leaves.geo, mkBasic(P.leaves.mat, true)));
  const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const TW = 512, TH = 768;
  let qh = size.y * 1.04, qw = qh * TW / TH; const need = Math.max(size.x, size.z) * 1.04; if (need > qw) { qw = need; qh = qw * TH / TW; }
  const cam = new THREE.OrthographicCamera(-qw / 2, qw / 2, qh / 2, -qh / 2, 0.1, 200);
  const rt = new THREE.WebGLRenderTarget(TW * 2, TH, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, samples: 4 });
  rt.scissorTest = true;
  const sc = new THREE.Scene(); sc.add(g);
  const prev = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
  renderer.setClearColor(0x4a5c1c, 0); renderer.setRenderTarget(rt);
  rt.viewport.set(0, 0, TW * 2, TH); rt.scissor.set(0, 0, TW * 2, TH); renderer.clear();
  renderer.autoClear = false;
  const views = [[0, new THREE.Vector3(ctr.x, ctr.y, ctr.z + 50)], [TW, new THREE.Vector3(ctr.x + 50, ctr.y, ctr.z)]];
  for (const [x0, pos] of views) {
    rt.viewport.set(x0, 0, TW, TH); rt.scissor.set(x0, 0, TW, TH);
    cam.position.copy(pos); cam.lookAt(ctr); cam.updateMatrixWorld(); renderer.render(sc, cam);
  }
  renderer.setRenderTarget(prev); renderer.setClearColor(prevClear, prevA); renderer.autoClear = prevAuto;
  g.traverse((o) => { if (o.material) o.material.dispose(); });
  rt.texture.anisotropy = 8;
  // dois cartões cruzados: o primeiro usa a vista de frente (u 0..0,5), o segundo a vista lateral (u 0,5..1)
  const mk = (u0, u1, rotY) => {
    const q = new THREE.PlaneGeometry(qw, qh); const uv = q.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
    q.rotateY(rotY); q.translate(ctr.x, ctr.y, ctr.z);
    const n = q.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return q;
  };
  return { tex: rt.texture, geo: mergeGeometries([mk(0, 0.5, 0), mk(0.5, 1, Math.PI / 2)]) };
}

// ---------------------------------------------------------------- classe principal
const NEAR_CELL = 128, FAR_CELL = 320, ROCK_CELL = 128, PEB_CELL = 64, GRASS_CELL = 64;

export class Vegetation {
  constructor(scene, terrain, track) {
    this.scene = scene; this.terrain = terrain; this.track = track;
    this.U = { uTime: { value: 0 }, uWind: { value: 1 }, uGr: { value: new THREE.Vector2(26, 46) } };
    this.root = new THREE.Group(); this.root.name = 'vegetation'; scene.add(this.root);
    // alcances (m)
    this.range = 400; this.shadowRange = 75; this.farRange = 600; this.rockRange = 600; this.pebbleRange = 120; this.grassRange = 90;
    this.grassOn = true; this.stats = {}; this._last = { x: 1e9, z: 1e9, yaw: 0, t: -1 };   // _last: só por compatibilidade
    // uniformes de dissolução (compartilhados)
    this.F = { tree: { value: new THREE.Vector4() }, imp: { value: new THREE.Vector4() }, rock: { value: new THREE.Vector4() }, peb: { value: new THREE.Vector4() } };
    this.blocks = [];
  }

  async load(baseUrl = 'assets/nature/', renderer = null) {
    const L = new GLTFLoader(), get = (f) => L.loadAsync(baseUrl + f + '.glb');
    const names = [...FILES.tree, ...FILES.pine, ...FILES.rock, ...FILES.pebble], g = await Promise.all(names.map(get));
    const G = Object.fromEntries(names.map((n, i) => [n, g[i]]));
    const parts = (gl) => { const o = {}; gl.scene.updateMatrixWorld(true); gl.scene.traverse((m) => { if (!m.isMesh) return; const geo = m.geometry.clone().applyMatrix4(m.matrixWorld), mt = m.material; if (/^Bark/.test(mt.name)) o.bark = { geo, mat: mt }; else if (/^Leaves/.test(mt.name)) o.leaves = { geo, mat: mt }; else o.solid = { geo, mat: mt }; }); return o; };
    this.P = Object.fromEntries(names.map((n) => [n, parts(G[n])]));
    // as texturas dos outros arquivos são iguais às do primeiro: libera a memória delas
    const keep = new Set([this.P.tree1.bark.mat, this.P.tree1.leaves.mat, this.P.pine1.leaves.mat, this.P.pedra1.solid.mat, this.P.seixo1.solid.mat]);
    for (const n of names) for (const k of ['bark', 'leaves', 'solid']) { const e = this.P[n][k]; if (!e || keep.has(e.mat)) continue;
      for (const t of [e.mat.map, e.mat.normalMap]) if (t) { t.dispose(); if (t.source && t.source.data && t.source.data.close) try { t.source.data.close(); } catch {} } }
    const U = this.U;
    this.P.tree1.leaves.mat.map = fixLeafTexture(this.P.tree1.leaves.mat.map);
    this.P.pine1.leaves.mat.map = fixLeafTexture(this.P.pine1.leaves.mat.map);
    const bark = this.P.tree1.bark.mat; bark.roughness = 0.92; bark.metalness = 0; bark.envMapIntensity = 0.5; windPatch(bark, U, false);
    const mkLeaf = (m) => { m.transparent = false; m.depthWrite = true; m.alphaTest = 0.45; m.alphaToCoverage = true; m.side = THREE.DoubleSide; m.roughness = 0.78; m.metalness = 0; m.envMapIntensity = 0.7; windPatch(m, U, true); return m; };
    this.mat = { bark, leafTree: mkLeaf(this.P.tree1.leaves.mat), leafPine: mkLeaf(this.P.pine1.leaves.mat), rock: this.P.pedra1.solid.mat, pebble: this.P.seixo1.solid.mat };
    for (const k of ['rock', 'pebble']) { const m = this.mat[k]; m.metalness = 0; m.roughness = 0.88; m.envMapIntensity = 0.6; }
    for (const m of Object.values(this.mat)) for (const t of [m.map, m.normalMap]) if (t) t.anisotropy = 8;
    // impostores gerados a partir dos seus próprios modelos (nenhuma árvore desenhada em código)
    this.imp = [];
    const treeKey = (v) => (v < 4 ? 'tree' : 'pine') + ((v % 4) + 1);
    this.treeKey = treeKey;
    for (let v = 0; v < 8; v++) {
      const P = this.P[treeKey(v)];
      if (renderer) { const b = bakeImpostor(renderer, { bark: { geo: P.bark.geo, mat: this.mat.bark }, leaves: { geo: P.leaves.geo, mat: v < 4 ? this.mat.leafTree : this.mat.leafPine } });
        const m = new THREE.MeshLambertMaterial({ map: b.tex, emissive: 0xffffff, emissiveMap: b.tex, emissiveIntensity: 0.5, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide }); this.imp.push({ geo: b.geo, mat: m }); }
      else this.imp.push(null);
    }
    // grama (cartões com textura de folhas)
    const bt = (await import('./textures.js')).bladeTexture();
    const bw = 0.9, bh = 0.6, planes = [0, 1, 2].map((i) => new THREE.PlaneGeometry(bw, bh).translate(0, bh / 2, 0).rotateY(i * Math.PI / 3));
    const gg = mergeGeometries(planes); const nrm = gg.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    this.grassGeo = gg;
    this.grassMat = new THREE.MeshStandardMaterial({ map: bt, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.5 });
    grassPatch(this.grassMat, U);
    // dissolução por distância (depois do vento, que já está nos materiais)
    for (const m of [this.mat.bark, this.mat.leafTree, this.mat.leafPine]) distFade(m, this.F.tree, false, 'T');
    for (const i of this.imp) if (i) distFade(i.mat, this.F.imp, true, 'I');
    distFade(this.mat.rock, this.F.rock, false, 'R');
    distFade(this.mat.pebble, this.F.peb, false, 'P');
    this._ranges();
    return this;
  }

  /** atualiza os uniformes de dissolução a partir dos alcances */
  _ranges() {
    const R = this.range, F = this.F;
    F.tree.value.set(R - 30, R, 0, 0);
    F.imp.value.set(R - 34, R - 6, this.farRange - 50, this.farRange);
    F.rock.value.set(this.rockRange - 45, this.rockRange, 0, 0);
    F.peb.value.set(this.pebbleRange - 9, this.pebbleRange, 0, 0);
    this.U.uGr.value.set(this.grassRange * 0.57, Math.max(this.grassRange, 1));
  }

  _clear() {
    for (const b of this.blocks) for (const e of b.items) { this.root.remove(e.mesh); e.mesh.dispose(); }
    this.blocks = [];
  }

  // ---------- plantio único: blocos fixos de InstancedMesh ----------
  build({ density = 1 } = {}) {
    this._clear();
    const plan = this.plan = planForest(this.track, this.terrain, { density });
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
    const pack = (list, fn, withC) => {
      const n = list.length, m = new Float32Array(n * 16), c = withC ? new Float32Array(n * 3) : null;
      list.forEach((r, i) => { fn(r); M.toArray(m, i * 16); if (c) { c[i * 3] = r.tint[0]; c[i * 3 + 1] = r.tint[1]; c[i * 3 + 2] = r.tint[2]; } });
      return { n, m, c };
    };
    const place = (r, dy = 0, tilt = null, k = 1) => { E.set(tilt ? tilt[0] : r.tx || 0, r.rot, tilt ? tilt[1] : r.tz || 0, 'YXZ'); Q.setFromEuler(E); M.compose(V.set(r.x, r.y + dy, r.z), Q, S.setScalar(r.sc * k)); };
    const D = {
      trees: pack(plan.trees, (r) => place(r), true), rocks: pack(plan.rocks, (r) => { place(r, -0.28 * r.sc, r.tilt); S.y *= 0.9; M.compose(V, Q, S); }, false),
      pebbles: pack(plan.pebbles, (r) => place(r, -0.01, [0, 0]), false), grass: pack(plan.grass, (r) => place(r, 0, [0, 0]), true),
    };
    // agrupa índices por bloco (e por variante)
    const chunk = (list, cell, variant) => {
      const map = new Map();
      list.forEach((r, i) => { const ix = Math.floor(r.x / cell), iz = Math.floor(r.z / cell), k = ix + ',' + iz;
        let c = map.get(k); if (!c) map.set(k, c = { ix, iz, by: new Map() });
        const v = variant ? variant(r) : 0; let a = c.by.get(v); if (!a) c.by.set(v, a = []); a.push(i); });
      return map;
    };
    const mk = (geo, mat, ids, src, withC, cast) => {
      const n = ids.length, m = new THREE.InstancedMesh(geo, mat, n), a = m.instanceMatrix.array;
      for (let k = 0; k < n; k++) { const s = ids[k] * 16, o = k * 16; for (let j = 0; j < 16; j++) a[o + j] = src.m[s + j]; }
      if (withC && src.c) { const c = new Float32Array(n * 3); for (let k = 0; k < n; k++) { const s = ids[k] * 3; c[k * 3] = src.c[s]; c[k * 3 + 1] = src.c[s + 1]; c[k * 3 + 2] = src.c[s + 2]; } m.instanceColor = new THREE.InstancedBufferAttribute(c, 3); }
      m.instanceMatrix.setUsage(THREE.StaticDrawUsage); m.instanceMatrix.needsUpdate = true;
      m.castShadow = cast; m.receiveShadow = true; m.matrixAutoUpdate = false; m.computeBoundingSphere();
      this.root.add(m); return m;
    };
    const add = (map, cell, kind, make) => {
      for (const c of map.values()) {
        const b = { kind, x0: c.ix * cell, x1: (c.ix + 1) * cell, z0: c.iz * cell, z1: (c.iz + 1) * cell, items: [], shown: null, cast: null };
        for (const [v, ids] of c.by) for (const mesh of make(v, ids)) b.items.push({ mesh });
        if (b.items.length) this.blocks.push(b);
      }
    };
    const tv = (t) => this.variant_(t);
    // árvores completas (blocos de 128 m)
    add(chunk(plan.trees, NEAR_CELL, tv), NEAR_CELL, 'near', (v, ids) => {
      const P = this.P[this.treeKey(v)], leaf = v < 4 ? this.mat.leafTree : this.mat.leafPine;
      return [mk(P.bark.geo, this.mat.bark, ids, D.trees, false, true), mk(P.leaves.geo, leaf, ids, D.trees, true, true)];
    });
    // impostores (blocos de 320 m)
    add(chunk(plan.trees, FAR_CELL, tv), FAR_CELL, 'far', (v, ids) => (this.imp[v] ? [mk(this.imp[v].geo, this.imp[v].mat, ids, D.trees, true, false)] : []));
    add(chunk(plan.rocks, ROCK_CELL, (r) => r.v), ROCK_CELL, 'rock', (v, ids) => [mk(this.P[FILES.rock[v]].solid.geo, this.mat.rock, ids, D.rocks, false, true)]);
    add(chunk(plan.pebbles, PEB_CELL, (r) => r.v), PEB_CELL, 'pebble', (v, ids) => [mk(this.P[FILES.pebble[v]].solid.geo, this.mat.pebble, ids, D.pebbles, false, false)]);
    add(chunk(plan.grass, GRASS_CELL, () => 0), GRASS_CELL, 'grass', (v, ids) => [mk(this.grassGeo, this.grassMat, ids, D.grass, true, false)]);
    this._last.t = -1; this._vis = null;
    this.stats = { trees: plan.trees.length, rocks: plan.rocks.length, pebbles: plan.pebbles.length, grass: plan.grass.length, cells: this.blocks.length };
  }
  variant_(t) { return (t.pine ? 4 : 0) + t.v; }

  /** deixa tudo "visível" por um instante e envia texturas/shaders para a placa de vídeo; devolve a função que restaura */
  warmup(renderer) {
    const saved = [];
    for (const b of this.blocks) for (const e of b.items) { const m = e.mesh; saved.push([m, m.visible, m.frustumCulled]); m.visible = true; m.frustumCulled = false; }
    const tex = new Set();
    for (const m of [...Object.values(this.mat), this.grassMat, ...this.imp.filter(Boolean).map((i) => i.mat)]) for (const t of [m.map, m.normalMap]) if (t) tex.add(t);
    if (renderer.initTexture) for (const t of tex) renderer.initTexture(t);
    return () => { for (const [m, v, f] of saved) { m.visible = v; m.frustumCulled = f; } this._vis = null; };
  }

  setWet(w) {
    for (const m of [this.mat.bark, this.mat.leafTree, this.mat.leafPine, this.mat.rock]) { m.color.setScalar(1 - 0.3 * w); m.roughness = lerp(0.9, 0.55, w); }
    for (const i of this.imp) if (i) i.mat.color.setScalar(1 - 0.25 * w);
  }

  /** a cada frame: vento + liga/desliga blocos inteiros que a GPU já está escondendo (não reescreve nada) */
  update(cam, time, wind = 1) {
    this.U.uTime.value = time; this.U.uWind.value = wind;
    this._ranges();
    const p = cam.position || cam, px = p.x, pz = p.z;
    const R = this.range, SR = this.shadowRange, FR = this.farRange, RR = this.rockRange, PR = this.pebbleRange, GR = this.grassRange, gOn = this.grassOn;
    for (const b of this.blocks) {
      const dx = Math.max(b.x0 - px, 0, px - b.x1), dz = Math.max(b.z0 - pz, 0, pz - b.z1), dmin = Math.hypot(dx, dz);
      let show = true, cast = false;
      switch (b.kind) {
        case 'near': show = dmin < R + 2; cast = dmin < SR; break;
        case 'far': { const fx = Math.max(Math.abs(px - b.x0), Math.abs(px - b.x1)), fz = Math.max(Math.abs(pz - b.z0), Math.abs(pz - b.z1)); show = Math.hypot(fx, fz) > R - 36 && dmin < FR; break; }
        case 'rock': show = dmin < RR; cast = dmin < SR; break;
        case 'pebble': show = dmin < PR; break;
        case 'grass': show = gOn && dmin < GR; break;
      }
      if (b.shown !== show) { b.shown = show; for (const e of b.items) e.mesh.visible = show; }
      if (b.kind === 'near' || b.kind === 'rock') if (b.cast !== cast) { b.cast = cast; for (const e of b.items) e.mesh.castShadow = cast; }
    }
  }
}
