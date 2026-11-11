// Spreadsheet apps detect UTF-8 from the BOM; semicolons suit locales that use a decimal comma.
const BYTE_ORDER_MARK = '﻿';
const SEPARATOR = ';';
const LINE_BREAK = '\r\n';

const PART_HEADER = [
  'Part',
  'Profile (mm)',
  'Quantity',
  'Net length (mm)',
  'Total length (mm)',
  'Detail',
];
const ACCESSORY_HEADER = ['Parts and fasteners', '', 'Quantity', '', '', 'Detail'];
const PART_NOTE = 'Check before building';

/** The fields of a profile part that the cut list needs. */
export interface CutListPart {
  name: string;
  profile: string;
  qty: number;
  /** Net length of one piece, in mm. */
  mm: number;
  /** Total length of all pieces, in mm. */
  total: number;
}

export interface CutListAccessory {
  name: string;
  qty: number;
  note: string;
}

type Cell = string | number;

const quote = (value: Cell): string => `"${String(value).replaceAll('"', '""')}"`;

function partRow(part: CutListPart): Cell[] {
  return [part.name, part.profile, part.qty, part.mm, part.total, PART_NOTE];
}

function accessoryRow(accessory: CutListAccessory): Cell[] {
  return [accessory.name, '', accessory.qty, '', '', accessory.note];
}

export function cutListCsv({
  parts,
  accessories,
}: {
  parts: readonly CutListPart[];
  accessories: readonly CutListAccessory[];
}): string {
  const rows: Cell[][] = [
    PART_HEADER,
    ...parts.map(partRow),
    [],
    ACCESSORY_HEADER,
    ...accessories.map(accessoryRow),
  ];
  const lines = rows.map((row) => row.map(quote).join(SEPARATOR));
  return BYTE_ORDER_MARK + lines.join(LINE_BREAK);
}
