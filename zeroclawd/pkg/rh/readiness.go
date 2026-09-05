package rh

import (
	"strings"

	"github.com/8bitlabs/clawdbot/pkg/config"
)

// Readiness is a secret-safe RH launch/deploy/trade gate.
// Agents should call this (or doctor connectors.robinhood) before Pons/Uniswap
// mainnet work instead of inventing RPC or explorer URLs.
type Readiness struct {
	Ready                bool     `json:"ready"`
	ChainID              int      `json:"chainId"`
	BlockscoutConfigured bool     `json:"blockscoutConfigured"`
	RHRpcConfigured      bool     `json:"rhRpcConfigured"`
	UsingPublicRPCRead   bool     `json:"usingPublicRpcRead"`
	Missing              []string `json:"missing,omitempty"`
	// ResolvedRPC is the URL that would be used (public fallback when unset).
	// API layers may redact when a custom URL may embed API keys.
	ResolvedRPC string `json:"resolvedRpc,omitempty"`
	Message     string `json:"message"`
}

// AssessReadiness reports whether BLOCKSCOUT_API_KEY and RH_RPC_URL are set
// for omni RH ops. Values are never returned for the API key.
func AssessReadiness(rh config.RobinhoodConfig) Readiness {
	chainID := rh.ChainID
	if chainID == 0 {
		chainID = ChainID
	}
	out := Readiness{
		ChainID:              chainID,
		BlockscoutConfigured: rh.HasBlockscoutKey(),
		RHRpcConfigured:      rh.HasCustomRPC(),
		UsingPublicRPCRead:   !rh.HasCustomRPC(),
		ResolvedRPC:          rh.ResolvedRPCURL(),
	}
	if !out.BlockscoutConfigured {
		out.Missing = append(out.Missing, "BLOCKSCOUT_API_KEY")
	}
	if !out.RHRpcConfigured {
		out.Missing = append(out.Missing, "RH_RPC_URL")
	}
	out.Ready = len(out.Missing) == 0
	switch {
	case out.Ready:
		out.Message = "BLOCKSCOUT_API_KEY and RH_RPC_URL configured for RH launch/deploy/trade"
	case out.BlockscoutConfigured && !out.RHRpcConfigured:
		out.Message = "RH_RPC_URL unset — public read RPC only (not deploy-safe)"
	case !out.BlockscoutConfigured && out.RHRpcConfigured:
		out.Message = "BLOCKSCOUT_API_KEY missing — explorer/indexing disabled"
	default:
		out.Message = "set BLOCKSCOUT_API_KEY and RH_RPC_URL for omni RH flows"
	}
	return out
}

// RequireReadiness returns an error string if launch/deploy/trade should not proceed.
// Empty string means ready.
func RequireReadiness(rh config.RobinhoodConfig) string {
	r := AssessReadiness(rh)
	if r.Ready {
		return ""
	}
	return r.Message + " (missing: " + strings.Join(r.Missing, ", ") + ")"
}
