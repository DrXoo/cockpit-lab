// What the room editor has selected, and how it is being edited. It belongs to the session and
// is never saved. The rules below keep the selection to what the panel shown can edit.
import type { RoomConfig } from '../config.ts';
import type { SetupStep } from '../project.ts';
import { roomItem, roomItems, roomTarget } from '../room-editor.ts';
import { isRoomSection, type Section } from '../app/sections.ts';

export interface RoomSelection {
  /**
   * The item selected in the plan or the panel: `desk`, `arm`, a desk item's id,
   * `feature:<id>` or `furniture:<id>`, or '' for none.
   */
  target: string;
  /** Whether dragging in the plan arranges the room and the desk. */
  editing: boolean;
  /**
   * The arm pose last chosen, saved or updated, or '' for none. A layout opens with the pose its
   * arm is in, so moving the arm afterwards shows that pose as changed.
   */
  armPose: string;
}

export const noRoomSelection = (): RoomSelection => ({ target: '', editing: false, armPose: '' });

/** What the side panel shows, which decides what can stay selected. */
export interface PanelContext {
  section: Section;
  /** The setup step the panel shows, or the room's items it lists once the setup is done. */
  stage: SetupStep | 'openings' | 'furniture';
  state: RoomConfig;
  /** The ids of the items on the desktop. */
  desktopItemIds: readonly string[];
}

/**
 * The target the side panel edits: on the room's tabs, one of the items it lists, the first if
 * the selected one is not there; on the desk's, the desk or an item on the desktop.
 */
export function panelTarget(target: string, panel: PanelContext): string {
  const { section, stage, state, desktopItemIds } = panel;
  let shown = target;
  if ((stage === 'openings' || stage === 'furniture') && isRoomSection(section)) {
    const items = roomItems(state, stage);
    if (!items.some((item) => roomTarget(item) === shown))
      shown = items[0] ? roomTarget(items[0]) : '';
  }
  if (section === 'desk' && !desktopItemIds.includes(shown) && shown !== 'desk') shown = 'desk';
  return shown;
}

/** The target once another tab opens: the desk's tab has no room items, the room's only its own. */
export function targetAfterSwitch(target: string, section: Section, state: RoomConfig): string {
  if (section === 'desk' && (target.startsWith('feature:') || target.startsWith('furniture:')))
    return 'desk';
  if (section === 'room' && !roomItem(state, target) && target !== 'desk') return 'desk';
  return target;
}

/** The target once another layout opens: furniture it hides is no longer selected. */
export function targetAfterLayoutChange(target: string, state: RoomConfig): string {
  return target.startsWith('furniture:') && !roomItem(state, target) ? '' : target;
}
