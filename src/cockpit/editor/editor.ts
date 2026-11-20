// The commands of the cockpit editor. Each one changes the session and tells the host what to
// show again; the editor holds no DOM, so the controllers that bind the page call it.
import {
  driverOfStature,
  seatedDriver,
  type Driver,
  type DriverFigure,
  type SeatedDriver,
} from '../cad/driver/driver.ts';
import { draftPeripheral, peripheralAt } from '../cad/history/peripherals.ts';
import { draftPlate, plateAt } from '../cad/history/plates.ts';
import {
  addAnchoredProfile,
  addFoot,
  addOperation,
  draftGrowth,
  editProfile,
  growthAt,
  makesAProfile,
  operationMaking,
  replayDesign,
  type Operation,
  type ProfileValues,
} from '../cad/history/history.ts';
import type { Axis } from '../cad/parts/assembly.ts';
import type { Handle, HandleModifiers } from '../cad/interaction/handles.ts';
import { withDraft, type Draft } from '../cad/history/drafts.ts';
import { jointsOfPart, touchingParts, type JointOfPart } from '../cad/history/fastening.ts';
import type { JointMarker } from '../cad/interaction/joint-markers.ts';
import { measureBetween, pickInCockpit } from '../cad/analysis/measure.ts';
import type { PartHit } from '../cad/interaction/picking.ts';
import type { CockpitDesign } from '../design.ts';
import type { JointCard, TouchingPart } from './joints-view.ts';
import type { CockpitDrawing } from '../render/cad.ts';
import type { MeasureDrawing } from '../render/measurement.ts';
import * as editing from './session.ts';

/** What the editor needs from the page that holds it. */
export interface CockpitEditorHost {
  /** Shows the page again from the current state. */
  refresh(): void;
  /** Rebuilds the side panel, which shows the design history. */
  renderControls(): void;
  /** Rebuilds the inspector even when it would look the same, dropping values it refused. */
  renderInspector(): void;
  /** Shows the card of the open joint marker, or hides it. */
  renderJointCard(): void;
  /** Saves the design soon. */
  saveSoon(): void;
  /** Frames the design in the view, as its first part appears. */
  frameDesign(): void;
  /** Tells the user something briefly. */
  toast(message: string): void;
  /** The axis the view looks along, or null in 3D. */
  sightAxis(): Axis | null;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class CockpitEditor {
  declare private readonly host: CockpitEditorHost;
  declare private current: editing.CockpitSession;

  constructor(host: CockpitEditorHost, design: CockpitDesign | null) {
    this.host = host;
    this.current = editing.newSession(design);
  }

  get session(): editing.CockpitSession {
    return this.current;
  }

  /** Opens another design; Fit stays as it was. */
  open(design: CockpitDesign | null) {
    this.current = editing.reopened(this.current, design);
  }

  history(): readonly Operation[] {
    return editing.designHistory(this.current);
  }

  /** How many steps the view shows. */
  at(): number {
    return editing.markerIndex(this.current);
  }

  /** Whether the project has a cockpit design. */
  hasDesign(): boolean {
    return this.current.design !== null;
  }

  /** The driver the design is fitted to. */
  driver(): Driver {
    return editing.currentDriver(this.current);
  }

  hasParts(): boolean {
    return editing.designHasParts(this.current);
  }

  selectedOperation(): Operation | undefined {
    return editing.selectedOperation(this.current);
  }

  selectedPartId(): string | null {
    return editing.selectedPartId(this.current);
  }

  /** Why the selected step fails, in the whole design, or undefined when it applies. */
  selectedFailure(): string | undefined {
    const operation = this.selectedOperation();
    return operation ? replayDesign(this.history()).failures.get(operation.id) : undefined;
  }

  /** Whether a step is one the mode of the view changes: a peripheral's while fitting, else the frame's. */
  changeableInMode(operation: Operation): boolean {
    return editing.changeableInMode(this.current, operation);
  }

  /** The handles the view shows, of the selected part or the part about to be added. */
  shownHandles(): Handle[] {
    return editing.shownHandles(this.current, this.host.sightAxis());
  }

  /** What the view draws of the design, or null while it has no parts. */
  drawing(): CockpitDrawing | null {
    if (!this.hasParts()) return null;
    const { draft, draftSnap, pendingChange, fitting } = this.current;
    const history = pendingChange?.history ?? this.history();
    const at = this.at();
    const shown = draft ? withDraft(history, draft, at) : history;
    const shownAt = draft ? at + 1 : at;
    // The view shows the cockpit as fitted, each part where it is along its travel.
    const { fitted } = replayDesign(shown, shownAt);
    return {
      resolved: fitted.resolved,
      connectors: fitted.connectors,
      selectedPartId: this.selectedPartId(),
      previewPartId: draft?.partId ?? pendingChange?.partId ?? null,
      choosingFaceOf: draft?.parentId ?? null,
      measure: this.measureDrawing(),
      driver: fitting ? this.figureIn(shown, shownAt) : null,
      handles: this.shownHandles(),
      snapGuide: (pendingChange?.snap ?? (draft ? draftSnap : null))?.guide ?? null,
      placedPartId: draft?.partId ?? pendingChange?.partId ?? null,
      jointMarkers: editing.shownJointMarkers(this.current),
      fitting,
    };
  }

  /** The measurement being taken, in the design the view shows at the history marker. */
  measureDrawing(): MeasureDrawing | null {
    const { measurePicks } = this.current;
    if (measurePicks === null) return null;
    const { resolved } = replayDesign(this.history(), this.at()).fitted;
    const [first, second] = measurePicks;
    return {
      points: measurePicks.map((pick) => pickInCockpit(resolved, pick)),
      measurement: second === undefined ? null : measureBetween(resolved, first, second),
    };
  }

  /** The driver seated in the design the view shows, each part where it is along its travel. */
  seatedDriver(): SeatedDriver {
    const { resolved } = replayDesign(this.history(), this.at()).fitted;
    return seatedDriver(resolved, editing.currentDriver(this.current));
  }

  /** The driver's figure in a design drawn up to step `at`, when it seats one. */
  private figureIn(history: readonly Operation[], at: number): DriverFigure | null {
    const { resolved } = replayDesign(history, at).fitted;
    const seated = seatedDriver(resolved, editing.currentDriver(this.current));
    return seated.kind === 'seated' ? seated.figure : null;
  }

  /** The parts that touch the selected one at the marker without a joint, to join it to. */
  touchingSelected(): TouchingPart[] {
    const partId = this.selectedPartId();
    if (partId === null) return [];
    const history = this.history();
    return touchingParts(history, partId, this.at()).map((id) => ({
      partId: id,
      name: operationMaking(history, id)?.name ?? id,
    }));
  }

  /** The joints of the selected part at the marker, with their connectors. */
  jointsOfSelected(): JointOfPart[] {
    const partId = this.selectedPartId();
    return partId === null ? [] : jointsOfPart(this.history(), partId, this.at());
  }

  /**
   * What the card of the open marker shows, from the design as it is now: the joint between
   * its two parts, which joining them makes, or the two parts touching. Null once neither is
   * left, or while the markers are hidden.
   */
  jointCard(): { marker: JointMarker; card: JointCard } | null {
    const marker = editing.jointMarkersShown(this.current) ? this.current.openJointMarker : null;
    if (marker === null) return null;
    const history = this.history();
    const at = this.at();
    const { partId, toPartId } = marker;
    const between = [`${partId}@${toPartId}`, `${toPartId}@${partId}`];
    const joint = jointsOfPart(history, partId, at).find(({ jointId }) =>
      between.includes(jointId),
    );
    if (joint) {
      const [joinedId = partId] = joint.jointId.split('@');
      return { marker, card: { kind: 'joint', partId: joinedId, joint } };
    }
    if (!touchingParts(history, partId, at).includes(toPartId)) return null;
    const nameOf = (id: string) => operationMaking(history, id)?.name ?? id;
    return {
      marker,
      card: {
        kind: 'touching',
        partId,
        partName: nameOf(partId),
        toPartId,
        toPartName: nameOf(toPartId),
      },
    };
  }

  /** Turns Fit on or off; what was about to be added or changed is dropped. */
  setFitting(on: boolean) {
    if (this.current.fitting === on) return;
    this.current = editing.setFitting(this.current, on);
    this.showPanels();
  }

  /** Opens the card of a joint marker beside it, closing any other. */
  openJointCard(marker: JointMarker) {
    this.current = { ...this.current, openJointMarker: marker };
    this.host.renderJointCard();
  }

  closeJointCard() {
    if (this.current.openJointMarker === null) return;
    this.forgetJointCard();
    this.host.renderJointCard();
  }

  /** Forgets the open card, once the joint it showed is gone, without showing anything. */
  forgetJointCard() {
    if (this.current.openJointMarker !== null)
      this.current = { ...this.current, openJointMarker: null };
  }

  /** Drags a handle of the selected part, `atGrabMm` along when it was grabbed. */
  dragChange(handle: Handle, atGrabMm: number, movedMm: number, modifiers: HandleModifiers) {
    this.show(editing.dragChange(this.current, handle, atGrabMm, movedMm, modifiers));
  }

  /** Drags a handle of the part about to be added, as it was when grabbed. */
  dragDraft(draft: Draft, handle: Handle, movedMm: number, modifiers: HandleModifiers) {
    const dragged = editing.dragDraft(this.current, draft, handle, movedMm, modifiers);
    if (dragged === null) return;
    this.current = dragged;
    this.host.renderInspector();
    this.host.refresh();
  }

  /** Sets the waiting change to a value typed in its box. */
  typeChange(valueMm: number) {
    this.show(editing.typedChange(this.current, valueMm));
  }

  /** Makes the waiting change an edit of the design, which undo takes back in one step. */
  confirmChange() {
    if (!this.current.pendingChange) return;
    const confirmed = editing.confirmChange(this.current);
    if (confirmed.design !== this.current.design) this.showDesignChange(confirmed);
    else this.show(confirmed);
  }

  cancelChange() {
    if (!this.current.pendingChange) return;
    this.show(editing.cancelChange(this.current));
  }

  /** Before another edit, a waiting change is confirmed, so the edit builds on what the view shows. */
  settleChange() {
    if (this.current.pendingChange) this.confirmChange();
  }

  /** Turns the measure tool on, with no points yet, or off. */
  setMeasuring(on: boolean) {
    this.current = editing.setMeasuring(this.current, on);
    this.showPanels();
  }

  /** Turns the measure tool off without showing anything, as another editor opens. */
  stopMeasuring() {
    this.current = editing.setMeasuring(this.current, false);
  }

  /** Makes `next` the cockpit design, as an edit that can be undone, and shows it. */
  changeDesign(next: CockpitDesign) {
    this.showDesignChange(editing.changeDesign(this.current, next));
  }

  /** Sets the driver's stature; one the driver cannot have is explained and nothing changes. */
  setStature(statureMm: number) {
    let driver: Driver;
    try {
      driver = driverOfStature(statureMm);
    } catch (error) {
      this.host.toast(messageOf(error));
      this.host.renderInspector();
      return;
    }
    this.changeDesign({ history: this.history(), driver });
  }

  addProfile() {
    const added = addAnchoredProfile(this.history(), this.at());
    this.showDesignChange(editing.withAddedPart(this.current, added));
  }

  /** Applies a change to the history; one it refuses is explained and nothing changes. */
  changeHistory(change: (history: readonly Operation[]) => Operation[]) {
    this.showHistoryChange(editing.historyChange(this.current, change));
  }

  /** Changes the operation of the selected profile; values it cannot have are explained. */
  editSelectedProfile(changes: Partial<ProfileValues>) {
    const operation = this.selectedOperation();
    if (!operation || !makesAProfile(operation)) return;
    this.changeHistory((history) => editProfile(history, operation.partId, changes));
  }

  /**
   * Changes the connectors of a joint. A fastening step added goes in at the marker and one
   * deleted before it moves the marker back, so the marker stays after the same steps.
   */
  changeJoints(change: (history: readonly Operation[], at: number) => Operation[]) {
    this.settleChange();
    let next: editing.CockpitSession;
    try {
      next = editing.jointChange(this.current, change);
    } catch (error) {
      this.host.toast(messageOf(error));
      this.host.renderInspector();
      return;
    }
    this.showDesignChange(next);
  }

  /** Puts a foot under the selected profile, at the marker, and selects it. */
  addFootUnderSelected() {
    this.settleChange();
    const partId = this.selectedPartId();
    if (partId === null) return;
    let added: editing.CockpitSession;
    try {
      added = editing.withAddedPart(this.current, addFoot(this.history(), partId, this.at()));
    } catch (error) {
      this.host.toast(messageOf(error));
      return;
    }
    this.showDesignChange(added);
  }

  /** Removes the selected part from the marker on, as a step of its own. */
  removeSelectedPart() {
    this.settleChange();
    if (this.selectedPartId() === null) return;
    if (!this.showHistoryChange(editing.removeSelectedPart(this.current))) return;
    this.host.toast('Part removed from this step on. Delete the step to bring it back.');
  }

  /** Takes the selected step out of the whole history; what relied on it fails. */
  deleteSelectedStep() {
    this.settleChange();
    if (!this.selectedOperation()) return;
    this.showHistoryChange(editing.deleteSelectedStep(this.current));
  }

  /** Moves the history marker, to show the design at another step. */
  moveMarker(to: number | null) {
    this.current = editing.moveMarker(this.current, to);
    this.showPanels();
  }

  /** Undoes the last edit; a waiting change or a part about to be added is dropped first. */
  undo() {
    if (this.current.pendingChange) {
      this.cancelChange();
      return;
    }
    if (this.current.draft !== null) {
      this.cancelDraft();
      return;
    }
    const undone = editing.undoEdit(this.current);
    if (undone) this.showDesignChange(undone);
  }

  /** Redoes the last edit undone; a waiting change is dropped first. */
  redo() {
    if (this.current.pendingChange) {
      this.cancelChange();
      return;
    }
    const redone = editing.redoEdit(this.current);
    if (redone) this.showDesignChange(redone);
  }

  /** Selects a step. A peripheral's turns Fit on, as peripherals are only changed while fitting. */
  select(operationId: string | null) {
    this.current = editing.selectStep(this.current, operationId);
    this.showPanels();
  }

  /** Selects the step that made a part. */
  selectPart(partId: string) {
    this.select(operationMaking(this.history(), partId)?.id ?? null);
  }

  /**
   * A click in the view selects the step that made a part, or, while a part is about to be
   * added, picks the face of its parent it goes on.
   */
  pickInView(hit: PartHit | null) {
    // While a change waits, a click elsewhere in the view does nothing.
    if (this.current.pendingChange) return;
    // A click elsewhere closes the card of a joint, without selecting anything.
    if (this.current.openJointMarker !== null) {
      this.closeJointCard();
      return;
    }
    if (this.current.measurePicks !== null) {
      this.show(editing.measureAt(this.current, hit));
      return;
    }
    const { draft } = this.current;
    if (draft === null) {
      const maker = hit === null ? undefined : operationMaking(this.history(), hit.partId);
      this.select(maker?.id ?? null);
      return;
    }
    if (hit === null || hit.partId !== draft.parentId) return;
    const at = this.at();
    this.changeDraft((history) => {
      switch (draft.kind) {
        case 'grow-profile':
          return growthAt(history, draft, hit.face, hit.pointMm, at);
        case 'add-plate':
          return plateAt(history, draft, hit.face, hit.pointMm, at);
        case 'mount-peripheral':
          return peripheralAt(history, draft, hit.face, hit.pointMm, at);
      }
    });
  }

  /** Starts a profile growing out of the selected part, shown as a preview until it is added. */
  startGrowth() {
    this.startDraft(draftGrowth);
  }

  /** Starts a plate resting on the selected profile. */
  startPlate() {
    this.startDraft(draftPlate);
  }

  /** Starts mounting a peripheral of a catalog type on the selected part. */
  startMounting(typeId: string) {
    this.startDraft((history, partId, at) => draftPeripheral(history, partId, typeId, at));
  }

  /**
   * Changes the part about to be added; values it cannot have, or a place off its face, are
   * explained.
   */
  changeDraft(next: (history: readonly Operation[]) => Draft) {
    const history = this.history();
    try {
      const changed = next(history);
      addOperation(history, changed, this.at());
      this.current = editing.placeDraft(this.current, changed);
    } catch (error) {
      this.host.toast(messageOf(error));
    }
    this.host.renderInspector();
    this.host.refresh();
  }

  confirmDraft() {
    if (this.current.draft === null) return;
    this.showDesignChange(editing.confirmDraft(this.current));
  }

  cancelDraft() {
    this.show(editing.cancelDraft(this.current));
  }

  private startDraft(
    draftOn: (history: readonly Operation[], partId: string, at: number) => Draft,
  ) {
    this.settleChange();
    const partId = this.selectedPartId();
    if (partId === null) return;
    this.show(editing.startDraft(this.current, draftOn(this.history(), partId, this.at())));
  }

  /** Shows `next`, when there is one, in the view and the panels around it. */
  private show(next: editing.CockpitSession | null) {
    if (next === null) return;
    this.current = next;
    this.host.refresh();
  }

  /** Shows the session again, with its side panel rebuilt. */
  private showPanels() {
    this.host.renderControls();
    this.host.refresh();
  }

  /** Makes `next` the session after its design changed: saves and shows it, framing the first part. */
  private showDesignChange(next: editing.CockpitSession) {
    const hadParts = this.hasParts();
    this.current = next;
    this.host.saveSoon();
    this.showPanels();
    if (!hadParts && this.hasParts()) this.host.frameDesign();
  }

  /**
   * Shows what a change of the history gave. One the design refuses is explained; when nothing
   * changed, the inspector shows the values the step still has. Whether the design changed.
   */
  private showHistoryChange(result: editing.HistoryChange): boolean {
    if (result.kind === 'changed') {
      this.showDesignChange(result.session);
      return true;
    }
    if (result.kind === 'refused') this.host.toast(result.message);
    this.host.renderInspector();
    return false;
  }
}
