// Support: a part is supported when joints connect it, through other parts, to a part that
// stands on feet. A peripheral, bolted through its mounting pattern, is supported by what it
// stands on. Unsupported parts are reported, never moved. Joints count whether or not
// they have connectors yet; the parts to buy list the unresolved ones as pending.
// A geometric check only: it says nothing about loads or stiffness.
import type { ResolvedPart } from './assembly.ts';
import { jointsOf, type Joint } from './joints.ts';

/** The ids of the parts that are not supported, in the order they appear in the design. */
export function unsupportedParts(
  resolved: ReadonlyMap<string, ResolvedPart>,
  joints: readonly Joint[] = jointsOf(resolved),
): string[] {
  const neighbors = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
  };
  for (const joint of joints) {
    link(joint.partId, joint.toPartId);
    link(joint.toPartId, joint.partId);
  }
  for (const { part } of resolved.values())
    if (part.kind === 'peripheral' && part.placement.kind === 'attachment')
      link(part.placement.parentId, part.id);

  const supported = new Set<string>();
  const pending: string[] = [];
  for (const { part } of resolved.values()) {
    if (part.kind !== 'foot') continue;
    supported.add(part.id);
    pending.push(part.placement.parentId);
  }
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (supported.has(id)) continue;
    supported.add(id);
    pending.push(...(neighbors.get(id) ?? []));
  }
  return [...resolved.keys()].filter((id) => !supported.has(id));
}
