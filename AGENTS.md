# Repository Guidelines

## Project Structure & Module Organization

This is a Vite-powered React and TypeScript application for designing printable pots and drawers.

- `src/shapes/<shape>/{domain,geometry,ui}/` owns shape schemas, defaults, validation, generation, and controls; pot owns drainage.
- `src/domain/` composes validated design data and contains shared contracts, persistence, and worker messages.
- `src/geometry/` builds Manifold meshes, applies features, runs preflight checks, and encodes STL. Heavy work belongs in `geometry.worker.ts`.
- `src/ui/` contains the editor, React Three Fiber viewport, UI types, and component styles.
- `src/App.tsx` coordinates editor state, local persistence, worker jobs, and downloads.
- Unit tests are colocated as `src/**/*.test.ts`; browser workflows live in `tests/*.spec.ts`.
- Do not commit generated output such as `dist/`, `test-results/`, Playwright reports, or `*.tsbuildinfo`.

## Architecture Documentation

Read [Shape structure and architecture](docs/shapes-architecture.md) before changing shape ownership or shared layers. Follow [Adding a shape](docs/adding-shapes.md) when introducing a shape or assembly. Preserve the documented dependency direction, form ownership, worker contracts, and Manifold lifecycle; update these documents when the architecture changes.

Before modifying circular loft, read [Circular loft implementation guide for coding agents](src/shapes/circular-loft/README.md). It documents boundary semantics, zero-diameter voids, zero-gap steps, geometry ownership, editor ordering, and regression requirements.

## Build, Test, and Development Commands

Use Node.js 20.19 or newer.

- `npm install` installs the pinned dependencies from `package-lock.json`.
- `npm run dev` starts the local Vite development server.
- `npm run format` applies Prettier formatting to JavaScript/TypeScript source, declarations, tests, and tooling configs.
- `npm run format:check` checks formatting without writing changes.
- `npm test` runs the Vitest unit suite once.
- `npm run test:watch` reruns Vitest as files change.
- `npm run build` performs strict TypeScript checks and creates the production bundle in `dist/`.
- `npx playwright install chromium` installs the browser needed for end-to-end tests.
- `npm run test:e2e` starts/reuses Vite and runs the desktop Chromium suite.

Before submitting, run `npm run format:check`, `npm test`, `npm run build`, and, for UI or export changes, `npm run test:e2e`.

## Coding Style & Naming Conventions

Follow the Prettier style: four-space indentation, single quotes, semicolons, a 100-column print width, trailing commas, and LF endings. Preserve existing import order; do not add import sorting or ESLint-only style requirements. Prefer discriminated unions and Zod schemas over unchecked casts. Name React components and exported types in `PascalCase`, functions and variables in `camelCase`, and shared constants in `UPPER_SNAKE_CASE`. Keep domain rules out of components and CPU-intensive mesh generation off the main thread. `npm run format:check` checks formatting; `npm run build` remains the required static type check.

Formatting commands target code files only and exclude generated output, dependencies, and reports. Do not reformat CSS, JSON, Markdown, or YAML wholesale. Editor format-on-save with the project's Prettier config is optional for JavaScript/TypeScript; do not modify personal editor settings. Keep TypeScript 7.0.2 unchanged.

## Testing Guidelines

Use Vitest `describe`/`it` tests for schemas, persistence, and pure geometry. Name files `<module>.test.ts` and describe observable behavior. Use Playwright for editor flows, worker completion, and STL downloads; prefer role- and label-based locators. Add regression coverage for bug fixes.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, sentence-case subjects such as `Add configurable tray preview gap` and `Fix vector texture line joints`. Keep each commit focused. Pull requests should explain the user-visible change, note validation commands run, link the relevant issue, and include screenshots or recordings for visual UI changes. Call out changes that affect saved configurations or exported geometry.

## Version Management

This project follows Semantic Versioning. The `version` field in `package.json` is the source of truth and must be incremented before every commit according to the change scope:

- **PATCH** for backward-compatible bug fixes and internal corrections.
- **MINOR** for backward-compatible user-visible features.
- **MAJOR** for breaking changes to public behavior, saved configuration compatibility, or documented interfaces.

Include the resulting `package.json` and `package-lock.json` version updates in the same commit as the change.
