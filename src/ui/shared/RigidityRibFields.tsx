import { Checkbox, NativeSelect } from '@mantine/core';
import type { ReactNode } from 'react';
import { NumericField, errorAt, type FormBindings } from './form-fields';

export function RigidityRibFields({
    enabled,
    countFields,
    control,
    register,
    errors,
}: FormBindings & {
    enabled: boolean;
    countFields: ReactNode;
}) {
    return (
        <section className="control-group">
            <h3>Rigidity ribs</h3>
            <Checkbox
                className="feature-checkbox"
                label="Enabled"
                labelPosition="left"
                {...register('parameters.rigidityRibs.enabled' as never)}
            />
            {enabled ? (
                <>
                    <NativeSelect
                        label="Placement"
                        data={[
                            { value: 'inside', label: 'Inside' },
                            { value: 'outside', label: 'Outside' },
                        ]}
                        {...register('parameters.rigidityRibs.placement' as never)}
                    />
                    <div className="field-grid">
                        <NumericField
                            label="Projection"
                            field="parameters.rigidityRibs.projectionMm"
                            error={errorAt(errors, 'parameters.rigidityRibs.projectionMm')}
                            control={control}
                        />
                        <NumericField
                            label="Base width"
                            field="parameters.rigidityRibs.baseWidthMm"
                            error={errorAt(errors, 'parameters.rigidityRibs.baseWidthMm')}
                            control={control}
                        />
                        <NumericField
                            label="Wall-to-bottom gusset"
                            field="parameters.rigidityRibs.wallBottomGussetMm"
                            error={errorAt(errors, 'parameters.rigidityRibs.wallBottomGussetMm')}
                            control={control}
                        />
                        {countFields}
                    </div>
                </>
            ) : null}
        </section>
    );
}
