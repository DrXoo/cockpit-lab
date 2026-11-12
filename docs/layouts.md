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
| Cockpit design: chassis, seat, wheel, pedals, flight controls, base lift and posture | Position and rotation of the cockpit |
| Monitor arm hardware: reach, segment split, height range and monitor size | Arm mount position and type, monitor mode, joint angles, bend, monitor yaw, distance and height |
| Free aisle width and display options | — |

`src/layouts.ts` holds this split. It is the only place that knows which settings belong to a layout.

## Rules

- Duplicating a layout copies the active one and makes the copy active.
- Furniture added in one layout appears in every layout, where it was created. Moving it afterwards only moves it in the active layout.
- Deleting a piece of furniture deletes it from every layout. To leave it out of one layout only, hide it there: the layout keeps its placement, so showing it again puts it back where it was.
- Changing anything shared, such as the room size or the desk width, changes it in every layout. When another layout opens, its items are fitted to the change: furniture and openings stay inside the room's limits and desktop items stay on the desk.
- A project always has at least one layout, and at most 20.

## File format

Format v3 stores the shared settings in `shared` and each layout in `layouts`, with `activeLayoutId` naming the layout that opens. See [the save format](guided-setup.md#model-and-saving). The reader validates each layout by combining it with the shared settings and checking the result as it checks any configuration. It rejects a layout that is missing the placement of a piece of furniture, hides furniture that does not exist, repeats another layout's id or stores a setting that is not a placement.

A v1 or v2 file holds a single configuration and opens as one layout called "Base".
