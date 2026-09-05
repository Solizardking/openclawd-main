// Package mcp provides Model Context Protocol integration for ClawdBot / Clawd Bot.
//
// Primary production path: Blockscout hosted MCP (streamable HTTP) at
// https://mcp.blockscout.com/mcp, authenticated with the PRO API key from
// BLOCKSCOUT_API_KEY via the Blockscout-MCP-Pro-Api-Key header.
//
// Agents can also call the same tools over the MCP REST surface
// (https://mcp.blockscout.com/v1/{tool}) using CallREST.
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// ErrMissingAPIKey is returned when tool/load paths need a PRO key and none is set.
// Message points operators at env names and the free portal — never pretends MCP is live.
var ErrMissingAPIKey = errors.New(
	"BLOCKSCOUT_API_KEY missing — set proapi_… via export BLOCKSCOUT_API_KEY (or alias BLOCKSCOUT_PRO_API_KEY) from https://dev.blockscout.com; required for Blockscout MCP at https://mcp.blockscout.com/mcp",
)

// RequireAPIKey returns ErrMissingAPIKey when apiKey is empty after trim.
func RequireAPIKey(apiKey string) error {
	if strings.TrimSpace(apiKey) == "" {
		return ErrMissingAPIKey
	}
	return nil
}

const (
	// Blockscout hosted MCP (streamable HTTP).
	BlockscoutServerName = "blockscout"
	BlockscoutMCPURL     = "https://mcp.blockscout.com/mcp"
	BlockscoutRESTBase   = "https://mcp.blockscout.com/v1"
	BlockscoutHealthURL  = "https://mcp.blockscout.com/health"

	// Auth header for client-supplied PRO keys (proapi_…).
	// Docs: https://github.com/blockscout/mcp-server
	BlockscoutProAPIKeyHeader    = "Blockscout-MCP-Pro-Api-Key"
	BlockscoutIntermediaryHeader = "Blockscout-MCP-Intermediary"
	BlockscoutIntermediaryValue  = "ClawdBot"

	// Default MCP client timeout for host configs (ms).
	DefaultTimeoutMS = 180_000

	// Robinhood Chain — default chain for RH agent workflows.
	DefaultChainID = 4663
)

// restBase is the MCP REST prefix (overridable in tests).
var restBase = BlockscoutRESTBase

// healthURL is the public health endpoint (overridable in tests).
var healthURL = BlockscoutHealthURL

// Known Blockscout MCP tool names (MCP protocol names; REST unlock omits underscores).
var BlockscoutTools = []string{
	"__unlock_blockchain_analysis__",
	"get_chains_list",
	"get_address_by_ens_name",
	"lookup_token_by_symbol",
	"get_contract_abi",
	"inspect_contract_code",
	"get_address_info",
	"get_tokens_by_address",
	"get_block_number",
	"get_transactions_by_address",
	"get_token_transfers_by_address",
	"nft_tokens_by_address",
	"get_block_info",
	"get_transaction_info",
	"read_contract",
	"direct_api_call",
}

type MCPTool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"input_schema,omitempty"`
}

type ServerConnection struct {
	Name      string            `json:"name"`
	URL       string            `json:"url"`
	Transport string            `json:"transport,omitempty"`
	Tools     []MCPTool         `json:"tools,omitempty"`
	Running   bool              `json:"running"`
	Headers   map[string]string `json:"-"` // never serialize secrets
	HasAuth   bool              `json:"hasAuth"`
}

type MCPConfig struct {
	Enabled   bool                    `json:"enabled"`
	Servers   map[string]ServerConfig `json:"servers"`
	Discovery DiscoveryConfig         `json:"discovery"`
}

type ServerConfig struct {
	Command   string            `json:"command,omitempty"`
	Args      []string          `json:"args,omitempty"`
	Env       map[string]string `json:"env,omitempty"`
	URL       string            `json:"url,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
	TimeoutMS int               `json:"timeout,omitempty"`
	// Transport: "http" | "streamablehttp" | "stdio" (empty ⇒ inferred from URL/command).
	Transport string `json:"transport,omitempty"`
}

type DiscoveryConfig struct {
	Enabled          bool `json:"enabled"`
	UseBM25          bool `json:"use_bm25"`
	UseRegex         bool `json:"use_regex"`
	TTL              int  `json:"ttl"`
	MaxSearchResults int  `json:"max_search_results"`
}

// BlockscoutStatus is secret-safe readiness for doctor / API surfaces.
type BlockscoutStatus struct {
	Configured     bool     `json:"configured"`
	ServerName     string   `json:"serverName"`
	URL            string   `json:"url"`
	RESTBase       string   `json:"restBase"`
	HeaderName     string   `json:"headerName"`
	DefaultChainID int      `json:"defaultChainId"`
	Tools          []string `json:"tools"`
	Message        string   `json:"message"`
	// KeySuffix is the last 4 chars of the PRO key when configured (never the full key).
	KeySuffix string `json:"keySuffix,omitempty"`
}

// Manager tracks configured MCP servers for the agent runtime.
type Manager struct {
	mu      sync.RWMutex
	servers map[string]*ServerConnection
	client  *http.Client
}

func NewManager() *Manager {
	return &Manager{
		servers: make(map[string]*ServerConnection),
		client:  &http.Client{Timeout: 60 * time.Second},
	}
}

// BlockscoutServerConfig builds a host ServerConfig for the hosted Blockscout MCP.
// apiKey should be the proapi_… value from BLOCKSCOUT_API_KEY (may be empty for
// free/read tools; most data tools require a key).
func BlockscoutServerConfig(apiKey string) ServerConfig {
	url := strings.TrimSpace(os.Getenv("BLOCKSCOUT_MCP_URL"))
	if url == "" {
		url = BlockscoutMCPURL
	}
	sc := ServerConfig{
		URL:       url,
		Transport: "http",
		TimeoutMS: DefaultTimeoutMS,
		Headers: map[string]string{
			BlockscoutIntermediaryHeader: BlockscoutIntermediaryValue,
		},
	}
	if k := strings.TrimSpace(apiKey); k != "" {
		sc.Headers[BlockscoutProAPIKeyHeader] = k
	}
	return sc
}

// EnsureBlockscout injects or refreshes the blockscout server entry when a PRO
// key is available (or when force is true). Does not enable MCPConfig when the
// key is missing unless force is set.
func EnsureBlockscout(cfg *MCPConfig, apiKey string, force bool) {
	if cfg == nil {
		return
	}
	key := strings.TrimSpace(apiKey)
	if key == "" && !force {
		return
	}
	if cfg.Servers == nil {
		cfg.Servers = make(map[string]ServerConfig)
	}
	cfg.Servers[BlockscoutServerName] = BlockscoutServerConfig(key)
	if key != "" || force {
		cfg.Enabled = true
	}
}

// DefaultConfigWithBlockscout returns an MCPConfig with Blockscout wired from
// the given PRO API key (typically cfg.Robinhood.BlockscoutAPIKey).
func DefaultConfigWithBlockscout(apiKey string) MCPConfig {
	cfg := MCPConfig{
		Enabled: strings.TrimSpace(apiKey) != "",
		Servers: map[string]ServerConfig{},
		Discovery: DiscoveryConfig{
			Enabled:          true,
			TTL:              300,
			MaxSearchResults: 20,
		},
	}
	EnsureBlockscout(&cfg, apiKey, strings.TrimSpace(apiKey) != "")
	return cfg
}

// AssessBlockscout returns secret-safe MCP readiness from a PRO key.
func AssessBlockscout(apiKey string) BlockscoutStatus {
	key := strings.TrimSpace(apiKey)
	st := BlockscoutStatus{
		Configured:     key != "",
		ServerName:     BlockscoutServerName,
		URL:            BlockscoutMCPURL,
		RESTBase:       BlockscoutRESTBase,
		HeaderName:     BlockscoutProAPIKeyHeader,
		DefaultChainID: DefaultChainID,
		Tools:          append([]string(nil), BlockscoutTools...),
	}
	if key != "" {
		if n := len(key); n >= 4 {
			st.KeySuffix = key[n-4:]
		}
		st.Message = "BLOCKSCOUT_API_KEY configured — Blockscout MCP host ready (header " + BlockscoutProAPIKeyHeader + ")"
	} else {
		st.Message = "BLOCKSCOUT_API_KEY missing — set proapi_… from https://dev.blockscout.com for MCP data tools"
	}
	if v := strings.TrimSpace(os.Getenv("BLOCKSCOUT_MCP_URL")); v != "" {
		st.URL = v
	}
	return st
}

// ResolveAPIKey returns BLOCKSCOUT_API_KEY, then BLOCKSCOUT_PRO_API_KEY.
func ResolveAPIKey() string {
	if v := strings.TrimSpace(os.Getenv("BLOCKSCOUT_API_KEY")); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv("BLOCKSCOUT_PRO_API_KEY"))
}

func (m *Manager) LoadFromConfig(ctx context.Context, cfg MCPConfig, workspace string) error {
	_ = ctx
	_ = workspace
	if !cfg.Enabled {
		return nil
	}

	for name, sc := range cfg.Servers {
		conn := &ServerConnection{
			Name:      name,
			URL:       sc.URL,
			Transport: sc.Transport,
			Running:   strings.TrimSpace(sc.URL) != "" || strings.TrimSpace(sc.Command) != "",
			Headers:   cloneHeaders(sc.Headers),
			HasAuth:   hasAuthHeader(sc.Headers),
		}
		if name == BlockscoutServerName {
			for _, tool := range BlockscoutTools {
				conn.Tools = append(conn.Tools, MCPTool{Name: tool})
			}
		}
		m.mu.Lock()
		m.servers[name] = conn
		m.mu.Unlock()
	}

	return nil
}

// LoadBlockscoutFromEnv configures the manager with Blockscout from process env.
func (m *Manager) LoadBlockscoutFromEnv(ctx context.Context) error {
	return m.LoadFromConfig(ctx, DefaultConfigWithBlockscout(ResolveAPIKey()), "")
}

func (m *Manager) GetServers() map[string]*ServerConnection {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make(map[string]*ServerConnection, len(m.servers))
	for k, v := range m.servers {
		// Shallow copy without headers.
		cp := *v
		cp.Headers = nil
		result[k] = &cp
	}
	return result
}

// CallTool invokes an MCP tool. For Blockscout, uses the hosted REST API
// (same response shape as native MCP tools). Fails closed without a PRO key.
func (m *Manager) CallTool(ctx context.Context, server, tool string, input map[string]any) (string, error) {
	m.mu.RLock()
	conn, ok := m.servers[server]
	m.mu.RUnlock()
	if !ok {
		if server == BlockscoutServerName {
			if err := RequireAPIKey(ResolveAPIKey()); err != nil {
				return "", fmt.Errorf("%w: Blockscout MCP server is not loaded — configure the key then LoadBlockscoutFromEnv / EnsureBlockscout", err)
			}
			return "", fmt.Errorf("MCP server not found: %s — call LoadFromConfig or LoadBlockscoutFromEnv first", server)
		}
		return "", fmt.Errorf("MCP server not found: %s", server)
	}

	if server == BlockscoutServerName || strings.Contains(conn.URL, "blockscout.com") {
		apiKey := ""
		if conn.Headers != nil {
			apiKey = conn.Headers[BlockscoutProAPIKeyHeader]
		}
		if apiKey == "" {
			apiKey = ResolveAPIKey()
		}
		if err := RequireAPIKey(apiKey); err != nil {
			return "", err
		}
		return CallREST(ctx, m.httpClient(), apiKey, tool, input)
	}

	return fmt.Sprintf("[mcp] %s/%s called (stub — no transport for this server)", server, tool), nil
}

func (m *Manager) httpClient() *http.Client {
	if m.client != nil {
		return m.client
	}
	return &http.Client{Timeout: 60 * time.Second}
}

func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.servers = make(map[string]*ServerConnection)
	return nil
}

// CallREST calls a Blockscout MCP tool over HTTP GET /v1/{tool}.
// Tool names may use MCP form (__unlock_blockchain_analysis__) or REST form
// (unlock_blockchain_analysis).
//
// Fails closed without a PRO API key (no network call) so callers never pretend
// the Blockscout MCP data path is live when BLOCKSCOUT_API_KEY is unset.
func CallREST(ctx context.Context, client *http.Client, apiKey, tool string, params map[string]any) (string, error) {
	if err := RequireAPIKey(apiKey); err != nil {
		return "", err
	}
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}
	restTool := restToolName(tool)
	if restTool == "" {
		return "", fmt.Errorf("empty tool name")
	}

	u, err := url.Parse(strings.TrimRight(restBase, "/") + "/" + restTool)
	if err != nil {
		return "", err
	}
	q := u.Query()
	for k, v := range params {
		if v == nil {
			continue
		}
		switch t := v.(type) {
		case string:
			if t != "" {
				q.Set(k, t)
			}
		case fmt.Stringer:
			q.Set(k, t.String())
		case bool:
			q.Set(k, fmt.Sprintf("%t", t))
		case float64:
			// JSON numbers decode as float64; chain_id should be integer string.
			if t == float64(int64(t)) {
				q.Set(k, fmt.Sprintf("%d", int64(t)))
			} else {
				q.Set(k, fmt.Sprintf("%v", t))
			}
		case int:
			q.Set(k, fmt.Sprintf("%d", t))
		case int64:
			q.Set(k, fmt.Sprintf("%d", t))
		case json.Number:
			q.Set(k, t.String())
		default:
			b, err := json.Marshal(t)
			if err != nil {
				q.Set(k, fmt.Sprintf("%v", t))
			} else {
				q.Set(k, string(b))
			}
		}
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ClawdBot/"+BlockscoutIntermediaryValue)
	// Key already validated by RequireAPIKey — always bind the PRO header.
	req.Header.Set(BlockscoutProAPIKeyHeader, strings.TrimSpace(apiKey))
	req.Header.Set(BlockscoutIntermediaryHeader, BlockscoutIntermediaryValue)

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("blockscout mcp rest: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("blockscout mcp rest %s: HTTP %d: %s", restTool, resp.StatusCode, truncate(string(body), 300))
	}
	return string(body), nil
}

// restToolName maps MCP tool names to REST path segments.
func restToolName(tool string) string {
	t := strings.TrimSpace(tool)
	// MCP unlock uses double underscores; REST uses unlock_blockchain_analysis.
	if t == "__unlock_blockchain_analysis__" || t == "unlock_blockchain_analysis" {
		return "unlock_blockchain_analysis"
	}
	return strings.Trim(t, "/")
}

// ProbeHealth hits the public /health endpoint (no API key required).
func ProbeHealth(ctx context.Context, client *http.Client) error {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("blockscout mcp health: HTTP %d", resp.StatusCode)
	}
	return nil
}

// HostConfigCursor returns a Cursor-compatible mcp.json document.
// When redact is true, the API key is replaced with an env-style placeholder.
func HostConfigCursor(apiKey string, redact bool) map[string]any {
	key := strings.TrimSpace(apiKey)
	if redact || key == "" {
		key = "${BLOCKSCOUT_API_KEY}"
	}
	return map[string]any{
		"mcpServers": map[string]any{
			BlockscoutServerName: map[string]any{
				"url":     BlockscoutMCPURL,
				"timeout": DefaultTimeoutMS,
				"headers": map[string]string{
					BlockscoutProAPIKeyHeader:    key,
					BlockscoutIntermediaryHeader: BlockscoutIntermediaryValue,
				},
			},
		},
	}
}

// HostConfigCodexTOML returns a Codex config.toml fragment for Blockscout MCP.
func HostConfigCodexTOML(apiKey string, redact bool) string {
	key := strings.TrimSpace(apiKey)
	if redact || key == "" {
		key = "proapi_YOUR_KEY"
	}
	return strings.TrimSpace(fmt.Sprintf(`
[features]
experimental_use_rmcp_client = true

[mcp_servers.Blockscout]
url = %q
http_headers = { %q = %q, %q = %q }
`, BlockscoutMCPURL, BlockscoutProAPIKeyHeader, key, BlockscoutIntermediaryHeader, BlockscoutIntermediaryValue)) + "\n"
}

// HostConfigClaudeCodeCLI returns the `claude mcp add` command (key never echoed
// when redact is true — uses shell expansion of $BLOCKSCOUT_API_KEY).
func HostConfigClaudeCodeCLI(redact bool) string {
	if redact {
		return fmt.Sprintf(
			`claude mcp add --transport http %s %s --header "%s: $BLOCKSCOUT_API_KEY"`,
			BlockscoutServerName, BlockscoutMCPURL, BlockscoutProAPIKeyHeader,
		)
	}
	return fmt.Sprintf(
		`claude mcp add --transport http %s %s --header "%s: proapi_YOUR_KEY"`,
		BlockscoutServerName, BlockscoutMCPURL, BlockscoutProAPIKeyHeader,
	)
}

// MarshalHostConfigJSON returns pretty JSON for Cursor / generic MCP hosts.
func MarshalHostConfigJSON(apiKey string, redact bool) ([]byte, error) {
	return json.MarshalIndent(HostConfigCursor(apiKey, redact), "", "  ")
}

// PublicServerSummary is a secret-safe view of one configured server.
type PublicServerSummary struct {
	Name      string   `json:"name"`
	URL       string   `json:"url,omitempty"`
	Transport string   `json:"transport,omitempty"`
	Running   bool     `json:"running"`
	HasAuth   bool     `json:"hasAuth"`
	ToolNames []string `json:"toolNames,omitempty"`
}

func (m *Manager) PublicSummary() []PublicServerSummary {
	m.mu.RLock()
	defer m.mu.RUnlock()
	names := make([]string, 0, len(m.servers))
	for n := range m.servers {
		names = append(names, n)
	}
	sort.Strings(names)
	out := make([]PublicServerSummary, 0, len(names))
	for _, n := range names {
		s := m.servers[n]
		sum := PublicServerSummary{
			Name:      s.Name,
			URL:       s.URL,
			Transport: s.Transport,
			Running:   s.Running,
			HasAuth:   s.HasAuth,
		}
		for _, t := range s.Tools {
			sum.ToolNames = append(sum.ToolNames, t.Name)
		}
		out = append(out, sum)
	}
	return out
}

func cloneHeaders(in map[string]string) map[string]string {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]string, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func hasAuthHeader(h map[string]string) bool {
	if h == nil {
		return false
	}
	return strings.TrimSpace(h[BlockscoutProAPIKeyHeader]) != ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
