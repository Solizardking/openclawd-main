import type { CommandPaletteCommand } from './command-palette-provider'
import { statusLine, type StatusSnapshot } from './model'

export function rootCommands({
  surfaces,
  selectedId,
  onOpenSurface,
  onRefresh,
  onTogglePolling,
  pollingEnabled,
  onCopyBaseUrl,
  onOpenRepo,
  onOpenHub,
  onSwitchClassic,
  status,
}: {
  surfaces: readonly { id: string; label: string; group: string }[]
  selectedId: string | null
  onOpenSurface: (agentId: string) => void
  onRefresh: () => void
  onTogglePolling: () => void
  pollingEnabled: boolean
  onCopyBaseUrl: () => void
  onOpenRepo: () => void
  onOpenHub: () => void
  onSwitchClassic: () => void
  status: StatusSnapshot | null
}): readonly CommandPaletteCommand[] {
  const groups = new Map<string, { id: string; label: string }[]>()
  for (const surface of surfaces) {
    const bucket = groups.get(surface.group) ?? []
    bucket.push(surface)
    groups.set(surface.group, bucket)
  }
  const openChildren: CommandPaletteCommand[] = [...groups.entries()].flatMap(([group, entries]) =>
    entries.map((entry) => ({
      id: `open:${entry.id}`,
      label: entry.label,
      keywords: [group, entry.id],
      run: () => onOpenSurface(entry.id),
    })),
  )
  return [
    {
      id: 'open-surface',
      label: 'Open surface…',
      icon: '↗',
      keywords: ['open', 'go', 'endpoint', 'section'],
      children: openChildren,
      run: () => {},
    },
    { id: 'refresh-now', label: 'Refresh now', icon: '⟳', keywords: ['poll', 'reload'], run: onRefresh },
    {
      id: 'toggle-polling',
      label: pollingEnabled ? 'Pause background polling' : 'Resume background polling',
      icon: '⏻',
      keywords: ['polling', 'pause', 'resume', 'transport'],
      detail: pollingEnabled ? 'polling every 15s' : 'polling paused',
      isActive: pollingEnabled,
      run: onTogglePolling,
    },
    { id: 'copy-base-url', label: 'Copy API base URL', icon: '⧉', keywords: ['copy', 'url', 'api'], run: onCopyBaseUrl },
    {
      id: 'copy-status-line',
      label: 'Copy status line',
      icon: '⧉',
      keywords: ['copy', 'status'],
      run: () => {
        if (status != null) void navigator.clipboard?.writeText(statusLine(status))
      },
    },
    {
      id: 'open-runtime-repo',
      label: 'Open runtime repo (Zero-Bruh)',
      icon: '⌘',
      keywords: ['github', 'repo', 'runtime', 'source'],
      run: onOpenRepo,
    },
    {
      id: 'open-ecosystem-hub',
      label: 'Open ecosystem hub',
      icon: '⌘',
      keywords: ['github', 'hub', 'solana-clawd', 'ecosystem'],
      run: onOpenHub,
    },
    {
      id: 'switch-classic',
      label: 'Switch to classic console',
      icon: '←',
      keywords: ['classic', 'dashboard', 'console', 'exit'],
      detail: selectedId != null ? undefined : 'leaves production renderer',
      run: onSwitchClassic,
    },
  ]
}
