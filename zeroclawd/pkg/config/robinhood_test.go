package config

import (
	"testing"
)

func TestApplyEnvOverrides_RobinhoodKeys(t *testing.T) {
	t.Setenv("RH_RPC_URL", "https://rpc.example.com/rh")
	t.Setenv("BLOCKSCOUT_API_KEY", "proapi_test_key_abc")
	t.Setenv("BLOCKSCOUT_BASE_URL", "https://api.blockscout.com")
	t.Setenv("RH_CHAIN_ID", "4663")

	cfg := DefaultConfig()
	applyEnvOverrides(cfg)

	if cfg.Robinhood.RPCURL != "https://rpc.example.com/rh" {
		t.Fatalf("RPCURL = %q", cfg.Robinhood.RPCURL)
	}
	if cfg.Robinhood.BlockscoutAPIKey != "proapi_test_key_abc" {
		t.Fatalf("BlockscoutAPIKey = %q", cfg.Robinhood.BlockscoutAPIKey)
	}
	if cfg.Robinhood.ChainID != RobinhoodChainID {
		t.Fatalf("ChainID = %d, want %d", cfg.Robinhood.ChainID, RobinhoodChainID)
	}
	if !cfg.Robinhood.HasCustomRPC() || !cfg.Robinhood.HasBlockscoutKey() {
		t.Fatal("expected both custom RPC and Blockscout key presence")
	}
	if got := cfg.Robinhood.ResolvedRPCURL(); got != "https://rpc.example.com/rh" {
		t.Fatalf("ResolvedRPCURL = %q", got)
	}
}

func TestRobinhood_PublicRPCReadFallback(t *testing.T) {
	t.Setenv("RH_RPC_URL", "")
	t.Setenv("BLOCKSCOUT_API_KEY", "")
	t.Setenv("BLOCKSCOUT_PRO_API_KEY", "")

	cfg := DefaultConfig()
	applyEnvOverrides(cfg)

	if cfg.Robinhood.HasCustomRPC() {
		t.Fatal("empty RH_RPC_URL should not count as custom")
	}
	if got := cfg.Robinhood.ResolvedRPCURL(); got != RobinhoodPublicRPCURL {
		t.Fatalf("fallback RPC = %q, want %q", got, RobinhoodPublicRPCURL)
	}
	if cfg.Robinhood.ChainID != RobinhoodChainID {
		t.Fatalf("default chain id = %d", cfg.Robinhood.ChainID)
	}
}

func TestApplyEnvOverrides_BlockscoutProAlias(t *testing.T) {
	t.Setenv("BLOCKSCOUT_API_KEY", "")
	t.Setenv("BLOCKSCOUT_PRO_API_KEY", "proapi_alias_only")

	cfg := DefaultConfig()
	applyEnvOverrides(cfg)

	if cfg.Robinhood.BlockscoutAPIKey != "proapi_alias_only" {
		t.Fatalf("alias not applied: %q", cfg.Robinhood.BlockscoutAPIKey)
	}

	// BLOCKSCOUT_API_KEY wins when both set
	t.Setenv("BLOCKSCOUT_API_KEY", "proapi_primary")
	cfg = DefaultConfig()
	applyEnvOverrides(cfg)
	if cfg.Robinhood.BlockscoutAPIKey != "proapi_primary" {
		t.Fatalf("primary should win: %q", cfg.Robinhood.BlockscoutAPIKey)
	}
}

func TestDefaultConfig_RobinhoodCore(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.Robinhood.ChainID != RobinhoodChainID {
		t.Fatalf("chain id = %d", cfg.Robinhood.ChainID)
	}
	if cfg.Robinhood.BlockscoutBase != BlockscoutPROBaseURL {
		t.Fatalf("base = %q", cfg.Robinhood.BlockscoutBase)
	}
	if cfg.Robinhood.RPCURL != "" {
		t.Fatal("default RPCURL must be empty (read fallback only via ResolvedRPCURL)")
	}
}

func TestApplyEnvOverrides_Exported(t *testing.T) {
	t.Setenv("BLOCKSCOUT_API_KEY", "proapi_export_test")
	t.Setenv("RH_RPC_URL", "https://export.test/rpc")
	cfg := DefaultConfig()
	ApplyEnvOverrides(cfg)
	if cfg.Robinhood.BlockscoutAPIKey != "proapi_export_test" {
		t.Fatalf("key = %q", cfg.Robinhood.BlockscoutAPIKey)
	}
	if cfg.Robinhood.RPCURL != "https://export.test/rpc" {
		t.Fatalf("rpc = %q", cfg.Robinhood.RPCURL)
	}
}
