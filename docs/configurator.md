# Cockpit Lab

A static app to design compact DIY cockpits for sim racing and VR flight and to arrange the room they go in. US English interface, room dimensions in cm, cockpit designs in mm. It needs no external services or CDN. The state is saved locally in the browser, and can be exported as JSON or printed.

The model (geometry, the room and desk checks, and the cockpit parts model), the render model and Three.js scene, and the app shell live in separate TypeScript modules in `src/`; the [README](../README.md#project-structure) lists them. Three.js 0.186.1 is installed from npm, under the MIT license.

Verification: `npm test`, and `npm run test:e2e` for the interface and the 3D view.

Color theme: light or dark, following the system until the theme button in the header picks one. The choice is kept in the browser, not in the design or its files. The 3D view's background, grid and room floor follow the theme; the parts keep their colors. Printing always uses the light colors. The colors are tokens in `src/theme.css`, and a test keeps both themes at WCAG AA contrast.

An approximate design model: it does not validate loads, stiffness, holes, the full sweep of the arm or real access. Check the physical dimensions before building. E7 Pro reference: 140 × 80 × 2.5 cm desktop and a 63.5–128.5 cm frame; the exact version is still to be confirmed. The arm does not match a commercial product.

Cockpit and room editors: the switch at the top of the page opens one or the other. The **Cockpit** editor designs the cockpit on its own, with no room, desk or monitor around it. A design is its design history, built from parts (see [the mini CAD](mini-cad.md) and `docs/adr/0005-a-cockpit-design-is-its-design-history.md`). The parametric cockpit of the earlier configurator, with its bases and its Frame and Posture tabs, is retired: a new design starts empty. **Add a profile** adds an anchored profile to the design history, beside the parts the design has, and selects it. A part is selected by clicking it in the 3D, top or side view, or its step in the history; the inspector on the right edits its name, section, the axis it runs along, the side its section's long side faces, its length and its start, in mm, and each change rewrites the step that made the part. A value a profile cannot have is explained and not applied. **Grow a profile out of it**, in the inspector, previews a new profile perpendicular to a face of the selected one: click a face of that profile in the view, or choose the face, the end the distance is measured from, the distance and the offset across the face, then **Add the profile**; Cancel or Escape leaves the design as it was. A grown profile follows the part it grows out of when that part moves or changes length, and its inspector edits where it grows from instead of a position. **Undo** and **Redo**, or Ctrl+Z and Ctrl+Y outside a text field, step through the edits made since the project was opened; they are not saved. Until the mini CAD is complete, the room does not include the cockpit design (`docs/adr/0004-retire-the-parametric-cockpit-without-converting-it.md`). The **Room** editor arranges the room, its furniture and the desk.

Cockpit files: **Export cockpit file**, in the Cockpit editor, downloads the design on its own, without any room, to use it in another project; it appears once the project has a design. **Import cockpit file** makes the file's design the project's, replacing the one it had after a confirmation. The file is JSON with `app: "Cockpit Lab"`, `kind: "cockpit"`, `version: 2` and the design in `cockpit`, as `{ "units": "mm", "history": [...] }`. A file with another kind, other units or an operation this version doesn't know is rejected. Version 1 files held a parametric cockpit and are rejected with a message that says so. Open JSON opens projects only, and says where a cockpit file goes.

Free layout: the desk has its own X/Z position and rotation; dragging in the plan, a fixed area and migration of earlier designs. Reach and interference use its transform; intersections are checked with oriented volumes.

Each interference names the part that reaches in, the item it reaches into and the shortest way out: how many cm to move it up or down, or sideways in the plan, whichever is less. The desk's volumes are its desktop, columns and feet. The amount is rounded up to the mm, so a small overlap never reads as 0 cm. It describes the approximate volumes, not the real parts. Doors, windows and clearances name the whole item that blocks them ("Desk").

Desk: an editable arm mount on any of the four edges (clamp) or inside the desktop (grommet), a keyboard and a PC with position, rotation and size, a separate mouse and an XL desk mat of adjustable size. The Desk view lets you drag them on the desktop; the positions are local and are saved with earlier designs. Desktop bounds, overlapping items and mouse coverage are checked. The summary includes the position, footprint and rotation of each accessory.

Adjustable desktop: 120 to 200 cm wide and 60 to 80 cm deep, with presets and sizes in between. Dimensions, footprint, clamp, drag limits and summary use the current size. Resizing keeps the size of the accessories; those that fit are moved back onto it and those that stick out raise a warning. The reference legs stay 66 cm deep and are included in the floor footprint.

Articulated arm: two segments of fixed length (editable total and split), base rotation, elbow bend and VESA rotation. The automatic modes point at the desk or park the monitor for VR, and solve both elbow branches; manual mode keeps the joints. In Arrange, with the mount selected, the ELBOW and VESA points are dragged in the plan. The end respects the maximum reach and the minimum fold. Saving and the summary include the angles and lengths.

Arm poses: in **Desk → Monitor and arm**, **Monitor position** lists the layout's saved poses first, then the automatic positions (on the desk, VR parked). A monitor that faced the retired parametric cockpit opens on the desk. **Save as new pose** records the arm as it stands under a name, whichever position placed it: base rotation, elbow bend, VESA rotation and height. The arm then holds that pose in manual mode, without moving, and the pose is chosen. Choosing a saved pose puts the arm back in those joints without working the angles out again, so it returns exactly where it was. After the arm moves, the pose stays chosen and reads "changed"; **Update pose** records the arm into it again, keeping its name, and **Delete pose** removes it. Joints that match no pose read "Custom (not saved)". Saving under an existing name, ignoring case, updates that pose. Each layout keeps up to 12 poses of its own, and a duplicated layout starts with a copy of them. A pose keeps where the arm was mounted; if the mount has moved since, the pose says so, because the same joints then put the monitor somewhere else.

## Room

The **Room** tab sets the inside dimensions of a rectangular room, its height and its doors and windows; the **Furniture** tab adds furniture. The walls are named AB, BC, CD and DA, clockwise from the top left corner of the plan. Each door or window is placed by its wall, its distance from the starting corner and its width.

- Doors: width, height, hinge at the start or end, opening inwards or outwards and an angle of 0–180°. The check covers the swing from closed to the configured angle, in sectors of up to 2°.
- Windows: width, height, sill and access clearance in front. The window sashes are not simulated.
- Furniture: bookcase, wardrobe, bed, drawer unit or a generic volume; width, depth, height, position and rotation. They can be dragged in the plan, like the desk.
- Furniture outside the bounds, overlapping furniture, interference with the setup and obstructed doors are detected. The side clearance checks a free band, not a continuous way in or an escape route.
- The room editor shows positions relative to walls DA and AB; the data is saved in the app's shared coordinates. Changing the origin moves the walls, not the items. **Center the desk** moves it, with everything on it, to the middle of the room.

The data is saved in the browser and in the exported JSON files. Earlier files remain compatible; loading them adds a room without openings or furniture. The model is approximate and does not calculate loads, strength, hardware details or precise collisions of real parts.

Verification: `npm test` and `npm run test:e2e`, which cover creating, editing, dragging, saving and the summary.

### Office chair

**Furniture → ＋ Office chair** adds a 65 × 65 cm chair on casters, 115 cm tall overall with the seat at 47 cm, placed in front of the desk and facing it. It can be dragged and turned on its own; **Place in front of the desk** lines it up again after the desk moves. Its dimensions can be adjusted to the real chair.

The chair's collisions tell apart the base, seat, backrest and armrests, so that it can sit partly under the desktop when the heights allow it. The configurable rear band keeps space to push it back, and you are warned if it reaches a wall or another item. It is an approximate rectangular clearance, not a simulation of a person moving. The chair and its clearance are included in the JSON and the summary.
