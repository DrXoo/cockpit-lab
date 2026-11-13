---
status: accepted
---

# The room links to the project's cockpit design

A cockpit is designed without knowing where it will stand, and the mini CAD will be a tool of its own, so the cockpit design is no longer part of the room. A project holds at most one cockpit design and at most one room, and either can be missing. The room does not keep its own copy of the design: it links to the project's design and only gives it a placement in each layout. Editing the design therefore changes the cockpit in every layout at once, and the design is only edited where it is designed, never from the room.

The room includes the design only once the user adds it, with a button in the room, and can leave it out again; the design stays in the project either way. While it is included, every layout of the room places it, each at its own position. A room that never includes the design is as complete as one that does.

The link never leaves the project. Exporting a project writes the design, the room and its layouts together, so the file opens the same in any browser. A cockpit file carries one design on its own; importing it copies the design into the project, replacing the one it had, and the room links to that copy from then on.

## Considered options

- **The room holds a copy of the design, with a note of where it came from.** Every file would be self-contained, but a change made in the CAD would only reach the room after updating it by hand, which is the friction the split is meant to remove.
- **A link to a design kept elsewhere in the browser.** It breaks as soon as a room file moves to another browser or another person.
- **A workspace file with several designs and rooms.** It adds a concept that no use case needs yet.

## Consequences

- Comparing two cockpit designs in the same room takes two projects. If that becomes a real need, each layout could choose which design it places; its placement of the cockpit is already per layout.
- Because the room can't edit the design, an interference between the cockpit and the room has to name the cockpit part, the item it reaches into and the overlap in cm. That is the information needed to fix the design without the room in view.
- The room relies on one thing from the design's posture: the driver's eye point, at which the monitor arm can aim.
