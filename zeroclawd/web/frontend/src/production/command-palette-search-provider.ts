import type { FeatureGroup } from '../api/registry'

export interface CommandPaletteSurface {
  id: string
  label: string
  path: string
  group: FeatureGroup
  description?: string
  isHidden: boolean
}
