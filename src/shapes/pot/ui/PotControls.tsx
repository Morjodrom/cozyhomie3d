import { Checkbox, NumberInput } from '@mantine/core';
import { useEffect, useState } from 'react';
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
    resetRevision,
    showDrainage,
    regenerateDrainage,
    onDrainageDraftValidityChange,
    control,
    errors,
}: FormBindings & {
    drainageCount: number;
    drainageDiameter: number;
    resetRevision: number;
    showDrainage: boolean;
    regenerateDrainage: (count: number | string, diameterMm: number | string) => void;
    onDrainageDraftValidityChange: (valid: boolean) => void;
}) {
    const [countDraft, setCountDraft] = useState<number | string>(drainageCount);
    const [diameterDraft, setDiameterDraft] = useState<number | string>(drainageDiameter);
    const countError =
        typeof countDraft === 'number' &&
        Number.isInteger(countDraft) &&
        countDraft >= 1 &&
        countDraft <= 24
            ? undefined
            : 'Enter a whole number from 1 to 24.';
    const diameterError =
        typeof diameterDraft === 'number' &&
        Number.isFinite(diameterDraft) &&
        diameterDraft >= 2 &&
        diameterDraft <= 50
            ? undefined
            : 'Enter a diameter from 2 to 50 mm.';

    useEffect(() => {
        setCountDraft(drainageCount);
        setDiameterDraft(drainageDiameter);
        onDrainageDraftValidityChange(true);
    }, [drainageCount, drainageDiameter, onDrainageDraftValidityChange, resetRevision]);

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
                        control={control}
                    />
                ))}
            </div>
            {showDrainage ? (
                <div className="field-grid">
                    <NumberInput
                        label={
                            <span className="numeric-field__label">
                                <span>Drainage holes</span>
                                <span aria-hidden="true">count</span>
                            </span>
                        }
                        name="drainage.count"
                        value={countDraft}
                        min={1}
                        max={24}
                        step={1}
                        clampBehavior="none"
                        error={countError}
                        errorProps={{ role: 'alert' }}
                        onChange={(value) => {
                            setCountDraft(value);
                            regenerateDrainage(value, diameterDraft);
                        }}
                    />
                    <NumberInput
                        label={
                            <span className="numeric-field__label">
                                <span>Hole diameter</span>
                                <span aria-hidden="true">mm</span>
                            </span>
                        }
                        name="drainage.diameterMm"
                        value={diameterDraft}
                        min={2}
                        max={50}
                        step={0.1}
                        clampBehavior="none"
                        error={diameterError}
                        errorProps={{ role: 'alert' }}
                        onChange={(value) => {
                            setDiameterDraft(value);
                            regenerateDrainage(countDraft, value);
                        }}
                    />
                </div>
            ) : null}
        </section>
    );
}

export function PotDrainageRoundingFields({
    parameters,
    control,
    register,
    errors,
}: FormBindings & { parameters: PotParameters }) {
    return (
        <>
            <Checkbox
                className="feature-checkbox"
                label="Round drainage holes"
                labelPosition="left"
                {...register('parameters.drainageHoleRounding.enabled' as never)}
            />
            {parameters.drainageHoleRounding.enabled ? (
                <div className="field-grid">
                    <NumericField
                        label="Drainage radius"
                        field="parameters.drainageHoleRounding.radiusMm"
                        error={errorAt(errors, 'parameters.drainageHoleRounding.radiusMm')}
                        control={control}
                    />
                </div>
            ) : null}
        </>
    );
}

export function PotBottomRibCountField({ control, errors }: FormBindings) {
    return (
        <NumericField
            label="Concentric ribs"
            field="parameters.bottomRibs.count"
            unit="count"
            error={errorAt(errors, 'parameters.bottomRibs.count')}
            control={control}
        />
    );
}

export function PotRigidityRibCountField({ control, errors }: FormBindings) {
    return (
        <NumericField
            label="Hoop count"
            field="parameters.rigidityRibs.count"
            unit="count"
            error={errorAt(errors, 'parameters.rigidityRibs.count')}
            control={control}
        />
    );
}
