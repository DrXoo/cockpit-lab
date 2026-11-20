// The Desk panel of the room editor: the desktop, its accessories, the monitor and its arm.
import { round } from './shared/geometry.ts';
import { bindControls, groupHTML as group, type ControlView } from './controls-view.ts';
import { accessoryControls } from './setup-editor.ts';
import { armPosesHTML, deskElementControls } from './desk-editor.ts';

/** The reach that the arm's two segments allow, as the hint under their lengths says it. */
export const armReachHint = ({ minReach, maxReach }: { minReach: number; maxReach: number }) =>
  `The first segment runs from the mount to the elbow, the second from the elbow to the VESA plate. Reach from ${round(minReach)} to ${round(maxReach)} cm in the plan. An elbow at 0° keeps the arm straight; ±180° folds it.`;

/** `selectedPose` is the arm pose last chosen, saved or updated, or '' for none. */
export function deskPanelHTML(view: ControlView, layoutTarget: string, selectedPose = ''): string {
  const { range, toggle, select } = bindControls(view);
  const { state, evaluation } = view;
  let html = '';
  html += accessoryControls(toggle);
  const size = `${state.deskWidth}x${state.deskDepth}`;
  html += group(
    'Desktop',
    `<div class="select-control"><label for="deskSizePreset">Quick size</label><select id="deskSizePreset"><option value="custom">Custom</option>${['120x60', '120x80', '140x60', '140x80', '160x80', '180x80', '200x80'].map((value) => `<option value="${value}" ${value === size ? 'selected' : ''}>${value.replace('x', ' × ')} cm</option>`).join('')}</select></div>` +
      range('deskWidth', 'Desktop width') +
      range('deskDepth', 'Desktop depth') +
      '<p class="layout-hint">Width × depth. Items keep their size and move back onto the desktop when they fit. The reference legs stay 66 cm deep.</p>',
    'Width × depth',
  );
  if (state.monitorEnabled !== false) {
    html += group(
      'Monitor and arm',
      armPosesHTML(state, selectedPose) +
        `<button class="arm-edit-action" id="armControlsDragBtn">Edit the joints in the plan ↗</button>` +
        range('armBaseAngle', 'Base rotation') +
        range('armElbowAngle', 'Elbow bend') +
        range('monitorYaw', 'Screen rotation (VESA)') +
        select('armBend', 'Bend direction', [
          ['positive', 'Elbow to one side'],
          ['negative', 'Elbow to the other side'],
        ]) +
        range('monitorH', 'VESA center height') +
        range('monitorInches', 'Screen diagonal') +
        '<p class="layout-hint">Drag <b>ELBOW</b> to turn the first segment or <b>VESA</b> to move the end. The rotation controls switch to manual mode. The automatic positions work out the angles towards a target; save a pose to keep the angles you choose, and update it after moving the arm.</p>',
    ).replace('<div class="control-group">', '<div class="control-group" id="armControls">');
    html += group(
      'Arm dimensions',
      range('armFirstSegment', 'First segment') +
        range('armSecondSegment', 'Second segment') +
        `<p class="layout-hint" id="armLengths">${armReachHint(evaluation.armPose)}</p>` +
        range('armMinH', 'Minimum VESA height') +
        range('armMaxH', 'Maximum VESA height'),
      'Generic 2-segment model',
    );
  }
  html += deskElementControls(state, evaluation, layoutTarget, { range, select });
  html += group('Desk height', range('deskH', 'Desktop height'), 'Height from the floor');
  html += '<button class="arm-edit-action" id="goRoom">Room, doors and furniture ↗</button>';
  html +=
    '<p class="control-hint">The room stays fixed as you move and turn the desk. The arm keeps two segments of fixed length and checks its minimum/maximum reach and VESA height. Rotations are in the plan; check the stops and loads of the real model. Diagonal in inches (″), everything else in cm. Set up walls, doors, windows and furniture in the Room tab.</p>';
  return html;
}
