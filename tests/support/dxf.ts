// Reads back the ASCII DXF files the app exports, enough to check what a cutting shop gets: the
// version, and each entity with its group codes. The app itself never imports DXF.

export interface DxfVertex {
  x: number;
  y: number;
  /** The tangent of a quarter of the arc's angle to the next vertex; 0 for a straight line. */
  bulge: number;
}

export type DxfEntity =
  | { type: 'CIRCLE'; layer: string; x: number; y: number; radius: number }
  | { type: 'POLYLINE'; layer: string; closed: boolean; vertices: DxfVertex[] }
  | { type: string; layer: string };

export interface DxfFile {
  version: string | undefined;
  sections: string[];
  entities: DxfEntity[];
}

interface Pair {
  code: number;
  value: string;
}

/** The DXF as pairs of a group code and its value, failing on a malformed file. */
function pairsOf(text: string): Pair[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length % 2 !== 0) throw new Error('A DXF has an even number of lines');
  const pairs: Pair[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    const code = Number(lines[index]);
    if (!Number.isInteger(code)) throw new Error(`Line ${index + 1} is not a group code`);
    pairs.push({ code, value: (lines[index + 1] ?? '').trim() });
  }
  return pairs;
}

export function readDxf(text: string): DxfFile {
  const pairs = pairsOf(text);
  if (pairs.at(-1)?.value !== 'EOF') throw new Error('A DXF ends with EOF');
  const sections: string[] = [];
  let version: string | undefined;
  let entities: DxfEntity[] = [];
  for (let index = 0; index < pairs.length; index++) {
    const pair = pairs[index];
    const next = pairs[index + 1];
    if (pair?.code !== 0 || pair.value !== 'SECTION' || next?.code !== 2) continue;
    sections.push(next.value);
    const body = sectionBody(pairs, index + 2);
    if (next.value === 'HEADER') version = headerValue(body, '$ACADVER');
    if (next.value === 'ENTITIES') entities = entitiesOf(body);
  }
  return { version, sections, entities };
}

function sectionBody(pairs: readonly Pair[], from: number): Pair[] {
  const end = pairs.findIndex(
    (pair, index) => index >= from && pair.code === 0 && pair.value === 'ENDSEC',
  );
  if (end === -1) throw new Error('A section ends with ENDSEC');
  return pairs.slice(from, end);
}

function headerValue(body: readonly Pair[], name: string): string | undefined {
  const at = body.findIndex((pair) => pair.code === 9 && pair.value === name);
  return at === -1 ? undefined : body[at + 1]?.value;
}

/** The entities of the section, each with the group codes up to the next entity. */
function entitiesOf(body: readonly Pair[]): DxfEntity[] {
  const groups: Pair[][] = [];
  for (const pair of body) {
    if (pair.code === 0) groups.push([pair]);
    else groups.at(-1)?.push(pair);
  }
  const entities: DxfEntity[] = [];
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index] ?? [];
    const type = group[0]?.value ?? '';
    if (type === 'POLYLINE') {
      const vertices: DxfVertex[] = [];
      while (groups[index + 1]?.[0]?.value === 'VERTEX') {
        index++;
        vertices.push(vertexOf(groups[index] ?? []));
      }
      if (groups[index + 1]?.[0]?.value !== 'SEQEND')
        throw new Error('A polyline ends with SEQEND');
      index++;
      const flags = numberOf(group, 70, 0);
      entities.push({ type, layer: textOf(group, 8), closed: (flags & 1) === 1, vertices });
    } else if (type === 'CIRCLE') {
      entities.push({
        type,
        layer: textOf(group, 8),
        x: numberOf(group, 10),
        y: numberOf(group, 20),
        radius: numberOf(group, 40),
      });
    } else entities.push({ type, layer: textOf(group, 8) });
  }
  return entities;
}

function vertexOf(group: readonly Pair[]): DxfVertex {
  return { x: numberOf(group, 10), y: numberOf(group, 20), bulge: numberOf(group, 42, 0) };
}

function textOf(group: readonly Pair[], code: number): string {
  const pair = group.find((candidate) => candidate.code === code);
  if (pair === undefined) throw new Error(`${group[0]?.value} has no group code ${code}`);
  return pair.value;
}

function numberOf(group: readonly Pair[], code: number, fallback?: number): number {
  const pair = group.find((candidate) => candidate.code === code);
  if (pair === undefined && fallback !== undefined) return fallback;
  const value = Number(textOf(group, code));
  if (!Number.isFinite(value)) throw new Error(`Group code ${code} is not a number`);
  return value;
}
