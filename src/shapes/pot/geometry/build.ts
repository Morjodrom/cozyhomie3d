import type { DesignConfig } from '../../../domain/design';
import type { PotParameters } from '../domain/design';
import type { TextureConfig } from '../../../domain/shared/textures';
import { cavityFloorRadius } from '../domain/drainage';
import { resolveDrainageHoles } from '../domain/drainage';
import type { BuildQuality } from '../../../domain/worker';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import {
    discardDetachedSurfaceFragments,
    discardNumericalShells,
    evaluateAndDisposeInputs,
    manifoldFromRaw,
    unionManifoldsInBatches,
} from '../../../geometry/engine/operations';
import { translateAndDeleteSource } from '../../../geometry/engine/transforms';

import type { Tessellation } from '../../../geometry/mesh/types';
import { revolvedProfile, roundedRadialTransition } from '../../../geometry/primitives/revolve';
import { annularPrism } from '../../../geometry/primitives/solids';
import {
    resolveAxialEdgeTreatment,
    type AxialEdgeTreatment,
} from '../../../geometry/surface/edge-treatment';
import { textureToleranceMm } from '../../../geometry/surface/quality';
import { buildPotBottomRibCutters } from './bottom-ribs';
import { buildPotOuterMesh, buildPotVectorTextureMeshes } from './mesh';
import { buildPotRigidityRibs } from './rigidity-ribs';

export function buildTexturedPotOuter(
    module: ManifoldToplevel,
    parameters: PotParameters,
    texture: TextureConfig,
    tessellation: Tessellation,
    quality: BuildQuality,
    warnings: string[],
    axialTreatment?: AxialEdgeTreatment,
): Manifold {
    const vector = texture.kind !== 'smooth' && texture.kind !== 'noise' ? texture : undefined;
    const shellTexture = vector ? { kind: 'smooth' as const } : texture;
    let shell = manifoldFromRaw(
        module,
        buildPotOuterMesh(parameters, shellTexture, tessellation, axialTreatment),
    );
    if (!vector) return shell;

    const radius = Math.max(parameters.bottomDiameterMm, parameters.topDiameterMm) / 2;
    const options = {
        carrierSagittaMm: radius * (1 - Math.cos(Math.PI / tessellation.circularSegments)),
        chordErrorMm: textureToleranceMm(texture, quality),
    };
    const parts = buildPotVectorTextureMeshes(parameters, vector, options, axialTreatment).map(
        (raw) => manifoldFromRaw(module, raw),
    );
    if (!parts.length) return shell;
    const textureOperand = unionManifoldsInBatches(module, parts);
    const result =
        vector.reliefMode === 'emboss'
            ? module.Manifold.union([shell, textureOperand])
            : module.Manifold.difference([shell, textureOperand]);
    shell = discardDetachedSurfaceFragments(
        discardNumericalShells(evaluateAndDisposeInputs(result, [shell, textureOperand])),
        warnings,
    );
    return shell;
}

export function finishPot(
    module: ManifoldToplevel,
    parameters: PotParameters,
    outer: Manifold,
    tessellation: Tessellation,
    quality: BuildQuality,
    bottomRibRadiusMm = parameters.bottomDiameterMm / 2,
    connectorGroove?: { innerRadiusMm: number; outerRadiusMm: number; depthMm: number },
): Manifold {
    const bottomRadius = parameters.bottomDiameterMm / 2;
    const topRadius = parameters.topDiameterMm / 2;
    const radiusSlope = (topRadius - bottomRadius) / parameters.heightMm;
    const cavityBottomRadius = cavityFloorRadius(parameters);
    const overcutMm = 1;
    // Extrapolate with the same slope through the overcut. Using the rim radius
    // directly as the cutter's high radius changes the taper and can cut through
    // a steeply narrowing outer wall before reaching the requested height.
    const cavityOvercutRadius = topRadius + radiusSlope * overcutMm - parameters.wallThicknessMm;
    const cavityHeight = parameters.heightMm - parameters.bottomThicknessMm + overcutMm;
    const holes = resolveDrainageHoles(parameters.drainageHoles, {
        cavityFloorRadius: cavityBottomRadius,
        wallThicknessMm: parameters.wallThicknessMm,
        bottomThicknessMm: parameters.bottomThicknessMm,
    });
    const inputs: Manifold[] = [outer];
    try {
        const treatment = parameters.edgeTreatment;
        if (treatment.style === 'none') {
            inputs.push(
                translateAndDeleteSource(
                    module.Manifold.cylinder(
                        cavityHeight,
                        cavityBottomRadius,
                        cavityOvercutRadius,
                        tessellation.circularSegments,
                    ),
                    0,
                    0,
                    parameters.bottomThicknessMm,
                ),
            );
        } else {
            const axialTreatment = resolveAxialEdgeTreatment(treatment, {
                bottomWallMm: parameters.wallThicknessMm,
                bottomThicknessMm: parameters.bottomThicknessMm,
                topWallMm: parameters.wallThicknessMm,
            });
            const floorSizeMm = axialTreatment.bottomSizeMm;
            const rimSizeMm = axialTreatment.topSizeMm;
            const edgeSegments =
                treatment.style === 'rounded' ? (tessellation.edgeSegments ?? 3) : 1;
            const floor =
                treatment.style === 'rounded'
                    ? roundedRadialTransition(
                          cavityBottomRadius,
                          parameters.bottomThicknessMm,
                          floorSizeMm,
                          false,
                          edgeSegments,
                          true,
                      )
                    : ([
                          [cavityBottomRadius - floorSizeMm, parameters.bottomThicknessMm],
                          [cavityBottomRadius, parameters.bottomThicknessMm + floorSizeMm],
                      ] as Array<[number, number]>);
            const rimBaseRadius = topRadius - parameters.wallThicknessMm;
            const rim =
                treatment.style === 'rounded'
                    ? roundedRadialTransition(
                          rimBaseRadius,
                          parameters.heightMm,
                          rimSizeMm,
                          true,
                          edgeSegments,
                          false,
                      ).reverse()
                    : ([
                          [rimBaseRadius, parameters.heightMm - rimSizeMm],
                          [rimBaseRadius + rimSizeMm, parameters.heightMm],
                      ] as Array<[number, number]>);
            inputs.push(
                revolvedProfile(
                    module,
                    [
                        [0, parameters.bottomThicknessMm],
                        ...floor,
                        ...rim,
                        [cavityOvercutRadius + rimSizeMm, parameters.heightMm + overcutMm],
                        [0, parameters.heightMm + overcutMm],
                    ],
                    tessellation.circularSegments,
                ),
            );
        }

        const holeHeight = parameters.bottomThicknessMm + 2;
        for (const hole of holes) {
            const [x, y] = hole.positionMm;
            const holeRadius = hole.diameterMm / 2;
            const holeSegments = Math.max(24, tessellation.circularSegments / 3);
            if (parameters.drainageHoleRounding.enabled) {
                const rounding = parameters.drainageHoleRounding.radiusMm;
                const edgeSegments = tessellation.edgeSegments ?? 3;
                const bottom = roundedRadialTransition(
                    holeRadius,
                    0,
                    rounding,
                    true,
                    edgeSegments,
                    true,
                );
                const top = hole.countersink
                    ? [[holeRadius, parameters.bottomThicknessMm + 1] as [number, number]]
                    : roundedRadialTransition(
                          holeRadius,
                          parameters.bottomThicknessMm,
                          rounding,
                          true,
                          edgeSegments,
                          false,
                      ).reverse();
                inputs.push(
                    translateAndDeleteSource(
                        revolvedProfile(
                            module,
                            [
                                [0, -1],
                                [holeRadius + rounding, -1],
                                ...bottom,
                                ...top,
                                [
                                    holeRadius + (hole.countersink ? 0 : rounding),
                                    parameters.bottomThicknessMm + 1,
                                ],
                                [0, parameters.bottomThicknessMm + 1],
                            ],
                            holeSegments,
                        ),
                        x,
                        y,
                        0,
                    ),
                );
            } else {
                inputs.push(
                    translateAndDeleteSource(
                        module.Manifold.cylinder(holeHeight, holeRadius, holeRadius, holeSegments),
                        x,
                        y,
                        -1,
                    ),
                );
            }
            if (hole.countersink) {
                const countersinkOvercutMm = 0.05;
                inputs.push(
                    translateAndDeleteSource(
                        module.Manifold.cylinder(
                            hole.countersink.depthMm + countersinkOvercutMm,
                            holeRadius,
                            hole.countersink.diameterMm / 2,
                            Math.max(24, tessellation.circularSegments / 3),
                        ),
                        x,
                        y,
                        parameters.bottomThicknessMm - hole.countersink.depthMm,
                    ),
                );
            }
        }

        inputs.push(
            ...buildPotBottomRibCutters(
                module,
                parameters,
                quality,
                tessellation.circularSegments,
                bottomRibRadiusMm,
            ),
        );
        if (connectorGroove) {
            inputs.push(
                annularPrism(
                    module,
                    connectorGroove.innerRadiusMm,
                    connectorGroove.outerRadiusMm,
                    -0.1,
                    connectorGroove.depthMm,
                    tessellation.circularSegments,
                ),
            );
        }

        const hollowPot = discardNumericalShells(
            evaluateAndDisposeInputs(module.Manifold.difference(inputs), inputs.splice(0)),
        );
        const rigidity = buildPotRigidityRibs(
            module,
            parameters,
            tessellation.circularSegments,
            tessellation.edgeSegments ?? 3,
        );
        if (!rigidity.length) return hollowPot;
        return discardNumericalShells(
            evaluateAndDisposeInputs(module.Manifold.union([hollowPot, ...rigidity]), [
                hollowPot,
                ...rigidity,
            ]),
        );
    } catch (error) {
        for (const input of inputs) input.delete();
        throw error;
    }
}

export function buildPot(
    module: ManifoldToplevel,
    config: Extract<DesignConfig, { type: 'pot' }>,
    tessellation: Tessellation,
    quality: BuildQuality,
    warnings: string[],
): Manifold {
    const outer = buildTexturedPotOuter(
        module,
        config.parameters,
        config.texture,
        tessellation,
        quality,
        warnings,
    );
    return finishPot(module, config.parameters, outer, tessellation, quality);
}
