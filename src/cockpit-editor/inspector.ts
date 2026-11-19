// The inspector of the cockpit editor: the panel of the selected step, of the part about to be
// added or of the driver, and the checks and parts to buy of the whole design below it.
import { addAdjustment, editAdjustment, removeAdjustment } from '../cad/adjustments.ts';
import { peripheralType } from '../cad/catalog.ts';
import { draftEditedBy, withDraft, type Draft } from '../cad/drafts.ts';
import {
  editDraft,
  editFoot,
  editProfile,
  isAdjustable,
  makesAPart,
  replayDesign,
  unknownOperation,
  type GrowProfile,
  type MakingOperation,
  type MountPeripheral,
  type Operation,
} from '../cad/history.ts';
import { partsToBuy } from '../cad/parts-to-buy.ts';
import {
  addMountingHole,
  differsFromItsType,
  editPeripheral,
  editPeripheralDraft,
  removeMountingHole,
  swapPeripheralType,
} from '../cad/peripherals.ts';
import { editPlate, editPlateDraft } from '../cad/plates.ts';
import { cadChecks } from '../cad-checks.ts';
import { checkRowHTML } from '../check-view.ts';
import {
  adjustmentChange,
  adjustmentField,
  footChange,
  growPanelHTML,
  partChange,
  partField,
  partInspectorHTML,
  peripheralChange,
  peripheralPanelHTML,
  plateChange,
  platePanelHTML,
  type PartField,
} from '../cockpit-editor-view.ts';
import { partsToBuyHTML } from '../cockpit-parts-view.ts';
import { $, dataOf, replaceKeepingFocus } from '../dom.ts';
import { driverHTML } from '../driver-view.ts';
import { MM_PER_CM } from '../units.ts';
import type { CockpitEditor } from './editor.ts';
import { bindJointActions } from './joint-actions.ts';

/** The inspector's title: the step selected, or the kind of part about to be added. */
export const DRAFT_TITLES: Record<'none' | Draft['kind'], string> = {
  none: 'Selected step',
  'grow-profile': 'New profile',
  'add-plate': 'New plate',
  'mount-peripheral': 'New peripheral',
};

/** The buttons that add or cancel the part about to be added, in its panel. */
const DRAFT_BUTTONS: Record<Draft['kind'], [confirm: string, cancel: string]> = {
  'grow-profile': ['#confirmGrowth', '#cancelGrowth'],
  'add-plate': ['#confirmPlate', '#cancelPlate'],
  'mount-peripheral': ['#confirmPeripheral', '#cancelPeripheral'],
};

export class CockpitInspector {
  declare private readonly editor: CockpitEditor;
  /** Whether the cockpit editor is the one shown. */
  declare private readonly shown: () => boolean;
  /** The inspector HTML last shown, so it is only rebuilt when it changes. */
  declare private shownHTML: string;
  /** What the checks and the parts to buy last showed, so an open list of items stays open. */
  declare private readonly shownLists: Map<HTMLElement, string>;
  /** The peripheral and the type it waits to be swapped for, while the swap is being confirmed. */
  declare private pendingSwap: { partId: string; typeId: string } | null;

  constructor(editor: CockpitEditor, shown: () => boolean) {
    this.editor = editor;
    this.shown = shown;
    this.shownHTML = '';
    this.shownLists = new Map();
    this.pendingSwap = null;
    this.bindSwapDialog();
  }

  /** Shows the panel of the selected step, the part about to be added or the driver. */
  render({ force = false } = {}) {
    const editor = this.editor;
    const body = $('#partInspectorBody');
    const { pendingChange, selectedOperationId, fitting, draft } = editor.session;
    // A change waiting in the view shows its values here before it is confirmed.
    const history = pendingChange?.history ?? editor.history();
    const operation = history.find((step) => step.id === selectedOperationId);
    // Fitting with nothing selected, the panel is the driver's.
    const showsDriver = fitting && draft === null && !operation;
    $('#partInspectorTitle').textContent = showsDriver
      ? 'Driver'
      : DRAFT_TITLES[draft?.kind ?? 'none'];
    const failure = operation ? replayDesign(history).failures.get(operation.id) : undefined;
    const html = showsDriver
      ? driverHTML(editor.driver(), editor.seatedDriver())
      : draft === null
        ? partInspectorHTML(
            history,
            operation,
            failure,
            editor.jointsOfSelected(),
            editor.touchingSelected(),
            { fitting },
          )
        : this.draftPanelHTML(history, draft);
    if (!force && html === this.shownHTML) return;
    this.shownHTML = html;
    replaceKeepingFocus(body, html);
    if (showsDriver) {
      this.bindDriver(body);
      return;
    }
    if (draft) {
      this.bindDraft(body, draft);
      return;
    }
    // Fitting, any part that hangs from another can slide, the frame's as well.
    if (operation && fitting && isAdjustable(operation))
      this.bindAdjustment(body, operation.partId);
    // A step the mode of the view locks has nothing else to change.
    if (!operation || !editor.changeableInMode(operation)) return;
    $('#deleteStep').addEventListener('click', () => editor.deleteSelectedStep());
    if (!makesAPart(operation)) return;
    this.fieldsIn(body).forEach((el) => {
      const field = partField(el.dataset.partField);
      el.addEventListener('change', () =>
        this.editPartField(operation, field, el.value, el.dataset.partItem),
      );
    });
    if (operation.kind === 'mount-peripheral') this.bindMountingHoles(body, operation.partId);
    bindJointActions(body, editor);
  }

  /** The checks and the parts to buy of the whole design, wherever the history marker is. */
  renderChecks() {
    const editor = this.editor;
    const shown = this.shown() && editor.hasParts();
    $('#cockpitChecksNote').hidden = !this.shown() || editor.hasParts();
    $('#cockpitChecksSection').hidden = !shown;
    $('#partsToBuySection').hidden = !shown;
    if (!shown) return;
    const history = editor.history();
    const design = replayDesign(history);
    $('#wholeDesignNote').hidden = editor.at() === history.length;
    this.showList(
      $('#cockpitChecks'),
      cadChecks({ history, ...design })
        .map(checkRowHTML)
        .join(''),
    );
    this.showList(
      $('#partsToBuy'),
      partsToBuyHTML(partsToBuy(design.resolved, design.connectors, design.joints)),
    );
  }

  private showList(container: HTMLElement, html: string) {
    if (this.shownLists.get(container) === html) return;
    container.innerHTML = html;
    this.shownLists.set(container, html);
  }

  private fieldsIn(body: HTMLElement) {
    return body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-part-field]');
  }

  /** The panel of the part about to be added, each kind its own. */
  private draftPanelHTML(history: readonly Operation[], draft: Draft): string {
    switch (draft.kind) {
      case 'grow-profile':
        return growPanelHTML(withDraft(history, draft, this.editor.at()), draft);
      case 'add-plate':
        return platePanelHTML(history, draft);
      case 'mount-peripheral':
        return peripheralPanelHTML(history, draft);
    }
  }

  private bindDraft(body: HTMLElement, draft: Draft) {
    this.fieldsIn(body).forEach((el) => {
      const field = partField(el.dataset.partField);
      el.addEventListener('change', () =>
        this.editor.changeDraft((current) => this.editedDraft(current, draft, field, el.value)),
      );
    });
    const [confirm, cancel] = DRAFT_BUTTONS[draft.kind];
    $(confirm).addEventListener('click', () => this.editor.confirmDraft());
    $(cancel).addEventListener('click', () => this.editor.cancelDraft());
  }

  /** The part about to be added, with the value of one field of its panel changed. */
  private editedDraft(
    history: readonly Operation[],
    draft: Draft,
    field: PartField,
    value: string,
  ): Draft {
    switch (draft.kind) {
      case 'add-plate':
        return editPlateDraft(history, draft, plateChange(field, value));
      case 'mount-peripheral':
        return editPeripheralDraft(history, draft, peripheralChange(draft, field, value));
      case 'grow-profile':
        return this.editedGrowthDraft(history, draft, field, value);
    }
  }

  /** The profile about to grow, with the value of one field of its panel changed. */
  private editedGrowthDraft(
    history: readonly Operation[],
    draft: GrowProfile,
    field: PartField,
    value: string,
  ): Draft {
    const change = partChange(draft, field, value);
    // The parts a profile can reach are those in front of it, in the design as the view shows it.
    if (field === 'reachesId')
      return draftEditedBy(history, draft, this.editor.at(), (shown) =>
        editProfile(shown, draft.partId, change),
      );
    return editDraft(history, draft, change);
  }

  /**
   * Changes one value of the step that made the selected part, each kind of part its own way. A
   * field of an item in a list, such as a peripheral's hole, names the item.
   */
  private editPartField(
    operation: MakingOperation,
    field: PartField,
    value: string,
    item: string | undefined,
  ) {
    const editor = this.editor;
    editor.settleChange();
    const { partId } = operation;
    switch (operation.kind) {
      case 'add-foot':
        editor.changeHistory((history) => editFoot(history, partId, footChange(field, value)));
        return;
      case 'add-plate':
        editor.changeHistory((history) => editPlate(history, partId, plateChange(field, value)));
        return;
      case 'mount-peripheral':
        if (field === 'typeId') {
          this.swapPeripheral(operation, value);
          return;
        }
        editor.changeHistory((history) =>
          editPeripheral(history, partId, peripheralChange(operation, field, value, item)),
        );
        return;
      case 'add-anchored-profile':
      case 'grow-profile':
        editor.editSelectedProfile(partChange(operation, field, value));
        return;
      default:
        unknownOperation(operation);
    }
  }

  /** The stature typed in cm; one the driver cannot have is explained and nothing changes. */
  private bindDriver(container: HTMLElement) {
    const stature = container.querySelector<HTMLInputElement>('#driverStature');
    stature?.addEventListener('change', () =>
      this.editor.setStature(Number(stature.value) * MM_PER_CM),
    );
  }

  /** The fields of a part's adjustment, and the buttons that give it one or take it away. */
  private bindAdjustment(container: HTMLElement, partId: string) {
    const editor = this.editor;
    container
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-adjustment-field]')
      .forEach((el) => {
        const field = adjustmentField(el.dataset.adjustmentField);
        el.addEventListener('change', () => {
          editor.settleChange();
          editor.changeHistory((history) =>
            editAdjustment(history, partId, adjustmentChange(field, el.value)),
          );
        });
      });
    container.querySelector('#addAdjustment')?.addEventListener('click', () => {
      editor.settleChange();
      editor.changeHistory((history) => addAdjustment(history, partId));
    });
    container.querySelector('#removeAdjustment')?.addEventListener('click', () => {
      editor.settleChange();
      editor.changeHistory((history) => removeAdjustment(history, partId));
    });
  }

  /** The buttons that add a hole to a peripheral's mounting pattern, or take one out. */
  private bindMountingHoles(container: HTMLElement, partId: string) {
    const editor = this.editor;
    container
      .querySelector('#addHole')
      ?.addEventListener('click', () =>
        editor.changeHistory((history) => addMountingHole(history, partId)),
      );
    container.querySelectorAll<HTMLElement>('[data-remove-hole]').forEach((button) =>
      button.addEventListener('click', () => {
        const index = Number(dataOf(button, 'removeHole'));
        editor.changeHistory((history) => removeMountingHole(history, partId, index));
      }),
    );
  }

  /**
   * Swaps a peripheral's type. When its own values were edited, which the swap replaces, the
   * swap waits for a confirmation first.
   */
  private swapPeripheral(peripheral: MountPeripheral, typeId: string) {
    if (!differsFromItsType(peripheral)) {
      this.editor.changeHistory((history) =>
        swapPeripheralType(history, peripheral.partId, typeId),
      );
      return;
    }
    this.pendingSwap = { partId: peripheral.partId, typeId };
    $('#swapPeripheralName').textContent = peripheral.name;
    $('#swapPeripheralType').textContent = peripheralType(typeId).name;
    $<HTMLDialogElement>('#swapPeripheralDialog').showModal();
  }

  private bindSwapDialog() {
    $('#confirmSwapPeripheral').addEventListener('click', () => {
      const swap = this.pendingSwap;
      $<HTMLDialogElement>('#swapPeripheralDialog').close();
      if (swap)
        this.editor.changeHistory((history) =>
          swapPeripheralType(history, swap.partId, swap.typeId),
        );
    });
    // Kept or swapped, the inspector shows the type the peripheral has.
    $('#swapPeripheralDialog').addEventListener('close', () => {
      this.pendingSwap = null;
      this.render({ force: true });
    });
  }
}
