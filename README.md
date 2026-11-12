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
npm test        # unit tests (Node's built-in test runner)
npm run test:e2e  # end-to-end tests in Chrome (Playwright)
npm run test:e2e:stress  # the screenshot tests, repeated under load, failures grouped by kind
```

The end-to-end tests drive the real app in your installed Chrome: guided setup, opening and saving projects, presets, views and the summary. They also compare each view's rendering and the text of the panels with reference copies. Those references live in `e2e/__screenshots__/` and are not committed: the first run on a machine creates them, so create them before changing anything you want to check. After an intended change, review the differences and accept them with `npx playwright test --update-snapshots`.

The tests run as two Playwright projects. `functional` drives the app and checks its state, on every worker. `visual` compares screenshots (`page-appearance`, `rendering` and `theme`) on three workers at most, because screenshots render WebGL in software and time out when they all compete for the CPU. `npm run test:e2e:stress` repeats the visual tests four times under load and lists every failure grouped by kind (screenshot differs, never stable, test or assertion timeout), with the diff images, in `e2e-stress-results/`. Run it before committing a new or changed screenshot test: a flaky screenshot shows up there instead of weeks later. Arguments replace the default selection, for example `npm run test:e2e:stress -- --project=functional --repeat-each=2`.

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
- Several layouts of the same room, to try another arrangement and compare it with the one you started from. Furniture can be left out of a single layout.
- Approximate geometric checks, a summary, and JSON/CSV export.

These checks are approximate. They don't validate loads, stiffness or structural safety, and the current cut list is indicative only. Verify real measurements before building anything.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/index.html`, `src/styles.css`, `src/ui.css` | Markup and styles |
| `src/app.ts` | DOM wiring: events, panels and exports |
| `src/dom-input.ts`, `src/setting-change.ts` | Validating what the panels send, and applying a setting change |
| `src/project.ts`, `src/project-storage.ts` | Project format and autosave |
| `src/layouts.ts`, `src/layouts-view.ts` | Layouts: what each arrangement of the room places, what they share, and the layout picker |
| `src/user-text.ts` | Cleaning names typed by users |
| `src/setup-editor.ts`, `src/setup-actions.ts` | Guided setup steps and rules |
| `src/room-actions.ts` | Adding, editing, deleting and placing room items |
| `src/controls-view.ts`, `src/settings-panels.ts` | Setting controls and the rig, posture and desk panels |
| `src/project-summary.ts`, `src/inspector-view.ts`, `src/check-view.ts`, `src/html.ts` | Summary, validation banner, metrics and checks |
| `src/cut-list-csv.ts` | Cut list CSV export |
| `src/model.ts` | Public entry point of the configurator model |
| `src/config.ts` | Settings, ranges, defaults, presets and validation |
| `src/evaluate.ts` | Envelopes, interferences and checks for a configuration |
| `src/interference.ts` | How far two volumes overlap and which part reaches into which item |
| `src/rig.ts`, `src/layout.ts`, `src/desk.ts`, `src/monitor-arm.ts`, `src/anatomy.ts` | Cockpit rig, placement, desk, monitor arm and seated posture |
| `src/arm-poses.ts` | Saved arm poses: recording, going back to and validating them |
| `src/cockpit-design.ts` | Which settings make up the cockpit design, kept apart from the room |
| `src/parts.ts`, `src/field-spec.ts` | Bill of materials and per-setting ranges |
| `src/geometry.ts`, `src/units.ts`, `src/checks.ts` | Plan geometry, cm/mm units and the check type |
| `src/room.ts`, `src/room-editor.ts`, `src/desk-editor.ts` | Room, furniture and desk model and editors |
| `src/scene.ts` | Three.js scene, labels and interaction, with an SVG fallback |
| `src/render-model.ts`, `src/render-list.ts` | Render model: what the scene draws, as plain data in drawing order |
| `src/render-rig.ts`, `src/render-desk.ts`, `src/render-room.ts`, `src/render-profile.ts` | Drawings of the rig, desk and monitor, room and aluminium profiles |
| `src/render-annotations.ts` | Measurements, labels and the selection outline |
| `src/three-adapter.ts` | Turns the render model into Three.js objects |
| `src/scene-camera.ts`, `src/layout-picking.ts` | Camera framing for each view, and what a drag in the plan grabs |
| `tests/` | Unit tests |
| `e2e/` | End-to-end tests and the project files they use |
| `scripts/` | Project checks |
| `vite.config.js` | Dev server and build configuration |
| `docs/` | Detailed documentation and the mini CAD plan |

The source is strict TypeScript, type-checked by `tsc` but not compiled by it: Vite builds the app and Node runs the tests. Three.js 0.186.1 is installed from npm.

## Roadmap

1. **Mini CAD.** A parts and joints model in mm with a versioned schema, profile editor, plates and holes, joints and bill of materials, and racing/flight modes. See [the staged plan](docs/mini-cad.md).

## Development principles

New code is written test-first (TDD), following Clean Code and pragmatic SOLID. Domain logic stays free of DOM and Three.js so it can be tested in Node. The full rules are in [AGENTS.md](AGENTS.md).

## Saved designs

Projects are stored in the browser's `localStorage` under `cockpit-lab-v4`, and can be exported and imported as JSON v4 with explicit units (cm). A v4 file keeps the cockpit design apart from the room and its layouts. Older v1, v2 and v3 files, and designs saved under `cockpit-lab-v1`, `cockpit-lab-v2` or `cockpit-lab-v3`, still load and are left as they were. A saved design that can't be read is kept under a key of its own instead of being overwritten, and the app offers it for download. See [guided setup and the save format](docs/guided-setup.md).

Browser storage is tied to the origin (host and port), so a design saved on one port doesn't appear on another. Export it to JSON to move it. Keep personal design files in `configuraciones-personales/`, which Git ignores.

## Documentation

- [Glossary](CONTEXT.md): the domain terms (project, cockpit design, room, layout, placement) and how they relate.
- [Current configurator](docs/configurator.md): scope, conventions and limitations.
- [Guided setup](docs/guided-setup.md): setup steps, the save format and the adapters for older files.
- [Layouts](docs/layouts.md): what each layout stores, what is shared and the file format.
- [Development](docs/development.md): starting point and workflow.
- [Mini CAD](docs/mini-cad.md): goals, data model and stages.
- [Decision records](docs/adr/): architectural decisions and why they were made.

## License

Three.js is distributed under the MIT license. The build ships it in `dist/licenses/three.txt`, because minification removes the license header from the bundle. The project's own code doesn't have a license yet.
