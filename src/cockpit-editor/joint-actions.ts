// The joint actions the inspector and the card of a joint marker offer alike: corner brackets
// on each side, bolts in each slot, and joining parts that only touch.
import { fastenWithBolts, fastenWithBrackets, joinParts, setConnector } from '../cad/fastening.ts';
import { faceOf, QUICK_BOLTS_PER_SLOT } from '../cockpit-editor-view.ts';
import { dataOf } from '../dom.ts';
import type { CockpitEditor } from './editor.ts';

/** Binds the joint actions in `container` to the editor. */
export function bindJointActions(container: HTMLElement, editor: CockpitEditor) {
  container.querySelectorAll<HTMLElement>('[data-joint][data-side]').forEach((button) =>
    button.addEventListener('click', () => {
      const side = faceOf(dataOf(button, 'side'));
      const on = button.getAttribute('aria-pressed') !== 'true';
      editor.changeJoints((history, at) =>
        setConnector(history, dataOf(button, 'joint'), side, on, at),
      );
    }),
  );
  container.querySelectorAll<HTMLElement>('[data-join]').forEach((button) =>
    button.addEventListener('click', () => {
      // A card names the part it joins from; the inspector joins from the selected part.
      const partId = button.dataset.joinFrom ?? editor.selectedPartId();
      if (partId === null) return;
      editor.changeJoints((history, at) => joinParts(history, partId, dataOf(button, 'join'), at));
    }),
  );
  container
    .querySelectorAll<HTMLElement>('[data-joint-brackets]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        editor.changeJoints((history, at) =>
          fastenWithBrackets(history, dataOf(button, 'jointBrackets'), at),
        ),
      ),
    );
  container.querySelectorAll<HTMLInputElement>('[data-joint-bolts]').forEach((input) =>
    input.addEventListener('change', () => {
      const perSlot = input.value.trim() === '' ? Number.NaN : Number(input.value);
      editor.changeJoints((history, at) =>
        fastenWithBolts(history, dataOf(input, 'jointBolts'), perSlot, at),
      );
    }),
  );
  container
    .querySelectorAll<HTMLElement>('[data-joint-two-bolts]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        editor.changeJoints((history, at) =>
          fastenWithBolts(history, dataOf(button, 'jointTwoBolts'), QUICK_BOLTS_PER_SLOT, at),
        ),
      ),
    );
}
