import { deskElementControls, monitorShortcuts } from './desk-editor.ts';
import { steps, createProject, readProject, projectData } from './project.ts';
import {
  creationControls,
  accessoryControls,
  placementControls,
  progressHTML,
} from './setup-editor.ts';
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
  defaults,
  presets,
  fields,
  clamp,
  round,
  evaluate,
  sanitize,
  layoutPreset,
  desktopTargets,
  placeDeskItem,
  updateDeskItem,
  clampEdge,
  deskBounds,
  fieldSpec,
  resizeDesk,
  editArm,
  moveArmJoint,
  wrapAngle,
  rigHeightKeys,
  rigLift,
  floorHeight,
  setRigHeight,
} from './model.ts';
import { CockpitScene } from './scene.ts';
import { cutListCsv } from './cut-list-csv.ts';
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
  groupHTML,
} from './controls-view.ts';

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const paths = {
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
        (i.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="${paths[i.dataset.icon] || paths.info}"/></svg>`),
    );
}
icons();
const store = createProjectStore(() => window.localStorage);
let project = createProject(),
  state: any = project.config,
  setup: any = project.setup,
  section = 'room',
  view = 'top',
  modified = false,
  scene,
  layoutTarget = '',
  layoutEditing = false;
const loaded = store.load();
if (loaded.status === 'loaded') {
  project = loaded.project;
  state = project.config;
  setup = project.setup;
  setSaveStatus('Diseño recuperado de este navegador');
} else if (loaded.status === 'invalid')
  setSaveStatus('No se pudo recuperar el guardado. Puedes abrir una copia JSON.', 'error');
if (setup.step === 'complete') view = 'iso';
else section = sectionOfStep(setup.step);
if (setup.step !== 'complete' && state.roomEnabled) layoutEditing = true;
let evaluation = evaluate(state);
let pendingSave, toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000);
}
function setSaveStatus(message, status = 'ok') {
  $('#saveStatus').textContent = message;
  $('.save-info').dataset.state = status;
}
function persist() {
  if (store.save({ config: state, setup })) setSaveStatus('Guardado en este navegador');
  else setSaveStatus('Sin autoguardado · exporta un JSON', 'error');
}
function queueSave() {
  setSaveStatus('Guardando…');
  clearTimeout(pendingSave);
  pendingSave = setTimeout(persist, 250);
}
function update(key, value) {
  state = rigHeightKeys.includes(key)
    ? setRigHeight(state, key, value)
    : updateDeskItem(editArm(state, key, value), key, value);
  if (key.startsWith('room')) state = normalizeRoom(state);
  modified = true;
  queueSave();
  refresh();
}
// Control templates read the current state and evaluation.
const controlView = () => ({ state, evaluation });
const controlValue = (key) => controlValueOf(controlView(), key);
const range = (key, label) => rangeHTML(controlView(), key, label);
const toggle = (key, label) => toggleHTML(controlView(), key, label);
const select = (key, label, options) => selectHTML(controlView(), key, label, options);
const group = groupHTML;
function roomChanged(redraw = false) {
  state = normalizeRoom(state);
  modified = true;
  queueSave();
  if (redraw) renderControls();
  refresh();
}
function selectRoomTarget(target) {
  layoutTarget = target;
  layoutEditing = true;
  $('#layoutBtn').classList.add('active');
  $('#layoutBtn').setAttribute('aria-pressed', 'true');
  renderControls();
  scene?.setLayoutEditing(true, target, true);
  setActiveView('top');
}
function changeRoomValue(key, value, redraw = false) {
  state = updateRoomItem(state, layoutTarget, key, value);
  roomChanged(redraw);
}
function syncRoomInputs() {
  if (!['room', 'furniture'].includes(section)) return;
  const item = roomItem(state, layoutTarget),
    mounted = item?.type === 'wallShelf',
    frame =
      item && isFeature(item)
        ? wallFrame(state, item.wall)
        : mounted
          ? wallFrame(state, item.mountWall)
          : null;
  $('#controls')
    .querySelectorAll('[data-room-key]')
    .forEach((el) => {
      const key = el.dataset.roomKey,
        value = roomValue(state, layoutTarget, key);
      if (['number', 'range'].includes(el.type)) {
        const limits =
          key === 'offset' && frame
            ? [0, Math.max(0, frame.length - item.width)]
            : key === 'elevation' && mounted
              ? [0, state.roomH]
              : key === 'width' && frame && !mounted
                ? [30, item.type === 'wardrobeAccess' ? frame.length : Math.min(300, frame.length)]
                : key === 'height' && frame && !mounted
                  ? [30, state.roomH]
                  : key === 'sill' && frame
                    ? [0, state.roomH - item.height]
                    : key === 'x'
                      ? [-200, state.roomW + 200]
                      : key === 'z'
                        ? [-200, state.roomD + 200]
                        : null;
        if (limits) {
          el.min = limits[0];
          el.max = limits[1];
        }
      }
      if (el !== document.activeElement && value !== undefined) el.value = value;
      if (el.type === 'range')
        el.style.setProperty(
          '--pct',
          `${((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min) || 1)) * 100}%`,
        );
    });
}

function bindRoomEditor() {
  $('#roomTarget')?.addEventListener('change', (event) => selectRoomTarget(event.target.value));
  $('#controls')
    .querySelectorAll('[data-room-key]')
    .forEach((el) => {
      if (el.tagName === 'SELECT') {
        el.addEventListener('change', () => changeRoomValue(el.dataset.roomKey, el.value, true));
        return;
      }
      if (el.type !== 'number' && el.type !== 'range') {
        el.addEventListener('change', () => changeRoomValue(el.dataset.roomKey, el.value, true));
        return;
      }
      const apply = (commit) => {
        if (el.value.trim() === '' || !Number.isFinite(Number(el.value))) return;
        const raw = Number(el.value);
        if (!commit && (raw < Number(el.min) || raw > Number(el.max))) return;
        const value = round(clamp(raw, Number(el.min), Number(el.max)), 1);
        changeRoomValue(el.dataset.roomKey, value, false);
        if (commit) {
          el.value = roomValue(state, layoutTarget, el.dataset.roomKey);
          if (['width', 'height'].includes(el.dataset.roomKey)) renderControls();
        }
      };
      el.addEventListener('input', () => apply(false));
      el.addEventListener('change', () => apply(true));
    });
  $('#controls')
    .querySelectorAll('[data-room-rotate]')
    .forEach((el) =>
      el.addEventListener('click', () =>
        changeRoomValue(
          'angle',
          ((roomValue(state, layoutTarget, 'angle') as number) +
            Number(el.dataset.roomRotate) +
            360) %
            360,
        ),
      ),
    );
  $('#controls')
    .querySelectorAll('[data-add-room]')
    .forEach((el) =>
      el.addEventListener('click', () => {
        const type = el.dataset.addRoom,
          id =
            crypto.randomUUID?.() ||
            'room-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
        if (!canAddRoomItem(state, type)) {
          toast('Límite de elementos alcanzado');
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
            ? 'Acceso añadido. Ajusta las puertas y el espacio libre delante.'
            : stepOfRoomItem(type) === 'openings'
              ? 'Hueco añadido. Ajusta su pared y medidas.'
              : 'Mueble añadido. Arrástralo en planta.',
        );
      }),
    );
  $('#chairAtDesk')?.addEventListener('click', () => {
    if (roomItem(state, layoutTarget)?.type !== 'chair') return;
    state = placeChairAtDesk(state, layoutTarget);
    roomChanged(true);
    scene?.setLayoutEditing(layoutEditing, layoutTarget, true);
    setActiveView('top');
    toast('Silla colocada frente al escritorio');
  });
  $('#roomDelete')?.addEventListener('click', () => {
    if (!roomItem(state, layoutTarget)) return;
    state = deleteRoomItem(state, layoutTarget);
    layoutTarget = 'desk';
    roomChanged(true);
    scene?.setLayoutEditing(layoutEditing, layoutTarget, true);
    toast('Elemento eliminado');
  });
  $('#roomFrame')?.addEventListener('click', () => {
    setActiveView('top');
  });
  $('#roomCenter')?.addEventListener('click', () => {
    state = centerInRoom(state, evaluation);
    roomChanged(true);
    setActiveView('top');
    toast('Mesa y cockpit centrados conservando su distribución');
  });
}
function enterStep(id) {
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
    $('#setupRoomForm')?.reportValidity();
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
    toast('Proyecto preparado. Puedes seguir editando cada parte.');
  } else enterStep(setup.step);
}
function bindCreationControls() {
  $('#setupPreset')?.addEventListener('change', (event) => {
    setup = { ...setup, drafts: { ...setup.drafts, preset: event.target.value } };
    queueSave();
  });
  for (const [group, prefix] of [
    ['room', 'setupRoom'],
    ['desk', 'setupDesk'],
  ]) {
    $(`#${prefix}Form`)?.addEventListener('input', () => {
      const draft = {
        w: $(`#${prefix}W`).value,
        d: $(`#${prefix}D`).value,
        h: $(`#${prefix}H`).value,
      };
      setup = { ...setup, drafts: { ...setup.drafts, [group]: draft } };
      queueSave();
    });
  }
  $('#setupRoomForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    state = withRoomSize(
      state,
      Number($('#setupRoomW').value),
      Number($('#setupRoomD').value),
      Number($('#setupRoomH').value),
    );
    setup = { ...setup, drafts: { ...setup.drafts, room: undefined } };
    modified = true;
    persist();
    continueSetup();
  });
  $('#setupDeskForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    state = withDesk(
      state,
      Number($('#setupDeskW').value),
      Number($('#setupDeskD').value),
      Number($('#setupDeskH').value),
    );
    setup = {
      ...setup,
      deferred: setup.deferred.filter((id) => id !== 'desk'),
      drafts: { ...setup.drafts, desk: undefined },
    };
    layoutTarget = 'desk';
    layoutEditing = true;
    modified = true;
    persist();
    renderControls();
    refresh();
    scene?.setLayoutEditing(true, layoutTarget, false);
    setActiveView('desk');
  });
  $('#setupCockpitForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    state = withCockpitPreset(state, $('#setupPreset').value);
    setup = { ...setup, deferred: setup.deferred.filter((id) => id !== 'cockpit') };
    layoutTarget = 'cockpit';
    modified = false;
    persist();
    renderControls();
    refresh();
    setActiveView('top');
  });
}
function renderWorkflow() {
  const guided = setup.step !== 'complete',
    step = steps.find((s) => s.id === setup.step);
  document.body.dataset.guided = String(guided);
  $('#setupProgress').hidden = !guided;
  $('#setupProgress').innerHTML = guided ? progressHTML(setup) : '';
  $('#setupActions').hidden = !guided;
  $('.config-tabs').hidden = guided;
  $('.preset-area').hidden = !state.cockpitEnabled || !['rig', 'body'].includes(section);
  $('.panel-heading h2').textContent = guided ? step.label : 'Configuración';
  $('#controls').setAttribute('aria-label', guided ? step.title : 'Ajustes');
  $('#setupGuide').hidden = !guided;
  $('#setupGuideTitle').textContent = step?.title || '';
  $('#setupGuideHint').textContent = step?.hint || '';
  const buttons = setupButtons(setup, state);
  $('#setupBack').disabled = buttons.backDisabled;
  $('#setupNext').textContent = buttons.nextLabel;
  $('#setupNext').disabled = buttons.nextDisabled;
  $('#setupSkip').hidden = buttons.skipHidden;
  $('#setupSkip').textContent = buttons.skipLabel;
  const hasScene = state.roomEnabled || state.deskEnabled || state.cockpitEnabled;
  $('#emptyScene').hidden = hasScene;
  $('#personBtn').hidden = !state.cockpitEnabled;
  $('[data-view="desk"]').hidden = !state.deskEnabled;
  $('[data-view="side"]').hidden = !state.cockpitEnabled;
  $('#layoutBtn').disabled = !hasScene;
  $('#layoutBtn').classList.toggle('active', layoutEditing);
  $('#layoutBtn').setAttribute('aria-pressed', String(layoutEditing));
  $('#heightTag').closest('.inspector-section').hidden =
    !state.cockpitEnabled || (guided && setup.step !== 'cockpit');
  $('#deskSizeTag').closest('.inspector-section').hidden =
    !state.deskEnabled || (guided && !['desk', 'cockpit'].includes(setup.step));
  $('#deskSizeTag').closest('.inspector-section').querySelector('h3').lastChild.textContent =
    state.monitorEnabled ? 'Mesa y monitor' : 'Mesa';
  $('#matTag').closest('.inspector-section').hidden =
    !state.deskEnabled ||
    !evaluation.desktopItems.length ||
    (guided && !['desk', 'cockpit'].includes(setup.step));
  $('.reach-card').hidden = !(state.deskEnabled && state.monitorEnabled);
  $('#editArmBtn').hidden = !(state.deskEnabled && state.monitorEnabled);
  const metrics = $$('.metrics>div');
  metrics[0].hidden = !state.cockpitEnabled && !state.roomEnabled;
  metrics[0].querySelector('span').textContent = state.cockpitEnabled
    ? 'HUELLA DEL COCKPIT'
    : 'HABITACIÓN';
  if (!state.cockpitEnabled) {
    $('#metricFootprint').textContent = `${state.roomW} × ${state.roomD} cm`;
    $('#metricWidthNote').textContent = 'Medidas interiores';
  }
  metrics[1].hidden = !state.cockpitEnabled && !state.deskEnabled;
  metrics[1].querySelector(':scope > small').textContent = 'Elementos añadidos, sin paso libre';
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
    ? step.label
    : state.cockpitEnabled
      ? presets[state.preset].label
      : 'Tu habitación';
  if (!hasScene) {
    $('#validationBanner').className = 'validation-banner';
    $('#validationBanner').innerHTML =
      '<span class="status-icon">1</span><div><strong>Define tu espacio</strong><small>Las comprobaciones aparecerán al añadir elementos.</small></div>';
  } else if (!state.cockpitEnabled && !evaluation.errors && !evaluation.warnings) {
    $('#validationBanner').innerHTML =
      '<span class="status-icon">✓</span><div><strong>Sin interferencias detectadas</strong><small>Solo se revisan los elementos añadidos.</small></div>';
  }
}
function renderControls() {
  const guided = setup.step !== 'complete',
    stage = guided ? setup.step : section === 'furniture' ? 'furniture' : 'openings';
  if (['openings', 'furniture'].includes(stage) && ['room', 'furniture'].includes(section)) {
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
  } else if (['room', 'furniture'].includes(section)) {
    html = roomControls(state, evaluation, layoutTarget, range, toggle, {
      mode: section === 'furniture' ? 'furniture' : 'room',
    });
  } else {
    html = deskPanelHTML(controlView(), layoutTarget);
  }
  $('#controls').innerHTML = html;
  bindRoomEditor();
  bindCreationControls();
  $('#bodySettings')?.addEventListener('click', () => switchSection('body'));
  $('#rigSettings')?.addEventListener('click', () => switchSection('rig'));
  $('#controls')
    .querySelectorAll('[data-place]')
    .forEach((b) =>
      b.addEventListener('click', () => {
        layoutTarget = b.dataset.place;
        layoutEditing = true;
        scene?.setLayoutEditing(true, layoutTarget, true);
        setActiveView('top');
        showWorkspace('view');
      }),
    );
  $('#goRoom')?.addEventListener('click', () => {
    switchSection('room');
    setActiveView('top');
  });
  // Diagonal uses inches rather than world units.
  for (const node of $$('[data-key="monitorInches"]')) {
    const wrap = node.closest('.control');
    if (wrap) {
      wrap.querySelector('.number-wrap span').textContent = '″';
      wrap.querySelector('.control-range-label span:last-child').textContent = '49 ″';
      node.setAttribute('aria-label', 'Diagonal de pantalla en pulgadas');
    }
  }
  $('#controls')
    .querySelectorAll('input[type=range][data-key]')
    .forEach((el) =>
      el.addEventListener('input', () => {
        const key = el.dataset.key;
        const val = Number(el.value);
        el.style.setProperty(
          '--pct',
          `${((val - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100}%`,
        );
        $(`#${key}-number`).value = val;
        update(key, val);
      }),
    );
  $('#controls')
    .querySelectorAll('input[data-number]')
    .forEach((el) => {
      const applyNumber = (commit) => {
        const key = el.dataset.key,
          [min, max, step] = fieldSpec(key, state);
        if (el.value.trim() === '' || !Number.isFinite(Number(el.value))) {
          if (commit) el.value = round(controlValue(key), 1);
          return;
        }
        const raw = Number(el.value);
        if (!commit && (raw < min || raw > max)) return;
        const val = round(clamp(Math.round(raw / step) * step, min, max));
        if (commit) el.value = val;
        const slider = $(`#${key}-range`);
        slider.value = val;
        slider.style.setProperty('--pct', `${((val - min) / (max - min)) * 100}%`);
        if (
          controlValue(key) !== val ||
          (['armBaseAngle', 'armElbowAngle', 'monitorYaw'].includes(key) &&
            state.monitorMode !== 'manual')
        )
          update(key, val);
        if (commit) el.value = round(controlValue(key), 1);
      };
      el.addEventListener('input', () => applyNumber(false));
      el.addEventListener('change', () => applyNumber(true));
      el.addEventListener('blur', () => applyNumber(true));
    });
  $('#controls')
    .querySelectorAll('input[type=checkbox]')
    .forEach((el) =>
      el.addEventListener('change', () => {
        update(el.dataset.key, el.checked);
        if (el.dataset.key.endsWith('Enabled')) renderControls();
      }),
    );
  $('#controls')
    .querySelectorAll('select[data-key]')
    .forEach((el) =>
      el.addEventListener('change', () => {
        update(el.dataset.key, el.value);
        if (['clampMount', 'monitorMode', 'roomEnabled', 'roomFullWalls'].includes(el.dataset.key))
          renderControls();
      }),
    );
  $('#layoutTargetSelect')?.addEventListener('change', (event) => {
    layoutTarget = event.target.value;
    layoutEditing = true;
    renderControls();
    renderWorkflow();
    scene?.setLayoutEditing(true, layoutTarget, false);
    setActiveView(desktopTargets.some((t) => t.id === layoutTarget) ? 'desk' : 'top');
  });
  $('#controls')
    .querySelectorAll('[data-rotate]')
    .forEach((button) =>
      button.addEventListener('click', () => {
        const key = layoutTarget + 'Angle';
        update(key, (state[key] + Number(button.dataset.rotate) + 360) % 360);
        renderControls();
      }),
    );
  $('#controls')
    .querySelectorAll('[data-monitor-pose]')
    .forEach((button) =>
      button.addEventListener('click', () => {
        update('monitorMode', button.dataset.monitorPose);
        renderControls();
        setActiveView(button.dataset.monitorPose === 'cockpit' ? 'top' : 'desk');
        focusArmControls();
        toast(
          button.dataset.monitorPose === 'cockpit'
            ? 'Monitor orientado hacia el cockpit. Revisa el alcance del brazo.'
            : 'Monitor colocado sobre el escritorio.',
        );
      }),
    );
  $('#controls')
    .querySelectorAll('#armDragBtn,#armControlsDragBtn')
    .forEach((button) => button.addEventListener('click', startArmEditing));
  $('#clampEdgeSelect')?.addEventListener('change', (event) => {
    const edge = event.target.value;
    state.clampSide = edge;
    const b = deskBounds(state);
    if (edge === 'xmin' || edge === 'xmax') state.clampX = edge === 'xmin' ? -b.anchorX : b.anchorX;
    else state.clampZ = edge === 'zmin' ? -b.anchorZ : b.anchorZ;
    modified = true;
    persist();
    renderControls();
    refresh();
  });
  $('#deskSizePreset')?.addEventListener('change', (event) => {
    if (event.target.value === 'custom') return;
    const [width, depth] = event.target.value.split('x').map(Number);
    state = resizeDesk(state, width, depth);
    modified = true;
    persist();
    renderControls();
    refresh();
    setActiveView('desk');
    toast(`Tablero de ${width} × ${depth} cm aplicado`);
  });
  $('#matPreset')?.addEventListener('change', (event) => {
    if (event.target.value === 'custom') return;
    const [width, depth] = event.target.value.split('x').map(Number);
    state = updateDeskItem({ ...state, matWidth: width }, 'matDepth', depth);
    modified = true;
    persist();
    renderControls();
    refresh();
  });
  $('#layoutPreset')?.addEventListener('change', (event) => {
    if (event.target.value === 'free') return;
    state = layoutPreset(state, event.target.value);
    modified = true;
    persist();
    renderControls();
    refresh();
    setActiveView('top');
    toast('Distribución aplicada. Puedes mover y girar ambos elementos.');
  });
}
function switchSection(value) {
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
  $$('.config-tabs button').forEach((b) => {
    const active = b.dataset.section === (section === 'body' ? 'rig' : section);
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  $('#controls').setAttribute('aria-labelledby', `tab-${value === 'body' ? 'rig' : value}`);
  renderControls();
  renderWorkflow();
  $('#controls').scrollTop = 0;
  scene?.setLayoutEditing(layoutEditing, layoutTarget, ['room', 'furniture'].includes(section));
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
  $('#preset').value = state.preset;
  $('#presetDescription').textContent = presets[state.preset].description;
  $('#sceneTitle').textContent = presets[state.preset].label + (modified ? ' · ajustado' : '');
  $('#desktopChecks').innerHTML = e.desktopChecks.map(checkRowHTML).join('');
  $('#matTag').textContent = `${state.matWidth} × ${state.matDepth}`;
  $('#deskSizeTag').textContent = `${state.deskWidth} × ${state.deskDepth}`;
  const sizeSelect = $('#deskSizePreset');
  if (sizeSelect) {
    const value = `${state.deskWidth}x${state.deskDepth}`;
    sizeSelect.value = [...sizeSelect.options].some((o) => o.value === value) ? value : 'custom';
  }
  $('#controls')
    .querySelectorAll('[data-key]')
    .forEach((el) => {
      const key = el.dataset.key;
      if (el.matches('input[type=range]') || el.hasAttribute('data-number')) {
        const [min, max, step] = fieldSpec(key, state);
        el.min = min;
        el.max = max;
        el.step = step;
        if (el.matches('input[type=range]')) {
          el.value = controlValue(key);
          el.style.setProperty('--pct', `${((controlValue(key) - min) / (max - min)) * 100}%`);
          const labels = el.closest('.control').querySelectorAll('.control-range-label span');
          labels[0].textContent = min;
          labels[1].textContent = `${max} ${unitFor(key)}`;
        } else if (el !== document.activeElement) el.value = round(controlValue(key), 1);
      }
    });

  const mode = $('#monitorMode');
  if (mode) mode.value = state.monitorMode;
  const bend = $('#armBend');
  if (bend) bend.value = state.armBend;
  const lengths = $('#armLengths');
  if (lengths)
    lengths.textContent = `Primer tramo: ${round(e.armPose.first)} cm · segundo tramo: ${round(e.armPose.second)} cm. El codo a 0° deja el brazo estirado; ±180° lo pliega.`;
  const coordinateHint = $('[data-desktop-hint]');
  if (coordinateHint)
    coordinateHint.innerHTML = `Referencia: centro del tablero, que gira con la mesa. X recorre los ${state.deskDepth} cm de fondo; Z los ${state.deskWidth} cm de ancho. Selecciona y arrastra en las vistas <b>Mesa</b> o <b>Planta</b>. También puedes escribir la posición y el giro aquí.`;
  $('#heightTag').textContent = `${state.height} cm`;
  $('#ergonomics').innerHTML = e.bodyCheck.map(checkRowHTML).join('');
  $('#spaceChecks').innerHTML = [
    ...e.spaceCheck,
    ...e.extra.filter((c) => c.id !== 'room' && c.level !== 'ok'),
  ]
    .map(checkRowHTML)
    .join('');
  const banner = $('#validationBanner');
  banner.className = `validation-banner ${e.errors ? 'error' : e.warnings ? 'warning' : ''}`;
  banner.innerHTML = `<span class="status-icon">${e.errors ? '×' : e.warnings ? '!' : '✓'}</span><div><strong>${e.errors ? `${e.errors} ajuste${e.errors > 1 ? 's' : ''} pendiente${e.errors > 1 ? 's' : ''}` : e.warnings ? `${e.warnings} detalle${e.warnings > 1 ? 's' : ''} por revisar` : 'Buen punto de partida'}</strong><small>${e.errors ? 'Consulta las comprobaciones de abajo.' : 'Valida la postura con tu equipo real.'}</small></div>`;
  $('#reachValue').textContent = `${Math.round(e.reach)} / ${state.armReach} cm`;
  $('#reachMax').textContent = `Máx. ${state.armReach} cm`;
  $('#reachMeter').style.width = `${Math.min(100, (e.reach / state.armReach) * 100)}%`;
  $('#reachMeter').classList.toggle('over', e.reach > state.armReach);
  $('#metricFootprint').innerHTML =
    `${state.length} <small>×</small> ${state.width} <small>cm</small>`;
  $('#metricWidthNote').textContent = `${Math.ceil(e.rigRight - e.rigLeft)} cm con accesorios`;
  $('#metricSpace').innerHTML =
    `${Math.ceil(e.spaceW)} <small>×</small> ${Math.ceil(e.spaceD)} <small>cm</small>`;
  $('#metricProfiles').innerHTML =
    `${(e.totalMm / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} <small>m</small>`;
  $('#metricPieces').textContent = `${e.cuts} cortes · serie 40`;
  renderWorkflow();
  scene?.update(state, evaluation);
}
function download(filename, text, type) {
  const blob = new Blob([text], { type }),
    a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportConfig() {
  download(
    'cockpit-lab-configuracion.json',
    JSON.stringify(projectData(state, setup), null, 2),
    'application/json',
  );
  toast('JSON exportado. Usa Abrir JSON para recuperar este diseño.');
}
function summary() {
  const heading = summaryHeading(state);
  $('#summaryTitle').textContent = heading.title;
  $('#summaryDialog .section-kicker').textContent = heading.kicker;
  $('#csvBtn').hidden = !evaluation.parts.length && !evaluation.accessories.length;
  $('#summaryContent').innerHTML = usesPartialSummary(state, setup)
    ? partialSummary(state, evaluation, setup, roomSummaryHTML(state))
    : fullSummaryHTML(state, evaluation);
  $('#summaryDialog').showModal();
}
$$('.config-tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    switchSection(b.dataset.section);
    if (['room', 'furniture'].includes(b.dataset.section)) {
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
    const tabs = $$('.config-tabs button'),
      i = tabs.findIndex((t) => t.dataset.section === (section === 'body' ? 'rig' : section)),
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
  const key = $('#preset').value;
  state = { ...state, ...presets[key].values, preset: key, cockpitEnabled: true };
  modified = false;
  persist();
  renderControls();
  refresh();
  toast(`Preset ${presets[key].label} aplicado`);
});
$('#resetBtn').addEventListener('click', () => $('#resetDialog').showModal());
$('#confirmReset').addEventListener('click', () => {
  project = createProject();
  state = project.config;
  setup = project.setup;
  modified = false;
  layoutTarget = '';
  layoutEditing = false;
  clearTimeout(pendingSave);
  persist();
  $('#resetDialog').close();
  enterStep('room');
  toast('Proyecto nuevo. Empieza por tu habitación.');
});
function setActiveView(next) {
  view = next;
  $$('[data-view]').forEach((t) => {
    const active = t.dataset.view === view;
    t.classList.toggle('active', active);
    t.setAttribute('aria-pressed', String(active));
  });
  scene?.setView(view);
  $('.viewport-note span').textContent =
    view === 'iso'
      ? 'Arrastra para girar · rueda para acercar'
      : ['top', 'desk'].includes(view) && layoutEditing
        ? layoutTarget === 'arm'
          ? 'Arrastra CODO o VESA · anclaje sobre el tablero'
          : 'Arrastra un elemento · selecciona y gira en ' +
            (['room', 'furniture'].includes(section) ? 'Habitación' : 'Mesa')
        : 'Rueda para acercar · arrastra para desplazar';
}
$$('[data-view]').forEach((b) => b.addEventListener('click', () => setActiveView(b.dataset.view)));
$('#layoutBtn').addEventListener('click', () => {
  layoutEditing = !layoutEditing;
  $('#layoutBtn').classList.toggle('active', layoutEditing);
  $('#layoutBtn').setAttribute('aria-pressed', String(layoutEditing));
  scene?.setLayoutEditing(layoutEditing, layoutTarget, ['room', 'furniture'].includes(section));
  if (layoutEditing) {
    if (setup.step === 'complete' && !['room', 'furniture', 'rig'].includes(section))
      switchSection('desk');
    setActiveView(desktopTargets.some((t) => t.id === layoutTarget) ? 'desk' : 'top');
  } else setActiveView(view);
});
$('#dimensionBtn').addEventListener('click', () => {
  const on = $('#dimensionBtn').getAttribute('aria-pressed') !== 'true';
  $('#dimensionBtn').setAttribute('aria-pressed', String(on));
  $('#dimensionBtn').setAttribute('aria-label', on ? 'Ocultar cotas' : 'Mostrar cotas');
  $('#dimensionBtn').classList.toggle('active', on);
  scene?.setDimensions(on);
});
$('#personBtn').addEventListener('click', () => {
  const on = $('#personBtn').getAttribute('aria-pressed') !== 'true';
  $('#personBtn').setAttribute('aria-pressed', String(on));
  $('#personBtn').setAttribute('aria-label', on ? 'Ocultar piloto' : 'Mostrar piloto');
  $('#personBtn').classList.toggle('active', on);
  scene?.setPerson(on);
});
$('#fitBtn').addEventListener('click', () => scene?.setView(view));
function focusArmControls() {
  const panel = $('#controls'),
    arm = $('#armControls') || $('#monitorPositionControls');
  if (arm) panel.scrollTop += arm.getBoundingClientRect().top - panel.getBoundingClientRect().top;
}
function showWorkspace(next) {
  document.body.dataset.workspace = next;
  $$('.studio-nav button').forEach((button) => {
    const active = button.dataset.workspace === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
$$('.studio-nav button').forEach((button) =>
  button.addEventListener('click', () => showWorkspace(button.dataset.workspace)),
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
  toast('Arrastra CODO o VESA; también puedes usar sus controles de giro.');
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
  scene?.setLayoutEditing(layoutEditing, layoutTarget, ['room', 'furniture'].includes(section));
  setActiveView('desk');
});
$('#helpBtn').addEventListener('click', () => $('#helpDialog').showModal());
$('#openSummary').addEventListener('click', summary);
$$('[data-close]').forEach((b) =>
  b.addEventListener('click', () => $(`#${b.dataset.close}`).close()),
);
$$('dialog').forEach((d) =>
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
  download('cockpit-lab-lista-cortes.csv', cutListCsv(evaluation), 'text/csv;charset=utf-8');
  toast('Lista de cortes descargada');
});
$('#printBtn').addEventListener('click', () => window.print());
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#loadConfig').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error('Archivo demasiado grande');
    const data = readProject(JSON.parse(await file.text()));
    state = data.config;
    setup = data.setup;
    modified = true;
    persist();
    renderControls();
    refresh();
    $('#summaryDialog').close();
    if (setup.step !== 'complete') enterStep(setup.step);
    else {
      switchSection('room');
      setActiveView('iso');
    }
    toast('Configuración cargada');
  } catch {
    toast('No se pudo cargar: usa un JSON exportado por Cockpit Lab.');
  }
  event.target.value = '';
});
window.addEventListener('pagehide', () => {
  clearTimeout(pendingSave);
  persist();
});
$('#setupProgress').addEventListener('click', (event) => {
  const button = event.target.closest('[data-step]');
  if (button && !button.disabled) enterStep(button.dataset.step);
});
$('#setupBack').addEventListener('click', () => {
  const index = steps.findIndex((s) => s.id === setup.step);
  if (index > 0) enterStep(steps[index - 1].id);
});
$('#setupNext').addEventListener('click', () => {
  if (setup.step === 'room') $('#setupRoomForm')?.requestSubmit();
  else continueSetup();
});
$('#setupSkip').addEventListener('click', () => continueSetup(true));
$('#newProject').addEventListener('click', () => $('#resetDialog').showModal());
if (setup.step !== 'complete') showWorkspace('config');
renderControls();
refresh();
try {
  scene = new CockpitScene($('#viewport'), $('#sceneLabels'));
  scene.update(state, evaluation);
  setActiveView(view);
  scene.setLayoutEditing(layoutEditing, layoutTarget, ['room', 'furniture'].includes(section));
  scene.onArmMove = (joint, x, z) => {
    state = moveArmJoint(state, joint, x, z);
    modified = true;
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
    } else if (section === 'desk' || ['room', 'furniture'].includes(section)) renderControls();
    scene.setLayoutEditing(layoutEditing, layoutTarget, ['room', 'furniture'].includes(section));
  };
  scene.onLayoutMove = (target, x, z) => {
    const item = desktopTargets.find((t) => t.id === target),
      previousEdge = clampEdge(state);
    if (target.startsWith('feature:') || target.startsWith('furniture:'))
      state = moveRoomTarget(state, target, x, z);
    else if (item) state = placeDeskItem(state, target, x, z);
    else {
      state[target + 'X'] = round(clamp(x, -1500, 1500));
      state[target + 'Z'] = round(clamp(z, -1500, 1500));
    }
    modified = true;
    queueSave();
    if (target === 'arm' && previousEdge !== clampEdge(state) && section === 'desk')
      renderControls();
    refresh();
  };
} catch (error) {
  console.error(error);
  $('#webglFallback').hidden = false;
}
// Read-only view of the current state and calculations, for checking a configuration.
// The end-to-end tests read the app through it (e2e/support.ts): keep its shape.
(window as any).cockpitLab = {
  getState: () => structuredClone(state),
  getEvaluation: () => structuredClone(evaluation),
};
