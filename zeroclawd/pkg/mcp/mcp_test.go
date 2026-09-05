package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/8bitlabs/clawdbot/pkg/tools"
)

func toolsNewRegistry() *tools.Registry {
	return tools.NewRegistry()
}

func TestBlockscoutServerConfig_headers(t *testing.T) {
	sc := BlockscoutServerConfig("proapi_test_secret_key")
	if sc.URL != BlockscoutMCPURL {
		t.Fatalf("url = %q", sc.URL)
	}
	if sc.Headers[BlockscoutProAPIKeyHeader] != "proapi_test_secret_key" {
		t.Fatalf("missing pro api key header")
	}
	if sc.Headers[BlockscoutIntermediaryHeader] != BlockscoutIntermediaryValue {
		t.Fatalf("intermediary = %q", sc.Headers[BlockscoutIntermediaryHeader])
	}
	if sc.TimeoutMS != DefaultTimeoutMS {
		t.Fatalf("timeout = %d", sc.TimeoutMS)
	}
}

func TestEnsureBlockscout_requiresKeyUnlessForce(t *testing.T) {
	cfg := MCPConfig{}
	EnsureBlockscout(&cfg, "", false)
	if cfg.Enabled || len(cfg.Servers) != 0 {
		t.Fatalf("empty key should not enable: %#v", cfg)
	}
	EnsureBlockscout(&cfg, "", true)
	if !cfg.Enabled || cfg.Servers[BlockscoutServerName].URL == "" {
		t.Fatalf("force should register server: %#v", cfg)
	}
	EnsureBlockscout(&cfg, "proapi_abc", false)
	if cfg.Servers[BlockscoutServerName].Headers[BlockscoutProAPIKeyHeader] != "proapi_abc" {
		t.Fatal("key not applied")
	}
}

func TestAssessBlockscout_noSecretLeak(t *testing.T) {
	st := AssessBlockscout("proapi_super_secret_zz99")
	if !st.Configured {
		t.Fatal("should be configured")
	}
	if st.KeySuffix != "zz99" {
		t.Fatalf("suffix = %q", st.KeySuffix)
	}
	raw, _ := json.Marshal(st)
	if strings.Contains(string(raw), "proapi_super_secret") {
		t.Fatalf("leaked full key: %s", raw)
	}
	empty := AssessBlockscout("")
	if empty.Configured {
		t.Fatal("empty should not be configured")
	}
	if !strings.Contains(empty.Message, "BLOCKSCOUT_API_KEY") {
		t.Fatalf("message = %q", empty.Message)
	}
}

func TestDefaultConfigWithBlockscout(t *testing.T) {
	cfg := DefaultConfigWithBlockscout("proapi_x")
	if !cfg.Enabled {
		t.Fatal("enabled")
	}
	sc, ok := cfg.Servers[BlockscoutServerName]
	if !ok {
		t.Fatal("missing server")
	}
	if sc.Headers[BlockscoutProAPIKeyHeader] != "proapi_x" {
		t.Fatal("header")
	}
}

func TestManager_LoadAndCallREST(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/get_block_number" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get(BlockscoutProAPIKeyHeader) != "proapi_unit" {
			http.Error(w, "unauthorized", 401)
			return
		}
		if r.URL.Query().Get("chain_id") != "4663" {
			http.Error(w, "bad chain", 400)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"block_number":42}}`))
	}))
	defer srv.Close()

	prev := restBase
	restBase = srv.URL + "/v1"
	defer func() { restBase = prev }()

	m := NewManager()
	cfg := DefaultConfigWithBlockscout("proapi_unit")
	if err := m.LoadFromConfig(context.Background(), cfg, ""); err != nil {
		t.Fatal(err)
	}
	servers := m.GetServers()
	if servers[BlockscoutServerName] == nil || !servers[BlockscoutServerName].Running {
		t.Fatal("blockscout not running")
	}
	if !servers[BlockscoutServerName].HasAuth {
		t.Fatal("hasAuth expected")
	}
	if servers[BlockscoutServerName].Headers != nil {
		t.Fatal("headers leaked via GetServers")
	}
	sum := m.PublicSummary()
	if len(sum) != 1 || sum[0].Name != BlockscoutServerName {
		t.Fatalf("summary = %#v", sum)
	}
	if len(sum[0].ToolNames) < 10 {
		t.Fatalf("tool names = %v", sum[0].ToolNames)
	}

	out, err := m.CallTool(context.Background(), BlockscoutServerName, "get_block_number", map[string]any{
		"chain_id": 4663,
	})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if !strings.Contains(out, `"block_number":42`) {
		t.Fatalf("body = %s", out)
	}
}

func TestRestToolName(t *testing.T) {
	if restToolName("__unlock_blockchain_analysis__") != "unlock_blockchain_analysis" {
		t.Fatal("unlock mapping")
	}
	if restToolName("get_block_number") != "get_block_number" {
		t.Fatal("passthrough")
	}
}

func TestHostConfigs_redact(t *testing.T) {
	doc := HostConfigCursor("proapi_secret", true)
	servers := doc["mcpServers"].(map[string]any)
	bs := servers[BlockscoutServerName].(map[string]any)
	headers := bs["headers"].(map[string]string)
	if headers[BlockscoutProAPIKeyHeader] != "${BLOCKSCOUT_API_KEY}" {
		t.Fatalf("redact failed: %v", headers)
	}
	toml := HostConfigCodexTOML("proapi_secret", true)
	if strings.Contains(toml, "proapi_secret") {
		t.Fatal("toml leaked key")
	}
	cli := HostConfigClaudeCodeCLI(true)
	if !strings.Contains(cli, "$BLOCKSCOUT_API_KEY") {
		t.Fatalf("cli = %s", cli)
	}
	raw, err := MarshalHostConfigJSON("proapi_x", true)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "proapi_x") {
		t.Fatal("json leaked")
	}
}

// TestLaunch_loadRegisterUnlockAndChain is the verification-plan consumer path:
// key → DefaultConfigWithBlockscout → LoadFromConfig → CallTool unlock + chain tool
// against an httptest double (non-stub JSON). Missing key fails closed without dial.
func TestLaunch_loadRegisterUnlockAndChain(t *testing.T) {
	const testKey = "proapi_launch_path_key"
	var sawProHeader bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(BlockscoutProAPIKeyHeader) != testKey {
			http.Error(w, "bad auth", 401)
			return
		}
		sawProHeader = true
		switch {
		case strings.Contains(r.URL.Path, "unlock_blockchain_analysis"):
			_, _ = w.Write([]byte(`{"data":{"version":"0.16.0","skill_reference":"blockscout-analysis"}}`))
		case strings.Contains(r.URL.Path, "get_block_number"):
			if r.URL.Query().Get("chain_id") != "4663" {
				http.Error(w, "chain", 400)
				return
			}
			_, _ = w.Write([]byte(`{"data":{"block_number":14950374}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	prev := restBase
	restBase = srv.URL + "/v1"
	defer func() { restBase = prev }()

	cfg := DefaultConfigWithBlockscout(testKey)
	m := NewManager()
	if err := m.LoadFromConfig(context.Background(), cfg, ""); err != nil {
		t.Fatal(err)
	}
	unlock, err := m.CallTool(context.Background(), BlockscoutServerName, "__unlock_blockchain_analysis__", nil)
	if err != nil {
		t.Fatalf("unlock: %v", err)
	}
	if strings.Contains(unlock, "[mcp]") || strings.Contains(unlock, "stub") {
		t.Fatalf("stub response: %s", unlock)
	}
	if !strings.Contains(unlock, "blockscout-analysis") {
		t.Fatalf("unlock body = %s", unlock)
	}
	block, err := m.CallTool(context.Background(), BlockscoutServerName, "get_block_number", map[string]any{"chain_id": 4663})
	if err != nil {
		t.Fatalf("block: %v", err)
	}
	if !strings.Contains(block, "14950374") {
		t.Fatalf("block = %s", block)
	}
	if !sawProHeader {
		t.Fatal("PRO API key header was never sent")
	}

	// Agent tools on same path
	reg := tools.NewRegistry()
	RegisterBlockscoutTools(reg, testKey)
	tool, _ := reg.Get("blockscout_unlock")
	out, err := tool.Execute(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "skill_reference") {
		t.Fatalf("agent unlock = %s", out)
	}
}

func TestCallREST_failClosedMissingKey(t *testing.T) {
	// Must not hit network: use a client that would panic if used.
	prev := restBase
	restBase = "http://127.0.0.1:1/v1" // unreachable if we wrongly dial
	defer func() { restBase = prev }()

	_, err := CallREST(context.Background(), nil, "", "get_block_number", map[string]any{"chain_id": 4663})
	if err == nil {
		t.Fatal("expected missing-key error")
	}
	if !errors.Is(err, ErrMissingAPIKey) {
		t.Fatalf("err = %v want ErrMissingAPIKey", err)
	}
	if !strings.Contains(err.Error(), "BLOCKSCOUT_API_KEY") {
		t.Fatalf("error should name BLOCKSCOUT_API_KEY: %v", err)
	}
	if !strings.Contains(err.Error(), "BLOCKSCOUT_PRO_API_KEY") {
		t.Fatalf("error should mention alias: %v", err)
	}
}

func TestCallTool_failClosedWhenServerNotLoaded(t *testing.T) {
	t.Setenv("BLOCKSCOUT_API_KEY", "")
	t.Setenv("BLOCKSCOUT_PRO_API_KEY", "")
	m := NewManager()
	// DefaultConfigWithBlockscout("") leaves MCP disabled — no load.
	if err := m.LoadFromConfig(context.Background(), DefaultConfigWithBlockscout(""), ""); err != nil {
		t.Fatal(err)
	}
	_, err := m.CallTool(context.Background(), BlockscoutServerName, "get_block_number", map[string]any{"chain_id": 4663})
	if err == nil {
		t.Fatal("expected error")
	}
	if !errors.Is(err, ErrMissingAPIKey) {
		t.Fatalf("err = %v want ErrMissingAPIKey wrap", err)
	}
	if !strings.Contains(err.Error(), "BLOCKSCOUT_API_KEY") {
		t.Fatalf("err = %v", err)
	}
	// Must not be the old stub string
	if strings.Contains(err.Error(), "[mcp]") {
		t.Fatalf("stub response: %v", err)
	}
}

func TestAgentTools_failClosedMissingKey(t *testing.T) {
	t.Setenv("BLOCKSCOUT_API_KEY", "")
	t.Setenv("BLOCKSCOUT_PRO_API_KEY", "")
	reg := tools.NewRegistry()
	RegisterBlockscoutTools(reg, "")
	tool, ok := reg.Get("blockscout_block_number")
	if !ok {
		t.Fatal("tool missing")
	}
	_, err := tool.Execute(context.Background(), map[string]any{})
	if err == nil {
		t.Fatal("expected missing key")
	}
	if !errors.Is(err, ErrMissingAPIKey) {
		t.Fatalf("err = %v", err)
	}
	if !strings.Contains(err.Error(), "BLOCKSCOUT_API_KEY") {
		t.Fatalf("err = %v", err)
	}
}

func TestCallREST_liveRH4663(t *testing.T) {
	if testing.Short() {
		t.Skip("short")
	}
	key := ResolveAPIKey()
	if key == "" {
		t.Skip("BLOCKSCOUT_API_KEY not set — offline fail-closed tests cover missing-key path")
	}
	ctx := context.Background()
	body, err := CallREST(ctx, nil, key, "get_chains_list", map[string]any{"query": "robinhood"})
	if err != nil {
		t.Fatalf("get_chains_list: %v", err)
	}
	if !strings.Contains(body, "4663") && !strings.Contains(strings.ToLower(body), "robinhood") {
		t.Fatalf("unexpected chains response: %s", truncate(body, 200))
	}
	body, err = CallREST(ctx, nil, key, "get_block_number", map[string]any{"chain_id": 4663})
	if err != nil {
		t.Fatalf("get_block_number: %v", err)
	}
	if !strings.Contains(body, "block_number") {
		t.Fatalf("unexpected block response: %s", truncate(body, 200))
	}
	if err := ProbeHealth(ctx, nil); err != nil {
		t.Fatalf("health: %v", err)
	}
}

func TestCallREST_httpError(t *testing.T) {
	// Missing key fails before empty-tool check when key empty.
	_, err := CallREST(context.Background(), nil, "", "", nil)
	if !errors.Is(err, ErrMissingAPIKey) {
		t.Fatalf("empty key: %v", err)
	}
	// With key, empty tool name fails.
	_, err = CallREST(context.Background(), nil, "proapi_x", "", nil)
	if err == nil || !strings.Contains(err.Error(), "empty tool") {
		t.Fatalf("empty tool: %v", err)
	}
}

func TestRegisterBlockscoutTools(t *testing.T) {
	reg := toolsNewRegistry()
	RegisterBlockscoutTools(reg, "proapi_reg")
	for _, name := range BlockscoutToolNames() {
		if _, ok := reg.Get(name); !ok {
			t.Fatalf("missing tool %s", name)
		}
	}
	// Default chain_id for block number
	prev := restBase
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("chain_id") != "4663" {
			http.Error(w, "want default 4663", 400)
			return
		}
		_, _ = w.Write([]byte(`{"data":{"block_number":1}}`))
	}))
	defer srv.Close()
	restBase = srv.URL + "/v1"
	defer func() { restBase = prev }()

	tool, _ := reg.Get("blockscout_block_number")
	out, err := tool.Execute(context.Background(), map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "block_number") {
		t.Fatalf("out = %s", out)
	}
}
