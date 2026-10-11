import type { PotParameters } from '../../pot/domain/design';
import type { TrayConnectorDimensions, TrayParameters } from '../domain/design';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import {
    discardNumericalShells,
    evaluateAndDisposeInputs,
} from '../../../geometry/engine/operations';
import { translateAndDeleteSource } from '../../../geometry/engine/transforms';
import type { Tessellation } from '../../../geometry/mesh/types';
import { annularPrism } from '../../../geometry/primitives/solids';

export function finishTray(
    module: ManifoldToplevel,
    parameters: PotParameters,
    tray: TrayParameters,
    connector: TrayConnectorDimensions,
    outer: Manifold,
    tessellation: Tessellation,
): Manifold {
    let trayOuter: Manifold | undefined = outer;
    let trayResult: Manifold | undefined;
    try {
        const slope =
            (parameters.topDiameterMm - parameters.bottomDiameterMm) / 2 / parameters.heightMm;
        const cavityHeightMm = tray.heightMm - tray.bottomThicknessMm + 1;
        const cavityBottomRadiusMm =
            connector.trayBottomRadiusMm + slope * tray.bottomThicknessMm - tray.wallThicknessMm;
        const cavityTopRadiusMm = parameters.bottomDiameterMm / 2 + slope - tray.wallThicknessMm;
        const cavity = translateAndDeleteSource(
            module.Manifold.cylinder(
                cavityHeightMm,
                cavityBottomRadiusMm,
                cavityTopRadiusMm,
                tessellation.circularSegments,
            ),
            0,
            0,
            tray.bottomThicknessMm,
        );
        const ownedTrayOuter = trayOuter;
        trayOuter = undefined;
        const hollowTray = discardNumericalShells(
            evaluateAndDisposeInputs(module.Manifold.difference([ownedTrayOuter, cavity]), [
                ownedTrayOuter,
                cavity,
            ]),
        );
        const tongue = annularPrism(
            module,
            connector.tongueInnerRadiusMm,
            connector.tongueOuterRadiusMm,
            tray.heightMm - 0.25,
            tray.heightMm + connector.tongueHeightMm,
            tessellation.circularSegments,
        );
        // Moving the groove behind the nominal pot wall keeps it clear of deep
        // recessed texture. This shallow hidden shoulder joins the correspondingly
        // inset tongue to the tray wall without changing the exposed projection.
        const tongueShoulder = annularPrism(
            module,
            connector.tongueInnerRadiusMm,
            parameters.bottomDiameterMm / 2,
            tray.heightMm - 0.25,
            tray.heightMm,
            tessellation.circularSegments,
        );
        trayResult = discardNumericalShells(
            evaluateAndDisposeInputs(module.Manifold.union([hollowTray, tongueShoulder, tongue]), [
                hollowTray,
                tongueShoulder,
                tongue,
            ]),
        );
        return trayResult;
    } catch (error) {
        trayResult?.delete();
        trayOuter?.delete();
        throw error;
    }
}
