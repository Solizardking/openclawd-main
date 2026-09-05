package solana

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/8bitlabs/clawdbot/pkg/tools"
)

type mockSpot struct {
	quoteFn func(in, out string, amount uint64, slip int) (*SwapQuote, error)
	planFn  func(q *SwapQuote, simulate bool) (*SwapResult, error)
}

func (m *mockSpot) GetQuote(in, out string, amount uint64, slip int) (*SwapQuote, error) {
	if m.quoteFn != nil {
		return m.quoteFn(in, out, amount, slip)
	}
	return &SwapQuote{
		InputMint: in, OutputMint: out,
		InAmount: fmt.Sprintf("%d", amount), OutAmount: "990000", Routes: 1,
	}, nil
}

func (m *mockSpot) BuildSwapPlan(q *SwapQuote, simulate bool) (*SwapResult, error) {
	if m.planFn != nil {
		return m.planFn(q, simulate)
	}
	sig := "SIMULATED"
	if !simulate {
		return nil, fmt.Errorf("live swap not enabled")
	}
	return &SwapResult{
		Signature: sig, InputMint: q.InputMint, OutputMint: q.OutputMint,
		InAmount: q.InAmount, OutAmount: q.OutAmount,
	}, nil
}

func TestRegisterSpotTools_GetQuote(t *testing.T) {
	reg := tools.NewRegistry()
	client := &mockSpot{}
	RegisterSpotTools(reg, client)

	tool, ok := reg.Get("get_quote")
	if !ok {
		t.Fatal("get_quote not registered")
	}
	out, err := tool.Execute(context.Background(), map[string]any{
		"input_mint":   "So11111111111111111111111111111111111111112",
		"output_mint":  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		"amount":       "1000000",
		"slippage_bps": 50,
	})
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	var q SwapQuote
	if err := json.Unmarshal([]byte(out), &q); err != nil {
		t.Fatalf("json: %v body=%s", err, out)
	}
	if q.OutAmount != "990000" || q.Routes != 1 {
		t.Fatalf("quote = %#v", q)
	}
}

func TestRegisterSpotTools_GetQuoteMissingArgs(t *testing.T) {
	reg := tools.NewRegistry()
	RegisterSpotTools(reg, &mockSpot{})
	tool, _ := reg.Get("get_quote")
	_, err := tool.Execute(context.Background(), map[string]any{"input_mint": "x"})
	if err == nil || !strings.Contains(err.Error(), "required") {
		t.Fatalf("err = %v", err)
	}
}

func TestRegisterSpotTools_SwapSimulated(t *testing.T) {
	reg := tools.NewRegistry()
	RegisterSpotTools(reg, &mockSpot{})
	tool, ok := reg.Get("swap")
	if !ok {
		t.Fatal("swap not registered")
	}
	// RequiresApproval should be true on ToolDef
	if td, ok := tool.(*tools.ToolDef); ok && !td.RequiresApproval {
		t.Fatal("swap must require approval")
	}
	out, err := tool.Execute(context.Background(), map[string]any{
		"input_mint":  "So11111111111111111111111111111111111111112",
		"output_mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		"amount":      "500000",
		"simulate":    true,
	})
	if err != nil {
		t.Fatalf("swap: %v", err)
	}
	var r SwapResult
	if err := json.Unmarshal([]byte(out), &r); err != nil {
		t.Fatal(err)
	}
	if r.Signature != "SIMULATED" {
		t.Fatalf("signature = %q", r.Signature)
	}
}

func TestRegisterSpotTools_SwapLiveRejected(t *testing.T) {
	reg := tools.NewRegistry()
	RegisterSpotTools(reg, &mockSpot{})
	tool, _ := reg.Get("swap")
	_, err := tool.Execute(context.Background(), map[string]any{
		"input_mint":  "So11111111111111111111111111111111111111112",
		"output_mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		"amount":      "1",
		"simulate":    false,
	})
	if err == nil || !strings.Contains(err.Error(), "live swap") {
		t.Fatalf("expected live swap rejection, got %v", err)
	}
}

func TestJupiterClient_GetQuoteHTTP(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/v6/quote") {
			t.Fatalf("path = %s", r.URL.Path)
		}
		q := r.URL.Query()
		if q.Get("inputMint") == "" || q.Get("amount") == "" {
			t.Fatalf("query = %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"inputMint":"So111","outputMint":"EPjF",
			"inAmount":"1000","outAmount":"950",
			"routePlan":[{},{}]
		}`))
	}))
	defer server.Close()

	j := NewJupiterClient(server.URL, "")
	quote, err := j.GetQuote("So111", "EPjF", 1000, 50)
	if err != nil {
		t.Fatal(err)
	}
	if quote.OutAmount != "950" || quote.Routes != 2 {
		t.Fatalf("%#v", quote)
	}
}

func TestJupiterClient_BuildSwapPlanSimulate(t *testing.T) {
	j := NewJupiterClient("https://example.invalid", "")
	res, err := j.BuildSwapPlan(&SwapQuote{
		InputMint: "a", OutputMint: "b", InAmount: "1", OutAmount: "2",
	}, true)
	if err != nil {
		t.Fatal(err)
	}
	if res.Signature != "SIMULATED" {
		t.Fatalf("%#v", res)
	}
}
