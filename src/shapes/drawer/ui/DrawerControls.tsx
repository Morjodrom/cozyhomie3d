import type { DrawerConfig } from '../domain/design';
import {
    NumericField,
    errorAt,
    getParameterError,
    type FormBindings,
} from '../../../ui/shared/form-fields';

export function DrawerDimensionsFields({ register, errors }: FormBindings) {
    return (
        <section className="control-group">
            <h3>Drawer dimensions</h3>
            <div className="field-grid">
                {[
                    ['widthMm', 'Width'],
                    ['depthMm', 'Depth'],
                    ['heightMm', 'Height'],
                    ['wallThicknessMm', 'Wall thickness'],
                    ['bottomThicknessMm', 'Bottom thickness'],
                ].map(([key, label]) => (
                    <NumericField
                        key={key}
                        label={label}
                        field={`parameters.${key}`}
                        error={getParameterError(errors, key)}
                        register={register}
                    />
                ))}
            </div>
        </section>
    );
}

export function DrawerHandleFields({
    config,
    register,
    errors,
}: FormBindings & { config: DrawerConfig }) {
    return (
        <section className="control-group">
            <h3>Drawer handle</h3>
            <label className="field">
                <span>Handle style</span>
                <select {...register('parameters.handleStyle' as never)}>
                    <option value="projecting">Projecting lip</option>
                    <option value="recessed">Reinforced opening</option>
                </select>
            </label>
            <div className="field-grid">
                <NumericField
                    label="Handle width"
                    field="parameters.handleWidthMm"
                    error={getParameterError(errors, 'handleWidthMm')}
                    register={register}
                />
                <NumericField
                    label="Handle height"
                    field="parameters.handleHeightMm"
                    error={getParameterError(errors, 'handleHeightMm')}
                    register={register}
                />
                <NumericField
                    label={
                        config.parameters.handleStyle === 'recessed' ? 'Rib depth' : 'Projection'
                    }
                    field="parameters.handleDepthMm"
                    error={getParameterError(errors, 'handleDepthMm')}
                    register={register}
                />
                {config.parameters.handleStyle === 'recessed' ? (
                    <NumericField
                        label="Corner radius"
                        field="parameters.handleCornerRadiusMm"
                        error={getParameterError(errors, 'handleCornerRadiusMm')}
                        register={register}
                    />
                ) : null}
                <NumericField
                    label="Vertical position"
                    field="parameters.handlePositionPercent"
                    unit="%"
                    error={getParameterError(errors, 'handlePositionPercent')}
                    register={register}
                />
            </div>
        </section>
    );
}

export function DrawerTextureWallFields({ register }: Pick<FormBindings, 'register'>) {
    return (
        <fieldset className="texture-walls">
            <legend>Apply texture to</legend>
            <div className="texture-walls__options">
                <label>
                    <input type="checkbox" {...register('textureWalls.front' as never)} /> Front
                </label>
                <label>
                    <input type="checkbox" {...register('textureWalls.sides' as never)} /> Sides
                </label>
                <label>
                    <input type="checkbox" {...register('textureWalls.back' as never)} /> Back
                </label>
            </div>
        </fieldset>
    );
}

export function DrawerBottomRibCountFields({ register, errors }: FormBindings) {
    return (
        <>
            <NumericField
                label="Ribs parallel to X"
                field="parameters.bottomRibs.xCount"
                unit="count"
                error={errorAt(errors, 'parameters.bottomRibs.xCount')}
                register={register}
            />
            <NumericField
                label="Ribs parallel to Y"
                field="parameters.bottomRibs.yCount"
                unit="count"
                error={errorAt(errors, 'parameters.bottomRibs.yCount')}
                register={register}
            />
        </>
    );
}

export function DrawerRigidityRibCountFields({ register, errors }: FormBindings) {
    return (
        <>
            <NumericField
                label="Front / back count"
                field="parameters.rigidityRibs.frontBackCount"
                unit="count"
                error={errorAt(errors, 'parameters.rigidityRibs.frontBackCount')}
                register={register}
            />
            <NumericField
                label="Side count"
                field="parameters.rigidityRibs.sideCount"
                unit="count"
                error={errorAt(errors, 'parameters.rigidityRibs.sideCount')}
                register={register}
            />
        </>
    );
}
