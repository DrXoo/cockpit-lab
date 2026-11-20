---
status: accepted
---

# Subassemblies and modes sit beside the design history

A cockpit design is its design history (ADR 0005), but its subassemblies and modes are stored beside the history, not as operations in it, as the driver is. A subassembly is a name and the identifier of its root part, and the parts that belong to it are worked out from what hangs from the root. A mode is a name, the subassemblies it takes off and the position of each adjustment along its travel. The design also stores which mode is shown. None of them builds geometry: they say which parts are on and where adjusted parts sit, so replaying the history to a step has nothing to apply them to, and moving the history marker should not make modes come and go.

## Considered options

- **Operations in the history** (define a subassembly, add a mode). They would get the history marker, failure and replay for free, but they build nothing, and stepping the marker back would hide modes and subassemblies with no meaning in the design.
- **A design history of its own for each subassembly**, as components in Fusion 360. It would let a subassembly be reused in another design, which no stage needs, at the cost of nested histories, a marker for each, and replay and undo across them.

## Consequences

- A subassembly whose root is not there at the step shown, because its operation was deleted or the part removed, does not apply there; it is not a failed operation. A mode's position for an adjustment that no longer exists is ignored.
- An adjustment's position stored with its operation is the position in a design without modes, and the one a mode starts from when it has none of its own for that adjustment, as for an adjustment defined after the mode was made. The first mode copies the operations' positions.
- Reusing a subassembly in another design, if a design ever needs it, would mean exporting its root's operations and those after it that hang from it, a change this decision does not prevent.
