// The fields of the inspector and of a part's adjustment, as the markup names them. The markup
// is the app's, so a name that is not one of them is a bug.
import type { Axis } from '../cad/parts/assembly.ts';

/** The fields of the inspector, as the markup names them in `data-part-field`. */
const PART_FIELDS = [
  'name',
  'sectionId',
  'axis',
  'heightAxis',
  'lengthMm',
  'startX',
  'startY',
  'startZ',
  'face',
  'fromEnd',
  'alongMm',
  'acrossMm',
  'way',
  'reachesId',
  'footTypeId',
  'sheetId',
  'widthMm',
  'depthMm',
  'depthAxis',
  'facing',
  'typeId',
  'heightMm',
  'backrestDeg',
  'holeXMm',
  'holeYMm',
  'holeDiameterMm',
  'contactXMm',
  'contactYMm',
  'contactZMm',
] as const;
export type PartField = (typeof PART_FIELDS)[number];

/** The field of each coordinate of an anchored profile's start. */
export const START_FIELDS: Record<Axis, PartField> = { x: 'startX', y: 'startY', z: 'startZ' };

/** The values of an adjustment, as the markup names them in `data-adjustment-field`. */
const ADJUSTMENT_FIELDS = ['axis', 'travelMm', 'positionMm', 'runsOn'] as const;
export type AdjustmentField = (typeof ADJUSTMENT_FIELDS)[number];

/** The inspector field a `data-part-field` names. */
export function partField(value: string | undefined): PartField {
  const field = PART_FIELDS.find((known) => known === value);
  if (!field) throw new Error(`Unknown part field: ${value}`);
  return field;
}

/** The adjustment value a `data-adjustment-field` names. */
export function adjustmentField(value: string | undefined): AdjustmentField {
  const field = ADJUSTMENT_FIELDS.find((known) => known === value);
  if (!field) throw new Error(`Unknown adjustment field: ${value}`);
  return field;
}
