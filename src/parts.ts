// Bill of materials: the profile cuts, connectors, fasteners and feet of the CAD parts the design
// converts to, and the accessories still estimated from the configuration.
import type { CockpitConfig } from './config.ts';
import { resolveAssembly } from './cad/assembly.ts';
import { fastenerType } from './cad/catalog.ts';
import { connectorsFromParametric, partsFromParametric } from './cad/from-parametric.ts';
import { partsToBuy, type PendingJoint, type PartsToBuy } from './cad/parts-to-buy.ts';
import { jointsOf } from './cad/joints.ts';

export interface Accessory {
  name: string;
  qty: number;
  note: string;
}

/** One cut: a profile section at one length, and the parts cut to it. */
export interface ProfilePart {
  /** The names of the parts cut to this length. */
  name: string;
  profile: string;
  qty: number;
  /** Net length of one piece, in whole mm. */
  mm: number;
  /** Total length of all pieces, in mm. */
  total: number;
}

function desktopAccessories(s: CockpitConfig): Accessory[] {
  if (s.deskEnabled === false) return [];
  const items: Accessory[] = [];
  if (s.matEnabled !== false)
    items.push({
      name: 'XL desk mat',
      qty: 1,
      note: `${s.matWidth} × ${s.matDepth} cm; desk`,
    });
  if (s.monitorEnabled !== false)
    items.push({
      name: 'Desk monitor arm',
      qty: 1,
      note: `Rated reach ≥ ${s.armReach} cm; check VESA and load`,
    });
  return items;
}
export interface PartsList {
  parts: ProfilePart[];
  accessories: Accessory[];
  totalMm: number;
  cuts: number;
  joints: number;
  /** Joints without connectors, to fasten before the list is complete. */
  pendingJoints: PendingJoint[];
}

/** Part names are the user's data and may hold commas, so cuts list them apart with semicolons. */
const NAME_SEPARATOR = '; ';

const sectionText = (sectionId: string): string => sectionId.replace('x', ' × ');

export function getParts(s: CockpitConfig): PartsList {
  if (s.cockpitEnabled === false)
    return {
      parts: [],
      accessories: desktopAccessories(s),
      totalMm: 0,
      cuts: 0,
      joints: 0,
      pendingJoints: [],
    };
  const designParts = partsFromParametric(s);
  const resolved = resolveAssembly(designParts);
  const toBuy = partsToBuy(resolved, connectorsFromParametric(designParts));
  const parts = toBuy.cuts.map((cut) => ({
    name: cut.names.join(NAME_SEPARATOR),
    profile: sectionText(cut.sectionId),
    qty: cut.quantity,
    mm: cut.lengthMm,
    total: cut.lengthMm * cut.quantity,
  }));
  const pieces = parts.reduce((sum, part) => sum + part.qty, 0);
  return {
    parts,
    accessories: [
      ...hardware(toBuy),
      {
        name: 'Profile end caps',
        qty: pieces * 2,
        note: 'Theoretical maximum; leave out joined ends',
      },
      ...estimatedAccessories(s),
      ...desktopAccessories(s),
    ],
    totalMm: parts.reduce((sum, part) => sum + part.total, 0),
    cuts: pieces,
    joints: jointsOf(resolved).length,
    pendingJoints: toBuy.pendingJoints,
  };
}

/** Connectors, the fasteners they need and the feet, counted from the CAD parts. */
function hardware(toBuy: PartsToBuy): Accessory[] {
  return [
    ...toBuy.connectors.map((connector) => ({
      name: connector.name,
      qty: connector.quantity,
      note: 'Two per joint, one on each side',
    })),
    ...toBuy.fasteners.map((fastener) => ({
      name: fastenerType(fastener.id).name,
      qty: fastener.quantity,
      note: 'For the corner brackets; confirm the bolt length with the supplier',
    })),
    ...toBuy.feet.map((foot) => ({
      name: foot.name,
      qty: foot.quantity,
      note: 'With its adapter; size the load capacity',
    })),
  ];
}

/** The seat and the plates, still estimated from the settings until plates are designed. */
function estimatedAccessories(s: CockpitConfig): Accessory[] {
  const b = s.width - 8;
  const accessories: Accessory[] = [
    {
      name: 'Manual car seat + rails',
      qty: 1,
      note: 'Seat envelope: about 50 × 65 cm',
    },
    {
      name: 'Adjustable pedal plate',
      qty: 1,
      note: `${Math.round(b * 10)} × 380 mm; hole pattern to match the pedals`,
    },
  ];
  if (s.wheel)
    accessories.push({
      name: 'Adjustable wheel plate',
      qty: 1,
      note: `${Math.round(b * 10)} × 220 mm; hole pattern of the actual base`,
    });
  if (s.hotas)
    accessories.push({
      name: 'Removable HOTAS plates',
      qty: 2,
      note: '180 × 250 mm; drilled to match the controls',
    });
  if (s.centerStick)
    accessories.push({
      name: 'Center stick plate',
      qty: 1,
      note: '180 × 200 mm; removable mount',
    });
  if (s.shifter || s.handbrake)
    accessories.push({
      name: 'Shifter / handbrake plate',
      qty: 1,
      note: '200 × 300 mm; check the hole patterns',
    });
  return accessories;
}
