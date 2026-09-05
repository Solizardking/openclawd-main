/** Moonshot / Kimi Open Platform — Kimi K3 flagship + current coding models.
 *  Docs: https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
 *  Kimi K2 series was discontinued May 25, 2026.
 */

export const MOONSHOT_KIMI_K3_DEFAULT_ID = "kimi-k3";
export const MOONSHOT_KIMI_K3_CONTEXT_WINDOW = 1_048_576;
/** Platform default max_completion_tokens for K3; agents may use less. */
export const MOONSHOT_KIMI_K3_MAX_TOKENS = 131_072;
export const MOONSHOT_KIMI_K3_INPUT = ["text", "image"] as const;

/** USD per 1M tokens (Kimi K3 flat pay-as-you-go). */
export const MOONSHOT_KIMI_K3_COST = {
  input: 3.0, // cache miss
  inputCacheHit: 0.3,
  output: 15.0,
  cacheRead: 0.3,
  cacheWrite: 0,
} as const;

export const MOONSHOT_KIMI_K3_MODELS = [
  {
    id: "kimi-k3",
    name: "Kimi K3",
    alias: "Kimi K3",
    reasoning: true,
    contextWindow: MOONSHOT_KIMI_K3_CONTEXT_WINDOW,
    maxTokens: MOONSHOT_KIMI_K3_MAX_TOKENS,
  },
  {
    id: "kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    alias: "Kimi K2.7 Code",
    reasoning: true,
    contextWindow: 256_000,
    maxTokens: 8192,
  },
  {
    id: "kimi-k2.7-code-highspeed",
    name: "Kimi K2.7 Code Highspeed",
    alias: "Kimi K2.7 Highspeed",
    reasoning: true,
    contextWindow: 256_000,
    maxTokens: 8192,
  },
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    alias: "Kimi K2.6",
    reasoning: true,
    contextWindow: 256_000,
    maxTokens: 8192,
  },
] as const;

export type MoonshotKimiK3Model = (typeof MOONSHOT_KIMI_K3_MODELS)[number];
