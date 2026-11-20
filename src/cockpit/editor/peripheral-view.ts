// A mounted peripheral in the inspector: its name, its type, where it is mounted, and the values
// copied from its type; and the panel of a peripheral about to be mounted, shown in the view as
// a preview, which only places it.
import { faceAxis, type Axis, type ContactPoint, type ContactRole } from '../cad/parts/assembly.ts';
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
  type MountPeripheral,
  type Operation,
} from '../cad/history/history.ts';
import { differsFromItsType } from '../cad/history/peripherals.ts';
import type { Hole } from '../cad/parts/mounting-pattern.ts';
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
};

/** The panel of a peripheral about to be mounted, shown in the view as a preview. */
export function peripheralPanelHTML(history: readonly Operation[], draft: MountPeripheral): string {
  const { widthMm, heightMm, depthMm } = draft.envelope;
  const estimated = draft.source.kind === 'estimated' ? ` (${ESTIMATED_PERIPHERAL_HINT})` : '';
  const size = `<p class="layout-hint">${round(widthMm, 1)} × ${round(heightMm, 1)} × ${round(depthMm, 1)} mm, width × height × depth${estimated}. Its own values are set in its inspector once it is mounted.</p>`;
  return `<div class="part-inspector" id="peripheralPanel"><p class="layout-hint">A new ${CATEGORY_NOUNS[draft.category]} on <strong>${escapeHTML(nameOf(history, draft.parentId))}</strong>. Click a face of it in the view, or choose one here.</p>${nameFieldHTML('peripheral', draft.name)}${mountedOnHTML(history, draft)}${size}${peripheralPlaceHTML('peripheral', history, draft)}<div class="grow-actions"><button class="button button-dark" id="confirmPeripheral">Mount it</button><button class="button button-light" id="cancelPeripheral">Cancel</button></div></div>`;
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
  const place = peripheralPlaceHTML('part', history, peripheral);
  const ownValues = `${envelopeHTML(fields, peripheral)}${mountingPatternHTML(peripheral.mountingPattern.holes)}${contactPointsHTML(peripheral.contactPoints)}`;
  return `${nameFieldHTML('part', peripheral.name)}${mountedOnHTML(history, peripheral)}${type}${place}${ownValues}`;
}

const mountedOnHTML = (history: readonly Operation[], peripheral: MountPeripheral) =>
  `<p class="part-parent">Mounted on <strong>${escapeHTML(nameOf(history, peripheral.parentId))}</strong></p>`;

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
  const place = onAnEnd
    ? '<p class="layout-hint">On an end face it is mounted at the center of the end.</p>'
    : `${fields.select('fromEnd', 'Measured from', ends, peripheral.fromEnd)}${fields.number('alongMm', 'Distance to its mounting origin', peripheral.alongMm, 0, MAX_PROFILE_LENGTH_MM)}${fields.number('acrossMm', 'Offset across the face', peripheral.acrossMm, -MAX_POSITION_MM, MAX_POSITION_MM)}`;
  return `${fields.select('face', 'Face', faces, peripheral.face)}${fields.select('facing', 'Faces', facings, peripheral.facing)}${place}<p class="layout-hint">Its mounting origin is the center of its underside. It faces the way the driver does when using it.</p>`;
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
