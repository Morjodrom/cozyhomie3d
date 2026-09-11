import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_POT, type DesignConfig } from './domain/design'
import { loadSession, saveSession } from './domain/persistence'
import type { ModelPartData, ModelStats, WorkerRequest, WorkerResponse } from './domain/worker'
import { DesignEditor, type EditorStage, type EditorStatus } from './ui'

function initialSession() {
  return loadSession(window.localStorage) ?? { config: DEFAULT_POT, highFidelityPreview: false }
}

export function App() {
  const [initial] = useState(initialSession)
  const [config, setConfig] = useState<DesignConfig>(initial.config)
  const [parts, setParts] = useState<ModelPartData[]>()
  const [stats, setStats] = useState<ModelStats>()
  const [warnings, setWarnings] = useState<string[]>([])
  const [highFidelityPreview, setHighFidelityPreview] = useState(initial.highFidelityPreview)
  const [status, setStatus] = useState<EditorStatus>('building')
  const [stage, setStage] = useState<EditorStage>('waiting')
  const [error, setError] = useState<string>()
  const workerRef = useRef<Worker | null>(null)
  const nextJobId = useRef(0)
  const latestBuildId = useRef(0)
  const latestExportId = useRef(0)

  useEffect(() => {
    const worker = new Worker(new URL('./geometry/geometry.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      if (response.kind === 'progress') {
        const isLatest = response.requestKind === 'build'
          ? response.jobId === latestBuildId.current
          : response.jobId === latestExportId.current
        if (isLatest) setStage(response.stage)
        return
      }
      if (response.kind === 'built') {
        if (response.jobId !== latestBuildId.current) return
        setParts(response.parts)
        setStats(response.stats)
        setWarnings(response.warnings)
        setError(undefined)
        setStatus('ready')
        setStage('complete')
        return
      }

      if (response.kind === 'exported') {
        if (response.jobId !== latestExportId.current) return
        for (const file of response.files) {
          const url = URL.createObjectURL(new Blob([file.bytes], { type: 'model/stl' }))
          const link = document.createElement('a')
          link.href = url
          link.download = file.filename
          document.body.append(link)
          link.click()
          link.remove()
          window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
        }
        setError(undefined)
        setStatus('ready')
        setStage('complete')
        return
      }

      const isLatest = response.requestKind === 'build'
        ? response.jobId === latestBuildId.current
        : response.jobId === latestExportId.current
      if (isLatest) {
        setError(response.message)
        setStatus('error')
        setStage('failed')
      }
    }

    worker.onerror = () => {
      setError('The geometry engine could not start. Reload the page and try again.')
      setStatus('error')
      setStage('failed')
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    const jobId = ++nextJobId.current
    latestBuildId.current = jobId
    setStatus('building')
    setStage('waiting')
    setError(undefined)
    const timer = window.setTimeout(() => {
      // High-fidelity preview deliberately uses the exact tessellation plan used
      // by STL export, so what is shown is the geometry that will be downloaded.
      const request: WorkerRequest = { kind: 'build', jobId, config, quality: highFidelityPreview ? 'export' : 'preview' }
      workerRef.current?.postMessage(request)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [config, highFidelityPreview])

  useEffect(() => {
    const timer = window.setTimeout(() => saveSession(window.localStorage, { config, highFidelityPreview }), 300)
    return () => window.clearTimeout(timer)
  }, [config, highFidelityPreview])

  const handleChange = useCallback((next: DesignConfig) => setConfig(next), [])
  const handleExport = useCallback(() => {
    const jobId = ++nextJobId.current
    latestExportId.current = jobId
    setStatus('exporting')
    setStage('waiting')
    setError(undefined)
    const request: WorkerRequest = { kind: 'export', jobId, config }
    workerRef.current?.postMessage(request)
  }, [config])

  return (
    <DesignEditor
      config={config}
      parts={parts}
      stats={stats}
      warnings={warnings}
      highFidelityPreview={highFidelityPreview}
      status={status}
      stage={stage}
      error={error}
      onChange={handleChange}
      onExport={handleExport}
      onHighFidelityPreviewChange={setHighFidelityPreview}
    />
  )
}
