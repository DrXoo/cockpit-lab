// Guided setup: the form of each step, the progress bar and the shared placement controls.
import { armPosesHTML, deskElementControls } from './desk-editor.ts';
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
  ['monitorEnabled', 'Monitor and arm'],
  ['keyboardEnabled', 'Keyboard'],
  ['pcEnabled', 'PC / tower'],
  ['mouseEnabled', 'Mouse'],
  ['matEnabled', 'Desk mat'],
];

export function accessoryControls(toggle: ControlTemplates['toggle']): string {
  return `<div class="control-group"><h3 class="group-title">Your desk accessories</h3>${ACCESSORIES.map(
    ([key, label]) => toggle(key, label),
  ).join('')}</div>`;
}
export function placementControls(
  target: 'desk' | 'cockpit',
  range: ControlTemplates['range'],
): string {
  return `<div class="control-group"><h3 class="group-title">Position in the room</h3>${range(`${target}X`, 'X position') + range(`${target}Z`, 'Z position') + range(`${target}Angle`, 'Rotation in the plan')}<button class="arm-edit-action" data-place="${target}">Place in the plan ↗</button><p class="layout-hint">Drag the item in the plan or type its position. Shared room reference, in cm.</p></div>`;
}
export function creationControls(
  s: CockpitConfig,
  e: CockpitEvaluation,
  setup: SetupProgress,
  target: string,
  { range, toggle, select }: ControlTemplates,
  /** The arm pose last chosen, saved or updated, or '' for none. */
  selectedPose = '',
): string {
  const step = setup.step;
  const room = setup.drafts?.room || {},
    desk = setup.drafts?.desk || {};
  let html = '';
  if (step === 'room') {
    html = `<form id="setupRoomForm"><p class="setup-prompt">How big is your room?</p>${number('setupRoomW', 'Width', 120, 1200, room.w ?? (s.roomEnabled ? s.roomW : ''), 'E.g. 320')}${number('setupRoomD', 'Depth', 120, 1200, room.d ?? (s.roomEnabled ? s.roomD : ''), 'E.g. 400')}<details class="room-reference"><summary>Ceiling height</summary>${number('setupRoomH', 'Height', 180, 400, room.h ?? s.roomH)}<p class="layout-hint">Starting reference: 250 cm. Adjust the height if you know it.</p></details><button type="submit" hidden>Continue</button></form>`;
  } else if (step === 'openings' || step === 'furniture') {
    html = roomControls(s, e, target, range, toggle, { mode: step });
  } else if (step === 'desk') {
    if (s.deskEnabled === false)
      html = `<form id="setupDeskForm"><p class="setup-prompt">Your desk dimensions</p>${number('setupDeskW', 'Desktop width', 120, 200, desk.w ?? '', '120–200')}${number('setupDeskD', 'Desktop depth', 60, 80, desk.d ?? '', '60–80')}${number('setupDeskH', 'Height from the floor', 66, 131, desk.h ?? '', 'E.g. 75')}<p class="layout-hint">This configurator supports desktops of 120–200 × 60–80 cm and draws reference legs 66 cm deep.</p><button type="submit" class="button button-dark">Add desk</button></form>`;
    else
      html = `<div class="control-group"><h3 class="group-title">Your desktop</h3>${range('deskWidth', 'Width') + range('deskDepth', 'Depth') + range('deskH', 'Height')}</div>${accessoryControls(toggle)}${s.monitorEnabled !== false ? `<div class="control-group" id="monitorPositionControls"><h3 class="group-title">Monitor position</h3>${armPosesHTML(s, selectedPose)}</div>` : ''}${deskElementControls(s, e, target, { range, select })}${target === 'arm' ? `<div class="control-group" id="armControls"><h3 class="group-title">Monitor and arm</h3>${range('armBaseAngle', 'Base rotation') + range('armElbowAngle', 'Elbow bend') + range('monitorYaw', 'Screen rotation (VESA)') + range('monitorH', 'VESA center height')}<p class="layout-hint">Drag ELBOW or VESA to move the monitor with the arm. The clamp stays on the edge of the desktop.</p></div>` : ''}`;
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
