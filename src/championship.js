// championship.js — campeonato: sequência de pistas, pontos por posição e classificação geral (guardado no navegador).
import { TRACKS } from './trackBuilder.js';
const KEY = 'champ_v1';
export const POINTS = [10, 8, 6, 4, 2, 1];
export const loadChamp = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
export const saveChamp = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} };
export const clearChamp = () => { try { localStorage.removeItem(KEY); } catch {} };
export function newChamp({ laps = 3, dif = 1 } = {}) {
  const c = { rounds: TRACKS.map((t) => t.id), round: 0, pts: {}, laps, dif, log: [] };
  saveChamp(c); return c;
}
/** registra o resultado da corrida atual (order: corredores já ordenados por posição) */
export function addRaceResult(c, order) {
  const gained = {};
  order.forEach((r, i) => { const p = POINTS[i] || 0; gained[r.name] = p; c.pts[r.name] = (c.pts[r.name] || 0) + p; });
  c.log.push({ track: c.rounds[c.round], gained }); c.round++; saveChamp(c); return gained;
}
export const standings = (c) => Object.entries(c.pts).sort((a, b) => b[1] - a[1]);
