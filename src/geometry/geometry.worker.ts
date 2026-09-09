/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from '../domain/worker'
import { buildGeometry } from './build'
import { encodeBinaryStl } from './stl'

const workerScope = self as unknown as DedicatedWorkerGlobalScope

function formatDimension(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

function filenameFor(request: Extract<WorkerRequest, { kind: 'export' }>): string {
  if (request.config.type === 'pot') {
    const parameters = request.config.parameters
    return `pot-${formatDimension(parameters.topDiameterMm)}x${formatDimension(parameters.heightMm)}mm.stl`
  }
  const parameters = request.config.parameters
  return `drawer-${formatDimension(parameters.widthMm)}x${formatDimension(parameters.heightMm)}mm.stl`
}

let active = false
let pendingBuild: Extract<WorkerRequest, { kind: 'build' }> | undefined
const pendingExports: Extract<WorkerRequest, { kind: 'export' }>[] = []

async function process(request: WorkerRequest): Promise<void> {
  try {
    if (request.kind === 'build') {
      const result = await buildGeometry(request.config, request.quality)
      // A newer preview is already queued, so avoid transferring geometry the
      // main thread will immediately discard.
      if (pendingBuild && pendingBuild.jobId > request.jobId) return
      const response: WorkerResponse = {
        kind: 'built',
        jobId: request.jobId,
        mesh: result.mesh,
        stats: result.stats,
        warnings: result.warnings,
      }
      workerScope.postMessage(response, [
        result.mesh.positions.buffer,
        result.mesh.indices.buffer,
        result.mesh.normals.buffer,
      ])
      return
    }

    const result = await buildGeometry(request.config, 'export')
    const bytes = encodeBinaryStl(result.mesh)
    const response: WorkerResponse = {
      kind: 'exported',
      jobId: request.jobId,
      bytes,
      filename: filenameFor(request),
    }
    workerScope.postMessage(response, [bytes])
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
