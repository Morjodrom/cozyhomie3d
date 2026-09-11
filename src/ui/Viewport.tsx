import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import type { MeshData, ModelPartData, ModelStats } from '../domain/worker'
import { createPreviewGeometry } from './preview-geometry'

type ViewportControls = {
  reset: () => void
  saveState: () => void
  target: Vector3
  update: () => void
}

type ViewportProps = {
  parts?: ModelPartData[]
  stats?: ModelStats
  highFidelity?: boolean
  creaseEmbossedRibs?: boolean
  previewGapMm?: number
  controlsRef?: RefObject<{ reset: () => void } | null>
}

export function previewFramingExtraMm(parts: ModelPartData[] | undefined, previewGapMm = 0): number {
  return parts && parts.length > 1 ? previewGapMm : 0
}

function GeneratedMesh({ mesh, offset, creaseNormals }: { mesh: MeshData; offset: [number, number, number]; creaseNormals: boolean }) {
  const geometry = useMemo(() => createPreviewGeometry(mesh, creaseNormals), [mesh, creaseNormals])

  useEffect(() => () => geometry.dispose(), [geometry])

  return <mesh geometry={geometry} position={offset} castShadow receiveShadow><meshStandardMaterial color="#e78135" roughness={0.55} metalness={0.04} /></mesh>
}

/**
 * Canvas only applies its `camera` initializer when the renderer is created.
 * Geometry arrives later from the worker, so changing the model dimensions did
 * not reliably move an already-created camera. Large or exploded models could
 * consequently end up behind or around the camera and appear to be missing.
 */
function CameraFit({ span, targetZ, controlsRef }: { span: number; targetZ: number; controlsRef?: RefObject<{ reset: () => void } | null> }) {
  const camera = useThree((state) => state.camera)
  const viewportSize = useThree((state) => state.size)

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return

    const target = new Vector3(0, 0, targetZ)
    const direction = new Vector3(1.35, -1.35, 1.05).normalize()
    const verticalFov = camera.fov * Math.PI / 180
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
    const limitingFov = Math.min(verticalFov, horizontalFov)
    const distance = span * 0.72 / Math.tan(limitingFov / 2)

    camera.position.copy(target).addScaledVector(direction, distance)
    camera.up.set(0, 0, 1)
    camera.near = Math.max(0.1, distance - span * 1.5)
    camera.far = distance + span * 5
    camera.lookAt(target)
    camera.updateProjectionMatrix()

    const controls = controlsRef?.current as ViewportControls | null | undefined
    if (controls) {
      controls.target.copy(target)
      controls.update()
      controls.saveState()
    }
  }, [camera, controlsRef, span, targetZ, viewportSize.height, viewportSize.width])

  return null
}

function Scene({ parts, stats, highFidelity, creaseEmbossedRibs, previewGapMm = 0, controlsRef }: ViewportProps) {
  const explodedExtra = previewFramingExtraMm(parts, previewGapMm)
  const span = Math.max(...(stats?.boundsMm ?? [120, 120, 100]), (stats?.boundsMm[2] ?? 100) + explodedExtra)
  const targetZ = ((stats?.boundsMm[2] ?? 100) + explodedExtra) / 2
  return <>
    <color attach="background" args={['#12151d']} />
    <ambientLight intensity={1.6} />
    <directionalLight position={[span, -span, span * 1.8]} intensity={2.1} castShadow />
    <directionalLight position={[-span, span, span]} intensity={0.6} />
    <Grid args={[span * 3, span * 3]} cellSize={10} cellThickness={0.65} sectionSize={50} sectionThickness={1.2} fadeDistance={span * 2.2} fadeStrength={1.1} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} />
    {parts?.map((part) => <GeneratedMesh key={part.kind} mesh={part.mesh} offset={part.previewOffsetMm} creaseNormals={Boolean(highFidelity || creaseEmbossedRibs)} />)}
    <CameraFit span={span} targetZ={targetZ} controlsRef={controlsRef} />
    <OrbitControls ref={controlsRef as never} makeDefault target={[0, 0, targetZ]} enableDamping dampingFactor={0.08} minDistance={Math.max(15, span * 0.45)} maxDistance={span * 6} />
  </>
}

export function Viewport(props: ViewportProps) {
  const explodedExtra = previewFramingExtraMm(props.parts, props.previewGapMm)
  const span = Math.max(...(props.stats?.boundsMm ?? [120, 120, 100]), (props.stats?.boundsMm[2] ?? 100) + explodedExtra)
  const targetZ = ((props.stats?.boundsMm[2] ?? 100) + explodedExtra) / 2

  return <div className="viewport" aria-label="3D preview">
    <Canvas fallback={<div className="viewport__empty">WebGL is required to preview this model.</div>} shadows camera={{ position: [span * 1.35, -span * 1.35, span * 1.05], fov: 38, near: 0.1, far: span * 6, up: [0, 0, 1] }}>
      <Scene {...props} />
    </Canvas>
    {!props.parts?.length ? <div className="viewport__empty">Your 3D model will appear here.</div> : null}
    <div className="viewport__badge">Z-up · drag to orbit · scroll to zoom · right-drag to pan</div>
  </div>
}
