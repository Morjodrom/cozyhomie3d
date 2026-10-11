import type { DesignConfig } from '../../../domain/design';
import type { PotParameters } from '../../pot/domain/design';
import { trayConnectorDimensions } from '../domain/design';
import type { BuildQuality } from '../../../domain/worker';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { clipByZ } from '../../../geometry/engine/clipping';
import { translateAndDeleteSource } from '../../../geometry/engine/transforms';
import { addBedAdhesionBeams } from '../../../geometry/features/bed-adhesion';

import type { Tessellation } from '../../../geometry/mesh/types';
import { resolveAxialEdgeTreatment } from '../../../geometry/surface/edge-treatment';
import { buildTexturedPotOuter, finishPot } from '../../pot/geometry/build';
import { finishTray } from '../../tray/geometry/build';

export function buildPotWithTray(
    module: ManifoldToplevel,
    config: Extract<DesignConfig, { type: 'pot-with-tray' }>,
    tessellation: Tessellation,
    quality: BuildQuality,
    warnings: string[],
): { pot: Manifold; tray: Manifold } {
    const parameters = config.parameters;
    const tray = config.tray;
    const connector = trayConnectorDimensions(parameters, tray);
    const totalHeightMm = parameters.heightMm + tray.heightMm;
    const combinedParameters: PotParameters = {
        ...parameters,
        heightMm: totalHeightMm,
        bottomDiameterMm: connector.trayBottomRadiusMm * 2,
    };
    const combinedAxialTreatment = resolveAxialEdgeTreatment(parameters.edgeTreatment, {
        bottomWallMm: tray.wallThicknessMm,
        bottomThicknessMm: tray.bottomThicknessMm,
        topWallMm: parameters.wallThicknessMm,
    });
    let combinedOuter: Manifold | undefined = buildTexturedPotOuter(
        module,
        combinedParameters,
        config.texture,
        tessellation,
        quality,
        warnings,
        combinedAxialTreatment,
    );
    let potOuter: Manifold | undefined;
    let trayOuter: Manifold | undefined;
    let pot: Manifold | undefined;
    let trayResult: Manifold | undefined;
    try {
        potOuter = translateAndDeleteSource(
            clipByZ(module, combinedOuter, tray.heightMm, parameters.heightMm),
            0,
            0,
            -tray.heightMm,
        );
        trayOuter = clipByZ(module, combinedOuter, 0, tray.heightMm);
        combinedOuter.delete();
        combinedOuter = undefined;

        const ownedPotOuter = potOuter;
        potOuter = undefined;
        pot = finishPot(
            module,
            parameters,
            ownedPotOuter,
            tessellation,
            quality,
            connector.bottomRibRadiusMm,
            {
                innerRadiusMm: connector.grooveInnerRadiusMm,
                outerRadiusMm: connector.grooveOuterRadiusMm,
                depthMm: tray.engagementDepthMm,
            },
        );
        const ownedTrayOuter = trayOuter;
        trayOuter = undefined;
        trayResult = finishTray(module, parameters, tray, connector, ownedTrayOuter, tessellation);
        pot = addBedAdhesionBeams(
            module,
            pot,
            parameters.bottomDiameterMm / 2,
            config.bedAdhesionBeams,
        );
        trayResult = addBedAdhesionBeams(
            module,
            trayResult,
            connector.trayBottomRadiusMm - combinedAxialTreatment.bottomSizeMm,
            config.bedAdhesionBeams,
        );
        return { pot, tray: trayResult };
    } catch (error) {
        pot?.delete();
        trayResult?.delete();
        potOuter?.delete();
        trayOuter?.delete();
        combinedOuter?.delete();
        throw error;
    }
}
