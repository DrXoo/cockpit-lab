// The room's own items in the side panel: its openings, the wardrobe access and the furniture,
// added, selected, moved, turned, hidden in a layout and deleted.
import { $, $optional, dataOf } from '../../ui/dom.ts';
import { roomItemType } from './dom-input.ts';
import { activeLayout, hideFurniture, showFurniture } from '../layouts.ts';
import { clamp, round } from '../model.ts';
import { normalizeRoom, wallFrame } from '../room.ts';
import {
  addRoomItem,
  canAddRoomItem,
  centerInRoom,
  deleteRoomItem,
  placeChairAtDesk,
  stepOfRoomItem,
  updateRoomItem,
} from '../actions.ts';
import { roomValue } from './room-editor.ts';
import { isFeature, roomItem } from '../items.ts';
import { isRoomSection } from '../../app/sections.ts';
import type { RoomEditorHost } from './host.ts';
import { controlsAll, setRangeFill } from './settings-controls.ts';

type FieldElement = HTMLInputElement | HTMLSelectElement;

/** How far beyond the walls an item's position can go, in cm, to drag it in from outside. */
const OUTSIDE_THE_ROOM_CM = 200;

/** The narrowest an opening or a wall's item can be, and the widest most can be, in cm. */
const MIN_WALL_ITEM_CM = 30;
const MAX_WALL_ITEM_CM = 300;

/** A full turn, in degrees. */
const FULL_TURN_DEG = 360;

export class RoomItems {
  declare private readonly host: RoomEditorHost;

  constructor(host: RoomEditorHost) {
    this.host = host;
  }

  /** Selects an item of the room, to arrange it in the top view. */
  select(target: string) {
    const host = this.host;
    host.selection.target = target;
    host.selection.editing = true;
    host.pressLayoutButton();
    host.renderControls();
    host.setLayoutEditing(true, target, true);
    host.setActiveView('top');
  }

  /** Binds the controls of the room's items the side panel shows. */
  bind() {
    const host = this.host;
    const { project, selection } = host;
    const roomTargetSelect = $optional<HTMLSelectElement>('#roomTarget');
    roomTargetSelect?.addEventListener('change', () => this.select(roomTargetSelect.value));
    controlsAll<FieldElement>('[data-room-key]').forEach((el) => this.bindField(el));
    controlsAll('[data-room-rotate]').forEach((el) =>
      el.addEventListener('click', () => {
        const angle = Number(roomValue(project.state, selection.target, 'angle'));
        const turned = (angle + Number(dataOf(el, 'roomRotate')) + FULL_TURN_DEG) % FULL_TURN_DEG;
        this.change('angle', turned);
      }),
    );
    controlsAll('[data-add-room]').forEach((el) =>
      el.addEventListener('click', () => this.add(roomItemType(el.dataset.addRoom))),
    );
    $optional('#chairAtDesk')?.addEventListener('click', () => {
      if (roomItem(project.state, selection.target)?.type !== 'chair') return;
      project.state = placeChairAtDesk(project.state, selection.target);
      this.changed(true);
      host.setLayoutEditing(selection.editing, selection.target, true);
      host.setActiveView('top');
      host.toast('Chair placed in front of the desk');
    });
    $optional('#roomHide')?.addEventListener('click', () => {
      const item = roomItem(project.state, selection.target);
      if (!item || isFeature(item)) return;
      host.changeLayouts((layouts) => hideFurniture(layouts, item.id));
      $('#controls').scrollTop = 0;
      host.toast('Hidden in this layout. You can show it again from the furniture list.');
    });
    controlsAll('[data-show-furniture]').forEach((el) =>
      el.addEventListener('click', () => {
        const id = dataOf(el, 'showFurniture');
        selection.target = `furniture:${id}`;
        host.changeLayouts((layouts) => showFurniture(layouts, id));
        host.toast('Back in this layout, where it was');
      }),
    );
    $optional('#roomDelete')?.addEventListener('click', () => {
      if (!roomItem(project.state, selection.target)) return;
      project.state = deleteRoomItem(project.state, selection.target);
      selection.target = 'desk';
      this.changed(true);
      host.setLayoutEditing(selection.editing, selection.target, true);
      host.toast('Item deleted');
    });
    $optional('#roomFrame')?.addEventListener('click', () => {
      host.setActiveView('top');
    });
    $optional('#roomCenter')?.addEventListener('click', () => {
      project.state = centerInRoom(project.state, host.evaluation());
      this.changed(true);
      host.setActiveView('top');
      host.toast('Desk centered, with everything on it');
    });
  }

  /** Shows the selected item's values and limits in its fields, on the room's tabs. */
  sync() {
    const { project, selection } = this.host;
    if (!isRoomSection(this.host.section())) return;
    const state = project.state;
    const item = roomItem(state, selection.target);
    const mounted = item?.type === 'wallShelf';
    const frame =
      item && isFeature(item)
        ? wallFrame(state, item.wall)
        : mounted
          ? wallFrame(state, item.mountWall)
          : null;
    controlsAll<FieldElement>('[data-room-key]').forEach((el) => {
      const key = dataOf(el, 'roomKey');
      const value = roomValue(state, selection.target, key);
      if (el instanceof HTMLInputElement && ['number', 'range'].includes(el.type)) {
        const limits =
          key === 'offset' && frame && item
            ? [0, Math.max(0, frame.length - item.width)]
            : key === 'elevation' && mounted
              ? [0, state.roomH]
              : key === 'width' && frame && item && !mounted
                ? [
                    MIN_WALL_ITEM_CM,
                    item.type === 'wardrobeAccess'
                      ? frame.length
                      : Math.min(MAX_WALL_ITEM_CM, frame.length),
                  ]
                : key === 'height' && frame && !mounted
                  ? [MIN_WALL_ITEM_CM, state.roomH]
                  : key === 'sill' && frame && item
                    ? [0, state.roomH - item.height]
                    : key === 'x'
                      ? [-OUTSIDE_THE_ROOM_CM, state.roomW + OUTSIDE_THE_ROOM_CM]
                      : key === 'z'
                        ? [-OUTSIDE_THE_ROOM_CM, state.roomD + OUTSIDE_THE_ROOM_CM]
                        : null;
        if (limits) {
          el.min = String(limits[0]);
          el.max = String(limits[1]);
        }
      }
      if (el !== document.activeElement && value !== undefined) el.value = String(value);
      if (el instanceof HTMLInputElement && el.type === 'range')
        setRangeFill(
          el,
          ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min) || 1)) * 100,
        );
    });
  }

  /** A field of the selected item: a number is applied as it is typed, within its limits. */
  private bindField(el: FieldElement) {
    if (el instanceof HTMLSelectElement || (el.type !== 'number' && el.type !== 'range')) {
      el.addEventListener('change', () => this.change(dataOf(el, 'roomKey'), el.value, true));
      return;
    }
    const key = dataOf(el, 'roomKey');
    const apply = (commit: boolean) => {
      if (el.value.trim() === '' || !Number.isFinite(Number(el.value))) return;
      const raw = Number(el.value);
      if (!commit && (raw < Number(el.min) || raw > Number(el.max))) return;
      const value = round(clamp(raw, Number(el.min), Number(el.max)), 1);
      this.change(key, value, false);
      if (commit) {
        el.value = String(roomValue(this.host.project.state, this.host.selection.target, key));
        if (['width', 'height'].includes(key)) this.host.renderControls();
      }
    };
    el.addEventListener('input', () => apply(false));
    el.addEventListener('change', () => apply(true));
  }

  /** Adds an item of `type` to the room and selects it, while the layout has room for it. */
  private add(type: ReturnType<typeof roomItemType>) {
    const host = this.host;
    const { project, selection } = host;
    const id =
      crypto.randomUUID?.() ||
      'room-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    const hiddenFurniture = activeLayout(project.library).hiddenFurniture.length;
    if (!canAddRoomItem(project.state, type, { hiddenFurniture })) {
      host.toast('Item limit reached');
      return;
    }
    const added = addRoomItem(project.state, type, id);
    project.state = added.state;
    project.setup = {
      ...project.setup,
      deferred: project.setup.deferred.filter((step) => step !== stepOfRoomItem(type)),
    };
    selection.target = added.target;
    this.changed(true);
    this.select(selection.target);
    host.toast(
      type === 'wardrobeAccess'
        ? 'Access added. Adjust the doors and the clear space in front.'
        : stepOfRoomItem(type) === 'openings'
          ? 'Opening added. Adjust its wall and size.'
          : 'Furniture added. Drag it in the plan.',
    );
  }

  /** Changes one value of the selected item. */
  private change(key: string, value: string | number, redraw = false) {
    const { project, selection } = this.host;
    project.state = updateRoomItem(project.state, selection.target, key, value);
    this.changed(redraw);
  }

  /** Shows the room after it changed, the side panel too when `redraw`. */
  private changed(redraw = false) {
    const { project } = this.host;
    project.state = normalizeRoom(project.state);
    project.saveSoon();
    if (redraw) this.host.renderControls();
    this.host.refresh();
  }
}
