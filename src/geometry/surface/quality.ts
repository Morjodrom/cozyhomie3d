import type { TextureConfig } from '../../domain/shared/textures';
import type { BuildQuality } from '../../domain/worker';

const TEXTURE_TOLERANCE_MM: Record<'low' | 'medium' | 'high', number> = {
    low: 0.2,
    medium: 0.1,
    high: 0.05,
};
const BUILD_TOLERANCE_FACTOR: Record<BuildQuality, number> = {
    draft: 1.5,
    preview: 1,
    export: 0.75,
};

export function textureToleranceMm(texture: TextureConfig, quality: BuildQuality): number {
    if (texture.kind === 'smooth') return Number.POSITIVE_INFINITY;
    return TEXTURE_TOLERANCE_MM[texture.quality] * BUILD_TOLERANCE_FACTOR[quality];
}
