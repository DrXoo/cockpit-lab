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
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Files whose quoted relative paths are references to other files. */
const CODE = /\.(?:ts|mjs|js|html|css)$/;
/** Files that name files by their path from the root. */
const DOCUMENTS = /\.(?:md|json)$/;
const QUOTED_RELATIVE = /(['"`])(\.{1,2}\/[^'"`\s$]*)\1/g;
const MARKDOWN_LINK = /(\]\()(\.{1,2}\/[^)\s#]*)/g;

/**
 * The new text of every file a set of moves changes or moves, by its path after the moves.
 * `files` holds the text of every file that may refer to another, by path from the root.
 */
export function movedFiles(
  files: ReadonlyMap<string, string>,
  moves: ReadonlyMap<string, string>,
): Map<string, string> {
  assertMovable(files, moves);
  const placeOf = (path: string): string => moves.get(path) ?? path;
  const result = new Map<string, string>();
  for (const [path, text] of files) {
    const newPath = placeOf(path);
    const newText = withReferencesMoved(path, newPath, text, files, placeOf);
    if (newPath !== path || newText !== text) result.set(newPath, newText);
  }
  return result;
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

function withReferencesMoved(
  path: string,
  newPath: string,
  text: string,
  files: ReadonlyMap<string, string>,
  placeOf: (path: string) => string,
): string {
  const relink = (specifier: string): string => {
    const target = posix.normalize(posix.join(posix.dirname(path), specifier));
    if (!files.has(target)) return specifier;
    return relativeSpecifier(newPath, placeOf(target));
  };
  let result = text;
  if (CODE.test(path)) {
    result = result.replace(
      QUOTED_RELATIVE,
      (_match, quote: string, specifier: string) => `${quote}${relink(specifier)}${quote}`,
    );
  }
  if (path.endsWith('.md')) {
    result = result.replace(
      MARKDOWN_LINK,
      (_match, opening: string, specifier: string) => `${opening}${relink(specifier)}`,
    );
  }
  if (DOCUMENTS.test(path)) result = withRootPathsMoved(result, files, placeOf);
  return result;
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
  const changed = movedFiles(files, moves);
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
