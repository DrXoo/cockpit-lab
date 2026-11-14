// The driver's contact points in a CAD design, from the peripherals that carry them, in the
// cockpit's side plane in cm as the posture model takes them.
import { postureFrom, type Contacts, type SidePoint } from '../anatomy.ts';
import { MM_PER_CM } from '../units.ts';
import { contactPointsMm, type ContactRole, type ResolvedPart } from './assembly.ts';

export interface CadContacts {
  hip: SidePoint;
  heel: SidePoint;
  /** Null when no peripheral takes the hands, as without a wheel. */
  hands: SidePoint | null;
  /** The backrest angle of the seat that carries the hip. */
  reclineDeg: number;
}

interface Found {
  point: SidePoint;
  holder: ResolvedPart;
}

export function cadContacts(resolved: ReadonlyMap<string, ResolvedPart>): CadContacts {
  const found = new Map<ContactRole, Found[]>();
  for (const part of resolved.values())
    for (const { role, pointMm } of contactPointsMm(part)) {
      const point = { z: pointMm.z / MM_PER_CM, y: pointMm.y / MM_PER_CM };
      found.set(role, [...(found.get(role) ?? []), { point, holder: part }]);
    }
  const only = (role: ContactRole): Found | null => {
    const all = found.get(role) ?? [];
    if (all.length > 1)
      throw new Error(`The ${role} contact is on ${all.length} parts; the driver needs one.`);
    return all[0] ?? null;
  };
  const required = (role: ContactRole): Found => {
    const contact = only(role);
    if (!contact) throw new Error(`No part of the design carries the ${role} contact.`);
    return contact;
  };
  const hip = required('hip');
  const seat = hip.holder.part;
  return {
    hip: hip.point,
    heel: required('heel').point,
    hands: only('hands')?.point ?? null,
    reclineDeg: seat.kind === 'peripheral' ? (seat.backrestDeg ?? 0) : 0,
  };
}

/**
 * The driver's posture in a CAD design, measured from the top of the base as the posture model
 * and the drawing of the driver expect: the CAD's points are lowered by the base lift.
 */
export function designPosture(
  resolved: ReadonlyMap<string, ResolvedPart>,
  heightCm: number,
  baseLiftCm: number,
) {
  const contacts = cadContacts(resolved);
  const aboveBase = (point: SidePoint): SidePoint => ({ z: point.z, y: point.y - baseLiftCm });
  const points: Contacts = { hip: aboveBase(contacts.hip), heel: aboveBase(contacts.heel) };
  if (contacts.hands) points.hands = aboveBase(contacts.hands);
  return postureFrom({ heightCm, reclineDeg: contacts.reclineDeg }, points);
}
