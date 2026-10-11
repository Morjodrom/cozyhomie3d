import { Box, Loader, Paper, Text } from '@mantine/core';
import type { EditorStage, EditorStatus } from '../types';

const STAGE_LABELS: Record<EditorStage, string> = {
    waiting: 'Waiting for changes to settle',
    'loading-engine': 'Loading geometry engine',
    planning: 'Planning mesh detail',
    constructing: 'Constructing model',
    validating: 'Checking model integrity',
    'preparing-mesh': 'Preparing preview mesh',
    'encoding-files': 'Encoding STL files',
    complete: 'Model is up to date',
    failed: 'Calculation stopped',
};

export function CalculationStatus({
    status,
    stage,
    error,
}: {
    status: EditorStatus;
    stage: EditorStage;
    error?: string;
}) {
    const active = status === 'building' || status === 'exporting';
    return (
        <Paper
            className={`calculation-status calculation-status--${status}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            {active ? (
                <Loader className="calculation-status__activity" size={14} type="oval" />
            ) : (
                <Box className="calculation-status__activity" aria-hidden="true" />
            )}
            <Text component="strong">
                {status === 'exporting'
                    ? 'Exporting'
                    : status === 'building'
                      ? 'Calculating'
                      : status === 'error'
                        ? 'Error'
                        : 'Ready'}
            </Text>
            <Text component="span" size="xs">
                {status === 'error' && error ? error : STAGE_LABELS[stage]}
                {active ? '…' : ''}
            </Text>
        </Paper>
    );
}
