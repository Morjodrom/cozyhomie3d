import type { DesignConfig } from '../domain/design';
import { designConfigSchema } from '../domain/design';
import type { BuildQuality, GeometryBuildStage } from '../domain/worker';
import type { Manifold } from 'manifold-3d';
import { buildDrawer } from '../shapes/drawer/geometry/build';
import { buildCircularLoft, validateCircularLoft } from '../shapes/circular-loft/geometry/build';
import { buildPotWithTray } from '../shapes/pot-with-tray/geometry/build';
import { extractPotWithTrayGeometry } from '../shapes/pot-with-tray/geometry/extract';
import { buildPot } from '../shapes/pot/geometry/build';
import { getManifoldModule } from './engine/manifold';
import { validateComponentCount, validateSingleSolid } from './engine/operations';
import { extractGeometry, type GeometryResult } from './mesh/extract';
import { assertBooleanOperandBudget } from './preflight';
import { planTessellation } from './tessellation';

export async function buildGeometry(
    config: DesignConfig,
    quality: BuildQuality,
    onStage?: (stage: GeometryBuildStage) => void,
): Promise<GeometryResult> {
    const parsed = designConfigSchema.safeParse(config);
    if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid model settings.');

    // Reject combinatorial boolean work before loading the geometry engine or
    // allocating any mesh inputs. This is a hard guard, never a simplification.
    assertBooleanOperandBudget(parsed.data);

    onStage?.('loading-engine');
    const module = await getManifoldModule();
    onStage?.('planning');
    const plan = planTessellation(parsed.data, quality);

    let manifold: Manifold | undefined;
    let trayManifold: Manifold | undefined;
    try {
        onStage?.('constructing');
        if (parsed.data.type === 'pot-with-tray') {
            const parts = buildPotWithTray(
                module,
                parsed.data,
                plan.tessellation,
                quality,
                plan.warnings,
            );
            manifold = parts.pot;
            trayManifold = parts.tray;
            onStage?.('validating');
            const expectedComponents =
                parsed.data.bedAdhesionBeams.count > 0 &&
                parsed.data.bedAdhesionBeams.breakawayDistanceMm < 0
                    ? 1
                    : parsed.data.bedAdhesionBeams.count + 1;
            validateComponentCount(manifold, expectedComponents);
            validateComponentCount(trayManifold, expectedComponents);
            onStage?.('preparing-mesh');
            return extractPotWithTrayGeometry(manifold, trayManifold, parsed.data, plan.warnings);
        }
        if (parsed.data.type === 'pot')
            manifold = buildPot(module, parsed.data, plan.tessellation, quality, plan.warnings);
        else if (parsed.data.type === 'drawer')
            manifold = buildDrawer(module, parsed.data, plan.tessellation, quality);
        else manifold = buildCircularLoft(module, parsed.data, plan.tessellation);
        onStage?.('validating');
        if (parsed.data.type === 'circular-loft') validateCircularLoft(manifold);
        else validateSingleSolid(manifold);
        onStage?.('preparing-mesh');
        return extractGeometry(manifold, parsed.data.type, plan.warnings);
    } finally {
        manifold?.delete();
        trayManifold?.delete();
    }
}
