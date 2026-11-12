# Working on Cockpit Lab

Cockpit Lab is a self-hosted web app for designing compact aluminium-profile cockpits for sim racing and flight. It started as a prototype hosted elsewhere and is being rebuilt as a maintainable codebase that we own. Read `README.md` and `docs/mini-cad.md` before changing the architecture.

## Language

- Everything in the repository is written in US English: UI copy, code, comments, tests, documentation and commit messages.
- Names that users type into their designs (rooms, furniture) are data: keep them as saved, in any language.

## Workflow

- This is a single-developer project. Commit directly to `main` in small, reviewable commits. Use a short-lived branch only when a change needs several steps before it works.
- Keep migrations, refactors and new features in separate commits. A refactor must not change behavior.
- Run `npm run check` and `npm test` before every commit. Changes to the UI or the 3D scene also need `npm run test:e2e` and a check in the browser.
- A new or changed screenshot test needs a clean `npm run test:e2e:stress` before it is committed. When an end-to-end test fails now and then, run the stress command first and fix every cause it lists, instead of one failure at a time.
- The end-to-end tests compare the rendering and the panel text with local references (`e2e/__screenshots__/`, not committed). A refactor must pass them without updating the references. Update them (`--update-snapshots`) only for an intended change, after reviewing the differences.
- In end-to-end tests, select elements by id, data attribute or role, never by visible text, so they survive the translation of the UI.
- Preserve the existing configurator's functionality while the CAD evolves.

## Test-driven development

Implement behavior test-first, using red, green, refactor:

1. **Red:** write one small test that describes the next behavior and watch it fail for the expected reason.
2. **Green:** write the simplest code that makes it pass.
3. **Refactor:** clean up the code and the tests while every test stays green.

- Fix a bug by first writing a test that reproduces it.
- Test behavior through public module interfaces, not private details, so refactors do not break tests.
- Keep domain logic in pure modules, without DOM or Three.js, so it can be tested in Node. Rendering and DOM wiring stay thin and are checked in the browser.
- Use known reference cases (for example the 200 × 150 × 5 mm plate in `docs/mini-cad.md`) as acceptance tests.
- A passing test of the approximate model is not a claim of structural validity.

## Clean Code

- Use intention-revealing names. Units go in the name when the type does not carry them (`lengthMm`, `heightCm`, `angleDeg`).
- Keep functions small and focused on one thing, at one level of abstraction.
- Replace magic numbers with named constants that state their unit and source.
- Prefer clarity over density: no multi-statement one-liners or compressed expressions. Let the formatter handle layout.
- Comments explain *why*, not *what*. Delete dead or commented-out code; Git keeps the history.
- Fail loudly on invalid input at module boundaries (file import, user input) instead of silently guessing.
- Leave code you touch a little cleaner than you found it, in a separate refactor commit when the change is significant.

## SOLID, applied pragmatically

- **Single responsibility:** separate domain model, persistence and migration, geometry, rendering and UI into their own modules. A module has one reason to change.
- **Open/closed:** add new peripherals, profile series or fasteners as data or new implementations, not by growing `switch` statements across the codebase.
- **Liskov substitution:** any part type must honor the contract of the interface it implements (bounding volume, mount points, bill-of-materials entry).
- **Interface segregation:** keep interfaces small. A renderer should not depend on export functions, and an exporter should not depend on the scene.
- **Dependency inversion:** the domain does not import Three.js, the DOM or `localStorage`. Those adapters depend on the domain, never the other way round.

These principles serve readability and change. Don't add abstractions, layers or extension points before a second real use case needs them (YAGNI).

## Architecture and build

- The source lives in `src/`. Vite runs the dev server (`npm run dev`) and builds the app into `dist/` (`npm run build`). `dist/` is generated output: never edit it or commit it.
- Third-party code comes from npm with exact pinned versions. Don't vendor copies into `src/`.
- The source is TypeScript. `tsc` only type-checks it (`noEmit`): Vite builds the app, and Node runs the tests on the `.ts` files directly through type stripping. So:
  - import local modules with their `.ts` extension;
  - use only erasable syntax: no `enum`, `namespace` or constructor parameter properties;
  - prefer `declare` for class fields that the constructor assigns.
- Type checking is strict (`tsconfig.json`, `npm run typecheck`) for `src/`, `e2e/` and the Playwright configuration. Don't loosen compiler options, and don't silence an error with `any` or a cast: values from outside the code (DOM, files, storage) are validated where they enter, as `src/dom-input.ts` and `src/project.ts` do.
- Lengths in the configurator model are cm; use the `Cm`/`Mm` types and the conversions in `src/units.ts` wherever both units meet.
- There is no external deployment. The app runs locally and can be served by any static file server.

## Domain rules

- Current JSON files use cm. Format v4 records the units explicitly and stores the cockpit design apart from the room and every layout; v1, v2 and v3 files are still imported. The CAD model will use mm with a versioned schema and an explicit adapter. Keep importing older files.
- Coordinate system: +Y is up, +Z is the front of the cockpit and −X is the pilot's right. Make conversions explicit if you introduce another convention.
- CAD quantities and dimensions must come from the parts and joints model. Never derive them from rendered meshes or rough multipliers.
- Store a peripheral's envelope, its mounting points and the source of its measurements separately. Don't scale mounting holes when resizing a housing.
- Distinguish intended contact or support from interference. Document the tolerances you use.
- Show states with text or symbols as well as color. Color alone is not enough.

## Repository hygiene

- Keep the licenses of third-party code. The build emits the license of each bundled dependency to `dist/licenses/` (see `vite.config.js`). Add new runtime dependencies there.
- Never commit credentials, personal files, local hosting configuration or private screenshots. Personal designs belong in `configuraciones-personales/`, which Git ignores.
