// postfx.js — passes finais.
//  1) makePost()  (antes do tone mapping, em HDR): desfoque de movimento pela velocidade (radial) e pela rotação da câmera
//     (nas curvas), raios de sol e gotas de chuva na lente.
//  2) makeFinal() (depois do tone mapping): aberração cromática nas bordas, correção de cor (contraste, saturação,
//     tons frios nas sombras / quentes nas luzes), vinheta natural e granulação de filme.
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function makePost() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uSpeed: { value: 0 }, uRain: { value: 0 }, uAspect: { value: 1 }, uVig: { value: 0 },
      uYaw: { value: 0 }, uSun: { value: [0.5, 0.5] }, uRays: { value: 0 }, uSunCol: { value: [1.0, 0.86, 0.66] },
    },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime, uSpeed, uRain, uAspect, uVig, uYaw, uRays; uniform vec2 uSun; uniform vec3 uSunCol; varying vec2 vUv;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      vec2 drops(vec2 uv){
        vec2 off = vec2(0.0);
        for (int L = 0; L < 2; L++) {
          float sc = L == 0 ? 7.0 : 13.0;
          vec2 g = vec2(uv.x * uAspect, uv.y) * sc;
          vec2 id = floor(g), f = fract(g) - 0.5;
          float r0 = h21(id + float(L) * 19.7);
          if (r0 > uRain * 0.6) continue;
          float t = fract(uTime * (0.03 + 0.05 * r0) + r0 * 7.0);
          vec2 c = vec2(h21(id + 3.1) - 0.5, h21(id + 8.3) - 0.5) * 0.45;
          c.y -= t * 0.18;
          float rad = (0.14 + 0.12 * r0) * smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.82, 1.0, t));
          vec2 d = f - c; float l = length(d);
          float m = smoothstep(rad, rad * 0.6, l);
          off += -d / sc * 0.9 * m * vec2(1.0 / uAspect, 1.0);
        }
        return off;
      }
      void main(){
        vec2 uv = vUv;
        if (uRain > 0.01) uv += drops(uv);
        // ponto de fuga e máscara que preserva o carro (nítido) enquanto o cenário borra
        vec2 cc = vUv - vec2(0.5, 0.45);
        float r = length(cc * vec2(uAspect, 1.0));
        float carMask = smoothstep(0.10, 0.34, length((vUv - vec2(0.5, 0.30)) * vec2(uAspect, 1.0)));
        float amt = uSpeed * smoothstep(0.30, 1.0, r) * 0.06;
        vec2 smear = vec2(uYaw * 0.022 * carMask, 0.0);
        vec3 col = vec3(0.0);
        for (int i = 0; i < 9; i++) {
          float t = float(i) / 8.0;
          col += texture2D(tDiffuse, uv - cc * amt * t + smear * (t - 0.5)).rgb;
        }
        col /= 9.0;
        // raios de sol: espalha o brilho forte (disco do sol / céu) em direção ao pixel
        if (uRays > 0.01) {
          vec2 d = uSun - vUv;
          float dl = length(d * vec2(uAspect, 1.0));
          float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          vec3 acc = vec3(0.0);
          for (int i = 0; i < 12; i++) {
            float t = (float(i) + jit) / 12.0;
            vec3 sc = texture2D(tDiffuse, vUv + d * t * 0.92).rgb;
            float l = dot(sc, vec3(0.299, 0.587, 0.114));
            // o disco do sol tem brilho enorme (HDR): limita a cor de cada amostra para os raios não inundarem a tela
            acc += min(sc, vec3(1.6)) * smoothstep(0.9, 3.0, min(l, 6.0)) * (1.0 - t);
          }
          col += min(acc / 12.0 * uRays * exp(-dl * 1.7) * uSunCol, vec3(0.28));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return { pass, u: pass.uniforms };
}

export function makeFinal() {
  const pass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 }, uGrain: { value: 0.035 }, uCA: { value: 0.0045 }, uVig: { value: 0.32 }, uContrast: { value: 1.06 }, uSat: { value: 1.08 }, uSpeed: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime, uAspect, uGrain, uCA, uVig, uContrast, uSat, uSpeed; varying vec2 vUv;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main(){
        vec2 c = vUv - 0.5;
        vec2 ca = c * vec2(uAspect, 1.0);
        float r2 = dot(ca, ca);
        float k = uCA * r2 * 2.2;
        vec3 col = vec3(texture2D(tDiffuse, vUv - c * k).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + c * k).b);
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = (col - 0.5) * uContrast + 0.5;
        col = mix(vec3(l), col, uSat);
        col += vec3(0.012, 0.006, -0.012) * smoothstep(0.5, 1.0, l) + vec3(-0.008, 0.002, 0.012) * (1.0 - smoothstep(0.0, 0.5, l));
        col *= 1.0 - smoothstep(0.45, 1.1, sqrt(r2) * 1.35) * uVig * (0.8 + 0.2 * uSpeed);
        float g = h21(vUv * vec2(uAspect, 1.0) * 1000.0 + fract(uTime) * 37.0) - 0.5;
        col += g * uGrain * (1.0 - l * 0.55);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`,
  });
  return { pass, u: pass.uniforms };
}
