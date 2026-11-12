# Cockpit Lab

Cockpit Lab designs compact aluminium-profile cockpits for sim racing and flight, and checks how they fit in a real room.

## Language

**Project**:
Everything saved and opened together: a cockpit design, a room with its layouts, or both.
_Avoid_: workspace, session, save

**Cockpit file**:
A cockpit design exported on its own, without any room, to use it in another project.
_Avoid_: preset, template

### Cockpit

**Cockpit design**:
A cockpit defined on its own, with no knowledge of any room: its frame, seat, controls and posture.
_Avoid_: cockpit config, rig

**Parametric cockpit**:
A cockpit design described by its main dimensions, from which its parts are derived; the only kind of design until the CAD exists.
_Avoid_: simple cockpit, configurator cockpit

**Base**:
A ready-made starting point for a new cockpit design: GT, flight, hybrid or smallest footprint.
_Avoid_: preset (in the UI), template, default

**Driver**:
The body a cockpit design is made for: stature and posture. It is part of the design.
_Avoid_: user, player, pilot (also for flight, so one word covers both)

**Eye point**:
Where the driver's eyes are in a cockpit design, the only part of its posture that a room relies on.
_Avoid_: head position, view point

**Fixed monitor**:
A monitor mounted on the cockpit itself, as part of its design.
_Avoid_: monitor stand (when the desk arm is meant)

### Room

**Room**:
The space where things are arranged: its size, its doors and windows, the furniture in it and the desk.
_Avoid_: project (when the room is meant), scene

**Layout**:
One arrangement of a room: where each item is, and which furniture it leaves out.
_Avoid_: scenario, variant, version

**Placement**:
The position and rotation of one item in one layout.
_Avoid_: transform (outside the code), location

**Monitor arm**:
The articulated arm fixed to the desk that holds a monitor, part of the room.
_Avoid_: monitor mount, stand

**Arm pose**:
A named position of the monitor arm that the user records and goes back to.
_Avoid_: monitor mode, "bring to the cockpit", "bring to the desk"

**Interference**:
An overlap between two items beyond the contact tolerance, measured in cm; touching within the tolerance is contact, not interference.
_Avoid_: clash, collision (in the UI)

**Room setup**:
The guided first pass over a new room: its size, its doors and windows, its furniture and its desk.
_Avoid_: wizard, onboarding

## Relationships

- A **Project** has at most one **Cockpit design** and at most one **Room**. Either can be missing: a room without a cockpit and a cockpit without a room are both complete projects.
- When the project has a **Cockpit design**, every **Layout** of the room places that same design; comparing two designs takes two projects.
- Someone can design a cockpit and never create a room.
- There is one kind of **Cockpit design**. When the CAD arrives, every **Parametric cockpit** is converted once into parts with the same dimensions, and each **Base** becomes a starting point for a CAD design.
- A **Cockpit design** has exactly one **Driver**, and a **Cockpit file** carries it; whoever imports the file sees the cockpit as it was designed and adjusts the driver if needed.
- A **Room** links to a **Cockpit design** of the same **Project**; it does not hold its own copy, so a change to the design shows in the room.
- Exporting a **Project** takes everything in it. A **Cockpit file** takes only its cockpit design. Importing a cockpit file makes a copy of it the project's **Cockpit design**, replacing the one it had, and from then on the room links to that copy.
- A **Room** has one or more **Layouts**; a **Layout** gives each item of its room a **Placement**, including the linked cockpit.
- A **Cockpit design** is changed only where it is designed, never from the room; the **Room** only places it.
- An **Interference** between the cockpit and the room names the part of the cockpit, the item it reaches into and by how much, so the design can be fixed without the room in view.
- A **Room**'s **Monitor arm** can point the monitor at the **Eye point** of the linked **Cockpit design**; the room needs nothing else from the cockpit's posture.
- Each **Layout** has its own **Arm poses**, because a pose only makes sense with that layout's arm mount and cockpit **Placement**. Duplicating a layout copies its poses.
- A **Cockpit design** may carry a **Fixed monitor**; the **Monitor arm** stays part of the room either way.
- The **Room setup** does not design a cockpit. After it, the room has no cockpit until one is designed or imported from a **Cockpit file**.

## Example dialogue

> **Dev:** "If I lengthen the frame of a **Cockpit design**, do I have to update the **Room**?"
> **Domain expert:** "No. The room links to the design, so every **Layout** shows the longer frame at its own **Placement**, and the checks run again."
> **Dev:** "And if the longer frame now reaches into the desk?"
> **Domain expert:** "The **Interference** says which part of the cockpit, into what and by how many cm. You fix it in the design; the room never edits the cockpit."
> **Dev:** "Can I send that cockpit to a friend without my room?"
> **Domain expert:** "Export a **Cockpit file**. It carries the design and its **Driver**; in their project it replaces whatever cockpit they had."

## Flagged ambiguities

- "cockpit" was used both for the **Cockpit design** and for the cockpit standing in a room — resolved: the design is the cockpit; in a room it is the linked design at a **Placement**.
