---
status: accepted
---

# A plate has only derived holes

Every hole and slot of a plate is put there by something else and worked out each time the design history is replayed: a mounting hole for each hole of the mounting pattern of a peripheral mounted on it, a slot instead when that peripheral's adjustment runs in slots of the plate, and a fastening hole for each bolt that fastens the plate to a profile. None is stored with the plate, so each follows what puts it there: moving a peripheral moves its holes, and removing it takes them away. The diameter comes from the same source, the mounting pattern or the bolt's catalog type. A plate's drawing shows them and its exports cut them, but nothing in the drawing is edited.

## Considered options

- **Holes and slots of the plate's own, drawn in a 2D editor, beside the derived ones**, as the plan had it: for lightening, cable passes or a mounting the catalog lacks. No design needs one yet, and it would bring a 2D editor, hole arrays and a second kind of hole to keep apart from the derived ones.
- **Derived holes copied into the plate when a peripheral is mounted or a plate bolted**, then editable there. They could be enlarged by hand, but would stop following their peripheral or bolts the first time either moved, which is the edit the cockpit editor makes most.

## Consequences

- A plate step stores no holes. The empty `ownHoles` of a plate part goes.
- To change a hole, edit what puts it there: the peripheral's mounting pattern in its inspector, or the bolts of the plate's joint.
- Own holes, if a design ever needs them, are a format change: a new value of the plate's step or a new operation, kept apart from the derived holes in the drawing and the checks.
