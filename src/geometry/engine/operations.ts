import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { RawMesh } from '../mesh/types';
import { MAX_BOOLEAN_OPERANDS } from '../preflight';

const VECTOR_TEXTURE_BOOLEAN_BATCH_SIZE = 64;

export function manifoldFromRaw(module: ManifoldToplevel, raw: RawMesh): Manifold {
    const mesh = new module.Mesh({
        numProp: 3,
        vertProperties: raw.positions,
        triVerts: raw.indices,
    });
    const manifold = module.Manifold.ofMesh(mesh);
    const status = manifold.status();
    if (status !== 'NoError') {
        manifold.delete();
        throw new Error(`Generated surface is not manifold (${status}).`);
    }
    return manifold;
}

export function evaluateAndDisposeInputs(result: Manifold, inputs: Manifold[]): Manifold {
    let status;
    try {
        status = result.status();
    } catch (error) {
        result.delete();
        throw error;
    } finally {
        for (const input of inputs) input.delete();
    }
    if (status !== 'NoError') {
        result.delete();
        throw new Error(`Geometry operation failed (${status}).`);
    }
    return result;
}

export function unionManifoldsInBatches(module: ManifoldToplevel, operands: Manifold[]): Manifold {
    const queue = [...operands];
    try {
        while (queue.length > MAX_BOOLEAN_OPERANDS) {
            const batch = queue.splice(0, VECTOR_TEXTURE_BOOLEAN_BATCH_SIZE);
            let result;
            try {
                result = module.Manifold.union(batch);
            } catch (error) {
                for (const operand of batch) operand.delete();
                throw error;
            }
            queue.push(evaluateAndDisposeInputs(result, batch));
        }
        if (queue.length === 1) return queue.pop()!;
        return evaluateAndDisposeInputs(module.Manifold.union(queue), queue.splice(0));
    } catch (error) {
        for (const operand of queue) operand.delete();
        throw error;
    }
}

/**
 * Large vector boolean batches can leave zero-volume numerical shells at
 * coincident stroke joins.  They are not printable components; retain the one
 * physical solid while still allowing validateSingleSolid() to reject any
 * genuinely disconnected volume.
 */
export function discardNumericalShells(manifold: Manifold): Manifold {
    const components = manifold.decompose();
    // The minimum legal texture can create roughly 0.036 mm³ of material, so
    // this remains safely below any intentional printable feature.
    // A disconnected printable component has positive oriented volume. Tiny or
    // negative shells are cancellation debris produced at coincident coplanar
    // joins, not material that should survive to the exported solid.
    const physical = components.filter((component) => component.volume() > 0.005);
    if (physical.length !== 1 || components.length === 1) {
        for (const component of components) component.delete();
        return manifold;
    }
    const result = physical[0];
    for (const component of components) if (component !== result) component.delete();
    manifold.delete();
    return result;
}

/**
 * Vector textures are built as separate cutter/additive meshes. At a handful
 * of parameter combinations, boolean round-off can leave small positive-volume
 * texture islands next to the otherwise valid pot shell. They must not make
 * the complete printable body fail validation or appear as floating STL parts.
 */
export function discardDetachedSurfaceFragments(manifold: Manifold, warnings: string[]): Manifold {
    const components = manifold.decompose();
    if (components.length <= 1) {
        for (const component of components) component.delete();
        return manifold;
    }

    const ranked = components
        .map((component) => ({ component, volume: Math.max(0, component.volume()) }))
        .sort((a, b) => b.volume - a.volume);
    const totalVolume = ranked.reduce((sum, entry) => sum + entry.volume, 0);
    const dominant = ranked[0];

    // Only repair a clearly dominant body. Comparable components indicate a
    // genuine structural disconnection and must still fail the strict validator.
    if (!dominant || dominant.volume <= 0 || dominant.volume / totalVolume < 0.9) {
        for (const entry of ranked) entry.component.delete();
        return manifold;
    }

    for (const entry of ranked.slice(1)) entry.component.delete();
    manifold.delete();
    if (
        !warnings.includes('Detached surface fragments were omitted to keep the model printable.')
    ) {
        warnings.push('Detached surface fragments were omitted to keep the model printable.');
    }
    return dominant.component;
}

export function validateSingleSolid(manifold: Manifold): void {
    if (manifold.isEmpty() || manifold.volume() <= 0) {
        throw new Error('Generated model is empty.');
    }

    const components = manifold.decompose();
    const componentCount = components.length;
    for (const component of components) component.delete();
    if (componentCount !== 1) {
        throw new Error('Generated model contains disconnected parts.');
    }
}

export function validateComponentCount(manifold: Manifold, expectedCount: number): void {
    if (manifold.isEmpty() || manifold.volume() <= 0) {
        throw new Error('Generated model is empty.');
    }

    const components = manifold.decompose();
    const componentCount = components.length;
    for (const component of components) component.delete();
    if (componentCount !== expectedCount) {
        throw new Error(
            `Generated model contains ${componentCount} printable components instead of ${expectedCount}.`,
        );
    }
}
