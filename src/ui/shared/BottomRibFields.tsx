import { Checkbox } from '@mantine/core';
import type { ReactNode } from 'react';
import { NumericField, errorAt, type FormBindings } from './form-fields';

export function BottomRibFields({
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
            <h3>Bottom stress-relief grooves</h3>
            <Checkbox
                className="feature-checkbox"
                label="Enabled"
                labelPosition="left"
                {...register('parameters.bottomRibs.enabled' as never)}
            />
            {enabled ? (
                <div className="field-grid">
                    <NumericField
                        label="Groove depth"
                        field="parameters.bottomRibs.depthMm"
                        error={errorAt(errors, 'parameters.bottomRibs.depthMm')}
                        control={control}
                    />
                    <NumericField
                        label="Groove width"
                        field="parameters.bottomRibs.widthMm"
                        error={errorAt(errors, 'parameters.bottomRibs.widthMm')}
                        control={control}
                    />
                    {countFields}
                </div>
            ) : null}
        </section>
    );
}
