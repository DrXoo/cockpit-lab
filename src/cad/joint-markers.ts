// The markers of joints in the view (docs/cockpit-editor-interactions.md): a joint without
// connectors on every such joint, a fastened one on the joints of the selected part, and two
// parts that touch without a joint. Each sits in the middle of where its two parts touch, in
// cockpit coordinates.
import { tiltedFromPivot, type BoxMm, type ResolvedPart, type Vec3Mm } from './assembly.ts';
import { joinable } from './fastening.ts';
import { replayDesign, type Operation } from './history.ts';
import { joinedTogether, touchingFace, type Joint } from './joints.ts';

export interface JointMarker {
  /** The joint's id, or for two parts that only touch, both of them as `part-1+part-2`. */
  id: string;
  state: 'pending' | 'fastened' | 'touching';
  partId: string;
  toPartId: string;
  /** The middle of where the two parts touch. */
  pointMm: Vec3Mm;
}

const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };

/**
 * The joint markers of the design at step `at`, with `selectedPartId` selected. Which parts
 * are joined or touch is the design's, at the centers of the travels; each marker sits where
 * its two parts are drawn, as fitted.
 */
export function jointMarkers(
  history: readonly Operation[],
  selectedPartId: string | null,
  at: number = history.length,
): JointMarker[] {
  const { resolved, joints, connectors, fitted } = replayDesign(history, at);
  return markersAt(resolved, joints, connectors, selectedPartId).map((marker) => {
    const part = fitted.resolved.get(marker.partId);
    const other = fitted.resolved.get(marker.toPartId);
    return part && other ? { ...marker, pointMm: contactMiddle(part, other) } : marker;
  });
}

function markersAt(
  resolved: ReadonlyMap<string, ResolvedPart>,
  joints: readonly Joint[],
  connectors: readonly { jointId: string }[],
  selectedPartId: string | null,
): JointMarker[] {
  const fastened = new Set(connectors.map(({ jointId }) => jointId));
  const markers: JointMarker[] = [];
  for (const joint of joints) {
    const part = resolved.get(joint.partId);
    const other = resolved.get(joint.toPartId);
    if (!part || !other) continue;
    const state = fastened.has(joint.id) ? 'fastened' : 'pending';
    const ofSelected = selectedPartId === joint.partId || selectedPartId === joint.toPartId;
    if (state === 'fastened' && !ofSelected) continue;
    markers.push({ ...joint, state, pointMm: contactMiddle(part, other) });
  }
  return [...markers, ...touchingMarkers([...resolved.values()], joints)];
}

/** Two parts that touch, and could be joined, without a joint between them. */
function touchingMarkers(parts: readonly ResolvedPart[], joints: readonly Joint[]): JointMarker[] {
  return parts.flatMap((part, index) =>
    parts
      .slice(index + 1)
      .filter(
        (other) =>
          joinable(part.part, other.part) &&
          touchingFace(part, other) !== null &&
          !joinedTogether(joints, part.part.id, other.part.id),
      )
      .map((other) => ({
        id: `${part.part.id}+${other.part.id}`,
        state: 'touching' as const,
        partId: part.part.id,
        toPartId: other.part.id,
        pointMm: contactMiddle(part, other),
      })),
  );
}

/** The middle of the box two touching parts have in common, flat where they meet. */
function contactMiddle(part: ResolvedPart, other: ResolvedPart): Vec3Mm {
  const middle = (a: BoxMm, b: BoxMm, axis: 'x' | 'y' | 'z') =>
    (Math.max(a.min[axis], b.min[axis]) + Math.min(a.max[axis], b.max[axis])) / 2;
  const inFrame = {
    x: middle(part.box, other.box, 'x'),
    y: middle(part.box, other.box, 'y'),
    z: middle(part.box, other.box, 'z'),
  };
  return tiltedFromPivot(ORIGIN, inFrame, part.tiltDeg);
}
