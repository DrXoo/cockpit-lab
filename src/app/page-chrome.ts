// The parts of the page that follow the editor shown and the guided setup: headings, tabs, the
// setup's guide and buttons, the empty-scene message, and the panels and buttons each editor
// offers.
import type { RoomConfig } from '../config.ts';
import { $, $$, dataOf } from '../ui/dom.ts';
import type { CockpitEvaluation } from '../evaluate.ts';
import { activeLayout, type LayoutLibrary } from '../layouts.ts';
import { steps, type SetupProgress } from '../project.ts';
import type { Editor } from './sections.ts';
import { setupButtons } from '../setup-actions.ts';
import { progressHTML } from '../setup-editor.ts';

export interface PageChrome {
  editor: Editor;
  setup: SetupProgress;
  /** The active layout as it is being edited. */
  state: RoomConfig;
  /** What the scene and the checks show: the active layout, or nothing around the cockpit. */
  shown: RoomConfig;
  evaluation: CockpitEvaluation;
  library: LayoutLibrary;
  /** Whether dragging in the plan arranges the layout. */
  layoutEditing: boolean;
  cockpit: { hasDesign: boolean; hasParts: boolean; fitting: boolean };
}

/** Whether the guided setup leads the room editor. */
export const isGuided = ({ editor, setup }: Pick<PageChrome, 'editor' | 'setup'>): boolean =>
  editor === 'room' && setup.step !== 'complete';

/** The inspector card that holds an element. */
function inspectorSectionOf(selector: string): HTMLElement {
  const card = $(selector).closest<HTMLElement>('.inspector-section');
  if (!card) throw new Error(`${selector} is not inside an inspector section`);
  return card;
}

export function renderPageChrome(page: PageChrome) {
  const { editor, setup, shown, cockpit } = page;
  const inCockpit = editor === 'cockpit';
  const guided = isGuided(page);
  const step = steps.find((s) => s.id === setup.step);
  const stepLabel = step?.label ?? '';
  document.body.dataset.guided = String(guided);
  document.body.dataset.editor = editor;
  $$('.editor-switch button').forEach((button) => {
    const active = dataOf(button, 'editor') === editor;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $$<HTMLButtonElement>('.config-tabs button').forEach(
    (tab) => (tab.hidden = dataOf(tab, 'inEditor') !== editor),
  );
  $('#setupProgress').hidden = !guided;
  $('#setupProgress').innerHTML = guided ? progressHTML(setup) : '';
  $('#setupActions').hidden = !guided;
  $('.config-tabs').hidden = guided || inCockpit;
  $('.cockpit-area').hidden = !inCockpit;
  $('#exportCockpit').hidden = !cockpit.hasDesign;
  const heading = guided ? stepLabel : inCockpit ? 'Cockpit design' : 'Settings';
  $('.panel-heading h2').textContent = heading;
  $('#controls').setAttribute('aria-label', guided ? (step?.title ?? '') : heading);
  $('#setupGuide').hidden = !guided;
  $('#setupGuideTitle').textContent = step?.title || '';
  $('#setupGuideHint').textContent = step?.hint || '';
  const buttons = setupButtons(setup, page.state);
  $<HTMLButtonElement>('#setupBack').disabled = buttons.backDisabled;
  $('#setupNext').textContent = buttons.nextLabel;
  $<HTMLButtonElement>('#setupNext').disabled = buttons.nextDisabled;
  $('#setupSkip').hidden = buttons.skipHidden;
  $('#setupSkip').textContent = buttons.skipLabel;
  const hasScene = inCockpit ? cockpit.hasParts : shown.roomEnabled || shown.deskEnabled;
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
  $('#partInspector').hidden = !inCockpit || !cockpit.hasParts;
  $('#layoutBtn').hidden = inCockpit;
  $('#measureBtn').hidden = !inCockpit || !cockpit.hasParts;
  $('#fitModeBtn').hidden = !inCockpit || !cockpit.hasParts;
  $('#fitModeBtn').classList.toggle('active', cockpit.fitting);
  $('#fitModeBtn').setAttribute('aria-pressed', String(cockpit.fitting));
  $<HTMLButtonElement>('#layoutBtn').disabled = !hasScene;
  $('#layoutBtn').classList.toggle('active', page.layoutEditing);
  $('#layoutBtn').setAttribute('aria-pressed', String(page.layoutEditing));
  $('#validationBanner').hidden = inCockpit;
  const deskStepHidden = guided && setup.step !== 'desk';
  inspectorSectionOf('#deskSizeTag').hidden = !shown.deskEnabled || deskStepHidden;
  inspectorSectionOf('#deskSizeTag').querySelector('h3')!.lastChild!.textContent =
    shown.monitorEnabled ? 'Desk and monitor' : 'Desk';
  inspectorSectionOf('#matTag').hidden =
    !shown.deskEnabled || !page.evaluation.desktopItems.length || deskStepHidden;
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
    !guided && !inCockpit && page.library.layouts.length > 1
      ? `${sceneTitle} · ${activeLayout(page.library).name}`
      : sceneTitle;
}
