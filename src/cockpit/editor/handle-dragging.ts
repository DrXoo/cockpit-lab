// Dragging the handles of the view: the pointer moves them, and the box of a waiting change
// takes the value once a handle is let go.
import type { Draft } from '../cad/history/drafts.ts';
import type { Handle, HandleModifiers } from '../cad/interaction/handles.ts';
import { $ } from '../../ui/dom.ts';
import type { CockpitEditor } from './editor.ts';

export class HandleDragging {
  declare private readonly editor: CockpitEditor;
  /** How far the handle had been dragged when it was grabbed, to drag on from there. */
  declare private changeAtGrabMm: number;
  /** The part about to be added as it was when one of its handles was grabbed. */
  declare private draftAtGrab: Draft | null;

  constructor(editor: CockpitEditor) {
    this.editor = editor;
    this.changeAtGrabMm = 0;
    this.draftAtGrab = null;
    const input = this.changeValue();
    input.addEventListener('input', () => this.typeChange());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') editor.confirmChange();
    });
  }

  grab(handle: Handle) {
    const { draft, pendingChange } = this.editor.session;
    if (draft?.partId === handle.partId) {
      this.draftAtGrab = draft;
      return;
    }
    // The box shows the value as the drag goes, which it keeps while its field has the focus.
    this.changeValue().blur();
    this.changeAtGrabMm = pendingChange?.handle.id === handle.id ? pendingChange.drag.changeMm : 0;
  }

  /** A drag snaps to the parts around it when near them, and otherwise goes in steps. */
  drag(shown: Handle, movedMm: number, modifiers: HandleModifiers) {
    if (this.draftAtGrab !== null) {
      // A part no longer about to be added, as Escape left it mid-drag, is not brought back.
      if (this.editor.session.draft === null) this.draftAtGrab = null;
      else this.editor.dragDraft(this.draftAtGrab, shown, movedMm, modifiers);
      return;
    }
    this.editor.dragChange(shown, this.changeAtGrabMm, movedMm, modifiers);
  }

  /** Once a handle is let go, its value waits in the box, ready to be typed exactly. */
  release() {
    if (this.draftAtGrab !== null) {
      this.draftAtGrab = null;
      return;
    }
    // The box stays where the view shows it: focusing it must not scroll the page.
    if (this.editor.session.pendingChange?.drag.reachesId !== undefined) {
      $('#confirmChange').focus({ preventScroll: true });
      return;
    }
    const input = this.changeValue();
    input.focus({ preventScroll: true });
    input.select();
  }

  /** A value typed in the box sets the change exactly. */
  private typeChange() {
    const typed = this.changeValue().value;
    if (typed.trim() === '' || !Number.isFinite(Number(typed))) return;
    this.editor.typeChange(Number(typed));
  }

  private changeValue(): HTMLInputElement {
    return $<HTMLInputElement>('#changeValue');
  }
}
