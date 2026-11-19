// What the controllers of the room editor need from the page that holds them.
import type { CockpitEvaluation } from '../evaluate.ts';
import type { LayoutLibrary } from '../layouts.ts';
import type { ProjectSession } from '../project-session.ts';
import type { SceneView } from '../scene-camera.ts';
import type { Section, Workspace } from '../sections.ts';
import type { RoomSelection } from './selection.ts';

export interface RoomEditorHost {
  readonly project: ProjectSession;
  readonly selection: RoomSelection;
  /** The checks and figures of the layout shown, as last refreshed. */
  evaluation(): CockpitEvaluation;
  /** The tab of the side panel shown. */
  section(): Section;
  /** Shows the page again from the current state. */
  refresh(): void;
  /** Rebuilds the side panel. */
  renderControls(): void;
  /** Shows the parts of the page that depend on the editor, the tab and the setup step. */
  renderWorkflow(): void;
  switchSection(section: Section): void;
  setActiveView(view: SceneView): void;
  showWorkspace(workspace: Workspace): void;
  /** Tells the view what dragging in the plan does, from the selection and the tab. */
  syncSceneEditing(): void;
  /** Tells the view whether dragging arranges `target`, among the room's items or the desk's. */
  setLayoutEditing(on: boolean, target: string, roomEditing?: boolean): void;
  /** Shows the button that turns layout editing on as pressed. */
  pressLayoutButton(): void;
  /** Records the edits, changes the layouts and opens the resulting active layout. */
  changeLayouts(change: (recorded: LayoutLibrary) => LayoutLibrary): void;
  /** Opens the cockpit editor to design first. */
  startWithCockpit(): void;
  toast(message: string): void;
}
