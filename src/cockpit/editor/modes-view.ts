// The Modes panel of the cockpit editor: the design's subassemblies, nested ones indented,
// against its modes, each cell saying whether the subassembly is on in that mode. The modes are
// renamed, deleted and added there.
import { MAX_PART_NAME_LENGTH } from '../cad/history/operations.ts';
import { subassemblyStateIn, type Mode, type SubassemblyState } from '../cad/history/modes.ts';
import type { AppliedSubassembly } from '../cad/history/subassemblies.ts';
import { escapeHTML } from '../../ui/html.ts';

/** How deep each level of nesting indents a subassembly's name, in px. */
const NESTING_INDENT_PX = 14;

/** What a cell says of a subassembly in a mode: a symbol and words, not color alone. */
const STATE_TEXT: Record<SubassemblyState, string> = {
  on: 'On',
  off: 'Off',
  'off-with-parent': 'Off',
};

const ADD_BUTTON =
  '<button class="button button-light" id="addMode" title="Add a way of using the cockpit, with every subassembly on"><i data-icon="plus"></i>Add mode</button>';

/** The panel of a design's subassemblies, as they apply in it, against its modes. */
export function modesPanelHTML(
  applied: readonly AppliedSubassembly[],
  modes: readonly Mode[],
): string {
  if (modes.length === 0)
    return `<p class="layout-hint" id="noModes">Add a mode, such as racing or flight, to say which subassemblies are on the cockpit in it.</p><div class="part-actions">${ADD_BUTTON}</div>`;
  const header = `<tr><th scope="col">Subassembly</th>${modes.map(modeHeaderHTML).join('')}</tr>`;
  const rows = nestedOrder(applied)
    .map(({ subassembly, depth }) => rowHTML(applied, modes, subassembly, depth))
    .join('');
  return `<div class="modes-table-wrap"><table class="modes-table" id="modesTable"><thead>${header}</thead><tbody>${rows}</tbody></table></div><div class="part-actions">${ADD_BUTTON}</div>`;
}

function modeHeaderHTML({ id, name }: Mode): string {
  const mode = escapeHTML(id);
  const label = escapeHTML(name);
  return `<th scope="col"><div class="mode-heading"><input data-mode-name="${mode}" value="${label}" maxlength="${MAX_PART_NAME_LENGTH}" aria-label="Name of the mode ${label}"><button class="icon-button" data-delete-mode="${mode}" title="Delete the mode ${label}; no part is removed" aria-label="Delete the mode ${label}"><i data-icon="trash"></i></button></div></th>`;
}

function rowHTML(
  applied: readonly AppliedSubassembly[],
  modes: readonly Mode[],
  subassembly: AppliedSubassembly,
  depth: number,
): string {
  const name = escapeHTML(subassembly.name);
  const cells = modes
    .map((mode) =>
      cellHTML(mode, subassembly, subassemblyStateIn(mode, applied, subassembly.rootId)),
    )
    .join('');
  return `<tr data-subassembly="${escapeHTML(subassembly.rootId)}"><th scope="row" style="padding-left: ${depth * NESTING_INDENT_PX}px">${name}</th>${cells}</tr>`;
}

/** A subassembly's cell in a mode; one off with the subassembly holding it cannot be put on. */
function cellHTML(mode: Mode, subassembly: AppliedSubassembly, state: SubassemblyState): string {
  const checked = state === 'on' ? ' checked' : '';
  const disabled = state === 'off-with-parent' ? ' disabled' : '';
  const label = `${subassembly.name} on in ${mode.name}`;
  const why =
    state === 'off-with-parent'
      ? ` title="Off with the subassembly that holds it in ${escapeHTML(mode.name)}"`
      : '';
  return `<td><label class="mode-cell ${state}"${why}><input type="checkbox" data-mode="${escapeHTML(mode.id)}" data-root="${escapeHTML(subassembly.rootId)}" aria-label="${escapeHTML(label)}"${checked}${disabled}><span>${STATE_TEXT[state]}</span></label></td>`;
}

/** The subassemblies with each one after the one holding it, and how deep it is nested. */
function nestedOrder(
  applied: readonly AppliedSubassembly[],
): { subassembly: AppliedSubassembly; depth: number }[] {
  const inside = (parentRootId: string | null, depth: number) =>
    applied
      .filter((subassembly) => subassembly.parentRootId === parentRootId)
      .flatMap((subassembly): { subassembly: AppliedSubassembly; depth: number }[] => [
        { subassembly, depth },
        ...inside(subassembly.rootId, depth + 1),
      ]);
  return inside(null, 0);
}
