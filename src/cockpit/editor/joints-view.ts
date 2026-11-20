// The joints of a part, with their connectors, as the inspector lists them and as the card of a
// joint marker in the view shows one.
import type { JointOfPart } from '../cad/history/fastening.ts';
import type { Face } from '../cad/parts/assembly.ts';
import { MAX_BOLTS_PER_SLOT } from '../cad/history/history.ts';
import { escapeHTML } from '../../ui/html.ts';
import { boltCount, SIDE_FACE_NAMES } from './design-text.ts';

/** How many bolts the plate's joint takes in each slot it covers, two at once by default. */
export const QUICK_BOLTS_PER_SLOT = 2;

/** A part that touches the selected one without a joint, to join it to. */
export interface TouchingPart {
  partId: string;
  name: string;
}

/**
 * What the card of a joint marker in the view shows: a joint, or two parts that only touch. The
 * part is the one its inspector shows.
 */
export type JointCard =
  | { kind: 'joint'; partId: string; joint: JointOfPart }
  | { kind: 'touching'; partId: string; partName: string; toPartId: string; toPartName: string };

/**
 * The joints of the selected part, with their connectors: a corner bracket can be put on or
 * taken off each side of the joined part where it fits, or two at once along the part it meets.
 */
export function jointsHTML(
  joints: readonly JointOfPart[],
  touching: readonly TouchingPart[],
): string {
  if (joints.length === 0 && touching.length === 0) return '';
  const joins = touching
    .map(
      ({ partId, name }) =>
        `<button class="text-button" data-join="${escapeHTML(partId)}" title="Make a joint where they touch"><i data-icon="plus"></i>Join to ${escapeHTML(name)}</button>`,
    )
    .join('');
  const touchingHTML = touching.length
    ? `<div class="joint-row" id="touchingParts"><p class="joint-name"><strong>Touching, without a joint</strong><small>Join them to fasten them and count them as support.</small></p><div class="joint-sides">${joins}</div></div>`
    : '';
  return `<div class="part-joints" id="partJoints"><h4 class="buy-group">Joints</h4>${joints.map((joint) => jointHTML(joint)).join('')}${touchingHTML}</div>`;
}

/** The card of a joint marker: its two parts, its state and its quick actions. */
export function jointCardHTML(card: JointCard): string {
  const more = `<button class="text-button" data-joint-more="${escapeHTML(card.partId)}">More in the inspector</button>`;
  if (card.kind === 'joint') return `${jointHTML(card.joint, 'card-bolts')}${more}`;
  const toName = escapeHTML(card.toPartName);
  const name = `<p class="joint-name"><strong>${escapeHTML(card.partName)} and ${toName}</strong><small>+ Touching, without a joint</small></p>`;
  const join = `<button class="button button-light" data-join="${escapeHTML(card.toPartId)}" data-join-from="${escapeHTML(card.partId)}" title="Make a joint where they touch"><i data-icon="plus"></i>Join to ${toName}</button>`;
  return `<div class="joint-row">${name}${join}</div>${more}`;
}

/** A joint with its state and connectors; `fieldPrefix` keeps the ids of two of them apart. */
function jointHTML(joint: JointOfPart, fieldPrefix = 'bolts'): string {
  if (joint.bolts !== null) return boltedJointHTML(joint, joint.bolts, fieldPrefix);
  const id = escapeHTML(joint.jointId);
  const count = joint.sides.length;
  const status =
    count === 0
      ? '⚠ No connectors yet'
      : `✓ ${count} corner ${count === 1 ? 'bracket' : 'brackets'}`;
  const sides = joint.fittingSides
    .map((side) => {
      const on = joint.sides.includes(side);
      return `<button class="text-button joint-side" data-joint="${id}" data-side="${side}" aria-pressed="${on}" title="${on ? 'Take away the bracket on this side' : 'Put a corner bracket on this side'}">${on ? '✓' : '+'} ${escapeHTML(sideName(joint, side))}</button>`;
    })
    .join('');
  const missingAlong = joint.alongSides.some((side) => !joint.sides.includes(side));
  const quick = missingAlong
    ? `<button class="button button-light" data-joint-brackets="${id}" title="One on each side along ${escapeHTML(joint.toPartName)}"><i data-icon="plus"></i>Two corner brackets</button>`
    : '';
  const choices =
    joint.fittingSides.length === 0
      ? '<p class="layout-hint">No connector in the catalog fits this joint yet: a corner bracket needs a profile that meets the other part end on or lies across it, with room for its legs on both.</p>'
      : `<div class="joint-sides">${sides}</div>${quick}`;
  return `<div class="joint-row" data-joint-row="${id}"><p class="joint-name"><strong>${escapeHTML(joint.partName)} to ${escapeHTML(joint.toPartName)}</strong><small>${status}</small></p>${choices}</div>`;
}

/**
 * The side of a bracket, naming the profile it stands beside when a joint has corners beside
 * both, as a crossing does.
 */
function sideName(joint: JointOfPart, side: Face): string {
  if (joint.besideMetSides.length === 0) return SIDE_FACE_NAMES[side];
  const beside = joint.besideMetSides.includes(side) ? joint.toPartName : joint.partName;
  return `${SIDE_FACE_NAMES[side]}, beside ${beside}`;
}

/** A plate's joint to a profile: the bolts in each slot it covers, or why it takes none. */
function boltedJointHTML(
  joint: JointOfPart,
  bolts: { perSlot: number; slots: number },
  fieldPrefix: string,
): string {
  const id = escapeHTML(joint.jointId);
  const toPart = escapeHTML(joint.toPartName);
  const total = bolts.perSlot * bolts.slots;
  const slots = `${bolts.slots} ${bolts.slots === 1 ? 'slot' : 'slots'}`;
  const status =
    bolts.perSlot === 0
      ? '⚠ No bolts yet'
      : `✓ ${boltCount(total)}, ${bolts.perSlot} in each of ${slots}`;
  const name = `<p class="joint-name"><strong>${escapeHTML(joint.partName)} to ${toPart}</strong><small>${status}</small></p>`;
  if (bolts.slots === 0)
    return `<div class="joint-row" data-joint-row="${id}">${name}<p class="layout-hint">It covers no slot of ${toPart}: move it over one to bolt it.</p></div>`;
  const field = `<div class="control"><div class="control-top"><label for="${fieldPrefix}-${id}">Bolts in each slot</label><div class="number-wrap"><input id="${fieldPrefix}-${id}" type="number" data-joint-bolts="${id}" min="0" max="${MAX_BOLTS_PER_SLOT}" step="1" value="${bolts.perSlot}"><span>of ${slots}</span></div></div></div>`;
  const quick =
    bolts.perSlot === QUICK_BOLTS_PER_SLOT
      ? ''
      : `<button class="button button-light" data-joint-two-bolts="${id}" title="Spaced evenly along ${toPart}"><i data-icon="plus"></i>Two in each slot</button>`;
  return `<div class="joint-row" data-joint-row="${id}">${name}${field}${quick}</div>`;
}
