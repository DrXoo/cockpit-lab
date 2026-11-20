// The labelled controls the inspector and the panels of a part about to be added are built from.
// Their `data-part-field` names the value each one edits.
import { MAX_PART_NAME_LENGTH } from '../cad/history/history.ts';
import { round } from '../../shared/geometry.ts';
import { escapeHTML } from '../../ui/html.ts';
import type { PartField } from './part-fields.ts';

/** Labelled controls whose ids start with one prefix, which keeps two panels apart. */
export class FieldTemplates {
  declare prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  select(
    field: PartField,
    label: string,
    options: readonly [value: string, text: string][],
    value: string,
  ): string {
    const choices = options
      .map(
        ([option, text]) =>
          `<option value="${option}"${option === value ? ' selected' : ''}>${text}</option>`,
      )
      .join('');
    return `<div class="select-control"><label for="${this.prefix}-${field}">${label}</label><select id="${this.prefix}-${field}" data-part-field="${field}">${choices}</select></div>`;
  }

  number(
    field: PartField,
    label: string,
    valueMm: number,
    min: number,
    max: number,
    { disabled = false, unit = 'mm' } = {},
  ): string {
    return `<div class="control"><div class="control-top"><label for="${this.prefix}-${field}">${label}</label><div class="number-wrap"><input id="${this.prefix}-${field}" type="number" data-part-field="${field}" min="${min}" max="${max}" step="1" value="${round(valueMm, 1)}"${disabled ? ' disabled' : ''}><span>${unit}</span></div></div></div>`;
  }
}

export const nameFieldHTML = (prefix: string, name: string): string =>
  `<div class="room-name"><label for="${prefix}-name">Name</label><input id="${prefix}-name" data-part-field="name" value="${escapeHTML(name)}" maxlength="${MAX_PART_NAME_LENGTH}"></div>`;

/**
 * One value of an item in a list, such as a hole: a short label in a row of them, and the item's
 * name with what the value is for screen readers. `min` is `-max` unless given.
 */
export function valueCellHTML(
  field: PartField,
  item: string,
  label: string,
  accessibleName: string,
  valueMm: number,
  max: number,
  min = -max,
): string {
  const id = `part-${field}-${escapeHTML(item)}`;
  return `<label class="value-cell" for="${id}"><span>${label}</span><input id="${id}" type="number" data-part-field="${field}" data-part-item="${escapeHTML(item)}" min="${min}" max="${max}" step="0.5" value="${round(valueMm, 1)}" aria-label="${escapeHTML(accessibleName)}"></label>`;
}
