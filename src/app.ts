import {
  steps,
  createProject,
  readProject,
  projectData,
  recordProject,
  replaceCockpitDesign,
} from './project.ts';
import {
  cockpitFileData,
  PARAMETRIC_COCKPIT_FILE_MESSAGE,
  readCockpitFile,
} from './cockpit-file.ts';
import type { CockpitDesign } from './cockpit-design.ts';
import {
  designPanelHTML,
  growPanelHTML,
  NOTHING_AROUND,
  faceOf,
  footChange,
  partChange,
  partField,
  partInspectorHTML,
  type TouchingPart,
} from './cockpit-editor-view.ts';
import {
  addAnchoredProfile,
  addFoot,
  addOperation,
  deleteOperation,
  draftGrowth,
  editDraft,
  editFoot,
  editProfile,
  growthAt,
  makesAPart,
  makesAProfile,
  operationMaking,
  removePart,
  replayDesign,
  type GrowProfile,
  type Operation,
  type ProfileValues,
} from './cad/history.ts';
import type { PartHit } from './cad/picking.ts';
import { measureBetween, nextMeasurePicks, pickInCockpit } from './cad/measure.ts';
import { measureReadout } from './measure-view.ts';
import type { MeasureDrawing } from './render-measurement.ts';
import type { CockpitDrawing } from './render-cad.ts';
import { canRedo, canUndo, noEdits, recordEdit, redo, undo, type Edits } from './undo.ts';
import { creationControls, progressHTML } from './setup-editor.ts';
import { SUMMARY_HEADING, summaryHTML } from './project-summary.ts';
import { normalizeRoom, moveRoomTarget, wallFrame } from './room.ts';
import {
  roomControls,
  roomItem,
  roomItems,
  roomValue,
  isFeature,
  roomTarget,
} from './room-editor.ts';
import {
  clamp,
  round,
  evaluate,
  desktopTargets,
  placeDeskItem,
  updateDeskItem,
  clampEdge,
  deskBounds,
  fieldSpec,
  resizeDesk,
  moveArmJoint,
} from './model.ts';
import { CockpitScene } from './scene.ts';
import type { SceneView } from './scene-camera.ts';
import type { RoomConfig, NumericField } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import type { Project, SetupProgress, StepId } from './project.ts';
import {
  MAX_LAYOUTS,
  MAX_LAYOUT_NAME_LENGTH,
  activeLayout,
  deleteLayout,
  duplicateLayout,
  hiddenFurnitureOf,
  hideFurniture,
  layoutConfig,
  renameLayout,
  selectLayout,
  showFurniture,
  type LayoutLibrary,
} from './layouts.ts';
import {
  activeArmPose,
  armPoseMountMoved,
  chooseMonitorPosition,
  deleteArmPose,
  monitorPositionOf,
  MAX_ARM_POSES,
  saveArmPose,
  updateArmPose,
} from './arm-poses.ts';
import { layoutOptionsHTML } from './layouts-view.ts';
import type { SettingsSection } from './setup-actions.ts';
import { applySetting, type SettingChange } from './setting-change.ts';
import { numericField, booleanSetting, choiceSetting, roomItemType } from './dom-input.ts';
import { validationBanner, metricsView } from './inspector-view.ts';
import {
  sectionOfStep,
  setupButtons,
  nextSetupStep,
  withRoomSize,
  withDesk,
} from './setup-actions.ts';
import {
  addRoomItem,
  canAddRoomItem,
  stepOfRoomItem,
  updateRoomItem,
  deleteRoomItem,
  placeChairAtDesk,
  centerInRoom,
} from './room-actions.ts';
import { deskPanelHTML } from './settings-panels.ts';
import { monitorPositionHTML } from './desk-editor.ts';
import { createProjectStore, STORAGE_KEY } from './project-storage.ts';
import {
  nextThemePreference,
  parseThemePreference,
  resolveTheme,
  THEME_PREFERENCE_LABELS,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme-preference.ts';
import { checkRowHTML } from './check-view.ts';
import { cadChecks } from './cad-checks.ts';
import { partsToBuy } from './cad/parts-to-buy.ts';
import {
  fastenWithBrackets,
  jointsOfPart,
  joinParts,
  setConnector,
  touchingParts,
  type JointOfPart,
} from './cad/fastening.ts';
import { partsToBuyHTML } from './cockpit-parts-view.ts';
import {
  unitFor,
  controlValue as controlValueOf,
  rangeHTML,
  toggleHTML,
  selectHTML,
  type ControlTemplates,
} from './controls-view.ts';

/** The element for `selector`. The markup ships with the app, so a missing one is a bug. */
function $<E extends Element = HTMLElement>(selector: string): E {
  const element = document.querySelector<E>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}
/** An element that only exists in some panels or setup steps. */
const $optional = <E extends Element = HTMLElement>(selector: string): E | null =>
  document.querySelector<E>(selector);
const $$ = <E extends Element = HTMLElement>(selector: string): E[] => [
  ...document.querySelectorAll<E>(selector),
];
/** Elements inside the settings panel, which is rebuilt on every render. */
const controlsAll = <E extends Element = HTMLElement>(selector: string): E[] => [
  ...$('#controls').querySelectorAll<E>(selector),
];
type FieldElement = HTMLInputElement | HTMLSelectElement;
/** A data attribute the markup always sets on this element. */
function dataOf(element: HTMLElement, name: string): string {
  const value = element.dataset[name];
  if (value === undefined) throw new Error(`Missing data-${name} on ${element.tagName}`);
  return value;
}
/** Sets the fill of a range slider, as a percentage of its span. */
const setRangeFill = (slider: HTMLInputElement, percent: number) =>
  slider.style.setProperty('--pct', `${percent}%`);
const paths: Record<string, string> = {
  lock: 'M6 9V6a3 3 0 0 1 6 0v3M4 9h10v7H4z',
  export: 'M10 3h5v5M15 3 8 10M6 4H3v11h11v-3',
  download: 'M9 2v10m-4-4 4 4 4-4M3 13v3h12v-3',
  upload: 'M9 12V2m-4 4 4-4 4 4M3 13v3h12v-3',
  wheel: 'M15.5 9A6.5 6.5 0 1 1 2.5 9a6.5 6.5 0 0 1 13 0ZM3 7l4 1 2 6 2-6 4-1M7 8h4',
  frame: 'M3 14V4h12v10M1 14h16M7 4v10M11 4v10M3 8h12',
  seat: 'M5 2v7l4 3h6v3H8l-5-4V3M7 15v2m7-2v2M12 4v5h4',
  desk: 'M2 5h14v3H2zM4 8v8m10-8v8M4 12h10',
  help: 'M9 16A7 7 0 1 0 9 2a7 7 0 0 0 0 14ZM7 6a2 2 0 1 1 3 2c-1 1-1 1-1 2M9 13h.01',
  reset: 'M3 6a6 6 0 1 1-1 5M3 2v4h4',
  ruler: 'M2 13 13 2l3 3L5 16ZM5 10l2 2m1-5 2 2m1-5 2 2',
  measure: 'M2 4v10m14-10v10M2 9h14M5 7 2 9l3 2m8-4 3 2-3 2',
  person: 'M11.5 4a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM4 16v-4a5 5 0 0 1 10 0v4',
  expand: 'M6 2H2v4m10-4h4v4M2 12v4h4m6 0h4v-4',
  rotate: 'M3 6a6 6 0 1 1 0 7M3 2v4h4M9 5v8m-3-4h6',
  info: 'M9 16A7 7 0 1 0 9 2a7 7 0 0 0 0 14ZM9 8v5M9 5h.01',
  parts: 'M3 3h5v5H3zm7 7h5v5h-5zM3 10h5v5H3zm7-7h5v5h-5z',
  arrow: 'M3 9h12m-5-5 5 5-5 5',
  close: 'm4 4 10 10M14 4 4 14',
  print: 'M5 6V2h8v4M5 13H2V7h14v6h-3M5 10h8v6H5zM13 8h.01',
  themeSystem: 'M9 16A7 7 0 1 0 9 2a7 7 0 0 0 0 14ZM9 2v14M9 5h4M9 9h7M9 13h4',
  themeLight:
    'M12 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 1.5v2m0 11v2M1.5 9h2m11 0h2M3.7 3.7l1.4 1.4m7.8 7.8 1.4 1.4M3.7 14.3l1.4-1.4m7.8-7.8 1.4-1.4',
  themeDark: 'M15.5 11.3A6.5 6.5 0 0 1 6.7 2.5a6.5 6.5 0 1 0 8.8 8.8Z',
  layers: 'M9 2 2 5.5 9 9l7-3.5ZM2 9l7 3.5L16 9M2 12.5 9 16l7-3.5',
  copy: 'M6 6h9v9H6zM3 12V3h9',
  edit: 'M3 15l.8-3.6L12 3.2 14.8 6l-8.2 8.2ZM10.5 4.7l2.8 2.8',
  trash: 'M3 5h12M7 5V3h4v2M5 5l.8 11h6.4L13 5M7.5 8v5m3-5v5',
  undo: 'M6 3 2 7l4 4M2 7h8.5a4.5 4.5 0 0 1 0 9H7',
  redo: 'm12 3 4 4-4 4m4-4H7.5a4.5 4.5 0 0 0 0 9H11',
  plus: 'M9 3v12M3 9h12',
};
function icons(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLElement>('i[data-icon]')
    .forEach(
      (i) =>
        (i.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="${(i.dataset.icon && paths[i.dataset.icon]) || paths.info}"/></svg>`),
    );
}
icons();

// The color theme is a preference of this browser, not part of the design.
const systemPrefersDark = matchMedia('(prefers-color-scheme: dark)');
const THEME_ICONS: Record<ThemePreference, string> = {
  system: 'themeSystem',
  light: 'themeLight',
  dark: 'themeDark',
};
function storedThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}
let themePreference = storedThemePreference();
function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(themePreference, systemPrefersDark.matches);
  const label = THEME_PREFERENCE_LABELS[themePreference];
  const button = $('#themeBtn');
  button.setAttribute('aria-label', `Color theme: ${label}`);
  $('#themeBtn span').textContent = label;
  $('#themeBtn i').dataset.icon = THEME_ICONS[themePreference];
  icons(button);
  const pageColor = getComputedStyle(root).getPropertyValue('--surface-page').trim();
  $('meta[name="theme-color"]').setAttribute('content', pageColor);
  scene?.applyTheme();
}
$('#themeBtn').addEventListener('click', () => {
  themePreference = nextThemePreference(themePreference);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
  applyTheme();
});
systemPrefersDark.addEventListener('change', () => {
  if (themePreference === 'system') applyTheme();
});
const store = createProjectStore(() => window.localStorage);
/**
 * The cockpit editor changes the cockpit design on its own; the room editor arranges the room
 * and places the design in each layout. See docs/adr/0001.
 */
type Editor = 'cockpit' | 'room';
/**
 * The settings sections: the tabs of the room editor, and the design, the cockpit editor's only
 * panel until it has tools of its own.
 */
type Section = SettingsSection | 'furniture' | 'design';
const SECTIONS: readonly string[] = ['room', 'furniture', 'desk', 'design'];
const EDITORS: readonly string[] = ['cockpit', 'room'];
const VIEWS: readonly string[] = ['iso', 'top', 'desk', 'side'];
/** The panels that narrow screens show one at a time, through the studio nav. */
const WORKSPACES = ['view', 'config', 'checks'] as const;
type Workspace = (typeof WORKSPACES)[number];
function sectionOf(value: string): Section {
  if (!SECTIONS.includes(value)) throw new Error(`Unknown section: ${value}`);
  return value as Section;
}
function editorOf(value: string): Editor {
  if (!EDITORS.includes(value)) throw new Error(`Unknown editor: ${value}`);
  return value as Editor;
}
const editorOfSection = (value: Section): Editor => (value === 'design' ? 'cockpit' : 'room');
function viewOf(value: string): SceneView {
  if (!VIEWS.includes(value)) throw new Error(`Unknown view: ${value}`);
  return value as SceneView;
}
function workspaceOf(value: string): Workspace {
  const workspace = WORKSPACES.find((known) => known === value);
  if (!workspace) throw new Error(`Unknown workspace: ${value}`);
  return workspace;
}
function stepOf(value: string): StepId {
  const step = steps.find((s) => s.id === value);
  if (!step) throw new Error(`Unknown setup step: ${value}`);
  return step.id;
}
const isRoomSection = (value: Section) => value === 'room' || value === 'furniture';

const newProject = createProject();
// `state` is the active layout as it is being edited; `cockpit` and `library` keep the cockpit
// design and every layout as last recorded. Saving and exporting record `state` into them first.
let library: LayoutLibrary = newProject.library,
  cockpit: CockpitDesign | null = newProject.cockpit,
  state: RoomConfig = layoutConfig(library),
  setup: SetupProgress = newProject.setup,
  section: Section = 'room',
  /** The tab each editor shows when it opens again. */
  lastSection: Record<Editor, Section> = { cockpit: 'design', room: 'room' },
  view: SceneView = 'top',
  scene: CockpitScene | undefined,
  layoutTarget = '',
  layoutEditing = false,
  /**
   * The arm pose last chosen, saved or updated, or '' for none. A layout opens with the pose its
   * arm is in, so moving the arm afterwards shows that pose as changed.
   */
  selectedArmPose = '',
  /** The step selected in the cockpit editor's history, or null. */
  selectedOperationId: string | null = null,
  /** The history marker: how many steps the view shows, or null to follow the last step. */
  marker: number | null = null,
  /** The edits made to the cockpit design since the project was opened, to undo and redo. */
  designEdits: Edits<CockpitDesign | null> = noEdits(),
  /** A profile about to grow out of the selected one, shown as a preview until it is added. */
  growth: GrowProfile | null = null,
  /**
   * The points clicked so far with the measure tool, or null when it is off. Measurements belong
   * to the session and are never saved.
   */
  measurePicks: PartHit[] | null = null;
const loaded = store.load();
if (loaded.status === 'loaded') {
  openProject(loaded.project);
  setSaveStatus('Design restored from this browser');
} else if (loaded.status === 'unavailable')
  setSaveStatus('This browser blocks saving · export a JSON file', 'error');
/**
 * Explains that the project held a parametric cockpit, which was left out because it is retired
 * (docs/adr/0004). A project restored from this browser keeps the earlier version's saved copy.
 */
function reportLeftOutCockpit({ fromBrowser }: { fromBrowser: boolean }) {
  $('#leftOutCockpitKept').hidden = !fromBrowser;
  $<HTMLDialogElement>('#leftOutCockpitDialog').showModal();
}
if (setup.step === 'complete') view = 'iso';
else section = sectionOfStep(setup.step);
if (setup.step !== 'complete' && state.roomEnabled) layoutEditing = true;
// A project with a cockpit design and no room yet opens where the design is edited.
if (!state.roomEnabled && cockpit !== null) {
  section = 'design';
  view = 'iso';
}
const editor = (): Editor => editorOfSection(section);
/** Whether the project has a cockpit design. */
const hasDesign = (): boolean => cockpit !== null;
/** Whether the cockpit design has parts to show. */
const designHasParts = (): boolean => (cockpit?.history.length ?? 0) > 0;
/** What the scene draws of the cockpit design: only in the cockpit editor, on its own. */
function cockpitDrawing(): CockpitDrawing | null {
  if (editor() !== 'cockpit' || !designHasParts()) return null;
  const history = designHistory();
  const at = markerIndex();
  const shown = growth ? [...history.slice(0, at), growth, ...history.slice(at)] : history;
  const design = replayDesign(shown, growth ? at + 1 : at);
  return {
    resolved: design.resolved,
    connectors: design.connectors,
    selectedPartId: selectedPartId(),
    previewPartId: growth?.partId ?? null,
    measure: measureDrawing(),
  };
}
/** The measurement being taken, in the design the view shows at the history marker. */
function measureDrawing(): MeasureDrawing | null {
  if (measurePicks === null) return null;
  const { resolved } = replayDesign(designHistory(), markerIndex());
  const [first, second] = measurePicks;
  return {
    points: measurePicks.map((pick) => pickInCockpit(resolved, pick)),
    measurement: second === undefined ? null : measureBetween(resolved, first, second),
  };
}
/** Turns the measure tool on, with no points yet, or off. */
function setMeasuring(on: boolean) {
  measurePicks = on ? [] : null;
  if (on) growth = null;
  renderControls();
  refresh();
}
/** What the measure tool shows besides the view: its button, its readout and the cursor. */
function renderMeasure() {
  const on = measurePicks !== null;
  $('#measureBtn').classList.toggle('active', on);
  $('#measureBtn').setAttribute('aria-pressed', String(on));
  $('#viewport').classList.toggle('measuring', on);
  $('#measureReadout').hidden = !on;
  if (measurePicks === null) return;
  $('#measureReadout').textContent = measureReadout(
    measurePicks.length,
    measureDrawing()?.measurement ?? null,
  );
}
/** What the scene and the checks show: the active layout, or the cockpit design on its own. */
const shownConfig = (): RoomConfig => (editor() === 'cockpit' ? NOTHING_AROUND : state);
let evaluation = evaluate(shownConfig());
let pendingSave: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000);
}
function setSaveStatus(message: string, status: 'ok' | 'error' = 'ok') {
  $('#saveStatus').textContent = message;
  $('.save-info').dataset.state = status;
}
/** Makes `project` the open one, editing its active layout. */
function openProject(project: Project) {
  library = project.library;
  cockpit = project.cockpit;
  selectedOperationId = null;
  marker = null;
  designEdits = noEdits();
  measurePicks = null;
  growth = null;
  state = layoutConfig(library);
  selectedArmPose = activeArmPose(state)?.id ?? '';
  setup = project.setup;
}
/** The open project, with the edits to the active layout recorded. */
function recordedProject(): Project {
  ({ cockpit, library } = recordProject({ cockpit, library, setup }, state));
  return { cockpit, library, setup };
}
/** Records the edits, applies `change` to the layouts and opens the resulting active layout. */
function changeLayouts(change: (recorded: LayoutLibrary) => LayoutLibrary) {
  clearTimeout(pendingSave);
  const recorded = recordedProject();
  library = change(recorded.library);
  state = layoutConfig(library);
  selectedArmPose = activeArmPose(state)?.id ?? '';
  if (layoutTarget.startsWith('furniture:') && !roomItem(state, layoutTarget)) layoutTarget = '';
  persist();
  renderControls();
  refresh();
  syncSceneEditing();
}
/** Dragging in the plan arranges the room, so the cockpit editor has nothing to drag. */
function syncSceneEditing() {
  scene?.setPartPicking(editor() === 'cockpit');
  scene?.setLayoutEditing(
    editor() === 'room' && layoutEditing,
    layoutTarget,
    isRoomSection(section),
  );
}
function persist() {
  if (store.save(recordedProject())) setSaveStatus('Saved in this browser');
  else setSaveStatus('Not saved automatically · export a JSON file', 'error');
}
function queueSave() {
  setSaveStatus('Saving…');
  clearTimeout(pendingSave);
  pendingSave = setTimeout(persist, 250);
}
function update(change: SettingChange) {
  state = applySetting(state, change);
  if (change.key.startsWith('room')) state = normalizeRoom(state);
  queueSave();
  refresh();
}
/** The design history, empty without a design. */
const designHistory = (): readonly Operation[] => cockpit?.history ?? [];
/** How many steps the view shows: all of them unless the history marker was moved back. */
const markerIndex = (): number =>
  Math.min(marker ?? designHistory().length, designHistory().length);
/** The selected step, if it is still in the history. */
const selectedOperation = (): Operation | undefined =>
  designHistory().find((operation) => operation.id === selectedOperationId);
/** The part the selected step made, when the view shows it. */
function selectedPartId(): string | null {
  const operation = selectedOperation();
  if (!operation || !makesAPart(operation)) return null;
  const shown = replayDesign(designHistory(), markerIndex()).resolved.has(operation.partId);
  return shown ? operation.partId : null;
}
/** Steps added at the marker push it on, so it stays after them. */
function stepAddedAtMarker() {
  if (marker !== null) marker += 1;
}
/** Makes `next` the cockpit design, as an edit that can be undone, and shows it. */
function changeDesign(next: CockpitDesign) {
  const hadParts = designHasParts();
  designEdits = recordEdit(designEdits, cockpit);
  cockpit = next;
  showChangedDesign(hadParts);
}
/** Shows the design after it changed, framing it when its first part appears. */
function showChangedDesign(hadParts: boolean) {
  growth = null;
  // The parts measured may have moved or gone.
  if (measurePicks !== null) measurePicks = designHasParts() ? [] : null;
  if (!selectedOperation()) selectedOperationId = null;
  if (marker !== null && marker >= designHistory().length) marker = null;
  queueSave();
  renderControls();
  refresh();
  if (!hadParts && designHasParts()) setActiveView(view);
}
function addProfile() {
  const added = addAnchoredProfile(designHistory(), markerIndex());
  selectedOperationId = operationMaking(added.history, added.partId)?.id ?? null;
  stepAddedAtMarker();
  changeDesign({ history: added.history });
}
/** Applies a change to the history; one it refuses is explained and nothing changes. */
function changeHistory(change: (history: readonly Operation[]) => Operation[]): boolean {
  let history: Operation[];
  try {
    history = change(designHistory());
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    renderPartInspector({ force: true });
    return false;
  }
  if (JSON.stringify(history) === JSON.stringify(designHistory())) {
    renderPartInspector({ force: true });
    return false;
  }
  changeDesign({ history });
  return true;
}
/** Changes the operation of the selected step; values it cannot have are explained. */
function editSelectedPart(changes: Partial<ProfileValues>) {
  const operation = selectedOperation();
  if (!operation || !makesAProfile(operation)) return;
  changeHistory((history) => editProfile(history, operation.partId, changes));
}
/** The parts that touch the selected one at the marker without a joint, to join it to. */
function touchingSelected(): TouchingPart[] {
  const partId = selectedPartId();
  if (partId === null) return [];
  const history = designHistory();
  return touchingParts(history, partId, markerIndex()).map((id) => ({
    partId: id,
    name: operationMaking(history, id)?.name ?? id,
  }));
}
/** The joints of the selected part at the marker, with their connectors. */
function jointsOfSelected(): JointOfPart[] {
  const partId = selectedPartId();
  return partId === null ? [] : jointsOfPart(designHistory(), partId, markerIndex());
}
/**
 * Changes the connectors of a joint. A fastening step added goes in at the marker and one
 * deleted before it moves the marker back, so the marker stays after the same steps.
 */
function changeJoints(change: (history: readonly Operation[], at: number) => Operation[]) {
  const history = designHistory();
  const at = markerIndex();
  let next: Operation[];
  try {
    next = change(history, at);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    renderPartInspector({ force: true });
    return;
  }
  if (marker !== null) {
    const before = new Set(history.slice(0, at).map((operation) => operation.id));
    const known = new Set(history.map((operation) => operation.id));
    marker = next.filter((step) => before.has(step.id) || !known.has(step.id)).length;
  }
  changeDesign({ history: next });
}
/** Puts a foot under the selected profile, at the marker, and selects it. */
function addFootUnderSelected() {
  const partId = selectedPartId();
  if (partId === null) return;
  try {
    const added = addFoot(designHistory(), partId, markerIndex());
    selectedOperationId = operationMaking(added.history, added.partId)?.id ?? null;
    stepAddedAtMarker();
    changeDesign({ history: added.history });
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}
/** Removes the selected part from the marker on, as a step of its own. */
function removeSelectedPart() {
  const partId = selectedPartId();
  if (partId === null) return;
  const at = markerIndex();
  const removed = changeHistory((history) => removePart(history, partId, at));
  if (!removed) return;
  stepAddedAtMarker();
  selectedOperationId = null;
  renderControls();
  refresh();
  toast('Part removed from this step on. Delete the step to bring it back.');
}
/** Takes the selected step out of the whole history; what relied on it fails. */
function deleteSelectedStep() {
  const operation = selectedOperation();
  if (!operation) return;
  const index = designHistory().indexOf(operation);
  const at = markerIndex();
  if (!changeHistory((history) => deleteOperation(history, operation.id))) return;
  if (marker !== null && index < at) marker -= 1;
  selectedOperationId = null;
  renderControls();
  refresh();
}
/** Moves the history marker, to show the design at another step. */
function moveMarker(to: number | null) {
  growth = null;
  if (measurePicks !== null) measurePicks = [];
  marker = to === null || to >= designHistory().length ? null : Math.max(0, to);
  const selected = selectedOperation();
  if (selected && designHistory().indexOf(selected) >= markerIndex()) selectedOperationId = null;
  renderControls();
  refresh();
}
function undoDesignEdit() {
  if (growth !== null) {
    cancelGrowth();
    return;
  }
  const hadParts = designHasParts();
  const step = undo(designEdits, cockpit);
  if (!step) return;
  designEdits = step.edits;
  cockpit = step.value;
  showChangedDesign(hadParts);
}
function redoDesignEdit() {
  const hadParts = designHasParts();
  const step = redo(designEdits, cockpit);
  if (!step) return;
  designEdits = step.edits;
  cockpit = step.value;
  showChangedDesign(hadParts);
}
function selectOperation(operationId: string | null) {
  selectedOperationId = operationId;
  growth = null;
  renderControls();
  refresh();
}
/**
 * A click in the view selects the step that made a part, or, while a profile grows, picks the
 * face it grows from.
 */
function pickInView(hit: PartHit | null) {
  if (measurePicks !== null) {
    measurePicks = nextMeasurePicks(measurePicks, hit);
    refresh();
    return;
  }
  if (growth === null) {
    const maker = hit === null ? undefined : operationMaking(designHistory(), hit.partId);
    selectOperation(maker?.id ?? null);
    return;
  }
  if (hit === null || hit.partId !== growth.parentId) return;
  const at = markerIndex();
  changeGrowth((history) => growthAt(history, growthOrFail(), hit.face, hit.pointMm, at));
}
const growthOrFail = (): GrowProfile => {
  if (growth === null) throw new Error('No profile is growing');
  return growth;
};
/** Starts a profile growing out of the selected part, shown as a preview until it is added. */
function startGrowth() {
  const partId = selectedPartId();
  if (partId === null) return;
  measurePicks = null;
  growth = draftGrowth(designHistory(), partId, markerIndex());
  refresh();
}
/** Changes the growing profile; values it cannot have, or a place off its face, are explained. */
function changeGrowth(next: (history: readonly Operation[]) => GrowProfile) {
  const history = designHistory();
  try {
    const changed = next(history);
    addOperation(history, changed, markerIndex());
    growth = changed;
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
  renderPartInspector({ force: true });
  refresh();
}
function confirmGrowth() {
  if (growth === null) return;
  const added = growth;
  const at = markerIndex();
  selectedOperationId = added.id;
  stepAddedAtMarker();
  changeDesign({ history: addOperation(designHistory(), added, at) });
}
function cancelGrowth() {
  growth = null;
  refresh();
}
/**
 * Replaces what `container` shows and gives the focus back to the element that had it, found
 * by its id or by the step it stands for.
 */
function replaceKeepingFocus(container: HTMLElement, html: string) {
  const active = document.activeElement;
  let selector = '';
  if (active instanceof HTMLElement && container.contains(active)) {
    if (active.id) selector = `#${CSS.escape(active.id)}`;
    else if (active.dataset.operation)
      selector = `[data-operation="${CSS.escape(active.dataset.operation)}"]`;
  }
  container.innerHTML = html;
  icons(container);
  if (selector) container.querySelector<HTMLElement>(selector)?.focus();
}
function bindDesignPanel() {
  $optional('#addProfile')?.addEventListener('click', addProfile);
  $optional('#undoEdit')?.addEventListener('click', undoDesignEdit);
  $optional('#redoEdit')?.addEventListener('click', redoDesignEdit);
  $optional('#markerBack')?.addEventListener('click', () => moveMarker(markerIndex() - 1));
  $optional('#markerForward')?.addEventListener('click', () => moveMarker(markerIndex() + 1));
  $optional('#markerEnd')?.addEventListener('click', () => moveMarker(null));
  controlsAll('[data-operation]').forEach((step) =>
    step.addEventListener('click', () => selectOperation(dataOf(step, 'operation'))),
  );
}
/** The inspector HTML last shown, so it is only rebuilt when it changes. */
let shownPartInspector = '';
/** What the checks and the parts to buy last showed, so an open list of items stays open. */
const shownCockpitLists = new Map<HTMLElement, string>();
function showCockpitList(container: HTMLElement, html: string) {
  if (shownCockpitLists.get(container) === html) return;
  container.innerHTML = html;
  shownCockpitLists.set(container, html);
}
/** The checks and the parts to buy of the whole design, wherever the history marker is. */
function renderCockpitChecks() {
  const shown = editor() === 'cockpit' && designHasParts();
  $('#cockpitChecksNote').hidden = editor() !== 'cockpit' || designHasParts();
  $('#cockpitChecksSection').hidden = !shown;
  $('#partsToBuySection').hidden = !shown;
  if (!shown) return;
  const history = designHistory();
  const design = replayDesign(history);
  $('#wholeDesignNote').hidden = markerIndex() === history.length;
  showCockpitList(
    $('#cockpitChecks'),
    cadChecks({ history, ...design })
      .map(checkRowHTML)
      .join(''),
  );
  showCockpitList(
    $('#partsToBuy'),
    partsToBuyHTML(partsToBuy(design.resolved, design.connectors, design.joints)),
  );
}
function renderPartInspector({ force = false } = {}) {
  const body = $('#partInspectorBody');
  const history = designHistory();
  const operation = selectedOperation();
  const growing = growth;
  $('#partInspectorTitle').textContent = growing ? 'New profile' : 'Selected step';
  const failure = operation ? replayDesign(history).failures.get(operation.id) : undefined;
  const html = growing
    ? growPanelHTML(history, growing)
    : partInspectorHTML(history, operation, failure, jointsOfSelected(), touchingSelected());
  if (!force && html === shownPartInspector) return;
  shownPartInspector = html;
  replaceKeepingFocus(body, html);
  const fields = body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-part-field]');
  if (growing) {
    fields.forEach((el) => {
      const field = partField(el.dataset.partField);
      el.addEventListener('change', () =>
        changeGrowth((current) =>
          editDraft(current, growing, partChange(growing, field, el.value)),
        ),
      );
    });
    $('#confirmGrowth').addEventListener('click', confirmGrowth);
    $('#cancelGrowth').addEventListener('click', cancelGrowth);
    return;
  }
  if (!operation) return;
  $('#deleteStep').addEventListener('click', deleteSelectedStep);
  if (!makesAPart(operation)) return;
  fields.forEach((el) => {
    const field = partField(el.dataset.partField);
    el.addEventListener('change', () =>
      operation.kind === 'add-foot'
        ? changeHistory((history) =>
            editFoot(history, operation.partId, footChange(field, el.value)),
          )
        : editSelectedPart(partChange(operation, field, el.value)),
    );
  });
  $optional('#growProfile')?.addEventListener('click', startGrowth);
  $optional('#addFoot')?.addEventListener('click', addFootUnderSelected);
  body.querySelectorAll<HTMLElement>('[data-joint][data-side]').forEach((button) =>
    button.addEventListener('click', () => {
      const side = faceOf(dataOf(button, 'side'));
      const on = button.getAttribute('aria-pressed') !== 'true';
      changeJoints((history, at) => setConnector(history, dataOf(button, 'joint'), side, on, at));
    }),
  );
  body.querySelectorAll<HTMLElement>('[data-join]').forEach((button) =>
    button.addEventListener('click', () => {
      const partId = selectedPartId();
      if (partId === null) return;
      changeJoints((history, at) => joinParts(history, partId, dataOf(button, 'join'), at));
    }),
  );
  body
    .querySelectorAll<HTMLElement>('[data-joint-brackets]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        changeJoints((history, at) =>
          fastenWithBrackets(history, dataOf(button, 'jointBrackets'), at),
        ),
      ),
    );
  $optional('#removePart')?.addEventListener('click', removeSelectedPart);
}
/**
 * Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) undo and redo the design's edits in the cockpit editor.
 * In a text field they keep undoing its typing.
 */
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && measurePicks !== null && !document.querySelector('dialog[open]')) {
    setMeasuring(false);
    return;
  }
  if (event.key === 'Escape' && growth !== null && !document.querySelector('dialog[open]')) {
    cancelGrowth();
    return;
  }
  if (editor() !== 'cockpit' || !(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    return;
  if (document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    undoDesignEdit();
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault();
    redoDesignEdit();
  }
});
// Control templates read the current state and evaluation.
const controlView = () => ({ state, evaluation });
const controlValue = (key: NumericField) => controlValueOf(controlView(), key);
const range: ControlTemplates['range'] = (key, label) => rangeHTML(controlView(), key, label);
const toggle: ControlTemplates['toggle'] = (key, label) => toggleHTML(controlView(), key, label);
const select: ControlTemplates['select'] = (key, label, options) =>
  selectHTML(controlView(), key, label, options);
/** Applies a change to the monitor arm or its saved poses, and redraws the arm controls. */
function changeArm(next: RoomConfig) {
  state = next;
  queueSave();
  renderControls();
  refresh();
}
function roomChanged(redraw = false) {
  state = normalizeRoom(state);
  queueSave();
  if (redraw) renderControls();
  refresh();
}
function selectRoomTarget(target: string) {
  layoutTarget = target;
  layoutEditing = true;
  $('#layoutBtn').classList.add('active');
  $('#layoutBtn').setAttribute('aria-pressed', 'true');
  renderControls();
  scene?.setLayoutEditing(true, target, true);
  setActiveView('top');
}
function changeRoomValue(key: string, value: string | number, redraw = false) {
  state = updateRoomItem(state, layoutTarget, key, value);
  roomChanged(redraw);
}
function syncRoomInputs() {
  if (!isRoomSection(section)) return;
  const item = roomItem(state, layoutTarget),
    mounted = item?.type === 'wallShelf',
    frame =
      item && isFeature(item)
        ? wallFrame(state, item.wall)
        : mounted
          ? wallFrame(state, item.mountWall)
          : null;
  controlsAll<FieldElement>('[data-room-key]').forEach((el) => {
    const key = dataOf(el, 'roomKey'),
      value = roomValue(state, layoutTarget, key);
    if (el instanceof HTMLInputElement && ['number', 'range'].includes(el.type)) {
      const limits =
        key === 'offset' && frame && item
          ? [0, Math.max(0, frame.length - item.width)]
          : key === 'elevation' && mounted
            ? [0, state.roomH]
            : key === 'width' && frame && item && !mounted
              ? [30, item.type === 'wardrobeAccess' ? frame.length : Math.min(300, frame.length)]
              : key === 'height' && frame && !mounted
                ? [30, state.roomH]
                : key === 'sill' && frame && item
                  ? [0, state.roomH - item.height]
                  : key === 'x'
                    ? [-200, state.roomW + 200]
                    : key === 'z'
                      ? [-200, state.roomD + 200]
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

function bindRoomEditor() {
  const roomTargetSelect = $optional<HTMLSelectElement>('#roomTarget');
  roomTargetSelect?.addEventListener('change', () => selectRoomTarget(roomTargetSelect.value));
  controlsAll<FieldElement>('[data-room-key]').forEach((el) => {
    if (el instanceof HTMLSelectElement || (el.type !== 'number' && el.type !== 'range')) {
      el.addEventListener('change', () => changeRoomValue(dataOf(el, 'roomKey'), el.value, true));
      return;
    }
    const key = dataOf(el, 'roomKey');
    const apply = (commit: boolean) => {
      if (el.value.trim() === '' || !Number.isFinite(Number(el.value))) return;
      const raw = Number(el.value);
      if (!commit && (raw < Number(el.min) || raw > Number(el.max))) return;
      const value = round(clamp(raw, Number(el.min), Number(el.max)), 1);
      changeRoomValue(key, value, false);
      if (commit) {
        el.value = String(roomValue(state, layoutTarget, key));
        if (['width', 'height'].includes(key)) renderControls();
      }
    };
    el.addEventListener('input', () => apply(false));
    el.addEventListener('change', () => apply(true));
  });
  controlsAll('[data-room-rotate]').forEach((el) =>
    el.addEventListener('click', () =>
      changeRoomValue(
        'angle',
        ((roomValue(state, layoutTarget, 'angle') as number) +
          Number(dataOf(el, 'roomRotate')) +
          360) %
          360,
      ),
    ),
  );
  controlsAll('[data-add-room]').forEach((el) =>
    el.addEventListener('click', () => {
      const type = roomItemType(el.dataset.addRoom),
        id =
          crypto.randomUUID?.() ||
          'room-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
      const hiddenFurniture = activeLayout(library).hiddenFurniture.length;
      if (!canAddRoomItem(state, type, { hiddenFurniture })) {
        toast('Item limit reached');
        return;
      }
      const added = addRoomItem(state, type, id);
      state = added.state;
      setup = {
        ...setup,
        deferred: setup.deferred.filter((step) => step !== stepOfRoomItem(type)),
      };
      layoutTarget = added.target;
      roomChanged(true);
      selectRoomTarget(layoutTarget);
      toast(
        type === 'wardrobeAccess'
          ? 'Access added. Adjust the doors and the clear space in front.'
          : stepOfRoomItem(type) === 'openings'
            ? 'Opening added. Adjust its wall and size.'
            : 'Furniture added. Drag it in the plan.',
      );
    }),
  );
  $optional('#chairAtDesk')?.addEventListener('click', () => {
    if (roomItem(state, layoutTarget)?.type !== 'chair') return;
    state = placeChairAtDesk(state, layoutTarget);
    roomChanged(true);
    scene?.setLayoutEditing(layoutEditing, layoutTarget, true);
    setActiveView('top');
    toast('Chair placed in front of the desk');
  });
  $optional('#roomHide')?.addEventListener('click', () => {
    const item = roomItem(state, layoutTarget);
    if (!item || isFeature(item)) return;
    changeLayouts((layouts) => hideFurniture(layouts, item.id));
    $('#controls').scrollTop = 0;
    toast('Hidden in this layout. You can show it again from the furniture list.');
  });
  controlsAll('[data-show-furniture]').forEach((el) =>
    el.addEventListener('click', () => {
      const id = dataOf(el, 'showFurniture');
      layoutTarget = `furniture:${id}`;
      changeLayouts((layouts) => showFurniture(layouts, id));
      toast('Back in this layout, where it was');
    }),
  );
  $optional('#roomDelete')?.addEventListener('click', () => {
    if (!roomItem(state, layoutTarget)) return;
    state = deleteRoomItem(state, layoutTarget);
    layoutTarget = 'desk';
    roomChanged(true);
    scene?.setLayoutEditing(layoutEditing, layoutTarget, true);
    toast('Item deleted');
  });
  $optional('#roomFrame')?.addEventListener('click', () => {
    setActiveView('top');
  });
  $optional('#roomCenter')?.addEventListener('click', () => {
    state = centerInRoom(state, evaluation);
    roomChanged(true);
    setActiveView('top');
    toast('Desk centered, with everything on it');
  });
}
function enterStep(id: StepId) {
  setup = { ...setup, step: id };
  section = sectionOfStep(id);
  layoutTarget = id === 'desk' ? 'desk' : '';
  layoutEditing = state.roomEnabled;
  showWorkspace('config');
  switchSection(section);
  persist();
  refresh();
  setActiveView(id === 'desk' && state.deskEnabled ? 'desk' : 'top');
}
function continueSetup(defer = false) {
  const result = nextSetupStep(setup, state, { defer });
  if (result.status === 'needs-room') {
    $optional<HTMLFormElement>('#setupRoomForm')?.reportValidity();
    return;
  }
  if (result.status === 'blocked') return;
  setup = result.setup;
  persist();
  if (setup.step === 'complete') {
    layoutEditing = false;
    switchSection('room');
    showWorkspace('view');
    setActiveView('iso');
    refresh();
    toast('Project ready. You can keep editing each part.');
  } else enterStep(setup.step);
}
function bindCreationControls() {
  for (const [group, prefix] of [
    ['room', 'setupRoom'],
    ['desk', 'setupDesk'],
  ] as const) {
    $optional(`#${prefix}Form`)?.addEventListener('input', () => {
      const draft = {
        w: $<HTMLInputElement>(`#${prefix}W`).value,
        d: $<HTMLInputElement>(`#${prefix}D`).value,
        h: $<HTMLInputElement>(`#${prefix}H`).value,
      };
      setup = { ...setup, drafts: { ...setup.drafts, [group]: draft } };
      queueSave();
    });
  }
  const roomForm = $optional<HTMLFormElement>('#setupRoomForm');
  roomForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!roomForm.reportValidity()) return;
    state = withRoomSize(
      state,
      Number($<HTMLInputElement>('#setupRoomW').value),
      Number($<HTMLInputElement>('#setupRoomD').value),
      Number($<HTMLInputElement>('#setupRoomH').value),
    );
    setup = { ...setup, drafts: { ...setup.drafts, room: undefined } };
    persist();
    continueSetup();
  });
  const deskForm = $optional<HTMLFormElement>('#setupDeskForm');
  deskForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!deskForm.reportValidity()) return;
    state = withDesk(
      state,
      Number($<HTMLInputElement>('#setupDeskW').value),
      Number($<HTMLInputElement>('#setupDeskD').value),
      Number($<HTMLInputElement>('#setupDeskH').value),
    );
    setup = {
      ...setup,
      deferred: setup.deferred.filter((id) => id !== 'desk'),
      drafts: { ...setup.drafts, desk: undefined },
    };
    layoutTarget = 'desk';
    layoutEditing = true;
    persist();
    renderControls();
    refresh();
    scene?.setLayoutEditing(true, layoutTarget, false);
    setActiveView('desk');
  });
}
/** The inspector card that holds an element. */
function inspectorSectionOf(selector: string): HTMLElement {
  const card = $(selector).closest<HTMLElement>('.inspector-section');
  if (!card) throw new Error(`${selector} is not inside an inspector section`);
  return card;
}
function renderWorkflow() {
  const inCockpit = editor() === 'cockpit',
    guided = !inCockpit && setup.step !== 'complete',
    step = steps.find((s) => s.id === setup.step),
    shown = shownConfig();
  const stepLabel = step?.label ?? '';
  document.body.dataset.guided = String(guided);
  document.body.dataset.editor = editor();
  $$('.editor-switch button').forEach((button) => {
    const active = dataOf(button, 'editor') === editor();
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $$<HTMLButtonElement>('.config-tabs button').forEach(
    (tab) => (tab.hidden = dataOf(tab, 'inEditor') !== editor()),
  );
  $('#setupProgress').hidden = !guided;
  $('#setupProgress').innerHTML = guided ? progressHTML(setup) : '';
  $('#setupActions').hidden = !guided;
  $('.config-tabs').hidden = guided || inCockpit;
  renderLayoutPicker(guided || inCockpit);
  $('.cockpit-area').hidden = !inCockpit;
  $('#exportCockpit').hidden = !hasDesign();
  const heading = guided ? stepLabel : inCockpit ? 'Cockpit design' : 'Settings';
  $('.panel-heading h2').textContent = heading;
  $('#controls').setAttribute('aria-label', guided ? (step?.title ?? '') : heading);
  $('#setupGuide').hidden = !guided;
  $('#setupGuideTitle').textContent = step?.title || '';
  $('#setupGuideHint').textContent = step?.hint || '';
  const buttons = setupButtons(setup, state);
  $<HTMLButtonElement>('#setupBack').disabled = buttons.backDisabled;
  $('#setupNext').textContent = buttons.nextLabel;
  $<HTMLButtonElement>('#setupNext').disabled = buttons.nextDisabled;
  $('#setupSkip').hidden = buttons.skipHidden;
  $('#setupSkip').textContent = buttons.skipLabel;
  const hasScene = inCockpit ? designHasParts() : shown.roomEnabled || shown.deskEnabled;
  $('#emptyScene').hidden = hasScene;
  $('#emptySceneTitle').textContent = inCockpit
    ? 'Your cockpit starts here'
    : 'Your space starts here';
  $('#emptySceneHint').textContent = inCockpit
    ? 'Add a profile to start the design.'
    : 'Set up your room to start arranging it.';
  $('[data-view="desk"]').hidden = !shown.deskEnabled;
  $('[data-view="side"]').hidden = !inCockpit;
  $('#inspectorTitle').textContent = inCockpit ? 'Inspector' : 'Checks';
  $('[data-workspace="checks"]').textContent = inCockpit ? 'Inspector' : 'Checks';
  $('#partInspector').hidden = !inCockpit || !designHasParts();
  $('#layoutBtn').hidden = inCockpit;
  $('#measureBtn').hidden = !inCockpit || !designHasParts();
  $<HTMLButtonElement>('#layoutBtn').disabled = !hasScene;
  $('#layoutBtn').classList.toggle('active', layoutEditing);
  $('#layoutBtn').setAttribute('aria-pressed', String(layoutEditing));
  $('#validationBanner').hidden = inCockpit;
  inspectorSectionOf('#deskSizeTag').hidden =
    !shown.deskEnabled || (guided && setup.step !== 'desk');
  inspectorSectionOf('#deskSizeTag').querySelector('h3')!.lastChild!.textContent =
    shown.monitorEnabled ? 'Desk and monitor' : 'Desk';
  inspectorSectionOf('#matTag').hidden =
    !shown.deskEnabled || !evaluation.desktopItems.length || (guided && setup.step !== 'desk');
  $('.reach-card').hidden = !(shown.deskEnabled && shown.monitorEnabled);
  $('#editArmBtn').hidden = !(shown.deskEnabled && shown.monitorEnabled);
  const metrics = $$('.metrics>div');
  metrics[0].hidden = !shown.roomEnabled;
  metrics[1].hidden = !shown.deskEnabled;
  $('.scene-legend').hidden = !shown.deskEnabled;
  $('.metrics').hidden = !shown.roomEnabled && !shown.deskEnabled;
  $('.scene-badge').hidden = !hasScene;
  $('.viewport-note').hidden = !hasScene;
  $('.view-toolbar').hidden = !hasScene;
  $('.build-note').hidden = !hasScene;
  const sceneTitle = guided ? stepLabel : inCockpit ? 'Cockpit design' : 'Your room';
  $('#sceneTitle').textContent =
    !guided && !inCockpit && library.layouts.length > 1
      ? `${sceneTitle} · ${activeLayout(library).name}`
      : sceneTitle;
}
/** The layout picker appears in the room editor once the guided setup is done. */
function renderLayoutPicker(hidden: boolean) {
  $('#layoutArea').hidden = hidden;
  const select = $<HTMLSelectElement>('#layoutSelect');
  const options = layoutOptionsHTML(library);
  if (select.innerHTML !== options) select.innerHTML = options;
  select.value = library.activeLayoutId;
  $('#layoutHint').hidden = library.layouts.length > 1;
  $<HTMLButtonElement>('#deleteLayout').disabled = library.layouts.length === 1;
  $<HTMLButtonElement>('#duplicateLayout').disabled = library.layouts.length >= MAX_LAYOUTS;
}
function renderControls() {
  const guided = editor() === 'room' && setup.step !== 'complete',
    stage = guided ? setup.step : section === 'furniture' ? 'furniture' : 'openings';
  if ((stage === 'openings' || stage === 'furniture') && isRoomSection(section)) {
    const items = roomItems(state, stage);
    if (!items.some((v) => roomTarget(v) === layoutTarget))
      layoutTarget = items[0] ? roomTarget(items[0]) : '';
  }
  if (
    section === 'desk' &&
    !evaluation.desktopItems.some((i) => i.id === layoutTarget) &&
    layoutTarget !== 'desk'
  )
    layoutTarget = 'desk';
  let html = '';
  if (editor() === 'cockpit') {
    html = designPanelHTML({
      history: designHistory(),
      marker: markerIndex(),
      selectedOperationId,
      failures: replayDesign(designHistory()).failures,
      canUndo: canUndo(designEdits),
      canRedo: canRedo(designEdits),
    });
  } else if (guided || (section === 'desk' && state.deskEnabled === false)) {
    html = creationControls(
      state,
      evaluation,
      guided ? setup : { ...setup, step: 'desk' },
      layoutTarget,
      { range, toggle, select },
      selectedArmPose,
    );
  } else if (isRoomSection(section)) {
    html = roomControls(state, evaluation, layoutTarget, range, toggle, {
      mode: section === 'furniture' ? 'furniture' : 'room',
      hiddenFurniture: hiddenFurnitureOf(library),
      layoutCount: library.layouts.length,
    });
  } else {
    html = deskPanelHTML(controlView(), layoutTarget, selectedArmPose);
  }
  if (editor() === 'cockpit') replaceKeepingFocus($('#controls'), html);
  else $('#controls').innerHTML = html;
  bindDesignPanel();
  bindRoomEditor();
  bindCreationControls();
  $optional('#startWithCockpit')?.addEventListener('click', startWithCockpit);
  $optional('#goRoom')?.addEventListener('click', () => {
    switchSection('room');
    setActiveView('top');
  });
  // Diagonal uses inches rather than world units.
  for (const node of $$('[data-key="monitorInches"]')) {
    const wrap = node.closest('.control');
    if (wrap) {
      wrap.querySelector('.number-wrap span')!.textContent = '″';
      wrap.querySelector('.control-range-label span:last-child')!.textContent = '49 ″';
      node.setAttribute('aria-label', 'Screen diagonal in inches');
    }
  }
  controlsAll<HTMLInputElement>('input[type=range][data-key]').forEach((el) =>
    el.addEventListener('input', () => {
      const key = numericField(el.dataset.key);
      const val = Number(el.value);
      setRangeFill(el, ((val - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100);
      $<HTMLInputElement>(`#${key}-number`).value = String(val);
      update({ kind: 'number', key, value: val });
    }),
  );
  controlsAll<HTMLInputElement>('input[data-number]').forEach((el) => {
    const key = numericField(el.dataset.key);
    const applyNumber = (commit: boolean) => {
      const [min, max, step] = fieldSpec(key, state);
      if (el.value.trim() === '' || !Number.isFinite(Number(el.value))) {
        if (commit) el.value = String(round(controlValue(key), 1));
        return;
      }
      const raw = Number(el.value);
      if (!commit && (raw < min || raw > max)) return;
      const val = round(clamp(Math.round(raw / step) * step, min, max));
      if (commit) el.value = String(val);
      const slider = $<HTMLInputElement>(`#${key}-range`);
      slider.value = String(val);
      setRangeFill(slider, ((val - min) / (max - min)) * 100);
      if (
        controlValue(key) !== val ||
        (['armBaseAngle', 'armElbowAngle', 'monitorYaw'].includes(key) &&
          state.monitorMode !== 'manual')
      )
        update({ kind: 'number', key, value: val });
      if (commit) el.value = String(round(controlValue(key), 1));
    };
    el.addEventListener('input', () => applyNumber(false));
    el.addEventListener('change', () => applyNumber(true));
    el.addEventListener('blur', () => applyNumber(true));
  });
  controlsAll<HTMLInputElement>('input[type=checkbox]').forEach((el) =>
    el.addEventListener('change', () => {
      const key = booleanSetting(el.dataset.key);
      update({ kind: 'toggle', key, value: el.checked });
      if (key.endsWith('Enabled')) renderControls();
    }),
  );
  controlsAll<HTMLSelectElement>('select[data-key]').forEach((el) =>
    el.addEventListener('change', () => {
      const key = choiceSetting(el.dataset.key);
      update({ kind: 'choice', key, value: el.value });
      if (key === 'clampMount' || key === 'monitorMode') renderControls();
    }),
  );
  const layoutTargetSelect = $optional<HTMLSelectElement>('#layoutTargetSelect');
  layoutTargetSelect?.addEventListener('change', () => {
    layoutTarget = layoutTargetSelect.value;
    layoutEditing = true;
    renderControls();
    renderWorkflow();
    scene?.setLayoutEditing(true, layoutTarget, false);
    setActiveView(desktopTargets.some((t) => t.id === layoutTarget) ? 'desk' : 'top');
  });
  controlsAll('[data-rotate]').forEach((button) =>
    button.addEventListener('click', () => {
      const key = numericField(layoutTarget + 'Angle');
      const value = (state[key] + Number(dataOf(button, 'rotate')) + 360) % 360;
      update({ kind: 'number', key, value });
      renderControls();
    }),
  );
  const armPoseName = $optional<HTMLInputElement>('#armPoseName');
  const saveCurrentArmPose = () => {
    try {
      const next = saveArmPose(state, armPoseName?.value);
      selectedArmPose = activeArmPose(next)?.id ?? '';
      changeArm(next);
      toast('Pose saved in this layout.');
    } catch {
      toast(
        `A layout keeps up to ${MAX_ARM_POSES} poses. Delete one, or save under an existing name.`,
      );
    }
  };
  $optional('#saveArmPose')?.addEventListener('click', saveCurrentArmPose);
  armPoseName?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') saveCurrentArmPose();
  });
  controlsAll('#armDragBtn,#armControlsDragBtn').forEach((button) =>
    button.addEventListener('click', startArmEditing),
  );
  const clampEdgeSelect = $optional<HTMLSelectElement>('#clampEdgeSelect');
  clampEdgeSelect?.addEventListener('change', () => {
    const edge = clampEdgeSelect.value;
    if (edge !== 'xmin' && edge !== 'xmax' && edge !== 'zmin' && edge !== 'zmax')
      throw new Error(`Unknown desk edge: ${edge}`);
    state.clampSide = edge;
    const b = deskBounds(state);
    if (edge === 'xmin' || edge === 'xmax') state.clampX = edge === 'xmin' ? -b.anchorX : b.anchorX;
    else state.clampZ = edge === 'zmin' ? -b.anchorZ : b.anchorZ;
    persist();
    renderControls();
    refresh();
  });
  const deskSizePresetSelect = $optional<HTMLSelectElement>('#deskSizePreset');
  deskSizePresetSelect?.addEventListener('change', () => {
    if (deskSizePresetSelect.value === 'custom') return;
    const [width, depth] = deskSizePresetSelect.value.split('x').map(Number);
    state = resizeDesk(state, width, depth);
    persist();
    renderControls();
    refresh();
    setActiveView('desk');
    toast(`${width} × ${depth} cm desktop applied`);
  });
  const matPresetSelect = $optional<HTMLSelectElement>('#matPreset');
  matPresetSelect?.addEventListener('change', () => {
    if (matPresetSelect.value === 'custom') return;
    const [width, depth] = matPresetSelect.value.split('x').map(Number);
    state = updateDeskItem({ ...state, matWidth: width }, 'matDepth', depth);
    persist();
    renderControls();
    refresh();
  });
}
function switchSection(value: Section) {
  const editorChanged = editorOfSection(value) !== editor();
  if (editorChanged) measurePicks = null;
  section = value;
  lastSection[editor()] = value;
  // The other editor shows another configuration, so the panels need its evaluation.
  if (editorChanged) evaluation = evaluate(shownConfig());
  if (
    value === 'desk' &&
    (layoutTarget.startsWith('feature:') || layoutTarget.startsWith('furniture:'))
  )
    layoutTarget = 'desk';
  if (value === 'room' && !roomItem(state, layoutTarget) && layoutTarget !== 'desk')
    layoutTarget = 'desk';
  $$<HTMLButtonElement>('.config-tabs button').forEach((b) => {
    const active = dataOf(b, 'section') === section;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  $('#controls').setAttribute('aria-labelledby', `tab-${value}`);
  renderControls();
  if (editorChanged) refresh();
  else renderWorkflow();
  $('#controls').scrollTop = 0;
  syncSceneEditing();
}
/** Opens an editor at `target`, or at the tab it showed last, framing what it shows. */
function showEditor(next: Editor, target: Section = lastSection[next]) {
  const changed = next !== editor();
  switchSection(target);
  if (changed) setActiveView(next === 'cockpit' || setup.step === 'complete' ? 'iso' : 'top');
}
$$('.editor-switch button').forEach((button) =>
  button.addEventListener('click', () => showEditor(editorOf(dataOf(button, 'editor')))),
);
/** What each monitor position area shows, so it is only rewritten when that changes. */
const shownMonitorPositions = new WeakMap<Element, string>();
function refreshMonitorPosition() {
  const area = $optional('#monitorPositionArea');
  if (!area) return;
  const html = monitorPositionHTML(state, selectedArmPose);
  if (shownMonitorPositions.get(area) === html) return;
  area.innerHTML = html;
  shownMonitorPositions.set(area, html);
}
function refresh() {
  const shown = shownConfig();
  evaluation = evaluate(shown);
  const e = evaluation;
  syncRoomInputs();
  $('#roomInspector').hidden = shown.roomEnabled === false;
  $('#roomSizeTag').textContent = `${state.roomW} × ${state.roomD}`;
  $('#roomChecks').innerHTML = [...e.extra.filter((c) => c.id === 'room'), ...e.room.checks]
    .map(checkRowHTML)
    .join('');
  $('#desktopChecks').innerHTML = e.desktopChecks.map(checkRowHTML).join('');
  $('#matTag').textContent = `${state.matWidth} × ${state.matDepth}`;
  $('#deskSizeTag').textContent = `${state.deskWidth} × ${state.deskDepth}`;
  const sizeSelect = $optional<HTMLSelectElement>('#deskSizePreset');
  if (sizeSelect) {
    const value = `${state.deskWidth}x${state.deskDepth}`;
    sizeSelect.value = [...sizeSelect.options].some((o) => o.value === value) ? value : 'custom';
  }
  controlsAll<FieldElement>('[data-key]').forEach((el) => {
    if (!(el instanceof HTMLInputElement)) return;
    if (el.matches('input[type=range]') || el.hasAttribute('data-number')) {
      const key = numericField(el.dataset.key);
      const [min, max, step] = fieldSpec(key, state);
      el.min = String(min);
      el.max = String(max);
      el.step = String(step);
      if (el.matches('input[type=range]')) {
        el.value = String(controlValue(key));
        setRangeFill(el, ((controlValue(key) - min) / (max - min)) * 100);
        const labels = el.closest('.control')!.querySelectorAll('.control-range-label span');
        labels[0].textContent = String(min);
        labels[1].textContent = `${max} ${unitFor(key)}`;
      } else if (el !== document.activeElement) el.value = String(round(controlValue(key), 1));
    }
  });

  const mode = $optional<HTMLSelectElement>('#monitorMode');
  if (mode) mode.value = state.monitorMode;
  const bend = $optional<HTMLSelectElement>('#armBend');
  if (bend) bend.value = state.armBend;
  refreshMonitorPosition();
  const lengths = $optional('#armLengths');
  if (lengths)
    lengths.textContent = `First segment: ${round(e.armPose.first)} cm · second segment: ${round(e.armPose.second)} cm. An elbow at 0° keeps the arm straight; ±180° folds it.`;
  const coordinateHint = $optional('[data-desktop-hint]');
  if (coordinateHint)
    coordinateHint.innerHTML = `Reference: the center of the desktop, which turns with the desk. X runs along its ${state.deskDepth} cm depth; Z along its ${state.deskWidth} cm width. Select and drag in the <b>Desk</b> or <b>Top</b> views. You can also type the position and rotation here.`;
  $('#spaceChecks').innerHTML = [
    ...e.spaceCheck,
    ...e.extra.filter((c) => c.id !== 'room' && c.level !== 'ok'),
  ]
    .map(checkRowHTML)
    .join('');
  const banner = validationBanner(shown, e);
  $('#validationBanner').className = banner.className;
  $('#validationBanner').innerHTML = banner.html;
  $('#reachValue').textContent = `${Math.round(e.reach)} / ${state.armReach} cm`;
  $('#reachMax').textContent = `Max. ${state.armReach} cm`;
  $('#reachMeter').style.width = `${Math.min(100, (e.reach / state.armReach) * 100)}%`;
  $('#reachMeter').classList.toggle('over', e.reach > state.armReach);
  const metrics = metricsView(shown, e);
  $('#metricFootprint').innerHTML = metrics.footprintHTML;
  $('#metricSpace').innerHTML = metrics.spaceHTML;
  renderWorkflow();
  renderPartInspector();
  renderCockpitChecks();
  renderMeasure();
  scene?.update(shown, evaluation, cockpitDrawing());
}
function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type }),
    a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/** Explains that the saved design could not be read and where it is kept. */
function reportUnreadableSave(keptAs: string, text: string) {
  $('#unreadableKept').textContent =
    keptAs === STORAGE_KEY
      ? `it stays in this browser, and automatic saving is off so that nothing replaces it. Export a JSON file to keep new changes.`
      : `it stays in this browser as "${keptAs}", and new changes are saved separately.`;
  $('#downloadUnreadable').onclick = () =>
    download('cockpit-lab-unreadable-design.json', text, 'application/json');
  $<HTMLDialogElement>('#unreadableDialog').showModal();
  setSaveStatus('The saved design could not be opened · it was kept', 'error');
}
function exportConfig() {
  download(
    'cockpit-lab-design.json',
    JSON.stringify(projectData(recordedProject()), null, 2),
    'application/json',
  );
  toast('JSON exported. Use Open JSON to bring this design back.');
}
function summary() {
  $('#summaryTitle').textContent = SUMMARY_HEADING.title;
  $('#summaryDialog .section-kicker').textContent = SUMMARY_HEADING.kicker;
  $('#summaryContent').innerHTML = summaryHTML(state, evaluation, setup);
  $<HTMLDialogElement>('#summaryDialog').showModal();
}
$$('.config-tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    const tab = sectionOf(dataOf(b, 'section'));
    switchSection(tab);
    if (isRoomSection(tab)) {
      layoutEditing = true;
      $('#layoutBtn').classList.add('active');
      $('#layoutBtn').setAttribute('aria-pressed', 'true');
      scene?.setLayoutEditing(true, layoutTarget, true);
      setActiveView('top');
    }
  }),
);
$('.config-tabs').addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const tabs = $$<HTMLButtonElement>('.config-tabs button:not([hidden])'),
      i = tabs.findIndex((t) => dataOf(t, 'section') === section),
      next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
    tabs[next].focus();
  }
});
const layoutSelect = $<HTMLSelectElement>('#layoutSelect');
layoutSelect.addEventListener('change', () => {
  const id = layoutSelect.value;
  changeLayouts((layouts) => selectLayout(layouts, id));
  toast(`Showing the layout ${activeLayout(library).name}`);
});
type LayoutNameAction = 'duplicate' | 'rename';
let layoutNameAction: LayoutNameAction = 'duplicate';
function askLayoutName(action: LayoutNameAction) {
  layoutNameAction = action;
  const current = activeLayout(library).name;
  const input = $<HTMLInputElement>('#layoutName');
  $('#layoutNameTitle').textContent = action === 'duplicate' ? 'Duplicate layout' : 'Rename layout';
  $('#confirmLayoutName').textContent = action === 'duplicate' ? 'Duplicate' : 'Rename';
  $('#layoutNameDescription').hidden = action !== 'duplicate';
  input.value =
    action === 'duplicate' ? `${current} (copy)`.slice(0, MAX_LAYOUT_NAME_LENGTH) : current;
  $<HTMLDialogElement>('#layoutNameDialog').showModal();
  input.select();
}
$('#duplicateLayout').addEventListener('click', () => askLayoutName('duplicate'));
$('#renameLayout').addEventListener('click', () => askLayoutName('rename'));
$('#layoutNameForm').addEventListener('submit', () => {
  const name = $<HTMLInputElement>('#layoutName').value;
  if (layoutNameAction === 'duplicate') {
    changeLayouts((layouts) => duplicateLayout(layouts, name));
    toast('Layout duplicated. Your changes now go to the copy.');
  } else {
    changeLayouts((layouts) => renameLayout(layouts, layouts.activeLayoutId, name));
    toast('Layout renamed');
  }
});
$('#deleteLayout').addEventListener('click', () =>
  $<HTMLDialogElement>('#deleteLayoutDialog').showModal(),
);
$('#confirmDeleteLayout').addEventListener('click', () => {
  const deleted = activeLayout(library).name;
  changeLayouts((layouts) => deleteLayout(layouts, layouts.activeLayoutId));
  $<HTMLDialogElement>('#deleteLayoutDialog').close();
  toast(`Layout ${deleted} deleted`);
});
$('#resetBtn').addEventListener('click', () => $<HTMLDialogElement>('#resetDialog').showModal());
/** Opens a new, empty project where the user chose to start it: the cockpit or the room. */
function startNewProject(start: Editor) {
  openProject(createProject());
  layoutTarget = '';
  layoutEditing = false;
  clearTimeout(pendingSave);
  persist();
  $<HTMLDialogElement>('#resetDialog').close();
  if (start === 'room') {
    enterStep('room');
    toast('New project. Start with your room.');
    return;
  }
  startWithCockpit();
  toast('New project. Its cockpit design starts empty.');
}
/** Opens the cockpit editor to design first; the room setup waits where it was. */
function startWithCockpit() {
  showEditor('cockpit', 'design');
  refresh();
  showWorkspace('config');
}
$('#newProjectRoom').addEventListener('click', () => startNewProject('room'));
$('#newProjectCockpit').addEventListener('click', () => startNewProject('cockpit'));
function setActiveView(next: SceneView) {
  view = next;
  $$('[data-view]').forEach((t) => {
    const active = dataOf(t, 'view') === view;
    t.classList.toggle('active', active);
    t.setAttribute('aria-pressed', String(active));
  });
  scene?.setView(view);
  $('.viewport-note span').textContent =
    editor() === 'cockpit'
      ? `Click a part to select it · ${view === 'iso' ? 'drag to orbit' : 'drag to pan'} · scroll to zoom`
      : view === 'iso'
        ? 'Drag to orbit · scroll to zoom'
        : (view === 'top' || view === 'desk') && layoutEditing
          ? layoutTarget === 'arm'
            ? 'Drag ELBOW or VESA · mount on the desktop'
            : 'Drag an item · select and turn it in ' + (isRoomSection(section) ? 'Room' : 'Desk')
          : 'Scroll to zoom · drag to pan';
}
$$('[data-view]').forEach((b) =>
  b.addEventListener('click', () => setActiveView(viewOf(dataOf(b, 'view')))),
);
$('#layoutBtn').addEventListener('click', () => {
  layoutEditing = !layoutEditing;
  $('#layoutBtn').classList.toggle('active', layoutEditing);
  $('#layoutBtn').setAttribute('aria-pressed', String(layoutEditing));
  syncSceneEditing();
  if (layoutEditing) {
    if (setup.step === 'complete' && !isRoomSection(section)) switchSection('desk');
    setActiveView(desktopTargets.some((t) => t.id === layoutTarget) ? 'desk' : 'top');
  } else setActiveView(view);
});
$('#dimensionBtn').addEventListener('click', () => {
  const on = $('#dimensionBtn').getAttribute('aria-pressed') !== 'true';
  $('#dimensionBtn').setAttribute('aria-pressed', String(on));
  $('#dimensionBtn').setAttribute('aria-label', on ? 'Hide dimensions' : 'Show dimensions');
  $('#dimensionBtn').classList.toggle('active', on);
  scene?.setDimensions(on);
});
$('#measureBtn').addEventListener('click', () => setMeasuring(measurePicks === null));
$('#fitBtn').addEventListener('click', () => scene?.setView(view));
function focusArmControls() {
  const panel = $('#controls'),
    arm = $optional('#armControls') || $optional('#monitorPositionControls');
  if (arm) panel.scrollTop += arm.getBoundingClientRect().top - panel.getBoundingClientRect().top;
}
function showWorkspace(next: Workspace) {
  document.body.dataset.workspace = next;
  $$('.studio-nav button').forEach((button) => {
    const active = dataOf(button, 'workspace') === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
$$('.studio-nav button').forEach((button) =>
  button.addEventListener('click', () => showWorkspace(workspaceOf(dataOf(button, 'workspace')))),
);
$('.skip-link').addEventListener('click', () => showWorkspace('config'));
function startArmEditing() {
  layoutTarget = 'arm';
  layoutEditing = true;
  $('#layoutBtn').classList.add('active');
  $('#layoutBtn').setAttribute('aria-pressed', 'true');
  switchSection('desk');
  showWorkspace('view');
  scene?.setLayoutEditing(true, 'arm');
  setActiveView('top');
  focusArmControls();
  toast('Drag ELBOW or VESA; you can also use their rotation controls.');
}
$('#editArmBtn').addEventListener('click', startArmEditing);
$('#adjustRoom').addEventListener('click', () => {
  $('#tab-room').click();
  showWorkspace('config');
});
$('#adjustDesk').addEventListener('click', () => {
  switchSection('desk');
  showWorkspace('config');
});
$('#adjustDesktop').addEventListener('click', () => {
  layoutTarget = 'arm';
  switchSection('desk');
  showWorkspace('config');
  syncSceneEditing();
  setActiveView('desk');
});
$('#helpBtn').addEventListener('click', () => $<HTMLDialogElement>('#helpDialog').showModal());
$('#openSummary').addEventListener('click', summary);
$$('[data-close]').forEach((b) =>
  b.addEventListener('click', () => $<HTMLDialogElement>(`#${dataOf(b, 'close')}`).close()),
);
$$<HTMLDialogElement>('dialog').forEach((d) =>
  d.addEventListener('click', (ev) => {
    if (ev.target === d) {
      const r = d.getBoundingClientRect();
      if (
        ev.clientX < r.left ||
        ev.clientX > r.right ||
        ev.clientY < r.top ||
        ev.clientY > r.bottom
      )
        d.close();
    }
  }),
);
$('#saveConfig').addEventListener('click', exportConfig);
$('#printBtn').addEventListener('click', () => window.print());
// The monitor position is redrawn as the arm moves, so its controls are handled here, once.
$('#controls').addEventListener('change', (event) => {
  if (event.target instanceof HTMLSelectElement && event.target.id === 'monitorPosition')
    chooseMonitorPositionOf(event.target.value);
});
$('#controls').addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('#updateArmPose')) updateSelectedArmPose();
  if (event.target.closest('#deleteArmPose')) deleteSelectedArmPose();
});
function chooseMonitorPositionOf(choice: string) {
  const poseId = choice.startsWith('pose:') ? choice.slice('pose:'.length) : '';
  selectedArmPose = poseId;
  changeArm(chooseMonitorPosition(state, choice));
  const pose = state.armPoses.find((candidate) => candidate.id === poseId);
  if (pose && armPoseMountMoved(state, pose))
    toast(
      `${pose.name} was saved with the arm mounted elsewhere, so the monitor is not where it was.`,
    );
}
/** The pose the monitor position shows, if it shows one. */
function shownArmPose() {
  const { choice } = monitorPositionOf(state, selectedArmPose);
  return state.armPoses.find((pose) => choice === `pose:${pose.id}`);
}
function updateSelectedArmPose() {
  const pose = shownArmPose();
  if (!pose) return;
  changeArm(updateArmPose(state, pose.id));
  toast(`Pose ${pose.name} updated.`);
}
function deleteSelectedArmPose() {
  const pose = shownArmPose();
  if (!pose) return;
  selectedArmPose = '';
  changeArm(deleteArmPose(state, pose.id));
  toast(`Pose ${pose.name} deleted.`);
}
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#loadConfig').addEventListener('click', () => $('#importFile').click());
/** Generous for a full project: 20 layouts of 30 pieces of furniture export to about 100 kB. */
const MAX_PROJECT_FILE_BYTES = 500_000;
const importFile = $<HTMLInputElement>('#importFile');
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('File too large');
    const data: unknown = JSON.parse(await file.text());
    if (isCockpitFile(data)) {
      toast('This is a cockpit file: import it from the Cockpit editor.');
      return;
    }
    const opened = readProject(data);
    openProject(opened.project);
    persist();
    renderControls();
    refresh();
    $<HTMLDialogElement>('#summaryDialog').close();
    if (!state.roomEnabled && hasDesign()) startWithCockpit();
    else if (setup.step !== 'complete') enterStep(setup.step);
    else {
      switchSection('room');
      setActiveView('iso');
    }
    if (opened.parametricCockpitLeftOut) reportLeftOutCockpit({ fromBrowser: false });
    else toast('Design loaded');
  } catch {
    toast('Could not load the file: use a JSON file exported by Cockpit Lab.');
  } finally {
    importFile.value = '';
  }
});
/** Whether a file is a cockpit file rather than a project, from its own description. */
const isCockpitFile = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && 'kind' in data && data.kind === 'cockpit';
$('#exportCockpit').addEventListener('click', () => {
  if (cockpit === null) return;
  download(
    'cockpit-lab-cockpit.json',
    JSON.stringify(cockpitFileData(cockpit), null, 2),
    'application/json',
  );
  toast('Cockpit file exported. Import it from the Cockpit editor of another project.');
});
const importCockpitFile = $<HTMLInputElement>('#importCockpitFile');
$('#importCockpit').addEventListener('click', () => importCockpitFile.click());
/** A design read from a cockpit file, waiting for the user to confirm it replaces theirs. */
let importedDesign: CockpitDesign | null = null;
importCockpitFile.addEventListener('change', async () => {
  const file = importCockpitFile.files?.[0];
  if (!file) return;
  try {
    if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('File too large');
    const design = readCockpitFile(JSON.parse(await file.text()));
    if (hasDesign()) {
      importedDesign = design;
      $<HTMLDialogElement>('#replaceCockpitDialog').showModal();
    } else useImportedDesign(design);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    toast(
      message === 'This is not a cockpit file'
        ? 'This is a project file: open it with Open JSON.'
        : message === PARAMETRIC_COCKPIT_FILE_MESSAGE
          ? 'This cockpit file holds a cockpit of the retired configurator, which is not converted. Design it again from parts.'
          : 'Could not import the file: use a cockpit file exported by Cockpit Lab.',
    );
  } finally {
    importCockpitFile.value = '';
  }
});
$('#confirmReplaceCockpit').addEventListener('click', () => {
  $<HTMLDialogElement>('#replaceCockpitDialog').close();
  if (importedDesign) useImportedDesign(importedDesign);
  importedDesign = null;
});
/** Makes an imported design the project's, in the cockpit editor and in the room. */
function useImportedDesign(design: CockpitDesign) {
  clearTimeout(pendingSave);
  openProject(replaceCockpitDesign(recordedProject(), design));
  persist();
  renderControls();
  refresh();
  setActiveView('iso');
  toast('Cockpit file imported.');
}
window.addEventListener('pagehide', () => {
  clearTimeout(pendingSave);
  persist();
});
$('#setupProgress').addEventListener('click', (event) => {
  const button =
    event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-step]') : null;
  if (button && !button.disabled) enterStep(stepOf(dataOf(button, 'step')));
});
$('#setupBack').addEventListener('click', () => {
  const index = steps.findIndex((s) => s.id === setup.step);
  if (index > 0) enterStep(steps[index - 1].id);
});
$('#setupNext').addEventListener('click', () => {
  if (setup.step === 'room') $optional<HTMLFormElement>('#setupRoomForm')?.requestSubmit();
  else continueSetup();
});
$('#setupSkip').addEventListener('click', () => continueSetup(true));
$('#newProject').addEventListener('click', () => $<HTMLDialogElement>('#resetDialog').showModal());
if (setup.step !== 'complete') showWorkspace('config');
renderControls();
refresh();
if (loaded.status === 'unreadable') reportUnreadableSave(loaded.keptAs, loaded.text);
if (loaded.status === 'loaded' && loaded.parametricCockpitLeftOut)
  reportLeftOutCockpit({ fromBrowser: true });
try {
  scene = new CockpitScene($('#viewport'), $('#sceneLabels'));
  scene.update(shownConfig(), evaluation, cockpitDrawing());
  setActiveView(view);
  syncSceneEditing();
  scene.onPartPick = pickInView;
  scene.onArmMove = (joint, x, z) => {
    state = moveArmJoint(state, joint, x, z);
    queueSave();
    refresh();
  };
  scene.onLayoutSelect = (target) => {
    layoutTarget = target;
    if (setup.step === 'complete') {
      switchSection(
        target.startsWith('furniture:') || roomItem(state, target)?.type === 'wardrobeAccess'
          ? 'furniture'
          : target.startsWith('feature:')
            ? 'room'
            : 'desk',
      );
    } else if (section === 'desk' || isRoomSection(section)) renderControls();
    syncSceneEditing();
  };
  scene.onLayoutMove = (target, x, z) => {
    const item = desktopTargets.find((t) => t.id === target),
      previousEdge = clampEdge(state);
    if (target.startsWith('feature:') || target.startsWith('furniture:'))
      state = moveRoomTarget(state, target, x, z);
    else if (item) state = placeDeskItem(state, item.id, x, z);
    else {
      state[numericField(target + 'X')] = round(clamp(x, -1500, 1500));
      state[numericField(target + 'Z')] = round(clamp(z, -1500, 1500));
    }
    queueSave();
    if (target === 'arm' && previousEdge !== clampEdge(state) && section === 'desk')
      renderControls();
    refresh();
  };
} catch (error) {
  console.error(error);
  $('#webglFallback').hidden = false;
}
applyTheme();
declare global {
  interface Window {
    cockpitLab: { getState(): RoomConfig; getEvaluation(): CockpitEvaluation };
  }
}
// Read-only view of the current state and calculations, for checking a configuration.
// The end-to-end tests read the app through it (e2e/support.ts): keep its shape.
window.cockpitLab = {
  getState: () => structuredClone(state),
  getEvaluation: () => structuredClone(evaluation),
};
