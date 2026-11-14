// Converts a parametric cockpit design into CAD parts, as the parametric drawing places its
// profiles (src/render-rig.ts). The conversion is faithful even where the design could not be
// built: seat posts that rest on no profile stay anchored where they are drawn, and profiles
// that cross each other are kept crossing, for the CAD to report (docs/mini-cad.md).
// Parts hang from one another only where the drawing puts them face to face.
import type { CockpitDesign } from '../cockpit-design.ts';
import { drivingMount, rigLift } from '../rig.ts';
import { cmToMm } from '../units.ts';
import { tiltedFromPivot, type Axis, type Part, type Vec3Mm } from './assembly.ts';
import { MOTEDIS_SERIES_40_SLOT_8 } from './catalog.ts';

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

const anchored = (spec: ProfileSpec, startMm: Vec3Mm, tiltDeg = 0): Part =>
  profileOf(
    spec,
    tiltDeg === 0 ? { kind: 'anchor', startMm } : { kind: 'anchor', startMm, tiltDeg },
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
    ...baseExtensions(design, lift),
    ...seatSupports(design, lift),
    ...pedalDeck(design, lift),
  ];
  if (design.wheel) parts.push(...wheelMount(design, lift));
  if (design.hotas) parts.push(...sideMounts(design, lift));
  if (design.centerStick) parts.push(...centerStick(design, lift));
  if (design.shifter || design.handbrake) parts.push(...shifterMount(design, lift));
  return parts;
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

function baseExtensions(design: CockpitDesign, lift: number): Part[] {
  if (lift <= 0) return [];
  const ends = [
    { id: 'rear', fromEnd: 'start' },
    { id: 'front', fromEnd: 'end' },
  ] as const;
  return sides.flatMap(({ sign, side }) =>
    ends.map((end) =>
      profileOf(
        {
          id: `base-extension-${end.id}-${side}`,
          name: `Base extension, ${end.id} ${side}`,
          section: '40x40',
          axis: 'y',
          heightAxis: 'z',
          lengthCm: lift,
        },
        {
          kind: 'attachment',
          parentId: railId(sign),
          face: '-y',
          alongMm: mm(END_INSET_CM),
          fromEnd: end.fromEnd,
        },
      ),
    ),
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
