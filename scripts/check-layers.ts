// Checks the direction of the imports between the folders of src/ (README: Project structure).
// An area's domain (room/, cockpit/, project/ and the cockpit's cad/) depends on nothing of an
// editor, a drawing, the scene or the page; shared/ depends on nothing outside itself; and only the
// scene uses Three.js. Editors, drawings and the composition root may import any domain.
import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOMAIN_AREAS = ['src/room/', 'src/cockpit/', 'src/project/', 'src/shared/'];
/** Folders inside an area that hold its editor or its drawing. */
const AREA_ADAPTERS = ['editing', 'editor', 'render'];
/** Folders of src/ that hold the page or the 3D view. */
const PAGE_FOLDERS = ['scene', 'ui', 'app'];
/** An import on one line, the last line of one over several (`} from '...'`), or import(). */
const IMPORT =
  /^\s*(?:(?:import|export)\b[^'"]*?\bfrom|\}\s*from)\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/;

/** Every import that goes against the direction of the folders, as `file:line imports ...`. */
export function layerViolations(files: ReadonlyMap<string, string>): string[] {
  const violations: string[] = [];
  for (const [path, text] of files) {
    text.split('\n').forEach((line, index) => {
      const match = IMPORT.exec(line);
      const specifier = match?.[1] ?? match?.[2];
      if (specifier === undefined) return;
      const rule = brokenRule(path, specifier);
      if (rule) violations.push(`${path}:${index + 1} imports ${specifier}: ${rule}`);
    });
  }
  return violations;
}

function brokenRule(path: string, specifier: string): string | undefined {
  if (specifier === 'three' || specifier.startsWith('three/')) {
    return path.startsWith('src/scene/') ? undefined : 'only scene/ may depend on Three.js';
  }
  if (!specifier.startsWith('.')) return undefined;
  const target = posix.normalize(posix.join(posix.dirname(path), specifier));
  if (path.startsWith('src/shared/') && !target.startsWith('src/shared/')) {
    return `shared/ must not depend on ${target.split('/')[1]}/`;
  }
  if (!isDomain(path)) return undefined;
  const folder = adapterFolderOf(target);
  return folder ? `the domain must not depend on ${folder}/` : undefined;
}

function isDomain(path: string): boolean {
  if (!DOMAIN_AREAS.some((area) => path.startsWith(area))) return false;
  return !path.split('/').some((segment) => AREA_ADAPTERS.includes(segment));
}

/** The editor, drawing or page folder a module lives in, if it lives in one. */
function adapterFolderOf(path: string): string | undefined {
  const segments = path.split('/');
  const pageFolder = segments[1];
  if (segments[0] === 'src' && pageFolder !== undefined && PAGE_FOLDERS.includes(pageFolder)) {
    return pageFolder;
  }
  return segments.slice(0, -1).find((segment) => AREA_ADAPTERS.includes(segment));
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = new Map<string, string>();
  for (const file of await sourceFiles(join(root, 'src'))) {
    files.set(relative(root, file).split(sep).join('/'), await readFile(file, 'utf8'));
  }
  const violations = layerViolations(files);
  if (violations.length > 0) {
    console.error(`Imports against the folder structure (README: Project structure):`);
    for (const violation of violations) console.error(`  ${violation}`);
    process.exitCode = 1;
  } else {
    console.log('Folder dependencies: OK.');
  }
}
