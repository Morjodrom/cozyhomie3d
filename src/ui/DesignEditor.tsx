import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Paper, Text } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { designConfigSchema, type DesignConfig } from '../domain/design';
import { createTextureDefault, type TextureKind } from '../domain/shared/textures';
import {
    DEFAULT_CIRCULAR_LOFT,
    circularLoftCircleCenter,
    type CircularLoftParameters,
} from '../shapes/circular-loft/domain/design';
import {
    CircularLoftControls,
    type CircularLoftFocus,
} from '../shapes/circular-loft/ui/CircularLoftControls';
import { circularLoftSectionHighlight as getCircularLoftSectionHighlight } from '../shapes/circular-loft/ui/section-highlight';
import { DEFAULT_DRAWER } from '../shapes/drawer/domain/design';
import {
    DrawerBottomRibCountFields,
    DrawerDimensionsFields,
    DrawerHandleFields,
    DrawerRigidityRibCountFields,
    DrawerTextureWallFields,
} from '../shapes/drawer/ui/DrawerControls';
import { DEFAULT_POT_WITH_TRAY } from '../shapes/pot-with-tray/domain/design';
import { PotWithTrayControls } from '../shapes/pot-with-tray/ui/PotWithTrayControls';
import { DEFAULT_POT } from '../shapes/pot/domain/design';
import { cavityFloorRadius, generateDrainageLayout } from '../shapes/pot/domain/drainage';
import {
    PotBottomRibCountField,
    PotDimensionsFields,
    PotDrainageRoundingFields,
    PotRigidityRibCountField,
} from '../shapes/pot/ui/PotControls';
import { Viewport, type ViewportControlsHandle } from './Viewport';
import { shouldCreaseEmbossedRibs } from './preview-geometry';
import { BottomRibFields } from './shared/BottomRibFields';
import { CalculationStatus } from './shared/CalculationStatus';
import { EdgeTreatmentFields } from './shared/EdgeTreatmentFields';
import { RigidityRibFields } from './shared/RigidityRibFields';
import { TextureFields } from './shared/TextureFields';
import type { DesignEditorProps } from './types';
import './editor.css';

export function DesignEditor({
    config,
    previewConfig,
    parts,
    stats,
    warnings = [],
    highFidelityPreview = false,
    status,
    stage,
    error,
    onChange,
    onExport,
    onHighFidelityPreviewChange,
}: DesignEditorProps) {
    const controlsRef = useRef<ViewportControlsHandle | null>(null);
    const emittedConfig = useRef(JSON.stringify(config));
    const drainageDraftValidRef = useRef(true);
    const [focusedCircularLoftCircle, setFocusedCircularLoftCircle] =
        useState<CircularLoftFocus | null>(null);
    const [activeCircularLoftSection, setActiveCircularLoftSection] = useState<number | null>(null);
    const [drainageDraftValid, setDrainageDraftValid] = useState(true);
    const [formResetRevision, setFormResetRevision] = useState(0);
    const {
        control,
        register,
        watch,
        reset,
        setValue,
        formState: { errors },
    } = useForm<DesignConfig>({
        resolver: zodResolver(designConfigSchema),
        defaultValues: config,
        mode: 'onChange',
    });

    useEffect(() => {
        const serialized = JSON.stringify(config);
        if (serialized !== emittedConfig.current) {
            emittedConfig.current = serialized;
            drainageDraftValidRef.current = true;
            setDrainageDraftValid(true);
            setFormResetRevision((revision) => revision + 1);
            setActiveCircularLoftSection(null);
            setFocusedCircularLoftCircle(null);
            reset(config);
        }
    }, [config, reset]);
    useEffect(() => {
        const subscription = watch((value) => {
            if (!drainageDraftValidRef.current) return;
            const parsed = designConfigSchema.safeParse(value);
            if (parsed.success) {
                emittedConfig.current = JSON.stringify(parsed.data);
                onChange(parsed.data);
            }
        });
        return () => subscription.unsubscribe();
    }, [watch, onChange]);

    const updateDrainageDraftValidity = useCallback((valid: boolean) => {
        drainageDraftValidRef.current = valid;
        setDrainageDraftValid(valid);
    }, []);

    const switchModel = (type: DesignConfig['type']) => {
        if (type === currentForm.type) return;
        setActiveCircularLoftSection(null);
        updateDrainageDraftValidity(true);
        setFormResetRevision((revision) => revision + 1);

        const base =
            type === 'pot'
                ? DEFAULT_POT
                : type === 'pot-with-tray'
                  ? DEFAULT_POT_WITH_TRAY
                  : type === 'drawer'
                    ? DEFAULT_DRAWER
                    : DEFAULT_CIRCULAR_LOFT;
        const current = designConfigSchema.safeParse(watch());
        if (type === 'circular-loft') {
            emittedConfig.current = JSON.stringify(base);
            setFocusedCircularLoftCircle(null);
            reset(base);
            onChange(base);
            return;
        }
        const nonLoftBase = base as Exclude<DesignConfig, { type: 'circular-loft' }>;
        const currentTexture =
            current.success && current.data.type !== 'circular-loft'
                ? current.data.texture
                : config.type !== 'circular-loft'
                  ? config.texture
                  : nonLoftBase.texture;
        const currentPotParameters =
            current.success &&
            (current.data.type === 'pot' || current.data.type === 'pot-with-tray')
                ? current.data.parameters
                : undefined;
        const next: DesignConfig = {
            ...nonLoftBase,
            ...(currentPotParameters && type !== 'drawer'
                ? { parameters: currentPotParameters }
                : {}),
            texture: currentTexture,
        } as DesignConfig;
        emittedConfig.current = JSON.stringify(next);
        setFocusedCircularLoftCircle(null);
        reset(next);
        onChange(next);
    };
    const switchTexture = (kind: TextureKind) => {
        const current = designConfigSchema.safeParse(watch());
        const base =
            current.success && current.data.type !== 'circular-loft' ? current.data : config;
        if (base.type === 'circular-loft') return;
        const next: DesignConfig = { ...base, texture: createTextureDefault(kind) } as DesignConfig;
        emittedConfig.current = JSON.stringify(next);
        updateDrainageDraftValidity(true);
        setFormResetRevision((revision) => revision + 1);
        reset(next);
        onChange(next);
    };
    const currentForm = watch() as DesignConfig;
    const currentPot =
        currentForm.type === 'pot' || currentForm.type === 'pot-with-tray'
            ? currentForm
            : undefined;
    const currentDrawer = currentForm.type === 'drawer' ? currentForm : undefined;
    const currentCircularLoft = currentForm.type === 'circular-loft' ? currentForm : undefined;
    const currentSupportedForm = currentForm.type === 'circular-loft' ? undefined : currentForm;
    const creaseEmbossedRibs =
        currentForm.type === 'circular-loft'
            ? false
            : shouldCreaseEmbossedRibs(currentForm.texture);
    const drainageCount = currentPot?.parameters.drainageHoles.length ?? 1;
    const drainageDiameter = currentPot?.parameters.drainageHoles[0]?.diameterMm ?? 6;
    const regenerateDrainage = (count: number | string, diameterMm: number | string) => {
        const complete =
            typeof count === 'number' &&
            Number.isInteger(count) &&
            count >= 1 &&
            count <= 24 &&
            typeof diameterMm === 'number' &&
            Number.isFinite(diameterMm) &&
            diameterMm >= 2 &&
            diameterMm <= 50;
        updateDrainageDraftValidity(complete);
        if (
            !currentPot ||
            !complete ||
            ![
                currentPot.parameters.bottomDiameterMm,
                currentPot.parameters.topDiameterMm,
                currentPot.parameters.heightMm,
                currentPot.parameters.bottomThicknessMm,
                currentPot.parameters.wallThicknessMm,
            ].every((value) => typeof value === 'number' && Number.isFinite(value))
        )
            return;
        const drainageHoles = generateDrainageLayout(count, diameterMm, {
            cavityFloorRadius: cavityFloorRadius(currentPot.parameters),
            wallThicknessMm: currentPot.parameters.wallThicknessMm,
        });
        setValue('parameters.drainageHoles' as never, drainageHoles as never, {
            shouldDirty: true,
            shouldValidate: true,
        });
    };

    const resetCamera = () => {
        controlsRef.current?.reset();
    };
    const parsedCurrentForm = designConfigSchema.safeParse(currentForm);
    const invalid = !parsedCurrentForm.success;
    const exportDisabled = invalid || !drainageDraftValid || status !== 'ready' || !parts?.length;
    const circularLoftHighlight = (() => {
        if (!currentCircularLoft || !focusedCircularLoftCircle) return undefined;
        const circle =
            currentCircularLoft.parameters.sections[focusedCircularLoftCircle.sectionIndex]
                ?.circles[focusedCircularLoftCircle.circleIndex];
        if (
            !circle ||
            !Number.isFinite(circle.diameterMm) ||
            circle.diameterMm < 0 ||
            !Number.isFinite(circle.offsetDistanceMm) ||
            circle.offsetDistanceMm < 0 ||
            !Number.isFinite(circle.offsetAngleDeg)
        )
            return undefined;
        const center = circularLoftCircleCenter(circle);
        const radiusMm = circle.diameterMm / 2;
        if (
            ![
                center.xMm - radiusMm,
                center.xMm + radiusMm,
                center.yMm - radiusMm,
                center.yMm + radiusMm,
            ].every((coordinate) => Number.isFinite(Math.fround(coordinate)))
        )
            return undefined;
        const zMm = currentCircularLoft.parameters.gapsMm
            .slice(0, focusedCircularLoftCircle.sectionIndex)
            .reduce((sum, gapMm) => sum + gapMm, 0);
        if (!Number.isFinite(Math.fround(zMm))) return undefined;
        return { diameterMm: circle.diameterMm, ...center, ...focusedCircularLoftCircle, zMm };
    })();
    const circularLoftSectionHighlight =
        currentCircularLoft && previewConfig?.type === 'circular-loft'
            ? getCircularLoftSectionHighlight(previewConfig, activeCircularLoftSection)
            : undefined;
    const setCircularLoftParameters = (parameters: CircularLoftParameters) => {
        setActiveCircularLoftSection(null);
        setFocusedCircularLoftCircle(null);
        setValue('parameters' as never, parameters as never, {
            shouldDirty: true,
            shouldValidate: true,
        });
    };

    return (
        <main className="editor-shell">
            <aside className="parameter-panel">
                <header className="parameter-panel__header">
                    <p className="eyebrow">Desktop 3D generator</p>
                    <h1>Make it fit.</h1>
                    <p>
                        Design a printable pot, fitted drainage tray, open drawer, or circular loft,
                        then export it as STL.
                    </p>
                </header>
                <section className="control-group">
                    <h2>Model</h2>
                    <div className="model-list" role="group" aria-label="Model type">
                        <Button
                            type="button"
                            aria-pressed={currentForm.type === 'pot'}
                            className={currentForm.type === 'pot' ? 'is-selected' : ''}
                            variant={currentForm.type === 'pot' ? 'filled' : 'default'}
                            onClick={() => switchModel('pot')}
                        >
                            Pot
                        </Button>
                        <Button
                            type="button"
                            aria-pressed={currentForm.type === 'pot-with-tray'}
                            className={currentForm.type === 'pot-with-tray' ? 'is-selected' : ''}
                            variant={currentForm.type === 'pot-with-tray' ? 'filled' : 'default'}
                            onClick={() => switchModel('pot-with-tray')}
                        >
                            Pot + tray
                        </Button>
                        <Button
                            type="button"
                            aria-pressed={currentForm.type === 'drawer'}
                            className={currentForm.type === 'drawer' ? 'is-selected' : ''}
                            variant={currentForm.type === 'drawer' ? 'filled' : 'default'}
                            onClick={() => switchModel('drawer')}
                        >
                            Drawer
                        </Button>
                        <Button
                            type="button"
                            aria-pressed={currentForm.type === 'circular-loft'}
                            className={currentForm.type === 'circular-loft' ? 'is-selected' : ''}
                            variant={currentForm.type === 'circular-loft' ? 'filled' : 'default'}
                            onClick={() => switchModel('circular-loft')}
                        >
                            Фигура по сечениям
                        </Button>
                    </div>
                </section>
                {currentCircularLoft ? (
                    <CircularLoftControls
                        parameters={currentCircularLoft.parameters}
                        control={control}
                        errors={errors}
                        focusedCircle={focusedCircularLoftCircle}
                        activeSectionIndex={activeCircularLoftSection}
                        onActivateSection={setActiveCircularLoftSection}
                        onFocusCircle={setFocusedCircularLoftCircle}
                        onParametersChange={setCircularLoftParameters}
                    />
                ) : currentForm.type === 'drawer' ? (
                    <DrawerDimensionsFields control={control} register={register} errors={errors} />
                ) : (
                    <PotDimensionsFields
                        drainageCount={drainageCount}
                        drainageDiameter={drainageDiameter}
                        resetRevision={formResetRevision}
                        showDrainage={Boolean(currentPot)}
                        regenerateDrainage={regenerateDrainage}
                        onDrainageDraftValidityChange={updateDrainageDraftValidity}
                        control={control}
                        register={register}
                        errors={errors}
                    />
                )}
                {!currentCircularLoft && currentForm.type === 'pot-with-tray' ? (
                    <PotWithTrayControls control={control} register={register} errors={errors} />
                ) : null}
                {!currentCircularLoft && currentDrawer ? (
                    <DrawerHandleFields
                        config={currentDrawer}
                        control={control}
                        register={register}
                        errors={errors}
                    />
                ) : null}
                {currentSupportedForm ? (
                    <>
                        <EdgeTreatmentFields
                            treatment={currentSupportedForm.parameters.edgeTreatment}
                            additionalFields={
                                currentPot ? (
                                    <PotDrainageRoundingFields
                                        parameters={currentPot.parameters}
                                        control={control}
                                        register={register}
                                        errors={errors}
                                    />
                                ) : undefined
                            }
                            control={control}
                            register={register}
                            errors={errors}
                        />
                        <BottomRibFields
                            enabled={currentSupportedForm.parameters.bottomRibs.enabled}
                            countFields={
                                currentSupportedForm.type === 'drawer' ? (
                                    <DrawerBottomRibCountFields
                                        control={control}
                                        register={register}
                                        errors={errors}
                                    />
                                ) : (
                                    <PotBottomRibCountField
                                        control={control}
                                        register={register}
                                        errors={errors}
                                    />
                                )
                            }
                            control={control}
                            register={register}
                            errors={errors}
                        />
                        <RigidityRibFields
                            enabled={currentSupportedForm.parameters.rigidityRibs.enabled}
                            countFields={
                                currentSupportedForm.type === 'drawer' ? (
                                    <DrawerRigidityRibCountFields
                                        control={control}
                                        register={register}
                                        errors={errors}
                                    />
                                ) : (
                                    <PotRigidityRibCountField
                                        control={control}
                                        register={register}
                                        errors={errors}
                                    />
                                )
                            }
                            control={control}
                            register={register}
                            errors={errors}
                        />
                        <TextureFields
                            texture={watch('texture')}
                            wallSelection={
                                currentSupportedForm.type === 'drawer' ? (
                                    <DrawerTextureWallFields register={register} />
                                ) : undefined
                            }
                            control={control}
                            register={register}
                            errors={errors}
                            switchTexture={switchTexture}
                        />
                    </>
                ) : null}
                {error ? (
                    <Alert className="message message--error" color="red" role="alert">
                        {error}
                    </Alert>
                ) : null}
                {warnings.map((warning) => (
                    <Alert className="message message--warning" color="yellow" key={warning}>
                        {warning}
                    </Alert>
                ))}
                <footer className="parameter-panel__footer">
                    <Button
                        className="export-button"
                        type="button"
                        onClick={onExport}
                        disabled={exportDisabled}
                        fullWidth
                    >
                        {status === 'exporting' ? 'Preparing STL…' : 'Export STL'}
                    </Button>
                    <p>
                        {invalid || !drainageDraftValid
                            ? 'Resolve the highlighted fields to export.'
                            : status === 'building'
                              ? 'Updating model…'
                              : 'STL uses millimetres.'}
                    </p>
                </footer>
            </aside>
            <section className="preview-panel">
                <div className="preview-panel__topbar">
                    <div>
                        <p className="eyebrow">Live preview</p>
                        <h2>
                            {currentForm.type === 'drawer'
                                ? 'Open drawer'
                                : currentForm.type === 'pot-with-tray'
                                  ? 'Planter pot with tray'
                                  : currentForm.type === 'circular-loft'
                                    ? 'Фигура по сечениям'
                                    : 'Planter pot'}
                        </h2>
                    </div>
                    <div className="preview-panel__actions">
                        <Button
                            type="button"
                            className={`secondary-button fidelity-button${highFidelityPreview ? ' is-selected' : ''}`}
                            variant={highFidelityPreview ? 'filled' : 'outline'}
                            aria-pressed={highFidelityPreview}
                            onClick={() => onHighFidelityPreviewChange?.(!highFidelityPreview)}
                            title="Use the STL export mesh and crease-aware surface normals. This may take longer to update."
                        >
                            {highFidelityPreview ? 'High fidelity on' : 'High fidelity'}
                        </Button>
                        <Button
                            type="button"
                            className="secondary-button"
                            variant="outline"
                            onClick={resetCamera}
                        >
                            Reset view
                        </Button>
                    </div>
                </div>
                <Viewport
                    parts={parts}
                    stats={stats}
                    controlsRef={controlsRef}
                    highFidelity={highFidelityPreview}
                    creaseEmbossedRibs={creaseEmbossedRibs}
                    previewGapMm={
                        currentForm.type === 'pot-with-tray' ? currentForm.tray.previewGapMm : 0
                    }
                    circularLoftHighlight={circularLoftHighlight}
                    circularLoftSectionHighlight={circularLoftSectionHighlight}
                />
                <div className="stats-bar" aria-live="polite">
                    <Paper>
                        <Text component="span">Dimensions</Text>
                        <Text component="strong">
                            {stats
                                ? stats.boundsMm
                                      .map((value) => `${value.toFixed(1)} mm`)
                                      .join(' × ')
                                : '—'}
                        </Text>
                    </Paper>
                    <Paper>
                        <Text component="span">Volume</Text>
                        <Text component="strong">
                            {stats ? `${(stats.volumeMm3 / 1000).toFixed(1)} cm³` : '—'}
                        </Text>
                    </Paper>
                    <Paper>
                        <Text component="span">Mesh</Text>
                        <Text component="strong">
                            {status === 'building'
                                ? 'Building…'
                                : stats
                                  ? `${stats.triangleCount.toLocaleString()} triangles${highFidelityPreview ? ' · STL detail' : ''}`
                                  : '—'}
                        </Text>
                    </Paper>
                </div>
            </section>
            <CalculationStatus status={status} stage={stage} error={error} />
        </main>
    );
}
