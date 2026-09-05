# Modern Stripe payment patterns

Attributed guidance adapted from the public [stripe-best-practices](https://github.com/stripe/ai/tree/main/providers/claude/plugin/skills/stripe-best-practices) skill in the official Stripe Claude plugin.

## Prefer

| Need | API |
|------|-----|
| One-time payments (on-session) | Checkout Sessions |
| Embedded custom form | Checkout Sessions + Payment Element |
| Off-session / server-driven charge model | PaymentIntents |
| Save card / method for later | SetupIntents |
| Subscriptions | Billing + Checkout Sessions |
| No-code | Payment Links |

## Avoid (legacy / traps)

| Avoid | Use instead |
|-------|-------------|
| **Charges API** | Checkout Sessions or PaymentIntents |
| Sources API | SetupIntents |
| Tokens API for cards | SetupIntents / Checkout |
| Card Element (legacy) | Payment Element |
| Hardcoded `payment_method_types: ['card']` | Dynamic payment methods (omit the field) |

## Dynamic payment methods

Except for **Terminal** (`payment_method_types: ['card_present']`), omit `payment_method_types` so Stripe can select methods dynamically from Dashboard settings.

## Webhooks

- Listen for `checkout.session.completed`, `payment_intent.succeeded`, `invoice.paid`, etc.
- Verify signatures with `STRIPE_WEBHOOK_SECRET`
- Never fulfill solely from client-side success redirects

## Keys

- Prefer restricted API keys (`rk_`) over full secret keys (`sk_`)
- Never commit live keys; use env / secret managers

## Docs

- [Checkout](https://docs.stripe.com/payments/checkout)
- [PaymentIntents](https://docs.stripe.com/payments/paymentintents/lifecycle)
- [SetupIntents](https://docs.stripe.com/api/setup_intents)
- [Testing](https://docs.stripe.com/testing)
- [Go-live checklist](https://docs.stripe.com/get-started/checklist/go-live)
