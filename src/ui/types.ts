import type { DesignConfig } from '../domain/design'
import type { MeshData, ModelStats } from '../domain/worker'

export type EditorStatus = 'idle' | 'building' | 'ready' | 'error' | 'exporting'

export type DesignEditorProps = {
  config: DesignConfig
  mesh?: MeshData
  stats?: ModelStats
  warnings?: string[]
  highFidelityPreview?: boolean
  status: EditorStatus
  error?: string
  onChange: (config: DesignConfig) => void
  onExport: () => void
  onHighFidelityPreviewChange?: (enabled: boolean) => void
  onResetCamera?: () => void
}
