import type { ReactNode } from 'react';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
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
    register,
    errors,
    switchTexture,
}: {
    texture: TextureConfig;
    wallSelection?: ReactNode;
    register: UseFormRegister<DesignConfig>;
    errors: FieldErrors;
    switchTexture: (kind: TextureKind) => void;
}) {
    return (
        <section className="control-group">
            <h3>Surface texture</h3>
            <label className="field">
                <span>Preset</span>
                <select
                    {...register('texture.kind' as never, {
                        onChange: (event) => switchTexture(event.target.value as TextureKind),
                    })}
                >
                    {TEXTURE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                            {TEXTURE_REGISTRY[kind].label}
                        </option>
                    ))}
                </select>
            </label>
            {texture.kind !== 'smooth' ? (
                <>
                    {wallSelection}
                    <div className="field-grid">
                        <NumericField
                            label="Seed"
                            field="texture.seed"
                            unit=""
                            error={errorAt(errors, 'texture.seed')}
                            register={register}
                        />
                        <NumericField
                            label={textureScaleLabel(texture.kind)}
                            field="texture.scaleMm"
                            error={errorAt(errors, 'texture.scaleMm')}
                            register={register}
                        />
                        <NumericField
                            label="Depth"
                            field="texture.depthMm"
                            error={errorAt(errors, 'texture.depthMm')}
                            register={register}
                        />
                        <NumericField
                            label="Bottom offset"
                            field="texture.bottomOffsetPercent"
                            unit="%"
                            error={errorAt(errors, 'texture.bottomOffsetPercent')}
                            register={register}
                        />
                        <NumericField
                            label="Top offset"
                            field="texture.topOffsetPercent"
                            unit="%"
                            error={errorAt(errors, 'texture.topOffsetPercent')}
                            register={register}
                        />
                        {texture.kind === 'ribs' ? (
                            <NumericField
                                label="Angle"
                                field="texture.angleDeg"
                                unit="°"
                                error={errorAt(errors, 'texture.angleDeg')}
                                register={register}
                            />
                        ) : (
                            <>
                                <NumericField
                                    label="Bottom fade"
                                    field="texture.bottomFadeMm"
                                    error={errorAt(errors, 'texture.bottomFadeMm')}
                                    register={register}
                                />
                                <NumericField
                                    label="Top fade"
                                    field="texture.topFadeMm"
                                    error={errorAt(errors, 'texture.topFadeMm')}
                                    register={register}
                                />
                            </>
                        )}
                    </div>
                    <div className="field-row">
                        <label className="field">
                            <span>Relief mode</span>
                            <select {...register('texture.reliefMode' as never)}>
                                <option value="emboss">Emboss</option>
                                <option value="recess">Recess</option>
                            </select>
                            {errorAt(errors, 'texture.reliefMode') ? (
                                <small role="alert">{errorAt(errors, 'texture.reliefMode')}</small>
                            ) : null}
                        </label>
                        <label className="field">
                            <span>Texture quality</span>
                            <select {...register('texture.quality' as never)}>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </label>
                    </div>
                    {texture.kind === 'noise' ? (
                        <div className="field-grid">
                            <label className="field">
                                <span>Dimensions</span>
                                <select {...register('texture.dimensions' as never)}>
                                    <option value="2d">2D</option>
                                    <option value="3d">3D</option>
                                </select>
                            </label>
                            <NumericField
                                label="Octaves"
                                field="texture.octaves"
                                unit=""
                                error={errorAt(errors, 'texture.octaves')}
                                register={register}
                            />
                            <NumericField
                                label="Persistence"
                                field="texture.persistence"
                                unit=""
                                error={errorAt(errors, 'texture.persistence')}
                                register={register}
                            />
                        </div>
                    ) : null}
                    {texture.kind === 'honeycomb' ? (
                        <div className="field-row">
                            <NumericField
                                label="Spacing"
                                field="texture.spacingMm"
                                error={errorAt(errors, 'texture.spacingMm')}
                                register={register}
                            />
                            <label className="field">
                                <span>Orientation</span>
                                <select {...register('texture.orientation' as never)}>
                                    <option value="flat">Flat</option>
                                    <option value="pointy">Pointy</option>
                                </select>
                            </label>
                        </div>
                    ) : null}
                    {texture.kind === 'voronoi' ? (
                        <div className="field-row">
                            <NumericField
                                label="Irregularity"
                                field="texture.irregularity"
                                unit=""
                                error={errorAt(errors, 'texture.irregularity')}
                                register={register}
                            />
                            <NumericField
                                label="Edge width"
                                field="texture.edgeWidthMm"
                                error={errorAt(errors, 'texture.edgeWidthMm')}
                                register={register}
                            />
                        </div>
                    ) : null}
                    {texture.kind === 'fractal' ? (
                        <div className="field-grid">
                            <NumericField
                                label="Levels"
                                field="texture.levels"
                                unit=""
                                error={errorAt(errors, 'texture.levels')}
                                register={register}
                            />
                            <NumericField
                                label="Branch angle"
                                field="texture.branchAngleDeg"
                                unit="°"
                                error={errorAt(errors, 'texture.branchAngleDeg')}
                                register={register}
                            />
                            <NumericField
                                label="Trunk width"
                                field="texture.branchWidthMm"
                                error={errorAt(errors, 'texture.branchWidthMm')}
                                register={register}
                            />
                        </div>
                    ) : null}
                </>
            ) : null}
        </section>
    );
}
