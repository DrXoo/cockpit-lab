// Converts a parametric cockpit design into CAD parts, as the parametric drawing places its
// profiles (src/render-rig.ts). The conversion is faithful even where the design could not be
// built: seat posts that rest on no profile stay anchored where they are drawn, and profiles
// that cross each other are kept crossing, for the CAD to report (docs/mini-cad.md).
// Parts hang from one another only where the drawing puts them face to face.
import type { CockpitDesign } from '../cockpit-design.ts';
import { drivingMount, rigLift, seatBackOf } from '../rig.ts';
import { cmToMm } from '../units.ts';
import {
  offsetInTiltedFrame,
  resolveAssembly,
  tiltedFromPivot,
  type ContactRole,
  type Attachment,
  type Axis,
  type Part,
  type Vec3Mm,
} from './assembly.ts';
import type { Adjustment } from './adjustments.ts';
import { FROM_THE_DRAWING, MOTEDIS_SERIES_40_SLOT_8, type DataSource } from './catalog.ts';
import { jointsOf, type Connector } from './joints.ts';

type Section = '40x40' | '40x80';

/** Heights of the parametric drawing, in cm above the base before any base lift. */
const FRAME_AXIS_CM = 10;
/** The base's end crossmembers and extensions are set back this much from each end. */
const END_INSET_CM = 10;
/** The side rails' centers are this far in from the frame's outer width. */
const RAIL_INSET_CM = 2;
/** Crossmembers between the rails are the width less both rails. */
const RAILS_WIDTH_CM = 8;
/** Seat posts and pedal posts stand this far in from the frame's outer width. */
const POST_INSET_CM = 8;
const SEAT_POST_BOTTOM_CM = 14;
const PEDAL_POST_BOTTOM_CM = 8;
const SIDE_UPRIGHT_BOTTOM_CM = 10;
const MIN_POST_LENGTH_CM = 4;

const PEDAL_DECK_LENGTH_CM = 38;
/** Side mounts move back to make room for a shifter or handbrake on the same side. */
const SIDE_MOUNT_SHIFT_CM = 24;
const SHIFTER_ARM_LENGTH_CM = 30;
const CENTER_STICK_ARM_LENGTH_CM = 24;

interface ProfileSpec {
  id: string;
  name: string;
  section: Section;
  axis: Axis;
  heightAxis: Axis;
  lengthCm: number;
}

const mm = (lengthCm: number): number => cmToMm(lengthCm);
const pointMm = (xCm: number, yCm: number, zCm: number): Vec3Mm => ({
  x: mm(xCm),
  y: mm(yCm),
  z: mm(zCm),
});

const profileOf = (spec: ProfileSpec, placement: Part['placement']): Part => ({
  kind: 'profile',
  id: spec.id,
  name: spec.name,
  systemId: MOTEDIS_SERIES_40_SLOT_8.id,
  sectionId: spec.section,
  axis: spec.axis,
  heightAxis: spec.heightAxis,
  lengthMm: mm(spec.lengthCm),
  placement,
});

const anchored = (spec: ProfileSpec, startMm: Vec3Mm, tiltDeg?: number): Part =>
  profileOf(
    spec,
    tiltDeg === undefined ? { kind: 'anchor', startMm } : { kind: 'anchor', startMm, tiltDeg },
  );

/** The pilot's right is -X. */
const sides = [
  { sign: -1, side: 'right' },
  { sign: 1, side: 'left' },
] as const;

/**
 * A post from `bottomCm` up to `topCm`, at least the minimum length. The drawing centers a
 * post on the unclamped span, so a clamped post reaches below its bottom as well as above.
 */
function postBetween(bottomCm: number, topCm: number): { startCm: number; lengthCm: number } {
  const lengthCm = Math.max(MIN_POST_LENGTH_CM, topCm - bottomCm);
  const centerCm = (bottomCm + topCm) / 2;
  return { startCm: centerCm - lengthCm / 2, lengthCm };
}

const railId = (sign: number) => (sign < 0 ? 'base-rail-right' : 'base-rail-left');

export function partsFromParametric(design: CockpitDesign): Part[] {
  const lift = rigLift(design);
  const parts = [
    ...baseFrame(design, lift),
    ...baseCorners(design, lift),
    ...seatSupports(design, lift),
    ...pedalDeck(design, lift),
    seat(design, lift),
    ...pedalPlateAndPedals(design, lift),
  ];
  if (design.wheel) parts.push(...wheelMount(design, lift), ...wheelPlateAndWheel(design, lift));
  if (design.hotas) parts.push(...sideMounts(design, lift), ...sideControls(design, lift));
  if (design.centerStick)
    parts.push(...centerStick(design, lift), ...centerStickControl(design, lift));
  if (design.shifter || design.handbrake)
    parts.push(...shifterMount(design, lift), ...shifterControls(design, lift));
  return parts;
}

/** Typical travels, end to end; the real ones depend on the rails and slots bought. */
const SEAT_RAIL_TRAVEL_MM = 200;
const PLATE_SLOT_TRAVEL_MM = 100;
const TYPICAL_TRAVEL: DataSource = {
  kind: 'estimated',
  reference: 'A typical travel for seat rails and slotted plates; check the parts bought',
};

/** The seat on its rails, and the pedal and wheel plates in their slots, slide fore and aft. */
export function adjustmentsFromParametric(design: CockpitDesign): Adjustment[] {
  const foreAft = (id: string, name: string, partId: string, travelMm: number): Adjustment => ({
    id,
    name,
    partId,
    axis: 'z',
    travelMm,
    source: TYPICAL_TRAVEL,
  });
  const adjustments = [
    foreAft('seat-fore-aft', 'Seat on its rails', 'seat', SEAT_RAIL_TRAVEL_MM),
    foreAft('pedals-fore-aft', 'Pedal plate in its slots', 'pedal-plate', PLATE_SLOT_TRAVEL_MM),
  ];
  if (design.wheel)
    adjustments.push(
      foreAft('wheel-fore-aft', 'Wheel plate in its slots', 'wheel-plate', PLATE_SLOT_TRAVEL_MM),
    );
  return adjustments;
}

const CORNER_BRACKET = 'corner-bracket-40';

/**
 * A 40 corner bracket on each side of every joint, the usual way to fasten a T-joint. The two
 * sit along the part that is met, against its face, where there is room for their legs.
 */
export function connectorsFromParametric(parts: readonly Part[]): Connector[] {
  const resolved = resolveAssembly(parts);
  return jointsOf(resolved).flatMap((joint) => {
    const met = resolved.get(joint.toPartId)?.part;
    if (met?.kind !== 'profile') throw new Error(`Joint ${joint.id} meets no profile.`);
    return (['-', '+'] as const).map((sign) => ({
      id: `${joint.id}/${sign === '-' ? 'a' : 'b'}`,
      jointId: joint.id,
      typeId: CORNER_BRACKET,
      side: `${sign}${met.axis}` as const,
    }));
  });
}

function baseFrame(design: CockpitDesign, lift: number): Part[] {
  const rails = sides.map(({ sign, side }) =>
    anchored(
      {
        id: railId(sign),
        name: `Base side rail, ${side}`,
        section: '40x80',
        axis: 'z',
        heightAxis: 'y',
        lengthCm: design.length,
      },
      pointMm(sign * (design.width / 2 - RAIL_INSET_CM), lift + FRAME_AXIS_CM, 0),
    ),
  );
  const positions = [
    { id: 'rear', alongCm: END_INSET_CM, fromEnd: 'start' },
    { id: 'middle', alongCm: design.length / 2, fromEnd: 'start' },
    { id: 'front', alongCm: END_INSET_CM, fromEnd: 'end' },
  ] as const;
  const crossmembers = positions.map((position) =>
    profileOf(
      {
        id: `base-crossmember-${position.id}`,
        name: `Base crossmember, ${position.id}`,
        section: '40x80',
        axis: 'x',
        heightAxis: 'y',
        lengthCm: design.width - RAILS_WIDTH_CM,
      },
      {
        kind: 'span',
        parentId: railId(-1),
        face: '+x',
        alongMm: mm(position.alongCm),
        fromEnd: position.fromEnd,
        reachesId: railId(1),
      },
    ),
  );
  return [...rails, ...crossmembers];
}

/**
 * Each corner of the base stands on a foot: under the side rail, or, with a base lift, under
 * an extension that hangs from the rail.
 */
function baseCorners(design: CockpitDesign, lift: number): Part[] {
  const ends = [
    { id: 'rear', fromEnd: 'start' },
    { id: 'front', fromEnd: 'end' },
  ] as const;
  const footTypeId = design.feet === 'casters' ? 'locking-caster' : 'leveling-foot';
  return sides.flatMap(({ sign, side }) =>
    ends.flatMap((end) => {
      const underRail: Attachment = {
        kind: 'attachment',
        parentId: railId(sign),
        face: '-y',
        alongMm: mm(END_INSET_CM),
        fromEnd: end.fromEnd,
      };
      const foot = (placement: Attachment): Part => ({
        kind: 'foot',
        id: `foot-${end.id}-${side}`,
        name: `Foot, ${end.id} ${side}`,
        footTypeId,
        placement,
      });
      if (lift <= 0) return [foot(underRail)];
      const extensionId = `base-extension-${end.id}-${side}`;
      const extension = profileOf(
        {
          id: extensionId,
          name: `Base extension, ${end.id} ${side}`,
          section: '40x40',
          axis: 'y',
          heightAxis: 'z',
          lengthCm: lift,
        },
        underRail,
      );
      const underExtension: Attachment = {
        kind: 'attachment',
        parentId: extensionId,
        face: '-y',
        alongMm: 0,
        fromEnd: 'start',
      };
      return [extension, foot(underExtension)];
    }),
  );
}

function seatSupports(design: CockpitDesign, lift: number): Part[] {
  const rows = [
    { id: 'rear', zCm: design.seatZ - 12 },
    { id: 'front', zCm: design.seatZ + 18 },
  ];
  const crossmemberLengthCm = design.width - RAILS_WIDTH_CM;
  const post = postBetween(SEAT_POST_BOTTOM_CM, design.seatH - 4);
  return rows.flatMap((row) => [
    anchored(
      {
        id: `seat-crossmember-${row.id}`,
        name: `Seat crossmember, ${row.id}`,
        section: '40x40',
        axis: 'x',
        heightAxis: 'y',
        lengthCm: crossmemberLengthCm,
      },
      pointMm(-crossmemberLengthCm / 2, lift + design.seatH - 10, row.zCm),
    ),
    ...sides.map(({ sign, side }) =>
      anchored(
        {
          id: `seat-post-${row.id}-${side}`,
          name: `Seat post, ${row.id} ${side}`,
          section: '40x40',
          axis: 'y',
          heightAxis: 'z',
          lengthCm: post.lengthCm,
        },
        pointMm(sign * (design.width / 2 - POST_INSET_CM), lift + post.startCm, row.zCm),
      ),
    ),
  ]);
}

/** The deck is drawn tilted about its center, at the pedal height and position. */
function pedalDeck(design: CockpitDesign, lift: number): Part[] {
  const pivot = pointMm(0, lift + design.pedalH, design.pedalZ);
  const tilt = design.pedalTilt;
  const deckPoint = (xCm: number, yCm: number, zCm: number) =>
    tiltedFromPivot(pivot, pointMm(xCm, yCm, zCm), tilt);
  const deckProfileYCm = -2.5;
  const rails = sides.map(({ sign, side }) =>
    anchored(
      {
        id: `pedal-deck-rail-${side}`,
        name: `Pedal deck rail, ${side}`,
        section: '40x40',
        axis: 'z',
        heightAxis: 'y',
        lengthCm: PEDAL_DECK_LENGTH_CM,
      },
      deckPoint((sign * (design.width - 18)) / 2, deckProfileYCm, -PEDAL_DECK_LENGTH_CM / 2),
      tilt,
    ),
  );
  const crossmemberLengthCm = design.width - RAILS_WIDTH_CM;
  const crossmembers = [
    { id: 'rear', zCm: -14 },
    { id: 'front', zCm: 14 },
  ].map((row) =>
    anchored(
      {
        id: `pedal-deck-crossmember-${row.id}`,
        name: `Pedal deck crossmember, ${row.id}`,
        section: '40x40',
        axis: 'x',
        heightAxis: 'y',
        lengthCm: crossmemberLengthCm,
      },
      deckPoint(-crossmemberLengthCm / 2, deckProfileYCm, row.zCm),
      tilt,
    ),
  );
  const post = postBetween(PEDAL_POST_BOTTOM_CM, design.pedalH - 2);
  const posts = sides.map(({ sign, side }) =>
    anchored(
      {
        id: `pedal-post-${side}`,
        name: `Pedal deck post, ${side}`,
        section: '40x40',
        axis: 'y',
        heightAxis: 'z',
        lengthCm: post.lengthCm,
      },
      pointMm(sign * (design.width / 2 - POST_INSET_CM), lift + post.startCm, design.pedalZ),
    ),
  );
  return [...rails, ...crossmembers, ...posts];
}

function wheelMount(design: CockpitDesign, lift: number): Part[] {
  const zCm = design.wheelZ + 18;
  const uprights = sides.map(({ sign, side }) =>
    profileOf(
      {
        id: `wheel-upright-${side}`,
        name: `Wheel upright, ${side}`,
        section: '40x80',
        axis: 'y',
        heightAxis: 'x',
        lengthCm: design.wheelH - 22,
      },
      {
        kind: 'attachment',
        parentId: railId(sign),
        face: '+y',
        alongMm: mm(zCm),
        fromEnd: 'start',
      },
    ),
  );
  const crossmemberLengthCm = design.width - RAILS_WIDTH_CM;
  const crossmember = anchored(
    {
      id: 'wheel-crossmember',
      name: 'Wheel crossmember',
      section: '40x80',
      axis: 'x',
      heightAxis: 'y',
      lengthCm: crossmemberLengthCm,
    },
    pointMm(-crossmemberLengthCm / 2, lift + design.wheelH - 10, zCm),
  );
  return [...uprights, crossmember];
}

/** An upright on the frame's side and an arm out to a control plate, as both side mounts are. */
function sideUprightAndArm(
  design: CockpitDesign,
  lift: number,
  ids: { upright: string; uprightName: string; arm: string; armName: string },
  sign: number,
  zCm: number,
  arm: { centerXCm: number; lengthCm: number },
): Part[] {
  return [
    anchored(
      {
        id: ids.upright,
        name: ids.uprightName,
        section: '40x40',
        axis: 'y',
        heightAxis: 'z',
        lengthCm: design.hotasH - 13,
      },
      pointMm(sign * (design.width / 2 - RAIL_INSET_CM), lift + SIDE_UPRIGHT_BOTTOM_CM, zCm),
    ),
    anchored(
      {
        id: ids.arm,
        name: ids.armName,
        section: '40x40',
        axis: 'x',
        heightAxis: 'y',
        lengthCm: arm.lengthCm,
      },
      pointMm(arm.centerXCm - arm.lengthCm / 2, lift + design.hotasH - 3, zCm),
    ),
  ];
}

/** HOTAS plates on both sides: the joystick on the pilot's right, the throttle on the left. */
function sideMounts(design: CockpitDesign, lift: number): Part[] {
  const mount = drivingMount(design);
  const sharesSide = design.shifter || design.handbrake;
  return sides.flatMap(({ sign, side }) => {
    const shift = sign === mount.sign && sharesSide ? SIDE_MOUNT_SHIFT_CM : 0;
    return sideUprightAndArm(
      design,
      lift,
      {
        upright: `hotas-upright-${side}`,
        uprightName: `HOTAS upright, ${side}`,
        arm: `hotas-arm-${side}`,
        armName: `HOTAS arm, ${side}`,
      },
      sign,
      design.hotasZ + shift,
      {
        centerXCm: sign * (design.width / 2 + design.hotasOut / 2 - 2),
        lengthCm: design.hotasOut + 12,
      },
    );
  });
}

function shifterMount(design: CockpitDesign, lift: number): Part[] {
  const mount = drivingMount(design);
  return sideUprightAndArm(
    design,
    lift,
    {
      upright: 'shifter-upright',
      uprightName: 'Shifter / handbrake upright',
      arm: 'shifter-arm',
      armName: 'Shifter / handbrake arm',
    },
    mount.sign,
    mount.z,
    { centerXCm: mount.x - mount.sign * 7, lengthCm: SHIFTER_ARM_LENGTH_CM },
  );
}

function centerStick(design: CockpitDesign, lift: number): Part[] {
  return [
    anchored(
      {
        id: 'center-stick-upright',
        name: 'Center stick upright',
        section: '40x40',
        axis: 'y',
        heightAxis: 'z',
        lengthCm: design.stickH - 10,
      },
      pointMm(0, lift + SIDE_UPRIGHT_BOTTOM_CM, design.stickZ),
    ),
    anchored(
      {
        id: 'center-stick-arm',
        name: 'Center stick arm',
        section: '40x40',
        axis: 'z',
        heightAxis: 'y',
        lengthCm: CENTER_STICK_ARM_LENGTH_CM,
      },
      pointMm(0, lift + design.stickH - 2, design.stickZ - 4 - CENTER_STICK_ARM_LENGTH_CM / 2),
    ),
  ];
}

/** The seat takes the box the parametric checks give it; the hip sits 12 cm above its base. */
function seat(design: CockpitDesign, lift: number): Part {
  const backZCm = seatBackOf(design);
  const frontZCm = design.seatZ + 25;
  const centerZCm = (backZCm + frontZCm) / 2;
  const bottomCm = lift + design.seatH - 8;
  return {
    kind: 'peripheral',
    id: 'seat',
    name: 'Seat',
    envelope: { widthMm: mm(50), heightMm: mm(72), depthMm: mm(frontZCm - backZCm) },
    mountingPattern: { holes: [] },
    contactPoints: [{ role: 'hip', offsetMm: pointMm(0, 12, design.seatZ - centerZCm) }],
    backrestDeg: design.recline,
    source: FROM_THE_DRAWING,
    placement: { kind: 'anchor', startMm: pointMm(0, bottomCm, centerZCm) },
  };
}

interface TiltedMount {
  /** The cockpit point the drawing turns the mount about. */
  pivotMm: Vec3Mm;
  tiltDeg: number;
}

interface PlateSpec {
  id: string;
  name: string;
  widthCm: number;
  depthCm: number;
  thicknessCm: number;
}

/** A plate drawn centered on `centerCm` from the mount's pivot, in the mount's tilted frame. */
function tiltedPlate(
  mount: TiltedMount,
  plate: PlateSpec,
  centerCm: { y: number; z: number },
): Part {
  const underside = pointMm(0, centerCm.y - plate.thicknessCm / 2, centerCm.z);
  return {
    kind: 'plate',
    id: plate.id,
    name: plate.name,
    widthMm: mm(plate.widthCm),
    depthMm: mm(plate.depthCm),
    thicknessMm: mm(plate.thicknessCm),
    ownHoles: [],
    placement: {
      kind: 'anchor',
      startMm: tiltedFromPivot(mount.pivotMm, underside, mount.tiltDeg),
      tiltDeg: mount.tiltDeg,
    },
  };
}

interface PeripheralSpec {
  id: string;
  name: string;
  envelopeCm: { width: number; height: number; depth: number };
}

interface PlateSeat {
  plateId: string;
  /** Distance along the plate's depth, from its start, to the peripheral's mounting origin. */
  alongCm: number;
  /** The mounting origin from the mount's pivot, in the mount's tilted frame. */
  originCm: { y: number; z: number };
}

/**
 * A peripheral on top of a tilted plate, its contact point placed where the parametric posture
 * puts it, whatever the tilt.
 */
function peripheralOnPlate(
  mount: TiltedMount,
  peripheral: PeripheralSpec,
  on: PlateSeat,
  contact: { role: ContactRole; atMm: Vec3Mm },
): Part {
  const origin = pointMm(0, on.originCm.y, on.originCm.z);
  const originMm = tiltedFromPivot(mount.pivotMm, origin, mount.tiltDeg);
  const offsetMm = offsetInTiltedFrame(originMm, contact.atMm, mount.tiltDeg);
  return {
    kind: 'peripheral',
    id: peripheral.id,
    name: peripheral.name,
    envelope: {
      widthMm: mm(peripheral.envelopeCm.width),
      heightMm: mm(peripheral.envelopeCm.height),
      depthMm: mm(peripheral.envelopeCm.depth),
    },
    mountingPattern: { holes: [] },
    contactPoints: [{ role: contact.role, offsetMm }],
    source: FROM_THE_DRAWING,
    placement: {
      kind: 'attachment',
      parentId: on.plateId,
      face: '+y',
      alongMm: mm(on.alongCm),
      fromEnd: 'start',
    },
  };
}

const PEDAL_PLATE_THICKNESS_CM = 1.1;
/** Three pedals as drawn: bases 22 cm deep, 37 cm across, heads up to 16.5 cm. */
const PEDALS_ENVELOPE_CM = { width: 37, height: 16.5, depth: 22 };

function pedalPlateAndPedals(design: CockpitDesign, lift: number): Part[] {
  const mount = {
    pivotMm: pointMm(0, lift + design.pedalH, design.pedalZ),
    tiltDeg: design.pedalTilt,
  };
  const plateSpec = {
    id: 'pedal-plate',
    name: 'Pedal plate',
    widthCm: design.width - RAILS_WIDTH_CM,
    depthCm: PEDAL_DECK_LENGTH_CM,
    thicknessCm: PEDAL_PLATE_THICKNESS_CM,
  };
  const plate = tiltedPlate(mount, plateSpec, { y: 0, z: 0 });
  const pedals = peripheralOnPlate(
    mount,
    { id: 'pedals', name: 'Pedals', envelopeCm: PEDALS_ENVELOPE_CM },
    {
      plateId: 'pedal-plate',
      alongCm: PEDAL_DECK_LENGTH_CM / 2,
      originCm: { y: PEDAL_PLATE_THICKNESS_CM / 2, z: 0 },
    },
    { role: 'heel', atMm: pointMm(0, lift + design.pedalH + 8, design.pedalZ - 5) },
  );
  return [plate, pedals];
}

const WHEEL_PLATE_THICKNESS_CM = 1.3;
const WHEEL_PLATE_DEPTH_CM = 22;
/** The wheel mount sits this far forward of the wheel's pivot, in the tilted frame. */
const WHEEL_MOUNT_FORWARD_CM = 13;
/** The plate's center from the wheel mount. */
const WHEEL_PLATE_CENTER_CM = { y: -9, z: 5 };
/**
 * The wheel base and rim as drawn, from the plate up to the top of the rim; from the rim's
 * front, 14.65 cm before the mount, to the base's back, 16 cm behind it.
 */
const WHEEL_ENVELOPE_CM = { width: 32.3, height: 24.5, depth: 30.65 };
const WHEEL_ENVELOPE_CENTER_Z_CM = 0.675;

function wheelPlateAndWheel(design: CockpitDesign, lift: number): Part[] {
  const mount = {
    pivotMm: pointMm(0, lift + design.wheelH, design.wheelZ),
    tiltDeg: design.wheelTilt,
  };
  const plateCenter = {
    y: WHEEL_PLATE_CENTER_CM.y,
    z: WHEEL_MOUNT_FORWARD_CM + WHEEL_PLATE_CENTER_CM.z,
  };
  const plateSpec = {
    id: 'wheel-plate',
    name: 'Wheel plate',
    widthCm: design.width - RAILS_WIDTH_CM,
    depthCm: WHEEL_PLATE_DEPTH_CM,
    thicknessCm: WHEEL_PLATE_THICKNESS_CM,
  };
  const plate = tiltedPlate(mount, plateSpec, plateCenter);
  const plateStartZCm = plateCenter.z - WHEEL_PLATE_DEPTH_CM / 2;
  const originZCm = WHEEL_MOUNT_FORWARD_CM + WHEEL_ENVELOPE_CENTER_Z_CM;
  const wheel = peripheralOnPlate(
    mount,
    { id: 'wheel', name: 'Wheel base and wheel', envelopeCm: WHEEL_ENVELOPE_CM },
    {
      plateId: 'wheel-plate',
      alongCm: originZCm - plateStartZCm,
      originCm: { y: plateCenter.y + WHEEL_PLATE_THICKNESS_CM / 2, z: originZCm },
    },
    { role: 'hands', atMm: pointMm(0, lift + design.wheelH + 1, design.wheelZ - 2) },
  );
  return [plate, wheel];
}

interface LevelPlate {
  id: string;
  name: string;
  widthCm: number;
  depthCm: number;
  thicknessCm: number;
  /** The plate's center as drawn, before any base lift. */
  centerCm: { x: number; y: number; z: number };
}

const levelPlate = (plate: LevelPlate, lift: number): Part => ({
  kind: 'plate',
  id: plate.id,
  name: plate.name,
  widthMm: mm(plate.widthCm),
  depthMm: mm(plate.depthCm),
  thicknessMm: mm(plate.thicknessCm),
  ownHoles: [],
  placement: {
    kind: 'anchor',
    startMm: pointMm(
      plate.centerCm.x,
      lift + plate.centerCm.y - plate.thicknessCm / 2,
      plate.centerCm.z,
    ),
  },
});

/** A device standing on a level plate, centered where the drawing puts it. */
const deviceOn = (
  plate: LevelPlate,
  device: PeripheralSpec,
  centerCm: { x: number; z: number },
): Part => ({
  kind: 'peripheral',
  id: device.id,
  name: device.name,
  envelope: {
    widthMm: mm(device.envelopeCm.width),
    heightMm: mm(device.envelopeCm.height),
    depthMm: mm(device.envelopeCm.depth),
  },
  mountingPattern: { holes: [] },
  contactPoints: [],
  source: FROM_THE_DRAWING,
  placement: {
    kind: 'attachment',
    parentId: plate.id,
    face: '+y',
    alongMm: mm(centerCm.z - plate.centerCm.z + plate.depthCm / 2),
    acrossMm: mm(centerCm.x - plate.centerCm.x),
    fromEnd: 'start',
  },
});

const SIDE_PLATE_CM = { width: 18, depth: 25, thickness: 1 };
/** The devices as drawn, from the top of their plate to the top of their grip or lever. */
const JOYSTICK_ENVELOPE_CM = { width: 11, height: 21.5, depth: 13 };
const THROTTLE_ENVELOPE_CM = { width: 12, height: 13.5, depth: 18 };
const SHIFTER_ENVELOPE_CM = { width: 10, height: 21.3, depth: 12 };
const HANDBRAKE_ENVELOPE_CM = { width: 5, height: 26.2, depth: 14 };

/** The joystick on the pilot's right, the throttle on the left, each on its side plate. */
function sideControls(design: CockpitDesign, lift: number): Part[] {
  const mount = drivingMount(design);
  const sharesSide = design.shifter || design.handbrake;
  return sides.flatMap(({ sign, side }) => {
    const shift = sign === mount.sign && sharesSide ? SIDE_MOUNT_SHIFT_CM : 0;
    const plate: LevelPlate = {
      id: `hotas-plate-${side}`,
      name: `HOTAS plate, ${side}`,
      widthCm: SIDE_PLATE_CM.width,
      depthCm: SIDE_PLATE_CM.depth,
      thicknessCm: SIDE_PLATE_CM.thickness,
      centerCm: {
        x: sign * (design.width / 2 + design.hotasOut),
        y: design.hotasH,
        z: design.hotasZ + shift,
      },
    };
    const device =
      sign < 0
        ? { id: 'joystick', name: 'Joystick', envelopeCm: JOYSTICK_ENVELOPE_CM }
        : { id: 'throttle', name: 'Throttle', envelopeCm: THROTTLE_ENVELOPE_CM };
    return [levelPlate(plate, lift), deviceOn(plate, device, plate.centerCm)];
  });
}

function shifterControls(design: CockpitDesign, lift: number): Part[] {
  const mount = drivingMount(design);
  const plate: LevelPlate = {
    id: 'shifter-plate',
    name: 'Shifter / handbrake plate',
    widthCm: 20,
    depthCm: 30,
    thicknessCm: 1,
    centerCm: { x: mount.x, y: design.hotasH, z: mount.z },
  };
  const parts = [levelPlate(plate, lift)];
  if (design.shifter)
    parts.push(
      deviceOn(
        plate,
        { id: 'shifter', name: 'Shifter', envelopeCm: SHIFTER_ENVELOPE_CM },
        { x: mount.x - mount.sign * 3, z: mount.z - 5 },
      ),
    );
  if (design.handbrake)
    parts.push(
      deviceOn(
        plate,
        { id: 'handbrake', name: 'Handbrake', envelopeCm: HANDBRAKE_ENVELOPE_CM },
        { x: mount.x + mount.sign * 5, z: mount.z + 6 },
      ),
    );
  return parts;
}

function centerStickControl(design: CockpitDesign, lift: number): Part[] {
  const plate: LevelPlate = {
    id: 'center-stick-plate',
    name: 'Center stick plate',
    widthCm: 18,
    depthCm: 20,
    thicknessCm: 0.8,
    centerCm: { x: 0, y: design.stickH, z: design.stickZ },
  };
  const stickEnvelope = { ...JOYSTICK_ENVELOPE_CM, height: 20.6 };
  return [
    levelPlate(plate, lift),
    deviceOn(
      plate,
      { id: 'center-stick', name: 'Center stick', envelopeCm: stickEnvelope },
      plate.centerCm,
    ),
  ];
}
