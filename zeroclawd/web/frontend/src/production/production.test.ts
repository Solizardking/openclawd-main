import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  activateCommandPaletteEntry,
  commandPaletteEntries,
  commandPaletteScrollTopForRow,
  commandPaletteVirtualWindow,
  cyclePaletteTab,
  enterCommandPaletteStep,
  fuzzyPaletteScore,
  movePaletteHighlight,
  normalizePaletteSearch,
  paletteIndexedShortcutIndex,
  paletteSearchTokens,
  paletteShortcutNumber,
  popCommandPaletteStep,
  resolveCommandPaletteStep,
} from './command-palette-model'
import type { CommandPaletteCommand } from './command-palette-provider'
import { agentRowActions, isTogglePinAction, togglePinValue } from './agent-row-actions-model'
import { movePinnedAgent, partitionSidebarAgents } from './sidebar-model'
import { createCoordinatorClient, CoordinatorCallError } from './coordinator-client'
import { projectConnectors, projectEcosystemLinks, projectKeyPresences, projectStatus } from './model'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('palette search primitives', () => {
  it('normalizes diacritics and separators into space-separated tokens', () => {
    expect(normalizePaletteSearch('Crème  Brûlée-v2')).toBe('creme brulee v2')
    expect(paletteSearchTokens('/api/trading')).toEqual(['api', 'trading'])
  })

  it('scores boundary and camel matches above mid-word matches', () => {
    const boundary = fuzzyPaletteScore('Trading Cockpit', 'cock')
    const midWord = fuzzyPaletteScore('backtestcockpit', 'cock')
    expect(boundary).not.toBeNull()
    if (boundary != null && midWord != null) expect(boundary).toBeGreaterThan(midWord)
  })

  it('rejects queries outside the span multiplier', () => {
    expect(fuzzyPaletteScore('status', 'statusunknownlongtail')).toBeNull()
  })
})

const surfaces = [
  { id: 'status', label: 'Status', path: '/api/status', group: 'core' as const, isHidden: false },
  { id: 'cockpit', label: 'Cockpit', path: '/api/trading/cockpit', group: 'trading' as const, isHidden: false },
  { id: 'prices', label: 'Prices', path: '/api/market/prices', group: 'market' as const, isHidden: false },
]

const commands: readonly CommandPaletteCommand[] = [
  { id: 'refresh-now', label: 'Refresh now', keywords: ['poll'], run: () => {} },
]

describe('commandPaletteEntries', () => {
  it('returns surfaces then commands on the all tab with an empty query', () => {
    const entries = commandPaletteEntries({ surfaces, commands, query: '', tab: 'all' })
    expect(entries[0].kind).toBe('surface')
    expect(entries.at(-1)?.kind).toBe('command')
  })

  it('filters by group tab and actions tab', () => {
    const trading = commandPaletteEntries({ surfaces, commands, query: '', tab: 'trading' })
    expect(trading.map((entry) => entry.kind === 'surface' && entry.surface.id)).toContain('cockpit')
    const actions = commandPaletteEntries({ surfaces, commands, query: '', tab: 'actions' })
    expect(actions.every((entry) => entry.kind === 'command')).toBe(true)
  })

  it('ranks exact label hits first and surfaces hidden entries after visible ones', () => {
    const withHidden = [...surfaces, { ...surfaces[1], id: 'cockpit-hidden', label: 'Cockpit hidden', path: '/x', isHidden: true }]
    const entries = commandPaletteEntries({
      surfaces: withHidden,
      commands,
      messages: [],
      links: [],
      query: 'cock',
      tab: 'all',
    })
    const kinds = entries.map((entry) => (entry.kind === 'surface' ? entry.surface.id : ''))
    expect(kinds.indexOf('cockpit')).toBeLessThan(kinds.indexOf('cockpit-hidden'))
  })
})

describe('palette keyboard + virtualization helpers', () => {
  it('clamps highlight movement within row bounds', () => {
    expect(movePaletteHighlight(0, 3, -1)).toBe(0)
    expect(movePaletteHighlight(2, 3, 1)).toBe(2)
    expect(movePaletteHighlight(1, 3, 1)).toBe(2)
    expect(movePaletteHighlight(0, 0, 1)).toBe(0)
  })

  it('computes a finite virtual window with overscan', () => {
    const window0 = commandPaletteVirtualWindow({
      rowCount: 100,
      rowPitchPx: 49,
      leadingOffsetPx: 8,
      scrollTopPx: 490,
      viewportPx: 490,
      overscanRows: 6,
    })
    expect(window0.start).toBeGreaterThanOrEqual(0)
    expect(window0.end).toBeLessThanOrEqual(100)
    expect(window0.end).toBeGreaterThan(window0.start)
    expect(window0.end - window0.start).toBeLessThanOrEqual(25)
  })

  it('scrolls only when rows leave the viewport', () => {
    expect(
      commandPaletteScrollTopForRow({
        rowIndex: 0,
        rowPitchPx: 49,
        rowGapPx: 2,
        leadingOffsetPx: 8,
        scrollTopPx: 500,
        viewportPx: 490,
      }),
    ).toBeGreaterThan(0)
    expect(
      commandPaletteScrollTopForRow({
        rowIndex: 2,
        rowPitchPx: 49,
        rowGapPx: 2,
        leadingOffsetPx: 8,
        scrollTopPx: 0,
        viewportPx: 490,
      }),
    ).toBeNull()
  })

  it('gates numbered shortcuts behind modifier and nesting', () => {
    expect(paletteShortcutNumber(2, false, true)).toBe(3)
    expect(paletteShortcutNumber(2, true, true)).toBeNull()
    expect(paletteShortcutNumber(2, false, false)).toBeNull()
    expect(paletteIndexedShortcutIndex('9', false, 5)).toBeNull()
    expect(paletteIndexedShortcutIndex('3', false, 5)).toBe(2)
  })

  it('cycles tabs forward and backward', () => {
    expect(cyclePaletteTab('all', 1)).toBe('surfaces')
    expect(cyclePaletteTab('all', -1)).toBe('actions')
  })

  it('activates each entry kind through its callback', () => {
    const openSurface = vi.fn()
    const run = vi.fn()
    const onOpenLink = vi.fn()
    const command: CommandPaletteCommand = { id: 'refresh-now', label: 'Refresh now', keywords: [], run }
    activateCommandPaletteEntry({ kind: 'surface', surface: surfaces[0] }, openSurface)
    activateCommandPaletteEntry({ kind: 'command', command }, openSurface)
    activateCommandPaletteEntry({ kind: 'link', link: { url: 'https://example.com' } }, openSurface, undefined, onOpenLink)
    expect(openSurface).toHaveBeenCalledWith('status')
    expect(run).toHaveBeenCalledOnce()
    expect(onOpenLink).toHaveBeenCalledWith('https://example.com')
  })

  it('navigates nested command trails', () => {
    const tree: readonly CommandPaletteCommand[] = [
      {
        id: 'open-surface',
        label: 'Open…',
        keywords: [],
        children: [{ id: 'open:cockpit', label: 'Cockpit', keywords: [], run: () => {} }],
        run: () => {},
      },
    ]
    const trail = enterCommandPaletteStep(tree, [], 'open-surface')
    expect(resolveCommandPaletteStep(tree, trail).depth).toBe(1)
    expect(resolveCommandPaletteStep(tree, trail).commands[0].id).toBe('open:cockpit')
    expect(popCommandPaletteStep(tree, trail)).toEqual([])
  })
})

describe('sidebar model', () => {
  const agents = [
    { id: 'a', isPinned: true },
    { id: 'b', isPinned: true },
    { id: 'c' },
  ]

  it('partitions pinned agents in stored order first', () => {
    const { pinned, unpinned } = partitionSidebarAgents(agents, ['b'])
    expect(pinned.map((agent) => agent.id)).toEqual(['b', 'a'])
    expect(unpinned.map((agent) => agent.id)).toEqual(['c'])
  })

  it('moves pinned agents relative to targets', () => {
    expect(movePinnedAgent(['a', 'b'], 'a', 'b', 'after')).toEqual(['b', 'a'])
    expect(movePinnedAgent(['a', 'b'], 'b', 'a', 'before')).toEqual(['b', 'a'])
    expect(movePinnedAgent(['a', 'b'], 'a', 'missing-target', 'before')).toEqual(['a', 'b'])
  })
})

describe('row action model', () => {
  it('builds pin/copy/hide actions in canonical order', () => {
    const actions = agentRowActions({ isHidden: false, isPinned: false, includePin: true, includeCopy: true })
    expect(actions.map((action) => action.id)).toEqual(['pin-agent', 'copy-endpoint-path', 'hide-from-sidebar'])
    const unpinned = agentRowActions({ isHidden: false, isPinned: true, includePin: true })
    expect(unpinned[0].label).toBe('Unpin')
    expect(agentRowActions({ isHidden: true })).toEqual([])
  })

  it('classifies toggle-pin actions', () => {
    const [pin] = agentRowActions({ isHidden: false, includePin: true })
    expect(isTogglePinAction(pin)).toBe(true)
    expect(togglePinValue(pin)).toBe(true)
  })
})

describe('coordinator client', () => {
  const jsonResponse = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))

  it('validates array replies for connector loads', async () => {
    const client = createCoordinatorClient(vi.fn().mockImplementation(() => jsonResponse([])))
    await expect(client.getConnectors()).resolves.toEqual([])
    client.dispose()
  })

  it('reports protocol errors without blaming the transport', async () => {
    const client = createCoordinatorClient(vi.fn().mockImplementation(() => jsonResponse(null)))
    const states: string[] = []
    client.subscribeTransport((state) => states.push(state))
    await expect(client.getConnectors()).rejects.toThrow('malformed array reply')
    await client.ready
    expect(states).toEqual(['down'])
    client.dispose()
  })

  it('wraps HTTP failures in CoordinatorCallError with status codes', async () => {
    const client = createCoordinatorClient(
      vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 503 }))),
    )
    await expect(client.getEndpoint('/api/status')).rejects.toBeInstanceOf(CoordinatorCallError)
    client.dispose()
  })

  it('tracks transport transitions deterministically across failure and recovery', async () => {
    let fail = true
    const impl = () => (fail ? Promise.reject(new Error('offline')) : jsonResponse([]))
    const client = createCoordinatorClient(vi.fn().mockImplementation(impl), 60_000)
    const states: string[] = []
    client.subscribeTransport((state) => states.push(state))
    await client.ready
    expect(states[0]).toBe('down')
    fail = false
    await client.refresh()
    fail = true
    await client.refresh()
    expect(states).toEqual(['down', 'connected', 'down'])
    client.dispose()
  })
})

describe('backend projections', () => {
  it('projects status snapshots defensively', () => {
    const snapshot = projectStatus({ status: 'ok', version: 1, goroutines: 'x', uptime: '2h' })
    expect(snapshot.status).toBe('ok')
    expect(snapshot.version).toBe('0.0.0')
    expect(snapshot.goroutines).toBeNull()
    expect(projectStatus(null).agent).toBe('clawdbot')
  })

  it('projects connectors, ecosystem links, and key presences', () => {
    expect(projectConnectors([{ name: 'jup', status: 'up', type: 'dex' }])).toHaveLength(1)
    expect(projectConnectors('nope')).toEqual([])
    const links = projectEcosystemLinks({ hub: { url: 'https://github.com/x/y/tree/main' }, bad: 'nope' })
    expect(links[0].url).toBe('https://github.com/x/y/tree/main')
    const keys = projectKeyPresences({ keys: [{ name: 'E2B_API_KEY', label: 'E2B sandbox', set: true }] })
    expect(keys[0]).toMatchObject({ name: 'E2B_API_KEY', set: true })
  })
})
