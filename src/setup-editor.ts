// Guided setup: the form of each step, the progress bar and the shared placement controls.
import { deskElementControls, monitorShortcuts } from './desk-editor.ts';
import { steps, type SetupProgress } from './project.ts';
import { presets, type CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import type { BooleanSetting, ControlTemplates } from './controls-view.ts';
import { roomControls } from './room-editor.ts';
import { escapeHTML as esc } from './html.ts';

const number = (
  id: string,
  label: string,
  min: number,
  max: number,
  value: string | number = '',
  placeholder = '',
) =>
  `<label class="setup-field" for="${id}">${label}<span><input id="${id}" type="number" min="${min}" max="${max}" step="0.5" required value="${esc(value)}" placeholder="${placeholder}"><small>cm</small></span></label>`;
const ACCESSORIES: [BooleanSetting, string][] = [
  ['monitorEnabled', 'Monitor y brazo'],
  ['keyboardEnabled', 'Teclado'],
  ['pcEnabled', 'PC / torre'],
  ['mouseEnabled', 'Ratón'],
  ['matEnabled', 'Alfombrilla'],
];

export function accessoryControls(toggle: ControlTemplates['toggle']): string {
  return `<div class="control-group"><h3 class="group-title">Accesorios de tu mesa</h3>${ACCESSORIES.map(
    ([key, label]) => toggle(key, label),
  ).join('')}</div>`;
}
export function placementControls(
  target: 'desk' | 'cockpit',
  range: ControlTemplates['range'],
): string {
  return `<div class="control-group"><h3 class="group-title">Posición en la habitación</h3>${range(`${target}X`, 'Posición X') + range(`${target}Z`, 'Posición Z') + range(`${target}Angle`, 'Giro en planta')}<button class="arm-edit-action" data-place="${target}">Colocar en planta ↗</button><p class="layout-hint">Puedes arrastrar el elemento en planta o escribir su posición. Referencia común de la habitación, en cm.</p></div>`;
}
export function creationControls(
  s: CockpitConfig,
  e: CockpitEvaluation,
  setup: SetupProgress,
  target: string,
  { range, toggle, select }: ControlTemplates,
): string {
  const step = setup.step;
  const room = setup.drafts?.room || {},
    desk = setup.drafts?.desk || {};
  let html = '';
  if (step === 'room') {
    html = `<form id="setupRoomForm"><p class="setup-prompt">¿Cuánto mide tu habitación?</p>${number('setupRoomW', 'Ancho', 120, 1200, room.w ?? (s.roomEnabled ? s.roomW : ''), 'Ej. 320')}${number('setupRoomD', 'Fondo', 120, 1200, room.d ?? (s.roomEnabled ? s.roomD : ''), 'Ej. 400')}<details class="room-reference"><summary>Altura del techo</summary>${number('setupRoomH', 'Altura', 180, 400, room.h ?? s.roomH)}<p class="layout-hint">Referencia inicial: 250 cm. Ajusta la altura si la conoces.</p></details><button type="submit" hidden>Continuar</button></form>`;
  } else if (step === 'openings' || step === 'furniture') {
    html = roomControls(s, e, target, range, toggle, { mode: step });
  } else if (step === 'desk') {
    if (s.deskEnabled === false)
      html = `<form id="setupDeskForm"><p class="setup-prompt">Las medidas de tu mesa</p>${number('setupDeskW', 'Ancho del tablero', 120, 200, desk.w ?? '', '120–200')}${number('setupDeskD', 'Fondo del tablero', 60, 80, desk.d ?? '', '60–80')}${number('setupDeskH', 'Altura desde suelo', 66, 131, desk.h ?? '', 'Ej. 75')}<p class="layout-hint">Este configurador admite tableros de 120–200 × 60–80 cm y representa unos pies de referencia de 66 cm de fondo.</p><button type="submit" class="button button-dark">Añadir mesa</button></form>`;
    else
      html = `<div class="control-group"><h3 class="group-title">Tablero de tu mesa</h3>${range('deskWidth', 'Ancho') + range('deskDepth', 'Fondo') + range('deskH', 'Altura')}</div>${accessoryControls(toggle)}${s.monitorEnabled !== false ? `<div class="control-group" id="monitorPositionControls"><h3 class="group-title">Posición del monitor</h3>${monitorShortcuts(s)}</div>` : ''}${deskElementControls(s, e, target, { range, select })}${target === 'arm' ? `<div class="control-group" id="armControls"><h3 class="group-title">Monitor y brazo</h3>${range('armBaseAngle', 'Giro de la base') + range('armElbowAngle', 'Flexión del codo') + range('monitorYaw', 'Giro de la pantalla (VESA)') + range('monitorH', 'Altura centro VESA')}<p class="layout-hint">Arrastra CODO o VESA para mover el monitor con el brazo. La mordaza permanece en el borde del tablero.</p></div>` : ''}`;
  } else if (step === 'cockpit' && s.cockpitEnabled === false) {
    html = `<form id="setupCockpitForm"><label class="setup-field" for="setupPreset">¿Qué quieres montar?<select id="setupPreset" required><option value="">Elige una base</option>${Object.entries(
      presets,
    )
      .map(
        ([id, p]) =>
          `<option value="${id}" ${setup.drafts?.preset === id ? 'selected' : ''}>${esc(p.label)}</option>`,
      )
      .join(
        '',
      )}</select></label><p class="layout-hint">La base aparece al añadirla. Después podrás ajustar chasis, postura y posición.</p><button type="submit" class="button button-dark">Añadir cockpit</button></form>`;
  }
  return html;
}
export function progressHTML(setup: SetupProgress): string {
  return steps
    .map(
      (step, index) =>
        `<button data-step="${step.id}" ${index > setup.furthest ? 'disabled' : ''} ${setup.step === step.id ? 'aria-current="step"' : ''}><span>${index + 1}</span>${step.label}</button>`,
    )
    .join('');
}
