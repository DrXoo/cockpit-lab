// The items of a room: its openings and its furniture, and the keys that name one of them.
import type { FurnitureItem, RoomFeature } from './room.ts';
import type { RoomConfig } from './config.ts';

export type RoomItem = RoomFeature | FurnitureItem;
type RoomLists = Pick<RoomConfig, 'roomFeatures' | 'roomFurniture'>;

/** Openings sit on a wall; furniture stands in the room. */
export const isFeature = (item: RoomItem): item is RoomFeature => 'wall' in item;

/** The selection key of an item: `feature:<id>` or `furniture:<id>`. */
export const roomTarget = (item: RoomItem): string =>
  (isFeature(item) ? 'feature:' : 'furniture:') + item.id;

export function roomItem(s: RoomLists, target: string): RoomItem | null | undefined {
  return target.startsWith('feature:')
    ? s.roomFeatures.find((v) => v.id === target.slice(8))
    : target.startsWith('furniture:')
      ? s.roomFurniture.find((v) => v.id === target.slice(10))
      : null;
}
export function roomItems(s: RoomLists, mode: string): RoomItem[] {
  return mode === 'furniture'
    ? [...s.roomFurniture, ...s.roomFeatures.filter((v) => v.type === 'wardrobeAccess')]
    : ['openings', 'room'].includes(mode)
      ? s.roomFeatures.filter((v) => v.type !== 'wardrobeAccess')
      : [...s.roomFeatures, ...s.roomFurniture];
}
