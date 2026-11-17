// The parts to buy for a CAD cockpit design: its cuts of profile and plate, the connectors on its
// joints with the fasteners their types need, and its feet. Joints without connectors are listed
// as pending.
import type { ResolvedPart } from './assembly.ts';
import { connectorType, fastenersOf, footType, type FastenerCount } from './catalog.ts';
import { cutList, plateCutList, type Cut, type PlateCut } from './cuts.ts';
import { jointsOf, type Connector, type Joint } from './joints.ts';

export interface CatalogCount {
  typeId: string;
  name: string;
  quantity: number;
}

export interface PendingJoint {
  jointId: string;
  partName: string;
  toPartName: string;
}

export interface PartsToBuy {
  cuts: Cut[];
  plates: PlateCut[];
  connectors: CatalogCount[];
  fasteners: FastenerCount[];
  feet: CatalogCount[];
  pendingJoints: PendingJoint[];
}

export function partsToBuy(
  resolved: ReadonlyMap<string, ResolvedPart>,
  connectors: readonly Connector[],
  joints: readonly Joint[] = jointsOf(resolved),
): PartsToBuy {
  const jointIds = new Set(joints.map((joint) => joint.id));
  for (const connector of connectors)
    if (!jointIds.has(connector.jointId))
      throw new Error(
        `Connector ${connector.id} is on joint ${connector.jointId}, which does not exist.`,
      );

  const connectorTypes = connectors.map((connector) => connectorType(connector.typeId));
  const feetTypes = [...resolved.values()].flatMap(({ part }) =>
    part.kind === 'foot' ? [footType(part.footTypeId)] : [],
  );
  const resolvedJoints = new Set(connectors.map((connector) => connector.jointId));
  const nameOf = (id: string) => resolved.get(id)?.part.name ?? id;

  return {
    cuts: cutList(resolved),
    plates: plateCutList(resolved),
    connectors: countByType(connectorTypes),
    fasteners: sumFasteners(connectorTypes.flatMap(fastenersOf)),
    feet: countByType(feetTypes),
    pendingJoints: joints
      .filter((joint) => !resolvedJoints.has(joint.id))
      .map((joint) => ({
        jointId: joint.id,
        partName: nameOf(joint.partId),
        toPartName: nameOf(joint.toPartId),
      })),
  };
}

/** One count per catalog type, in order of first appearance. */
function countByType(types: readonly { id: string; name: string }[]): CatalogCount[] {
  const counts = new Map<string, CatalogCount>();
  for (const type of types) {
    const count = counts.get(type.id);
    if (count) count.quantity += 1;
    else counts.set(type.id, { typeId: type.id, name: type.name, quantity: 1 });
  }
  return [...counts.values()];
}

function sumFasteners(fasteners: readonly FastenerCount[]): FastenerCount[] {
  const totals = new Map<string, number>();
  for (const { id, quantity } of fasteners) totals.set(id, (totals.get(id) ?? 0) + quantity);
  return [...totals].map(([id, quantity]) => ({ id, quantity }));
}
