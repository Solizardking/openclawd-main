/**
 * Pure response → display mappers for the console.
 * No I/O; unit-tested against realistic payload shapes.
 */

export interface DisplayMetric {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'err' | 'neutral'
}

export interface DisplayRow {
  key: string
  primary: string
  secondary?: string
  badge?: string
  tone?: 'ok' | 'warn' | 'err' | 'neutral'
}

export function toneFromStatus(status: string | boolean | undefined): DisplayMetric['tone'] {
  if (status === true || status === 'ok' || status === 'pass' || status === 'connected' || status === 'configured') {
    return 'ok'
  }
  if (status === 'warn' || status === 'warning') return 'warn'
  if (status === false || status === 'fail' || status === 'err' || status === 'error' || status === 'not_configured') {
    return 'err'
  }
  return 'neutral'
}

export function formatPct(n: number | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

export function formatNum(n: number | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

/** Six-laws array → rows for the laws panel. */
export function mapLaws(payload: unknown): DisplayRow[] {
  if (!Array.isArray(payload)) return []
  return payload.map((raw, i) => {
    const law = raw as { id?: string; title?: string; layer?: string; text?: string }
    return {
      key: law.id ?? String(i),
      primary: `Law ${law.id ?? i} — ${law.title ?? 'Untitled'}`,
      secondary: law.text,
      badge: law.layer,
      tone: law.layer === 'on-chain' ? 'ok' : 'neutral',
    }
  })
}

/** Doctor report → metrics + check rows. */
export function mapDoctor(payload: unknown): { ok: boolean; metrics: DisplayMetric[]; rows: DisplayRow[] } {
  const report = (payload ?? {}) as {
    ok?: boolean
    checks?: Array<{ id?: string; label?: string; status?: string; message?: string }>
  }
  const checks = Array.isArray(report.checks) ? report.checks : []
  const pass = checks.filter((c) => c.status === 'pass').length
  const warn = checks.filter((c) => c.status === 'warn').length
  const fail = checks.filter((c) => c.status === 'fail').length
  return {
    ok: !!report.ok,
    metrics: [
      { label: 'Overall', value: report.ok ? 'PASS' : 'ISSUES', tone: report.ok ? 'ok' : 'err' },
      { label: 'Pass', value: String(pass), tone: 'ok' },
      { label: 'Warn', value: String(warn), tone: warn ? 'warn' : 'neutral' },
      { label: 'Fail', value: String(fail), tone: fail ? 'err' : 'neutral' },
    ],
    rows: checks.map((c, i) => ({
      key: c.id ?? String(i),
      primary: c.label ?? c.id ?? `check-${i}`,
      secondary: c.message,
      badge: c.status,
      tone: toneFromStatus(c.status),
    })),
  }
}

/** Portfolio guard response → metrics. */
export function mapPortfolio(payload: unknown): { metrics: DisplayMetric[]; reasons: string[]; allowed: boolean } {
  const p = (payload ?? {}) as {
    guard?: { allowed?: boolean; reasons?: string[] }
    limits?: {
      maxConcurrent?: number
      maxTotalExposure?: number
      maxPerAsset?: number
      maxDrawdownPct?: number
      dailyLossLimitPct?: number
    }
    candidate?: { asset?: string; sizeSol?: number }
  }
  const limits = p.limits ?? {}
  const guard = p.guard ?? {}
  const allowed = !!guard.allowed
  return {
    allowed,
    reasons: Array.isArray(guard.reasons) ? guard.reasons : [],
    metrics: [
      { label: 'Guard', value: allowed ? 'ALLOWED' : 'BLOCKED', tone: allowed ? 'ok' : 'err' },
      { label: 'Max concurrent', value: String(limits.maxConcurrent ?? '—') },
      { label: 'Max exposure', value: `${formatNum(limits.maxTotalExposure, 2)} SOL` },
      { label: 'Max per asset', value: `${formatNum(limits.maxPerAsset, 2)} SOL` },
      { label: 'Max DD', value: formatPct(limits.maxDrawdownPct) },
      { label: 'Daily loss', value: formatPct(limits.dailyLossLimitPct) },
      {
        label: 'Candidate',
        value: `${p.candidate?.asset || '—'} · ${formatNum(p.candidate?.sizeSol, 3)} SOL`,
      },
    ],
  }
}

/** Optimize walk-forward → metrics. */
export function mapOptimize(payload: unknown): DisplayMetric[] {
  const o = (payload ?? {}) as {
    evaluated?: number
    inSampleScore?: number
    outSampleScore?: number
    overfit?: number
    best?: { emaFastPeriod?: number; emaSlowPeriod?: number; rsiPeriod?: number }
    inSample?: { winRate?: number; totalReturn?: number; sharpe?: number }
    outSample?: { winRate?: number; totalReturn?: number; sharpe?: number }
  }
  const overfit = o.overfit ?? 0
  return [
    { label: 'Evaluated', value: String(o.evaluated ?? '—') },
    { label: 'In-sample', value: formatNum(o.inSampleScore, 3), tone: 'ok' },
    { label: 'Out-sample', value: formatNum(o.outSampleScore, 3), tone: 'ok' },
    {
      label: 'Overfit Δ',
      value: formatNum(overfit, 3),
      tone: overfit > 0.5 ? 'warn' : 'neutral',
    },
    {
      label: 'Best EMA',
      value: `${o.best?.emaFastPeriod ?? '—'}/${o.best?.emaSlowPeriod ?? '—'}`,
    },
    {
      label: 'OOS win / return',
      value: `${formatPct(o.outSample?.winRate)} · ${formatPct(o.outSample?.totalReturn)}`,
    },
  ]
}

/** Perps venues list. */
export function mapVenues(payload: unknown): DisplayRow[] {
  const p = (payload ?? {}) as { venues?: Array<{ name?: string; kind?: string; status?: string }> }
  const venues = Array.isArray(p.venues) ? p.venues : []
  return venues.map((v, i) => ({
    key: v.name ?? String(i),
    primary: v.name ?? `venue-${i}`,
    secondary: v.kind,
    badge: v.status,
    tone: toneFromStatus(v.status),
  }))
}

/** Weissman size report. */
export function mapSize(payload: unknown): DisplayMetric[] {
  const s = (payload ?? {}) as {
    files?: number
    rawMB?: number
    targetMB?: number
    underTarget?: boolean
    pctOfTarget?: number
    gzipRatio?: number
    zstdRatio?: number
    weissmanScore?: number
    verdict?: string
  }
  return [
    { label: 'Files', value: String(s.files ?? '—') },
    { label: 'Raw', value: `${formatNum(s.rawMB, 2)} MB` },
    { label: 'Target', value: `${formatNum(s.targetMB, 2)} MB` },
    {
      label: 'Budget',
      value: s.underTarget ? 'UNDER' : 'OVER',
      tone: s.underTarget ? 'ok' : 'warn',
    },
    { label: '% of target', value: formatNum(s.pctOfTarget, 1) + '%' },
    { label: 'gzip ×', value: formatNum(s.gzipRatio, 2) },
    { label: 'zstd ×', value: formatNum(s.zstdRatio, 2) },
    { label: 'Weissman', value: formatNum(s.weissmanScore, 2), tone: 'ok' },
    { label: 'Verdict', value: s.verdict ?? '—', tone: s.underTarget ? 'ok' : 'warn' },
  ]
}

/** Middle-out cache stats. */
export function mapMiddleout(payload: unknown): DisplayMetric[] {
  const p = (payload ?? {}) as {
    cache?: {
      entries?: number
      hitRate?: number
      rawBytes?: number
      compressedBytes?: number
      compressionRatio?: number
      hits?: number
      misses?: number
      evictions?: number
      dedupes?: number
    }
    note?: string
  }
  const c = p.cache ?? {}
  return [
    { label: 'Entries', value: String(c.entries ?? 0) },
    { label: 'Hit rate', value: formatPct(c.hitRate) },
    { label: 'Raw', value: formatBytes(c.rawBytes) },
    { label: 'Compressed', value: formatBytes(c.compressedBytes) },
    { label: 'Ratio', value: formatNum(c.compressionRatio, 2) + '×' },
    { label: 'Hits / miss', value: `${c.hits ?? 0} / ${c.misses ?? 0}` },
    { label: 'Evict / dedupe', value: `${c.evictions ?? 0} / ${c.dedupes ?? 0}` },
  ]
}

/**
 * Decode Game of Life cells from the backend JSON shape.
 * Go's encoding/json serializes [][]uint8 as base64 strings per row, so we
 * accept both number[][] and base64 row strings.
 */
export function decodeLifeCells(raw: unknown, colsHint?: number): number[][] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  if (typeof raw[0] === 'string') {
    return (raw as string[]).map((row) => {
      try {
        // atob is browser; Buffer for node tests
        const bin =
          typeof atob === 'function'
            ? atob(row)
            : Buffer.from(row, 'base64').toString('binary')
        const out: number[] = []
        for (let i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i) ? 1 : 0)
        return out
      } catch {
        return []
      }
    })
  }
  if (Array.isArray(raw[0])) {
    return (raw as unknown[][]).map((row) =>
      (Array.isArray(row) ? row : []).map((v) => (Number(v) ? 1 : 0)),
    )
  }
  // Flat numeric row with known cols
  if (typeof raw[0] === 'number' && colsHint && colsHint > 0) {
    const flat = raw as number[]
    const grid: number[][] = []
    for (let i = 0; i < flat.length; i += colsHint) {
      grid.push(flat.slice(i, i + colsHint).map((v) => (v ? 1 : 0)))
    }
    return grid
  }
  return []
}

/** Game of Life frame summary. */
export function mapLife(payload: unknown): {
  metrics: DisplayMetric[]
  cells: number[][]
  rows: number
  cols: number
} {
  const life = (payload ?? {}) as {
    rows?: number
    cols?: number
    gen?: number
    population?: number
    cells?: unknown
    note?: string
  }
  const cells = decodeLifeCells(life.cells, life.cols)
  return {
    rows: life.rows ?? cells.length,
    cols: life.cols ?? (cells[0]?.length ?? 0),
    cells,
    metrics: [
      { label: 'Generation', value: String(life.gen ?? 0), tone: 'ok' },
      { label: 'Population', value: String(life.population ?? 0) },
      { label: 'Grid', value: `${life.rows ?? '—'}×${life.cols ?? '—'}` },
    ],
  }
}

/** Vault status (never secrets). */
export function mapVaultStatus(payload: unknown): DisplayMetric[] {
  const v = (payload ?? {}) as {
    enabled?: boolean
    source?: string
    keys?: number
    tokenConfigured?: boolean
    clientIp?: string
    clientIpAllowed?: boolean
    error?: string
  }
  if (v.error) {
    return [
      { label: 'Vault', value: 'UNAVAILABLE', tone: 'warn' },
      { label: 'Error', value: v.error, tone: 'warn' },
    ]
  }
  return [
    { label: 'Enabled', value: v.enabled ? 'YES' : 'NO', tone: v.enabled ? 'ok' : 'warn' },
    { label: 'Source', value: v.source || '—' },
    { label: 'Key count', value: String(v.keys ?? 0) },
    {
      label: 'Token',
      value: v.tokenConfigured ? 'set' : 'unset',
      tone: v.tokenConfigured ? 'ok' : 'neutral',
    },
    { label: 'Client IP', value: v.clientIp || '—' },
    {
      label: 'IP allowed',
      value: v.clientIpAllowed ? 'yes' : 'no',
      tone: v.clientIpAllowed ? 'ok' : 'warn',
    },
  ]
}

/** Vault keys inventory (names only). */
export function mapVaultKeys(payload: unknown): DisplayRow[] {
  const v = (payload ?? {}) as { keys?: string[]; count?: number; error?: string }
  if (!Array.isArray(v.keys)) return []
  return v.keys.map((name) => ({
    key: name,
    primary: name,
    badge: 'key',
    tone: 'neutral' as const,
  }))
}

/** Lobster council members. */
export function mapCouncil(payload: unknown): { count: number; rows: DisplayRow[] } {
  const p = (payload ?? {}) as {
    count?: number
    members?: Array<Record<string, unknown> | string>
    council?: string
  }
  const members = Array.isArray(p.members) ? p.members : []
  return {
    count: p.count ?? members.length,
    rows: members.map((m, i) => {
      if (typeof m === 'string') {
        return { key: String(i), primary: m }
      }
      const name = String(m.name ?? m.id ?? m.role ?? `member-${i}`)
      const role = m.role != null ? String(m.role) : m.species != null ? String(m.species) : undefined
      return {
        key: String(m.id ?? i),
        primary: name,
        secondary: role,
        badge: m.status != null ? String(m.status) : undefined,
      }
    }),
  }
}

/** Trending tokens with graceful degradation. */
export function mapTrending(payload: unknown): {
  ok: boolean
  error?: string
  rows: DisplayRow[]
} {
  const p = (payload ?? {}) as {
    ok?: boolean
    error?: string
    tokens?: Array<Record<string, unknown>>
  }
  if (!p.ok) {
    return { ok: false, error: p.error || 'trending unavailable', rows: [] }
  }
  const tokens = Array.isArray(p.tokens) ? p.tokens : []
  return {
    ok: true,
    rows: tokens.slice(0, 12).map((t, i) => {
      const symbol = String(t.symbol ?? t.name ?? t.address ?? `tok-${i}`)
      const change = t.price24hChangePercent ?? t.v24hChangePercent ?? t.priceChange24h
      const price = t.price ?? t.usdPrice
      const sec =
        price != null
          ? `$${Number(price).toPrecision(4)}${change != null ? ` · ${Number(change).toFixed(2)}%` : ''}`
          : change != null
            ? `${Number(change).toFixed(2)}%`
            : undefined
      return {
        key: String(t.address ?? symbol),
        primary: symbol,
        secondary: sec,
        tone: change != null && Number(change) < 0 ? 'err' : 'ok',
      }
    }),
  }
}

export function formatBytes(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

/** Summarize health for the header strip. */
export function mapHealth(payload: unknown): {
  ok: boolean
  agent: string
  packageName: string
  product: string
  label: string
} {
  const h = (payload ?? {}) as {
    status?: string
    agent?: string
    package?: string
    product?: string
  }
  const ok = h.status === 'ok'
  const agent = h.agent || 'unknown'
  return {
    ok,
    agent,
    packageName: h.package || '',
    product: h.product || '',
    label: ok ? `healthy · ${agent}` : 'degraded',
  }
}

/** Preferred display order + labels for GET /api/ecosystem. */
const ECOSYSTEM_LABELS: Record<string, string> = {
  zero_clawd: 'Clawd Bot',
  agent_hub: 'Agent hub',
  agent_forge: 'Agent forge',
  terminal: 'Terminal',
  runtime_repo: 'Runtime repo',
  hub_repo: 'Ecosystem hub',
  gateway: 'x402 gateway',
  cheshire_agents_npm: 'Agents npm',
  cheshire_agents_repo: 'Agents GitHub',
  skillhub_repo: 'SkillHub',
}

/** Map ecosystem link object → ordered rows (unknown keys still included). */
export function mapEcosystem(payload: unknown): DisplayRow[] {
  const links = (payload ?? {}) as Record<string, unknown>
  const keys = Object.keys(links)
  const preferred = Object.keys(ECOSYSTEM_LABELS)
  const ordered = [
    ...preferred.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !preferred.includes(k)).sort(),
  ]
  return ordered.map((key) => {
    const val = links[key]
    const href = typeof val === 'string' ? val : String(val ?? '')
    return {
      key,
      primary: ECOSYSTEM_LABELS[key] ?? key,
      secondary: href,
      badge: key,
      tone: href.includes('zeroclawd') || href.includes('/agents') ? 'ok' : 'neutral',
    }
  })
}

/** Map GET /api/rh/readiness (presence-only gate from pkg/rh). */
export function mapRhReadiness(payload: unknown): {
  ready: boolean
  metrics: DisplayMetric[]
  rows: DisplayRow[]
  message: string
} {
  const r = (payload ?? {}) as {
    ready?: boolean
    chainId?: number
    blockscoutConfigured?: boolean
    rhRpcConfigured?: boolean
    usingPublicRpcRead?: boolean
    missing?: string[]
    resolvedRpc?: string
    message?: string
  }
  const missing = Array.isArray(r.missing) ? r.missing : []
  return {
    ready: !!r.ready,
    message: r.message || '',
    metrics: [
      { label: 'Ready', value: r.ready ? 'YES' : 'NO', tone: r.ready ? 'ok' : 'warn' },
      { label: 'Chain', value: r.chainId != null ? String(r.chainId) : '—', tone: 'neutral' },
      {
        label: 'Blockscout',
        value: r.blockscoutConfigured ? 'set' : 'missing',
        tone: r.blockscoutConfigured ? 'ok' : 'err',
      },
      {
        label: 'RH RPC',
        value: r.rhRpcConfigured ? 'private' : r.usingPublicRpcRead ? 'public read' : '—',
        tone: r.rhRpcConfigured ? 'ok' : 'warn',
      },
    ],
    rows: [
      ...missing.map((m) => ({
        key: m,
        primary: m,
        secondary: 'required for launch/deploy/trade',
        badge: 'missing',
        tone: 'err' as const,
      })),
      ...(r.resolvedRpc
        ? [
            {
              key: 'rpc',
              primary: 'Resolved RPC',
              secondary: r.resolvedRpc,
              tone: 'neutral' as const,
            },
          ]
        : []),
      ...(r.message
        ? [
            {
              key: 'msg',
              primary: 'Message',
              secondary: r.message,
              tone: r.ready ? ('ok' as const) : ('warn' as const),
            },
          ]
        : []),
    ],
  }
}

export interface E2BSandboxRow {
  sandboxId: string
  state: string
  computerUrl: string
  templateId?: string
}

export interface E2BComputerView {
  keySet: boolean
  product: string
  npmSpec: string
  alias: string
  hosted: string
  build: string
  metrics: DisplayMetric[]
  sandboxes: E2BSandboxRow[]
}

/** GET /api/e2b/computer → desk metrics (never tokens). */
export function mapE2BComputer(payload: unknown): E2BComputerView {
  const p = (payload ?? {}) as {
    keySet?: boolean
    product?: string
    npmSpec?: string
    hosted?: string
    build?: string
    template?: { alias?: string; startPort?: number }
    presets?: string[]
    sandboxes?: Array<{ sandboxId?: string; state?: string; computerUrl?: string; templateId?: string }>
  }
  const boxes = Array.isArray(p.sandboxes) ? p.sandboxes : []
  const sandboxes = boxes
    .filter((s) => s.sandboxId)
    .map((s) => ({
      sandboxId: String(s.sandboxId),
      state: s.state || 'running',
      computerUrl: s.computerUrl || '',
      templateId: s.templateId,
    }))
  return {
    keySet: !!p.keySet,
    product: p.product || 'Clawd Bot',
    npmSpec: p.npmSpec || 'clawdbot-go@latest',
    alias: p.template?.alias || 'clawdbot-computer',
    hosted: p.hosted || 'https://cheshireterminal.ai/cheshire-computer',
    build: p.build || 'python e2b/clawdbot-computer/build.py',
    metrics: [
      { label: 'Key', value: p.keySet ? 'SET' : 'MISSING', tone: p.keySet ? 'ok' : 'err' },
      { label: 'Alias', value: p.template?.alias || 'clawdbot-computer' },
      { label: 'Port', value: String(p.template?.startPort ?? 8787) },
      { label: 'Desks', value: String(sandboxes.length), tone: sandboxes.length ? 'ok' : 'neutral' },
    ],
    sandboxes,
  }
}
