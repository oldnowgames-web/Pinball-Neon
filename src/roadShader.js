// roadShader.js — asfalto mais real, tudo em shader (sem textura nova, sem custo de memória):
// variação de brilho, remendos de asfalto novo, rachaduras, trilha de borracha na linha de corrida, manchas de óleo,
// poças de água (quando chove) e sombras de nuvens passando.
import { FX } from './fxShared.js';

export function patchRoad(mat, noiseTex) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tNoise = { value: noiseTex }; sh.uniforms.uRWet = FX.rwet; sh.uniforms.uCloud = FX.cloud; sh.uniforms.uCT = FX.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tNoise; uniform float uRWet; uniform float uCloud; uniform float uCT; varying vec3 vRW;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float gRub = 0.0; float gOil = 0.0; float gPud = 0.0;
{
  vec2 wp = vRW.xz;
  float n1 = texture2D(tNoise, wp * 0.009).r;
  float n2 = texture2D(tNoise, wp * 0.031 + vec2(7.3, 2.1)).r;
  float n3 = texture2D(tNoise, wp * 0.0035 + vec2(3.1, 9.7)).r;
  float n4 = texture2D(tNoise, wp * 0.018 + vec2(11.7, 5.3)).r;
  float hi = texture2D(tNoise, wp * 0.7).r;
  float crkN = texture2D(tNoise, wp * 0.22 + vec2(1.7, 4.9)).r;
  float u = vMapUv.x;
  float shade = 0.84 + 0.30 * n1;
  float pat = smoothstep(0.60, 0.63, n2) * (1.0 - smoothstep(0.80, 0.84, n2));
  shade *= 1.0 - 0.16 * pat;
  float crk = (1.0 - smoothstep(0.0, 0.014, abs(crkN - 0.5))) * smoothstep(0.50, 0.64, n1);
  shade *= 1.0 - 0.5 * crk;
  float d1 = (u - 0.34) / 0.075; float d2 = (u - 0.66) / 0.075;
  float rub = clamp((exp(-d1 * d1) + exp(-d2 * d2)) * (0.55 + 1.1 * (n3 - 0.25)), 0.0, 1.0);
  shade *= 1.0 - 0.2 * rub;
  float oil = smoothstep(0.70, 0.76, n3 + 0.1 * n4) * clamp(rub * 0.7 + 0.2, 0.0, 1.0);
  shade *= 1.0 - 0.4 * oil;
  shade *= 0.92 + 0.16 * hi;
  float pth = mix(0.80, 0.50, smoothstep(0.35, 0.9, uRWet));
  float pud = smoothstep(pth, pth + 0.035, n4) * smoothstep(0.3, 0.6, uRWet);
  shade *= 1.0 - 0.35 * pud;
  float cs = texture2D(tNoise, wp * 0.0016 + vec2(uCT * 0.012, uCT * 0.005)).r;
  shade *= 1.0 - uCloud * 0.35 * smoothstep(0.50, 0.64, cs);
  diffuseColor.rgb *= shade;
  gRub = rub; gOil = oil; gPud = pud;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - 0.16 * gRub, 0.04, 1.0);
roughnessFactor = mix(roughnessFactor, 0.32, gOil);
roughnessFactor = mix(roughnessFactor, 0.035, gPud);`);
  };
  mat.customProgramCacheKey = () => 'road-v2';
}
