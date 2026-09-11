import { FRACTAL_BRANCH_LENGTH_RATIO, FRACTAL_BRANCH_WIDTH_RATIO, type TexturedTextureConfig } from '../domain/design'
import { textureBand } from './textures'

/** Analytic line segment in the unwrapped surface domain (millimetres). */
export type VectorSegment = { a: Point; b: Point; widthMm: number }
export type Point = readonly [number, number]

const TAU = Math.PI * 2
const SQRT3 = Math.sqrt(3)
const EPS = 1e-8
const FRACTAL_SEGMENT_BUDGET = 2048
const FRACTAL_TILE_SCALE = 2.5

function fract(value: number): number { return value - Math.floor(value) }
function positiveMod(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor }
function hash(x: number, y: number, seed: number): number {
  let v = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed) >>> 0
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0
  return ((v ^ (v >>> 16)) >>> 0) / 0x100000000
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

function ribs(texture: Extract<TexturedTextureConfig, { kind: 'ribs' }>, perimeterMm: number, heightMm: number): VectorSegment[] {
  // Ribs are watertight capsule strokes. Small scales deliberately allow their
  // 2×depth widths to overlap; later boolean union keeps the relief at one depth.
  const repeats = Math.max(1, Math.round(perimeterMm / texture.scaleMm))
  const phase = hash(0, 0, texture.seed) * perimeterMm / repeats
  const result: VectorSegment[] = []
  const [minZ, maxZ] = textureBand(texture, heightMm)
  const startZ = minZ + texture.depthMm
  const endZ = maxZ - texture.depthMm
  if (endZ <= startZ) return []
  const slope = Math.tan(texture.angleDeg * Math.PI / 180)
  for (let n = 0; n < repeats; n += 1) {
    const u = n * perimeterMm / repeats + phase
    result.push({
      a: [u + slope * (startZ - minZ), startZ],
      b: [u + slope * (endZ - minZ), endZ],
      widthMm: texture.depthMm * 2,
    })
  }
  return result
}

type FractalLayout = { columns: number; rows: number; densityReduced: boolean }

function fractalLayout(texture: Extract<TexturedTextureConfig, { kind: 'fractal' }>, perimeterMm: number, heightMm: number): FractalLayout {
  const pitch = texture.scaleMm * FRACTAL_TILE_SCALE
  const naturalColumns = Math.max(1, Math.round(perimeterMm / pitch))
  const naturalRows = Math.max(1, Math.ceil(heightMm / pitch))
  const segmentsPerRoot = 2 * (2 ** texture.levels - 1)
  const maxRoots = Math.max(1, Math.floor(FRACTAL_SEGMENT_BUDGET / segmentsPerRoot))
  if (naturalColumns * naturalRows <= maxRoots) return { columns: naturalColumns, rows: naturalRows, densityReduced: false }

  const columns = Math.max(1, Math.min(naturalColumns, Math.round(Math.sqrt(maxRoots * perimeterMm / Math.max(heightMm, 1e-6)))))
  const rows = Math.max(1, Math.min(naturalRows, Math.floor(maxRoots / columns)))
  return { columns, rows, densityReduced: true }
}

/** Whether a fractal layout must be thinned to stay within the vector relief budget. */
export function fractalTextureDensityReduced(texture: TexturedTextureConfig, perimeterMm: number, heightMm: number): boolean {
  return texture.kind === 'fractal' && fractalLayout(texture, perimeterMm, heightMm).densityReduced
}

function fractalBranches(texture: Extract<TexturedTextureConfig, { kind: 'fractal' }>, perimeterMm: number, heightMm: number): VectorSegment[] {
  const { columns, rows } = fractalLayout(texture, perimeterMm, heightMm)
  const spacingU = perimeterMm / columns
  const spacingZ = heightMm / rows
  const branchAngle = texture.branchAngleDeg * Math.PI / 180
  const result: VectorSegment[] = []

  const grow = (
    start: Point,
    angle: number,
    lengthMm: number,
    widthMm: number,
    level: number,
    path: number,
    column: number,
    row: number,
  ): void => {
    const end: Point = [start[0] + Math.cos(angle) * lengthMm, start[1] + Math.sin(angle) * lengthMm]
    result.push({ a: start, b: end, widthMm })
    if (level >= texture.levels - 1) return

    const jitter = (side: number) => (hash(column, path * 2 + side, texture.seed + row * 1013 + level * 7919) - .5) * branchAngle * .4
    const childLength = lengthMm * FRACTAL_BRANCH_LENGTH_RATIO
    const childWidth = widthMm * FRACTAL_BRANCH_WIDTH_RATIO
    grow(end, angle - branchAngle + jitter(0), childLength, childWidth, level + 1, path * 2, column, row)
    grow(end, angle + branchAngle + jitter(1), childLength, childWidth, level + 1, path * 2 + 1, column, row)
  }

  // The extra periodic columns are exact translated copies. They make paths
  // crossing u=0 and u=perimeter describe one continuous cylindrical seam.
  for (let row = -1; row <= rows; row += 1) {
    for (let column = -1; column <= columns; column += 1) {
      const wrappedColumn = positiveMod(column, columns)
      const jitterU = (hash(wrappedColumn, row, texture.seed + 17) - .5) * spacingU * .2
      const jitterZ = (hash(wrappedColumn, row, texture.seed + 31) - .5) * spacingZ * .2
      const start: Point = [(column + .5) * spacingU + jitterU, (row + .5) * spacingZ + jitterZ]
      const angle = hash(wrappedColumn, row, texture.seed + 47) * TAU
      grow(start, angle, texture.scaleMm, texture.branchWidthMm, 0, 1, wrappedColumn, row)
      grow(start, angle + Math.PI, texture.scaleMm, texture.branchWidthMm, 0, 1 << texture.levels, wrappedColumn, row)
    }
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
  const [minZ, maxZ] = textureBand(texture, heightMm)
  if (maxZ <= minZ) return []
  if (texture.kind === 'ribs') return ribs(texture, perimeterMm, heightMm)
  if (texture.kind === 'honeycomb') return uniqueSegments(honeycomb(texture, perimeterMm, heightMm))
  if (texture.kind === 'voronoi') return uniqueSegments(voronoi(texture, perimeterMm, heightMm))
  if (texture.kind === 'fractal') return uniqueSegments(fractalBranches(texture, perimeterMm, heightMm))
  return []
}
