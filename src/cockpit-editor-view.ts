// The cockpit editor while a design has no parts: the panel that explains how a design starts,
// and the empty workspace the design is shown in, without any room. Cockpit files are imported
// from the actions above the panel.
import { defaults, type RoomConfig } from './config.ts';

/** What surrounds a design in its own workspace: nothing. */
export const NOTHING_AROUND: RoomConfig = {
  ...defaults,
  roomEnabled: false,
  deskEnabled: false,
  monitorEnabled: false,
  keyboardEnabled: false,
  pcEnabled: false,
  mouseEnabled: false,
  matEnabled: false,
  roomFeatures: [],
  roomFurniture: [],
  armPoses: [],
};

/** The panel of an empty design. */
export function emptyDesignHTML(): string {
  return `<div class="control-group" id="emptyDesign"><h3 class="group-title">A design built from parts</h3><p class="layout-hint">A cockpit design is the list of steps that builds it from aluminium profiles, plates and peripherals. New designs start empty. Adding the first profile comes with the next version of the editor.</p><p class="layout-hint">Cockpits of the earlier configurator are not converted: design them again from parts.</p></div>`;
}
