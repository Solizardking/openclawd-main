#!/usr/bin/env node
/**
 * 🦞 ClawdRouter — The LLM Router Built for Autonomous Solana Agents
 *
 * Solana-native smart LLM routing with:
 * • 15-dimension request scoring (<1ms, fully local)
 * • 55+ models across 9 providers
 * • Ed25519 wallet-based authentication (no API keys)
 * • USDC micropayments via x402 protocol on Solana
 * • OpenAI-compatible API proxy on localhost:8402
 *
 * Part of the solana-clawd ecosystem
 * https://github.com/x402agent/solana-clawd
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { ClawdRouterConfig, RoutingProfile } from './types.js';
import { ClawdRouterProxy } from './proxy/server.js';
import { startTailscale, type TailscaleHandle, type TailscaleMode } from './tailscale/serve.js';
import { enrollFromUrl } from './device/enroll.js';
import { devicePath, loadDeviceConfig } from './device/config.js';
import { TunnelSpoke, type SpokeHttpRequest, type SpokeHttpResponse, type StreamSender } from './tunnel/spoke.js';
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { loadOrCreateWallet, formatWalletInfo, getBalance } from './wallet/solana.js';
import { MODEL_REGISTRY, formatModelTable } from './models/registry.js';
import { formatProfileTable } from './router/profiles.js';
import { getTierCostBreakdown } from './router/tiers.js';
import { scoreRequest } from './router/scorer.js';
import { CLAWD_TOKEN_MINT } from './token/clawd-gate.js';
import { LOBSTER_BANNER, showLobsterBanner, showLobsterWelcome } from './utils/lobster-ascii.js';

// ── Default Configuration ───────────────────────────────────────────

/**
 * Fallback loader for provider keys stored in the clawd-code-cli's
 * ~/.clawd/user-settings.json. Lets the daemon pick up an OPENROUTER_API_KEY
 * set via `clawd` without requiring a shell export.
 */
function loadUserSettingsProviderKey(provider: string): string {
  try {
    const raw = readFileSync(join(homedir(), '.clawd', 'user-settings.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { providers?: Record<string, { apiKey?: string }> };
    return parsed.providers?.[provider]?.apiKey ?? '';
  } catch {
    return '';
  }
}

function getDefaultConfig(): ClawdRouterConfig {
  const openRouterApiKey =
    process.env['OPENROUTER_API_KEY'] ??
    process.env['CLAWDROUTER_OPENROUTER_API_KEY'] ??
    loadUserSettingsProviderKey('openrouter');
  const openRouterEnabled =
    process.env['CLAWDROUTER_OPENROUTER_ENABLED'] === 'true' ||
    (process.env['CLAWDROUTER_OPENROUTER_ENABLED'] !== 'false' && openRouterApiKey.length > 0);

  return {
    port: parseInt(process.env['CLAWDROUTER_PORT'] ?? '8402', 10),
    profile: (process.env['CLAWDROUTER_PROFILE'] ?? 'auto') as RoutingProfile,
    solanaRpcUrl: process.env['CLAWDROUTER_SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com',
    network: (process.env['CLAWDROUTER_NETWORK'] ?? 'solana-mainnet') as 'solana-mainnet' | 'solana-devnet',
    maxPerRequest: parseFloat(process.env['CLAWDROUTER_MAX_PER_REQUEST'] ?? '0.10'),
    maxPerSession: parseFloat(process.env['CLAWDROUTER_MAX_PER_SESSION'] ?? '5.00'),
    walletPath: join(homedir(), '.clawd', 'clawdrouter', 'wallet.json'),
    excludedModels: [],
    debug: process.env['CLAWDROUTER_DEBUG'] === 'true',
    upstreamUrl: process.env['CLAWDROUTER_UPSTREAM'] ?? 'https://api.blockrun.ai',
    clawdTokenMint: process.env['CLAWDROUTER_CLAWD_TOKEN_MINT'] ?? CLAWD_TOKEN_MINT,
    heliusApiKey: process.env['HELIUS_API_KEY'] ?? process.env['CLAWDROUTER_HELIUS_API_KEY'] ?? '',
    holderThresholds: {
      whale: parseFloat(process.env['CLAWDROUTER_WHALE_THRESHOLD'] ?? '1000000'),
      diamond: parseFloat(process.env['CLAWDROUTER_DIAMOND_THRESHOLD'] ?? '100000'),
      holder: parseFloat(process.env['CLAWDROUTER_HOLDER_THRESHOLD'] ?? '1000'),
    },
    openRouterApiKey,
    openRouterSiteTitle: process.env['CLAWDROUTER_OPENROUTER_SITE_TITLE'] ?? 'ClawdRouter',
    openRouterSiteUrl: process.env['CLAWDROUTER_OPENROUTER_SITE_URL'] ?? 'https://solanaclawd.com',
    openRouterCategories: (process.env['CLAWDROUTER_OPENROUTER_CATEGORIES'] ?? 'cli-agent,cloud-agent').split(',').map(s => s.trim()),
    openRouterEnabled,
    x402PayTo: process.env['CLAWDROUTER_X402_PAY_TO'] ?? '',
    x402Price: process.env['CLAWDROUTER_X402_PRICE'] ?? '10000',
    x402Description: process.env['CLAWDROUTER_X402_DESCRIPTION'] ?? 'ClawdRouter access',
    localEnabled: process.env['CLAWDROUTER_LOCAL_ENABLED'] !== 'false',
    localOllamaBaseUrl:
      process.env['CLAWDROUTER_OLLAMA_BASE_URL'] ??
      process.env['OLLAMA_BASE_URL'] ??
      'http://127.0.0.1:11434/v1',
    localOllamaApiKey:
      process.env['CLAWDROUTER_OLLAMA_API_KEY'] ?? process.env['OLLAMA_API_KEY'] ?? '',
    localLlamacppBaseUrl:
      process.env['CLAWDROUTER_LLAMACPP_BASE_URL'] ??
      process.env['LLAMACPP_BASE_URL'] ??
      'http://127.0.0.1:8080/v1',
    localLlamacppApiKey:
      process.env['CLAWDROUTER_LLAMACPP_API_KEY'] ?? process.env['LLAMACPP_API_KEY'] ?? '',
    // Default to `all` in hosted mode (fly.io proxy needs 0.0.0.0 to route
     // traffic into the container); loopback elsewhere for local safety.
     bind: (() => {
       const explicit = process.env['CLAWDROUTER_BIND'];
       if (explicit === 'all' || explicit === 'loopback') return explicit;
       const isHosted = process.env['CLAWDROUTER_HOSTED'] === 'true' || !!process.env['FLY_APP_NAME'];
       return isHosted ? 'all' : 'loopback';
     })(),
    tailscale: {
      mode: ((process.env['CLAWDROUTER_TAILSCALE_MODE'] ?? 'off') as TailscaleMode),
      resetOnExit: process.env['CLAWDROUTER_TAILSCALE_RESET_ON_EXIT'] !== 'false',
    },
    hub: {
      enabled: process.env['CLAWDROUTER_HUB_ENABLED'] === 'true',
      controlUrl: process.env['CLAWDROUTER_CONTROL_URL'] ?? 'https://clawdrouter.x402.workers.dev',
      hubSecret: process.env['CLAWDROUTER_HUB_SECRET'] ?? '',
      path: process.env['CLAWDROUTER_HUB_PATH'] ?? '/v1/tunnel/connect',
      heartbeatMs: parseInt(process.env['CLAWDROUTER_HUB_HEARTBEAT_MS'] ?? '30000', 10),
      cacheTtlMs: parseInt(process.env['CLAWDROUTER_HUB_CACHE_TTL_MS'] ?? '300000', 10),
    },
  };
}

// ── Load Excluded Models ────────────────────────────────────────────

async function loadExcludedModels(): Promise<string[]> {
  try {
    const path = join(homedir(), '.clawd', 'clawdrouter', 'exclude-models.json');
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── CLI Entry Point ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  // Sub-commands
  if (command === 'doctor') {
    await runDoctor(args.slice(1));
    return;
  }

  if (command === 'models') {
    console.log(formatModelTable());
    return;
  }

  if (command === 'tiers') {
    console.log(getTierCostBreakdown());
    return;
  }

  if (command === 'profiles') {
    console.log(formatProfileTable());
    return;
  }

  if (command === 'score') {
    const text = args.slice(1).join(' ') || 'Hello, world!';
    const scored = scoreRequest([{ role: 'user', content: text }]);
    console.log('\n  🧠 Request Score Analysis');
    console.log('  ═══════════════════════════════════════');
    console.log(`  Input:    "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);
    console.log(`  Tier:     ${scored.tier}`);
    console.log(`  Score:    ${scored.totalScore.toFixed(4)}`);
    console.log(`  Reason:   ${scored.reasoning}`);
    console.log('');
    console.log('  Dimensions:');
    for (const [key, value] of Object.entries(scored.scores)) {
      const bar = '█'.repeat(Math.round(value * 20)).padEnd(20, '░');
      console.log(`    ${key.padEnd(22)} ${bar} ${(value * 100).toFixed(0)}%`);
    }
    console.log('');
    return;
  }

  if (command === 'wallet') {
    const wallet = await loadOrCreateWallet();
    const config = getDefaultConfig();
    const balance = await getBalance(wallet.publicKey, config);
    console.log(formatWalletInfo(wallet, balance));
    return;
  }

  if (command === 'enroll') {
    await runEnroll(args.slice(1));
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    console.log('clawdrouter v0.1.0');
    return;
  }

  // Spoke mode: if --tunnel is passed or a device config exists on disk,
  // run as a tunnel spoke instead of the local HTTP proxy. Explicit flag
  // wins so `--no-tunnel` can skip even when a config is present.
  const wantTunnel =
    args.includes('--tunnel') ||
    (!args.includes('--no-tunnel') && (await loadDeviceConfig()) !== null);
  if (wantTunnel) {
    await startSpoke();
    return;
  }

  // Default: start the proxy server
  await startServer();
}

// ── Enroll sub-command ─────────────────────────────────────────────

async function runEnroll(args: string[]): Promise<void> {
  const force = args.includes('--force');
  const url = args.find((a) => !a.startsWith('--'));
  if (!url) {
    console.error('usage: clawdrouter enroll <enrollment-url> [--force]');
    process.exit(2);
  }
  try {
    const cfg = await enrollFromUrl(url, { force });
    console.log('');
    console.log('  ✓ Enrolled successfully');
    console.log(`    Tunnel:   ${cfg.tunnelUrl}`);
    console.log(`    Device:   ${cfg.deviceLabel ?? '(unlabeled)'}`);
    console.log(`    Config:   ${devicePath()}`);
    console.log('');
    console.log('  Start the tunnel with:  clawdrouter');
    console.log('');
  } catch (err) {
    console.error(`  ✗ ${(err as Error).message}`);
    process.exit(1);
  }
}

// ── Spoke mode (persistent tunnel) ─────────────────────────────────

async function startSpoke(): Promise<void> {
  console.log(LOBSTER_BANNER);
  const cfg = await loadDeviceConfig();
  if (!cfg) {
    console.error('  ✗ No device config found. Run: clawdrouter enroll <url>');
    process.exit(1);
  }

  // Default upstream is local Ollama; overridable via env just like server mode.
  const ollamaBase = (process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434/v1').replace(/\/v1$/, '');

  const handler = async (req: SpokeHttpRequest, send: StreamSender): Promise<void> => {
    await forwardToLocal(req, ollamaBase, send);
  };

  const spoke = new TunnelSpoke({
    tunnelUrl: cfg.tunnelUrl,
    apiKey: cfg.apiKey,
    handler,
    logger: (msg, meta) => console.log(`  [tunnel] ${msg}`, meta ?? ''),
    onConnect: (hello) => {
      console.log('');
      console.log(`  ✓ Connected to hub as tenant ${String(hello['tenantId'] ?? '?')}`);
      console.log(`    Local upstream:  ${ollamaBase}`);
      console.log('');
      console.log('  Press Ctrl+C to stop');
    },
  });

  console.log(`  🔗 Dialing hub: ${cfg.tunnelUrl}`);
  spoke.start();

  const shutdown = async () => {
    console.log('\n  🛑 Closing tunnel...');
    await spoke.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ── Spoke-side HTTP dispatcher ─────────────────────────────────────
//
// Bridges hub `req` frames to whatever's running on the customer's
// machine. v1 routes everything under `/v1/local/*` to Ollama's native
// API by rewriting paths (`/v1/local/models` → Ollama `/api/tags`,
// `/v1/local/chat/completions` → Ollama `/v1/chat/completions`).

async function forwardToLocal(
  req: SpokeHttpRequest,
  ollamaBase: string,
  send: StreamSender,
): Promise<void> {
  // Strip query string for routing, keep for forwarding.
  const qIdx = req.path.indexOf('?');
  const pathname = qIdx >= 0 ? req.path.slice(0, qIdx) : req.path;
  const query = qIdx >= 0 ? req.path.slice(qIdx) : '';

  let upstreamPath: string;
  if (pathname === '/v1/local/models' || pathname === '/local/models') {
    await listOllamaModels(ollamaBase, send);
    return;
  }
  if (pathname.startsWith('/v1/local/chat/completions') || pathname.startsWith('/local/chat/completions')) {
    upstreamPath = '/v1/chat/completions';
  } else if (pathname.startsWith('/v1/local/')) {
    upstreamPath = '/v1/' + pathname.slice('/v1/local/'.length);
  } else {
    sendJson(send, 404, { error: 'not_a_local_path', path: pathname });
    return;
  }

  const upstream = new URL(ollamaBase + upstreamPath + query);
  const headers: Record<string, string> = { ...req.headers };
  // Strip hop-by-hop + host headers that would confuse the upstream.
  delete headers['host'];
  delete headers['authorization']; // our auth doesn't propagate to Ollama
  delete headers['content-length']; // node sets this for us

  await pipeUpstream(upstream, req.method, headers, req.body, send);
}

async function listOllamaModels(base: string, send: StreamSender): Promise<void> {
  const url = new URL(base + '/api/tags');
  try {
    const res = await collectUpstream(url, 'GET', {}, undefined);
    if (res.status !== 200) {
      send.respond(res.status, res.headers, res.body);
      return;
    }
    const parsed = JSON.parse((res.body ?? Buffer.alloc(0)).toString('utf8')) as {
      models?: Array<{ name: string; size?: number; details?: { parameter_size?: string; quantization_level?: string } }>;
    };
    const data = (parsed.models ?? []).map((m) => ({
      id: `ollama/${m.name}`,
      object: 'model',
      x_local: {
        name: m.name,
        target: 'ollama' as const,
        parameterSize: m.details?.parameter_size,
        quantization: m.details?.quantization_level,
        sizeBytes: m.size,
      },
    }));
    sendJson(send, 200, { object: 'list', data, source: 'ollama' });
  } catch (err) {
    sendJson(send, 502, { error: 'ollama_unreachable', message: (err as Error).message });
  }
}

function sendJson(send: StreamSender, status: number, body: unknown): void {
  send.respond(status, { 'content-type': 'application/json' }, Buffer.from(JSON.stringify(body), 'utf8'));
}

/**
 * Pipe an upstream HTTP response into the tunnel. If the upstream uses chunked
 * transfer, SSE (text/event-stream), or the client requested streaming
 * (`stream:true` in the body), we switch to streaming mode and forward each
 * chunk as it arrives. Otherwise we buffer and send a single res frame — same
 * behavior as before.
 */
function pipeUpstream(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
  send: StreamSender,
): Promise<void> {
  const wantsStreaming = detectStreamingRequest(body);
  return new Promise((resolve) => {
    const upstreamReq = httpRequest({
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers,
    }, (res) => {
      const status = res.statusCode ?? 0;
      const respHeaders = flattenHeaders(res.headers);
      const stream =
        wantsStreaming ||
        (respHeaders['content-type'] ?? '').includes('text/event-stream') ||
        respHeaders['transfer-encoding'] === 'chunked';

      if (stream) {
        send.start(status, respHeaders);
        res.on('data', (c: Buffer) => send.chunk(c));
        res.on('end', () => { send.end(); resolve(); });
        res.on('error', () => { send.end(); resolve(); });
      } else {
        accumulateAndRespond(res, status, respHeaders, send, resolve);
      }
    });
    upstreamReq.on('error', (err) => {
      if (!send.closed) sendJson(send, 502, { error: 'upstream_error', message: err.message });
      resolve();
    });
    if (body) upstreamReq.write(body);
    upstreamReq.end();
  });
}

function accumulateAndRespond(
  res: IncomingMessage,
  status: number,
  headers: Record<string, string>,
  send: StreamSender,
  resolve: () => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => {
    send.respond(status, headers, chunks.length ? Buffer.concat(chunks) : undefined);
    resolve();
  });
  res.on('error', () => {
    if (!send.closed) send.respond(status, headers);
    resolve();
  });
}

function detectStreamingRequest(body: Buffer | undefined): boolean {
  if (!body) return false;
  try {
    const text = body.toString('utf8');
    if (!text.includes('"stream"')) return false;
    const parsed = JSON.parse(text) as { stream?: unknown };
    return parsed.stream === true;
  } catch {
    return false;
  }
}

/** Small helper kept for enroll + listOllamaModels single-shot upstream calls. */
function collectUpstream(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
): Promise<SpokeHttpResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: flattenHeaders(res.headers),
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function flattenHeaders(h: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (Array.isArray(v)) out[k] = v.join(', ');
    else if (typeof v === 'string') out[k] = v;
  }
  return out;
}

// ── Start Proxy Server ──────────────────────────────────────────────

async function startServer(): Promise<void> {
  console.log(LOBSTER_BANNER);

  const config = getDefaultConfig();
  config.excludedModels = await loadExcludedModels();

  // Load or create wallet
  console.log('  🔑 Loading Solana wallet...');
  const wallet = await loadOrCreateWallet();
  console.log(`  ✓ Wallet: ${wallet.publicKey}`);

  // Check balance
  try {
    const balance = await getBalance(wallet.publicKey, config);
    console.log(`  ✓ Balance: ${balance.sol.toFixed(4)} SOL | $${balance.usdc.toFixed(2)} USDC`);

    if (balance.usdc < 0.01) {
      console.log('');
      console.log('  ⚠️  Low USDC balance. Send USDC on Solana to:');
      console.log(`     ${wallet.publicKey}`);
      console.log('     $5 covers thousands of requests.');
      console.log('');
    }
  } catch {
    console.log('  ⚠ Could not check balance (RPC unavailable)');
  }

  // Start proxy
  console.log('');
  console.log(`  🚀 Starting proxy on http://localhost:${config.port}`);
  console.log(`  ⚡ Profile: ${config.profile.toUpperCase()}`);
  console.log(`  📡 Network: ${config.network}`);
  console.log(`  🧠 Models:  ${MODEL_REGISTRY.filter(m => m.enabled).length} enabled`);

  if (config.excludedModels.length > 0) {
    console.log(`  🚫 Excluded: ${config.excludedModels.join(', ')}`);
  }

  // Funnel (public HTTPS) requires API-key auth to avoid accidental public exposure.
  if (config.tailscale.mode === 'funnel' && process.env['CLAWDROUTER_REQUIRE_AUTH'] !== 'true') {
    throw new Error(
      'tailscale.mode=funnel exposes the router publicly and refuses to start without ' +
      'CLAWDROUTER_REQUIRE_AUTH=true. Use mode=serve for tailnet-only access instead.'
    );
  }

  const proxy = new ClawdRouterProxy(config, wallet);
  await proxy.start();

  let tailscale: TailscaleHandle | null = null;
  if (config.tailscale.mode !== 'off') {
    try {
      tailscale = await startTailscale({
        mode: config.tailscale.mode,
        port: config.port,
        resetOnExit: config.tailscale.resetOnExit,
      });
      if (tailscale) {
        console.log(`  🔗 Tailscale ${tailscale.mode}: ${tailscale.url}`);
      }
    } catch (err) {
      console.error(`  ✗ Tailscale ${config.tailscale.mode} failed:`, (err as Error).message);
      await proxy.stop();
      process.exit(1);
    }
  }

  const publicUrl = tailscale?.url ?? `http://localhost:${config.port}`;

  console.log('');
  console.log('  ════════════════════════════════════════════════════════');
  console.log('  ✓ ClawdRouter is running!');
  console.log('');
  console.log('  Point your client at:');
  console.log(`    Base URL:  ${publicUrl}`);
  console.log('    API Key:   x402');
  console.log('    Model:     clawdrouter/auto');
  console.log('');
  console.log('  Example (Python):');
  console.log(`    client = OpenAI(base_url="${publicUrl}", api_key="x402")`);
  console.log('    client.chat.completions.create(model="clawdrouter/auto", messages=[...])');
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('  ════════════════════════════════════════════════════════');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n  🛑 Shutting down ClawdRouter...');
    const stats = proxy.getStats();
    console.log(`  📊 Session: ${stats.totalRequests} requests | $${stats.totalCostUSDC.toFixed(4)} spent | $${stats.totalSavedUSDC.toFixed(4)} saved`);
    if (tailscale) await tailscale.cleanup();
    await proxy.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ── Doctor Command ──────────────────────────────────────────────────

async function runDoctor(args: string[]): Promise<void> {
  console.log('');
  console.log('  🩺 ClawdRouter Doctor v0.1.0');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('');

  // System
  console.log('  System');
  console.log(`    ✓ OS: ${process.platform} ${process.arch}`);
  console.log(`    ✓ Node: ${process.version}`);
  console.log('');

  // Wallet
  const wallet = await loadOrCreateWallet();
  console.log('  Wallet');
  console.log(`    ✓ Address: ${wallet.publicKey}`);

  const config = getDefaultConfig();
  try {
    const balance = await getBalance(wallet.publicKey, config);
    console.log(`    ✓ SOL: ${balance.sol.toFixed(4)}`);
    console.log(`    ${balance.usdc > 0.01 ? '✓' : '✗'} USDC: $${balance.usdc.toFixed(2)}`);
  } catch {
    console.log('    ✗ Could not check balance');
  }
  console.log('');

  // Network
  console.log('  Network');
  try {
    const resp = await fetch(`${config.upstreamUrl}/health`, { signal: AbortSignal.timeout(5000) });
    console.log(`    ✓ Upstream API: reachable (${resp.status})`);
  } catch {
    console.log('    ✗ Upstream API: unreachable');
  }

  try {
    const resp = await fetch(`http://localhost:${config.port}/health`, { signal: AbortSignal.timeout(2000) });
    console.log(`    ✓ Local proxy: running on :${config.port}`);
  } catch {
    console.log(`    ✗ Local proxy: not running on :${config.port}`);
  }

  // RPC
  try {
    const resp = await fetch(config.solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      signal: AbortSignal.timeout(5000),
    });
    console.log(`    ✓ Solana RPC: reachable`);
  } catch {
    console.log('    ✗ Solana RPC: unreachable');
  }
  console.log('');

  // Models
  console.log('  Models');
  console.log(`    ✓ Registry: ${MODEL_REGISTRY.length} models`);
  console.log(`    ✓ Free: ${MODEL_REGISTRY.filter(m => m.free).length} models`);
  console.log(`    ✓ Providers: ${new Set(MODEL_REGISTRY.map(m => m.provider)).size}`);
  console.log('');

  // Question
  if (args.length > 0) {
    const question = args.join(' ');
    console.log(`  📤 Question: "${question}"`);
    console.log('  (AI analysis would require upstream connection)');
  }

  console.log('  ═══════════════════════════════════════════════════════');
}

// ── Help ────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
  ClawdRouter — The LLM Router Built for Autonomous Solana Agents

  USAGE:
    clawdrouter                 Start the proxy server (default)
    clawdrouter doctor          Run diagnostics
    clawdrouter models          List all models and pricing
    clawdrouter tiers           Show tier cost breakdown
    clawdrouter profiles        Show routing profiles
    clawdrouter score <text>    Score a request (test the classifier)
    clawdrouter wallet          Show wallet info and balance
    clawdrouter help            Show this help
    clawdrouter version         Show version

  ENVIRONMENT:
    CLAWDROUTER_PORT            Proxy port (default: 8402)
    CLAWDROUTER_PROFILE         Routing profile: auto|eco|premium (default: auto)
    CLAWDROUTER_SOLANA_RPC_URL  Solana RPC endpoint
    CLAWDROUTER_NETWORK         Network: solana-mainnet|solana-devnet
    CLAWDROUTER_MAX_PER_REQUEST Max USDC per request (default: 0.10)
    CLAWDROUTER_MAX_PER_SESSION Max USDC per session (default: 5.00)
    CLAWDROUTER_DEBUG           Enable debug logging (true/false)
    CLAWDROUTER_UPSTREAM        Upstream API URL

  EXAMPLES:
    # Start with default settings
    clawdrouter

    # Score a test request
    clawdrouter score "Write a Solana program for token staking"

    # List all models
    clawdrouter models

    # Run diagnostics
    clawdrouter doctor
  `);
}

// ── Run ─────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('  ✗ Fatal error:', err.message);
  process.exit(1);
});
