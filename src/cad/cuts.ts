// The profiles to buy, grouped by cut: one section of one system at one length.
import type { ResolvedPart } from './assembly.ts';

export interface Cut {
  systemId: string;
  sectionId: string;
  /** Whole millimetres, as profiles are cut. */
  lengthMm: number;
  quantity: number;
  /** The names of the parts cut to this length, in the order they appear in the design. */
  names: string[];
}

export function cutList(resolved: ReadonlyMap<string, ResolvedPart>): Cut[] {
  const cuts = new Map<string, Cut>();
  for (const { part, lengthMm } of resolved.values()) {
    if (part.kind !== 'profile') continue;
    const cutLengthMm = Math.round(lengthMm);
    const key = `${part.systemId}|${part.sectionId}|${cutLengthMm}`;
    const cut = cuts.get(key);
    if (cut) {
      cut.quantity += 1;
      cut.names.push(part.name);
    } else {
      cuts.set(key, {
        systemId: part.systemId,
        sectionId: part.sectionId,
        lengthMm: cutLengthMm,
        quantity: 1,
        names: [part.name],
      });
    }
  }
  return [...cuts.values()];
}
