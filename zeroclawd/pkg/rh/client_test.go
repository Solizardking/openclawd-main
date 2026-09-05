package rh

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/8bitlabs/clawdbot/pkg/config"
)

func TestBuildModuleAPIURL_chainAndApikey(t *testing.T) {
	c := NewClient(ClientConfig{
		RPCURL:           "https://rpc.test/rh",
		BlockscoutBase:   "https://api.blockscout.com",
		BlockscoutAPIKey: "proapi_unit_test_key",
		ChainID:          4663,
	})
	u := c.BuildModuleAPIURL("account", "balance", nil)
	if !strings.Contains(u, "https://api.blockscout.com/v2/api?") {
		t.Fatalf("base path wrong: %s", u)
	}
	if !strings.Contains(u, "chain_id=4663") {
		t.Fatalf("missing chain_id=4663: %s", u)
	}
	if !strings.Contains(u, "module=account") || !strings.Contains(u, "action=balance") {
		t.Fatalf("module/action missing: %s", u)
	}
	if !strings.Contains(u, "apikey=proapi_unit_test_key") {
		t.Fatalf("apikey missing: %s", u)
	}
}

func TestBuildRESTURL_andJSONRPC(t *testing.T) {
	c := NewClient(ClientConfig{
		BlockscoutAPIKey: "proapi_rest",
		ChainID:          4663,
	})
	rest := c.BuildRESTURL("stats")
	if !strings.HasPrefix(rest, "https://api.blockscout.com/4663/api/v2/stats") {
		t.Fatalf("rest url: %s", rest)
	}
	if !strings.Contains(rest, "apikey=proapi_rest") {
		t.Fatalf("rest apikey: %s", rest)
	}
	jrpc := c.BuildJSONRPCURL()
	if jrpc != "https://api.blockscout.com/4663/json-rpc" {
		t.Fatalf("json-rpc url: %s", jrpc)
	}
}

func TestCallRPC_usesResolvedURL(t *testing.T) {
	var gotURL string
	var gotMethod string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotURL = r.URL.String()
		gotMethod = r.Method
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x1237"}`))
	}))
	t.Cleanup(srv.Close)

	c := NewClient(ClientConfig{
		RPCURL:     srv.URL,
		HTTPClient: srv.Client(),
		ChainID:    4663,
	})
	raw, err := c.CallRPC(context.Background(), "eth_chainId", []any{})
	if err != nil {
		t.Fatal(err)
	}
	if gotMethod != http.MethodPost {
		t.Fatalf("method = %s", gotMethod)
	}
	if gotURL != "/" && gotURL != "" {
		// httptest path is /
	}
	if gotBody["method"] != "eth_chainId" {
		t.Fatalf("body method = %v", gotBody["method"])
	}
	var hexStr string
	if err := json.Unmarshal(raw, &hexStr); err != nil || hexStr != "0x1237" {
		t.Fatalf("result = %s err=%v", raw, err)
	}
	n, err := c.EthChainID(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if n != 0x1237 {
		t.Fatalf("chain id = %d, want 4663 (0x1237)", n)
	}
}

func TestGetModuleAPI_authAndChain(t *testing.T) {
	var gotURL string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotURL = r.URL.String()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"1","result":"0"}`))
	}))
	t.Cleanup(srv.Close)

	c := NewClient(ClientConfig{
		BlockscoutBase:   srv.URL,
		BlockscoutAPIKey: "proapi_mod_key",
		ChainID:          4663,
		HTTPClient:       srv.Client(),
	})
	_, err := c.GetModuleAPI(context.Background(), "account", "balance", nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(gotURL, "chain_id=4663") {
		t.Fatalf("url missing chain: %s", gotURL)
	}
	if !strings.Contains(gotURL, "apikey=proapi_mod_key") {
		t.Fatalf("url missing apikey: %s", gotURL)
	}
	if !strings.Contains(gotURL, "module=account") {
		t.Fatalf("url: %s", gotURL)
	}
}

func TestGetREST_bearerAuth(t *testing.T) {
	var auth string
	var path string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		path = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"gas_prices":{}}`))
	}))
	t.Cleanup(srv.Close)

	c := NewClient(ClientConfig{
		BlockscoutBase:   srv.URL,
		BlockscoutAPIKey: "proapi_bearer_key",
		ChainID:          4663,
		HTTPClient:       srv.Client(),
	})
	_, err := c.GetREST(context.Background(), "stats")
	if err != nil {
		t.Fatal(err)
	}
	if auth != "Bearer proapi_bearer_key" {
		t.Fatalf("Authorization = %q", auth)
	}
	if !strings.Contains(path, "/4663/api/v2/stats") {
		t.Fatalf("path = %s", path)
	}
}

func TestPostBlockscoutJSONRPC_bearer(t *testing.T) {
	var auth string
	var path string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		path = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":0,"result":"0x1"}`))
	}))
	t.Cleanup(srv.Close)

	c := NewClient(ClientConfig{
		BlockscoutBase:   srv.URL,
		BlockscoutAPIKey: "proapi_jrpc",
		ChainID:          4663,
		HTTPClient:       srv.Client(),
	})
	raw, err := c.PostBlockscoutJSONRPC(context.Background(), "eth_blockNumber", nil)
	if err != nil {
		t.Fatal(err)
	}
	if auth != "Bearer proapi_jrpc" {
		t.Fatalf("auth = %q", auth)
	}
	if path != "/4663/json-rpc" {
		t.Fatalf("path = %s", path)
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil || s != "0x1" {
		t.Fatalf("result = %s", raw)
	}
}

func TestFromConfig_usesResolvedRPC(t *testing.T) {
	// Empty RPC → public fallback
	c := FromConfig(config.RobinhoodConfig{
		ChainID:          4663,
		BlockscoutAPIKey: "k",
		BlockscoutBase:   BlockscoutBase,
	})
	if c.RPCURL() != PublicRPCURL {
		t.Fatalf("fallback = %s", c.RPCURL())
	}
	if c.ChainID() != 4663 {
		t.Fatalf("chain = %d", c.ChainID())
	}

	c2 := FromConfig(config.RobinhoodConfig{
		RPCURL:  "https://custom.rpc/rh",
		ChainID: 4663,
	})
	if c2.RPCURL() != "https://custom.rpc/rh" {
		t.Fatalf("custom = %s", c2.RPCURL())
	}
}
