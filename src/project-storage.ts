// Autosave of the current project in the browser. The storage is injected so the logic can be
// tested without a browser, and so a blocked or full storage degrades to "no autosave".
import { projectData, readProject, type Project } from './project.ts';

export const STORAGE_KEY = 'cockpit-lab-v3';
/**
 * Keys used by earlier versions, newest first. Their designs are still recovered, and they are
 * left as they were.
 */
export const LEGACY_STORAGE_KEYS = ['cockpit-lab-v2', 'cockpit-lab-v1'] as const;

export type LoadResult =
  { status: 'empty' } | { status: 'loaded'; project: Project } | { status: 'invalid' };

export interface ProjectStore {
  load(): LoadResult;
  /** Returns false when the project could not be saved. */
  save(project: Project): boolean;
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

function newestSavedProject(storage: KeyValueStorage): string | null {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const saved = storage.getItem(key);
    if (saved) return saved;
  }
  return null;
}

/**
 * `getStorage` is a function because merely reading `window.localStorage` throws when the
 * browser blocks site data.
 */
export function createProjectStore(getStorage: () => KeyValueStorage): ProjectStore {
  return {
    load() {
      try {
        const saved = newestSavedProject(getStorage());
        if (!saved) return { status: 'empty' };
        return { status: 'loaded', project: readProject(JSON.parse(saved), { stored: true }) };
      } catch {
        return { status: 'invalid' };
      }
    },
    save({ library, setup }) {
      try {
        getStorage().setItem(STORAGE_KEY, JSON.stringify(projectData(library, setup)));
        return true;
      } catch {
        return false;
      }
    },
  };
}
