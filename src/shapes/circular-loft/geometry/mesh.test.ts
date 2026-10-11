import { describe, expect, it } from 'vitest';
import { circularLoftOffsetFromCenter } from '../domain/design';
import { buildCircularLoftIntervalMesh } from './mesh';

describe('polar offsets in interval meshes', () => {
    it.each([
        { name: 'eccentric wall', lowerDiameter: 60, upperDiameter: 40 },
        { name: 'lower shifted tip', lowerDiameter: 0, upperDiameter: 40 },
        { name: 'upper shifted tip', lowerDiameter: 60, upperDiameter: 0 },
    ])(
        'retains Cartesian ring and tip coordinates for $name',
        ({ lowerDiameter, upperDiameter }) => {
            const lower = { diameterMm: lowerDiameter, ...circularLoftOffsetFromCenter(3, -4) };
            const upper = { diameterMm: upperDiameter, ...circularLoftOffsetFromCenter(-5, 7) };
            const mesh = buildCircularLoftIntervalMesh(lower, upper, 0, 30, 16)!;
            const expected: number[] = [];
            for (const endpoint of [
                { x: 3, y: -4, z: 0, diameter: lowerDiameter },
                { x: -5, y: 7, z: 30, diameter: upperDiameter },
            ]) {
                if (endpoint.diameter === 0) expected.push(endpoint.x, endpoint.y, endpoint.z);
                else
                    for (let segment = 0; segment < 16; segment++) {
                        const angle = (segment / 16) * Math.PI * 2;
                        expected.push(
                            endpoint.x + (endpoint.diameter / 2) * Math.cos(angle),
                            endpoint.y + (endpoint.diameter / 2) * Math.sin(angle),
                            endpoint.z,
                        );
                    }
            }
            const boundaryPositions = Array.from(mesh.positions.slice(0, expected.length));
            expect(boundaryPositions).toHaveLength(expected.length);
            for (let i = 0; i < expected.length; i++)
                expect(boundaryPositions[i]).toBeCloseTo(expected[i], 5);
            const equivalent = buildCircularLoftIntervalMesh(
                { ...lower, offsetAngleDeg: lower.offsetAngleDeg - 720 },
                { ...upper, offsetAngleDeg: upper.offsetAngleDeg + 360 },
                0,
                30,
                16,
            )!;
            expect(equivalent.indices).toEqual(mesh.indices);
            for (let i = 0; i < mesh.positions.length; i++)
                expect(equivalent.positions[i]).toBeCloseTo(mesh.positions[i], 5);
        },
    );
});
