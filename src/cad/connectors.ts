// Where a connector sits on its joint, and whether it fits there. A corner bracket fastens a
// part that meets a face end on: one leg lies against a side of the joined part, the other on
// the face it meets, both from the joint's corner. It fits when both legs rest on their parts.
// A geometric check of the approximate model only.
import { faceAxis, type Axis, type BoxMm, type Face, type ResolvedPart } from './assembly.ts';
import { connectorFits, connectorType, profileSystem } from './catalog.ts';
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
