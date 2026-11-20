// The checks a CAD cockpit design gets on its own: interference between its parts, the parts
// that nothing supports, the joints still without connectors, the steps of its history that
// failed and, once a part slides, what meets at the ends of its travels and the spans its
// adjustments would stretch or squeeze. Each is one check that lists what it found, so a design
// with many problems still reads at a glance.
import type { Check } from '../shared/checks.ts';
import { round } from '../shared/geometry.ts';
import type { Axis, ResolvedPart } from './cad/parts/assembly.ts';
import type { PlacedConnector } from './cad/parts/connectors.ts';
import { cockpitInterferences, type CadInterference } from './cad/analysis/interference.ts';
import { jointsOf, type Joint } from './cad/parts/joints.ts';
import { adjustmentOf, stepTitle, type Operation } from './cad/history/operations.ts';
import { unsupportedParts } from './cad/analysis/support.ts';
import { travelInterferences, type FittedPose } from './cad/history/travel.ts';

/** A design replayed from its history, with the steps that failed. */
export interface DesignToCheck {
  history: readonly Operation[];
  resolved: ReadonlyMap<string, ResolvedPart>;
  failures: ReadonlyMap<string, string>;
  /** The connectors on its joints; none when left out. */
  connectors?: readonly PlacedConnector[];
  /** Its joints; when left out, those its attachments and spans make. */
  joints?: readonly Joint[];
  /** The design as fitted; when left out, every part is at the center of its travel. */
  fitted?: FittedPose;
}

/** The shortest way out, in the frame of the part it was measured on. */
const WAY_OUT_TEXT: Record<Axis, string> = {
  x: 'sideways',
  y: 'up or down',
  z: 'front to back',
};

/** The ends of a travel along each axis: +Z is the front, and −X is the pilot's right. */
const TRAVEL_END_TEXT: Record<Axis, { towardsPlus: string; towardsMinus: string }> = {
  x: { towardsPlus: 'left', towardsMinus: 'right' },
  y: { towardsPlus: 'top', towardsMinus: 'bottom' },
  z: { towardsPlus: 'front', towardsMinus: 'back' },
};

const countText = (count: number): string => (count ? String(count) : 'None');

/** One check that warns when it finds anything, and lists what it found. */
function listCheck(
  id: string,
  label: string,
  items: string[],
  detail: { found: string; none: string },
): Check {
  return {
    id,
    label,
    value: countText(items.length),
    level: items.length ? 'warning' : 'ok',
    detail: items.length ? detail.found : detail.none,
    items,
  };
}

export function cadChecks(design: DesignToCheck): Check[] {
  // Parts reach into each other where the driver has them, along their travels.
  const shown = design.fitted ?? design;
  const fitted = design.history.some((operation) => adjustmentOf(operation) !== undefined)
    ? [travelInterferenceCheck(design), fittedSpansCheck(design)]
    : [];
  return [
    interferenceCheck(shown.resolved, shown.connectors ?? []),
    supportCheck(design.resolved, design.joints ?? jointsOf(design.resolved)),
    pendingJointsCheck(
      design.resolved,
      design.joints ?? jointsOf(design.resolved),
      design.connectors ?? [],
    ),
    failedStepsCheck(design),
    ...fitted,
  ];
}

/** The parts that would reach into each other with one adjusted part at an end of its travel. */
function travelInterferenceCheck({ history, resolved, connectors = [] }: DesignToCheck): Check {
  const nameOf = (id: string) => resolved.get(id)?.part.name ?? id;
  const items = travelInterferences(history, resolved, connectors).map(
    ({ movedId, endMm, axis, interference }) => {
      const ends = TRAVEL_END_TEXT[axis];
      const end = endMm > 0 ? ends.towardsPlus : ends.towardsMinus;
      return `${interferenceText(interference)}, with ${nameOf(movedId)} at the ${end} end of its travel`;
    },
  );
  return listCheck('cad-travel-interference', 'Parts meeting along a travel', items, {
    found:
      'Each travel is checked at both ends, with the other parts where they are. Shorten the travel, or move one part of each pair.',
    none: 'No part reaches into another at either end of its travel.',
  });
}

/** The spans that would no longer meet their part with the adjusted parts where they are. */
function fittedSpansCheck({ resolved, fitted }: DesignToCheck): Check {
  const nameOf = (id: string) => resolved.get(id)?.part.name ?? id;
  const items = (fitted?.changedSpans ?? []).map(({ partId, reachesId, changeMm }) => {
    const way = changeMm > 0 ? 'longer' : 'shorter';
    return `${nameOf(partId)} would have to be ${round(Math.abs(changeMm), 1)} mm ${way} to meet ${nameOf(reachesId)}`;
  });
  return listCheck('cad-fitted-spans', 'Spans the adjustments move', items, {
    found:
      'A span is cut to its length, so the part it reaches no longer meets it as fitted. Move the parts back along their travels, or adjust a part the span does not depend on.',
    none: 'No adjustment moves a span away from the part it reaches.',
  });
}

function interferenceCheck(
  resolved: ReadonlyMap<string, ResolvedPart>,
  connectors: readonly PlacedConnector[],
): Check {
  const items = cockpitInterferences(resolved, connectors).map(interferenceText);
  return listCheck('cad-interference', 'Parts reaching into each other', items, {
    found: 'Within the cockpit, deepest first. Move or shorten one part of each pair.',
    none: 'No part of the cockpit reaches into another.',
  });
}

const interferenceText = (found: CadInterference): string =>
  `${found.partName} into ${found.otherName}: ${round(found.depthMm, 1)} mm ${WAY_OUT_TEXT[found.axis]}`;

function supportCheck(
  resolved: ReadonlyMap<string, ResolvedPart>,
  joints: readonly Joint[],
): Check {
  const items = unsupportedParts(resolved, joints).map((id) => resolved.get(id)?.part.name ?? id);
  const hasFeet = [...resolved.values()].some(({ part }) => part.kind === 'foot');
  return listCheck('cad-support', 'Unsupported parts', items, {
    found: hasFeet
      ? 'No joint connects them, through other parts, to a part on feet.'
      : 'The design has no feet yet: nothing in it stands on the floor.',
    none: 'Every part is joined, through others, to a part on feet.',
  });
}

function pendingJointsCheck(
  resolved: ReadonlyMap<string, ResolvedPart>,
  joints: readonly Joint[],
  connectors: readonly PlacedConnector[],
): Check {
  const nameOf = (id: string) => resolved.get(id)?.part.name ?? id;
  const fastened = new Set(connectors.map((connector) => connector.jointId));
  const items = joints
    .filter((joint) => !fastened.has(joint.id))
    .map((joint) => `${nameOf(joint.partId)} to ${nameOf(joint.toPartId)}`);
  return listCheck('cad-pending-joints', 'Joints without connectors', items, {
    found:
      'Their connectors, bolts and T-nuts are not in the parts to buy yet. Fasten them from the inspector of a part.',
    none: 'Every joint has its connectors.',
  });
}

function failedStepsCheck({ history, failures }: DesignToCheck): Check {
  const items = history.flatMap((operation, index) => {
    const failure = failures.get(operation.id);
    return failure === undefined
      ? []
      : [`Step ${index + 1}, ${stepTitle(history, operation)}: ${failure}`];
  });
  return listCheck('cad-failed-steps', 'Failed steps', items, {
    found: 'They add nothing to the design. Fix or delete them in the design history.',
    none: 'Every step of the design history applies.',
  });
}
