// Fastening the joints of a design history with connectors (docs/adr/0005). A joint has one
// fastening step, which holds all its connectors: adding or taking one away edits that step, and
// a joint left without connectors loses it. Lengths are in mm.
import type { Axis, Face, ResolvedPart } from './assembly.ts';
import { faceAxis } from './assembly.ts';
import { placedConnector } from './connectors.ts';
import {
  addOperation,
  changeOperation,
  deleteOperation,
  FACES,
  nextIdentifiers,
  replayDesign,
  type ConnectorChoice,
  type FastenJoint,
  type Operation,
} from './history.ts';
import { jointIdOf, type Joint } from './joints.ts';

/** The only connector in the catalog so far. */
const CORNER_BRACKET_ID = 'corner-bracket-40';

/** A joint of a part as the inspector shows it. */
export interface JointOfPart {
  jointId: string;
  partName: string;
  toPartName: string;
  /** The sides of the joined part that have a connector. */
  sides: Face[];
  /** The sides of the joined part where a corner bracket fits. */
  fittingSides: Face[];
  /** The sides that fit along the part it meets, where the quick action puts two brackets. */
  alongSides: Face[];
}

interface JointAtStep {
  joint: Joint;
  joined: ResolvedPart;
  met: ResolvedPart;
}

/** A joint in the design at step `at`, with its two parts, or an error saying it is not. */
function jointAt(history: readonly Operation[], jointId: string, at: number): JointAtStep {
  const design = replayDesign(history, at);
  const joint = design.joints.find((candidate) => candidate.id === jointId);
  const joined = joint && design.resolved.get(joint.partId);
  const met = joint && design.resolved.get(joint.toPartId);
  if (!joint || !joined || !met) throw new Error(`There is no joint ${jointId} at this step.`);
  return { joint, joined, met };
}

/** Why a corner bracket on `side` would not fit the joint, or null when it fits. */
function bracketMisfit({ joint, joined, met }: JointAtStep, side: Face): string | null {
  const placed = placedConnector(joint, joined, met, {
    id: side,
    jointId: joint.id,
    typeId: CORNER_BRACKET_ID,
    side,
  });
  return typeof placed === 'string' ? placed : null;
}

/** The sides of the joined part where a corner bracket fits the joint. */
export function fittingSides(
  history: readonly Operation[],
  jointId: string,
  at: number = history.length,
): Face[] {
  const found = jointAt(history, jointId, at);
  return FACES.filter((side) => bracketMisfit(found, side) === null);
}

/** The sides that fit along the length of the part the joint meets. */
function alongSides(found: JointAtStep, fitting: readonly Face[]): Face[] {
  const met = found.met.part;
  const along: Axis | null = met.kind === 'profile' ? met.axis : null;
  return fitting.filter((side) => faceAxis(side) === along);
}

/** The joints a part is in, as the joined part or the part met, at step `at`. */
export function jointsOfPart(
  history: readonly Operation[],
  partId: string,
  at: number = history.length,
): JointOfPart[] {
  const design = replayDesign(history, at);
  const nameOf = (id: string) => design.resolved.get(id)?.part.name ?? id;
  return design.joints
    .filter((joint) => joint.partId === partId || joint.toPartId === partId)
    .map((joint) => {
      const fitting = fittingSides(history, joint.id, at);
      return {
        jointId: joint.id,
        partName: nameOf(joint.partId),
        toPartName: nameOf(joint.toPartId),
        sides: fasteningOf(history, joint.id)?.connectors.map(({ side }) => side) ?? [],
        fittingSides: fitting,
        alongSides: alongSides(jointAt(history, joint.id, at), fitting),
      };
    });
}

/** The step that fastens a joint, if it has one. */
export function fasteningOf(
  history: readonly Operation[],
  jointId: string,
): FastenJoint | undefined {
  return history.find(
    (operation): operation is FastenJoint =>
      operation.kind === 'fasten-joint' && jointIdOf(operation) === jointId,
  );
}

/**
 * Puts a corner bracket on one side of a joint, or takes it away. The first connector of a joint
 * adds its fastening step at `at`, the history marker; the last one taken away deletes it.
 */
export function setConnector(
  history: readonly Operation[],
  jointId: string,
  side: Face,
  on: boolean,
  at: number = history.length,
): Operation[] {
  const existing = fasteningOf(history, jointId);
  const kept = existing?.connectors.filter((connector) => connector.side !== side) ?? [];
  if (!on) {
    if (!existing) return [...history];
    if (kept.length === 0) return deleteOperation(history, existing.id);
    return changeOperation(history, { ...existing, connectors: kept });
  }
  const found = jointAt(history, jointId, at);
  const misfit = bracketMisfit(found, side);
  if (misfit) throw new Error(misfit);
  return withConnectors(history, found.joint, [...kept, { typeId: CORNER_BRACKET_ID, side }], at);
}

/**
 * Puts two corner brackets on a joint, one each side along the part it meets, keeping the
 * connectors it has.
 */
export function fastenWithBrackets(
  history: readonly Operation[],
  jointId: string,
  at: number = history.length,
): Operation[] {
  const found = jointAt(history, jointId, at);
  const along = alongSides(found, fittingSides(history, jointId, at));
  if (along.length === 0) {
    const names = `${found.joined.part.name} to ${found.met.part.name}`;
    throw new Error(
      `No corner bracket fits the joint of ${names} along ${found.met.part.name}: its legs would not rest on both parts.`,
    );
  }
  const kept = fasteningOf(history, jointId)?.connectors ?? [];
  const added = along
    .filter((side) => !kept.some((connector) => connector.side === side))
    .map((side): ConnectorChoice => ({ typeId: CORNER_BRACKET_ID, side }));
  return withConnectors(history, found.joint, [...kept, ...added], at);
}

/** The joint's fastening step with these connectors, added at `at` if it had none. */
function withConnectors(
  history: readonly Operation[],
  joint: Joint,
  connectors: ConnectorChoice[],
  at: number,
): Operation[] {
  const existing = fasteningOf(history, joint.id);
  if (existing) return changeOperation(history, { ...existing, connectors });
  const fastening: FastenJoint = {
    kind: 'fasten-joint',
    id: nextIdentifiers(history).id,
    partId: joint.partId,
    toPartId: joint.toPartId,
    connectors,
  };
  return addOperation(history, fastening, at);
}
