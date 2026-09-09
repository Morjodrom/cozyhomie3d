import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_POT, type DesignConfig } from './domain/design'
import { loadSession, saveSession } from './domain/persistence'
import type { MeshData, ModelStats, WorkerRequest, WorkerResponse } from './domain/worker'
import { DesignEditor, type EditorStatus } from './ui'

function initialConfig(): DesignConfig {
  return loadSession(window.localStorage) ?? DEFAULT_POT
}

export function App() {
  const [config, setConfig] = useState<DesignConfig>(initialConfig)
  const [mesh, setMesh] = useState<MeshData>()
  const [stats, setStats] = useState<ModelStats>()
  const [warnings, setWarnings] = useState<string[]>([])
  const [highFidelityPreview, setHighFidelityPreview] = useState(false)
  const [status, setStatus] = useState<EditorStatus>('building')
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
      if (response.kind === 'built') {
        if (response.jobId !== latestBuildId.current) return
        setMesh(response.mesh)
        setStats(response.stats)
        setWarnings(response.warnings)
        setError(undefined)
        setStatus('ready')
        return
      }

      if (response.kind === 'exported') {
        if (response.jobId !== latestExportId.current) return
        const url = URL.createObjectURL(new Blob([response.bytes], { type: 'model/stl' }))
        const link = document.createElement('a')
        link.href = url
        link.download = response.filename
        document.body.append(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
        setError(undefined)
        setStatus('ready')
        return
      }

      const isLatest = response.requestKind === 'build'
        ? response.jobId === latestBuildId.current
        : response.jobId === latestExportId.current
      if (isLatest) {
        setError(response.message)
        setStatus('error')
      }
    }

    worker.onerror = () => {
      setError('The geometry engine could not start. Reload the page and try again.')
      setStatus('error')
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
    const timer = window.setTimeout(() => saveSession(window.localStorage, config), 300)
    return () => window.clearTimeout(timer)
  }, [config])

  const handleChange = useCallback((next: DesignConfig) => setConfig(next), [])
  const handleExport = useCallback(() => {
    const jobId = ++nextJobId.current
    latestExportId.current = jobId
    setStatus('exporting')
    setError(undefined)
    const request: WorkerRequest = { kind: 'export', jobId, config }
    workerRef.current?.postMessage(request)
  }, [config])

  return (
    <DesignEditor
      config={config}
      mesh={mesh}
      stats={stats}
      warnings={warnings}
      highFidelityPreview={highFidelityPreview}
      status={status}
      error={error}
      onChange={handleChange}
      onExport={handleExport}
      onHighFidelityPreviewChange={setHighFidelityPreview}
    />
  )
}
