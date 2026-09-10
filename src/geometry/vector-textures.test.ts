import { describe, expect, it } from 'vitest'
import { DEFAULT_POT, createTextureDefault } from '../domain/design'
import { buildPotVectorTextureMeshes } from './mesh-builders'
import { vectorTextureSegments, type VectorSegment } from './vector-textures'

const PERIMETER_MM = Math.PI * 110
const HEIGHT_MM = 100

function crossingsAt(segments: VectorSegment[], u: number): number[] {
  const values: number[] = []
  for (const { a, b } of segments) {
    if ((a[0] - u) * (b[0] - u) > 1e-8 || Math.abs(a[0] - b[0]) < 1e-8) continue
    const t = (u - a[0]) / (b[0] - a[0])
    if (t >= -1e-8 && t <= 1 + 1e-8) values.push(a[1] + (b[1] - a[1]) * t)
  }
  return values.filter((z) => z >= 0 && z <= HEIGHT_MM).sort((a, b) => a - b)
}

describe('vector texture paths', () => {
  it.each([-60, 0, 60])('uses analytic straight guides for ribs at %s degrees', (angleDeg) => {
    const base = createTextureDefault('ribs')
    if (base.kind !== 'ribs') throw new Error('Broken texture fixture')
    const texture = { ...base, angleDeg }
    const segments = vectorTextureSegments(texture, 100, HEIGHT_MM)

    expect(segments.length).toBeGreaterThan(0)
    for (const segment of segments) {
      expect((segment.b[0] - segment.a[0]) / (segment.b[1] - segment.a[1])).toBeCloseTo(Math.tan(angleDeg * Math.PI / 180), 12)
      expect(segment.widthMm).toBe(texture.depthMm * 2)
    }
  })

  it('keeps round rib caps enclosed by a narrow coverage band', () => {
    const base = createTextureDefault('ribs')
    if (base.kind !== 'ribs') throw new Error('Broken texture fixture')
    const texture = { ...base, scaleMm: 100, coveragePercent: 10 }
    const minZ = HEIGHT_MM * (1 - texture.coveragePercent / 100) / 2
    const maxZ = HEIGHT_MM - minZ

    const segments = vectorTextureSegments(texture, 100, HEIGHT_MM)
    expect(segments.every((segment) => segment.widthMm > 0 && Number.isFinite(segment.widthMm))).toBe(true)
    for (const segment of segments) {
      expect(Math.min(segment.a[1], segment.b[1]) - texture.depthMm).toBeGreaterThanOrEqual(minZ - 1e-8)
      expect(Math.max(segment.a[1], segment.b[1]) + texture.depthMm).toBeLessThanOrEqual(maxZ + 1e-8)
    }
  })

  it.each([
    { orientation: 'flat' as const, phase: 0 },
    { orientation: 'pointy' as const, phase: Math.PI / 6 },
  ])('builds exact $orientation honeycomb directions and closes the periodic seam', ({ orientation, phase }) => {
    const base = createTextureDefault('honeycomb')
    if (base.kind !== 'honeycomb') throw new Error('Broken texture fixture')
    const segments = vectorTextureSegments({ ...base, orientation }, PERIMETER_MM, HEIGHT_MM)

    for (const { a, b } of segments) {
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) - phase
      expect(Math.abs(Math.sin(angle * 3))).toBeLessThan(1e-8)
    }
    const left = crossingsAt(segments, 0)
    const right = crossingsAt(segments, PERIMETER_MM)
    expect(left.length).toBe(right.length)
    left.forEach((z, index) => expect(z).toBeCloseTo(right[index], 7))
  })

  it('generates deterministic Voronoi vectors with physical-width strokes', () => {
    const texture = createTextureDefault('voronoi')
    if (texture.kind !== 'voronoi') throw new Error('Broken texture fixture')

    const first = vectorTextureSegments(texture, PERIMETER_MM, HEIGHT_MM)
    const second = vectorTextureSegments(texture, PERIMETER_MM, HEIGHT_MM)

    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(0)
    expect(first.every((segment) => segment.widthMm === texture.edgeWidthMm)).toBe(true)
    const left = crossingsAt(first, 0)
    const right = crossingsAt(first, PERIMETER_MM)
    expect(left.length).toBe(right.length)
    left.forEach((z, index) => expect(z).toBeCloseTo(right[index], 7))
  })

  it.each(['ribs', 'honeycomb', 'voronoi'] as const)('projects %s as independent watertight round-capped paths', (kind) => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const texture = createTextureDefault(kind)
    if (texture.kind !== kind) throw new Error('Broken texture fixture')
    const chordErrorMm = 0.05
    const carrierSagittaMm = 0.15
    const parameters = { ...DEFAULT_POT.parameters, edgeTreatment: { style: 'none' as const, sizeMm: 1 } }
    const meshes = buildPotVectorTextureMeshes(parameters, texture, { carrierSagittaMm, chordErrorMm })

    expect(meshes.length).toBeGreaterThan(0)
    const displacements: number[] = []
    for (const mesh of meshes) {
      expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true)
      const edges = new Map<string, number>()
      for (let index = 0; index < mesh.indices.length; index += 3) {
        const triangle = [mesh.indices[index], mesh.indices[index + 1], mesh.indices[index + 2]]
        for (let edge = 0; edge < 3; edge += 1) {
          const pair = [triangle[edge], triangle[(edge + 1) % 3]].sort((a, b) => a - b)
          const key = `${pair[0]}:${pair[1]}`
          edges.set(key, (edges.get(key) ?? 0) + 1)
        }
      }
      expect([...edges.values()].every((count) => count === 2)).toBe(true)

      for (let index = 0; index < mesh.positions.length; index += 3) {
        const radius = Math.hypot(mesh.positions[index], mesh.positions[index + 1])
        const z = mesh.positions[index + 2]
        const carrier = parameters.bottomDiameterMm / 2 + (parameters.topDiameterMm - parameters.bottomDiameterMm) / 2 * z / parameters.heightMm
        displacements.push(radius - carrier)
      }
    }
    expect(displacements.reduce((maximum, value) => Math.max(maximum, value), -Infinity)).toBeCloseTo(texture.depthMm, 1)
    expect(displacements.reduce((minimum, value) => Math.min(minimum, value), Infinity)).toBeLessThan(0)
  })
})
