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
import { PerspectiveCamera, Vector3 } from 'three';
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

type ViewportProps = {
    parts?: ModelPartData[];
    stats?: ModelStats;
    highFidelity?: boolean;
    creaseEmbossedRibs?: boolean;
    previewGapMm?: number;
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
): CameraFraming {
    const target = new Vector3(0, 0, targetZ);
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
): number {
    const modelCenter = new Vector3(0, 0, targetZ);
    return Math.max(currentFar, cameraPosition.distanceTo(modelCenter) + span * 5);
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

function CameraController({
    span,
    targetZ,
    hasModel,
    controlsRef,
    orbitControlsRef,
}: {
    span: number;
    targetZ: number;
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
        const framing = calculateCameraFraming(span, targetZ, verticalFov, camera.aspect);

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
    }, [camera, orbitControlsRef, span, targetZ, viewportSize.height, viewportSize.width]);

    useImperativeHandle(controlsRef, () => ({ reset: frameCurrentModel }), [frameCurrentModel]);

    useEffect(() => {
        if (!shouldAutoFrameCamera(hasModel, hasFramedInitialModel.current)) return;
        frameCurrentModel();
        hasFramedInitialModel.current = true;
    }, [frameCurrentModel, hasModel]);

    useEffect(() => {
        if (!(camera instanceof PerspectiveCamera) || !hasModel) return;

        camera.near = Math.min(camera.near, 0.1);
        camera.far = expandedCameraFar(camera.far, camera.position, span, targetZ);
        camera.updateProjectionMatrix();
    }, [camera, hasModel, span, targetZ]);

    return null;
}

function Scene({
    parts,
    stats,
    highFidelity,
    creaseEmbossedRibs,
    previewGapMm = 0,
    controlsRef,
}: ViewportProps) {
    const orbitControlsRef = useRef<ViewportControls | null>(null);
    const explodedExtra = previewFramingExtraMm(parts, previewGapMm);
    const span = Math.max(
        ...(stats?.boundsMm ?? [120, 120, 100]),
        (stats?.boundsMm[2] ?? 100) + explodedExtra,
    );
    const targetZ = ((stats?.boundsMm[2] ?? 100) + explodedExtra) / 2;
    return (
        <>
            <color attach="background" args={['#12151d']} />
            <ambientLight intensity={1.6} />
            <directionalLight position={[span, -span, span * 1.8]} intensity={2.1} castShadow />
            <directionalLight position={[-span, span, span]} intensity={0.6} />
            <Grid
                args={[span * 3, span * 3]}
                cellSize={10}
                cellThickness={0.65}
                sectionSize={50}
                sectionThickness={1.2}
                fadeDistance={span * 2.2}
                fadeStrength={1.1}
                position={[0, 0, 0]}
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
            <CameraController
                span={span}
                targetZ={targetZ}
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
    const span = Math.max(
        ...(props.stats?.boundsMm ?? [120, 120, 100]),
        (props.stats?.boundsMm[2] ?? 100) + explodedExtra,
    );
    const targetZ = ((props.stats?.boundsMm[2] ?? 100) + explodedExtra) / 2;

    return (
        <div className="viewport" aria-label="3D preview">
            <Canvas
                fallback={
                    <div className="viewport__empty">WebGL is required to preview this model.</div>
                }
                shadows
                camera={{
                    position: [span * 1.35, -span * 1.35, span * 1.05],
                    fov: 38,
                    near: 0.1,
                    far: span * 6,
                    up: [0, 0, 1],
                }}
            >
                <Scene {...props} />
            </Canvas>
            {!props.parts?.length ? (
                <div className="viewport__empty">Your 3D model will appear here.</div>
            ) : null}
            <div className="viewport__badge">
                Z-up · drag to orbit · scroll to zoom · right-drag to pan
            </div>
        </div>
    );
}
