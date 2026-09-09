import type { MeshData } from '../domain/worker'

const HEADER_BYTES = 80
const TRIANGLE_BYTES = 50

function triangleNormal(mesh: MeshData, ia: number, ib: number, ic: number): [number, number, number] {
  const ax = mesh.positions[ia * 3]
  const ay = mesh.positions[ia * 3 + 1]
  const az = mesh.positions[ia * 3 + 2]
  const abx = mesh.positions[ib * 3] - ax
  const aby = mesh.positions[ib * 3 + 1] - ay
  const abz = mesh.positions[ib * 3 + 2] - az
  const acx = mesh.positions[ic * 3] - ax
  const acy = mesh.positions[ic * 3 + 1] - ay
  const acz = mesh.positions[ic * 3 + 2] - az
  const x = aby * acz - abz * acy
  const y = abz * acx - abx * acz
  const z = abx * acy - aby * acx
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}

export function encodeBinaryStl(mesh: MeshData, label = 'Parametric model, millimetres'): ArrayBuffer {
  const triangleCount = mesh.indices.length / 3
  const buffer = new ArrayBuffer(HEADER_BYTES + 4 + triangleCount * TRIANGLE_BYTES)
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const header = new TextEncoder().encode(label.slice(0, HEADER_BYTES))
  bytes.set(header, 0)
  view.setUint32(HEADER_BYTES, triangleCount, true)

  let offset = HEADER_BYTES + 4
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = mesh.indices[triangle * 3]
    const ib = mesh.indices[triangle * 3 + 1]
    const ic = mesh.indices[triangle * 3 + 2]
    const normal = triangleNormal(mesh, ia, ib, ic)

    for (const component of normal) {
      view.setFloat32(offset, component, true)
      offset += 4
    }

    for (const index of [ia, ib, ic]) {
      view.setFloat32(offset, mesh.positions[index * 3], true)
      view.setFloat32(offset + 4, mesh.positions[index * 3 + 1], true)
      view.setFloat32(offset + 8, mesh.positions[index * 3 + 2], true)
      offset += 12
    }

    view.setUint16(offset, 0, true)
    offset += 2
  }

  return buffer
}

