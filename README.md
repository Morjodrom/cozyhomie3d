# Form & Function

A desktop browser tool for generating printable cylindrical pots and open-top drawers. Models are built parametrically in the browser, previewed in 3D, and exported as binary STL files.

## MVP features

- Parametric tapered pots with configurable walls, bases, and drainage holes, including a two-part pot with a fitted drainage tray.
- Parametric open-top drawers with positionable projecting-lip or reinforced rounded-opening handles.
- Configurable rounded-V stress-relief grooves: concentric for pots and independently counted X/Y ribs for drawers.
- Separate additive rigidity ribs with inside/outside placement, tapered wall reinforcement, and wall-to-bottom gussets.
- Smooth, vertical-rib, twisted, seeded organic-noise, honeycomb, Voronoi, and finite branching-fractal surfaces.
- Embossed or recessed relief with physical scale, coverage/fades, and preview/export quality controls.
- Orbit, zoom, pan, and reset controls in a Z-up 3D preview.
- Automatic recovery of the latest valid settings after a refresh.
- Local geometry generation with Manifold WASM; no backend or uploaded data.

## Development

Requires Node.js 20.19 or newer.

```sh
npm install
npm run dev
```

Validation commands:

```sh
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Run `npm run format` to apply Prettier formatting to JavaScript/TypeScript source, declarations,
tests, and tooling configs. Run `npm run format:check` to check those files without writing changes.
The shared style uses four spaces, semicolons, single quotes, a 100-column print width, trailing
commas, and LF endings. Import order is preserved; no import sorting or ESLint rules are enabled.
Generated output, dependencies, and reports are excluded. CSS, JSON, Markdown, and YAML are not
targeted by these commands, and the deployment workflow remains unchanged.

Editor format-on-save is optional: configure your editor's Prettier integration for JavaScript and
TypeScript to use the project's `.prettierrc.json` and `.prettierignore`. No personal editor settings
are changed by this project. TypeScript remains at version 7.0.2.

The generated STL coordinates are expressed in millimetres. STL does not carry unit metadata, so select millimetres if a slicer asks for the unit. Pot-with-tray designs export separate, bed-oriented pot and tray files.

## Architecture

See [Shape structure and architecture](docs/shapes-architecture.md) for ownership and dependency rules, and [Adding a shape](docs/adding-shapes.md) for the integration checklist.

- `src/shapes/<shape>/{domain,geometry,ui}` owns each shape's configuration, generation, and controls. Pot, tray, drawer, and the pot-with-tray assembly use function composition, not class inheritance.
- `src/domain/shared` contains reusable feature schemas, texture contracts, and validation helpers. `src/domain/design.ts` composes the model union; persistence and worker messages remain application-wide.
- `src/geometry/{engine,primitives,mesh,surface,features}` contains reusable lower-level geometry. These layers do not import shape implementations. The build and tessellation coordinators dispatch to shape modules, and heavy generation stays in the worker.
- `src/ui/shared` contains reusable controls; `DesignEditor` owns form state and composes shape controls alongside the React Three Fiber viewport.

The pot-with-tray assembly depends on pot and tray modules. It preserves the combined textured-shell construction and splitting sequence: the tray module finishes the supplied shell rather than generating an independent tray. Shapes depend on reusable layers, never the other way around; application-wide coordinators are the composition roots. There are no compatibility re-export wrappers for the removed mixed modules.

Unit tests live beside their owning modules; cross-shape integration tests remain in `src/geometry` and `src/domain`. The geometry parity fixture records pre-refactor mesh/STL fingerprints, statistics, warnings, offsets, stages, and validation failures for representative designs. Changes to that fixture require explicit review of exported-geometry compatibility.

The model and texture contracts are internal registries for now. Runtime plugins, 3MF, printer profiles, slicing, sharing, and mobile layouts are intentionally outside the first MVP.
