---
name: posthog-cheshire
description: >
  Instrument and operate PostHog analytics for Cheshire Terminal (US cloud project
  473072). Use when wiring posthog-js / posthog-node, cookieless privacy opt-in,
  wallet identify on SIWS, session replay, product events (wallet_connected, pump/dbc
  launches, agents, staking), or verifying capture to us.i.posthog.com.
license: MIT
version: "1.1.0"
compatibility: POSTHOG_API_KEY / VITE_POSTHOG_KEY optional (browser has default project key); network to us.i.posthog.com
metadata:
  author: cheshire-terminal
  version: "1.1.0"
  posthog_project_id: "473072"
  posthog_host: https://us.i.posthog.com
  homepage: https://us.posthog.com/project/473072
---

# PostHog for Cheshire Terminal

## Project

| Key | Value |
|-----|-------|
| Cloud | US `https://us.i.posthog.com` |
| Project ID | `473072` |
| Inbox | https://us.posthog.com/project/473072/inbox |
| Replay | Product Analytics → Session replay |

## Operating flow

1. Respect privacy first — no capture until analytics opt-in
2. Browser: `client/src/lib/posthog.ts` (cookieless memory persistence)
3. Server: `server/lib/posthog.ts` (`posthog-node`)
4. Identify wallet on connect **and** session restore
5. Capture named product events only (see events reference)
6. Verify in Network tab + PostHog Live events

Load details when needed:

- [references/events.md](references/events.md) — product event catalog
- [references/privacy.md](references/privacy.md) — cookieless + opt-in rules
- [scripts/check-posthog-env.sh](scripts/check-posthog-env.sh) — env readiness (no secret print)

## Env

```bash
POSTHOG_API_KEY=phc_...          # server (posthog-node)
POSTHOG_HOST=https://us.i.posthog.com
VITE_POSTHOG_KEY=phc_...         # browser (optional; client has project default)
VITE_POSTHOG_HOST=https://us.i.posthog.com
VITE_POSTHOG_DISABLED=true       # hard kill switch for browser
```

Never commit raw keys; never log them.

## Browser (posthog-js)

```ts
// client/src/lib/posthog.ts
posthog.init(key, {
  api_host: "https://us.i.posthog.com",
  defaults: "2026-05-30",
  person_profiles: "identified_only",
  capture_pageview: false,      // SPA pageviews via capturePageView()
  persistence: "memory",
  disable_persistence: true,
  opt_out_capturing_by_default: true,
  disable_session_recording: !allowReplay,
});
```

Helpers:

| Helper | When |
|--------|------|
| `initPostHog()` | App boot |
| `identifyWallet(address)` | SIWS connect + session restore |
| `capturePageView(path)` | SPA route change (if opted in) |
| `captureEvent(name, props)` | Product events |
| `resetPostHogIdentity()` | Logout / wallet disconnect |
| `applyPrivacyToPostHog()` | Privacy prefs changed |

## Server (posthog-node)

`server/lib/posthog.ts` — singleton with exception autocapture. Capture from routes after successful mutations (pump, dbc, agents, staking, auth). Always pass `distinctId` as wallet or stable principal — never raw secrets.

## Verify

1. Opt into analytics in privacy UI
2. Network → requests to `us.i.posthog.com`
3. Wallet connect → person identified by address
4. Session replay only if analytics **and** replay opted in
5. Live events: wallet_connected, pageviews, product actions

```bash
bash skills-store/posthog-cheshire/scripts/check-posthog-env.sh
```

## Rules

- Cookieless by default — no tracking cookies
- No capture without explicit analytics consent
- Do not attach private keys, seed phrases, full API keys, or raw JWT secrets to events
- Prefer wallet address as `distinctId` for holder identity
- Keep event names snake_case and stable (see events reference)
