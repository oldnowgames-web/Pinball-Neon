// settings.js — opções do jogador (guardadas no navegador) e tradução (pt/en).
const KEY = 'opts_v1';
export const DEFAULTS = { lang: 'pt', volume: 0.8, music: 0.5, quality: 'auto', treeRange: 1, steerSens: 1, autoGear: true, abs: true, tc: true, stab: 0.6, cornerAssist: true, arcade: true, units: 'kmh', mirror: true, cycle: 'slow', damageHud: true, fx: true };
export const S = (() => { try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...DEFAULTS }; } })();
export const saveSettings = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
export const setOpt = (k, v) => { S[k] = v; saveSettings(); dispatchEvent(new CustomEvent('optionschange', { detail: k })); };

const D = {
  pt: {
    appTitle: 'CORRIDA', tagline: 'Simulador de corrida', start: 'Iniciar', pressKey: 'Pressione Enter ou Espaço', options: 'Opções', close: 'Fechar',
    garage: 'Garagem', car: 'Carro', color: 'Cor', otherColor: 'Outra cor', finish: 'Acabamento', demo: 'Demonstração', headlights: 'Faróis', brake: 'Freio', spin: 'Rodar',
    dragHint: 'Arraste para girar · roda do mouse para aproximar', race: 'Corrida', mode: 'Modo', modeRace: 'Corrida contra bots', modeTT: 'Contra-relógio (fantasma)', modeChamp: 'Campeonato (3 pistas)',
    track: 'Pista', reverse: 'Sentido inverso', laps: 'Voltas', difficulty: 'Dificuldade', easy: 'Fácil', normal: 'Normal', hard: 'Difícil', back: 'Voltar', ready: 'Pronto', record: 'Recorde', noRecord: 'sem recorde',
    champNote: 'O campeonato percorre todas as pistas e soma pontos.',
    optGraphics: 'Gráficos', optQuality: 'Qualidade', qAuto: 'Automática', qLow: 'Baixa', qMed: 'Média', qHigh: 'Alta', optTrees: 'Alcance das árvores', optMirror: 'Retrovisor', optCycle: 'Ciclo de horário', cycOff: 'Desligado', cycSlow: 'Lento', cycFast: 'Rápido', optDamage: 'Indicador de dano', optFx: 'Realismo extra (reflexos, raios de sol, cor de cinema)',
    optAudio: 'Som', optVolume: 'Volume geral', optMusic: 'Música dos menus', optControls: 'Controles', optSteer: 'Sensibilidade da direção', optAuto: 'Câmbio automático', optAbs: 'ABS', optTc: 'Controle de tração', optStab: 'Estabilidade', optCorner: 'Ajuda nas curvas (soltar o acelerador já freia)', optArcade: 'Direção fácil (arcade, como no Old Racers)', optUnits: 'Unidade de velocidade', optLang: 'Idioma', keysTitle: 'Ver teclas',
    keysList: 'Y replay · H modo foto · W/S acelera/freia · A/D direção · Espaço freio de mão · Shift nitro · E/Q marchas · T câmbio · Z ABS · X tração · V estabilidade · C câmera · B retrovisor · N reiniciar · R voltar à pista · 1–4 hora do dia · G chuva · M mudo · P pausa',
    off: 'desligado', ready2: 'Pronto para largar', begin: 'Começar', pause: 'Pausa', resume: 'Continuar', restart: 'Reiniciar corrida',
    kAccel: 'acelerar / frear e ré', kSteer: 'esquerda / direita', kHand: 'freio de mão', kNitro: 'nitro', kGears: 'marcha acima / abaixo (modo manual)', kGear: 'câmbio automático ou manual', kAssists: 'ABS · controle de tração · estabilidade', kCam: 'câmera', kReset: 'voltar para a pista', kClock: 'hora do dia · chuva', kMute: 'mudo · pausa', kMirror: 'retrovisor', kRestart: 'reiniciar a corrida',
    padHelp: 'Controle (gamepad): analógico, RT acelera, LT freia, RB / LB marchas, A nitro, X freio de mão.',
    lap: 'Volta', best: 'Melhor', finish2: 'Chegada', go: 'Largou!', damage: 'Dano', ghost: 'Fantasma',
    result: 'Resultado', driver: 'Piloto', time: 'Tempo', bestLap: 'Melhor volta', points: 'Pts', total: 'Total', again: 'Correr de novo', nextRace: 'Próxima corrida', champEnd: 'Classificação final', newChamp: 'Novo campeonato', podium: 'Pódio', laps2: 'Voltas', round: 'Corrida', of: 'de',
    tLap: (n, t) => `Volta ${n}: ${t}`, tBestLap: 'melhor volta', tFinished: (p) => `Chegou em ${p}º`, tNewRecord: 'Novo recorde!', tBackOnTrack: 'Voltou para a pista', tCam: 'Câmera', tGearAuto: 'Câmbio automático', tGearManual: 'Câmbio manual', tAbs: (o) => 'ABS ' + (o ? 'ligado' : 'desligado'), tTc: (o) => 'Controle de tração ' + (o ? 'ligado' : 'desligado'), tStab: 'Estabilidade', tRain: 'Chuva', tNoRain: 'Sem chuva', tBright: 'Brilho', tSoundOff: 'Som desligado', tSoundOn: 'Som ligado', tRestart: 'Corrida reiniciada', tMirrorOn: 'Retrovisor ligado', tMirrorOff: 'Retrovisor desligado',
    cams: ['Perseguição', 'Capô', 'Para-choque', 'Aérea'], skills: { rafa: 'agressivo', duda: 'cauteloso', leo: 'equilibrado', bia: 'agressiva', caio: 'errático' },
    arrowL: 'curva à esquerda', arrowR: 'curva à direita', hairpin: 'grampo', loading: 'Carregando…',
  },
  en: {
    appTitle: 'RACING', tagline: 'Racing simulator', start: 'Start', pressKey: 'Press Enter or Space', options: 'Options', close: 'Close',
    garage: 'Garage', car: 'Car', color: 'Color', otherColor: 'Custom color', finish: 'Finish', demo: 'Demo', headlights: 'Headlights', brake: 'Brake', spin: 'Rotate',
    dragHint: 'Drag to rotate · mouse wheel to zoom', race: 'Race', mode: 'Mode', modeRace: 'Race against bots', modeTT: 'Time trial (ghost)', modeChamp: 'Championship (3 tracks)',
    track: 'Track', reverse: 'Reverse direction', laps: 'Laps', difficulty: 'Difficulty', easy: 'Easy', normal: 'Normal', hard: 'Hard', back: 'Back', ready: 'Ready', record: 'Record', noRecord: 'no record',
    champNote: 'The championship runs every track and adds up points.',
    optGraphics: 'Graphics', optQuality: 'Quality', qAuto: 'Automatic', qLow: 'Low', qMed: 'Medium', qHigh: 'High', optTrees: 'Tree draw distance', optMirror: 'Rear-view mirror', optCycle: 'Time-of-day cycle', cycOff: 'Off', cycSlow: 'Slow', cycFast: 'Fast', optDamage: 'Damage indicator', optFx: 'Extra realism (reflections, sun rays, film look)',
    optAudio: 'Sound', optVolume: 'Master volume', optMusic: 'Menu music', optControls: 'Controls', optSteer: 'Steering sensitivity', optAuto: 'Automatic gearbox', optAbs: 'ABS', optTc: 'Traction control', optStab: 'Stability', optCorner: 'Corner assist (lifting off the throttle brakes for you)', optArcade: 'Easy driving (arcade)', optUnits: 'Speed unit', optLang: 'Language', keysTitle: 'Show keys',
    keysList: 'W/S throttle/brake · A/D steer · Space handbrake · Shift nitro · E/Q gears · T gearbox · Z ABS · X traction · V stability · C camera · B mirror · N restart · R back on track · 1–4 time of day · G rain · M mute · P pause',
    off: 'off', ready2: 'Ready to start', begin: 'Begin', pause: 'Paused', resume: 'Resume', restart: 'Restart race',
    kAccel: 'throttle / brake and reverse', kSteer: 'left / right', kHand: 'handbrake', kNitro: 'nitro', kGears: 'gear up / down (manual mode)', kGear: 'automatic or manual gearbox', kAssists: 'ABS · traction control · stability', kCam: 'camera', kReset: 'back on track', kClock: 'time of day · rain', kMute: 'mute · pause', kMirror: 'rear-view mirror', kRestart: 'restart the race',
    padHelp: 'Gamepad: left stick, RT throttle, LT brake, RB / LB gears, A nitro, X handbrake.',
    lap: 'Lap', best: 'Best', finish2: 'Finished', go: 'Go!', damage: 'Damage', ghost: 'Ghost',
    result: 'Results', driver: 'Driver', time: 'Time', bestLap: 'Best lap', points: 'Pts', total: 'Total', again: 'Race again', nextRace: 'Next race', champEnd: 'Final standings', newChamp: 'New championship', podium: 'Podium', laps2: 'Laps', round: 'Race', of: 'of',
    tLap: (n, t) => `Lap ${n}: ${t}`, tBestLap: 'best lap', tFinished: (p) => `Finished ${p}${['th', 'st', 'nd', 'rd'][p] && ![11, 12, 13].includes(p) ? ['th', 'st', 'nd', 'rd'][p] : 'th'}`, tNewRecord: 'New record!', tBackOnTrack: 'Back on track', tCam: 'Camera', tGearAuto: 'Automatic gearbox', tGearManual: 'Manual gearbox', tAbs: (o) => 'ABS ' + (o ? 'on' : 'off'), tTc: (o) => 'Traction control ' + (o ? 'on' : 'off'), tStab: 'Stability', tRain: 'Rain', tNoRain: 'No rain', tBright: 'Brightness', tSoundOff: 'Sound off', tSoundOn: 'Sound on', tRestart: 'Race restarted', tMirrorOn: 'Mirror on', tMirrorOff: 'Mirror off',
    cams: ['Chase', 'Hood', 'Bumper', 'Aerial'], skills: { rafa: 'aggressive', duda: 'cautious', leo: 'balanced', bia: 'aggressive', caio: 'erratic' },
    arrowL: 'left turn', arrowR: 'right turn', hairpin: 'hairpin', loading: 'Loading…',
  },
};
export function t(k, ...a) { const v = (D[S.lang] && D[S.lang][k] !== undefined) ? D[S.lang][k] : D.pt[k]; return typeof v === 'function' ? v(...a) : v === undefined ? k : v; }
/** traduz todos os elementos [data-i18n] (texto) da página */
export function applyI18n(root = document) {
  document.documentElement.lang = S.lang === 'en' ? 'en' : 'pt-BR';
  root.querySelectorAll('[data-i18n]').forEach((el) => { const v = t(el.dataset.i18n); if (typeof v === 'string') el.textContent = v; });
}
addEventListener('optionschange', (e) => { if (e.detail === 'lang') applyI18n(); });
