// Moves files and rewrites every reference to them, so a move is one step that type-checks after.
//
//   npm run move -- <from> <to> [<from> <to> ...]
//
// A destination that ends in / is a folder: the file keeps its name. Paths are from the root of
// the repository. Each move is a `git mv`, so the history follows the file.
//
// References rewritten: relative paths in quotes (imports, import(), new URL(), the page's src and
// href) in code, the page and style sheets; relative links in Markdown; and paths from the root
// (`src/units.ts`) in Markdown and JSON. Text that names no file of the repository is left alone.
//
// In the TypeScript of the project, a path is a whole string literal, as the compiler parses it:
// a test that holds source code as text quotes paths inside its strings, and those stay as they
// are. Other files are searched for quoted paths.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getTokenPosOfNode,
  isNoSubstitutionTemplateLiteral,
  isStringLiteral,
  type Node,
} from 'typescript/unstable/ast';
import { API } from 'typescript/unstable/sync';

/** The text of a string literal, without its quotes, as places in its file. */
export interface Span {
  start: number;
  end: number;
}

/** Files whose quoted relative paths are references to other files. */
const CODE = /\.(?:ts|mjs|js|html|css)$/;
/** Files that name files by their path from the root. */
const DOCUMENTS = /\.(?:md|json)$/;
const QUOTED_RELATIVE = /(['"`])(\.{1,2}\/[^'"`\s$]*)\1/g;
const MARKDOWN_LINK = /(\]\()(\.{1,2}\/[^)\s#]*)/g;

/**
 * The new text of every file a set of moves changes or moves, by its path after the moves.
 * `files` holds the text of every file that may refer to another, by path from the root.
 * `literals` holds the string literals of the files that have been parsed; the other files are
 * searched for quoted paths.
 */
export function movedFiles(
  files: ReadonlyMap<string, string>,
  moves: ReadonlyMap<string, string>,
  literals: ReadonlyMap<string, readonly Span[]> = new Map(),
): Map<string, string> {
  assertMovable(files, moves);
  const placeOf = (path: string): string => moves.get(path) ?? path;
  const result = new Map<string, string>();
  for (const [path, text] of files) {
    const newPath = placeOf(path);
    const relink = relinker(path, newPath, files, placeOf);
    const parsed = literals.get(path);
    const newText = parsed
      ? withLiteralsRelinked(text, parsed, relink)
      : withPathsRelinked(path, text, relink);
    const withRootPaths = DOCUMENTS.test(path)
      ? withRootPathsMoved(newText, files, placeOf)
      : newText;
    if (newPath !== path || withRootPaths !== text) result.set(newPath, withRootPaths);
  }
  return result;
}

/** The string literals of every TypeScript file of a project, by path from `root`. */
export function typeScriptStringLiterals(configFile: string, root: string): Map<string, Span[]> {
  const api = new API({ cwd: dirname(resolve(configFile)) });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [resolve(configFile)] });
    const project = snapshot.getProject(resolve(configFile));
    if (!project) throw new Error(`No project for ${configFile}.`);
    const literals = new Map<string, Span[]>();
    for (const fileName of project.program.getSourceFileNames()) {
      const path = toRepositoryPath(relative(root, fileName));
      if (path.startsWith('../') || path.includes('node_modules/')) continue;
      const source = project.program.getSourceFile(fileName);
      if (!source) continue;
      const spans: Span[] = [];
      const visit = (node: Node): void => {
        if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) {
          spans.push({ start: getTokenPosOfNode(node, source) + 1, end: node.end - 1 });
        }
        node.forEachChild(visit);
      };
      source.forEachChild(visit);
      literals.set(path, spans);
    }
    return literals;
  } finally {
    api.close();
  }
}

function assertMovable(files: ReadonlyMap<string, string>, moves: ReadonlyMap<string, string>) {
  const destinations = new Set<string>();
  for (const [from, to] of moves) {
    if (!files.has(from)) throw new Error(`There is no file ${from} to move.`);
    const staysThere = files.has(to) && !moves.has(to);
    if (staysThere || destinations.has(to)) throw new Error(`${to} is taken.`);
    destinations.add(to);
  }
}

/** Points a relative path written in `path` at where its file is after the moves. */
function relinker(
  path: string,
  newPath: string,
  files: ReadonlyMap<string, string>,
  placeOf: (path: string) => string,
): (specifier: string) => string {
  return (specifier) => {
    if (!/^\.{1,2}\//.test(specifier)) return specifier;
    const target = posix.normalize(posix.join(posix.dirname(path), specifier));
    if (!files.has(target)) return specifier;
    return relativeSpecifier(newPath, placeOf(target));
  };
}

function withLiteralsRelinked(
  text: string,
  literals: readonly Span[],
  relink: (specifier: string) => string,
): string {
  let result = text;
  // From the end, so each replacement leaves the places of the ones before it as they were.
  for (const { start, end } of [...literals].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, start) + relink(result.slice(start, end)) + result.slice(end);
  }
  return result;
}

function withPathsRelinked(
  path: string,
  text: string,
  relink: (specifier: string) => string,
): string {
  if (CODE.test(path)) {
    return text.replace(
      QUOTED_RELATIVE,
      (_match, quote: string, specifier: string) => `${quote}${relink(specifier)}${quote}`,
    );
  }
  if (path.endsWith('.md')) {
    return text.replace(
      MARKDOWN_LINK,
      (_match, opening: string, specifier: string) => `${opening}${relink(specifier)}`,
    );
  }
  return text;
}

/** A path from the root stands alone: no path characters right before it or right after it. */
function withRootPathsMoved(
  text: string,
  files: ReadonlyMap<string, string>,
  placeOf: (path: string) => string,
): string {
  return text.replace(/(?<![\w./-])[\w-]+(?:\/[\w.-]+)+/g, (path) => {
    // A sentence may end right after the path.
    const trimmed = path.replace(/\.+$/, '');
    if (!files.has(trimmed)) return path;
    return placeOf(trimmed) + path.slice(trimmed.length);
  });
}

function relativeSpecifier(fromFile: string, toFile: string): string {
  const path = posix.relative(posix.dirname(fromFile), toFile);
  return path.startsWith('../') ? path : `./${path}`;
}

/** The pairs of the command line, with a destination folder completed by the file's name. */
function parseMoves(argumentsGiven: string[]): Map<string, string> {
  if (argumentsGiven.length === 0 || argumentsGiven.length % 2 !== 0) {
    console.error('Usage: npm run move -- <from> <to> [<from> <to> ...]');
    process.exit(2);
  }
  const moves = new Map<string, string>();
  for (let i = 0; i < argumentsGiven.length; i += 2) {
    const from = toRepositoryPath(argumentsGiven[i] ?? '');
    const to = toRepositoryPath(argumentsGiven[i + 1] ?? '');
    moves.set(from, to.endsWith('/') ? to + posix.basename(from) : to);
  }
  return moves;
}

function toRepositoryPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function git(root: string, args: string[]): string {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`);
  return run.stdout;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const moves = parseMoves(process.argv.slice(2));
  const listed = git(root, ['ls-files', '--cached', '--others', '--exclude-standard']);
  const files = new Map<string, string>();
  for (const path of listed.split('\n')) {
    if (!CODE.test(path) && !DOCUMENTS.test(path)) continue;
    if (path === 'package-lock.json') continue;
    files.set(path, readFileSync(resolve(root, path), 'utf8'));
  }
  const literals = typeScriptStringLiterals(resolve(root, 'tsconfig.json'), root);
  const changed = movedFiles(files, moves, literals);
  for (const [from, to] of moves) {
    mkdirSync(dirname(resolve(root, to)), { recursive: true });
    git(root, ['mv', from, to]);
  }
  for (const [path, text] of changed) writeFileSync(resolve(root, path), text);
  const paths = [...changed.keys()];
  const prettier = resolve(root, 'node_modules/prettier/bin/prettier.cjs');
  const formatted = spawnSync(
    process.execPath,
    [prettier, '--write', '--log-level=warn', ...paths],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
  if (formatted.status !== 0) process.exitCode = 1;
  console.log(`Moved ${moves.size} file(s); ${paths.length} file(s) written.`);
}
