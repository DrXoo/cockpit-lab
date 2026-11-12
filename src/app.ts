import { steps, createProject, readProject, projectData } from './project.ts';
import { creationControls, progressHTML } from './setup-editor.ts';
import {
  partialSummary,
  roomSummaryHTML,
  fullSummaryHTML,
  usesPartialSummary,
  summaryHeading,
} from './project-summary.ts';
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
  presets,
  clamp,
  round,
  evaluate,
  layoutPreset,
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
import type { CockpitConfig, NumericField } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import type { SetupProgress, StepId } from './project.ts';
import type { SettingsSection } from './setup-actions.ts';
import { applySetting, type SettingChange } from './setting-change.ts';
import {
  numericField,
  booleanSetting,
  choiceSetting,
  presetId,
  roomItemType,
  layoutPresetName,
} from './dom-input.ts';
import { cutListCsv } from './cut-list-csv.ts';
import { validationBanner, metricsView } from './inspector-view.ts';
import {
  sectionOfStep,
  setupButtons,
  nextSetupStep,
  withRoomSize,
  withDesk,
  withCockpitPreset,
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
import { rigPanelHTML, bodyPanelHTML, deskPanelHTML } from './settings-panels.ts';
import { createProjectStore } from './project-storage.ts';
import { checkRowHTML } from './check-view.ts';
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
  person: 'M11.5 4a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM4 16v-4a5 5 0 0 1 10 0v4',
  expand: 'M6 2H2v4m10-4h4v4M2 12v4h4m6 0h4v-4',
  rotate: 'M3 6a6 6 0 1 1 0 7M3 2v4h4M9 5v8m-3-4h6',
  info: 'M9 16A7 7 0 1 0 9 2a7 7 0 0 0 0 14ZM9 8v5M9 5h.01',
  parts: 'M3 3h5v5H3zm7 7h5v5h-5zM3 10h5v5H3zm7-7h5v5h-5z',
  arrow: 'M3 9h12m-5-5 5 5-5 5',
  close: 'm4 4 10 10M14 4 4 14',
  print: 'M5 6V2h8v4M5 13H2V7h14v6h-3M5 10h8v6H5zM13 8h.01',
};
function icons(root = document) {
  root
    .querySelectorAll<HTMLElement>('i[data-icon]')
    .forEach(
      (i) =>
        (i.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="${(i.dataset.icon && paths[i.dataset.icon]) || paths.info}"/></svg>`),
    );
}
icons();
const store = createProjectStore(() => window.localStorage);
/** The settings tabs, plus the posture panel inside the rig tab. */
type Section = SettingsSection | 'furniture' | 'body';
const SECTIONS: readonly string[] = ['room', 'furniture', 'desk', 'rig', 'body'];
const VIEWS: readonly string[] = ['iso', 'top', 'desk', 'side'];
/** The panels that narrow screens show one at a time, through the studio nav. */
const WORKSPACES = ['view', 'config', 'checks'] as const;
type Workspace = (typeof WORKSPACES)[number];
function sectionOf(value: string): Section {
  if (!SECTIONS.includes(value)) throw new Error(`Unknown section: ${value}`);
  return value as Section;
}
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

let project = createProject(),
  state: CockpitConfig = project.config,
  setup: SetupProgress = project.setup,
  section: Section = 'room',
  view: SceneView = 'top',
  scene: CockpitScene | undefined,
  layoutTarget = '',
  layoutEditing = false;
const loaded = store.load();
if (loaded.status === 'loaded') {
  project = loaded.project;
  state = project.config;
  setup = project.setup;
  setSaveStatus('Design restored from this browser');
} else if (loaded.status === 'invalid')
  setSaveStatus('The saved design could not be restored. You can open a JSON copy.', 'error');
if (setup.step === 'complete') view = 'iso';
else section = sectionOfStep(setup.step);
if (setup.step !== 'complete' && state.roomEnabled) layoutEditing = true;
let evaluation = evaluate(state);
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
function persist() {
  if (store.save({ config: state, setup })) setSaveStatus('Saved in this browser');
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
// Control templates read the current state and evaluation.
const controlView = () => ({ state, evaluation });
const controlValue = (key: NumericField) => controlValueOf(controlView(), key);
const range: ControlTemplates['range'] = (key, label) => rangeHTML(controlView(), key, label);
const toggle: ControlTemplates['toggle'] = (key, label) => toggleHTML(controlView(), key, label);
const select: ControlTemplates['select'] = (key, label, options) =>
  selectHTML(controlView(), key, label, options);
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
      if (!canAddRoomItem(state, type)) {
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
    toast('Desk and cockpit centered, keeping their layout');
  });
}
function enterStep(id: StepId) {
  setup = { ...setup, step: id };
  section = sectionOfStep(id);
  layoutTarget = id === 'desk' ? 'desk' : id === 'cockpit' ? 'cockpit' : '';
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
  const setupPreset = $optional<HTMLSelectElement>('#setupPreset');
  setupPreset?.addEventListener('change', () => {
    // The first option, "Choose a base", leaves the draft empty.
    const preset = setupPreset.value === '' ? '' : presetId(setupPreset.value);
    setup = { ...setup, drafts: { ...setup.drafts, preset } };
    queueSave();
  });
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
  const cockpitForm = $optional<HTMLFormElement>('#setupCockpitForm');
  cockpitForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!cockpitForm.reportValidity()) return;
    state = withCockpitPreset(state, presetId($<HTMLSelectElement>('#setupPreset').value));
    setup = { ...setup, deferred: setup.deferred.filter((id) => id !== 'cockpit') };
    layoutTarget = 'cockpit';
    persist();
    renderControls();
    refresh();
    setActiveView('top');
  });
}
/** The inspector card that holds an element. */
function inspectorSectionOf(selector: string): HTMLElement {
  const card = $(selector).closest<HTMLElement>('.inspector-section');
  if (!card) throw new Error(`${selector} is not inside an inspector section`);
  return card;
}
function renderWorkflow() {
  const guided = setup.step !== 'complete',
    step = steps.find((s) => s.id === setup.step);
  const stepLabel = step?.label ?? '';
  document.body.dataset.guided = String(guided);
  $('#setupProgress').hidden = !guided;
  $('#setupProgress').innerHTML = guided ? progressHTML(setup) : '';
  $('#setupActions').hidden = !guided;
  $('.config-tabs').hidden = guided;
  $('.preset-area').hidden = !state.cockpitEnabled || (section !== 'rig' && section !== 'body');
  $('.panel-heading h2').textContent = guided ? stepLabel : 'Settings';
  $('#controls').setAttribute('aria-label', guided ? (step?.title ?? '') : 'Settings');
  $('#setupGuide').hidden = !guided;
  $('#setupGuideTitle').textContent = step?.title || '';
  $('#setupGuideHint').textContent = step?.hint || '';
  const buttons = setupButtons(setup, state);
  $<HTMLButtonElement>('#setupBack').disabled = buttons.backDisabled;
  $('#setupNext').textContent = buttons.nextLabel;
  $<HTMLButtonElement>('#setupNext').disabled = buttons.nextDisabled;
  $('#setupSkip').hidden = buttons.skipHidden;
  $('#setupSkip').textContent = buttons.skipLabel;
  const hasScene = state.roomEnabled || state.deskEnabled || state.cockpitEnabled;
  $('#emptyScene').hidden = hasScene;
  $('#personBtn').hidden = !state.cockpitEnabled;
  $('[data-view="desk"]').hidden = !state.deskEnabled;
  $('[data-view="side"]').hidden = !state.cockpitEnabled;
  $<HTMLButtonElement>('#layoutBtn').disabled = !hasScene;
  $('#layoutBtn').classList.toggle('active', layoutEditing);
  $('#layoutBtn').setAttribute('aria-pressed', String(layoutEditing));
  inspectorSectionOf('#heightTag').hidden =
    !state.cockpitEnabled || (guided && setup.step !== 'cockpit');
  inspectorSectionOf('#deskSizeTag').hidden =
    !state.deskEnabled || (guided && !['desk', 'cockpit'].includes(setup.step));
  inspectorSectionOf('#deskSizeTag').querySelector('h3')!.lastChild!.textContent =
    state.monitorEnabled ? 'Desk and monitor' : 'Desk';
  inspectorSectionOf('#matTag').hidden =
    !state.deskEnabled ||
    !evaluation.desktopItems.length ||
    (guided && !['desk', 'cockpit'].includes(setup.step));
  $('.reach-card').hidden = !(state.deskEnabled && state.monitorEnabled);
  $('#editArmBtn').hidden = !(state.deskEnabled && state.monitorEnabled);
  const metrics = $$('.metrics>div');
  metrics[0].hidden = !state.cockpitEnabled && !state.roomEnabled;
  metrics[0].querySelector('span')!.textContent = state.cockpitEnabled
    ? 'COCKPIT FOOTPRINT'
    : 'ROOM';
  metrics[1].hidden = !state.cockpitEnabled && !state.deskEnabled;
  metrics[1].querySelector(':scope > small')!.textContent = 'Added items, without walkway';
  metrics[2].hidden = !state.cockpitEnabled;
  $('.scene-legend').hidden = !state.deskEnabled && !state.cockpitEnabled;
  $('.metrics').hidden = !state.roomEnabled && !state.deskEnabled && !state.cockpitEnabled;
  $('.scene-badge').hidden = !hasScene;
  $('.viewport-note').hidden = !hasScene;
  $('.view-toolbar').hidden = !hasScene;
  $('.build-note').hidden = !hasScene;
  $$('.scene-legend>span').forEach(
    (item, index) => (item.hidden = index === 2 ? !state.deskEnabled : !state.cockpitEnabled),
  );
  $('#sceneTitle').textContent = guided
    ? stepLabel
    : state.cockpitEnabled
      ? presets[state.preset].label
      : 'Your room';
}
function renderControls() {
  const guided = setup.step !== 'complete',
    stage = guided ? setup.step : section === 'furniture' ? 'furniture' : 'openings';
  if ((stage === 'openings' || stage === 'furniture') && isRoomSection(section)) {
    const items = roomItems(state, stage);
    if (!items.some((v) => roomTarget(v) === layoutTarget))
      layoutTarget = items[0] ? roomTarget(items[0]) : '';
  }
  if (
    section === 'desk' &&
    !evaluation.desktopItems.some((i) => i.id === layoutTarget) &&
    !['desk', 'cockpit'].includes(layoutTarget)
  )
    layoutTarget = 'desk';
  let html = '';
  if (
    (guided && !(setup.step === 'cockpit' && state.cockpitEnabled !== false)) ||
    ((section === 'rig' || section === 'body') && state.cockpitEnabled === false) ||
    (section === 'desk' && state.deskEnabled === false)
  ) {
    html = creationControls(
      state,
      evaluation,
      guided ? setup : { ...setup, step: section === 'desk' ? 'desk' : 'cockpit' },
      layoutTarget,
      { range, toggle, select },
    );
  } else if (section === 'rig') {
    html = rigPanelHTML(controlView());
  } else if (section === 'body') {
    html = bodyPanelHTML(controlView());
  } else if (isRoomSection(section)) {
    html = roomControls(state, evaluation, layoutTarget, range, toggle, {
      mode: section === 'furniture' ? 'furniture' : 'room',
    });
  } else {
    html = deskPanelHTML(controlView(), layoutTarget);
  }
  $('#controls').innerHTML = html;
  bindRoomEditor();
  bindCreationControls();
  $optional('#bodySettings')?.addEventListener('click', () => switchSection('body'));
  $optional('#rigSettings')?.addEventListener('click', () => switchSection('rig'));
  controlsAll('[data-place]').forEach((b) =>
    b.addEventListener('click', () => {
      layoutTarget = dataOf(b, 'place');
      layoutEditing = true;
      scene?.setLayoutEditing(true, layoutTarget, true);
      setActiveView('top');
      showWorkspace('view');
    }),
  );
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
  controlsAll('[data-monitor-pose]').forEach((button) =>
    button.addEventListener('click', () => {
      const pose = dataOf(button, 'monitorPose');
      update({ kind: 'choice', key: 'monitorMode', value: pose });
      renderControls();
      setActiveView(pose === 'cockpit' ? 'top' : 'desk');
      focusArmControls();
      toast(
        pose === 'cockpit'
          ? 'Monitor turned towards the cockpit. Check the arm reach.'
          : 'Monitor placed on the desk.',
      );
    }),
  );
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
  const layoutPresetSelect = $optional<HTMLSelectElement>('#layoutPreset');
  layoutPresetSelect?.addEventListener('change', () => {
    if (layoutPresetSelect.value === 'free') return;
    state = layoutPreset(state, layoutPresetName(layoutPresetSelect.value));
    persist();
    renderControls();
    refresh();
    setActiveView('top');
    toast('Layout applied. You can move and turn both items.');
  });
}
function switchSection(value: Section) {
  section = value;
  if (
    value === 'desk' &&
    (layoutTarget.startsWith('feature:') || layoutTarget.startsWith('furniture:'))
  )
    layoutTarget = 'desk';
  if (
    value === 'room' &&
    !roomItem(state, layoutTarget) &&
    !['desk', 'cockpit'].includes(layoutTarget)
  )
    layoutTarget = 'desk';
  $$<HTMLButtonElement>('.config-tabs button').forEach((b) => {
    const active = dataOf(b, 'section') === (section === 'body' ? 'rig' : section);
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  $('#controls').setAttribute('aria-labelledby', `tab-${value === 'body' ? 'rig' : value}`);
  renderControls();
  renderWorkflow();
  $('#controls').scrollTop = 0;
  scene?.setLayoutEditing(layoutEditing, layoutTarget, isRoomSection(section));
}
function refresh() {
  evaluation = evaluate(state);
  const e = evaluation;
  syncRoomInputs();
  $('#roomInspector').hidden = state.roomEnabled === false;
  $('#roomSizeTag').textContent = `${state.roomW} × ${state.roomD}`;
  $('#roomChecks').innerHTML = [...e.extra.filter((c) => c.id === 'room'), ...e.room.checks]
    .map(checkRowHTML)
    .join('');
  $<HTMLSelectElement>('#preset').value = state.preset;
  $('#presetDescription').textContent = presets[state.preset].description;
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
  const lengths = $optional('#armLengths');
  if (lengths)
    lengths.textContent = `First segment: ${round(e.armPose.first)} cm · second segment: ${round(e.armPose.second)} cm. An elbow at 0° keeps the arm straight; ±180° folds it.`;
  const coordinateHint = $optional('[data-desktop-hint]');
  if (coordinateHint)
    coordinateHint.innerHTML = `Reference: the center of the desktop, which turns with the desk. X runs along its ${state.deskDepth} cm depth; Z along its ${state.deskWidth} cm width. Select and drag in the <b>Desk</b> or <b>Top</b> views. You can also type the position and rotation here.`;
  $('#heightTag').textContent = `${state.height} cm`;
  $('#ergonomics').innerHTML = e.bodyCheck.map(checkRowHTML).join('');
  $('#spaceChecks').innerHTML = [
    ...e.spaceCheck,
    ...e.extra.filter((c) => c.id !== 'room' && c.level !== 'ok'),
  ]
    .map(checkRowHTML)
    .join('');
  const banner = validationBanner(state, e);
  $('#validationBanner').className = banner.className;
  $('#validationBanner').innerHTML = banner.html;
  $('#reachValue').textContent = `${Math.round(e.reach)} / ${state.armReach} cm`;
  $('#reachMax').textContent = `Max. ${state.armReach} cm`;
  $('#reachMeter').style.width = `${Math.min(100, (e.reach / state.armReach) * 100)}%`;
  $('#reachMeter').classList.toggle('over', e.reach > state.armReach);
  const metrics = metricsView(state, e);
  $('#metricFootprint').innerHTML = metrics.footprintHTML;
  $('#metricWidthNote').textContent = metrics.widthNote;
  $('#metricSpace').innerHTML = metrics.spaceHTML;
  $('#metricProfiles').innerHTML = metrics.profilesHTML;
  $('#metricPieces').textContent = metrics.piecesText;
  renderWorkflow();
  scene?.update(state, evaluation);
}
function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type }),
    a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportConfig() {
  download(
    'cockpit-lab-design.json',
    JSON.stringify(projectData(state, setup), null, 2),
    'application/json',
  );
  toast('JSON exported. Use Open JSON to bring this design back.');
}
function summary() {
  const heading = summaryHeading(state);
  $('#summaryTitle').textContent = heading.title;
  $('#summaryDialog .section-kicker').textContent = heading.kicker;
  $('#csvBtn').hidden = !evaluation.parts.length && !evaluation.accessories.length;
  $('#summaryContent').innerHTML = usesPartialSummary(state, setup)
    ? partialSummary(state, evaluation, setup, roomSummaryHTML(state))
    : fullSummaryHTML(state, evaluation);
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
    const tabs = $$<HTMLButtonElement>('.config-tabs button'),
      i = tabs.findIndex((t) => dataOf(t, 'section') === (section === 'body' ? 'rig' : section)),
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
$('#preset').addEventListener('change', () => {
  const key = presetId($<HTMLSelectElement>('#preset').value);
  state = { ...state, ...presets[key].values, preset: key, cockpitEnabled: true };
  persist();
  renderControls();
  refresh();
  toast(`${presets[key].label} preset applied`);
});
$('#resetBtn').addEventListener('click', () => $<HTMLDialogElement>('#resetDialog').showModal());
$('#confirmReset').addEventListener('click', () => {
  project = createProject();
  state = project.config;
  setup = project.setup;
  layoutTarget = '';
  layoutEditing = false;
  clearTimeout(pendingSave);
  persist();
  $<HTMLDialogElement>('#resetDialog').close();
  enterStep('room');
  toast('New project. Start with your room.');
});
function setActiveView(next: SceneView) {
  view = next;
  $$('[data-view]').forEach((t) => {
    const active = dataOf(t, 'view') === view;
    t.classList.toggle('active', active);
    t.setAttribute('aria-pressed', String(active));
  });
  scene?.setView(view);
  $('.viewport-note span').textContent =
    view === 'iso'
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
  scene?.setLayoutEditing(layoutEditing, layoutTarget, isRoomSection(section));
  if (layoutEditing) {
    if (setup.step === 'complete' && !isRoomSection(section) && section !== 'rig')
      switchSection('desk');
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
$('#personBtn').addEventListener('click', () => {
  const on = $('#personBtn').getAttribute('aria-pressed') !== 'true';
  $('#personBtn').setAttribute('aria-pressed', String(on));
  $('#personBtn').setAttribute('aria-label', on ? 'Hide driver' : 'Show driver');
  $('#personBtn').classList.toggle('active', on);
  scene?.setPerson(on);
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
$('#adjustBody').addEventListener('click', () => {
  switchSection('body');
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
  scene?.setLayoutEditing(layoutEditing, layoutTarget, isRoomSection(section));
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
$('#csvBtn').addEventListener('click', () => {
  download('cockpit-lab-cut-list.csv', cutListCsv(evaluation), 'text/csv;charset=utf-8');
  toast('Cut list downloaded');
});
$('#printBtn').addEventListener('click', () => window.print());
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#loadConfig').addEventListener('click', () => $('#importFile').click());
const importFile = $<HTMLInputElement>('#importFile');
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error('File too large');
    const data = readProject(JSON.parse(await file.text()));
    state = data.config;
    setup = data.setup;
    persist();
    renderControls();
    refresh();
    $<HTMLDialogElement>('#summaryDialog').close();
    if (setup.step !== 'complete') enterStep(setup.step);
    else {
      switchSection('room');
      setActiveView('iso');
    }
    toast('Design loaded');
  } catch {
    toast('Could not load the file: use a JSON file exported by Cockpit Lab.');
  }
  importFile.value = '';
});
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
try {
  scene = new CockpitScene($('#viewport'), $('#sceneLabels'));
  scene.update(state, evaluation);
  setActiveView(view);
  scene.setLayoutEditing(layoutEditing, layoutTarget, isRoomSection(section));
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
            : target === 'cockpit'
              ? 'rig'
              : 'desk',
      );
    } else if (section === 'desk' || isRoomSection(section)) renderControls();
    scene?.setLayoutEditing(layoutEditing, layoutTarget, isRoomSection(section));
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
declare global {
  interface Window {
    cockpitLab: { getState(): CockpitConfig; getEvaluation(): CockpitEvaluation };
  }
}
// Read-only view of the current state and calculations, for checking a configuration.
// The end-to-end tests read the app through it (e2e/support.ts): keep its shape.
window.cockpitLab = {
  getState: () => structuredClone(state),
  getEvaluation: () => structuredClone(evaluation),
};
