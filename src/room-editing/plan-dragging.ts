// Arranging the layout by dragging in the plan: the room's items, the desk's, and the monitor
// arm's elbow and VESA mount. The layout button turns it on and off.
import { $ } from '../ui/dom.ts';
import { numericField } from '../dom-input.ts';
import { clamp, clampEdge, desktopTargets, moveArmJoint, placeDeskItem, round } from '../model.ts';
import { moveRoomTarget } from '../room.ts';
import { roomItem } from '../room-editor.ts';
import { isRoomSection } from '../app/sections.ts';
import type { RoomEditorHost } from './host.ts';

/** How far from the room's origin the desk and the arm can be dragged, in cm. */
const PLAN_LIMIT_CM = 1500;

export class PlanDragging {
  declare private readonly host: RoomEditorHost;

  constructor(host: RoomEditorHost) {
    this.host = host;
    $('#layoutBtn').addEventListener('click', () => this.toggle());
  }

  /** Turns arranging the layout on or off, with the view that shows what it arranges. */
  toggle() {
    const host = this.host;
    const { selection } = host;
    selection.editing = !selection.editing;
    $('#layoutBtn').classList.toggle('active', selection.editing);
    $('#layoutBtn').setAttribute('aria-pressed', String(selection.editing));
    host.syncSceneEditing();
    if (selection.editing) {
      if (host.project.setup.step === 'complete' && !isRoomSection(host.section()))
        host.switchSection('desk');
      host.setActiveView(desktopTargets.some((t) => t.id === selection.target) ? 'desk' : 'top');
    } else host.setActiveView(host.view());
  }

  /** An item picked in the plan is selected, in the tab that edits it once the setup is done. */
  selected(target: string) {
    const host = this.host;
    const { project } = host;
    host.selection.target = target;
    const section = host.section();
    if (project.setup.step === 'complete') {
      host.switchSection(
        target.startsWith('furniture:') ||
          roomItem(project.state, target)?.type === 'wardrobeAccess'
          ? 'furniture'
          : target.startsWith('feature:')
            ? 'room'
            : 'desk',
      );
    } else if (section === 'desk' || isRoomSection(section)) host.renderControls();
    host.syncSceneEditing();
  }

  /** An item dragged to a point of the plan, in cm. */
  moved(target: string, x: number, z: number) {
    const host = this.host;
    const { project } = host;
    const item = desktopTargets.find((t) => t.id === target);
    const previousEdge = clampEdge(project.state);
    if (target.startsWith('feature:') || target.startsWith('furniture:'))
      project.state = moveRoomTarget(project.state, target, x, z);
    else if (item) project.state = placeDeskItem(project.state, item.id, x, z);
    else {
      project.state[numericField(target + 'X')] = round(clamp(x, -PLAN_LIMIT_CM, PLAN_LIMIT_CM));
      project.state[numericField(target + 'Z')] = round(clamp(z, -PLAN_LIMIT_CM, PLAN_LIMIT_CM));
    }
    project.saveSoon();
    // The arm's controls depend on the edge it clamps to.
    if (target === 'arm' && previousEdge !== clampEdge(project.state) && host.section() === 'desk')
      host.renderControls();
    host.refresh();
  }

  /** The arm's elbow or VESA mount dragged to a point of the plan, in cm. */
  armMoved(joint: 'elbow' | 'end', x: number, z: number) {
    const { project } = this.host;
    project.state = moveArmJoint(project.state, joint, x, z);
    project.saveSoon();
    this.host.refresh();
  }
}
