// The files the user keeps outside this browser: the project as JSON, the cockpit design on its
// own as a cockpit file, and the copy of a saved project this browser could not read.
import {
  cockpitFileData,
  PARAMETRIC_COCKPIT_FILE_MESSAGE,
  readCockpitFile,
} from '../cockpit-file.ts';
import type { CockpitDesign } from '../cockpit-design.ts';
import type { CockpitEditor } from '../cockpit-editor/editor.ts';
import { $ } from '../ui/dom.ts';
import { projectData, readProject, replaceCockpitDesign, type Project } from '../project.ts';
import type { ProjectSession, SaveStatus } from '../project-session.ts';
import { STORAGE_KEY } from '../project-storage.ts';

/** Generous for a full project: 20 layouts of 30 pieces of furniture export to about 100 kB. */
const MAX_PROJECT_FILE_BYTES = 500_000;

const JSON_TYPE = 'application/json';

export interface ProjectFilesHost {
  readonly project: ProjectSession;
  readonly cockpitEditor: CockpitEditor;
  /** Makes `project` the open one, its layouts and its cockpit design. */
  openProject(project: Project): void;
  /** Shows a project just opened from a file, where its work goes on. */
  showOpenedProject(): void;
  /** Shows the project with a cockpit design just imported. */
  showImportedDesign(): void;
  toast(message: string): void;
  showSaveStatus(message: string, status: SaveStatus): void;
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: JSON_TYPE });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Whether a file is a cockpit file rather than a project, from its own description. */
const isCockpitFile = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && 'kind' in data && data.kind === 'cockpit';

/** The text of a file the user chose, refused when it is too large to be a Cockpit Lab file. */
async function textOf(file: File): Promise<string> {
  if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('File too large');
  return file.text();
}

export class ProjectFiles {
  declare private readonly host: ProjectFilesHost;
  /** A design read from a cockpit file, waiting for the user to confirm it replaces theirs. */
  declare private importedDesign: CockpitDesign | null;

  constructor(host: ProjectFilesHost) {
    this.host = host;
    this.importedDesign = null;
    $('#saveConfig').addEventListener('click', () => this.exportProject());
    const importFile = $<HTMLInputElement>('#importFile');
    $('#importBtn').addEventListener('click', () => importFile.click());
    $('#loadConfig').addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async () => {
      const file = importFile.files?.[0];
      if (!file) return;
      try {
        await this.openProjectFile(file);
      } finally {
        importFile.value = '';
      }
    });
    $('#exportCockpit').addEventListener('click', () => this.exportCockpit());
    const importCockpitFile = $<HTMLInputElement>('#importCockpitFile');
    $('#importCockpit').addEventListener('click', () => importCockpitFile.click());
    importCockpitFile.addEventListener('change', async () => {
      const file = importCockpitFile.files?.[0];
      if (!file) return;
      try {
        await this.importCockpitFile(file);
      } finally {
        importCockpitFile.value = '';
      }
    });
    $('#confirmReplaceCockpit').addEventListener('click', () => {
      $<HTMLDialogElement>('#replaceCockpitDialog').close();
      if (this.importedDesign) this.useImportedDesign(this.importedDesign);
      this.importedDesign = null;
    });
  }

  /**
   * Explains that the project held a parametric cockpit, which was left out because it is
   * retired (docs/adr/0004). A project restored from this browser keeps the earlier version's
   * saved copy.
   */
  reportLeftOutCockpit({ fromBrowser }: { fromBrowser: boolean }) {
    $('#leftOutCockpitKept').hidden = !fromBrowser;
    $<HTMLDialogElement>('#leftOutCockpitDialog').showModal();
  }

  /** Explains that the saved design could not be read and where it is kept. */
  reportUnreadableSave(keptAs: string, text: string) {
    $('#unreadableKept').textContent =
      keptAs === STORAGE_KEY
        ? `it stays in this browser, and automatic saving is off so that nothing replaces it. Export a JSON file to keep new changes.`
        : `it stays in this browser as "${keptAs}", and new changes are saved separately.`;
    $('#downloadUnreadable').onclick = () => download('cockpit-lab-unreadable-design.json', text);
    $<HTMLDialogElement>('#unreadableDialog').showModal();
    this.host.showSaveStatus('The saved design could not be opened · it was kept', 'error');
  }

  private exportProject() {
    const data = projectData(this.host.project.recorded());
    download('cockpit-lab-design.json', JSON.stringify(data, null, 2));
    this.host.toast('JSON exported. Use Open JSON to bring this design back.');
  }

  private async openProjectFile(file: File) {
    const host = this.host;
    try {
      const data: unknown = JSON.parse(await textOf(file));
      if (isCockpitFile(data)) {
        host.toast('This is a cockpit file: import it from the Cockpit editor.');
        return;
      }
      const opened = readProject(data);
      host.openProject(opened.project);
      host.project.saveNow();
      host.showOpenedProject();
      if (opened.parametricCockpitLeftOut) this.reportLeftOutCockpit({ fromBrowser: false });
      else host.toast('Design loaded');
    } catch {
      host.toast('Could not load the file: use a JSON file exported by Cockpit Lab.');
    }
  }

  private exportCockpit() {
    const { design } = this.host.cockpitEditor.session;
    if (design === null) return;
    download('cockpit-lab-cockpit.json', JSON.stringify(cockpitFileData(design), null, 2));
    this.host.toast('Cockpit file exported. Import it from the Cockpit editor of another project.');
  }

  /** Imports a cockpit file, asking first when it would replace the project's design. */
  private async importCockpitFile(file: File) {
    try {
      const design = readCockpitFile(JSON.parse(await textOf(file)));
      if (this.host.cockpitEditor.hasDesign()) {
        this.importedDesign = design;
        $<HTMLDialogElement>('#replaceCockpitDialog').showModal();
      } else this.useImportedDesign(design);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      this.host.toast(
        message === 'This is not a cockpit file'
          ? 'This is a project file: open it with Open JSON.'
          : message === PARAMETRIC_COCKPIT_FILE_MESSAGE
            ? 'This cockpit file holds a cockpit of the retired configurator, which is not converted. Design it again from parts.'
            : 'Could not import the file: use a cockpit file exported by Cockpit Lab.',
      );
    }
  }

  /** Makes an imported design the project's, in the cockpit editor and in the room. */
  private useImportedDesign(design: CockpitDesign) {
    const host = this.host;
    host.openProject(replaceCockpitDesign(host.project.recorded(), design));
    host.project.saveNow();
    host.showImportedDesign();
    host.toast('Cockpit file imported.');
  }
}
