import { deskElementControls, monitorShortcuts } from './desk-editor.ts';
import { steps, createProject, readProject, projectData, advanceSetup } from './project.ts';
import {
  creationControls,
  accessoryControls,
  placementControls,
  progressHTML,
} from './setup-editor.ts';
import { partialSummary } from './project-summary.ts';
import {
  normalizeRoom,
  moveRoomTarget,
  wallFrame,
  furnitureNames,
  officeChairPlacement,
} from './room.ts';
import { roomControls, roomItem, roomItems, roomValue, escapeHTML } from './room-editor.ts';
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
const KEY = 'cockpit-lab-v2';
let project = createProject(),
  state: any = project.config,
  setup: any = project.setup,
  section = 'room',
  view = 'top',
  modified = false,
  scene,
  layoutTarget = '',
  layoutEditing = false;
try {
  const saved = localStorage.getItem(KEY) || localStorage.getItem('cockpit-lab-v1');
  if (saved) {
    project = readProject(JSON.parse(saved), { stored: true });
    state = project.config;
    setup = project.setup;
    setSaveStatus('Diseño recuperado de este navegador');
  }
} catch {
  setSaveStatus('No se pudo recuperar el guardado. Puedes abrir una copia JSON.', 'error');
}
if (setup.step === 'complete') view = 'iso';
else
  section = ['room', 'openings', 'furniture'].includes(setup.step)
    ? 'room'
    : setup.step === 'desk'
      ? 'desk'
      : 'rig';
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
  try {
    localStorage.setItem(KEY, JSON.stringify(projectData(state, setup)));
    setSaveStatus('Guardado en este navegador');
  } catch {
    setSaveStatus('Sin autoguardado · exporta un JSON', 'error');
  }
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
const unitFor = (k) =>
  k === 'monitorInches'
    ? '″'
    : k === 'armSplit'
      ? '%'
      : ['recline', 'wheelTilt', 'pedalTilt', 'monitorYaw'].includes(k) || k.endsWith('Angle')
        ? '°'
        : 'cm';
function controlValue(key) {
  return rigHeightKeys.includes(key)
    ? floorHeight(state, key)
    : key === 'armBaseAngle'
      ? evaluation.armPose.baseAngle
      : key === 'armElbowAngle'
        ? evaluation.armPose.elbowAngle
        : key === 'monitorYaw'
          ? wrapAngle(evaluation.monitorAngle - state.deskAngle)
          : state[key];
}
function range(key, label) {
  const [min, max, step] = fieldSpec(key, state),
    value = round(controlValue(key), 1);
  return `<div class="control"><div class="control-top"><label for="${key}-range">${label}</label><div class="number-wrap"><input id="${key}-number" type="number" data-key="${key}" data-number min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}, valor en ${unitFor(key)}"><span>${unitFor(key)}</span></div></div><input id="${key}-range" type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}" style="--pct:${((value - min) / (max - min)) * 100}%"><div class="control-range-label"><span>${min}</span><span>${max} ${unitFor(key)}</span></div></div>`;
}
function toggle(key, label) {
  return `<div class="toggle-control"><label for="${key}">${label}</label><label class="switch"><input type="checkbox" id="${key}" data-key="${key}" ${state[key] ? 'checked' : ''} aria-label="${label}"><span class="switch-track"></span></label></div>`;
}
function select(key, label, options) {
  return `<div class="select-control"><label for="${key}">${label}</label><select id="${key}" data-key="${key}">${options.map(([value, text]) => `<option value="${value}" ${state[key] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></div>`;
}
const group = (title, html, hint = '') =>
  `<div class="control-group"><h3 class="group-title">${title}${hint ? `<span>${hint}</span>` : ''}</h3>${html}</div>`;
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
  const item = roomItem(state, layoutTarget);
  if (item) {
    const list = item.wall ? 'roomFeatures' : 'roomFurniture';
    const adjusted = key === 'x' ? value + state.roomX : key === 'z' ? value + state.roomZ : value;
    state = {
      ...state,
      [list]: state[list].map((v) => (v.id === item.id ? { ...v, [key]: adjusted } : v)),
    };
  } else if (['desk', 'cockpit'].includes(layoutTarget)) {
    if (key === 'x') state[layoutTarget + 'X'] = value + state.roomX;
    else if (key === 'z') state[layoutTarget + 'Z'] = value + state.roomZ;
    else if (key === 'angle') state[layoutTarget + 'Angle'] = value;
  }
  roomChanged(redraw);
}
function syncRoomInputs() {
  if (!['room', 'furniture'].includes(section)) return;
  const item = roomItem(state, layoutTarget),
    mounted = item?.type === 'wallShelf',
    frame = item?.wall
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
          (roomValue(state, layoutTarget, 'angle') + Number(el.dataset.roomRotate) + 360) % 360,
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
            'room-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9),
          opening = ['door', 'window', 'wardrobeAccess'].includes(type);
        if (
          (opening && state.roomFeatures.length >= 24) ||
          (!opening && state.roomFurniture.length >= 30)
        ) {
          toast('Límite de elementos alcanzado');
          return;
        }
        if (type === 'wardrobeAccess')
          state = {
            ...state,
            roomFeatures: [
              ...state.roomFeatures,
              {
                id,
                type,
                name: 'Armario empotrado',
                wall: 'north',
                width: Math.min(180, state.roomW),
                offset: Math.max(0, (state.roomW - 180) / 2),
                clearance: 80,
              },
            ],
          };
        else if (opening) {
          state = {
            ...state,
            roomFeatures: [
              ...state.roomFeatures,
              {
                id,
                type,
                name: type === 'door' ? 'Puerta' : 'Ventana',
                wall: type === 'door' ? 'south' : 'north',
                offset: type === 'door' ? 20 : Math.max(0, (state.roomW - 120) / 2),
                width: type === 'door' ? 80 : 120,
                height: type === 'door' ? 205 : 120,
                sill: type === 'door' ? 0 : 100,
                hinge: 'start',
                swing: 'in',
                openAngle: 90,
                clearance: 60,
              },
            ],
          };
        } else if (type === 'wallShelf')
          state = {
            ...state,
            roomFurniture: [
              ...state.roomFurniture,
              {
                id,
                type,
                name: furnitureNames[type],
                mountWall: 'north',
                width: 100,
                depth: 30,
                height: 40,
                elevation: 140,
              },
            ],
          };
        else if (type === 'chair') {
          const chair = {
            id,
            type,
            name: 'Silla de PC',
            width: 65,
            depth: 65,
            height: 115,
            seatHeight: 47,
            pullback: 50,
          };
          state = {
            ...state,
            roomFurniture: [
              ...state.roomFurniture,
              {
                ...chair,
                ...(state.deskEnabled !== false
                  ? officeChairPlacement(state, chair)
                  : {
                      x: state.roomX + state.roomW / 2,
                      z: state.roomZ + state.roomD / 2,
                      angle: 0,
                    }),
              },
            ],
          };
        } else
          state = {
            ...state,
            roomFurniture: [
              ...state.roomFurniture,
              {
                id,
                type,
                name: furnitureNames[type],
                x: state.roomX + state.roomW / 2,
                z: state.roomZ + state.roomD / 2,
                width: type === 'bed' ? 140 : 80,
                depth: type === 'bed' ? 200 : type === 'wardrobe' ? 55 : 35,
                height: type === 'bed' ? 60 : type === 'wardrobe' ? 200 : 100,
                angle: 0,
              },
            ],
          };
        setup = {
          ...setup,
          deferred: setup.deferred.filter(
            (id) => id !== (opening && type !== 'wardrobeAccess' ? 'openings' : 'furniture'),
          ),
        };
        state.roomEnabled = true;
        state = normalizeRoom(state);
        layoutTarget = (opening ? 'feature:' : 'furniture:') + id;
        roomChanged(true);
        selectRoomTarget(layoutTarget);
        toast(
          type === 'wardrobeAccess'
            ? 'Acceso añadido. Ajusta las puertas y el espacio libre delante.'
            : opening
              ? 'Hueco añadido. Ajusta su pared y medidas.'
              : 'Mueble añadido. Arrástralo en planta.',
        );
      }),
    );
  $('#chairAtDesk')?.addEventListener('click', () => {
    const item = roomItem(state, layoutTarget);
    if (item?.type !== 'chair') return;
    state = {
      ...state,
      roomFurniture: state.roomFurniture.map((v) =>
        v.id === item.id ? { ...v, ...officeChairPlacement(state, v) } : v,
      ),
    };
    roomChanged(true);
    scene?.setLayoutEditing(layoutEditing, layoutTarget, true);
    setActiveView('top');
    toast('Silla colocada frente al escritorio');
  });
  $('#roomDelete')?.addEventListener('click', () => {
    const item = roomItem(state, layoutTarget);
    if (!item) return;
    const list = item.wall ? 'roomFeatures' : 'roomFurniture';
    state = { ...state, [list]: state[list].filter((v) => v.id !== item.id) };
    layoutTarget = 'desk';
    roomChanged(true);
    scene?.setLayoutEditing(layoutEditing, layoutTarget, true);
    toast('Elemento eliminado');
  });
  $('#roomFrame')?.addEventListener('click', () => {
    setActiveView('top');
  });
  $('#roomCenter')?.addEventListener('click', () => {
    const e = evaluation,
      dx = state.roomX + state.roomW / 2 - (e.allLeft + e.allRight) / 2,
      dz = state.roomZ + state.roomD / 2 - (e.allBack + e.allFront) / 2;
    state = {
      ...state,
      deskX: round(state.deskX + dx),
      deskZ: round(state.deskZ + dz),
      cockpitX: round(state.cockpitX + dx),
      cockpitZ: round(state.cockpitZ + dz),
    };
    roomChanged(true);
    setActiveView('top');
    toast('Mesa y cockpit centrados conservando su distribución');
  });
}
function roomSummary(s) {
  if (s.roomEnabled === false) return '';
  const a = escapeHTML;
  return `<h3 class="summary-title">Habitación y obstáculos<span>Medidas en cm</span></h3><table class="summary-table"><thead><tr><th>Elemento</th><th>Ubicación</th><th>Medidas / apertura</th></tr></thead><tbody>${s.roomFeatures.map((v) => `<tr><td>${a(v.name)}</td><td>Pared ${wallFrame(s, v.wall).corner} · inicio ${v.offset}</td><td>${v.type === 'wardrobeAccess' ? `Puertas correderas · ancho ${v.width} · alto ${v.height} · acceso libre delante ${v.clearance}` : `${v.width} × ${v.height} · ${v.type === 'door' ? v.openAngle + '° ' + (v.swing === 'in' ? 'interior' : 'exterior') : 'antepecho ' + v.sill + ' · reserva ' + v.clearance}`}</td></tr>`).join('')}${s.roomFurniture.map((v) => `<tr><td>${a(v.name)}</td><td>${v.type === 'wallShelf' ? `Pared ${wallFrame(s, v.mountWall).corner} · inicio ${v.offset} · base ${v.elevation} cm` : `X ${round(v.x - s.roomX)} / Z ${round(v.z - s.roomZ)} · ${v.angle}°`}</td><td>${v.width} × ${v.depth} × ${v.height}${v.type === 'chair' ? ` · asiento ${v.seatHeight} · retirada ${v.pullback}` : ''}</td></tr>`).join('')}</tbody></table>`;
}
function enterStep(id) {
  setup = { ...setup, step: id };
  section = ['room', 'openings', 'furniture'].includes(id)
    ? 'room'
    : id === 'desk'
      ? 'desk'
      : 'rig';
  layoutTarget = id === 'desk' ? 'desk' : id === 'cockpit' ? 'cockpit' : '';
  layoutEditing = state.roomEnabled;
  showWorkspace('config');
  switchSection(section);
  persist();
  refresh();
  setActiveView(id === 'desk' && state.deskEnabled ? 'desk' : 'top');
}
function continueSetup(defer = false) {
  const step = setup.step;
  if (step === 'room' && !state.roomEnabled) {
    $('#setupRoomForm')?.reportValidity();
    return;
  }
  if (step === 'desk' && !state.deskEnabled && !defer) return;
  if (step === 'cockpit' && !state.cockpitEnabled && !defer) return;
  if (step === 'openings' && !roomItems(state, 'openings').length) defer = true;
  if (step === 'furniture' && !roomItems(state, 'furniture').length) defer = true;
  setup = advanceSetup(setup, { defer });
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
    state = normalizeRoom({
      ...state,
      roomEnabled: true,
      roomW: Number($('#setupRoomW').value),
      roomD: Number($('#setupRoomD').value),
      roomH: Number($('#setupRoomH').value),
    });
    setup = { ...setup, drafts: { ...setup.drafts, room: undefined } };
    modified = true;
    persist();
    continueSetup();
  });
  $('#setupDeskForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    state = resizeDesk(
      {
        ...state,
        deskEnabled: true,
        deskH: Number($('#setupDeskH').value),
        deskX: state.roomX + state.roomW / 2,
        deskZ: state.roomZ + state.roomD / 2,
        monitorMode: 'desk',
      },
      Number($('#setupDeskW').value),
      Number($('#setupDeskD').value),
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
    const preset = $('#setupPreset').value,
      values = presets[preset].values;
    state = {
      ...state,
      ...values,
      preset,
      cockpitEnabled: true,
      cockpitX: state.roomX + state.roomW / 2,
      cockpitZ: state.roomZ + Math.max(0, (state.roomD - values.length) / 2),
    };
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
  $('#setupBack').disabled = setup.step === 'room';
  $('#setupNext').textContent = setup.step === 'cockpit' ? 'Terminar' : 'Continuar';
  $('#setupNext').disabled =
    setup.step === 'desk'
      ? !state.deskEnabled
      : setup.step === 'cockpit'
        ? !state.cockpitEnabled
        : false;
  const canDefer =
    ['openings', 'furniture'].includes(setup.step) ||
    (setup.step === 'desk' && !state.deskEnabled) ||
    (setup.step === 'cockpit' && !state.cockpitEnabled);
  $('#setupSkip').hidden = !canDefer;
  $('#setupSkip').textContent = setup.step === 'desk' ? 'No necesito mesa' : 'Añadir después';
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
    if (!items.some((v) => (v.wall ? 'feature:' : 'furniture:') + v.id === layoutTarget))
      layoutTarget = items[0] ? (items[0].wall ? 'feature:' : 'furniture:') + items[0].id : '';
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
    html +=
      '<button class="arm-edit-action" id="bodySettings">Ajustar asiento, postura y mandos →</button>';
    html += placementControls('cockpit', range);
    html += group(
      'Base de aluminio',
      range('length', 'Largo del chasis') +
        range('width', 'Ancho exterior') +
        range('baseLift', 'Elevación de la base') +
        '<p class="layout-hint">Sube juntos el asiento, el volante, los pedales y los mandos laterales, conservando tu postura. 0 cm mantiene la base original. Los pies o ruedas siguen en el suelo. La mesa y el monitor conservan su altura.</p>',
      '40 × 80 / 40 × 40',
    );
    html += group(
      'Módulos y mandos',
      toggle('wheel', 'Volante y base DD') +
        toggle('hotas', 'HOTAS lateral') +
        toggle('centerStick', 'Joystick central') +
        toggle('shifter', 'Cambio en H') +
        toggle('handbrake', 'Freno de mano') +
        select('drivingSide', 'Lado del cambio y freno', [
          ['right', 'Derecha del piloto'],
          ['left', 'Izquierda del piloto'],
        ]) +
        select('feet', 'Apoyo', [
          ['level', 'Pies niveladores'],
          ['casters', 'Ruedas con freno'],
        ]),
    );
    html +=
      '<p class="control-hint">Derecha e izquierda del cambio y freno se miran sentado al volante. Chasis fijo y módulos desmontables. El ancho total incluye los accesorios activos. La selección de perfiles es preliminar; no calcula rigidez para tu base DD.</p>';
  } else if (section === 'body') {
    html += '<button class="arm-edit-action" id="rigSettings">← Volver al cockpit</button>';
    html += group('Tu punto de partida', range('height', 'Tu estatura'));
    html += group(
      'Asiento',
      range('seatZ', 'Posición longitudinal') +
        range('seatH', 'Altura del cojín') +
        range('recline', 'Reclinación del respaldo'),
      'Desde atrás / suelo',
    );
    if (state.wheel)
      html += group(
        'Volante',
        range('wheelZ', 'Posición longitudinal') +
          range('wheelH', 'Altura del centro') +
          range('wheelTilt', 'Inclinación de la base'),
      );
    html += group(
      'Pedalera',
      range('pedalZ', 'Posición longitudinal') +
        range('pedalH', 'Altura de plataforma') +
        range('pedalTilt', 'Inclinación de plataforma'),
    );
    if (state.hotas || state.shifter || state.handbrake)
      html += group(
        'Mandos laterales',
        range('hotasZ', 'Posición longitudinal') +
          range('hotasH', 'Altura de las placas') +
          range('hotasOut', 'Salida desde el chasis'),
      );
    if (state.centerStick)
      html += group(
        'Joystick central',
        range('stickZ', 'Posición longitudinal') + range('stickH', 'Altura de la placa'),
      );
    html +=
      '<p class="control-hint">Las posiciones parten del extremo trasero del chasis y las alturas, del suelo, incluida la elevación de la base. Ajusta la elevación del conjunto en Cockpit → Base de aluminio. Reclinar se mide desde la vertical. Activa el piloto para explorar la postura.</p>';
  } else if (['room', 'furniture'].includes(section)) {
    html = roomControls(state, evaluation, layoutTarget, range, toggle, {
      mode: section === 'furniture' ? 'furniture' : 'room',
    });
  } else {
    html += accessoryControls(toggle);
    const size = `${state.deskWidth}x${state.deskDepth}`;
    html += group(
      'Tablero de la mesa',
      `<div class="select-control"><label for="deskSizePreset">Medida rápida</label><select id="deskSizePreset"><option value="custom">Personalizada</option>${['120x60', '120x80', '140x60', '140x80', '160x80', '180x80', '200x80'].map((value) => `<option value="${value}" ${value === size ? 'selected' : ''}>${value.replace('x', ' × ')} cm</option>`).join('')}</select></div>` +
        range('deskWidth', 'Ancho del tablero') +
        range('deskDepth', 'Fondo del tablero') +
        '<p class="layout-hint">Ancho × fondo. Los objetos conservan su tamaño y se recolocan dentro del tablero cuando caben. Los pies de referencia mantienen 66 cm de fondo.</p>',
      'Ancho × fondo',
    );
    if (state.monitorEnabled !== false) {
      html += group(
        'Monitor y brazo articulado',
        monitorShortcuts(state) +
          select('monitorMode', 'Posición del monitor', [
            ['cockpit', 'Frente al cockpit'],
            ['desk', 'Sobre escritorio'],
            ['vr', 'VR · aparcado'],
            ['manual', 'Articulaciones manuales'],
          ]) +
          `<button class="arm-edit-action" id="armControlsDragBtn">Editar articulaciones en planta ↗</button>` +
          range('armBaseAngle', 'Giro de la base') +
          range('armElbowAngle', 'Flexión del codo') +
          range('monitorYaw', 'Giro de la pantalla (VESA)') +
          select('armBend', 'Lado de flexión', [
            ['positive', 'Codo hacia un lado'],
            ['negative', 'Codo hacia el otro'],
          ]) +
          range('monitorH', 'Altura centro VESA') +
          range('monitorAhead', 'Pantalla delante volante') +
          range('monitorInches', 'Diagonal de pantalla') +
          '<p class="layout-hint">Arrastra <b>CODO</b> para girar el primer tramo o <b>VESA</b> para mover el extremo. Los controles de giro activan el modo manual. Los botones de colocación vuelven a calcular la postura hacia el destino.</p>',
      ).replace('<div class="control-group">', '<div class="control-group" id="armControls">');
      html += group(
        'Medidas del brazo',
        range('armReach', 'Longitud total de los tramos') +
          range('armSplit', 'Primer tramo (% del total)') +
          `<p class="layout-hint" id="armLengths">Primer tramo: ${round(evaluation.armPose.first)} cm · segundo tramo: ${round(evaluation.armPose.second)} cm. El codo a 0° deja el brazo estirado; ±180° lo pliega.</p>` +
          range('armMinH', 'Altura VESA mínima') +
          range('armMaxH', 'Altura VESA máxima'),
        'Modelo genérico de 2 tramos',
      );
    }
    html += deskElementControls(state, evaluation, layoutTarget, { range, select });
    if (state.cockpitEnabled !== false)
      html += group(
        'Colocación rápida',
        `<div class="select-control"><label for="layoutPreset">Mesa respecto al cockpit</label><select id="layoutPreset"><option value="free">Personalizada</option><option value="right">Mesa a la derecha</option><option value="left">Mesa a la izquierda</option><option value="front">Mesa enfrente</option></select></div>`,
      );
    html += group('Altura de mesa', range('deskH', 'Altura del tablero'), 'Altura desde suelo');
    html += '<button class="arm-edit-action" id="goRoom">Habitación, puertas y muebles ↗</button>';
    html +=
      '<p class="control-hint">Posición y giro de mesa y cockpit independientes. La zona permanece fija al moverlos. El brazo mantiene dos tramos de longitud fija y comprueba su alcance mínimo/máximo y altura VESA. Los giros son en planta; verifica los topes y cargas del modelo real. Diagonal en pulgadas (″), resto en cm. Configura paredes, puertas, ventanas y muebles en la pestaña Habitación.</p>';
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
function row(c) {
  return `<div class="check-row ${c.level}"><div class="check-name">${escapeHTML(c.label)}<small>${escapeHTML(c.detail)}</small></div><div class="check-value">${escapeHTML(c.value)}<span class="check-mark">${c.level === 'ok' ? '✓' : c.level === 'error' ? '×' : '!'}</span></div></div>`;
}
function refresh() {
  evaluation = evaluate(state);
  const e = evaluation;
  syncRoomInputs();
  $('#roomInspector').hidden = state.roomEnabled === false;
  $('#roomSizeTag').textContent = `${state.roomW} × ${state.roomD}`;
  $('#roomChecks').innerHTML = [...e.extra.filter((c) => c.id === 'room'), ...e.room.checks]
    .map(row)
    .join('');
  $('#preset').value = state.preset;
  $('#presetDescription').textContent = presets[state.preset].description;
  $('#sceneTitle').textContent = presets[state.preset].label + (modified ? ' · ajustado' : '');
  $('#desktopChecks').innerHTML = e.desktopChecks.map(row).join('');
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
  $('#ergonomics').innerHTML = e.bodyCheck.map(row).join('');
  $('#spaceChecks').innerHTML = [
    ...e.spaceCheck,
    ...e.extra.filter((c) => c.id !== 'room' && c.level !== 'ok'),
  ]
    .map(row)
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
  const e = evaluation,
    s = state;
  $('#summaryTitle').textContent = state.cockpitEnabled
    ? 'Tu cockpit, pieza a pieza.'
    : 'Resumen del proyecto';
  $('#summaryDialog .section-kicker').textContent = state.cockpitEnabled
    ? 'DEL DISEÑO AL TALLER'
    : 'TU ESPACIO';
  $('#csvBtn').hidden = !e.parts.length && !e.accessories.length;
  if (
    !state.roomEnabled ||
    setup.step !== 'complete' ||
    [
      'deskEnabled',
      'cockpitEnabled',
      'monitorEnabled',
      'keyboardEnabled',
      'pcEnabled',
      'mouseEnabled',
      'matEnabled',
    ].some((key) => state[key] === false)
  ) {
    $('#summaryContent').innerHTML = partialSummary(state, evaluation, setup, roomSummary(state));
    $('#summaryDialog').showModal();
    return;
  }
  const fmt = (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  const dims = [
    ['Preset', presets[s.preset].label],
    ['Estatura de referencia', `${s.height} cm`],
    ['Elevación de la base', `${rigLift(s)} cm · eje del chasis a ${10 + rigLift(s)} cm del suelo`],
    ['Chasis exterior', `${s.length} × ${s.width} cm`],
    ['Ancho con accesorios', `${Math.ceil(e.rigRight - e.rigLeft)} cm`],
    ['Asiento · posición / altura', `${s.seatZ} / ${floorHeight(s, 'seatH')} cm`],
    ['Respaldo desde vertical', `${s.recline}°`],
    [
      'Volante · posición / centro',
      s.wheel ? `${s.wheelZ} / ${floorHeight(s, 'wheelH')} cm · ${s.wheelTilt}°` : 'Desactivado',
    ],
    [
      'Pedalera · posición / altura',
      `${s.pedalZ} / ${floorHeight(s, 'pedalH')} cm · ${s.pedalTilt}°`,
    ],
    [
      'Mandos laterales · pos. / altura',
      s.hotas || s.shifter || s.handbrake
        ? `${s.hotasZ} / ${floorHeight(s, 'hotasH')} cm · salida ${s.hotasOut}`
        : 'Desactivados',
    ],
    [
      'Cambio y freno · lado',
      s.shifter || s.handbrake
        ? s.drivingSide === 'left'
          ? 'Izquierda del piloto'
          : 'Derecha del piloto'
        : 'Desactivados',
    ],
    [
      'Joystick central · pos. / altura',
      s.centerStick ? `${s.stickZ} / ${floorHeight(s, 'stickH')} cm` : 'Desactivado',
    ],
    ['Mesa · tablero / altura', `${s.deskWidth} × ${s.deskDepth} / ${s.deskH} cm`],
    ['Mesa · posición X / Z', `${s.deskX} / ${s.deskZ} cm`],
    ['Mesa · giro en planta', `${s.deskAngle}°`],
    ['Cockpit · posición X / Z', `${s.cockpitX} / ${s.cockpitZ} cm`],
    ['Cockpit · giro en planta', `${s.cockpitAngle}°`],
    ['Habitación · ancho / fondo / alto', `${s.roomW} / ${s.roomD} / ${s.roomH} cm`],
    ['Habitación · origen X / Z', `${s.roomX} / ${s.roomZ} cm`],
    ['Monitor · diagonal / altura', `${s.monitorInches}″ / ${s.monitorH} cm`],
    [
      'Monitor · modo',
      {
        cockpit: 'Cockpit',
        desk: 'Escritorio',
        vr: 'VR · aparcado',
        manual: 'Articulaciones manuales',
      }[s.monitorMode],
    ],
    ['Anclaje · X / Z en tablero', `${s.clampX} / ${s.clampZ} cm`],
    ['Anclaje · fijación', s.clampMount === 'grommet' ? 'Pasante' : 'Mordaza'],
    ['Brazo · necesario / declarado', `${Math.round(e.reach)} / ${s.armReach} cm`],
    ['Brazo · tramos base / terminal', `${round(e.armPose.first)} / ${round(e.armPose.second)} cm`],
    [
      'Brazo · base / codo / VESA',
      `${round(e.armPose.baseAngle)}° / ${round(e.armPose.elbowAngle)}° / ${round(wrapAngle(e.monitorAngle - s.deskAngle))}°`,
    ],
    ['Zona libre / paso deseado', `${s.roomW} × ${s.roomD} / ${s.aisle} cm`],
  ];
  $('#summaryContent').innerHTML =
    `<div class="summary-inner"><div class="summary-stats"><div><small>Chasis exterior</small><b>${s.length} × ${s.width} cm</b></div><div><small>Conjunto sin paso</small><b>${Math.ceil(e.spaceW)} × ${Math.ceil(e.spaceD)} cm</b></div><div><small>Perfil neto / +10 % compra</small><b>${fmt(e.totalMm / 1000)} / ${fmt((e.totalMm / 1000) * 1.1)} m</b></div><div><small>Cortes de aluminio</small><b>${e.cuts} piezas</b></div></div><h3 class="summary-title">Geometría de tu configuración<span>Alturas desde suelo · posiciones desde atrás</span></h3><div class="summary-dims">${dims.map(([n, v]) => `<p>${n}<b>${v}</b></p>`).join('')}</div>${roomSummary(s)}<h3 class="summary-title">Sobre el escritorio<span>Coordenadas desde el centro del tablero</span></h3><table class="summary-table"><thead><tr><th>Elemento</th><th>Huella X × Z (cm)</th><th>Posición X / Z (cm)</th><th>Giro</th></tr></thead><tbody>${e.desktopItems.map((i) => `<tr><td>${i.label}</td><td>${i.sizeX} × ${i.sizeZ}${i.id === 'pc' ? ` · h ${s.pcHeight}` : ''}</td><td>${i.local.x} / ${i.local.z}</td><td>${i.local.angle}°</td></tr>`).join('')}</tbody></table><h3 class="summary-title">Comprobaciones<span>${e.errors} pendientes · ${e.warnings} avisos</span></h3><div class="summary-checks">${e.checks.map((c) => `<p>${c.level === 'ok' ? '✓' : c.level === 'error' ? '×' : '!'} ${escapeHTML(c.label)}: <b>${escapeHTML(c.value)}</b> — ${escapeHTML(c.detail)}</p>`).join('')}</div><h3 class="summary-title">Lista de cortes orientativa<span>Longitudes netas · sin ancho de sierra</span></h3><table class="summary-table"><thead><tr><th>Pieza</th><th>Perfil (mm)</th><th>Ud.</th><th>Largo (mm)</th><th>Total (mm)</th></tr></thead><tbody>${e.parts.map((p) => `<tr><td>${p.name}</td><td>${p.profile}</td><td>${p.qty}</td><td>${p.mm}</td><td>${p.total}</td></tr>`).join('')}</tbody></table><h3 class="summary-title">Piezas y fijaciones<span>Cantidades preliminares</span></h3><table class="summary-table"><thead><tr><th>Componente</th><th>Detalle</th><th>Ud.</th></tr></thead><tbody>${e.accessories.map((p) => `<tr><td>${p.name}</td><td>${p.note}</td><td>${p.qty}</td></tr>`).join('')}</tbody></table><div class="summary-note"><b>Antes de pedir o cortar:</b> las prolongaciones de base requieren uniones y arriostramiento por definir; sus fijaciones no se incluyen en las estimaciones. el despiece supone largueros exteriores y travesaños entre caras interiores (ancho − 80 mm), eje de base a ${(10 + rigLift(s)) * 10} mm sobre suelo y módulos sobre escuadras. La altura de cojín es una medida corporal objetivo: adapta los apoyos al espesor y raíles de tu asiento. Las placas se modelan como envolventes, sin taladros. Añade margen de corte y verifica ranura, escuadras, espesor de placas, anclajes y carga con el proveedor. No es un cálculo estructural ni un plano de fabricación validado. Los perfiles 40 × 80 convencionales no se telescopan entre sí. El brazo usa dos tramos de longitud fija con giros horizontales; verifica VESA, peso, topes de giro y recorrido reales.</div></div>`;
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
