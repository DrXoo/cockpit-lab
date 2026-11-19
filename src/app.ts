import { steps, createProject, readProject, projectData, replaceCockpitDesign } from './project.ts';
import {
  cockpitFileData,
  PARAMETRIC_COCKPIT_FILE_MESSAGE,
  readCockpitFile,
} from './cockpit-file.ts';
import type { CockpitDesign } from './cockpit-design.ts';
import { NOTHING_AROUND } from './cockpit-editor-view.ts';
import type { CockpitDrawing } from './render-cad.ts';
import { CockpitEditor } from './cockpit-editor/editor.ts';
import { CockpitInspector } from './cockpit-editor/inspector.ts';
import { CockpitViewOverlays } from './cockpit-editor/view-overlays.ts';
import { HandleDragging } from './cockpit-editor/handle-dragging.ts';
import { CockpitToolbar } from './cockpit-editor/toolbar.ts';
import { bindCockpitKeys } from './cockpit-editor/keys.ts';
import { bindHistoryPanel, historyPanelHTML } from './cockpit-editor/history-panel.ts';
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
import { SIGHT_AXIS, type SceneView } from './scene-camera.ts';
import type { RoomConfig, NumericField } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import type { Project, StepId } from './project.ts';
import {
  MAX_LAYOUTS,
  MAX_LAYOUT_NAME_LENGTH,
  activeLayout,
  deleteLayout,
  duplicateLayout,
  hiddenFurnitureOf,
  hideFurniture,
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
import { armReachHint, deskPanelHTML } from './settings-panels.ts';
import { monitorPositionHTML } from './desk-editor.ts';
import { createProjectStore, STORAGE_KEY } from './project-storage.ts';
import { ProjectSession } from './project-session.ts';
import {
  nextThemePreference,
  parseThemePreference,
  resolveTheme,
  THEME_PREFERENCE_LABELS,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme-preference.ts';
import { checkRowHTML } from './check-view.ts';
import {
  unitFor,
  controlValue as controlValueOf,
  rangeHTML,
  toggleHTML,
  selectHTML,
  type ControlTemplates,
} from './controls-view.ts';
import { $, $$, $optional, dataOf, replaceKeepingFocus } from './dom.ts';
import { drawIcons } from './icons.ts';

/** Elements inside the settings panel, which is rebuilt on every render. */
const controlsAll = <E extends Element = HTMLElement>(selector: string): E[] => [
  ...$('#controls').querySelectorAll<E>(selector),
];
type FieldElement = HTMLInputElement | HTMLSelectElement;
/** Sets the fill of a range slider, as a percentage of its span. */
const setRangeFill = (slider: HTMLInputElement, percent: number) =>
  slider.style.setProperty('--pct', `${percent}%`);
drawIcons();

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
  drawIcons(button);
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
const project = new ProjectSession(newProject, {
  store,
  cockpit: () => cockpitEditor.session.design,
  showStatus: (message, status) => setSaveStatus(message, status),
});
let section: Section = 'room',
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
  selectedArmPose = '';
const cockpitEditor = new CockpitEditor(
  {
    refresh: () => refresh(),
    renderControls: () => renderControls(),
    renderInspector: () => cockpitInspector.render({ force: true }),
    renderJointCard: () => cockpitOverlays.renderJointCard(),
    saveSoon: () => project.saveSoon(),
    frameDesign: () => setActiveView(view),
    toast: (message) => toast(message),
    sightAxis: () => SIGHT_AXIS[view],
  },
  newProject.cockpit,
);
const inCockpitEditor = () => editor() === 'cockpit';
const cockpitInspector = new CockpitInspector(cockpitEditor, inCockpitEditor);
const cockpitToolbar = new CockpitToolbar(cockpitEditor, inCockpitEditor);
const cockpitOverlays = new CockpitViewOverlays(cockpitEditor, () => scene, inCockpitEditor);
const handleDragging = new HandleDragging(cockpitEditor);
bindCockpitKeys(cockpitEditor, inCockpitEditor);
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
if (project.setup.step === 'complete') view = 'iso';
else section = sectionOfStep(project.setup.step);
if (project.setup.step !== 'complete' && project.state.roomEnabled) layoutEditing = true;
// A project with a cockpit design and no room yet opens where the design is edited.
if (!project.state.roomEnabled && cockpitEditor.session.design !== null) {
  section = 'design';
  view = 'iso';
}
const editor = (): Editor => editorOfSection(section);
/** What the scene draws of the cockpit design: only in the cockpit editor, on its own. */
const cockpitDrawing = (): CockpitDrawing | null =>
  editor() === 'cockpit' ? cockpitEditor.drawing() : null;
/** What the scene and the checks show: the active layout, or the cockpit design on its own. */
const shownConfig = (): RoomConfig => (editor() === 'cockpit' ? NOTHING_AROUND : project.state);
let evaluation = evaluate(shownConfig());
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
function openProject(opened: Project) {
  project.open(opened);
  cockpitEditor.open(opened.cockpit);
  selectedArmPose = activeArmPose(project.state)?.id ?? '';
}
/** Records the edits, applies `change` to the layouts and opens the resulting active layout. */
function changeLayouts(change: (recorded: LayoutLibrary) => LayoutLibrary) {
  project.changeLayouts(change);
  selectedArmPose = activeArmPose(project.state)?.id ?? '';
  if (layoutTarget.startsWith('furniture:') && !roomItem(project.state, layoutTarget))
    layoutTarget = '';
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
function update(change: SettingChange) {
  project.state = applySetting(project.state, change);
  if (change.key.startsWith('room')) project.state = normalizeRoom(project.state);
  project.saveSoon();
  refresh();
}
// Control templates read the current state and evaluation.
const controlView = () => ({ state: project.state, evaluation });
const controlValue = (key: NumericField) => controlValueOf(controlView(), key);
const range: ControlTemplates['range'] = (key, label) => rangeHTML(controlView(), key, label);
const toggle: ControlTemplates['toggle'] = (key, label) => toggleHTML(controlView(), key, label);
const select: ControlTemplates['select'] = (key, label, options) =>
  selectHTML(controlView(), key, label, options);
/** Applies a change to the monitor arm or its saved poses, and redraws the arm controls. */
function changeArm(next: RoomConfig) {
  project.state = next;
  project.saveSoon();
  renderControls();
  refresh();
}
function roomChanged(redraw = false) {
  project.state = normalizeRoom(project.state);
  project.saveSoon();
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
  project.state = updateRoomItem(project.state, layoutTarget, key, value);
  roomChanged(redraw);
}
function syncRoomInputs() {
  if (!isRoomSection(section)) return;
  const item = roomItem(project.state, layoutTarget),
    mounted = item?.type === 'wallShelf',
    frame =
      item && isFeature(item)
        ? wallFrame(project.state, item.wall)
        : mounted
          ? wallFrame(project.state, item.mountWall)
          : null;
  controlsAll<FieldElement>('[data-room-key]').forEach((el) => {
    const key = dataOf(el, 'roomKey'),
      value = roomValue(project.state, layoutTarget, key);
    if (el instanceof HTMLInputElement && ['number', 'range'].includes(el.type)) {
      const limits =
        key === 'offset' && frame && item
          ? [0, Math.max(0, frame.length - item.width)]
          : key === 'elevation' && mounted
            ? [0, project.state.roomH]
            : key === 'width' && frame && item && !mounted
              ? [30, item.type === 'wardrobeAccess' ? frame.length : Math.min(300, frame.length)]
              : key === 'height' && frame && !mounted
                ? [30, project.state.roomH]
                : key === 'sill' && frame && item
                  ? [0, project.state.roomH - item.height]
                  : key === 'x'
                    ? [-200, project.state.roomW + 200]
                    : key === 'z'
                      ? [-200, project.state.roomD + 200]
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
        el.value = String(roomValue(project.state, layoutTarget, key));
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
        ((roomValue(project.state, layoutTarget, 'angle') as number) +
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
      const hiddenFurniture = activeLayout(project.library).hiddenFurniture.length;
      if (!canAddRoomItem(project.state, type, { hiddenFurniture })) {
        toast('Item limit reached');
        return;
      }
      const added = addRoomItem(project.state, type, id);
      project.state = added.state;
      project.setup = {
        ...project.setup,
        deferred: project.setup.deferred.filter((step) => step !== stepOfRoomItem(type)),
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
    if (roomItem(project.state, layoutTarget)?.type !== 'chair') return;
    project.state = placeChairAtDesk(project.state, layoutTarget);
    roomChanged(true);
    scene?.setLayoutEditing(layoutEditing, layoutTarget, true);
    setActiveView('top');
    toast('Chair placed in front of the desk');
  });
  $optional('#roomHide')?.addEventListener('click', () => {
    const item = roomItem(project.state, layoutTarget);
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
    if (!roomItem(project.state, layoutTarget)) return;
    project.state = deleteRoomItem(project.state, layoutTarget);
    layoutTarget = 'desk';
    roomChanged(true);
    scene?.setLayoutEditing(layoutEditing, layoutTarget, true);
    toast('Item deleted');
  });
  $optional('#roomFrame')?.addEventListener('click', () => {
    setActiveView('top');
  });
  $optional('#roomCenter')?.addEventListener('click', () => {
    project.state = centerInRoom(project.state, evaluation);
    roomChanged(true);
    setActiveView('top');
    toast('Desk centered, with everything on it');
  });
}
function enterStep(id: StepId) {
  project.setup = { ...project.setup, step: id };
  section = sectionOfStep(id);
  layoutTarget = id === 'desk' ? 'desk' : '';
  layoutEditing = project.state.roomEnabled;
  showWorkspace('config');
  switchSection(section);
  project.saveNow();
  refresh();
  setActiveView(id === 'desk' && project.state.deskEnabled ? 'desk' : 'top');
}
function continueSetup(defer = false) {
  const result = nextSetupStep(project.setup, project.state, { defer });
  if (result.status === 'needs-room') {
    $optional<HTMLFormElement>('#setupRoomForm')?.reportValidity();
    return;
  }
  if (result.status === 'blocked') return;
  project.setup = result.setup;
  project.saveNow();
  if (project.setup.step === 'complete') {
    layoutEditing = false;
    switchSection('room');
    showWorkspace('view');
    setActiveView('iso');
    refresh();
    toast('Project ready. You can keep editing each part.');
  } else enterStep(project.setup.step);
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
      project.setup = { ...project.setup, drafts: { ...project.setup.drafts, [group]: draft } };
      project.saveSoon();
    });
  }
  const roomForm = $optional<HTMLFormElement>('#setupRoomForm');
  roomForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!roomForm.reportValidity()) return;
    project.state = withRoomSize(
      project.state,
      Number($<HTMLInputElement>('#setupRoomW').value),
      Number($<HTMLInputElement>('#setupRoomD').value),
      Number($<HTMLInputElement>('#setupRoomH').value),
    );
    project.setup = { ...project.setup, drafts: { ...project.setup.drafts, room: undefined } };
    project.saveNow();
    continueSetup();
  });
  const deskForm = $optional<HTMLFormElement>('#setupDeskForm');
  deskForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!deskForm.reportValidity()) return;
    project.state = withDesk(
      project.state,
      Number($<HTMLInputElement>('#setupDeskW').value),
      Number($<HTMLInputElement>('#setupDeskD').value),
      Number($<HTMLInputElement>('#setupDeskH').value),
    );
    project.setup = {
      ...project.setup,
      deferred: project.setup.deferred.filter((id) => id !== 'desk'),
      drafts: { ...project.setup.drafts, desk: undefined },
    };
    layoutTarget = 'desk';
    layoutEditing = true;
    project.saveNow();
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
    guided = !inCockpit && project.setup.step !== 'complete',
    step = steps.find((s) => s.id === project.setup.step),
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
  $('#setupProgress').innerHTML = guided ? progressHTML(project.setup) : '';
  $('#setupActions').hidden = !guided;
  $('.config-tabs').hidden = guided || inCockpit;
  renderLayoutPicker(guided || inCockpit);
  $('.cockpit-area').hidden = !inCockpit;
  $('#exportCockpit').hidden = !cockpitEditor.hasDesign();
  const heading = guided ? stepLabel : inCockpit ? 'Cockpit design' : 'Settings';
  $('.panel-heading h2').textContent = heading;
  $('#controls').setAttribute('aria-label', guided ? (step?.title ?? '') : heading);
  $('#setupGuide').hidden = !guided;
  $('#setupGuideTitle').textContent = step?.title || '';
  $('#setupGuideHint').textContent = step?.hint || '';
  const buttons = setupButtons(project.setup, project.state);
  $<HTMLButtonElement>('#setupBack').disabled = buttons.backDisabled;
  $('#setupNext').textContent = buttons.nextLabel;
  $<HTMLButtonElement>('#setupNext').disabled = buttons.nextDisabled;
  $('#setupSkip').hidden = buttons.skipHidden;
  $('#setupSkip').textContent = buttons.skipLabel;
  const hasScene = inCockpit ? cockpitEditor.hasParts() : shown.roomEnabled || shown.deskEnabled;
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
  $('#partInspector').hidden = !inCockpit || !cockpitEditor.hasParts();
  $('#layoutBtn').hidden = inCockpit;
  $('#measureBtn').hidden = !inCockpit || !cockpitEditor.hasParts();
  $('#fitModeBtn').hidden = !inCockpit || !cockpitEditor.hasParts();
  $('#fitModeBtn').classList.toggle('active', cockpitEditor.session.fitting);
  $('#fitModeBtn').setAttribute('aria-pressed', String(cockpitEditor.session.fitting));
  $<HTMLButtonElement>('#layoutBtn').disabled = !hasScene;
  $('#layoutBtn').classList.toggle('active', layoutEditing);
  $('#layoutBtn').setAttribute('aria-pressed', String(layoutEditing));
  $('#validationBanner').hidden = inCockpit;
  inspectorSectionOf('#deskSizeTag').hidden =
    !shown.deskEnabled || (guided && project.setup.step !== 'desk');
  inspectorSectionOf('#deskSizeTag').querySelector('h3')!.lastChild!.textContent =
    shown.monitorEnabled ? 'Desk and monitor' : 'Desk';
  inspectorSectionOf('#matTag').hidden =
    !shown.deskEnabled ||
    !evaluation.desktopItems.length ||
    (guided && project.setup.step !== 'desk');
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
    !guided && !inCockpit && project.library.layouts.length > 1
      ? `${sceneTitle} · ${activeLayout(project.library).name}`
      : sceneTitle;
}
/** The layout picker appears in the room editor once the guided setup is done. */
function renderLayoutPicker(hidden: boolean) {
  $('#layoutArea').hidden = hidden;
  const select = $<HTMLSelectElement>('#layoutSelect');
  const options = layoutOptionsHTML(project.library);
  if (select.innerHTML !== options) select.innerHTML = options;
  select.value = project.library.activeLayoutId;
  $('#layoutHint').hidden = project.library.layouts.length > 1;
  $<HTMLButtonElement>('#deleteLayout').disabled = project.library.layouts.length === 1;
  $<HTMLButtonElement>('#duplicateLayout').disabled = project.library.layouts.length >= MAX_LAYOUTS;
}
function renderControls() {
  const guided = editor() === 'room' && project.setup.step !== 'complete',
    stage = guided ? project.setup.step : section === 'furniture' ? 'furniture' : 'openings';
  if ((stage === 'openings' || stage === 'furniture') && isRoomSection(section)) {
    const items = roomItems(project.state, stage);
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
    html = historyPanelHTML(cockpitEditor);
  } else if (guided || (section === 'desk' && project.state.deskEnabled === false)) {
    html = creationControls(
      project.state,
      evaluation,
      guided ? project.setup : { ...project.setup, step: 'desk' },
      layoutTarget,
      { range, toggle, select },
      selectedArmPose,
    );
  } else if (isRoomSection(section)) {
    html = roomControls(project.state, evaluation, layoutTarget, range, toggle, {
      mode: section === 'furniture' ? 'furniture' : 'room',
      hiddenFurniture: hiddenFurnitureOf(project.library),
      layoutCount: project.library.layouts.length,
    });
  } else {
    html = deskPanelHTML(controlView(), layoutTarget, selectedArmPose);
  }
  if (editor() === 'cockpit') replaceKeepingFocus($('#controls'), html);
  else $('#controls').innerHTML = html;
  bindHistoryPanel($('#controls'), cockpitEditor);
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
      const [min, max, step] = fieldSpec(key, project.state);
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
          project.state.monitorMode !== 'manual')
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
      const value = (project.state[key] + Number(dataOf(button, 'rotate')) + 360) % 360;
      update({ kind: 'number', key, value });
      renderControls();
    }),
  );
  const armPoseName = $optional<HTMLInputElement>('#armPoseName');
  const saveCurrentArmPose = () => {
    try {
      const next = saveArmPose(project.state, armPoseName?.value);
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
    project.state.clampSide = edge;
    const b = deskBounds(project.state);
    if (edge === 'xmin' || edge === 'xmax')
      project.state.clampX = edge === 'xmin' ? -b.anchorX : b.anchorX;
    else project.state.clampZ = edge === 'zmin' ? -b.anchorZ : b.anchorZ;
    project.saveNow();
    renderControls();
    refresh();
  });
  const deskSizePresetSelect = $optional<HTMLSelectElement>('#deskSizePreset');
  deskSizePresetSelect?.addEventListener('change', () => {
    if (deskSizePresetSelect.value === 'custom') return;
    const [width, depth] = deskSizePresetSelect.value.split('x').map(Number);
    project.state = resizeDesk(project.state, width, depth);
    project.saveNow();
    renderControls();
    refresh();
    setActiveView('desk');
    toast(`${width} × ${depth} cm desktop applied`);
  });
  const matPresetSelect = $optional<HTMLSelectElement>('#matPreset');
  matPresetSelect?.addEventListener('change', () => {
    if (matPresetSelect.value === 'custom') return;
    const [width, depth] = matPresetSelect.value.split('x').map(Number);
    project.state = updateDeskItem({ ...project.state, matWidth: width }, 'matDepth', depth);
    project.saveNow();
    renderControls();
    refresh();
  });
}
function switchSection(value: Section) {
  const editorChanged = editorOfSection(value) !== editor();
  if (editorChanged) cockpitEditor.stopMeasuring();
  section = value;
  lastSection[editor()] = value;
  // The other editor shows another configuration, so the panels need its evaluation.
  if (editorChanged) evaluation = evaluate(shownConfig());
  if (
    value === 'desk' &&
    (layoutTarget.startsWith('feature:') || layoutTarget.startsWith('furniture:'))
  )
    layoutTarget = 'desk';
  if (value === 'room' && !roomItem(project.state, layoutTarget) && layoutTarget !== 'desk')
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
  if (changed)
    setActiveView(next === 'cockpit' || project.setup.step === 'complete' ? 'iso' : 'top');
}
$$('.editor-switch button').forEach((button) =>
  button.addEventListener('click', () => showEditor(editorOf(dataOf(button, 'editor')))),
);
/** What each monitor position area shows, so it is only rewritten when that changes. */
const shownMonitorPositions = new WeakMap<Element, string>();
function refreshMonitorPosition() {
  const area = $optional('#monitorPositionArea');
  if (!area) return;
  const html = monitorPositionHTML(project.state, selectedArmPose);
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
  $('#roomSizeTag').textContent = `${project.state.roomW} × ${project.state.roomD}`;
  $('#roomChecks').innerHTML = [...e.extra.filter((c) => c.id === 'room'), ...e.room.checks]
    .map(checkRowHTML)
    .join('');
  $('#desktopChecks').innerHTML = e.desktopChecks.map(checkRowHTML).join('');
  $('#matTag').textContent = `${project.state.matWidth} × ${project.state.matDepth}`;
  $('#deskSizeTag').textContent = `${project.state.deskWidth} × ${project.state.deskDepth}`;
  const sizeSelect = $optional<HTMLSelectElement>('#deskSizePreset');
  if (sizeSelect) {
    const value = `${project.state.deskWidth}x${project.state.deskDepth}`;
    sizeSelect.value = [...sizeSelect.options].some((o) => o.value === value) ? value : 'custom';
  }
  controlsAll<FieldElement>('[data-key]').forEach((el) => {
    if (!(el instanceof HTMLInputElement)) return;
    if (el.matches('input[type=range]') || el.hasAttribute('data-number')) {
      const key = numericField(el.dataset.key);
      const [min, max, step] = fieldSpec(key, project.state);
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
  if (mode) mode.value = project.state.monitorMode;
  const bend = $optional<HTMLSelectElement>('#armBend');
  if (bend) bend.value = project.state.armBend;
  refreshMonitorPosition();
  const lengths = $optional('#armLengths');
  if (lengths) lengths.textContent = armReachHint(e.armPose);
  const coordinateHint = $optional('[data-desktop-hint]');
  if (coordinateHint)
    coordinateHint.innerHTML = `Reference: the center of the desktop, which turns with the desk. X runs along its ${project.state.deskDepth} cm depth; Z along its ${project.state.deskWidth} cm width. Select and drag in the <b>Desk</b> or <b>Top</b> views. You can also type the position and rotation here.`;
  $('#spaceChecks').innerHTML = [
    ...e.spaceCheck,
    ...e.extra.filter((c) => c.id !== 'room' && c.level !== 'ok'),
  ]
    .map(checkRowHTML)
    .join('');
  const banner = validationBanner(shown, e);
  $('#validationBanner').className = banner.className;
  $('#validationBanner').innerHTML = banner.html;
  const maxReach = round(e.armPose.maxReach);
  $('#reachValue').textContent = `${Math.round(e.reach)} / ${maxReach} cm`;
  $('#reachMax').textContent = `Max. ${maxReach} cm`;
  $('#reachMeter').style.width = `${Math.min(100, (e.reach / e.armPose.maxReach) * 100)}%`;
  $('#reachMeter').classList.toggle('over', e.reach > e.armPose.maxReach);
  const metrics = metricsView(shown, e);
  $('#metricFootprint').innerHTML = metrics.footprintHTML;
  $('#metricSpace').innerHTML = metrics.spaceHTML;
  renderWorkflow();
  cockpitInspector.render();
  cockpitInspector.renderChecks();
  cockpitOverlays.render();
  cockpitToolbar.render();
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
    JSON.stringify(projectData(project.recorded()), null, 2),
    'application/json',
  );
  toast('JSON exported. Use Open JSON to bring this design back.');
}
function summary() {
  $('#summaryTitle').textContent = SUMMARY_HEADING.title;
  $('#summaryDialog .section-kicker').textContent = SUMMARY_HEADING.kicker;
  $('#summaryContent').innerHTML = summaryHTML(project.state, evaluation, project.setup);
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
  toast(`Showing the layout ${activeLayout(project.library).name}`);
});
type LayoutNameAction = 'duplicate' | 'rename';
let layoutNameAction: LayoutNameAction = 'duplicate';
function askLayoutName(action: LayoutNameAction) {
  layoutNameAction = action;
  const current = activeLayout(project.library).name;
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
  const deleted = activeLayout(project.library).name;
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
  project.saveNow();
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
  // Which handles can be dragged depends on the view.
  if (editor() === 'cockpit' && cockpitEditor.hasParts()) refresh();
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
    if (project.setup.step === 'complete' && !isRoomSection(section)) switchSection('desk');
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
  changeArm(chooseMonitorPosition(project.state, choice));
  const pose = project.state.armPoses.find((candidate) => candidate.id === poseId);
  if (pose && armPoseMountMoved(project.state, pose))
    toast(
      `${pose.name} was saved with the arm mounted elsewhere, so the monitor is not where it was.`,
    );
}
/** The pose the monitor position shows, if it shows one. */
function shownArmPose() {
  const { choice } = monitorPositionOf(project.state, selectedArmPose);
  return project.state.armPoses.find((pose) => choice === `pose:${pose.id}`);
}
function updateSelectedArmPose() {
  const pose = shownArmPose();
  if (!pose) return;
  changeArm(updateArmPose(project.state, pose.id));
  toast(`Pose ${pose.name} updated.`);
}
function deleteSelectedArmPose() {
  const pose = shownArmPose();
  if (!pose) return;
  selectedArmPose = '';
  changeArm(deleteArmPose(project.state, pose.id));
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
    project.saveNow();
    renderControls();
    refresh();
    $<HTMLDialogElement>('#summaryDialog').close();
    if (!project.state.roomEnabled && cockpitEditor.hasDesign()) startWithCockpit();
    else if (project.setup.step !== 'complete') enterStep(project.setup.step);
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
  if (cockpitEditor.session.design === null) return;
  download(
    'cockpit-lab-cockpit.json',
    JSON.stringify(cockpitFileData(cockpitEditor.session.design), null, 2),
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
    if (cockpitEditor.hasDesign()) {
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
  openProject(replaceCockpitDesign(project.recorded(), design));
  project.saveNow();
  renderControls();
  refresh();
  setActiveView('iso');
  toast('Cockpit file imported.');
}
window.addEventListener('pagehide', () => {
  project.saveNow();
});
$('#setupProgress').addEventListener('click', (event) => {
  const button =
    event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-step]') : null;
  if (button && !button.disabled) enterStep(stepOf(dataOf(button, 'step')));
});
$('#setupBack').addEventListener('click', () => {
  const index = steps.findIndex((s) => s.id === project.setup.step);
  if (index > 0) enterStep(steps[index - 1].id);
});
$('#setupNext').addEventListener('click', () => {
  if (project.setup.step === 'room') $optional<HTMLFormElement>('#setupRoomForm')?.requestSubmit();
  else continueSetup();
});
$('#setupSkip').addEventListener('click', () => continueSetup(true));
$('#newProject').addEventListener('click', () => $<HTMLDialogElement>('#resetDialog').showModal());
if (project.setup.step !== 'complete') showWorkspace('config');
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
  scene.onPartPick = (hit) => cockpitEditor.pickInView(hit);
  scene.onPartHover = (hit, pointer) => cockpitOverlays.hover(hit, pointer);
  scene.onHandleGrab = (handle) => handleDragging.grab(handle);
  scene.onHandleDrag = (handle, movedMm, modifiers) =>
    handleDragging.drag(handle, movedMm, modifiers);
  scene.onHandleRelease = () => handleDragging.release();
  scene.onJointMarkerPick = (marker) => cockpitEditor.openJointCard(marker);
  scene.onArmMove = (joint, x, z) => {
    project.state = moveArmJoint(project.state, joint, x, z);
    project.saveSoon();
    refresh();
  };
  scene.onLayoutSelect = (target) => {
    layoutTarget = target;
    if (project.setup.step === 'complete') {
      switchSection(
        target.startsWith('furniture:') ||
          roomItem(project.state, target)?.type === 'wardrobeAccess'
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
      previousEdge = clampEdge(project.state);
    if (target.startsWith('feature:') || target.startsWith('furniture:'))
      project.state = moveRoomTarget(project.state, target, x, z);
    else if (item) project.state = placeDeskItem(project.state, item.id, x, z);
    else {
      project.state[numericField(target + 'X')] = round(clamp(x, -1500, 1500));
      project.state[numericField(target + 'Z')] = round(clamp(z, -1500, 1500));
    }
    project.saveSoon();
    if (target === 'arm' && previousEdge !== clampEdge(project.state) && section === 'desk')
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
  getState: () => structuredClone(project.state),
  getEvaluation: () => structuredClone(evaluation),
};
