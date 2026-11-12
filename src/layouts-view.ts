// Markup for choosing among a project's layouts.
import { escapeHTML } from './html.ts';
import type { LayoutLibrary } from './layouts.ts';

/** One option per layout, in their order, with the active one selected. */
export const layoutOptionsHTML = (library: LayoutLibrary): string =>
  library.layouts
    .map(
      (layout) =>
        `<option value="${escapeHTML(layout.id)}"${layout.id === library.activeLayoutId ? ' selected' : ''}>${escapeHTML(layout.name)}</option>`,
    )
    .join('');
