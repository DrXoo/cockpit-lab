// Autosave of the current project in the browser. The storage is injected so the logic can be
// tested without a browser, and so a blocked or full storage degrades to "no autosave".
import { projectData, readProject, type Project } from './project.ts';

export const STORAGE_KEY = 'cockpit-lab-v4';
/**
 * Keys used by earlier versions, newest first. Their designs are still recovered, and they are
 * left as they were.
 */
export const LEGACY_STORAGE_KEYS = ['cockpit-lab-v3', 'cockpit-lab-v2', 'cockpit-lab-v1'] as const;
/** Prefix of the copies of saved projects that could not be read. */
export const UNREADABLE_KEY_PREFIX = 'cockpit-lab-unreadable-';

export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; project: Project }
  /** The saved text is kept, untouched, under `keptAs`. */
  | { status: 'unreadable'; keptAs: string; text: string }
  | { status: 'unavailable' };

export interface ProjectStore {
  load(): LoadResult;
  /** Returns false when the project could not be saved. */
  save(project: Project): boolean;
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface StoreOptions {
  now?: () => Date;
}

function newestSavedProject(storage: KeyValueStorage): { key: string; text: string } | null {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const text = storage.getItem(key);
    if (text) return { key, text };
  }
  return null;
}

const unreadableKey = (date: Date): string =>
  UNREADABLE_KEY_PREFIX + date.toISOString().replace(/[:.]/g, '-');

/**
 * `getStorage` is a function because merely reading `window.localStorage` throws when the
 * browser blocks site data.
 *
 * A saved project that can't be read is never overwritten: saving would replace it with the new
 * project, so it is copied to a key of its own first. If even that copy fails, saving stays off.
 */
export function createProjectStore(
  getStorage: () => KeyValueStorage,
  { now = () => new Date() }: StoreOptions = {},
): ProjectStore {
  let savingPaused = false;

  /** Where the unreadable text stays: its own key unless saving would overwrite it. */
  function keepUnreadable(storage: KeyValueStorage, key: string, text: string): string {
    if (key !== STORAGE_KEY) return key;
    const copyKey = unreadableKey(now());
    try {
      storage.setItem(copyKey, text);
      return copyKey;
    } catch {
      savingPaused = true;
      return key;
    }
  }

  return {
    load() {
      let storage: KeyValueStorage;
      let saved: { key: string; text: string } | null;
      try {
        storage = getStorage();
        saved = newestSavedProject(storage);
      } catch {
        return { status: 'unavailable' };
      }
      if (!saved) return { status: 'empty' };
      try {
        return { status: 'loaded', project: readProject(JSON.parse(saved.text), { stored: true }) };
      } catch {
        const keptAs = keepUnreadable(storage, saved.key, saved.text);
        return { status: 'unreadable', keptAs, text: saved.text };
      }
    },
    save(project) {
      if (savingPaused) return false;
      try {
        getStorage().setItem(STORAGE_KEY, JSON.stringify(projectData(project)));
        return true;
      } catch {
        return false;
      }
    },
  };
}
