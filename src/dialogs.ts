// What every dialog of the page does alike: its close buttons, named by `data-close`, and a
// click on the backdrop around it close it.
import { $, $$, dataOf } from './dom.ts';

export function bindDialogs() {
  $$('[data-close]').forEach((button) =>
    button.addEventListener('click', () =>
      $<HTMLDialogElement>(`#${dataOf(button, 'close')}`).close(),
    ),
  );
  $$<HTMLDialogElement>('dialog').forEach((dialog) =>
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const outside =
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom;
      if (outside) dialog.close();
    }),
  );
}
