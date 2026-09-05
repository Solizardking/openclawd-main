export const COORDINATOR_PROTOCOL_VERSION = 1

type TransportListener = (state: 'connected' | 'down') => void
type EventListener = (payload: unknown) => void

const ARRAY_METHODS = new Set(['listAgents', 'getConnectors', 'getEcosystemLinks', 'getKeyPresences'])

export class CoordinatorCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`)
    this.name = 'CoordinatorCallError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateReply(method: string, value: unknown): unknown {
  if (ARRAY_METHODS.has(method)) {
    if (!Array.isArray(value)) throw new CoordinatorCallError('protocol', `${method} returned a malformed array reply`)
    return value
  }
  if (!isRecord(value)) throw new CoordinatorCallError('protocol', `${method} returned a malformed object reply`)
  return value
}

export interface ProductionCoordinatorClient {
  readonly ready: Promise<void>
  call(method: string, args?: unknown): Promise<unknown>
  getStatus(): Promise<unknown>
  getConnectors(): Promise<unknown>
  getEcosystemLinks(): Promise<unknown>
  getKeyPresences(): Promise<unknown>
  getEndpoint(path: string): Promise<unknown>
  subscribe(family: string, listener: EventListener): () => void
  subscribeTransport(listener: TransportListener): () => void
  refresh(): Promise<boolean>
  dispose(): void
}

const METHOD_PATHS: Record<string, string> = {
  listAgents: '/api/connectors',
  getConnectors: '/api/connectors',
  getStatus: '/api/status',
  getEcosystemLinks: '/api/ecosystem',
  getKeyPresences: '/api/keys',
}

export function createCoordinatorClient(
  fetchImpl: typeof fetch = fetch,
  pollIntervalMs = 15_000,
): ProductionCoordinatorClient {
  const eventListeners = new Map<string, Set<EventListener>>()
  const transportListeners = new Set<TransportListener>()
  let disposed = false
  let connectedState: 'connected' | 'down' | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let resolveReady: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })

  const emitTransport = (state: 'connected' | 'down') => {
    for (const listener of transportListeners) listener(state)
    for (const listener of eventListeners.get('transport') ?? []) listener({ state })
  }

  const setConnected = (state: 'connected' | 'down') => {
    if (disposed || connectedState === state) return
    connectedState = state
    emitTransport(state)
  }

  const emit = (family: string, payload: unknown) => {
    for (const listener of eventListeners.get(family) ?? []) listener(payload)
  }

  const request = async (method: string, path: string): Promise<unknown> => {
    let response: Response
    try {
      response = await fetchImpl(path, { headers: { accept: 'application/json' } })
    } catch (error) {
      setConnected('down')
      throw new CoordinatorCallError('transport', `${method} failed: ${String(error)}`)
    }
    if (!response.ok) {
      setConnected('down')
      throw new CoordinatorCallError(String(response.status), `${method} failed with HTTP ${response.status}`)
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new CoordinatorCallError('protocol', `${method} returned invalid JSON`)
    }
    const value = validateReply(method === 'getEndpoint' ? 'getStatus' : method, body)
    setConnected('connected')
    return value
  }

  const POLL_FAMILIES: readonly (readonly [string, () => Promise<unknown>])[] = [
    ['status', () => request('getStatus', '/api/status')],
    ['connectors', () => request('getConnectors', '/api/connectors')],
    ['ecosystem', () => request('getEcosystemLinks', '/api/ecosystem')],
    ['keys', () => request('getKeyPresences', '/api/keys')],
  ]

  const pollOnce = async (): Promise<boolean> => {
    if (disposed) return false
    let anyOk = false
    for (const [family, load] of POLL_FAMILIES) {
      try {
        emit(family, await load())
        anyOk = true
      } catch {
        continue
      }
    }
    setConnected(anyOk ? 'connected' : 'down')
    return anyOk
  }

  void pollOnce().then(() => resolveReady())
  pollTimer = setInterval(() => void pollOnce(), Math.max(pollIntervalMs, 250))

  return {
    ready,
    async call(method) {
      const path = METHOD_PATHS[method]
      if (path == null) throw new CoordinatorCallError('unknown-method', `no route for ${method}`)
      return request(method, path)
    },
    getStatus: () => request('getStatus', '/api/status'),
    getConnectors: () => request('getConnectors', '/api/connectors'),
    getEcosystemLinks: () => request('getEcosystemLinks', '/api/ecosystem'),
    getKeyPresences: () => request('getKeyPresences', '/api/keys'),
    getEndpoint: (path) => request('getEndpoint', path),
    subscribe(family, listener) {
      const listeners = eventListeners.get(family) ?? new Set<EventListener>()
      listeners.add(listener)
      eventListeners.set(family, listeners)
      return () => listeners.delete(listener)
    },
    subscribeTransport(listener) {
      transportListeners.add(listener)
      return () => transportListeners.delete(listener)
    },
    refresh: () => pollOnce(),
    dispose() {
      if (disposed) return
      disposed = true
      if (pollTimer != null) clearInterval(pollTimer)
      setConnected('down')
    },
  }
}
