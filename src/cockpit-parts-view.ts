// The parts to buy for the cockpit design, as the inspector lists them: the cuts with the names
// of their parts, the connectors with the fasteners they need, and the feet. Items whose catalog
// values are estimated say so, and joints without connectors warn that the list is not complete.
import {
  connectorType,
  fastenerType,
  footType,
  profileSection,
  profileSystem,
} from './cad/catalog.ts';
import type { DataSource } from './cad/catalog.ts';
import type { PartsToBuy } from './cad/parts-to-buy.ts';
import { escapeHTML } from './html.ts';

interface BuyLine {
  kind: 'cut' | 'connector' | 'fastener' | 'foot';
  quantity: number;
  name: string;
  /** Under the name: the parts of a cut, or why the item is to be checked. */
  note?: string;
}

const ESTIMATED_NOTE = 'Estimated: check the data sheet';
const estimated = (source: DataSource): boolean => source.kind === 'estimated';

export function partsToBuyHTML(parts: PartsToBuy): string {
  const connectorsEstimated = parts.connectors.some(({ typeId }) =>
    estimated(connectorType(typeId).source),
  );
  const groups: [string, BuyLine[]][] = [
    ['Profiles', parts.cuts.map(cutLine)],
    [
      'Connectors',
      parts.connectors.map(({ typeId, name, quantity }) => ({
        kind: 'connector',
        quantity,
        name,
        note: estimated(connectorType(typeId).source) ? ESTIMATED_NOTE : undefined,
      })),
    ],
    [
      'Bolts and T-nuts',
      parts.fasteners.map(({ id, quantity }) => ({
        kind: 'fastener',
        quantity,
        name: fastenerType(id).name,
        note: connectorsEstimated
          ? 'Counted from the connectors: check their data sheet'
          : undefined,
      })),
    ],
    [
      'Feet',
      parts.feet.map(({ typeId, name, quantity }) => ({
        kind: 'foot',
        quantity,
        name,
        note: estimated(footType(typeId).source) ? ESTIMATED_NOTE : undefined,
      })),
    ],
  ];
  const lists = groups
    .filter(([, lines]) => lines.length > 0)
    .map(
      ([title, lines]) =>
        `<h4 class="buy-group">${title}</h4><ul class="buy-list">${lines.map(lineHTML).join('')}</ul>`,
    )
    .join('');
  return `<div class="parts-to-buy" id="partsToBuyList">${pendingHTML(parts.pendingJoints.length)}${lists}</div>`;
}

function cutLine(cut: PartsToBuy['cuts'][number]): BuyLine {
  const section = profileSection(profileSystem(cut.systemId), cut.sectionId);
  return {
    kind: 'cut',
    quantity: cut.quantity,
    name: `${section.widthMm} × ${section.heightMm} profile, ${cut.lengthMm} mm`,
    note: cut.names.join(', '),
  };
}

function lineHTML(line: BuyLine): string {
  const note = line.note === undefined ? '' : `<small>${escapeHTML(line.note)}</small>`;
  return `<li data-buy="${line.kind}"><span class="buy-quantity">${line.quantity} ×</span><span class="buy-text"><strong>${escapeHTML(line.name)}</strong>${note}</span></li>`;
}

function pendingHTML(count: number): string {
  if (count === 0) return '';
  const joints = count === 1 ? '1 joint has' : `${count} joints have`;
  return `<p class="layout-hint part-warning" id="partsPending">⚠ ${joints} no connectors yet, so their connectors, bolts and T-nuts are not counted.</p>`;
}
