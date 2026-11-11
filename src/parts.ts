// Bill of materials: profile cuts and accessories derived from the configuration.
import type { CockpitConfig } from './config.ts';
import { baseSupports } from './rig.ts';
import { cmToMm, roundMm, type Mm } from './units.ts';

export interface Accessory {
  name: string;
  qty: number;
  note: string;
}

export interface ProfilePart {
  name: string;
  profile: string;
  qty: number;
  /** Net length of one piece. */
  mm: Mm;
  /** Total length of all pieces. */
  total: Mm;
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
}

export function getParts(s: CockpitConfig): PartsList {
  if (s.cockpitEnabled === false)
    return { parts: [], accessories: desktopAccessories(s), totalMm: 0, cuts: 0, joints: 0 };
  const b = s.width - 8,
    wh = s.wheelH - 22,
    seatPost = Math.max(4, s.seatH - 18),
    parts: ProfilePart[] = [];
  const add = (name: string, profile: string, qty: number, lengthCm: number) => {
    const mm = roundMm(cmToMm(lengthCm));
    parts.push({ name, profile, qty, mm, total: (mm * qty) as Mm });
  };
  add('Base side rails', '40 × 80', 2, s.length);
  add('Base crossmembers', '40 × 80', 3, b);
  const supports = baseSupports(s);
  if (supports.length)
    add('Base extensions', supports[0].profile, supports.length, supports[0].length);
  add('Seat crossmembers', '40 × 40', 2, b);
  add('Seat posts', '40 × 40', 4, seatPost);
  add('Pedal deck rails', '40 × 40', 2, 38);
  add('Pedal deck crossmembers', '40 × 40', 2, b);
  add('Pedal deck posts', '40 × 40', 2, Math.max(4, s.pedalH - 10));
  if (s.wheel) {
    add('Wheel uprights', '40 × 80', 2, wh);
    add('Wheel crossmember', '40 × 80', 1, b);
  }
  if (s.hotas) {
    add('HOTAS uprights', '40 × 40', 2, s.hotasH - 13);
    add('HOTAS arms', '40 × 40', 2, s.hotasOut + 12);
  }
  if (s.centerStick) {
    add('Center stick upright', '40 × 40', 1, s.stickH - 10);
    add('Center stick arm', '40 × 40', 1, 24);
  }
  if (s.shifter || s.handbrake) {
    add('Shifter / handbrake upright', '40 × 40', 1, s.hotasH - 13);
    add('Shifter / handbrake arm', '40 × 40', 1, 30);
  }
  const joints =
    14 +
    (s.wheel ? 6 : 0) +
    (s.hotas ? 8 : 0) +
    (s.centerStick ? 4 : 0) +
    (s.shifter || s.handbrake ? 4 : 0);
  const accessories = [
    {
      name: 'Reinforced 40 series corner brackets',
      qty: joints,
      note: 'Estimated at 2 bolts per bracket',
    },
    {
      name: 'T-nuts + M8 bolts',
      qty: joints * 2 + 24,
      note: 'Confirm slot size and length with the supplier',
    },
    {
      name: s.feet === 'casters' ? 'Locking casters + adapter' : 'Leveling feet + adapter',
      qty: 4,
      note: 'Size the load capacity',
    },
    {
      name: 'Profile end caps',
      qty: parts.reduce((a, p) => a + p.qty * 2, 0),
      note: 'Theoretical maximum; leave out joined ends',
    },
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
  accessories.push(...desktopAccessories(s));
  return {
    parts,
    accessories,
    totalMm: parts.reduce((a, p) => a + p.total, 0),
    cuts: parts.reduce((a, p) => a + p.qty, 0),
    joints,
  };
}
