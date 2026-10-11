import { Grid, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import {
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    type RefObject,
} from 'react';
import { BufferGeometry, Float32BufferAttribute, PerspectiveCamera, Vector3 } from 'three';
import type { MeshData, ModelPartData, ModelStats } from '../domain/worker';
import { createPreviewGeometry } from './preview-geometry';

type ViewportControls = {
    maxDistance: number;
    minDistance: number;
    reset: () => void;
    saveState: () => void;
    target: Vector3;
    update: () => void;
};

export type ViewportControlsHandle = {
    reset: () => void;
};

export type CameraFraming = {
    distance: number;
    far: number;
    maxDistance: number;
    minDistance: number;
    near: number;
    position: [number, number, number];
    target: [number, number, number];
};

export type CircularLoftHighlight = {
    circleIndex: number;
    diameterMm: number;
    sectionIndex: number;
    xMm: number;
    yMm: number;
    zMm: number;
};

type ViewportProps = {
    parts?: ModelPartData[];
    stats?: ModelStats;
    highFidelity?: boolean;
    creaseEmbossedRibs?: boolean;
    previewGapMm?: number;
    circularLoftHighlight?: CircularLoftHighlight;
    controlsRef?: RefObject<ViewportControlsHandle | null>;
};

export function previewFramingExtraMm(
    parts: ModelPartData[] | undefined,
    previewGapMm = 0,
): number {
    return parts && parts.length > 1 ? previewGapMm : 0;
}

export function calculateCameraFraming(
    span: number,
    targetZ: number,
    verticalFov: number,
    aspect: number,
    targetXY: [number, number] = [0, 0],
): CameraFraming {
    const target = new Vector3(targetXY[0], targetXY[1], targetZ);
    const direction = new Vector3(1.35, -1.35, 1.05).normalize();
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const distance = (span * 0.72) / Math.tan(limitingFov / 2);
    const position = target.clone().addScaledVector(direction, distance);

    return {
        distance,
        far: distance + span * 5,
        maxDistance: span * 6,
        minDistance: Math.max(15, span * 0.45),
        near: Math.max(0.1, distance - span * 1.5),
        position: position.toArray(),
        target: target.toArray(),
    };
}

export function expandedCameraFar(
    currentFar: number,
    cameraPosition: Vector3,
    span: number,
    targetZ: number,
    targetXY: [number, number] = [0, 0],
): number {
    const modelCenter = new Vector3(targetXY[0], targetXY[1], targetZ);
    return Math.max(currentFar, cameraPosition.distanceTo(modelCenter) + span * 5);
}

export function circularLoftContourPositions(
    highlight: CircularLoftHighlight,
    segments = 96,
): Float32Array {
    if (highlight.diameterMm === 0)
        return new Float32Array([highlight.xMm, highlight.yMm, highlight.zMm]);
    const positions = new Float32Array(segments * 3);
    const radiusMm = highlight.diameterMm / 2;
    for (let index = 0; index < segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        const offset = index * 3;
        positions[offset] = highlight.xMm + radiusMm * Math.cos(angle);
        positions[offset + 1] = highlight.yMm + radiusMm * Math.sin(angle);
        positions[offset + 2] = highlight.zMm;
    }
    return positions;
}

type GeneratedBounds = {
    center: [number, number, number];
    span: number;
};

export function generatedMeshBounds(parts: ModelPartData[]): GeneratedBounds | undefined {
    let minimumX = Number.POSITIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let minimumZ = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    let maximumZ = Number.NEGATIVE_INFINITY;
    for (const part of parts) {
        for (let index = 0; index < part.mesh.positions.length; index += 3) {
            minimumX = Math.min(minimumX, part.mesh.positions[index] + part.previewOffsetMm[0]);
            minimumY = Math.min(minimumY, part.mesh.positions[index + 1] + part.previewOffsetMm[1]);
            minimumZ = Math.min(minimumZ, part.mesh.positions[index + 2] + part.previewOffsetMm[2]);
            maximumX = Math.max(maximumX, part.mesh.positions[index] + part.previewOffsetMm[0]);
            maximumY = Math.max(maximumY, part.mesh.positions[index + 1] + part.previewOffsetMm[1]);
            maximumZ = Math.max(maximumZ, part.mesh.positions[index + 2] + part.previewOffsetMm[2]);
        }
    }
    if (!Number.isFinite(minimumX)) return undefined;
    return {
        center: [(minimumX + maximumX) / 2, (minimumY + maximumY) / 2, (minimumZ + maximumZ) / 2],
        span: Math.max(maximumX - minimumX, maximumY - minimumY, maximumZ - minimumZ),
    };
}

export function shouldAutoFrameCamera(hasModel: boolean, hasFramedInitialModel: boolean): boolean {
    return hasModel && !hasFramedInitialModel;
}

function GeneratedMesh({
    mesh,
    offset,
    creaseNormals,
}: {
    mesh: MeshData;
    offset: [number, number, number];
    creaseNormals: boolean;
}) {
    const geometry = useMemo(
        () => createPreviewGeometry(mesh, creaseNormals),
        [mesh, creaseNormals],
    );

    useEffect(() => () => geometry.dispose(), [geometry]);

    return (
        <mesh geometry={geometry} position={offset} castShadow receiveShadow>
            <meshStandardMaterial color="#e78135" roughness={0.55} metalness={0.04} />
        </mesh>
    );
}

function CircularLoftContour({ highlight }: { highlight: CircularLoftHighlight }) {
    const geometry = useMemo(() => {
        const contour = new BufferGeometry();
        contour.setAttribute(
            'position',
            new Float32BufferAttribute(circularLoftContourPositions(highlight), 3),
        );
        return contour;
    }, [highlight]);

    useEffect(() => () => geometry.dispose(), [geometry]);

    if (highlight.diameterMm === 0) {
        return (
            <points geometry={geometry} renderOrder={10}>
                <pointsMaterial
                    color="#fff4a6"
                    size={7}
                    sizeAttenuation={false}
                    depthTest={false}
                    depthWrite={false}
                />
            </points>
        );
    }

    return (
        <lineLoop geometry={geometry} renderOrder={10}>
            <lineBasicMaterial color="#fff4a6" depthTest={false} depthWrite={false} />
        </lineLoop>
    );
}

function CameraController({
    span,
    targetZ,
    targetX,
    targetY,
    hasModel,
    controlsRef,
    orbitControlsRef,
}: {
    span: number;
    targetZ: number;
    targetX: number;
    targetY: number;
    hasModel: boolean;
    controlsRef?: RefObject<ViewportControlsHandle | null>;
    orbitControlsRef: RefObject<ViewportControls | null>;
}) {
    const camera = useThree((state) => state.camera);
    const viewportSize = useThree((state) => state.size);
    const hasFramedInitialModel = useRef(false);

    const frameCurrentModel = useCallback(() => {
        if (!(camera instanceof PerspectiveCamera)) return;
        const controls = orbitControlsRef.current;
        if (!controls) return;

        const verticalFov = (camera.fov * Math.PI) / 180;
        const framing = calculateCameraFraming(span, targetZ, verticalFov, camera.aspect, [
            targetX,
            targetY,
        ]);

        camera.position.fromArray(framing.position);
        camera.up.set(0, 0, 1);
        camera.near = framing.near;
        camera.far = framing.far;
        camera.lookAt(...framing.target);
        camera.updateProjectionMatrix();

        controls.target.fromArray(framing.target);
        controls.minDistance = framing.minDistance;
        controls.maxDistance = framing.maxDistance;
        controls.update();
        controls.saveState();
    }, [
        camera,
        orbitControlsRef,
        span,
        targetX,
        targetY,
        targetZ,
        viewportSize.height,
        viewportSize.width,
    ]);

    useImperativeHandle(controlsRef, () => ({ reset: frameCurrentModel }), [frameCurrentModel]);

    useEffect(() => {
        if (!shouldAutoFrameCamera(hasModel, hasFramedInitialModel.current)) return;
        frameCurrentModel();
        hasFramedInitialModel.current = true;
    }, [frameCurrentModel, hasModel]);

    useEffect(() => {
        if (!(camera instanceof PerspectiveCamera) || !hasModel) return;

        camera.near = Math.min(camera.near, 0.1);
        camera.far = expandedCameraFar(camera.far, camera.position, span, targetZ, [
            targetX,
            targetY,
        ]);
        camera.updateProjectionMatrix();
    }, [camera, hasModel, span, targetX, targetY, targetZ]);

    return null;
}

type SceneProps = ViewportProps & {
    hasCircularLoft: boolean;
    loftBounds?: GeneratedBounds;
};

function Scene({
    parts,
    stats,
    highFidelity,
    creaseEmbossedRibs,
    previewGapMm = 0,
    circularLoftHighlight,
    controlsRef,
    hasCircularLoft,
    loftBounds,
}: SceneProps) {
    const orbitControlsRef = useRef<ViewportControls | null>(null);
    const explodedExtra = previewFramingExtraMm(parts, previewGapMm);
    const defaultSpan = Math.max(
        ...(stats?.boundsMm ?? [120, 120, 100]),
        (stats?.boundsMm[2] ?? 100) + explodedExtra,
    );
    const defaultTargetZ = ((stats?.boundsMm[2] ?? 100) + explodedExtra) / 2;
    const span = Math.max(defaultSpan, loftBounds?.span ?? 0);
    const targetX = loftBounds?.center[0] ?? 0;
    const targetY = loftBounds?.center[1] ?? 0;
    const targetZ = loftBounds?.center[2] ?? defaultTargetZ;
    return (
        <>
            <color attach="background" args={['#12151d']} />
            <ambientLight intensity={1.6} />
            <directionalLight
                position={[
                    hasCircularLoft ? targetX + span : span,
                    hasCircularLoft ? targetY - span : -span,
                    hasCircularLoft ? targetZ + span * 1.8 : span * 1.8,
                ]}
                intensity={2.1}
                castShadow
            />
            <directionalLight
                position={[
                    hasCircularLoft ? targetX - span : -span,
                    hasCircularLoft ? targetY + span : span,
                    hasCircularLoft ? targetZ + span : span,
                ]}
                intensity={0.6}
            />
            <Grid
                args={[span * 3, span * 3]}
                cellSize={10}
                cellThickness={0.65}
                sectionSize={50}
                sectionThickness={1.2}
                fadeDistance={span * 2.2}
                fadeStrength={1.1}
                position={[hasCircularLoft ? targetX : 0, hasCircularLoft ? targetY : 0, 0]}
                rotation={[Math.PI / 2, 0, 0]}
            />
            {parts?.map((part) => (
                <GeneratedMesh
                    key={part.kind}
                    mesh={part.mesh}
                    offset={part.previewOffsetMm}
                    creaseNormals={Boolean(highFidelity || creaseEmbossedRibs)}
                />
            ))}
            {circularLoftHighlight ? (
                <CircularLoftContour highlight={circularLoftHighlight} />
            ) : null}
            <CameraController
                span={span}
                targetZ={targetZ}
                targetX={targetX}
                targetY={targetY}
                hasModel={Boolean(parts?.length && stats)}
                controlsRef={controlsRef}
                orbitControlsRef={orbitControlsRef}
            />
            <OrbitControls
                ref={orbitControlsRef as never}
                makeDefault
                enableDamping
                dampingFactor={0.08}
            />
        </>
    );
}

export function Viewport(props: ViewportProps) {
    const explodedExtra = previewFramingExtraMm(props.parts, props.previewGapMm);
    const defaultSpan = Math.max(
        ...(props.stats?.boundsMm ?? [120, 120, 100]),
        (props.stats?.boundsMm[2] ?? 100) + explodedExtra,
    );
    const hasCircularLoft = Boolean(props.parts?.some((part) => part.kind === 'circular-loft'));
    const loftBounds = useMemo(
        () => (hasCircularLoft && props.parts ? generatedMeshBounds(props.parts) : undefined),
        [hasCircularLoft, props.parts],
    );
    const span = Math.max(defaultSpan, loftBounds?.span ?? 0);
    const targetX = loftBounds?.center[0] ?? 0;
    const targetY = loftBounds?.center[1] ?? 0;
    const targetZ =
        loftBounds?.center[2] ?? ((props.stats?.boundsMm[2] ?? 100) + explodedExtra) / 2;

    return (
        <div className="viewport" aria-label="3D preview">
            <Canvas
                fallback={
                    <div className="viewport__empty">WebGL is required to preview this model.</div>
                }
                shadows
                camera={{
                    position: [
                        hasCircularLoft ? targetX + span * 1.35 : span * 1.35,
                        hasCircularLoft ? targetY - span * 1.35 : -span * 1.35,
                        hasCircularLoft ? targetZ + span * 1.05 : span * 1.05,
                    ],
                    fov: 38,
                    near: 0.1,
                    far: span * 6,
                    up: [0, 0, 1],
                }}
            >
                <Scene {...props} hasCircularLoft={hasCircularLoft} loftBounds={loftBounds} />
            </Canvas>
            {!props.parts?.length ? (
                <div className="viewport__empty">Your 3D model will appear here.</div>
            ) : null}
            {props.circularLoftHighlight ? (
                <div className="viewport__selection" role="status">
                    Highlighted section {props.circularLoftHighlight.sectionIndex + 1},{' '}
                    {props.circularLoftHighlight.circleIndex % 2 === 0 ? 'material' : 'void'}{' '}
                    boundary {props.circularLoftHighlight.circleIndex + 1}.
                </div>
            ) : null}
            <div className="viewport__badge">
                Z-up · drag to orbit · scroll to zoom · right-drag to pan
            </div>
        </div>
    );
}
