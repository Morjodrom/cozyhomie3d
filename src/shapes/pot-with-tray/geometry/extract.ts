import type { DesignConfig } from '../../../domain/design';
import type { Manifold } from 'manifold-3d';
import { extractGeometry, type GeometryResult } from '../../../geometry/mesh/extract';
import { MAX_TRIANGLES } from '../../../geometry/mesh/limits';

export function extractPotWithTrayGeometry(
    pot: Manifold,
    tray: Manifold,
    config: Extract<DesignConfig, { type: 'pot-with-tray' }>,
    initialWarnings: string[],
): GeometryResult {
    const potResult = extractGeometry(pot, 'pot');
    const trayResult = extractGeometry(tray, 'tray');
    const triangleCount = potResult.stats.triangleCount + trayResult.stats.triangleCount;
    if (triangleCount > MAX_TRIANGLES) {
        throw new Error(
            `Model has ${triangleCount.toLocaleString()} triangles; the export limit is ${MAX_TRIANGLES.toLocaleString()}.`,
        );
    }
    const warnings = [
        ...initialWarnings,
        ...(triangleCount > 150_000
            ? ['This detailed model may take longer to preview and slice.']
            : []),
    ];
    return {
        parts: [
            { kind: 'tray', mesh: trayResult.parts[0].mesh, previewOffsetMm: [0, 0, 0] },
            {
                kind: 'pot',
                mesh: potResult.parts[0].mesh,
                previewOffsetMm: [0, 0, config.tray.heightMm + config.tray.previewGapMm],
            },
        ],
        stats: {
            boundsMm: [
                Math.max(potResult.stats.boundsMm[0], trayResult.stats.boundsMm[0]),
                Math.max(potResult.stats.boundsMm[1], trayResult.stats.boundsMm[1]),
                config.parameters.heightMm + config.tray.heightMm,
            ],
            volumeMm3: potResult.stats.volumeMm3 + trayResult.stats.volumeMm3,
            triangleCount,
        },
        warnings,
    };
}
