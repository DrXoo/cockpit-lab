// Renames a symbol everywhere the type checker sees it used, and nowhere else: strings, comments
// and other symbols with the same name are left alone, which a search and replace cannot promise.
//
//   npm run rename -- <file>[:<line>] <old name> <new name>
//
// The line is needed only when the name means two different things in the file. The changed files
// are formatted with Prettier afterwards.
//
// Run `npm run typecheck` and the tests after a rename. The checker links a property only to the
// places typed with it, so an object literal that gets its type later, where it is passed, keeps
// the old name and fails to type-check; and the new name may already be taken in some scope. A
// property saved in project files is also read back by its name as a string, which is never
// changed: renaming one changes the file format.
//
// TypeScript 7 has no language service in JavaScript; its API (still marked unstable) runs the
// native compiler and answers "find all references", which is what a rename is built on here.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getTokenPosOfNode,
  getTouchingPropertyName,
  isBindingElement,
  isGetAccessorDeclaration,
  isIdentifier,
  isIdentifierText,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isObjectBindingPattern,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  type Identifier,
  type Node,
  type SourceFile,
} from 'typescript/unstable/ast';
import { API, type Checker } from 'typescript/unstable/sync';

export interface RenameRequest {
  /** The tsconfig.json of the project; only its files are changed. */
  configFile: string;
  /** A file where the symbol appears. */
  file: string;
  /** The line (from 1) of an appearance of the symbol, when the name has several meanings. */
  line?: number;
  oldName: string;
  newName: string;
}

/** One identifier to replace: its place in its file and the text that goes there. */
interface Replacement {
  file: string;
  start: number;
  end: number;
  text: string;
}

/** The new text of every file the rename changes, by absolute file name. Writes nothing. */
export function renamedSources(request: RenameRequest): Map<string, string> {
  for (const name of [request.oldName, request.newName]) {
    if (!isIdentifierText(name)) throw new Error(`${JSON.stringify(name)} is not an identifier.`);
  }
  const configFile = resolve(request.configFile);
  const api = new API({ cwd: dirname(configFile) });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [configFile] });
    const project = snapshot.getProject(configFile);
    if (!project) throw new Error(`No project for ${configFile}.`);
    const source = project.program.getSourceFile(resolve(request.file));
    if (!source) throw new Error(`${request.file} is not part of the project ${configFile}.`);
    const target = chosenAppearance(source, project.checker, request);
    const replacements = replacementsFor(target, project.checker, request);
    for (const replacement of replacements) {
      assertInProject(replacement.file, dirname(configFile));
    }
    return applied(replacements, project.program.getSourceFile.bind(project.program));
  } finally {
    api.close();
  }
}

/** An identifier with the old name and the set of places its symbol is used. */
interface Appearance {
  identifier: Identifier;
  line: number;
  usedAt: string;
}

/**
 * The appearance of the old name the rename starts from. Shorthand (`{ width }`) names a property
 * and a variable at once, so it decides nothing while another appearance can.
 */
function chosenAppearance(
  source: SourceFile,
  checker: Checker,
  request: RenameRequest,
): Identifier {
  const appearances = appearancesOf(source, checker, request);
  const plain = appearances.filter((appearance) => !isShorthand(appearance.identifier));
  const deciding = plain.length > 0 ? plain : appearances;
  const meanings = new Map<string, number[]>();
  for (const appearance of deciding) {
    const lines = meanings.get(appearance.usedAt) ?? [];
    lines.push(appearance.line);
    meanings.set(appearance.usedAt, lines);
  }
  if (meanings.size > 1) {
    const firstLines = [...meanings.values()].map((lines) => lines[0]).join(', ');
    throw new Error(
      `${request.oldName} names ${meanings.size} different symbols in ${request.file}` +
        ` (first seen on lines ${firstLines}): add the line of the one to rename, as file:line.`,
    );
  }
  const [first] = deciding;
  if (!first) throw new Error('Unreachable: appearances are checked to be there.');
  return first.identifier;
}

function appearancesOf(source: SourceFile, checker: Checker, request: RenameRequest): Appearance[] {
  const appearances: Appearance[] = [];
  const name = new RegExp(`(?<![\\w$])${escapeRegExp(request.oldName)}(?![\\w$])`, 'g');
  for (const match of source.text.matchAll(name)) {
    const node = getTouchingPropertyName(source, match.index);
    if (!isIdentifier(node) || node.text !== request.oldName) continue;
    if (getTokenPosOfNode(node, source) !== match.index) continue;
    const line = lineOf(source, match.index);
    if (request.line !== undefined && line !== request.line) continue;
    const usedAt = referencesOf(node, checker)
      .map((reference) => `${reference.getSourceFile().fileName}:${startOf(reference)}`)
      .sort()
      .join('|');
    appearances.push({ identifier: node, line, usedAt });
  }
  if (appearances.length === 0) {
    const where = request.line === undefined ? '' : ` on line ${request.line}`;
    throw new Error(`No identifier ${request.oldName} in ${request.file}${where}.`);
  }
  return appearances;
}

/** Every identifier that refers to the symbol, each with the declaration it was found through. */
function referencesOf(identifier: Identifier, checker: Checker): Identifier[] {
  return referenceGroups(identifier, checker).flatMap((group) => group.references);
}

interface ReferenceGroup {
  declaration: Node;
  references: Identifier[];
}

function referenceGroups(identifier: Identifier, checker: Checker): ReferenceGroup[] {
  const position = getTokenPosOfNode(identifier, identifier.getSourceFile());
  return checker.getReferencedSymbolsForNode(identifier, position).map((entry) => {
    const declaration = entry.definition.resolve();
    if (!declaration) throw new Error('A declaration the checker reported cannot be read.');
    const references = entry.references.map((handle) => {
      const node = handle.resolve();
      if (!node || !isIdentifier(node)) {
        throw new Error(`A reference is not a plain identifier (${handle.path}).`);
      }
      return node;
    });
    return { declaration, references };
  });
}

function replacementsFor(
  target: Identifier,
  checker: Checker,
  request: RenameRequest,
): Replacement[] {
  const byPlace = new Map<string, Replacement>();
  for (const group of referenceGroups(target, checker)) {
    const renamingProperty = declaresProperty(group.declaration);
    for (const reference of group.references) {
      const replacement: Replacement = {
        file: reference.getSourceFile().fileName,
        start: startOf(reference),
        end: reference.end,
        text: replacementText(reference, renamingProperty, request),
      };
      const place = `${replacement.file}:${replacement.start}`;
      const earlier = byPlace.get(place);
      if (earlier && earlier.text !== replacement.text) {
        throw new Error(`Two different renames meet at ${place}.`);
      }
      byPlace.set(place, replacement);
    }
  }
  return [...byPlace.values()];
}

/**
 * Shorthand ties a property to a variable of the same name; renaming one of them spells the tie
 * out, so the other keeps its name.
 */
function replacementText(
  reference: Identifier,
  renamingProperty: boolean,
  request: RenameRequest,
): string {
  if (!isShorthand(reference)) return request.newName;
  return renamingProperty
    ? `${request.newName}: ${request.oldName}`
    : `${request.oldName}: ${request.newName}`;
}

/** `{ width }` in an object literal, or in an object pattern without a property name. */
function isShorthand(identifier: Identifier): boolean {
  const parent = identifier.parent;
  if (isShorthandPropertyAssignment(parent)) return true;
  return (
    isBindingElement(parent) &&
    parent.propertyName === undefined &&
    parent.name === identifier &&
    isObjectBindingPattern(parent.parent)
  );
}

function declaresProperty(declaration: Node): boolean {
  return (
    isPropertySignatureDeclaration(declaration) ||
    isPropertyDeclaration(declaration) ||
    isPropertyAssignment(declaration) ||
    isShorthandPropertyAssignment(declaration) ||
    isMethodSignatureDeclaration(declaration) ||
    isMethodDeclaration(declaration) ||
    isGetAccessorDeclaration(declaration) ||
    isSetAccessorDeclaration(declaration)
  );
}

/** A rename that reaches a library or a file outside the project is not ours to make. */
function assertInProject(file: string, projectFolder: string): void {
  const path = relative(projectFolder, file);
  if (path.startsWith('..') || resolve(projectFolder, path) !== resolve(file)) {
    throw new Error(`The rename would change ${file}, outside the project.`);
  }
  if (path.split(/[\\/]/).includes('node_modules')) {
    throw new Error(`The rename would change ${file}, a dependency.`);
  }
}

function applied(
  replacements: Replacement[],
  sourceOf: (file: string) => SourceFile | undefined,
): Map<string, string> {
  const byFile = new Map<string, Replacement[]>();
  for (const replacement of replacements) {
    const list = byFile.get(replacement.file) ?? [];
    list.push(replacement);
    byFile.set(replacement.file, list);
  }
  const sources = new Map<string, string>();
  for (const [file, list] of byFile) {
    const source = sourceOf(file);
    if (!source) throw new Error(`${file} cannot be read back from the project.`);
    let text = source.text;
    // From the end, so each replacement leaves the places of the ones before it as they were.
    for (const replacement of list.sort((a, b) => b.start - a.start)) {
      text = text.slice(0, replacement.start) + replacement.text + text.slice(replacement.end);
    }
    sources.set(file, text);
  }
  return sources;
}

function startOf(node: Node): number {
  return getTokenPosOfNode(node, node.getSourceFile());
}

function lineOf(source: SourceFile, position: number): number {
  return source.text.slice(0, position).split('\n').length;
}

/** An identifier is letters, digits, `_` and `$`; only `$` means something in a pattern. */
function escapeRegExp(identifier: string): string {
  return identifier.replace(/[$]/g, '\\$');
}

function parseTarget(argument: string): { file: string; line?: number } {
  const match = /^(.*?):(\d+)$/.exec(argument);
  if (!match || match[1] === undefined || match[2] === undefined) return { file: argument };
  return { file: match[1], line: Number(match[2]) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [target, oldName, newName] = process.argv.slice(2);
  if (!target || !oldName || !newName) {
    console.error('Usage: npm run rename -- <file>[:<line>] <old name> <new name>');
    process.exit(2);
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const sources = renamedSources({
    ...parseTarget(target),
    configFile: resolve(root, 'tsconfig.json'),
    oldName,
    newName,
  });
  for (const [file, text] of sources) writeFileSync(file, text);
  const files = [...sources.keys()];
  const prettier = resolve(root, 'node_modules/prettier/bin/prettier.cjs');
  const formatted = spawnSync(process.execPath, [
    prettier,
    '--write',
    '--log-level=warn',
    ...files,
  ]);
  if (formatted.status !== 0) process.exitCode = 1;
  console.log(`Renamed ${oldName} to ${newName} in ${files.length} file(s):`);
  for (const file of files) console.log(`  ${relative(root, file)}`);
}
