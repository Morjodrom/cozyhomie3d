import { TrayFields } from '../../tray/ui/TrayFields';
import { NumericField, errorAt, type FormBindings } from '../../../ui/shared/form-fields';

function BedAdhesionFields({ register, errors }: FormBindings) {
    return (
        <section className="control-group">
            <h3>Bed adhesion beams</h3>
            <label className="field">
                <span>Beam count</span>
                <select
                    {...register('bedAdhesionBeams.count' as never, {
                        valueAsNumber: true,
                    })}
                >
                    <option value="0">0</option>
                    <option value="4">4</option>
                    <option value="8">8</option>
                </select>
            </label>
            <div className="field-grid">
                <NumericField
                    label="Beam width"
                    field="bedAdhesionBeams.widthMm"
                    error={errorAt(errors, 'bedAdhesionBeams.widthMm')}
                    register={register}
                />
                <NumericField
                    label="Beam length"
                    field="bedAdhesionBeams.lengthMm"
                    error={errorAt(errors, 'bedAdhesionBeams.lengthMm')}
                    register={register}
                />
                <NumericField
                    label="Model-side height"
                    field="bedAdhesionBeams.modelSideHeightMm"
                    error={errorAt(errors, 'bedAdhesionBeams.modelSideHeightMm')}
                    register={register}
                />
                <NumericField
                    label="Outer-side height"
                    field="bedAdhesionBeams.outerSideHeightMm"
                    error={errorAt(errors, 'bedAdhesionBeams.outerSideHeightMm')}
                    register={register}
                />
                <NumericField
                    label="Breakaway distance"
                    field="bedAdhesionBeams.breakawayDistanceMm"
                    error={errorAt(errors, 'bedAdhesionBeams.breakawayDistanceMm')}
                    register={register}
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
