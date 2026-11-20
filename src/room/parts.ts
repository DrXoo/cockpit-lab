// What the room needs to buy for its desk: the accessories the desk setup uses. The parts of a
// cockpit design come from its parts model (src/cad/parts-to-buy.ts).
import type { RoomConfig } from './config.ts';

export interface Accessory {
  name: string;
  qty: number;
  note: string;
}

export function deskAccessories(s: RoomConfig): Accessory[] {
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
      note: `Segments ${s.armFirstSegment} + ${s.armSecondSegment} cm; check VESA and load`,
    });
  return items;
}
