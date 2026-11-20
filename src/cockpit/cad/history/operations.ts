// The operations of a design history, as the file format stores them, and the part each one
// makes when it is replayed (docs/adr/0005). Every kind of operation, and every value it holds,
// is part of the file format. Lengths are in mm.
import {
  CONTACT_ROLES,
  faceAxis,
  HANDS,
  type Axis,
  type ContactPoint,
  type Envelope,
  type Face,
  type FootPart,
  type Hand,
  type Part,
  type PeripheralPart,
  type PlatePart,
  type ProfilePart,
  type Vec3Mm,
} from '../parts/assembly.ts';
import {
  connectorType,
  footType,
  DATA_SOURCE_KINDS,
  PERIPHERAL_CATEGORIES,
  plateBoltType,
  profileSystem,
  sheetType,
  type DataSource,
  type PeripheralCategory,
} from '../parts/catalog.ts';
import { fabricationProcess } from '../parts/fabrication.ts';
import {
  PATTERN_SIDES,
  type MountingPattern,
  type PatternSide,
} from '../parts/mounting-pattern.ts';

/** What every profile is made with, wherever it is placed. */
export interface ProfileShape {
  name: string;
  systemId: string;
  sectionId: string;
  /** The axis its section's height runs along; never its length axis. */
  heightAxis: Axis;
  lengthMm: number;
}

/**
 * A travel along which a part slides without changing any part or cut, as a seat on its rails or
 * a plate in its slots (CONTEXT.md). Its operation still places the part at the center of the
 * travel, where its joints and cuts are.
 */
export interface Adjustment {
  /** The axis of the face its part hangs from that it slides along. */
  axis: Axis;
  /** The whole travel, end to end, centered where the part is attached. */
  travelMm: number;
  /** Where the part is along it: from its center, towards + on its axis. */
  positionMm: number;
  /**
   * For a peripheral only, what it slides on: its own rails, bolted to the plate, or slots cut
   * in the plate in place of its mounting holes.
   */
  runsOn?: AdjustmentGuide;
}

export type AdjustmentGuide = 'rails' | 'slots';
export const ADJUSTMENT_GUIDES: readonly AdjustmentGuide[] = ['rails', 'slots'];

/** Adds a profile placed on its own, hanging from no other part. */
export interface AddAnchoredProfile extends ProfileShape {
  kind: 'add-anchored-profile';
  id: string;
  /** The part it makes; the identifier stays the same every time the history is replayed. */
  partId: string;
  /** The axis its length runs along. */
  axis: Axis;
  /** The center of its section at its start, the end with the lower coordinate. */
  startMm: Vec3Mm;
}

/** The end of a parent a distance along it is measured from: the lower coordinate is the start. */
export type ParentEnd = 'start' | 'end';

/**
 * Grows a profile out of a face of another part, which it hangs from: its position follows that
 * part wherever it moves.
 */
export interface GrowProfile extends ProfileShape {
  kind: 'grow-profile';
  id: string;
  partId: string;
  parentId: string;
  face: Face;
  fromEnd: ParentEnd;
  /** From `fromEnd` along the parent; always 0 on an end face. */
  alongMm: number;
  /** Off the center of the face, towards + on the axis across it; always 0 on an end face. */
  acrossMm: number;
  /**
   * 'out' grows out of the face, perpendicular to it; a direction along the face lays the
   * profile on it, running that way.
   */
  way: GrowthWay;
  /**
   * For a span, the part whose facing face its free end meets: its length is then the gap to it,
   * and `lengthMm` the length it last took, kept when the faces stop facing each other.
   */
  reachesId?: string;
  /** Never on a span, whose length depends on the part it reaches. */
  adjustment?: Adjustment;
}

export type GrowthWay = 'out' | Face;

/**
 * Removes a part from that step on: the parts that hang from it are anchored where they are, and
 * a span that reached it keeps its length with an open end. Earlier steps still have the part.
 */
export interface RemovePart {
  kind: 'remove-part';
  id: string;
  removedId: string;
}

/**
 * Puts a leveling foot or a caster under a profile, on its underside, through which the design
 * stands on the floor. Under an upright the underside is its lower end.
 */
export interface AddFoot {
  kind: 'add-foot';
  id: string;
  partId: string;
  name: string;
  footTypeId: string;
  parentId: string;
  fromEnd: ParentEnd;
  /** From `fromEnd` along the profile to the center of the foot; always 0 under an end. */
  alongMm: number;
}

/**
 * Rests a rectangular plate on a side face of a profile, which it hangs from. Its thickness
 * stands out of the face, and its center may lie beyond the face as long as the plate rests on
 * part of it.
 */
export interface AddPlate {
  kind: 'add-plate';
  id: string;
  partId: string;
  name: string;
  sheetId: string;
  /** How it is cut and drilled, from the catalog of fabrication processes. */
  processId: string;
  widthMm: number;
  depthMm: number;
  /** The axis its depth runs along: along the profile or across the face; its width the other. */
  depthAxis: Axis;
  parentId: string;
  face: Face;
  fromEnd: ParentEnd;
  /** From `fromEnd` along the profile to the plate's center. */
  alongMm: number;
  /** From the center of the face, towards + on the axis across it, to the plate's center. */
  acrossMm: number;
  adjustment?: Adjustment;
}

/** What a peripheral is made of: the values of the type it was mounted from, as copied. */
export interface PeripheralShape {
  name: string;
  /** The catalog type its values were copied from. */
  typeId: string;
  category: PeripheralCategory;
  envelope: Envelope;
  mountingPattern: MountingPattern;
  contactPoints: readonly ContactPoint[];
  /** For a seat, the backrest's angle back from upright. */
  backrestDeg?: number;
  source: DataSource;
}

/**
 * Mounts a peripheral on a face of a profile or a plate, which it hangs from: its mounting
 * origin, the center of its underside, is measured along the part from one of its ends and
 * across the face from its middle. The values of its type are copied into the step, so a saved
 * design never changes with the catalog.
 */
export interface MountPeripheral extends PeripheralShape {
  kind: 'mount-peripheral';
  id: string;
  partId: string;
  parentId: string;
  face: Face;
  fromEnd: ParentEnd;
  /** From `fromEnd` along the part, a profile's length or a plate's depth, to its origin. */
  alongMm: number;
  /** From the center of the face, towards + on the axis across it, to its origin. */
  acrossMm: number;
  /** The way the driver faces when using it, along the face: +Z as usually mounted. */
  facing: Face;
  /** For a peripheral with a grip, the hand that uses it, chosen on it rather than its type. */
  hand?: Hand;
  /**
   * The side of its mounting pattern whose holes stand on its place, rather than its origin:
   * `acrossMm` then measures to the line along them.
   */
  holesOver?: PatternSide;
  adjustment?: Adjustment;
}

/** A corner bracket a fastening puts on its joint, on one side of the joined part. */
export interface BracketChoice {
  typeId: string;
  /** The face of the joined part the connector sits against. */
  side: Face;
}

/**
 * Bolts that fasten a plate to a profile, as many in each slot of the profile the plate covers,
 * spaced evenly along where they touch.
 */
export interface BoltsChoice {
  typeId: string;
  perSlot: number;
}

/** The connectors a fastening puts on its joint: corner brackets, or bolts through a plate. */
export type ConnectorChoice = BracketChoice | BoltsChoice;

export const isBolts = (choice: ConnectorChoice): choice is BoltsChoice => 'perSlot' in choice;
export const isBracket = (choice: ConnectorChoice): choice is BracketChoice => 'side' in choice;

/** More bolts than this in one slot are a mistyped number. */
export const MAX_BOLTS_PER_SLOT = 10;

/**
 * Puts connectors on the joint where a part meets another: the part that hangs from or reaches
 * `toPartId`. Each joint has one such step, which holds all its connectors.
 */
export interface FastenJoint {
  kind: 'fasten-joint';
  id: string;
  partId: string;
  toPartId: string;
  connectors: ConnectorChoice[];
}

/**
 * Joins two parts that only touch, so that they make a joint as an attachment does. The part
 * that meets the other end on comes first, when one does.
 */
export interface JoinParts {
  kind: 'join-parts';
  id: string;
  partId: string;
  toPartId: string;
}

/** An operation that makes a profile. */
export type ProfileOperation = AddAnchoredProfile | GrowProfile;

/** An operation that makes a part. */
export type MakingOperation = ProfileOperation | AddFoot | AddPlate | MountPeripheral;

/** One step of a design history. Every kind is part of the file format. */
export type Operation = MakingOperation | RemovePart | FastenJoint | JoinParts;

export const makesAPart = (operation: Operation): operation is MakingOperation =>
  operation.kind === 'add-anchored-profile' ||
  operation.kind === 'grow-profile' ||
  operation.kind === 'add-foot' ||
  operation.kind === 'add-plate' ||
  operation.kind === 'mount-peripheral';

export const makesAProfile = (operation: Operation): operation is ProfileOperation =>
  operation.kind === 'add-anchored-profile' || operation.kind === 'grow-profile';

/** An operation that attaches a part that can slide along an adjustment. */
export type AdjustableOperation = GrowProfile | AddPlate | MountPeripheral;

export const isAdjustable = (operation: Operation): operation is AdjustableOperation =>
  operation.kind === 'grow-profile' ||
  operation.kind === 'add-plate' ||
  operation.kind === 'mount-peripheral';

/** The adjustment of the part an operation makes, if it has one. */
export const adjustmentOf = (operation: Operation): Adjustment | undefined =>
  isAdjustable(operation) ? operation.adjustment : undefined;

/** The values the inspector edits on a foot. */
export interface FootValues {
  name: string;
  footTypeId: string;
  fromEnd: ParentEnd;
  alongMm: number;
}

/** The values the inspector edits on a plate. */
export interface PlateValues {
  name: string;
  sheetId: string;
  processId: string;
  widthMm: number;
  depthMm: number;
  depthAxis: Axis;
  face: Face;
  fromEnd: ParentEnd;
  alongMm: number;
  acrossMm: number;
}

/**
 * The values the inspector edits on a peripheral: its name, where it is and the way it faces,
 * and the values copied from its type, which describe the product mounted.
 */
export interface PeripheralValues {
  name: string;
  face: Face;
  fromEnd: ParentEnd;
  alongMm: number;
  acrossMm: number;
  facing: Face;
  envelope: Envelope;
  mountingPattern: MountingPattern;
  contactPoints: readonly ContactPoint[];
  backrestDeg: number;
  hand: Hand;
  /** The side whose holes stand on its place, or null for its origin. */
  holesOver: PatternSide | null;
}

/** The values the inspector edits; each kind of operation takes the ones that place it. */
export interface ProfileValues {
  name: string;
  sectionId: string;
  axis: Axis;
  heightAxis: Axis;
  lengthMm: number;
  startMm: Vec3Mm;
  face: Face;
  fromEnd: ParentEnd;
  alongMm: number;
  acrossMm: number;
  way: GrowthWay;
  /** The part a span reaches, or null to let its end go, keeping its length. */
  reachesId: string | null;
}

/** Shorter pieces are spacers rather than profiles. */
export const MIN_PROFILE_LENGTH_MM = 10;
/** Longer than any profile of a compact cockpit; it keeps a mistyped length out of the design. */
export const MAX_PROFILE_LENGTH_MM = 3000;
/** How far from the cockpit origin a part can start; it keeps mistyped positions out. */
export const MAX_POSITION_MM = 3000;
/** Narrower plates are brackets; wider ones than a compact cockpit needs are mistyped. */
export const MIN_PLATE_SIDE_MM = 50;
export const MAX_PLATE_SIDE_MM = 1500;
/** Part names, like furniture names, are short labels. */
export const MAX_PART_NAME_LENGTH = 45;
/** No peripheral is smaller or larger than these on any side; others are mistyped. */
export const MIN_ENVELOPE_SIDE_MM = 10;
export const MAX_ENVELOPE_SIDE_MM = 2000;
/** Wider holes than this are not for bolting a peripheral. */
export const MAX_HOLE_DIAMETER_MM = 30;
/** A backrest leans back from upright at most this far, lying flat. */
export const MAX_BACKREST_DEG = 90;
/** Longer travels than this are more than a compact cockpit needs, so mistyped. */
export const MAX_TRAVEL_MM = 1000;

export const AXES: readonly Axis[] = ['x', 'y', 'z'];
export const FACES: readonly Face[] = ['+y', '-y', '+x', '-x', '+z', '-z'];

/** The axis a profile's length runs along. */
export const lengthAxisOf = (operation: ProfileOperation): Axis =>
  operation.kind === 'add-anchored-profile'
    ? operation.axis
    : faceAxis(operation.way === 'out' ? operation.face : operation.way);

/** The part an operation makes, placed as its values say. */
export function partMadeBy(operation: MakingOperation): Part {
  switch (operation.kind) {
    case 'mount-peripheral':
      return peripheralMadeBy(operation);
    case 'add-foot':
      return footMadeBy(operation);
    case 'add-plate':
      return plateMadeBy(operation);
    case 'add-anchored-profile':
    case 'grow-profile':
      return profileMadeBy(operation);
  }
}

function footMadeBy(operation: AddFoot): FootPart {
  return {
    kind: 'foot',
    id: operation.partId,
    name: operation.name,
    footTypeId: operation.footTypeId,
    placement: {
      kind: 'attachment',
      parentId: operation.parentId,
      face: '-y',
      alongMm: operation.alongMm,
      fromEnd: operation.fromEnd,
    },
  };
}

function plateMadeBy(operation: AddPlate): PlatePart {
  return {
    kind: 'plate',
    id: operation.partId,
    name: operation.name,
    widthMm: operation.widthMm,
    depthMm: operation.depthMm,
    sheetId: operation.sheetId,
    processId: operation.processId,
    normal: operation.face,
    depthAxis: operation.depthAxis,
    placement: {
      kind: 'attachment',
      parentId: operation.parentId,
      face: operation.face,
      alongMm: operation.alongMm,
      fromEnd: operation.fromEnd,
      acrossMm: operation.acrossMm,
    },
  };
}

function peripheralMadeBy(operation: MountPeripheral): PeripheralPart {
  return {
    kind: 'peripheral',
    id: operation.partId,
    name: operation.name,
    category: operation.category,
    ...copiedPeripheral(operation),
    ...(operation.hand === undefined ? {} : { hand: operation.hand }),
    ...(operation.holesOver === undefined ? {} : { holesOver: operation.holesOver }),
    facing: operation.facing,
    placement: {
      kind: 'attachment',
      parentId: operation.parentId,
      face: operation.face,
      alongMm: operation.alongMm,
      fromEnd: operation.fromEnd,
      acrossMm: operation.acrossMm,
    },
  };
}

/**
 * Copies of the values that make a peripheral what it is, so that neither the catalog nor a
 * later edit of a step changes another's.
 */
export function copiedPeripheral(shape: Omit<PeripheralShape, 'name' | 'typeId' | 'category'>) {
  return {
    envelope: { ...shape.envelope },
    mountingPattern: { holes: shape.mountingPattern.holes.map((hole) => ({ ...hole })) },
    contactPoints: shape.contactPoints.map(({ role, offsetMm }) => ({
      role,
      offsetMm: { ...offsetMm },
    })),
    ...(shape.backrestDeg === undefined ? {} : { backrestDeg: shape.backrestDeg }),
    source: { ...shape.source },
  };
}

function profileMadeBy(operation: ProfileOperation): ProfilePart {
  const profile = {
    kind: 'profile' as const,
    id: operation.partId,
    name: operation.name,
    systemId: operation.systemId,
    sectionId: operation.sectionId,
    axis: lengthAxisOf(operation),
    heightAxis: operation.heightAxis,
    lengthMm: operation.lengthMm,
  };
  if (operation.kind === 'add-anchored-profile')
    return { ...profile, placement: { kind: 'anchor', startMm: { ...operation.startMm } } };
  const attachment = {
    parentId: operation.parentId,
    face: operation.face,
    alongMm: operation.alongMm,
    fromEnd: operation.fromEnd,
    acrossMm: operation.acrossMm,
  };
  if (operation.reachesId !== undefined)
    return {
      ...profile,
      placement: { kind: 'span', ...attachment, reachesId: operation.reachesId },
    };
  return {
    ...profile,
    placement: {
      kind: 'attachment',
      ...attachment,
      ...(operation.way === 'out' ? {} : { lying: operation.way }),
    },
  };
}

/** The operation that made a part, if the history made it. */
export function operationMaking(
  history: readonly Operation[],
  partId: string,
): MakingOperation | undefined {
  return history.filter(makesAPart).find((operation) => operation.partId === partId);
}

/** The operation as given, or an error naming the first value it cannot have. */
export function checkedOperation<T extends Operation>(operation: T): T {
  checkValues(operation);
  return operation;
}

/** Each kind of operation checks its own values; a kind without a case is a type error. */
function checkValues(operation: Operation): void {
  switch (operation.kind) {
    case 'remove-part':
      if (typeof operation.removedId !== 'string' || operation.removedId === '')
        throw new Error('A removal needs the part it removes');
      return;
    case 'add-foot':
      return checkFoot(operation);
    case 'add-plate':
      return checkPlate(operation);
    case 'mount-peripheral':
      return checkPeripheral(operation);
    case 'fasten-joint':
      return checkFastening(operation);
    case 'join-parts':
      if (operation.partId === operation.toPartId) throw new Error('A part cannot join itself.');
      return;
    case 'add-anchored-profile':
    case 'grow-profile':
      return checkProfile(operation);
    default:
      return unknownOperation(operation);
  }
}

/**
 * The default of a switch that returns nothing, over every kind of operation: once each kind has
 * its case nothing is left, so a kind without one is a type error here.
 */
export function unknownOperation(operation: never): never {
  throw new Error(`Unknown operation: ${JSON.stringify(operation)}`);
}

function checkProfile(operation: ProfileOperation): void {
  const system = profileSystem(operation.systemId);
  if (!system.sections.some((section) => section.id === operation.sectionId))
    throw new Error(`Profile section ${operation.sectionId} is not in ${system.id}.`);
  if (operation.kind === 'add-anchored-profile' && !AXES.includes(operation.axis))
    throw new Error(`Unknown axis: ${operation.axis}`);
  if (operation.kind === 'grow-profile') checkGrowth(operation);
  if (!AXES.includes(operation.heightAxis) || operation.heightAxis === lengthAxisOf(operation))
    throw new Error(`A section height along ${operation.heightAxis} does not fit the profile.`);
  const { lengthMm } = operation;
  if (
    !Number.isFinite(lengthMm) ||
    lengthMm < MIN_PROFILE_LENGTH_MM ||
    lengthMm > MAX_PROFILE_LENGTH_MM
  )
    throw new Error(
      `A profile length must be between ${MIN_PROFILE_LENGTH_MM} and ${MAX_PROFILE_LENGTH_MM} mm.`,
    );
  if (operation.kind === 'add-anchored-profile') checkStart(operation.startMm);
}

function checkStart(startMm: Vec3Mm) {
  if (
    !AXES.every(
      (axis) => Number.isFinite(startMm[axis]) && Math.abs(startMm[axis]) <= MAX_POSITION_MM,
    )
  )
    throw new Error(`A position must be within ${MAX_POSITION_MM} mm of the cockpit origin.`);
}

function checkFastening(operation: FastenJoint) {
  const { connectors } = operation;
  if (connectors.length === 0) throw new Error('A fastening needs at least one connector.');
  const bolts = connectors.filter(isBolts);
  if (bolts.length > 0) {
    if (connectors.length > 1)
      throw new Error('A plate is fastened by its bolts alone, with one number for each slot.');
    checkBolts(bolts[0]);
    return;
  }
  const sides = new Set<Face>();
  for (const { typeId, side } of connectors.filter(isBracket)) {
    connectorType(typeId);
    if (!FACES.includes(side)) throw new Error(`Unknown face: ${side}`);
    if (sides.has(side))
      throw new Error(`A joint has one connector on each side, not two on ${side}.`);
    sides.add(side);
  }
}

function checkBolts({ typeId, perSlot }: BoltsChoice) {
  plateBoltType(typeId);
  if (!Number.isInteger(perSlot)) throw new Error('The bolts in each slot must be a whole number.');
  if (perSlot < 1 || perSlot > MAX_BOLTS_PER_SLOT)
    throw new Error(`Each slot takes between 1 and ${MAX_BOLTS_PER_SLOT} bolts.`);
}

function checkFoot(operation: AddFoot) {
  footType(operation.footTypeId);
  checkPlaceAlong(operation);
}

function checkPlate(operation: AddPlate) {
  sheetType(operation.sheetId);
  fabricationProcess(operation.processId);
  for (const sideMm of [operation.widthMm, operation.depthMm])
    if (!Number.isFinite(sideMm) || sideMm < MIN_PLATE_SIDE_MM || sideMm > MAX_PLATE_SIDE_MM)
      throw new Error(
        `A plate side must be between ${MIN_PLATE_SIDE_MM} and ${MAX_PLATE_SIDE_MM} mm.`,
      );
  if (!FACES.includes(operation.face)) throw new Error(`Unknown face: ${operation.face}`);
  if (!AXES.includes(operation.depthAxis) || operation.depthAxis === faceAxis(operation.face))
    throw new Error('The depth of a plate runs along the face it rests on, not out of it.');
  checkPlaceAlong(operation);
  if (!Number.isFinite(operation.acrossMm))
    throw new Error('An offset across a face must be a number of mm.');
  checkAdjustment(operation);
}

function checkPeripheral(operation: MountPeripheral) {
  if (typeof operation.typeId !== 'string' || operation.typeId === '')
    throw new Error('A peripheral needs the type it was mounted from.');
  if (!PERIPHERAL_CATEGORIES.includes(operation.category))
    throw new Error(`Unknown kind of peripheral: ${operation.category}`);
  checkEnvelope(operation.envelope);
  for (const hole of operation.mountingPattern.holes) checkHole(hole);
  for (const contact of operation.contactPoints) {
    if (!CONTACT_ROLES.includes(contact.role))
      throw new Error(`Unknown contact point: ${contact.role}`);
    checkOffset(contact.offsetMm);
  }
  const { backrestDeg } = operation;
  if (backrestDeg !== undefined && operation.category !== 'seat')
    throw new Error('Only a seat has a backrest.');
  if (
    backrestDeg !== undefined &&
    (!Number.isFinite(backrestDeg) || backrestDeg < 0 || backrestDeg > MAX_BACKREST_DEG)
  )
    throw new Error(`A backrest leans back between 0 and ${MAX_BACKREST_DEG}°.`);
  checkHand(operation);
  if (operation.holesOver !== undefined && !PATTERN_SIDES.includes(operation.holesOver))
    throw new Error(`Unknown side of a mounting pattern: ${operation.holesOver}`);
  if (
    !DATA_SOURCE_KINDS.includes(operation.source.kind) ||
    typeof operation.source.reference !== 'string'
  )
    throw new Error('A peripheral needs the source of its values.');
  if (!FACES.includes(operation.face)) throw new Error(`Unknown face: ${operation.face}`);
  if (!FACES.includes(operation.facing)) throw new Error(`Unknown face: ${operation.facing}`);
  if (faceAxis(operation.facing) === faceAxis(operation.face))
    throw new Error('A peripheral faces along the face it is mounted on, not out of it.');
  checkPlaceAlong(operation);
  if (!Number.isFinite(operation.acrossMm))
    throw new Error('An offset across a face must be a number of mm.');
  checkAdjustment(operation);
}

/** A peripheral with a grip says which hand uses it; one without has no hand. */
function checkHand({ contactPoints, hand }: MountPeripheral) {
  const hasAGrip = contactPoints.some((contact) => contact.role === 'grip');
  if (!hasAGrip && hand !== undefined)
    throw new Error('Only a peripheral with a grip is used by one hand.');
  if (hasAGrip && !HANDS.some((known) => known === hand))
    throw new Error('A peripheral with a grip needs which hand uses it: the left or the right.');
}

function checkEnvelope({ widthMm, heightMm, depthMm }: Envelope) {
  for (const sideMm of [widthMm, heightMm, depthMm])
    if (!Number.isFinite(sideMm) || sideMm < MIN_ENVELOPE_SIDE_MM || sideMm > MAX_ENVELOPE_SIDE_MM)
      throw new Error(
        `A peripheral's width, height and depth must be between ${MIN_ENVELOPE_SIDE_MM} and ${MAX_ENVELOPE_SIDE_MM} mm.`,
      );
}

function checkHole({ xMm, yMm, diameterMm }: { xMm: number; yMm: number; diameterMm: number }) {
  if (
    ![xMm, yMm].every((valueMm) => Number.isFinite(valueMm) && Math.abs(valueMm) <= MAX_POSITION_MM)
  )
    throw new Error(`A hole must be within ${MAX_POSITION_MM} mm of the mounting origin.`);
  if (!Number.isFinite(diameterMm) || diameterMm <= 0 || diameterMm > MAX_HOLE_DIAMETER_MM)
    throw new Error(
      `A hole's diameter must be more than 0 and at most ${MAX_HOLE_DIAMETER_MM} mm.`,
    );
}

function checkOffset(offsetMm: Vec3Mm) {
  if (
    !AXES.every(
      (axis) => Number.isFinite(offsetMm[axis]) && Math.abs(offsetMm[axis]) <= MAX_POSITION_MM,
    )
  )
    throw new Error(`A contact point must be within ${MAX_POSITION_MM} mm of the mounting origin.`);
}

/** A place along a parent: from one of its ends, never before it. */
function checkPlaceAlong(operation: { fromEnd: ParentEnd; alongMm: number }) {
  if (operation.fromEnd !== 'start' && operation.fromEnd !== 'end')
    throw new Error(`Unknown end: ${operation.fromEnd}`);
  if (!Number.isFinite(operation.alongMm) || operation.alongMm < 0)
    throw new Error('A distance along a part must be 0 mm or more.');
}

function checkGrowth(operation: GrowProfile) {
  if (!FACES.includes(operation.face)) throw new Error(`Unknown face: ${operation.face}`);
  checkPlaceAlong(operation);
  const { way } = operation;
  if (way !== 'out' && !FACES.includes(way)) throw new Error(`Unknown way to grow: ${way}`);
  if (way !== 'out' && faceAxis(way) === faceAxis(operation.face))
    throw new Error(
      'A profile lying on a face runs along it: choose a way across the face, or out of it.',
    );
  if (operation.reachesId !== undefined && way !== 'out')
    throw new Error('A profile lying on a face cannot reach another part: it lies along the face.');
  if (!Number.isFinite(operation.acrossMm))
    throw new Error('An offset across a face must be a number of mm.');
  if (operation.reachesId !== undefined && operation.adjustment !== undefined)
    throw new Error('A span has no adjustment: its length comes from the part it reaches.');
  checkAdjustment(operation);
}

/**
 * An adjustment runs along the face its part hangs from, and its part is somewhere along its
 * travel. Whether the travel keeps the part on its parent is known only once it is replayed.
 */
function checkAdjustment({ kind, adjustment, face }: AdjustableOperation) {
  if (adjustment === undefined) return;
  const { axis, travelMm, positionMm, runsOn } = adjustment;
  if (!AXES.includes(axis)) throw new Error(`Unknown axis: ${axis}`);
  if (runsOn !== undefined && kind !== 'mount-peripheral')
    throw new Error(
      'Only a peripheral runs on rails or in slots: a profile or a plate slides on T-nuts in its profile’s slot.',
    );
  if (runsOn !== undefined && !ADJUSTMENT_GUIDES.includes(runsOn))
    throw new Error(`An adjustment runs on rails or in slots, not ${runsOn}.`);
  if (axis === faceAxis(face))
    throw new Error('An adjustment runs along the face its part hangs from, not out of it.');
  if (!Number.isFinite(travelMm) || travelMm <= 0 || travelMm > MAX_TRAVEL_MM)
    throw new Error(`A travel must be more than 0 and at most ${MAX_TRAVEL_MM} mm.`);
  const halfMm = travelMm / 2;
  if (!Number.isFinite(positionMm) || Math.abs(positionMm) > halfMm)
    throw new Error(
      `A position along a ${travelMm} mm travel is between ${-halfMm} and ${halfMm} mm.`,
    );
}

/** How a step is named in the history: the part it makes, or the part a removal takes away. */
export function stepTitle(history: readonly Operation[], operation: Operation): string {
  const nameOf = (partId: string) => operationMaking(history, partId)?.name ?? 'a deleted part';
  if (operation.kind === 'remove-part') return `Removes ${nameOf(operation.removedId)}`;
  if (operation.kind === 'fasten-joint')
    return `Fastens ${nameOf(operation.partId)} to ${nameOf(operation.toPartId)}`;
  if (operation.kind === 'join-parts')
    return `Joins ${nameOf(operation.partId)} to ${nameOf(operation.toPartId)}`;
  return operation.name;
}
