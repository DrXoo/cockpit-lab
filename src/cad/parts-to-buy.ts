// The parts to buy for a CAD cockpit design: its cuts of profile and plate, the connectors on its
// joints with the fasteners their types need, the bolts and T-nuts that fasten its plates, and
// its feet. Joints without connectors are listed as pending.
import type { ResolvedPart } from './assembly.ts';
import {
  boltLengthFor,
  connectorType,
  fastenersOf,
  footType,
  isPlateBolt,
  plateBoltFastenerId,
  plateBoltType,
  sheetType,
  type FastenerCount,
} from './catalog.ts';
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

  const connectorTypes = connectors
    .filter((connector) => !isPlateBolt(connector.typeId))
    .map((connector) => connectorType(connector.typeId));
  const boltFasteners = connectors
    .filter((connector) => isPlateBolt(connector.typeId))
    .flatMap((bolt) => fastenersOfBolt(bolt, resolved, joints));
  const feetTypes = [...resolved.values()].flatMap(({ part }) =>
    part.kind === 'foot' ? [footType(part.footTypeId)] : [],
  );
  const resolvedJoints = new Set(connectors.map((connector) => connector.jointId));
  const nameOf = (id: string) => resolved.get(id)?.part.name ?? id;

  return {
    cuts: cutList(resolved),
    plates: plateCutList(resolved),
    connectors: countByType(connectorTypes),
    fasteners: sumFasteners([...connectorTypes.flatMap(fastenersOf), ...boltFasteners]),
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

/** A plate bolt and its T-nut, the bolt long enough for the plate of its joint. */
function fastenersOfBolt(
  bolt: Connector,
  resolved: ReadonlyMap<string, ResolvedPart>,
  joints: readonly Joint[],
): FastenerCount[] {
  const type = plateBoltType(bolt.typeId);
  const joint = joints.find((candidate) => candidate.id === bolt.jointId);
  const plate = joint && resolved.get(joint.partId)?.part;
  if (plate?.kind !== 'plate')
    throw new Error(`Bolt ${bolt.id} is on joint ${bolt.jointId}, which fastens no plate.`);
  const lengthMm = boltLengthFor(type, sheetType(plate.sheetId).thicknessMm);
  return [
    { id: plateBoltFastenerId(lengthMm), quantity: 1 },
    { id: type.tNutId, quantity: 1 },
  ];
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
