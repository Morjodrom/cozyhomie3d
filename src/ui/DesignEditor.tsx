import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef } from 'react'
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { DEFAULT_DRAWER, DEFAULT_POT, createTextureDefault, designConfigSchema, TEXTURE_KINDS, TEXTURE_REGISTRY, textureSupportsModel, type DesignConfig, type DrawerTextureWalls, type TextureConfig, type TextureKind } from '../domain/design'
import { cavityFloorRadius, generateDrainageLayout } from '../domain/drainage'
import { Viewport } from './Viewport'
import type { DesignEditorProps } from './types'
import './editor.css'

type NumericFieldProps = {
  label: string
  field: string
  unit?: string
  error?: string
  register: UseFormRegister<DesignConfig>
}

function NumericField({ label, field, unit = 'mm', error, register }: NumericFieldProps) {
  return <label className="field">
    <span>{label}</span>
    <span className="field__control"><input type="number" step="any" aria-invalid={Boolean(error)} {...register(field as never, { valueAsNumber: true })} /><em>{unit}</em></span>
    {error ? <small role="alert">{error}</small> : null}
  </label>
}

function getError(errors: FieldErrors, key: string) {
  return (errors.parameters as Record<string, { message?: string }> | undefined)?.[key]?.message
}

function fieldNames(config: DesignConfig): ReadonlyArray<readonly [string, string, string?]> {
  return config.type === 'pot'
    ? [['heightMm', 'Height'], ['bottomDiameterMm', 'Bottom diameter'], ['topDiameterMm', 'Top diameter'], ['wallThicknessMm', 'Wall thickness'], ['bottomThicknessMm', 'Bottom thickness']] as const
    : [['widthMm', 'Width'], ['depthMm', 'Depth'], ['heightMm', 'Height'], ['wallThicknessMm', 'Wall thickness'], ['bottomThicknessMm', 'Bottom thickness']] as const
}

function errorAt(errors: FieldErrors, path: string): string | undefined {
  let current: unknown = errors
  for (const key of path.split('.')) current = (current as Record<string, unknown> | undefined)?.[key]
  return (current as { message?: string } | undefined)?.message
}

function textureScaleLabel(kind: TextureKind): string {
  if (kind === 'honeycomb') return 'Cell size'
  if (kind === 'voronoi') return 'Average cell size'
  return 'Scale'
}

function TextureFields({ modelType, texture, textureWalls, register, errors, switchTexture }: { modelType: DesignConfig['type']; texture: TextureConfig; textureWalls?: DrawerTextureWalls; register: UseFormRegister<DesignConfig>; errors: FieldErrors; switchTexture: (kind: TextureKind) => void }) {
  return <section className="control-group">
    <h3>Surface texture</h3>
    <label className="field"><span>Preset</span><select {...register('texture.kind' as never, { onChange: (event) => switchTexture(event.target.value as TextureKind) })}>
      {TEXTURE_KINDS.filter((kind) => textureSupportsModel(kind, modelType)).map((kind) => <option key={kind} value={kind}>{TEXTURE_REGISTRY[kind].label}</option>)}
    </select></label>
    {texture.kind !== 'smooth' ? <>
      {modelType === 'drawer' && textureWalls ? <fieldset className="texture-walls">
        <legend>Apply texture to</legend>
        <div className="texture-walls__options">
          <label><input type="checkbox" {...register('textureWalls.front' as never)} /> Front</label>
          <label><input type="checkbox" {...register('textureWalls.sides' as never)} /> Sides</label>
          <label><input type="checkbox" {...register('textureWalls.back' as never)} /> Back</label>
        </div>
      </fieldset> : null}
      <div className="field-grid">
        <NumericField label="Seed" field="texture.seed" unit="" error={errorAt(errors, 'texture.seed')} register={register} />
        <NumericField label={textureScaleLabel(texture.kind)} field="texture.scaleMm" error={errorAt(errors, 'texture.scaleMm')} register={register} />
        <NumericField label="Depth" field="texture.depthMm" error={errorAt(errors, 'texture.depthMm')} register={register} />
        <NumericField label="Coverage" field="texture.coveragePercent" unit="%" error={errorAt(errors, 'texture.coveragePercent')} register={register} />
        <NumericField label="Bottom fade" field="texture.bottomFadeMm" error={errorAt(errors, 'texture.bottomFadeMm')} register={register} />
        <NumericField label="Top fade" field="texture.topFadeMm" error={errorAt(errors, 'texture.topFadeMm')} register={register} />
      </div>
      <div className="field-row">
        <label className="field"><span>Relief mode</span><select {...register('texture.reliefMode' as never)}><option value="emboss">Emboss</option><option value="recess">Recess</option></select>{errorAt(errors, 'texture.reliefMode') ? <small role="alert">{errorAt(errors, 'texture.reliefMode')}</small> : null}</label>
        <label className="field"><span>Texture quality</span><select {...register('texture.quality' as never)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      </div>
      {texture.kind === 'noise' ? <div className="field-grid"><label className="field"><span>Dimensions</span><select {...register('texture.dimensions' as never)}><option value="2d">2D</option><option value="3d">3D</option></select></label><NumericField label="Octaves" field="texture.octaves" unit="" error={errorAt(errors, 'texture.octaves')} register={register} /><NumericField label="Persistence" field="texture.persistence" unit="" error={errorAt(errors, 'texture.persistence')} register={register} /></div> : null}
      {texture.kind === 'honeycomb' ? <div className="field-row"><NumericField label="Spacing" field="texture.spacingMm" error={errorAt(errors, 'texture.spacingMm')} register={register} /><label className="field"><span>Orientation</span><select {...register('texture.orientation' as never)}><option value="flat">Flat</option><option value="pointy">Pointy</option></select></label></div> : null}
      {texture.kind === 'voronoi' ? <div className="field-row"><NumericField label="Irregularity" field="texture.irregularity" unit="" error={errorAt(errors, 'texture.irregularity')} register={register} /><NumericField label="Edge width" field="texture.edgeWidthMm" error={errorAt(errors, 'texture.edgeWidthMm')} register={register} /></div> : null}
    </> : null}
  </section>
}

function BottomRibFields({ config, register, errors }: { config: DesignConfig; register: UseFormRegister<DesignConfig>; errors: FieldErrors }) {
  const ribs = config.parameters.bottomRibs
  return <section className="control-group">
    <h3>Bottom stress-relief ribs</h3>
    <label className="field field--checkbox"><span>Enabled</span><input type="checkbox" {...register('parameters.bottomRibs.enabled' as never)} /></label>
    {ribs.enabled ? <div className="field-grid">
      <NumericField label="Groove depth" field="parameters.bottomRibs.depthMm" error={errorAt(errors, 'parameters.bottomRibs.depthMm')} register={register} />
      <NumericField label="Groove width" field="parameters.bottomRibs.widthMm" error={errorAt(errors, 'parameters.bottomRibs.widthMm')} register={register} />
      {config.type === 'pot'
        ? <NumericField label="Concentric ribs" field="parameters.bottomRibs.count" unit="count" error={errorAt(errors, 'parameters.bottomRibs.count')} register={register} />
        : <>
          <NumericField label="Ribs parallel to X" field="parameters.bottomRibs.xCount" unit="count" error={errorAt(errors, 'parameters.bottomRibs.xCount')} register={register} />
          <NumericField label="Ribs parallel to Y" field="parameters.bottomRibs.yCount" unit="count" error={errorAt(errors, 'parameters.bottomRibs.yCount')} register={register} />
        </>}
    </div> : null}
  </section>
}

function EdgeTreatmentFields({ config, register, errors }: { config: DesignConfig; register: UseFormRegister<DesignConfig>; errors: FieldErrors }) {
  const treatment = config.parameters.edgeTreatment
  return <section className="control-group">
    <h3>Edge treatment</h3>
    <label className="field"><span>Style</span><select {...register('parameters.edgeTreatment.style' as never)}>
      <option value="none">None</option>
      <option value="rounded">Rounded</option>
      <option value="chamfered">Chamfered</option>
    </select></label>
    {treatment.style !== 'none' ? <div className="field-grid">
      <NumericField
        label={treatment.style === 'rounded' ? 'Radius' : 'Chamfer width'}
        field="parameters.edgeTreatment.sizeMm"
        error={errorAt(errors, 'parameters.edgeTreatment.sizeMm')}
        register={register}
      />
    </div> : null}
    {config.type === 'pot' ? <>
      <label className="field field--checkbox"><span>Round drainage holes</span><input type="checkbox" {...register('parameters.drainageHoleRounding.enabled' as never)} /></label>
      {config.parameters.drainageHoleRounding.enabled ? <div className="field-grid">
        <NumericField label="Drainage radius" field="parameters.drainageHoleRounding.radiusMm" error={errorAt(errors, 'parameters.drainageHoleRounding.radiusMm')} register={register} />
      </div> : null}
    </> : null}
  </section>
}

export function DesignEditor({ config, mesh, stats, warnings = [], highFidelityPreview = false, status, error, onChange, onExport, onHighFidelityPreviewChange, onResetCamera }: DesignEditorProps) {
  const controlsRef = useRef<{ reset: () => void } | null>(null)
  const emittedConfig = useRef(JSON.stringify(config))
  const { register, watch, reset, setValue, formState: { errors } } = useForm<DesignConfig>({
    resolver: zodResolver(designConfigSchema),
    defaultValues: config,
    mode: 'onChange',
  })

  useEffect(() => {
    const serialized = JSON.stringify(config)
    if (serialized !== emittedConfig.current) {
      emittedConfig.current = serialized
      reset(config)
    }
  }, [config, reset])
  useEffect(() => {
    const subscription = watch((value) => {
      const parsed = designConfigSchema.safeParse(value)
      if (parsed.success) {
        emittedConfig.current = JSON.stringify(parsed.data)
        onChange(parsed.data)
      }
    })
    return () => subscription.unsubscribe()
  }, [watch, onChange])

  const switchModel = (type: 'pot' | 'drawer') => {
    const base = type === 'pot' ? DEFAULT_POT : DEFAULT_DRAWER
    const current = designConfigSchema.safeParse(watch())
    const currentTexture = current.success ? current.data.texture : config.texture
    const texture = textureSupportsModel(currentTexture.kind, type) ? currentTexture : base.texture
    const next: DesignConfig = { ...base, texture } as DesignConfig
    emittedConfig.current = JSON.stringify(next)
    reset(next)
    onChange(next)
  }
  const switchTexture = (kind: TextureKind) => {
    const current = designConfigSchema.safeParse(watch())
    const base = current.success ? current.data : config
    const next: DesignConfig = { ...base, texture: createTextureDefault(kind) } as DesignConfig
    emittedConfig.current = JSON.stringify(next)
    reset(next)
    onChange(next)
  }
  const currentForm = watch() as DesignConfig
  const currentPot = currentForm.type === 'pot' ? currentForm : undefined
  const currentDrawer = currentForm.type === 'drawer' ? currentForm : undefined
  const drainageCount = currentPot?.parameters.drainageHoles.length ?? 1
  const drainageDiameter = currentPot?.parameters.drainageHoles[0]?.diameterMm ?? 6
  const regenerateDrainage = (count: number, diameterMm: number) => {
    if (!currentPot || !Number.isInteger(count) || count < 1 || count > 12 || diameterMm < 2 || diameterMm > 20) return
    const drainageHoles = generateDrainageLayout(count, diameterMm, {
      cavityFloorRadius: cavityFloorRadius(currentPot.parameters),
      wallThicknessMm: currentPot.parameters.wallThicknessMm,
    })
    setValue('parameters.drainageHoles' as never, drainageHoles as never, { shouldDirty: true, shouldValidate: true })
  }

  const resetCamera = () => {
    controlsRef.current?.reset()
    onResetCamera?.()
  }
  const invalid = Object.keys(errors).length > 0
  const exportDisabled = invalid || status !== 'ready' || !mesh

  return <main className="editor-shell">
    <aside className="parameter-panel">
      <header className="parameter-panel__header"><p className="eyebrow">Desktop 3D generator</p><h1>Make it fit.</h1><p>Design a printable pot or open drawer, then export it as STL.</p></header>
      <section className="control-group"><h2>Model</h2><div className="segmented" role="group" aria-label="Model type">
        <button type="button" className={config.type === 'pot' ? 'is-selected' : ''} onClick={() => switchModel('pot')}>Pot</button>
        <button type="button" className={config.type === 'drawer' ? 'is-selected' : ''} onClick={() => switchModel('drawer')}>Drawer</button>
      </div></section>
      <section className="control-group"><h3>{config.type === 'pot' ? 'Pot dimensions' : 'Drawer dimensions'}</h3>
        <div className="field-grid">{fieldNames(config).map(([key, label, unit]) => <NumericField key={key} label={label} field={`parameters.${key}`} unit={unit} error={getError(errors, key)} register={register} />)}</div>
        {currentPot ? <div className="field-grid">
          <label className="field"><span>Drainage holes</span><span className="field__control"><input name="drainage.count" type="number" min="1" max="12" step="1" value={drainageCount} onChange={(event) => regenerateDrainage(Number(event.target.value), drainageDiameter)} /><em>count</em></span></label>
          <label className="field"><span>Hole diameter</span><span className="field__control"><input name="drainage.diameterMm" type="number" min="2" max="20" step="any" value={drainageDiameter} onChange={(event) => regenerateDrainage(drainageCount, Number(event.target.value))} /><em>mm</em></span></label>
        </div> : null}
      </section>
      {currentDrawer ? <section className="control-group"><h3>Drawer handle</h3>
        <label className="field"><span>Handle style</span><select {...register('parameters.handleStyle' as never)}>
          <option value="projecting">Projecting lip</option>
          <option value="recessed">Reinforced opening</option>
        </select></label>
        <div className="field-grid">
          <NumericField label="Handle width" field="parameters.handleWidthMm" error={getError(errors, 'handleWidthMm')} register={register} />
          <NumericField label="Handle height" field="parameters.handleHeightMm" error={getError(errors, 'handleHeightMm')} register={register} />
          <NumericField label={currentDrawer.parameters.handleStyle === 'recessed' ? 'Rib depth' : 'Projection'} field="parameters.handleDepthMm" error={getError(errors, 'handleDepthMm')} register={register} />
          {currentDrawer.parameters.handleStyle === 'recessed' ? <NumericField label="Corner radius" field="parameters.handleCornerRadiusMm" error={getError(errors, 'handleCornerRadiusMm')} register={register} /> : null}
          <NumericField label="Vertical position" field="parameters.handlePositionPercent" unit="%" error={getError(errors, 'handlePositionPercent')} register={register} />
        </div>
      </section> : null}
      <EdgeTreatmentFields config={currentForm} register={register} errors={errors} />
      <BottomRibFields config={currentForm} register={register} errors={errors} />
      <TextureFields
        modelType={currentForm.type}
        texture={watch('texture')}
        textureWalls={currentForm.type === 'drawer' ? currentForm.textureWalls : undefined}
        register={register}
        errors={errors}
        switchTexture={switchTexture}
      />
      {error ? <p className="message message--error" role="alert">{error}</p> : null}
      {warnings.map((warning) => <p className="message message--warning" key={warning}>{warning}</p>)}
      <footer className="parameter-panel__footer"><button className="export-button" type="button" onClick={onExport} disabled={exportDisabled}>{status === 'exporting' ? 'Preparing STL…' : 'Export STL'}</button><p>{invalid ? 'Resolve the highlighted fields to export.' : status === 'building' ? 'Updating model…' : 'STL uses millimetres.'}</p></footer>
    </aside>
    <section className="preview-panel">
      <div className="preview-panel__topbar"><div><p className="eyebrow">Live preview</p><h2>{config.type === 'pot' ? 'Planter pot' : 'Open drawer'}</h2></div><div className="preview-panel__actions">
        <button
          type="button"
          className={`secondary-button fidelity-button${highFidelityPreview ? ' is-selected' : ''}`}
          aria-pressed={highFidelityPreview}
          onClick={() => onHighFidelityPreviewChange?.(!highFidelityPreview)}
          title="Use the STL export mesh and crease-aware surface normals. This may take longer to update."
        >{highFidelityPreview ? 'High fidelity on' : 'High fidelity'}</button>
        <button type="button" className="secondary-button" onClick={resetCamera}>Reset view</button>
      </div></div>
      <Viewport mesh={mesh} stats={stats} controlsRef={controlsRef} highFidelity={highFidelityPreview} />
      <div className="stats-bar" aria-live="polite">
        <div><span>Dimensions</span><strong>{stats ? stats.boundsMm.map((value) => `${value.toFixed(1)} mm`).join(' × ') : '—'}</strong></div>
        <div><span>Volume</span><strong>{stats ? `${(stats.volumeMm3 / 1000).toFixed(1)} cm³` : '—'}</strong></div>
        <div><span>Mesh</span><strong>{status === 'building' ? 'Building…' : stats ? `${stats.triangleCount.toLocaleString()} triangles${highFidelityPreview ? ' · STL detail' : ''}` : '—'}</strong></div>
      </div>
    </section>
  </main>
}
