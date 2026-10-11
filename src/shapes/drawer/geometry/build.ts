import type { DesignConfig } from '../../../domain/design';
import type { BuildQuality } from '../../../domain/worker';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import {
    discardNumericalShells,
    evaluateAndDisposeInputs,
    manifoldFromRaw,
    unionManifoldsInBatches,
} from '../../../geometry/engine/operations';

import type { Tessellation } from '../../../geometry/mesh/types';
import { vectorOptions } from '../../../geometry/tessellation';
import {
    roundedRectangleFrameAlongY,
    roundedRectanglePrismAlongY,
} from '../../../geometry/primitives/rounded-rectangle';
import { buildDrawerBottomRibCutters } from './bottom-ribs';
import {
    buildDrawerCavityMesh,
    buildDrawerHandleMesh,
    buildDrawerOuterMesh,
    buildDrawerVectorTextureMeshes,
    drawerHandleBounds,
} from './mesh';
import { buildDrawerRigidityRibMeshes } from './rigidity-ribs';

export function buildDrawer(
    module: ManifoldToplevel,
    config: Extract<DesignConfig, { type: 'drawer' }>,
    tessellation: Tessellation,
    quality: BuildQuality,
): Manifold {
    const parameters = config.parameters;
    const owned: Manifold[] = [];
    try {
        const vector =
            config.texture.kind !== 'smooth' && config.texture.kind !== 'noise'
                ? config.texture
                : undefined;
        const shellTexture = vector ? { kind: 'smooth' as const } : config.texture;
        owned.push(
            manifoldFromRaw(
                module,
                buildDrawerOuterMesh(parameters, shellTexture, config.textureWalls, tessellation),
            ),
        );
        if (vector) {
            const parts = buildDrawerVectorTextureMeshes(
                parameters,
                vector,
                config.textureWalls,
                vectorOptions(config, quality, tessellation),
            ).map((raw) => manifoldFromRaw(module, raw));
            if (parts.length) {
                const shell = owned.shift()!;
                const textureOperand = unionManifoldsInBatches(module, parts);
                const result =
                    vector.reliefMode === 'emboss'
                        ? module.Manifold.union([shell, textureOperand])
                        : module.Manifold.difference([shell, textureOperand]);
                owned.push(
                    discardNumericalShells(
                        evaluateAndDisposeInputs(result, [shell, textureOperand]),
                    ),
                );
            }
        }
        owned.push(manifoldFromRaw(module, buildDrawerCavityMesh(parameters, tessellation)));
        owned.push(...buildDrawerBottomRibCutters(module, parameters, quality));
        const hollowDrawer = discardNumericalShells(
            evaluateAndDisposeInputs(module.Manifold.difference(owned), owned.splice(0)),
        );
        const rigidity = buildDrawerRigidityRibMeshes(
            parameters,
            tessellation.edgeSegments ?? 3,
        ).map((raw) => manifoldFromRaw(module, raw));
        const reinforcedShell = rigidity.length
            ? discardNumericalShells(
                  evaluateAndDisposeInputs(module.Manifold.union([hollowDrawer, ...rigidity]), [
                      hollowDrawer,
                      ...rigidity,
                  ]),
              )
            : hollowDrawer;

        if (parameters.handleStyle === 'projecting') {
            owned.push(reinforcedShell);
            owned.push(manifoldFromRaw(module, buildDrawerHandleMesh(parameters)));
            return discardNumericalShells(
                evaluateAndDisposeInputs(module.Manifold.union(owned), owned.splice(0)),
            );
        }

        const bounds = drawerHandleBounds(parameters);
        const wallMm = parameters.wallThicknessMm;
        const outerFrontY = -parameters.depthMm / 2;
        const innerFrontY = outerFrontY + wallMm;
        const ribStartY = outerFrontY - wallMm;
        const ribEndY = innerFrontY + parameters.handleDepthMm;
        const centerZ = (bounds.openingBottomZMm + bounds.openingTopZMm) / 2;
        const segmentsPerCorner = Math.max(2, Math.ceil(tessellation.circularSegments / 12));
        owned.push(reinforcedShell);
        owned.push(
            roundedRectangleFrameAlongY(
                module,
                parameters.handleWidthMm,
                parameters.handleHeightMm,
                parameters.handleCornerRadiusMm,
                wallMm,
                ribStartY,
                ribEndY,
                centerZ,
                segmentsPerCorner,
            ),
        );
        const reinforcedDrawer = evaluateAndDisposeInputs(
            module.Manifold.union(owned),
            owned.splice(0),
        );

        const overcutMm = 1;
        owned.push(reinforcedDrawer);
        owned.push(
            roundedRectanglePrismAlongY(
                module,
                parameters.handleWidthMm,
                parameters.handleHeightMm,
                parameters.handleCornerRadiusMm,
                ribStartY - overcutMm,
                ribEndY + overcutMm,
                centerZ,
                segmentsPerCorner,
            ),
        );
        return discardNumericalShells(
            evaluateAndDisposeInputs(module.Manifold.difference(owned), owned.splice(0)),
        );
    } catch (error) {
        for (const manifold of owned) manifold.delete();
        throw error;
    }
}
