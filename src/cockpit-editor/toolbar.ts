// The toolbar of the view in the cockpit editor: the actions on the selected part, Fit and the
// measure tool.
import { partToolsOf, type PartTool } from '../cockpit-editor-view.ts';
import { $ } from '../ui/dom.ts';
import type { CockpitEditor } from './editor.ts';

const PART_TOOL_BUTTONS: Record<PartTool, string> = {
  grow: '#growProfile',
  plate: '#putPlate',
  foot: '#addFoot',
  remove: '#removePart',
  'mount-seat': '#mountSeat',
  'mount-wheel-base': '#mountWheelBase',
  'mount-pedals': '#mountPedals',
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
    $('#mountSeat').addEventListener('click', () => editor.startMounting('generic-seat'));
    $('#mountWheelBase').addEventListener('click', () =>
      editor.startMounting('generic-wheel-base'),
    );
    $('#mountPedals').addEventListener('click', () => editor.startMounting('generic-pedals'));
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
    $('#partTools').hidden = tools.length === 0;
  }
}
