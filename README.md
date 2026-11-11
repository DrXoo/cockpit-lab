# Cockpit Lab

Cockpit Lab is a web app for designing a compact DIY cockpit built from aluminium profiles. You can switch between sim racing and VR flight, and check how the rig fits next to your desk and inside your room.

It runs entirely in your browser, with no accounts, servers or external services. Designs are saved locally and can be exported as JSON.

> **Status:** the configurator below works today. The project is being turned into a **mini CAD for profiles, peripherals and custom plates**: precise parts, joints, cut lists and plate drawings. The CAD editor isn't implemented yet. The UI is still in Spanish and is being migrated to US English.

## Getting started

Requires Git and Node.js 22.12 or later (Node.js 24 LTS recommended).

```sh
git clone https://github.com/DrXoo/cockpit-lab.git
cd cockpit-lab
npm run dev
```

Open <http://127.0.0.1:5173>. To use another port: `npm run dev -- --port 5174`.

Running the app needs no build step. The dev server serves `dist/` and doesn't reload automatically, so refresh the page after saving.

## Checks

Run `npm install` once to get the development tools (Prettier).

```sh
npm run check   # syntax and formatting check
npm run format  # format the code with Prettier
npm test        # automated tests (Node's built-in test runner)
```

The tests cover geometry, approximate ergonomics, the monitor arm, desk, room, doors, furniture, chair, project loading and the local server. UI changes also need a check in the browser.

## Features

- Presets: GT, flight, hybrid and minimum footprint.
- Guided setup (room, openings, furniture, desk and cockpit) that resumes where you left off.
- Dimensions and positions of the seat, wheel, pedals and side mounts.
- Cockpit base elevation from 0 to 50 cm, applied to the whole rig.
- Adjustable desk with PC, keyboard, mouse and XL mouse pad.
- Generic articulated monitor arm with desk, cockpit and VR positions.
- Rectangular room with doors, windows, furniture, wall shelves at a set mounting height, and an office chair.
- Built-in sliding-door wardrobes with a clearance zone kept free in front of them.
- 3D, plan, desk and side views, with drag-and-drop layout.
- Approximate geometric checks, a summary, and JSON/CSV export.

These checks are approximate. They don't validate loads, stiffness or structural safety, and the current cut list is indicative only. Verify real measurements before building anything.

## Project structure

| Path | Responsibility |
| --- | --- |
| `dist/index.html`, `dist/styles.css`, `dist/ui.css` | Markup and styles |
| `dist/app.js` | Controls, state and exports |
| `dist/project.js`, `dist/setup-editor.js`, `dist/project-summary.js` | Project format, guided setup and summary |
| `dist/model.js`, `dist/geometry.js` | Cockpit geometry, posture and calculations |
| `dist/room.js`, `dist/room-editor.js`, `dist/desk-editor.js` | Room, furniture and desk model and editors |
| `dist/scene.js` | Three.js rendering, with an SVG fallback |
| `dist/vendor/` | Three.js 0.186.1 and its MIT license |
| `tests/` | Automated tests |
| `scripts/` | Dev server and checks |
| `docs/` | Detailed documentation and the mini CAD plan |

Right now `dist/` holds the hand-written source and is served as is.

## Roadmap

1. **TypeScript migration.** Format the code, move the source to `src/` with Vite as dev server and build, and type it module by module. After that, `dist/` becomes build output.
2. **English UI.** Translate the interface and the documentation.
3. **Mini CAD.** A parts and joints model in mm with a versioned schema, profile editor, plates and holes, joints and bill of materials, and racing/flight modes. See [the staged plan](docs/mini-cad.md).

## Development principles

New code is written test-first (TDD), following Clean Code and pragmatic SOLID. Domain logic stays free of DOM and Three.js so it can be tested in Node. The full rules are in [AGENTS.md](AGENTS.md).

## Saved designs

Projects are stored in the browser's `localStorage` under `cockpit-lab-v2`, and can be exported and imported as JSON v2 with explicit units (cm). Older v1 files, and designs saved under `cockpit-lab-v1`, still load. See [guided setup and the save format](docs/creacion-guiada.md).

Browser storage is tied to the origin (host and port), so a design saved on one port doesn't appear on another. Export it to JSON to move it. Keep personal design files in `configuraciones-personales/`, which Git ignores.

## Documentation

These documents are still in Spanish and their translation is pending:

- [Current configurator](docs/configurador-actual.md): scope, conventions and limitations.
- [Guided setup](docs/creacion-guiada.md): setup steps and the v1 → v2 adapter.
- [Development](docs/desarrollo.md): starting point and workflow.
- [Mini CAD](docs/mini-cad.md): goals, data model and stages.

## License

Three.js and the components in `dist/vendor/` keep their [MIT license](dist/vendor/LICENSE). The project's own code doesn't have a license yet.
