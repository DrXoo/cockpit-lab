// The app's composition root: it opens the project saved in this browser, builds the editors
// and their controllers around the workbench, and draws the 3D view when WebGL allows it.
import { CockpitEditor } from './cockpit/editor/editor.ts';
import { HandleDragging } from './cockpit/editor/handle-dragging.ts';
import { CockpitInspector } from './cockpit/editor/inspector.ts';
import { bindCockpitKeys } from './cockpit/editor/keys.ts';
import { CockpitToolbar } from './cockpit/editor/toolbar.ts';
import { DrawingPanel } from './cockpit/editor/drawing-panel.ts';
import { CockpitViewOverlays } from './cockpit/editor/view-overlays.ts';
import type { RoomConfig } from './room/config.ts';
import { bindDialogs } from './app/dialogs.ts';
import { $ } from './ui/dom.ts';
import type { CockpitEvaluation } from './room/evaluate.ts';
import { drawIcons } from './ui/icons.ts';
import { showSaveStatus, toast } from './app/notices.ts';
import { createProject } from './project/project.ts';
import { ProjectFiles } from './app/project-files.ts';
import { ProjectSession } from './project/session.ts';
import { createProjectStore } from './project/storage.ts';
import { DeskControls } from './room/editing/desk-controls.ts';
import { GuidedSetup } from './room/editing/guided-setup.ts';
import { LayoutPicker } from './room/editing/layout-picker.ts';
import { PlanDragging } from './room/editing/plan-dragging.ts';
import { RoomItems } from './room/editing/room-items.ts';
import { SettingControls } from './room/editing/settings-controls.ts';
import { CockpitScene } from './scene/scene.ts';
import { ColorTheme } from './app/theme.ts';
import { Workbench } from './workbench.ts';

drawIcons();

const colorTheme = new ColorTheme(() => workbench.scene?.applyTheme());
const store = createProjectStore(() => window.localStorage);
const newProject = createProject();
const project: ProjectSession = new ProjectSession(newProject, {
  store,
  cockpit: () => workbench.parts.cockpitEditor.session.design,
  showStatus: (message, status) => showSaveStatus(message, status),
});
const workbench: Workbench = new Workbench(project, (host) => {
  const cockpitEditor = new CockpitEditor(host, newProject.cockpit);
  const inCockpitEditor = () => host.inCockpitEditor();
  const settingControls = new SettingControls(host);
  return {
    cockpitEditor,
    cockpitInspector: new CockpitInspector(cockpitEditor, inCockpitEditor),
    cockpitToolbar: new CockpitToolbar(cockpitEditor, inCockpitEditor),
    drawingPanel: new DrawingPanel(cockpitEditor, host),
    cockpitOverlays: new CockpitViewOverlays(cockpitEditor, () => host.scene, inCockpitEditor),
    settingControls,
    roomItems: new RoomItems(host),
    guidedSetup: new GuidedSetup(host),
    deskControls: new DeskControls(host, settingControls),
    layoutPicker: new LayoutPicker(host),
  };
});
const { cockpitEditor, cockpitOverlays } = workbench.parts;
const handleDragging = new HandleDragging(cockpitEditor);
bindCockpitKeys(cockpitEditor, () => workbench.inCockpitEditor());
const planDragging = new PlanDragging(workbench);
const projectFiles = new ProjectFiles({
  project,
  cockpitEditor,
  openProject: (opened) => workbench.openProject(opened),
  showOpenedProject: () => workbench.showOpenedProject(),
  showImportedDesign: () => workbench.showImportedDesign(),
  toast: (message) => toast(message),
  showSaveStatus: (message, status) => showSaveStatus(message, status),
});
bindDialogs();
window.addEventListener('pagehide', () => {
  project.saveNow();
});

const loaded = store.load();
if (loaded.status === 'loaded') {
  workbench.openProject(loaded.project);
  showSaveStatus('Design restored from this browser');
} else if (loaded.status === 'unavailable')
  showSaveStatus('This browser blocks saving · export a JSON file', 'error');
workbench.startWhereTheWorkIs();
if (project.setup.step !== 'complete') workbench.showWorkspace('config');
workbench.renderControls();
workbench.refresh();
if (loaded.status === 'unreadable') projectFiles.reportUnreadableSave(loaded.keptAs, loaded.text);
if (loaded.status === 'loaded' && loaded.parametricCockpitLeftOut)
  projectFiles.reportLeftOutCockpit({ fromBrowser: true });

try {
  const scene = new CockpitScene($('#viewport'), $('#sceneLabels'));
  workbench.scene = scene;
  scene.update(workbench.shownConfig(), workbench.evaluation(), workbench.cockpitDrawing());
  workbench.setActiveView(workbench.view());
  workbench.syncSceneEditing();
  scene.onPartPick = (hit) => cockpitEditor.pickInView(hit);
  scene.onPartHover = (hit, pointer) => cockpitOverlays.hover(hit, pointer);
  scene.onHandleGrab = (handle) => handleDragging.grab(handle);
  scene.onHandleDrag = (handle, movedMm, modifiers) =>
    handleDragging.drag(handle, movedMm, modifiers);
  scene.onHandleRelease = () => handleDragging.release();
  scene.onJointMarkerPick = (marker) => cockpitEditor.openJointCard(marker);
  scene.onArmMove = (joint, x, z) => planDragging.armMoved(joint, x, z);
  scene.onLayoutSelect = (target) => planDragging.selected(target);
  scene.onLayoutMove = (target, x, z) => planDragging.moved(target, x, z);
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
  getEvaluation: () => structuredClone(workbench.evaluation()),
};
