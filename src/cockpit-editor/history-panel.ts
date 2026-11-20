// The side panel of the cockpit editor: the design history with its marker, and the buttons
// that add a profile, undo and redo.
import { replayDesign } from '../cad/history.ts';
import { designPanelHTML } from '../cockpit-editor-view.ts';
import { dataOf } from '../ui/dom.ts';
import { canRedo, canUndo } from '../shared/undo.ts';
import type { CockpitEditor } from './editor.ts';

export function historyPanelHTML(editor: CockpitEditor): string {
  const { session } = editor;
  return designPanelHTML({
    history: editor.history(),
    marker: editor.at(),
    selectedOperationId: session.selectedOperationId,
    failures: replayDesign(editor.history()).failures,
    canUndo: canUndo(session.edits),
    canRedo: canRedo(session.edits),
    fitting: session.fitting,
  });
}

/** Binds the controls of the history panel in `panel`, those it shows. */
export function bindHistoryPanel(panel: HTMLElement, editor: CockpitEditor) {
  const button = (id: string) => panel.querySelector<HTMLElement>(`#${id}`);
  button('addProfile')?.addEventListener('click', () => editor.addProfile());
  button('undoEdit')?.addEventListener('click', () => editor.undo());
  button('redoEdit')?.addEventListener('click', () => editor.redo());
  button('markerBack')?.addEventListener('click', () => editor.moveMarker(editor.at() - 1));
  button('markerForward')?.addEventListener('click', () => editor.moveMarker(editor.at() + 1));
  button('markerEnd')?.addEventListener('click', () => editor.moveMarker(null));
  panel
    .querySelectorAll<HTMLElement>('[data-operation]')
    .forEach((step) =>
      step.addEventListener('click', () => editor.select(dataOf(step, 'operation'))),
    );
}
