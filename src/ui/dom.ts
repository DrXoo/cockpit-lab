// Finding the elements of the page the app ships with, and replacing parts of it.
import { drawIcons } from './icons.ts';

/** The element for `selector`. The markup ships with the app, so a missing one is a bug. */
export function $<E extends Element = HTMLElement>(selector: string): E {
  const element = document.querySelector<E>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}
/** An element that only exists in some panels or setup steps. */
export const $optional = <E extends Element = HTMLElement>(selector: string): E | null =>
  document.querySelector<E>(selector);
export const $$ = <E extends Element = HTMLElement>(selector: string): E[] => [
  ...document.querySelectorAll<E>(selector),
];
/** A data attribute the markup always sets on this element. */
export function dataOf(element: HTMLElement, name: string): string {
  const value = element.dataset[name];
  if (value === undefined) throw new Error(`Missing data-${name} on ${element.tagName}`);
  return value;
}
/**
 * Replaces what `container` shows and gives the focus back to the element that had it, found
 * by its id or by the step it stands for.
 */
export function replaceKeepingFocus(container: HTMLElement, html: string) {
  const active = document.activeElement;
  let selector = '';
  if (active instanceof HTMLElement && container.contains(active)) {
    if (active.id) selector = `#${CSS.escape(active.id)}`;
    else if (active.dataset.operation)
      selector = `[data-operation="${CSS.escape(active.dataset.operation)}"]`;
  }
  container.innerHTML = html;
  drawIcons(container);
  if (selector) container.querySelector<HTMLElement>(selector)?.focus();
}
