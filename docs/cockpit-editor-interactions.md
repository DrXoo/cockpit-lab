# Cockpit editor: interactions in the view

How the mouse and keyboard edit a cockpit design in the view of the cockpit editor. Every edit made here changes the values of the operation that made the part, as the inspector does (see [mini-cad.md](mini-cad.md) and [ADR 0005](adr/0005-a-cockpit-design-is-its-design-history.md)); the view and the inspector are two ways to the same values.

## Terms

**Handle**: a control drawn on the selected part that is dragged to change one of its values along one axis.

## With nothing selected

| Gesture | Result |
| --- | --- |
| Drag in the 3D view | Orbits the camera |
| Drag in the top or side view | Pans the view |
| Click a part | Selects it |
| Hover a part | Outlines it; after half a second at rest, a label by the pointer names it with its size ("Left rail · 40 × 80 · 1200 mm") |

## With a part selected

| Handle | Where | Directions | While dragging, the view shows |
| --- | --- | --- | --- |
| Move | An arrow out of the center of the part for each axis it can move along, red for X, green for Y and blue for Z | An anchored part: the three axes. A part that hangs from another: along and across the face it hangs from, never out of it; a foot only along its profile | How far it moved |
| End | A ball at each free end of a profile, with one arrow along its length | Along the profile's length; with Shift, both ends move symmetrically | The change in length (+120 mm); with Shift, the total length |
| Edge | A ball at the middle of each edge of a plate | Across that edge, changing the plate's width or depth while the far edge stays; with Shift, both edges move symmetrically | The change in that side; with Shift, the whole width or depth |

A profile grown out of a face has an end handle only at its free end: the other end stays on its parent. A span has no end handles, as its length is the gap to the part it reaches. A profile's section and a plate's thickness come from the catalog, so no handle changes them. Dragging outside the handles orbits or pans, as with nothing selected.

## A part about to be added

A profile about to grow, or a plate about to rest on a profile, is shown as a preview with the handles it will have once added, which snap as any other handle does. Dragging one changes the preview at once, without a box: the panel of the new part shows its values, to type them exactly, and adds it or leaves it out. Clicking a face of the parent still moves the preview there. A profile whose end reaches a part as it is dragged is added as a span, and the panel can let its end go again.

While a part is placed on a profile, about to be added or moved by a handle, two dimensions along the profile measure from each of its ends to the part's center, whether dimensions are shown or not.

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

Clicking a marker opens a card beside it that names the two parts and the joint's state ("✓ 4 bolts, 2 in each slot"), with the quick action that fits it: **Two corner brackets**, **Two in each slot** with the bolts in each slot to type, or **Join to …** for parts that only touch. **More in the inspector** selects the part and shows its joints there, side by side. Escape or a click elsewhere closes the card without selecting anything.

## Hovering

The part under the pointer is outlined, and its label shows after half a second at rest; neither changes the selection, and neither shows while a handle is dragged. While a part is about to be added, or a change waits to be confirmed, the outline marks the face under the pointer, which is what a click there chooses.

## Keyboard

| Key | Result |
| --- | --- |
| Delete, with a part selected | **Remove this part**: a step that removes it from the history marker on |
| Delete, with a step that makes no part selected (a fastening, a join or a removal) | **Delete this step** |
| Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z | Undo and redo the edits of the session |
| Escape | Closes a card, cancels a change waiting to be confirmed or a part about to be added, or stops measuring |

In a text field, these keys edit the text instead. Undo and redo show on an empty design only when there is something to undo or redo.
