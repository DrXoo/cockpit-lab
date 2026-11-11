// Autosave of the current project in the browser. The storage is injected so the logic can be
// tested without a browser, and so a blocked or full storage degrades to "no autosave".
import { projectData, readProject, type Project } from './project.ts';

export const STORAGE_KEY = 'cockpit-lab-v2';
/** Key used by the previous version; its designs are still recovered. */
export const LEGACY_STORAGE_KEY = 'cockpit-lab-v1';

export type LoadResult =
  { status: 'empty' } | { status: 'loaded'; project: Project } | { status: 'invalid' };

export interface ProjectStore {
  load(): LoadResult;
  /** Returns false when the project could not be saved. */
  save(project: Project): boolean;
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * `getStorage` is a function because merely reading `window.localStorage` throws when the
 * browser blocks site data.
 */
export function createProjectStore(getStorage: () => KeyValueStorage): ProjectStore {
  return {
    load() {
      try {
        const storage = getStorage();
        const saved = storage.getItem(STORAGE_KEY) || storage.getItem(LEGACY_STORAGE_KEY);
        if (!saved) return { status: 'empty' };
        return { status: 'loaded', project: readProject(JSON.parse(saved), { stored: true }) };
      } catch {
        return { status: 'invalid' };
      }
    },
    save({ config, setup }) {
      try {
        getStorage().setItem(STORAGE_KEY, JSON.stringify(projectData(config, setup)));
        return true;
      } catch {
        return false;
      }
    },
  };
}
