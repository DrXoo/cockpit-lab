// The project open in the app: its layouts, the active layout as it is being edited and the
// guided setup, saved in this browser as they change. The cockpit design is the cockpit
// editor's; the session asks for it when it records the project.
import type { CockpitDesign } from '../cockpit-design.ts';
import type { RoomConfig } from '../config.ts';
import { layoutConfig, type LayoutLibrary } from '../layouts.ts';
import { recordProject, type Project, type SetupProgress } from './project.ts';
import type { ProjectStore } from './storage.ts';

/** How long saving waits for more changes, so a drag or typing saves once. */
export const AUTOSAVE_DELAY_MS = 250;

export type SaveStatus = 'ok' | 'error';

export interface ProjectSessionOptions {
  store: ProjectStore;
  /** The cockpit design as the cockpit editor has it. */
  cockpit: () => CockpitDesign | null;
  /** Shows how saving goes. */
  showStatus: (message: string, status: SaveStatus) => void;
}

export class ProjectSession {
  /** Every layout as last recorded. */
  declare library: LayoutLibrary;
  /** The active layout as it is being edited; recording puts it into `library`. */
  declare state: RoomConfig;
  declare setup: SetupProgress;
  declare private readonly options: ProjectSessionOptions;
  declare private pendingSave: ReturnType<typeof setTimeout> | undefined;

  constructor(project: Project, options: ProjectSessionOptions) {
    this.options = options;
    this.pendingSave = undefined;
    this.open(project);
  }

  /** Makes `project` the open one, editing its active layout. Its cockpit design is opened apart. */
  open(project: Project) {
    this.library = project.library;
    this.state = layoutConfig(this.library);
    this.setup = project.setup;
  }

  /** The open project, with the edits to the active layout recorded. */
  recorded(): Project {
    const cockpit = this.options.cockpit();
    ({ library: this.library } = recordProject(
      { cockpit, library: this.library, setup: this.setup },
      this.state,
    ));
    return { cockpit, library: this.library, setup: this.setup };
  }

  /** Records the edits, applies `change` to the layouts, opens the active layout and saves. */
  changeLayouts(change: (recorded: LayoutLibrary) => LayoutLibrary) {
    this.library = change(this.recorded().library);
    this.state = layoutConfig(this.library);
    this.saveNow();
  }

  /** Saves once no change has come for a moment. */
  saveSoon() {
    this.options.showStatus('Saving…', 'ok');
    clearTimeout(this.pendingSave);
    this.pendingSave = setTimeout(() => this.saveNow(), AUTOSAVE_DELAY_MS);
  }

  /** Saves at once, instead of a save that was waiting. */
  saveNow() {
    clearTimeout(this.pendingSave);
    this.pendingSave = undefined;
    if (this.options.store.save(this.recorded()))
      this.options.showStatus('Saved in this browser', 'ok');
    else this.options.showStatus('Not saved automatically · export a JSON file', 'error');
  }
}
