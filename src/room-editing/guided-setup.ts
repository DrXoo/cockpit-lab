// The guided setup of a new room: one step after another, the room's size first, each saved as
// it is filled in, with the progress at the top of the side panel.
import { $, $optional, dataOf } from '../dom.ts';
import { steps, type StepId } from '../project.ts';
import { nextSetupStep, sectionOfStep, withDesk, withRoomSize } from '../setup-actions.ts';
import type { RoomEditorHost } from './host.ts';

/** The forms of the setup that keep what was typed before they are sent. */
const DRAFT_FORMS = [
  ['room', 'setupRoom'],
  ['desk', 'setupDesk'],
] as const;

function stepOf(value: string): StepId {
  const step = steps.find((s) => s.id === value);
  if (!step) throw new Error(`Unknown setup step: ${value}`);
  return step.id;
}

const numberIn = (selector: string): number => Number($<HTMLInputElement>(selector).value);

export class GuidedSetup {
  declare private readonly host: RoomEditorHost;

  constructor(host: RoomEditorHost) {
    this.host = host;
    $('#setupProgress').addEventListener('click', (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('[data-step]')
          : null;
      if (button && !button.disabled) this.enterStep(stepOf(dataOf(button, 'step')));
    });
    $('#setupBack').addEventListener('click', () => {
      const index = steps.findIndex((s) => s.id === host.project.setup.step);
      if (index > 0) this.enterStep(steps[index - 1].id);
    });
    $('#setupNext').addEventListener('click', () => {
      if (host.project.setup.step === 'room')
        $optional<HTMLFormElement>('#setupRoomForm')?.requestSubmit();
      else this.continue();
    });
    $('#setupSkip').addEventListener('click', () => this.continue(true));
  }

  /** Shows a step of the setup, in its tab and view. */
  enterStep(id: StepId) {
    const host = this.host;
    const { project, selection } = host;
    project.setup = { ...project.setup, step: id };
    selection.target = id === 'desk' ? 'desk' : '';
    selection.editing = project.state.roomEnabled;
    host.showWorkspace('config');
    host.switchSection(sectionOfStep(id));
    project.saveNow();
    host.refresh();
    host.setActiveView(id === 'desk' && project.state.deskEnabled ? 'desk' : 'top');
  }

  /** Goes on to the next step, or skips this one for later when `defer`. */
  continue(defer = false) {
    const host = this.host;
    const { project } = host;
    const result = nextSetupStep(project.setup, project.state, { defer });
    if (result.status === 'needs-room') {
      $optional<HTMLFormElement>('#setupRoomForm')?.reportValidity();
      return;
    }
    if (result.status === 'blocked') return;
    project.setup = result.setup;
    project.saveNow();
    if (project.setup.step === 'complete') {
      host.selection.editing = false;
      host.switchSection('room');
      host.showWorkspace('view');
      host.setActiveView('iso');
      host.refresh();
      host.toast('Project ready. You can keep editing each part.');
    } else this.enterStep(project.setup.step);
  }

  /** Binds the forms of the setup the side panel shows. */
  bind() {
    const host = this.host;
    const { project, selection } = host;
    for (const [group, prefix] of DRAFT_FORMS) {
      $optional(`#${prefix}Form`)?.addEventListener('input', () => {
        const draft = {
          w: $<HTMLInputElement>(`#${prefix}W`).value,
          d: $<HTMLInputElement>(`#${prefix}D`).value,
          h: $<HTMLInputElement>(`#${prefix}H`).value,
        };
        project.setup = { ...project.setup, drafts: { ...project.setup.drafts, [group]: draft } };
        project.saveSoon();
      });
    }
    const roomForm = $optional<HTMLFormElement>('#setupRoomForm');
    roomForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!roomForm.reportValidity()) return;
      project.state = withRoomSize(
        project.state,
        numberIn('#setupRoomW'),
        numberIn('#setupRoomD'),
        numberIn('#setupRoomH'),
      );
      project.setup = { ...project.setup, drafts: { ...project.setup.drafts, room: undefined } };
      project.saveNow();
      this.continue();
    });
    const deskForm = $optional<HTMLFormElement>('#setupDeskForm');
    deskForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!deskForm.reportValidity()) return;
      project.state = withDesk(
        project.state,
        numberIn('#setupDeskW'),
        numberIn('#setupDeskD'),
        numberIn('#setupDeskH'),
      );
      project.setup = {
        ...project.setup,
        deferred: project.setup.deferred.filter((id) => id !== 'desk'),
        drafts: { ...project.setup.drafts, desk: undefined },
      };
      selection.target = 'desk';
      selection.editing = true;
      project.saveNow();
      host.renderControls();
      host.refresh();
      host.setLayoutEditing(true, selection.target, false);
      host.setActiveView('desk');
    });
  }
}
