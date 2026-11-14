// How a check is shown. Every level has a symbol as well as a color.
import type { Check, CheckLevel } from './checks.ts';
import { escapeHTML } from './html.ts';

const MARKS: Record<CheckLevel, string> = { ok: '✓', warning: '!', error: '×' };

export const checkMark = (level: CheckLevel): string => MARKS[level];

/** A row of the checks panel. */
export function checkRowHTML(check: Check): string {
  return `<div class="check-row ${check.level}"><div class="check-name">${escapeHTML(check.label)}<small>${escapeHTML(check.detail)}</small>${itemsHTML(check)}</div><div class="check-value">${escapeHTML(check.value)}<span class="check-mark">${checkMark(check.level)}</span></div></div>`;
}

/** A line of the printable summary. */
export function checkLineHTML(check: Check): string {
  return `<p>${checkMark(check.level)} ${escapeHTML(check.label)}: <b>${escapeHTML(check.value)}</b> — ${escapeHTML(check.detail)}</p>${listHTML(check.items)}`;
}

const listHTML = (items: readonly string[] = []): string =>
  items.length ? `<ul>${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '';

/** A check's items, closed until the user opens them. */
function itemsHTML(check: Check): string {
  const count = check.items?.length ?? 0;
  if (!count) return '';
  return `<details class="check-items"><summary>Show the ${count}</summary>${listHTML(check.items)}</details>`;
}
