export const CLAWDBOT_IDENTITY = {
  name: "Clawd Bot",
  uri: "https://cheshireterminal.ai/zeroclawd",
  icon: "favicon.ico",
} as const;

export const CLAWDBOT_CHAIN = "solana:mainnet" as const;

export const CLAWDBOT_RPC =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export const LOCAL_CONSOLE_URL =
  process.env.EXPO_PUBLIC_CLAWD_CONSOLE_URL ?? "http://127.0.0.1:18800";
