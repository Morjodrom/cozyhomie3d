import { Checkbox, NativeSelect } from '@mantine/core';
import type { DrawerConfig } from '../domain/design';
import {
    NumericField,
    errorAt,
    getParameterError,
    type FormBindings,
} from '../../../ui/shared/form-fields';

export function DrawerDimensionsFields({ control, errors }: FormBindings) {
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
                        control={control}
                    />
                ))}
            </div>
        </section>
    );
}

export function DrawerHandleFields({
    config,
    control,
    register,
    errors,
}: FormBindings & { config: DrawerConfig }) {
    return (
        <section className="control-group">
            <h3>Drawer handle</h3>
            <NativeSelect
                label="Handle style"
                data={[
                    { value: 'projecting', label: 'Projecting lip' },
                    { value: 'recessed', label: 'Reinforced opening' },
                ]}
                {...register('parameters.handleStyle' as never)}
            />
            <div className="field-grid">
                <NumericField
                    label="Handle width"
                    field="parameters.handleWidthMm"
                    error={getParameterError(errors, 'handleWidthMm')}
                    control={control}
                />
                <NumericField
                    label="Handle height"
                    field="parameters.handleHeightMm"
                    error={getParameterError(errors, 'handleHeightMm')}
                    control={control}
                />
                <NumericField
                    label={
                        config.parameters.handleStyle === 'recessed' ? 'Rib depth' : 'Projection'
                    }
                    field="parameters.handleDepthMm"
                    error={getParameterError(errors, 'handleDepthMm')}
                    control={control}
                />
                {config.parameters.handleStyle === 'recessed' ? (
                    <NumericField
                        label="Corner radius"
                        field="parameters.handleCornerRadiusMm"
                        error={getParameterError(errors, 'handleCornerRadiusMm')}
                        control={control}
                    />
                ) : null}
                <NumericField
                    label="Vertical position"
                    field="parameters.handlePositionPercent"
                    unit="%"
                    error={getParameterError(errors, 'handlePositionPercent')}
                    control={control}
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
                <Checkbox label="Front" {...register('textureWalls.front' as never)} />
                <Checkbox label="Sides" {...register('textureWalls.sides' as never)} />
                <Checkbox label="Back" {...register('textureWalls.back' as never)} />
            </div>
        </fieldset>
    );
}

export function DrawerBottomRibCountFields({ control, errors }: FormBindings) {
    return (
        <>
            <NumericField
                label="Ribs parallel to X"
                field="parameters.bottomRibs.xCount"
                unit="count"
                error={errorAt(errors, 'parameters.bottomRibs.xCount')}
                control={control}
            />
            <NumericField
                label="Ribs parallel to Y"
                field="parameters.bottomRibs.yCount"
                unit="count"
                error={errorAt(errors, 'parameters.bottomRibs.yCount')}
                control={control}
            />
        </>
    );
}

export function DrawerRigidityRibCountFields({ control, errors }: FormBindings) {
    return (
        <>
            <NumericField
                label="Front / back count"
                field="parameters.rigidityRibs.frontBackCount"
                unit="count"
                error={errorAt(errors, 'parameters.rigidityRibs.frontBackCount')}
                control={control}
            />
            <NumericField
                label="Side count"
                field="parameters.rigidityRibs.sideCount"
                unit="count"
                error={errorAt(errors, 'parameters.rigidityRibs.sideCount')}
                control={control}
            />
        </>
    );
}
