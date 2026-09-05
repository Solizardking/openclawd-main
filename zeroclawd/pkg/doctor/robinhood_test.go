package doctor

import (
	"testing"

	"github.com/8bitlabs/clawdbot/pkg/config"
)

func TestRobinhoodCheck_missingVsConfigured(t *testing.T) {
	// Both missing → warn with both names
	cfg := config.DefaultConfig()
	check := robinhoodCheck(cfg)
	if check.Status != StatusWarn {
		t.Fatalf("status = %s, want warn", check.Status)
	}
	if check.ID != "connectors.robinhood" {
		t.Fatalf("id = %s", check.ID)
	}
	missing, _ := check.Details["missing"].([]string)
	if len(missing) < 2 {
		t.Fatalf("missing = %#v", check.Details["missing"])
	}
	if check.Details["blockscoutConfigured"] != false {
		t.Fatal("blockscout should be false")
	}
	if check.Details["rhRpcConfigured"] != false {
		t.Fatal("rh rpc should be false")
	}

	// Fully configured → pass
	cfg.Robinhood.BlockscoutAPIKey = "proapi_x"
	cfg.Robinhood.RPCURL = "https://rpc.example/rh"
	cfg.Robinhood.ChainID = 4663
	check = robinhoodCheck(cfg)
	if check.Status != StatusPass {
		t.Fatalf("configured status = %s msg=%s", check.Status, check.Message)
	}
	if check.Details["blockscoutConfigured"] != true || check.Details["rhRpcConfigured"] != true {
		t.Fatalf("details = %#v", check.Details)
	}
	// Never leak the key value in details
	for k, v := range check.Details {
		if s, ok := v.(string); ok && s == "proapi_x" {
			t.Fatalf("leaked secret in details[%s]", k)
		}
	}
}

func TestBlockscoutMCPCheck(t *testing.T) {
	cfg := config.DefaultConfig()
	check := blockscoutMCPCheck(cfg)
	if check.Status != StatusWarn {
		t.Fatalf("status = %s want warn", check.Status)
	}
	if check.ID != "connectors.blockscout_mcp" {
		t.Fatalf("id = %s", check.ID)
	}
	if check.Details["configured"] != false {
		t.Fatal("configured should be false")
	}

	cfg.Robinhood.BlockscoutAPIKey = "proapi_mcp_secret_key99"
	check = blockscoutMCPCheck(cfg)
	if check.Status != StatusPass {
		t.Fatalf("status = %s msg=%s", check.Status, check.Message)
	}
	if check.Details["configured"] != true {
		t.Fatal("configured")
	}
	if check.Details["defaultChainId"] != 4663 && check.Details["defaultChainId"] != int(4663) {
		// JSON/map may use int
		if n, ok := check.Details["defaultChainId"].(int); !ok || n != 4663 {
			t.Fatalf("chain = %#v", check.Details["defaultChainId"])
		}
	}
	for k, v := range check.Details {
		if s, ok := v.(string); ok && s == "proapi_mcp_secret_key99" {
			t.Fatalf("leaked secret in details[%s]", k)
		}
	}
	if check.Details["keySuffix"] != "ey99" {
		t.Fatalf("suffix = %#v", check.Details["keySuffix"])
	}
}
