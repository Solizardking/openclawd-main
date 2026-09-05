// Package solana :: spot_tools.go
// LLM-callable Jupiter spot quote + swap tools for the ClawdBot agent registry.
package solana

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/8bitlabs/clawdbot/pkg/tools"
)

// SpotQuoter is the minimal Jupiter surface used by spot tools (mockable in tests).
type SpotQuoter interface {
	GetQuote(inputMint, outputMint string, amount uint64, slippageBps int) (*SwapQuote, error)
	// BuildSwapPlan returns a structured swap plan without broadcasting.
	// Live signing is intentionally out of band; simulate=true is the default path.
	BuildSwapPlan(quote *SwapQuote, simulate bool) (*SwapResult, error)
}

// RegisterSpotTools registers get_quote and swap (approval-gated) for Solana spot.
func RegisterSpotTools(registry *tools.Registry, client SpotQuoter) {
	if registry == nil || client == nil {
		return
	}

	registry.Register(&tools.ToolDef{
		ToolName: "get_quote",
		Desc: "Get a Solana spot swap quote via Jupiter. " +
			"Args: input_mint (required), output_mint (required), amount (raw token units as integer string), " +
			"slippage_bps (optional, default 50 = 0.5%).",
		Schema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"input_mint":{"type":"string","description":"Input token mint address"},
				"output_mint":{"type":"string","description":"Output token mint address"},
				"amount":{"type":"string","description":"Input amount in raw token units (integer string)"},
				"slippage_bps":{"type":"integer","description":"Slippage in basis points (default 50)"}
			},
			"required":["input_mint","output_mint","amount"]
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			inputMint := spotStr(args, "input_mint")
			outputMint := spotStr(args, "output_mint")
			amountStr := spotStr(args, "amount")
			if inputMint == "" || outputMint == "" || amountStr == "" {
				return "", fmt.Errorf("input_mint, output_mint, and amount are required")
			}
			amount, err := strconv.ParseUint(amountStr, 10, 64)
			if err != nil || amount == 0 {
				return "", fmt.Errorf("amount must be a positive integer string (raw units): %w", err)
			}
			slippage := spotInt(args, "slippage_bps", 50)
			if slippage < 0 {
				return "", fmt.Errorf("slippage_bps must be >= 0")
			}
			quote, err := client.GetQuote(inputMint, outputMint, amount, slippage)
			if err != nil {
				return "", err
			}
			body, _ := json.MarshalIndent(quote, "", "  ")
			return string(body), nil
		},
	})

	registry.Register(&tools.ToolDef{
		ToolName: "swap",
		Desc: "Execute or simulate a Solana spot swap via Jupiter. " +
			"Requires approval. Args: input_mint, output_mint, amount (raw units), " +
			"slippage_bps (optional, default 50), simulate (optional, default true — dry-run plan only).",
		RequiresApproval: true,
		Schema: json.RawMessage(`{
			"type":"object",
			"properties":{
				"input_mint":{"type":"string"},
				"output_mint":{"type":"string"},
				"amount":{"type":"string","description":"Input amount in raw token units"},
				"slippage_bps":{"type":"integer","description":"Slippage bps (default 50)"},
				"simulate":{"type":"boolean","description":"If true (default), return a plan without broadcasting"}
			},
			"required":["input_mint","output_mint","amount"]
		}`),
		ExecuteFn: func(ctx context.Context, args map[string]any) (string, error) {
			inputMint := spotStr(args, "input_mint")
			outputMint := spotStr(args, "output_mint")
			amountStr := spotStr(args, "amount")
			if inputMint == "" || outputMint == "" || amountStr == "" {
				return "", fmt.Errorf("input_mint, output_mint, and amount are required")
			}
			amount, err := strconv.ParseUint(amountStr, 10, 64)
			if err != nil || amount == 0 {
				return "", fmt.Errorf("amount must be a positive integer string (raw units): %w", err)
			}
			slippage := spotInt(args, "slippage_bps", 50)
			simulate := true
			if v, ok := args["simulate"]; ok {
				switch t := v.(type) {
				case bool:
					simulate = t
				case string:
					simulate = strings.EqualFold(t, "true") || t == "1"
				}
			}
			quote, err := client.GetQuote(inputMint, outputMint, amount, slippage)
			if err != nil {
				return "", fmt.Errorf("quote before swap: %w", err)
			}
			plan, err := client.BuildSwapPlan(quote, simulate)
			if err != nil {
				return "", err
			}
			body, _ := json.MarshalIndent(plan, "", "  ")
			return string(body), nil
		},
	})
}

func spotStr(args map[string]any, key string) string {
	v, ok := args[key]
	if !ok || v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case float64:
		return strconv.FormatInt(int64(t), 10)
	case json.Number:
		return t.String()
	default:
		return strings.TrimSpace(fmt.Sprint(t))
	}
}

func spotInt(args map[string]any, key string, def int) int {
	v, ok := args[key]
	if !ok || v == nil {
		return def
	}
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(t))
		if err != nil {
			return def
		}
		return n
	default:
		return def
	}
}
