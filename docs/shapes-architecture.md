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
    circular-loft/{domain,geometry,ui}/
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

Circular loft is an independently selectable, textureless shape. It owns ordered XY-plane
sections containing equally many strictly nested circles, plus one Z gap per transition.
Every circle has its own diameter and XY center. Boundary levels alternate material and
void from the outside inward; void regions remain open at ends where their diameter is
positive. Positive intervals linearly interpolate centers and radii. An internal zero gap defines a sharp step between
the neighboring volumetric intervals; first/last gaps must be positive and zero gaps cannot
be consecutive. For example, gaps `30, 0, 30` and four sections form two stacked cylinders
with a diameter step at Z=30 mm.

The last boundary may have zero diameter only when it is a void. One zero endpoint closes
the cavity to a conical point; two zero endpoints omit that cavity for the interval. Its XY
point still obeys strict nesting. Each transition is rendered between its neighboring
sections, and focusing a zero-diameter void shows a point marker instead of a contour.
See the [circular loft implementation guide](../src/shapes/circular-loft/README.md) before
modifying this shape.

Its domain operations add/remove the innermost boundary across all sections, insert an
interpolated section, append a copy, and remove sections while summing interior gaps.
Invalid editing drafts stay in the form with errors and do not replace the last valid mesh
or saved configuration. Structural edits clear the focused circle. The editor passes a
transient circle contour to the viewport, drawn without depth testing even inside the model;
this selection is not persisted or sent to the geometry worker.

The builder constructs closed per-circle positive interval solids, applies alternating
differences/unions and unions all intervals. Separate material components are intentional,
including components disconnected at a step. They share one preview part and one
`circular-loft.stl` in original coordinates, without automatic bridges. Synchronized angular
sampling adapts to eccentric nested-circle clearance; preflight rejects workloads above
256 operands, 4096 angular segments or 240,000 input triangles instead of silently reducing
fidelity. Positive gaps below 0.0001 mm and coordinates/intervals that collapse at mesh
precision produce explicit numeric errors, not a printable-wall-thickness constraint.
Circular-loft camera framing uses the generated mesh center so XY offsets remain visible
when resetting the view; other shapes retain their existing camera behavior.

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
3. It validates the expected solid/component count (or permits disconnected circular-loft
   material after checking status and positive finite volume), extracts typed mesh arrays and stats,
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
