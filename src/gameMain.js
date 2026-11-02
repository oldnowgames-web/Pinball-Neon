// gameMain.js — o jogo: corrida com física, bots, voltas, câmeras, HUD e som.
//   game.html?laps=3&dif=1&clima=manha|meio|por|nublado&chuva=1&dens=1
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld } from './worldBuilder.js';
import { PRESETS } from './skyWeather.js';
import { CAR_LIST } from './carData.js';
import { loadGLB, buildCar } from './carModel.js';
import { COLORS, FINISHES } from './paint.js';
import { WorldPhysics, Racer, Race } from './race.js';
import { Driver } from './ai.js';
import { Input } from './input.js';
import { CarAudio } from './audio.js';
import { Smoke } from './smoke.js';
import { Hud, fmt } from './hud.js';
import { rng, clamp } from './noise.js';
import { makePost, makeFinal } from './postfx.js';
import { Skid } from './skid.js';
import { makeCarFx } from './carfx.js';
import { Mirror } from './mirror.js';
import { applyCornerAssist } from './assist.js';
import { snapPrev, blendPose, restorePose } from './interp.js';
import { S, t, applyI18n } from './settings.js';
import { TRACKS } from './trackBuilder.js';
import { loadChamp, newChamp, addRaceResult } from './championship.js';
import { recKey, getRec, saveRec, GhostRecorder, GhostPlayer } from './ghost.js';
import { openOptions, optionsOpen } from './optionsUI.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FX } from './fxShared.js';
import { Burst } from './particles.js';
import { Reflect } from './reflect.js';
import { Cinema } from './cinema.js';
import { AiAudio } from './aiaudio.js';

const $ = (id) => document.getElementById(id);
addEventListener('error', (e) => { $('loadText').innerHTML = 'Erro: ' + e.message; $('loading').classList.remove('done'); });
addEventListener('unhandledrejection', (e) => { $('loadText').innerHTML = 'Erro: ' + ((e.reason && e.reason.message) || e.reason); $('loading').classList.remove('done'); });
const say = (t) => { $('loadText').textContent = t; return new Promise((r) => setTimeout(r, 30)); };
if (location.protocol === 'file:') {
  $('loadText').innerHTML = 'Abra por um servidor local: na pasta do projeto rode <code>python -m http.server 8000</code> e acesse http://localhost:8000/game.html';
  throw new Error('Abra por um servidor local');
}
const Q = new URLSearchParams(location.search), DENS = clamp(+Q.get('dens') || 1, 0.4, 2);
applyI18n();
const FXQ = Q.get('fx') !== '0', fxOn = () => FXQ && S.fx !== false;   // efeitos extras de realismo (Opções ou ?fx=0)
const MODE = ['race', 'tt', 'champ'].includes(Q.get('modo')) ? Q.get('modo') : 'race';
let champ = null;
if (MODE === 'champ') { champ = loadChamp(); if (!champ || champ.round >= champ.rounds.length) champ = newChamp({ laps: clamp(+Q.get('laps') || 3, 1, 20), dif: clamp(+Q.get('dif') || 1, 0.85, 1.1) }); }
const LAPS = champ ? champ.laps : clamp(+Q.get('laps') || 3, 1, 20), DIF = champ ? clamp(champ.dif, 0.85, 1.1) : clamp(+Q.get('dif') || 1, 0.85, 1.1);
const TRACK_ID = champ ? champ.rounds[champ.round] : (TRACKS.some((x) => x.id === Q.get('pista')) ? Q.get('pista') : 't1'), REV = champ ? false : Q.get('rev') === '1';
const TRACK_NAME = (TRACKS.find((x) => x.id === TRACK_ID) || TRACKS[0]).name;
const STEP = 1 / 240;

// ---------- renderizador ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const MAXR = Math.min(devicePixelRatio || 1, 1.5);
let ratio = MAXR;
renderer.setPixelRatio(ratio);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.25, 6000);
scene.add(camera);
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.1, 0.35, 1.5); composer.addPass(bloom);
bloom.setSize = function (w, h) { UnrealBloomPass.prototype.setSize.call(this, Math.max(2, w >> 1), Math.max(2, h >> 1)); };   // brilho em meia resolução (bem mais leve, mesmo visual)
const post = makePost(); composer.addPass(post.pass);
composer.addPass(new OutputPass());
let smaa = null; try { smaa = new SMAAPass(innerWidth, innerHeight); composer.addPass(smaa); } catch (e) { console.warn('smaa', e); }
const fin = makeFinal(); composer.addPass(fin.pass);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- mundo ----------
const W = await buildWorld({ scene, renderer, camera, say, density: DENS, trackId: TRACK_ID, reverse: REV });
const { track, terrain, veg, sw } = W;
const physics = new WorldPhysics(track, terrain, veg.plan);
for (const c of W.side.colliders) physics.addObstacle(c.x, c.z, c.r);
const smoke = new Smoke(scene), skid = new Skid(scene);

// ---------- carros e corredores ----------
await say('Carregando os carros…');
const saved = (() => { try { return JSON.parse(localStorage.getItem('garage_v1')) || {}; } catch { return {}; } })();
const playerCfg = CAR_LIST.find((c) => c.id === saved.car) || CAR_LIST[0];
const cfgs = MODE === 'tt' ? [playerCfg] : [playerCfg, ...CAR_LIST.filter((c) => c !== playerCfg)];
const NAMES = ['Você', 'Rafa', 'Duda', 'Léo', 'Bia', 'Caio'], SKILL = [0, 0.95, 0.97, 0.92, 0.94, 0.9];
const STYLE = [null, { aggr: 0.9, err: 1.3 }, { aggr: 0.15, err: 0.5 }, { aggr: 0.5, err: 1 }, { aggr: 0.8, err: 0.9 }, { aggr: 0.4, err: 1.8 }];
const R = rng(Date.now() & 0xffff), finishKeys = Object.keys(FINISHES);
const usedColors = new Set();
// LOD dos carros: de longe, sem sombra e sem as peças pequenas
function lodParts(car) {
  const list = [], v = new THREE.Vector3(); car.object.updateMatrixWorld(true);
  car.object.traverse((o) => { if (!o.isMesh) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.getWorldScale(v); list.push([o, o.geometry.boundingSphere.radius * Math.max(v.x, v.y, v.z)]); });
  return list;
}
function applyLod(rc, level) {
  if (rc.vis.lod === level) return; rc.vis.lod = level;
  for (const [o, r] of rc.vis.parts) { o.castShadow = level === 0; o.visible = level === 0 || r >= 0.15; }
}
const racers = [];
for (let i = 0; i < cfgs.length; i++) {
  const cfg = cfgs[i];
  await say(`Carregando os carros… ${i + 1}/${cfgs.length}`);
  const car = buildCar(await loadGLB(cfg.file, renderer), cfg);
  let hex;
  if (i === 0) { hex = (saved.colors || {})[cfg.id] || cfg.defaultColor; car.setFinish((saved.finishes || {})[cfg.id] || 'gloss'); }
  else { let c; do { c = COLORS[(R() * COLORS.length) | 0].hex; } while (usedColors.has(c)); hex = c; car.setFinish(finishKeys[(R() * finishKeys.length) | 0]); }
  usedColors.add(hex); car.setColor(hex);
  if (i > 0) { for (const b of car.beams) { b.parent && b.parent.remove(b); b.target.parent && b.target.parent.remove(b.target); } car.beams = []; }   // só o carro do jogador tem luz de farol de verdade (menos luzes = shaders mais leves)
  scene.add(car.object);
  const d = car.dims, dims = { length: d.length, width: d.width, wheelbase: d.wheelbase || 2.7, track: d.track || 1.6, wheelRadius: d.wheelRadius || 0.34 };
  const rc = new Racer({ name: NAMES[i], specId: cfg.id, dims, driver: i === 0 ? null : new Driver(clamp(SKILL[i] * DIF, 0.8, 1.02), 100 + i * 17, STYLE[i]), isPlayer: i === 0, color: hex });
  rc.car = car; rc.vis = { pitch: 0, roll: 0, y: 0, init: false, heat: 0, lod: -1, parts: lodParts(car) };
  rc.fx = makeCarFx(scene, car, d); rc.sk = i; rc.vis.sp = 0; rc.vis.rl = 0;
  racers.push(rc);
}
const race = new Race(physics, racers, { laps: LAPS, playerSlot: 3 });
const player = race.player, pv = player.veh;
const hud = new Hud(track, LAPS), input = new Input(), audio = new CarAudio();
audio.setProfile(playerCfg.id);
const sparks = new Burst(scene, { N: 260, additive: true, gravity: 6 }), debris = new Burst(scene, { N: 420, additive: false, gravity: 9.8 });
const aiAudio = new AiAudio(audio, racers, player);
const cinema = new Cinema(renderer.domElement, $('hudbox'));
let reflect = null; try { reflect = new Reflect(renderer, scene, player.car); } catch (e) { console.warn('reflect', e); }
const _tf = new THREE.Vector3(), _sunC = new THREE.Color(), _rp = new THREE.Vector3(), _s = new Float32Array(18), _rs = new Float32Array(18);
let prevHead = 0, yawRate = 0, cinEsc = false, wasAct = false, savedMute = false;
// poeira acumulada na lataria: um brilho marrom (sheen) que cresce ao andar fora da pista e a chuva lava
for (const e of player.car.paint.entries) { const m = e.mat; if (m.sheenColor) { m.sheenColor.set(0x9c8764); m.sheenRoughness = 0.85; m.sheen = 0.001; m.needsUpdate = true; } }
player.vis.dust = 0;
pv.assist.abs = S.abs; pv.assist.tc = S.tc; pv.assist.stab = S.stab; pv.assist.auto = S.autoGear;
const applyArcade = () => { for (const rc of racers) rc.veh.arcade = !!S.arcade; };   // direção fácil (arcade.js): jogador e bots
applyArcade();

// ---------- clima ----------
const presetKeys = Object.keys(PRESETS);
if (PRESETS[Q.get('clima')]) sw.setPreset(Q.get('clima'));
else if (S.cycle !== 'off') { sw.setPreset('manha'); sw.startCycle(S.cycle === 'fast' ? 180 : 480); }
else sw.setPreset('manha');
sw.cycPaused = true; if (Q.get('chuva') === '1') sw.setRain(true);
let night = false;

// ---------- câmeras ----------
let camMode = 0, camHead = 0, shake = 0, kick = 0, lastGear = 1;
const leadV = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpV = new THREE.Vector3();
const lerpAng = (a, b, t) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; };
camHead = pv.psi;
camPos.set(player.car.object.position.x - Math.sin(pv.psi) * 4.2, player.car.object.position.y + 1.5, player.car.object.position.z - Math.cos(pv.psi) * 4.2);
function updateCamera(dt) {
  const v = pv, car = player.car, base = car.object.position, sn = Math.sin(v.psi), cs = Math.cos(v.psi), speed = Math.hypot(v.u, v.v);
  const velAng = speed > 6 ? Math.atan2(v.u * sn + v.v * cs, v.u * cs - v.v * sn) : v.psi;
  let fov = 62 + clamp(speed, 0, 80) * 0.22 + (v.nitOn ? 7 : 0);
  if (camMode === 0) {
    camHead = lerpAng(camHead, lerpAng(v.psi, velAng, 0.45), 1 - Math.exp(-dt * 5));
    const dist = 4.6 + speed * 0.002, h = 1.5 + speed * 0.002;
    tmpV.set(base.x - Math.sin(camHead) * dist, base.y + h, base.z - Math.cos(camHead) * dist);
    camPos.lerp(tmpV, 1 - Math.exp(-dt * 22));
    camLook.set(base.x + Math.sin(camHead) * 7, base.y + 0.85, base.z + Math.cos(camHead) * 7);
  } else if (camMode === 1 || camMode === 2) {
    const d = car.dims;
    tmpV.set(0, camMode === 1 ? d.height * 0.74 : 0.42, camMode === 1 ? d.length * 0.08 : d.length / 2 + 0.12); car.object.localToWorld(tmpV);
    camPos.copy(tmpV); camHead = lerpAng(camHead, lerpAng(v.psi, velAng, 0.25), 1 - Math.exp(-dt * 8));
    camLook.set(camPos.x + Math.sin(camHead) * 30, camPos.y - 0.2, camPos.z + Math.cos(camHead) * 30); fov += 8;
  } else {
    camHead = lerpAng(camHead, v.psi, 1 - Math.exp(-dt * 2));
    tmpV.set(base.x - Math.sin(camHead) * 16, base.y + 22, base.z - Math.cos(camHead) * 16);
    camPos.lerp(tmpV, 1 - Math.exp(-dt * 4)); camLook.copy(base); fov = 50;
  }
  camera.position.copy(camPos);
  // coice ao trocar de marcha: a câmera recua um instante e o campo de visão abre um pouco
  if (v.gear !== lastGear) { if (v.gear > 0 && lastGear > 0 && speed > 3) kick = 1; lastGear = v.gear; audio.shift(); }
  if (kick > 0.01) { camera.position.x -= Math.sin(camHead) * 0.16 * kick; camera.position.z -= Math.cos(camHead) * 0.16 * kick; fov += 1.6 * kick; kick *= Math.exp(-dt * 7); }
  // piso ruim (cascalho/grama): trepidação proporcional à velocidade
  { const ts = (v.w[0].surf && v.w[0].surf.type) || 0; if (ts > 0 && speed > 4 && camMode !== 3) { const tt = performance.now() * 0.001, a = Math.min(1, speed / 40) * (ts === 1 ? 0.012 : 0.007); camera.position.y += (Math.sin(tt * 53) * 0.5 + Math.sin(tt * 37 + 1.3) * 0.5) * a; camera.position.x += Math.sin(tt * 41 + 0.7) * a * 0.6; } }
  if (shake > 0.01) { camera.position.x += (Math.random() - 0.5) * shake * 0.4; camera.position.y += (Math.random() - 0.5) * shake * 0.3; shake *= Math.exp(-dt * 6); }
  const gy = terrain.heightAt(camera.position.x, camera.position.z) + 0.6;
  if (camera.position.y < gy && camMode !== 2) camera.position.y = gy;
  camera.lookAt(camLook); camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
}

// ---------- visual dos carros ----------
function syncCars(dt) {
  for (const rc of racers) {
    const v = rc.veh, car = rc.car, w = v.w, o = car.object, vis = rc.vis;
    const h = w.map((x) => physics.heightAt(x.px, x.pz));
    const yF = (h[0] + h[1]) / 2, yR = (h[2] + h[3]) / 2, yL = (h[0] + h[2]) / 2, yRt = (h[1] + h[3]) / 2;
    const y = (yF + yR) / 2, pitchT = Math.atan2(yF - yR, v.L), rollT = Math.atan2(yL - yRt, v.T);
    const k = vis.init ? 1 - Math.exp(-dt * 7) : 1; vis.init = true;
    vis.y += (y - vis.y) * k; vis.pitch += (pitchT - vis.pitch) * k; vis.roll += (rollT - vis.roll) * k;
    o.position.set(v.x, vis.y, v.z); o.rotation.set(-vis.pitch, v.psi, vis.roll, 'YXZ');
    const k2 = 1 - Math.exp(-dt * 5); vis.sp += (clamp(v.ax * 0.0058, -0.085, 0.075) - vis.sp) * k2; vis.rl += (clamp(v.ay * 0.0046, -0.1, 0.1) - vis.rl) * k2;
    const sp = vis.sp, rl = vis.rl;
    vis.heat += ((v.brk > 0.5 && v.u > 8 ? 1 : 0) - vis.heat) * Math.min(1, dt * (v.brk > 0.5 ? 0.9 : 0.3));
    car.update(dt, { omega: [w[0].omega, w[1].omega, w[2].omega, w[3].omega], steerAngle: v.steerAng, pitch: -sp, roll: rl, heat: vis.heat });
    rc.fx.tick(dt);
    if (rc.isPlayer && fxOn()) {
      const tt = performance.now() * 0.001, rp = clamp(v.rpm / (v.spec.redline || 7500), 0, 1), ts = (w[0].surf && w[0].surf.type) || 0;
      let a = 0.0003 + 0.0006 * rp * (0.4 + 0.6 * v.thr); if (ts > 0 && Math.abs(v.u) > 5) a += 0.004 * Math.min(1, Math.abs(v.u) / 35);   // motor + piso ruim
      car.chassis.rotation.x += Math.sin(tt * (40 + rp * 60)) * a; car.chassis.rotation.z += Math.sin(tt * (33 + rp * 50) + 1.7) * a * 0.8;
      vis.dust = clamp(vis.dust + (ts > 0 ? Math.min(1, Math.abs(v.u) / 30) * 0.012 * dt : 0) - sw.rain * 0.02 * dt, 0, 1);
      if (frameN % 6 === 0) for (const e of car.paint.entries) if (e.mat.sheenColor) e.mat.sheen = 0.001 + vis.dust * 0.75;
    }
    car.setBrake(v.brk > 0.25 && v.u > 0.5);
    if (car.headOn !== night) car.setHeadlights(night);
    rc.fx.blob.position.set(v.x, vis.y + 0.04, v.z); rc.fx.blob.rotation.set(-vis.pitch, v.psi, vis.roll, 'YXZ');
    rc.fx.update(night, v.brk > 0.25 && v.u > 0.5, o.position.distanceTo(camera.position));
    // fumaça / poeira
    const spd = Math.abs(v.u), nearCam = o.position.distanceTo(camera.position) < 70;
    for (let i = 0; i < 4; i++) {
      const wi = w[i]; if (!wi.surf) continue;
      const slip = Math.max(Math.abs(wi.kappa) / 0.22, Math.abs(wi.alpha) / 0.2), off = wi.surf.type > 0;
      let p = 0, type = 0;
      if (spd > 4 && slip > 1 && !off) p = clamp(slip - 1, 0, 2) * 30;
      if (spd > 7 && off) { p = spd * 0.9 * (wi.surf.type === 1 ? 1 : 0.6); type = wi.surf.type; }
      { const sa = !off && spd > 4 && slip > 1 ? clamp(slip - 1, 0, 1) * 0.8 * (1 - 0.5 * sw.wet) : 0; skid.add(rc.sk * 4 + i, wi.px, physics.heightAt(wi.px, wi.pz) + 0.03, wi.pz, sa); }
      if (off && wi.surf.type === 2 && spd > 10 && Math.random() < spd * 0.1 * dt) smoke.emit(wi.px, physics.heightAt(wi.px, wi.pz) + 0.2, wi.pz, Math.sin(v.psi) * v.u * 0.4, Math.cos(v.psi) * v.u * 0.4, 3, 1);
      if (fxOn() && nearCam) {
        const gy2 = physics.heightAt(wi.px, wi.pz);
        if (off && wi.surf.type === 1 && spd > 9 && Math.random() < spd * 0.4 * dt) debris.emit(wi.px, gy2 + 0.1, wi.pz, Math.sin(v.psi) * v.u * 0.12 + (Math.random() - 0.5) * 4, 2 + Math.random() * 4, Math.cos(v.psi) * v.u * 0.12 + (Math.random() - 0.5) * 4, 0.9, 0.07 + Math.random() * 0.05, 0.45 + Math.random() * 0.12, 0.42, 0.38, gy2);
        else if (!off && sw.wet > 0.25 && spd > 14 && Math.random() < (spd - 12) * 0.5 * sw.wet * dt) smoke.emit(wi.px, gy2 + 0.05, wi.pz, Math.sin(v.psi) * v.u * 0.35, Math.cos(v.psi) * v.u * 0.35, 0, 0.28);   // spray da chuva
      }
      if (p > 0 && type !== 0 && Math.random() < p * dt) smoke.emit(wi.px, physics.heightAt(wi.px, wi.pz), wi.pz, Math.sin(v.psi) * v.u * 0.4, Math.cos(v.psi) * v.u * 0.4, type, off ? 0.8 : 1);
    }
  }
}

// faíscas quando o carro bate (carro x carro, árvore, pedra)
function sparkFx(rc, h) {
  if (!fxOn() || h < 2.5) return; const o = rc.car.object.position; if (o.distanceTo(camera.position) > 120) return;
  const n = Math.min(34, 6 + h * 2.5) | 0, d = rc.car.dims, sn = Math.sin(rc.veh.psi), cs = Math.cos(rc.veh.psi), u = rc.veh.u;
  for (let i = 0; i < n; i++) {
    const lx = (Math.random() < 0.5 ? -1 : 1) * d.width * 0.5, lz = (Math.random() - 0.5) * d.length * 0.9, sp = 3 + Math.random() * 7;
    sparks.emit(o.x + cs * lx + sn * lz, o.y + 0.25 + Math.random() * 0.3, o.z - sn * lx + cs * lz, (Math.random() - 0.5) * sp + sn * u * 0.2, 1 + Math.random() * 3.5, (Math.random() - 0.5) * sp + cs * u * 0.2, 0.35 + Math.random() * 0.45, 0.07, 1.0, 0.62 + Math.random() * 0.25, 0.2, o.y);
  }
}
// replay: poses gravadas (todos os carros) em vez da física
function replayPose(dt) {
  cinema.stepReplay(dt); const sdt = cinema.rpause ? 0 : dt * cinema.rspeed;
  if (!cinema.buf) return;
  racers.forEach((rc, i) => {
    const s = cinema.at(i, _rs), o = rc.car.object, car = rc.car;
    o.position.set(s[0], s[1], s[2]); o.rotation.set(-s[4], s[3], s[5], 'YXZ');
    car.update(sdt, { omega: [s[9], s[10], s[11], s[12]], steerAngle: s[8], pitch: -s[6], roll: s[7], heat: s[14] });
    car.setBrake(s[13] > 0.5); if (car.headOn !== night) car.setHeadlights(night);
    rc.fx.blob.position.set(s[0], s[17] + 0.04, s[2]); rc.fx.blob.rotation.set(-s[4], s[3], s[5], 'YXZ');
    rc.fx.update(night, s[13] > 0.5, o.position.distanceTo(camera.position)); rc.fx.tick(sdt);
  });
}
// teclas Y (replay) e H (modo foto); dentro deles: setas, Espaço, Enter, Esc
function handleCinema() {
  cinEsc = false; if (optionsOpen()) return;
  for (const c of ['KeyY', 'KeyH', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter']) {
    if (!input.tap(c)) continue;
    if (cinema.active) { if (cinema.key(c) && c === 'Escape') cinEsc = true; }
    else if (started && !paused && !finishedShown) { if (c === 'KeyY') cinema.startReplay(); else if (c === 'KeyH') cinema.togglePhoto(); }
  }
  const act = cinema.active;
  if (act !== wasAct) { wasAct = act; if (act) { savedMute = audio.muted; audio.setMuted(true); } else audio.setMuted(savedMute); }
}
// ---------- controles do jogo ----------
let started = false, paused = false, finishedShown = false;
const setPreset = (k) => { sw.setPreset(k); toast(PRESETS[k].label); };
const toast = (m) => hud.toast(m);
function keys() {
  if (optionsOpen()) return;
  if (input.tap('KeyB')) { S.mirror = !S.mirror; toast(S.mirror ? t('tMirrorOn') : t('tMirrorOff')); }
  if (input.tap('KeyN') && started) restartRace();
  if (input.tap('KeyC')) { camMode = (camMode + 1) % 4; toast(t('tCam') + ': ' + t('cams')[camMode]); }
  if (input.tap('KeyT')) { pv.assist.auto = !pv.assist.auto; toast(pv.assist.auto ? t('tGearAuto') : t('tGearManual')); }
  if (input.tap('KeyZ')) { pv.assist.abs = !pv.assist.abs; toast(t('tAbs', pv.assist.abs)); }
  if (input.tap('KeyX')) { pv.assist.tc = !pv.assist.tc; toast(t('tTc', pv.assist.tc)); }
  if (input.tap('KeyV')) { const L = [0, 0.3, 0.6], i = (L.indexOf(pv.assist.stab) + 1) % L.length; pv.assist.stab = L[i]; toast(t('tStab') + ': ' + (L[i] ? L[i] : t('off'))); }
  if (input.tap('KeyR') && started) { race.resetRacer(player, 0); toast(t('tBackOnTrack')); }
  if (input.tap('KeyG')) { sw.setRain(sw.rainTarget < 0.5); toast(sw.rainTarget > 0.5 ? t('tRain') : t('tNoRain')); }
  for (let i = 1; i <= 4; i++) if (input.tap('Digit' + i)) setPreset(presetKeys[i - 1]);
  if (input.tap('BracketLeft') || input.tap('Minus') || input.tap('NumpadSubtract')) { sw.setBrightness(sw.expScale - 0.08); toast(t('tBright') + ' ' + Math.round(sw.expScale * 100) + '%'); }
  if (input.tap('BracketRight') || input.tap('Equal') || input.tap('NumpadAdd')) { sw.setBrightness(sw.expScale + 0.08); toast(t('tBright') + ' ' + Math.round(sw.expScale * 100) + '%'); }
  if (input.tap('KeyM')) { audio.setMuted(!audio.muted); toast(audio.muted ? t('tSoundOff') : t('tSoundOn')); }
  if ((input.tap('KeyP') || (input.tap('Escape') && !cinEsc)) && started && !finishedShown) { paused = !paused; $('pauseov').classList.toggle('on', paused); if (audio.ctx) paused ? audio.ctx.suspend() : audio.ctx.resume(); }
}
function begin() { if (started) return; started = true; $('startov').classList.remove('on'); audio.start(); }
$('go').onclick = begin; $('optS').onclick = openOptions; $('optP').onclick = openOptions; $('restartB').onclick = () => restartRace(); $('resume').onclick = () => { paused = false; $('pauseov').classList.remove('on'); if (audio.ctx) audio.ctx.resume(); };
addEventListener('keydown', (e) => { if (!started && !optionsOpen() && !['F5', 'F12'].includes(e.code)) begin(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && started && !paused && !finishedShown) { paused = true; $('pauseov').classList.add('on'); } });

// ---------- recordes, fantasma, dano, setas de curva, retrovisor ----------
const RK = recKey(playerCfg.id, TRACK_ID, REV) + (S.arcade ? '|arc' : '');
let ghostP = null, ghostCar = null, ghostBusy = false, recorder = new GhostRecorder(), lastLapSamples = null, newRecord = false, champSaved = false, damage = 0, turnInfo = null;
{ const r0 = getRec(RK); if (r0 && r0.samples && r0.samples.length) ghostP = new GhostPlayer(r0); }
async function ensureGhost() {
  if (ghostCar || ghostBusy) return; ghostBusy = true;
  try {
    const car = buildCar(await loadGLB(playerCfg.file, renderer), playerCfg);
    for (const b of car.beams) { b.parent && b.parent.remove(b); b.target.parent && b.target.parent.remove(b.target); } car.beams = [];
    const gm = new THREE.MeshBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.3, depthWrite: false });
    car.object.traverse((o) => { if (o.isMesh) { o.material = gm; o.castShadow = false; o.receiveShadow = false; } });
    car.object.visible = false; scene.add(car.object); ghostCar = car;
  } catch (e) { console.warn('fantasma indisponível', e); }
  ghostBusy = false;
}
if (ghostP) await ensureGhost();
const mirror = new Mirror(renderer, scene, $('mirrorFrame'));
/** próxima curva à frente: direção, distância e severidade (1 = grampo) */
function turnAhead() {
  const s0 = player.idx * track.ds, thr = 1 / 110; let inC = Math.abs(track.at(s0).k) > thr;
  for (let d = 8; d <= 300; d += 8) {
    const k = track.at(s0 + d).k, a = Math.abs(k);
    if (inC) { if (a < thr * 0.7) inC = false; continue; }
    if (a > thr) {
      let kmax = a; for (let q = 8; q <= 90; q += 10) kmax = Math.max(kmax, Math.abs(track.at(s0 + d + q).k));
      const R = 1 / kmax; return { dir: k > 0 ? -1 : 1, dist: d, sev: R < 32 ? 1 : R < 55 ? 2 : 3 };
    }
  }
  return null;
}
function restartRace() {
  cinema.n = 0; cinema.head = 0;
  if (champSaved) return;
  race.restart();
  for (const rc of racers) { const v = rc.vis; v.init = false; v.pitch = v.roll = v.sp = v.rl = v.heat = 0; }
  finishedShown = false; hud.hideResults(); paused = false; $('pauseov').classList.remove('on'); if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  damage = 0; shake = 0; kick = 0; recorder = new GhostRecorder(); lastLapSamples = null; newRecord = false; if (ghostCar) ghostCar.object.visible = false;
  camHead = pv.psi; camPos.set(player.car.object.position.x - Math.sin(pv.psi) * 4.6, player.car.object.position.y + 1.5, player.car.object.position.z - Math.cos(pv.psi) * 4.6);
  skid.last.clear(); toast(t('tRestart'));
}
function showResults() {
  finishedShown = true;
  const order = race.racers.slice().sort((a, b) => a.pos - b.pos), o = { newRecord, trackName: TRACK_NAME + (REV ? ' ↺' : '') };
  if (champ) {
    if (!champSaved) { champSaved = true; o.gained = addRaceResult(champ, order); }
    else o.gained = champ.log[champ.log.length - 1].gained;
    o.totals = champ.pts; o.round = Math.min(champ.round, champ.rounds.length); o.rounds = champ.rounds.length;
    if (champ.round >= champ.rounds.length) o.champFinal = true; else o.nextUrl = 'game.html?modo=champ';
  } else o.onAgain = restartRace;
  hud.results(order, player, o);
}
// ---------- aquecimento: árvores, texturas e shaders já prontos antes da largada ----------
await say('Preparando as árvores…');
{
  const p0 = player.car.object.position;
  camera.position.copy(camPos); camera.lookAt(p0.x + Math.sin(pv.psi) * 20, p0.y + 1, p0.z + Math.cos(pv.psi) * 20); camera.updateMatrixWorld();
  sw.follow(p0); W.applyWet(sw.wet);
  veg._last.t = -1; veg.update(camera, 0, 1, new THREE.Vector3(0, 0, 30));
  const restore = veg.warmup(renderer);
  renderer.shadowMap.needsUpdate = true; composer.render(0.016); composer.render(0.016);
  restore(); veg._last.t = -1; veg.update(camera, 0, 1, new THREE.Vector3(0, 0, 30));
}
// ---------- laço ----------
$('loading').classList.add('done'); $('startov').classList.add('on');
let last = performance.now(), acc = 0, time = 0, fps = 60, frameN = 0;
// ---------- desempenho adaptativo: ajusta resolução e detalhes para manter ~60 fps ----------
const perf = { ema: 16.7, low: 0, hi: 0, cool: 3, level: 2, shadowEvery: 2, fixed: false };
function applyRatio() { renderer.setPixelRatio(ratio); composer.setPixelRatio(ratio); composer.setSize(innerWidth, innerHeight); }
function applyLevel() {
  const L = perf.level;
  const TK = S.treeRange; veg.range = [200, 300, 400][L] * TK; veg.farRange = Math.max(veg.range + 60, [420, 520, 600][L] * TK); veg.grassRange = [0, 55, 90][L]; veg.grassOn = L > 0; veg.rockRange = [420, 520, 600][L]; veg.pebbleRange = [60, 90, 120][L];
  perf.shadowEvery = [3, 2, 2][L]; bloom.enabled = L > 0; post.pass.enabled = L > 0; veg._last.t = -1;
  if (smaa) smaa.enabled = L >= 2 && fxOn(); fin.pass.enabled = L > 0 && fxOn();
}
function perfUpdate(dt) {
  perf.ema += (dt * 1000 - perf.ema) * 0.05; perf.cool -= dt;
  if (perf.fixed || !started || paused || perf.cool > 0 || document.hidden) return;
  if (race.state !== 'race' || race.t < 8) { perf.low = 0; return; }   // não reduz a resolução na largada (era isso que deixava a imagem borrada na arrancada)
  if (perf.ema > 24) { perf.hi = 0; perf.low += dt;
    if (perf.low > 2) { perf.low = 0; perf.cool = 2.5; if (ratio > 0.81) { ratio = Math.max(0.8, ratio - 0.1); applyRatio(); } else if (perf.level > 0) { perf.level--; applyLevel(); } } }
  else if (perf.ema < 14.8) { perf.low = 0; perf.hi += dt;
    if (perf.hi > 6) { perf.hi = 0; perf.cool = 3; if (ratio < MAXR - 1e-3) { ratio = Math.min(MAXR, ratio + 0.1); applyRatio(); } else if (perf.level < 2) { perf.level++; applyLevel(); } } }
  else { perf.low = perf.hi = 0; }
}
const statsEl = document.createElement('div'); statsEl.style.cssText = 'position:fixed;left:24px;top:150px;font:12px/1.5 ui-monospace,Consolas,monospace;color:#9fb3a8;display:none;pointer-events:none;z-index:5;text-shadow:0 1px 4px #000'; document.body.appendChild(statsEl);
addEventListener('keydown', (e) => { if (e.code === 'KeyF' && e.target.tagName !== 'INPUT') statsEl.style.display = statsEl.style.display === 'none' ? 'block' : 'none'; });
function applyQuality() {
  const q = S.quality; perf.fixed = q !== 'auto';
  if (perf.fixed) { perf.level = { low: 0, med: 1, high: 2 }[q]; ratio = q === 'low' ? Math.min(MAXR, 0.75) : q === 'med' ? Math.min(MAXR, 1) : MAXR; applyRatio(); }
  applyLevel();
}
addEventListener('optionschange', (e) => {
  if (e.detail === 'arcade') { applyArcade(); toast(S.arcade ? 'Direção arcade (fácil)' : 'Direção realista'); }
  const k = e.detail;
  if (k === 'volume') audio.setMuted(audio.muted);
  else if (k === 'quality') applyQuality();
  else if (k === 'treeRange' || k === 'fx') applyLevel();
  else if (k === 'abs') pv.assist.abs = S.abs; else if (k === 'tc') pv.assist.tc = S.tc; else if (k === 'stab') pv.assist.stab = S.stab; else if (k === 'autoGear') pv.assist.auto = S.autoGear;
  else if (k === 'cycle') { if (S.cycle === 'off') sw.setPreset(sw.preset === 'por' ? 'por' : 'manha'); else sw.startCycle(S.cycle === 'fast' ? 180 : 480, sw.cyc ? Math.min(1, sw.cyc.t / sw.cyc.T) : 0); }
});
applyQuality();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const inp = input.read(dt); inp.steer = clamp(inp.steer * S.steerSens, -1, 1); handleCinema(); if (!cinema.active) keys(); sw.cycPaused = !(started && !paused && !cinema.active);
  if (started && !paused && !cinema.active) {
    time += dt; acc += dt; let n = 0;
    while (acc >= STEP && n < 40) {
      snapPrev(racers);
      race.step(STEP, applyCornerAssist(inp, pv, { track, idx: player.idx, wet: physics.wet || 0 }, S.cornerAssist && race.state === 'race' && !player.finished && !player.auto));
      acc -= STEP; n++;
    }
    if (n >= 40) acc = 0;
    for (const e of race.events) {
      if (e.type === 'cross' && e.racer === player) { lastLapSamples = recorder.s; recorder = new GhostRecorder(); }
      else if (e.type === 'lap' && e.racer === player) {
        const bestNow = e.time <= (player.best || 1e9) + 1e-6, prevRec = getRec(RK);
        toast(t('tLap', e.lap, fmt(e.time)) + (bestNow ? '  ·  ' + t('tBestLap') : ''));
        if (lastLapSamples && lastLapSamples.length > 20 && (!prevRec || e.time < prevRec.time)) {
          const rec = { time: e.time, samples: lastLapSamples }; saveRec(RK, rec); ghostP = new GhostPlayer(rec); if (prevRec || e.lap >= 1) newRecord = true; ensureGhost();
        }
      }
      else if (e.type === 'finish' && e.racer === player) { toast(t('tFinished', player.pos)); setTimeout(() => { if (!finishedShown) showResults(); }, 2500); }
    }
    race.events.length = 0;
    if (player.hit > 1.5) { audio.impact(clamp(player.hit / 14, 0.1, 1)); damage = Math.min(1, damage + player.hit * 0.012); }
    if (player.lapNo >= 1 && !player.finished) recorder.sample(race.t - player.lapStart, pv, player.idx, dt);
    sparkFx(player, player.hit); if (player.hit > 5) shake = Math.min(1.2, player.hit * 0.06); player.hit = 0;
    for (const r of racers) if (r !== player) { sparkFx(r, r.hit); r.hit = 0; }
  }
  blendPose(racers, started && !paused ? clamp(acc / STEP, 0, 1) : 1);   // desenha o carro entre dois passos da física (sem tremor)
  physics.wet = sw.wet; W.applyWet(sw.wet);
  night = sw.preset === 'por' || sw.preset === 'nublado' || sw.rain > 0.3;
  frameN++;
  if (frameN % 8 === 0) for (const rc of racers) if (rc !== player) { const d = rc.car.object.position.distanceTo(camera.position); applyLod(rc, d < 55 ? 0 : 1); }
  renderer.shadowMap.needsUpdate = frameN % perf.shadowEvery === 0;
  perfUpdate(dt);
  const fdt = cinema.photo ? 0 : dt;
  if (cinema.replay) replayPose(dt); else { syncCars(fdt); if (started && !paused && !cinema.active) cinema.record(dt, racers); }
  skid.flush(); W.side.setNight(night);
  const pScale = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
  smoke.update(fdt); smoke.m.uniforms.uScale.value = pScale; sparks.update(fdt, pScale); debris.update(fdt, pScale);
  if (fxOn() && sw.rain > 0.25 && started && !paused && !cinema.active) {   // respingos da chuva no asfalto à frente do carro
    const o = player.car.object.position, sn = Math.sin(pv.psi), cs = Math.cos(pv.psi), n = Math.floor(sw.rain * dt * 70 + Math.random());
    for (let i = 0; i < n; i++) { const f = -2 + Math.random() * 22, l = (Math.random() - 0.5) * 11, x = o.x + sn * f + cs * l, z = o.z + cs * f - sn * l, gy = physics.heightAt(x, z) + 0.02;
      debris.emit(x, gy, z, (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8, 0.28, 0.045, 0.82, 0.88, 0.96, gy); }
  }
  if (cinema.replay && cinema.buf) cinema.replayCam(cinema.at(0, _s), camera, dt);
  else if (cinema.photo) cinema.photoCam(player.car.object.position, camera);
  else updateCamera(dt);
  { const dh = Math.atan2(Math.sin(camHead - prevHead), Math.cos(camHead - prevHead)); prevHead = camHead; yawRate += ((dt > 0 ? dh / dt : 0) - yawRate) * Math.min(1, dt * 8); }
  // fantasma
  let gDelta = null;
  if (ghostCar) {
    const lt = race.t - player.lapStart, gp = started && !paused && ghostP && player.lapNo >= 1 && !player.finished ? ghostP.at(lt) : null;
    if (gp) { ghostCar.object.visible = true; ghostCar.object.position.set(gp.x, physics.heightAt(gp.x, gp.z), gp.z); ghostCar.object.rotation.set(0, gp.psi, 0); ghostCar.update(dt, { speed: 20 });
      const gt = ghostP.timeAtIdx(player.idx); if (gt != null) { const d = lt - gt; if (Math.abs(d) < 99) gDelta = d; } }
    else ghostCar.object.visible = false;
  }
  // aviso de curva removido (turnInfo fica sempre null)
  turnInfo = null;
  if (false && damage > 0.55 && started && !paused && Math.random() < (damage - 0.5) * dt * 20) {   // fumaça de dano removida
    const o = player.car.object.position, sn = Math.sin(pv.psi), cs = Math.cos(pv.psi), L = player.car.dims.length * 0.32; smoke.emit(o.x + sn * L, o.y + 0.6, o.z + cs * L, sn * pv.u * 0.3, cs * pv.u * 0.3, 0, 0.55); }
  sw.update(dt, time); sw.follow(player.car.object.position);
  { const sn = Math.sin(pv.psi), cs = Math.cos(pv.psi); leadV.set((pv.u * sn + pv.v * cs) * 0.6, 0, (pv.u * cs - pv.v * sn) * 0.6); }
  veg.update(camera, time, sw.wind, leadV);
  // HUD e som
  const order = race.racers.slice().sort((a, b) => a.pos - b.pos);
  hud.countdown(race.t); hud.update({ veh: pv, pos: player.pos, total: racers.length, lapNo: player.lapNo, finished: player.finished, state: race.state, lapTime: race.t - player.lapStart, best: player.best, order, player, extra: { rec: ghostP ? ghostP.rec.time : null, delta: gDelta, turn: turnInfo, damage } });
  let sq = 0; for (const w of pv.w) sq = Math.max(sq, Math.abs(w.kappa) / 0.22, Math.abs(w.alpha) / 0.2);
  audio.update({ rpm: pv.rpm, thr: pv.thr, speed: Math.abs(pv.u), squeal: clamp(sq - 0.85, 0, 1.5) * (Math.abs(pv.u) > 5 ? 1 : 0), offroad: pv.w.some((w) => w.surf && w.surf.type > 0), redline: pv.spec.redline });
  { const u = post.u, sp = Math.abs(pv.u); u.uTime.value = time; u.uAspect.value = innerWidth / innerHeight; u.uSpeed.value = camMode === 3 ? 0 : clamp((sp - 48) / 70, 0, 1) * 0.5 + (pv.nitOn ? 0.08 : 0); u.uRain.value = camMode === 3 ? 0 : sw.rain; }
  { // efeitos extras: movimento pela curva, raios de sol, cor de cinema, sombras de nuvens, reflexo na lataria, som dos bots
    const u = post.u, on = fxOn(), sp = Math.abs(pv.u), moving = !cinema.active && camMode !== 3;
    FX.time.value = time; FX.cloud.value = on ? clamp(sw.P.sunI / 2.8, 0, 1) * (1 - sw.rain) * 0.9 : 0;
    u.uYaw.value = 0;   // borrão lateral nas curvas desligado
    camera.getWorldDirection(_tf); const sd = sw.sunDir; tmpV.copy(camera.position).addScaledVector(sd, 1000).project(camera);
    u.uSun.value = [tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5]; _sunC.setHex(sw.P.sunC); u.uSunCol.value = [_sunC.r, _sunC.g * 0.95, _sunC.b * 0.85];
    u.uRays.value = on ? clamp((_tf.dot(sd) + 0.05) / 0.5, 0, 1) * (1 - clamp(sw.rain * 1.5, 0, 1)) * clamp(sw.P.sunI / 2.4, 0, 1) * clamp(1.25 - sw.P.elev / 55, 0.35, 1) * 0.35 : 0;
    fin.u.uTime.value = time; fin.u.uAspect.value = innerWidth / innerHeight; fin.u.uSpeed.value = clamp(sp / 60, 0, 1);
    if (reflect) {
      _rp.copy(player.car.object.position); _rp.y += 0.9;
      reflect.setHidden([veg.root, smoke.mesh, sparks.mesh, debris.mesh, sw.rainMesh, ...racers.map((r) => r.car.object), ...racers.map((r) => r.fx.blob), ...(ghostCar ? [ghostCar.object] : [])]);
      reflect.setEnabled(on && perf.level === 2 && !cinema.active && camMode !== 3, _rp); reflect.update(_rp);
    }
    if (started && !paused && !cinema.active) { if (on) aiAudio.update(camera, dt); else aiAudio.silence(); }
    if (audio.popped) { audio.popped = 0; if (on && !cinema.active) player.fx.flame(1); }
  }
  composer.render(dt); cinema.grab();
  { const po = player.car.object.position, mOn = false; /* retrovisor desligado (quadro do topo removido) */ mirror.render(mOn, { x: po.x, y: po.y + player.car.dims.height * 0.95 + 0.15, z: po.z }, pv.psi, 2); }
  if (statsEl.style.display !== 'none') { const i = renderer.info; statsEl.innerHTML = `${(1000 / perf.ema).toFixed(0)} fps · resolução ${(ratio * 100).toFixed(0)}% · nível ${perf.level}<br>${i.render.calls} draw calls · ${(i.render.triangles / 1000).toFixed(0)}k triângulos`; }
  restorePose(racers);
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
