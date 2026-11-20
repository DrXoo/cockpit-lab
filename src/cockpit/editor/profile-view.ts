// A profile in the inspector: the values of the operation that makes it, anchored or grown out
// of a face, and the panel of a profile about to grow, shown in the view as a preview.
import { faceAxis } from '../cad/parts/assembly.ts';
import { profileSection, profileSystem } from '../cad/parts/catalog.ts';
import {
  AXES,
  FACES,
  facingParts,
  lengthAxisOf,
  MAX_POSITION_MM,
  MAX_PROFILE_LENGTH_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  type AddAnchoredProfile,
  type GrowProfile,
  type Operation,
  type ProfileOperation,
} from '../cad/history/history.ts';
import { escapeHTML } from '../../ui/html.ts';
import {
  AXIS_NAMES,
  DIRECTION_NAMES,
  END_FACE_NAMES,
  END_NAMES,
  parentName,
  profileAxisOf,
  reachOf,
  sectionName,
  SIDE_FACE_NAMES,
  type Reach,
} from './design-text.ts';
import { FieldTemplates, nameFieldHTML } from './field-templates.ts';
import { START_FIELDS } from './part-fields.ts';

/** The panel of a profile about to grow out of another, shown in the view as a preview. */
export function growPanelHTML(history: readonly Operation[], draft: GrowProfile): string {
  return `<div class="part-inspector" id="growPanel"><p class="layout-hint">A new profile growing out of <strong>${escapeHTML(parentName(history, draft))}</strong>. Click a face of it in the view, or choose one here.</p>${profileFieldsHTML('grow', history, draft, { reach: true })}<div class="grow-actions"><button class="button button-dark" id="confirmGrowth">Add the profile</button><button class="button button-light" id="cancelGrowth">Cancel</button></div></div>`;
}

/**
 * The fields of a profile's operation; `prefix` keeps the ids of two panels apart. The end of a
 * profile already in the design can reach a part in front of it.
 */
export function profileFieldsHTML(
  prefix: string,
  history: readonly Operation[],
  operation: ProfileOperation,
  { reach }: { reach: boolean },
) {
  const fields = new FieldTemplates(prefix);
  const system = profileSystem(operation.systemId);
  const section = profileSection(system, operation.sectionId);
  const sections = system.sections.map((option): [string, string] => [
    option.id,
    sectionName(option.widthMm, option.heightMm),
  ]);
  const lengthAxis = lengthAxisOf(operation);
  const heightAxes = AXES.filter((axis) => axis !== lengthAxis).map((axis): [string, string] => [
    axis,
    AXIS_NAMES[axis],
  ]);
  const name = nameFieldHTML(prefix, operation.name);
  const longSide =
    section.widthMm === section.heightMm
      ? ''
      : fields.select(
          'heightAxis',
          'Long side of the section along',
          heightAxes,
          operation.heightAxis,
        );
  const span = reachOf(history, operation);
  const length =
    fields.number(
      'lengthMm',
      'Length',
      operation.lengthMm,
      MIN_PROFILE_LENGTH_MM,
      MAX_PROFILE_LENGTH_MM,
      { disabled: span !== null },
    ) + spanHintHTML(span);
  const placement =
    operation.kind === 'add-anchored-profile'
      ? anchoredPlacementHTML(fields, operation)
      : grownPlacementHTML(fields, history, operation, reach);
  return `${name}${fields.select('sectionId', 'Section', sections, operation.sectionId)}${placement.before}${longSide}${length}${placement.after}`;
}

function spanHintHTML(span: Reach | null): string {
  if (!span) return '';
  const target = escapeHTML(span.targetName);
  return span.meets
    ? `<p class="layout-hint">Its length is the gap to ${target}; it changes when either part moves.</p>`
    : `<p class="layout-hint part-warning">⚠ Its end no longer meets ${target}: it keeps its last length. Move a part back, or let its end go.</p>`;
}

interface PlacementHTML {
  /** Fields that decide the length axis, shown before the section's long side. */
  before: string;
  after: string;
}

function anchoredPlacementHTML(
  fields: FieldTemplates,
  operation: AddAnchoredProfile,
): PlacementHTML {
  const lengthAxes = AXES.map((axis): [string, string] => [axis, AXIS_NAMES[axis]]);
  const starts = AXES.map((axis) =>
    fields.number(
      START_FIELDS[axis],
      `Start ${axis.toUpperCase()}`,
      operation.startMm[axis],
      -MAX_POSITION_MM,
      MAX_POSITION_MM,
    ),
  ).join('');
  return {
    before: fields.select('axis', 'Runs along', lengthAxes, operation.axis),
    after: `${starts}<p class="layout-hint">The start is the center of the profile's end with the lower coordinate, measured from the cockpit origin. +Y is up, +Z the front, −X the driver's right.</p>`,
  };
}

function grownPlacementHTML(
  fields: FieldTemplates,
  history: readonly Operation[],
  growth: GrowProfile,
  reach: boolean,
): PlacementHTML {
  const parentAxis = profileAxisOf(history, growth.parentId) ?? 'z';
  const faces = FACES.map((face): [string, string] => [
    face,
    faceAxis(face) === parentAxis ? END_FACE_NAMES[face] : SIDE_FACE_NAMES[face],
  ]);
  const parentLine = `<p class="part-parent">Grows out of <strong>${escapeHTML(parentName(history, growth))}</strong></p>`;
  const onAnEnd = faceAxis(growth.face) === parentAxis;
  const ends = (['start', 'end'] as const).map((end): [string, string] => [
    end,
    END_NAMES[parentAxis][end],
  ]);
  const onTheSide = onAnEnd
    ? '<p class="layout-hint">Out of an end face it grows from the center of the end.</p>'
    : `${fields.select('fromEnd', 'Measured from', ends, growth.fromEnd)}${fields.number('alongMm', 'Distance from that end', growth.alongMm, 0, MAX_PROFILE_LENGTH_MM)}${fields.number('acrossMm', 'Offset across the face', growth.acrossMm, -MAX_POSITION_MM, MAX_POSITION_MM)}`;
  const ways: [string, string][] = [
    ['out', 'Out of the face'],
    ...FACES.filter((way) => faceAxis(way) !== faceAxis(growth.face)).map(
      (way): [string, string] => [way, `Along the face, ${DIRECTION_NAMES[way]}`],
    ),
  ];
  return {
    before: `${parentLine}${fields.select('face', 'Face', faces, growth.face)}${fields.select('way', 'Grows', ways, growth.way)}${onTheSide}`,
    after: reach && growth.way === 'out' ? reachSelectHTML(fields, history, growth) : '',
  };
}

/** The end of a profile grown out of a face: free, or reaching a part in front of it. */
function reachSelectHTML(
  fields: FieldTemplates,
  history: readonly Operation[],
  growth: GrowProfile,
): string {
  const name = (partId: string) => escapeHTML(operationMaking(history, partId)?.name ?? partId);
  const facing = facingParts(history, growth.partId);
  const choices: [string, string][] = [
    ['', 'Free, at its own length'],
    ...facing.map((partId): [string, string] => [partId, `Reaches ${name(partId)}`]),
  ];
  const current = growth.reachesId;
  if (current !== undefined && !facing.includes(current))
    choices.push([current, `Reaches ${name(current)} (not meeting it)`]);
  return fields.select('reachesId', 'Its end', choices, current ?? '');
}
