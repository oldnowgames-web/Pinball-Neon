// carData.js — catálogo dos carros e "tabela de peças" de cada GLB.
//
// Convenção do jogo: +Z é a frente do carro, +X é a esquerda, +Y é para cima, unidades em metros.
// Cada carro descreve COMO achar as peças no GLB (nomes de nós / materiais) para o carregador montar:
// rodas (giram e esterçam), pintura (troca de cor), vidros, luzes e pneus.
//
// Nomes podem ser texto exato ou RegExp. (O GLTFLoader remove pontos dos nomes de nós: "Rim1.001" vira "Rim1001".)

export const CAR_LIST = [
  {
    id: 'aventador',
    name: 'Aventador',
    file: 'assets/cars/aventador.glb',
    length: 4.84,
    rotY: 0,
    defaultColor: '#f2b705',
    wheels: [
      { node: /Wheel_FL$/, front: true,  left: true  },
      { node: /Wheel_FR$/, front: true,  left: false },
      { node: /Wheel_RL$/, front: false, left: true  },
      { node: /Wheel_RR$/, front: false, left: false },
    ],
    paint: { mode: 'mask', ref: '#ffbe00', mats: [/BodySG$/] },
    glass: [/GlassSG$/],
    // Pintura, rodas e frisos usam o mesmo material (textura). As luzes estão só na textura (sem emissão).
  },
  {
    id: 'camaro',
    name: 'Camaro ZL1',
    file: 'assets/cars/camaro.glb',
    length: 4.2,             // o modelo é mais largo que o carro real; 4,2 m mantém as rodas em tamanho coerente
    rotY: 1.0559,            // o modelo vem girado ~60° na cena; corrigido aqui (estimado por análise, falta conferir na tela)
    beta: true,              // rodas não são peças separadas: não giram
    defaultColor: '#b3121b',
    wheels: null,
    paint: { mode: 'solid', mats: ['mat8'] },
    glass: ['mat17'],
    tires: ['mat23'],
    rims: ['mat22'],
  },
  {
    id: 'hatch',
    name: 'Hatch esportivo',
    file: 'assets/cars/hatch.glb',
    length: 4.46,
    rotY: 0,
    defaultColor: '#14213d',
    // as rodas são 4 aros (Rim*) + 4 pneus (Rubber*), pareados pela posição
    wheels: { pairNodes: [/^Rim/, /^Rubber/] },
    paint: { mode: 'solid', mats: ['Mat_M3Body'] },
    glass: ['Window glass'],
    tires: ['MatRubber'],
    rims: ['Rim'],
    metals: ['Mat_Dics', 'InsideScrews', 'OuterNuts'],
    discs: ['Mat_Dics'],
    lights: { splitMat: 'Mat_Lights' },   // um material só para faróis e lanternas: separa por frente/trás
  },
  {
    id: 'sport_orange',
    name: 'Esportivo A',
    file: 'assets/cars/sport_orange.glb',
    length: 4.0,
    rotY: 0,
    defaultColor: '#e8590c',
    wheels: [
      { node: /FrontLeftWheel/,  front: true,  left: true  },
      { node: /FrontRightWheel/, front: true,  left: false },
      { node: /BackWheels/,      pair: true },
    ],
    paint: { mode: 'solid', mats: [['Orange', 1], ['DarkOrange', 0.82]] },
    glass: ['Windows'],
    tires: ['Black'],
    rims: ['Grey'],
    lights: { head: ['Headlights'], tail: ['TailLights'] },
  },
  {
    id: 'sport_white',
    name: 'Esportivo B',
    file: 'assets/cars/sport_white.glb',
    length: 4.0,
    rotY: 0,
    defaultColor: '#f3f1ec',
    wheels: [
      { node: /FrontLeftWheel/,  front: true,  left: true  },
      { node: /FrontRightWheel/, front: true,  left: false },
      { node: /BackWheels/,      pair: true },
    ],
    paint: { mode: 'solid', mats: ['White'] },
    glass: ['Windows'],
    tires: ['Black'],
    rims: ['Grey'],
    lights: { head: ['Headlights'], tail: ['TailLights'] },
  },
  {
    id: 'sport_atlas',
    name: 'Esportivo C',
    file: 'assets/cars/sport_atlas.glb',
    length: 4.3,
    rotY: 0,
    defaultColor: '#daa700',
    wheels: [
      { node: /^FrontWheel_L$/, front: true,  left: true  },
      { node: /^FrontWheel_R$/, front: true,  left: false },
      { node: /^BackWheels$/,   pair: true },
    ],
    paint: { mode: 'mask', ref: '#daa700', mats: ['Atlas'] },
    lights: { head: ['Headlights'], tail: ['BrakeLight'] },
  },
];
