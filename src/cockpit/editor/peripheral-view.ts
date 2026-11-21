// A mounted peripheral in the inspector: its name, its type, where it is mounted, and the values
// copied from its type; and the panel of a peripheral about to be mounted, shown in the view as
// a preview, which only places it. A seat also chooses the second rail it is mounted between,
// with whether its holes fit the slots there.
import {
  faceAxis,
  HANDS,
  type Axis,
  type ContactPoint,
  type ContactRole,
  type Hand,
} from '../cad/parts/assembly.ts';
import { peripheralTypes } from '../cad/parts/catalog.ts';
import {
  FACES,
  lengthAxisOf,
  makesAProfile,
  MAX_BACKREST_DEG,
  MAX_ENVELOPE_SIDE_MM,
  MAX_HOLE_DIAMETER_MM,
  MAX_POSITION_MM,
  MAX_PROFILE_LENGTH_MM,
  MIN_ENVELOPE_SIDE_MM,
  operationMaking,
  replayDesign,
  type MountPeripheral,
  type Operation,
} from '../cad/history/history.ts';
import {
  boltsInto,
  differsFromItsType,
  secondProfiles,
  type SecondProfile,
} from '../cad/history/peripherals.ts';
import { withDraft } from '../cad/history/drafts.ts';
import {
  peripheralHoleProblems,
  type PeripheralHoleProblem,
} from '../cad/analysis/peripheral-holes.ts';
import { PATTERN_SIDES, type Hole, type PatternSide } from '../cad/parts/mounting-pattern.ts';
import { ON_ITS_PART_ALONE, ORIGIN_OVER_ITS_PLACE } from './field-changes.ts';
import { round } from '../../shared/geometry.ts';
import { escapeHTML } from '../../ui/html.ts';
import {
  capitalized,
  CATEGORY_NOUNS,
  DIRECTION_NAMES,
  END_FACE_NAMES,
  END_NAMES,
  nameOf,
  SIDE_FACE_NAMES,
} from './design-text.ts';
import { FieldTemplates, nameFieldHTML, valueCellHTML } from './field-templates.ts';
import type { PartField } from './part-fields.ts';

const ESTIMATED_PERIPHERAL_HINT = 'estimated: measure the chosen product';

/** What the driver meets at each contact point, as the inspector names it. */
const CONTACT_NAMES: Record<ContactRole, string> = {
  hip: 'Hip',
  heel: 'Heels',
  hands: 'Hands',
  grip: 'Grip',
};

const HAND_NAMES: Record<Hand, string> = { left: 'Left hand', right: 'Right hand' };

/**
 * The panel of a peripheral about to be mounted at step `at` of the history, shown in the view as
 * a preview.
 */
export function peripheralPanelHTML(
  history: readonly Operation[],
  draft: MountPeripheral,
  at: number = history.length,
): string {
  const { widthMm, heightMm, depthMm } = draft.envelope;
  const estimated = draft.source.kind === 'estimated' ? ` (${ESTIMATED_PERIPHERAL_HINT})` : '';
  const size = `<p class="layout-hint">${round(widthMm, 1)} × ${round(heightMm, 1)} × ${round(depthMm, 1)} mm, width × height × depth${estimated}. Its own values are set in its inspector once it is mounted.</p>`;
  const place = peripheralPlaceHTML('peripheral', history, draft, pairingOf(history, draft, at));
  return `<div class="part-inspector" id="peripheralPanel"><p class="layout-hint">${newPeripheralHint(history, draft)}</p>${nameFieldHTML('peripheral', draft.name)}${mountedOnHTML(history, draft)}${size}${place}<div class="grow-actions"><button class="button button-dark" id="confirmPeripheral">Mount it</button><button class="button button-light" id="cancelPeripheral">Cancel</button></div></div>`;
}

function newPeripheralHint(history: readonly Operation[], draft: MountPeripheral): string {
  const noun = CATEGORY_NOUNS[draft.category];
  const on = strongName(history, draft.parentId);
  if (draft.betweenId === undefined)
    return `A new ${noun} on ${on}. Click a face of it in the view, or choose one here.`;
  return `A new ${noun} between ${on} and ${strongName(history, draft.betweenId)}. Choose the second here, or click a face of the first in the view.`;
}

const strongName = (history: readonly Operation[], partId: string) =>
  `<strong>${escapeHTML(nameOf(history, partId))}</strong>`;

/**
 * A seat's choice of the second profile it is mounted between, with whether it could be and
 * whether its holes would bolt there, and whether its holes stand over the slots of the
 * profiles under it where it is.
 */
interface Pairing {
  seconds: SecondProfile[];
  holeProblems: PeripheralHoleProblem[];
}

/**
 * The pairing of a seat on a profile, at step `at` of a history that does not hold it; null for
 * any other peripheral, which is mounted on its part alone.
 */
function pairingOf(
  history: readonly Operation[],
  peripheral: MountPeripheral,
  at: number,
): Pairing | null {
  if (peripheral.category !== 'seat') return null;
  if (!makesAProfileId(history, peripheral.parentId)) return null;
  const seconds = secondProfiles(history, peripheral, at);
  const { resolved } = replayDesign(withDraft(history, peripheral, at), at + 1);
  const holeProblems = peripheralHoleProblems(resolved).filter(
    (problem) => problem.peripheralId === peripheral.partId,
  );
  return { seconds, holeProblems };
}

function makesAProfileId(history: readonly Operation[], partId: string): boolean {
  const operation = operationMaking(history, partId);
  return operation !== undefined && makesAProfile(operation);
}

/**
 * The inspector of a mounted peripheral: its name, its type, where it is mounted, and the values
 * copied from its type, which describe the product: its envelope, backrest, mounting holes and
 * contact points.
 */
export function peripheralInspectorHTML(
  history: readonly Operation[],
  peripheral: MountPeripheral,
): string {
  const fields = new FieldTemplates('part');
  const types = peripheralTypes().map((type): [string, string] => [type.id, escapeHTML(type.name)]);
  if (!types.some(([id]) => id === peripheral.typeId))
    types.push([escapeHTML(peripheral.typeId), 'A type no longer in the catalog']);
  const source = differsFromItsType(peripheral)
    ? '✎ Edited from its type: swapping the type replaces these values.'
    : peripheral.source.kind === 'estimated'
      ? `The values of its type, ${ESTIMATED_PERIPHERAL_HINT}.`
      : 'The values of its type.';
  const type = `${fields.select('typeId', 'Type', types, peripheral.typeId)}<p class="layout-hint">${source}</p>`;
  const at = history.findIndex((operation) => operation.id === peripheral.id);
  const without = history.filter((operation) => operation.id !== peripheral.id);
  const pairing = pairingOf(without, peripheral, at);
  const place = `${peripheralPlaceHTML('part', history, peripheral, pairing)}${handHTML(fields, peripheral)}`;
  const ownValues = `${envelopeHTML(fields, peripheral)}${mountingPatternHTML(peripheral.mountingPattern.holes)}${contactPointsHTML(peripheral.contactPoints)}`;
  return `${nameFieldHTML('part', peripheral.name)}${mountedOnHTML(history, peripheral)}${type}${place}${ownValues}`;
}

function mountedOnHTML(history: readonly Operation[], peripheral: MountPeripheral): string {
  const on = strongName(history, peripheral.parentId);
  const { betweenId } = peripheral;
  if (betweenId === undefined) return `<p class="part-parent">Mounted on ${on}</p>`;
  return `<p class="part-parent">Mounted between ${on} and ${strongName(history, betweenId)}</p>`;
}

/** The axis a place on a part is measured along: a profile's length or a plate's depth. */
function alongAxisOfPart(history: readonly Operation[], partId: string): Axis | null {
  const operation = operationMaking(history, partId);
  if (!operation) return null;
  if (makesAProfile(operation)) return lengthAxisOf(operation);
  return operation.kind === 'add-plate' ? operation.depthAxis : null;
}

/** Where a peripheral's mounting origin is on its part, and the way it faces. */
function peripheralPlaceHTML(
  prefix: string,
  history: readonly Operation[],
  peripheral: MountPeripheral,
  pairing: Pairing | null,
): string {
  const fields = new FieldTemplates(prefix);
  const parent = operationMaking(history, peripheral.parentId);
  const alongAxis = alongAxisOfPart(history, peripheral.parentId) ?? 'z';
  // A plate carries a peripheral on either of its faces, never on its edges.
  const faceChoices =
    parent?.kind === 'add-plate'
      ? FACES.filter((face) => faceAxis(face) === faceAxis(parent.face))
      : FACES;
  const faces = faceChoices.map((face): [string, string] => [
    face,
    parent?.kind !== 'add-plate' && faceAxis(face) === alongAxis
      ? END_FACE_NAMES[face]
      : SIDE_FACE_NAMES[face],
  ]);
  const facings = FACES.filter((face) => faceAxis(face) !== faceAxis(peripheral.face)).map(
    (face): [string, string] => [face, capitalized(DIRECTION_NAMES[face])],
  );
  const ends = (['start', 'end'] as const).map((end): [string, string] => [
    end,
    END_NAMES[alongAxis][end],
  ]);
  const onAnEnd = parent?.kind !== 'add-plate' && faceAxis(peripheral.face) === alongAxis;
  const between = peripheral.betweenId !== undefined;
  const acrossLabel = between ? 'Offset from the middle between them' : 'Offset across the face';
  const place = onAnEnd
    ? '<p class="layout-hint">On an end face it is mounted at the center of the end.</p>'
    : `${fields.select('fromEnd', 'Measured from', ends, peripheral.fromEnd)}${fields.number('alongMm', 'Distance to its mounting origin', peripheral.alongMm, 0, MAX_PROFILE_LENGTH_MM)}${fields.number('acrossMm', acrossLabel, peripheral.acrossMm, -MAX_POSITION_MM, MAX_POSITION_MM)}`;
  const over = onAnEnd || between ? '' : holesOverHTML(fields, peripheral);
  const second = pairing === null ? '' : pairingHTML(fields, history, peripheral, pairing);
  return `${fields.select('face', 'Face', faces, peripheral.face)}${fields.select('facing', 'Faces', facings, peripheral.facing)}${second}${place}${over}<p class="layout-hint">Its mounting origin is the center of its underside. It faces the way the driver does when using it.</p>`;
}

/**
 * The second profile a seat is mounted between, chosen among those it can be, and whether its
 * holes fit the slots under it: a symbol and words, not color alone.
 */
function pairingHTML(
  fields: FieldTemplates,
  history: readonly Operation[],
  peripheral: MountPeripheral,
  { seconds, holeProblems }: Pairing,
): string {
  const { betweenId } = peripheral;
  // A seat goes between two profiles only where its holes bolt into both; the one it is
  // between stays offered after the frame moves it.
  const offered = seconds.filter((second) => boltsInto(second) || second.partId === betweenId);
  const alone = `Nothing: on ${escapeHTML(nameOf(history, peripheral.parentId))} alone`;
  const choices: [string, string][] = [
    ...offered.map(({ partId, name }): [string, string] => [partId, escapeHTML(name)]),
    [ON_ITS_PART_ALONE, alone],
  ];
  const select = fields.select('betweenId', 'Between', choices, betweenId ?? ON_ITS_PART_ALONE);
  const chosen = seconds.find(({ partId }) => partId === betweenId);
  const bolting = betweenId === undefined ? seconds.find(boltsInto) : undefined;
  const second = chosen
    ? [fitCheckHTML('between', true, `Centered between them, ${round(chosen.apartMm, 1)} mm apart`)]
    : bolting
      ? [fitCheckHTML('second', true, `${escapeHTML(bolting.name)} is under its other holes`)]
      : [];
  const holes = holeProblems.length
    ? holeProblems.map(({ holeIndex, wrong }) =>
        fitCheckHTML('holes', false, `Hole ${holeIndex + 1} ${escapeHTML(wrong)}`),
      )
    : [fitCheckHTML('holes', true, 'Every hole over a slot')];
  const checks = `<ul class="fit-checks" id="pairingChecks">${[...second, ...holes].join('')}</ul>`;
  const bolt = bolting
    ? `<div class="part-actions"><button class="button button-light" id="boltToSecond" data-second-id="${escapeHTML(bolting.partId)}" title="Mount it between ${escapeHTML(nameOf(history, peripheral.parentId))} and ${escapeHTML(bolting.name)}, centered">Bolt to ${escapeHTML(bolting.name)}</button></div>`
    : '';
  return `${select}${checks}${bolt}${pairingHint(chosen, bolting, seconds)}`;
}

/** What to do when the seat is on its rail alone, with no profile under its other holes. */
function pairingHint(
  chosen: SecondProfile | undefined,
  bolting: SecondProfile | undefined,
  seconds: readonly SecondProfile[],
): string {
  if (chosen || bolting) return '';
  const beside = seconds.find(({ reason }) => reason === null);
  const text = beside
    ? `No profile is under its other holes yet. Move ${escapeHTML(beside.name)} there with Fit off, then bolt the seat to it here.`
    : 'No other profile runs parallel to it, level and apart, to mount it between.';
  return `<p class="layout-hint" id="pairingHint">${text}</p>`;
}

const fitCheckHTML = (check: string, ok: boolean, text: string) =>
  `<li data-fit-check="${check}" class="fit-check ${ok ? 'ok' : 'warning'}">${ok ? '✓' : '⚠'} ${text}</li>`;

const HOLES_OVER_NAMES: Record<PatternSide, string> = {
  left: 'Its left holes',
  right: 'Its right holes',
};

/**
 * What stands on its place: its mounting origin, or the holes of one side, which then rest on
 * the slot in the middle of a profile's face, as on one of two rails under a seat.
 */
function holesOverHTML(fields: FieldTemplates, { holesOver }: MountPeripheral): string {
  const choices: [string, string][] = [
    [ORIGIN_OVER_ITS_PLACE, 'Its mounting origin'],
    ...PATTERN_SIDES.map((side): [string, string] => [side, HOLES_OVER_NAMES[side]]),
  ];
  const chosen = holesOver ?? ORIGIN_OVER_ITS_PLACE;
  return `${fields.select('holesOver', 'Over its place', choices, chosen)}<p class="layout-hint">The holes of one side over the middle of the face rest on its slot, to bolt them into the profile; the offset across then measures to them.</p>`;
}

/** The hand that uses a peripheral's grip, chosen on it rather than on its type. */
function handHTML(fields: FieldTemplates, { hand }: MountPeripheral): string {
  if (hand === undefined) return '';
  const hands = HANDS.map((choice): [string, string] => [choice, HAND_NAMES[choice]]);
  return `${fields.select('hand', 'Held by', hands, hand)}<p class="layout-hint">The driver's hand on its grip, kept when its type is swapped for another with a grip.</p>`;
}

/** A peripheral's envelope, and a seat's backrest, which leans back from upright. */
function envelopeHTML(fields: FieldTemplates, peripheral: MountPeripheral): string {
  const { widthMm, heightMm, depthMm } = peripheral.envelope;
  const side = (field: PartField, label: string, valueMm: number) =>
    fields.number(field, label, valueMm, MIN_ENVELOPE_SIDE_MM, MAX_ENVELOPE_SIDE_MM);
  const { backrestDeg } = peripheral;
  const backrest =
    backrestDeg === undefined
      ? ''
      : fields.number(
          'backrestDeg',
          'Backrest back from upright',
          backrestDeg,
          0,
          MAX_BACKREST_DEG,
          {
            unit: '°',
          },
        );
  return `<h4 class="buy-group">Envelope</h4>${side('widthMm', 'Width', widthMm)}${side('heightMm', 'Height', heightMm)}${side('depthMm', 'Depth', depthMm)}${backrest}<p class="layout-hint">The box it takes, standing on its mounting origin. Resizing it moves neither its holes nor its contact points.</p>`;
}

/** The holes a peripheral is bolted through, a row each, and a button to add one. */
function mountingPatternHTML(holes: readonly Hole[]): string {
  const rows = holes
    .map((hole, index) => {
      const item = String(index);
      const name = `Hole ${index + 1}`;
      const remove = `<button class="text-button" data-remove-hole="${index}" title="Take ${name} out of the pattern"><i data-icon="trash"></i>Remove</button>`;
      const cells = [
        valueCellHTML('holeXMm', item, 'X', `${name}, across`, hole.xMm, MAX_POSITION_MM),
        valueCellHTML(
          'holeYMm',
          item,
          'Y',
          `${name}, towards its front`,
          hole.yMm,
          MAX_POSITION_MM,
        ),
        valueCellHTML(
          'holeDiameterMm',
          item,
          '⌀',
          `${name}, diameter`,
          hole.diameterMm,
          MAX_HOLE_DIAMETER_MM,
          0,
        ),
      ];
      return `<div class="value-row" data-hole-row="${index}"><p class="value-row-name"><span>${name}</span>${remove}</p><div class="value-cells">${cells.join('')}</div></div>`;
    })
    .join('');
  const none =
    holes.length === 0
      ? '<p class="layout-hint">No holes yet: add the ones it is bolted through.</p>'
      : '';
  return `<h4 class="buy-group">Mounting holes</h4><p class="layout-hint">On its underside, in mm from its mounting origin: X across it, Y towards its front.</p>${rows}${none}<button class="text-button" id="addHole"><i data-icon="plus"></i>Add a hole</button>`;
}

/** Where the driver meets the peripheral, a row each. */
function contactPointsHTML(contactPoints: readonly ContactPoint[]): string {
  if (contactPoints.length === 0) return '';
  const rows = contactPoints
    .map(({ role, offsetMm }) => {
      const name = CONTACT_NAMES[role];
      const cells = [
        valueCellHTML('contactXMm', role, 'X', `${name}, across`, offsetMm.x, MAX_POSITION_MM),
        valueCellHTML('contactYMm', role, 'Y', `${name}, up`, offsetMm.y, MAX_POSITION_MM),
        valueCellHTML(
          'contactZMm',
          role,
          'Z',
          `${name}, towards its front`,
          offsetMm.z,
          MAX_POSITION_MM,
        ),
      ];
      return `<div class="value-row" data-contact-row="${role}"><p class="value-row-name"><span>${name}</span></p><div class="value-cells">${cells.join('')}</div></div>`;
    })
    .join('');
  return `<h4 class="buy-group">Contact points</h4><p class="layout-hint">Where the driver meets it, in mm from its mounting origin: X across, Y up, Z towards its front.</p>${rows}`;
}
