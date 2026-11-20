// The desk's own controls in the side panel: the item placed on the desktop, its size and its
// mat, the edge the monitor arm clamps to, and the arm's saved poses.
import {
  activeArmPose,
  armPoseMountMoved,
  chooseMonitorPosition,
  deleteArmPose,
  MAX_ARM_POSES,
  monitorPositionOf,
  saveArmPose,
  updateArmPose,
} from '../arm-poses.ts';
import type { RoomConfig } from '../config.ts';
import { monitorPositionHTML } from './desk-editor.ts';
import { $, $optional, dataOf } from '../../ui/dom.ts';
import { numericField } from './dom-input.ts';
import { deskBounds, desktopTargets, resizeDesk, updateDeskItem } from '../model.ts';
import { armReachHint } from './settings-panels.ts';
import type { RoomEditorHost } from './host.ts';
import { controlsAll, type SettingControls } from './settings-controls.ts';

/** A full turn, in degrees. */
const FULL_TURN_DEG = 360;

const DESK_EDGES = ['xmin', 'xmax', 'zmin', 'zmax'] as const;

function deskEdgeOf(value: string): (typeof DESK_EDGES)[number] {
  const edge = DESK_EDGES.find((known) => known === value);
  if (!edge) throw new Error(`Unknown desk edge: ${value}`);
  return edge;
}

/** A preset's size, written as `widthxdepth` in cm. */
function presetSize(value: string): [width: number, depth: number] {
  const [width, depth] = value.split('x').map(Number);
  return [width, depth];
}

export class DeskControls {
  declare private readonly host: RoomEditorHost;
  declare private readonly settings: SettingControls;
  /** What each monitor position area shows, so it is only rewritten when that changes. */
  declare private readonly shownMonitorPositions: WeakMap<Element, string>;

  constructor(host: RoomEditorHost, settings: SettingControls) {
    this.host = host;
    this.settings = settings;
    this.shownMonitorPositions = new WeakMap();
    // The monitor position is redrawn as the arm moves, so its controls are handled here, once.
    $('#controls').addEventListener('change', (event) => {
      if (event.target instanceof HTMLSelectElement && event.target.id === 'monitorPosition')
        this.chooseMonitorPosition(event.target.value);
    });
    $('#controls').addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('#updateArmPose')) this.updateShownArmPose();
      if (event.target.closest('#deleteArmPose')) this.deleteShownArmPose();
    });
    $('#editArmBtn').addEventListener('click', () => this.startArmEditing());
  }

  /** Selects the monitor arm, to drag its elbow and VESA mount in the top view. */
  startArmEditing() {
    const host = this.host;
    host.selection.target = 'arm';
    host.selection.editing = true;
    host.pressLayoutButton();
    host.switchSection('desk');
    host.showWorkspace('view');
    host.setLayoutEditing(true, 'arm');
    host.setActiveView('top');
    this.focusArmControls();
    host.toast('Drag ELBOW or VESA; you can also use their rotation controls.');
  }

  /** Binds the desk's controls the side panel shows. */
  bind() {
    const host = this.host;
    const { project, selection } = host;
    const layoutTargetSelect = $optional<HTMLSelectElement>('#layoutTargetSelect');
    layoutTargetSelect?.addEventListener('change', () => {
      selection.target = layoutTargetSelect.value;
      selection.editing = true;
      host.renderControls();
      host.renderWorkflow();
      host.setLayoutEditing(true, selection.target, false);
      host.setActiveView(desktopTargets.some((t) => t.id === selection.target) ? 'desk' : 'top');
    });
    controlsAll('[data-rotate]').forEach((button) =>
      button.addEventListener('click', () => {
        const key = numericField(selection.target + 'Angle');
        const turned = project.state[key] + Number(dataOf(button, 'rotate'));
        const value = (turned + FULL_TURN_DEG) % FULL_TURN_DEG;
        this.settings.update({ kind: 'number', key, value });
        host.renderControls();
      }),
    );
    const armPoseName = $optional<HTMLInputElement>('#armPoseName');
    $optional('#saveArmPose')?.addEventListener('click', () => this.saveArmPose(armPoseName));
    armPoseName?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.saveArmPose(armPoseName);
    });
    controlsAll('#armDragBtn,#armControlsDragBtn').forEach((button) =>
      button.addEventListener('click', () => this.startArmEditing()),
    );
    const clampEdgeSelect = $optional<HTMLSelectElement>('#clampEdgeSelect');
    clampEdgeSelect?.addEventListener('change', () => {
      const edge = deskEdgeOf(clampEdgeSelect.value);
      project.state.clampSide = edge;
      const bounds = deskBounds(project.state);
      if (edge === 'xmin' || edge === 'xmax')
        project.state.clampX = edge === 'xmin' ? -bounds.anchorX : bounds.anchorX;
      else project.state.clampZ = edge === 'zmin' ? -bounds.anchorZ : bounds.anchorZ;
      this.saveAndShow();
    });
    const deskSizePresetSelect = $optional<HTMLSelectElement>('#deskSizePreset');
    deskSizePresetSelect?.addEventListener('change', () => {
      if (deskSizePresetSelect.value === 'custom') return;
      const [width, depth] = presetSize(deskSizePresetSelect.value);
      project.state = resizeDesk(project.state, width, depth);
      this.saveAndShow();
      host.setActiveView('desk');
      host.toast(`${width} × ${depth} cm desktop applied`);
    });
    const matPresetSelect = $optional<HTMLSelectElement>('#matPreset');
    matPresetSelect?.addEventListener('change', () => {
      if (matPresetSelect.value === 'custom') return;
      const [width, depth] = presetSize(matPresetSelect.value);
      project.state = updateDeskItem({ ...project.state, matWidth: width }, 'matDepth', depth);
      this.saveAndShow();
    });
  }

  /** Shows the desk's values that the side panel does not rebuild as they change. */
  sync() {
    const host = this.host;
    const state = host.project.state;
    const sizeSelect = $optional<HTMLSelectElement>('#deskSizePreset');
    if (sizeSelect) {
      const value = `${state.deskWidth}x${state.deskDepth}`;
      sizeSelect.value = [...sizeSelect.options].some((o) => o.value === value) ? value : 'custom';
    }
    const mode = $optional<HTMLSelectElement>('#monitorMode');
    if (mode) mode.value = state.monitorMode;
    const bend = $optional<HTMLSelectElement>('#armBend');
    if (bend) bend.value = state.armBend;
    this.syncMonitorPosition();
    const lengths = $optional('#armLengths');
    if (lengths) lengths.textContent = armReachHint(host.evaluation().armPose);
    const coordinateHint = $optional('[data-desktop-hint]');
    if (coordinateHint)
      coordinateHint.innerHTML = `Reference: the center of the desktop, which turns with the desk. X runs along its ${state.deskDepth} cm depth; Z along its ${state.deskWidth} cm width. Select and drag in the <b>Desk</b> or <b>Top</b> views. You can also type the position and rotation here.`;
  }

  private saveAndShow() {
    this.host.project.saveNow();
    this.host.renderControls();
    this.host.refresh();
  }

  private syncMonitorPosition() {
    const area = $optional('#monitorPositionArea');
    if (!area) return;
    const html = monitorPositionHTML(this.host.project.state, this.host.selection.armPose);
    if (this.shownMonitorPositions.get(area) === html) return;
    area.innerHTML = html;
    this.shownMonitorPositions.set(area, html);
  }

  private focusArmControls() {
    const panel = $('#controls');
    const arm = $optional('#armControls') || $optional('#monitorPositionControls');
    if (arm) panel.scrollTop += arm.getBoundingClientRect().top - panel.getBoundingClientRect().top;
  }

  /** Applies a change to the monitor arm or its saved poses, and redraws the arm controls. */
  private changeArm(next: RoomConfig) {
    this.host.project.state = next;
    this.host.project.saveSoon();
    this.host.renderControls();
    this.host.refresh();
  }

  private saveArmPose(nameInput: HTMLInputElement | null) {
    try {
      const next = saveArmPose(this.host.project.state, nameInput?.value);
      this.host.selection.armPose = activeArmPose(next)?.id ?? '';
      this.changeArm(next);
      this.host.toast('Pose saved in this layout.');
    } catch {
      this.host.toast(
        `A layout keeps up to ${MAX_ARM_POSES} poses. Delete one, or save under an existing name.`,
      );
    }
  }

  private chooseMonitorPosition(choice: string) {
    const host = this.host;
    const poseId = choice.startsWith('pose:') ? choice.slice('pose:'.length) : '';
    host.selection.armPose = poseId;
    this.changeArm(chooseMonitorPosition(host.project.state, choice));
    const state = host.project.state;
    const pose = state.armPoses.find((candidate) => candidate.id === poseId);
    if (pose && armPoseMountMoved(state, pose))
      host.toast(
        `${pose.name} was saved with the arm mounted elsewhere, so the monitor is not where it was.`,
      );
  }

  /** The pose the monitor position shows, if it shows one. */
  private shownArmPose() {
    const state = this.host.project.state;
    const { choice } = monitorPositionOf(state, this.host.selection.armPose);
    return state.armPoses.find((pose) => choice === `pose:${pose.id}`);
  }

  private updateShownArmPose() {
    const pose = this.shownArmPose();
    if (!pose) return;
    this.changeArm(updateArmPose(this.host.project.state, pose.id));
    this.host.toast(`Pose ${pose.name} updated.`);
  }

  private deleteShownArmPose() {
    const pose = this.shownArmPose();
    if (!pose) return;
    this.host.selection.armPose = '';
    this.changeArm(deleteArmPose(this.host.project.state, pose.id));
    this.host.toast(`Pose ${pose.name} deleted.`);
  }
}
