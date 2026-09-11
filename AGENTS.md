# Repository Guidelines

## Project Structure & Module Organization

This is a Vite-powered React and TypeScript application for designing printable pots and drawers.

- `src/domain/` defines validated design data, persistence, drainage rules, and worker message contracts.
- `src/geometry/` builds Manifold meshes, applies features, runs preflight checks, and encodes STL. Heavy work belongs in `geometry.worker.ts`.
- `src/ui/` contains the editor, React Three Fiber viewport, UI types, and component styles.
- `src/App.tsx` coordinates editor state, local persistence, worker jobs, and downloads.
- Unit tests are colocated as `src/**/*.test.ts`; browser workflows live in `tests/*.spec.ts`.
- Do not commit generated output such as `dist/`, `test-results/`, Playwright reports, or `*.tsbuildinfo`.

## Build, Test, and Development Commands

Use Node.js 20.19 or newer.

- `npm install` installs the pinned dependencies from `package-lock.json`.
- `npm run dev` starts the local Vite development server.
- `npm test` runs the Vitest unit suite once.
- `npm run test:watch` reruns Vitest as files change.
- `npm run build` performs strict TypeScript checks and creates the production bundle in `dist/`.
- `npx playwright install chromium` installs the browser needed for end-to-end tests.
- `npm run test:e2e` starts/reuses Vite and runs the desktop Chromium suite.

Before submitting, run `npm test`, `npm run build`, and, for UI or export changes, `npm run test:e2e`.

## Coding Style & Naming Conventions

Follow existing TypeScript style: two-space indentation, single quotes, no semicolons, and trailing commas in multiline structures. Prefer discriminated unions and Zod schemas over unchecked casts. Name React components and exported types in `PascalCase`, functions and variables in `camelCase`, and shared constants in `UPPER_SNAKE_CASE`. Keep domain rules out of components and CPU-intensive mesh generation off the main thread. No lint command is configured; `npm run build` is the required static check.

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
