import { expect, it } from 'vitest';
import { DEFAULT_POT } from '../shapes/pot/domain/design';
import { DEFAULT_DRAWER } from '../shapes/drawer/domain/design';
import { DEFAULT_POT_WITH_TRAY } from '../shapes/pot-with-tray/domain/design';
import { createTextureDefault } from '../domain/shared/textures';
import { designConfigSchema, type DesignConfig } from '../domain/design';
import { buildGeometry } from './build';
import baseline from './fixtures/refactor-baseline.json';
import { encodeBinaryStl } from './stl';

async function digest(value: ArrayBufferView | ArrayBuffer): Promise<string> {
    const bytes =
        value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', copy);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
it('preserves the pre-refactor generation baseline', async () => {
    const samples: [string, DesignConfig][] = [
        ['pot', structuredClone(DEFAULT_POT)],
        ['drawer', structuredClone(DEFAULT_DRAWER)],
        ['assembly', structuredClone(DEFAULT_POT_WITH_TRAY)],
    ];
    const noise = structuredClone(DEFAULT_POT);
    noise.texture = createTextureDefault('noise');
    samples.push(['noise', noise]);
    const handle = structuredClone(DEFAULT_DRAWER);
    if (handle.type === 'drawer') handle.parameters.handleStyle = 'recessed';
    samples.push(['recessed-handle', handle]);
    const drainage = structuredClone(DEFAULT_POT);
    if (drainage.type === 'pot') {
        drainage.parameters.drainageHoles = [
            {
                position: { x: 0, y: 0 },
                diameterMm: 5,
                shape: 'circle',
                enabled: true,
                countersink: { diameterMm: 7, depthMm: 1 },
            },
        ];
        drainage.parameters.drainageHoleRounding = { enabled: true, radiusMm: 0.5 };
    }
    samples.push(['countersink', drainage]);
    const connector = structuredClone(DEFAULT_POT_WITH_TRAY);
    if (connector.type === 'pot-with-tray') {
        connector.tray.fitClearanceMm = 0.5;
        connector.bedAdhesionBeams.breakawayDistanceMm = -0.1;
    }
    samples.push(['connected-beams', connector]);
    const results: Record<string, unknown> = {};
    for (const [name, config] of samples) {
        for (const quality of name === 'pot' || name === 'drawer' || name === 'assembly'
            ? (['draft', 'preview', 'export'] as const)
            : (['preview'] as const)) {
            const stages: string[] = [];
            const result = await buildGeometry(config, quality, (stage) => stages.push(stage));
            results[`${name}/${quality}`] = {
                stats: result.stats,
                warnings: result.warnings,
                stages,
                parts: await Promise.all(
                    result.parts.map(async (part) => ({
                        kind: part.kind,
                        offset: part.previewOffsetMm,
                        positions: await digest(part.mesh.positions),
                        indices: await digest(part.mesh.indices),
                        normals: await digest(part.mesh.normals),
                        stl: await digest(
                            encodeBinaryStl(part.mesh, `Parametric ${part.kind}, millimetres`),
                        ),
                    })),
                ),
            };
        }
    }
    const invalid = structuredClone(DEFAULT_POT_WITH_TRAY);
    invalid.parameters.heightMm = -1;
    if (invalid.type === 'pot-with-tray') invalid.tray.engagementWidthMm = 20;
    const parsed = designConfigSchema.safeParse(invalid);
    results.validation = parsed.success ? [] : parsed.error.issues;
    try {
        await buildGeometry(invalid, 'preview');
    } catch (error) {
        results.failure = String(error);
    }
    expect(results).toEqual(baseline);
}, 240000);
