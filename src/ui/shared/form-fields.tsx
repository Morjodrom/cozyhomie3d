import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { DesignConfig } from '../../domain/design';

export type FormBindings = {
    register: UseFormRegister<DesignConfig>;
    errors: FieldErrors;
};

type NumericFieldProps = {
    label: string;
    field: string;
    unit?: string;
    error?: string;
    register: UseFormRegister<DesignConfig>;
};

export function NumericField({ label, field, unit = 'mm', error, register }: NumericFieldProps) {
    return (
        <label className="field">
            <span>{label}</span>
            <span className="field__control">
                <input
                    type="number"
                    step="any"
                    aria-invalid={Boolean(error)}
                    {...register(field as never, { valueAsNumber: true })}
                />
                <em>{unit}</em>
            </span>
            {error ? <small role="alert">{error}</small> : null}
        </label>
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
