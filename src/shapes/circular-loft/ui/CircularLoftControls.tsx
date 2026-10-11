import { Fragment } from 'react';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { DesignConfig } from '../../../domain/design';
import { circularLoftParametersSchema, type CircularLoftParameters } from '../domain/design';
import {
    appendCircularLoftCircle,
    appendCircularLoftSection,
    insertCircularLoftMiddleSection,
    removeCircularLoftInnermostCircle,
    removeCircularLoftSection,
} from '../domain/operations';
import { errorAt } from '../../../ui/shared/form-fields';

export type CircularLoftFocus = {
    sectionIndex: number;
    circleIndex: number;
};

type CircularLoftControlsProps = {
    parameters: CircularLoftParameters;
    register: UseFormRegister<DesignConfig>;
    errors: FieldErrors;
    focusedCircle: CircularLoftFocus | null;
    onFocusCircle: (focus: CircularLoftFocus | null) => void;
    onParametersChange: (parameters: CircularLoftParameters) => void;
};

function boundaryKind(circleIndex: number): 'Material' | 'Void' {
    return circleIndex % 2 === 0 ? 'Material' : 'Void';
}

function CircularLoftNumberField({
    label,
    field,
    error,
    register,
    onFocus,
    onBlur,
}: {
    label: string;
    field: string;
    error?: string;
    register: UseFormRegister<DesignConfig>;
    onFocus: () => void;
    onBlur: () => void;
}) {
    const input = register(field as never, { valueAsNumber: true });
    return (
        <label className="field">
            <span>{label}</span>
            <span className="field__control">
                <input
                    type="number"
                    step="any"
                    aria-invalid={Boolean(error)}
                    {...input}
                    onFocus={onFocus}
                    onBlur={(event) => {
                        input.onBlur(event);
                        onBlur();
                    }}
                />
                <em>mm</em>
            </span>
            {error ? <small role="alert">{error}</small> : null}
        </label>
    );
}

export function CircularLoftControls({
    parameters,
    register,
    errors,
    focusedCircle,
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
                </p>
                <div className="field-row">
                    <button
                        type="button"
                        className="control-button"
                        onClick={() => clearFocusThen(appendCircularLoftCircle(parameters))}
                    >
                        Add innermost boundary
                    </button>
                    <button
                        type="button"
                        className="control-button"
                        disabled={circleCount <= 1}
                        onClick={() =>
                            clearFocusThen(removeCircularLoftInnermostCircle(parameters))
                        }
                    >
                        Remove innermost boundary
                    </button>
                </div>
            </section>

            {parameters.sections.map((section, sectionIndex) => {
                const sectionError = errorFor(`sections.${sectionIndex}.circles`);
                return (
                    <Fragment key={`section-${sectionIndex}`}>
                        <section className="control-group loft-section">
                            <div className="loft-section__heading">
                                <h3>Section {sectionIndex + 1}</h3>
                                <button
                                    type="button"
                                    className="text-button"
                                    disabled={parameters.sections.length <= 2}
                                    onClick={() =>
                                        clearFocusThen(
                                            removeCircularLoftSection(parameters, sectionIndex),
                                        )
                                    }
                                >
                                    Remove section
                                </button>
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
                                const prefix = `Section ${sectionIndex + 1} ${boundaryKind(circleIndex).toLowerCase()} boundary ${circleIndex + 1}`;
                                return (
                                    <fieldset
                                        className={`loft-boundary${isFocused ? ' is-focused' : ''}`}
                                        key={`circle-${circleIndex}`}
                                        aria-invalid={Boolean(circleError)}
                                    >
                                        <legend>
                                            {boundaryKind(circleIndex)} boundary {circleIndex + 1}
                                        </legend>
                                        {circleError ? (
                                            <p className="field-error" role="alert">
                                                {circleError}
                                            </p>
                                        ) : null}
                                        <div className="field-grid">
                                            <CircularLoftNumberField
                                                label={`${prefix} diameter`}
                                                field={`parameters.sections.${sectionIndex}.circles.${circleIndex}.diameterMm`}
                                                error={errorFor(
                                                    `sections.${sectionIndex}.circles.${circleIndex}.diameterMm`,
                                                )}
                                                register={register}
                                                onFocus={() => onFocusCircle(focus)}
                                                onBlur={() => onFocusCircle(null)}
                                            />
                                            <CircularLoftNumberField
                                                label={`${prefix} X offset`}
                                                field={`parameters.sections.${sectionIndex}.circles.${circleIndex}.xMm`}
                                                error={errorFor(
                                                    `sections.${sectionIndex}.circles.${circleIndex}.xMm`,
                                                )}
                                                register={register}
                                                onFocus={() => onFocusCircle(focus)}
                                                onBlur={() => onFocusCircle(null)}
                                            />
                                            <CircularLoftNumberField
                                                label={`${prefix} Y offset`}
                                                field={`parameters.sections.${sectionIndex}.circles.${circleIndex}.yMm`}
                                                error={errorFor(
                                                    `sections.${sectionIndex}.circles.${circleIndex}.yMm`,
                                                )}
                                                register={register}
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
                                        label={`Distance to section ${sectionIndex + 2}`}
                                        field={`parameters.gapsMm.${sectionIndex}`}
                                        error={errorFor(`gapsMm.${sectionIndex}`)}
                                        register={register}
                                        onFocus={() => onFocusCircle(null)}
                                        onBlur={() => onFocusCircle(null)}
                                    />
                                    <button
                                        type="button"
                                        className="control-button"
                                        onClick={() =>
                                            clearFocusThen(
                                                insertCircularLoftMiddleSection(
                                                    parameters,
                                                    sectionIndex,
                                                ),
                                            )
                                        }
                                    >
                                        Insert section between {sectionIndex + 1} and{' '}
                                        {sectionIndex + 2}
                                    </button>
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
                <button
                    type="button"
                    className="control-button"
                    onClick={() => clearFocusThen(appendCircularLoftSection(parameters))}
                >
                    Append section
                </button>
            </section>
        </>
    );
}
