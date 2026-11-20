// A foot in the inspector: its type and where it stands under its profile.
import { footType, footTypes } from '../cad/parts/catalog.ts';
import { MAX_PROFILE_LENGTH_MM, type AddFoot, type Operation } from '../cad/history/history.ts';
import { escapeHTML } from '../../ui/html.ts';
import { END_NAMES, nameOf, profileAxisOf } from './design-text.ts';
import { FieldTemplates, nameFieldHTML } from './field-templates.ts';

/** The values of a foot: its type and where it stands under its profile. */
export function footFieldsHTML(history: readonly Operation[], foot: AddFoot): string {
  const fields = new FieldTemplates('part');
  const types = footTypes().map((type): [string, string] => [type.id, escapeHTML(type.name)]);
  const parentAxis = profileAxisOf(history, foot.parentId) ?? 'z';
  const ends = (['start', 'end'] as const).map((end): [string, string] => [
    end,
    END_NAMES[parentAxis][end],
  ]);
  const place =
    parentAxis === 'y'
      ? '<p class="layout-hint">Under an upright it stands under its bottom end.</p>'
      : `${fields.select('fromEnd', 'Measured from', ends, foot.fromEnd)}${fields.number('alongMm', 'Distance to its center', foot.alongMm, 0, MAX_PROFILE_LENGTH_MM)}`;
  const type = footType(foot.footTypeId);
  return `${nameFieldHTML('part', foot.name)}<p class="part-parent">Stands under <strong>${escapeHTML(nameOf(history, foot.parentId))}</strong></p>${fields.select('footTypeId', 'Type', types, foot.footTypeId)}<p class="layout-hint">${type.heightMm} mm tall, ${type.widthMm} × ${type.depthMm} mm on the floor${type.source.kind === 'estimated' ? ' (estimated: check the chosen product)' : ''}.</p>${place}`;
}
