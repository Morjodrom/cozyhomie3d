import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
import * as THREE from 'three'
import type { MeshData, ModelStats } from '../domain/worker'

type ViewportProps = {
  mesh?: MeshData
  stats?: ModelStats
  controlsRef?: RefObject<{ reset: () => void } | null>
}

function GeneratedMesh({ mesh }: { mesh: MeshData }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
    next.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
    next.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
    next.computeBoundingSphere()
    return next
  }, [mesh])

  useEffect(() => () => geometry.dispose(), [geometry])

  return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color="#e78135" roughness={0.55} metalness={0.04} /></mesh>
}

function Scene({ mesh, stats, controlsRef }: ViewportProps) {
  const span = Math.max(...(stats?.boundsMm ?? [120, 120, 100]))
  const targetZ = (stats?.boundsMm[2] ?? 100) / 2
  return <>
    <color attach="background" args={['#12151d']} />
    <ambientLight intensity={1.6} />
    <directionalLight position={[span, -span, span * 1.8]} intensity={2.1} castShadow />
    <directionalLight position={[-span, span, span]} intensity={0.6} />
    <Grid args={[span * 3, span * 3]} cellSize={10} cellThickness={0.65} sectionSize={50} sectionThickness={1.2} fadeDistance={span * 2.2} fadeStrength={1.1} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} />
    {mesh ? <GeneratedMesh mesh={mesh} /> : null}
    <OrbitControls ref={controlsRef as never} makeDefault target={[0, 0, targetZ]} enableDamping dampingFactor={0.08} minDistance={Math.max(15, span * 0.45)} maxDistance={span * 6} />
  </>
}

export function Viewport(props: ViewportProps) {
  const span = Math.max(...(props.stats?.boundsMm ?? [120, 120, 100]))
  const targetZ = (props.stats?.boundsMm[2] ?? 100) / 2

  return <div className="viewport" aria-label="3D preview">
    <Canvas fallback={<div className="viewport__empty">WebGL is required to preview this model.</div>} shadows camera={{ position: [span * 1.35, -span * 1.35, span * 1.05], fov: 38, up: [0, 0, 1] }}>
      <Scene {...props} />
    </Canvas>
    {!props.mesh ? <div className="viewport__empty">Your 3D model will appear here.</div> : null}
    <div className="viewport__badge">Z-up · drag to orbit · scroll to zoom · right-drag to pan</div>
  </div>
}
