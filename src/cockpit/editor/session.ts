// What the cockpit editor is doing with the open design: the step selected, the history
// marker, the edits to undo, a part about to be added, a change dragged with a handle, Fit
// mode and the measure tool. Each change returns a new session; the editor shows it.
import { DEFAULT_DRIVER, type Driver } from '../cad/driver/driver.ts';
import {
  addOperation,
  deleteOperation,
  makesAPart,
  makesAProfile,
  operationMaking,
  removePart,
  replayDesign,
  type Operation,
} from '../cad/history/history.ts';
import {
  draggedHandle,
  draggedHistory,
  dragFromTyped,
  handlesSeenAlong,
  partHandles,
  snappedDrag,
  symmetricDrag,
  travelHandles,
  type Drag,
  type Handle,
  type HandleModifiers,
} from '../cad/interaction/handles.ts';
import type { Axis } from '../cad/parts/assembly.ts';
import { snapToParts, type Snap } from '../cad/interaction/snapping.ts';
import { draftEditedBy, withDraft, type Draft } from '../cad/history/drafts.ts';
import { secondProfiles, type SecondProfile } from '../cad/history/peripherals.ts';
import { jointMarkers, type JointMarker } from '../cad/interaction/joint-markers.ts';
import type { PartHit } from '../cad/interaction/picking.ts';
import { nextMeasurePicks } from '../cad/analysis/measure.ts';
import { emptyDesign, type CockpitDesign } from '../design.ts';
import type { Subassembly } from '../cad/history/subassemblies.ts';
import type { Mode } from '../cad/history/modes.ts';
import {
  addFittedMode,
  deleteFittedMode,
  historyInMode,
  keepFitting,
} from '../cad/history/mode-positions.ts';
import { noEdits, recordEdit, redo, undo, type Edits } from '../../shared/undo.ts';

/** A change made with a handle, waiting to be confirmed. */
export interface PendingChange {
  partId: string;
  handle: Handle;
  drag: Drag;
  /** What the drag snapped to, shown with a guide, or null. */
  snap: Snap | null;
  history: Operation[];
}

export interface CockpitSession {
  /** The cockpit design, or null while the project has none. */
  readonly design: CockpitDesign | null;
  /** The edits made to the design since the project was opened, to undo and redo. */
  readonly edits: Edits<CockpitDesign | null>;
  /** The step selected in the history, or null. */
  readonly selectedOperationId: string | null;
  /**
   * The step marked in the history panel: one chosen there, or shown there on request. A part
   * picked in the view is selected without marking its step, which goes with any other choice.
   */
  readonly markedStepId: string | null;
  /** The history marker: how many steps the view shows, or null to follow the last step. */
  readonly marker: number | null;
  /** A part about to be added to the selected one, shown as a preview until it is added. */
  readonly draft: Draft | null;
  /** What a handle of the part about to be added last snapped to, shown with a guide. */
  readonly draftSnap: Snap | null;
  /**
   * Whether the editor is in Fit mode, fitting the design to the driver: peripherals are
   * mounted and moved, and the frame is locked. It belongs to the session.
   */
  readonly fitting: boolean;
  /**
   * The points clicked so far with the measure tool, or null when it is off. Measurements
   * belong to the session and are never saved.
   */
  readonly measurePicks: readonly PartHit[] | null;
  /**
   * A change of the selected part dragged in the view with one of its handles, with the
   * history it would give, shown as a preview until it is confirmed.
   */
  readonly pendingChange: PendingChange | null;
  /** The joint marker whose card is open, or null. */
  readonly openJointMarker: JointMarker | null;
}

/** What a change of the history gave: a new session, or why nothing changed. */
export type HistoryChange =
  | { kind: 'changed'; session: CockpitSession }
  | { kind: 'unchanged' }
  | { kind: 'refused'; message: string };

export const newSession = (design: CockpitDesign | null): CockpitSession => ({
  design,
  edits: noEdits(),
  selectedOperationId: null,
  markedStepId: null,
  marker: null,
  draft: null,
  draftSnap: null,
  fitting: false,
  measurePicks: null,
  pendingChange: null,
  openJointMarker: null,
});

/** The session with another design opened: Fit stays as it was, everything else starts again. */
export const reopened = (
  session: CockpitSession,
  design: CockpitDesign | null,
): CockpitSession => ({
  ...session,
  design,
  edits: noEdits(),
  selectedOperationId: null,
  marker: null,
  draft: null,
  measurePicks: null,
  pendingChange: null,
});

/**
 * The design history as the mode shown fits it, each adjustment where that mode has it; empty
 * without a design. The editor shows and edits this one, and `withHistory` stores it.
 */
export function designHistory(session: CockpitSession): readonly Operation[] {
  const { design } = session;
  if (design === null) return [];
  return historyInMode(design.history, design.modes ?? [], design.shownModeId ?? null);
}

/** Whether the design has parts to show. */
export const designHasParts = (session: CockpitSession): boolean =>
  designHistory(session).length > 0;

export const currentDriver = (session: CockpitSession): Driver =>
  session.design?.driver ?? DEFAULT_DRIVER;

/** How many steps the view shows: all of them unless the history marker was moved back. */
export function markerIndex(session: CockpitSession): number {
  const steps = designHistory(session).length;
  return Math.min(session.marker ?? steps, steps);
}

/** The selected step, if it is still in the history. */
export const selectedOperation = (session: CockpitSession): Operation | undefined =>
  designHistory(session).find((operation) => operation.id === session.selectedOperationId);

/** The part the selected step made, when the view shows it. */
export function selectedPartId(session: CockpitSession): string | null {
  const operation = selectedOperation(session);
  if (!operation || !makesAPart(operation)) return null;
  const { resolved } = replayDesign(designHistory(session), markerIndex(session));
  return resolved.has(operation.partId) ? operation.partId : null;
}

/** Whether a step is one the mode of the view changes: a peripheral's while fitting, else the frame's. */
export const changeableInMode = (session: CockpitSession, operation: Operation): boolean =>
  session.fitting === (operation.kind === 'mount-peripheral');

/**
 * Makes `next` the design, as an edit that can be undone. What was about to be added or
 * changed is dropped, and the measurement starts again, as the parts measured may have moved.
 */
export function changeDesign(session: CockpitSession, next: CockpitDesign): CockpitSession {
  return showingChangedDesign({
    ...session,
    edits: recordEdit(session.edits, session.design),
    design: next,
  });
}

/** The design, or a new one while the project has none. */
export const openDesign = (session: CockpitSession): CockpitDesign =>
  session.design ?? emptyDesign();

/**
 * Makes `history`, as the mode shown fits it, the design history, keeping the driver and the
 * subassemblies, as an edit that can be undone. The positions of the adjustments go to the mode
 * shown, and every other mode keeps its own.
 */
export function withHistory(
  session: CockpitSession,
  history: readonly Operation[],
): CockpitSession {
  const design = openDesign(session);
  const { modes } = design;
  if (!modes?.length) return changeDesign(session, { ...design, history });
  const kept = keepFitting(history, design.history, modes, design.shownModeId ?? null);
  return changeDesign(session, { ...design, ...kept });
}

/**
 * Makes `subassemblies` the design's, keeping its history and driver, as an edit that can be
 * undone. The modes change with them when given, as when one they take off is ungrouped.
 */
export const withSubassemblies = (
  session: CockpitSession,
  subassemblies: readonly Subassembly[],
  modes: readonly Mode[] = designModes(session),
): CockpitSession => {
  const design = { ...openDesign(session), subassemblies };
  return changeDesign(session, modes.length ? { ...design, modes } : design);
};

/** The design's subassemblies, none when it has no design or none of them. */
export const designSubassemblies = (session: CockpitSession): readonly Subassembly[] =>
  session.design?.subassemblies ?? [];

/** The design's modes, none when it has no design or none of them. */
export const designModes = (session: CockpitSession): readonly Mode[] =>
  session.design?.modes ?? [];

/** The mode the view shows and checks, or null when it shows all the parts. */
export const shownMode = (session: CockpitSession): Mode | null =>
  designModes(session).find((mode) => mode.id === session.design?.shownModeId) ?? null;

/** The design with `shownModeId` as the mode shown, or all the parts when it is null. */
function showingMode(design: CockpitDesign, shownModeId: string | null): CockpitDesign {
  const { shownModeId: _shown, ...rest } = design;
  return shownModeId === null ? rest : { ...rest, shownModeId };
}

/**
 * Makes `modes` the design's, showing the mode `shownModeId` or all the parts, as an edit that
 * can be undone.
 */
export const withModes = (
  session: CockpitSession,
  modes: readonly Mode[],
  shownModeId: string | null,
): CockpitSession =>
  changeDesign(session, showingMode({ ...openDesign(session), modes }, shownModeId));

/** Adds a mode with every subassembly on, at the positions of the mode shown, and shows it. */
export function withNewMode(session: CockpitSession): CockpitSession {
  const { history } = openDesign(session);
  const modes = addFittedMode(history, designModes(session), shownMode(session)?.id ?? null);
  return withModes(session, modes, modes.at(-1)?.id ?? null);
}

/**
 * Deletes a mode, as an edit. Deleting the first one puts the positions of the next in the
 * operations; deleting the one shown shows all the parts, and turns Fit off.
 */
export function withoutMode(session: CockpitSession, modeId: string): CockpitSession {
  const design = openDesign(session);
  const left = deleteFittedMode(design.history, designModes(session), modeId);
  const shownId = shownMode(session)?.id ?? null;
  const shown = shownId === modeId ? null : shownId;
  const changed = changeDesign(session, showingMode({ ...design, ...left }, shown));
  return shown === null ? setFitting(changed, false) : changed;
}

/**
 * Shows a mode, or all the parts when `modeId` is null. Which one is saved with the design, but
 * choosing it is not an edit, as it changes no part.
 */
export function showMode(session: CockpitSession, modeId: string | null): CockpitSession {
  if (modeId !== null && !designModes(session).some((mode) => mode.id === modeId))
    throw new Error(`The cockpit design has no mode ${modeId}.`);
  const design = session.design;
  if (design === null) return session;
  const shown = { ...session, design: showingMode(design, modeId), pendingChange: null };
  return modeId === null ? setFitting(shown, false) : shown;
}

/**
 * The design an undo or a redo goes back to, still showing the mode shown when it has it, as
 * choosing the mode shown is not an edit.
 */
function keepingShownMode(
  restored: CockpitDesign | null,
  current: CockpitDesign | null,
): CockpitDesign | null {
  if (restored === null) return null;
  const shownModeId = current?.shownModeId ?? null;
  const kept = shownModeId === null || restored.modes?.some(({ id }) => id === shownModeId);
  return kept ? showingMode(restored, shownModeId) : restored;
}

/** The session after its design changed: a step no longer there is unselected. */
function showingChangedDesign(session: CockpitSession): CockpitSession {
  const changed = {
    ...session,
    draft: null,
    pendingChange: null,
    measurePicks: session.measurePicks === null ? null : designHasParts(session) ? [] : null,
  };
  const steps = designHistory(changed).length;
  return {
    ...changed,
    selectedOperationId: selectedOperation(changed) ? changed.selectedOperationId : null,
    marker: changed.marker !== null && changed.marker >= steps ? null : changed.marker,
  };
}

/** Applies a change to the history; one the design refuses, or that changes nothing, says so. */
export function historyChange(
  session: CockpitSession,
  change: (history: readonly Operation[]) => Operation[],
): HistoryChange {
  let history: Operation[];
  try {
    history = change(designHistory(session));
  } catch (error) {
    return { kind: 'refused', message: error instanceof Error ? error.message : String(error) };
  }
  if (JSON.stringify(history) === JSON.stringify(designHistory(session)))
    return { kind: 'unchanged' };
  return { kind: 'changed', session: withHistory(session, history) };
}

/** The design before the last edit, or null when there is nothing to undo. */
export function undoEdit(session: CockpitSession): CockpitSession | null {
  const step = undo(session.edits, session.design);
  if (!step) return null;
  const design = keepingShownMode(step.value, session.design);
  return showingChangedDesign({ ...session, edits: step.edits, design });
}

/** The design the last undo left, or null when there is nothing to redo. */
export function redoEdit(session: CockpitSession): CockpitSession | null {
  const step = redo(session.edits, session.design);
  if (!step) return null;
  const design = keepingShownMode(step.value, session.design);
  return showingChangedDesign({ ...session, edits: step.edits, design });
}

/** Steps added at the marker push it on, so it stays after them. */
export const stepAddedAtMarker = (session: CockpitSession): CockpitSession => ({
  ...session,
  marker: session.marker === null ? null : session.marker + 1,
});

/** A part added at the marker, selected, as an edit that can be undone. */
export function withAddedPart(
  session: CockpitSession,
  added: { history: readonly Operation[]; partId: string },
): CockpitSession {
  const step = operationMaking(added.history, added.partId);
  const selecting = { ...session, selectedOperationId: step?.id ?? null };
  return withHistory(stepAddedAtMarker(selecting), added.history);
}

/** Removes the selected part from the marker on, as a step of its own, and unselects it. */
export function removeSelectedPart(session: CockpitSession): HistoryChange {
  const partId = selectedPartId(session);
  if (partId === null) return { kind: 'unchanged' };
  const at = markerIndex(session);
  const result = historyChange(session, (history) => removePart(history, partId, at));
  if (result.kind !== 'changed') return result;
  const removed = stepAddedAtMarker(result.session);
  return { kind: 'changed', session: { ...removed, selectedOperationId: null } };
}

/**
 * Takes the selected step out of the whole history, and unselects it; what relied on it
 * fails. A step before the marker takes the marker back with it.
 */
export function deleteSelectedStep(session: CockpitSession): HistoryChange {
  const operation = selectedOperation(session);
  if (!operation) return { kind: 'unchanged' };
  const index = designHistory(session).indexOf(operation);
  const { marker } = session;
  // The marker moves back before the shorter history is shown, which would otherwise take a
  // marker at its end for one following the last step.
  const back = marker !== null && index < markerIndex(session) ? marker - 1 : marker;
  const result = historyChange({ ...session, marker: back }, (history) =>
    deleteOperation(history, operation.id),
  );
  if (result.kind !== 'changed') return result;
  return { kind: 'changed', session: { ...result.session, selectedOperationId: null } };
}

/**
 * Changes the connectors of a joint at the marker. A fastening step added goes in at the
 * marker and one deleted before it moves the marker back, so the marker stays after the same
 * steps. A change the design refuses throws.
 */
export function jointChange(
  session: CockpitSession,
  change: (history: readonly Operation[], at: number) => Operation[],
): CockpitSession {
  const history = designHistory(session);
  const at = markerIndex(session);
  const next = change(history, at);
  if (session.marker === null) return withHistory(session, next);
  const before = new Set(history.slice(0, at).map((operation) => operation.id));
  const known = new Set(history.map((operation) => operation.id));
  const marker = next.filter((step) => before.has(step.id) || !known.has(step.id)).length;
  return withHistory({ ...session, marker }, next);
}

/** Moves the history marker; a selected step after it is unselected. */
export function moveMarker(session: CockpitSession, to: number | null): CockpitSession {
  const steps = designHistory(session).length;
  const moved: CockpitSession = {
    ...session,
    draft: null,
    pendingChange: null,
    measurePicks: session.measurePicks === null ? null : [],
    marker: to === null || to >= steps ? null : Math.max(0, to),
  };
  const selected = selectedOperation(moved);
  const after =
    selected !== undefined && designHistory(moved).indexOf(selected) >= markerIndex(moved);
  return after ? { ...moved, selectedOperationId: null } : moved;
}

/**
 * Turns Fit on or off. What was about to be added or changed is dropped, the card of a joint
 * closes, and a peripheral selected while fitting is unselected, as designing cannot change it.
 * Fit needs a mode, as each mode has its own fitting: turned on with all the parts shown, it
 * shows the first.
 */
export function setFitting(session: CockpitSession, on: boolean): CockpitSession {
  if (session.fitting === on) return session;
  const unselect = !on && selectedOperation(session)?.kind === 'mount-peripheral';
  const first = designModes(session)[0];
  const moded =
    on && shownMode(session) === null && first !== undefined && session.design !== null
      ? { ...session, design: showingMode(session.design, first.id) }
      : session;
  return {
    ...moded,
    fitting: on,
    draft: null,
    pendingChange: null,
    openJointMarker: null,
    selectedOperationId: unselect ? null : session.selectedOperationId,
  };
}

/**
 * Selects a step, marked in the history when it was chosen there. A peripheral's turns Fit on,
 * as peripherals are only changed while fitting.
 */
export function selectStep(
  session: CockpitSession,
  operationId: string | null,
  { fromHistory = false }: { fromHistory?: boolean } = {},
): CockpitSession {
  const operation = designHistory(session).find((step) => step.id === operationId);
  const moded = operation?.kind === 'mount-peripheral' ? setFitting(session, true) : session;
  return {
    ...moded,
    pendingChange: null,
    selectedOperationId: operationId,
    markedStepId: fromHistory ? operationId : null,
    draft: null,
  };
}

/** The selected step, marked in the history panel. */
export const showSelectionInHistory = (session: CockpitSession): CockpitSession => ({
  ...session,
  markedStepId: session.selectedOperationId,
});

/** The step the history panel marks: the selected one, when it was chosen or shown there. */
export const stepMarkedInHistory = (session: CockpitSession): string | null =>
  session.markedStepId !== null && session.markedStepId === session.selectedOperationId
    ? session.markedStepId
    : null;

/** Turns the measure tool on, with no points yet, dropping what was being added; or off. */
export const setMeasuring = (session: CockpitSession, on: boolean): CockpitSession =>
  on
    ? { ...session, measurePicks: [], draft: null, pendingChange: null }
    : { ...session, measurePicks: null };

/** A click with the measure tool: the next point, or a new measurement after two. */
export function measureAt(session: CockpitSession, hit: PartHit | null): CockpitSession {
  if (session.measurePicks === null) return session;
  return { ...session, measurePicks: nextMeasurePicks(session.measurePicks, hit) };
}

/** Starts adding a part, shown as a preview until it is added; the measure tool turns off. */
export const startDraft = (session: CockpitSession, draft: Draft): CockpitSession => ({
  ...session,
  measurePicks: null,
  draft,
  draftSnap: null,
});

/** The part about to be added, changed, with what a handle dragging it snapped to. */
export const placeDraft = (
  session: CockpitSession,
  draft: Draft,
  snap: Snap | null = null,
): CockpitSession => ({ ...session, draft, draftSnap: snap });

/** Adds the part about to be added at the marker, selected, as an edit that can be undone. */
export function confirmDraft(session: CockpitSession): CockpitSession {
  const added = session.draft;
  if (added === null) return session;
  const history = addOperation(designHistory(session), added, markerIndex(session));
  return withHistory(stepAddedAtMarker({ ...session, selectedOperationId: added.id }), history);
}

export const cancelDraft = (session: CockpitSession): CockpitSession => ({
  ...session,
  draft: null,
});

/**
 * The profiles a seat about to be mounted could go between with the profile it is on, those it
 * can first, nearest first, and the others with why not; null for any other part being added.
 */
export function draftSecondProfiles(session: CockpitSession): readonly SecondProfile[] | null {
  const { draft } = session;
  if (draft?.kind !== 'mount-peripheral' || draft.category !== 'seat') return null;
  return secondProfiles(designHistory(session), draft, markerIndex(session));
}

/**
 * Whether a click on a part picks it as the second profile of the seat about to be mounted:
 * any other profile does, and a click on its own profile places it there instead.
 */
export function picksSecondProfile(session: CockpitSession, partId: string): boolean {
  const { draft } = session;
  if (draft?.kind !== 'mount-peripheral' || draft.category !== 'seat') return false;
  if (partId === draft.parentId) return false;
  const operation = operationMaking(designHistory(session), partId);
  return operation !== undefined && makesAProfile(operation);
}

/**
 * A drag of a handle shown as a change waiting to be confirmed, or null when the operation of
 * its part cannot take it.
 */
export function changeInView(
  session: CockpitSession,
  handle: Handle,
  drag: Drag,
  snap: Snap | null = null,
): CockpitSession | null {
  let history: Operation[];
  try {
    history = draggedHistory(designHistory(session), handle, drag);
  } catch {
    return null;
  }
  return { ...session, pendingChange: { partId: handle.partId, handle, drag, snap, history } };
}

/**
 * A handle of the selected part dragged `movedMm` since it was grabbed, `atGrabMm` along: the
 * change waits, snapped to the parts around it when near them, and otherwise in steps. A
 * waiting change keeps its handle where it was let go, so the drag goes on from the handle as
 * it was before the change. Null when the part's operation cannot take it.
 */
export function dragChange(
  session: CockpitSession,
  shown: Handle,
  atGrabMm: number,
  movedMm: number,
  { shiftHeld, free, snapWithinMm }: HandleModifiers,
): CockpitSession | null {
  const { pendingChange } = session;
  const handle = pendingChange?.handle.id === shown.id ? pendingChange.handle : shown;
  const history = designHistory(session);
  const dragged = { symmetric: symmetricDrag(handle, shiftHeld), changeMm: atGrabMm + movedMm };
  const at = markerIndex(session);
  const toParts = free ? null : snapToParts(history, handle, dragged, snapWithinMm, at);
  if (toParts) return changeInView(session, handle, toParts.drag, toParts.snap);
  return changeInView(session, handle, snappedDrag(history, handle, dragged, free));
}

/** The waiting change set exactly to a value typed in its box, or null when nothing waits. */
export function typedChange(session: CockpitSession, valueMm: number): CockpitSession | null {
  const { pendingChange } = session;
  if (!pendingChange) return null;
  const { handle, drag } = pendingChange;
  const typed = dragFromTyped(designHistory(session), handle, drag, valueMm);
  return changeInView(session, handle, typed);
}

/**
 * A handle of the part about to be added, as it was when grabbed, dragged `movedMm`: the part
 * changes at once, with no box, snapped or in steps. Null when it cannot take that place, so it
 * stays where it last fitted.
 */
export function dragDraft(
  session: CockpitSession,
  draft: Draft,
  handle: Handle,
  movedMm: number,
  { shiftHeld, free, snapWithinMm }: HandleModifiers,
): CockpitSession | null {
  const history = designHistory(session);
  const at = markerIndex(session);
  const shown = withDraft(history, draft, at);
  const dragged = { symmetric: symmetricDrag(handle, shiftHeld), changeMm: movedMm };
  const toParts = free ? null : snapToParts(shown, handle, dragged, snapWithinMm, at + 1);
  const drag = toParts?.drag ?? snappedDrag(shown, handle, dragged, free);
  let placed: Draft;
  try {
    placed = draftEditedBy(history, draft, at, (showing) => draggedHistory(showing, handle, drag));
  } catch {
    return null;
  }
  return placeDraft(session, placed, toParts?.snap ?? null);
}

/** Makes the waiting change an edit of the design, which undo takes back in one step. */
export function confirmChange(session: CockpitSession): CockpitSession {
  const pending = session.pendingChange;
  if (!pending) return session;
  const settled = { ...session, pendingChange: null };
  return pending.drag.changeMm === 0 ? settled : withHistory(settled, pending.history);
}

export const cancelChange = (session: CockpitSession): CockpitSession => ({
  ...session,
  pendingChange: null,
});

/**
 * The handles shown, when nothing else is being measured: those of the part about to be
 * added, or of the selected part; while a change waits, only the handle that made it. A flat
 * view seen along `sightAxis` cannot drag a handle that points at it.
 */
export function shownHandles(session: CockpitSession, sightAxis: Axis | null): Handle[] {
  if (session.measurePicks !== null) return [];
  const pending = session.pendingChange;
  if (pending) return [draggedHandle(pending.handle, pending.drag)];
  const at = markerIndex(session);
  const { draft } = session;
  const handles = draft
    ? partHandles(withDraft(designHistory(session), draft, at), draft.partId, at + 1)
    : handlesOfSelected(session, at);
  return handlesSeenAlong(handles, sightAxis);
}

/**
 * The handles of the selected part, when the mode of the view lets it change. Fitting, a part
 * with an adjustment has only the arrow along its travel, frame or peripheral.
 */
function handlesOfSelected(session: CockpitSession, at: number): Handle[] {
  const partId = selectedPartId(session);
  const operation = selectedOperation(session);
  if (partId === null || !operation) return [];
  const history = designHistory(session);
  const travel = session.fitting ? travelHandles(history, partId, at) : [];
  if (travel.length > 0) return travel;
  if (!changeableInMode(session, operation)) return [];
  return partHandles(history, partId, at);
}

/**
 * Whether the joint markers are shown. They are left out while a part is about to be added,
 * measured or changed by a handle, where a click in the view does something else, and while
 * fitting, which leaves the joints of the frame alone.
 */
export const jointMarkersShown = (session: CockpitSession): boolean =>
  !session.fitting &&
  session.draft === null &&
  session.measurePicks === null &&
  session.pendingChange === null;

/** The joint markers of the design at the marker, when they are shown. */
export function shownJointMarkers(session: CockpitSession): JointMarker[] {
  if (!jointMarkersShown(session)) return [];
  return jointMarkers(designHistory(session), selectedPartId(session), markerIndex(session));
}
