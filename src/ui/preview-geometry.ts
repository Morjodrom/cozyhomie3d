import * as THREE from 'three'
import { toCreasedNormals } from 'three-stdlib'
import type { TextureConfig } from '../domain/design'
import type { MeshData } from '../domain/worker'

const PREVIEW_CREASE_ANGLE = THREE.MathUtils.degToRad(18)

export function shouldCreaseEmbossedRibs(texture: TextureConfig): boolean {
  return texture.kind === 'ribs' && texture.reliefMode === 'emboss'
}

export function createPreviewGeometry(mesh: MeshData, creaseNormals: boolean): THREE.BufferGeometry {
  const source = new THREE.BufferGeometry()
  source.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
  source.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
  source.setIndex(new THREE.BufferAttribute(mesh.indices, 1))

  if (!creaseNormals) {
    source.computeBoundingSphere()
    return source
  }

  // Preserve smooth shallow curves while splitting normals across real relief
  // creases. The worker mesh supplies the actual surface triangles.
  const creased = toCreasedNormals(source, PREVIEW_CREASE_ANGLE)
  if (creased !== source) source.dispose()
  creased.computeBoundingSphere()
  return creased
}
