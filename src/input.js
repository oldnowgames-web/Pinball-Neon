// input.js — teclado e controle (gamepad) → entradas do carro.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Input {
  constructor() {
    this.keys = new Set(); this.steerK = 0; this.pressed = new Set();
    addEventListener('keydown', (e) => { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault(); if (!this.keys.has(e.code)) this.pressed.add(e.code); this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.padPrev = [];
  }
  /** true uma vez por aperto */
  tap(code) { return this.pressed.has(code); }
  pad() { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of l) if (p && p.connected) return p; return null; }
  read(dt) {
    const k = this.keys, has = (...c) => c.some((x) => k.has(x));
    const tl = (has('KeyA', 'ArrowLeft') ? 1 : 0) - (has('KeyD', 'ArrowRight') ? 1 : 0);
    const rate = tl === 0 ? 7 : (Math.sign(tl) !== Math.sign(this.steerK) && this.steerK !== 0 ? 9 : 4.2);
    this.steerK += clamp(tl - this.steerK, -rate * dt, rate * dt);
    const o = { steer: this.steerK, throttle: has('KeyW', 'ArrowUp') ? 1 : 0, brake: has('KeyS', 'ArrowDown') ? 1 : 0, handbrake: has('Space') ? 1 : 0, nitro: has('ShiftLeft', 'ShiftRight'), up: has('KeyE'), down: has('KeyQ'), pad: false };
    const p = this.pad();
    if (p) {
      const dz = (v) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);
      const ax = dz(p.axes[0] || 0), rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0, b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      if (Math.abs(ax) > 0.02 || rt > 0.02 || lt > 0.02 || b(0) || b(2) || b(4) || b(5)) {
        o.pad = true; if (Math.abs(ax) > 0.02) o.steer = -Math.sign(ax) * Math.pow(Math.abs(ax), 1.3);
        o.throttle = Math.max(o.throttle, rt); o.brake = Math.max(o.brake, lt); o.handbrake = Math.max(o.handbrake, b(2) ? 1 : 0);
        o.nitro = o.nitro || b(0); o.up = o.up || b(5); o.down = o.down || b(4);
      }
      const edge = (i, code) => { const n = b(i); if (n && !this.padPrev[i]) this.pressed.add(code); this.padPrev[i] = n; };
      edge(3, 'KeyC'); edge(9, 'KeyP'); edge(8, 'KeyR');
    }
    return o;
  }
  endFrame() { this.pressed.clear(); }
}
