# Cockpit mini CAD: scope and stages

## Goal

Design a compact sim racing and flight cockpit from editable parts: profiles, connectors, plates and peripherals with their own dimensions. The model must let you see the assembly, review interference and produce a traceable part list and dimensioned drawings.

The current configurator's room, desk, monitor and posture provide the spatial context. The CAD adds precision to the set of parts; geometric checks do not certify loads, stiffness or structural safety.

## First version

- Straight profiles with a section, series/supplier, length, position and orientation.
- Explicit joints compatible with the profile series, recording brackets, nuts and bolts.
- Configurable generic peripherals: wheel base, rim, car and flight pedals, shifter, handbrake, HOTAS, seat and rails.
- Separate envelopes and mounting patterns, with a mounting origin and the diameter and position of each hole.
- Flat rectangular and simple polygonal plates, with thickness, through holes and adjustment slots.
- A 2D plate editor with dimensions, and a 3D view of the same model.
- Selection, move/rotate, duplicate, group, snapping to faces/references, undo/redo and numeric input.
- A versioned project file; a part/cut list and 2D export of plates as DXF/SVG.
- Text showing which dimensions are verified, which are assumed and which checks are pending.

Bent parts, complex machining, modeled threads, structural calculation and an exhaustive catalog of brands come later. The first version does not depend on having detailed visual models of every device.

## Data model

All CAD dimensions are stored in mm. Each part has a stable identifier and a local transform. Mounting references are expressed relative to the part that contains them and keep their identity when the assembly moves.

Proposed entities:

| Entity | Main data |
| --- | --- |
| Project | Version, units, parts, joints, groups and modes |
| Profile type | Supplier, series, section, faces, slots and references |
| Placed profile | Type, length, transform and machining |
| Peripheral | Visual envelope, travel, mounting pattern and measurement source |
| Plate | 2D outline, thickness, holes, slots and transform |
| Joint | Connected parts/references and specific fastening components |
| Group/mode | Assembly, position in use, removal or storage |

The domain model is the source of dimensions, exports and quantities. The 3D scene is a view of the model. Old saved files are migrated through an adapter, keeping the configurator import.

The choice of TypeScript, interface and geometry libraries will be made in a separate technical stage. Three.js can keep drawing the scene. A 2D library can produce plate drawings; a full CAD kernel for STEP will be evaluated when that interoperability is needed.

## Stages and acceptance criteria

### 0. Reproducible base

The current code on GitHub, documented development and check commands, existing tests passing and personal designs kept out of the repository. The state of this import.

### 1. Parts model and reference assembly

Create two profiles, one plate and one generic peripheral with editable dimensions. Moving the assembly keeps their relations. Saving and opening does not change the dimensions. Undo/redo restores the same identifiers and values.

Reference case: a 200 × 150 × 5 mm plate with four 6.5 mm diameter holes at (−60, −40), (60, −40), (60, 40) and (−60, 40), relative to its center. The peripheral's pattern must match those points when it is mounted. These dimensions are a test case, not a manufacturer's pattern.

### 2. Profile editor

Place, duplicate, orient and dimension profiles. Snap ends and faces without unintended overlaps. The part list lengths match the parts, including the difference between the outer width and the gap between side rails.

### 3. Plates and holes

Edit the outline, holes, arrays and slots in a 2D view. Validate features outside the outline, overlaps and minimum distances configured for the fabrication process. DXF/SVG files must rebuild the same dimensions when reopened, without duplicate cuts. The thickness and fabrication notes go with the drawing; a 2D DXF does not encode them by itself.

### 4. Joints and part list

Record connectors and hardware per real joint. Check slot/series compatibility, alignment and room to fit the fastener. The summary shows where each quantity comes from and flags joints still unresolved. Thread length and strength need component data, not visual rules.

### 5. Switching between racing and flight

Model interchangeable plates, wheel, side or center stick, throttle and shifter/handbrake. Save positions for use and storage and check their travel. An item hidden in one mode still exists in the project's physical inventory.

### 6. Integration and catalogs

Bring back the room, desk, chair, arm and posture; keep existing designs. Add verified device data sheets and, where appropriate, import visual representations or CAD geometry from manufacturers. Tell measured references apart from approximations.

## Validation

Check transforms and units with known cases; dimensions and quantities as parts change; reference stability; migration and saving; undo/redo; hole alignment and exports. Review the complete flows in the browser and document the limitations of each collision detector or mounting rule.
