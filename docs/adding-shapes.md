# Adding a shape

Read [Shape structure and architecture](shapes-architecture.md) first. Use pot or drawer
as a leaf-shape reference and pot-with-tray as a composite reference. There is no automatic
model registration: adding a selectable shape requires explicit integration at the existing
composition roots. Do not copy whole builders into a new shared module or add empty folders.

## 1. Decide ownership and contracts

Choose a stable kebab-case folder and configuration discriminant. Decide whether the shape
is independently selectable or an internal part of an assembly (like tray). List its
parameters, supported shared features, output parts, physical bounds and expected components.
Keep units in millimetres and use `Mm` suffixes for dimensional fields.

Create only the needed modules under `src/shapes/<name>/domain`, `geometry` and `ui`.
Promote a helper to a shared layer only when it is genuinely reusable. Put connector/fit
calculations and combined validation in the assembly rather than a leaf or generic primitive.

## 2. Define the domain

- Add `domain/design.ts` with strict Zod parameter/config schemas, inferred types and a
  typed default. Use a literal `type` for selectable shapes.
- Reuse feature/texture contracts from `domain/shared`. Validate relationships and physical
  limits here, not in React controls or the mesh builder. Keep issue paths tied to fields
  so existing form error helpers can display them.
- Put shape-specific calculations in the owning domain folder. Do not import the aggregate
  schema back into a leaf schema or mutate another shape's default objects.
- For a selectable model, add its config schema to `domain/design.ts`. The aggregate
  texture safety refinement applies to textured models and explicitly excludes the
  textureless circular loft. Deliberately narrow and test feature assumptions for a new variant;
  do not add meaningless wall-thickness or texture fields just to satisfy existing callers.
- Test valid defaults, invalid dimensions, feature combinations and exact issue paths.
  Add persistence tests for the new valid session without changing the storage key or
  invalidating existing sessions unintentionally.

An internal assembly part does not need an aggregate variant or standalone editor option.

## 3. Build geometry

- Add the shape builder and, if needed, shape-local mesh/feature helpers. Follow existing
  builder signatures: receive the Manifold module, typed config, tessellation and quality;
  pass warnings where the builder produces them. Return owned solids rather than loading
  the engine in the shape.
- Reuse `geometry/engine`, `primitives`, `mesh`, `surface` and `features`. Keep placement,
  shape topology and shape-dependent mappings in the new shape folder.
- Specify which helper consumes each solid. Clean up all intermediate solids on success
  and failure; allow `buildGeometry` to delete returned final solids after extraction.
- Integrate explicit dispatch and result extraction in `geometry/build.ts`. Audit every
  branch so a new model is not silently routed to another shape's builder. Choose
  the correct single-solid or multi-component validation for the new result.
- Update `geometry/tessellation.ts` and `preflight.ts` where model dimensions or feature
  counts affect sampling, warnings and boolean budgets. Audit non-drawer/pot assumptions:
  a new discriminant must not accidentally be treated as a tapered pot.
- For composites, create a shape-local extractor if offsets, bounds or multiple parts
  need custom handling. Keep manufacturing coordinates separate from preview placement.

For pot-with-tray changes, preserve the combined textured shell and split before finishing.
Do not substitute independently generated pot/tray shells for that assembly pipeline.

## 4. Wire worker and export contracts

For a new output part, extend `ModelPartKind` in `domain/worker.ts` deliberately. Update
`geometry.worker.ts` filename handling and any ordering rules, then verify binary STL
encoding, filenames and separate bed-oriented files for assemblies. Keep job IDs, progress,
buffer transfers and preview/export queue semantics unchanged.

Review `src/App.tsx`, `ui/types.ts`, `ui/preview-geometry.ts` and `ui/Viewport.tsx` for model
or part assumptions. Generic paths need no gratuitous edits, but new kinds must render and
download correctly. Do not move heavy work onto the main thread or create per-shape workers.

## 5. Compose controls in the existing editor

- Add shape controls under `ui/`, using shared fields and `FormBindings`. Receive existing
  `register`, errors and callbacks; do not call `useForm` or own model subscriptions.
- Add the selector, default selection, shape narrowing, fields and preview heading in
  `ui/DesignEditor.tsx`. Audit its drawer-versus-pot branches, drainage callbacks and shared
  field slots so an unrelated new shape does not receive pot controls or parameter values.
- Define which settings survive model switches. Keep reset, validation, texture switching
  and `onChange` emission in the editor. Preserve existing models' labels, paths, DOM order
  and styling.
- Assembly controls may compose leaf controls (as `PotWithTrayControls` uses `TrayFields`);
  internal parts need no new selector or independent form.

## 6. Prove the integration

- Colocate domain and builder tests. Cover defaults and draft/preview/export generation,
  bounds, volume, normals, solid counts, supported features and complexity failures.
- Add focused boundary tests for new shared helper interfaces and transferred-solid
  ownership. Preserve existing assertions and avoid runtime dependency cycles.
- Add aggregate/persistence coverage and browser tests for switching, validation, worker
  completion, preview and STL downloads using labels and roles.
- Keep the existing refactor parity fixture unchanged for unaffected shapes. For structural
  extraction, compare the working-tree baseline before/after: mesh arrays, STL bytes,
  stats, warnings, part order, preview offsets, stages and validation failures/issue paths.
  Add separate expectations for genuinely new geometry, not replacement legacy hashes.
- Check for stale imports, shared-to-shape implementation imports and runtime cycles.

Run:

```sh
npm run format:check
npm test
npm run build
npm run test:e2e
```

Document new responsibilities and dependency exceptions here. Before committing, update
`package.json` and the matching lockfile versions per `AGENTS.md`: an independently
selectable user-visible shape normally needs a MINOR bump; a pure internal correction
needs PATCH. Do not include generated bundles, browser reports or build-info files.
