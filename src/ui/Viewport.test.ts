import { describe, expect, it } from 'vitest'
import { createTextureDefault } from '../domain/design'
import type { MeshData, ModelPartData } from '../domain/worker'
import { previewFramingExtraMm } from './Viewport'
import { createPreviewGeometry, shouldCreaseEmbossedRibs } from './preview-geometry'

const reliefMesh: MeshData = {
  positions: new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]),
  indices: new Uint32Array([
    0, 1, 2,
    0, 3, 1,
  ]),
  normals: new Float32Array([
    0, Math.SQRT1_2, Math.SQRT1_2,
    0, Math.SQRT1_2, Math.SQRT1_2,
    0, 0, 1,
    0, 1, 0,
  ]),
}

describe('preview geometry', () => {
  it('uses the configured tray preview gap only for multipart framing', () => {
    const parts = [{ kind: 'tray', mesh: reliefMesh, previewOffsetMm: [0, 0, 0] }, { kind: 'pot', mesh: reliefMesh, previewOffsetMm: [0, 0, 18] }] satisfies ModelPartData[]

    expect(previewFramingExtraMm(parts, 37)).toBe(37)
    expect(previewFramingExtraMm(parts, 0)).toBe(0)
    expect(previewFramingExtraMm(parts.slice(0, 1), 37)).toBe(0)
  })

  it.each([
    { kind: 'ribs' as const, reliefMode: 'emboss' as const, expected: true },
    { kind: 'ribs' as const, reliefMode: 'recess' as const, expected: false },
    { kind: 'honeycomb' as const, reliefMode: 'emboss' as const, expected: false },
    { kind: 'voronoi' as const, reliefMode: 'emboss' as const, expected: false },
    { kind: 'fractal' as const, reliefMode: 'emboss' as const, expected: false },
  ])('selects crease normals for $reliefMode $kind', ({ kind, reliefMode, expected }) => {
    const texture = createTextureDefault(kind)
    if (texture.kind === 'smooth') throw new Error('Broken texture fixture')

    expect(shouldCreaseEmbossedRibs({ ...texture, reliefMode })).toBe(expected)
  })

  it('retains the indexed worker mesh when crease normals are not requested', () => {
    const geometry = createPreviewGeometry(reliefMesh, false)

    expect(geometry.index).not.toBeNull()
    expect(geometry.getAttribute('position').count).toBe(4)
    expect(geometry.boundingSphere).not.toBeNull()

    geometry.dispose()
  })

  it('splits normals across an embossed relief crease', () => {
    const geometry = createPreviewGeometry(reliefMesh, true)
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')

    expect(geometry.index).toBeNull()
    expect(positions.count).toBe(6)
    expect([normals.getX(0), normals.getY(0), normals.getZ(0)]).toEqual([0, 0, 1])
    expect([normals.getX(3), normals.getY(3), normals.getZ(3)]).toEqual([0, 1, 0])
    expect(geometry.boundingSphere).not.toBeNull()

    geometry.dispose()
  })
})
