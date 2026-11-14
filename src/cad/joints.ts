// Joints: where two parts are fastened together. Every attachment and each end of a span that
// meets its part make one, automatically. A foot comes with its own adapter and a peripheral is
// bolted through its mounting pattern, so neither makes one.
import type { Face, ResolvedPart } from './assembly.ts';

export interface Joint {
  /** Stable while the attachment exists: the joined part, then the part it meets. */
  id: string;
  partId: string;
  toPartId: string;
  /** The face of `toPartId` that the part meets. */
  toFace: Face;
}

const opposite = (face: Face): Face => `${face[0] === '+' ? '-' : '+'}${face[1]}` as Face;

const jointBetween = (partId: string, toPartId: string, toFace: Face): Joint => ({
  id: `${partId}@${toPartId}`,
  partId,
  toPartId,
  toFace,
});

export function jointsOf(resolved: ReadonlyMap<string, ResolvedPart>): Joint[] {
  const joints: Joint[] = [];
  for (const { part, openEnd } of resolved.values()) {
    if (part.kind === 'foot' || part.kind === 'peripheral') continue;
    const placement = part.placement;
    if (placement.kind === 'anchor') continue;
    joints.push(jointBetween(part.id, placement.parentId, placement.face));
    if (placement.kind === 'span' && !openEnd)
      joints.push(jointBetween(part.id, placement.reachesId, opposite(placement.face)));
  }
  return joints;
}

/** A catalog piece that fastens the two parts of one joint, on one side of its corner. */
export interface Connector {
  id: string;
  jointId: string;
  typeId: string;
  /** The face of the joined part (`partId`) the connector sits against. */
  side: Face;
}
