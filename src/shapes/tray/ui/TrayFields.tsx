import { NumericField, errorAt, type FormBindings } from '../../../ui/shared/form-fields';

export function TrayFields({ register, errors }: FormBindings) {
    return (
        <section className="control-group">
            <h3>Drainage tray</h3>
            <div className="field-grid">
                <NumericField
                    label="Tray height"
                    field="tray.heightMm"
                    error={errorAt(errors, 'tray.heightMm')}
                    register={register}
                />
                <NumericField
                    label="Tray wall thickness"
                    field="tray.wallThicknessMm"
                    error={errorAt(errors, 'tray.wallThicknessMm')}
                    register={register}
                />
                <NumericField
                    label="Tray bottom thickness"
                    field="tray.bottomThicknessMm"
                    error={errorAt(errors, 'tray.bottomThicknessMm')}
                    register={register}
                />
                <NumericField
                    label="Engagement width"
                    field="tray.engagementWidthMm"
                    error={errorAt(errors, 'tray.engagementWidthMm')}
                    register={register}
                />
                <NumericField
                    label="Engagement depth"
                    field="tray.engagementDepthMm"
                    error={errorAt(errors, 'tray.engagementDepthMm')}
                    register={register}
                />
                <NumericField
                    label="Fit clearance"
                    field="tray.fitClearanceMm"
                    error={errorAt(errors, 'tray.fitClearanceMm')}
                    register={register}
                />
                <NumericField
                    label="Preview gap"
                    field="tray.previewGapMm"
                    error={errorAt(errors, 'tray.previewGapMm')}
                    register={register}
                />
            </div>
        </section>
    );
}
