import { NumberInput } from '@mantine/core';
import type { FocusEventHandler } from 'react';
import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import type { DesignConfig } from '../../domain/design';

export type FormBindings = {
    control: Control<DesignConfig>;
    register: UseFormRegister<DesignConfig>;
    errors: FieldErrors;
};

type NumericFieldProps = {
    label: string;
    field: string;
    unit?: string;
    error?: string;
    control: Control<DesignConfig>;
    step?: number;
    onFocus?: FocusEventHandler<HTMLInputElement>;
    onBlur?: FocusEventHandler<HTMLInputElement>;
};

export function normalizeNumericFieldValue(value: unknown): number | string {
    if (typeof value === 'string') return value;
    return typeof value === 'number' && !Number.isNaN(value) ? value : '';
}

export function NumericField({
    label,
    field,
    unit = 'mm',
    error,
    control,
    step,
    onFocus,
    onBlur,
}: NumericFieldProps) {
    return (
        <Controller
            name={field as never}
            control={control}
            render={({ field: controllerField }) => (
                <NumberInput
                    className="numeric-field"
                    label={
                        <span className="numeric-field__label">
                            <span>{label}</span>
                            {unit ? <span aria-hidden="true">{unit}</span> : null}
                        </span>
                    }
                    name={controllerField.name}
                    value={normalizeNumericFieldValue(controllerField.value)}
                    onChange={controllerField.onChange}
                    onBlur={(event) => {
                        controllerField.onBlur();
                        onBlur?.(event);
                    }}
                    onFocus={onFocus}
                    ref={controllerField.ref}
                    step={step ?? (field.toLowerCase().includes('count') ? 1 : 0.1)}
                    clampBehavior="none"
                    error={error}
                    errorProps={{ role: 'alert' }}
                    aria-invalid={Boolean(error)}
                />
            )}
        />
    );
}

export function getParameterError(errors: FieldErrors, key: string): string | undefined {
    return (errors.parameters as Record<string, { message?: string }> | undefined)?.[key]?.message;
}

export function errorAt(errors: FieldErrors, path: string): string | undefined {
    let current: unknown = errors;
    for (const key of path.split('.'))
        current = (current as Record<string, unknown> | undefined)?.[key];
    return (current as { message?: string } | undefined)?.message;
}
