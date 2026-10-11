import { NativeSelect } from '@mantine/core';
import type { ReactNode } from 'react';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import type { DesignConfig } from '../../domain/design';
import {
    TEXTURE_KINDS,
    TEXTURE_REGISTRY,
    type TextureConfig,
    type TextureKind,
} from '../../domain/shared/textures';
import { NumericField, errorAt } from './form-fields';

function textureScaleLabel(kind: TextureKind): string {
    if (kind === 'honeycomb') return 'Cell size';
    if (kind === 'voronoi') return 'Average cell size';
    if (kind === 'fractal') return 'Largest branch length';
    return 'Scale';
}

export function TextureFields({
    texture,
    wallSelection,
    control,
    register,
    errors,
    switchTexture,
}: {
    texture: TextureConfig;
    wallSelection?: ReactNode;
    control: Control<DesignConfig>;
    register: UseFormRegister<DesignConfig>;
    errors: FieldErrors;
    switchTexture: (kind: TextureKind) => void;
}) {
    return (
        <section className="control-group">
            <h3>Surface texture</h3>
            <NativeSelect
                label="Preset"
                data={TEXTURE_KINDS.map((kind) => ({
                    value: kind,
                    label: TEXTURE_REGISTRY[kind].label,
                }))}
                {...register('texture.kind' as never, {
                    onChange: (event) => switchTexture(event.target.value as TextureKind),
                })}
            />
            {texture.kind !== 'smooth' ? (
                <>
                    {wallSelection}
                    <div className="field-grid">
                        <NumericField
                            label="Seed"
                            field="texture.seed"
                            unit=""
                            step={1}
                            error={errorAt(errors, 'texture.seed')}
                            control={control}
                        />
                        <NumericField
                            label={textureScaleLabel(texture.kind)}
                            field="texture.scaleMm"
                            error={errorAt(errors, 'texture.scaleMm')}
                            control={control}
                        />
                        <NumericField
                            label="Depth"
                            field="texture.depthMm"
                            error={errorAt(errors, 'texture.depthMm')}
                            control={control}
                        />
                        <NumericField
                            label="Bottom offset"
                            field="texture.bottomOffsetPercent"
                            unit="%"
                            error={errorAt(errors, 'texture.bottomOffsetPercent')}
                            control={control}
                        />
                        <NumericField
                            label="Top offset"
                            field="texture.topOffsetPercent"
                            unit="%"
                            error={errorAt(errors, 'texture.topOffsetPercent')}
                            control={control}
                        />
                        {texture.kind === 'ribs' ? (
                            <NumericField
                                label="Angle"
                                field="texture.angleDeg"
                                unit="°"
                                error={errorAt(errors, 'texture.angleDeg')}
                                control={control}
                            />
                        ) : (
                            <>
                                <NumericField
                                    label="Bottom fade"
                                    field="texture.bottomFadeMm"
                                    error={errorAt(errors, 'texture.bottomFadeMm')}
                                    control={control}
                                />
                                <NumericField
                                    label="Top fade"
                                    field="texture.topFadeMm"
                                    error={errorAt(errors, 'texture.topFadeMm')}
                                    control={control}
                                />
                            </>
                        )}
                    </div>
                    <div className="field-row">
                        <NativeSelect
                            label="Relief mode"
                            data={[
                                { value: 'emboss', label: 'Emboss' },
                                { value: 'recess', label: 'Recess' },
                            ]}
                            error={errorAt(errors, 'texture.reliefMode')}
                            errorProps={{ role: 'alert' }}
                            {...register('texture.reliefMode' as never)}
                        />
                        <NativeSelect
                            label="Texture quality"
                            data={[
                                { value: 'low', label: 'Low' },
                                { value: 'medium', label: 'Medium' },
                                { value: 'high', label: 'High' },
                            ]}
                            {...register('texture.quality' as never)}
                        />
                    </div>
                    {texture.kind === 'noise' ? (
                        <div className="field-grid">
                            <NativeSelect
                                label="Dimensions"
                                data={[
                                    { value: '2d', label: '2D' },
                                    { value: '3d', label: '3D' },
                                ]}
                                {...register('texture.dimensions' as never)}
                            />
                            <NumericField
                                label="Octaves"
                                field="texture.octaves"
                                unit=""
                                step={1}
                                error={errorAt(errors, 'texture.octaves')}
                                control={control}
                            />
                            <NumericField
                                label="Persistence"
                                field="texture.persistence"
                                unit=""
                                error={errorAt(errors, 'texture.persistence')}
                                control={control}
                            />
                        </div>
                    ) : null}
                    {texture.kind === 'honeycomb' ? (
                        <div className="field-row">
                            <NumericField
                                label="Spacing"
                                field="texture.spacingMm"
                                error={errorAt(errors, 'texture.spacingMm')}
                                control={control}
                            />
                            <NativeSelect
                                label="Orientation"
                                data={[
                                    { value: 'flat', label: 'Flat' },
                                    { value: 'pointy', label: 'Pointy' },
                                ]}
                                {...register('texture.orientation' as never)}
                            />
                        </div>
                    ) : null}
                    {texture.kind === 'voronoi' ? (
                        <div className="field-row">
                            <NumericField
                                label="Irregularity"
                                field="texture.irregularity"
                                unit=""
                                error={errorAt(errors, 'texture.irregularity')}
                                control={control}
                            />
                            <NumericField
                                label="Edge width"
                                field="texture.edgeWidthMm"
                                error={errorAt(errors, 'texture.edgeWidthMm')}
                                control={control}
                            />
                        </div>
                    ) : null}
                    {texture.kind === 'fractal' ? (
                        <div className="field-grid">
                            <NumericField
                                label="Levels"
                                field="texture.levels"
                                unit=""
                                step={1}
                                error={errorAt(errors, 'texture.levels')}
                                control={control}
                            />
                            <NumericField
                                label="Branch angle"
                                field="texture.branchAngleDeg"
                                unit="°"
                                error={errorAt(errors, 'texture.branchAngleDeg')}
                                control={control}
                            />
                            <NumericField
                                label="Trunk width"
                                field="texture.branchWidthMm"
                                error={errorAt(errors, 'texture.branchWidthMm')}
                                control={control}
                            />
                        </div>
                    ) : null}
                </>
            ) : null}
        </section>
    );
}
