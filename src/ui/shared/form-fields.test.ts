import { describe, expect, it } from 'vitest';
import { normalizeNumericFieldValue } from './form-fields';

describe('normalizeNumericFieldValue', () => {
    it.each(['', '-', '12.'])('preserves the intermediate %j draft', (draft) => {
        expect(normalizeNumericFieldValue(draft)).toBe(draft);
    });

    it('uses a reset numeric value without changing its precision', () => {
        expect(normalizeNumericFieldValue(0.05)).toBe(0.05);
        expect(normalizeNumericFieldValue(12.3456789)).toBe(12.3456789);
    });

    it.each([undefined, null, Number.NaN])('renders missing reset value %j as empty', (value) => {
        expect(normalizeNumericFieldValue(value)).toBe('');
    });
});
