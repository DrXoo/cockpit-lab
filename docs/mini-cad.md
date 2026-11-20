# Cockpit mini CAD: scope and stages

## Goal

Design a compact sim racing and flight cockpit from editable parts: profiles, connectors, plates and peripherals with their own dimensions. The model must let you see the assembly, review interference and produce a traceable list of parts to buy and dimensioned drawings.

The CAD is the cockpit editor and the heart of the product: it edits the cockpit design on its own, and the room places that design in each layout (see [ADR 0001](adr/0001-room-links-to-the-project-cockpit-design.md)). Until the mini CAD is complete, from the frame to the seat and the controls, a room cannot include the cockpit design ([ADR 0004](adr/0004-retire-the-parametric-cockpit-without-converting-it.md)). The room needs two things from it: the volumes of its parts, named, for interference, and the driver's eye point. The CAD adds precision to the set of parts; geometric checks do not certify loads, stiffness or structural safety.

The terms used here (part, attachment, span, joint, connector, adjustment, contact point and others) are defined in [CONTEXT.md](../CONTEXT.md).

## How a design is built

A cockpit design is its design history: the ordered list of operations that builds it ([ADR 0005](adr/0005-a-cockpit-design-is-its-design-history.md)). A new design starts empty, and its first operation adds an anchored profile. Moving the history marker back shows the design at that step, and operations added there go in at that point; changing an earlier operation replays everything after it. An operation that no longer applies is marked as failed and kept, adding nothing, and the operations that depend on it fail too. Editing a part's size, position or name changes the operation that made it. Removing a part is an operation: from then on its children are anchored where they are and a span that reached it keeps its length with an open end. Deleting an operation takes what it made out of the whole history. Undo and redo step through the edits of the open session and are not saved.

## How parts are placed

A part is either anchored, placed on its own, or attached to exactly one other part: to one of its faces, at a distance from one of its ends. Moving or lengthening a part carries along everything attached to it. A new profile grows out of a face of another, perpendicular or parallel to it. A span is a profile whose far end meets the facing face of a second part: its position comes from its attachment and its length from the gap. There is no constraint solver; see [ADR 0003](adr/0003-parts-hang-from-one-another.md).

Profiles stay aligned with the three axes and turn in steps of 90°. An anchored part, such as the pedal deck, can be locked at a tilt about X, and the parts hanging from it follow that tilt. Steps of 30° and 45°, and tilting about other axes, come later.

Every attachment and each end of a span make a joint, unresolved until it has connectors. A connector, such as a 40 corner bracket, belongs to its joint and sits on one side of the joint's corner; it takes part in interference and in the parts to buy, with the bolts and T-nuts its type needs. Those fasteners are counted, not placed one by one.

## The driver in the CAD

Peripherals carry contact points: the hip and backrest on the seat, the hands on the wheel and grips, the heels on the pedals. The driver's posture, and so the eye point, follow from where the design mounts them. An attachment can be an adjustment, with a travel, such as a seat on its rails or a wheel plate on T-nuts in its profiles' slots; the editor shows the design's adjustments, and anything else about the posture changes by editing parts.

A design is replayed with every part at the center of its travel, and the fitted pose then moves each adjusted part, and what hangs from it, to its position (`src/cockpit/cad/history/travel.ts`). The design at the centers is what is built and bought: joints, connectors, cuts, parts to buy, the checks of every step, the drafts' parents and snapping. The fitted pose is what the driver sits in: the drawing, the handles, the joint markers' positions, measuring and interference. A new consumer of the geometry picks one of the two for that reason.

A peripheral mounted on a plate puts its mounting pattern into the plate as holes that follow it, or slots that cover its travel when its adjustment runs in slots of the plate rather than on its own rails; each bolt that fastens the plate to a profile puts a hole there too. A plate has no holes of its own ([ADR 0006](adr/0006-a-plate-has-only-derived-holes.md)).

## Catalog

The first profile system is Motedis series 40, I-type, slot 8: [40 × 40L](https://www.motedis.es/en/Profile-40x40L-I-Type-slot-8), [40 × 80L](https://www.motedis.es/en/Profile-40x80L-I-type-slot-8) and [40 × 120L](https://www.motedis.es/en/Profile-40x120L-I-Type-slot-8), with a 40 corner bracket with two M8 bolts per leg. Connectors and fasteners must match the profile system and the slot width. Each catalog dimension says whether it comes from a data sheet or was measured. Other systems can be added later.

## Data model

All CAD dimensions are stored in mm. Each part has a stable identifier and a name, which is the user's data like a furniture name; interference and warnings name the part by it. Mounting references are expressed relative to the part that contains them and keep their identity when the assembly moves.

| Entity | Main data |
| --- | --- |
| Profile system | Supplier, series, slot, sections, connectors that fit and data sources |
| Profile | Name, system and section, length, attachment or anchor, machining |
| Plate | Name, outline, sheet, fabrication process, attachment; its holes and slots are derived |
| Peripheral | Name, envelope, mounting pattern, contact points, travel, data source |
| Foot | Leveling foot or caster under a profile |
| Joint | The two parts and faces it joins, and its connectors |
| Connector | Catalog type, side of the joint's corner; fasteners from its type |
| Adjustment | The attachment it moves, and its travel |
| Subassembly | Name and root part; its parts are what hangs from the root |
| Mode | Name, the subassemblies it takes off, the position of each adjustment |

The parts to buy group profiles by cut, a section and system at one length, and list the names of the parts under each. The domain model is the source of dimensions, exports and quantities; the 3D scene is a view of the model.

The code is TypeScript; interface and geometry libraries will be chosen in a separate technical stage. Three.js keeps drawing the scene. A 2D library can produce plate drawings; a full CAD kernel for STEP will be evaluated when that interoperability is needed.

## The retired parametric cockpit

The earlier configurator described a cockpit by its main dimensions. Stage 1 converted it into parts as a read-only view; [ADR 0004](adr/0004-retire-the-parametric-cockpit-without-converting-it.md) retired it instead of migrating it, and stage 2 deleted it with its conversion. Project files that hold one open with their room only; the cockpit is designed again from parts.

## Stages and acceptance criteria

What each finished stage and slice did, and the decisions made while building it, is recorded in [mini-cad-log.md](mini-cad-log.md).

### 1. Parts model, catalog and conversion, read only

The parts model in mm with attachments, spans, joints, connectors, feet, peripherals with mounting patterns and contact points, and adjustments; the first catalog. A pure conversion from the parametric design, drawn by the cockpit editor in place of today's drawing. The posture comes from the contact points, and the Posture tab shows the adjustments, which still write the parametric settings. The parts to buy come from cuts and resolved joints. Interference is checked per part, with the room and within the cockpit itself, and unsupported parts are reported. The project file does not change.

Acceptance: the four bases and the end-to-end fixtures convert to the same profile lengths and counts as the parametric cut list, and to the same posture checks. Reference case: a 200 × 150 × 5 mm plate with four 6.5 mm diameter holes at (−60, −40), (60, −40), (60, 40) and (−60, 40), relative to its center; a peripheral's pattern must match those points when it is mounted. These dimensions are a test case, not a manufacturer's pattern.

### 2. Profile editor on a design history

Built in slices, each usable in the browser when it lands:

1. **Make room.** Delete the parametric cockpit: its settings, bases, conversion, rig drawing and the Frame and Posture tabs. Format v5 stores the room as v4 does and the cockpit design as its design history in mm; the first save over a v4 project first copies it aside, untouched. v1 to v4 files open with their room only, with a message; cockpit files move to version 2 and version 1 is rejected. A room cannot include the cockpit. The cockpit editor opens empty.
2. **Minimal history.** The anchored profile operation, replaying the history, drawing its profiles, selecting a part in the view or in the history, and an inspector to edit its name, section, length and position with numbers. Undo and redo (Ctrl+Z, Ctrl+Y) of the session's edits.
3. **Grow out of a face.** Click a face of the selected profile and set, with a preview, the section, perpendicular or parallel and which way, the length, the distance from either end, the offset across the face and the turn of the section. Perpendicular first, then parallel.
4. **Reach a face.** Make the selected profile a span to the facing face of another part, and detach its end again, keeping its length.
5. **The whole history.** The history marker to step back and insert, removing a part, deleting an operation, and failed operations marked with text and a symbol.
6. **Assembly.** Join two parts that only touch, add and remove connectors at each joint (a new joint has none; a quick action puts two corner brackets along the part it meets), feet under profiles, the checks (interference, unsupported parts, pending joints, failed operations) and the parts to buy.
7. **Measure.** The selected part shows its length in the view; a measure tool gives the gap between two facing faces, or the X, Y and Z offsets between two clicked points. Measurements are not saved.

The editor shows the history on the left, the view with its tools in the middle (3D, top and side, all of them for picking) and the inspector with the checks and the parts to buy on the right. Editing needs a wide screen; on a phone the design can be looked at.

Acceptance: replaying a saved history gives the same parts, identifiers and dimensions; undo and redo restore the same identifiers and values; removing parts and deleting operations with parts that depend on them is covered by tests of each case (children re-anchored, spans left open, joints and connectors gone, dependent operations failed, independent ones kept). The A–B–C case: B grows out of A and reaches C, and moving C changes B's length.

Plates, the seat and the driver, the wheel, the pedals and the other peripherals come in the following stages. When the mini CAD is complete, the room can include the cockpit design again.

### 3. Plates on profiles

Planned in November 2026: a plate is a plain rectangle that rests on profiles and is bolted to them; its holes, slots and drawings wait for stage 6. Built in slices, each usable in the browser when it lands:

1. **A plate on a profile.** The `add-plate` operation rests a rectangular plate on a face of a profile: its name, width, depth, sheet, the face, the end its distance is measured from, the distance and the offset across the face, both to the plate's center, and which way its depth runs: along the profile or across the face. Its thickness stands out of the face, so the plate is on top of, under or beside the profile. The center may lie beyond the face, as a pedal plate's does between two rails, but the plate must rest on part of the face, or the operation fails. Sheets come from the catalog: aluminium at 3, 4, 5, 6, 8 and 10 mm, estimated until a supplier is verified; a new plate is 300 × 300 × 8 mm, 50 to 1500 mm a side. A plate hangs only from a profile, nothing hangs from it until peripherals come, and no span reaches it. **Put a plate on it**, in the inspector of a profile, shows it as a preview with a panel of its values, on the profile's top, or its front for an upright, centered on its length; a click on a face of the profile moves it there, measured from the nearer end. The inspector of a plate has no growing or feet. Plates are drawn, picked and measured like profiles, take part in interference (resting on a profile is contact) and in support, and the parts to buy list them grouped by size and sheet, as cuts are.
2. **Bolting a plate.** **Join** works between a plate and the profiles it touches. A new connector, a bolt with a T-nut of the profile system's slot, fastens a plate's joints: the user chooses how many bolts each slot the plate covers takes, and they are spaced evenly along where the plate touches the profile, on the slot's center line. A quick action puts two in each slot. The bolt's length follows the plate's thickness, rounded up to a stocked length, estimated like the bracket's fasteners. Bolt heads are drawn on the plate, and bolts and T-nuts count in the parts to buy. Their positions are where the plate's holes will come from in stage 6.

A plate is not drawn in 2D, has no holes, slots or rounded corners, and is not exported until stage 6.

### 4. Editing in the view

Planned in November 2026, before the peripherals, which need the same handles to slide a seat on its rails or place a wheel. Handles on the selected part change the values of its operation by dragging, with snapping to the parts around it, and the joints show their state in the view; [cockpit-editor-interactions.md](cockpit-editor-interactions.md) describes every gesture. Built in slices, each usable in the browser when it lands:

0. **Quick fixes.** Undo and redo show on an empty design only when there is something to undo or redo; Delete removes the selected part, or deletes a selected step that makes no part.
1. **Hovering.** The part under the pointer is outlined, or its face while a part is about to be added, with a label of its name and size.
2. **End handles.** Lengthen or shorten a profile from either free end, or symmetrically with Shift; the change waits as a preview with a box to type its value, ✓ and ✗; steps of 10 mm, which Alt turns off.
3. **Move handle.** Move an anchored part along the three axes, and a part that hangs from another along and across the face it hangs from, plates and feet included; edge handles change a plate's width and depth.
4. **Snapping to parts.** Flush with the faces and ends of other parts, centered on the parent, and reaching the facing face of another part, which makes the profile a span; with a guide.
5. **Joints in the view.** ⚠, ✓ and + markers, and a card with the quick actions of each joint.

In the top and side views, the move handle shows only the arrows in the plane of the view. On a tilted part, its handles follow the axes of its tilt.

### 5. Peripherals and adjustments

Planned in November 2026. Designing the frame and fitting it to the driver are kept apart: the cockpit editor gets a **Fit** mode, where peripherals are mounted, adjustments are defined and moved along their travel, and the driver is fitted, while the frame can be selected but not moved or resized. Out of Fit, peripherals are drawn grey and cannot be picked, as a reference only. [cockpit-editor-interactions.md](cockpit-editor-interactions.md) describes the gestures.

- **Peripherals.** A seat, a wheel base and pedals, each a generic type with estimated dimensions; named products come with the verified catalogs of stage 9, and shifters, handbrakes, sticks and HOTAS with stage 7. A peripheral hangs from a plate or a profile, its mounting face on any face of it, measured from its mounting origin with quarter turns about the face's normal, as a plate on a profile; it makes no joint and is supported by its parent. Mounting one copies its type's envelope, mounting pattern, contact points, backrest angle and rail travel into its operation, in mm, so a saved design never changes with the catalog. Swapping its type keeps where it is mounted and replaces those values, warning first when some were edited. It is drawn as simple shapes made from its envelope (a seat's base and backrest, a wheel base with its rim, pedals on a base), while interference uses the envelope.
- **Adjustments.** Any part with an attachment can have one, except a span: an axis of the face it hangs from, a travel centered where it is attached, and its position along it, stored with its operation. The seat comes with the travel of its rails. Moving a part along its travel carries what hangs from it and never moves the holes, slots or joints its attachment makes. A travel that would take the part off its parent at either end is refused, where a peripheral, which slides on its mounting, only has to stay over part of its parent's face; interference is checked at the part's position and at both ends of its travel, one adjustment at a time with the others where they are; a span that would change length when an adjustment moves a part it depends on is reported.
- **Driver.** The design stores the driver's stature, 175 cm unless changed; the proportions are the average ones of `anatomy.ts` and the torso follows the seat's backrest. In Fit, the driver is drawn as a simple figure on the seat's center plane, with the knee, hip and elbow angles against estimated GT ranges (knee 110–140°, hip 95–120°, elbow 90–130°) and warnings when legs or arms do not reach. The design works out the eye point and the editor shows it; the room's monitor arm aims at it once the room can include the cockpit design again (ADR 0004).
- **Format.** Version 5 grows, without a new version: an optional driver, a mount-peripheral operation and optional adjustments on the operations that attach parts. Designs saved before open unchanged.

Built in slices, each usable in the browser when it lands:

1. **Fit mode and mounting.** The Fit toggle; the three generic peripherals mounted from the view's toolbar as a preview with handles and snapping, removed again, drawn grey out of Fit; the frame locked in Fit; the format grows.
2. **The peripheral's inspector.** Its envelope, the holes of its mounting pattern, its contact points and backrest angle; swapping its type.
3. **Adjustments.** Defined on any attached part in Fit, the seat's by default; an arrow along the travel in the view with its center marked, and the position typed in the panel; the rules above.
4. **Checking the travel.** Interference at both ends of each travel, saying where.
5. **The driver.** The stature, the figure, the angles and the reach warnings, and the eye point.

### 6. Plate drawings and holes

Planned in November 2026: a plate gets its holes and slots, a drawing to check them against how it is made, and the files to have it cut or drilled. Nothing in the drawing is edited.

- **Holes.** A plate has only derived holes ([ADR 0006](adr/0006-a-plate-has-only-derived-holes.md)): a mounting hole for each hole of the mounting pattern of a peripheral mounted on it, and a fastening hole for each bolt of its joints to profiles. Each takes its diameter from what puts it there: the pattern's diameter is the hole cut in the plate, clearance included, and the plate bolt's type gets a clearance diameter in the catalog, 9 mm for M8 (ISO 273 medium series, estimated). Holes stay where the design puts its parts at the center of their travel, as fitting never moves them.
- **Slots.** A peripheral's adjustment runs either on its own rails, bolted to the plate, or in slots of the plate; a seat whose type has rails runs on them by default. In slots, each mounting hole becomes a slot along the adjustment's axis, as wide as the hole and as long as the travel plus the hole's diameter. A part that slides on T-nuts in a profile's slot, as a plate or a peripheral on a profile does, puts no slots anywhere.
- **Fabrication process.** A small catalog of processes, with estimated values and their source: laser or water-jet cutting, which cuts slots and wants at least the sheet's thickness between a hole and the edge or another hole; and drilling by hand, which cuts no slots and wants 1.5 diameters from a hole's center to the edge and more between holes. Each plate stores its process in its step, laser cutting by default.
- **Checks.** Listed with the design's checks and marked ⚠ in the drawing, never refusing an edit: a hole or slot outside the outline or crossing it; too close to the edge for the plate's process; overlapping or too close to another, with the distance; a slot the process cannot cut; and a mounting hole over the profile the plate rests on, where the bolt has no room for its nut, unless it is over one of the profile's slots, where it takes a T-nut (a slot must lie wholly over the profile's slot or wholly off the profile).
- **Drawing.** A **Drawing** view beside 3D, Top and Side, for a selected plate, replaces the 3D view with the plate seen from its face away from the profile, its depth up the page towards + on its axis, and an arrow saying which way that is on the cockpit, as the driver names it (↑ front, ↑ up): an asymmetric pattern on a plate turned over is mirrored. It is the same SVG the plate exports, with dimensions and each hole named after what puts it there, shown on hover or click. The inspector keeps showing the plate, with its process and the exports. Holes are drawn on the plate in the 3D views as well, as a reference.
- **Exports.** A DXF for a cutting shop: one file per plate, in mm, R12, with the outline as a closed polyline, each hole as a circle and each slot as a closed polyline of two lines and two arcs, nothing repeated, and no dimensions or text a shop might cut. An SVG at 1:1, to print and stick on the sheet as a drilling template, with dimensions, center marks, the orientation arrow, the side it is seen from and a 100 mm scale bar to check the print. The thickness, sheet, process and name go in the file name and on the SVG; quantities are in the parts to buy. A test reads the exported DXF back and checks that it rebuilds the plate's outline and holes with no duplicate entities; the app does not import DXF.
- **Format.** Version 5 grows, without a new version: how a peripheral's adjustment runs, and a plate's process. Designs saved before open unchanged, with laser cutting and seats on their rails.

Outlines other than a rectangle, drawn as straight segments with their lengths and turning angles, and holes of a plate's own come when a design needs them.

Built in slices, each usable in the browser when it lands:

1. **Holes and the Drawing view.** Mounting and fastening holes with their diameters, the bolt's clearance diameter in the catalog, drawn on the plate in 3D and in the Drawing view with dimensions, sources and the orientation arrow; the plate part's empty own holes go.
2. **Slots.** Rails or slots for a peripheral's adjustment, chosen in its inspector in Fit; slots in the drawing; the format grows.
3. **Process and checks.** The process catalog, a plate's process in its inspector, and the five checks in the design's checks and the drawing; the format grows.
4. **Exports.** The DXF and the SVG template, and the test that reads the DXF back.

### 7. Switching between racing and flight

Planned in November 2026: one design carries what racing and flight need, and modes say which of it is on the cockpit and how it is fitted. Like components in other CAD programs, the parts that come and go are grouped, but in the design's one history ([ADR 0007](adr/0007-subassemblies-and-modes-sit-beside-the-design-history.md)). This stage completes the mini CAD.

- **Peripherals for the hands.** A shifter, a handbrake, a center stick, a side stick and a throttle, generic types with estimated dimensions like those of stage 5; a HOTAS is a stick and a throttle mounted apart. Each carries a grip, and the hand that uses it is chosen on the peripheral, with a default from its type: the right for a stick, a shifter and a handbrake, the left for a throttle.
- **The driver's hands.** With a wheel on, both hands are on it, as now. Without one, each hand goes to its main grip, a stick or a throttle; a shifter or a handbrake only has its reach from the shoulder checked. Two main grips for the same hand are reported.
- **Subassemblies.** A part made the root of a subassembly, with a name, takes with it everything that hangs from it, now and later. The root hangs from a part outside or is anchored; subassemblies nest, a part belonging to the innermost one. A part outside that hangs from a subassembly, or a span that reaches one, is reported. Removing the root ends the subassembly from that step on; joints to the rest are undone while it is off, and their connectors are still bought.
- **Modes.** Any number, named by the user. Each says which subassemblies are taken off and where each adjustment is, so each has its own fitting; a new mode starts with everything on and the positions of the mode shown, and the first one with those stored in the operations. A design without modes has everything on, fitted as now. Interference, travel, support and the driver's reach are checked in the mode shown with only its parts on, and its checks say how many problems each other mode has; two subassemblies that overlap but are never on together are interchangeable, not interfering. Pending joints, failed operations, plate holes and the parts to buy belong to the whole design. A subassembly off in every mode is not reported. Moving a subassembly out of the way while it stays on the cockpit, by hinges, wheels on the profile or released brackets, needs hardware the catalog does not have and comes later.
- **Seeing a mode.** The view's toolbar chooses All parts or a mode. All parts shows the whole design, as built and bought, with no driver or reach checks; a mode hides what it takes off, and selecting a step whose part is off shows it as a ghost, its inspector saying so. The design is edited the same way in any of them; Fit needs a mode, and turning it on with All parts shows the first. The mode shown is saved with the design.
- **Managing them.** **Make subassembly** in a part's inspector; the root's inspector renames or ungroups it, without removing parts, and every part inside names its subassembly. Each step in the history is tagged with its subassembly. A **Modes** panel below the checks, whenever the design has subassemblies, lists them, nested ones indented, against the modes, each cell on ✓ or off, a nested one disabled where its parent is off; modes are renamed and deleted there.
- **Format.** Version 5 grows, without a new version: optional subassemblies, modes and the mode shown beside the history, the hand of a peripheral's grip, and the new types. Designs saved before open unchanged, with no modes.

Built in slices, each usable in the browser when it lands:

1. **Peripherals for the hands.** The five types with their grips, the hand in the inspector, drawn as simple shapes; the format grows.
2. **The driver's hands.** Hands on the main grips without a wheel, the reach of a shifter or handbrake, two grips for one hand.
3. **Subassemblies.** Making one, membership and nesting, the history's tags and the inspector, and the report of parts that depend on one; the format grows.
4. **Modes.** The toolbar's choice with All parts, the Modes panel, taken-off parts hidden and the ghost, the checks of each mode; the format grows.
5. **Fitting in each mode.** Each mode's adjustment positions, and Fit needing a mode.

After this stage the mini CAD is refined through real designs before the room takes it again.

### 8. The cockpit in the room

The room includes the cockpit design again ([ADR 0004](adr/0004-retire-the-parametric-cockpit-without-converting-it.md)): interference per named part with the room's items, and the monitor arm aimed at the eye point. The room shows the cockpit in one mode at a time, chosen while looking and the same in every layout, and its checks also report the modes not shown. Whether an arm pose remembers the mode it was recorded for is decided here.

### 9. Verified catalogs

Add verified device data sheets and other profile systems, and, where appropriate, import visual representations or CAD geometry from manufacturers. Tell measured references apart from approximations.

## Validation

Check transforms and units with known cases; dimensions and quantities as parts change; reference stability; migration and saving; undo/redo; hole alignment and exports. Review the complete flows in the browser and document the limitations of each collision detector or mounting rule.
