// Package rh provides thin Robinhood Chain JSON-RPC and Blockscout PRO helpers.
// Used by launch/deploy/trade agent flows (Pons, Uniswap, on-chain indexing).
//
// Secrets and RPC URLs come from config / env (RH_RPC_URL, BLOCKSCOUT_API_KEY).
// HTTP is injectable via RoundTripper for unit tests — no live network required.
package rh

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/8bitlabs/clawdbot/pkg/config"
)

const (
	// ChainID is Robinhood Chain mainnet.
	ChainID = config.RobinhoodChainID
	// PublicRPCURL is the public read-only RH RPC (rate-limited; not deploy-safe).
	PublicRPCURL = config.RobinhoodPublicRPCURL
	// BlockscoutBase is the multichain PRO API host.
	BlockscoutBase = config.BlockscoutPROBaseURL
	// DefaultUserAgent avoids CDN edge blocks on bare net/http defaults.
	DefaultUserAgent = "clawdbot-rh/1.0"
)

// Client talks to Robinhood JSON-RPC and Blockscout PRO with operator credentials.
type Client struct {
	rpcURL           string
	blockscoutBase   string
	blockscoutAPIKey string
	chainID          int
	httpClient       *http.Client
	userAgent        string
}

// ClientConfig configures a Client. Prefer FromConfig for production wiring.
type ClientConfig struct {
	RPCURL           string
	BlockscoutBase   string
	BlockscoutAPIKey string
	ChainID          int
	// HTTPClient optional; if nil a client with 30s timeout is created.
	// Inject Transport for fake-HTTP tests.
	HTTPClient *http.Client
	UserAgent  string
	Timeout    time.Duration
}

// FromConfig builds a Client from the Robinhood config slice.
// Empty RPCURL uses the public read fallback; Blockscout key may be empty
// (calls will fail auth until set — presence is checked by doctor/connectors).
func FromConfig(rh config.RobinhoodConfig) *Client {
	return NewClient(ClientConfig{
		RPCURL:           rh.ResolvedRPCURL(),
		BlockscoutBase:   firstNonEmpty(rh.BlockscoutBase, BlockscoutBase),
		BlockscoutAPIKey: rh.BlockscoutAPIKey,
		ChainID:          rh.ChainID,
	})
}

// NewClient constructs a Client. ChainID defaults to 4663.
func NewClient(cfg ClientConfig) *Client {
	chainID := cfg.ChainID
	if chainID == 0 {
		chainID = ChainID
	}
	rpc := strings.TrimSpace(cfg.RPCURL)
	if rpc == "" {
		rpc = PublicRPCURL
	}
	base := strings.TrimSpace(cfg.BlockscoutBase)
	if base == "" {
		base = BlockscoutBase
	}
	base = strings.TrimRight(base, "/")
	ua := cfg.UserAgent
	if ua == "" {
		ua = DefaultUserAgent
	}
	hc := cfg.HTTPClient
	if hc == nil {
		timeout := cfg.Timeout
		if timeout == 0 {
			timeout = 30 * time.Second
		}
		hc = &http.Client{Timeout: timeout}
	}
	return &Client{
		rpcURL:           rpc,
		blockscoutBase:   base,
		blockscoutAPIKey: strings.TrimSpace(cfg.BlockscoutAPIKey),
		chainID:          chainID,
		httpClient:       hc,
		userAgent:        ua,
	}
}

// RPCURL returns the resolved JSON-RPC endpoint.
func (c *Client) RPCURL() string { return c.rpcURL }

// ChainID returns the configured chain id (4663 for RH mainnet).
func (c *Client) ChainID() int { return c.chainID }

// BlockscoutBase returns the PRO API base URL.
func (c *Client) BlockscoutBase() string { return c.blockscoutBase }

// HasBlockscoutKey reports whether a PRO API key is set.
func (c *Client) HasBlockscoutKey() bool {
	return strings.TrimSpace(c.blockscoutAPIKey) != ""
}

// ── JSON-RPC ─────────────────────────────────────────────────────────

type jsonRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params"`
}

type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// CallRPC issues a JSON-RPC method against RH_RPC_URL (or public fallback).
func (c *Client) CallRPC(ctx context.Context, method string, params any) (json.RawMessage, error) {
	if params == nil {
		params = []any{}
	}
	body, err := json.Marshal(jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", c.userAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("rh rpc %s: HTTP %d: %s", method, resp.StatusCode, truncate(string(raw), 200))
	}
	var out jsonRPCResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("rh rpc decode: %w", err)
	}
	if out.Error != nil {
		return nil, fmt.Errorf("rh rpc %s: %s (%d)", method, out.Error.Message, out.Error.Code)
	}
	return out.Result, nil
}

// EthChainID calls eth_chainId and returns the numeric chain id.
func (c *Client) EthChainID(ctx context.Context) (int64, error) {
	raw, err := c.CallRPC(ctx, "eth_chainId", []any{})
	if err != nil {
		return 0, err
	}
	var hexStr string
	if err := json.Unmarshal(raw, &hexStr); err != nil {
		return 0, err
	}
	hexStr = strings.TrimPrefix(strings.TrimSpace(hexStr), "0x")
	n, err := strconv.ParseInt(hexStr, 16, 64)
	if err != nil {
		return 0, fmt.Errorf("parse chain id %q: %w", hexStr, err)
	}
	return n, nil
}

// ── Blockscout PRO ───────────────────────────────────────────────────

// BuildModuleAPIURL builds the Etherscan-compatible PRO module URL for chain 4663
// with apikey query parameter. Does not perform the request.
func (c *Client) BuildModuleAPIURL(module, action string, extra url.Values) string {
	q := url.Values{}
	q.Set("chain_id", strconv.Itoa(c.chainID))
	q.Set("module", module)
	q.Set("action", action)
	if c.blockscoutAPIKey != "" {
		q.Set("apikey", c.blockscoutAPIKey)
	}
	for k, vs := range extra {
		for _, v := range vs {
			q.Add(k, v)
		}
	}
	return c.blockscoutBase + "/v2/api?" + q.Encode()
}

// BuildRESTURL builds a REST path under /{chain_id}/api/v2/... with apikey query.
// pathSuffix is relative (e.g. "addresses/0x…/transactions" or "stats").
func (c *Client) BuildRESTURL(pathSuffix string) string {
	pathSuffix = strings.TrimPrefix(pathSuffix, "/")
	u := fmt.Sprintf("%s/%d/api/v2/%s", c.blockscoutBase, c.chainID, pathSuffix)
	if c.blockscoutAPIKey != "" {
		sep := "?"
		if strings.Contains(u, "?") {
			sep = "&"
		}
		u += sep + "apikey=" + url.QueryEscape(c.blockscoutAPIKey)
	}
	return u
}

// BuildJSONRPCURL returns the Blockscout-hosted JSON-RPC gateway for this chain.
func (c *Client) BuildJSONRPCURL() string {
	return fmt.Sprintf("%s/%d/json-rpc", c.blockscoutBase, c.chainID)
}

// GetModuleAPI performs a Blockscout PRO module/action GET with apikey query.
func (c *Client) GetModuleAPI(ctx context.Context, module, action string, extra url.Values) ([]byte, error) {
	u := c.BuildModuleAPIURL(module, action, extra)
	return c.doBlockscoutGET(ctx, u, false)
}

// GetREST performs a Blockscout PRO REST GET with Bearer auth (and apikey query).
func (c *Client) GetREST(ctx context.Context, pathSuffix string) ([]byte, error) {
	u := c.BuildRESTURL(pathSuffix)
	return c.doBlockscoutGET(ctx, u, true)
}

// PostBlockscoutJSONRPC POSTs a JSON-RPC body to the PRO gateway with Bearer auth.
func (c *Client) PostBlockscoutJSONRPC(ctx context.Context, method string, params any) (json.RawMessage, error) {
	if params == nil {
		params = []any{}
	}
	body, err := json.Marshal(jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      0,
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BuildJSONRPCURL(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	c.setBlockscoutHeaders(req, true)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("blockscout json-rpc: HTTP %d: %s", resp.StatusCode, truncate(string(raw), 200))
	}
	var out jsonRPCResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	if out.Error != nil {
		return nil, fmt.Errorf("blockscout json-rpc %s: %s", method, out.Error.Message)
	}
	return out.Result, nil
}

func (c *Client) doBlockscoutGET(ctx context.Context, fullURL string, bearer bool) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}
	c.setBlockscoutHeaders(req, bearer)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("blockscout GET: HTTP %d: %s", resp.StatusCode, truncate(string(raw), 200))
	}
	return raw, nil
}

func (c *Client) setBlockscoutHeaders(req *http.Request, bearer bool) {
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", c.userAgent)
	if bearer && c.blockscoutAPIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.blockscoutAPIKey)
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
