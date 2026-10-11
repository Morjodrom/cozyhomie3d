import type { ReactNode } from 'react';
import type { EdgeTreatment } from '../../domain/shared/features';
import { NumericField, errorAt, type FormBindings } from './form-fields';

export function EdgeTreatmentFields({
    treatment,
    additionalFields,
    register,
    errors,
}: FormBindings & {
    treatment: EdgeTreatment;
    additionalFields?: ReactNode;
}) {
    return (
        <section className="control-group">
            <h3>Edge treatment</h3>
            <label className="field">
                <span>Style</span>
                <select {...register('parameters.edgeTreatment.style' as never)}>
                    <option value="none">None</option>
                    <option value="rounded">Rounded</option>
                    <option value="chamfered">Chamfered</option>
                </select>
            </label>
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
                        register={register}
                    />
                </div>
            ) : null}
            {additionalFields}
        </section>
    );
}
