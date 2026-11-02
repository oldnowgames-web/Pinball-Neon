// optionsUI.js — janela de opções reutilizável (menu, garagem e pausa do jogo).
import { S, setOpt, t, applyI18n } from './settings.js';

let dlg = null;
const row = (label, ctrl) => `<label class="orow"><span data-i18n="${label}"></span>${ctrl}</label>`;
const sel = (id, opts) => `<select id="${id}">${opts.map(([v, k]) => `<option value="${v}" data-i18n="${k}"></option>`).join('')}</select>`;
const rng = (id, min, max, step) => `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}">`;
const chk = (id) => `<input type="checkbox" id="${id}">`;

function build() {
  dlg = document.createElement('div'); dlg.className = 'optov';
  dlg.innerHTML = `<div class="optcard" role="dialog" aria-modal="true">
    <h2 data-i18n="options"></h2>
    <section><h3 data-i18n="optGraphics"></h3>
      ${row('optQuality', sel('oQuality', [['auto', 'qAuto'], ['low', 'qLow'], ['med', 'qMed'], ['high', 'qHigh']]))}
      ${row('optTrees', rng('oTrees', 0.5, 1.2, 0.05))}
      ${row('optMirror', chk('oMirror'))}
      ${row('optDamage', chk('oDamage'))}
      ${row('optFx', chk('oFx'))}
      ${row('optCycle', sel('oCycle', [['off', 'cycOff'], ['slow', 'cycSlow'], ['fast', 'cycFast']]))}
    </section>
    <section><h3 data-i18n="optAudio"></h3>
      ${row('optVolume', rng('oVolume', 0, 1, 0.05))}
      ${row('optMusic', rng('oMusic', 0, 1, 0.05))}
    </section>
    <section><h3 data-i18n="optControls"></h3>
      ${row('optSteer', rng('oSteer', 0.6, 1.4, 0.05))}
      ${row('optAuto', chk('oAuto'))}
      ${row('optAbs', chk('oAbs'))}
      ${row('optTc', chk('oTc'))}
      ${row('optStab', sel('oStab', [['0', 'off'], ['0.3', 'normal'], ['0.6', 'hard']]))}
      ${row('optArcade', chk('oArcade'))}
      ${row('optCorner', chk('oCorner'))}
      ${row('optUnits', sel('oUnits', [['kmh', 'normal'], ['mph', 'normal']]))}
      <details><summary data-i18n="keysTitle"></summary><p class="keys2" id="oKeys"></p></details>
    </section>
    <section><h3 data-i18n="optLang"></h3>
      ${row('optLang', `<select id="oLang"><option value="pt">Português</option><option value="en">English</option></select>`)}
    </section>
    <div class="orow end"><button class="pri" id="oClose" data-i18n="close"></button></div>
  </div>`;
  document.body.appendChild(dlg);
  const $ = (id) => dlg.querySelector('#' + id);
  const bind = (id, key, get, conv = (v) => v) => { const el = $(id); el.addEventListener('input', () => setOpt(key, conv(get(el)))); return el; };
  bind('oQuality', 'quality', (e) => e.value); bind('oTrees', 'treeRange', (e) => +e.value); bind('oMirror', 'mirror', (e) => e.checked); bind('oDamage', 'damageHud', (e) => e.checked); bind('oFx', 'fx', (e) => e.checked);
  bind('oCycle', 'cycle', (e) => e.value); bind('oVolume', 'volume', (e) => +e.value); bind('oMusic', 'music', (e) => +e.value); bind('oSteer', 'steerSens', (e) => +e.value);
  bind('oAuto', 'autoGear', (e) => e.checked); bind('oAbs', 'abs', (e) => e.checked); bind('oTc', 'tc', (e) => e.checked); bind('oStab', 'stab', (e) => +e.value); bind('oCorner', 'cornerAssist', (e) => e.checked); bind('oArcade', 'arcade', (e) => e.checked);
  bind('oUnits', 'units', (e) => e.value); bind('oLang', 'lang', (e) => e.value);
  $('oClose').onclick = closeOptions;
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) closeOptions(); });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && dlg.classList.contains('on')) { e.stopPropagation(); closeOptions(); } }, true);
  addEventListener('optionschange', (e) => { if (e.detail === 'lang') $('oKeys').textContent = t('keysList'); });
}
function sync() {
  const $ = (id) => dlg.querySelector('#' + id);
  $('oQuality').value = S.quality; $('oTrees').value = S.treeRange; $('oMirror').checked = S.mirror; $('oDamage').checked = S.damageHud; $('oFx').checked = S.fx; $('oCycle').value = S.cycle;
  $('oVolume').value = S.volume; $('oMusic').value = S.music; $('oSteer').value = S.steerSens; $('oAuto').checked = S.autoGear; $('oAbs').checked = S.abs; $('oTc').checked = S.tc;
  $('oStab').value = String(S.stab); $('oCorner').checked = S.cornerAssist; $('oArcade').checked = S.arcade; $('oUnits').value = S.units; $('oLang').value = S.lang; $('oKeys').textContent = t('keysList');
}
function fixLabels() { const $ = (id) => dlg.querySelector('#' + id); ['0', '0.3', '0.6'].forEach((v, i) => { $('oStab').options[i].textContent = v; }); $('oUnits').options[0].textContent = 'km/h'; $('oUnits').options[1].textContent = 'mph'; }
addEventListener('optionschange', (e) => { if (e.detail === 'lang' && dlg) fixLabels(); });
export function openOptions() { if (!dlg) build(); applyI18n(dlg); fixLabels(); sync(); dlg.classList.add('on'); dlg.querySelector('#oClose').focus(); }
export function closeOptions() { if (dlg) dlg.classList.remove('on'); }
export const optionsOpen = () => !!dlg && dlg.classList.contains('on');
