// carSpecs.js — dados físicos de cada carro (massa, motor, câmbio, tração, pneus, aerodinâmica).
// Os números são de carros reais de referência, ajustados para ficar divertido no teclado. Edite à vontade.
//   mass kg · power kW (pico) · redline rpm · drive 'RWD'|'AWD'|'FWD' · cg (altura do centro de gravidade, m)
//   front = fração do peso sobre o eixo dianteiro · mu = aderência base dos pneus · cdA/clA = arrasto e downforce (m²)
export const SPECS = {
  aventador:   { rearGrip: 1.16, mass: 1625, power: 565, redline: 8500, idle: 950,  drive: 'AWD', awdFront: 0.3, gears: [3.91, 2.44, 1.81, 1.46, 1.19, 0.97, 0.78], final: 3.2,  cg: 0.45, front: 0.43, mu: 1.55, cdA: 0.76, clA: 0.95, aeroFront: 0.42, brakeG: 1.45 },
  camaro:      { mass: 1760, power: 485, redline: 6600, idle: 800,  drive: 'RWD', gears: [2.66, 1.78, 1.30, 1.00, 0.74, 0.50], final: 3.73, cg: 0.55, front: 0.53, mu: 1.38, cdA: 0.72, clA: 0.35, aeroFront: 0.5,  brakeG: 1.25 },
  hatch:       { mass: 1450, power: 235, redline: 7000, idle: 850,  drive: 'AWD', awdFront: 0.4, gears: [3.62, 2.19, 1.52, 1.12, 0.88, 0.72], final: 3.9,  cg: 0.55, front: 0.58, mu: 1.32, cdA: 0.66, clA: 0.10, aeroFront: 0.5,  brakeG: 1.15 },
  sport_orange:{ mass: 1150, power: 220, redline: 7800, idle: 900,  drive: 'RWD', gears: [3.45, 2.20, 1.55, 1.18, 0.95, 0.78], final: 3.9,  cg: 0.48, front: 0.47, mu: 1.40, cdA: 0.58, clA: 0.20, aeroFront: 0.45, brakeG: 1.25 },
  sport_white: { mass: 1300, power: 260, redline: 7600, idle: 900,  drive: 'RWD', gears: [3.50, 2.20, 1.58, 1.20, 0.96, 0.78], final: 3.8,  cg: 0.5,  front: 0.48, mu: 1.40, cdA: 0.62, clA: 0.25, aeroFront: 0.45, brakeG: 1.25 },
  sport_atlas: { mass: 1400, power: 300, redline: 7400, idle: 900,  drive: 'RWD', gears: [3.40, 2.15, 1.55, 1.20, 0.98, 0.80], final: 3.7,  cg: 0.5,  front: 0.48, mu: 1.42, cdA: 0.66, clA: 0.30, aeroFront: 0.45, brakeG: 1.3 },
};
