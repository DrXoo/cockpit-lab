// The history panel: the design's operations in order, the history marker, the undo and redo of
// its edits, and the tool that adds a profile.
import { profileSection, profileSystem, footType, sheetType } from '../cad/parts/catalog.ts';
import {
  makesAPart,
  stepTitle,
  type GrowProfile,
  type Operation,
  type ProfileOperation,
} from '../cad/history/history.ts';
import { round } from '../../shared/geometry.ts';
import { escapeHTML } from '../../ui/html.ts';
import {
  CATEGORY_NAMES,
  connectorCountText,
  nameOf,
  parentName,
  reachOf,
  sectionName,
} from './design-text.ts';

export interface DesignPanel {
  history: readonly Operation[];
  /** The history marker: how many steps the view shows. */
  marker: number;
  selectedOperationId: string | null;
  /** Why each failed operation no longer applies, by operation id. */
  failures: ReadonlyMap<string, string>;
  canUndo: boolean;
  canRedo: boolean;
  /** Whether the design is being fitted, which locks the frame. */
  fitting?: boolean;
  /** The name of the subassembly each step's part belongs to, by step id; none when left out. */
  subassemblyTags?: ReadonlyMap<string, string>;
}

/** The history panel: the design's operations, the undo and redo of its edits, and its tools. */
export function designPanelHTML(panel: DesignPanel): string {
  const editTools = `<div class="history-tools"><button class="text-button" id="undoEdit" title="Undo (Ctrl+Z)" ${panel.canUndo ? '' : 'disabled'}><i data-icon="undo"></i>Undo</button><button class="text-button" id="redoEdit" title="Redo (Ctrl+Y)" ${panel.canRedo ? '' : 'disabled'}><i data-icon="redo"></i>Redo</button></div>`;
  const locked = panel.fitting
    ? ' disabled title="The frame is locked while fitting: turn Fit off to add a profile"'
    : '';
  const addProfile = `<button class="button button-dark history-add" id="addProfile"${locked}><i data-icon="plus"></i>Add a profile</button>`;
  if (panel.history.length === 0) {
    // Nothing to undo in a new design; after undoing back to empty, redo brings the parts back.
    const tools = panel.canUndo || panel.canRedo ? editTools : '';
    return `<div class="control-group" id="emptyDesign"><h3 class="group-title">A design built from parts</h3>${tools}<p class="layout-hint">A cockpit design is the list of steps that builds it from aluminium profiles, plates and peripherals. New designs start empty: add a profile to start.</p><p class="layout-hint">Cockpits of the earlier configurator are not converted: design them again from parts.</p>${addProfile}</div>`;
  }
  const { history, marker } = panel;
  const steps = history.map((_, index) => historyStepHTML(panel, index));
  steps.splice(marker, 0, historyMarkerHTML(marker, history.length));
  const atTheMarker =
    marker < history.length ? ' New steps go in at the marker, and the steps below it wait.' : '';
  return `<div class="control-group" id="designHistory"><h3 class="group-title">Design history<span>${history.length} ${history.length === 1 ? 'step' : 'steps'}</span></h3>${editTools}<ol class="history-list">${steps.join('')}</ol>${addProfile}<p class="layout-hint">Select a part here or in the view to edit it in the inspector. Grow new profiles out of its faces from there.${atTheMarker}</p></div>`;
}

/** The history marker: the view shows the design up to it. */
function historyMarkerHTML(marker: number, steps: number): string {
  const back = marker === 0 ? ' disabled' : '';
  const forward = marker === steps ? ' disabled' : '';
  return `<li class="history-marker" id="historyMarker"><span>▶ The view shows the design up to here</span><span class="marker-actions"><button class="text-button" id="markerBack" title="Show the design one step earlier"${back}>Step back</button><button class="text-button" id="markerForward" title="Show the next step"${forward}>Step forward</button><button class="text-button" id="markerEnd" title="Show every step"${forward}>To the end</button></span></li>`;
}

function historyStepHTML(panel: DesignPanel, index: number) {
  const { history } = panel;
  const operation = history[index];
  const selected = operation.id === panel.selectedOperationId;
  const failure = panel.failures.get(operation.id);
  const waiting = index >= panel.marker;
  const classes = `history-step${failure !== undefined ? ' failed' : ''}${waiting ? ' after-marker' : ''}`;
  const part = makesAPart(operation) ? ` data-part="${escapeHTML(operation.partId)}"` : '';
  const failed =
    failure === undefined
      ? ''
      : `<small class="history-failure">⚠ Failed: ${escapeHTML(failure)}</small>`;
  const subassembly = panel.subassemblyTags?.get(operation.id);
  const tag =
    subassembly === undefined
      ? ''
      : `<small class="history-subassembly" data-subassembly-tag>▣ In ${escapeHTML(subassembly)}</small>`;
  return `<li><button class="${classes}" data-operation="${escapeHTML(operation.id)}"${part} aria-pressed="${selected}"${waiting ? ' disabled' : ''}><span class="history-number">${index + 1}</span><span class="history-text"><strong>${escapeHTML(stepTitle(history, operation))}</strong><small>${stepDetail(history, operation)}</small>${tag}${failed}</span></button></li>`;
}

function stepDetail(history: readonly Operation[], operation: Operation): string {
  switch (operation.kind) {
    case 'remove-part':
      return 'What hangs from it stays where it is, anchored';
    case 'add-foot':
      return `Under ${escapeHTML(nameOf(history, operation.parentId))} · ${escapeHTML(footType(operation.footTypeId).name)}`;
    case 'fasten-joint':
      return escapeHTML(connectorCountText(operation));
    case 'join-parts':
      return 'They touch: a joint to fasten';
    case 'mount-peripheral':
      return `Mounted on ${escapeHTML(nameOf(history, operation.parentId))} · ${CATEGORY_NAMES[operation.category]}`;
    case 'add-plate':
      return `On ${escapeHTML(nameOf(history, operation.parentId))} · ${round(operation.widthMm, 1)} × ${round(operation.depthMm, 1)} mm · ${escapeHTML(sheetType(operation.sheetId).name)}`;
    case 'add-anchored-profile':
    case 'grow-profile':
      return profileStepDetail(history, operation);
  }
}

function profileStepDetail(history: readonly Operation[], operation: ProfileOperation): string {
  const section = profileSection(profileSystem(operation.systemId), operation.sectionId);
  const made =
    operation.kind === 'add-anchored-profile'
      ? 'Anchored profile'
      : `${operation.way === 'out' ? 'Grown out of' : 'Laid on'} ${escapeHTML(parentName(history, operation))}${reachText(history, operation)}`;
  return `${made} · ${sectionName(section.widthMm, section.heightMm)} · ${round(operation.lengthMm, 1)} mm`;
}

function reachText(history: readonly Operation[], growth: GrowProfile): string {
  const reach = reachOf(history, growth);
  if (!reach) return '';
  const target = escapeHTML(reach.targetName);
  return reach.meets ? `, reaching ${target}` : ` · ⚠ not meeting ${target}`;
}
