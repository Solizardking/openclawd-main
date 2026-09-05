export const GATEWAY_CLIENT_NAMES = {
  CONTROL_UI: "control-ui",
  CLAWDBOT_UI: "clawdbot-ui",
} as const;

export type GatewayClientName =
  (typeof GATEWAY_CLIENT_NAMES)[keyof typeof GATEWAY_CLIENT_NAMES];

export const GATEWAY_CLIENT_MODES = {
  WEBCHAT: "webchat",
  OPERATOR: "operator",
  DASHBOARD: "dashboard",
} as const;

export type GatewayClientMode =
  (typeof GATEWAY_CLIENT_MODES)[keyof typeof GATEWAY_CLIENT_MODES];

export function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: GatewayClientName;
  clientMode: GatewayClientMode;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce?: string;
}): string {
  return JSON.stringify({
    version: 1,
    deviceId: params.deviceId,
    clientId: params.clientId,
    clientMode: params.clientMode,
    role: params.role,
    scopes: [...params.scopes].sort(),
    signedAtMs: params.signedAtMs,
    token: params.token,
    nonce: params.nonce ?? null,
  });
}
