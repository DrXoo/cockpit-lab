# Layouts

A project describes one room and what is in it. A **layout** is one way of arranging it. You can keep several layouts in a project, try a new arrangement on a copy, and go back to the one you started from without undoing anything by hand.

## What a layout stores and what is shared

Everything that exists is shared by every layout. Each layout stores only where things are.

| Shared by every layout | Stored in each layout |
| --- | --- |
| Room size and position, doors, windows and built-in wardrobe fronts | — |
| Each piece of furniture: type, name, size, chair seat height and pull-back space | Position and rotation of each piece of furniture, and the wall, offset and mounting height of a wall shelf |
| Which pieces of furniture exist | Which of them the layout leaves out |
| Desk size and height, and which accessories exist and their sizes | Position and rotation of the desk, the keyboard, the mouse, the PC and the desk mat |
| Monitor arm hardware: reach, segment split, height range and monitor size | Arm mount position and type, monitor mode, joint angles, bend, monitor yaw and height, and the saved arm poses |
| Free aisle width and display options | — |

`src/room/layouts.ts` holds this split. It is the only place that knows which settings belong to a layout. The cockpit design is not part of the room: the project holds it apart (`src/cockpit/design.ts`). Until the mini CAD is complete, no layout places it (docs/adr/0004); when the cockpit returns to the room, every layout will place that same design.

## Using layouts

The layout picker sits at the top of the settings once the guided setup is done. A new or imported project starts with one layout, "Base".

- **Duplicate** copies the active layout under a new name and opens the copy. Your changes go to the copy from then on.
- **Choose a layout** in the picker to see it. The camera and the open view stay as they are, so switching back and forth compares two arrangements in the same view. The scene label names the active layout when there is more than one.
- **Rename** and **Delete** act on the active layout. The last layout can't be deleted.
- In **Furniture**, "Hide in this layout" leaves the selected piece out of the active layout. Hidden pieces are listed under "Hidden in this layout", each with a button to show it again. With more than one layout, deleting a piece says that it deletes it from every layout.

The checks, the metrics and the summary always describe the active layout.

## Rules

- Duplicating a layout copies the active one and makes the copy active.
- Furniture added in one layout appears in every layout, where it was created. Moving it afterwards only moves it in the active layout.
- Deleting a piece of furniture deletes it from every layout. To leave it out of one layout only, hide it there: the layout keeps its placement, so showing it again puts it back where it was.
- Changing anything shared, such as the room size or the desk width, changes it in every layout. When another layout opens, its items are fitted to the change: furniture and openings stay inside the room's limits and desktop items stay on the desk.
- A project always has at least one layout, and at most 20.

## File format

Format v5 stores the cockpit design in `cockpit`, as its design history in mm, or `null` when the project has none, and the room in `room`: the shared settings in `room.shared` and each layout in `room.layouts`, with `room.activeLayoutId` naming the layout that opens. See [the save format](guided-setup.md#model-and-saving). The reader validates each layout by combining it with the shared settings and checking the result as it checks any configuration. It rejects a layout that is missing the placement of a piece of furniture, hides furniture that does not exist, repeats another layout's id or stores a setting that is not a placement.

A v4 file stores the room as v5 does, with a parametric cockpit in `cockpit`, and a v3 file keeps that cockpit among the shared settings; both open with the same layouts and without the cockpit, and the placements of the cockpit and of the monitor in front of it are read and left out. A v1 or v2 file holds a single configuration and opens as one layout called "Base".