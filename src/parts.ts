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
      name: 'Alfombrilla XL',
      qty: 1,
      note: `${s.matWidth} × ${s.matDepth} cm; escritorio`,
    });
  if (s.monitorEnabled !== false)
    items.push({
      name: 'Brazo monitor para mesa',
      qty: 1,
      note: `Alcance declarado ≥ ${s.armReach} cm; VESA y carga por verificar`,
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
  add('Largueros de base', '40 × 80', 2, s.length);
  add('Travesaños de base', '40 × 80', 3, b);
  const supports = baseSupports(s);
  if (supports.length)
    add('Prolongaciones de base', supports[0].profile, supports.length, supports[0].length);
  add('Travesaños de asiento', '40 × 40', 2, b);
  add('Apoyos de asiento', '40 × 40', 4, seatPost);
  add('Largueros de pedalera', '40 × 40', 2, 38);
  add('Travesaños de pedalera', '40 × 40', 2, b);
  add('Apoyos de pedalera', '40 × 40', 2, Math.max(4, s.pedalH - 10));
  if (s.wheel) {
    add('Montantes de volante', '40 × 80', 2, wh);
    add('Travesaño de volante', '40 × 80', 1, b);
  }
  if (s.hotas) {
    add('Montantes HOTAS', '40 × 40', 2, s.hotasH - 13);
    add('Brazos HOTAS', '40 × 40', 2, s.hotasOut + 12);
  }
  if (s.centerStick) {
    add('Montante joystick central', '40 × 40', 1, s.stickH - 10);
    add('Brazo joystick central', '40 × 40', 1, 24);
  }
  if (s.shifter || s.handbrake) {
    add('Montante cambio / freno', '40 × 40', 1, s.hotasH - 13);
    add('Brazo cambio / freno', '40 × 40', 1, 30);
  }
  const joints =
    14 +
    (s.wheel ? 6 : 0) +
    (s.hotas ? 8 : 0) +
    (s.centerStick ? 4 : 0) +
    (s.shifter || s.handbrake ? 4 : 0);
  const accessories = [
    {
      name: 'Escuadras reforzadas serie 40',
      qty: joints,
      note: 'Estimación de 2 tornillos por escuadra',
    },
    {
      name: 'Tuercas T + tornillos M8',
      qty: joints * 2 + 24,
      note: 'Ranura y longitud a confirmar con el proveedor',
    },
    {
      name: s.feet === 'casters' ? 'Ruedas con freno + adaptador' : 'Pies niveladores + adaptador',
      qty: 4,
      note: 'Capacidad de carga a dimensionar',
    },
    {
      name: 'Tapas de perfil',
      qty: parts.reduce((a, p) => a + p.qty * 2, 0),
      note: 'Máximo teórico; descontar extremos unidos',
    },
    {
      name: 'Asiento manual de coche + raíles',
      qty: 1,
      note: 'Envolvente de asiento: 50 × 65 cm aprox.',
    },
    {
      name: 'Placa pedalera regulable',
      qty: 1,
      note: `${Math.round(b * 10)} × 380 mm; patrón según pedalera`,
    },
  ];
  if (s.wheel)
    accessories.push({
      name: 'Placa de volante regulable',
      qty: 1,
      note: `${Math.round(b * 10)} × 220 mm; patrón de la base real`,
    });
  if (s.hotas)
    accessories.push({
      name: 'Placas HOTAS desmontables',
      qty: 2,
      note: '180 × 250 mm; taladrado según mandos',
    });
  if (s.centerStick)
    accessories.push({
      name: 'Placa joystick central',
      qty: 1,
      note: '180 × 200 mm; montaje desmontable',
    });
  if (s.shifter || s.handbrake)
    accessories.push({
      name: 'Placa cambio / freno de mano',
      qty: 1,
      note: '200 × 300 mm; patrones por verificar',
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
