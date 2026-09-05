package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/8bitlabs/clawdbot/pkg/tools"
)

// RegisterBlockscoutTools registers agent-facing wrappers over the hosted
// Blockscout MCP REST API. Uses BLOCKSCOUT_API_KEY (or the provided key) as
// Blockscout-MCP-Pro-Api-Key. Safe no-op when registry is nil.
//
// Tool names are prefixed with blockscout_ to avoid clashing with other packs.
// Default chain_id is Robinhood 4663 when the caller omits it.
func RegisterBlockscoutTools(registry *tools.Registry, apiKey string) {
	if registry == nil {
		return
	}
	// Capture configured key at register time; re-resolve env on each call so
	// late export of BLOCKSCOUT_API_KEY still works. Always fail closed via CallREST.
	configuredKey := strings.TrimSpace(apiKey)

	call := func(ctx context.Context, tool string, args map[string]any) (string, error) {
		key := configuredKey
		if key == "" {
			key = ResolveAPIKey()
		}
		if err := RequireAPIKey(key); err != nil {
			return "", err
		}
		params := map[string]any{}
		for k, v := range args {
			params[k] = v
		}
		// Default RH chain for EVM pack workflows unless the tool is unlock/chains/ens.
		switch tool {
		case "__unlock_blockchain_analysis__", "unlock_blockchain_analysis",
			"get_chains_list", "get_address_by_ens_name":
			// no default chain
		default:
			if _, ok := params["chain_id"]; !ok {
				params["chain_id"] = DefaultChainID
			}
		}
		return CallREST(ctx, nil, key, tool, params)
	}

	registry.Register(&tools.ToolDef{
		ToolName: "blockscout_unlock",
		Desc:     "Mandatory first Blockscout MCP call per session. Returns analysis skill pointer and server reference data.",
		Schema:   json.RawMessage(`{"type":"object","properties":{}}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			return call(ctx, "unlock_blockchain_analysis", args)
		},
	})

	registry.Register(&tools.ToolDef{
		ToolName: "blockscout_chains",
		Desc:     "List Blockscout-supported chains. Pass query (e.g. robinhood, ethereum, optimism) to filter.",
		Schema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"query":{"type":"string","description":"Substring filter by name, chain id, currency, or ecosystem"}
			}
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			return call(ctx, "get_chains_list", args)
		},
	})

	registry.Register(&tools.ToolDef{
		ToolName: "blockscout_address_info",
		Desc:     "Get address balance, contract flags, tags, and metadata. Default chain_id=4663 (Robinhood).",
		Schema: json.RawMessage(`{
			"type":"object",
			"required":["address"],
			"properties":{
				"address":{"type":"string"},
				"chain_id":{"type":"integer","description":"EVM chain id (default 4663 Robinhood)"}
			}
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			if strings.TrimSpace(fmt.Sprint(args["address"])) == "" || fmt.Sprint(args["address"]) == "<nil>" {
				return "", fmt.Errorf("address is required")
			}
			return call(ctx, "get_address_info", args)
		},
	})

	registry.Register(&tools.ToolDef{
		ToolName: "blockscout_block_number",
		Desc:     "Latest block number (or block at datetime). Default chain_id=4663.",
		Schema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"chain_id":{"type":"integer"},
				"datetime":{"type":"string","description":"Optional ISO-8601 timestamp"}
			}
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			return call(ctx, "get_block_number", args)
		},
	})

	registry.Register(&tools.ToolDef{
		ToolName: "blockscout_transactions",
		Desc:     "Transactions for an address (optional age_from/age_to). Default chain_id=4663.",
		Schema: json.RawMessage(`{
			"type":"object",
			"required":["address"],
			"properties":{
				"address":{"type":"string"},
				"chain_id":{"type":"integer"},
				"age_from":{"type":"string"},
				"age_to":{"type":"string"},
				"cursor":{"type":"string"}
			}
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			return call(ctx, "get_transactions_by_address", args)
		},
	})

	registry.Register(&tools.ToolDef{
		ToolName: "blockscout_token_transfers",
		Desc:     "ERC-20 token transfers for an address. Default chain_id=4663.",
		Schema: json.RawMessage(`{
			"type":"object",
			"required":["address"],
			"properties":{
				"address":{"type":"string"},
				"chain_id":{"type":"integer"},
				"age_from":{"type":"string"},
				"age_to":{"type":"string"},
				"token":{"type":"string"},
				"cursor":{"type":"string"}
			}
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			return call(ctx, "get_token_transfers_by_address", args)
		},
	})

	registry.Register(&tools.ToolDef{
		ToolName: "blockscout_transaction",
		Desc:     "Decoded transaction details by hash. Default chain_id=4663.",
		Schema: json.RawMessage(`{
			"type":"object",
			"required":["hash"],
			"properties":{
				"hash":{"type":"string"},
				"chain_id":{"type":"integer"},
				"include_raw_input":{"type":"boolean"}
			}
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			return call(ctx, "get_transaction_info", args)
		},
	})

	registry.Register(&tools.ToolDef{
		ToolName: "blockscout_contract_abi",
		Desc:     "Verified contract ABI. Default chain_id=4663.",
		Schema: json.RawMessage(`{
			"type":"object",
			"required":["address"],
			"properties":{
				"address":{"type":"string"},
				"chain_id":{"type":"integer"}
			}
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			return call(ctx, "get_contract_abi", args)
		},
	})

	registry.Register(&tools.ToolDef{
		ToolName: "blockscout_tokens",
		Desc:     "ERC-20 token holdings for an address. Default chain_id=4663.",
		Schema: json.RawMessage(`{
			"type":"object",
			"required":["address"],
			"properties":{
				"address":{"type":"string"},
				"chain_id":{"type":"integer"},
				"cursor":{"type":"string"}
			}
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			return call(ctx, "get_tokens_by_address", args)
		},
	})

	registry.Register(&tools.ToolDef{
		ToolName: "blockscout_direct_api",
		Desc:     "Raw Blockscout API path via MCP direct_api_call (advanced). Prefer dedicated tools first. Default chain_id=4663.",
		Schema: json.RawMessage(`{
			"type":"object",
			"required":["endpoint_path"],
			"properties":{
				"endpoint_path":{"type":"string","description":"e.g. /api/v2/stats"},
				"chain_id":{"type":"integer"},
				"cursor":{"type":"string"}
			}
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			return call(ctx, "direct_api_call", args)
		},
	})
}

// BlockscoutToolNames returns the registered agent tool names for tests/docs.
func BlockscoutToolNames() []string {
	return []string{
		"blockscout_unlock",
		"blockscout_chains",
		"blockscout_address_info",
		"blockscout_block_number",
		"blockscout_transactions",
		"blockscout_token_transfers",
		"blockscout_transaction",
		"blockscout_contract_abi",
		"blockscout_tokens",
		"blockscout_direct_api",
	}
}
