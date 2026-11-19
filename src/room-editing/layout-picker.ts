// The layout picker of the room editor: the layout shown, and duplicating, renaming and
// deleting it, each named or confirmed in its dialog.
import { $ } from '../dom.ts';
import {
  activeLayout,
  deleteLayout,
  duplicateLayout,
  MAX_LAYOUT_NAME_LENGTH,
  MAX_LAYOUTS,
  renameLayout,
  selectLayout,
} from '../layouts.ts';
import { layoutOptionsHTML } from '../layouts-view.ts';
import type { RoomEditorHost } from './host.ts';

type LayoutNameAction = 'duplicate' | 'rename';

export class LayoutPicker {
  declare private readonly host: RoomEditorHost;
  /** What the name dialog does once it is sent. */
  declare private nameAction: LayoutNameAction;

  constructor(host: RoomEditorHost) {
    this.host = host;
    this.nameAction = 'duplicate';
    const layoutSelect = $<HTMLSelectElement>('#layoutSelect');
    layoutSelect.addEventListener('change', () => {
      const id = layoutSelect.value;
      host.changeLayouts((layouts) => selectLayout(layouts, id));
      host.toast(`Showing the layout ${activeLayout(host.project.library).name}`);
    });
    $('#duplicateLayout').addEventListener('click', () => this.askName('duplicate'));
    $('#renameLayout').addEventListener('click', () => this.askName('rename'));
    $('#layoutNameForm').addEventListener('submit', () => this.nameSent());
    $('#deleteLayout').addEventListener('click', () =>
      $<HTMLDialogElement>('#deleteLayoutDialog').showModal(),
    );
    $('#confirmDeleteLayout').addEventListener('click', () => {
      const deleted = activeLayout(host.project.library).name;
      host.changeLayouts((layouts) => deleteLayout(layouts, layouts.activeLayoutId));
      $<HTMLDialogElement>('#deleteLayoutDialog').close();
      host.toast(`Layout ${deleted} deleted`);
    });
  }

  /** Shows the picker, which appears in the room editor once the guided setup is done. */
  render(hidden: boolean) {
    const { library } = this.host.project;
    $('#layoutArea').hidden = hidden;
    const select = $<HTMLSelectElement>('#layoutSelect');
    const options = layoutOptionsHTML(library);
    if (select.innerHTML !== options) select.innerHTML = options;
    select.value = library.activeLayoutId;
    $('#layoutHint').hidden = library.layouts.length > 1;
    $<HTMLButtonElement>('#deleteLayout').disabled = library.layouts.length === 1;
    $<HTMLButtonElement>('#duplicateLayout').disabled = library.layouts.length >= MAX_LAYOUTS;
  }

  private askName(action: LayoutNameAction) {
    this.nameAction = action;
    const current = activeLayout(this.host.project.library).name;
    const input = $<HTMLInputElement>('#layoutName');
    $('#layoutNameTitle').textContent =
      action === 'duplicate' ? 'Duplicate layout' : 'Rename layout';
    $('#confirmLayoutName').textContent = action === 'duplicate' ? 'Duplicate' : 'Rename';
    $('#layoutNameDescription').hidden = action !== 'duplicate';
    input.value =
      action === 'duplicate' ? `${current} (copy)`.slice(0, MAX_LAYOUT_NAME_LENGTH) : current;
    $<HTMLDialogElement>('#layoutNameDialog').showModal();
    input.select();
  }

  private nameSent() {
    const host = this.host;
    const name = $<HTMLInputElement>('#layoutName').value;
    if (this.nameAction === 'duplicate') {
      host.changeLayouts((layouts) => duplicateLayout(layouts, name));
      host.toast('Layout duplicated. Your changes now go to the copy.');
    } else {
      host.changeLayouts((layouts) => renameLayout(layouts, layouts.activeLayoutId, name));
      host.toast('Layout renamed');
    }
  }
}
