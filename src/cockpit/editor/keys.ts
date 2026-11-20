// The keys of the cockpit editor. Escape drops what is waiting, being measured or being added;
// Enter confirms it; Delete removes the selected part; Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z)
// undo and redo. In a text field they keep editing its text.
import { deleteKeyAction } from './part-tools.ts';
import type { CockpitEditor } from './editor.ts';

const dialogOpen = (): boolean => document.querySelector('dialog[open]') !== null;

const inAField = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

/** Binds the editor's keys; `shown` says whether the cockpit editor is the one shown. */
export function bindCockpitKeys(editor: CockpitEditor, shown: () => boolean) {
  document.addEventListener('keydown', (event) => {
    const { session } = editor;
    if (session.pendingChange && !dialogOpen()) {
      if (event.key === 'Escape') {
        editor.cancelChange();
        return;
      }
      const typing = inAField(event.target) || event.target instanceof HTMLButtonElement;
      if (event.key === 'Enter' && !typing) {
        editor.confirmChange();
        return;
      }
    }
    if (event.key === 'Escape' && session.openJointMarker !== null) {
      editor.closeJointCard();
      return;
    }
    if (event.key === 'Escape' && session.measurePicks !== null && !dialogOpen()) {
      editor.setMeasuring(false);
      return;
    }
    if (event.key === 'Escape' && session.draft !== null && !dialogOpen()) {
      editor.cancelDraft();
      return;
    }
    if (!shown() || dialogOpen() || inAField(event.target)) return;
    if (event.key === 'Delete' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      deleteWithKey(editor, event);
      return;
    }
    // A focused button takes Enter as its own click.
    const onAButton = event.target instanceof HTMLButtonElement;
    if (event.key === 'Enter' && session.draft !== null && !onAButton) {
      event.preventDefault();
      editor.confirmDraft();
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      editor.undo();
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      editor.redo();
    }
  });
}

/**
 * Delete removes the selected part, or deletes a selected step that makes none, as the buttons
 * of its inspector do. A part about to be added is left alone: Escape cancels it.
 */
function deleteWithKey(editor: CockpitEditor, event: KeyboardEvent) {
  const { session } = editor;
  if (session.draft !== null || session.pendingChange) return;
  const action = deleteKeyAction(editor.selectedOperation(), editor.selectedFailure(), {
    fitting: session.fitting,
  });
  if (action === null) return;
  event.preventDefault();
  if (action === 'remove-part') editor.removeSelectedPart();
  else editor.deleteSelectedStep();
}
