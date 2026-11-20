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
import { moveRoomTarget } from './room.ts';
import { roomControls, roomItem, roomItems, roomTarget } from './room-editor.ts';
import {
  clamp,
  round,
  evaluate,
  desktopTargets,
  placeDeskItem,
  clampEdge,
  moveArmJoint,
} from './model.ts';
import { CockpitScene } from './scene.ts';
import { SIGHT_AXIS, type SceneView } from './scene-camera.ts';
import type { RoomConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import type { Project } from './project.ts';
import { activeLayout, hiddenFurnitureOf, type LayoutLibrary } from './layouts.ts';
import { activeArmPose } from './arm-poses.ts';
import { numericField } from './dom-input.ts';
import { validationBanner, metricsView } from './inspector-view.ts';
import { sectionOfStep, setupButtons } from './setup-actions.ts';
import { deskPanelHTML } from './settings-panels.ts';
import { createProjectStore, STORAGE_KEY } from './project-storage.ts';
import { ProjectSession } from './project-session.ts';
import { checkRowHTML } from './check-view.ts';
import { $, $$, $optional, dataOf, replaceKeepingFocus } from './dom.ts';
import {
  editorOf,
  editorOfSection,
  isRoomSection,
  sectionOf,
  workspaceOf,
  type Editor,
  type Section,
  type Workspace,
} from './sections.ts';
import { noRoomSelection, type RoomSelection } from './room-editing/selection.ts';
import type { RoomEditorHost } from './room-editing/host.ts';
import { RoomItems } from './room-editing/room-items.ts';
import { GuidedSetup } from './room-editing/guided-setup.ts';
import { DeskControls } from './room-editing/desk-controls.ts';
import { LayoutPicker } from './room-editing/layout-picker.ts';
import { SettingControls } from './room-editing/settings-controls.ts';
import { drawIcons } from './icons.ts';
import { ColorTheme } from './theme.ts';

drawIcons();

const colorTheme = new ColorTheme(() => scene?.applyTheme());
const store = createProjectStore(() => window.localStorage);
const VIEWS: readonly string[] = ['iso', 'top', 'desk', 'side'];
function viewOf(value: string): SceneView {
  if (!VIEWS.includes(value)) throw new Error(`Unknown view: ${value}`);
  return value as SceneView;
}
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
  scene: CockpitScene | undefined;
const roomSelection: RoomSelection = noRoomSelection();
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
if (project.setup.step !== 'complete' && project.state.roomEnabled) roomSelection.editing = true;
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
const roomHost: RoomEditorHost = {
  project,
  selection: roomSelection,
  evaluation: () => evaluation,
  section: () => section,
  refresh: () => refresh(),
  renderControls: () => renderControls(),
  renderWorkflow: () => renderWorkflow(),
  switchSection: (next) => switchSection(next),
  setActiveView: (next) => setActiveView(next),
  showWorkspace: (next) => showWorkspace(next),
  syncSceneEditing: () => syncSceneEditing(),
  setLayoutEditing: (on, target, roomEditing) => scene?.setLayoutEditing(on, target, roomEditing),
  pressLayoutButton: () => {
    $('#layoutBtn').classList.add('active');
    $('#layoutBtn').setAttribute('aria-pressed', 'true');
  },
  changeLayouts: (change) => changeLayouts(change),
  startWithCockpit: () => startWithCockpit(),
  toast: (message) => toast(message),
};
const settingControls = new SettingControls(roomHost);
const roomItemControls = new RoomItems(roomHost);
const guidedSetup = new GuidedSetup(roomHost);
const deskControls = new DeskControls(roomHost, settingControls);
const layoutPicker = new LayoutPicker(roomHost);
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
  roomSelection.armPose = activeArmPose(project.state)?.id ?? '';
}
/** Records the edits, applies `change` to the layouts and opens the resulting active layout. */
function changeLayouts(change: (recorded: LayoutLibrary) => LayoutLibrary) {
  project.changeLayouts(change);
  roomSelection.armPose = activeArmPose(project.state)?.id ?? '';
  if (
    roomSelection.target.startsWith('furniture:') &&
    !roomItem(project.state, roomSelection.target)
  )
    roomSelection.target = '';
  renderControls();
  refresh();
  syncSceneEditing();
}
/** Dragging in the plan arranges the room, so the cockpit editor has nothing to drag. */
function syncSceneEditing() {
  scene?.setPartPicking(editor() === 'cockpit');
  scene?.setLayoutEditing(
    editor() === 'room' && roomSelection.editing,
    roomSelection.target,
    isRoomSection(section),
  );
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
  layoutPicker.render(guided || inCockpit);
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
  $('#layoutBtn').classList.toggle('active', roomSelection.editing);
  $('#layoutBtn').setAttribute('aria-pressed', String(roomSelection.editing));
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
function renderControls() {
  const guided = editor() === 'room' && project.setup.step !== 'complete',
    stage = guided ? project.setup.step : section === 'furniture' ? 'furniture' : 'openings';
  if ((stage === 'openings' || stage === 'furniture') && isRoomSection(section)) {
    const items = roomItems(project.state, stage);
    if (!items.some((v) => roomTarget(v) === roomSelection.target))
      roomSelection.target = items[0] ? roomTarget(items[0]) : '';
  }
  if (
    section === 'desk' &&
    !evaluation.desktopItems.some((i) => i.id === roomSelection.target) &&
    roomSelection.target !== 'desk'
  )
    roomSelection.target = 'desk';
  let html = '';
  if (editor() === 'cockpit') {
    html = historyPanelHTML(cockpitEditor);
  } else if (guided || (section === 'desk' && project.state.deskEnabled === false)) {
    html = creationControls(
      project.state,
      evaluation,
      guided ? project.setup : { ...project.setup, step: 'desk' },
      roomSelection.target,
      settingControls.templates(),
      roomSelection.armPose,
    );
  } else if (isRoomSection(section)) {
    const { range, toggle } = settingControls.templates();
    html = roomControls(project.state, evaluation, roomSelection.target, range, toggle, {
      mode: section === 'furniture' ? 'furniture' : 'room',
      hiddenFurniture: hiddenFurnitureOf(project.library),
      layoutCount: project.library.layouts.length,
    });
  } else {
    html = deskPanelHTML(settingControls.view(), roomSelection.target, roomSelection.armPose);
  }
  if (editor() === 'cockpit') replaceKeepingFocus($('#controls'), html);
  else $('#controls').innerHTML = html;
  bindHistoryPanel($('#controls'), cockpitEditor);
  roomItemControls.bind();
  guidedSetup.bind();
  $optional('#startWithCockpit')?.addEventListener('click', startWithCockpit);
  $optional('#goRoom')?.addEventListener('click', () => {
    switchSection('room');
    setActiveView('top');
  });
  settingControls.bind();
  deskControls.bind();
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
    (roomSelection.target.startsWith('feature:') || roomSelection.target.startsWith('furniture:'))
  )
    roomSelection.target = 'desk';
  if (
    value === 'room' &&
    !roomItem(project.state, roomSelection.target) &&
    roomSelection.target !== 'desk'
  )
    roomSelection.target = 'desk';
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
function refresh() {
  const shown = shownConfig();
  evaluation = evaluate(shown);
  const e = evaluation;
  roomItemControls.sync();
  $('#roomInspector').hidden = shown.roomEnabled === false;
  $('#roomSizeTag').textContent = `${project.state.roomW} × ${project.state.roomD}`;
  $('#roomChecks').innerHTML = [...e.extra.filter((c) => c.id === 'room'), ...e.room.checks]
    .map(checkRowHTML)
    .join('');
  $('#desktopChecks').innerHTML = e.desktopChecks.map(checkRowHTML).join('');
  $('#matTag').textContent = `${project.state.matWidth} × ${project.state.matDepth}`;
  $('#deskSizeTag').textContent = `${project.state.deskWidth} × ${project.state.deskDepth}`;
  settingControls.sync();

  deskControls.sync();
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
      roomSelection.editing = true;
      $('#layoutBtn').classList.add('active');
      $('#layoutBtn').setAttribute('aria-pressed', 'true');
      scene?.setLayoutEditing(true, roomSelection.target, true);
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
$('#resetBtn').addEventListener('click', () => $<HTMLDialogElement>('#resetDialog').showModal());
/** Opens a new, empty project where the user chose to start it: the cockpit or the room. */
function startNewProject(start: Editor) {
  openProject(createProject());
  roomSelection.target = '';
  roomSelection.editing = false;
  project.saveNow();
  $<HTMLDialogElement>('#resetDialog').close();
  if (start === 'room') {
    guidedSetup.enterStep('room');
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
        : (view === 'top' || view === 'desk') && roomSelection.editing
          ? roomSelection.target === 'arm'
            ? 'Drag ELBOW or VESA · mount on the desktop'
            : 'Drag an item · select and turn it in ' + (isRoomSection(section) ? 'Room' : 'Desk')
          : 'Scroll to zoom · drag to pan';
}
$$('[data-view]').forEach((b) =>
  b.addEventListener('click', () => setActiveView(viewOf(dataOf(b, 'view')))),
);
$('#layoutBtn').addEventListener('click', () => {
  roomSelection.editing = !roomSelection.editing;
  $('#layoutBtn').classList.toggle('active', roomSelection.editing);
  $('#layoutBtn').setAttribute('aria-pressed', String(roomSelection.editing));
  syncSceneEditing();
  if (roomSelection.editing) {
    if (project.setup.step === 'complete' && !isRoomSection(section)) switchSection('desk');
    setActiveView(desktopTargets.some((t) => t.id === roomSelection.target) ? 'desk' : 'top');
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
$('#adjustRoom').addEventListener('click', () => {
  $('#tab-room').click();
  showWorkspace('config');
});
$('#adjustDesk').addEventListener('click', () => {
  switchSection('desk');
  showWorkspace('config');
});
$('#adjustDesktop').addEventListener('click', () => {
  roomSelection.target = 'arm';
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
    else if (project.setup.step !== 'complete') guidedSetup.enterStep(project.setup.step);
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
    roomSelection.target = target;
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
colorTheme.apply();
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
