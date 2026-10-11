import type { Manifold } from 'manifold-3d';

export function translateAndDeleteSource(
    source: Manifold,
    x: number,
    y: number,
    z: number,
): Manifold {
    try {
        const translated = source.translate(x, y, z);
        const status = translated.status();
        if (status !== 'NoError') {
            translated.delete();
            throw new Error(`Geometry transform failed (${status}).`);
        }
        return translated;
    } finally {
        source.delete();
    }
}

export function translateAndDelete(source: Manifold, x: number, y: number, z: number): Manifold {
    try {
        return source.translate(x, y, z);
    } finally {
        source.delete();
    }
}

export function rotateAndDelete(source: Manifold, x: number, y: number, z: number): Manifold {
    try {
        return source.rotate(x, y, z);
    } finally {
        source.delete();
    }
}
