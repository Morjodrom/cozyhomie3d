import { Button } from '@mantine/core';
import { Fragment } from 'react';
import type { Control, FieldErrors } from 'react-hook-form';
import type { DesignConfig } from '../../../domain/design';
import { circularLoftParametersSchema, type CircularLoftParameters } from '../domain/design';
import {
    appendCircularLoftCircle,
    appendCircularLoftSection,
    insertCircularLoftMiddleSection,
    removeCircularLoftInnermostCircle,
    removeCircularLoftSection,
} from '../domain/operations';
import { NumericField, errorAt } from '../../../ui/shared/form-fields';

export type CircularLoftFocus = {
    sectionIndex: number;
    circleIndex: number;
};

type CircularLoftControlsProps = {
    parameters: CircularLoftParameters;
    control: Control<DesignConfig>;
    errors: FieldErrors;
    focusedCircle: CircularLoftFocus | null;
    activeSectionIndex?: number | null;
    onActivateSection?: (index: number) => void;
    onFocusCircle: (focus: CircularLoftFocus | null) => void;
    onParametersChange: (parameters: CircularLoftParameters) => void;
};

function boundaryKind(circleIndex: number): 'Material' | 'Void' {
    return circleIndex % 2 === 0 ? 'Material' : 'Void';
}

function CircularLoftNumberField({
    label,
    accessibleLabel,
    field,
    unit,
    error,
    control,
    onFocus,
    onBlur,
}: {
    label: string;
    accessibleLabel: string;
    field: string;
    unit?: string;
    error?: string;
    control: Control<DesignConfig>;
    onFocus: () => void;
    onBlur: () => void;
}) {
    return (
        <NumericField
            label={label}
            accessibleLabel={accessibleLabel}
            field={field}
            unit={unit}
            error={error}
            control={control}
            onFocus={onFocus}
            onBlur={onBlur}
        />
    );
}

export function CircularLoftControls({
    parameters,
    control,
    errors,
    focusedCircle,
    activeSectionIndex,
    onActivateSection,
    onFocusCircle,
    onParametersChange,
}: CircularLoftControlsProps) {
    const circleCount = parameters.sections[0]?.circles.length ?? 0;
    const schemaResult = circularLoftParametersSchema.safeParse(parameters);
    const schemaIssues = schemaResult.success ? [] : schemaResult.error.issues;
    const errorFor = (path: string): string | undefined => {
        const formError = errorAt(errors, `parameters.${path}`);
        if (formError) return formError;
        const issue = schemaIssues.find((candidate) => {
            const issuePath = candidate.path.join('.');
            return issuePath === path || path.startsWith(`${issuePath}.`);
        });
        return issue?.message;
    };
    const clearFocusThen = (next: CircularLoftParameters) => {
        onFocusCircle(null);
        onParametersChange(next);
    };

    return (
        <>
            <section className="control-group">
                <h3>Circular boundaries</h3>
                <p className="control-group__hint">
                    Material and void boundaries alternate from the outside in across every section.
                    Offsets are measured from the global origin; angles run clockwise from +Y.
                </p>
                <div className="field-row">
                    <Button
                        type="button"
                        variant="default"
                        className="control-button"
                        onClick={() => clearFocusThen(appendCircularLoftCircle(parameters))}
                    >
                        Add innermost boundary
                    </Button>
                    <Button
                        type="button"
                        variant="default"
                        className="control-button"
                        disabled={circleCount <= 1}
                        onClick={() =>
                            clearFocusThen(removeCircularLoftInnermostCircle(parameters))
                        }
                    >
                        Remove innermost boundary
                    </Button>
                </div>
            </section>

            {parameters.sections.map((section, sectionIndex) => {
                const sectionError = errorFor(`sections.${sectionIndex}.circles`);
                return (
                    <Fragment key={`section-${sectionIndex}`}>
                        <section
                            className={`control-group loft-section${activeSectionIndex === sectionIndex ? ' is-active' : ''}`}
                            data-active={activeSectionIndex === sectionIndex}
                            onClickCapture={() => onActivateSection?.(sectionIndex)}
                            onFocusCapture={() => onActivateSection?.(sectionIndex)}
                        >
                            <div className="loft-section__heading">
                                <h3 aria-label={`Section ${sectionIndex + 1}`}>
                                    <Button
                                        type="button"
                                        variant="transparent"
                                        color="dark"
                                        className="loft-section__select"
                                        aria-label={`Select section ${sectionIndex + 1}`}
                                        aria-pressed={activeSectionIndex === sectionIndex}
                                        onClick={() => onActivateSection?.(sectionIndex)}
                                    >
                                        Section {sectionIndex + 1}
                                    </Button>
                                </h3>
                                <Button
                                    type="button"
                                    variant="subtle"
                                    size="compact-xs"
                                    className="text-button"
                                    disabled={parameters.sections.length <= 2}
                                    onClick={() =>
                                        clearFocusThen(
                                            removeCircularLoftSection(parameters, sectionIndex),
                                        )
                                    }
                                >
                                    Remove section
                                </Button>
                            </div>
                            {sectionError ? (
                                <p className="field-error" role="alert">
                                    {sectionError}
                                </p>
                            ) : null}
                            {section.circles.map((circle, circleIndex) => {
                                const focus = { sectionIndex, circleIndex };
                                const isFocused =
                                    focusedCircle?.sectionIndex === sectionIndex &&
                                    focusedCircle.circleIndex === circleIndex;
                                const circleError = errorFor(
                                    `sections.${sectionIndex}.circles.${circleIndex}`,
                                );
                                const boundaryNumber = Math.floor(circleIndex / 2) + 1;
                                const prefix = `Section ${sectionIndex + 1} ${boundaryKind(circleIndex).toLowerCase()} boundary ${boundaryNumber}`;
                                return (
                                    <fieldset
                                        className={`loft-boundary${isFocused ? ' is-focused' : ''}`}
                                        key={`circle-${circleIndex}`}
                                        aria-invalid={Boolean(circleError)}
                                    >
                                        <legend>
                                            {boundaryKind(circleIndex)} boundary {boundaryNumber}
                                        </legend>
                                        {circleError ? (
                                            <p className="field-error" role="alert">
                                                {circleError}
                                            </p>
                                        ) : null}
                                        <div className="field-grid">
                                            <CircularLoftNumberField
                                                label="Diameter"
                                                accessibleLabel={`${prefix} diameter`}
                                                field={`parameters.sections.${sectionIndex}.circles.${circleIndex}.diameterMm`}
                                                error={errorFor(
                                                    `sections.${sectionIndex}.circles.${circleIndex}.diameterMm`,
                                                )}
                                                control={control}
                                                onFocus={() => onFocusCircle(focus)}
                                                onBlur={() => onFocusCircle(null)}
                                            />
                                            <CircularLoftNumberField
                                                label="Offset"
                                                accessibleLabel={`${prefix} offset distance`}
                                                field={`parameters.sections.${sectionIndex}.circles.${circleIndex}.offsetDistanceMm`}
                                                error={errorFor(
                                                    `sections.${sectionIndex}.circles.${circleIndex}.offsetDistanceMm`,
                                                )}
                                                control={control}
                                                onFocus={() => onFocusCircle(focus)}
                                                onBlur={() => onFocusCircle(null)}
                                            />
                                            <CircularLoftNumberField
                                                label="Angle"
                                                unit="°"
                                                accessibleLabel={`${prefix} offset angle`}
                                                field={`parameters.sections.${sectionIndex}.circles.${circleIndex}.offsetAngleDeg`}
                                                error={errorFor(
                                                    `sections.${sectionIndex}.circles.${circleIndex}.offsetAngleDeg`,
                                                )}
                                                control={control}
                                                onFocus={() => onFocusCircle(focus)}
                                                onBlur={() => onFocusCircle(null)}
                                            />
                                        </div>
                                    </fieldset>
                                );
                            })}
                        </section>
                        {sectionIndex < parameters.gapsMm.length ? (
                            <section
                                className="control-group loft-transition-group"
                                aria-label={`Transition from section ${sectionIndex + 1} to ${sectionIndex + 2}`}
                            >
                                <h3>
                                    Section {sectionIndex + 1} → {sectionIndex + 2}
                                </h3>
                                <div className="loft-transition">
                                    <CircularLoftNumberField
                                        label="Distance"
                                        accessibleLabel={`Distance to section ${sectionIndex + 2}`}
                                        field={`parameters.gapsMm.${sectionIndex}`}
                                        error={errorFor(`gapsMm.${sectionIndex}`)}
                                        control={control}
                                        onFocus={() => onFocusCircle(null)}
                                        onBlur={() => onFocusCircle(null)}
                                    />
                                    <Button
                                        type="button"
                                        variant="default"
                                        className="control-button"
                                        aria-label={`Insert section between ${sectionIndex + 1} and ${sectionIndex + 2}`}
                                        onClick={() =>
                                            clearFocusThen(
                                                insertCircularLoftMiddleSection(
                                                    parameters,
                                                    sectionIndex,
                                                ),
                                            )
                                        }
                                    >
                                        Insert section
                                    </Button>
                                </div>
                            </section>
                        ) : null}
                    </Fragment>
                );
            })}

            <section className="control-group">
                <h3>Section actions</h3>
                {errorFor('gapsMm') ? (
                    <p className="field-error" role="alert">
                        {errorFor('gapsMm')}
                    </p>
                ) : null}
                <Button
                    type="button"
                    variant="default"
                    className="control-button"
                    onClick={() => clearFocusThen(appendCircularLoftSection(parameters))}
                >
                    Append section
                </Button>
            </section>
        </>
    );
}
