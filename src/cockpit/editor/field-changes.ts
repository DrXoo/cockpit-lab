// The changes a value typed in the inspector makes to the values of a part's operation, one
// function per kind of part, and to a part's adjustment.
import {
  HANDS,
  type Axis,
  type ContactPoint,
  type Face,
  type Hand,
  type Vec3Mm,
} from '../cad/parts/assembly.ts';
import {
  ADJUSTMENT_GUIDES,
  AXES,
  FACES,
  type Adjustment,
  type AdjustmentGuide,
  type FootValues,
  type MountPeripheral,
  type ParentEnd,
  type PeripheralValues,
  type PlateValues,
  type ProfileOperation,
  type ProfileValues,
} from '../cad/history/history.ts';
import type { Hole } from '../cad/parts/mounting-pattern.ts';
import { START_FIELDS, type AdjustmentField, type PartField } from './part-fields.ts';

/** The change one field of the inspector makes to the values of a profile's operation. */
export function partChange(
  operation: ProfileOperation,
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
    case 'face':
      return { face: faceOf(value) };
    case 'fromEnd':
      return { fromEnd: endOf(value) };
    case 'alongMm':
      return { alongMm: typedNumber(value) };
    case 'acrossMm':
      return { acrossMm: typedNumber(value) };
    case 'way':
      return { way: value === 'out' ? 'out' : faceOf(value) };
    case 'reachesId':
      return { reachesId: value === '' ? null : value };
    case 'footTypeId':
    case 'sheetId':
    case 'processId':
    case 'widthMm':
    case 'depthMm':
    case 'depthAxis':
    case 'facing':
    case 'typeId':
    case 'heightMm':
    case 'backrestDeg':
    case 'holeXMm':
    case 'holeYMm':
    case 'holeDiameterMm':
    case 'contactXMm':
    case 'contactYMm':
    case 'contactZMm':
    case 'hand':
      throw new Error(`A profile has no ${field}`);
    case 'startX':
    case 'startY':
    case 'startZ':
      return { startMm: changedStart(operation, field, typedNumber(value)) };
  }
}

function changedStart(operation: ProfileOperation, field: PartField, valueMm: number): Vec3Mm {
  if (operation.kind !== 'add-anchored-profile')
    throw new Error(`${operation.name} has no start of its own`);
  const axis = AXES.find((candidate) => START_FIELDS[candidate] === field) ?? 'x';
  return { ...operation.startMm, [axis]: valueMm };
}

/** The change one field of a foot's inspector makes to the values of its operation. */
export function footChange(field: PartField, value: string): Partial<FootValues> {
  switch (field) {
    case 'name':
      return { name: value };
    case 'footTypeId':
      return { footTypeId: value };
    case 'fromEnd':
      return { fromEnd: endOf(value) };
    case 'alongMm':
      return { alongMm: typedNumber(value) };
    default:
      throw new Error(`A foot has no ${field}`);
  }
}

/** The change one field of a plate's inspector makes to the values of its operation. */
export function plateChange(field: PartField, value: string): Partial<PlateValues> {
  switch (field) {
    case 'name':
      return { name: value };
    case 'sheetId':
      return { sheetId: value };
    case 'processId':
      return { processId: value };
    case 'widthMm':
      return { widthMm: typedNumber(value) };
    case 'depthMm':
      return { depthMm: typedNumber(value) };
    case 'depthAxis':
      return { depthAxis: axisOf(value) };
    case 'face':
      return { face: faceOf(value) };
    case 'fromEnd':
      return { fromEnd: endOf(value) };
    case 'alongMm':
      return { alongMm: typedNumber(value) };
    case 'acrossMm':
      return { acrossMm: typedNumber(value) };
    default:
      throw new Error(`A plate has no ${field}`);
  }
}

/**
 * The change one field of a peripheral's inspector makes to the values of its operation. A field
 * of a hole or a contact point names it as `item`: the hole's index, or the contact's role. Its
 * type is swapped rather than changed, as a swap may first need confirming.
 */
export function peripheralChange(
  peripheral: MountPeripheral,
  field: PartField,
  value: string,
  item?: string,
): Partial<PeripheralValues> {
  const { envelope } = peripheral;
  const holeChange = (change: Partial<Hole>) => ({
    mountingPattern: { holes: changedHoles(peripheral, item, change) },
  });
  const contactChange = (axis: Axis) => ({
    contactPoints: changedContacts(peripheral, item, axis, typedNumber(value)),
  });
  switch (field) {
    case 'widthMm':
      return { envelope: { ...envelope, widthMm: typedNumber(value) } };
    case 'heightMm':
      return { envelope: { ...envelope, heightMm: typedNumber(value) } };
    case 'depthMm':
      return { envelope: { ...envelope, depthMm: typedNumber(value) } };
    case 'backrestDeg':
      return { backrestDeg: typedNumber(value) };
    case 'holeXMm':
      return holeChange({ xMm: typedNumber(value) });
    case 'holeYMm':
      return holeChange({ yMm: typedNumber(value) });
    case 'holeDiameterMm':
      return holeChange({ diameterMm: typedNumber(value) });
    case 'contactXMm':
      return contactChange('x');
    case 'contactYMm':
      return contactChange('y');
    case 'contactZMm':
      return contactChange('z');
    case 'hand':
      return { hand: handOf(value) };
    case 'typeId':
      throw new Error("A peripheral's type is swapped, not edited: use swapPeripheralType.");
    case 'name':
      return { name: value };
    case 'face':
      return { face: faceOf(value) };
    case 'facing':
      return { facing: faceOf(value) };
    case 'fromEnd':
      return { fromEnd: endOf(value) };
    case 'alongMm':
      return { alongMm: typedNumber(value) };
    case 'acrossMm':
      return { acrossMm: typedNumber(value) };
    default:
      throw new Error(`A peripheral has no ${field}`);
  }
}

/** The holes of a peripheral with the one at index `item` changed. */
function changedHoles(
  peripheral: MountPeripheral,
  item: string | undefined,
  change: Partial<Hole>,
): Hole[] {
  const { holes } = peripheral.mountingPattern;
  const index = Number(item);
  if (item === undefined || !Number.isInteger(index) || index < 0 || index >= holes.length)
    throw new Error(`${peripheral.name} has no hole ${index + 1}.`);
  return holes.map((hole, holeIndex) => (holeIndex === index ? { ...hole, ...change } : hole));
}

/** The contact points of a peripheral with the one of role `item` moved along `axis`. */
function changedContacts(
  peripheral: MountPeripheral,
  item: string | undefined,
  axis: Axis,
  valueMm: number,
): ContactPoint[] {
  if (!peripheral.contactPoints.some((contact) => contact.role === item))
    throw new Error(`${peripheral.name} has no ${item} contact point.`);
  return peripheral.contactPoints.map((contact) =>
    contact.role === item
      ? { role: contact.role, offsetMm: { ...contact.offsetMm, [axis]: valueMm } }
      : contact,
  );
}

/** The change a value typed in an adjustment field makes. */
export function adjustmentChange(field: AdjustmentField, value: string): Partial<Adjustment> {
  switch (field) {
    case 'axis':
      return { axis: axisOf(value) };
    case 'travelMm':
      return { travelMm: typedNumber(value) };
    case 'positionMm':
      return { positionMm: typedNumber(value) };
    case 'runsOn':
      return { runsOn: guideOf(value) };
  }
}

function handOf(value: string): Hand {
  const hand = HANDS.find((known) => known === value);
  if (!hand) throw new Error(`Unknown hand: ${value}`);
  return hand;
}

function guideOf(value: string): AdjustmentGuide {
  const guide = ADJUSTMENT_GUIDES.find((known) => known === value);
  if (!guide) throw new Error(`Unknown adjustment guide: ${value}`);
  return guide;
}

/** The face a value of the markup names. */
export function faceOf(value: string): Face {
  const face = FACES.find((known) => known === value);
  if (!face) throw new Error(`Unknown face: ${value}`);
  return face;
}

function axisOf(value: string): Axis {
  const axis = AXES.find((known) => known === value);
  if (!axis) throw new Error(`Unknown axis: ${value}`);
  return axis;
}

function endOf(value: string): ParentEnd {
  if (value !== 'start' && value !== 'end') throw new Error(`Unknown end: ${value}`);
  return value;
}

/** A typed number; a blank field is no number, for the design to reject with its reason. */
const typedNumber = (value: string): number => (value.trim() === '' ? Number.NaN : Number(value));
