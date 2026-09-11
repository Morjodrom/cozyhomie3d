import type { DesignConfig } from './design'

export type BuildQuality = 'draft' | 'preview' | 'export'

export type GeometryBuildStage =
  | 'loading-engine'
  | 'planning'
  | 'constructing'
  | 'validating'
  | 'preparing-mesh'

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

export type ModelPartKind = 'pot' | 'tray' | 'drawer'

export type ModelPartData = {
  kind: ModelPartKind
  mesh: MeshData
  previewOffsetMm: [number, number, number]
}

export type ModelStats = {
  boundsMm: [number, number, number]
  volumeMm3: number
  triangleCount: number
}

export type WorkerSuccess = {
  kind: 'built'
  jobId: number
  parts: ModelPartData[]
  stats: ModelStats
  warnings: string[]
}

export type ExportedFile = {
  bytes: ArrayBuffer
  filename: string
}

export type ExportSuccess = {
  kind: 'exported'
  jobId: number
  files: ExportedFile[]
}

export type WorkerProgress = {
  kind: 'progress'
  requestKind: WorkerRequest['kind']
  jobId: number
  stage: GeometryBuildStage | 'encoding-files'
}

export type WorkerFailure = {
  kind: 'failed'
  requestKind: WorkerRequest['kind']
  jobId: number
  message: string
}

export type WorkerRequest = BuildRequest | ExportRequest
export type WorkerResponse = WorkerProgress | WorkerSuccess | ExportSuccess | WorkerFailure
