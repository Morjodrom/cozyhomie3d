# Form & Function

A desktop browser tool for generating printable cylindrical pots and open-top drawers. Models are built parametrically in the browser, previewed in 3D, and exported as binary STL files.

## MVP features

- Parametric tapered pots with configurable walls, bases, and drainage holes.
- Parametric open-top drawers with positionable projecting-lip or reinforced rounded-opening handles.
- Smooth, vertical-rib, twisted, seeded organic-noise, honeycomb, and Voronoi surfaces.
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
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The generated STL coordinates are expressed in millimetres. STL does not carry unit metadata, so select millimetres if a slicer asks for the unit.

## Architecture

- `src/domain`: versioned configuration, validation, persistence, and worker messages.
- `src/geometry`: Manifold-based generators, textures, worker, and STL encoder.
- `src/ui`: parameter editor and React Three Fiber preview.

The model and texture contracts are internal registries for now. Runtime plugins, 3MF, printer profiles, slicing, sharing, and mobile layouts are intentionally outside the first MVP.
