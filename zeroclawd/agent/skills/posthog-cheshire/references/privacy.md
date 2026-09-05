# Cheshire PostHog — privacy model

Cheshire Terminal is **cookieless and opt-in** for product analytics.

## Principles

1. **No tracking cookies** — browser persistence is `memory` only (`disable_persistence: true`)
2. **Opt-out by default** — `opt_out_capturing_by_default: true`
3. **Analytics requires explicit consent** — `privacyAllowsAnalytics()`
4. **Session replay requires analytics + replay** — both prefs true
5. **Scrub tracking cookies** on init / identity reset

## Code map

| File | Role |
|------|------|
| `client/src/lib/posthog.ts` | init, identify, capture, privacy apply |
| `client/src/lib/privacy.ts` | prefs storage + allow helpers |
| `server/lib/posthog.ts` | posthog-node client |
| Auth / wallet context | call `identifyWallet` on connect + restore |

## Consent matrix

| Analytics | Replay | Capture | Recording |
|-----------|--------|---------|-----------|
| off | * | none | off |
| on | off | events + pageviews | off |
| on | on | events + pageviews | on |

## Implementation checklist

When changing privacy or PostHog:

- [ ] Do not re-enable cookie persistence without product + legal review
- [ ] Keep `secure_cookie: true` and `cross_subdomain_cookie: false` if cookies ever used
- [ ] Wire `cheshire:privacy-changed` window event to `applyPrivacyToPostHog()`
- [ ] Call `resetPostHogIdentity()` on wallet disconnect / logout
- [ ] Hard kill: `VITE_POSTHOG_DISABLED=true`

## What not to track

- Private keys, seed phrases, mnemonics
- Full API keys (`ct_sk_…`, provider secrets)
- Full Authorization headers / JWTs
- Unredacted user message content with secrets
- Exact balances only when required for product analytics — prefer buckets if possible

## Verification

1. Fresh browser profile → no PostHog network traffic until opt-in
2. Opt-in analytics → `us.i.posthog.com` traffic appears
3. Opt-out → capturing stops; cookies remain scrubbed
4. Replay toggle off → no session recording payloads
