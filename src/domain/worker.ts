import type { DesignConfig } from './design'

export type BuildQuality = 'draft' | 'preview' | 'export'

export type BuildRequest = {
  kind: 'build'
  jobId: number
  config: DesignConfig
  quality: BuildQuality
}

export type ExportRequest = {
  kind: 'export'
  jobId: number
  config: DesignConfig
}

export type MeshData = {
  positions: Float32Array
  indices: Uint32Array
  normals: Float32Array
}

export type ModelStats = {
  boundsMm: [number, number, number]
  volumeMm3: number
  triangleCount: number
}

export type WorkerSuccess = {
  kind: 'built'
  jobId: number
  mesh: MeshData
  stats: ModelStats
  warnings: string[]
}

export type ExportSuccess = {
  kind: 'exported'
  jobId: number
  bytes: ArrayBuffer
  filename: string
}

export type WorkerFailure = {
  kind: 'failed'
  jobId: number
  message: string
}

export type WorkerRequest = BuildRequest | ExportRequest
export type WorkerResponse = WorkerSuccess | ExportSuccess | WorkerFailure
