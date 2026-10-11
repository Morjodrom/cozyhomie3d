import { NativeSelect } from '@mantine/core';
import { TrayFields } from '../../tray/ui/TrayFields';
import { NumericField, errorAt, type FormBindings } from '../../../ui/shared/form-fields';

function BedAdhesionFields({ control, register, errors }: FormBindings) {
    return (
        <section className="control-group">
            <h3>Bed adhesion beams</h3>
            <NativeSelect
                label="Beam count"
                data={['0', '4', '8']}
                {...register('bedAdhesionBeams.count' as never, {
                    valueAsNumber: true,
                })}
            />
            <div className="field-grid">
                <NumericField
                    label="Beam width"
                    field="bedAdhesionBeams.widthMm"
                    error={errorAt(errors, 'bedAdhesionBeams.widthMm')}
                    control={control}
                />
                <NumericField
                    label="Beam length"
                    field="bedAdhesionBeams.lengthMm"
                    error={errorAt(errors, 'bedAdhesionBeams.lengthMm')}
                    control={control}
                />
                <NumericField
                    label="Model-side height"
                    field="bedAdhesionBeams.modelSideHeightMm"
                    error={errorAt(errors, 'bedAdhesionBeams.modelSideHeightMm')}
                    control={control}
                />
                <NumericField
                    label="Outer-side height"
                    field="bedAdhesionBeams.outerSideHeightMm"
                    error={errorAt(errors, 'bedAdhesionBeams.outerSideHeightMm')}
                    control={control}
                />
                <NumericField
                    label="Breakaway distance"
                    field="bedAdhesionBeams.breakawayDistanceMm"
                    error={errorAt(errors, 'bedAdhesionBeams.breakawayDistanceMm')}
                    control={control}
                />
            </div>
        </section>
    );
}

export function PotWithTrayControls(bindings: FormBindings) {
    return (
        <>
            <TrayFields {...bindings} />
            <BedAdhesionFields {...bindings} />
        </>
    );
}
