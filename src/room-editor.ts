// Room tab: the editor of the room, its openings and its furniture. Lengths in cm.
import { round } from './geometry.ts';
import {
  wallFrame,
  wallNames,
  furnitureNames,
  type FurnitureItem,
  type RoomFeature,
} from './room.ts';
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import type { ControlTemplates } from './controls-view.ts';
import { escapeHTML } from './html.ts';

export { escapeHTML };

export type RoomItem = RoomFeature | FurnitureItem;
type RoomLists = Pick<CockpitConfig, 'roomFeatures' | 'roomFurniture'>;

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
/** A value of the selected item; x and z are measured from the room's walls. */
export function roomValue(
  s: CockpitConfig,
  target: string,
  key: string,
): string | number | undefined {
  const item = roomItem(s, target);
  if (!item) {
    // Without an item, the target is the desk or the cockpit.
    const placed = target as 'desk' | 'cockpit';
    return key === 'x'
      ? round(s[`${placed}X`] - s.roomX)
      : key === 'z'
        ? round(s[`${placed}Z`] - s.roomZ)
        : s[`${placed}Angle`];
  }
  if (key === 'x') return round((item as { x: number }).x - s.roomX);
  if (key === 'z') return round((item as { z: number }).z - s.roomZ);
  return (item as unknown as Record<string, string | number | undefined>)[key];
}
export function roomControls(
  s: CockpitConfig,
  e: CockpitEvaluation,
  target: string,
  range: ControlTemplates['range'],
  toggle: ControlTemplates['toggle'],
  { mode = 'all' } = {},
): string {
  const items = roomItems(s, mode);
  const choices = [
    ...(mode === 'all' && s.deskEnabled !== false ? ['desk'] : []),
    ...(mode === 'all' && s.cockpitEnabled !== false ? ['cockpit'] : []),
    ...items.map(roomTarget),
  ];
  const active = choices.includes(target) ? target : choices[0],
    item = active ? roomItem(s, active) : null,
    a = escapeHTML;
  const num = (key: string, label: string, min: number, max: number, step = 1, unit = 'cm') => {
    const value = roomValue(s, active, key);
    return `<div class="control room-object-control"><div class="control-top"><label for="room-${key}-range">${label}</label><div class="number-wrap"><input id="room-${key}-number" type="number" data-room-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"><span>${unit}</span></div></div><input id="room-${key}-range" type="range" data-room-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}" style="--pct:${((Number(value) - min) / (max - min || 1)) * 100}%"></div>`;
  };
  const selected = (key: string) => (item as unknown as Record<string, unknown> | null)?.[key];
  const sel = (key: string, label: string, options: [string, string][]) =>
    `<div class="select-control"><label for="room-${key}">${label}</label><select id="room-${key}" data-room-key="${key}">${options.map(([v, n]) => `<option value="${v}" ${selected(key) === v ? 'selected' : ''}>${a(n)}</option>`).join('')}</select></div>`;
  const group = (title: string, body: string) =>
    `<div class="control-group"><h3 class="group-title">${title}</h3>${body}</div>`;
  let html = ['all', 'room'].includes(mode)
    ? group(
        'Inside dimensions',
        toggle('roomEnabled', 'Show the room and check obstacles') +
          range('roomW', 'Wall AB width') +
          range('roomD', 'Wall BC depth') +
          range('roomH', 'Ceiling height') +
          toggle('roomFullWalls', 'Show full-height walls in 3D') +
          `<details class="room-reference"><summary>Reference and walkway</summary>${range('roomX', 'Room X origin') + range('roomZ', 'Room Z origin') + range('aisle', 'Desired side clearance')}<p class="layout-hint">Changing the origin moves the walls. The desk, cockpit and furniture keep their positions.</p></details><div class="room-actions"><button id="roomFrame">Show the room in the plan</button><button id="roomCenter">Center the desk and cockpit</button></div>`,
      )
    : '';
  const addTypes =
    mode === 'furniture'
      ? ['bed', 'wardrobe', 'wardrobeAccess', 'shelf', 'wallShelf', 'cabinet', 'chair', 'obstacle']
      : mode === 'room' || mode === 'openings'
        ? ['door', 'window']
        : [
            'door',
            'window',
            'bed',
            'wardrobe',
            'wardrobeAccess',
            'shelf',
            'wallShelf',
            'cabinet',
            'chair',
            'obstacle',
          ];
  const names: Record<string, string> = {
    door: 'Door',
    window: 'Window',
    wardrobeAccess: 'Built-in wardrobe',
    ...furnitureNames,
  };
  html += group(
    mode === 'furniture' ? 'Add furniture' : 'Add items',
    `<div class="room-add-grid">${addTypes.map((type) => `<button data-add-room="${type}">＋ ${a(names[type])}</button>`).join('')}</div>${
      choices.length
        ? `<div class="select-control target-picker"><label for="roomTarget">Selected item</label><select id="roomTarget">${choices
            .map((id) => {
              const v = roomItem(s, id);
              return `<option value="${id}" ${id === active ? 'selected' : ''}>${a(v?.name || (id === 'desk' ? 'Whole desk' : 'Cockpit'))}</option>`;
            })
            .join('')}</select></div>`
        : '<p class="room-empty">You have not added any items in this step yet.</p>'
    }`,
  );
  if (!active) return html;
  let editor = '';
  if (item)
    editor += `<div class="room-name"><label for="roomName">Name</label><input id="roomName" data-room-key="name" value="${a(item.name)}" maxlength="45"></div>`;
  if (item?.type === 'wardrobeAccess') {
    const frame = wallFrame(s, item.wall);
    editor +=
      sel('wall', 'Wardrobe wall', Object.entries(wallNames)) +
      num('offset', `Access start from ${frame.corner}`, 0, frame.length - item.width, 0.5) +
      num('width', 'Sliding door width', 30, frame.length) +
      num('height', 'Door height from the floor', 30, s.roomH, 0.5) +
      num('clearance', 'Clear space in front', 0, 200, 0.5) +
      '<p class="layout-hint">Only the sliding door front and its access band are drawn. You do not need to measure the inside. The starting height matches the ceiling: adjust it to your doors. The space above stays available. Drag the front along the wall; change the wall in the selector. The band must stay clear of furniture, the desk and the cockpit. 0 cm turns the clearance off.</p>';
  } else if (item && isFeature(item)) {
    const frame = wallFrame(s, item.wall);
    editor +=
      sel('wall', 'Wall', Object.entries(wallNames)) +
      num('offset', `Opening start from ${frame.corner}`, 0, frame.length - item.width, 0.5) +
      num('width', 'Opening width', 30, Math.min(300, frame.length)) +
      num('height', 'Opening height', 30, s.roomH);
    if (item.type === 'door')
      editor +=
        sel('hinge', 'Hinges', [
          ['start', `Opening start · near ${frame.corner}`],
          ['end', 'Opening end'],
        ]) +
        sel('swing', 'Swing direction', [
          ['in', 'Inwards'],
          ['out', 'Outwards'],
        ]) +
        num('openAngle', 'Angle it must open to', 0, 180, 1, '°') +
        '<p class="layout-hint">The orange area checks the whole swing from closed to this angle. Drag the opening along its wall; change the wall with the selector.</p>';
    else
      editor +=
        num('sill', 'Sill height from the floor', 0, s.roomH - item.height) +
        num('clearance', 'Clearance in front', 0, 150) +
        '<p class="layout-hint">The blue band keeps access clear. The sill sets the window height; its sashes are not simulated.</p>';
  } else {
    if (item) {
      const chair = item.type === 'chair';
      editor +=
        sel('type', 'Furniture type', Object.entries(furnitureNames)) +
        num(
          'width',
          chair ? 'Overall chair width' : 'Furniture width',
          chair ? 40 : 10,
          chair ? 100 : 350,
        ) +
        num(
          'depth',
          chair ? 'Overall chair depth' : 'Furniture depth',
          chair ? 40 : 10,
          chair ? 100 : 250,
        ) +
        num(
          'height',
          chair ? 'Overall chair height' : 'Furniture height',
          chair ? 70 : item.type === 'wallShelf' ? 2 : 10,
          chair ? 180 : 350,
        );
      if (chair)
        editor +=
          num('seatHeight', 'Seat height', 30, Math.min(65, item.height - 20)) +
          num('pullback', 'Space to pull the chair back', 0, 150) +
          (s.deskEnabled !== false
            ? '<button class="arm-edit-action" id="chairAtDesk">Place in front of the desk ↗</button>'
            : '') +
          '<p class="layout-hint">The footprint includes the casters and armrests. The rear band keeps space to push the chair back; set it to 0 to hide it. The chair moves separately from the desk.</p>';
    }
    if (item?.type === 'wallShelf') {
      const frame = wallFrame(s, item.mountWall);
      editor +=
        sel('mountWall', 'Mounting wall', Object.entries(wallNames)) +
        num(
          'offset',
          `Start from corner ${frame.corner}`,
          0,
          Math.max(0, frame.length - item.width),
          0.5,
        ) +
        num('elevation', 'Bottom height from the floor', 0, s.roomH, 0.5) +
        '<p class="layout-hint">Drag it along the wall in the plan. Change the wall in the selector. The bottom height leaves room for other furniture underneath; you are warned if their volumes overlap. Contact with the wall is intended. Loads and fixings are not calculated.</p>';
    } else
      editor +=
        num('x', 'X position from wall DA', -200, s.roomW + 200, 0.5) +
        num('z', 'Z position from wall AB', -200, s.roomD + 200, 0.5) +
        num('angle', 'Rotation in the plan', 0, 359, 1, '°') +
        `<div class="rotate-actions"><button data-room-rotate="-90">↶ −90°</button><button data-room-rotate="90">+90° ↷</button></div><p class="layout-hint">${active === 'cockpit' ? 'Reference: the center of the rear end of the chassis.' : 'Reference: the center of the item.'} Drag in the plan or type the distances to the walls.</p>`;
  }
  if (item) editor += '<button class="room-delete" id="roomDelete">Delete this item</button>';
  html += group(
    item ? escapeHTML(item.name) : active === 'cockpit' ? 'Place the cockpit' : 'Place the desk',
    editor,
  );
  html +=
    '<p class="control-hint">Walls A–B–C–D run clockwise from the top left corner. Bounds, furniture and door swings are checked with approximate envelopes. The side clearance does not guarantee a continuous way in.</p>';
  return html;
}
