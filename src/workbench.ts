// The page the user works in: which editor, tab, view and, on narrow screens, panel it shows,
// and showing them again as the project changes. The editors' controllers do the editing; the
// workbench moves between them and is the host they ask to show what changed.
import type { Axis } from './cockpit/cad/parts/assembly.ts';
import type { CockpitEditor, CockpitEditorHost } from './cockpit/editor/editor.ts';
import { bindHistoryPanel, historyPanelHTML } from './cockpit/editor/history-panel.ts';
import type { CockpitInspector } from './cockpit/editor/inspector.ts';
import type { CockpitToolbar } from './cockpit/editor/toolbar.ts';
import type { DrawingPanel, DrawingPanelHost } from './cockpit/editor/drawing-panel.ts';
import type { CockpitViewOverlays } from './cockpit/editor/view-overlays.ts';
import { NOTHING_AROUND } from './room/config.ts';
import { activeArmPose } from './room/arm-poses.ts';
import type { RoomConfig } from './room/config.ts';
import { $, $$, $optional, dataOf, replaceKeepingFocus } from './ui/dom.ts';
import type { CockpitEvaluation } from './room/evaluate.ts';
import { hiddenFurnitureOf, type LayoutLibrary } from './room/layouts.ts';
import { evaluate } from './room/model.ts';
import { toast } from './app/notices.ts';
import { isGuided, renderPageChrome, type PageChrome } from './app/page-chrome.ts';
import { createProject, type Project } from './project/project.ts';
import type { ProjectSession } from './project/session.ts';
import { SUMMARY_HEADING, summaryHTML } from './app/summary.ts';
import type { CockpitDrawing } from './cockpit/render/cad.ts';
import type { DeskControls } from './room/editing/desk-controls.ts';
import type { GuidedSetup } from './room/editing/guided-setup.ts';
import type { RoomEditorHost } from './room/editing/host.ts';
import type { LayoutPicker } from './room/editing/layout-picker.ts';
import { renderRoomChecks } from './room/editing/room-checks-panel.ts';
import type { RoomItems } from './room/editing/room-items.ts';
import {
  noRoomSelection,
  panelTarget,
  targetAfterLayoutChange,
  targetAfterSwitch,
  type RoomSelection,
} from './room/editing/selection.ts';
import type { SettingControls } from './room/editing/settings-controls.ts';
import { roomControls } from './room/editing/room-editor.ts';
import type { CockpitScene } from './scene/scene.ts';
import { SIGHT_AXIS, type SceneView } from './scene/camera.ts';
import {
  editorOf,
  editorOfSection,
  isRoomSection,
  sectionOf,
  workspaceOf,
  type Editor,
  type Section,
  type Workspace,
} from './app/sections.ts';
import { sectionOfStep } from './room/editing/setup-actions.ts';
import { creationControls } from './room/editing/setup-editor.ts';
import { deskPanelHTML } from './room/editing/settings-panels.ts';

const VIEWS = ['iso', 'top', 'desk', 'side'] as const;

function viewOf(value: string): SceneView {
  const view = VIEWS.find((known) => known === value);
  if (!view) throw new Error(`Unknown view: ${value}`);
  return view;
}

/** The editors' controllers the workbench shows and moves between. */
export interface WorkbenchParts {
  cockpitEditor: CockpitEditor;
  cockpitInspector: CockpitInspector;
  cockpitToolbar: CockpitToolbar;
  drawingPanel: DrawingPanel;
  cockpitOverlays: CockpitViewOverlays;
  settingControls: SettingControls;
  roomItems: RoomItems;
  guidedSetup: GuidedSetup;
  deskControls: DeskControls;
  layoutPicker: LayoutPicker;
}

export class Workbench implements CockpitEditorHost, RoomEditorHost, DrawingPanelHost {
  declare readonly project: ProjectSession;
  declare readonly selection: RoomSelection;
  declare readonly parts: WorkbenchParts;
  /** The 3D view, once it is drawn: without WebGL there is none. */
  declare scene: CockpitScene | undefined;
  declare private shownSection: Section;
  /** The tab each editor shows when it opens again. */
  declare private readonly lastSection: Record<Editor, Section>;
  declare private shownView: SceneView;
  declare private lastEvaluation: CockpitEvaluation;

  constructor(project: ProjectSession, build: (workbench: Workbench) => WorkbenchParts) {
    this.project = project;
    this.selection = noRoomSelection();
    this.scene = undefined;
    this.shownSection = 'room';
    this.lastSection = { cockpit: 'design', room: 'room' };
    this.shownView = 'top';
    this.lastEvaluation = evaluate(project.state);
    this.parts = build(this);
    this.bindNavigation();
  }

  editor(): Editor {
    return editorOfSection(this.shownSection);
  }

  section(): Section {
    return this.shownSection;
  }

  view(): SceneView {
    return this.shownView;
  }

  evaluation(): CockpitEvaluation {
    return this.lastEvaluation;
  }

  inCockpitEditor(): boolean {
    return this.editor() === 'cockpit';
  }

  /** What the scene and the checks show: the active layout, or the cockpit design on its own. */
  shownConfig(): RoomConfig {
    return this.inCockpitEditor() ? NOTHING_AROUND : this.project.state;
  }

  /** What the scene draws of the cockpit design: only in the cockpit editor, on its own. */
  cockpitDrawing(): CockpitDrawing | null {
    return this.inCockpitEditor() ? this.parts.cockpitEditor.drawing() : null;
  }

  /** Makes `opened` the open project, its layouts and its cockpit design. */
  openProject(opened: Project) {
    this.project.open(opened);
    this.parts.cockpitEditor.open(opened.cockpit);
    this.selection.armPose = activeArmPose(this.project.state)?.id ?? '';
  }

  /**
   * Opens the editor, tab and view where the open project's work goes on: the setup's step
   * while it is guided, the cockpit editor for a design without a room yet.
   */
  startWhereTheWorkIs() {
    const { project } = this;
    if (project.setup.step === 'complete') this.shownView = 'iso';
    else this.shownSection = sectionOfStep(project.setup.step);
    if (project.setup.step !== 'complete' && project.state.roomEnabled)
      this.selection.editing = true;
    // A project with a cockpit design and no room yet opens where the design is edited.
    if (!project.state.roomEnabled && this.parts.cockpitEditor.session.design !== null) {
      this.shownSection = 'design';
      this.shownView = 'iso';
    }
    this.lastEvaluation = evaluate(this.shownConfig());
  }

  /** Shows a project just opened from a file, where its work goes on. */
  showOpenedProject() {
    const { project } = this;
    this.renderControls();
    this.refresh();
    $<HTMLDialogElement>('#summaryDialog').close();
    if (!project.state.roomEnabled && this.parts.cockpitEditor.hasDesign()) this.startWithCockpit();
    else if (project.setup.step !== 'complete')
      this.parts.guidedSetup.enterStep(project.setup.step);
    else {
      this.switchSection('room');
      this.setActiveView('iso');
    }
  }

  /** Shows the project with a cockpit design just imported. */
  showImportedDesign() {
    this.renderControls();
    this.refresh();
    this.setActiveView('iso');
  }

  /** Records the edits, applies `change` to the layouts and opens the resulting active layout. */
  changeLayouts(change: (recorded: LayoutLibrary) => LayoutLibrary) {
    const { project, selection } = this;
    project.changeLayouts(change);
    selection.armPose = activeArmPose(project.state)?.id ?? '';
    selection.target = targetAfterLayoutChange(selection.target, project.state);
    this.renderControls();
    this.refresh();
    this.syncSceneEditing();
  }

  /** Dragging in the plan arranges the room, so the cockpit editor has nothing to drag. */
  syncSceneEditing() {
    this.scene?.setPartPicking(this.inCockpitEditor());
    this.scene?.setLayoutEditing(
      this.editor() === 'room' && this.selection.editing,
      this.selection.target,
      isRoomSection(this.shownSection),
    );
  }

  setLayoutEditing(on: boolean, target: string, roomEditing?: boolean) {
    this.scene?.setLayoutEditing(on, target, roomEditing);
  }

  pressLayoutButton() {
    $('#layoutBtn').classList.add('active');
    $('#layoutBtn').setAttribute('aria-pressed', 'true');
  }

  /** Shows the parts of the page that follow the editor shown and the guided setup. */
  renderWorkflow() {
    const { cockpitEditor } = this.parts;
    const page: PageChrome = {
      editor: this.editor(),
      setup: this.project.setup,
      state: this.project.state,
      shown: this.shownConfig(),
      evaluation: this.lastEvaluation,
      library: this.project.library,
      layoutEditing: this.selection.editing,
      cockpit: {
        hasDesign: cockpitEditor.hasDesign(),
        hasParts: cockpitEditor.hasParts(),
        fitting: cockpitEditor.session.fitting,
      },
    };
    renderPageChrome(page);
    this.parts.layoutPicker.render(isGuided(page) || page.editor === 'cockpit');
  }

  /** Rebuilds the side panel for the editor, tab and setup step shown, and binds it. */
  renderControls() {
    const { project, selection, parts } = this;
    const section = this.shownSection;
    const evaluation = this.lastEvaluation;
    const guided = isGuided({ editor: this.editor(), setup: project.setup });
    const stage = guided ? project.setup.step : section === 'furniture' ? 'furniture' : 'openings';
    selection.target = panelTarget(selection.target, {
      section,
      stage,
      state: project.state,
      desktopItemIds: evaluation.desktopItems.map((item) => item.id),
    });
    let html = '';
    if (this.inCockpitEditor()) {
      html = historyPanelHTML(parts.cockpitEditor);
    } else if (guided || (section === 'desk' && project.state.deskEnabled === false)) {
      html = creationControls(
        project.state,
        evaluation,
        guided ? project.setup : { ...project.setup, step: 'desk' },
        selection.target,
        parts.settingControls.templates(),
        selection.armPose,
      );
    } else if (isRoomSection(section)) {
      const { range, toggle } = parts.settingControls.templates();
      html = roomControls(project.state, selection.target, range, toggle, {
        mode: section === 'furniture' ? 'furniture' : 'room',
        hiddenFurniture: hiddenFurnitureOf(project.library),
        layoutCount: project.library.layouts.length,
      });
    } else {
      html = deskPanelHTML(parts.settingControls.view(), selection.target, selection.armPose);
    }
    if (this.inCockpitEditor()) replaceKeepingFocus($('#controls'), html);
    else $('#controls').innerHTML = html;
    bindHistoryPanel($('#controls'), parts.cockpitEditor);
    parts.roomItems.bind();
    parts.guidedSetup.bind();
    $optional('#startWithCockpit')?.addEventListener('click', () => this.startWithCockpit());
    $optional('#goRoom')?.addEventListener('click', () => {
      this.switchSection('room');
      this.setActiveView('top');
    });
    parts.settingControls.bind();
    parts.deskControls.bind();
  }

  /** Shows a tab of the side panel, opening its editor. */
  switchSection(value: Section) {
    const editorChanged = editorOfSection(value) !== this.editor();
    if (editorChanged) this.parts.cockpitEditor.stopMeasuring();
    this.shownSection = value;
    this.lastSection[this.editor()] = value;
    // The other editor shows another configuration, so the panels need its evaluation.
    if (editorChanged) this.lastEvaluation = evaluate(this.shownConfig());
    this.selection.target = targetAfterSwitch(this.selection.target, value, this.project.state);
    $$<HTMLButtonElement>('.config-tabs button').forEach((tab) => {
      const active = dataOf(tab, 'section') === value;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    $('#controls').setAttribute('aria-labelledby', `tab-${value}`);
    this.renderControls();
    if (editorChanged) this.refresh();
    else this.renderWorkflow();
    $('#controls').scrollTop = 0;
    this.syncSceneEditing();
  }

  /** Opens an editor at `target`, or at the tab it showed last, framing what it shows. */
  showEditor(next: Editor, target: Section = this.lastSection[next]) {
    const changed = next !== this.editor();
    this.switchSection(target);
    if (changed)
      this.setActiveView(
        next === 'cockpit' || this.project.setup.step === 'complete' ? 'iso' : 'top',
      );
  }

  /** Shows the page again from the current state. */
  refresh() {
    const { parts } = this;
    const shown = this.shownConfig();
    this.lastEvaluation = evaluate(shown);
    parts.roomItems.sync();
    parts.settingControls.sync();
    parts.deskControls.sync();
    renderRoomChecks(this.project.state, shown, this.lastEvaluation);
    this.renderWorkflow();
    parts.cockpitInspector.render();
    parts.cockpitInspector.renderChecks();
    parts.cockpitOverlays.render();
    parts.cockpitToolbar.render();
    parts.drawingPanel.render();
    this.scene?.update(shown, this.lastEvaluation, this.cockpitDrawing());
  }

  /** Opens a new, empty project where the user chose to start it: the cockpit or the room. */
  startNewProject(start: Editor) {
    this.openProject(createProject());
    this.selection.target = '';
    this.selection.editing = false;
    this.project.saveNow();
    $<HTMLDialogElement>('#resetDialog').close();
    if (start === 'room') {
      this.parts.guidedSetup.enterStep('room');
      toast('New project. Start with your room.');
      return;
    }
    this.startWithCockpit();
    toast('New project. Its cockpit design starts empty.');
  }

  /** Opens the cockpit editor to design first; the room setup waits where it was. */
  startWithCockpit() {
    this.showEditor('cockpit', 'design');
    this.refresh();
    this.showWorkspace('config');
  }

  /** Goes back to the camera view shown before the drawing of a plate. */
  showCameraView() {
    this.setActiveView(this.shownView);
  }

  setActiveView(next: SceneView) {
    this.shownView = next;
    this.parts.drawingPanel.hide();
    $$('[data-view]').forEach((button) => {
      const active = dataOf(button, 'view') === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    this.scene?.setView(next);
    // Which handles can be dragged depends on the view.
    if (this.inCockpitEditor() && this.parts.cockpitEditor.hasParts()) this.refresh();
    $('.viewport-note span').textContent = this.viewportNote();
  }

  /** Shows one panel on narrow screens. */
  showWorkspace(next: Workspace) {
    document.body.dataset.workspace = next;
    $$('.studio-nav button').forEach((button) => {
      const active = dataOf(button, 'workspace') === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  toast(message: string) {
    toast(message);
  }

  // The cockpit editor's host.

  renderInspector() {
    this.parts.cockpitInspector.render({ force: true });
  }

  renderJointCard() {
    this.parts.cockpitOverlays.renderJointCard();
  }

  saveSoon() {
    this.project.saveSoon();
  }

  frameDesign() {
    this.setActiveView(this.shownView);
  }

  sightAxis(): Axis | null {
    return SIGHT_AXIS[this.shownView];
  }

  /** What dragging in the view does, as the note below it says. */
  private viewportNote(): string {
    const view = this.shownView;
    if (this.inCockpitEditor())
      return `Click a part to select it · ${view === 'iso' ? 'drag to orbit' : 'drag to pan'} · scroll to zoom`;
    if (view === 'iso') return 'Drag to orbit · scroll to zoom';
    if ((view === 'top' || view === 'desk') && this.selection.editing)
      return this.selection.target === 'arm'
        ? 'Drag ELBOW or VESA · mount on the desktop'
        : 'Drag an item · select and turn it in ' +
            (isRoomSection(this.shownSection) ? 'Room' : 'Desk');
    return 'Scroll to zoom · drag to pan';
  }

  /** Binds the controls that move between editors, tabs, views and panels. */
  private bindNavigation() {
    $$('.editor-switch button').forEach((button) =>
      button.addEventListener('click', () => this.showEditor(editorOf(dataOf(button, 'editor')))),
    );
    $$('.config-tabs button').forEach((tab) =>
      tab.addEventListener('click', () => this.openTab(sectionOf(dataOf(tab, 'section')))),
    );
    $('.config-tabs').addEventListener('keydown', (event) => this.moveBetweenTabs(event));
    $('#resetBtn').addEventListener('click', () =>
      $<HTMLDialogElement>('#resetDialog').showModal(),
    );
    $('#newProject').addEventListener('click', () =>
      $<HTMLDialogElement>('#resetDialog').showModal(),
    );
    $('#newProjectRoom').addEventListener('click', () => this.startNewProject('room'));
    $('#newProjectCockpit').addEventListener('click', () => this.startNewProject('cockpit'));
    $$('[data-view]').forEach((button) =>
      button.addEventListener('click', () => this.setActiveView(viewOf(dataOf(button, 'view')))),
    );
    $('#dimensionBtn').addEventListener('click', () => {
      const button = $('#dimensionBtn');
      const on = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', on ? 'Hide dimensions' : 'Show dimensions');
      button.classList.toggle('active', on);
      this.scene?.setDimensions(on);
    });
    $('#fitBtn').addEventListener('click', () => this.scene?.setView(this.shownView));
    $$('.studio-nav button').forEach((button) =>
      button.addEventListener('click', () =>
        this.showWorkspace(workspaceOf(dataOf(button, 'workspace'))),
      ),
    );
    $('.skip-link').addEventListener('click', () => this.showWorkspace('config'));
    $('#adjustRoom').addEventListener('click', () => {
      $('#tab-room').click();
      this.showWorkspace('config');
    });
    $('#adjustDesk').addEventListener('click', () => {
      this.switchSection('desk');
      this.showWorkspace('config');
    });
    $('#adjustDesktop').addEventListener('click', () => {
      this.selection.target = 'arm';
      this.switchSection('desk');
      this.showWorkspace('config');
      this.syncSceneEditing();
      this.setActiveView('desk');
    });
    $('#helpBtn').addEventListener('click', () => $<HTMLDialogElement>('#helpDialog').showModal());
    $('#openSummary').addEventListener('click', () => this.showSummary());
    $('#printBtn').addEventListener('click', () => window.print());
  }

  /** A tab of the room arranges its items in the top view. */
  private openTab(tab: Section) {
    this.switchSection(tab);
    if (!isRoomSection(tab)) return;
    this.selection.editing = true;
    this.pressLayoutButton();
    this.scene?.setLayoutEditing(true, this.selection.target, true);
    this.setActiveView('top');
  }

  /** The arrow keys, Home and End move between the tabs shown. */
  private moveBetweenTabs(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = $$<HTMLButtonElement>('.config-tabs button:not([hidden])');
    const current = tabs.findIndex((tab) => dataOf(tab, 'section') === this.shownSection);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (current + step + tabs.length) % tabs.length;
    tabs[next].click();
    tabs[next].focus();
  }

  private showSummary() {
    $('#summaryTitle').textContent = SUMMARY_HEADING.title;
    $('#summaryDialog .section-kicker').textContent = SUMMARY_HEADING.kicker;
    $('#summaryContent').innerHTML = summaryHTML(
      this.project.state,
      this.lastEvaluation,
      this.project.setup,
    );
    $<HTMLDialogElement>('#summaryDialog').showModal();
  }
}
