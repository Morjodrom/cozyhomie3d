# Shape structure and architecture

This application uses function composition, not class inheritance. A shape owns its
configuration, geometry operations, and controls. Reusable geometry supplies the building
blocks; application coordinators compose them. See [Adding a shape](adding-shapes.md) for
the implementation checklist.

## Directory ownership

```text
src/
  shapes/
    pot/{domain,geometry,ui}/
    drawer/{domain,geometry,ui}/
    tray/{domain,geometry,ui}/
    pot-with-tray/{domain,geometry,ui}/
  domain/
    shared/{constants,features,textures}.ts
    design.ts
    persistence.ts
    worker.ts
  geometry/
    engine/        # Manifold loading, booleans, transforms, clipping, disposal helpers
    primitives/    # Revolved profiles, polygon utilities, rounded rectangles, annular solids
    mesh/          # Raw mesh types, loops, extraction, normals, triangle limit
    surface/       # Texture signals, vector paths/relief, edge treatment, quality tolerance
    features/      # Reusable rib profiles and bed-adhesion construction
    build.ts       # Validated generation dispatch and final solid ownership
    tessellation.ts
    preflight.ts
    stl.ts
    geometry.worker.ts
    testing/       # Shared test-only mesh assertions
    fixtures/      # Reviewed geometry compatibility fingerprints
  ui/
    shared/        # Form fields and reusable feature controls
    DesignEditor.tsx
    Viewport.tsx
```

Create a folder or module only when it has an actual responsibility. The tree is not a
requirement to add unused primitives or placeholder files.

| Owner | Responsibilities |
| --- | --- |
| Shape `domain/` | Zod schemas, inferred parameter/config types, defaults, shape validation and calculations |
| Shape `geometry/` | Shape construction, feature placement and shape-specific mesh mapping |
| Shape `ui/` | Shape fields using bindings and callbacks supplied by the editor |
| `domain/shared/` | Shared feature/texture schemas, constants, defaults and validation helpers |
| `domain/design.ts` | Aggregate `DesignConfig` discriminated union and cross-model texture safety |
| `domain/persistence.ts` | Session serialization, validation and invalid-session cleanup |
| `domain/worker.ts` | Build/export requests, progress, part/mesh data and response contracts |
| Geometry coordinators | Model-aware dispatch, tessellation planning and boolean-work preflight |
| `ui/DesignEditor.tsx` | Form ownership, subscriptions, model/texture switching, reset and control composition |
| `src/App.tsx` | Application state, persistence, worker jobs and downloads |

## Dependency rules

- Shape domain modules consume shared domain helpers, not UI or Manifold code.
- Shape geometry consumes its domain and the reusable geometry layers. Shape-specific
  placement stays with the shape; generic profiles and operations stay shared.
- Shape controls consume domain types and shared controls. They do not generate geometry
  or create a second form/subscription.
- Shared domain, geometry and UI modules must not import shape **implementations**.
  Type-only contracts (for example `DesignConfig` or worker data) are not runtime dispatch.
- Application-wide coordinators may import shapes: the aggregate schema, build dispatch,
  tessellation/preflight and editor are intentionally model-aware. Some shape builders
  consume the exported tessellation options helper; do not introduce a runtime cycle
  between that helper and the shape builder.
- Composite shapes may compose the leaf shapes they own. The current assembly uses pot
  and tray; tray finishing accepts pot parameter types but does not import the assembly's
  connector calculation. Do not make leaf shapes depend on assembly implementations.
- Import the actual owning module directly. Do not restore obsolete mixed modules with
  compatibility re-export wrappers or introduce a model/plugin registry unnecessarily.

## Current shapes and assembly

Pot owns drainage layouts, drainage validation/cutters, concentric bottom grooves and
hoop rigidity ribs. Drawer owns rectangular mesh mapping, handles, X/Y bottom grooves,
wall selection and drawer rigidity ribs.

Tray owns its parameter schema/defaults, tray fields and `finishTray`. It is **not** a
standalone `DesignConfig` variant or independently selectable model. Pot-with-tray owns
connector dimensions, combined validation, assembly construction and two-part extraction.

The assembly builds one textured outer shell over the combined height, clips it into pot
and tray shells, moves the pot shell to its bed-oriented origin, then calls `finishPot`
and `finishTray`. The tray finisher consumes the supplied split shell; it does not build
an independent textured shell. This keeps the texture continuous across the split.
Adhesion beams are applied after finishing the parts. Assembly extraction supplies part
order, statistics and preview offsets; preview separation does not change STL coordinates.

## Generation and resource lifecycle

1. `buildGeometry(config, quality, onStage?)` parses the aggregate schema and checks the
   boolean operand budget before loading Manifold or allocating mesh inputs.
2. It reports `loading-engine`, `planning`, `constructing`, `validating` and
   `preparing-mesh`, plans draft/preview/export tessellation and dispatches the builder.
3. It validates the expected solid/component count, extracts typed mesh arrays and stats,
   and deletes its final Manifold objects in `finally`.
4. The worker transfers preview buffers or builds at export quality, reports
   `encoding-files`, encodes binary STL and transfers the files. Export jobs are queued;
   preview jobs coalesce to the newest pending build.

Builders own their intermediate solids. A helper that consumes inputs must delete them
as its contract specifies; clear local references when transferring ownership. Finishing
functions consume their supplied outer shell and return an owned result. Never double-delete
transferred inputs or leak solids on an exception. Preserve boolean order, quality settings
and warning order when doing structural changes.

## Compatibility and tests

Session storage uses `drawer-generator:session`. Keep existing configuration discriminants,
field paths, defaults, validation issue paths, worker messages, STL names and units stable
unless a separately reviewed feature explicitly requires a change.

Tests live beside their responsibility. Aggregate validation/persistence and cross-shape
geometry tests stay at the application layer; browser workflows live in `tests/`.
`geometry/refactor-parity.test.ts` uses a reviewed fixture of pre-refactor mesh/STL hashes,
statistics, warnings, part order, offsets, stages and validation failures. It covers existing
models across all three build qualities plus representative features. Do not regenerate
that fixture just to hide a changed output; investigate and explicitly review compatibility.
