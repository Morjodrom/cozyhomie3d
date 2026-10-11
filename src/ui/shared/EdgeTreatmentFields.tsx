import { NativeSelect } from '@mantine/core';
import type { ReactNode } from 'react';
import type { EdgeTreatment } from '../../domain/shared/features';
import { NumericField, errorAt, type FormBindings } from './form-fields';

export function EdgeTreatmentFields({
    treatment,
    additionalFields,
    control,
    register,
    errors,
}: FormBindings & {
    treatment: EdgeTreatment;
    additionalFields?: ReactNode;
}) {
    return (
        <section className="control-group">
            <h3>Edge treatment</h3>
            <NativeSelect
                label="Style"
                data={[
                    { value: 'none', label: 'None' },
                    { value: 'rounded', label: 'Rounded' },
                    { value: 'chamfered', label: 'Chamfered' },
                ]}
                {...register('parameters.edgeTreatment.style' as never)}
            />
            {treatment.style !== 'none' ? (
                <div className="field-grid">
                    <NumericField
                        label={
                            treatment.style === 'rounded'
                                ? 'Maximum radius'
                                : 'Maximum chamfer width'
                        }
                        field="parameters.edgeTreatment.sizeMm"
                        error={errorAt(errors, 'parameters.edgeTreatment.sizeMm')}
                        control={control}
                    />
                </div>
            ) : null}
            {additionalFields}
        </section>
    );
}
