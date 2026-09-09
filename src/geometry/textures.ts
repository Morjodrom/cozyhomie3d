import type { TextureConfig } from '../domain/design'

const TAU = Math.PI * 2

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/** A smooth, positive-only ridge whose peak is one and seam is zero. */
export function ridge(cycles: number): number {
  return 0.5 - 0.5 * Math.cos(TAU * cycles)
}

/** Fades texture out at structural edges such as the base and open rim. */
export function edgeMask(position: number, extent: number, fadeDistanceMm: number): number {
  if (extent <= 0 || fadeDistanceMm <= 0) return 1
  const distance = Math.min(position, extent - position)
  return smoothstep01(distance / fadeDistanceMm)
}

export function textureDisplacement(
  texture: TextureConfig,
  along: number,
  heightFraction: number,
  structuralMask = 1,
): number {
  if (texture.kind === 'smooth') return 0

  // Two turns from base to rim are visually distinct without creating the
  // severe overhangs and self-intersections arbitrary twist values can cause.
  const twistCycles = texture.kind === 'twisted' ? -2 * heightFraction : 0
  return texture.amplitudeMm * ridge(texture.density * along + twistCycles) * structuralMask
}

