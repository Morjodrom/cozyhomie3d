import type { CircularLoftCircle } from '../domain/design';
import { capLoop, connectLoops } from '../../../geometry/mesh/loops';
import type { RawMesh } from '../../../geometry/mesh/types';

/** Builds one closed, linearly tapered and laterally offset circular interval. */
export function buildCircularLoftIntervalMesh(
    lower: CircularLoftCircle,
    upper: CircularLoftCircle,
    lowerZMm: number,
    upperZMm: number,
    segments: number,
): RawMesh | undefined {
    const lowerIsTip = lower.diameterMm === 0;
    const upperIsTip = upper.diameterMm === 0;
    if (lowerIsTip && upperIsTip) return undefined;

    const positions: number[] = [];
    const indices: number[] = [];

    const addRing = (circle: CircularLoftCircle, zMm: number): number => {
        const start = positions.length / 3;
        const radiusMm = circle.diameterMm / 2;
        for (let segment = 0; segment < segments; segment += 1) {
            const angle = (segment / segments) * Math.PI * 2;
            positions.push(
                circle.xMm + radiusMm * Math.cos(angle),
                circle.yMm + radiusMm * Math.sin(angle),
                zMm,
            );
        }
        return start;
    };

    if (lowerIsTip) {
        const lowerTip = positions.length / 3;
        positions.push(lower.xMm, lower.yMm, lowerZMm);
        const upperStart = addRing(upper, upperZMm);
        for (let segment = 0; segment < segments; segment += 1) {
            const next = (segment + 1) % segments;
            indices.push(lowerTip, upperStart + next, upperStart + segment);
        }
        const upperCenter = positions.length / 3;
        positions.push(upper.xMm, upper.yMm, upperZMm);
        capLoop(indices, upperStart, segments, upperCenter, true);
    } else if (upperIsTip) {
        const lowerStart = addRing(lower, lowerZMm);
        const upperTip = positions.length / 3;
        positions.push(upper.xMm, upper.yMm, upperZMm);
        for (let segment = 0; segment < segments; segment += 1) {
            const next = (segment + 1) % segments;
            indices.push(lowerStart + segment, lowerStart + next, upperTip);
        }
        const lowerCenter = positions.length / 3;
        positions.push(lower.xMm, lower.yMm, lowerZMm);
        capLoop(indices, lowerStart, segments, lowerCenter, false);
    } else {
        const lowerStart = addRing(lower, lowerZMm);
        const upperStart = addRing(upper, upperZMm);
        connectLoops(indices, lowerStart, upperStart, segments);

        const lowerCenter = positions.length / 3;
        positions.push(lower.xMm, lower.yMm, lowerZMm);
        capLoop(indices, lowerStart, segments, lowerCenter, false);

        const upperCenter = positions.length / 3;
        positions.push(upper.xMm, upper.yMm, upperZMm);
        capLoop(indices, upperStart, segments, upperCenter, true);
    }

    const vertices = new Float32Array(positions);
    if (!vertices.every(Number.isFinite)) {
        throw new Error('Circular-loft coordinates exceed the numeric range of the mesh.');
    }
    return { positions: vertices, indices: new Uint32Array(indices) };
}
