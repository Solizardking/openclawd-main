// Package providers abstracts LLM providers for ClawdBot.
// ClawdBot Go providers — supports OpenRouter, Anthropic, OpenAI, Ollama.
package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── Message Types ────────────────────────────────────────────────────

type Message struct {
	Role    string `json:"role"` // "system", "user", "assistant", "tool"
	Content string `json:"content"`
}

type ToolCall struct {
	Name  string         `json:"name"`
	Input map[string]any `json:"input"`
}

type ToolResult struct {
	Name   string `json:"name"`
	Result string `json:"result"`
}

type Response struct {
	Content      string     `json:"content"`
	ToolCalls    []ToolCall `json:"tool_calls"`
	StopReason   string     `json:"stop_reason"` // "end_turn", "tool_use", "max_tokens"
	InputTokens  int        `json:"input_tokens"`
	OutputTokens int        `json:"output_tokens"`
	Thinking     string     `json:"thinking,omitempty"`
}

// ── Provider Interface ───────────────────────────────────────────────

type LLMProvider interface {
	Name() string
	Chat(ctx context.Context, opts ChatOptions) (*Response, error)
}

type ChatOptions struct {
	Model             string    `json:"model"`
	Messages          []Message `json:"messages"`
	MaxTokens         int       `json:"max_tokens"`
	Temperature       float64   `json:"temperature"`
	TopP              float64   `json:"top_p,omitempty"`
	TopK              int       `json:"top_k,omitempty"`
	FrequencyPenalty  float64   `json:"frequency_penalty,omitempty"`
	PresencePenalty   float64   `json:"presence_penalty,omitempty"`
	RepetitionPenalty float64   `json:"repetition_penalty,omitempty"`
	// ReasoningEffort is Kimi K3 thinking effort: low | high | max.
	// Empty means omit (non-Kimi providers ignore).
	ReasoningEffort string    `json:"reasoning_effort,omitempty"`
	Tools           []ToolDef `json:"tools,omitempty"`
}

type ToolDef struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"input_schema"`
}

// ── OpenRouter Provider ──────────────────────────────────────────────
// Primary provider for ClawdBot — GPT-5.4 via OpenRouter.

type OpenRouterProvider struct {
	apiKey  string
	baseURL string
	client  *http.Client
}

func NewOpenRouterProvider(apiKey string) *OpenRouterProvider {
	return &OpenRouterProvider{
		apiKey:  apiKey,
		baseURL: "https://openrouter.ai/api/v1",
		client: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// NewOpenAICompatProvider creates an OpenRouter-compatible provider pointing at any
// OpenAI-format base URL (e.g. zkrouter, local Ollama, custom proxy).
func NewOpenAICompatProvider(apiKey, baseURL string) *OpenRouterProvider {
	return &OpenRouterProvider{
		apiKey:  apiKey,
		baseURL: baseURL,
		client:  &http.Client{Timeout: 120 * time.Second},
	}
}

func (p *OpenRouterProvider) Name() string { return "openrouter" }

func (p *OpenRouterProvider) Chat(ctx context.Context, opts ChatOptions) (*Response, error) {
	type orMessage struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}

	messages := make([]orMessage, len(opts.Messages))
	for i, m := range opts.Messages {
		messages[i] = orMessage{Role: m.Role, Content: m.Content}
	}

	// Moonshot Kimi K3 fixes temperature/top_p/penalties server-side — omit them.
	// See https://platform.kimi.ai/docs/guide/kimi-k3-quickstart
	modelID := opts.Model
	moonshot := isMoonshotEndpoint(p.baseURL) || isKimiK3Model(opts.Model)
	if moonshot {
		modelID = stripProviderPrefix(opts.Model, "moonshot")
	}
	payload := map[string]any{
		"model":      modelID,
		"messages":   messages,
		"max_tokens": opts.MaxTokens,
	}
	if !moonshot {
		payload["temperature"] = opts.Temperature
		if opts.TopP > 0 {
			payload["top_p"] = opts.TopP
		}
		if opts.TopK > 0 {
			payload["top_k"] = opts.TopK
		}
		if opts.FrequencyPenalty != 0 {
			payload["frequency_penalty"] = opts.FrequencyPenalty
		}
		if opts.PresencePenalty != 0 {
			payload["presence_penalty"] = opts.PresencePenalty
		}
		if opts.RepetitionPenalty > 0 && opts.RepetitionPenalty != 1 {
			payload["repetition_penalty"] = opts.RepetitionPenalty
		}
	}
	if effort := strings.TrimSpace(opts.ReasoningEffort); effort != "" {
		payload["reasoning_effort"] = effort
	} else if moonshot && isKimiK3Model(modelID) {
		// K3 always thinks; default effort is max on the platform.
		payload["reasoning_effort"] = "max"
	}
	if len(opts.Tools) > 0 {
		payload["tools"] = openAITools(opts.Tools)
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "https://solanaclawd.com")
	req.Header.Set("X-OpenRouter-Title", "solanaclawd")
	req.Header.Set("X-Title", "solanaclawd")
	req.Header.Set("X-OpenRouter-Categories", "personal-agent,cloud-agent")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openrouter request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("openrouter HTTP %d: %s", resp.StatusCode, string(respBody[:min(300, len(respBody))]))
	}

	var orResp struct {
		Choices []struct {
			Message struct {
				Content          string `json:"content"`
				ReasoningContent string `json:"reasoning_content"`
				ToolCalls        []struct {
					ID       string `json:"id"`
					Type     string `json:"type"`
					Function struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(respBody, &orResp); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	result := &Response{
		StopReason:   "end_turn",
		InputTokens:  orResp.Usage.PromptTokens,
		OutputTokens: orResp.Usage.CompletionTokens,
	}
	if len(orResp.Choices) > 0 {
		choice := orResp.Choices[0]
		result.Content = choice.Message.Content
		result.Thinking = choice.Message.ReasoningContent
		if choice.FinishReason != "" {
			result.StopReason = choice.FinishReason
		}
		for _, tc := range choice.Message.ToolCalls {
			input := map[string]any{}
			if args := strings.TrimSpace(tc.Function.Arguments); args != "" {
				if err := json.Unmarshal([]byte(args), &input); err != nil {
					// Keep raw string if model returns non-JSON arguments.
					input = map[string]any{"_raw": args}
				}
			}
			name := tc.Function.Name
			if name == "" {
				continue
			}
			result.ToolCalls = append(result.ToolCalls, ToolCall{
				Name:  name,
				Input: input,
			})
		}
		if len(result.ToolCalls) > 0 && (result.StopReason == "end_turn" || result.StopReason == "stop" || result.StopReason == "") {
			result.StopReason = "tool_calls"
		}
	}

	return result, nil
}

// openAITools converts internal ToolDef list to OpenAI/Moonshot tools shape.
func openAITools(defs []ToolDef) []map[string]any {
	out := make([]map[string]any, 0, len(defs))
	for _, d := range defs {
		params := any(map[string]any{"type": "object", "properties": map[string]any{}})
		if len(d.InputSchema) > 0 {
			var schema any
			if err := json.Unmarshal(d.InputSchema, &schema); err == nil {
				params = schema
			}
		}
		out = append(out, map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        d.Name,
				"description": d.Description,
				"parameters":  params,
			},
		})
	}
	return out
}

func isMoonshotEndpoint(baseURL string) bool {
	u := strings.ToLower(baseURL)
	return strings.Contains(u, "moonshot.ai") || strings.Contains(u, "moonshot.cn") || strings.Contains(u, "kimi.ai")
}

func isKimiK3Model(model string) bool {
	m := strings.ToLower(strings.TrimSpace(model))
	if i := strings.LastIndex(m, "/"); i >= 0 {
		m = m[i+1:]
	}
	// kimi-k3 and future variants like kimi-k3-preview.
	return m == "kimi-k3" || strings.HasPrefix(m, "kimi-k3-")
}

func stripProviderPrefix(model, provider string) string {
	m := strings.TrimSpace(model)
	prefix := provider + "/"
	if strings.HasPrefix(strings.ToLower(m), strings.ToLower(prefix)) {
		return m[len(prefix):]
	}
	return m
}

// ── Fallback Chain ───────────────────────────────────────────────────
// Tries providers in order until one succeeds.

type CooldownTracker struct {
	mu       sync.Mutex
	cooldown map[string]time.Time
}

func NewCooldownTracker() *CooldownTracker {
	return &CooldownTracker{cooldown: make(map[string]time.Time)}
}

func (ct *CooldownTracker) SetCooldown(provider string, d time.Duration) {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	ct.cooldown[provider] = time.Now().Add(d)
}

func (ct *CooldownTracker) IsAvailable(provider string) bool {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	deadline, ok := ct.cooldown[provider]
	if !ok {
		return true
	}
	return time.Now().After(deadline)
}

type FallbackChain struct {
	providers []LLMProvider
	cooldown  *CooldownTracker
}

func NewFallbackChain(cooldown *CooldownTracker) *FallbackChain {
	return &FallbackChain{cooldown: cooldown}
}

func (fc *FallbackChain) Add(p LLMProvider) {
	fc.providers = append(fc.providers, p)
}

func (fc *FallbackChain) Chat(ctx context.Context, opts ChatOptions) (*Response, error) {
	var lastErr error
	for _, p := range fc.providers {
		if !fc.cooldown.IsAvailable(p.Name()) {
			continue
		}
		resp, err := p.Chat(ctx, opts)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		fc.cooldown.SetCooldown(p.Name(), 30*time.Second)
	}
	if lastErr != nil {
		return nil, fmt.Errorf("all providers failed: %w", lastErr)
	}
	return nil, fmt.Errorf("no providers available")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
