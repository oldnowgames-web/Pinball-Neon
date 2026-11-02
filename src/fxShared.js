// fxShared.js — uniformes compartilhados pelos efeitos de realismo (asfalto, terreno, nuvens).
import * as THREE from 'three';
export const FX = {
  time: { value: 0 },      // segundos (anima as sombras das nuvens)
  cloud: { value: 0 },     // 0..1: intensidade das sombras de nuvens no chão
  rwet: { value: 0 },      // 0..1: pista molhada (poças)
};
// liga/desliga geral dos efeitos extras (Opções > "Realismo extra", ou ?fx=0 na URL)
export const FXFLAG = { on: true };
export { THREE };
