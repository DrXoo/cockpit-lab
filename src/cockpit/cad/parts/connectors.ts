// Where a connector sits on its joint, and whether it fits there. A corner bracket fastens a
// part that meets a face end on: one leg lies against a side of the joined part, the other on
// the face it meets, both from the joint's corner. It fits when both legs rest on their parts.
// Bolts fasten a plate to a profile: through the plate into T-nuts in the slots it covers, their
// heads on the plate. A geometric check of the approximate model only.
import { faceAxis, type Axis, type BoxMm, type Face, type ResolvedPart } from './assembly.ts';
import {
  connectorFits,
  connectorType,
  plateBoltType,
  profileSystem,
  type PlateBoltType,
} from './catalog.ts';
import type { Connector, Joint } from './joints.ts';

/** A connector where the design puts it, with what interference and drawings need. */
export interface PlacedConnector extends Connector {
  /** Names the connector by its type and its part, for the checks. */
  name: string;
  /** The face of the met part the connector's other leg lies on. */
  toFace: Face;
  /** The box both legs take up, in the frame of the joint's parts. */
  box: BoxMm;
  tiltDeg: number;
}

/**
 * Overlaps of a leg past the edge of its face up to this many mm still count as resting on it,
 * like contact between parts (CAD_CONTACT_MM).
 */
const REST_TOLERANCE_MM = 0.5;

const AXES: readonly Axis[] = ['x', 'y', 'z'];
const sign = (face: Face): 1 | -1 => (face[0] === '+' ? 1 : -1);

/** The connector of `typeId` on side `side` of a joint, or why it does not fit there. */
export function placedConnector(
  joint: Joint,
  joined: ResolvedPart,
  met: ResolvedPart,
  connector: Connector,
): PlacedConnector | string {
  const type = connectorType(connector.typeId);
  const { side } = connector;
  const normal = faceAxis(joint.toFace);
  const misfit = `A ${type.name} on side ${side} of ${joined.part.name} would not rest on`;
  if (joined.part.kind !== 'profile' || joined.part.axis !== normal)
    return `A ${type.name} fastens a part that meets a face end on, and ${joined.part.name} does not meet ${met.part.name} that way.`;
  for (const part of [joined.part, met.part])
    if (part.kind === 'profile' && !connectorFits(type, profileSystem(part.systemId)))
      return `A ${type.name} does not fit the profiles of ${part.name}.`;
  const across = faceAxis(side);
  if (across === normal) return `${misfit} ${joined.part.name}: that side is its end.`;
  const third = AXES.find((axis) => axis !== normal && axis !== across) ?? 'x';
  const box = bracketBox(joined.box, met.box, joint.toFace, side, type);
  const center = (joined.box.min[third] + joined.box.max[third]) / 2;
  box.min[third] = center - type.widthMm / 2;
  box.max[third] = center + type.widthMm / 2;
  if (!within(box, joined.box, [normal, third])) return `${misfit} ${joined.part.name}.`;
  if (!within(box, met.box, [across, third])) return `${misfit} ${met.part.name}.`;
  return {
    ...connector,
    name: `${type.name} of ${joined.part.name}`,
    toFace: joint.toFace,
    box,
    tiltDeg: joined.tiltDeg,
  };
}

/** The legs' box along the joined part and out of its side, before it is centered across. */
function bracketBox(
  joined: BoxMm,
  met: BoxMm,
  toFace: Face,
  side: Face,
  type: { legMm: number },
): BoxMm {
  const normal = faceAxis(toFace);
  const across = faceAxis(side);
  const box: BoxMm = { min: { ...joined.min }, max: { ...joined.max } };
  const plane = sign(toFace) > 0 ? met.max[normal] : met.min[normal];
  const reach = plane + sign(toFace) * type.legMm;
  box.min[normal] = Math.min(plane, reach);
  box.max[normal] = Math.max(plane, reach);
  const sideOf = sign(side) > 0 ? joined.max[across] : joined.min[across];
  const out = sideOf + sign(side) * type.legMm;
  box.min[across] = Math.min(sideOf, out);
  box.max[across] = Math.max(sideOf, out);
  return box;
}

/** Whether `box` stays within `part` along `axes`, as a leg resting on it does. */
function within(box: BoxMm, part: BoxMm, axes: readonly Axis[]): boolean {
  return axes.every(
    (axis) =>
      box.min[axis] >= part.min[axis] - REST_TOLERANCE_MM &&
      box.max[axis] <= part.max[axis] + REST_TOLERANCE_MM,
  );
}

/** Bolts of `typeId`, as many in each slot as `perSlot`, on a plate's joint to a profile. */
export interface BoltsOnAJoint {
  /** What the ids of its bolts start with. */
  id: string;
  typeId: string;
  perSlot: number;
}

/**
 * The bolts that fasten a plate to the profile of its joint, or why they cannot: in every slot
 * the plate covers, spaced evenly along where the two touch, their heads on the plate.
 */
export function placedBolts(
  joint: Joint,
  joined: ResolvedPart,
  met: ResolvedPart,
  bolts: BoltsOnAJoint,
): PlacedConnector[] | string {
  const type = plateBoltType(bolts.typeId);
  const slots = coveredSlots(joint, joined, met, type);
  if (typeof slots === 'string') return slots;
  const { along, across, centersMm } = slots;
  const normal = faceAxis(joint.toFace);
  const fromMm = Math.max(joined.box.min[along], met.box.min[along]);
  const toMm = Math.min(joined.box.max[along], met.box.max[along]);
  const plateFace = sign(joint.toFace) > 0 ? joined.box.max[normal] : joined.box.min[normal];
  const headTop = plateFace + sign(joint.toFace) * type.headHeightMm;
  const placed: PlacedConnector[] = [];
  centersMm.forEach((acrossMm, slot) => {
    for (let index = 0; index < bolts.perSlot; index++) {
      const alongMm = fromMm + ((index + 0.5) * (toMm - fromMm)) / bolts.perSlot;
      const min = { x: 0, y: 0, z: 0 };
      const max = { x: 0, y: 0, z: 0 };
      min[across] = acrossMm - type.headWidthMm / 2;
      max[across] = acrossMm + type.headWidthMm / 2;
      min[along] = alongMm - type.headWidthMm / 2;
      max[along] = alongMm + type.headWidthMm / 2;
      min[normal] = Math.min(plateFace, headTop);
      max[normal] = Math.max(plateFace, headTop);
      placed.push({
        id: `${bolts.id}:${slot + 1}:${index + 1}`,
        jointId: joint.id,
        typeId: type.id,
        side: joint.toFace,
        name: `${type.name} of ${joined.part.name}`,
        toFace: joint.toFace,
        box: { min, max },
        tiltDeg: joined.tiltDeg,
      });
    }
  });
  return placed;
}

/**
 * Where the center line of each slot of a profile's face is, along `across`, the axis of the
 * face across the profile: the slots of a series sit one module apart, centered on the face, as
 * they are drawn.
 */
export function slotCentersAcross(profile: ResolvedPart, across: Axis): number[] {
  if (profile.part.kind !== 'profile') throw new Error(`${profile.part.name} is not a profile.`);
  const system = profileSystem(profile.part.systemId);
  const faceMin = profile.box.min[across];
  const faceWidthMm = profile.box.max[across] - faceMin;
  const count = Math.max(1, Math.round(faceWidthMm / system.series));
  return Array.from({ length: count }, (_, slot) => faceMin + ((slot + 0.5) * faceWidthMm) / count);
}

/** The slots of a profile's face a plate covers, where bolts go, and the axes they lie along. */
interface CoveredSlots {
  /** The profile's length, along which the bolts of a slot are spaced. */
  along: Axis;
  /** Across the face, where each slot's center line is. */
  across: Axis;
  centersMm: number[];
}

/**
 * The slots of the met profile's face that a plate covers, with room for a bolt head on the
 * plate either side of the slot's center line; or why bolts cannot fasten the joint.
 */
export function coveredSlots(
  joint: Joint,
  joined: ResolvedPart,
  met: ResolvedPart,
  type: PlateBoltType,
): CoveredSlots | string {
  const plate = joined.part;
  const profile = met.part;
  if (plate.kind !== 'plate' || profile.kind !== 'profile')
    return `Bolts fasten a plate to a profile, not ${plate.name} to ${profile.name}.`;
  const system = profileSystem(profile.systemId);
  if (!type.fitsSystems.includes(system.id))
    return `A ${type.name} does not fit the slots of ${profile.name}.`;
  const normal = faceAxis(joint.toFace);
  const along = profile.axis;
  if (along === normal) return `${plate.name} meets the end of ${profile.name}, which has no slot.`;
  const across = AXES.find((axis) => axis !== normal && axis !== along) ?? 'x';
  const halfHead = type.headWidthMm / 2;
  const centersMm = slotCentersAcross(met, across).filter(
    (centerMm) =>
      centerMm - halfHead >= joined.box.min[across] - REST_TOLERANCE_MM &&
      centerMm + halfHead <= joined.box.max[across] + REST_TOLERANCE_MM,
  );
  if (centersMm.length === 0)
    return `${plate.name} covers no slot of ${profile.name}: move it over one to bolt it.`;
  return { along, across, centersMm };
}
