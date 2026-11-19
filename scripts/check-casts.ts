// Finds type assertions (`value as Type`) in src/. A cast silences the type checker instead of
// validating a value where it enters (AGENTS.md), so each one left must say why it is safe in a
// comment that starts with `Cast:` on its line or the line above. `as const` is not a cast.
//
// The casts of the earlier configurator are counted per file in casts-baseline.json until they are
// replaced by validation. A file may not go over its count, and a file that goes under it must
// lower it, so the count only falls.
//
// TypeScript 7 has no JavaScript API to parse with, so the source is scanned: comments, strings
// and the text of template literals are blanked out, keeping every line where it was, and the
// renames of imports and exports are dropped before looking for `as`.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const JUSTIFIED = /\/\/\s*Cast:|\/\*\s*Cast:/;
const ASSERTION = /\bas\s+(?!const\b)[A-Za-z_$({[]/g;
const RENAMES = [
  /\b(?:import|export)\s+(?:type\s+)?\{[^}]*\}/g,
  /\b(?:import|export)\s*\*\s*as\s+[A-Za-z_$][\w$]*/g,
];

/** The source with comments, strings and template text replaced by spaces, newlines kept. */
export function codeOnly(source: string): string {
  let out = '';
  let i = 0;
  // Each open template literal records the brace depth at which its text is read.
  const templates: number[] = [];
  let depth = 0;
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  const inTemplateText = () => templates.length > 0 && templates.at(-1) === depth;
  while (i < source.length) {
    const rest = source.slice(i);
    if (inTemplateText()) {
      const end = rest.search(/`|\$\{|\\/);
      if (end < 0) return out + blank(rest);
      out += blank(rest.slice(0, end));
      i += end;
      if (source[i] === '\\') {
        out += blank(source.slice(i, i + 2));
        i += 2;
      } else if (source[i] === '`') {
        templates.pop();
        out += '`';
        i += 1;
      } else {
        // The code of `${…}` runs until the brace that closes it brings the depth back.
        depth += 1;
        out += '${';
        i += 2;
      }
      continue;
    }
    const comment = rest.match(/^\/\/[^\n]*|^\/\*[\s\S]*?\*\//);
    if (comment) {
      out += blank(comment[0]);
      i += comment[0].length;
      continue;
    }
    const string = rest.match(/^'(?:\\[\s\S]|[^'\\\n])*'|^"(?:\\[\s\S]|[^"\\\n])*"/);
    if (string) {
      out += blank(string[0]);
      i += string[0].length;
      continue;
    }
    const char = source[i];
    if (char === '`') templates.push(depth);
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    out += char;
    i += 1;
  }
  return out;
}

/** The lines, from 1, of the casts in `source` that no `Cast:` comment explains. */
export function unexplainedCasts(source: string): number[] {
  let code = codeOnly(source);
  for (const rename of RENAMES)
    code = code.replace(rename, (match) => match.replace(/[^\n]/g, ' '));
  const lines = source.split('\n');
  const found: number[] = [];
  for (const match of code.matchAll(ASSERTION)) {
    const line = code.slice(0, match.index).split('\n').length;
    const explained =
      JUSTIFIED.test(lines[line - 1] ?? '') || JUSTIFIED.test(lines[line - 2] ?? '');
    if (!explained) found.push(line);
  }
  return found;
}

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

/**
 * What is wrong with the casts each file has without a `Cast:` comment, against the counts the
 * baseline allows: more than allowed, or fewer, which the baseline must be lowered to.
 */
export function baselineProblems(
  found: Readonly<Record<string, number[]>>,
  baseline: Readonly<Record<string, number>>,
): string[] {
  const problems: string[] = [];
  for (const file of new Set([...Object.keys(found), ...Object.keys(baseline)])) {
    const lines = found[file] ?? [];
    const allowed = baseline[file] ?? 0;
    if (lines.length > allowed)
      problems.push(
        `${file}: ${lines.length} type assertions without a "Cast:" comment saying why they are safe, at lines ${lines.join(', ')}; ${allowed} allowed. Validate the value where it enters instead.`,
      );
    else if (lines.length < allowed)
      problems.push(
        `${file}: ${lines.length} type assertions left of the ${allowed} its baseline allows; lower it in scripts/casts-baseline.json.`,
      );
  }
  return problems;
}

/** The allowed count of casts per file, from the baseline file's text. */
function parseBaseline(text: string): Record<string, number> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('scripts/casts-baseline.json must hold an object of counts per file.');
  const baseline: Record<string, number> = {};
  for (const [file, value] of Object.entries(parsed)) {
    const count: unknown = value;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0)
      throw new Error(`scripts/casts-baseline.json: the count of ${file} must be a whole number.`);
    baseline[file] = count;
  }
  return baseline;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found: Record<string, number[]> = {};
  for (const file of await sourceFiles(join(root, 'src'))) {
    const lines = unexplainedCasts(await readFile(file, 'utf8'));
    if (lines.length > 0) found[relative(root, file).replaceAll(sep, '/')] = lines;
  }
  const baseline = parseBaseline(await readFile(join(root, 'scripts/casts-baseline.json'), 'utf8'));
  const problems = baselineProblems(found, baseline);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exitCode = 1;
  else console.log('Type assertions: OK.');
}
