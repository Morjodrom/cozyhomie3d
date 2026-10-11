import type { PotParameters } from '../domain/design';
import {
    NumericField,
    errorAt,
    getParameterError,
    type FormBindings,
} from '../../../ui/shared/form-fields';

export function PotDimensionsFields({
    drainageCount,
    drainageDiameter,
    showDrainage,
    regenerateDrainage,
    register,
    errors,
}: FormBindings & {
    drainageCount: number;
    drainageDiameter: number;
    showDrainage: boolean;
    regenerateDrainage: (count: number, diameterMm: number) => void;
}) {
    return (
        <section className="control-group">
            <h3>Pot dimensions</h3>
            <div className="field-grid">
                {[
                    ['heightMm', 'Height'],
                    ['bottomDiameterMm', 'Bottom diameter'],
                    ['topDiameterMm', 'Top diameter'],
                    ['wallThicknessMm', 'Wall thickness'],
                    ['bottomThicknessMm', 'Bottom thickness'],
                ].map(([key, label]) => (
                    <NumericField
                        key={key}
                        label={label}
                        field={`parameters.${key}`}
                        error={getParameterError(errors, key)}
                        register={register}
                    />
                ))}
            </div>
            {showDrainage ? (
                <div className="field-grid">
                    <label className="field">
                        <span>Drainage holes</span>
                        <span className="field__control">
                            <input
                                name="drainage.count"
                                type="number"
                                min="1"
                                max="24"
                                step="1"
                                value={drainageCount}
                                onChange={(event) =>
                                    regenerateDrainage(Number(event.target.value), drainageDiameter)
                                }
                            />
                            <em>count</em>
                        </span>
                    </label>
                    <label className="field">
                        <span>Hole diameter</span>
                        <span className="field__control">
                            <input
                                name="drainage.diameterMm"
                                type="number"
                                min="2"
                                max="50"
                                step="any"
                                value={drainageDiameter}
                                onChange={(event) =>
                                    regenerateDrainage(drainageCount, Number(event.target.value))
                                }
                            />
                            <em>mm</em>
                        </span>
                    </label>
                </div>
            ) : null}
        </section>
    );
}

export function PotDrainageRoundingFields({
    parameters,
    register,
    errors,
}: FormBindings & { parameters: PotParameters }) {
    return (
        <>
            <label className="field field--checkbox">
                <span>Round drainage holes</span>
                <input
                    type="checkbox"
                    {...register('parameters.drainageHoleRounding.enabled' as never)}
                />
            </label>
            {parameters.drainageHoleRounding.enabled ? (
                <div className="field-grid">
                    <NumericField
                        label="Drainage radius"
                        field="parameters.drainageHoleRounding.radiusMm"
                        error={errorAt(errors, 'parameters.drainageHoleRounding.radiusMm')}
                        register={register}
                    />
                </div>
            ) : null}
        </>
    );
}

export function PotBottomRibCountField({ register, errors }: FormBindings) {
    return (
        <NumericField
            label="Concentric ribs"
            field="parameters.bottomRibs.count"
            unit="count"
            error={errorAt(errors, 'parameters.bottomRibs.count')}
            register={register}
        />
    );
}

export function PotRigidityRibCountField({ register, errors }: FormBindings) {
    return (
        <NumericField
            label="Hoop count"
            field="parameters.rigidityRibs.count"
            unit="count"
            error={errorAt(errors, 'parameters.rigidityRibs.count')}
            register={register}
        />
    );
}
