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
  turnedGrowth,
  type Operation,
  type ProfileValues,
} from '../cad/history/history.ts';
import type { Axis } from '../cad/parts/assembly.ts';
import { holesOfPlate, holesOfPlates } from '../cad/parts/plate-holes.ts';
import { plateHoleProblems, problemsOfHole } from '../cad/analysis/hole-problems.ts';
import { holeDescription, plateDrawingSvg } from '../cad/output/plate-drawing.ts';
import { plateDxf } from '../cad/output/plate-dxf.ts';
import { plateFileName } from '../cad/output/plate-files.ts';
import type { Handle, HandleModifiers } from '../cad/interaction/handles.ts';
import { withDraft, type Draft } from '../cad/history/drafts.ts';
import { jointsOfPart, touchingParts, type JointOfPart } from '../cad/history/fastening.ts';
import type { JointMarker } from '../cad/interaction/joint-markers.ts';
import { measureBetween, pickInCockpit } from '../cad/analysis/measure.ts';
import type { PartHit } from '../cad/interaction/picking.ts';
import type { CockpitDesign } from '../design.ts';
import {
  appliedSubassemblies,
  makeSubassembly,
  subassemblyOfEachStep,
  renameSubassembly,
  ungroupSubassembly,
  type AppliedSubassembly,
  type Subassembly,
} from '../cad/history/subassemblies.ts';
import {
  designInMode,
  forgetSubassemblyInModes,
  partsOffIn,
  renameMode,
  setSubassemblyOn,
  type Mode,
} from '../cad/history/modes.ts';
import type { ReplayedDesign } from '../cad/history/replay.ts';
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

/** A file the editor hands the user to download. */
export interface PlateFile {
  filename: string;
  text: string;
  mediaType: string;
}

/** What a plate is exported to: its DXF for a cutting shop and its drilling template. */
export interface PlateFiles {
  dxf: PlateFile;
  template: PlateFile;
}

/** The media type IANA registers for DXF. */
const DXF_MEDIA_TYPE = 'image/vnd.dxf';
const SVG_MEDIA_TYPE = 'image/svg+xml';

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

  /** The design history as the mode shown fits it: what the editor shows and edits. */
  history(): readonly Operation[] {
    return editing.designHistory(this.current);
  }

  /** The design history as stored, with the positions of the first mode. */
  storedHistory(): readonly Operation[] {
    return this.current.design?.history ?? [];
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
    // The view shows the cockpit as fitted, each part where it is along its travel, and the
    // holes where the design puts them, as fitting never moves them. A plate keeps the holes of
    // the parts its mode takes off, as it is made once for every mode.
    const whole = replayDesign(shown, shownAt);
    const partsOff = this.partsOffIn(whole);
    const design = designInMode(whole, partsOff);
    const selectedPartId = this.selectedPartId();
    // A part the mode takes off is shown as a ghost while it is selected.
    const ghostPartId =
      selectedPartId !== null && partsOff.has(selectedPartId) ? selectedPartId : null;
    const resolved = new Map(design.fitted.resolved);
    const ghost = ghostPartId === null ? undefined : whole.fitted.resolved.get(ghostPartId);
    if (ghostPartId !== null && ghost) resolved.set(ghostPartId, ghost);
    const plateHoles = new Map(
      [...holesOfPlates(whole)].filter(([plateId]) => !partsOff.has(plateId)),
    );
    return {
      resolved,
      connectors: design.fitted.connectors,
      plateHoles,
      selectedPartId,
      previewPartId: draft?.partId ?? pendingChange?.partId ?? null,
      ghostPartId,
      choosingFaceOf: draft?.parentId ?? null,
      measure: this.measureDrawing(),
      driver: fitting ? this.figureIn(design) : null,
      handles: this.shownHandles(),
      snapGuide: (pendingChange?.snap ?? (draft ? draftSnap : null))?.guide ?? null,
      placedPartId: draft?.partId ?? pendingChange?.partId ?? null,
      jointMarkers: editing
        .shownJointMarkers(this.current)
        .filter(({ partId, toPartId }) => !partsOff.has(partId) && !partsOff.has(toPartId)),
      fitting,
    };
  }

  /**
   * The drawing of the selected part when it is a plate at the history marker, with its holes
   * where the design puts them; null for any other selection.
   */
  plateDrawing(): { svg: string; descriptions: string[] } | null {
    const selected = this.selectedPlate();
    if (selected === null) return null;
    const { plate, holes, problems } = selected;
    return {
      svg: plateDrawingSvg(plate, holes, problems),
      descriptions: holes.map((hole, index) =>
        holeDescription(plate, hole, problemsOfHole(problems, index)),
      ),
    };
  }

  /**
   * The files to have the selected plate made, as it is at the history marker: its DXF for a
   * cutting shop and its drilling template; null for any other selection.
   */
  plateFiles(): PlateFiles | null {
    const selected = this.selectedPlate();
    if (selected === null) return null;
    const { plate, holes, problems } = selected;
    return {
      dxf: {
        filename: plateFileName(plate, 'dxf'),
        text: plateDxf(plate, holes),
        mediaType: DXF_MEDIA_TYPE,
      },
      template: {
        filename: plateFileName(plate, 'svg'),
        text: plateDrawingSvg(plate, holes, problems, { forPrint: true }),
        mediaType: SVG_MEDIA_TYPE,
      },
    };
  }

  /** The selected plate at the history marker, with its holes where the design puts them. */
  private selectedPlate() {
    const partId = this.selectedPartId();
    if (partId === null) return null;
    const design = replayDesign(this.history(), this.at());
    const plate = design.resolved.get(partId)?.part;
    if (plate?.kind !== 'plate') return null;
    return {
      plate,
      holes: holesOfPlate(design, partId),
      problems: plateHoleProblems(design, partId),
    };
  }

  /** The measurement being taken, in the design the view shows at the history marker. */
  measureDrawing(): MeasureDrawing | null {
    const { measurePicks } = this.current;
    if (measurePicks === null) return null;
    const { resolved } = this.designShown().fitted;
    const [first, second] = measurePicks;
    return {
      points: measurePicks.map((pick) => pickInCockpit(resolved, pick)),
      measurement: second === undefined ? null : measureBetween(resolved, first, second),
    };
  }

  /**
   * The driver seated in the design the view shows, with the parts of its mode on, each where
   * it is along its travel.
   */
  seatedDriver(): SeatedDriver {
    const { resolved } = this.designShown().fitted;
    return seatedDriver(resolved, editing.currentDriver(this.current));
  }

  /** The driver's figure in a design drawn, when it seats one. */
  private figureIn(design: ReplayedDesign): DriverFigure | null {
    const seated = seatedDriver(design.fitted.resolved, editing.currentDriver(this.current));
    return seated.kind === 'seated' ? seated.figure : null;
  }

  /** The design at the history marker with only the parts of the mode shown. */
  private designShown(): ReplayedDesign {
    const whole = replayDesign(this.history(), this.at());
    return designInMode(whole, this.partsOffIn(whole));
  }

  /** The parts the mode shown takes off a replayed design; none with all the parts shown. */
  private partsOffIn(design: ReplayedDesign): Set<string> {
    const mode = editing.shownMode(this.current);
    if (mode === null) return new Set();
    const subassemblies = editing.designSubassemblies(this.current);
    return partsOffIn(mode, appliedSubassemblies(subassemblies, design.resolved));
  }

  /** The design's modes, in the order they were made. */
  modes(): readonly Mode[] {
    return editing.designModes(this.current);
  }

  /** The mode the view shows and checks, or null when it shows all the parts. */
  shownMode(): Mode | null {
    return editing.shownMode(this.current);
  }

  /**
   * The mode the selected part is off in, with the outermost subassembly it takes off that
   * holds the part, or null when the part is on or the view shows all the parts.
   */
  selectedPartOff(): { mode: string; subassembly: string } | null {
    const partId = this.selectedPartId();
    const mode = this.shownMode();
    if (partId === null || mode === null) return null;
    const taking = this.subassembliesShown()
      .filter(({ rootId, partIds }) => mode.takenOff.includes(rootId) && partIds.includes(partId))
      .reduce<AppliedSubassembly | null>(
        (outermost, next) =>
          outermost === null || next.partIds.length > outermost.partIds.length ? next : outermost,
        null,
      );
    return taking ? { mode: mode.name, subassembly: taking.name } : null;
  }

  /** Shows a mode, or all the parts; which one is saved, but choosing it is not an edit. */
  showMode(modeId: string | null) {
    this.current = editing.showMode(this.current, modeId);
    this.host.saveSoon();
    this.showPanels();
  }

  /** Adds a mode with every subassembly on, at the positions of the mode shown, and shows it. */
  addMode() {
    this.settleChange();
    this.showDesignChange(editing.withNewMode(this.current));
  }

  /** Renames a mode; a name left empty keeps the one it had. */
  renameMode(modeId: string, name: string) {
    this.changeModes(renameMode(this.modes(), modeId, name));
  }

  /** Deletes a mode; when it was shown, the view shows all the parts and Fit turns off. */
  deleteMode(modeId: string) {
    this.settleChange();
    this.showDesignChange(editing.withoutMode(this.current, modeId));
  }

  /** Puts a subassembly on in a mode, or takes it off. */
  setSubassemblyOn(modeId: string, rootId: string, on: boolean) {
    this.changeModes(setSubassemblyOn(this.modes(), modeId, rootId, on));
  }

  /** Makes `next` the design's modes, as an edit; one that changes nothing is not. */
  private changeModes(next: Mode[]) {
    this.settleChange();
    if (JSON.stringify(next) === JSON.stringify(this.modes())) {
      this.host.renderInspector();
      return;
    }
    const shown = this.shownMode();
    const stillShown = shown !== null && next.some(({ id }) => id === shown.id);
    this.showDesignChange(editing.withModes(this.current, next, stillShown ? shown.id : null));
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
    this.showSession(editing.setFitting(this.current, on));
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
    this.changeDesign({ ...editing.openDesign(this.current), driver });
  }

  /** The design's subassemblies as stored, whether or not they apply at the marker. */
  subassemblies(): readonly Subassembly[] {
    return editing.designSubassemblies(this.current);
  }

  /** The subassemblies that apply at the history marker, with their parts. */
  subassembliesShown(): AppliedSubassembly[] {
    const { resolved } = replayDesign(this.history(), this.at());
    return appliedSubassemblies(editing.designSubassemblies(this.current), resolved);
  }

  /** The name of the subassembly each step's part belongs to, by step id. */
  subassemblyTags(): Map<string, string> {
    const subassemblies = editing.designSubassemblies(this.current);
    const tags = subassemblyOfEachStep(this.history(), subassemblies, this.at());
    return new Map([...tags].map(([stepId, { name }]) => [stepId, name]));
  }

  /** Makes the selected part the root of a new subassembly, named after it. */
  makeSubassemblyOfSelected() {
    const partId = this.selectedPartId();
    if (partId === null) return;
    this.changeSubassemblies((stored) => makeSubassembly(stored, this.history(), partId));
  }

  /** Renames the subassembly of a root; a name left empty keeps the one it had. */
  renameSubassembly(rootId: string, name: string) {
    this.changeSubassemblies((stored) => renameSubassembly(stored, rootId, name));
  }

  /** Ungroups the subassembly of a root, without removing any part; no mode takes it off then. */
  ungroupSubassembly(rootId: string) {
    this.changeSubassemblies((stored) => ungroupSubassembly(stored, rootId), {
      modes: forgetSubassemblyInModes(this.modes(), rootId),
    });
  }

  /**
   * Changes the design's subassemblies, and its modes with them when given; a change it refuses,
   * or that changes nothing, is not an edit.
   */
  private changeSubassemblies(
    change: (stored: readonly Subassembly[]) => Subassembly[],
    { modes = this.modes() }: { modes?: readonly Mode[] } = {},
  ) {
    this.settleChange();
    const stored = editing.designSubassemblies(this.current);
    let next: Subassembly[];
    try {
      next = change(stored);
    } catch (error) {
      this.host.toast(messageOf(error));
      return;
    }
    if (JSON.stringify(next) === JSON.stringify(stored)) {
      this.host.renderInspector();
      return;
    }
    this.showDesignChange(editing.withSubassemblies(this.current, next, modes));
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
    this.showSession(editing.selectStep(this.current, operationId));
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

  /** Turns a profile about to grow to the next way it can grow out of its face. */
  turnDraft() {
    const { draft } = this.current;
    if (draft?.kind !== 'grow-profile') return;
    this.changeDraft((history) => turnedGrowth(history, draft));
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

  /**
   * Shows a session that changes no part. Turning Fit on can show a mode, as Fit needs one, and
   * the mode shown is saved with the design.
   */
  private showSession(next: editing.CockpitSession) {
    const modeBefore = this.current.design?.shownModeId;
    this.current = next;
    if (next.design?.shownModeId !== modeBefore) this.host.saveSoon();
    this.showPanels();
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
