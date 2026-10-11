import type { ReactNode } from 'react';
import { NumericField, errorAt, type FormBindings } from './form-fields';

export function BottomRibFields({
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
            <h3>Bottom stress-relief grooves</h3>
            <label className="field field--checkbox">
                <span>Enabled</span>
                <input type="checkbox" {...register('parameters.bottomRibs.enabled' as never)} />
            </label>
            {enabled ? (
                <div className="field-grid">
                    <NumericField
                        label="Groove depth"
                        field="parameters.bottomRibs.depthMm"
                        error={errorAt(errors, 'parameters.bottomRibs.depthMm')}
                        register={register}
                    />
                    <NumericField
                        label="Groove width"
                        field="parameters.bottomRibs.widthMm"
                        error={errorAt(errors, 'parameters.bottomRibs.widthMm')}
                        register={register}
                    />
                    {countFields}
                </div>
            ) : null}
        </section>
    );
}
