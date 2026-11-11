# Cockpit Lab

A static configurator for compact DIY cockpits for sim racing and VR flight. US English interface, dimensions in cm, part list in mm. It needs no external services or CDN. The state is saved locally in the browser, and can be exported as JSON/CSV or printed.

The model (geometry, anthropometric posture, checks and part list), the render model and Three.js scene, and the app shell live in separate TypeScript modules in `src/`; the [README](../README.md#project-structure) lists them. Three.js 0.186.1 is installed from npm, under the MIT license.

Verification: `npm test`, and `npm run test:e2e` for the interface and the 3D view.

An approximate design model: it does not validate loads, stiffness, holes, the full sweep of the arm or real access. Check the physical dimensions before building. E7 Pro reference: 140 × 80 × 2.5 cm desktop and a 63.5–128.5 cm frame; the exact version is still to be confirmed. The arm does not match a commercial product.

Free layout: the desk and the cockpit have independent X/Z positions and rotations; dragging in the plan, layout presets, a fixed area and migration of earlier designs. Reach and interference use the transforms of both items; intersections are checked with oriented volumes.

Desk: an editable arm mount on any of the four edges (clamp) or inside the desktop (grommet), a keyboard and a PC with position, rotation and size, a separate mouse and an XL desk mat of adjustable size. The Desk view lets you drag them on the desktop; the positions are local and are saved with earlier designs. Desktop bounds, overlapping items and mouse coverage are checked. The summary includes the position, footprint and rotation of each accessory.

Adjustable desktop: 120 to 200 cm wide and 60 to 80 cm deep, with presets and sizes in between. Dimensions, footprint, clamp, drag limits and summary use the current size. Resizing keeps the size of the accessories; those that fit are moved back onto it and those that stick out raise a warning. The reference legs stay 66 cm deep and are included in the floor footprint.

Articulated arm: two segments of fixed length (editable total and split), base rotation, elbow bend and VESA rotation. The automatic modes point at the cockpit or the desk and solve both elbow branches; manual mode keeps the joints. In Arrange, with the mount selected, the ELBOW and VESA points are dragged in the plan. The end respects the maximum reach and the minimum fold. Direct buttons bring the monitor back to the cockpit or the desk. Saving and the summary include the angles and lengths. The physical stops and the own height adjustment of commercial arms are not simulated.

Shifter and handbrake: on the driver's right by default, with an explicit side selector. Looking towards +Z, the driver's right is −X. Geometry, footprint, interference and the gap to the HOTAS use the same reference; the summary and JSON store the choice. The HOTAS is a joystick on the driver's right and a throttle on the left.

Cockpit lift: **Cockpit → Aluminium base → Base lift** adds 0 to 50 cm to the whole rig: chassis, seat, driver, wheel, pedals and controls. It keeps the posture and relative distances; the desk, the monitor and the supports on the floor keep their height. The posture controls, the side view dimensions and the summaries show final heights from the floor. The axis of the base profile is at `10 + baseLift` cm; its underside at `6 + baseLift` cm.

The optional `baseLift` field is saved in cm in the current JSON; earlier files use 0 cm. The individual heights saved keep their original reference, and the conversion to a height from the floor is explicit. The lift is kept when the preset changes. Four 40 × 40 profile extensions defined in the model, on top of the original supports, feed the scene, envelopes and part list; their length is the lift. The joints of those extensions and their bracing are still to be designed, and their fasteners are not included in the current estimates. The strength of a raised base is not validated. Interference with the desk and furniture is checked again at the new height, with the existing 0.1 cm tolerance: contact within that tolerance is not interference.

## Room

The **Room** tab sets the inside dimensions of a rectangular room, its height and its doors and windows; the **Furniture** tab adds furniture. The walls are named AB, BC, CD and DA, clockwise from the top left corner of the plan. Each door or window is placed by its wall, its distance from the starting corner and its width.

- Doors: width, height, hinge at the start or end, opening inwards or outwards and an angle of 0–180°. The check covers the swing from closed to the configured angle, in sectors of up to 2°.
- Windows: width, height, sill and access clearance in front. The window sashes are not simulated.
- Furniture: bookcase, wardrobe, bed, drawer unit or a generic volume; width, depth, height, position and rotation. They can be dragged in the plan, like the desk and the cockpit.
- Furniture outside the bounds, overlapping furniture, interference with the setup and obstructed doors are detected. The side clearance checks a free band, not a continuous way in or an escape route.
- The room editor shows positions relative to walls DA and AB; the data is saved in the app's shared coordinates. Changing the origin moves the walls, not the items. **Center the desk and cockpit** moves both, keeping their relation.

The data is saved in the browser and in the exported JSON files. Earlier files remain compatible; loading them adds a room without openings or furniture. The model is approximate and does not calculate loads, strength, hardware details or precise collisions of real parts.

Verification: `npm test` and `npm run test:e2e`, which cover creating, editing, dragging, saving and the summary.

### Office chair

**Furniture → ＋ Office chair** adds a 65 × 65 cm chair on casters, 115 cm tall overall with the seat at 47 cm, placed in front of the desk and facing it. It can be dragged and turned on its own; **Place in front of the desk** lines it up again after the desk moves. Its dimensions can be adjusted to the real chair.

The chair's collisions tell apart the base, seat, backrest and armrests, so that it can sit partly under the desktop when the heights allow it. The configurable rear band keeps space to push it back, and you are warned if it reaches a wall or another item. It is an approximate rectangular clearance, not a simulation of a person moving. The chair and its clearance are included in the JSON and the summary.
