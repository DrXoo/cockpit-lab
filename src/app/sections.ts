// The parts of the page the user moves between: the two editors, the tabs of their side panel
// and, on narrow screens, the panel shown.
import type { SettingsSection } from '../setup-actions.ts';

/**
 * The cockpit editor changes the cockpit design on its own; the room editor arranges the room
 * and places the design in each layout. See docs/adr/0001.
 */
export type Editor = 'cockpit' | 'room';

/**
 * The settings sections: the tabs of the room editor, and the design, the cockpit editor's only
 * panel until it has tools of its own.
 */
export type Section = SettingsSection | 'furniture' | 'design';

/** The panels that narrow screens show one at a time, through the studio nav. */
export const WORKSPACES = ['view', 'config', 'checks'] as const;
export type Workspace = (typeof WORKSPACES)[number];

const SECTIONS = ['room', 'furniture', 'desk', 'design'] as const;
const EDITORS = ['cockpit', 'room'] as const;

export function sectionOf(value: string): Section {
  const section = SECTIONS.find((known) => known === value);
  if (!section) throw new Error(`Unknown section: ${value}`);
  return section;
}

export function editorOf(value: string): Editor {
  const editor = EDITORS.find((known) => known === value);
  if (!editor) throw new Error(`Unknown editor: ${value}`);
  return editor;
}

export function workspaceOf(value: string): Workspace {
  const workspace = WORKSPACES.find((known) => known === value);
  if (!workspace) throw new Error(`Unknown workspace: ${value}`);
  return workspace;
}

export const editorOfSection = (section: Section): Editor =>
  section === 'design' ? 'cockpit' : 'room';

/** Whether a section arranges the room itself: its openings or its furniture. */
export const isRoomSection = (section: Section): boolean =>
  section === 'room' || section === 'furniture';
