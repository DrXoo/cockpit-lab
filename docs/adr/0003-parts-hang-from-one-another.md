---
status: accepted
---

# CAD parts hang from one another, without a constraint solver

In the CAD, a part of a cockpit design is either anchored or attached to exactly one other part: to one of its faces, at a distance from one of its ends. Attachments form trees, so moving or lengthening a part carries along everything that hangs from it, and the gesture of growing a profile out of another's face is kept as a relation, not only as a starting position. A profile whose other end meets the facing face of a second part is a span: its position comes from its attachment and its length from the gap to that second part, so moving either side has a single answer. Profiles stay aligned with the three axes and turn in steps of 90°, except that an anchored part can be locked at a tilt about X, and everything hanging from it is laid out in its tilted frame. Adjustable attachments, with a travel, are how the driver is fitted.

## Considered options

- **Absolute positions.** Simple to store, but lengthening a rail would leave the crossmember, the pedal deck and their brackets where they were, to be moved by hand.
- **A general constraint solver.** Any part could depend on several others, but solving can fail, give several answers or move parts the user did not touch, and it is a large piece of work to build and to test.
- **Free rotation from the start.** Diagonals and angled braces would be possible, but joints could no longer be found from touching faces and snapping becomes much harder. Steps of 30° and 45°, and tilting parts locked at an angle, can come later.

## Consequences

- A part never depends on itself: a span cannot reach a part that depends on it, and an attachment cannot create a loop.
- A span whose faces stop facing each other keeps its last length and reports an open end. It is not solved again.
- Creating a part never changes what other parts hang from; that only changes when the user asks.
- Tilting about X came forward from "later" because every base tilts its pedal deck, and the conversion from the parametric design must stay faithful. Only anchored parts take a tilt; a span cannot reach a part at another tilt. Steps of 30° and 45° and tilting about other axes are still for later.
