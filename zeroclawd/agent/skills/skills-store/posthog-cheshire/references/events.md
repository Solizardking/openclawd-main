# Cheshire PostHog — product events

Use **snake_case** names. Prefer properties that are non-PII or already public (mint, room id, agent id). Never send private keys, seed phrases, full `ct_sk_` keys, or raw wallet private material.

## Auth / session

| Event | Where | Properties (typical) |
|-------|-------|----------------------|
| `wallet_connected` | `server/routes/auth.ts` | wallet, method |
| `wallet_disconnected` | `server/routes/auth.ts` | wallet |

Browser also `identifyWallet(wallet)` so subsequent events attach to the person.

## Agents

| Event | Where | Notes |
|-------|-------|-------|
| `agent_created` | `server/routes/agents.ts` | agent id / template |
| `agent_invoked` | `server/routes/agents.ts` | invoke path |
| `user-agent-register` | `server/routes/user-agents.ts` | registration |
| `metaplex-agent-mint` | `server/routes/metaplex-agents.ts` | mint flow |

## Pump.fun

| Event | Where |
|-------|-------|
| `pump_token_launched` | `server/routes/pump.ts` |
| `pump_trade_built` | `server/routes/pump.ts` |
| `pump_transaction_submitted` | `server/routes/pump.ts` |

## DBC / launchpad

| Event | Where |
|-------|-------|
| `dbc_token_launched` | `server/routes/dbc-launch.ts` |
| `dbc_swap_built` | `server/routes/dbc-launch.ts` |
| `dbc_transaction_submitted` | `server/routes/dbc-launch.ts` |
| `dbc_pool_migrated` | `server/routes/dbc-launch.ts` |

## Staking / NFTs

| Event | Where |
|-------|-------|
| `nft_staked` | `server/routes/staking.ts` |
| `nft_unstaked` | `server/routes/staking.ts` |

## Chat / social

| Event | Where |
|-------|-------|
| `chat_room_created` | `server/routes/chat.ts` |

## Client-only / SPA

| Event | Where | Notes |
|-------|-------|-------|
| `$pageview` | `capturePageView()` | path, title, $current_url |
| Autocapture | posthog-js | only when analytics opted in |
| Skills UI | `googleAnalytics.trackEvent` | some skills catalog clicks use GA — prefer PostHog `captureEvent` for new work |

## Super properties (browser)

Registered at init:

```ts
{
  app: "cheshire-terminal",
  surface: "web",
  privacy_mode: "cookieless",
  anti_pump_tracking: true,
}
```

## Adding a new event

1. Pick a stable snake_case name
2. Capture only after success (or intentional failure analytics)
3. Set `distinctId` = wallet or API principal id
4. Document the event in this file
5. Avoid high-cardinality free text (paste full prompts only if redacted)

## Exceptions

Server uses `enableExceptionAutocapture: true` on posthog-node. Prefer `posthog.captureException(error, distinctId, props)` for handled domain failures (see staking).
