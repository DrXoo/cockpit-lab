// The toolbar of the view in the cockpit editor: the actions on the selected part, Fit and the
// measure tool.
import { partToolsOf, type PartTool } from './part-tools.ts';
import { $ } from '../../ui/dom.ts';
import type { CockpitEditor } from './editor.ts';

const PART_TOOL_BUTTONS: Record<Exclude<PartTool, 'mount'>, string> = {
  grow: '#growProfile',
  plate: '#putPlate',
  foot: '#addFoot',
  remove: '#removePart',
};

/** The button that mounts a peripheral of each type in the catalog, as the markup names it. */
const MOUNT_BUTTONS: Readonly<Record<string, string>> = {
  'generic-seat': '#mountSeat',
  'generic-wheel-base': '#mountWheelBase',
  'generic-pedals': '#mountPedals',
};

export class CockpitToolbar {
  declare private readonly editor: CockpitEditor;
  /** Whether the cockpit editor is the one shown. */
  declare private readonly shown: () => boolean;

  constructor(editor: CockpitEditor, shown: () => boolean) {
    this.editor = editor;
    this.shown = shown;
    $('#measureBtn').addEventListener('click', () =>
      editor.setMeasuring(editor.session.measurePicks === null),
    );
    $('#growProfile').addEventListener('click', () => editor.startGrowth());
    $('#putPlate').addEventListener('click', () => editor.startPlate());
    for (const [typeId, selector] of Object.entries(MOUNT_BUTTONS))
      $(selector).addEventListener('click', () => editor.startMounting(typeId));
    $('#fitModeBtn').addEventListener('click', () => editor.setFitting(!editor.session.fitting));
    $('#addFoot').addEventListener('click', () => editor.addFootUnderSelected());
    $('#removePart').addEventListener('click', () => editor.removeSelectedPart());
  }

  /** Offers the actions on the selected part, in the cockpit editor and while no part is being added. */
  render() {
    const editor = this.editor;
    const offered = this.shown() && editor.session.draft === null;
    const tools = offered
      ? partToolsOf(editor.selectedOperation(), editor.selectedFailure(), {
          fitting: editor.session.fitting,
        })
      : [];
    for (const [tool, selector] of Object.entries(PART_TOOL_BUTTONS))
      $(selector).hidden = !tools.some((offeredTool) => offeredTool === tool);
    for (const selector of Object.values(MOUNT_BUTTONS))
      $(selector).hidden = !tools.includes('mount');
    $('#partTools').hidden = tools.length === 0;
  }
}
