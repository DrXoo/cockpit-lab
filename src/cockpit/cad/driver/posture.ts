// The driver's contact points in a CAD design, from the peripherals that carry them, in mm.
import {
  contactPointsMm,
  type ContactRole,
  type Face,
  type Hand,
  type ResolvedPart,
  type Vec3Mm,
} from '../parts/assembly.ts';
import { gripUse, type GripUse } from '../parts/catalog.ts';

export interface CadContacts {
  hip: Vec3Mm;
  heel: Vec3Mm;
  /** Null when no peripheral takes the hands, as without a wheel. */
  hands: Vec3Mm | null;
  /** The backrest angle of the seat that carries the hip. */
  reclineDeg: number;
  /** The way the seat faces, which is the way the driver faces. */
  facing: Face;
  /** Every grip of the design, in the order of its parts. */
  grips: CadGrip[];
}

/** A peripheral's grip, used by one hand. */
export interface CadGrip {
  partId: string;
  /** The peripheral's name, as the user gave it. */
  name: string;
  hand: Hand;
  use: GripUse;
  pointMm: Vec3Mm;
}

/** What to mount when no part carries a contact the driver needs. */
const MISSING_TEXT: Record<'hip' | 'heel', string> = {
  hip: "Mount a seat: it carries the driver's hip.",
  heel: "Mount pedals: they carry the driver's heels.",
};

/**
 * The contacts the driver is seated on, each carried by one part at most. A grip is held by one
 * hand, and a design may have one for each.
 */
const SEATING_ROLES: readonly ContactRole[] = ['hip', 'heel', 'hands'];

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
      if (SEATING_ROLES.includes(role))
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
      grips: gripsIn(resolved),
    },
  };
}

function gripsIn(resolved: ReadonlyMap<string, ResolvedPart>): CadGrip[] {
  const grips: CadGrip[] = [];
  for (const holder of resolved.values()) {
    const { part } = holder;
    if (part.kind !== 'peripheral' || !part.hand) continue;
    for (const { role, pointMm } of contactPointsMm(holder))
      if (role === 'grip')
        grips.push({
          partId: part.id,
          name: part.name,
          hand: part.hand,
          use: gripUse(part.category),
          pointMm,
        });
  }
  return grips;
}
