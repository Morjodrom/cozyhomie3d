import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef } from 'react'
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { DEFAULT_DRAWER, DEFAULT_POT, designConfigSchema, type DesignConfig, type TextureConfig } from '../domain/design'
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

function fieldNames(config: DesignConfig) {
  return config.type === 'pot'
    ? [['heightMm', 'Height'], ['bottomDiameterMm', 'Bottom diameter'], ['topDiameterMm', 'Top diameter'], ['wallThicknessMm', 'Wall thickness'], ['bottomThicknessMm', 'Bottom thickness'], ['drainageHoleCount', 'Drainage holes', 'count'], ['drainageHoleDiameterMm', 'Hole diameter']] as const
    : [['widthMm', 'Width'], ['depthMm', 'Depth'], ['heightMm', 'Height'], ['wallThicknessMm', 'Wall thickness'], ['bottomThicknessMm', 'Bottom thickness'], ['handleWidthMm', 'Handle width'], ['handleProjectionMm', 'Handle projection']] as const
}

function TextureFields({ texture, register, error }: { texture: TextureConfig; register: UseFormRegister<DesignConfig>; error?: string }) {
  return <section className="control-group">
    <h3>Surface texture</h3>
    <label className="field"><span>Preset</span><select {...register('texture.kind' as never)}>
      <option value="smooth">Smooth</option><option value="ribs">Vertical ribs</option><option value="twisted">Twisted / diagonal ribs</option>
    </select></label>
    {texture.kind !== 'smooth' ? <div className="field-row">
      <NumericField label="Ridge height" field="texture.amplitudeMm" error={error} register={register} />
      <NumericField label="Density" field="texture.density" unit="ridges" error={error} register={register} />
    </div> : null}
  </section>
}

export function DesignEditor({ config, mesh, stats, warnings = [], status, error, onChange, onExport, onResetCamera }: DesignEditorProps) {
  const controlsRef = useRef<{ reset: () => void } | null>(null)
  const emittedConfig = useRef(JSON.stringify(config))
  const { register, watch, reset, formState: { errors } } = useForm<DesignConfig>({
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
    const current = watch('texture')
    const next: DesignConfig = { ...base, texture: current.kind === 'smooth' ? current : { ...current } } as DesignConfig
    emittedConfig.current = JSON.stringify(next)
    reset(next)
    onChange(next)
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
      </section>
      <TextureFields texture={watch('texture')} register={register} error={(errors.texture as { message?: string } | undefined)?.message} />
      {error ? <p className="message message--error" role="alert">{error}</p> : null}
      {warnings.map((warning) => <p className="message message--warning" key={warning}>{warning}</p>)}
      <footer className="parameter-panel__footer"><button className="export-button" type="button" onClick={onExport} disabled={exportDisabled}>{status === 'exporting' ? 'Preparing STL…' : 'Export STL'}</button><p>{invalid ? 'Resolve the highlighted fields to export.' : status === 'building' ? 'Updating model…' : 'STL uses millimetres.'}</p></footer>
    </aside>
    <section className="preview-panel">
      <div className="preview-panel__topbar"><div><p className="eyebrow">Live preview</p><h2>{config.type === 'pot' ? 'Planter pot' : 'Open drawer'}</h2></div><button type="button" className="secondary-button" onClick={resetCamera}>Reset view</button></div>
      <Viewport mesh={mesh} stats={stats} controlsRef={controlsRef} />
      <div className="stats-bar" aria-live="polite">
        <div><span>Dimensions</span><strong>{stats ? stats.boundsMm.map((value) => `${value.toFixed(1)} mm`).join(' × ') : '—'}</strong></div>
        <div><span>Volume</span><strong>{stats ? `${(stats.volumeMm3 / 1000).toFixed(1)} cm³` : '—'}</strong></div>
        <div><span>Mesh</span><strong>{stats ? `${stats.triangleCount.toLocaleString()} triangles` : status === 'building' ? 'Building…' : '—'}</strong></div>
      </div>
    </section>
  </main>
}
