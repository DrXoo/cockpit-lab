# Cockpit Lab

Cockpit Lab is a web app for designing a compact DIY cockpit built from aluminium profiles, for sim racing and VR flight, and for arranging the room it goes in.

It runs entirely in your browser, with no accounts, servers or external services. Designs are saved locally and can be exported as JSON.

> **Status:** the room editor works today. The cockpit is being rebuilt as a **mini CAD for profiles, peripherals and custom plates**: precise parts, joints, cut lists and plate drawings. The parametric cockpit of the earlier configurator is retired, and the cockpit editor builds a design from anchored profiles while the rest of the CAD comes (see [the staged plan](docs/mini-cad.md)).

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

The end-to-end tests drive the real app in your installed Chrome: guided setup, opening and saving projects, cockpit files, views and the summary. Each run builds the app first and serves that build on port 5190, so editing `src/` during a run does not change what the tests see. They also compare each view's rendering and the text of the panels with reference copies. Those references live in `e2e/__screenshots__/` and are not committed: the first run on a machine creates them, so create them before changing anything you want to check. After an intended change, review the differences and accept them with `npx playwright test --update-snapshots`.

The tests run as two Playwright projects. `functional` drives the app and checks its state, on every worker. `visual` compares screenshots (`page-appearance`, `rendering` and `theme`) on three workers at most, because screenshots render WebGL in software and time out when they all compete for the CPU. `npm run test:e2e:stress` repeats the visual tests four times under load and lists every failure grouped by kind (screenshot differs, never stable, test or assertion timeout), with the diff images, in `e2e-stress-results/`. Run it before committing a new or changed screenshot test: a flaky screenshot shows up there instead of weeks later. Arguments replace the default selection, for example `npm run test:e2e:stress -- --project=functional --repeat-each=2`.

The tests cover geometry, the cockpit parts model, the monitor arm, desk, room, doors, furniture, chair and project loading. UI changes also need a check in the browser.

## Features

- A cockpit editor that designs the cockpit on its own, as a design history in mm: add profiles, select them in the view or in the history, edit them in the inspector, and undo and redo the edits. Cockpit files move a design between projects.
- Guided room setup (room, openings, furniture and desk) that resumes where you left off.
- Adjustable desk with PC, keyboard, mouse and XL mouse pad.
- Generic articulated monitor arm with desk and VR positions, and saved arm poses.
- Rectangular room with doors, windows, furniture, wall shelves at a set mounting height, and an office chair.
- Built-in sliding-door wardrobes with a clearance zone kept free in front of them.
- 3D, plan and desk views, with drag-and-drop layout, and a side view of the cockpit design.
- Several layouts of the same room, to try another arrangement and compare it with the one you started from. Furniture can be left out of a single layout.
- Approximate geometric checks, a summary, and JSON export.

These checks are approximate. They don't validate loads, stiffness or structural safety. Verify real measurements before building anything.

## Project structure

The source is grouped by area first: the room, the cockpit design and the project each have a folder. Inside an area, the folder itself holds the domain, pure modules without DOM or Three.js; `editing/` or `editor/` holds the editor's controllers and the HTML they show, and `render/` what the scene draws. Those two depend on the domain, never the other way round. Tests mirror the folders of `src/` in `tests/`.

| Path | Responsibility |
| --- | --- |
| `src/index.html`, `src/app.ts` | The page, and the composition root: opens the saved project, builds the editors' controllers around the workbench and draws the 3D view |
| `src/workbench.ts` | The page the user works in: which editor, tab, view and panel it shows, and refreshing it; the host both editors' controllers ask |
| `src/app/` | The page's shell around the editors: its sections, header and chrome, notices, dialogs, color theme, opening and exporting files, and the printable summary |
| `src/shared/` | What every area uses: plan geometry, cm/mm units, the check type, interference between volumes, cleaning names typed by users, undo and redo |
| `src/ui/` | DOM helpers: finding and replacing parts of the page, icons, building HTML safely, and how a check is shown |
| `src/styles/` | The style sheets and the color tokens of both themes |
| `src/scene/` | The 3D view both editors share: the Three.js scene and its interaction, camera framing, canvas colors, and the render model (what the scene draws, as plain data in drawing order) with the adapter that turns it into Three.js objects |
| `src/project/` | The project format and its migrations, browser storage, and the open project with its autosave |
| `src/room/` | The room model in cm: room, furniture and openings, the desk and its accessories, the monitor arm and its saved poses, layouts, settings with their ranges, and the room's envelopes and checks (`evaluate.ts`) |
| `src/room/editing/` | The room editor: its selection, one controller per part of the page (setting controls, room items, guided setup, desk and arm, layout picker, room checks, dragging in the plan) through `RoomEditorHost`, and the HTML of its panels |
| `src/room/render/` | Drawings of the room, the desk and monitor, aluminium profiles, and the measurements, labels and selection outline |
| `src/cockpit/` | The cockpit design as its design history and how files store it, cockpit files, and the checks a design gets |
| `src/cockpit/cad/` | The cockpit parts model in mm, by subject: `parts/` (catalog, assembly, mounting patterns, plate holes, joints, connectors), `history/` (operations, replay, editing the history, drafts, adjustments and travel, fastening, plates and peripherals), `analysis/` (interference, support, measuring), `interaction/` (handles, snapping, picking, joint markers), `output/` (cuts, parts to buy and plate drawings) and `driver/` (stature, posture, anatomy) |
| `src/cockpit/editor/` | The cockpit editor: its session (selection, history marker, undo, part being added, Fit, measuring) as pure state in `session.ts`, its commands without DOM in `editor.ts`, one controller per part of the page, and the HTML of its history, inspector, parts list and labels |
| `src/cockpit/render/` | Drawings of the cockpit design: its parts, dimensions, driver, handles, hover and measurement |
| `tests/` | Unit tests, in the folders of the modules they test; `tests/support/` builds designs and reads values for them, `tests/scripts/` tests the scripts |
| `e2e/` | End-to-end tests and the project files they use |
| `scripts/` | Project checks and development tools (look, move, rename) |
| `vite.config.js` | Dev server and build configuration |
| `docs/` | Detailed documentation and the mini CAD plan |

The source is strict TypeScript, type-checked by `tsc` but not compiled by it: Vite builds the app and Node runs the tests. Three.js 0.186.1 is installed from npm.

## Roadmap

1. **Mini CAD.** A parts and joints model in mm with a versioned schema, profile editor, plates and holes, joints and bill of materials, and racing/flight modes. See [the staged plan](docs/mini-cad.md).

## Development principles

New code is written test-first (TDD), following Clean Code and pragmatic SOLID. Domain logic stays free of DOM and Three.js so it can be tested in Node. The full rules are in [AGENTS.md](AGENTS.md).

## Saved designs

Projects are stored in the browser's `localStorage` under `cockpit-lab-v5`, and can be exported and imported as JSON v5 with explicit units: the room in cm, and the cockpit design apart from it as its design history in mm. Older v1 to v4 files, and designs saved under `cockpit-lab-v1` to `cockpit-lab-v4`, still open with their room and are left as they were; a parametric cockpit they hold is retired and left out, with a message. A saved design that can't be read is kept under a key of its own instead of being overwritten, and the app offers it for download. See [guided setup and the save format](docs/guided-setup.md).

Browser storage is tied to the origin (host and port), so a design saved on one port doesn't appear on another. Export it to JSON to move it. Keep personal design files in `configuraciones-personales/`, which Git ignores.

## Documentation

- [Glossary](CONTEXT.md): the domain terms (project, cockpit design, room, layout, placement) and how they relate.
- [Current configurator](docs/configurator.md): scope, conventions and limitations.
- [Guided setup](docs/guided-setup.md): setup steps, the save format and the adapters for older files.
- [Layouts](docs/layouts.md): what each layout stores, what is shared and the file format.
- [Development](docs/development.md): starting point and workflow.
- [Mini CAD](docs/mini-cad.md): goals, data model and stages; [what each slice did](docs/mini-cad-log.md).
- [Cockpit editor interactions](docs/cockpit-editor-interactions.md): what each gesture and key does in the view.
- [Decision records](docs/adr/): architectural decisions and why they were made.

## License

Three.js is distributed under the MIT license. The build ships it in `dist/licenses/three.txt`, because minification removes the license header from the bundle. The project's own code doesn't have a license yet.
