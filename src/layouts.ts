// Layouts: alternative arrangements of one room. What exists is shared by every layout: the
// room and its openings, each piece of furniture and its size, the desk and its accessories,
// the cockpit design and the monitor arm's hardware. Each layout stores only where things are,
// and which pieces of furniture it leaves out.
import type { CockpitConfig } from './config.ts';
import { resizeDesk } from './desk.ts';
import {
  normalizeRoom,
  type Chair,
  type FloorFurniture,
  type FurnitureItem,
  type WallId,
  type WallShelf,
} from './room.ts';
import { cleanUserText } from './user-text.ts';

/** Settings that place things in the room or on the desk, or pose the monitor arm. */
export type LayoutSettings = Pick<
  CockpitConfig,
  | 'deskX'
  | 'deskZ'
  | 'deskAngle'
  | 'cockpitX'
  | 'cockpitZ'
  | 'cockpitAngle'
  | 'keyboardX'
  | 'keyboardZ'
  | 'keyboardAngle'
  | 'pcX'
  | 'pcZ'
  | 'pcAngle'
  | 'mouseX'
  | 'mouseZ'
  | 'mouseAngle'
  | 'matX'
  | 'matZ'
  | 'matAngle'
  | 'clampX'
  | 'clampZ'
  | 'clampSide'
  | 'clampMount'
  | 'monitorMode'
  | 'armBaseAngle'
  | 'armElbowAngle'
  | 'armBend'
  | 'monitorYaw'
  | 'monitorAhead'
  | 'monitorH'
>;

/** Where a piece of furniture stands. A wall shelf is placed by its wall, offset and height. */
export interface FurniturePlacement {
  x: number;
  z: number;
  angle: number;
  mountWall?: WallId;
  offset?: number;
  elevation?: number;
}

/** A piece of furniture without its placement: what it is and how big. */
export type FurnitureSpec =
  | Omit<Chair, 'x' | 'z' | 'angle'>
  | Omit<WallShelf, 'x' | 'z' | 'angle' | 'mountWall' | 'offset' | 'elevation'>
  | Omit<FloorFurniture, 'x' | 'z' | 'angle'>;

/** Every setting that is not a layout setting, with the furniture as specs. */
export type SharedSettings = Omit<CockpitConfig, keyof LayoutSettings | 'roomFurniture'> & {
  roomFurniture: FurnitureSpec[];
};

export interface Layout {
  id: string;
  name: string;
  settings: LayoutSettings;
  /** Placement of every shared piece of furniture, hidden ones included, by item id. */
  furniture: Record<string, FurniturePlacement>;
  /** Shared furniture this layout leaves out. Its placement is kept for when it comes back. */
  hiddenFurniture: string[];
}

export interface LayoutLibrary {
  shared: SharedSettings;
  layouts: Layout[];
  activeLayoutId: string;
}

export const MAX_LAYOUTS = 20;
export const MAX_LAYOUT_NAME_LENGTH = 40;
const FIRST_LAYOUT_NAME = 'Base';
const LAYOUT_ID_PATTERN = /^layout-(\d+)$/;

function specOf(item: FurnitureItem): FurnitureSpec {
  if (item.type === 'wallShelf') {
    const { x, z, angle, mountWall, offset, elevation, ...spec } = item;
    return spec;
  }
  if (item.type === 'chair') {
    const { x, z, angle, ...spec } = item;
    return spec;
  }
  const { x, z, angle, ...spec } = item;
  return spec;
}

function placementOf(item: FurnitureItem): FurniturePlacement {
  const { x, z, angle } = item;
  if (item.type !== 'wallShelf') return { x, z, angle };
  const { mountWall, offset, elevation } = item;
  return { x, z, angle, mountWall, offset, elevation };
}

function splitSettings(config: CockpitConfig): {
  shared: SharedSettings;
  settings: LayoutSettings;
} {
  const {
    deskX,
    deskZ,
    deskAngle,
    cockpitX,
    cockpitZ,
    cockpitAngle,
    keyboardX,
    keyboardZ,
    keyboardAngle,
    pcX,
    pcZ,
    pcAngle,
    mouseX,
    mouseZ,
    mouseAngle,
    matX,
    matZ,
    matAngle,
    clampX,
    clampZ,
    clampSide,
    clampMount,
    monitorMode,
    armBaseAngle,
    armElbowAngle,
    armBend,
    monitorYaw,
    monitorAhead,
    monitorH,
    roomFurniture,
    ...shared
  } = config;
  return {
    shared: { ...shared, roomFurniture: roomFurniture.map(specOf) },
    settings: {
      deskX,
      deskZ,
      deskAngle,
      cockpitX,
      cockpitZ,
      cockpitAngle,
      keyboardX,
      keyboardZ,
      keyboardAngle,
      pcX,
      pcZ,
      pcAngle,
      mouseX,
      mouseZ,
      mouseAngle,
      matX,
      matZ,
      matAngle,
      clampX,
      clampZ,
      clampSide,
      clampMount,
      monitorMode,
      armBaseAngle,
      armElbowAngle,
      armBend,
      monitorYaw,
      monitorAhead,
      monitorH,
    },
  };
}

const cleanLayoutName = (name: unknown, fallback: string): string =>
  cleanUserText(name, fallback, MAX_LAYOUT_NAME_LENGTH);

/** A library with a single layout, "Base", that reproduces `config`. */
export function createLayoutLibrary(config: CockpitConfig): LayoutLibrary {
  const { shared, settings } = splitSettings(config);
  const layout: Layout = {
    id: 'layout-1',
    name: FIRST_LAYOUT_NAME,
    settings,
    furniture: Object.fromEntries(config.roomFurniture.map((item) => [item.id, placementOf(item)])),
    hiddenFurniture: [],
  };
  return { shared, layouts: [layout], activeLayoutId: layout.id };
}

export function layoutById(library: LayoutLibrary, id: string): Layout {
  const layout = library.layouts.find((candidate) => candidate.id === id);
  if (!layout) throw new Error(`Unknown layout: ${id}`);
  return layout;
}

export const activeLayout = (library: LayoutLibrary): Layout =>
  layoutById(library, library.activeLayoutId);

/**
 * The configuration of a layout: the shared settings with the layout's placements. Shared
 * changes made in another layout, such as a smaller room or desk, are fitted here.
 */
export function layoutConfig(
  library: LayoutLibrary,
  layoutId: string = library.activeLayoutId,
): CockpitConfig {
  const layout = layoutById(library, layoutId);
  const hidden = new Set(layout.hiddenFurniture);
  const roomFurniture = library.shared.roomFurniture
    .filter((spec) => !hidden.has(spec.id))
    .map((spec) => ({ ...spec, ...layout.furniture[spec.id] }));
  const config = normalizeRoom({ ...library.shared, ...layout.settings, roomFurniture });
  return resizeDesk(config, config.deskWidth, config.deskDepth);
}

/**
 * Stores an edited configuration of the active layout. Placements go to the active layout and
 * everything else is shared: furniture added here appears in every layout where it was
 * created, and furniture deleted here is deleted from every layout.
 */
export function recordLayout(library: LayoutLibrary, config: CockpitConfig): LayoutLibrary {
  const active = activeLayout(library);
  const { shared, settings } = splitSettings(config);
  const shown = new Map(config.roomFurniture.map((item) => [item.id, item]));
  const stillHidden = new Set(active.hiddenFurniture.filter((id) => !shown.has(id)));
  const known = new Set(library.shared.roomFurniture.map((spec) => spec.id));
  const roomFurniture = [
    ...library.shared.roomFurniture.flatMap((spec) => {
      const item = shown.get(spec.id);
      if (item) return [specOf(item)];
      return stillHidden.has(spec.id) ? [spec] : [];
    }),
    ...config.roomFurniture.filter((item) => !known.has(item.id)).map(specOf),
  ];
  const kept = new Set(roomFurniture.map((spec) => spec.id));

  const placementIn = (layout: Layout, id: string): FurniturePlacement => {
    const item = shown.get(id);
    if (item && (layout.id === active.id || !layout.furniture[id])) return placementOf(item);
    return layout.furniture[id];
  };
  const layouts = library.layouts.map((layout): Layout => ({
    ...layout,
    settings: layout.id === active.id ? settings : layout.settings,
    furniture: Object.fromEntries(
      roomFurniture.map((spec) => [spec.id, placementIn(layout, spec.id)]),
    ),
    hiddenFurniture: layout.hiddenFurniture.filter(
      (id) => kept.has(id) && (layout.id !== active.id || stillHidden.has(id)),
    ),
  }));
  return { ...library, shared: { ...shared, roomFurniture }, layouts };
}

function nextLayoutId(library: LayoutLibrary): string {
  const numbers = library.layouts.map((layout) =>
    Number(LAYOUT_ID_PATTERN.exec(layout.id)?.[1] ?? 0),
  );
  return `layout-${Math.max(0, ...numbers) + 1}`;
}

/** Adds a copy of the active layout and makes it active. */
export function duplicateLayout(library: LayoutLibrary, name: unknown): LayoutLibrary {
  if (library.layouts.length >= MAX_LAYOUTS) throw new Error('Layout limit reached');
  const copy: Layout = {
    ...structuredClone(activeLayout(library)),
    id: nextLayoutId(library),
    name: cleanLayoutName(name, `Layout ${library.layouts.length + 1}`),
  };
  return { ...library, layouts: [...library.layouts, copy], activeLayoutId: copy.id };
}

export function selectLayout(library: LayoutLibrary, id: string): LayoutLibrary {
  return { ...library, activeLayoutId: layoutById(library, id).id };
}

/** A blank name keeps the current one. */
export function renameLayout(library: LayoutLibrary, id: string, name: unknown): LayoutLibrary {
  const renamed = layoutById(library, id);
  return {
    ...library,
    layouts: library.layouts.map((layout) =>
      layout === renamed ? { ...layout, name: cleanLayoutName(name, layout.name) } : layout,
    ),
  };
}

/** Deletes a layout. Deleting the active one activates its neighbor. */
export function deleteLayout(library: LayoutLibrary, id: string): LayoutLibrary {
  const deleted = layoutById(library, id);
  if (library.layouts.length === 1) throw new Error('Cannot delete the last layout');
  const index = library.layouts.indexOf(deleted);
  const layouts = library.layouts.filter((layout) => layout !== deleted);
  const activeLayoutId =
    library.activeLayoutId === id ? layouts[Math.max(0, index - 1)].id : library.activeLayoutId;
  return { ...library, layouts, activeLayoutId };
}

function setFurnitureHidden(
  library: LayoutLibrary,
  itemId: string,
  hidden: boolean,
): LayoutLibrary {
  if (!library.shared.roomFurniture.some((spec) => spec.id === itemId))
    throw new Error(`Unknown furniture: ${itemId}`);
  const active = activeLayout(library);
  const others = active.hiddenFurniture.filter((id) => id !== itemId);
  const hiddenFurniture = hidden ? [...others, itemId] : others;
  return {
    ...library,
    layouts: library.layouts.map((layout) =>
      layout === active ? { ...layout, hiddenFurniture } : layout,
    ),
  };
}

/** Leaves a piece of furniture out of the active layout only. */
export const hideFurniture = (library: LayoutLibrary, itemId: string): LayoutLibrary =>
  setFurnitureHidden(library, itemId, true);

/** Brings a hidden piece of furniture back to the active layout, where it was. */
export const showFurniture = (library: LayoutLibrary, itemId: string): LayoutLibrary =>
  setFurnitureHidden(library, itemId, false);
