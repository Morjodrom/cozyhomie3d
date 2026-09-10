import type { DesignConfig } from '../domain/design'
import type { ModelPartData, ModelStats } from '../domain/worker'

export type EditorStatus = 'building' | 'ready' | 'error' | 'exporting'

export type DesignEditorProps = {
  config: DesignConfig
  parts?: ModelPartData[]
  stats?: ModelStats
  warnings?: string[]
  highFidelityPreview?: boolean
  status: EditorStatus
  error?: string
  onChange: (config: DesignConfig) => void
  onExport: () => void
  onHighFidelityPreviewChange?: (enabled: boolean) => void
}
