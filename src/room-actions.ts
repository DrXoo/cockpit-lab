// Changes to the room's openings and furniture, as pure state transitions. Lengths in cm.
import { round } from './geometry.ts';
import { furnitureNames, normalizeRoom, officeChairPlacement, type FurnitureType } from './room.ts';
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { isFeature, roomItem } from './room-editor.ts';

export type RoomItemType = 'door' | 'window' | 'wardrobeAccess' | FurnitureType;

const MAX_FEATURES = 24;
const MAX_FURNITURE = 30;

const isOpening = (type: RoomItemType) =>
  type === 'door' || type === 'window' || type === 'wardrobeAccess';

/** Openings and furniture are validated together, as when a project is opened. */
const withItems = (
  state: CockpitConfig,
  roomFeatures: unknown[],
  roomFurniture: unknown[],
): CockpitConfig => normalizeRoom(state, { roomFeatures, roomFurniture });

/** `hiddenFurniture` counts the furniture that the active layout leaves out of `state`. */
export const canAddRoomItem = (
  state: CockpitConfig,
  type: RoomItemType,
  { hiddenFurniture = 0 } = {},
): boolean =>
  isOpening(type)
    ? state.roomFeatures.length < MAX_FEATURES
    : state.roomFurniture.length + hiddenFurniture < MAX_FURNITURE;

/** The guided-setup step where an item type is added. */
export const stepOfRoomItem = (type: RoomItemType): 'openings' | 'furniture' =>
  type === 'door' || type === 'window' ? 'openings' : 'furniture';

/** The new item before validation; normalizeRoom fills in the remaining defaults. */
function draftItem(state: CockpitConfig, type: RoomItemType, id: string) {
  const roomCenter = { x: state.roomX + state.roomW / 2, z: state.roomZ + state.roomD / 2 };
  if (type === 'wardrobeAccess')
    return {
      id,
      type,
      name: 'Built-in wardrobe',
      wall: 'north',
      width: Math.min(180, state.roomW),
      offset: Math.max(0, (state.roomW - 180) / 2),
      clearance: 80,
    };
  if (type === 'door' || type === 'window')
    return {
      id,
      type,
      name: type === 'door' ? 'Door' : 'Window',
      wall: type === 'door' ? 'south' : 'north',
      offset: type === 'door' ? 20 : Math.max(0, (state.roomW - 120) / 2),
      width: type === 'door' ? 80 : 120,
      height: type === 'door' ? 205 : 120,
      sill: type === 'door' ? 0 : 100,
      hinge: 'start',
      swing: 'in',
      openAngle: 90,
      clearance: 60,
    };
  if (type === 'wallShelf')
    return {
      id,
      type,
      name: furnitureNames[type],
      mountWall: 'north',
      width: 100,
      depth: 30,
      height: 40,
      elevation: 140,
    };
  if (type === 'chair') {
    const chair = {
      id,
      type,
      name: 'Office chair',
      width: 65,
      depth: 65,
      height: 115,
      seatHeight: 47,
      pullback: 50,
    };
    return {
      ...chair,
      ...(state.deskEnabled !== false
        ? officeChairPlacement(state, chair)
        : { ...roomCenter, angle: 0 }),
    };
  }
  return {
    id,
    type,
    name: furnitureNames[type],
    ...roomCenter,
    width: type === 'bed' ? 140 : 80,
    depth: type === 'bed' ? 200 : type === 'wardrobe' ? 55 : 35,
    height: type === 'bed' ? 60 : type === 'wardrobe' ? 200 : 100,
    angle: 0,
  };
}

/** Adds an item, shows the room, and returns the new item's selection target. */
export function addRoomItem(
  state: CockpitConfig,
  type: RoomItemType,
  id: string,
): { state: CockpitConfig; target: string } {
  const draft = draftItem(state, type, id);
  const shown = { ...state, roomEnabled: true };
  const next = isOpening(type)
    ? withItems(shown, [...state.roomFeatures, draft], state.roomFurniture)
    : withItems(shown, state.roomFeatures, [...state.roomFurniture, draft]);
  return { state: next, target: (isOpening(type) ? 'feature:' : 'furniture:') + id };
}

/**
 * Sets a value of the selected item, or of the desk or cockpit placement. X and Z are given
 * from the room's walls.
 */
export function updateRoomItem(
  state: CockpitConfig,
  target: string,
  key: string,
  value: number | string,
): CockpitConfig {
  const item = roomItem(state, target);
  const fromWalls = (offset: number) => (value as number) + offset;
  if (item) {
    const adjusted =
      key === 'x' ? fromWalls(state.roomX) : key === 'z' ? fromWalls(state.roomZ) : value;
    const replace = <T extends { id: string }>(list: T[]) =>
      list.map((other) => (other.id === item.id ? { ...other, [key]: adjusted } : other));
    return isFeature(item)
      ? withItems(state, replace(state.roomFeatures), state.roomFurniture)
      : withItems(state, state.roomFeatures, replace(state.roomFurniture));
  }
  if (target === 'desk' || target === 'cockpit') {
    const placed = { ...state };
    if (key === 'x') placed[`${target}X`] = fromWalls(state.roomX);
    else if (key === 'z') placed[`${target}Z`] = fromWalls(state.roomZ);
    else if (key === 'angle') placed[`${target}Angle`] = value as number;
    return normalizeRoom(placed);
  }
  return normalizeRoom(state);
}

export function deleteRoomItem(state: CockpitConfig, target: string): CockpitConfig {
  const item = roomItem(state, target);
  if (!item) return state;
  return isFeature(item)
    ? withItems(
        state,
        state.roomFeatures.filter((other) => other.id !== item.id),
        state.roomFurniture,
      )
    : withItems(
        state,
        state.roomFeatures,
        state.roomFurniture.filter((other) => other.id !== item.id),
      );
}

export function placeChairAtDesk(state: CockpitConfig, target: string): CockpitConfig {
  const item = roomItem(state, target);
  if (item?.type !== 'chair') return state;
  return withItems(
    state,
    state.roomFeatures,
    state.roomFurniture.map((other) =>
      other.id === item.id ? { ...other, ...officeChairPlacement(state, other) } : other,
    ),
  );
}

/** Moves the desk and the cockpit together so the whole setup is centred in the room. */
export function centerInRoom(state: CockpitConfig, evaluation: CockpitEvaluation): CockpitConfig {
  const dx = state.roomX + state.roomW / 2 - (evaluation.allLeft + evaluation.allRight) / 2;
  const dz = state.roomZ + state.roomD / 2 - (evaluation.allBack + evaluation.allFront) / 2;
  return normalizeRoom({
    ...state,
    deskX: round(state.deskX + dx),
    deskZ: round(state.deskZ + dz),
    cockpitX: round(state.cockpitX + dx),
    cockpitZ: round(state.cockpitZ + dz),
  });
}
