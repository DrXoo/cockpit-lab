// Spreadsheet apps detect UTF-8 from the BOM; semicolons suit locales that use a decimal comma.
const BYTE_ORDER_MARK = '﻿';
const SEPARATOR = ';';
const LINE_BREAK = '\r\n';

const PART_HEADER = [
  'Pieza',
  'Perfil (mm)',
  'Cantidad',
  'Longitud neta (mm)',
  'Longitud total (mm)',
  'Detalle',
];
const ACCESSORY_HEADER = ['Piezas y fijaciones', '', 'Cantidad', '', '', 'Detalle'];
const PART_NOTE = 'Verificar antes de fabricar';

const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;

function partRow(part) {
  return [part.name, part.profile, part.qty, part.mm, part.total, PART_NOTE];
}

function accessoryRow(accessory) {
  return [accessory.name, '', accessory.qty, '', '', accessory.note];
}

export function cutListCsv({ parts, accessories }) {
  const rows = [
    PART_HEADER,
    ...parts.map(partRow),
    [],
    ACCESSORY_HEADER,
    ...accessories.map(accessoryRow),
  ];
  const lines = rows.map((row) => row.map(quote).join(SEPARATOR));
  return BYTE_ORDER_MARK + lines.join(LINE_BREAK);
}
