import { API_ENDPOINTS, type ApiEndpoint, type FeatureGroup } from '../api/registry'

export interface SidebarAgent {
  id: string
  label: string
  path: string
  group: FeatureGroup
  description?: string
  isPinned?: boolean
  isHidden?: boolean
}

export interface StatusSnapshot {
  status: string
  agent: string
  version: string
  mode: string
  uptime: string
  goVersion: string
  goroutines: number | null
}

export interface ConnectorRow {
  name: string
  status: string
  type: string
}

export interface EcosystemLink {
  label: string
  url: string
}

export interface KeyPresenceRow {
  name: string
  label: string
  group: string
  set: boolean
}

export interface SurfaceSnapshot {
  path: string
  data: unknown
  fetchedAtMs: number
  error?: string
}

const stringValue = (value: unknown): string => (typeof value === 'string' ? value : '')
const numberValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export function projectRendererSurfaces(endpoints: readonly ApiEndpoint[] = API_ENDPOINTS): SidebarAgent[] {
  return endpoints.map((endpoint) => ({
    id: endpoint.id,
    label: endpoint.label,
    path: endpoint.path,
    group: endpoint.group,
    description: endpoint.description,
    isPinned: false,
    isHidden: false,
  }))
}

export function projectStatus(value: unknown): StatusSnapshot {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    status: stringValue(raw.status) || 'unknown',
    agent: stringValue(raw.agent) || 'clawdbot',
    version: stringValue(raw.version) || '0.0.0',
    mode: stringValue(raw.mode) || 'unknown',
    uptime: stringValue(raw.uptime) || '—',
    goVersion: stringValue(raw.go_version) || '—',
    goroutines: numberValue(raw.goroutines),
  }
}

export function statusLine(snapshot: StatusSnapshot): string {
  return `${snapshot.agent} v${snapshot.version} · ${snapshot.status} · ${snapshot.mode} · up ${snapshot.uptime}`
}

export function projectConnectors(value: unknown): ConnectorRow[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row): row is Record<string, unknown> => typeof value === 'object' && row !== null)
    .map((row) => ({
      name: stringValue(row.name) || 'unnamed',
      status: stringValue(row.status) || 'unknown',
      type: stringValue(row.type) || 'unknown',
    }))
}

export function projectEcosystemLinks(value: unknown): EcosystemLink[] {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const links: EcosystemLink[] = []
  for (const entry of Object.entries(raw)) {
    const nested = entry[1]
    if (typeof nested === 'object' && nested !== null) {
      const record = nested as Record<string, unknown>
      const url = stringValue(record.url)
      if (url.startsWith('http')) links.push({ label: entry[0], url })
      continue
    }
    const url = stringValue(nested)
    if (url.startsWith('http')) links.push({ label: entry[0], url })
  }
  return links
}

export function projectKeyPresences(value: unknown): KeyPresenceRow[] {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  if (!Array.isArray(raw.keys)) return []
  return raw.keys
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      name: stringValue(row.name),
      label: stringValue(row.label) || stringValue(row.name),
      group: stringValue(row.group) || 'other',
      set: row.set === true,
    }))
}
