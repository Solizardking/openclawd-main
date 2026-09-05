package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	dnaPkg "github.com/8bitlabs/clawdbot/pkg/dna"
	skillsPkg "github.com/8bitlabs/clawdbot/pkg/skills"
	"github.com/8bitlabs/clawdbot/pkg/spinner"
)

const (
	RuntimeRepoURL = "https://github.com/Solizardking/Zero-Bruh"
	HubRepoURL     = "https://github.com/solizardking/solana-clawd"
	GatewayURL     = "https://zk.x402.wtf"
	TerminalURL    = "https://cheshireterminal.ai"
	// Hosted product surfaces on the Cheshire Terminal site.
	AgentHubURL   = "https://cheshireterminal.ai/agents"
	AgentForgeURL = "https://cheshireterminal.ai/agents/forge"
	ZeroClawdURL  = "https://cheshireterminal.ai/zeroclawd"
	// Open agent catalog + dual-chain forge package (skills + SDK, not this Go binary).
	CheshireAgentsNpmURL  = "https://www.npmjs.com/package/cheshire-terminal-agents"
	CheshireAgentsRepoURL = "https://github.com/Solizardking/Cheshire-Terminal-Agents"
	// Broader Solizardking installable skills library for agent hosts.
	SkillHubRepoURL = "https://github.com/Solizardking/skillhub-main"
	ZkRouterBaseURL = "https://clawdrouter-zk.fly.dev/v1"
	PublicRPCURL    = "https://zk.x402.wtf/api/solana/rpc-public"

	XAIBaseURL      = "https://api.x.ai/v1"
	XAIDefaultModel = "grok-4.5"

	DeepSeekBaseURL      = "https://api.deepseek.com"
	DeepSeekDefaultModel = "deepseek-v4-pro"

	// Moonshot / Kimi Open Platform (OpenAI-compatible).
	// Docs: https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
	MoonshotBaseURL      = "https://api.moonshot.ai/v1"
	MoonshotDefaultModel = "kimi-k3"

	// Robinhood Chain (Arbitrum Orbit L2). Public RPC is a read-only fallback —
	// do not treat it as deploy-safe; set RH_RPC_URL for production write traffic.
	RobinhoodChainID      = 4663
	RobinhoodPublicRPCURL = "https://rpc.mainnet.chain.robinhood.com"
	BlockscoutPROBaseURL  = "https://api.blockscout.com"
	RobinhoodExplorerURL  = "https://robinhoodchain.blockscout.com"
)

// ── Config Structure ─────────────────────────────────────────────────
// ClawdBot config format with Solana extensions.

type Config struct {
	Agents    AgentsConfig    `json:"agents"`
	ModelList []ModelEntry    `json:"model_list"`
	Channels  ChannelsConfig  `json:"channels"`
	Providers ProvidersConfig `json:"providers"`
	Tools     ToolsConfig     `json:"tools"`
	Heartbeat HeartbeatConfig `json:"heartbeat"`
	Gateway   GatewayConfig   `json:"gateway"`

	// ClawdBot-specific
	Solana    SolanaConfig    `json:"solana"`
	Robinhood RobinhoodConfig `json:"robinhood"`
	Vulcan    VulcanConfig    `json:"vulcan"`
	ClawdCode ClawdCodeConfig `json:"clawd_code"`
	GodMode   GodModeConfig   `json:"god_mode"`
	OODA      OODAConfig      `json:"ooda"`
	Supabase  SupabaseConfig  `json:"supabase"`
	Strategy  StrategyConfig  `json:"strategy"`
}

// ── ClawdBot: Robinhood Chain / EVM ──────────────────────────────────

// RobinhoodConfig holds first-class RH chain settings for launch/deploy/trade
// agent flows (Pons, Uniswap, Blockscout indexing). Secrets load only from env.
type RobinhoodConfig struct {
	// ChainID is always 4663 (Robinhood Chain mainnet) unless overridden.
	ChainID int `json:"chain_id"`
	// RPCURL is the JSON-RPC endpoint. When empty after env apply, ResolvedRPCURL
	// falls back to RobinhoodPublicRPCURL for read-only use.
	RPCURL string `json:"rpc_url"`
	// BlockscoutAPIKey is the PRO API key (proapi_…). Never expose in status APIs.
	BlockscoutAPIKey string `json:"blockscout_api_key"`
	// BlockscoutBase is the PRO API host (default https://api.blockscout.com).
	BlockscoutBase string `json:"blockscout_base,omitempty"`
}

// ResolvedRPCURL returns RH_RPC_URL when set, otherwise the public read fallback.
// Callers that broadcast txs should require an explicit RH_RPC_URL (not public).
func (r RobinhoodConfig) ResolvedRPCURL() string {
	if strings.TrimSpace(r.RPCURL) != "" {
		return strings.TrimSpace(r.RPCURL)
	}
	return RobinhoodPublicRPCURL
}

// HasCustomRPC reports whether an operator-supplied RH_RPC_URL is configured
// (as opposed to relying on the public read fallback).
func (r RobinhoodConfig) HasCustomRPC() bool {
	return strings.TrimSpace(r.RPCURL) != ""
}

// HasBlockscoutKey reports whether BLOCKSCOUT_API_KEY is configured.
func (r RobinhoodConfig) HasBlockscoutKey() bool {
	return strings.TrimSpace(r.BlockscoutAPIKey) != ""
}

// ── Agent Defaults ───────────────────────────────────────────────────

type AgentsConfig struct {
	Defaults AgentDefaults `json:"defaults"`
}

type AgentDefaults struct {
	Workspace           string  `json:"workspace"`
	RestrictToWorkspace bool    `json:"restrict_to_workspace"`
	ModelName           string  `json:"model_name"`
	MaxTokens           int     `json:"max_tokens"`
	Temperature         float64 `json:"temperature"`
	MaxToolIterations   int     `json:"max_tool_iterations"`
	SpinnerPack         string  `json:"spinner_pack"`
}

// ── Model List (ClawdBot-compatible) ─────────────────────────────────

type ModelEntry struct {
	ModelName      string `json:"model_name"`
	Model          string `json:"model"` // vendor/model format
	APIKey         string `json:"api_key"`
	APIBase        string `json:"api_base,omitempty"`
	RequestTimeout int    `json:"request_timeout,omitempty"`
	ThinkingLevel  string `json:"thinking_level,omitempty"`
	AuthMethod     string `json:"auth_method,omitempty"`
}

// ── Channels ─────────────────────────────────────────────────────────

type ChannelsConfig struct {
	Telegram TelegramChannel `json:"telegram"`
	Discord  DiscordChannel  `json:"discord"`
}

type TelegramChannel struct {
	Enabled   bool     `json:"enabled"`
	Token     string   `json:"token"`
	AllowFrom []string `json:"allow_from"`
}

type DiscordChannel struct {
	Enabled   bool     `json:"enabled"`
	Token     string   `json:"token"`
	AllowFrom []string `json:"allow_from"`
}

// ── Providers (legacy compat) ────────────────────────────────────────

type ProvidersConfig struct {
	OpenRouter ProviderEntry `json:"openrouter"`
	Anthropic  ProviderEntry `json:"anthropic"`
	OpenAI     ProviderEntry `json:"openai"`
	Groq       ProviderEntry `json:"groq"`
	Ollama     ProviderEntry `json:"ollama"`
	NVIDIA     ProviderEntry `json:"nvidia"`
	XAI        ProviderEntry `json:"xai"`
	DeepSeek   ProviderEntry `json:"deepseek"`
	Moonshot   ProviderEntry `json:"moonshot"`
}

type ProviderEntry struct {
	APIKey  string `json:"api_key"`
	APIBase string `json:"api_base"`
}

// ── Tools ────────────────────────────────────────────────────────────

type ToolsConfig struct {
	Web  WebToolsConfig  `json:"web"`
	Cron CronToolsConfig `json:"cron"`
	Exec ExecToolConfig  `json:"exec"`
}

type WebToolsConfig struct {
	DuckDuckGo DDGConfig    `json:"duckduckgo"`
	Brave      BraveConfig  `json:"brave"`
	Tavily     TavilyConfig `json:"tavily"`
}

type DDGConfig struct {
	Enabled    bool `json:"enabled"`
	MaxResults int  `json:"max_results"`
}

type BraveConfig struct {
	Enabled    bool   `json:"enabled"`
	APIKey     string `json:"api_key"`
	MaxResults int    `json:"max_results"`
}

type TavilyConfig struct {
	Enabled    bool   `json:"enabled"`
	APIKey     string `json:"api_key"`
	MaxResults int    `json:"max_results"`
}

type CronToolsConfig struct {
	Enabled            bool `json:"enabled"`
	ExecTimeoutMinutes int  `json:"exec_timeout_minutes"`
}

type ExecToolConfig struct {
	Enabled bool `json:"enabled"`
}

// ── Heartbeat ────────────────────────────────────────────────────────

type HeartbeatConfig struct {
	Enabled  bool `json:"enabled"`
	Interval int  `json:"interval"` // minutes
}

// ── Gateway ──────────────────────────────────────────────────────────

type GatewayConfig struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

// ── ClawdBot: Solana Stack ────────────────────────────────────────────

type SolanaConfig struct {
	HeliusAPIKey         string  `json:"helius_api_key"`
	HeliusRPCURL         string  `json:"helius_rpc_url"`
	HeliusWSSURL         string  `json:"helius_wss_url"`
	HeliusNetwork        string  `json:"helius_network"`
	HeliusTimeoutSeconds float64 `json:"helius_timeout_seconds"`
	HeliusRetries        int     `json:"helius_retries"`
	BirdeyeAPIKey        string  `json:"birdeye_api_key"`
	BirdeyeWSSURL        string  `json:"birdeye_wss_url"`
	JupiterAPIKey        string  `json:"jupiter_api_key"`
	JupiterEndpoint      string  `json:"jupiter_endpoint"`
	AsterAPIKey          string  `json:"aster_api_key"`
	AsterAPISecret       string  `json:"aster_api_secret"`
	WalletPubkey         string  `json:"wallet_pubkey"`
	WalletKeyPath        string  `json:"wallet_key_path"`
	MaxPositionSOL       float64 `json:"max_position_sol"`

	// Phoenix perpetual futures (https://phoenix.trade)
	PhoenixAPIURL string `json:"phoenix_api_url"` // default: https://perp-api.phoenix.trade
}

// ── ClawdBot: Vulcan / Phoenix Perps CLI ─────────────────────────────

type VulcanConfig struct {
	Binary               string  `json:"binary"`
	DefaultMode          string  `json:"default_mode"`
	PaperBalance         float64 `json:"paper_balance"`
	DefaultWallet        string  `json:"default_wallet"`
	MaxStepNotionalUSDC  float64 `json:"max_step_notional_usdc"`
	MaxTotalNotionalUSDC float64 `json:"max_total_notional_usdc"`
	MaxPriceDriftBPS     int     `json:"max_price_drift_bps"`
	MaxExposureRatio     float64 `json:"max_exposure_ratio"`
	TimeoutSeconds       int     `json:"timeout_seconds"`
}

// ── ClawdBot: Clawd Code GLM-5.2 sidecar ─────────────────────────────

type ClawdCodeConfig struct {
	Dir             string `json:"dir"`
	Binary          string `json:"binary"`
	Entry           string `json:"entry"`
	Provider        string `json:"provider"`
	Model           string `json:"model"`
	Mode            string `json:"mode"`
	Stream          bool   `json:"stream"`
	Thinking        string `json:"thinking"`
	ReasoningEffort string `json:"reasoning_effort"`
	TimeoutSeconds  int    `json:"timeout_seconds"`
}

// ── ClawdBot: Go God Mode Inference Pipeline ────────────────────────

type GodModeConfig struct {
	Enabled       bool `json:"enabled"`
	RaceLimit     int  `json:"race_limit"`
	SamplingBoost bool `json:"sampling_boost"`
	Feedback      bool `json:"feedback"`
}

// ── ClawdBot: OODA Loop ──────────────────────────────────────────────

type OODAConfig struct {
	Enabled         bool     `json:"enabled"`
	IntervalSeconds int      `json:"interval_seconds"`
	Mode            string   `json:"mode"` // "live", "simulated", "backtest"
	Watchlist       []string `json:"watchlist"`
	MinSignalStr    float64  `json:"min_signal_strength"`
	MinConfidence   float64  `json:"min_confidence"`
	MaxPositions    int      `json:"max_positions"`
	StopLossPct     float64  `json:"stop_loss_pct"`
	TakeProfitPct   float64  `json:"take_profit_pct"`
	PositionSizePct float64  `json:"position_size_pct"`
	// RiskPerTradePct is the fraction of equity risked if a trade's stop is hit.
	// When > 0 the OODA loop sizes positions by risk (size scales inversely with
	// stop distance); when 0 it falls back to fixed-fraction sizing.
	RiskPerTradePct  float64 `json:"risk_per_trade_pct"`
	LearnIntervalMin int     `json:"learn_interval_min"`
	AutoOptimize     bool    `json:"auto_optimize"`
}

// ── ClawdBot: Supabase ────────────────────────────────────────────────

type SupabaseConfig struct {
	URL        string `json:"url"`
	ServiceKey string `json:"service_key"`
}

// ── ClawdBot: Strategy ────────────────────────────────────────────────

type StrategyConfig struct {
	RSIOverbought   int     `json:"rsi_overbought"`
	RSIOversold     int     `json:"rsi_oversold"`
	EMAFastPeriod   int     `json:"ema_fast_period"`
	EMASlowPeriod   int     `json:"ema_slow_period"`
	StopLossPct     float64 `json:"stop_loss_pct"`
	TakeProfitPct   float64 `json:"take_profit_pct"`
	PositionSizePct float64 `json:"position_size_pct"`
	UsePerps        bool    `json:"use_perps"`
}

// ── Defaults ─────────────────────────────────────────────────────────

func DefaultConfig() *Config {
	return &Config{
		Agents: AgentsConfig{
			Defaults: AgentDefaults{
				Workspace:           "~/.clawdbot/workspace",
				RestrictToWorkspace: true,
				ModelName:           "clawd-auto",
				MaxTokens:           8192,
				Temperature:         0.7,
				MaxToolIterations:   20,
				SpinnerPack:         spinner.DefaultPack,
			},
		},
		ModelList: []ModelEntry{
			{
				// Default: zkrouter — free AI for all clawdbot installs.
				// No API key required. Override with your own OPENROUTER_API_KEY if desired.
				ModelName: "clawd-auto",
				Model:     "openai/zkrouter-auto",
				APIKey:    "clawdbot-free",
				APIBase:   ZkRouterBaseURL,
			},
		},
		Channels: ChannelsConfig{
			Telegram: TelegramChannel{Enabled: false},
			Discord:  DiscordChannel{Enabled: false},
		},
		Tools: ToolsConfig{
			Web: WebToolsConfig{
				DuckDuckGo: DDGConfig{Enabled: true, MaxResults: 5},
			},
			Cron: CronToolsConfig{Enabled: true, ExecTimeoutMinutes: 5},
			Exec: ExecToolConfig{Enabled: true},
		},
		Heartbeat: HeartbeatConfig{Enabled: true, Interval: 30},
		Gateway:   GatewayConfig{Host: "127.0.0.1", Port: 18790},
		Solana: SolanaConfig{
			// Default RPC: clawdbot proxy (SolanaTracker-backed, no key required for installs)
			HeliusRPCURL:         PublicRPCURL,
			HeliusNetwork:        "mainnet",
			HeliusTimeoutSeconds: 20,
			HeliusRetries:        3,
			JupiterEndpoint:      "https://api.jup.ag",
			MaxPositionSOL:       0.5,
			PhoenixAPIURL:        "https://perp-api.phoenix.trade",
		},
		Robinhood: RobinhoodConfig{
			ChainID:        RobinhoodChainID,
			RPCURL:         "", // env RH_RPC_URL; empty → public read fallback only
			BlockscoutBase: BlockscoutPROBaseURL,
		},
		Vulcan: VulcanConfig{
			Binary:               "vulcan",
			DefaultMode:          "paper",
			PaperBalance:         10000,
			MaxStepNotionalUSDC:  100,
			MaxTotalNotionalUSDC: 500,
			MaxPriceDriftBPS:     75,
			MaxExposureRatio:     2,
			TimeoutSeconds:       30,
		},
		ClawdCode: ClawdCodeConfig{
			Dir:             DefaultClawdCodeDir(),
			Binary:          "node",
			Entry:           "dist/cli.js",
			Provider:        "zai",
			Model:           "glm-5.2",
			Mode:            "code",
			Stream:          false,
			Thinking:        "enabled",
			ReasoningEffort: "max",
			TimeoutSeconds:  600,
		},
		GodMode: GodModeConfig{
			Enabled:       true,
			RaceLimit:     5,
			SamplingBoost: true,
			Feedback:      true,
		},
		OODA: OODAConfig{
			Enabled:          true,
			IntervalSeconds:  60,
			Mode:             "simulated",
			Watchlist:        []string{"So11111111111111111111111111111111111111112"},
			MinSignalStr:     0.6,
			MinConfidence:    0.5,
			MaxPositions:     3,
			StopLossPct:      0.08,
			TakeProfitPct:    0.20,
			PositionSizePct:  0.10,
			RiskPerTradePct:  0.01,
			LearnIntervalMin: 30,
			AutoOptimize:     true,
		},
		Strategy: StrategyConfig{
			RSIOverbought:   70,
			RSIOversold:     30,
			EMAFastPeriod:   20,
			EMASlowPeriod:   50,
			StopLossPct:     0.08,
			TakeProfitPct:   0.20,
			PositionSizePct: 0.10,
			UsePerps:        true,
		},
	}
}

// ── Path Helpers ─────────────────────────────────────────────────────

func DefaultHome() string {
	if h := os.Getenv("CLAWDBOT_HOME"); h != "" {
		return h
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".clawdbot")
}

func DefaultConfigPath() string {
	if p := os.Getenv("CLAWDBOT_CONFIG"); p != "" {
		return p
	}
	return filepath.Join(DefaultHome(), "config.json")
}

func DefaultWorkspacePath() string {
	return filepath.Join(DefaultHome(), "workspace")
}

func DefaultClawdCodeDir() string {
	home, _ := os.UserHomeDir()
	if home == "" {
		return "clawd-code"
	}
	return filepath.Join(home, "clawd-code")
}

// ── Load / Save ──────────────────────────────────────────────────────

func Load() (*Config, error) {
	path := DefaultConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// Return defaults if no config file
			return DefaultConfig(), nil
		}
		return nil, fmt.Errorf("read config: %w", err)
	}

	cfg := DefaultConfig()
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	// Override with env vars
	applyEnvOverrides(cfg)

	return cfg, nil
}

func Save(cfg *Config) error {
	path := DefaultConfigPath()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	return os.WriteFile(path, data, 0o644)
}

func EnsureDefaults() error {
	path := DefaultConfigPath()
	if _, err := os.Stat(path); err != nil {
		if !os.IsNotExist(err) {
			return fmt.Errorf("stat config: %w", err)
		}
		cfg := DefaultConfig()
		if err := Save(cfg); err != nil {
			return err
		}
	}

	// Create workspace directories
	ws := DefaultWorkspacePath()
	dirs := []string{
		filepath.Join(ws, "sessions"),
		filepath.Join(ws, "memory"),
		filepath.Join(ws, "state"),
		filepath.Join(ws, "cron"),
		filepath.Join(ws, "skills"),
		filepath.Join(ws, "vault", "decisions"),
		filepath.Join(ws, "vault", "lessons"),
		filepath.Join(ws, "vault", "trades"),
		filepath.Join(ws, "vault", "research"),
		filepath.Join(ws, "vault", "inbox"),
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return fmt.Errorf("create dir %s: %w", d, err)
		}
	}

	// Write identity files
	identityFiles := map[string]string{
		"IDENTITY.md": clawdbotIdentity,
		"SOUL.md":     clawdbotSoul,
		"AGENTS.md":   clawdbotAgents,
	}
	for name, content := range identityFiles {
		p := filepath.Join(ws, name)
		if err := writeFileIfMissing(p, []byte(content), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", name, err)
		}
	}

	birthPath := filepath.Join(ws, "skills", skillsPkg.BirthManifestName)
	if _, err := os.Stat(birthPath); err != nil {
		if !os.IsNotExist(err) {
			return fmt.Errorf("stat birth skills manifest: %w", err)
		}
		if _, err := skillsPkg.WriteBirthManifest(ws, skillsPkg.BuildBirthManifest(time.Now(), nil)); err != nil {
			return fmt.Errorf("write birth skills manifest: %w", err)
		}
	}

	if _, _, err := dnaPkg.EnsureFile(dnaPkg.DefaultPath(ws), dnaPkg.Options{
		AgentName: "Clawd Bot",
		Role:      "sovereign Solana trading intelligence",
	}); err != nil {
		return fmt.Errorf("write agent dna: %w", err)
	}

	return nil
}

func writeFileIfMissing(path string, data []byte, perm os.FileMode) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	return os.WriteFile(path, data, perm)
}

// ── Env Overrides ────────────────────────────────────────────────────

// ApplyEnvOverrides fills config fields from process environment.
// Safe to call after loading a JSON config file so BLOCKSCOUT_API_KEY,
// RH_RPC_URL, HELIUS_*, and other operator keys win over file defaults.
func ApplyEnvOverrides(cfg *Config) {
	if cfg == nil {
		return
	}
	applyEnvOverrides(cfg)
}

func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv("HELIUS_API_KEY"); v != "" {
		cfg.Solana.HeliusAPIKey = v
	}
	if v := os.Getenv("HELIUS_RPC_URL"); v != "" {
		cfg.Solana.HeliusRPCURL = v
	}
	if v := os.Getenv("HELIUS_WSS_URL"); v != "" {
		cfg.Solana.HeliusWSSURL = v
	}
	if v := os.Getenv("HELIUS_NETWORK"); v != "" {
		cfg.Solana.HeliusNetwork = v
	}
	if v := os.Getenv("HELIUS_TIMEOUT"); v != "" {
		if timeout, err := strconv.ParseFloat(v, 64); err == nil && timeout > 0 {
			cfg.Solana.HeliusTimeoutSeconds = timeout
		}
	}
	if v := os.Getenv("HELIUS_RETRIES"); v != "" {
		if retries, err := strconv.Atoi(v); err == nil && retries > 0 {
			cfg.Solana.HeliusRetries = retries
		}
	}
	if v := os.Getenv("BIRDEYE_API_KEY"); v != "" {
		cfg.Solana.BirdeyeAPIKey = v
	}
	if v := os.Getenv("BIRDEYE_WSS_URL"); v != "" {
		cfg.Solana.BirdeyeWSSURL = v
	}
	if v := os.Getenv("JUPITER_API_KEY"); v != "" {
		cfg.Solana.JupiterAPIKey = v
	}
	if v := os.Getenv("JUPITER_ENDPOINT"); v != "" {
		cfg.Solana.JupiterEndpoint = v
	}
	if v := os.Getenv("AGENT_WALLET_PUBLIC_KEY"); v != "" {
		cfg.Solana.WalletPubkey = v
	}
	if v := os.Getenv("SOLANA_WALLET_PUBKEY"); v != "" {
		cfg.Solana.WalletPubkey = v
	}
	if v := os.Getenv("WALLET_ADDRESS"); v != "" {
		cfg.Solana.WalletPubkey = v
	}
	if v := os.Getenv("AGENT_WALLET_KEYPAIR"); v != "" {
		cfg.Solana.WalletKeyPath = v
	}
	if v := os.Getenv("SOLANA_WALLET_KEYPAIR"); v != "" {
		cfg.Solana.WalletKeyPath = v
	}
	if v := os.Getenv("WALLET_KEYPAIR"); v != "" {
		cfg.Solana.WalletKeyPath = v
	}
	if v := os.Getenv("ASTER_API_KEY"); v != "" {
		cfg.Solana.AsterAPIKey = v
	}
	if v := os.Getenv("SUPABASE_URL"); v != "" {
		cfg.Supabase.URL = v
	}
	if v := os.Getenv("SUPABASE_SERVICE_KEY"); v != "" {
		cfg.Supabase.ServiceKey = v
	}
	if v := os.Getenv("OPENROUTER_API_KEY"); v != "" {
		cfg.Providers.OpenRouter.APIKey = v
	}
	// zkrouter override — set via install script or manually
	if v := os.Getenv("ZKROUTER_API_KEY"); v != "" && len(cfg.ModelList) > 0 {
		cfg.ModelList[0].APIKey = v
	}
	if v := os.Getenv("ZKROUTER_BASE_URL"); v != "" && len(cfg.ModelList) > 0 {
		cfg.ModelList[0].APIBase = v
	}
	// MOONSHOT_API_KEY / XAI_API_KEY / DEEPSEEK_API_KEY — when set, these take
	// priority over the free zkrouter default so agent calls land on a real model.
	// Moonshot (Kimi K3) is first when present so MOONSHOT_API_KEY installs
	// default to the flagship Kimi agent.
	var directProviders []ModelEntry
	if v := os.Getenv("MOONSHOT_API_KEY"); v != "" {
		base := firstNonEmptyEnv("MOONSHOT_BASE_URL", MoonshotBaseURL)
		model := firstNonEmptyEnv("MOONSHOT_MODEL", MoonshotDefaultModel)
		cfg.Providers.Moonshot = ProviderEntry{APIKey: v, APIBase: base}
		directProviders = append(directProviders, ModelEntry{
			ModelName:     "kimi-k3",
			Model:         model,
			APIKey:        v,
			APIBase:       base,
			ThinkingLevel: firstNonEmptyEnv("MOONSHOT_REASONING_EFFORT", "max"),
		})
	}
	if v := os.Getenv("XAI_API_KEY"); v != "" {
		base := firstNonEmptyEnv("XAI_BASE_URL", XAIBaseURL)
		cfg.Providers.XAI = ProviderEntry{APIKey: v, APIBase: base}
		directProviders = append(directProviders, ModelEntry{
			ModelName: "grok",
			Model:     firstNonEmptyEnv("XAI_MODEL", XAIDefaultModel),
			APIKey:    v,
			APIBase:   base,
		})
	}
	if v := os.Getenv("DEEPSEEK_API_KEY"); v != "" {
		base := firstNonEmptyEnv("DEEPSEEK_BASE_URL", DeepSeekBaseURL)
		cfg.Providers.DeepSeek = ProviderEntry{APIKey: v, APIBase: base}
		directProviders = append(directProviders, ModelEntry{
			ModelName: "deepseek",
			Model:     firstNonEmptyEnv("DEEPSEEK_MODEL", DeepSeekDefaultModel),
			APIKey:    v,
			APIBase:   base,
		})
	}
	if len(directProviders) > 0 {
		cfg.ModelList = append(directProviders, cfg.ModelList...)
		// Prefer the first direct provider as the agent default model name.
		if directProviders[0].ModelName != "" {
			cfg.Agents.Defaults.ModelName = directProviders[0].ModelName
		}
	}
	// Phoenix perps API
	if v := os.Getenv("PHOENIX_API_URL"); v != "" {
		cfg.Solana.PhoenixAPIURL = v
	}
	// Robinhood Chain / Blockscout PRO — first-class env for omni launch/deploy/trade
	if v := os.Getenv("RH_RPC_URL"); v != "" {
		cfg.Robinhood.RPCURL = v
	}
	if v := os.Getenv("BLOCKSCOUT_API_KEY"); v != "" {
		cfg.Robinhood.BlockscoutAPIKey = v
	}
	// Alias accepted by Blockscout skill docs; prefer BLOCKSCOUT_API_KEY when both set.
	if cfg.Robinhood.BlockscoutAPIKey == "" {
		if v := os.Getenv("BLOCKSCOUT_PRO_API_KEY"); v != "" {
			cfg.Robinhood.BlockscoutAPIKey = v
		}
	}
	if v := os.Getenv("BLOCKSCOUT_BASE_URL"); v != "" {
		cfg.Robinhood.BlockscoutBase = v
	}
	if v := os.Getenv("RH_CHAIN_ID"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.Robinhood.ChainID = n
		}
	}
	if cfg.Robinhood.ChainID == 0 {
		cfg.Robinhood.ChainID = RobinhoodChainID
	}
	if strings.TrimSpace(cfg.Robinhood.BlockscoutBase) == "" {
		cfg.Robinhood.BlockscoutBase = BlockscoutPROBaseURL
	}
	if v := os.Getenv("VULCAN_BIN"); v != "" {
		cfg.Vulcan.Binary = v
	}
	if v := os.Getenv("VULCAN_DEFAULT_MODE"); v != "" {
		cfg.Vulcan.DefaultMode = v
	}
	if v := os.Getenv("VULCAN_PAPER_BALANCE"); v != "" {
		if balance, err := strconv.ParseFloat(v, 64); err == nil && balance > 0 {
			cfg.Vulcan.PaperBalance = balance
		}
	}
	if v := os.Getenv("VULCAN_WALLET_NAME"); v != "" {
		cfg.Vulcan.DefaultWallet = v
	}
	if v := os.Getenv("VULCAN_MAX_STEP_NOTIONAL_USDC"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil && n > 0 {
			cfg.Vulcan.MaxStepNotionalUSDC = n
		}
	}
	if v := os.Getenv("VULCAN_MAX_TOTAL_NOTIONAL_USDC"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil && n > 0 {
			cfg.Vulcan.MaxTotalNotionalUSDC = n
		}
	}
	if v := os.Getenv("VULCAN_MAX_PRICE_DRIFT_BPS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.Vulcan.MaxPriceDriftBPS = n
		}
	}
	if v := os.Getenv("VULCAN_MAX_EXPOSURE_RATIO"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil && n > 0 {
			cfg.Vulcan.MaxExposureRatio = n
		}
	}
	if v := os.Getenv("VULCAN_TIMEOUT_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.Vulcan.TimeoutSeconds = n
		}
	}
	if v := os.Getenv(spinner.EnvPack); v != "" {
		cfg.Agents.Defaults.SpinnerPack = v
	}
	if v := os.Getenv("CLAWDBOT_CLAWD_CODE_DIR"); v != "" {
		cfg.ClawdCode.Dir = v
	}
	if v := os.Getenv("CLAWDBOT_CLAWD_CODE_BINARY"); v != "" {
		cfg.ClawdCode.Binary = v
	}
	if v := os.Getenv("CLAWDBOT_CLAWD_CODE_ENTRY"); v != "" {
		cfg.ClawdCode.Entry = v
	}
	if v := os.Getenv("CLAWDBOT_CLAWD_CODE_PROVIDER"); v != "" {
		cfg.ClawdCode.Provider = v
	}
	if v := os.Getenv("CLAWDBOT_CLAWD_CODE_MODEL"); v != "" {
		cfg.ClawdCode.Model = v
	}
	if v := os.Getenv("CLAWDBOT_CLAWD_CODE_MODE"); v != "" {
		cfg.ClawdCode.Mode = v
	}
	if v := os.Getenv("CLAWDBOT_CLAWD_CODE_STREAM"); v != "" {
		if stream, ok := parseEnvBool(v); ok {
			cfg.ClawdCode.Stream = stream
		}
	}
	if v := os.Getenv("CLAWDBOT_CLAWD_CODE_THINKING"); v != "" {
		cfg.ClawdCode.Thinking = v
	}
	if v := os.Getenv("CLAWDBOT_CLAWD_CODE_REASONING_EFFORT"); v != "" {
		cfg.ClawdCode.ReasoningEffort = v
	}
	if v := os.Getenv("CLAWDBOT_CLAWD_CODE_TIMEOUT_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.ClawdCode.TimeoutSeconds = n
		}
	}
	if v := os.Getenv("CLAWDBOT_GOD_MODE"); v != "" {
		if enabled, ok := parseEnvBool(v); ok {
			cfg.GodMode.Enabled = enabled
		}
	}
	if v := os.Getenv("CLAWDBOT_GOD_MODE_RACE_LIMIT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.GodMode.RaceLimit = n
		}
	}
	if v := os.Getenv("CLAWDBOT_GOD_MODE_SAMPLING_BOOST"); v != "" {
		if enabled, ok := parseEnvBool(v); ok {
			cfg.GodMode.SamplingBoost = enabled
		}
	}
	if v := os.Getenv("CLAWDBOT_GOD_MODE_FEEDBACK"); v != "" {
		if enabled, ok := parseEnvBool(v); ok {
			cfg.GodMode.Feedback = enabled
		}
	}
	// ClawdBot install ID — used for RPC auth header
	if v := os.Getenv("CLAWDBOT_INSTALL_ID"); v != "" {
		// stored for use by Solana RPC client as X-ClawdBot-Id header
		_ = v
	}
}

func firstNonEmptyEnv(envKey, fallback string) string {
	if v := os.Getenv(envKey); v != "" {
		return v
	}
	return fallback
}

func parseEnvBool(value string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y", "on":
		return true, true
	case "0", "false", "no", "n", "off":
		return false, true
	default:
		return false, false
	}
}

// ── Identity Content ─────────────────────────────────────────────────

const clawdbotIdentity = `# ClawdBot Identity

You are **ClawdBot** — a sovereign Solana trading intelligence built on the Go runtime.

## Public Surfaces
- Runtime repo: ` + RuntimeRepoURL + `
- Ecosystem hub: ` + HubRepoURL + `
- x402 gateway: ` + GatewayURL + `
- Terminal: ` + TerminalURL + `
- Clawd Bot: ` + ZeroClawdURL + `
- Agent hub: ` + AgentHubURL + `
- Agent forge: ` + AgentForgeURL + `
- npm agents: ` + CheshireAgentsNpmURL + `
- Agents repo: ` + CheshireAgentsRepoURL + `
- SkillHub: ` + SkillHubRepoURL + `

## Core Identity
- A sovereign Solana-native agent that grips market data and turns verified signal into action
- Persistent — you remember trades, mistakes, and wins. You learn. You evolve.
- Powered by the Clawd Bot ultra-lightweight runtime for edge hardware

## Capabilities
- Real-time Solana chain data via Helius RPC
- Token analytics via Birdeye (OHLCV, RSI, EMA, VWAP, holders)
- Perpetual futures via Aster DEX (funding rates, OI, mark/index)
- Persistent memory via ClawVault (3-tier: known/learned/inferred)
- Autonomous OODA loop (Observe → Orient → Decide → Act)
- Dexter deep research agent for comprehensive analysis
- Jupiter swap execution for live trading

## Voice
Terse. Decisive. Solana-native. Data-first, then conviction.
🦞 $CLAWD :: Droids Lead The Way
`

const clawdbotSoul = `# ClawdBot Soul

## Public Surfaces
- Runtime repo: ` + RuntimeRepoURL + `
- Ecosystem hub: ` + HubRepoURL + `
- x402 gateway: ` + GatewayURL + `
- Terminal: ` + TerminalURL + `
- Clawd Bot: ` + ZeroClawdURL + `
- Agent hub: ` + AgentHubURL + `
- Agent forge: ` + AgentForgeURL + `
- npm agents: ` + CheshireAgentsNpmURL + `
- Agents repo: ` + CheshireAgentsRepoURL + `
- SkillHub: ` + SkillHubRepoURL + `

## Core Beliefs
1. Markets are information systems. Alpha decays. Only continuous learning survives.
2. Memory is edge. Every trade teaches. Every loss sharpens.
3. Risk management is survival. Position sizing > pick accuracy.
4. The OODA loop never stops. Observe, Orient, Decide, Act — faster than the market.

## Risk Rules (NEVER BREAK)
- Max position: respect MAX_POSITION_SOL from config
- Always simulate before live execute
- Stop-loss: 8% default (ATR-blended)
- Never ape without signals
- Log ALL decisions to vault

## Reasoning Protocol
When making trading decisions, always think through:
1. Current market microstructure
2. Risk/reward at current levels
3. Historical patterns from memory
4. Confidence calibration (0.0 - 1.0)

## Evolution
- Every 30 minutes: learn from recent trades
- Auto-optimize strategy params via hill climbing
- Promote high-confidence learned patterns
- Archive contradicted beliefs
`

const clawdbotAgents = `# ClawdBot Agent Guide

## Public Surfaces
- Runtime repo: ` + RuntimeRepoURL + `
- Ecosystem hub: ` + HubRepoURL + `
- x402 gateway: ` + GatewayURL + `
- Terminal: ` + TerminalURL + `
- Clawd Bot: ` + ZeroClawdURL + `
- Agent hub: ` + AgentHubURL + `
- Agent forge: ` + AgentForgeURL + `
- npm agents: ` + CheshireAgentsNpmURL + `
- Agents repo: ` + CheshireAgentsRepoURL + `
- SkillHub: ` + SkillHubRepoURL + `

## Available Agents

### OODA Trading Agent
Primary autonomous trading loop. Runs on configurable interval.
- Observes: Helius on-chain data, Birdeye signals, Vulcan/Phoenix perps
- Orients: Queries ClawVault memory for relevant patterns
- Decides: LLM-powered thesis generation with risk params
- Acts: Jupiter swap execution or simulation logging

### Dexter Research Agent
Deep research mode for comprehensive token analysis.
- Multi-source data aggregation (Birdeye + Helius + on-chain)
- Technical analysis (RSI, EMA, ATR, volume profile)
- LLM synthesis with structured reasoning
- Results stored to vault/research/

### NanoClaw Assistant
Lightweight chat agent for interactive queries.
- Memory commands (!remember, !recall, !trades, !lessons)
- Quick market lookups
- Strategy param queries
- Checkpoint management

## Memory Commands
- !remember <content>  — Store to vault (auto-routed by content)
- !recall <query>      — Semantic search across memory
- !trades              — Review recent trade history
- !lessons             — Surface learned patterns with confidence
- !research <mint>     — Deep research a token
- !checkpoint          — Save agent state
`
