// race.js — mundo físico (superfície, obstáculos), corredores, largada, voltas e posições. Sem 3D: roda também no Node.
import { Vehicle } from './vehicle.js';
import { Driver } from './ai.js';
import { HALF } from './trackBuilder.js';
import { hitStatic, hitCars } from './collide.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class WorldPhysics {
  constructor(track, terrain, plan) {
    this.track = track; this.terrain = terrain; this.wet = 0;
    this.CELL = 16; this.hash = new Map(); this._tmp = [];
    const add = (o) => { const k = Math.floor(o.x / this.CELL) + ',' + Math.floor(o.z / this.CELL); (this.hash.get(k) || this.hash.set(k, []).get(k)).push(o); };
    this.addObstacle = (x, z, r) => add({ x, z, r });
    if (plan) {
      for (const t of plan.trees) add({ x: t.x, z: t.z, r: (t.pine ? 0.36 : 0.44) * t.sc });
      for (const r of plan.rocks) if (r.sc > 0.9) add({ x: r.x, z: r.z, r: 1.05 * r.sc });
    }
  }
  obstacles(x, z) {
    const out = this._tmp; out.length = 0; const cx = Math.floor(x / this.CELL), cz = Math.floor(z / this.CELL);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) { const l = this.hash.get(a + ',' + b); if (l) for (const o of l) out.push(o); }
    return out;
  }
  /** aderência e resistência do piso sob uma roda (w.hint guarda o índice da pista para busca rápida) */
  surface(x, z, w) {
    const loc = this.track.locate(x, z, w && w.hint); if (w) w.hint = loc.i;
    const a = Math.abs(loc.lat), wet = this.wet;
    const asph = 1 - 0.30 * wet, gravel = 0.62 * (1 - 0.1 * wet), grass = 0.56 * (1 - 0.22 * wet);
    const g1 = sm(HALF + 0.9, HALF + 1.7, a), g2 = sm(HALF + 5.5, HALF + 7.0, a);
    const mu = asph * (1 - g1) + (gravel * (1 - g2) + grass * g2) * g1;
    const rr = 0.0 * (1 - g1) + (0.05 * (1 - g2) + 0.11 * g2) * g1;
    return { mu, rr, lat: loc.lat, type: a <= HALF + 0.9 ? 0 : a <= HALF + 6.5 ? 1 : 2 };
  }
  heightAt(x, z) {
    const t = this.terrain, d = t.distAt(x, z);
    return t.heightAt(x, z) + 0.09 * (1 - sm(HALF + 0.2, HALF + 1.2, d));
  }
}

export class Racer {
  constructor({ name, specId, dims, driver = null, isPlayer = false, color = '#ffffff' }) {
    this.name = name; this.specId = specId; this.dims = dims; this.driver = driver; this.isPlayer = isPlayer; this.color = color;
    this.veh = new Vehicle(specId, dims);
    this.len = dims.length || 4.4; this.wid = dims.width || 1.9;
    this.idx = 0; this.hint = -1; this.lapNo = 0; this.laps = []; this.lapStart = 0; this.finished = false; this.finishT = 0;
    this.prog = 0; this.lat = 0; this.hit = 0; this.recovers = 0; this.pos = 0; this.auto = null; this.best = null;
  }
}

export class Race {
  constructor(world, racers, { laps = 3, playerSlot = 3 } = {}) {
    this.world = world; this.racers = racers; this.laps = laps; this.state = 'grid'; this.t = -5; this.events = [];
    this.env = { surface: (x, z, w) => world.surface(x, z, w), heightAt: (x, z) => world.heightAt(x, z) };
    const order = racers.slice().sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    const player = order.pop(); order.splice(Math.min(playerSlot, order.length), 0, player);
    this.order = order; this.grid(order);
    this.player = racers.find((r) => r.isPlayer) || null;
  }
  grid(order) {
    const tr = this.world.track;
    order.forEach((r, i) => {
      const row = Math.floor(i / 2), col = i % 2, s = -(9 + row * 8), p = tr.at(s), lat = col ? 2.7 : -2.7;
      r.veh.reset(p.x + p.nx * lat, p.z + p.nz * lat, p.h, 0);
      const loc = tr.locate(r.veh.x, r.veh.z, -1); r.idx = loc.i; r.hint = loc.i; r.lapNo = 0; r.lapStart = 0; r.laps = []; r.finished = false; r.slot = i;
      for (const w of r.veh.w) w.hint = loc.i;
    });
  }
  /** recomeça a corrida: todos de volta ao grid, contagem de novo */
  restart() {
    this.state = 'grid'; this.t = -5; this.events.length = 0;
    for (const r of this.racers) {
      r.lapNo = 0; r.laps = []; r.best = null; r.finished = false; r.finishT = 0; r.auto = null; r.hit = 0; r.recovers = 0; r.prog = 0; r.lat = 0; r.lapStart = 0;
      const d = r.driver; if (d) { d.stuck = 0; d.tgt = null; d.st = null; d.off = 0; d.avoid = 0; d.errLeft = 0; }
    }
    this.grid(this.order);
  }
  resetRacer(r, speed = 0) {
    const tr = this.world.track, p = tr.at(r.idx * tr.ds);
    r.veh.reset(p.x, p.z, p.h, speed); r.recovers++; r.events = 'reset';
    for (const w of r.veh.w) w.hint = r.idx;
  }
  /** passo fixo de física. playerInput: entradas do jogador */
  step(dt, playerInput) {
    this.t += dt;
    if (this.state === 'grid' && this.t >= 0) { this.state = 'race'; this.events.push({ type: 'go' }); }
    const tr = this.world.track, N = tr.N;
    for (const r of this.racers) {
      let inp;
      if (this.state === 'grid') inp = { steer: 0, throttle: 0, brake: 1, handbrake: 1, nitro: false };
      else if (r.isPlayer && !r.auto) inp = playerInput;
      else { const d = r.auto || r.driver; inp = d.control(r, this, dt); if (inp.stuck > 3) { this.resetRacer(r, 8); d.stuck = 0; } if (d.react && this.t < d.react && !r.finished) inp = Object.assign({}, inp, { throttle: 0 }); }   // tempo de reação na largada
      { // vácuo: quem vem logo atrás de outro carro, em linha reta e rápido, sofre menos resistência do ar
        const v = r.veh; let best = 0;
        if (this.state === 'race' && Math.abs(v.u) > 20) {
          const sn = Math.sin(v.psi), cs = Math.cos(v.psi);
          for (const o of this.racers) { if (o === r) continue; const dx = o.veh.x - v.x, dz = o.veh.z - v.z, df = dx * sn + dz * cs, dl = dx * cs - dz * sn;
            if (df > 3.5 && df < 28 && Math.abs(dl) < 1.7) best = Math.max(best, (1 - (df - 3.5) / 24.5) * (1 - Math.abs(dl) / 1.7)); }
        }
        v.draft = (v.draft || 0) + (best - (v.draft || 0)) * Math.min(1, dt * 3);
      }
      r.veh.step(dt, inp, this.env);
      // progresso e voltas
      const loc = tr.locate(r.veh.x, r.veh.z, r.hint), prev = r.idx; r.hint = loc.i; r.idx = loc.i; r.lat = loc.lat;
      if (prev > N * 0.75 && loc.i < N * 0.25) {
        r.lapNo++; this.events.push({ type: 'cross', racer: r, lapNo: r.lapNo });
        if (r.lapNo >= 2) { const lt = this.t - r.lapStart; r.laps.push(lt); if (r.best == null || lt < r.best) r.best = lt; this.events.push({ type: 'lap', racer: r, time: lt, lap: r.lapNo - 1 }); }
        r.lapStart = this.t;
        if (r.lapNo === this.laps + 1 && !r.finished) { r.finished = true; r.finishT = this.t; this.events.push({ type: 'finish', racer: r }); if (r.isPlayer) r.auto = new Driver(0.9, 99); }
      } else if (prev < N * 0.25 && loc.i > N * 0.75 && r.lapNo > 0) r.lapNo--;
      r.prog = r.lapNo * N + (r.lapNo === 0 && loc.i > N / 2 ? loc.i - N : loc.i);
      if (Math.abs(loc.lat) > HALF + 22 && this.state === 'race') this.resetRacer(r, 6);
      // obstáculos fixos
      const hs = hitStatic(r.veh, r.len, r.wid, (x, z) => this.world.obstacles(x, z)); if (hs > r.hit) r.hit = hs;
    }
    for (let i = 0; i < this.racers.length; i++) for (let j = i + 1; j < this.racers.length; j++) {
      const a = this.racers[i], b = this.racers[j];
      if (Math.abs(a.veh.x - b.veh.x) > 6 || Math.abs(a.veh.z - b.veh.z) > 6) continue;
      const h = hitCars(a.veh, b.veh, a.len, a.wid); if (h > 0.5) { a.hit = Math.max(a.hit, h); b.hit = Math.max(b.hit, h); }
    }
    // posições
    const order = this.racers.slice().sort((a, b) => (a.finished && b.finished ? a.finishT - b.finishT : a.finished ? -1 : b.finished ? 1 : b.prog - a.prog));
    order.forEach((r, i) => (r.pos = i + 1));
  }
}
