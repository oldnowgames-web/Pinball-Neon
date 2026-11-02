// uiaudio.js — música de menu (sintetizada, em loop) e sons de interface. Começa no primeiro clique/tecla (regra do navegador).
import { S } from './settings.js';

let C = null, master = null, mus = null, timer = 0, step = 0, nextT = 0, started = false;
const BPM = 92, SPB = 60 / BPM / 2;                         // colcheias
const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am F C G
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function tone(t, f, dur, type, vol, dest, atk = 0.01) {
  const o = C.createOscillator(), g = C.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
let nbuf = null;
function noise(t, dur, vol, hp) {
  if (!nbuf) { nbuf = C.createBuffer(1, C.sampleRate, C.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = C.createBufferSource(); s.buffer = nbuf; const f = C.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = C.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(mus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function schedule(i, t) {
  const bar = Math.floor(i / 16) % 4, beat = i % 16, ch = CH[bar];
  if (beat === 0) for (const n of ch) tone(t, mtof(n), SPB * 16, 'triangle', 0.05, mus, 0.4);        // pad
  if (beat % 4 === 0) tone(t, mtof(ch[0] - 24), SPB * 3.5, 'sine', 0.22, mus, 0.02);                  // baixo
  if (beat % 8 === 0) { const o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(mus); o.start(t); o.stop(t + 0.22); }
  if (beat % 2 === 1) noise(t, 0.05, 0.05, 7000);                                                      // chimbal
  if (beat % 2 === 0) tone(t, mtof(ch[(beat / 2 + bar) % 3] + 12), SPB * 1.6, 'square', 0.025, mus, 0.005);   // arpejo
}
function tick() {
  while (nextT < C.currentTime + 0.25) { schedule(step, Math.max(nextT, C.currentTime)); step++; nextT += SPB; }
}
export function startMusic() {
  if (started || !S.music) return; if (!C) return; started = true; mus.gain.value = S.music * 0.4; nextT = C.currentTime + 0.1; timer = setInterval(tick, 40);
}
export function blip(freq = 660, dur = 0.06, vol = 0.12) { if (!C || !S.volume) return; tone(C.currentTime, freq, dur, 'sine', vol * S.volume, master, 0.004); }
function init() {
  if (C) { C.resume(); return; }
  C = new (window.AudioContext || window.webkitAudioContext)(); master = C.createGain(); master.gain.value = S.volume; master.connect(C.destination);
  mus = C.createGain(); mus.gain.value = 0; mus.connect(master); startMusic();
}
export function initUiAudio() {
  const go = () => { init(); };
  addEventListener('pointerdown', go, { once: true }); addEventListener('keydown', go, { once: true });
  document.addEventListener('click', (e) => { if (e.target.closest('button,a,select,.car,.sw,.fin')) { init(); blip(720, 0.07, 0.14); } });
  document.addEventListener('mouseover', (e) => { if (C && e.target.closest('button,a,.car,.sw,.fin')) blip(1100, 0.03, 0.04); });
  addEventListener('optionschange', (e) => {
    if (!C) return;
    if (e.detail === 'volume') master.gain.value = S.volume;
    if (e.detail === 'music') { if (S.music && !started) startMusic(); if (mus) mus.gain.value = S.music * 0.4; }
  });
}
