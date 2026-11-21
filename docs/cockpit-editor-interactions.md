# Cockpit editor: interactions in the view

How the mouse and keyboard edit a cockpit design in the view of the cockpit editor. Every edit made here changes the values of the operation that made the part, as the inspector does (see [mini-cad.md](mini-cad.md) and [ADR 0005](adr/0005-a-cockpit-design-is-its-design-history.md)); the view and the inspector are two ways to the same values.

An arrow on the floor ahead of the design, labeled **Front**, points along +Z, the front of the cockpit as the driver faces it; the views frame it with the design. The front is a convention, not a setting: a peripheral faces it unless it is turned, and the driver sits facing it, so a frame is built with its length along it.

## Terms

**Handle**: a control drawn on the selected part that is dragged to change one of its values along one axis.

## With nothing selected

| Gesture | Result |
| --- | --- |
| Drag in the 3D view | Orbits the camera |
| Drag in the top or side view | Pans the view |
| Click a part | Selects it, shown in the view and the inspector; its step is not marked in the design history until **Show in history**, in the inspector, asks for it. A step chosen in the history, or just added, is marked there |
| Hover a part | Outlines it; after half a second at rest, a label by the pointer names it with its size ("Left rail · 40 × 80 · 1200 mm") |

## With a part selected

| Handle | Where | Directions | While dragging, the view shows |
| --- | --- | --- | --- |
| Move | An arrow out of the center of the part for each axis it can move along, red for X, green for Y and blue for Z | An anchored part: the three axes. A part that hangs from another: along and across the face it hangs from, never out of it; a foot only along its profile | How far it moved |
| End | A ball at each free end of a profile, with one arrow along its length | Along the profile's length; with Shift, both ends move symmetrically | The change in length (+120 mm); with Shift, the total length |
| Edge | A ball at the middle of each edge of a plate | Across that edge, changing the plate's width or depth on both sides, so its center stays where it was placed; with Shift, only that edge moves and the far edge stays | The whole width or depth; with Shift, the change in that side |

The actions on the selected part are icon buttons in the toolbar of the view, each named by its tooltip: **Grow a profile out of it**, **Put a plate on it** and **Add a foot under it** for a profile, and **Remove this part** for any part. A failed step has none; its inspector can still fix its values or delete it.

A profile grown out of a face has an end handle only at its free end: the other end stays on its parent. A span has no end handles, as its length is the gap to the part it reaches. A profile's section and a plate's thickness come from the catalog, so no handle changes them. Dragging outside the handles orbits or pans, as with nothing selected.

## A part about to be added

A profile about to grow, a plate about to rest on a profile, or a peripheral about to be mounted, is shown as a preview with the handles it will have once added, which snap as any other handle does. Dragging one changes the preview at once, without a value box: the panel of the new part shows its values, to type them exactly. A box above the preview, clear of it and of its handles, names the new part: ✓ or Enter adds it and ✗ or Escape leaves it out, as the buttons of its panel do, so a part placed with its handles is added without leaving the view. Clicking a face of the parent still moves the preview there. A profile about to grow also has ↻ in its box, and R does the same: it turns the profile to the next way it can grow out of its face, from out of it to lying on it across its parent, each way in turn, then along the parent, and out again. Lying across its parent, it starts at the parent's edge, so it crosses all of it. A profile whose end reaches a part as it is dragged is added as a span, and the panel can let its end go again.

While a part is placed on a profile, about to be added or moved by a handle, two dimensions along the profile measure from each of its ends to the part's center, whether dimensions are shown or not; a profile about to be added shows its own length as well.

## A change waiting to be confirmed

Releasing a handle leaves the part as a preview at its new size or place, with a box beside it that holds the value and ✓ and ✗ buttons. Until the change is confirmed the design does not change, and the inspector shows the values waiting.

| Gesture | Result |
| --- | --- |
| Type in the box | Sets the value exactly |
| Drag a handle again | Keeps adjusting the same change |
| ✓ or Enter | Confirms it: one edit of the design, which Ctrl+Z undoes |
| ✗ or Escape | Leaves the part as it was |
| Click elsewhere in the view | Nothing: it neither selects another part nor clears the selection |
| Drag outside the handles | Orbits or pans, to look at the change from another side |
| Undo, or another step chosen in the design history | Leaves the part as it was, as for a profile about to grow |
| Any other edit from the inspector | Confirms the change first, then makes the edit on top of it |

While a change waits, only the handle that made it shows, and the box keeps clear of it. The handles are drawn over the view, so they keep their size however near the view is; the arrows start a little out of the part's center, so a click there still selects what is under it, and stop short of a ball ahead of them, so neither covers the other. A move that would take a part off its parent stops where it last fitted.

## Snapping

**Snap**: while a handle is dragged, the value it changes jumps to a place that lines the part up with others when it comes near, shown with a guide. Alt held while dragging turns snapping off.

When the free end of a profile grown out of a face comes near the facing face of another part, in front of it, on its center line and at its tilt, as a span needs, it snaps there and the profile becomes a span that reaches that part: the box says so instead of a value, its length is then the gap, and its end makes a joint. Near any other part, the end only snaps to the length that meets it.

A handle snaps to the first of these that is within about 10 pixels on screen, so it works the same however near the view is:

1. Reaching a part, as above.
2. Flush: the end or face being dragged lines up with the plane of a face or end of another part nearby, such as one rail ending where the other does.
3. Centered: a part moved on its parent snaps to the middle of the face across it, where the slot is, and to the middle of the parent's length.
4. Otherwise, steps of 10 mm in the value being changed.

A dashed guide joins the faces that line up. Alt turns off the steps as well, leaving the value to the millimetre. Slots, slot spacing and angles are not snapped to yet.

## Joints in the view

A marker at the middle of where the two parts of a joint touch shows its state with a symbol as well as a color:

- ⚠ for a joint without connectors, on every such joint, whether anything is selected or not;
- ✓ for a fastened joint, only on the joints of the selected part;
- \+ between two parts that touch without a joint.

Clicking a marker opens a card beside it that names the two parts and the joint's state ("✓ 4 bolts, 2 in each slot"), with the quick action that fits it: **Two corner brackets**, **Two in each slot** with the bolts in each slot to type, or **Join to …** for parts that only touch. A crossing lists each of its corners, named by the profile its bracket stands beside, to put a bracket on or take it off. **More in the inspector** selects the part and shows its joints there, side by side. Escape or a click elsewhere closes the card without selecting anything.

The card stays open after a quick action, showing the joint as it then is; two parts joined from it show their new joint. Markers are hidden while a part is about to be added, a measurement is taken or a change waits, as a click in the view does something else then. A marker that would lie on the center of the selected part, where its move arrows start, is drawn just beside it, on the side its arrows leave free.

## Hovering

The part under the pointer is outlined, and its label shows after half a second at rest; neither changes the selection, and neither shows while a handle is dragged. While a part is about to be added, or a change waits to be confirmed, the outline marks the face under the pointer, which is what a click there chooses.

## Fit mode

**Fit** is a toggle in the toolbar of the view, which belongs to the session (stage 5, see [mini-cad.md](mini-cad.md)). Selecting a peripheral's step in the history turns it on; turning it off unselects a peripheral. A selected part with an adjustment, of the frame or a peripheral, has only the arrow along its travel; a peripheral without one has the move handles of a part that hangs from another. Its type is swapped in its inspector, as a foot's is; when its own values were edited, a confirmation says the new type's values take their place first. The inspector of a peripheral with a grip chooses the hand that holds it, under **Held by**. Under **Over its place**, the inspector of a peripheral chooses what stands on the place it is mounted at: its mounting origin, or the holes of its left or right side, which then rest on the slot in the middle of the face, as a seat on one of two rails does.

| | Designing (Fit off) | Fit on |
| --- | --- | --- |
| Profiles, plates, feet, joints | Selected, moved, resized and joined as above | Selected, but neither moved nor resized; no joint markers |
| Peripherals | Drawn grey, as a reference: never outlined or picked, and a click goes to what is behind | Drawn as they are; mounted, swapped and removed |
| Toolbar of a selected plate or profile | Grow a profile, put a plate, add a foot, remove | Mount a seat, a wheel base, pedals, a shifter, a handbrake, a center or side stick or a throttle, as a preview with handles |
| A seat about to be mounted on a profile | — | Goes between it and the nearest profile it can, centered; its panel chooses that second profile under **Between**, among those it can go between, or none, and lists ✓ or ⚠ for each hole over a slot, so rails apart by other than its holes show before it is mounted. In the view, the other profiles it can go between are wrapped in faint blue, and a click on one makes it the second; hovering any other profile names it with why it cannot be, and a click on it says so |
| Toolbar of a selected peripheral, and the Delete key | — | Delete its step, as if it had never been mounted: nothing hangs from a peripheral, so it is never removed from the marker on |
| Inspector of a selected attached part | Its values | Its adjustment: axis and travel, and for a peripheral on a plate whether it runs on its own rails or in slots of the plate; a peripheral's type and own values |
| Handles | Move, end and edge handles | One arrow along the selected part's travel, kept within it, on a bar from end to end with its center marked; a peripheral without an adjustment, its move handles |
| Driver | — | The figure on the seat, drawn over the parts; with nothing selected, the panel's stature, knee, hip and elbow angles, reach warnings and eye point |

Moving a part along its travel changes no part and no cut: it is saved with the design and undone with Ctrl+Z, but adds no step to the design history. The arrow moves it in steps of 10 mm, which Alt turns off, and lines up with nothing; its box shows the position from the center of the travel, waiting for ✓ as any other handle's change. The view, the joint markers and interference show every part where it is along its travel; the joints, connectors and parts to buy are those at the centers. The design checks also list what a part would reach at either end of its travel, saying which end.

Fitting with nothing selected, the panel is the driver's. The stature is typed in cm, from 140 to 210, and is an edit of the design that Ctrl+Z takes back. Each angle shows its value against its range with ✓ or ⚠ and words; legs that do not reach the pedals, or arms the wheel, are warned about, and a design without a seat or pedals says what to mount. The figure follows the parts along their travels.

## Modes and subassemblies

Subassemblies and modes came with stage 7 (see [mini-cad.md](mini-cad.md)). The view's toolbar chooses **All parts** or one of the design's modes, once the design has one; modes are added in the **Modes** panel. In a mode, the parts it takes off are not drawn or picked; selecting their step in the history draws them as a ghost, faint in the accent color, and the inspector says they are off in that mode. Every edit works the same in All parts and in a mode, except fitting: Fit needs a mode, so turning it on with All parts shows the first mode, and showing All parts turns it off. Moving a part along its travel changes the position of the mode shown, and a new mode starts at the positions of the mode shown.

**Make subassembly** in the inspector of a part, in Fit as well, makes it a root, named after the part; the root's inspector renames it in its Name field or ungroups it, and every part inside says which subassembly it is in. Each step that makes a part shows its subassembly in the history. The **Modes** panel, below the checks whenever the design has a subassembly, has a row for each subassembly and a column for each mode, each cell a box with ✓ when on; a nested subassembly's row is indented and its box disabled where its parent is off. Modes are renamed and deleted in its column headings.

## Drawing of a plate

**Drawing**, beside 3D, Top and Side, is offered while a plate is selected (stage 6). It replaces the view with the plate's drawing, seen from its face away from the profile with its depth up the page, and nothing in it is edited: to move a hole, edit what puts it there. Pointing at a hole names it below the drawing, with its kind, diameter and distances from the left and bottom edges, followed by each problem the design's checks find with it; a hole with a problem has a ⚠ beside it. Clicking a hole keeps its name shown. Choosing 3D, Top or Side, or selecting anything but a plate, goes back to the camera view. The holes are also drawn on the plate in the 3D views, as a reference.

## Keyboard

| Key | Result |
| --- | --- |
| Delete, with a step chosen in the design history (marked there) | **Delete this step**, as a timeline does |
| Delete, with a part of the frame picked in the view | **Remove this part**: a step that removes it from the history marker on |
| Delete, with a peripheral picked in the view, or a step that makes no part (a fastening, a join or a removal) | **Delete this step** |
| Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z | Undo and redo the edits of the session |
| Enter, with a part about to be added | Adds it, as ✓ in its box does |
| Escape | Closes a card, cancels a change waiting to be confirmed or a part about to be added, or stops measuring |

In a text field, these keys edit the text instead. Undo and redo show on an empty design only when there is something to undo or redo.
