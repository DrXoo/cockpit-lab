// The driver's contact points in a CAD design, from the peripherals that carry them, in mm.
import {
  contactPointsMm,
  type ContactRole,
  type Face,
  type ResolvedPart,
  type Vec3Mm,
} from './assembly.ts';

export interface CadContacts {
  hip: Vec3Mm;
  heel: Vec3Mm;
  /** Null when no peripheral takes the hands, as without a wheel. */
  hands: Vec3Mm | null;
  /** The backrest angle of the seat that carries the hip. */
  reclineDeg: number;
  /** The way the seat faces, which is the way the driver faces. */
  facing: Face;
}

/** What to mount when no part carries a contact the driver needs. */
const MISSING_TEXT: Record<'hip' | 'heel', string> = {
  hip: "Mount a seat: it carries the driver's hip.",
  heel: "Mount pedals: they carry the driver's heels.",
};

interface Found {
  pointMm: Vec3Mm;
  holder: ResolvedPart;
}

/**
 * Where the design meets the driver, or why it cannot seat one: no seat or pedals, or two
 * parts that carry the same contact.
 */
export function cadContacts(
  resolved: ReadonlyMap<string, ResolvedPart>,
): { contacts: CadContacts } | { reason: string } {
  const found = new Map<ContactRole, Found[]>();
  for (const part of resolved.values())
    for (const { role, pointMm } of contactPointsMm(part))
      found.set(role, [...(found.get(role) ?? []), { pointMm, holder: part }]);
  for (const [role, all] of found)
    if (all.length > 1)
      return { reason: `The ${role} contact is on ${all.length} parts; the driver needs one.` };
  const only = (role: ContactRole): Found | undefined => found.get(role)?.[0];
  const hip = only('hip');
  if (!hip) return { reason: MISSING_TEXT.hip };
  const heel = only('heel');
  if (!heel) return { reason: MISSING_TEXT.heel };
  const seat = hip.holder.part;
  if (seat.kind !== 'peripheral') return { reason: MISSING_TEXT.hip };
  return {
    contacts: {
      hip: hip.pointMm,
      heel: heel.pointMm,
      hands: only('hands')?.pointMm ?? null,
      reclineDeg: seat.backrestDeg ?? 0,
      facing: seat.facing,
    },
  };
}
