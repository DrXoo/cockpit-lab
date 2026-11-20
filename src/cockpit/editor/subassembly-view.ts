// The subassembly section of a part's inspector: the button that makes the part a root, and, on
// a root, its name and the button that ungroups it; a part inside names its subassembly.
import { MAX_PART_NAME_LENGTH } from '../cad/history/history.ts';
import { innermostSubassembly, type AppliedSubassembly } from '../cad/history/subassemblies.ts';
import { escapeHTML } from '../../ui/html.ts';

const MAKE_BUTTON =
  '<button class="button button-light" id="makeSubassembly" title="Group this part and everything that hangs from it, so they can be taken off and put back as a whole"><i data-icon="layers"></i>Make subassembly</button>';

/** The subassembly section of the inspector of a part in the design shown. */
export function subassemblyHTML(applied: readonly AppliedSubassembly[], partId: string): string {
  const heading = '<h4 class="buy-group">Subassembly</h4>';
  const root = applied.find(({ rootId }) => rootId === partId);
  if (root) return `${heading}${rootHTML(applied, root)}`;
  const member = innermostSubassembly(applied, partId);
  const where = member
    ? `<p class="layout-hint" id="subassemblyOfPart">In <strong>${escapeHTML(member.name)}</strong>, which comes off and goes back as a whole.</p>`
    : '<p class="layout-hint" id="subassemblyOfPart">In no subassembly: on the cockpit whatever the mode.</p>';
  return `${heading}${where}<div class="part-actions">${MAKE_BUTTON}</div>`;
}

/** A root's subassembly: its name, what it holds, the one it is inside and the ungrouping. */
function rootHTML(applied: readonly AppliedSubassembly[], root: AppliedSubassembly): string {
  const name = `<div class="room-name"><label for="subassemblyName">Name</label><input id="subassemblyName" value="${escapeHTML(root.name)}" maxlength="${MAX_PART_NAME_LENGTH}"></div>`;
  const others = root.partIds.length - 1;
  const holds =
    others === 0
      ? 'This part is its root, with nothing hanging from it yet.'
      : `This part is its root: it and the ${others} ${others === 1 ? 'part' : 'parts'} hanging from it come off and go back as a whole.`;
  const parent = applied.find(({ rootId }) => rootId === root.parentRootId);
  const inside = parent ? ` It is inside <strong>${escapeHTML(parent.name)}</strong>.` : '';
  const ungroup =
    '<button class="button button-light" id="ungroupSubassembly" title="Stop grouping these parts; they stay in the design"><i data-icon="close"></i>Ungroup</button>';
  return `${name}<p class="layout-hint" id="subassemblyParts">${holds}${inside}</p><div class="part-actions">${ungroup}</div>`;
}
