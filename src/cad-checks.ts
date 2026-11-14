// The checks a CAD cockpit design gets on its own: interference between its parts and the parts
// that nothing supports. Each is one check that lists what it found, so a design converted
// from the parametric one, with every problem its drawing hid, still reads at a glance.
import type { Check } from './checks.ts';
import { depthText } from './interference.ts';
import type { Axis, ResolvedPart } from './cad/assembly.ts';
import { cockpitInterferences } from './cad/interference.ts';
import { unsupportedParts } from './cad/support.ts';
import { MM_PER_CM } from './units.ts';

/** The shortest way out, in the frame of the part it was measured on. */
const WAY_OUT_TEXT: Record<Axis, string> = {
  x: 'sideways',
  y: 'up or down',
  z: 'front to back',
};

const countText = (count: number): string => (count ? String(count) : 'None');

export function cadChecks(resolved: ReadonlyMap<string, ResolvedPart>): Check[] {
  const interferences = cockpitInterferences(resolved).map(
    (found) =>
      `${found.partName} into ${found.otherName}: ${depthText(found.depthMm / MM_PER_CM)} ${WAY_OUT_TEXT[found.axis]}`,
  );
  const unsupported = unsupportedParts(resolved).map((id) => resolved.get(id)?.part.name ?? id);
  return [
    {
      id: 'cad-interference',
      label: 'Parts reaching into each other',
      value: countText(interferences.length),
      level: interferences.length ? 'warning' : 'ok',
      detail: interferences.length
        ? 'Within the cockpit, deepest first. Move or shorten one part of each pair.'
        : 'No part of the cockpit reaches into another.',
      items: interferences,
    },
    {
      id: 'cad-support',
      label: 'Unsupported parts',
      value: countText(unsupported.length),
      level: unsupported.length ? 'warning' : 'ok',
      detail: unsupported.length
        ? 'No joint connects them, through other parts, to a part on feet.'
        : 'Every part is joined, through others, to a part on feet.',
      items: unsupported,
    },
  ];
}
