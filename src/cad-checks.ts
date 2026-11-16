// The checks a CAD cockpit design gets on its own: interference between its parts, the parts
// that nothing supports, the joints still without connectors and the steps of its history that
// failed. Each is one check that lists what it found, so a design with many problems still
// reads at a glance.
import type { Check } from './checks.ts';
import { round } from './geometry.ts';
import type { Axis, ResolvedPart } from './cad/assembly.ts';
import type { PlacedConnector } from './cad/connectors.ts';
import { cockpitInterferences } from './cad/interference.ts';
import { jointsOf, type Joint } from './cad/joints.ts';
import { stepTitle, type Operation } from './cad/operations.ts';
import { unsupportedParts } from './cad/support.ts';

/** A design replayed from its history, with the steps that failed. */
export interface DesignToCheck {
  history: readonly Operation[];
  resolved: ReadonlyMap<string, ResolvedPart>;
  failures: ReadonlyMap<string, string>;
  /** The connectors on its joints; none when left out. */
  connectors?: readonly PlacedConnector[];
  /** Its joints; when left out, those its attachments and spans make. */
  joints?: readonly Joint[];
}

/** The shortest way out, in the frame of the part it was measured on. */
const WAY_OUT_TEXT: Record<Axis, string> = {
  x: 'sideways',
  y: 'up or down',
  z: 'front to back',
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
  return [
    interferenceCheck(design.resolved, design.connectors ?? []),
    supportCheck(design.resolved, design.joints ?? jointsOf(design.resolved)),
    pendingJointsCheck(
      design.resolved,
      design.joints ?? jointsOf(design.resolved),
      design.connectors ?? [],
    ),
    failedStepsCheck(design),
  ];
}

function interferenceCheck(
  resolved: ReadonlyMap<string, ResolvedPart>,
  connectors: readonly PlacedConnector[],
): Check {
  const items = cockpitInterferences(resolved, connectors).map(
    (found) =>
      `${found.partName} into ${found.otherName}: ${round(found.depthMm, 1)} mm ${WAY_OUT_TEXT[found.axis]}`,
  );
  return listCheck('cad-interference', 'Parts reaching into each other', items, {
    found: 'Within the cockpit, deepest first. Move or shorten one part of each pair.',
    none: 'No part of the cockpit reaches into another.',
  });
}

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
