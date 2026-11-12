# Development and migration

## Starting point

The import takes the code of the existing configurator from commit `aebf0a0711f041078d41d9878c65c8fc7718e99f`. The application files and their three test suites are copied unchanged. The public repository's history starts with this import; the hosting service's internal history is not published.

The Three.js license is kept; Three.js is now installed from npm and the build includes its license in `dist/licenses/`. The original hosting configuration, credentials, internal check screenshots and personal JSON files are left out. The configurator's original README is kept as `docs/configurator.md`, with its scope and limitations.

## Getting started

1. Clone the repository and open the folder in VS Code.
2. Run `npm install` and then `npm run dev` in the integrated terminal.
3. Open the address shown, usually `http://127.0.0.1:5173`.
4. Save your changes; the page reloads by itself.
5. Run `npm run check` (types, syntax and formatting) and `npm test` before you commit, and `npm run test:e2e` when you change the interface or the 3D view. A new or changed screenshot test also needs a clean `npm run test:e2e:stress`.

Run `npm install` once after cloning. `npm run dev` starts the Vite dev server, which only listens on the local interface, serves `src/` and reloads the page when you save. `npm run build` produces the static version in `dist/`, which is not versioned, and `npm run format` formats the code.

## Workflow

The full rules are in [AGENTS.md](../AGENTS.md). Keep a working version on `main` and commit small changes directly to it; use a short-lived branch only when a change needs several steps before it works. Review the diff and the checks before each commit. Describe in each change the problem, the result and how it was checked.

The current tests verify the approximate model and its regressions. Fabrication features need additional tests for units, geometric references, holes, joints and exports. Do not turn a test of the approximate model into a claim of structural validity.

## Deployment

There is no external deployment. The app runs locally and can be served by any static file server.

## Saved designs

Each origin (host and port) has its own storage. To move a design, export it as JSON from the origin that holds it and import it in the other one. Do not clear the browser storage before exporting a design you want to keep.

The future CAD schemas will include a version and migration. The current units are cm; introducing mm needs an explicit conversion, checked with known dimensions and earlier files.
