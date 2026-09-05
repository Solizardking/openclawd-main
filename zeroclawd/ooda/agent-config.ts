/**
 * ooda/agent-config.ts — Agent configuration schema + validation
 *
 * Shared by the TypeScript harness and any Node-side service wrappers.
 * Mirrors pkg/ooda.AgentConfig so the Go 24/7 service and TS harness agree.
 */

export type RpcMode = 'public' | 'private';

export const KNOWN_PROVIDERS = [
  'deterministic',
  'xai',
  'grok',
  'openai',
  'anthropic',
  'deepseek',
  'zkrouter',
  'openrouter',
] as const;

export type Provider = (typeof KNOWN_PROVIDERS)[number];

export interface AgentConfig {
  name: string;
  provider: string;
  token: string;
  rpcMode: RpcMode;
  /** Number of tokens the agent aims to buy per open decision (paper scale). */
  buyAmount: number;
  wallet?: string;
  rpcUrl?: string;
  ticks?: number;
  sleepMs?: number;
  seed?: number;
}

export function validateAgentConfig(cfg: unknown): { ok: true; config: AgentConfig } | { ok: false; error: string } {
  if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
    return { ok: false, error: 'config must be an object' };
  }
  const c = cfg as Record<string, unknown>;

  const name = String(c['name'] ?? '').trim();
  if (!name) return { ok: false, error: 'name is required' };
  if (name.length > 64) return { ok: false, error: 'name must be at most 64 characters' };

  const provider = String(c['provider'] ?? '').trim().toLowerCase();
  if (!provider) return { ok: false, error: 'provider is required' };
  if (!(KNOWN_PROVIDERS as readonly string[]).includes(provider)) {
    return { ok: false, error: `provider "${provider}" is not supported; use one of: ${KNOWN_PROVIDERS.join(', ')}` };
  }

  const token = String(c['token'] ?? '').trim();
  if (!token) return { ok: false, error: 'token is required' };
  if (token.length > 128) return { ok: false, error: 'token must be at most 128 characters' };

  const rpcMode = String(c['rpcMode'] ?? c['rpc_mode'] ?? '').trim().toLowerCase();
  if (!rpcMode) return { ok: false, error: 'rpcMode is required (public or private)' };
  if (rpcMode !== 'public' && rpcMode !== 'private') {
    return { ok: false, error: `rpcMode must be "public" or "private", got "${rpcMode}"` };
  }

  const buyAmount = Number(c['buyAmount'] ?? c['buy_amount'] ?? 0);
  if (!Number.isFinite(buyAmount) || buyAmount <= 0) {
    return { ok: false, error: 'buyAmount must be a positive number (tokens to buy)' };
  }
  if (buyAmount > 1_000_000_000) {
    return { ok: false, error: 'buyAmount exceeds maximum of 1e9' };
  }

  const wallet = String(c['wallet'] ?? '').trim();
  if (wallet && (wallet.length < 32 || wallet.length > 64)) {
    return { ok: false, error: 'wallet must be a base58 Solana public key (32-64 chars) when provided' };
  }

  const ticks = c['ticks'] === undefined ? undefined : Number(c['ticks']);
  if (ticks !== undefined && (!Number.isFinite(ticks) || ticks < 0)) {
    return { ok: false, error: 'ticks must be >= 0' };
  }

  const sleepMs = c['sleepMs'] === undefined && c['sleep_ms'] === undefined
    ? undefined
    : Number(c['sleepMs'] ?? c['sleep_ms']);
  if (sleepMs !== undefined && (!Number.isFinite(sleepMs) || sleepMs < 0)) {
    return { ok: false, error: 'sleepMs must be >= 0' };
  }

  return {
    ok: true,
    config: {
      name,
      provider,
      token,
      rpcMode: rpcMode as RpcMode,
      buyAmount,
      wallet: wallet || undefined,
      rpcUrl: String(c['rpcUrl'] ?? c['rpc_url'] ?? '').trim() || undefined,
      ticks: ticks,
      sleepMs: sleepMs,
      seed: c['seed'] === undefined ? 42 : Number(c['seed']) || 42,
    },
  };
}

/** Convert buyAmount (token units) into paper size_lamports, capped. */
export function buyAmountToLamports(buyAmount: number, max = 5_000_000): number {
  const size = Math.round(buyAmount * 1_000_000);
  if (size < 1) return 1;
  return Math.min(size, max);
}
