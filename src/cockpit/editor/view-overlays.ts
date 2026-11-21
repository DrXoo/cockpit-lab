// What the cockpit editor shows over the view, beside the parts it is about: the box of a
// change dragged with a handle, the box of a part about to be added, the card of a joint
// marker, the label of the part under the pointer and the readout of the measure tool.
import type { Draft } from '../cad/history/drafts.ts';
import { draftCornersMm } from '../cad/history/drafts.ts';
import { dragReadout, type DragReadout } from '../cad/interaction/handles.ts';
import { operationMaking } from '../cad/history/history.ts';
import type { PartHit } from '../cad/interaction/picking.ts';
import { jointCardHTML } from './joints-view.ts';
import { $, $optional, dataOf, replaceKeepingFocus } from '../../ui/dom.ts';
import { hoverLabel } from './hover-view.ts';
import { measureReadout } from './measure-view.ts';
import { handleBallMm } from '../render/handles.ts';
import { MM_PER_CM } from '../../shared/units.ts';
import type { CockpitEditor } from './editor.ts';
import { DRAFT_TITLES } from './inspector.ts';
import { bindJointActions } from './joint-actions.ts';

interface Point {
  x: number;
  y: number;
  z: number;
}

/** How the view keeps an element of the page beside a point of the scene, in cm. */
export interface ViewAnchors {
  /** Keeps `el` beside a point, clear of another, or lets it go (null). */
  anchorElement(el: HTMLElement, pointCm: Point | null, clearOfCm?: Point | null): void;
  /** Keeps `el` above the outline some points make on screen, or lets it go (null). */
  anchorAbove(el: HTMLElement, pointsCm: readonly Point[] | null): void;
}

/** Far enough along a move arrow to tell which side of the screen it points to. */
const ARROW_CLEARANCE_MM = 100;

/** The label by the pointer shows once the pointer has rested this long on a part. */
const HOVER_LABEL_DELAY_MS = 500;

/** How far the label stands from the pointer, so it does not hide what it names. */
const HOVER_LABEL_OFFSET_PX = 14;

/** What the box of a waiting change calls its value. */
const READOUT_LABELS: Record<DragReadout['kind'], string> = {
  change: 'Change',
  length: 'Length',
  width: 'Width',
  depth: 'Depth',
  move: 'Move',
  reach: 'Reaches',
  position: 'Position',
};

/** What ✓ in the box of a part about to be added does, as its panel's button says it. */
const DRAFT_CONFIRM_LABELS: Record<Draft['kind'], string> = {
  'grow-profile': 'Add the profile',
  'add-plate': 'Add the plate',
  'mount-peripheral': 'Mount it',
};

const inCm = (pointMm: Point): Point => ({
  x: pointMm.x / MM_PER_CM,
  y: pointMm.y / MM_PER_CM,
  z: pointMm.z / MM_PER_CM,
});

export class CockpitViewOverlays {
  declare private readonly editor: CockpitEditor;
  /** The view, once it is drawn: without WebGL there is none. */
  declare private readonly anchors: () => ViewAnchors | undefined;
  /** Whether the cockpit editor is the one shown. */
  declare private readonly shown: () => boolean;
  /** The joint card last shown, so it is only rebuilt when it changes. */
  declare private shownJointCard: string;
  declare private hoverLabelTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(editor: CockpitEditor, anchors: () => ViewAnchors | undefined, shown: () => boolean) {
    this.editor = editor;
    this.anchors = anchors;
    this.shown = shown;
    this.shownJointCard = '';
    this.hoverLabelTimer = undefined;
    $('#turnDraftInView').addEventListener('click', () => editor.turnDraft());
    $('#confirmDraftInView').addEventListener('click', () => editor.confirmDraft());
    $('#cancelDraftInView').addEventListener('click', () => editor.cancelDraft());
    $('#confirmChange').addEventListener('click', () => editor.confirmChange());
    $('#cancelChange').addEventListener('click', () => editor.cancelChange());
  }

  render() {
    this.renderMeasure();
    this.renderChangeBox();
    this.renderDraftBox();
    this.renderJointCard();
  }

  /** The card of the open joint marker, beside it, with the joint's actions. */
  renderJointCard() {
    const card = $('#jointCard');
    const open = this.editor.jointCard();
    if (open === null) {
      this.editor.forgetJointCard();
      this.shownJointCard = '';
      card.hidden = true;
      this.anchors()?.anchorElement(card, null);
      return;
    }
    const html = jointCardHTML(open.card);
    if (html !== this.shownJointCard) {
      this.shownJointCard = html;
      replaceKeepingFocus(card, html);
      bindJointActions(card, this.editor);
      card
        .querySelectorAll<HTMLElement>('[data-joint-more]')
        .forEach((button) =>
          button.addEventListener('click', () =>
            this.showJointInInspector(dataOf(button, 'jointMore')),
          ),
        );
    }
    this.anchors()?.anchorElement(card, inCm(open.marker.pointMm));
    card.hidden = false;
  }

  /**
   * Names the part under the pointer once it rests there. Any move hides the label and starts
   * the wait again, so it never trails the pointer.
   */
  hover(hit: PartHit | null, pointer: { x: number; y: number }) {
    const label = $('#hoverLabel');
    clearTimeout(this.hoverLabelTimer);
    label.hidden = true;
    if (hit === null) return;
    this.hoverLabelTimer = setTimeout(() => {
      const resolved = this.shown() ? this.editor.drawing()?.resolved.get(hit.partId) : undefined;
      // A hidden label has no offset parent: it is placed in the view area that holds it.
      const area = label.parentElement;
      if (!resolved || !(area instanceof HTMLElement)) return;
      const bounds = area.getBoundingClientRect();
      const note = this.editor.secondProfileNote(hit.partId);
      label.textContent = note === null ? hoverLabel(resolved) : `${hoverLabel(resolved)}: ${note}`;
      label.dataset.part = hit.partId;
      label.style.top = `${pointer.y - bounds.top + HOVER_LABEL_OFFSET_PX}px`;
      label.hidden = false;
      // Beside the pointer, or before it where the view has no room after it.
      const after = pointer.x - bounds.left + HOVER_LABEL_OFFSET_PX;
      const before = pointer.x - bounds.left - HOVER_LABEL_OFFSET_PX - label.offsetWidth;
      const fits = after + label.offsetWidth <= bounds.width;
      label.style.left = `${fits ? after : Math.max(0, before)}px`;
    }, HOVER_LABEL_DELAY_MS);
  }

  /** Selects a part of the open joint and shows its joints in the inspector. */
  private showJointInInspector(partId: string) {
    this.editor.closeJointCard();
    this.editor.selectPart(partId);
    $optional('#partJoints')?.scrollIntoView({ block: 'nearest' });
  }

  /** The box of a waiting change, beside the handle that made it, with its value. */
  private renderChangeBox() {
    const editor = this.editor;
    const box = $('#changeBox');
    const pending = editor.session.pendingChange;
    const [handle] = pending ? editor.shownHandles() : [];
    if (!pending || !handle) {
      box.hidden = true;
      this.anchors()?.anchorElement(box, null);
      return;
    }
    const history = editor.history();
    const readout = dragReadout(history, pending.handle, pending.drag);
    box.dataset.kind = readout.kind;
    const { reachesId } = pending.drag;
    // An end that reaches a part takes its length from the gap: the box names the part instead.
    $('#changeKind').textContent =
      reachesId === undefined
        ? READOUT_LABELS[readout.kind]
        : `${READOUT_LABELS.reach} ${operationMaking(history, reachesId)?.name ?? reachesId}`;
    const input = $<HTMLInputElement>('#changeValue');
    if (document.activeElement !== input) input.value = String(readout.valueMm);
    const ball = handleBallMm(handle);
    // The box keeps clear of the arrow being dragged, which starts where it is anchored.
    const { outwardMm } = handle;
    const arrowTip = {
      x: ball.x + outwardMm.x * ARROW_CLEARANCE_MM,
      y: ball.y + outwardMm.y * ARROW_CLEARANCE_MM,
      z: ball.z + outwardMm.z * ARROW_CLEARANCE_MM,
    };
    const anArrow = handle.kind === 'move' || handle.kind === 'travel';
    this.anchors()?.anchorElement(box, inCm(ball), anArrow ? inCm(arrowTip) : null);
    box.hidden = false;
  }

  /**
   * The box of a part about to be added, above it in the view: ✓ adds it and ✗ drops it, as
   * the buttons of its panel do, so a part placed with its handles is added without leaving
   * the view. A profile about to grow also turns from it.
   */
  private renderDraftBox() {
    const editor = this.editor;
    const box = $('#draftBox');
    const { draft } = editor.session;
    if (draft === null || !this.shown()) {
      box.hidden = true;
      this.anchors()?.anchorAbove(box, null);
      return;
    }
    $('#draftKind').textContent = DRAFT_TITLES[draft.kind];
    $('#turnDraftInView').hidden = draft.kind !== 'grow-profile';
    const confirm = $('#confirmDraftInView');
    const confirmLabel = DRAFT_CONFIRM_LABELS[draft.kind];
    confirm.title = `${confirmLabel} (Enter)`;
    confirm.setAttribute('aria-label', confirmLabel);
    const corners = draftCornersMm(editor.history(), draft, editor.at());
    this.anchors()?.anchorAbove(box, corners.map(inCm));
    box.hidden = false;
  }

  /** What the measure tool shows besides the view: its button, its readout and the cursor. */
  private renderMeasure() {
    const { measurePicks } = this.editor.session;
    const on = measurePicks !== null;
    $('#measureBtn').classList.toggle('active', on);
    $('#measureBtn').setAttribute('aria-pressed', String(on));
    $('#viewport').classList.toggle('measuring', on);
    $('#measureReadout').hidden = !on;
    if (measurePicks === null) return;
    $('#measureReadout').textContent = measureReadout(
      measurePicks.length,
      this.editor.measureDrawing()?.measurement ?? null,
    );
  }
}
