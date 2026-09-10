import type { TexturedTextureConfig } from '../domain/design'

/** Analytic line segment in the unwrapped surface domain (millimetres). */
export type VectorSegment = { a: Point; b: Point; widthMm: number; terminalCap?: 'butt' | 'round' }
export type Point = readonly [number, number]

const TAU = Math.PI * 2
const SQRT3 = Math.sqrt(3)
const EPS = 1e-8

function fract(value: number): number { return value - Math.floor(value) }
function positiveMod(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor }
function hash(x: number, y: number, seed: number): number {
  let v = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed) >>> 0
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0
  return ((v ^ (v >>> 16)) >>> 0) / 0x100000000
}

/** Clips a convex polygon to the UV rectangle. It is deliberately analytic: no pixel/grid sampling. */
export function clipPolygonToRect(polygon: Point[], minU: number, maxU: number, minZ: number, maxZ: number): Point[] {
  let output = polygon
  const clip = (inside: (p: Point) => boolean, intersect: (a: Point, b: Point) => Point) => {
    const input = output; output = []
    for (let i = 0; i < input.length; i += 1) {
      const a = input[(i + input.length - 1) % input.length]; const b = input[i]
      const inA = inside(a); const inB = inside(b)
      if (inB && !inA) output.push(intersect(a, b))
      if (inB) output.push(b)
      if (!inB && inA) output.push(intersect(a, b))
    }
  }
  const vertical = (u: number) => (a: Point, b: Point): Point => {
    const t = (u - a[0]) / (b[0] - a[0]); return [u, a[1] + (b[1] - a[1]) * t]
  }
  const horizontal = (z: number) => (a: Point, b: Point): Point => {
    const t = (z - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, z]
  }
  clip((p) => p[0] >= minU - EPS, vertical(minU)); clip((p) => p[0] <= maxU + EPS, vertical(maxU))
  clip((p) => p[1] >= minZ - EPS, horizontal(minZ)); clip((p) => p[1] <= maxZ + EPS, horizontal(maxZ))
  return output
}

export function strokePolygon(segment: VectorSegment): Point[] {
  const dx = segment.b[0] - segment.a[0]; const dz = segment.b[1] - segment.a[1]
  const length = Math.hypot(dx, dz)
  if (length < EPS) return []
  const normalU = -dz / length * segment.widthMm / 2
  const normalZ = dx / length * segment.widthMm / 2
  return [
    [segment.a[0] + normalU, segment.a[1] + normalZ],
    [segment.b[0] + normalU, segment.b[1] + normalZ],
    [segment.b[0] - normalU, segment.b[1] - normalZ],
    [segment.a[0] - normalU, segment.a[1] - normalZ],
  ]
}

function capEdges(radiusMm: number, chordErrorMm: number): number {
  if (radiusMm < EPS) return 2
  // A chord spanning angle theta deviates from its circle by
  // r * (1 - cos(theta / 2)).  Solve that sagitta bound for a semicircle.
  const error = Math.max(EPS, chordErrorMm)
  const maxHalfAngle = Math.acos(Math.max(-1, Math.min(1, 1 - error / radiusMm)))
  // Two edges retain the outward cap midpoint and a convex polygon. More are
  // added only when the requested sagitta tolerance requires them.
  return Math.max(2, Math.ceil(Math.PI / (2 * maxHalfAngle)))
}

/**
 * Strokes all paths in a vector network. Terminal endpoints use the cap style
 * requested by their segment, while endpoints shared by two or more segments
 * receive an outward semicircular cap. Each returned path remains a single
 * convex polygon, so the existing clipping and chamfering pipeline can consume it.
 */
export function strokeVectorNetwork(segments: readonly VectorSegment[], chordErrorMm: number): Point[][] {
  const degrees = new Map<string, number>()
  for (const segment of segments) {
    if (Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]) < EPS) continue
    for (const point of [segment.a, segment.b]) {
      const key = canonicalPoint(point)
      degrees.set(key, (degrees.get(key) ?? 0) + 1)
    }
  }

  return segments.map((segment) => {
    const dx = segment.b[0] - segment.a[0]; const dz = segment.b[1] - segment.a[1]
    const length = Math.hypot(dx, dz)
    if (length < EPS) return []
    const radius = segment.widthMm / 2
    const normal: Point = [-dz / length * radius, dx / length * radius]
    const roundTerminals = segment.terminalCap === 'round'
    const roundA = roundTerminals || (degrees.get(canonicalPoint(segment.a)) ?? 0) > 1
    const roundB = roundTerminals || (degrees.get(canonicalPoint(segment.b)) ?? 0) > 1
    const edges = capEdges(radius, chordErrorMm)
    const normalAngle = Math.atan2(normal[1], normal[0])
    const polygon: Point[] = [
      [segment.a[0] + normal[0], segment.a[1] + normal[1]],
      [segment.b[0] + normal[0], segment.b[1] + normal[1]],
    ]
    if (roundB) {
      // Sweep through the direction of b-a, outside the segment endpoint.
      for (let edge = 1; edge <= edges; edge += 1) {
        const angle = normalAngle - edge * Math.PI / edges
        polygon.push([segment.b[0] + radius * Math.cos(angle), segment.b[1] + radius * Math.sin(angle)])
      }
    } else polygon.push([segment.b[0] - normal[0], segment.b[1] - normal[1]])
    polygon.push([segment.a[0] - normal[0], segment.a[1] - normal[1]])
    if (roundA) {
      // Sweep through the opposite direction, omitting the already-present
      // first vertex to keep the polygon loop free of duplicate points.
      for (let edge = 1; edge < edges; edge += 1) {
        const angle = normalAngle + Math.PI - edge * Math.PI / edges
        polygon.push([segment.a[0] + radius * Math.cos(angle), segment.a[1] + radius * Math.sin(angle)])
      }
    }
    return polygon
  })
}

function coverage(texture: TexturedTextureConfig, heightMm: number): readonly [number, number] {
  const h = heightMm * texture.coveragePercent / 100
  return [(heightMm - h) / 2, (heightMm + h) / 2]
}

function honeycomb(texture: Extract<TexturedTextureConfig, { kind: 'honeycomb' }>, perimeterMm: number, heightMm: number): VectorSegment[] {
  const result: VectorSegment[] = []
  const pointy = texture.orientation === 'pointy'
  // Fit an integral lattice period to the closed perimeter.  This is what makes
  // clipped copies at u=0 and u=perimeter describe the same vector path.
  const periodCount = Math.max(1, Math.round(perimeterMm / (pointy ? texture.scaleMm : SQRT3 * texture.scaleMm)))
  const flatToFlat = pointy ? perimeterMm / periodCount : perimeterMm / (SQRT3 * periodCount)
  const radius = flatToFlat / SQRT3
  const horizontalPeriod = pointy ? flatToFlat : radius * 3
  const dx = pointy ? flatToFlat : radius * 1.5
  const dz = pointy ? radius * 1.5 : flatToFlat
  const offsetU = fract(texture.seed * 0.7548776662466927) * horizontalPeriod
  const offsetZ = fract(texture.seed * 0.5698402909980532) * (pointy ? radius * 3 : flatToFlat)
  const rows = Math.ceil(heightMm / dz) + 4; const columns = Math.ceil(perimeterMm / dx) + 4
  for (let row = -2; row < rows; row += 1) {
    for (let col = -2; col < columns; col += 1) {
      const centerU = col * dx + offsetU + (pointy ? positiveMod(row, 2) * flatToFlat / 2 : 0)
      const centerZ = row * dz + offsetZ + (!pointy ? positiveMod(col, 2) * flatToFlat / 2 : 0)
      const vertices: Point[] = Array.from({ length: 6 }, (_, i) => {
        const angle = (pointy ? Math.PI / 6 : 0) + i * Math.PI / 3
        return [centerU + radius * Math.cos(angle), centerZ + radius * Math.sin(angle)]
      })
      // Emit complete cells, then remove the exact reverse edge supplied by
      // each neighbour. Keeping all six directions here avoids gaps at the
      // clipped coverage boundary.
      for (let i = 0; i < 6; i += 1) result.push({ a: vertices[i], b: vertices[(i + 1) % 6], widthMm: texture.spacingMm })
    }
  }
  return result
}

function canonicalPoint(point: Point): string {
  return `${Math.round(point[0] * 1e7)},${Math.round(point[1] * 1e7)}`
}

/** Removes the duplicate reverse edges emitted by adjacent vector cells. */
function uniqueSegments(segments: VectorSegment[]): VectorSegment[] {
  const seen = new Set<string>()
  const result: VectorSegment[] = []
  for (const segment of segments) {
    const a = canonicalPoint(segment.a)
    const b = canonicalPoint(segment.b)
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(segment)
  }
  return result
}

function ribs(texture: Extract<TexturedTextureConfig, { kind: 'ribs' | 'twisted' }>, perimeterMm: number, heightMm: number): VectorSegment[] {
  const repeats = Math.max(1, Math.round(perimeterMm / texture.scaleMm))
  const phase = hash(0, 0, texture.seed) * perimeterMm / repeats
  const result: VectorSegment[] = []
  const [minZ, maxZ] = coverage(texture, heightMm)
  for (let n = -1; n <= repeats; n += 1) {
    const u = n * perimeterMm / repeats + phase
    let a: Point = [u, minZ]
    let b: Point
    if (texture.kind === 'ribs') b = [u, maxZ]
    else {
      // Preserve the previous phase equation exactly:
      // repeats*u/perimeter - 2*z/height = constant.
      const deltaU = 2 * perimeterMm / repeats * (maxZ - minZ) / heightMm
      b = [u + deltaU, maxZ]
    }
    const dx = b[0] - a[0]; const dz = b[1] - a[1]
    // Move the cap centres inward so their outermost points retain the exact
    // coverage boundary. Extremely short bands narrow the rib rather than
    // allowing the two semicircular ends to cross each other.
    const widthMm = Math.min(texture.scaleMm * 0.42, Math.max(0, Math.abs(dz) - 2 * EPS))
    const insetRatio = widthMm / (2 * Math.abs(dz))
    a = [a[0] + dx * insetRatio, a[1] + dz * insetRatio]
    b = [b[0] - dx * insetRatio, b[1] - dz * insetRatio]
    result.push({ a, b, widthMm, terminalCap: 'round' })
  }
  return result
}

type Site = Point
function clippedCell(site: Site, sites: Site[], bounds: readonly [number, number, number, number]): Point[] {
  let polygon: Point[] = [[bounds[0], bounds[2]], [bounds[1], bounds[2]], [bounds[1], bounds[3]], [bounds[0], bounds[3]]]
  for (const other of sites) {
    if (other === site) continue
    const nx = other[0] - site[0]; const nz = other[1] - site[1]
    const c = (other[0] ** 2 + other[1] ** 2 - site[0] ** 2 - site[1] ** 2) / 2
    const input = polygon; polygon = []
    for (let i = 0; i < input.length; i += 1) {
      const a = input[(i + input.length - 1) % input.length]; const b = input[i]
      const va = nx * a[0] + nz * a[1] - c; const vb = nx * b[0] + nz * b[1] - c
      if (vb <= EPS && va > EPS) { const t = va / (va - vb); polygon.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) }
      if (vb <= EPS) polygon.push(b)
      if (vb > EPS && va <= EPS) { const t = va / (va - vb); polygon.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) }
    }
    if (!polygon.length) return []
  }
  return polygon
}

function voronoi(texture: Extract<TexturedTextureConfig, { kind: 'voronoi' }>, perimeterMm: number, heightMm: number): VectorSegment[] {
  const scale = texture.scaleMm; const cells = Math.max(1, Math.round(perimeterMm / scale)); const period = perimeterMm / cells
  const rows = Math.ceil(heightMm / scale) + 4; const sites: Site[] = []
  // Horizontal copies make seam cells use the same deterministic sites on either side.
  for (let y = -2; y < rows; y += 1) for (let x = -2; x < cells + 2; x += 1) {
    const wrapped = positiveMod(x, cells)
    sites.push([x * period + (hash(wrapped, y, texture.seed) - .5) * period * texture.irregularity, y * scale + (hash(wrapped, y, texture.seed + 19) - .5) * scale * texture.irregularity])
  }
  const result: VectorSegment[] = []; const bounds: readonly [number, number, number, number] = [-period * 2, perimeterMm + period * 2, -scale * 2, heightMm + scale * 2]
  for (const site of sites) {
    if (site[0] < -period || site[0] > perimeterMm + period || site[1] < -scale || site[1] > heightMm + scale) continue
    const cell = clippedCell(site, sites, bounds)
    for (let i = 0; i < cell.length; i += 1) result.push({ a: cell[i], b: cell[(i + 1) % cell.length], widthMm: texture.edgeWidthMm })
  }
  return result
}

/** Returns mathematically-defined centre lines, never a sampled scalar raster. */
export function vectorTextureSegments(texture: TexturedTextureConfig, perimeterMm: number, heightMm: number): VectorSegment[] {
  if (texture.kind === 'ribs' || texture.kind === 'twisted') return ribs(texture, perimeterMm, heightMm)
  if (texture.kind === 'honeycomb') return uniqueSegments(honeycomb(texture, perimeterMm, heightMm))
  if (texture.kind === 'voronoi') return uniqueSegments(voronoi(texture, perimeterMm, heightMm))
  return []
}
