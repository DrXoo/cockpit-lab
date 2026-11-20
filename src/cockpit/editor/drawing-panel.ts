// The Drawing view of the cockpit editor: in place of the 3D view, the drawing of the selected
// plate. Pointing at a hole names it; clicking one keeps its name shown below the drawing.
import { $, $$ } from '../../ui/dom.ts';
import type { CockpitEditor } from './editor.ts';

/** What the Drawing view needs from the page that holds it. */
export interface DrawingPanelHost {
  /** Whether the cockpit editor is the one shown. */
  inCockpitEditor(): boolean;
  /** Goes back to the camera view shown before the drawing. */
  showCameraView(): void;
}

const NO_PLATE_TITLE = 'Select a plate to see its drawing';
const PLATE_TITLE = 'The selected plate, with its holes, as it is cut';

export class DrawingPanel {
  declare private readonly editor: CockpitEditor;
  declare private readonly host: DrawingPanelHost;
  declare private open: boolean;
  /** The drawing last shown, so the page is only rebuilt when it changes. */
  declare private shownSvg: string;
  declare private descriptions: string[];

  constructor(editor: CockpitEditor, host: DrawingPanelHost) {
    this.editor = editor;
    this.host = host;
    this.open = false;
    this.shownSvg = '';
    this.descriptions = [];
    $('#drawingView').addEventListener('click', () => this.show());
    const sheet = $('#plateDrawingSheet');
    sheet.addEventListener('click', (event) => this.chooseHole(event));
    sheet.addEventListener('pointerover', (event) => this.describeHole(event));
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Shows the drawing of the selected plate in place of the 3D view. */
  show() {
    if (this.editor.plateDrawing() === null) return;
    this.open = true;
    $$('[data-view]').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    });
    this.render();
  }

  /** Hides the drawing, as a camera view is chosen. */
  hide() {
    this.open = false;
    this.render();
  }

  /** Offers the Drawing view for a selected plate, and shows it again from the design. */
  render() {
    const inCockpit = this.host.inCockpitEditor();
    const drawing = inCockpit ? this.editor.plateDrawing() : null;
    const button = $<HTMLButtonElement>('#drawingView');
    button.hidden = !inCockpit;
    button.disabled = drawing === null;
    button.title = drawing === null ? NO_PLATE_TITLE : PLATE_TITLE;
    if (this.open && drawing === null) {
      this.open = false;
      this.host.showCameraView();
      return;
    }
    button.classList.toggle('active', this.open);
    button.setAttribute('aria-pressed', String(this.open));
    $('#plateDrawingView').hidden = !this.open;
    if (!this.open || drawing === null) return;
    if (drawing.svg === this.shownSvg) return;
    this.shownSvg = drawing.svg;
    this.descriptions = drawing.descriptions;
    $('#plateDrawingSheet').innerHTML = drawing.svg;
    $('#plateDrawingHole').textContent = this.hint();
  }

  private hint(): string {
    return this.descriptions.length === 0
      ? 'No holes yet: mount a peripheral on the plate or bolt it to a profile.'
      : 'Point at a hole, or click it, to see what puts it there.';
  }

  private holeAt(event: Event): { element: Element; index: number } | null {
    if (!(event.target instanceof Element)) return null;
    const element = event.target.closest('[data-hole]');
    const index = Number(element?.getAttribute('data-hole'));
    if (!element || !Number.isInteger(index) || this.descriptions[index] === undefined) return null;
    return { element, index };
  }

  private describeHole(event: Event) {
    const chosen = $('#plateDrawingSheet').querySelector('.chosen');
    if (chosen) return;
    const hole = this.holeAt(event);
    $('#plateDrawingHole').textContent = hole ? this.descriptions[hole.index] : this.hint();
  }

  private chooseHole(event: Event) {
    const hole = this.holeAt(event);
    const sheet = $('#plateDrawingSheet');
    sheet.querySelectorAll('.chosen').forEach((element) => element.classList.remove('chosen'));
    if (hole) hole.element.classList.add('chosen');
    $('#plateDrawingHole').textContent = hole ? this.descriptions[hole.index] : this.hint();
  }
}
