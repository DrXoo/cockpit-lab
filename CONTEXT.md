# Cockpit Lab

Cockpit Lab designs compact aluminium-profile cockpits for sim racing and flight, and checks how they fit in a real room.

## Language

**Project**:
Everything saved and opened together: a cockpit design, a room with its layouts, or both.
_Avoid_: workspace, session, save

**Cockpit file**:
A cockpit design exported on its own, without any room, to use it in another project. It is how a design moves between projects; within a project, the room takes the design with a button.
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

### Cockpit parts

**Part**:
One physical piece of a cockpit design, with its own dimensions in mm: a profile, a plate or a peripheral.
_Avoid_: node, component, object

**Profile**:
A straight length of aluminium extrusion of one series and section, cut to a length.
_Avoid_: bar, beam, extrusion, rail (except for a profile's role, such as a side rail)

**Profile system**:
The family a profile belongs to, such as Motedis series 40, I-type, slot 8, which decides the connectors and fasteners that fit it.
_Avoid_: brand, standard, series (alone)

**Cut**:
A length of one profile section and system to cut; identical pieces are the same cut, whatever their names.
_Avoid_: piece, part (when the length to cut is meant)

**Attachment**:
Where a part hangs from another: a face of that part and a distance from one of its ends.
_Avoid_: placement (that is the room's), parent, snap

**Span**:
A profile whose two ends meet facing faces of two parts: it hangs from the first, and its length is the gap to the second.
_Avoid_: stretched profile, constraint

**Plate**:
A flat piece cut from sheet, with an outline, a thickness, holes and slots, that carries peripherals or joins profiles.
_Avoid_: panel, sheet, deck (except for a plate's role, such as the pedal deck)

**Peripheral**:
A device the driver sits in or uses, mounted on a cockpit design: a seat, wheel base, pedals, shifter, handbrake, HOTAS or stick.
_Avoid_: device, controller, accessory (accessories are on the desk)

**Mounting pattern**:
The holes a peripheral is bolted through, placed relative to its own mounting origin.
_Avoid_: hole pattern (for the plate's own holes), VESA (except for monitors)

**Contact point**:
Where the driver meets a peripheral: the hip and backrest on the seat, the hands on the wheel or grips, the heels on the pedals.
_Avoid_: reference point, target

**Foot**:
A leveling foot or locking caster under a profile, through which a cockpit design stands on the floor.
_Avoid_: leg, support, base (a base is a starting design)

**Joint**:
Where two parts of a cockpit design are fastened together; it is unresolved until it has connectors.
_Avoid_: connection, link, node

**Connector**:
A catalog piece that fastens the two parts of a **Joint**, such as a corner bracket, on one side of the joint's corner.
_Avoid_: acople, coupling, fitting

**Fastener**:
A bolt or T-nut a connector needs, counted from the connector's type rather than placed.
_Avoid_: hardware (for a single bolt), screw

**Adjustment**:
An **Attachment** with a travel, along which its part moves without changing any part, as a seat on its rails or a plate in its slots.
_Avoid_: slider, setting, degree of freedom

**Anchored part**:
A part placed on its own in the cockpit design, hanging from no other part.
_Avoid_: root, absolute part, fixed part

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
- A **Room** includes the project's **Cockpit design** only after the user adds it to the room, and can leave it out again without changing the design. While the room includes it, every **Layout** places that same design; comparing two designs takes two projects.
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
- The **Driver**'s posture, and so the **Eye point**, follow from the **Contact points** of the **Peripherals** where the design mounts them; the driver has no positions of its own.
- The **Driver** is fitted through the **Adjustments** of a cockpit design; anything else about the posture changes by editing **Parts**.
- A **Cockpit design** made in the CAD starts from one or more **Anchored parts**; every other **Part** has exactly one **Attachment**, to a part that is anchored or attached in turn.
- A **Span** takes its position from its **Attachment** and its length from the part it reaches. It never reaches a part that depends on it, so moving either part has one answer. If the faces stop facing each other, the span keeps its last length and reports the open end.
- A **Peripheral** mounted on a **Plate** puts its **Mounting pattern** into the plate as holes that follow it; with an **Adjustment** on the plate, they become slots that cover its travel. A plate can have holes and slots of its own as well.
- Every **Part** has a name, which is the user's data like a furniture name; interference and warnings name the part by it. The parts to buy group **Profiles** by **Cut** and list the names under each.
- Every **Attachment** and each end of a **Span** make a **Joint**. Parts that only touch make none until the user adds one. The parts to buy come from the resolved joints, and the unresolved ones are listed as pending.
- Every **Profile** belongs to one **Profile system**, and a **Connector** fits the profile systems its data sheet names. Catalog dimensions say whether they come from a data sheet or were measured.
- A **Joint** has zero or more **Connectors**; a connector belongs to exactly one joint and goes when the joint goes. Connectors take part in interference and in the parts to buy, with the **Fasteners** their type needs.
- A **Part** is supported when **Joints** connect it, through other parts, to one standing on **Feet**; an unsupported part is reported, not moved.
- Moving or lengthening a **Part** carries along every part attached to it, directly or through others. A part that only touches another, without hanging from it, does not move with it.
- The **Room setup** does not design a cockpit. After it, the room has no cockpit until the user adds the project's design to it, designing one first if there is none.
- A new **Project** starts from the cockpit or from the room, as the user chooses; the other can be added later.

## Example dialogue

> **Dev:** "If I lengthen the frame of a **Cockpit design**, do I have to update the **Room**?"
> **Domain expert:** "No. The room links to the design, so every **Layout** shows the longer frame at its own **Placement**, and the checks run again."
> **Dev:** "And if the longer frame now reaches into the desk?"
> **Domain expert:** "The **Interference** says which part of the cockpit, into what and by how many cm. You fix it in the design; the room never edits the cockpit."
> **Dev:** "Can I send that cockpit to a friend without my room?"
> **Domain expert:** "Export a **Cockpit file**. It carries the design and its **Driver**; in their project it replaces whatever cockpit they had."

## Flagged ambiguities

- "cockpit" was used both for the **Cockpit design** and for the cockpit standing in a room — resolved: the design is the cockpit; in a room it is the linked design at a **Placement**.
- "placement" was about to be used for where a **Part** sits in a cockpit design — resolved: **Placement** stays the room's word; a part has an **Attachment** or is an **Anchored part**.
