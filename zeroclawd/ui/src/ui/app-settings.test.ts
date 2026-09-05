import { beforeEach, describe, expect, it, vi } from "vitest";

const polling = vi.hoisted(() => ({
  startLogsPolling: vi.fn(),
  stopLogsPolling: vi.fn(),
  startDebugPolling: vi.fn(),
  stopDebugPolling: vi.fn(),
}));

vi.mock("./app-polling", () => polling);

import { setTabFromRoute } from "./app-settings";
import type { Tab } from "./navigation";

type SettingsHost = Parameters<typeof setTabFromRoute>[0];

const createHost = (tab: Tab): SettingsHost => ({
  settings: {
    gatewayUrl: "",
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  },
  theme: "system",
  themeResolved: "dark",
  applySessionKey: "main",
  sessionKey: "main",
  tab,
  connected: false,
  chatHasAutoScrolled: false,
  logsAtBottom: false,
  eventLog: [],
  eventLogBuffer: [],
  basePath: "",
  themeMedia: null,
  themeMediaHandler: null,
});

describe("setTabFromRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts and stops log polling based on the tab", () => {
    const host = createHost("chat");

    setTabFromRoute(host, "logs");
    expect(polling.startLogsPolling).toHaveBeenCalledTimes(1);
    expect(polling.stopLogsPolling).not.toHaveBeenCalled();
    expect(polling.startDebugPolling).not.toHaveBeenCalled();
    expect(polling.stopDebugPolling).toHaveBeenCalledTimes(1);

    setTabFromRoute(host, "chat");
    expect(polling.stopLogsPolling).toHaveBeenCalledTimes(1);
  });

  it("starts and stops debug polling based on the tab", () => {
    const host = createHost("chat");

    setTabFromRoute(host, "debug");
    expect(polling.startDebugPolling).toHaveBeenCalledTimes(1);
    expect(polling.stopDebugPolling).not.toHaveBeenCalled();
    expect(polling.startLogsPolling).not.toHaveBeenCalled();
    expect(polling.stopLogsPolling).toHaveBeenCalledTimes(1);

    setTabFromRoute(host, "chat");
    expect(polling.stopDebugPolling).toHaveBeenCalledTimes(1);
  });
});
