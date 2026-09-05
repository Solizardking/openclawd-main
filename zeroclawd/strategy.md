# Clawd Bot Strategy

This is the active strategy state for the Go runtime repository
`https://github.com/Solizardking/Zero-Bruh`. It is intentionally runtime-local:
the broader ecosystem hub is `https://github.com/solizardking/solana-clawd`,
and public user-facing access routes through `https://zk.x402.wtf`
and `https://cheshireterminal.ai`.

This codebase carries the algorithmic legacy of the PiedPiper project at IIIT
Hyderabad ([vs666/MinMax](https://github.com/vs666/MinMax)) — classical
compression, encryption, and cellular automata adapted into Solana ZK primitives
at `zk-primitives/docs/PIEDPIPER_ADAPTATION.md`. The strategy engine itself
(RSI, EMA cross, ATR) is a direct descendant of the same algorithmic rigor:
signal = probability-weighted expectation, just as the PiedPiper Min-Max solver
computes utility as `weight[d] * utility[state] + Σ child utilities`.

Last updated: 2026-03-11T00:00:00.000Z
Best metric: 0.0000 (baseline)

## Active Parameters

```json
{
  "rsiOverbought": 70,
  "rsiOversold": 30,
  "emaFastPeriod": 20,
  "emaSlowPeriod": 50,
  "minVolume24h": 100000,
  "minLiquidity": 50000,
  "maxSlippage": 0.02,
  "stopLossPct": 0.08,
  "takeProfitPct": 0.20,
  "positionSizePct": 0.10,
  "fundingRateThreshold": 0.0005,
  "usePerps": true
}
```

## Change Log
(empty — baseline)
