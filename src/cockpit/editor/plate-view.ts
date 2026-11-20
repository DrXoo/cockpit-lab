// A plate in the inspector: its sheet, how it is made, its size and where its center is on its profile, and the
// panel of a plate about to rest on a profile, shown in the view as a preview.
import { faceAxis } from '../cad/parts/assembly.ts';
import { sheetType, sheetTypes } from '../cad/parts/catalog.ts';
import {
  fabricationProcess,
  fabricationProcesses,
  marginRuleText,
} from '../cad/parts/fabrication.ts';
import {
  AXES,
  FACES,
  MAX_PLATE_SIDE_MM,
  MAX_POSITION_MM,
  MAX_PROFILE_LENGTH_MM,
  MIN_PLATE_SIDE_MM,
  type AddPlate,
  type Operation,
} from '../cad/history/history.ts';
import { escapeHTML } from '../../ui/html.ts';
import {
  AXIS_NAMES,
  END_FACE_NAMES,
  END_NAMES,
  nameOf,
  profileAxisOf,
  SIDE_FACE_NAMES,
} from './design-text.ts';
import { FieldTemplates, nameFieldHTML } from './field-templates.ts';
import type { PartField } from './part-fields.ts';

/** The panel of a plate about to rest on a profile, shown in the view as a preview. */
export function platePanelHTML(history: readonly Operation[], draft: AddPlate): string {
  return `<div class="part-inspector" id="platePanel"><p class="layout-hint">A new plate on <strong>${escapeHTML(nameOf(history, draft.parentId))}</strong>. Click a face of it in the view, or choose one here.</p>${plateFieldsHTML('plate', history, draft)}<div class="grow-actions"><button class="button button-dark" id="confirmPlate">Add the plate</button><button class="button button-light" id="cancelPlate">Cancel</button></div></div>`;
}

/** The files to have a plate made, from the design as it is at the history marker. */
export function plateExportsHTML(): string {
  return `<div class="plate-exports" id="plateExports"><p class="layout-hint">Files to have it made: a DXF for a cutting shop, and a template to print at 1:1 and drill through.</p><div class="grow-actions"><button class="button button-light" id="exportPlateDxf" title="Outline, holes and slots in mm, for laser or water-jet cutting"><i data-icon="download"></i>DXF</button><button class="button button-light" id="exportPlateSvg" title="Print at 100% and check the 100 mm scale bar before drilling"><i data-icon="download"></i>SVG template</button></div></div>`;
}

/** The values of a plate: its sheet, how it is made, its size and where its center is on its profile. */
export function plateFieldsHTML(
  prefix: string,
  history: readonly Operation[],
  plate: AddPlate,
): string {
  const fields = new FieldTemplates(prefix);
  const sheets = sheetTypes().map((sheet): [string, string] => [sheet.id, escapeHTML(sheet.name)]);
  const sheet = sheetType(plate.sheetId);
  const profileAxis = profileAxisOf(history, plate.parentId) ?? 'z';
  const onAnEnd = faceAxis(plate.face) === profileAxis;
  const faces = FACES.filter(
    (face) => faceAxis(face) !== profileAxis || (onAnEnd && face === plate.face),
  ).map((face): [string, string] => [
    face,
    faceAxis(face) === profileAxis ? END_FACE_NAMES[face] : SIDE_FACE_NAMES[face],
  ]);
  const depthAxes = AXES.filter((axis) => axis !== faceAxis(plate.face)).map(
    (axis): [string, string] => [axis, AXIS_NAMES[axis]],
  );
  const ends = (['start', 'end'] as const).map((end): [string, string] => [
    end,
    END_NAMES[profileAxis][end],
  ]);
  const side = (field: PartField, label: string, valueMm: number) =>
    fields.number(field, label, valueMm, MIN_PLATE_SIDE_MM, MAX_PLATE_SIDE_MM);
  const estimated =
    sheet.source.kind === 'estimated' ? ' (estimated: check the chosen supplier)' : '';
  const sheetHint = `<p class="layout-hint">${sheet.thicknessMm} mm thick${estimated}.</p>`;
  const processes = fabricationProcesses().map((process): [string, string] => [
    process.id,
    escapeHTML(process.name),
  ]);
  const process = fabricationProcess(plate.processId);
  const cuts = process.cutsSlots ? 'Cuts slots' : 'Cuts no slots';
  const processEstimated =
    process.source.kind === 'estimated' ? ' (estimated: check with the shop)' : '';
  const processHint = `<p class="layout-hint">${cuts}. ${marginRuleText(process, sheet.thicknessMm)}${processEstimated}.</p>`;
  const place = `${fields.select('face', 'Face', faces, plate.face)}${fields.select('depthAxis', 'Depth along', depthAxes, plate.depthAxis)}${fields.select('fromEnd', 'Measured from', ends, plate.fromEnd)}${fields.number('alongMm', 'Distance to its center', plate.alongMm, 0, MAX_PROFILE_LENGTH_MM)}${fields.number('acrossMm', 'Offset of its center across the face', plate.acrossMm, -MAX_POSITION_MM, MAX_POSITION_MM)}`;
  return `${nameFieldHTML(prefix, plate.name)}<p class="part-parent">Rests on <strong>${escapeHTML(nameOf(history, plate.parentId))}</strong></p>${fields.select('sheetId', 'Sheet', sheets, plate.sheetId)}${sheetHint}${fields.select('processId', 'Made by', processes, plate.processId)}${processHint}${side('widthMm', 'Width', plate.widthMm)}${side('depthMm', 'Depth', plate.depthMm)}${place}<p class="layout-hint">Its center may lie beyond the face, between two profiles, as long as the plate rests on part of it.</p>`;
}
