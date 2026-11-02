// sceneMain.js — cenário de teste: pista + terreno + floresta + clima, com o carro da garagem dando voltas sozinho.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Track } from './trackBuilder.js';
import { Terrain } from './terrain.js';
import { Vegetation } from './vegetation.js';
import { SkyWeather, PRESETS } from './skyWeather.js';
import * as TX from './textures.js';
import { CAR_LIST } from './carData.js';
import { loadGLB, buildCar } from './carModel.js';
import { lerp, clamp } from './noise.js';

const $ = (id) => document.getElementById(id);
addEventListener('error', (e) => { $('loadText').innerHTML = 'Erro: ' + e.message; $('loading').classList.remove('done'); });
addEventListener('unhandledrejection', (e) => { $('loadText').innerHTML = 'Erro: ' + (e.reason && e.reason.message || e.reason); });
const say = (t) => { $('loadText').textContent = t; return new Promise((r) => setTimeout(r, 30)); };

if (location.protocol === 'file:') {
  $('loadText').innerHTML = 'Abra por um servidor local: na pasta do projeto rode <code>python -m http.server 8000</code> e acesse http://localhost:8000/scene.html';
  throw new Error('Abra por um servidor local');
}

// ---------- renderizador ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.25, 6000);
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), 0.1, 0.35, 1.5));
composer.addPass(new OutputPass());
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true; orbit.enablePan = false; orbit.minDistance = 4; orbit.maxDistance = 60; orbit.enabled = false;

// ---------- mundo ----------
await say('Traçando a pista…');
const track = new Track();
await say('Gerando o terreno…');
const terrain = new Terrain(track);
const sw = new SkyWeather(scene, renderer, camera);
await say('Carregando árvores e pedras…');
const veg = new Vegetation(scene, terrain, track);
await veg.load('assets/nature/', renderer);
await say('Montando o cenário…');

const tex = { grass: TX.grassTexture(), dirt: TX.dirtTexture(), gravel: TX.gravelTexture(), noise: TX.noiseTexture(), rock: veg.mat.rock.map };
for (const t of Object.values(tex)) t.anisotropy = 8;
scene.add(terrain.mesh(tex));
const asphalt = TX.asphaltTexture();
const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, bumpMap: asphalt, bumpScale: 0.6, roughness: 0.9, metalness: 0, envMapIntensity: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
scene.add(track.roadMesh(roadMat));
scene.add(track.kerbMesh(new THREE.MeshStandardMaterial({ map: TX.kerbTexture(), roughness: 0.6, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
scene.add(track.startLine(new THREE.MeshStandardMaterial({ map: TX.checkerTexture(), roughness: 0.7 })));

// ---------- carro (o mesmo escolhido na garagem) ----------
await say('Carregando o carro…');
const saved = (() => { try { return JSON.parse(localStorage.getItem('garage_v1')) || {}; } catch { return {}; } })();
const cfg = CAR_LIST.find((c) => c.id === saved.car) || CAR_LIST[0];
const car = buildCar(await loadGLB(cfg.file, renderer), cfg);
car.setColor((saved.colors || {})[cfg.id] || cfg.defaultColor); car.setFinish((saved.finishes || {})[cfg.id] || 'gloss');
scene.add(car.object);

// ---------- piloto automático (só para passear pelo cenário) ----------
const A = { s: 0, v: 20, lat: 0, ax: 0, steer: 0, pitch: 0, roll: 0, heat: 0, pos: new THREE.Vector3(), h: 0 };
function drive(dt) {
  // velocidade alvo: respeita as curvas à frente (frenagem antecipada)
  let target = 78;
  for (let j = 0; j < 90; j += 2) {
    const p = track.at(A.s + j * track.ds * 1.5), vc = Math.min(78, Math.sqrt(12 / Math.max(Math.abs(p.k), 1e-4)));
    target = Math.min(target, Math.sqrt(vc * vc + 2 * 8 * j * track.ds * 1.5));
  }
  const prev = A.v;
  A.v += clamp(target - A.v, -9 * dt, 6 * dt);
  A.ax += ((A.v - prev) / dt - A.ax) * Math.min(1, dt * 6);
  A.s += A.v * dt;
  const p = track.at(A.s);
  const wantLat = clamp(p.k * 170, -3.6, 3.6);    // pega a parte de dentro da curva
  A.lat += (wantLat - A.lat) * Math.min(1, dt * 1.2);
  const x = p.x + p.nx * A.lat, z = p.z + p.nz * A.lat, y = p.y + 0.09;
  const wb = car.dims.wheelbase || 2.6;
  A.steer += (clamp(Math.atan(p.k * wb) / car.maxSteer, -1, 1) - A.steer) * Math.min(1, dt * 8);
  const ay = A.v * A.v * p.k;
  A.pitch += (clamp(A.ax * 0.0035, -0.03, 0.05) - A.pitch) * Math.min(1, dt * 5);
  A.roll += (clamp(ay * 0.0026, -0.06, 0.06) - A.roll) * Math.min(1, dt * 5);
  A.heat += ((A.ax < -4 ? 1 : 0) - A.heat) * Math.min(1, dt * (A.ax < -4 ? 1.2 : 0.35));
  A.pos.set(x, y, z); A.h = p.h;
  car.object.position.set(x, y, z);
  car.object.rotation.set(-Math.atan(p.slope), p.h, 0, 'YXZ');
  car.setBrake(A.ax < -3);
  car.update(dt, { speed: A.v, steer: A.steer, pitch: A.pitch, roll: A.roll, heat: A.heat });
}

// ---------- câmeras ----------
const CAMS = ['Perseguição', 'Capô', 'Livre', 'Drone'];
let camMode = 0; const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
function updateCamera(dt, t) {
  fwd.set(Math.sin(A.h), 0, Math.cos(A.h));
  if (camMode === 0) {
    tmp.copy(A.pos).addScaledVector(fwd, -7.2); tmp.y = A.pos.y + 2.5;
    camPos.lerp(tmp, 1 - Math.exp(-dt * 6));
    camLook.copy(A.pos).addScaledVector(fwd, 6); camLook.y = A.pos.y + 1.0;
    camera.fov += (62 + clamp(A.v - 20, 0, 60) * 0.18 - camera.fov) * Math.min(1, dt * 3);
  } else if (camMode === 1) {
    tmp.set(0, car.dims.height * 0.72, car.dims.length * 0.1); car.object.localToWorld(tmp);
    camPos.copy(tmp); camLook.copy(A.pos).addScaledVector(fwd, 30); camLook.y = A.pos.y + car.dims.height * 0.55;
    camera.fov += (74 + clamp(A.v - 20, 0, 60) * 0.2 - camera.fov) * Math.min(1, dt * 3);
  } else if (camMode === 3) {
    const a = t * 0.12;
    tmp.set(A.pos.x + Math.cos(a) * 55, A.pos.y + 38, A.pos.z + Math.sin(a) * 55);
    camPos.lerp(tmp, 1 - Math.exp(-dt * 2)); camLook.lerp(A.pos, 1 - Math.exp(-dt * 6)); camera.fov += (48 - camera.fov) * Math.min(1, dt * 3);
  }
  if (camMode === 2) { orbit.target.lerp(tmp.copy(A.pos).setY(A.pos.y + 1), 1 - Math.exp(-dt * 8)); orbit.update(); camera.fov += (55 - camera.fov) * Math.min(1, dt * 3); }
  else { camera.position.copy(camPos); camera.lookAt(camLook); }
  // não deixa a câmera entrar no chão
  const gy = terrain.heightAt(camera.position.x, camera.position.z) + 1.0;
  if (camera.position.y < gy && camMode !== 1) camera.position.y = gy;
  camera.updateProjectionMatrix();
}
function setCam(i) {
  camMode = i; orbit.enabled = i === 2;
  document.querySelectorAll('#sCam .fin').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  camPos.copy(camera.position);
  if (i === 2) { orbit.target.copy(A.pos); camera.position.copy(A.pos).add(tmp.set(-8, 4, -8)); }
}

// ---------- interface ----------
const mk = (parent, cls, text, fn) => { const b = document.createElement('button'); b.className = cls; b.textContent = text; b.onclick = fn; $(parent).appendChild(b); return b; };
Object.entries(PRESETS).forEach(([k, p], i) => mk('sPreset', 'fin', p.label, () => setPreset(k)).dataset.k = k);
CAMS.forEach((c, i) => mk('sCam', 'fin', c, () => setCam(i)));
[['Baixa', 0.55], ['Média', 1], ['Alta', 1.6]].forEach(([l, d]) => mk('sDens', 'fin', l, () => setDensity(d)).dataset.d = d);
function setPreset(k) {
  sw.setPreset(k);
  document.querySelectorAll('#sPreset .fin').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
}
let density = 1;
function setDensity(d) {
  density = d; veg.build({ density: d }); veg.setWet(sw.wet); veg.update(camera, 0, sw.wind);
  document.querySelectorAll('#sDens .fin').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.d === d)));
}
const setRain = (on) => { sw.setRain(on); $('tRain').setAttribute('aria-pressed', String(on)); };
$('tRain').onclick = () => setRain(sw.rainTarget < 0.5);
$('rWind').oninput = (e) => { sw.wind = +e.target.value; };
$('rRange').oninput = (e) => { veg.range = +e.target.value; $('vRange').textContent = e.target.value + ' m'; veg._last.t = -1; };
$('tGrass').onclick = (e) => { veg.grassOn = !veg.grassOn; e.currentTarget.setAttribute('aria-pressed', String(veg.grassOn)); };
$('tShadow').onclick = (e) => { const on = !sw.sun.castShadow; sw.sun.castShadow = on; renderer.shadowMap.needsUpdate = true; e.currentTarget.setAttribute('aria-pressed', String(on)); scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); }); };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyC') setCam((camMode + 1) % CAMS.length);
  else if (e.code === 'KeyR') setRain(sw.rainTarget < 0.5);
  else if (e.code === 'KeyF') $('stats').hidden = !$('stats').hidden;
  else if (/^Digit[1-4]$/.test(e.code)) setPreset(Object.keys(PRESETS)[+e.code.slice(5) - 1]);
});
setPreset('manha'); setCam(0); setDensity(1);

// ---------- laço ----------
const roadWetLast = { v: -1 };
let last = performance.now(), time = 0, fps = 60;
A.s = 0; drive(0.016); camPos.copy(A.pos).addScaledVector(fwd.set(Math.sin(A.h), 0, Math.cos(A.h)), -7.2).setY(A.pos.y + 2.5);
$('loading').classList.add('done');
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  drive(dt);
  updateCamera(dt, time);
  sw.update(dt, time); sw.follow(A.pos);
  const night = sw.preset === 'por' || sw.preset === 'nublado' || sw.rain > 0.3;
  if (car.headOn !== night) car.setHeadlights(night);
  const w = sw.wet;
  if (Math.abs(w - roadWetLast.v) > 0.01) {
    roadWetLast.v = w; roadMat.roughness = lerp(0.88, 0.3, w); roadMat.color.setScalar(lerp(1, 0.6, w)); roadMat.envMapIntensity = lerp(0.45, 0.95, w);
    terrain.uniforms.uWet.value = w; veg.setWet(w);
  }
  veg.update(camera, time, sw.wind);
  composer.render(dt);
  $('kmh').textContent = Math.round(A.v * 3.6);
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;
  if (!$('stats').hidden) {
    const i = renderer.info;
    $('stats').innerHTML = `${fps.toFixed(0)} fps<br>${i.render.calls} draw calls<br>${i.render.triangles.toLocaleString('pt-BR')} triângulos<br>` +
      `${veg.stats.trees.toLocaleString('pt-BR')} árvores · ${veg.stats.rocks} pedras · ${veg.stats.grass.toLocaleString('pt-BR')} tufos<br>pista ${(track.length / 1000).toFixed(2)} km`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
