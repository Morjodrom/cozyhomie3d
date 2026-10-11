# UI approach and architecture

The application is a desktop parameter editor with a live 3D preview. It uses Mantine
for standard controls and presentation, React Hook Form for editor form state, Zod for
validation, and React Three Fiber/Drei for the viewport. Mantine does not own domain
rules, geometry generation, persistence, or worker scheduling.

Read [Shape structure and architecture](shapes-architecture.md) for the full dependency
rules and [Mantine AI tooling](mantine-tooling.md) for project-scoped documentation tools.

## Ownership and data flow

| Module | UI responsibility |
| --- | --- |
| [Application entrypoint](../src/main.tsx) | Imports Mantine styles and supplies the shared provider/theme |
| [App](../src/App.tsx) | Owns the last valid configuration, persistence, worker jobs, preview results, and downloads |
| [DesignEditor](../src/ui/DesignEditor.tsx) | Owns the single form, validation subscription, resets, model/texture switching, and control composition |
| Shape `ui/` directories | Render shape-specific fields using editor bindings and supplied callbacks |
| [Shared UI](../src/ui/shared/) | Provides numeric adapters and reusable feature/status controls |
| [Viewport](../src/ui/Viewport.tsx) | Renders supplied mesh parts and transient highlights; handles camera interaction |

The normal flow is:

1. A control changes the editor's editing draft.
2. React Hook Form invokes the Zod resolver for field errors. The editor's watch
   subscription also parses the aggregate configuration before emitting it.
3. Only valid configurations, with no invalid drainage draft, reach `App` through
   `onChange`. `App` persists them and schedules geometry work in the existing worker.
4. Worker results provide the preview parts, statistics, warnings, and calculation stage.

Invalid edits remain visible with errors, retain the last valid preview and saved
configuration, and disable export. Shape controls must not create another form,
subscription, geometry worker, or authoritative copy of the configuration.

## Components and form bindings

Use Mantine components for standard UI rather than recreating input, button, checkbox,
select, alert, or loading primitives. The current application uses:

- `NumberInput` through the shared `NumericField` adapter for schema-backed numbers.
- `NativeSelect` and `Checkbox` with React Hook Form's `register` for native-backed fields.
- `Button` for stacked model choices, structural edits, export, and viewport actions.
- `Alert` for application errors/warnings, `Paper`/`Text` for summaries, and `Loader`
  for calculation activity.

Shared `FormBindings` supplies `control`, `register`, and errors from the editor.
Controlled numeric fields use `Controller`; do not spread a native `register()` binding
into `NumberInput`. Forward the field name, ref, and blur handling, and preserve any
shape-specific focus/blur callbacks. Keep existing domain field paths and accessible
labels stable when changing presentation. Circular loft uses short visible labels (Diameter, X,
and Y) with contextual accessible names identifying the section, boundary kind, and number.
Material and void boundaries are numbered separately within each section; preview highlights
use the same numbering. Transition controls also retain contextual accessible names while
showing compact labels.

Do not add Mantine Form or a second form-state library. Keep reusable adapters small:
shape-specific behavior belongs in the shape's controls, not in a generic field registry.

### Numeric editing drafts

`NumberInput` can produce numbers or incomplete strings such as `''`, `'-'`, and `'12.'`.
The shared adapter retains these strings in the React Hook Form draft. Zod rejects them
until the edit becomes a valid number; never convert an empty input to zero or coerce
unfinished text into a configuration sent to the worker.

- Use `clampBehavior="none"`; schemas remain authoritative for range validation.
- Preserve directly entered precision. Increment steps are normally `0.1` for decimal
  parameters and `1` for counts; pass an explicit step for integer fields whose path
  does not contain `count`.
- Display units alongside labels, outside the editable value, so native input names and
  numeric text remain usable by tests and assistive technology.
- Render field errors with an alert role and invalid state. Resetting the form must also
  reset numeric drafts, including after model/texture changes or restored configurations.

Pot drainage is a deliberate exception to schema-backed field registration: its count
and diameter edit a generated hole layout through an editor callback. The controls keep
transient text locally, validate complete count/diameter values, and regenerate only
when the inputs and required dimensions are numeric and safe. Invalid drainage drafts
gate both export and configuration emission. The editor synchronizes this gate with a
ref and state, and a reset revision clears local drafts even when the derived values
have not changed. This local text is not a second authoritative form owner.

## Theme, styling, and layout

The root provider currently uses Mantine 9.7.1 with a light default color scheme, orange
primary color, medium default radius, and the existing system-font stack. Package versions
are pinned together in the manifests; installed declarations are authoritative for APIs.

Mantine supplies component behavior and base styling. Application CSS remains responsible
for the desktop grid, scrollable light parameter sidebar, dark preview area, compact
parameter groups, viewport overlays, and fixed calculation-status bar. The current shell
has a 1024px minimum width; it is not a mobile-responsive layout.

Keep global CSS limited to application foundations. Use Mantine props and its Styles API
for component customization; scoped application selectors currently also adjust labels,
input surfaces, and group spacing. Do not restore broad native input/button resets that
override Mantine focus or disabled behavior. Avoid wholesale CSS reformatting as part of
feature work.

Preserve keyboard focus indicators, button selection state, associated labels/errors,
and live announcements. Model choices remain vertically stacked buttons with
`aria-pressed`, not a new navigation or tab system. Calculation status uses a polite live
region and an activity indicator, not an invented completion percentage. Reduced-motion
styles disable loader animations, including animated pseudo-elements.

## Viewport and shape-specific interactions

The viewport is custom 3D rendering, not a Mantine component. Keep CPU-intensive mesh
generation in the geometry worker and do not introduce Mantine dependencies into domain
or geometry modules. UI refreshes must preserve worker contracts, STL units/names,
configuration discriminants, defaults, and the session storage key.

Circular loft additionally owns structural section/boundary controls and transient circle
focus. Numeric focus/blur callbacks update or clear its highlight without scheduling
geometry. Structural edits and model switching clear selection; selection is neither
persisted nor sent to the worker. Preserve interleaved section/transition ordering and
invalid structural drafts. Read the
[circular loft guide](../src/shapes/circular-loft/README.md) before changing these behaviors.

## Validation and future UI changes

- Add Vitest coverage for pure adapter behavior and Playwright coverage for editor flows.
- Cover incomplete numeric edits, precision/steps, errors, resets, drainage gating,
  conditional controls, keyboard selection, and circular-loft focus when affected.
- Browser regressions must retain persistence, worker completion, and STL download
  assertions; prefer roles, labels, and stable field names over generated Mantine classes.
- Inspect desktop screenshots at 1280×720 and 1920×1080 for scrolling, wrapping, focus,
  contrast, viewport sizing, and status visibility.
- Run the repository's formatting, unit, build, and UI/export browser checks. Do not
  regenerate geometry compatibility fixtures to accommodate a presentation-only change.

Use the project Mantine MCP server for API lookup, with the documented official-docs
fallback when unavailable. Load the vendored custom-components skill only when genuine
factory or Styles API integration is needed; ordinary component usage does not require
introducing custom factory abstractions.
