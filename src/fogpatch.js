// fogpatch.js — névoa por altura + perspectiva do ar.
//   · vales e partes baixas do terreno ficam mais enevoados; montanhas altas ficam mais limpas
//   · com a distância a névoa ganha um tom azulado (montanhas "azuladas" ao longe)
// Troca os trechos de névoa do three.js (ShaderChunk) ANTES de qualquer material compilar. Funciona em todos os
// materiais que já usam a névoa da cena (FogExp2), sem mexer em nenhum shader do jogo.
import * as THREE from 'three';

// número como literal float do GLSL (sempre com ponto decimal; um "-6" inteiro não compila em float - int)
const f = (n) => { let t = String(+(+n).toFixed(5)); if (!/[.e]/i.test(t)) t += '.0'; return t; };

export function installFogPatch({ refY = 0, amount = 1.3, falloff = 0.02 } = {}) {
  const C = THREE.ShaderChunk;
  if (C.__racerFog) return; C.__racerFog = true;
  C.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogWY;
#endif
`;
  C.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWY = cameraPosition.y + dot( viewMatrix[ 1 ].xyz, mvPosition.xyz );
#endif
`;
  C.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogWY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;
  C.fog_fragment = `
#ifdef USE_FOG
  vec3 fogCol = fogColor;
  #ifdef FOG_EXP2
    float fogYm = 0.5 * ( cameraPosition.y + vFogWY );
    float fogDn = fogDensity * ( 1.0 + ${f(amount)} * exp( - max( fogYm - ${f(refY)}, 0.0 ) * ${f(falloff)} ) );
    float fogFactor = 1.0 - exp( - fogDn * fogDn * vFogDepth * vFogDepth );
    float fogAer = smoothstep( 120.0, 1500.0, vFogDepth ) * 0.6;
    fogCol = mix( fogCol, fogCol * vec3( 0.78, 0.93, 1.2 ) + vec3( 0.0, 0.012, 0.035 ), fogAer );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif
`;
}
