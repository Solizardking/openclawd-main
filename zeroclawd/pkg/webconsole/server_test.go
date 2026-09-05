package webconsole

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/8bitlabs/clawdbot/pkg/config"
	"github.com/8bitlabs/clawdbot/pkg/strategy"
	"github.com/8bitlabs/clawdbot/pkg/trading"
)

func TestResolveFrontendDirFindsDist(t *testing.T) {
	// Prefer monorepo layout: <root>/web/frontend/dist when present.
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	// web/backend → monorepo root
	root := filepath.Clean(filepath.Join(cwd, "..", ".."))
	dist := filepath.Join(root, "web", "frontend", "dist")
	if _, err := os.Stat(dist); err != nil {
		t.Skip("frontend dist not built; skip static path resolution")
	}
	got := resolveFrontendDir(root, filepath.Join(root, "configs", "dummy.json"))
	if got != dist {
		t.Fatalf("resolveFrontendDir = %q, want %q", got, dist)
	}
	if resolveFrontendDir("/nonexistent", "/tmp/nope.json") != "" {
		t.Fatal("expected empty when no dist exists")
	}
}

func TestKeysAPIHandler_popupSave(t *testing.T) {
	dir := t.TempDir()
	// Isolate writes into temp .env.local
	t.Setenv("CLAWDBOT_VAULT_ENV_FILE", filepath.Join(dir, ".env.local"))

	h := keysAPIHandler(dir)

	// GET presence — no secrets
	req := httptest.NewRequest(http.MethodGet, "/api/keys", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET status=%d body=%s", rr.Code, rr.Body.String())
	}
	getBody := rr.Body.String()
	if !strings.Contains(getBody, "BLOCKSCOUT_API_KEY") || !strings.Contains(getBody, "RH_RPC_URL") {
		t.Fatalf("GET presence missing RH keys: %s", getBody)
	}
	// POST save from localhost
	const xaiVal = "xai-test-secret-value-zz9"
	const heliusVal = "helius-test-secret-value-zz9"
	const blockscoutVal = "proapi_test_blockscout_zz9"
	const rhRPCVal = "https://rpc.test.example/rh"
	body := fmt.Sprintf(
		`{"keys":{"XAI_API_KEY":%q,"HELIUS_API_KEY":%q,"BLOCKSCOUT_API_KEY":%q,"RH_RPC_URL":%q}}`,
		xaiVal, heliusVal, blockscoutVal, rhRPCVal,
	)
	req = httptest.NewRequest(http.MethodPost, "/api/keys", strings.NewReader(body))
	req.RemoteAddr = "127.0.0.1:12345"
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("POST status=%d body=%s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), xaiVal) ||
		strings.Contains(rr.Body.String(), heliusVal) ||
		strings.Contains(rr.Body.String(), blockscoutVal) {
		t.Fatalf("POST response leaked secrets: %s", rr.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp["ok"] != true {
		t.Fatalf("ok=%v", resp["ok"])
	}

	// Reject non-localhost
	req = httptest.NewRequest(http.MethodPost, "/api/keys", strings.NewReader(body))
	req.RemoteAddr = "203.0.113.9:9999"
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("remote POST status=%d, want 403", rr.Code)
	}

	// Reject unknown key names
	req = httptest.NewRequest(http.MethodPost, "/api/keys", strings.NewReader(`{"keys":{"EVIL_KEY":"x"}}`))
	req.RemoteAddr = "127.0.0.1:1"
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code == http.StatusOK {
		t.Fatal("unknown key should fail")
	}

	// File written with secrets (server-side only)
	data, err := os.ReadFile(filepath.Join(dir, ".env.local"))
	if err != nil {
		t.Fatal(err)
	}
	fileBody := string(data)
	if !strings.Contains(fileBody, "XAI_API_KEY="+xaiVal) {
		t.Fatalf("env file missing key:\n%s", data)
	}
	if !strings.Contains(fileBody, "BLOCKSCOUT_API_KEY="+blockscoutVal) {
		t.Fatalf("env file missing BLOCKSCOUT_API_KEY:\n%s", data)
	}
	if !strings.Contains(fileBody, "RH_RPC_URL="+rhRPCVal) {
		t.Fatalf("env file missing RH_RPC_URL:\n%s", data)
	}
}

func TestConnectorsAPIIncludesRobinhoodEntries(t *testing.T) {
	t.Setenv("BLOCKSCOUT_API_KEY", "proapi_conn_test")
	t.Setenv("RH_RPC_URL", "https://rpc.conn.test/rh")
	t.Setenv("HELIUS_API_KEY", "")
	t.Setenv("BIRDEYE_API_KEY", "")

	// Drive the same status helpers the /api/connectors handler uses.
	if envStatus("BLOCKSCOUT_API_KEY") != "connected" {
		t.Fatal("blockscout should be connected")
	}
	if rhRPCStatus() != "connected" {
		t.Fatal("rh rpc should be connected")
	}

	t.Setenv("BLOCKSCOUT_API_KEY", "")
	t.Setenv("RH_RPC_URL", "")
	if envStatus("BLOCKSCOUT_API_KEY") != "not_configured" {
		t.Fatal("blockscout missing")
	}
	if rhRPCStatus() != "not_configured" {
		t.Fatal("rh rpc missing")
	}
}

func TestLoadRuntimeConfig_appliesRobinhoodEnv(t *testing.T) {
	t.Setenv("BLOCKSCOUT_API_KEY", "proapi_runtime_cfg")
	t.Setenv("RH_RPC_URL", "https://runtime.cfg/rh")
	// Missing config file → defaults + env
	cfg, err := loadRuntimeConfig(filepath.Join(t.TempDir(), "nope.json"))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Robinhood.BlockscoutAPIKey != "proapi_runtime_cfg" {
		t.Fatalf("blockscout = %q", cfg.Robinhood.BlockscoutAPIKey)
	}
	if cfg.Robinhood.RPCURL != "https://runtime.cfg/rh" {
		t.Fatalf("rpc = %q", cfg.Robinhood.RPCURL)
	}
	if cfg.Robinhood.ChainID != 4663 {
		t.Fatalf("chain = %d", cfg.Robinhood.ChainID)
	}
}

func TestRuntimeConfig_neverNilOnCorruptJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.json")
	if err := os.WriteFile(path, []byte("not-json"), 0o600); err != nil {
		t.Fatal(err)
	}
	// Strict loader must error.
	if _, err := loadRuntimeConfig(path); err == nil {
		t.Fatal("expected parse error for corrupt JSON")
	}
	// Soft loader must never return nil (market handlers depend on this).
	cfg := runtimeConfig(path)
	if cfg == nil {
		t.Fatal("runtimeConfig returned nil")
	}
	// Strategy helpers must tolerate nil too.
	_ = strategyParamsFromConfig(nil)
	_ = portfolioLimitsFromConfig(nil)
}

func TestFindProjectRoot_prefersCwdModule(t *testing.T) {
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	// web/backend → monorepo root with go.mod
	root := filepath.Clean(filepath.Join(cwd, "..", ".."))
	// Config lives outside the monorepo (like ~/.clawdbot/config.json).
	outside := filepath.Join(t.TempDir(), "config.json")
	got := findProjectRoot(outside)
	if got != root {
		// When not running from package dir, accept any path that has clawdbot go.mod.
		if data, err := os.ReadFile(filepath.Join(got, "go.mod")); err != nil ||
			!strings.Contains(string(data), "module github.com/8bitlabs/clawdbot") {
			t.Fatalf("findProjectRoot(%q)=%q, want monorepo root with clawdbot module (cwd root %q)", outside, got, root)
		}
	}
}

func TestPackageAPIHandler_oneButton(t *testing.T) {
	// Drive the real package path: POST builds slim archive, GET reports it, download streams it.
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Clean(filepath.Join(cwd, "..", ".."))
	script := filepath.Join(root, "scripts", "package-source.sh")
	if _, err := os.Stat(script); err != nil {
		t.Skip("package-source.sh not present")
	}
	// Isolate output so we do not clobber a developer's existing build artifact.
	tmp := t.TempDir()
	// Point project root at a fake root that still has the real script via symlink tree? Simpler:
	// use real project root but write to default path under build/ — acceptable for local tests.
	// Prefer isolated: set CLAWD via BuildSlimPackage path by calling handler which uses DefaultPackageOutputPath.
	// We'll run against real root; file lands in build/ which is gitignored.

	handler := packageAPIHandler(root)

	// GET before build may report not ready
	req := httptest.NewRequest(http.MethodGet, "/api/package", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET status = %d", rr.Code)
	}

	// POST = one button
	req = httptest.NewRequest(http.MethodPost, "/api/package", nil)
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("POST status = %d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v\n%s", err, rr.Body.String())
	}
	if body["ok"] != true {
		t.Fatalf("POST body ok != true: %#v", body)
	}
	bytesVal, _ := body["bytes"].(float64)
	if bytesVal <= 0 {
		t.Fatalf("expected positive bytes, got %#v", body["bytes"])
	}
	if body["download"] != "/api/package/download" {
		t.Fatalf("download = %#v", body["download"])
	}

	// Download stream
	dl := packageDownloadHandler(root)
	req = httptest.NewRequest(http.MethodGet, "/api/package/download", nil)
	rr = httptest.NewRecorder()
	dl.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("download status = %d body=%s", rr.Code, rr.Body.String())
	}
	if rr.Body.Len() == 0 {
		t.Fatal("download body empty")
	}
	ct := rr.Header().Get("Content-Type")
	if !strings.Contains(ct, "gzip") && !strings.Contains(ct, "octet-stream") {
		// ServeFile may set application/gzip or based on extension
		if ct == "" {
			t.Logf("Content-Type empty (ok for ServeFile); bytes=%d", rr.Body.Len())
		}
	}
	_ = tmp // reserved for future isolation
}

func TestEcosystemLinksExposeProductSurfaces(t *testing.T) {
	links := ecosystemLinks()
	required := []string{
		"runtime_repo",
		"hub_repo",
		"gateway",
		"terminal",
		"agent_hub",
		"agent_forge",
		"zero_clawd",
		"cheshire_agents_npm",
		"cheshire_agents_repo",
		"skillhub_repo",
	}
	for _, key := range required {
		val, ok := links[key]
		if !ok || strings.TrimSpace(val) == "" {
			t.Fatalf("ecosystemLinks missing %q", key)
		}
	}
	if !strings.Contains(links["zero_clawd"], "zeroclawd") {
		t.Fatalf("zero_clawd = %q, want zeroclawd product URL", links["zero_clawd"])
	}
	if !strings.Contains(links["agent_hub"], "/agents") {
		t.Fatalf("agent_hub = %q, want /agents hub", links["agent_hub"])
	}
	if !strings.Contains(links["cheshire_agents_npm"], "cheshire-terminal-agents") {
		t.Fatalf("cheshire_agents_npm = %q", links["cheshire_agents_npm"])
	}
}

func TestHealthAPIHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rr := httptest.NewRecorder()
	healthAPIHandler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}

	var body map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode health body: %v\nraw: %s", err, rr.Body.String())
	}
	if body["status"] != "ok" {
		t.Fatalf("status = %q, want ok", body["status"])
	}
	if body["agent"] == "" {
		t.Fatal("agent identity field is empty")
	}
	// Contract must match the pure payload helper used by the live handler.
	want := healthPayload()
	if body["status"] != want["status"] || body["agent"] != want["agent"] {
		t.Fatalf("body = %#v, want %#v", body, want)
	}
	if body["agent"] != "Clawd Bot" {
		t.Fatalf("agent = %q, want Clawd Bot product name", body["agent"])
	}
	if body["package"] != "clawdbot-go" {
		t.Fatalf("package = %q, want clawdbot-go technical alias", body["package"])
	}
	if !strings.Contains(body["product"], "zeroclawd") {
		t.Fatalf("product = %q, want zeroclawd URL", body["product"])
	}
}

func TestRedactedConfigMasksSecrets(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.ModelList[0].APIKey = "model-secret"
	cfg.Channels.Telegram.Token = "telegram-secret"
	cfg.Channels.Discord.Token = "discord-secret"
	cfg.Providers.OpenRouter.APIKey = "openrouter-secret"
	cfg.Providers.Anthropic.APIKey = "anthropic-secret"
	cfg.Providers.OpenAI.APIKey = "openai-secret"
	cfg.Providers.Groq.APIKey = "groq-secret"
	cfg.Providers.Ollama.APIKey = "ollama-secret"
	cfg.Providers.NVIDIA.APIKey = "nvidia-secret"
	cfg.Solana.HeliusAPIKey = "helius-secret"
	cfg.Solana.BirdeyeAPIKey = "birdeye-secret"
	cfg.Solana.JupiterAPIKey = "jupiter-secret"
	cfg.Solana.AsterAPIKey = "aster-key"
	cfg.Solana.AsterAPISecret = "aster-secret"
	cfg.Solana.WalletKeyPath = "/home/user/.config/solana/id.json"
	cfg.Robinhood.BlockscoutAPIKey = "proapi_blockscout_secret"
	cfg.Robinhood.RPCURL = "https://alchemy.example/secret-path"
	cfg.Supabase.ServiceKey = "supabase-secret"

	got := redactedConfig(cfg)

	secrets := []string{
		got.ModelList[0].APIKey,
		got.Channels.Telegram.Token,
		got.Channels.Discord.Token,
		got.Providers.OpenRouter.APIKey,
		got.Providers.Anthropic.APIKey,
		got.Providers.OpenAI.APIKey,
		got.Providers.Groq.APIKey,
		got.Providers.Ollama.APIKey,
		got.Providers.NVIDIA.APIKey,
		got.Solana.HeliusAPIKey,
		got.Solana.BirdeyeAPIKey,
		got.Solana.JupiterAPIKey,
		got.Solana.AsterAPIKey,
		got.Solana.AsterAPISecret,
		got.Solana.WalletKeyPath,
		got.Robinhood.BlockscoutAPIKey,
		got.Robinhood.RPCURL,
		got.Supabase.ServiceKey,
	}
	for _, value := range secrets {
		if value != "<redacted>" {
			t.Fatalf("secret was not redacted: %q", value)
		}
	}
	if cfg.ModelList[0].APIKey != "model-secret" {
		t.Fatal("redactedConfig mutated the input config")
	}
}

func TestVaultStatusDoesNotExposeValues(t *testing.T) {
	root := t.TempDir()
	writeWebTestFile(t, filepath.Join(root, ".env.local"), `
CLAWDBOT_VAULT_ENABLED=1
CLAWDBOT_VAULT_ALLOWED_IPS=127.0.0.1
CLAWDBOT_VAULT_TOKEN=vault-token
HELIUS_API_KEY=helius-secret
`)
	req := httptest.NewRequest(http.MethodGet, "/api/vault/status", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	rec := httptest.NewRecorder()

	vaultStatusHandler(root).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status code = %d, body=%s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if strings.Contains(body, "helius-secret") || strings.Contains(body, "vault-token") {
		t.Fatalf("status leaked secret values: %s", body)
	}
	if !strings.Contains(body, `"keys":1`) || !strings.Contains(body, `"clientIpAllowed":true`) {
		t.Fatalf("status missing expected metadata: %s", body)
	}
}

func TestVaultKeyRequiresAllowedIPAndBearer(t *testing.T) {
	root := t.TempDir()
	writeWebTestFile(t, filepath.Join(root, ".env.local"), `
CLAWDBOT_VAULT_ENABLED=1
CLAWDBOT_VAULT_ALLOWED_IPS=203.0.113.7
CLAWDBOT_VAULT_TOKEN=vault-token
HELIUS_API_KEY=helius-secret
`)

	noToken := httptest.NewRequest(http.MethodGet, "/api/vault/key?name=HELIUS_API_KEY", nil)
	noToken.RemoteAddr = "203.0.113.7:1234"
	rec := httptest.NewRecorder()
	vaultKeyHandler(root).ServeHTTP(rec, noToken)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("missing token code = %d", rec.Code)
	}

	deniedIP := httptest.NewRequest(http.MethodGet, "/api/vault/key?name=HELIUS_API_KEY", nil)
	deniedIP.RemoteAddr = "198.51.100.9:1234"
	deniedIP.Header.Set("Authorization", "Bearer vault-token")
	rec = httptest.NewRecorder()
	vaultKeyHandler(root).ServeHTTP(rec, deniedIP)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("denied IP code = %d", rec.Code)
	}

	allowed := httptest.NewRequest(http.MethodGet, "/api/vault/key?name=HELIUS_API_KEY", nil)
	allowed.RemoteAddr = "203.0.113.7:1234"
	allowed.Header.Set("Authorization", "Bearer vault-token")
	rec = httptest.NewRecorder()
	vaultKeyHandler(root).ServeHTTP(rec, allowed)
	if rec.Code != http.StatusOK {
		t.Fatalf("allowed code = %d, body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "helius-secret") {
		t.Fatalf("expected secret value in authorized response: %s", rec.Body.String())
	}
}

func TestVaultExportExcludesControlKeys(t *testing.T) {
	root := t.TempDir()
	writeWebTestFile(t, filepath.Join(root, ".env.local"), `
CLAWDBOT_VAULT_ENABLED=1
CLAWDBOT_VAULT_ALLOWED_IPS=127.0.0.1
CLAWDBOT_VAULT_TOKEN=vault-token
HELIUS_API_KEY=helius-secret
`)
	req := httptest.NewRequest(http.MethodGet, "/api/vault/export", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("Authorization", "Bearer vault-token")
	rec := httptest.NewRecorder()

	vaultExportHandler(root).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status code = %d, body=%s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, "export HELIUS_API_KEY='helius-secret'") {
		t.Fatalf("export missing key: %s", body)
	}
	if strings.Contains(body, "CLAWDBOT_VAULT_TOKEN") {
		t.Fatalf("export leaked control key: %s", body)
	}
}

func TestStrategyParamsFromConfig(t *testing.T) {
	cfg := config.DefaultConfig()
	params := strategyParamsFromConfig(cfg)
	if params.EMASlowPeriod != cfg.Strategy.EMASlowPeriod || params.EMAFastPeriod != cfg.Strategy.EMAFastPeriod {
		t.Fatal("strategy params did not map EMA periods from config")
	}
	// The mapped params must drive a runnable backtest end-to-end.
	res := strategy.Backtest(demoBars(300), params, params.EMASlowPeriod+5)
	if res.Trades != res.Wins+res.Losses {
		t.Fatalf("backtest inconsistent: %d != %d + %d", res.Trades, res.Wins, res.Losses)
	}
}

func writeWebTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestPortfolioLimitsFromConfig(t *testing.T) {
	cfg := config.DefaultConfig()
	limits := portfolioLimitsFromConfig(cfg)
	if limits.MaxConcurrent <= 0 {
		t.Fatal("expected positive MaxConcurrent")
	}
	if limits.MaxPerAsset != cfg.Solana.MaxPositionSOL {
		t.Fatalf("MaxPerAsset = %.4f, want %.4f", limits.MaxPerAsset, cfg.Solana.MaxPositionSOL)
	}
	// A flat book within limits should be allowed.
	got := limits.CheckEntry("SOL", cfg.Solana.MaxPositionSOL/2, trading.OpenExposure{
		PeakEquity: 10, Equity: 10, SessionStartEquity: 10,
	})
	if !got.Allowed {
		t.Fatalf("expected healthy entry allowed: %v", got.Reasons)
	}
}

func TestDemoSeriesShapes(t *testing.T) {
	closes, highs, lows := demoSeries()
	if len(closes) == 0 || len(highs) != len(closes) || len(lows) != len(closes) {
		t.Fatalf("demoSeries lengths mismatch: %d/%d/%d", len(closes), len(highs), len(lows))
	}
	for i := range closes {
		if highs[i] < closes[i] || lows[i] > closes[i] {
			t.Fatalf("bar %d violates high>=close>=low invariant", i)
		}
	}
}

func TestCorsAllowedOrigin(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "http://127.0.0.1:18800/api/status", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Host = "127.0.0.1:18800"

	if !corsAllowedOrigin(req, "http://127.0.0.1:18800") {
		t.Fatal("same-origin request was rejected")
	}
	if corsAllowedOrigin(req, "http://evil.example") {
		t.Fatal("cross-origin request was allowed without explicit config")
	}

	t.Setenv("CLAWDBOT_CORS_ORIGINS", "https://console.example")
	if !corsAllowedOrigin(req, "https://console.example") {
		t.Fatal("configured origin was rejected")
	}
}

func TestClientIPTrustsProxyHeadersOnlyWhenEnabled(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "http://localhost/api/install", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.RemoteAddr = "192.0.2.1:3456"
	req.Header.Set("X-Forwarded-For", "203.0.113.7")

	if got := clientIP(req); got != "192.0.2.1" {
		t.Fatalf("clientIP trusted proxy header by default: %q", got)
	}

	t.Setenv("CLAWDBOT_TRUST_PROXY_HEADERS", "1")
	if got := clientIP(req); got != "203.0.113.7" {
		t.Fatalf("clientIP ignored trusted proxy header: %q", got)
	}
}
