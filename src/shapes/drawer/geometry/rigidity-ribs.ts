import type { DrawerParameters } from '../domain/design';
import type { RawMesh } from '../../../geometry/mesh/types';
import {
    RIB_ROOT_EMBED_MM,
    rigidityRibCenterlines,
    roundedRibProfile,
} from '../../../geometry/features/rigidity-ribs';
function rawFromLoops(
    lower: Array<[number, number, number]>,
    upper: Array<[number, number, number]>,
): RawMesh {
    const positions = new Float32Array([...lower, ...upper].flat());
    const count = lower.length;
    const indices: number[] = [];
    for (let index = 1; index < count - 1; index += 1) {
        indices.push(0, index + 1, index);
        indices.push(count, count + index, count + index + 1);
    }
    for (let index = 0; index < count; index += 1) {
        const next = (index + 1) % count;
        indices.push(index, next, count + next, index, count + next, count + index);
    }
    return { positions, indices: new Uint32Array(indices) };
}

function roundedLoop(
    center: number,
    baseWidthMm: number,
    root: number,
    apex: number,
    frontBack: boolean,
    zMm: number,
    curveSegments: number,
): Array<[number, number, number]> {
    const loop: Array<[number, number, number]> = roundedRibProfile(
        baseWidthMm,
        apex - root,
        curveSegments,
    ).map(([offset, displacement]) =>
        frontBack
            ? [center + offset, root + displacement, zMm]
            : [root + displacement, center + offset, zMm],
    );
    // CrossSection/mesh booleans require counter-clockwise horizontal loops on both sides.
    const signedArea = loop.reduce((area, point, index) => {
        const next = loop[(index + 1) % loop.length];
        return area + point[0] * next[1] - next[0] * point[1];
    }, 0);
    if (signedArea < 0) loop.reverse();
    return loop;
}

function verticalRib(
    center: number,
    baseWidthMm: number,
    root: number,
    fullApex: number,
    topApex: number,
    frontBack: boolean,
    floorMm: number,
    heightMm: number,
    curveSegments: number,
): RawMesh {
    const lower = roundedLoop(
        center,
        baseWidthMm,
        root,
        fullApex,
        frontBack,
        floorMm,
        curveSegments,
    );
    const upper = roundedLoop(
        center,
        baseWidthMm,
        root,
        topApex,
        frontBack,
        heightMm,
        curveSegments,
    );
    return rawFromLoops(lower, upper);
}

function wallGusset(
    lengthMm: number,
    root: number,
    floorApex: number,
    floorMm: number,
    topMm: number,
    frontBack: boolean,
): RawMesh {
    const half = lengthMm / 2;
    return frontBack
        ? rawFromLoops(
              [
                  [-half, root, floorMm],
                  [-half, floorApex, floorMm],
                  [-half, root, topMm],
              ],
              [
                  [half, root, floorMm],
                  [half, floorApex, floorMm],
                  [half, root, topMm],
              ],
          )
        : rawFromLoops(
              [
                  [root, -half, floorMm],
                  [floorApex, -half, floorMm],
                  [root, -half, topMm],
              ],
              [
                  [root, half, floorMm],
                  [floorApex, half, floorMm],
                  [root, half, topMm],
              ],
          );
}

/** Additive tapered vertical ribs and a continuous wall-to-floor gusset. */
export function buildDrawerRigidityRibMeshes(
    parameters: DrawerParameters,
    curveSegments: number,
): RawMesh[] {
    const ribs = parameters.rigidityRibs;
    if (!ribs.enabled) return [];
    const inside = ribs.placement === 'inside';
    const halfWidth = parameters.widthMm / 2;
    const halfDepth = parameters.depthMm / 2;
    const embed = RIB_ROOT_EMBED_MM;
    const floorMm = inside ? parameters.bottomThicknessMm : 0;
    const result: RawMesh[] = [];
    const addFrontBack = (y: number, direction: number, count: number) => {
        const root = y - direction * embed;
        const fullApex = y + direction * ribs.projectionMm;
        const topApex = y + direction * ribs.projectionMm * 0.25;
        for (const center of rigidityRibCenterlines(
            parameters.widthMm - 2 * parameters.wallThicknessMm,
            count,
        )) {
            result.push(
                verticalRib(
                    center,
                    ribs.baseWidthMm,
                    root,
                    fullApex,
                    topApex,
                    true,
                    floorMm,
                    parameters.heightMm,
                    curveSegments,
                ),
            );
        }
        result.push(
            wallGusset(
                parameters.widthMm,
                root,
                y + direction * ribs.wallBottomGussetMm,
                floorMm,
                floorMm + ribs.wallBottomGussetMm,
                true,
            ),
        );
    };
    const addSides = (x: number, direction: number, count: number) => {
        const root = x - direction * embed;
        const fullApex = x + direction * ribs.projectionMm;
        const topApex = x + direction * ribs.projectionMm * 0.25;
        for (const center of rigidityRibCenterlines(
            parameters.depthMm - 2 * parameters.wallThicknessMm,
            count,
        ))
            result.push(
                verticalRib(
                    center,
                    ribs.baseWidthMm,
                    root,
                    fullApex,
                    topApex,
                    false,
                    floorMm,
                    parameters.heightMm,
                    curveSegments,
                ),
            );
        result.push(
            wallGusset(
                parameters.depthMm,
                root,
                x + direction * ribs.wallBottomGussetMm,
                floorMm,
                floorMm + ribs.wallBottomGussetMm,
                false,
            ),
        );
    };
    const front = inside ? -halfDepth + parameters.wallThicknessMm : -halfDepth;
    const back = inside ? halfDepth - parameters.wallThicknessMm : halfDepth;
    const left = inside ? -halfWidth + parameters.wallThicknessMm : -halfWidth;
    const right = inside ? halfWidth - parameters.wallThicknessMm : halfWidth;
    const frontDirection = inside ? 1 : -1;
    const backDirection = -frontDirection;
    const leftDirection = inside ? 1 : -1;
    const rightDirection = -leftDirection;
    addFrontBack(front, frontDirection, ribs.frontBackCount);
    addFrontBack(back, backDirection, ribs.frontBackCount);
    addSides(left, leftDirection, ribs.sideCount);
    addSides(right, rightDirection, ribs.sideCount);
    return result;
}
