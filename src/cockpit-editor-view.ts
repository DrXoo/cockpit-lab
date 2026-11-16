// The cockpit editor's panels: the design history on the left, with the tools that add to it,
// and the inspector of the selected part on the right. The design is shown on its own, in an
// empty workspace without any room. Cockpit files are imported from the actions above the panel.
import type { Axis } from './cad/assembly.ts';
import { profileSection, profileSystem } from './cad/catalog.ts';
import {
  MAX_PART_NAME_LENGTH,
  MAX_POSITION_MM,
  MAX_PROFILE_LENGTH_MM,
  MIN_PROFILE_LENGTH_MM,
  type Operation,
  type ProfileValues,
} from './cad/history.ts';
import { defaults, type RoomConfig } from './config.ts';
import { round } from './geometry.ts';
import { escapeHTML } from './html.ts';

/** What surrounds a design in its own workspace: nothing. */
export const NOTHING_AROUND: RoomConfig = {
  ...defaults,
  roomEnabled: false,
  deskEnabled: false,
  monitorEnabled: false,
  keyboardEnabled: false,
  pcEnabled: false,
  mouseEnabled: false,
  matEnabled: false,
  roomFeatures: [],
  roomFurniture: [],
  armPoses: [],
};

export interface DesignPanel {
  history: readonly Operation[];
  selectedPartId: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

/** The fields of the inspector, as the markup names them in `data-part-field`. */
export type PartField =
  'name' | 'sectionId' | 'axis' | 'heightAxis' | 'lengthMm' | 'startX' | 'startY' | 'startZ';

const AXIS_NAMES: Record<Axis, string> = {
  x: 'Across (X)',
  y: 'Up (Y)',
  z: 'Front to back (Z)',
};
const AXES: readonly Axis[] = ['x', 'y', 'z'];
const START_FIELDS: Record<Axis, PartField> = { x: 'startX', y: 'startY', z: 'startZ' };

const sectionName = (widthMm: number, heightMm: number) => `${widthMm} × ${heightMm}`;

/** The history panel: the design's operations, the undo and redo of its edits, and its tools. */
export function designPanelHTML(panel: DesignPanel): string {
  const editTools = `<div class="history-tools"><button class="text-button" id="undoEdit" title="Undo (Ctrl+Z)" ${panel.canUndo ? '' : 'disabled'}><i data-icon="undo"></i>Undo</button><button class="text-button" id="redoEdit" title="Redo (Ctrl+Y)" ${panel.canRedo ? '' : 'disabled'}><i data-icon="redo"></i>Redo</button></div>`;
  const addProfile = `<button class="button button-dark history-add" id="addProfile"><i data-icon="plus"></i>Add a profile</button>`;
  if (panel.history.length === 0)
    return `<div class="control-group" id="emptyDesign"><h3 class="group-title">A design built from parts</h3>${editTools}<p class="layout-hint">A cockpit design is the list of steps that builds it from aluminium profiles, plates and peripherals. New designs start empty: add a profile to start.</p><p class="layout-hint">Cockpits of the earlier configurator are not converted: design them again from parts.</p>${addProfile}</div>`;
  const steps = panel.history
    .map((operation, index) => historyStepHTML(operation, index, panel.selectedPartId))
    .join('');
  return `<div class="control-group" id="designHistory"><h3 class="group-title">Design history<span>${panel.history.length} ${panel.history.length === 1 ? 'step' : 'steps'}</span></h3>${editTools}<ol class="history-list">${steps}</ol>${addProfile}<p class="layout-hint">Select a part here or in the view to edit it in the inspector.</p></div>`;
}

function historyStepHTML(operation: Operation, index: number, selectedPartId: string | null) {
  const selected = operation.partId === selectedPartId;
  const section = profileSection(profileSystem(operation.systemId), operation.sectionId);
  const detail = `Anchored profile · ${sectionName(section.widthMm, section.heightMm)} · ${round(operation.lengthMm, 1)} mm`;
  return `<li><button class="history-step" data-part="${escapeHTML(operation.partId)}" aria-pressed="${selected}"><span class="history-number">${index + 1}</span><span class="history-text"><strong>${escapeHTML(operation.name)}</strong><small>${detail}</small></span></button></li>`;
}

/** The inspector of the selected part: the values of the operation that made it. */
export function partInspectorHTML(operation: Operation | undefined): string {
  if (!operation)
    return `<p class="control-hint" id="noPartSelected">Select a part in the view or in the design history to edit it.</p>`;
  const system = profileSystem(operation.systemId);
  const section = profileSection(system, operation.sectionId);
  const sections = system.sections.map((option): [string, string] => [
    option.id,
    sectionName(option.widthMm, option.heightMm),
  ]);
  const lengthAxes = AXES.map((axis): [string, string] => [axis, AXIS_NAMES[axis]]);
  const heightAxes = AXES.filter((axis) => axis !== operation.axis).map(
    (axis): [string, string] => [axis, AXIS_NAMES[axis]],
  );
  const startFields = AXES.map((axis) =>
    numberHTML(
      START_FIELDS[axis],
      `Start ${axis.toUpperCase()}`,
      operation.startMm[axis],
      -MAX_POSITION_MM,
      MAX_POSITION_MM,
    ),
  ).join('');
  return `<div class="part-inspector" id="partInspectorFields"><div class="room-name"><label for="part-name">Name</label><input id="part-name" data-part-field="name" value="${escapeHTML(operation.name)}" maxlength="${MAX_PART_NAME_LENGTH}"></div>${selectHTML('sectionId', 'Section', sections, operation.sectionId)}${selectHTML('axis', 'Runs along', lengthAxes, operation.axis)}${
    section.widthMm === section.heightMm
      ? ''
      : selectHTML('heightAxis', 'Long side of the section along', heightAxes, operation.heightAxis)
  }${numberHTML('lengthMm', 'Length', operation.lengthMm, MIN_PROFILE_LENGTH_MM, MAX_PROFILE_LENGTH_MM)}${startFields}<p class="layout-hint">The start is the center of the profile's end with the lower coordinate, measured from the cockpit origin. +Y is up, +Z the front, −X the driver's right.</p></div>`;
}

function selectHTML(
  field: PartField,
  label: string,
  options: readonly [value: string, text: string][],
  value: string,
): string {
  const choices = options
    .map(
      ([option, text]) =>
        `<option value="${option}"${option === value ? ' selected' : ''}>${text}</option>`,
    )
    .join('');
  return `<div class="select-control"><label for="part-${field}">${label}</label><select id="part-${field}" data-part-field="${field}">${choices}</select></div>`;
}

function numberHTML(field: PartField, label: string, valueMm: number, min: number, max: number) {
  return `<div class="control"><div class="control-top"><label for="part-${field}">${label}</label><div class="number-wrap"><input id="part-${field}" type="number" data-part-field="${field}" min="${min}" max="${max}" step="1" value="${round(valueMm, 1)}"><span>mm</span></div></div></div>`;
}

const PART_FIELDS: readonly PartField[] = [
  'name',
  'sectionId',
  'axis',
  'heightAxis',
  'lengthMm',
  'startX',
  'startY',
  'startZ',
];

/** The inspector field a `data-part-field` names. The markup is the app's, so others are bugs. */
export function partField(value: string | undefined): PartField {
  const field = PART_FIELDS.find((known) => known === value);
  if (!field) throw new Error(`Unknown part field: ${value}`);
  return field;
}

function axisOf(value: string): Axis {
  const axis = AXES.find((known) => known === value);
  if (!axis) throw new Error(`Unknown axis: ${value}`);
  return axis;
}

/** A typed number; a blank field is no number, for the design to reject with its reason. */
const typedNumber = (value: string): number => (value.trim() === '' ? Number.NaN : Number(value));

/** The change one field of the inspector makes to the values of the part's operation. */
export function partChange(
  operation: Operation,
  field: PartField,
  value: string,
): Partial<ProfileValues> {
  switch (field) {
    case 'name':
      return { name: value };
    case 'sectionId':
      return { sectionId: value };
    case 'axis':
      return { axis: axisOf(value) };
    case 'heightAxis':
      return { heightAxis: axisOf(value) };
    case 'lengthMm':
      return { lengthMm: typedNumber(value) };
    case 'startX':
      return { startMm: { ...operation.startMm, x: typedNumber(value) } };
    case 'startY':
      return { startMm: { ...operation.startMm, y: typedNumber(value) } };
    case 'startZ':
      return { startMm: { ...operation.startMm, z: typedNumber(value) } };
  }
}
