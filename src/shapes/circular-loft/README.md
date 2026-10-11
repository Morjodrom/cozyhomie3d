# Circular loft implementation guide for coding agents

Read this guide before changing the circular loft shape. The shape connects ordered
circular sections into printable material, including eccentric walls, cavities that close
to a point, and sharp steps. Preserve the following domain, geometry, editor, and export
contracts rather than treating the shape as a pot with different controls.

The application architecture and integration checklist remain in
[Shape structure and architecture](../../../docs/shapes-architecture.md) and
[Adding a shape](../../../docs/adding-shapes.md).

## Configuration and units

The selectable configuration discriminant is `circular-loft`. Its label and preview heading
are `Фигура по сечениям`. [domain/design.ts](domain/design.ts) owns the schemas, inferred
types, default, and clearance calculations. The configuration has only `type` and
`parameters`; it has no texture, drainage, ribs, edge treatment, or adhesion features.

`parameters.sections` is an ordered array of `{ circles }`. Each circle stores
`diameterMm`, `offsetDistanceMm`, and `offsetAngleDeg`. `parameters.gapsMm[i]` is the Z
distance from section `i` to section `i + 1`. All lengths are millimetres; angles are degrees. Section zero is at Z=0;
later section heights are cumulative sums of preceding gaps. Circle centers are independent,
not necessarily concentric. Offset distance is finite and
nonnegative, measured from the global XY origin. Offset angle is finite, clockwise from +Y:
0° points along +Y and 90° along +X. Negative and multi-turn angles are accepted and retained,
including at zero distance. Resolve centers with `circularLoftCircleCenter`: X is distance
times sine of the angle, Y is distance times cosine. The angle positions the center; it does
not rotate the boundary's angular sampling or twist the loft. The default is two sections,
each with one 60 mm circle at XY=(0,0), separated by 60 mm.

Use the aggregate schema to validate complete designs. The standalone circle schema
accepts nonnegative diameters; permission for zero depends on the boundary's position
and is enforced by the parameters schema. Do not bypass that contextual refinement.

## Boundaries and validation

- Keep at least two sections and one circle per section. Circle count must be identical
  in every section. Boundary identity is its array index across all sections.
- Zero-based even indices begin material zones; odd indices begin void zones. One circle
  yields a filled body, two a tube, three a tube plus a separate filled core, four a tube
  plus a separate inner tube, and so on. Do not reorder circles by diameter.
- Diameters must be finite and positive, except that the last circle may be zero when its
  index is odd: the deepest boundary must actually be a void. Outer circles, material
  boundaries, and non-final void boundaries cannot have zero diameter. Negative diameters
  and nonfinite numbers are always invalid.
- Every inner boundary must lie strictly inside the immediately preceding circle:
  `hypot(dx, dy) + innerDiameter / 2 < outerDiameter / 2`. Apply this to zero-diameter
  voids too: their point must be strictly inside the previous boundary. No tangency or
  crossing of adjacent boundaries is allowed within a section.
- There must be exactly one gap per adjacent pair. Gaps are finite and nonnegative; the
  first and last must be positive. Consecutive zero gaps are invalid. Total height must
  remain finite.
- Attach validation issues to indexed field/group paths, so the editor can display both
  scalar errors and errors involving an entire circle. Do not silently clamp or repair
  invalid drafts.

## Linear intervals and zero values

For a positive gap, interpolate both centers and radii linearly. Corresponding angular
samples use the same phase and segment count; do not introduce twist or smooth splines.
Analytical nesting at both endpoints is preserved throughout such an interval.

A deepest void with one zero diameter and one positive diameter forms a conical cavity.
The zero end is one tip vertex at that circle's XY and section Z. Do not represent it as
a ring of coincident vertices or add a zero-area cap. When both void endpoints are zero,
that interval has no cavity: omit its cutter, but preserve the boundary in the configuration
and UI. Never omit a positive cavity or substitute an empty Manifold operand.

A zero gap is different from a zero diameter. It creates no volume and defines a sharp
step between neighboring positive intervals. Four sections with diameters `60, 60, 40, 40`
and gaps `30, 0, 30` form two connected cylinders with a shoulder at Z=30. Keep both
sections at the repeated height; removing one would replace the step with a taper.

For a cavity that starts inside a solid bottom, this configuration has no cavity over
Z=0–10, a conical opening over Z=10–30, and a cylindrical cavity over Z=30–60:

```ts
const config: CircularLoftConfig = {
    type: 'circular-loft',
    parameters: {
        sections: [0, 0, 30, 30].map((diameterMm) => ({
            circles: [
                { diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                { diameterMm, offsetDistanceMm: 0, offsetAngleDeg: 0 },
            ],
        })),
        gapsMm: [10, 20, 30],
    },
};
```

## Geometry ownership and numeric safety

[geometry/mesh.ts](geometry/mesh.ts) builds closed interval meshes, using either two
positive-radius rings or a single ring and tip. It returns no mesh for a zero-to-zero
boundary. [geometry/build.ts](geometry/build.ts) creates each boundary's volume, then
subtracts voids and adds material in index order. It unions positive intervals to remove
internal shared caps and form shoulders. Do not generate horizontal volume for zero gaps.

Separate material components are intentional, including components separated by XY
changes at a step. Do not add bridges or apply the single-solid validator. Validate
Manifold status, positive finite volume, and mesh limits; reject numerically collapsed
intervals rather than exporting only the surviving pieces.

The application coordinator loads Manifold and owns the final result. The builder owns
its intermediate solids; consuming boolean helpers delete their inputs. Clear local
ownership before transfer, and delete every owned object exactly once on exceptions.
Retain regression tests that inject mesh creation and boolean failures.

All nested circles share angular sampling. Clearance calculations adapt sampling so an
outer polygon cannot clip a nearly touching eccentric inner circle. Existing preflight
limits are 256 generated operands, 4096 angular segments, and 240,000 raw input triangles;
the final mesh limit is 500,000 triangles. Positive gaps below 0.0001 mm and coordinates
outside Float32 range fail explicitly for numeric safety. These guards are not a minimum
printable wall thickness. Never hide complexity failures by silently reducing fidelity.

## Editor and preview contracts

[domain/operations.ts](domain/operations.ts) owns immutable structural operations:

- Add an innermost circle across all sections with half the preceding diameter and its
  center. Remove only the innermost circle, retaining at least one.
- Insert between neighbors by averaging Cartesian centers and diameters, converting back
  to polar offsets, and splitting the gap equally. An exactly centered midpoint retains the
  lower section's angle; never average polar distance and angle to create an arc. Append by
  copying the last section and repeating the last gap.
- Remove an interior section by summing its adjacent gaps. Remove an endpoint with its
  adjacent gap, retaining at least two sections.

Structural operations may produce invalid drafts, for example inserting into a zero gap,
or adding a material boundary after a zero-diameter void. Preserve those drafts and show
schema errors; do not change existing diameters or gaps automatically.

[ui/CircularLoftControls.tsx](ui/CircularLoftControls.tsx) receives the editor's form bindings
and callbacks. The shared editor owns `useForm`, subscriptions, model switching, and
emission of valid configurations. Render each transition's distance and insertion button
between the two sections it connects, not in a separate transition list.

Invalid drafts retain the last valid preview and persisted configuration and disable
export. Focusing diameter, offset distance, or offset angle highlights that specific circle
at its cumulative Z.
Positive diameters use a thick cyan, dark-outlined screen-space contour; zero diameter uses
a larger cyan point with a dark outline. Both disable depth testing and tone mapping for
contrast through the mesh, and their pixel size stays constant when zooming.
Update selection directly from the draft without geometry jobs. Blur, structural edits,
and model switching clear it. Do not persist selection or include it in worker messages.
Camera reset uses generated mesh bounds and center to include offset figures.

## Integration and regression checks

The aggregate schema, build dispatch, tessellation/preflight, editor, and worker part kind
explicitly recognize this variant. Keep heavy generation in the existing geometry worker;
do not create a separate worker or introduce a shape registry. Export one part as
`circular-loft.stl`, containing all material components in original coordinates.
Keep the existing session key and worker scheduling/buffer-transfer contracts. Worker circle
values now carry polar offsets; viewport highlights use derived Cartesian coordinates. Session
loading strictly validates legacy X/Y loft data before converting and validating the new
representation. Legacy centered circles migrate to angle 0°; other angles normalize to [0,360).
Saving writes only polar offsets. Invalid legacy sessions retain existing cleanup behavior.

Run the colocated domain/geometry tests and viewport helpers first, then the repository
checks required by the root instructions:

```sh
npm test -- --run src/shapes/circular-loft src/ui/Viewport.test.ts
npm run format:check
npm test
npm run build
npm run test:e2e
```

Cover zero-to-positive, positive-to-zero, and zero-to-zero voids; two and four boundary
cases; shifted tips; strict nesting and forbidden zero boundaries; stepped geometry;
cleanup on errors; interleaved transition DOM order; focus and blur; persistence and STL.
Preserve existing shapes' labels, field paths, geometry, and parity fixtures. Do not
regenerate a legacy fixture to disguise a changed output.
