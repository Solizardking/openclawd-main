import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_ENDPOINTS, GROUP_META, type FeatureGroup } from './api/registry'
import ProductionRenderer from './production/ProductionRenderer'
import ComputerDesk from './computer/ComputerDesk'
import LoginButton from './auth/LoginButton'
import UserBadge from './auth/UserBadge'
import { usePrivyAuth } from './auth/usePrivyAuth'
import { useAuthFetch } from './auth/authFetch'
import {
  mapCouncil,
  mapDoctor,
  mapEcosystem,
  mapHealth,
  mapLaws,
  mapLife,
  mapMiddleout,
  mapOptimize,
  mapPortfolio,
  mapRhReadiness,
  mapSize,
  mapTrending,
  mapVaultKeys,
  mapVaultStatus,
  mapVenues,
  type DisplayMetric,
  type DisplayRow,
} from './api/mappers'

/* ── Legacy + extended payload types (loose where external APIs vary) ── */

interface Connector { name: string; status: string; type: string }
interface StatusInfo {
  status: string; version: string; agent: string; config: string
  dna_path?: string; uptime: string; mode: string
  go_version: string; go_os: string; go_arch: string
  num_cpu: number; goroutines: number
}
interface HealthInfo {
  status: string
  agent: string
  package?: string
  product?: string
}
interface PackageInfo { name: string; path: string; file_count: number; description?: string }
interface KeyPresence {
  name: string
  label: string
  group: string
  hint?: string
  placeholder?: string
  set: boolean
  source?: string
}
interface KeysResponse {
  ok?: boolean
  source?: string
  keys?: KeyPresence[]
  set?: number
  written?: string[]
  error?: string
}
interface EnvInfo { AGENT_MODE: string; HOSTNAME: string; PWD: string; SHELL: string }
/** GET /api/ecosystem — open-ended map of product/repo URLs from pkg/config. */
type EcosystemInfo = Record<string, string>

interface RhReadinessInfo {
  ready?: boolean
  chainId?: number
  blockscoutConfigured?: boolean
  rhRpcConfigured?: boolean
  usingPublicRpcRead?: boolean
  missing?: string[]
  resolvedRpc?: string
  message?: string
}
interface CockpitInfo {
  mode: string; watchlist: string[]
  readiness: { score: number; grade: string; status: string; reasons: string[] }
  risk: {
    maxPositionSol: number; positionSizePct: number
    stopLossPct: number; takeProfitPct: number
    minSignalStrength: number; minConfidence: number
  }
}
interface AgentDNA {
  agent: { name: string; role: string }
  sequence: { length: number; value: string }
  metrics: { gcContent: number; pamSites: unknown[]; tataBoxes: unknown[]; utilityScore: number; stabilityBand: string }
  proof: { dnaId: string; sequenceSha256: string }
  attestation: { status: string; network: string; pdaSeed: string }
}
interface DNAInfo { path: string; created: boolean; dna: AgentDNA }
interface SignalInfo {
  samples: number
  signal: {
    direction: string; strength: number; rsi: number
    emaFast: number; emaSlow: number; emaCross: string
    atr: number; stopLoss: number; takeProfit: number; reasoning: string
  }
}
interface BacktestInfo {
  bars: number
  result: {
    trades: number; wins: number; losses: number; winRate: number
    totalReturn: number; avgReturn: number; maxDrawdown: number
    profitFactor: number; sharpe: number; equityCurve: number[]
  }
}
interface PriceEntry { mint: string; usdPrice: number; priceChange24h: number; liquidity: number }
interface PricesInfo {
  ok: boolean; source: string; asOf: string; count?: number; error?: string
  prices: Record<string, PriceEntry>
}
interface PerpsToken {
  token: string; long_io: number; short_io: number
  open_interest: number; leverage: number; bias_text: string
}
interface PerpsInfo {
  ok: boolean; source: string; asOf: string; error?: string; tokens?: PerpsToken[]
}

async function fetchJSON<T>(path: string, fetcher: typeof fetch = fetch): Promise<T | null> {
  try {
    const r = await fetcher(path)
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

function MetricGrid({ metrics }: { metrics: DisplayMetric[] }) {
  return (
    <div className="metric-grid">
      {metrics.map((m) => (
        <div key={m.label} className={`metric ${m.tone ?? 'neutral'}`}>
          <div className="value">{m.value}</div>
          <div className="label">{m.label}</div>
        </div>
      ))}
    </div>
  )
}

function RowList({ rows }: { rows: DisplayRow[] }) {
  if (!rows.length) return <div className="empty">No rows</div>
  return (
    <div className="row-list">
      {rows.map((r) => (
        <div key={r.key} className="row">
          <div>
            <div className="primary">{r.primary}</div>
            {r.secondary && <div className="secondary">{r.secondary}</div>}
          </div>
          {r.badge && <span className={`badge ${r.tone ?? 'neutral'}`}>{r.badge}</span>}
        </div>
      ))}
    </div>
  )
}

function Sparkline({ data, width = 260, height = 48 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) {
    return <div className="muted" style={{ fontSize: '0.75rem' }}>no equity data</div>
  }
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((v - min) / span) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const up = data[data.length - 1] >= data[0]
  const stroke = up ? 'var(--neon)' : 'var(--red)'
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Backtest equity curve"
      style={{ display: 'block', marginTop: 6 }}
    >
      <title>Backtest equity curve</title>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function LifeCanvas({ cells, rows, cols }: { cells: number[][]; rows: number; cols: number }) {
  if (!rows || !cols || !cells.length) return <div className="empty">No life frame yet</div>
  // Downsample large grids for DOM budget.
  const stepR = rows > 40 ? Math.ceil(rows / 40) : 1
  const stepC = cols > 70 ? Math.ceil(cols / 70) : 1
  const displayRows: number[][] = []
  for (let r = 0; r < rows; r += stepR) {
    const line: number[] = []
    for (let c = 0; c < cols; c += stepC) {
      line.push(cells[r]?.[c] ? 1 : 0)
    }
    displayRows.push(line)
  }
  return (
    <div
      className="life-grid life-grid--omni"
      style={{ gridTemplateColumns: `repeat(${displayRows[0]?.length || 1}, 1fr)` }}
      aria-label="Game of Life grid — CLAWD universal computer"
    >
      {displayRows.flatMap((line, ri) =>
        line.map((on, ci) => {
          // Alternate Solana green vs RH EVM violet alive cells for dual-chain vibe.
          const rail = (ri + ci) % 2 === 0 ? 'sol' : 'rh'
          return (
            <div
              key={`${ri}-${ci}`}
              className={`life-cell ${on ? `on on-${rail}` : ''}`}
            />
          )
        }),
      )}
    </div>
  )
}

/** Dual-rail omni animation: Solana SVM + Robinhood EVM + CLAWD core. */
function OmniChainAnim() {
  return (
    <div className="omni-anim" aria-label="Omni-chain CLAWD animation: Solana SVM and Robinhood EVM">
      <div className="omni-anim__bg" />
      <div className="omni-anim__field">
        <svg className="omni-anim__svg" viewBox="0 0 420 180" role="img">
          <defs>
            <linearGradient id="omniSol" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#14F195" />
              <stop offset="100%" stopColor="#9945FF" />
            </linearGradient>
            <linearGradient id="omniRh" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00d4ff" />
              <stop offset="100%" stopColor="#ff4ecd" />
            </linearGradient>
            <filter id="omniGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Dual orbital rails */}
          <ellipse className="omni-rail omni-rail--sol" cx="210" cy="90" rx="150" ry="58" />
          <ellipse className="omni-rail omni-rail--rh" cx="210" cy="90" rx="118" ry="42" />
          <ellipse className="omni-rail omni-rail--core" cx="210" cy="90" rx="72" ry="28" />

          {/* Cross-chain bridge beam */}
          <path
            className="omni-bridge"
            d="M70 90 C120 40, 300 140, 350 90"
            fill="none"
          />
          <path
            className="omni-bridge omni-bridge--alt"
            d="M70 90 C120 140, 300 40, 350 90"
            fill="none"
          />

          {/* CLAWD core */}
          <g className="omni-core" filter="url(#omniGlow)">
            <circle cx="210" cy="90" r="22" className="omni-core__halo" />
            <circle cx="210" cy="90" r="16" className="omni-core__disc" />
            <text x="210" y="95" textAnchor="middle" className="omni-core__glyph">🦞</text>
          </g>

          {/* Solana SVM node (left) */}
          <g className="omni-node omni-node--sol" filter="url(#omniGlow)">
            <circle cx="70" cy="90" r="18" className="omni-node__ring" />
            <circle cx="70" cy="90" r="11" className="omni-node__fill omni-node__fill--sol" />
            <text x="70" y="94" textAnchor="middle" className="omni-node__label">SOL</text>
          </g>

          {/* Robinhood EVM node (right) */}
          <g className="omni-node omni-node--rh" filter="url(#omniGlow)">
            <circle cx="350" cy="90" r="18" className="omni-node__ring" />
            <circle cx="350" cy="90" r="11" className="omni-node__fill omni-node__fill--rh" />
            <text x="350" y="94" textAnchor="middle" className="omni-node__label">RH</text>
          </g>

          {/* Orbiting packets */}
          <circle className="omni-packet omni-packet--a" r="3.5" fill="url(#omniSol)" />
          <circle className="omni-packet omni-packet--b" r="3" fill="url(#omniRh)" />
          <circle className="omni-packet omni-packet--c" r="2.5" fill="#ffaa00" />
        </svg>

        <div className="omni-anim__tags">
          <span className="omni-tag omni-tag--sol">
            <i /> Solana · SVM
          </span>
          <span className="omni-tag omni-tag--clawd">
            <i /> CLAWD · Omni
          </span>
          <span className="omni-tag omni-tag--rh">
            <i /> Robinhood · EVM 4663
          </span>
        </div>
        <div className="omni-anim__caption">
          Sense → Think → Strike · trade · earn · pay x402 · get smarter
        </div>
      </div>
    </div>
  )
}

const GROUPS: FeatureGroup[] = ['core', 'trading', 'market', 'governance', 'compute', 'ops']

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash)
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [status, setStatus] = useState<StatusInfo | null>(null)
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [envInfo, setEnvInfo] = useState<EnvInfo | null>(null)
  const [ecosystem, setEcosystem] = useState<EcosystemInfo | null>(null)
  const [rhReadinessRaw, setRhReadinessRaw] = useState<unknown>(null)
  const [cockpit, setCockpit] = useState<CockpitInfo | null>(null)
  const [signal, setSignal] = useState<SignalInfo | null>(null)
  const [backtest, setBacktest] = useState<BacktestInfo | null>(null)
  const [prices, setPrices] = useState<PricesInfo | null>(null)
  const [perps, setPerps] = useState<PerpsInfo | null>(null)
  const [dnaInfo, setDNAInfo] = useState<DNAInfo | null>(null)
  const [lawsRaw, setLawsRaw] = useState<unknown>(null)
  const [doctorRaw, setDoctorRaw] = useState<unknown>(null)
  const [portfolioRaw, setPortfolioRaw] = useState<unknown>(null)
  const [optimizeRaw, setOptimizeRaw] = useState<unknown>(null)
  const [venuesRaw, setVenuesRaw] = useState<unknown>(null)
  const [trendingRaw, setTrendingRaw] = useState<unknown>(null)
  const [sizeRaw, setSizeRaw] = useState<unknown>(null)
  const [lifeRaw, setLifeRaw] = useState<unknown>(null)
  const [middleoutRaw, setMiddleoutRaw] = useState<unknown>(null)
  const [councilRaw, setCouncilRaw] = useState<unknown>(null)
  const [vaultStatusRaw, setVaultStatusRaw] = useState<unknown>(null)
  const [vaultKeysRaw, setVaultKeysRaw] = useState<unknown>(null)
  const [e2bComputerRaw, setE2bComputerRaw] = useState<unknown>(null)
  const [configText, setConfigText] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [packageBusy, setPackageBusy] = useState(false)
  const [packageInfo, setPackageInfo] = useState<{
    ready?: boolean
    fileName?: string
    bytes?: number
    download?: string
    error?: string
  } | null>(null)
  const [showKeysModal, setShowKeysModal] = useState(false)
  const [keysList, setKeysList] = useState<KeyPresence[]>([])
  const [keysSource, setKeysSource] = useState('')
  const [keysDraft, setKeysDraft] = useState<Record<string, string>>({})
  const [keysBusy, setKeysBusy] = useState(false)
  const [keysError, setKeysError] = useState('')
  const [keysFocus, setKeysFocus] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>(['🦞 Clawd Bot ops console online.'])
  const [activeNav, setActiveNav] = useState('status')
  const logRef = useRef<HTMLDivElement>(null)
  const keysInputRef = useRef<HTMLInputElement | null>(null)

  // Privy auth — when configured, login button + user badge render in the header
  // and API requests carry the Privy access token as `Authorization: Bearer …`.
  const { unconfigured } = usePrivyAuth()
  const authFetch = useAuthFetch()

  const pushLog = useCallback((line: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 40))
  }, [])

  const loadKeysStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/keys')
      const body = (await r.json()) as KeysResponse
      if (!r.ok || !body.ok) {
        setKeysError(body.error || `HTTP ${r.status}`)
        return
      }
      setKeysList(body.keys ?? [])
      setKeysSource(body.source ?? '')
      setKeysError('')
    } catch (e) {
      setKeysError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const openKeysPopup = useCallback(async (focusName?: string) => {
    setShowKeysModal(true)
    setKeysFocus(focusName ?? null)
    setKeysDraft({})
    setKeysError('')
    await loadKeysStatus()
    // Focus first empty / targeted field after paint
    requestAnimationFrame(() => {
      keysInputRef.current?.focus()
    })
  }, [loadKeysStatus])

  const saveKeysPopup = useCallback(async () => {
    const payload: Record<string, string> = {}
    for (const [k, v] of Object.entries(keysDraft)) {
      if (v.trim() !== '') payload[k] = v.trim()
    }
    if (!Object.keys(payload).length) {
      setKeysError('Enter at least one API key value')
      return
    }
    setKeysBusy(true)
    setKeysError('')
    try {
      const r = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: payload }),
      })
      const body = (await r.json()) as KeysResponse
      if (!r.ok || !body.ok) {
        setKeysError(body.error || `HTTP ${r.status}`)
        pushLog(`✗ API key save failed: ${body.error || r.status}`)
        return
      }
      setKeysList(body.keys ?? [])
      setKeysDraft({})
      const n = body.written?.length ?? Object.keys(payload).length
      pushLog(`✓ saved ${n} API key(s) → ${body.source ?? '.env.local'} (values never logged)`)
      // Refresh connectors so status badges flip to connected
      const conn = await fetchJSON<Connector[]>('/api/connectors')
      if (conn) setConnectors(conn)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setKeysError(msg)
      pushLog(`✗ API key save error: ${msg}`)
    } finally {
      setKeysBusy(false)
    }
  }, [keysDraft, pushLog])

  /** One-button slim source package: POST /api/package then auto-download. */
  const packageSource = useCallback(async () => {
    if (packageBusy) return
    setPackageBusy(true)
    pushLog('📦 packaging slim source archive…')
    try {
      const r = await fetch('/api/package', { method: 'POST' })
      const body = (await r.json()) as {
        ok?: boolean
        fileName?: string
        bytes?: number
        download?: string
        error?: string
        ready?: boolean
      }
      if (!r.ok || !body.ok) {
        const err = body.error || `HTTP ${r.status}`
        setPackageInfo({ ready: false, error: err })
        pushLog(`✗ package failed: ${err}`)
        return
      }
      setPackageInfo({
        ready: true,
        fileName: body.fileName,
        bytes: body.bytes,
        download: body.download || '/api/package/download',
      })
      const kb = body.bytes != null ? `${Math.round(body.bytes / 1024)} KB` : '?'
      pushLog(`✓ package ready ${body.fileName ?? ''} (${kb}) — downloading`)
      // Trigger browser download of the tarball (one-button complete flow).
      const a = document.createElement('a')
      a.href = body.download || '/api/package/download'
      a.download = body.fileName || 'clawdbot-go-source.tar.gz'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setPackageInfo({ ready: false, error: msg })
      pushLog(`✗ package error: ${msg}`)
    } finally {
      setPackageBusy(false)
    }
  }, [packageBusy, pushLog])

  const fetchAll = useCallback(async () => {
    const [
      st, h, conn, pkgs, env, eco, rhReady, cock, sig, bt, pr, pe, dna,
      laws, doc, port, opt, ven, trend, size, life, mid, council, vault, e2b,
    ] = await Promise.all([
      fetchJSON<StatusInfo>('/api/status', authFetch),
      fetchJSON<HealthInfo>('/api/health', authFetch),
      fetchJSON<Connector[]>('/api/connectors', authFetch),
      fetchJSON<PackageInfo[]>('/api/packages', authFetch),
      fetchJSON<EnvInfo>('/api/env', authFetch),
      fetchJSON<EcosystemInfo>('/api/ecosystem', authFetch),
      fetchJSON<RhReadinessInfo>('/api/rh/readiness', authFetch),
      fetchJSON<CockpitInfo>('/api/trading/cockpit', authFetch),
      fetchJSON<SignalInfo>('/api/trading/signal', authFetch),
      fetchJSON<BacktestInfo>('/api/trading/backtest', authFetch),
      fetchJSON<PricesInfo>('/api/market/prices', authFetch),
      fetchJSON<PerpsInfo>('/api/market/perps', authFetch),
      fetchJSON<DNAInfo>('/api/dna', authFetch),
      fetchJSON<unknown>('/api/laws', authFetch),
      fetchJSON<unknown>('/api/doctor', authFetch),
      fetchJSON<unknown>('/api/trading/portfolio', authFetch),
      fetchJSON<unknown>('/api/trading/optimize', authFetch),
      fetchJSON<unknown>('/api/perps/venues', authFetch),
      fetchJSON<unknown>('/api/market/trending', authFetch),
      fetchJSON<unknown>('/api/size', authFetch),
      fetchJSON<unknown>('/api/life', authFetch),
      fetchJSON<unknown>('/api/middleout', authFetch),
      fetchJSON<unknown>('/api/lobster-council', authFetch),
      fetchJSON<unknown>('/api/vault/status', authFetch),
      fetchJSON<unknown>('/api/e2b/computer', authFetch),
    ])

    if (st) setStatus(st)
    if (h) setHealth(h)
    if (conn) setConnectors(conn)
    if (pkgs) setPackages(pkgs)
    if (env) setEnvInfo(env)
    if (eco) setEcosystem(eco)
    if (rhReady) setRhReadinessRaw(rhReady)
    if (cock) setCockpit(cock)
    if (sig) setSignal(sig)
    if (bt) setBacktest(bt)
    if (pr) setPrices(pr)
    if (pe) setPerps(pe)
    if (dna) setDNAInfo(dna)
    if (laws) setLawsRaw(laws)
    if (doc) setDoctorRaw(doc)
    if (port) setPortfolioRaw(port)
    if (opt) setOptimizeRaw(opt)
    if (ven) setVenuesRaw(ven)
    if (trend) setTrendingRaw(trend)
    if (size) setSizeRaw(size)
    if (life) setLifeRaw(life)
    if (mid) setMiddleoutRaw(mid)
    if (council) setCouncilRaw(council)
    if (vault) setVaultStatusRaw(vault)
    if (e2b) setE2bComputerRaw(e2b)
  }, [authFetch])

  useEffect(() => {
    fetchAll().then(() => pushLog('synced feature surfaces'))
    const interval = setInterval(() => {
      fetchAll()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchAll, pushLog])

  // Step Game of Life a bit faster for a living panel.
  useEffect(() => {
    const id = setInterval(() => {
      fetchJSON<unknown>('/api/life').then((life) => {
        if (life) setLifeRaw(life)
      })
    }, 1200)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0
  }, [logs])

  const healthView = useMemo(() => mapHealth(health), [health])
  const ecosystemRows = useMemo(() => mapEcosystem(ecosystem), [ecosystem])
  const rhReadiness = useMemo(() => mapRhReadiness(rhReadinessRaw), [rhReadinessRaw])
  const laws = useMemo(() => mapLaws(lawsRaw), [lawsRaw])
  const doctor = useMemo(() => mapDoctor(doctorRaw), [doctorRaw])
  const portfolio = useMemo(() => mapPortfolio(portfolioRaw), [portfolioRaw])
  const optimize = useMemo(() => mapOptimize(optimizeRaw), [optimizeRaw])
  const venues = useMemo(() => mapVenues(venuesRaw), [venuesRaw])
  const trending = useMemo(() => mapTrending(trendingRaw), [trendingRaw])
  const size = useMemo(() => mapSize(sizeRaw), [sizeRaw])
  const life = useMemo(() => mapLife(lifeRaw), [lifeRaw])
  const middleout = useMemo(() => mapMiddleout(middleoutRaw), [middleoutRaw])
  const council = useMemo(() => mapCouncil(councilRaw), [councilRaw])
  const vaultStatus = useMemo(() => mapVaultStatus(vaultStatusRaw), [vaultStatusRaw])
  const vaultKeys = useMemo(() => mapVaultKeys(vaultKeysRaw), [vaultKeysRaw])

  const connected = connectors.filter((c) => c.status === 'connected' || c.status === 'public' || c.status === 'configured').length
  const total = connectors.length

  const loadVaultKeys = async () => {
    const data = await fetchJSON<unknown>('/api/vault/keys')
    if (data) {
      setVaultKeysRaw(data)
      pushLog('vault key inventory loaded (names only)')
    } else {
      pushLog('vault keys unavailable (auth/disabled)')
      setVaultKeysRaw({ keys: [] })
    }
  }

  if (route === '#/production') {
    return <ProductionRenderer onSwitchClassic={() => { window.location.hash = '' }} />
  }

  if (route === '#/computer') {
    return (
      <ComputerDesk
        variant="full"
        initial={e2bComputerRaw}
        onBack={() => { window.location.hash = '' }}
      />
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-mark brand-mark--omni" aria-hidden>
            <span className="brand-mark__ring brand-mark__ring--sol" />
            <span className="brand-mark__ring brand-mark__ring--rh" />
            <span className="brand-mark__claw">🦞</span>
          </div>
          <div>
            <h1>CLAWD BOT</h1>
            <div className="sub">Omni agent console · Solana SVM + Robinhood EVM · CLAWD</div>
          </div>
        </div>
        <div className="header-right">
          <button className="pill" onClick={() => { window.location.hash = '#/production' }} title="Production renderer">⌘K prod</button>
          <button className="pill" onClick={() => { window.location.hash = '#/computer' }} title="E2B computer desk">computer</button>
          <span className={`pill ${healthView.ok ? 'ok' : 'err'}`}>
            <span className={`dot pulse`} />
            {healthView.label}
          </span>
          <span className="pill pill-sol" title="Solana SVM">SVM</span>
          <span className="pill pill-rh" title="Robinhood Chain 4663">EVM 4663</span>
          <span className="pill">{status?.version ?? '—'}</span>
          <span className="pill">{status?.mode || 'simulated'}</span>
          <span className="pill">{status?.uptime ?? '…'}</span>
          {!unconfigured && <LoginButton onLoggedIn={() => { void fetchAll() }} />}
          {!unconfigured && <UserBadge onLoggedOut={() => { void fetchAll() }} />}
        </div>
      </header>

      <nav className="rail" aria-label="Feature navigation">
        {GROUPS.map((g) => (
          <div key={g} className="rail-section">
            <div className="rail-title">{GROUP_META[g].title}</div>
            {API_ENDPOINTS.filter((e) => e.group === g && e.poll).map((e) => (
              <a
                key={e.id}
                href={`#panel-${e.id}`}
                className={activeNav === e.id ? 'active' : ''}
                onClick={() => setActiveNav(e.id)}
              >
                {e.label}
              </a>
            ))}
          </div>
        ))}
      </nav>

      <main className="main">
        <OmniChainAnim />

        <div className="hero-strip">
          <div className="stat-card stat-card--sol">
            <div className="label">Runtime · Clawd Bot</div>
            <div className="value">{status?.status ?? '…'}</div>
            <div className="hint">{status?.go_version} · {status?.go_os}/{status?.go_arch}</div>
          </div>
          <div className="stat-card stat-card--sol">
            <div className="label">Solana · SVM</div>
            <div className="value">{connected}/{total || '—'}</div>
            <div className="hint">connectors · {status?.num_cpu ?? '—'} cores · {status?.goroutines ?? '—'} g</div>
          </div>
          <div className="stat-card stat-card--rh">
            <div className="label">Robinhood · EVM</div>
            <div className="value">
              {rhReadinessRaw
                ? rhReadiness.ready
                  ? 'READY'
                  : 'GATED'
                : cockpit
                  ? `${cockpit.readiness.grade} / ${cockpit.readiness.score}`
                  : '—'}
            </div>
            <div className="hint">
              chain {rhReadiness.metrics.find((m) => m.label === 'Chain')?.value ?? '4663'} · RH readiness
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Doctor · Omni</div>
            <div className="value" style={{ color: doctor.ok ? 'var(--neon)' : 'var(--amber)' }}>
              {doctorRaw ? (doctor.ok ? 'PASS' : 'ISSUES') : '…'}
            </div>
            <div className="hint">{doctor.rows.length} checks · SVM + EVM readiness</div>
          </div>
        </div>

        {/* ── Core ── */}
        <div className="section-head" id="sec-core">
          <h2>Core systems</h2>
          <div className="line" />
        </div>
        <div className="dashboard">
          <section className="panel" id="panel-status">
            <div className="panel-head"><h3>System Status</h3>{healthView.ok && <span className="live-tag">LIVE</span>}</div>
            <div className="metric-grid">
              <div className="metric"><div className="value">{status?.version ?? '—'}</div><div className="label">Version</div></div>
              <div className="metric"><div className="value">{status?.mode || 'sim'}</div><div className="label">Mode</div></div>
              <div className="metric"><div className="value">{status?.uptime ?? '—'}</div><div className="label">Uptime</div></div>
              <div className="metric"><div className="value">{status?.agent ?? health?.agent ?? '—'}</div><div className="label">Agent</div></div>
            </div>
            <div style={{ marginTop: 12 }} className="label">Config path</div>
            <div className="value" style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>{status?.config ?? '—'}</div>
          </section>

          <section className="panel" id="panel-connectors">
            <div className="panel-head">
              <h3>Connectors</h3>
              <button
                className="btn-action"
                type="button"
                onClick={() => { void openKeysPopup() }}
                title="Enter API keys in a popup"
              >
                🔑 API Keys
              </button>
            </div>
            {connectors.map((c) => (
              <div key={c.name} className="connector-row">
                <span className="connector-name">{c.name}</span>
                <span className="connector-type">{c.type}</span>
                <span className={`connector-status ${c.status}`}>{c.status}</span>
                {(c.status === 'not_configured' || c.status === 'missing') && (
                  <button
                    className="btn-mini"
                    type="button"
                    onClick={() => {
                      const map: Record<string, string> = {
                        Helius: 'HELIUS_API_KEY',
                        Birdeye: 'BIRDEYE_API_KEY',
                        Jupiter: 'JUPITER_API_KEY',
                        Aster: 'ASTER_API_KEY',
                        Blockscout: 'BLOCKSCOUT_API_KEY',
                        'Robinhood RPC': 'RH_RPC_URL',
                        OpenRouter: 'OPENROUTER_API_KEY',
                        Supabase: 'SUPABASE_URL',
                        'E2B Computer': 'E2B_API_KEY',
                      }
                      void openKeysPopup(map[c.name])
                    }}
                  >
                    Set
                  </button>
                )}
              </div>
            ))}
            {!connectors.length && <div className="empty">Loading connectors…</div>}
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn-config"
                type="button"
                onClick={() => {
                  if (!showConfig) {
                    fetch('/api/config')
                      .then((r) => r.text())
                      .then(setConfigText)
                      .catch(() => setConfigText('Failed to load config'))
                  }
                  setShowConfig(!showConfig)
                }}
              >
                {showConfig ? 'Hide' : 'View'} Config
              </button>
              <button className="btn-config" type="button" onClick={() => { void openKeysPopup() }}>
                Add API keys…
              </button>
            </div>
            {showConfig && <pre className="config-json">{configText}</pre>}
          </section>

          <section className="panel" id="panel-dna">
            <div className="panel-head"><h3>Agent DNA</h3></div>
            {dnaInfo ? (
              <>
                <div className="metric-grid">
                  <div className="metric ok"><div className="value">{dnaInfo.dna.metrics.utilityScore}/100</div><div className="label">Utility</div></div>
                  <div className="metric"><div className="value">{dnaInfo.dna.sequence.length}</div><div className="label">Bases</div></div>
                  <div className="metric"><div className="value">{dnaInfo.dna.metrics.gcContent.toFixed(2)}%</div><div className="label">GC</div></div>
                  <div className="metric"><div className="value">{dnaInfo.dna.metrics.pamSites.length}/{dnaInfo.dna.metrics.tataBoxes.length}</div><div className="label">PAM/TATA</div></div>
                </div>
                <div className="label" style={{ marginTop: 10 }}>DNA ID</div>
                <div className="value" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{dnaInfo.dna.proof.dnaId}</div>
                <div className="dna-sequence">{dnaInfo.dna.sequence.value.slice(0, 96)}…</div>
              </>
            ) : (
              <div className="empty">Loading agent DNA…</div>
            )}
          </section>

          <section className="panel" id="panel-ecosystem">
            <div className="panel-head"><h3>Ecosystem</h3></div>
            {ecosystemRows.length ? (
              <div>
                {ecosystemRows.map((row) => (
                  <div key={row.key} className="env-row">
                    <span className="env-key">{row.primary}</span>
                    {row.secondary ? (
                      <a className="env-val" href={row.secondary} target="_blank" rel="noreferrer">
                        {row.secondary}
                      </a>
                    ) : (
                      <span className="env-val">—</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Loading ecosystem…</div>
            )}
          </section>

          <section className="panel" id="panel-rhReadiness">
            <div className="panel-head">
              <h3>RH Readiness</h3>
              {rhReadinessRaw && (
                <span className={`live-tag ${rhReadiness.ready ? '' : 'warn'}`}>
                  {rhReadiness.ready ? 'READY' : 'GATED'}
                </span>
              )}
            </div>
            {rhReadinessRaw ? (
              <>
                <div className="metric-grid">
                  {rhReadiness.metrics.map((m) => (
                    <div key={m.label} className={`metric ${m.tone === 'ok' ? 'ok' : ''}`}>
                      <div className="value" style={{ fontSize: '0.95rem' }}>{m.value}</div>
                      <div className="label">{m.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}>
                  {rhReadiness.rows.map((row) => (
                    <div key={row.key} className="env-row">
                      <span className="env-key">{row.primary}</span>
                      <span className="env-val">{row.secondary ?? row.badge ?? ''}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty">Loading RH readiness…</div>
            )}
          </section>
        </div>

        {/* ── Trading ── */}
        <div className="section-head" id="sec-trading">
          <h2>Trading intelligence</h2>
          <div className="line" />
        </div>
        <div className="dashboard">
          <section className="panel" id="panel-cockpit">
            <div className="panel-head"><h3>Trading Cockpit</h3></div>
            {cockpit ? (
              <>
                <div className="metric-grid">
                  <div className="metric ok"><div className="value">{cockpit.readiness.grade}</div><div className="label">Grade</div></div>
                  <div className="metric"><div className="value">{cockpit.readiness.score}</div><div className="label">Score</div></div>
                  <div className="metric"><div className="value">{cockpit.mode || 'sim'}</div><div className="label">Mode</div></div>
                  <div className="metric"><div className="value">{cockpit.risk.maxPositionSol}</div><div className="label">Max SOL</div></div>
                </div>
                <div className="label" style={{ marginTop: 10 }}>
                  size {(cockpit.risk.positionSizePct * 100).toFixed(1)}% · SL {(cockpit.risk.stopLossPct * 100).toFixed(1)}% · TP {(cockpit.risk.takeProfitPct * 100).toFixed(1)}%
                </div>
              </>
            ) : (
              <div className="empty">Loading cockpit…</div>
            )}
          </section>

          <section className="panel" id="panel-signal">
            <div className="panel-head"><h3>Strategy Engine</h3></div>
            {signal && backtest ? (
              <>
                <div className="metric-grid">
                  <div className="metric">
                    <div className="value" style={{
                      color: signal.signal.direction === 'long' ? 'var(--neon)'
                        : signal.signal.direction === 'short' ? 'var(--red)' : 'var(--text-dim)',
                    }}>
                      {signal.signal.direction.toUpperCase()}
                    </div>
                    <div className="label">Signal</div>
                  </div>
                  <div className="metric"><div className="value">{(signal.signal.strength * 100).toFixed(0)}%</div><div className="label">Strength</div></div>
                  <div className="metric"><div className="value">{signal.signal.rsi.toFixed(1)}</div><div className="label">RSI</div></div>
                  <div className="metric"><div className="value">{signal.signal.emaCross}</div><div className="label">EMA</div></div>
                </div>
                <div className="label" style={{ marginTop: 10 }}>
                  Backtest · {backtest.bars} bars · {backtest.result.trades} trades
                </div>
                <Sparkline data={backtest.result.equityCurve} />
                <div className="metric-grid" style={{ marginTop: 8 }}>
                  <div className="metric"><div className="value">{(backtest.result.winRate * 100).toFixed(0)}%</div><div className="label">Win</div></div>
                  <div className="metric"><div className="value">{(backtest.result.totalReturn * 100).toFixed(1)}%</div><div className="label">Return</div></div>
                  <div className="metric"><div className="value">{backtest.result.sharpe.toFixed(2)}</div><div className="label">Sharpe</div></div>
                  <div className="metric"><div className="value">-{(backtest.result.maxDrawdown * 100).toFixed(1)}%</div><div className="label">Max DD</div></div>
                </div>
              </>
            ) : (
              <div className="empty">Running strategy engine…</div>
            )}
          </section>

          <section className="panel" id="panel-portfolio">
            <div className="panel-head"><h3>Portfolio Guard</h3></div>
            {portfolioRaw ? (
              <>
                <MetricGrid metrics={portfolio.metrics} />
                {portfolio.reasons.length > 0 && (
                  <div className="warn-text" style={{ marginTop: 10 }}>
                    {portfolio.reasons.join(' · ')}
                  </div>
                )}
              </>
            ) : (
              <div className="empty">Loading portfolio guard…</div>
            )}
          </section>

          <section className="panel" id="panel-optimize">
            <div className="panel-head"><h3>Walk-Forward Optimize</h3></div>
            {optimizeRaw ? (
              <MetricGrid metrics={optimize} />
            ) : (
              <div className="empty">Running optimizer…</div>
            )}
          </section>
        </div>

        {/* ── Market ── */}
        <div className="section-head" id="sec-market">
          <h2>Market surfaces</h2>
          <div className="line" />
        </div>
        <div className="dashboard">
          <section className="panel" id="panel-prices">
            <div className="panel-head">
              <h3>Live Market</h3>
              {prices?.ok && <span className="live-tag">JUPITER</span>}
            </div>
            {prices ? (
              prices.ok ? (
                <div>
                  {Object.values(prices.prices).map((p) => (
                    <div key={p.mint} className="env-row">
                      <span className="env-key" style={{ fontFamily: 'monospace' }}>
                        {p.mint.slice(0, 4)}…{p.mint.slice(-4)}
                      </span>
                      <span className="env-val">
                        ${p.usdPrice < 0.01 ? p.usdPrice.toExponential(2) : p.usdPrice.toFixed(4)}
                        <span style={{ marginLeft: 8, color: p.priceChange24h >= 0 ? 'var(--neon)' : 'var(--red)' }}>
                          {p.priceChange24h >= 0 ? '▲' : '▼'} {Math.abs(p.priceChange24h).toFixed(2)}%
                        </span>
                      </span>
                    </div>
                  ))}
                  <div className="label" style={{ marginTop: 8 }}>source: {prices.source} · {prices.count} tokens</div>
                </div>
              ) : (
                <div className="warn-text">live prices unavailable: {prices.error}</div>
              )
            ) : (
              <div className="empty">Loading live prices…</div>
            )}
          </section>

          <section className="panel" id="panel-perps">
            <div className="panel-head"><h3>Perps Open Interest</h3></div>
            {perps ? (
              perps.ok && perps.tokens && perps.tokens.length > 0 ? (
                <div>
                  {perps.tokens.slice(0, 8).map((t) => {
                    const tot = t.long_io + t.short_io || 1
                    const longPct = (t.long_io / tot) * 100
                    return (
                      <div key={t.token} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span>{t.token}</span>
                          <span className="muted">${(t.open_interest / 1e6).toFixed(1)}M · {t.bias_text}</span>
                        </div>
                        <div className="oi-bar">
                          <div className="oi-long" style={{ width: `${longPct}%` }} />
                          <div className="oi-short" style={{ width: `${100 - longPct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  <div className="label">source: {perps.source}</div>
                </div>
              ) : (
                <div className="warn-text">perps feed unavailable{perps.error ? `: ${perps.error}` : ''}</div>
              )
            ) : (
              <div className="empty">Loading perps…</div>
            )}
          </section>

          <section className="panel" id="panel-trending">
            <div className="panel-head"><h3>Trending</h3></div>
            {trendingRaw ? (
              trending.ok ? (
                <RowList rows={trending.rows} />
              ) : (
                <div className="warn-text">{trending.error}</div>
              )
            ) : (
              <div className="empty">Loading trending…</div>
            )}
          </section>

          <section className="panel" id="panel-venues">
            <div className="panel-head"><h3>Perps Venues</h3></div>
            {venuesRaw ? <RowList rows={venues} /> : <div className="empty">Loading venues…</div>}
          </section>
        </div>

        {/* ── Governance ── */}
        <div className="section-head" id="sec-governance">
          <h2>Governance & diagnostics</h2>
          <div className="line" />
        </div>
        <div className="dashboard">
          <section className="panel wide" id="panel-laws">
            <div className="panel-head"><h3>Six Laws Harness</h3></div>
            {lawsRaw ? <RowList rows={laws} /> : <div className="empty">Loading laws…</div>}
          </section>

          <section className="panel" id="panel-doctor">
            <div className="panel-head"><h3>Doctor</h3></div>
            {doctorRaw ? (
              <>
                <MetricGrid metrics={doctor.metrics} />
                <div style={{ marginTop: 12 }}><RowList rows={doctor.rows} /></div>
              </>
            ) : (
              <div className="empty">Running doctor…</div>
            )}
          </section>

          <section className="panel" id="panel-council">
            <div className="panel-head">
              <h3>Lobster Council</h3>
              <span className="badge">{council.count} members</span>
            </div>
            {councilRaw ? <RowList rows={council.rows} /> : <div className="empty">Loading council…</div>}
          </section>
        </div>

        {/* ── Compute ── */}
        <div className="section-head" id="sec-compute">
          <h2>Compute primitives</h2>
          <div className="line" />
        </div>
        <div className="dashboard">
          <section className="panel" id="panel-size">
            <div className="panel-head"><h3>Weissman Size</h3></div>
            {sizeRaw ? <MetricGrid metrics={size} /> : <div className="empty">Scanning footprint…</div>}
          </section>

          <section className="panel" id="panel-middleout">
            <div className="panel-head"><h3>Middle-Out Cache</h3></div>
            {middleoutRaw ? <MetricGrid metrics={middleout} /> : <div className="empty">Warming cache…</div>}
          </section>

          <section className="panel wide" id="panel-life">
            <div className="panel-head">
              <h3>Universal Computer · CLAWD Life (SVM ⊕ EVM)</h3>
              <button
                className="btn-action"
                type="button"
                onClick={() => {
                  fetchJSON<unknown>('/api/life?reset=1').then((life) => {
                    if (life) {
                      setLifeRaw(life)
                      pushLog('life grid reseeded (Gosper gun · dual-rail palette)')
                    }
                  })
                }}
              >
                Reseed
              </button>
            </div>
            <div className="life-legend">
              <span className="life-legend__item life-legend__item--sol">Solana SVM cells</span>
              <span className="life-legend__item life-legend__item--rh">Robinhood EVM cells</span>
              <span className="life-legend__item">CLAWD core evolves both rails</span>
            </div>
            {lifeRaw ? (
              <>
                <MetricGrid metrics={life.metrics} />
                <LifeCanvas cells={life.cells} rows={life.rows} cols={life.cols} />
              </>
            ) : (
              <div className="empty">Booting cellular automaton…</div>
            )}
          </section>

          <ComputerDesk variant="panel" initial={e2bComputerRaw} />
        </div>

        {/* ── Ops ── */}
        <div className="section-head" id="sec-ops">
          <h2>Ops & environment</h2>
          <div className="line" />
        </div>
        <div className="dashboard">
          <section className="panel" id="panel-vaultStatus">
            <div className="panel-head">
              <h3>Vault Status</h3>
              <button className="btn-action" type="button" onClick={loadVaultKeys}>Load key names</button>
            </div>
            {vaultStatusRaw ? <MetricGrid metrics={vaultStatus} /> : <div className="empty">Loading vault…</div>}
            {vaultKeys.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="label">Key inventory (names only)</div>
                <RowList rows={vaultKeys} />
              </div>
            )}
          </section>

          <section className="panel" id="panel-packages">
            <div className="panel-head">
              <h3>Go Packages ({packages.length})</h3>
              <button
                className="btn-action"
                type="button"
                disabled={packageBusy}
                onClick={() => { void packageSource() }}
                title="Build slim source tarball and download it"
              >
                {packageBusy ? 'Packaging…' : '📦 Package'}
              </button>
            </div>
            {packageInfo?.ready && (
              <div className="metric-grid" style={{ marginBottom: 10 }}>
                <div className="metric ok">
                  <div className="value">{packageInfo.bytes != null ? `${Math.round(packageInfo.bytes / 1024)}K` : '—'}</div>
                  <div className="label">Archive</div>
                </div>
                <div className="metric">
                  <div className="value" style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{packageInfo.fileName ?? 'ready'}</div>
                  <div className="label">File</div>
                </div>
              </div>
            )}
            {packageInfo?.error && <div className="err-text">{packageInfo.error}</div>}
            <div className="muted" style={{ fontSize: '0.75rem', marginBottom: 8 }}>
              One button → slim source archive (export-ignore) → download
            </div>
            <div>
              {packages.map((pkg) => (
                <div key={pkg.name} className="package-item">
                  <span className="package-name">{pkg.name}</span>
                  <span className="package-path">{pkg.path}</span>
                  <span className="package-files">{pkg.file_count}f</span>
                </div>
              ))}
              {!packages.length && <div className="empty">Loading packages…</div>}
            </div>
          </section>

          <section className="panel" id="panel-env">
            <div className="panel-head"><h3>Environment</h3></div>
            {envInfo ? (
              <div>
                {Object.entries(envInfo).map(([key, val]) => (
                  <div key={key} className="env-row">
                    <span className="env-key">{key}</span>
                    <span className="env-val">{val || '—'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Loading environment…</div>
            )}
          </section>

          <section className="panel" id="panel-log">
            <div className="panel-head"><h3>System Log</h3></div>
            <div className="chat-messages" ref={logRef}>
              {logs.map((m, i) => (
                <div key={`${i}-${m}`} className="log-line">{m}</div>
              ))}
            </div>
          </section>
        </div>

        {/* ── API keys popup ── */}
        {showKeysModal && (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget && !keysBusy) setShowKeysModal(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !keysBusy) setShowKeysModal(false)
            }}
          >
            <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="keys-modal-title">
              <div className="panel-head">
                <h3 id="keys-modal-title">🔑 API keys</h3>
                <button
                  className="btn-action"
                  type="button"
                  disabled={keysBusy}
                  onClick={() => setShowKeysModal(false)}
                >
                  Close
                </button>
              </div>
              <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 12px' }}>
                Keys are saved to <code>{keysSource || '.env.local'}</code> (mode 0600) on this machine.
                Values are never shown back in the UI or logs. Localhost only.
              </p>
              {keysError && <div className="err-text" style={{ marginBottom: 10 }}>{keysError}</div>}
              <div className="keys-form">
                {(keysList.length ? keysList : []).map((k, idx) => {
                  const isFocus = keysFocus ? k.name === keysFocus : !k.set && idx === 0
                  return (
                    <label key={k.name} className={`keys-row ${k.set ? 'is-set' : ''}`}>
                      <div className="keys-meta">
                        <span className="keys-label">{k.label}</span>
                        <span className="keys-name">{k.name}</span>
                        {k.hint && <span className="keys-hint">{k.hint}</span>}
                        <span className={`badge ${k.set ? 'ok' : 'warn'}`}>{k.set ? `set (${k.source || 'env'})` : 'missing'}</span>
                      </div>
                      <input
                        ref={isFocus ? keysInputRef : undefined}
                        className="keys-input"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={k.set ? '••••••••  (leave blank to keep)' : (k.placeholder || 'paste key…')}
                        value={keysDraft[k.name] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value
                          setKeysDraft((prev) => ({ ...prev, [k.name]: val }))
                        }}
                        disabled={keysBusy}
                      />
                    </label>
                  )
                })}
                {!keysList.length && !keysError && (
                  <div className="empty">Loading key slots…</div>
                )}
              </div>
              <div className="modal-actions">
                <button
                  className="btn-action"
                  type="button"
                  disabled={keysBusy}
                  onClick={() => { void loadKeysStatus() }}
                >
                  Refresh
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={keysBusy}
                  onClick={() => { void saveKeysPopup() }}
                >
                  {keysBusy ? 'Saving…' : 'Save keys'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="footer-note">
          CLAWDBOT · REAL API SURFACES · NO STUBBED HAPPY PATH · {API_ENDPOINTS.length} REGISTERED ENDPOINTS
        </div>
      </main>
    </div>
  )
}
