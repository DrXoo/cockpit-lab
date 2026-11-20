// The inspector of the selected step: the values of the operation that made a part, the fields
// of each kind of part in its own module, with the part's joints; and, while fitting, the locked
// frame with the adjustment a part may slide along.
import { faceAxis } from '../cad/parts/assembly.ts';
import type { JointOfPart } from '../cad/history/fastening.ts';
import {
  ADJUSTMENT_GUIDES,
  AXES,
  isAdjustable,
  MAX_TRAVEL_MM,
  operationMaking,
  stepTitle,
  type AdjustableOperation,
  type Adjustment,
  type AdjustmentGuide,
  type Operation,
} from '../cad/history/history.ts';
import { round } from '../../shared/geometry.ts';
import { escapeHTML } from '../../ui/html.ts';
import { AXIS_NAMES, connectorCountText, nameOf } from './design-text.ts';
import { footFieldsHTML } from './foot-view.ts';
import { jointsHTML, type TouchingPart } from './joints-view.ts';
import type { AdjustmentField } from './part-fields.ts';
import { isAPeripheral, type Mode } from './part-tools.ts';
import { peripheralInspectorHTML } from './peripheral-view.ts';
import { plateFieldsHTML } from './plate-view.ts';
import { profileFieldsHTML } from './profile-view.ts';

/**
 * The inspector of the selected step: the values of the operation that made a part, with what
 * can be done with that part, or the part a removal takes away. A failed step says why, and its
 * values can still be changed to fix it.
 */
export function partInspectorHTML(
  history: readonly Operation[],
  operation: Operation | undefined,
  failure?: string,
  joints: readonly JointOfPart[] = [],
  touching: readonly TouchingPart[] = [],
  { fitting = false }: Mode = {},
): string {
  if (!operation)
    return `<p class="control-hint" id="noPartSelected">Select a part in the view or in the design history to edit it.</p>`;
  if (fitting && !isAPeripheral(operation)) return lockedStepHTML(history, operation, failure);
  const deleteStep = `<button class="button button-light" id="deleteStep" title="Take this step out of the whole history"><i data-icon="trash"></i>Delete this step</button>`;
  const failed =
    failure === undefined
      ? ''
      : `<p class="layout-hint part-warning">⚠ Failed: ${escapeHTML(failure)} It adds nothing until it applies again.</p>`;
  switch (operation.kind) {
    case 'remove-part':
      return `<div class="part-inspector" id="partInspectorFields"><p class="layout-hint">Removes <strong>${escapeHTML(nameOf(history, operation.removedId))}</strong> from this step on: the parts that hung from it stay where they are, anchored, and spans that reached it keep their length. Earlier steps still have it.</p>${failed}<div class="grow-actions">${deleteStep}</div></div>`;
    case 'fasten-joint':
      return `<div class="part-inspector" id="partInspectorFields"><p class="layout-hint">Puts ${escapeHTML(connectorCountText(operation))} on the joint of <strong>${escapeHTML(nameOf(history, operation.partId))}</strong> to <strong>${escapeHTML(nameOf(history, operation.toPartId))}</strong>. Change its connectors from the inspector of either part.</p>${failed}<div class="grow-actions">${deleteStep}</div></div>`;
    case 'join-parts':
      return `<div class="part-inspector" id="partInspectorFields"><p class="layout-hint">Joins <strong>${escapeHTML(nameOf(history, operation.partId))}</strong> to <strong>${escapeHTML(nameOf(history, operation.toPartId))}</strong>, which it touches, so the joint can take connectors and carries support. Fasten it from the inspector of either part.</p>${failed}<div class="grow-actions">${deleteStep}</div></div>`;
    case 'mount-peripheral':
      return `<div class="part-inspector" id="partInspectorFields">${failed}${peripheralInspectorHTML(history, operation)}${fitting ? adjustmentHTML(history, operation) : ''}<div class="part-actions">${deleteStep}</div></div>`;
    case 'add-foot':
      return partFieldsHTML(footFieldsHTML(history, operation));
    case 'add-plate':
      return partFieldsHTML(plateFieldsHTML('part', history, operation));
    case 'add-anchored-profile':
    case 'grow-profile':
      return partFieldsHTML(
        profileFieldsHTML('part', history, operation, { reach: failure === undefined }),
      );
  }

  /** The fields of a part of the frame, with its joints and the deletion of its step. */
  function partFieldsHTML(fields: string): string {
    return `<div class="part-inspector" id="partInspectorFields">${failed}${fields}${jointsHTML(joints, touching)}<div class="part-actions">${deleteStep}</div></div>`;
  }
}

/**
 * A step of the frame while fitting: it can be selected, but not changed, other than moving its
 * part along an adjustment.
 */
function lockedStepHTML(
  history: readonly Operation[],
  operation: Operation,
  failure: string | undefined,
): string {
  const failed =
    failure === undefined
      ? ''
      : `<p class="layout-hint part-warning">⚠ Failed: ${escapeHTML(failure)}</p>`;
  const adjustment = isAdjustable(operation) ? adjustmentHTML(history, operation) : '';
  return `<div class="part-inspector" id="lockedPart"><p class="part-parent"><strong>${escapeHTML(stepTitle(history, operation))}</strong></p><p class="layout-hint">🔒 The frame is locked while fitting the driver: turn Fit off to change it.</p>${failed}${adjustment}</div>`;
}

/**
 * A part's adjustment while fitting: the axis of its face it slides along, its travel and where
 * it is along it; or a button to give it one. A span takes its length from the part it reaches,
 * so it has none.
 */
function adjustmentHTML(history: readonly Operation[], operation: AdjustableOperation): string {
  const heading = '<h4 class="buy-group">Adjustment</h4>';
  if (operation.kind === 'grow-profile' && operation.reachesId !== undefined)
    return `${heading}<p class="layout-hint" id="adjustmentNone">A span takes its length from the part it reaches, so it does not slide.</p>`;
  const { adjustment } = operation;
  if (adjustment === undefined)
    return `${heading}<p class="layout-hint">Fixed where it is attached.</p><div class="part-actions"><button class="button button-light" id="addAdjustment" title="Let it slide along the face it hangs from, as a seat on its rails"><i data-icon="plus"></i>Add an adjustment</button></div>`;
  const normal = faceAxis(operation.face);
  const axes = AXES.filter((axis) => axis !== normal)
    .map(
      (axis) =>
        `<option value="${axis}"${axis === adjustment.axis ? ' selected' : ''}>${AXIS_NAMES[axis]}</option>`,
    )
    .join('');
  const halfMm = adjustment.travelMm / 2;
  return `${heading}<div class="select-control"><label for="adjustmentAxis">Slides along</label><select id="adjustmentAxis" data-adjustment-field="axis">${axes}</select></div>${guideHTML(history, operation, adjustment)}${adjustmentNumberHTML('adjustmentTravel', 'travelMm', 'Travel', adjustment.travelMm, 1, MAX_TRAVEL_MM)}${adjustmentNumberHTML('adjustmentPosition', 'positionMm', 'Position', adjustment.positionMm, -halfMm, halfMm)}<p class="layout-hint">Centered where it is attached, towards + on its axis. Moving it along its travel changes no part or cut.</p><div class="part-actions"><button class="button button-light" id="removeAdjustment" title="Fix it at the center of its travel"><i data-icon="trash"></i>Remove the adjustment</button></div>`;
}

const GUIDE_NAMES: Record<AdjustmentGuide, string> = {
  rails: 'Its own rails, bolted to the plate',
  slots: 'Slots cut in the plate',
};

/**
 * What a peripheral on a plate slides on: its own rails, or slots in the plate in place of its
 * mounting holes. On a profile it slides on T-nuts in the slot, so there is nothing to choose.
 */
function guideHTML(
  history: readonly Operation[],
  operation: AdjustableOperation,
  adjustment: Adjustment,
): string {
  if (operation.kind !== 'mount-peripheral' || adjustment.runsOn === undefined) return '';
  if (operationMaking(history, operation.parentId)?.kind !== 'add-plate') return '';
  const options = ADJUSTMENT_GUIDES.map(
    (guide) =>
      `<option value="${guide}"${guide === adjustment.runsOn ? ' selected' : ''}>${GUIDE_NAMES[guide]}</option>`,
  ).join('');
  return `<div class="select-control"><label for="adjustmentRunsOn">Runs on</label><select id="adjustmentRunsOn" data-adjustment-field="runsOn">${options}</select></div>`;
}

function adjustmentNumberHTML(
  id: string,
  field: AdjustmentField,
  label: string,
  valueMm: number,
  min: number,
  max: number,
): string {
  return `<div class="control"><div class="control-top"><label for="${id}">${label}</label><div class="number-wrap"><input id="${id}" type="number" data-adjustment-field="${field}" min="${round(min, 1)}" max="${round(max, 1)}" step="1" value="${round(valueMm, 1)}"><span>mm</span></div></div></div>`;
}
