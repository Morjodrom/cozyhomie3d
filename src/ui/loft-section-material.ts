import { MeshStandardMaterial } from 'three';

export type LoftSectionSpan = { lowerZMm: number; upperZMm: number };
export type LoftSectionUniforms = {
    loftSectionEnabled: { value: number };
    loftSectionLowerZ: { value: number };
    loftSectionUpperZ: { value: number };
};

export function setLoftSectionSpan(uniforms: LoftSectionUniforms, span?: LoftSectionSpan): void {
    if (
        !span ||
        !Number.isFinite(span.lowerZMm) ||
        !Number.isFinite(span.upperZMm) ||
        span.upperZMm <= span.lowerZMm
    ) {
        uniforms.loftSectionEnabled.value = 0;
        uniforms.loftSectionLowerZ.value = 0;
        uniforms.loftSectionUpperZ.value = 0;
        return;
    }
    uniforms.loftSectionEnabled.value = 1;
    uniforms.loftSectionLowerZ.value = span.lowerZMm;
    uniforms.loftSectionUpperZ.value = span.upperZMm;
}

export function applyLoftSectionTintShader(
    shader: {
        vertexShader: string;
        fragmentShader: string;
        uniforms: Record<string, unknown>;
    },
    uniforms: LoftSectionUniforms,
): void {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
        'varying float vLoftSectionZ;\n' +
        shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvLoftSectionZ = transformed.z;',
        );
    shader.fragmentShader =
        `uniform float loftSectionEnabled;
        uniform float loftSectionLowerZ;
        uniform float loftSectionUpperZ;
        varying float vLoftSectionZ;
        ` +
        shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
        // Keep coplanar endpoints inclusive despite varying interpolation roundoff.
        float loftSectionTolerance = 0.000001 * max(1.0, max(abs(loftSectionLowerZ), abs(loftSectionUpperZ)));
        if (loftSectionEnabled > 0.5 && vLoftSectionZ >= loftSectionLowerZ - loftSectionTolerance && vLoftSectionZ <= loftSectionUpperZ + loftSectionTolerance) {
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.12);
        }`,
        );
}

export function createLoftSectionMaterial() {
    const uniforms: LoftSectionUniforms = {
        loftSectionEnabled: { value: 0 },
        loftSectionLowerZ: { value: 0 },
        loftSectionUpperZ: { value: 0 },
    };
    const material = new MeshStandardMaterial({
        color: '#e78135',
        roughness: 0.55,
        metalness: 0.04,
    });
    material.onBeforeCompile = (shader) => applyLoftSectionTintShader(shader, uniforms);
    material.customProgramCacheKey = () => 'circular-loft-section-tint-v1';
    return { material, uniforms };
}
