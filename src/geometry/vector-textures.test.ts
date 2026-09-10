import { describe, expect, it } from 'vitest'
import { DEFAULT_POT, createTextureDefault } from '../domain/design'
import { buildPotVectorTextureMeshes } from './mesh-builders'
import { clipPolygonToRect, strokePolygon, strokeVectorNetwork, vectorTextureSegments, type Point, type VectorSegment } from './vector-textures'

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

function pointKey(point: Point): string { return `${Math.round(point[0] * 1e7)},${Math.round(point[1] * 1e7)}` }

function endpointDegrees(segments: VectorSegment[]): Map<string, number> {
  const degrees = new Map<string, number>()
  for (const segment of segments) for (const point of [segment.a, segment.b]) {
    const key = pointKey(point)
    degrees.set(key, (degrees.get(key) ?? 0) + 1)
  }
  return degrees
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0]; const dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz))
}

function assertNodeHasChamferClearance(polygon: Point[], node: Point, widthMm: number): void {
  expect(polygon.length).toBeGreaterThan(4)
  const winding = polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length]; const after = polygon[(index + 2) % polygon.length]
    return (next[0] - point[0]) * (after[1] - next[1]) - (next[1] - point[1]) * (after[0] - next[0])
  })
  expect(winding.every((value) => value <= 1e-8) || winding.every((value) => value >= -1e-8)).toBe(true)
  const clearance = Math.min(...polygon.map((point, index) => distanceToSegment(node, point, polygon[(index + 1) % polygon.length])))
  expect(clearance).toBeGreaterThan(widthMm * 0.1)
}

describe('vector texture paths', () => {
  it.each([
    { kind: 'ribs' as const },
    { kind: 'twisted' as const },
  ])('uses analytic straight guides for $kind', ({ kind }) => {
    const texture = createTextureDefault(kind)
    if (texture.kind !== kind) throw new Error('Broken texture fixture')
    const segments = vectorTextureSegments(texture, 100, HEIGHT_MM)

    expect(segments.length).toBeGreaterThan(0)
    for (const segment of segments) {
      if (kind === 'ribs') expect(segment.a[0]).toBeCloseTo(segment.b[0], 12)
      else {
        const repeats = Math.round(100 / texture.scaleMm)
        expect((segment.b[0] - segment.a[0]) / (segment.b[1] - segment.a[1])).toBeCloseTo(2 * 100 / repeats / HEIGHT_MM, 12)
      }
    }
    expect(strokeVectorNetwork(segments, .05).every((stroke) => stroke.length === 4)).toBe(true)
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

    const first = vectorTextureSegments(texture, 80, 40)
    const second = vectorTextureSegments(texture, 80, 40)

    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(0)
    expect(first.every((segment) => segment.widthMm === texture.edgeWidthMm)).toBe(true)
  })

  it('creates a constant-width vector stroke and clips it without raster sampling', () => {
    const segment: VectorSegment = { a: [-2, 1], b: [12, 8], widthMm: 2 }
    const polygon = strokePolygon(segment)
    const clipped = clipPolygonToRect(polygon, 0, 10, 0, 10)
    const distance = (point: readonly [number, number]) => Math.abs(
      (segment.b[1] - segment.a[1]) * point[0] - (segment.b[0] - segment.a[0]) * point[1]
      + segment.b[0] * segment.a[1] - segment.b[1] * segment.a[0]
    ) / Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1])

    expect(polygon.every((point) => Math.abs(distance(point) - 1) < 1e-10)).toBe(true)
    expect(clipped.every(([u, z]) => u >= 0 && u <= 10 && z >= 0 && z <= 10)).toBe(true)
  })

  it('butt-caps isolated terminals and round-caps a two-segment chain with chamfer clearance', () => {
    const isolated: VectorSegment = { a: [0, 0], b: [10, 0], widthMm: 2 }
    expect(strokeVectorNetwork([isolated], .05)[0]).toEqual(strokePolygon(isolated))

    const chain: VectorSegment[] = [isolated, { a: [10, 0], b: [10, 10], widthMm: 2 }]
    const strokes = strokeVectorNetwork(chain, .05)
    assertNodeHasChamferClearance(strokes[0], [10, 0], 2)
    assertNodeHasChamferClearance(strokes[1], [10, 0], 2)
    expect(strokes[0]).toHaveLength(strokes[1].length)
  })

  it('round-caps every branch of a three-way junction', () => {
    const branches: VectorSegment[] = [
      { a: [0, 0], b: [10, 0], widthMm: 2 },
      { a: [0, 0], b: [-5, 8], widthMm: 2 },
      { a: [0, 0], b: [-5, -8], widthMm: 2 },
    ]
    for (const stroke of strokeVectorNetwork(branches, .05)) assertNodeHasChamferClearance(stroke, [0, 0], 2)
  })

  it('keeps rounded-cap chord sagitta within the requested error', () => {
    const widthMm = 4; const chordErrorMm = .03
    const segment: VectorSegment = { a: [0, 0], b: [20, 0], widthMm }
    const polygon = strokeVectorNetwork([segment, { a: [20, 0], b: [20, 20], widthMm }], chordErrorMm)[0]
    const cap = polygon.filter((point) => point[0] >= 20 - 1e-8)
    for (let index = 0; index < cap.length - 1; index += 1) {
      const midpoint: Point = [(cap[index][0] + cap[index + 1][0]) / 2, (cap[index][1] + cap[index + 1][1]) / 2]
      expect(widthMm / 2 - Math.hypot(midpoint[0] - 20, midpoint[1])).toBeLessThanOrEqual(chordErrorMm + 1e-8)
    }
  })

  it.each(['flat', 'pointy'] as const)('round-caps shared $0 honeycomb nodes', (orientation) => {
    const base = createTextureDefault('honeycomb')
    if (base.kind !== 'honeycomb') throw new Error('Broken texture fixture')
    const segments = vectorTextureSegments({ ...base, orientation }, PERIMETER_MM, HEIGHT_MM)
    const degrees = endpointDegrees(segments)
    const sharedIndex = segments.findIndex((segment) => (degrees.get(pointKey(segment.a)) ?? 0) > 1)
    expect(sharedIndex).toBeGreaterThanOrEqual(0)
    const node = segments[sharedIndex].a
    assertNodeHasChamferClearance(strokeVectorNetwork(segments, .05)[sharedIndex], node, base.spacingMm)
  })

  it('round-caps shared Voronoi nodes', () => {
    const texture = createTextureDefault('voronoi')
    if (texture.kind !== 'voronoi') throw new Error('Broken texture fixture')
    const segments = vectorTextureSegments(texture, 80, 40)
    const degrees = endpointDegrees(segments)
    const sharedIndex = segments.findIndex((segment) => (degrees.get(pointKey(segment.a)) ?? 0) > 1)
    expect(sharedIndex).toBeGreaterThanOrEqual(0)
    const node = segments[sharedIndex].a
    assertNodeHasChamferClearance(strokeVectorNetwork(segments, .05)[sharedIndex], node, texture.edgeWidthMm)
  })

  it('subdivides wrapped pot vectors to the requested chord error', () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const texture = createTextureDefault('ribs')
    if (texture.kind !== 'ribs') throw new Error('Broken texture fixture')
    const chordErrorMm = 0.05
    const carrierSagittaMm = 0.15
    const overlapMm = carrierSagittaMm + chordErrorMm + 0.01
    const parameters = { ...DEFAULT_POT.parameters, edgeTreatment: { style: 'none' as const, sizeMm: 1 } }
    const meshes = buildPotVectorTextureMeshes(parameters, texture, { carrierSagittaMm, chordErrorMm })

    for (const mesh of meshes) {
      const ringSize = mesh.positions.length / 9
      for (let i = 0; i < ringSize; i += 1) {
        const next = (i + 1) % ringSize
        const point = (index: number) => [mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2]] as const
        const a = point(i); const b = point(next)
        let angleA = Math.atan2(a[1], a[0]); let angleB = Math.atan2(b[1], b[0])
        if (angleB - angleA > Math.PI) angleB -= Math.PI * 2
        if (angleA - angleB > Math.PI) angleB += Math.PI * 2
        const z = (a[2] + b[2]) / 2
        const baseRadius = DEFAULT_POT.parameters.bottomDiameterMm / 2
          + (DEFAULT_POT.parameters.topDiameterMm - DEFAULT_POT.parameters.bottomDiameterMm) / 2 * z / DEFAULT_POT.parameters.heightMm
          - overlapMm
        const angle = (angleA + angleB) / 2
        const analytic = [baseRadius * Math.cos(angle), baseRadius * Math.sin(angle), z]
        const chord = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z]
        expect(Math.hypot(analytic[0] - chord[0], analytic[1] - chord[1])).toBeLessThanOrEqual(chordErrorMm + 1e-5)
      }
    }
  })
})
