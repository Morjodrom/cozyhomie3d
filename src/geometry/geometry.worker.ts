/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from '../domain/worker'
import { buildGeometry } from './build'
import { encodeBinaryStl } from './stl'

const workerScope = self as unknown as DedicatedWorkerGlobalScope

function formatDimension(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

function filenameFor(request: Extract<WorkerRequest, { kind: 'export' }>, part: 'pot' | 'tray' | 'drawer'): string {
  if (part === 'pot' && request.config.type !== 'drawer') {
    const parameters = request.config.parameters
    return `pot-${formatDimension(parameters.topDiameterMm)}x${formatDimension(parameters.heightMm)}mm.stl`
  }
  if (part === 'tray' && request.config.type === 'pot-with-tray') {
    return `tray-${formatDimension(request.config.parameters.bottomDiameterMm)}x${formatDimension(request.config.tray.heightMm)}mm.stl`
  }
  if (request.config.type !== 'drawer') throw new Error('Unexpected exported model part.')
  const parameters = request.config.parameters
  return `drawer-${formatDimension(parameters.widthMm)}x${formatDimension(parameters.heightMm)}mm.stl`
}

let active = false
let pendingBuild: Extract<WorkerRequest, { kind: 'build' }> | undefined
const pendingExports: Extract<WorkerRequest, { kind: 'export' }>[] = []

async function process(request: WorkerRequest): Promise<void> {
  try {
    const reportStage = (stage: Extract<WorkerResponse, { kind: 'progress' }>['stage']) => {
      const response: WorkerResponse = {
        kind: 'progress',
        requestKind: request.kind,
        jobId: request.jobId,
        stage,
      }
      workerScope.postMessage(response)
    }

    if (request.kind === 'build') {
      const result = await buildGeometry(request.config, request.quality, reportStage)
      // A newer preview is already queued, so avoid transferring geometry the
      // main thread will immediately discard.
      if (pendingBuild && pendingBuild.jobId > request.jobId) return
      const response: WorkerResponse = {
        kind: 'built',
        jobId: request.jobId,
        parts: result.parts,
        stats: result.stats,
        warnings: result.warnings,
      }
      workerScope.postMessage(response, result.parts.flatMap((part) => [
        part.mesh.positions.buffer,
        part.mesh.indices.buffer,
        part.mesh.normals.buffer,
      ]))
      return
    }

    const result = await buildGeometry(request.config, 'export', reportStage)
    reportStage('encoding-files')
    const orderedParts = request.config.type === 'pot-with-tray'
      ? [...result.parts].sort((a, b) => Number(a.kind === 'tray') - Number(b.kind === 'tray'))
      : result.parts
    const files = orderedParts.map((part) => ({
      bytes: encodeBinaryStl(part.mesh, `Parametric ${part.kind}, millimetres`),
      filename: filenameFor(request, part.kind),
    }))
    const response: WorkerResponse = {
      kind: 'exported',
      jobId: request.jobId,
      files,
    }
    workerScope.postMessage(response, files.map((file) => file.bytes))
  } catch (error) {
    const response: WorkerResponse = {
      kind: 'failed',
      requestKind: request.kind,
      jobId: request.jobId,
      message: error instanceof Error ? error.message : 'Geometry generation failed.',
    }
    workerScope.postMessage(response)
  }
}

async function drain(): Promise<void> {
  if (active) return
  const nextExport = pendingExports.shift()
  const request = nextExport ?? pendingBuild
  if (!nextExport) pendingBuild = undefined
  if (!request) return
  active = true
  try {
    await process(request)
  } finally {
    active = false
    void drain()
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.kind === 'build') pendingBuild = event.data
  else pendingExports.push(event.data)
  void drain()
}
