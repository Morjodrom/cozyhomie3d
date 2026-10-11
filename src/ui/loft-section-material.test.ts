import { describe, expect, it } from 'vitest';
import { ShaderLib } from 'three';
import {
    applyLoftSectionTintShader,
    createLoftSectionMaterial,
    setLoftSectionSpan,
} from './loft-section-material';

describe('preview-only loft section tint', () => {
    it('preserves the base material and updates uniforms without replacing the program', () => {
        const { material, uniforms } = createLoftSectionMaterial();
        const shader = {
            vertexShader: ShaderLib.standard.vertexShader,
            fragmentShader: ShaderLib.standard.fragmentShader,
            uniforms: {},
        };
        applyLoftSectionTintShader(shader, uniforms);
        const version = material.version;
        setLoftSectionSpan(uniforms, { lowerZMm: 20, upperZMm: 50 });
        expect(material.color.getHexString()).toBe('e78135');
        expect(material.roughness).toBe(0.55);
        expect(material.metalness).toBe(0.04);
        expect(material.version).toBe(version);
        expect(shader.uniforms).toMatchObject({
            loftSectionEnabled: { value: 1 },
            loftSectionLowerZ: { value: 20 },
            loftSectionUpperZ: { value: 50 },
        });
        expect(shader.vertexShader).toContain('vLoftSectionZ = transformed.z');
        expect(shader.fragmentShader).toContain(
            'vLoftSectionZ >= loftSectionLowerZ - loftSectionTolerance && vLoftSectionZ <= loftSectionUpperZ + loftSectionTolerance',
        );
        expect(shader.fragmentShader).toContain('mix(diffuseColor.rgb, vec3(1.0), 0.12)');
        setLoftSectionSpan(uniforms);
        expect(uniforms.loftSectionEnabled.value).toBe(0);
        material.dispose();
    });
    it.each([
        { lowerZMm: 20, upperZMm: 20 },
        { lowerZMm: 30, upperZMm: 20 },
        { lowerZMm: NaN, upperZMm: 30 },
        { lowerZMm: 0, upperZMm: Infinity },
    ])('disables invalid or empty span $lowerZMm–$upperZMm', (span) => {
        const binding = createLoftSectionMaterial();
        setLoftSectionSpan(binding.uniforms, { lowerZMm: 0, upperZMm: 60 });
        setLoftSectionSpan(binding.uniforms, span);
        expect(binding.uniforms.loftSectionEnabled.value).toBe(0);
        binding.material.dispose();
    });
});
