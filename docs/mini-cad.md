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

Peripherals carry contact points: the hip and backrest on the seat, the hands on the wheel and grips, the heels on the pedals. The driver's posture, and so the eye point, follow from where the design mounts them. An attachment can be an adjustment, with a travel, such as a seat on its rails or a wheel plate in its slots; the editor shows the design's adjustments, and anything else about the posture changes by editing parts.

A peripheral mounted on a plate puts its mounting pattern into the plate as holes that follow it, and slots that cover the travel of an adjustment. The plate can have holes and slots of its own as well.

## Catalog

The first profile system is Motedis series 40, I-type, slot 8: [40 × 40L](https://www.motedis.es/en/Profile-40x40L-I-Type-slot-8), [40 × 80L](https://www.motedis.es/en/Profile-40x80L-I-type-slot-8) and [40 × 120L](https://www.motedis.es/en/Profile-40x120L-I-Type-slot-8), with a 40 corner bracket with two M8 bolts per leg. Connectors and fasteners must match the profile system and the slot width. Each catalog dimension says whether it comes from a data sheet or was measured. Other systems can be added later.

## Data model

All CAD dimensions are stored in mm. Each part has a stable identifier and a name, which is the user's data like a furniture name; interference and warnings name the part by it. Mounting references are expressed relative to the part that contains them and keep their identity when the assembly moves.

| Entity | Main data |
| --- | --- |
| Profile system | Supplier, series, slot, sections, connectors that fit and data sources |
| Profile | Name, system and section, length, attachment or anchor, machining |
| Plate | Name, outline, thickness, own holes and slots, attachment |
| Peripheral | Name, envelope, mounting pattern, contact points, travel, data source |
| Foot | Leveling foot or caster under a profile |
| Joint | The two parts and faces it joins, and its connectors |
| Connector | Catalog type, side of the joint's corner; fasteners from its type |
| Adjustment | The attachment it moves, and its travel |
| Group/mode | Assembly, position in use, removal or storage |

The parts to buy group profiles by cut, a section and system at one length, and list the names of the parts under each. The domain model is the source of dimensions, exports and quantities; the 3D scene is a view of the model.

The code is TypeScript; interface and geometry libraries will be chosen in a separate technical stage. Three.js keeps drawing the scene. A 2D library can produce plate drawings; a full CAD kernel for STEP will be evaluated when that interoperability is needed.

## The retired parametric cockpit

The earlier configurator described a cockpit by its main dimensions. Stage 1 converted it into parts as a read-only view; [ADR 0004](adr/0004-retire-the-parametric-cockpit-without-converting-it.md) retired it instead of migrating it, and stage 2 deleted it with its conversion. Project files that hold one open with their room only; the cockpit is designed again from parts.

## Stages and acceptance criteria

### 1. Parts model, catalog and conversion, read only

The parts model in mm with attachments, spans, joints, connectors, feet, peripherals with mounting patterns and contact points, and adjustments; the first catalog. A pure conversion from the parametric design, drawn by the cockpit editor in place of today's drawing. The posture comes from the contact points, and the Posture tab shows the adjustments, which still write the parametric settings. The parts to buy come from cuts and resolved joints. Interference is checked per part, with the room and within the cockpit itself, and unsupported parts are reported. The project file does not change.

Acceptance: the four bases and the end-to-end fixtures convert to the same profile lengths and counts as the parametric cut list, and to the same posture checks. Reference case: a 200 × 150 × 5 mm plate with four 6.5 mm diameter holes at (−60, −40), (60, −40), (60, 40) and (−60, 40), relative to its center; a peripheral's pattern must match those points when it is mounted. These dimensions are a test case, not a manufacturer's pattern.

Done in November 2026 (`src/cad/`). The conversion puts two 40 corner brackets on every joint, and the feet, peripheral envelopes, bracket fasteners and adjustment travels are estimates from the drawing until real parts are chosen; each says so in its data source. Every base reports the parts its parametric drawing left crossing or unsupported, for stage 2 to fix.

### 2. Profile editor on a design history

Built in slices, each usable in the browser when it lands:

1. **Make room.** Delete the parametric cockpit: its settings, bases, conversion, rig drawing and the Frame and Posture tabs. Format v5 stores the room as v4 does and the cockpit design as its design history in mm; the first save over a v4 project first copies it aside, untouched. v1 to v4 files open with their room only, with a message; cockpit files move to version 2 and version 1 is rejected. A room cannot include the cockpit. The cockpit editor opens empty.
2. **Minimal history.** The anchored profile operation, replaying the history, drawing its profiles, selecting a part in the view or in the history, and an inspector to edit its name, section, length and position with numbers. Undo and redo (Ctrl+Z, Ctrl+Y) of the session's edits.
3. **Grow out of a face.** Click a face of the selected profile and set, with a preview, the section, perpendicular or parallel and which way, the length, the distance from either end, the offset across the face and the turn of the section. Perpendicular first, then parallel.
4. **Reach a face.** Make the selected profile a span to the facing face of another part, and detach its end again, keeping its length.
5. **The whole history.** The history marker to step back and insert, removing a part, deleting an operation, and failed operations marked with text and a symbol.
6. **Assembly.** Join two parts that only touch, add and remove connectors at each joint (a new joint has none; a quick action puts two corner brackets along the part it meets), feet under profiles, the checks (interference, unsupported parts, pending joints, failed operations) and the parts to buy.
7. **Measure.** The selected part shows its length in the view; a measure tool gives the gap between two facing faces, or the X, Y and Z offsets between two clicked points. Measurements are not saved.

Slice 1 was done in November 2026. The project file is v5 and the browser saves it under a new key, `cockpit-lab-v5`; the copy an earlier version saved stays under its own key, untouched, which is how the first save over a v4 project leaves it aside. A project has no cockpit design (`null`) until it gets one, from a cockpit file for now; an empty design is `{ "units": "mm", "history": [] }`, and a history with an operation this version doesn't know is rejected. The room settings that placed the cockpit in each layout, and the monitor position in front of it, were deleted with the parametric cockpit; older files are read without them. The side view and the driver went with the rig drawing, and the cut list export with the cuts; slice 2 brings back the views the editor needs, and slice 6 the parts to buy.

Slice 2 was done in November 2026 (`src/cad/history.ts`, `src/undo.ts`). The first kind of operation, `add-anchored-profile`, stores the values of the profile it makes: its name, profile system and section, the axis its length runs along, the axis of its section's long side, its length and its start, the center of the end with the lower coordinate. Each operation has its own identifier (`op-1`) and so does the part it makes (`part-1`); a stored history that repeats one, or holds a value a profile cannot have, is rejected. The project file stays v5: an earlier version rejects a history with this operation as unknown, as planned. A new profile is a 40 × 40, 500 mm long, lying on the floor front to back beside the parts the design has, named after its section and its step (“40 × 40 profile 2”). Lengths go from 10 to 3000 mm and starts stay within 3000 mm of the origin, which keeps mistyped values out of the design. Turning a profile to run along its section's long side turns the section with it, as a quarter turn would. The editor draws every section in any orientation, with one groove per slot on each long face, and shows the selected part in the accent color, with its step pressed in the history. The 3D, top and side views pick the part under a click; a click beside the parts clears the selection. Undo and redo keep the last 100 edits of the design and start again when another project or cockpit file opens. The checks of the design wait for joints and feet, in slice 6.

Slice 3 was done in November 2026. The `grow-profile` operation stores the part it grows from, the face, the end its distance is measured from (the start is the end with the lower coordinate), the distance, the offset across the face and the way it grows: `"out"`, perpendicular to the face, or a direction along it (`"+z"`), for a profile that lies on the face with its section resting there and runs that way from its place. A profile cannot lie towards the face it lies on; moved to a face across its way, it turns to lie along the part it grows from. Its own values are its name, section, the axis of its section's long side and its length; its position always comes from the part it grows from, so moving or lengthening that part carries it along. Out of an end face it grows from the center of the end and carries the profile on. A stored growth must come after the part it grows from and stay on that part's face: its distance can't be more than the part's length, nor its offset more than half the face. An edit that would leave a growth hanging off, such as shortening its parent too much, is refused with a message that names both parts, until slice 5 brings failed operations. **Grow a profile out of it**, in the inspector, shows the new profile as a preview: a click on a face of the selected part moves it there, measured from the nearer end and centered on the face, where the slot is; the panel sets the same values with numbers.

Slice 4 was done in November 2026. Making a profile a span edits the operation that made it: a `grow-profile` growing out of a face can store `reachesId`, the part whose facing face its free end meets, and its length is then the gap to that part. The part must be in front of the end, on its center line, at its tilt and at a gap a profile can have (10 to 3000 mm), and it cannot hang from the span, directly or through others; a stored span must reach a part of the design that doesn't. After every edit the operation records the length the span takes while it meets its part, so when the faces stop facing each other the span keeps its last length and its end is reported open, in the inspector and in the history, with a ⚠ as well as the color. Its length is not edited while it reaches a part; letting its end go keeps the length it had. A part cannot move so close to a span reaching it that the span would be shorter than a profile. In the A–B–C case, B grows out of A and reaches C, and moving C changes B's length (`tests/cad-spans.test.mjs`).

The editor shows the history on the left, the view with its tools in the middle (3D, top and side, all of them for picking) and the inspector with the checks and the parts to buy on the right. Editing needs a wide screen; on a phone the design can be looked at.

Acceptance: replaying a saved history gives the same parts, identifiers and dimensions; undo and redo restore the same identifiers and values; removing parts and deleting operations with parts that depend on them is covered by tests of each case (children re-anchored, spans left open, joints and connectors gone, dependent operations failed, independent ones kept). The A–B–C case: B grows out of A and reaches C, and moving C changes B's length.

Plates, the seat and the driver, the wheel, the pedals and the other peripherals come in the following stages. When the mini CAD is complete, the room can include the cockpit design again.

### 3. Plates and holes

Edit the outline, holes, arrays and slots in a 2D view, with the holes and slots that mounted peripherals put there. Validate features outside the outline, overlaps and minimum distances to the edge configured for the fabrication process. DXF/SVG files must rebuild the same dimensions when reopened, without duplicate cuts. The thickness and fabrication notes go with the drawing; a 2D DXF does not encode them by itself.

### 4. Peripherals and adjustments

Mount, swap and remove peripherals; edit their mounting patterns, contact points and the travel of adjustments, and check that the travel fits its slots or rails.

### 5. Switching between racing and flight

Model interchangeable plates, wheel, side or center stick, throttle and shifter/handbrake. Save positions for use and storage and check their travel. An item hidden in one mode still exists in the project's physical inventory.

### 6. Verified catalogs

Add verified device data sheets and other profile systems, and, where appropriate, import visual representations or CAD geometry from manufacturers. Tell measured references apart from approximations.

## Validation

Check transforms and units with known cases; dimensions and quantities as parts change; reference stability; migration and saving; undo/redo; hole alignment and exports. Review the complete flows in the browser and document the limitations of each collision detector or mounting rule.
