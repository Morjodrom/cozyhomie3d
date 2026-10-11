import { NumericField, errorAt, type FormBindings } from '../../../ui/shared/form-fields';

export function TrayFields({ control, errors }: FormBindings) {
    return (
        <section className="control-group">
            <h3>Drainage tray</h3>
            <div className="field-grid">
                <NumericField
                    label="Tray height"
                    field="tray.heightMm"
                    error={errorAt(errors, 'tray.heightMm')}
                    control={control}
                />
                <NumericField
                    label="Tray wall thickness"
                    field="tray.wallThicknessMm"
                    error={errorAt(errors, 'tray.wallThicknessMm')}
                    control={control}
                />
                <NumericField
                    label="Tray bottom thickness"
                    field="tray.bottomThicknessMm"
                    error={errorAt(errors, 'tray.bottomThicknessMm')}
                    control={control}
                />
                <NumericField
                    label="Engagement width"
                    field="tray.engagementWidthMm"
                    error={errorAt(errors, 'tray.engagementWidthMm')}
                    control={control}
                />
                <NumericField
                    label="Engagement depth"
                    field="tray.engagementDepthMm"
                    error={errorAt(errors, 'tray.engagementDepthMm')}
                    control={control}
                />
                <NumericField
                    label="Fit clearance"
                    field="tray.fitClearanceMm"
                    error={errorAt(errors, 'tray.fitClearanceMm')}
                    control={control}
                />
                <NumericField
                    label="Preview gap"
                    field="tray.previewGapMm"
                    error={errorAt(errors, 'tray.previewGapMm')}
                    control={control}
                />
            </div>
        </section>
    );
}
