import { describe, expect, test } from 'vitest'
import {
  API_ENDPOINTS,
  ECOSYSTEM_LINK_KEYS,
  LEGACY_PATHS,
  REQUIRED_FEATURE_PATHS,
  allPaths,
  findEndpoint,
  pollPaths,
} from './registry'
import {
  mapCouncil,
  mapDoctor,
  mapE2BComputer,
  mapEcosystem,
  mapHealth,
  mapLaws,
  decodeLifeCells,
  mapLife,
  mapMiddleout,
  mapOptimize,
  mapPortfolio,
  mapRhReadiness,
  mapSize,
  mapTrending,
  mapVaultStatus,
  mapVenues,
} from './mappers'

describe('API registry', () => {
  test('registers required feature paths for the upgraded console', () => {
    const paths = new Set(allPaths())
    for (const p of REQUIRED_FEATURE_PATHS) {
      expect(paths.has(p), `missing required path ${p}`).toBe(true)
    }
  })

  test('keeps legacy surfaces wired', () => {
    const paths = new Set(allPaths())
    for (const p of LEGACY_PATHS) {
      expect(paths.has(p), `missing legacy path ${p}`).toBe(true)
    }
  })

  test('poll paths are a non-empty subset of all paths', () => {
    const all = new Set(allPaths())
    const poll = pollPaths()
    expect(poll.length).toBeGreaterThan(10)
    for (const p of poll) {
      expect(all.has(p)).toBe(true)
    }
  })

  test('every endpoint has unique id and absolute /api path', () => {
    const ids = new Set<string>()
    for (const e of API_ENDPOINTS) {
      expect(e.path.startsWith('/api/')).toBe(true)
      expect(ids.has(e.id)).toBe(false)
      ids.add(e.id)
      expect(findEndpoint(e.id)?.path).toBe(e.path)
    }
  })

  test('registers E2B computer on the compute poll set', () => {
    expect(findEndpoint('e2bComputer')?.path).toBe('/api/e2b/computer')
    expect(findEndpoint('e2bComputer')?.group).toBe('compute')
    expect(pollPaths()).toContain('/api/e2b/computer')
  })

  test('registers RH readiness + ecosystem contract keys for pkg/config surfaces', () => {
    expect(findEndpoint('rhReadiness')?.path).toBe('/api/rh/readiness')
    expect(ECOSYSTEM_LINK_KEYS).toContain('zero_clawd')
    expect(ECOSYSTEM_LINK_KEYS).toContain('agent_hub')
    expect(ECOSYSTEM_LINK_KEYS).toContain('cheshire_agents_npm')
    expect(ECOSYSTEM_LINK_KEYS).toContain('skillhub_repo')
  })
})

describe('display mappers', () => {
  test('mapLaws extracts law rows from backend shape', () => {
    const rows = mapLaws([
      { id: 'I', layer: 'on-chain', title: 'Never harm', text: 'Beach before you harm.' },
      { id: 'IV', layer: 'off-chain', title: 'Truth', text: 'Interpret carefully.' },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].primary).toContain('Never harm')
    expect(rows[0].badge).toBe('on-chain')
  })

  test('mapDoctor aggregates check statuses', () => {
    const d = mapDoctor({
      ok: false,
      checks: [
        { id: 'runtime', label: 'Runtime', status: 'pass', message: 'ok' },
        { id: 'laws', label: 'Laws', status: 'warn', message: 'soft' },
        { id: 'cfg', label: 'Config', status: 'fail', message: 'missing' },
      ],
    })
    expect(d.ok).toBe(false)
    expect(d.metrics.find((m) => m.label === 'Fail')?.value).toBe('1')
    expect(d.rows).toHaveLength(3)
    expect(d.rows[2].tone).toBe('err')
  })

  test('mapPortfolio surfaces guard verdict from real payload shape', () => {
    const p = mapPortfolio({
      limits: { maxConcurrent: 3, maxTotalExposure: 10, maxPerAsset: 2, maxDrawdownPct: 0.15, dailyLossLimitPct: 0.05 },
      candidate: { asset: 'SOL', sizeSol: 1.5 },
      guard: { allowed: true, reasons: [] },
    })
    expect(p.allowed).toBe(true)
    expect(p.metrics.find((m) => m.label === 'Guard')?.value).toBe('ALLOWED')
    expect(p.metrics.find((m) => m.label === 'Max concurrent')?.value).toBe('3')
  })

  test('mapOptimize reports overfit delta', () => {
    const m = mapOptimize({
      evaluated: 12,
      inSampleScore: 1.2,
      outSampleScore: 0.4,
      overfit: 0.8,
      best: { emaFastPeriod: 8, emaSlowPeriod: 21 },
      outSample: { winRate: 0.55, totalReturn: 0.1 },
    })
    expect(m.find((x) => x.label === 'Evaluated')?.value).toBe('12')
    expect(m.find((x) => x.label === 'Overfit Δ')?.tone).toBe('warn')
  })

  test('mapVenues and mapTrending degrade cleanly', () => {
    const venues = mapVenues({
      venues: [{ name: 'Aster DEX', kind: 'onchain_perps', status: 'configured' }],
    })
    expect(venues[0].primary).toBe('Aster DEX')
    expect(venues[0].tone).toBe('ok')

    const bad = mapTrending({ ok: false, error: 'BIRDEYE_API_KEY not configured' })
    expect(bad.ok).toBe(false)
    expect(bad.error).toMatch(/BIRDEYE/)
    expect(bad.rows).toHaveLength(0)
  })

  test('mapSize / mapMiddleout / mapLife / mapVault / mapCouncil / mapHealth', () => {
    expect(mapSize({ files: 10, rawMB: 1.2, underTarget: true, weissmanScore: 3.1, verdict: 'tight' })[0].value).toBe(
      '10',
    )
    expect(mapMiddleout({ cache: { entries: 2, hitRate: 0.5, rawBytes: 2048, compressedBytes: 512 } })[0].value).toBe(
      '2',
    )
    const life = mapLife({
      rows: 2,
      cols: 2,
      gen: 5,
      population: 2,
      cells: [
        [0, 1],
        [1, 0],
      ],
    })
    expect(life.metrics.find((m) => m.label === 'Generation')?.value).toBe('5')
    expect(life.cells).toHaveLength(2)

    // Go json-encodes [][]uint8 as base64 per row
    const b64row = Buffer.from(Uint8Array.from([0, 1, 0, 1])).toString('base64')
    const decoded = decodeLifeCells([b64row, b64row])
    expect(decoded[0]).toEqual([0, 1, 0, 1])
    const lifeB64 = mapLife({ rows: 2, cols: 4, gen: 1, population: 4, cells: [b64row, b64row] })
    expect(lifeB64.cells[1][1]).toBe(1)

    const vault = mapVaultStatus({ enabled: true, keys: 3, source: 'env', clientIpAllowed: true })
    expect(vault.find((m) => m.label === 'Key count')?.value).toBe('3')

    const council = mapCouncil({ count: 1, members: [{ name: 'Clawd', role: 'chair' }] })
    expect(council.rows[0].primary).toBe('Clawd')

    const health = mapHealth({
      status: 'ok',
      agent: 'Clawd Bot',
      package: 'clawdbot-go',
      product: 'https://cheshireterminal.ai/zeroclawd',
    })
    expect(health.ok).toBe(true)
    expect(health.agent).toBe('Clawd Bot')
    expect(health.packageName).toBe('clawdbot-go')
    expect(health.product).toContain('zeroclawd')
    expect(health.label).toContain('Clawd Bot')
  })

  test('mapEcosystem orders product surfaces from pkg/config keys', () => {
    const rows = mapEcosystem({
      skillhub_repo: 'https://github.com/Solizardking/skillhub-main',
      zero_clawd: 'https://cheshireterminal.ai/zeroclawd',
      agent_hub: 'https://cheshireterminal.ai/agents',
      runtime_repo: 'https://github.com/Solizardking/Zero-Bruh',
      terminal: 'https://cheshireterminal.ai',
      hub_repo: 'https://github.com/solizardking/solana-clawd',
      gateway: 'https://zk.x402.wtf',
      agent_forge: 'https://cheshireterminal.ai/agents/forge',
      cheshire_agents_npm: 'https://www.npmjs.com/package/cheshire-terminal-agents',
      cheshire_agents_repo: 'https://github.com/Solizardking/Cheshire-Terminal-Agents',
    })
    expect(rows[0].primary).toBe('Clawd Bot')
    expect(rows[0].secondary).toContain('zeroclawd')
    expect(rows.find((r) => r.key === 'agent_hub')?.secondary).toContain('/agents')
    expect(rows.find((r) => r.key === 'cheshire_agents_npm')?.secondary).toContain(
      'cheshire-terminal-agents',
    )
    for (const key of ECOSYSTEM_LINK_KEYS) {
      expect(rows.some((r) => r.key === key), `missing ecosystem key ${key}`).toBe(true)
    }
  })

  test('mapRhReadiness maps pkg/rh AssessReadiness shape', () => {
    const gated = mapRhReadiness({
      ready: false,
      chainId: 4663,
      blockscoutConfigured: true,
      rhRpcConfigured: false,
      usingPublicRpcRead: true,
      missing: ['RH_RPC_URL'],
      resolvedRpc: '<configured>',
      message: 'RH_RPC_URL unset — public read RPC only (not deploy-safe)',
    })
    expect(gated.ready).toBe(false)
    expect(gated.metrics.find((m) => m.label === 'Ready')?.value).toBe('NO')
    expect(gated.metrics.find((m) => m.label === 'Chain')?.value).toBe('4663')
    expect(gated.rows.some((r) => r.primary === 'RH_RPC_URL')).toBe(true)

    const ready = mapRhReadiness({
      ready: true,
      chainId: 4663,
      blockscoutConfigured: true,
      rhRpcConfigured: true,
      usingPublicRpcRead: false,
      message: 'configured',
    })
    expect(ready.ready).toBe(true)
    expect(ready.metrics.find((m) => m.label === 'Ready')?.tone).toBe('ok')
  })

  test('mapE2BComputer never surfaces tokens and degrades without a key', () => {
    const empty = mapE2BComputer(null)
    expect(empty.keySet).toBe(false)
    expect(empty.alias).toBe('clawdbot-computer')
    expect(empty.metrics.find((m) => m.label === 'Key')?.tone).toBe('err')
    expect(empty.sandboxes).toHaveLength(0)

    const live = mapE2BComputer({
      keySet: true,
      npmSpec: 'clawdbot-go@latest',
      template: { alias: 'clawdbot-computer', startPort: 8787 },
      envdAccessToken: 'should-not-leak',
      token: 'nope',
      sandboxes: [
        { sandboxId: 'sbx_desk01', state: 'running', computerUrl: 'https://8787-sbx_desk01.e2b.app' },
        { state: 'running' },
      ],
    })
    expect(live.keySet).toBe(true)
    expect(live.metrics.find((m) => m.label === 'Desks')?.value).toBe('1')
    expect(live.sandboxes).toHaveLength(1)
    expect(live.sandboxes[0].sandboxId).toBe('sbx_desk01')
    expect(JSON.stringify(live)).not.toMatch(/should-not-leak|nope/)
  })
})
