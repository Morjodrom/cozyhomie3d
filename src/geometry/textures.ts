import type { TextureConfig, TexturedTextureConfig } from '../domain/design'

const TAU = Math.PI * 2

export type SurfaceSample = {
  /** Distance around the closed perimeter, in millimetres. */
  uMm: number
  /** The perimeter length. `uMm = 0` and `uMm = perimeterMm` must agree. */
  perimeterMm: number
  /** Height above the base, in millimetres. */
  zMm: number
  heightMm: number
  /** Undisplaced world-space coordinates used by 3D noise. */
  xMm: number
  yMm: number
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)) }
function smoothstep01(value: number): number { const t = clamp01(value); return t * t * (3 - 2 * t) }
function fract(value: number): number { return value - Math.floor(value) }
function positiveMod(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

/** A smooth, positive-only ridge whose peak is one and seam is zero. */
export function ridge(cycles: number): number { return 0.5 - 0.5 * Math.cos(TAU * cycles) }

/** Fades texture out at structural edges such as the base and open rim. */
export function edgeMask(position: number, extent: number, fadeDistanceMm: number): number {
  if (extent <= 0 || fadeDistanceMm <= 0) return 1
  return smoothstep01(Math.min(position, extent - position) / fadeDistanceMm)
}

/** Centered vertical coverage band with independently controllable bottom and top fades. */
export function textureMask(texture: TexturedTextureConfig, sample: SurfaceSample): number {
  const bandHeight = sample.heightMm * texture.coveragePercent / 100
  const bandStart = (sample.heightMm - bandHeight) / 2
  const bandEnd = bandStart + bandHeight
  if (sample.zMm <= bandStart || sample.zMm >= bandEnd) return 0
  const bottom = texture.bottomFadeMm > 0 ? smoothstep01((sample.zMm - bandStart) / texture.bottomFadeMm) : 1
  const top = texture.topFadeMm > 0 ? smoothstep01((bandEnd - sample.zMm) / texture.topFadeMm) : 1
  return Math.min(bottom, top)
}

function hash3(x: number, y: number, z: number, seed: number): number {
  // Integer arithmetic is deterministic in JS within this 32-bit range.
  let value = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed) >>> 0
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000
}

function periodicValueNoise(x: number, y: number, z: number, periodX: number, seed: number): number {
  const x0 = Math.floor(x); const y0 = Math.floor(y); const z0 = Math.floor(z)
  const tx = smoothstep01(fract(x)); const ty = smoothstep01(fract(y)); const tz = smoothstep01(fract(z))
  const value = (ix: number, iy: number, iz: number) => hash3(positiveMod(ix, periodX), iy, iz, seed)
  const a = lerp(value(x0, y0, z0), value(x0 + 1, y0, z0), tx)
  const b = lerp(value(x0, y0 + 1, z0), value(x0 + 1, y0 + 1, z0), tx)
  const c = lerp(value(x0, y0, z0 + 1), value(x0 + 1, y0, z0 + 1), tx)
  const d = lerp(value(x0, y0 + 1, z0 + 1), value(x0 + 1, y0 + 1, z0 + 1), tx)
  return lerp(lerp(a, b, ty), lerp(c, d, ty), tz)
}

function valueNoise3d(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x); const y0 = Math.floor(y); const z0 = Math.floor(z)
  const tx = smoothstep01(fract(x)); const ty = smoothstep01(fract(y)); const tz = smoothstep01(fract(z))
  const value = (ix: number, iy: number, iz: number) => hash3(ix, iy, iz, seed)
  const a = lerp(value(x0, y0, z0), value(x0 + 1, y0, z0), tx)
  const b = lerp(value(x0, y0 + 1, z0), value(x0 + 1, y0 + 1, z0), tx)
  const c = lerp(value(x0, y0, z0 + 1), value(x0 + 1, y0, z0 + 1), tx)
  const d = lerp(value(x0, y0 + 1, z0 + 1), value(x0 + 1, y0 + 1, z0 + 1), tx)
  return lerp(lerp(a, b, ty), lerp(c, d, ty), tz)
}

function noisePattern(texture: Extract<TextureConfig, { kind: 'noise' }>, sample: SurfaceSample): number {
  const cellsU = Math.max(1, Math.round(sample.perimeterMm / texture.scaleMm))
  const u = positiveMod(sample.uMm, sample.perimeterMm) / sample.perimeterMm * cellsU
  const v = sample.zMm / texture.scaleMm
  let total = 0; let weight = 1; let normalization = 0
  for (let octave = 0; octave < texture.octaves; octave += 1) {
    const frequency = 2 ** octave
    const octaveSeed = texture.seed + octave * 1013
    const sampleValue = texture.dimensions === '3d'
      ? valueNoise3d(
        sample.xMm / texture.scaleMm * frequency,
        sample.yMm / texture.scaleMm * frequency,
        sample.zMm / texture.scaleMm * frequency,
        octaveSeed,
      )
      : periodicValueNoise(u * frequency, v * frequency, 0, cellsU * frequency, octaveSeed)
    total += sampleValue * weight
    normalization += weight
    weight *= texture.persistence
  }
  return total / normalization
}

function honeycombPattern(texture: Extract<TextureConfig, { kind: 'honeycomb' }>, sample: SurfaceSample): number {
  // `scaleMm` is the cell size; rounded repeats make the closed pot seam exact.
  const repeats = Math.max(1, Math.round(sample.perimeterMm / texture.scaleMm))
  const x = positiveMod(sample.uMm, sample.perimeterMm) / sample.perimeterMm * repeats
  const y = sample.zMm / texture.scaleMm
  const phase = (texture.orientation === 'flat' ? 0 : Math.PI / 6) + hash3(0, 0, 7, texture.seed) * TAU
  const a = Math.abs(Math.cos(TAU * (x + y * 0.5) + phase))
  const b = Math.abs(Math.cos(TAU * (y * 0.866) + phase))
  const c = Math.abs(Math.cos(TAU * (x - y * 0.5) + phase))
  // spacingMm controls the physical edge/gap width while scaleMm controls cell size.
  const edgeWidth = texture.spacingMm / texture.scaleMm
  return smoothstep01((Math.max(a, b, c) - (1 - edgeWidth)) / Math.max(edgeWidth, 0.0001))
}

function voronoiPattern(texture: Extract<TextureConfig, { kind: 'voronoi' }>, sample: SurfaceSample): number {
  const cellsU = Math.max(1, Math.round(sample.perimeterMm / texture.scaleMm))
  const x = positiveMod(sample.uMm, sample.perimeterMm) / sample.perimeterMm * cellsU
  const y = sample.zMm / texture.scaleMm
  const baseX = Math.floor(x); const baseY = Math.floor(y)
  let nearest = Number.POSITIVE_INFINITY; let nextNearest = Number.POSITIVE_INFINITY
  for (let iy = baseY - 2; iy <= baseY + 2; iy += 1) {
    for (let ix = baseX - 2; ix <= baseX + 2; ix += 1) {
      const wrappedX = positiveMod(ix, cellsU)
      const jitterX = (hash3(wrappedX, iy, 1, texture.seed) - 0.5) * texture.irregularity
      const jitterY = (hash3(wrappedX, iy, 2, texture.seed) - 0.5) * texture.irregularity
      const dx = ix + 0.5 + jitterX - x
      const dy = iy + 0.5 + jitterY - y
      const distance = Math.hypot(dx, dy)
      if (distance < nearest) { nextNearest = nearest; nearest = distance } else if (distance < nextNearest) nextNearest = distance
    }
  }
  const normalizedEdge = (nextNearest - nearest) * texture.scaleMm / Math.max(texture.edgeWidthMm, 0.0001)
  return 1 - smoothstep01(normalizedEdge)
}

export function textureSignal(texture: TextureConfig, sample: SurfaceSample): number {
  if (texture.kind === 'smooth') return 0
  if (texture.kind === 'ribs' || texture.kind === 'twisted') {
    // Rounded repeats retain the requested physical wavelength while closing the pot seam exactly.
    const repeats = Math.max(1, Math.round(sample.perimeterMm / texture.scaleMm))
    const phase = hash3(0, 0, 11, texture.seed)
    const twist = texture.kind === 'twisted' ? -2 * sample.zMm / sample.heightMm : 0
    return ridge(positiveMod(sample.uMm, sample.perimeterMm) / sample.perimeterMm * repeats + phase + twist)
  }
  if (texture.kind === 'noise') return noisePattern(texture, sample)
  if (texture.kind === 'honeycomb') return honeycombPattern(texture, sample)
  if (texture.kind === 'voronoi') return voronoiPattern(texture, sample)
  throw new Error('Unsupported texture kind.')
}

/** Physical, deterministic external-wall displacement. No internal surface uses this function. */
export function textureDisplacement(texture: TextureConfig, sample: SurfaceSample): number {
  if (texture.kind === 'smooth') return 0
  const direction = texture.reliefMode === 'recess' ? -1 : 1
  return direction * texture.depthMm * textureSignal(texture, sample) * textureMask(texture, sample)
}
