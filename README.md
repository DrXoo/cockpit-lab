# Cockpit Lab

Cockpit Lab is a web app for designing a compact DIY cockpit built from aluminium profiles. You can switch between sim racing and VR flight, and check how the rig fits next to your desk and inside your room.

It runs entirely in your browser, with no accounts, servers or external services. Designs are saved locally and can be exported as JSON.

> **Status:** the configurator below works today. The project is being turned into a **mini CAD for profiles, peripherals and custom plates**: precise parts, joints, cut lists and plate drawings. The CAD editor isn't implemented yet. The UI is still in Spanish and is being migrated to US English.

## Getting started

Requires Git and Node.js 22.18 or later (Node.js 24 LTS recommended). The tests run the TypeScript sources directly through Node's built-in type stripping.

```sh
git clone https://github.com/DrXoo/cockpit-lab.git
cd cockpit-lab
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. To use another port: `npm run dev -- --port 5174`. The [Vite](https://vite.dev) dev server reloads the page when you save a file.

To build a static version:

```sh
npm run build    # writes the app to dist/
npm run preview  # serves dist/ at http://127.0.0.1:4173
```

`dist/` is generated output and isn't committed. Any static file server can serve it, from any folder.

## Checks

```sh
npm run check   # type check (tsc), syntax and formatting
npm run format  # format the code with Prettier
npm test        # automated tests (Node's built-in test runner)
```

The tests cover geometry, approximate ergonomics, the monitor arm, desk, room, doors, furniture, chair, project loading and the cut list export. UI changes also need a check in the browser.

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
| `src/index.html`, `src/styles.css`, `src/ui.css` | Markup and styles |
| `src/app.ts` | Controls, state and exports |
| `src/project.ts`, `src/setup-editor.ts`, `src/project-summary.ts` | Project format, guided setup and summary |
| `src/cut-list-csv.ts` | Cut list CSV export |
| `src/model.ts`, `src/geometry.ts` | Cockpit geometry, posture and calculations |
| `src/room.ts`, `src/room-editor.ts`, `src/desk-editor.ts` | Room, furniture and desk model and editors |
| `src/scene.ts` | Three.js rendering, with an SVG fallback |
| `tests/` | Automated tests |
| `scripts/` | Project checks |
| `vite.config.js` | Dev server and build configuration |
| `docs/` | Detailed documentation and the mini CAD plan |

The source is TypeScript, type-checked by `tsc` but not compiled by it: Vite builds the app and Node runs the tests. Three.js 0.186.1 is installed from npm.

## Roadmap

1. **TypeScript migration.** Done so far: Prettier formatting, the move to `src/` with Vite, the rename to TypeScript, and strict typing of the domain modules (geometry, room, model, project, units). Next: the editors, the summary, the 3D scene and the app shell.
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

Three.js is distributed under the MIT license. The build ships it in `dist/licenses/three.txt`, because minification removes the license header from the bundle. The project's own code doesn't have a license yet.
