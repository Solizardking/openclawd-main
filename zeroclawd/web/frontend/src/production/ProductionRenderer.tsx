import { useCallback, useEffect, useMemo, useState } from 'react'
import AgentDeleteConfirmation from './AgentDeleteConfirmation'
import AgentNameEditor from './AgentNameEditor'
import AgentRowActions from './AgentRowActions'
import CommandPalette from './CommandPalette'
import { createCoordinatorClient, type ProductionCoordinatorClient } from './coordinator-client'
import { rootCommands } from './command-palette-root-commands'
import type { CommandPaletteLink } from './command-palette-link-provider'
import type { CommandPaletteMessage } from './command-palette-message-provider'
import type { CommandPaletteSurface } from './command-palette-search-provider'
import { movePinnedAgent, partitionSidebarAgents } from './sidebar-model'
import {
  projectConnectors,
  projectEcosystemLinks,
  projectKeyPresences,
  projectRendererSurfaces,
  projectStatus,
  statusLine,
  type ConnectorRow,
  type EcosystemLink,
  type KeyPresenceRow,
  type SidebarAgent,
  type StatusSnapshot,
  type SurfaceSnapshot,
} from './model'

const PREFS_KEY = 'clawdbot.production.prefs.v1'

interface ProductionPrefs {
  pinned: string[]
  hidden: string[]
  nicknames: Record<string, string>
  unread: string[]
  pollingEnabled: boolean
}

const DEFAULT_PREFS: ProductionPrefs = {
  pinned: ['status', 'cockpit', 'portfolio'],
  hidden: [],
  nicknames: {},
  unread: [],
  pollingEnabled: true,
}

function loadPrefs(): ProductionPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (raw == null) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ProductionPrefs>) }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(prefs: ProductionPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    return
  }
}

function surfaceToPaletteSurface(agent: SidebarAgent): CommandPaletteSurface {
  return {
    id: agent.id,
    label: agent.label,
    path: agent.path,
    group: agent.group,
    description: agent.description,
    isHidden: agent.isHidden === true,
  }
}

function formatSnapshot(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2)
    return text.length > 48_000 ? `${text.slice(0, 48_000)}\n… truncated` : text ?? String(value)
  } catch {
    return String(value)
  }
}

export interface ProductionRendererProps {
  coordinator?: ProductionCoordinatorClient
  onSwitchClassic?: () => void
}

export default function ProductionRenderer({ coordinator, onSwitchClassic }: ProductionRendererProps) {
  const [prefs, setPrefs] = useState<ProductionPrefs>(loadPrefs)
  const [transport, setTransport] = useState<'connected' | 'down'>('down')
  const [status, setStatus] = useState<StatusSnapshot | null>(null)
  const [connectors, setConnectors] = useState<ConnectorRow[]>([])
  const [links, setLinks] = useState<EcosystemLink[]>([])
  const [keys, setKeys] = useState<KeyPresenceRow[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, SurfaceSnapshot>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmingHideId, setConfirmingHideId] = useState<string | null>(null)
  const [composerDraft, setComposerDraft] = useState('')
  const [paletteMessages, setPaletteMessages] = useState<CommandPaletteMessage[]>([])

  const surfaces = useMemo<SidebarAgent[]>(() => {
    const base = projectRendererSurfaces()
    return base.map((agent) => ({
      ...agent,
      label: prefs.nicknames[agent.id] ?? agent.label,
      isPinned: prefs.pinned.includes(agent.id),
      isHidden: prefs.hidden.includes(agent.id),
    }))
  }, [prefs.nicknames, prefs.pinned, prefs.hidden])

  const selected = useMemo(
    () => surfaces.find((agent) => agent.id === selectedId) ?? null,
    [surfaces, selectedId],
  )
  const visibleSurfaces = useMemo(() => surfaces.filter((agent) => !agent.isHidden), [surfaces])
  const { pinned, unpinned } = useMemo(
    () => partitionSidebarAgents(visibleSurfaces, prefs.pinned),
    [visibleSurfaces, prefs.pinned],
  )

  const updatePrefs = useCallback((mutate: (current: ProductionPrefs) => ProductionPrefs) => {
    setPrefs((current) => {
      const next = mutate(current)
      savePrefs(next)
      return next
    })
  }, [])

  const recordEvent = useCallback((kind: string, detail: string) => {
    const entry: CommandPaletteMessage = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      snippet: `${kind}: ${detail}`,
      timestampMs: Date.now(),
    }
    setPaletteMessages((current) => [entry, ...current].slice(0, 200))
  }, [])

  const client = useMemo(
    () => coordinator ?? createCoordinatorClient(),
    [coordinator],
  )

  useEffect(() => () => client.dispose(), [client])

  useEffect(() => {
    const offTransport = client.subscribeTransport(setTransport)
    const offStatus = client.subscribe('status', (payload) => setStatus(projectStatus(payload)))
    const offConnectors = client.subscribe('connectors', (payload) => setConnectors(projectConnectors(payload)))
    const offEcosystem = client.subscribe('ecosystem', (payload) => setLinks(projectEcosystemLinks(payload)))
    const offKeys = client.subscribe('keys', (payload) => setKeys(projectKeyPresences(payload)))
    return () => {
      offTransport()
      offStatus()
      offConnectors()
      offEcosystem()
      offKeys()
    }
  }, [client])

  const fetchSurface = useCallback(
    async (agent: SidebarAgent) => {
      try {
        const data = await client.getEndpoint(agent.path)
        setSnapshots((current) => ({
          ...current,
          [agent.id]: { path: agent.path, data, fetchedAtMs: Date.now() },
        }))
        updatePrefs((current) =>
          current.unread.includes(agent.id)
            ? { ...current, unread: current.unread.filter((id) => id !== agent.id) }
            : current,
        )
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        setSnapshots((current) => ({
          ...current,
          [agent.id]: {
            path: agent.path,
            data: current[agent.id]?.data ?? null,
            fetchedAtMs: Date.now(),
            error: detail,
          },
        }))
        updatePrefs((current) =>
          current.unread.includes(agent.id) ? current : { ...current, unread: [...current.unread, agent.id] },
        )
        recordEvent('error', `${agent.label} fetch failed`)
      }
    },
    [client, recordEvent, updatePrefs],
  )

  const refreshAll = useCallback(async () => {
    await Promise.all(visibleSurfaces.map((agent) => fetchSurface(agent)))
  }, [fetchSurface, visibleSurfaces])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  useEffect(() => {
    if (!prefs.pollingEnabled || transport !== 'connected') return
    const timer = setInterval(() => void refreshAll(), 15_000)
    return () => clearInterval(timer)
  }, [prefs.pollingEnabled, refreshAll, transport])

  const openSurface = useCallback(
    (agentId: string) => {
      setSelectedId(agentId)
      updatePrefs((current) => ({ ...current, unread: current.unread.filter((id) => id !== agentId) }))
    },
    [updatePrefs],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const commands = useMemo(
    () =>
      rootCommands({
        surfaces: visibleSurfaces.map((agent) => ({ id: agent.id, label: agent.label, group: agent.group })),
        selectedId,
        onOpenSurface: openSurface,
        onRefresh: () => void refreshAll(),
        onTogglePolling: () =>
          updatePrefs((current) => ({ ...current, pollingEnabled: !current.pollingEnabled })),
        pollingEnabled: prefs.pollingEnabled,
        onCopyBaseUrl: () => void navigator.clipboard?.writeText(window.location.origin),
        onOpenRepo: () => window.open('https://github.com/Solizardking/Zero-Bruh', '_blank'),
        onOpenHub: () => window.open('https://github.com/solizardking/solana-clawd', '_blank'),
        onSwitchClassic: () => onSwitchClassic?.(),
        status,
      }),
    [
      onSwitchClassic,
      openSurface,
      prefs.pollingEnabled,
      refreshAll,
      selectedId,
      status,
      updatePrefs,
      visibleSurfaces,
    ],
  )

  const paletteLinks = useMemo<CommandPaletteLink[]>(() => links.map((link) => ({ url: link.url })), [links])

  const runComposer = () => {
    const draft = composerDraft.trim()
    if (draft.length === 0) return
    setComposerDraft('')
    if (draft.startsWith('/open ')) {
      const query = draft.slice(6).trim().toLowerCase()
      const match = visibleSurfaces.find(
        (agent) => agent.id.toLowerCase() === query || agent.label.toLowerCase().includes(query),
      )
      if (match != null) openSurface(match.id)
      else recordEvent('composer', `no surface matches "${query}"`)
      return
    }
    if (draft === '/refresh') {
      void refreshAll()
      return
    }
    if (draft === '/palette') {
      setPaletteOpen(true)
      return
    }
    setPaletteOpen(true)
  }

  const confirmingAgent = surfaces.find((agent) => agent.id === confirmingHideId) ?? null

  const renderSidebarSection = (title: string, agents: readonly SidebarAgent[]) =>
    agents.length > 0 && (
      <div className="prod-sidebar-section">
        <div className="prod-sidebar-heading">{title}</div>
        {agents.map((agent) => {
          const snapshot = snapshots[agent.id]
          const isSelected = agent.id === selectedId
          return (
            <div
              key={agent.id}
              className={
                isSelected ? 'prod-row prod-row--selected' : 'prod-row'
              }
              onClick={() => openSurface(agent.id)}
              onDoubleClick={() => setRenamingId(agent.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') openSurface(agent.id)
              }}
            >
              {prefs.pinned.includes(agent.id) && <span className="prod-row-pin">●</span>}
              <span className="prod-row-label">{agent.label}</span>
              {prefs.unread.includes(agent.id) && <span className="prod-row-unread" aria-label="unread" />}
              <span className="prod-row-group">{agent.group}</span>
              {renamingId === agent.id ? (
                <AgentNameEditor
                  agentId={agent.id}
                  currentLabel={agent.label}
                  savedLabel={prefs.nicknames[agent.id]}
                  onCommit={(agentId, label) => {
                    updatePrefs((current) => ({
                      ...current,
                      nicknames: { ...current.nicknames, [agentId]: label },
                    }))
                    setRenamingId(null)
                  }}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <AgentRowActions
                  agentId={agent.id}
                  agentLabel={agent.label}
                  endpointPath={agent.path}
                  isPinned={prefs.pinned.includes(agent.id)}
                  isHidden={agent.isHidden === true}
                  hasUnread={prefs.unread.includes(agent.id)}
                  includeMarkUnread
                  onTogglePin={(agentId, nextPinned) =>
                    updatePrefs((current) => ({
                      ...current,
                      pinned: nextPinned
                        ? [...new Set([...current.pinned, agentId])]
                        : current.pinned.filter((id) => id !== agentId),
                    }))
                  }
                  onHide={(agentId) => setConfirmingHideId(agentId)}
                  onMarkUnread={(agentId, unread) =>
                    updatePrefs((current) => ({
                      ...current,
                      unread: unread
                        ? [...new Set([...current.unread, agentId])]
                        : current.unread.filter((id) => id !== agentId),
                    }))
                  }
                />
              )}
              {snapshot?.error != null && <span className="prod-row-error" title={snapshot.error}>!</span>}
            </div>
          )
        })}
      </div>
    )

  return (
    <div className="prod">
      <aside className="prod-sidebar">
        <div className={`prod-transport prod-transport--${transport}`}>
          {transport === 'connected' ? 'connected' : 'down'} · {prefs.pollingEnabled ? 'polling 15s' : 'paused'}
        </div>
        {renderSidebarSection('Pinned', pinned)}
        {renderSidebarSection('All surfaces', unpinned)}
      </aside>
      <main className="prod-main">
        <header className="prod-header">
          <h2>{selected?.label ?? 'Production renderer'}</h2>
          <div className="prod-header-status">{status != null ? statusLine(status) : 'waiting for /api/status…'}</div>
        </header>
        {selected == null ? (
          <section className="prod-empty">Select a surface, or press ⌘K.</section>
        ) : (
          <section className="prod-pane">
            <div className="prod-pane-meta">
              <code>{selected.path}</code>
              <button className="btn btn--ghost" onClick={() => void fetchSurface(selected)}>
                Refresh
              </button>
            </div>
            {selected.id === 'connectors' && (
              <div className="prod-cards">
                {connectors.map((row) => (
                  <div key={`${row.name}-${row.type}`} className="prod-card">
                    <strong>{row.name}</strong>
                    <span className="badge badge--neutral">{row.status}</span>
                    <span className="muted">{row.type}</span>
                  </div>
                ))}
              </div>
            )}
            {selected.id === 'keys' && (
              <div className="prod-keys">
                {keys.map((row) => (
                  <div key={row.name} className="prod-key">
                    <span>{row.label}</span>
                    <span className={row.set ? 'ok' : 'bad'}>{row.set ? 'set' : 'missing'}</span>
                  </div>
                ))}
              </div>
            )}
            <pre className="prod-json">{formatSnapshot(snapshots[selected.id]?.data)}</pre>
            <div className="prod-pane-foot">
              {snapshots[selected.id]?.fetchedAtMs != null &&
                `fetched ${new Date(snapshots[selected.id].fetchedAtMs).toLocaleTimeString()}`}
              {snapshots[selected.id]?.error != null && <span className="bad"> · {snapshots[selected.id].error}</span>}
            </div>
          </section>
        )}
        <footer className="prod-composer">
          <input
            value={composerDraft}
            placeholder="/open cockpit · /refresh · /palette"
            onChange={(event) => setComposerDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') runComposer()
            }}
          />
        </footer>
      </main>
      <CommandPalette
        open={paletteOpen}
        surfaces={surfaces.map(surfaceToPaletteSurface)}
        commands={commands}
        messages={paletteMessages}
        links={paletteLinks}
        onOpenSurface={(agentId) => openSurface(agentId)}
        onClose={() => setPaletteOpen(false)}
      />
      {confirmingAgent != null && (
        <AgentDeleteConfirmation
          agentId={confirmingAgent.id}
          agentLabel={confirmingAgent.label}
          endpointPath={confirmingAgent.path}
          isPinned={confirmingAgent.isPinned === true}
          onConfirm={(agentId) => {
            updatePrefs((current) => ({
              ...current,
              hidden: [...new Set([...current.hidden, agentId])],
              pinned: current.pinned.filter((id) => id !== agentId),
            }))
            setConfirmingHideId(null)
          }}
          onCancel={() => setConfirmingHideId(null)}
        />
      )}
    </div>
  )
}
