import type { ReactNode } from 'react';
import { NumericField, errorAt, type FormBindings } from './form-fields';

export function RigidityRibFields({
    enabled,
    countFields,
    register,
    errors,
}: FormBindings & {
    enabled: boolean;
    countFields: ReactNode;
}) {
    return (
        <section className="control-group">
            <h3>Rigidity ribs</h3>
            <label className="field field--checkbox">
                <span>Enabled</span>
                <input type="checkbox" {...register('parameters.rigidityRibs.enabled' as never)} />
            </label>
            {enabled ? (
                <>
                    <label className="field">
                        <span>Placement</span>
                        <select {...register('parameters.rigidityRibs.placement' as never)}>
                            <option value="inside">Inside</option>
                            <option value="outside">Outside</option>
                        </select>
                    </label>
                    <div className="field-grid">
                        <NumericField
                            label="Projection"
                            field="parameters.rigidityRibs.projectionMm"
                            error={errorAt(errors, 'parameters.rigidityRibs.projectionMm')}
                            register={register}
                        />
                        <NumericField
                            label="Base width"
                            field="parameters.rigidityRibs.baseWidthMm"
                            error={errorAt(errors, 'parameters.rigidityRibs.baseWidthMm')}
                            register={register}
                        />
                        <NumericField
                            label="Wall-to-bottom gusset"
                            field="parameters.rigidityRibs.wallBottomGussetMm"
                            error={errorAt(errors, 'parameters.rigidityRibs.wallBottomGussetMm')}
                            register={register}
                        />
                        {countFields}
                    </div>
                </>
            ) : null}
        </section>
    );
}
