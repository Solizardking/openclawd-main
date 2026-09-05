package config

import (
	"testing"
)

func TestApplyEnvOverrides_MoonshotKimiK3(t *testing.T) {
	t.Setenv("MOONSHOT_API_KEY", "sk-moonshot-test")
	t.Setenv("MOONSHOT_BASE_URL", "")
	t.Setenv("MOONSHOT_MODEL", "")
	t.Setenv("MOONSHOT_REASONING_EFFORT", "")
	t.Setenv("XAI_API_KEY", "")
	t.Setenv("DEEPSEEK_API_KEY", "")

	cfg := DefaultConfig()
	applyEnvOverrides(cfg)

	if cfg.Providers.Moonshot.APIKey != "sk-moonshot-test" {
		t.Fatalf("Moonshot APIKey = %q", cfg.Providers.Moonshot.APIKey)
	}
	if cfg.Providers.Moonshot.APIBase != MoonshotBaseURL {
		t.Fatalf("Moonshot APIBase = %q, want %q", cfg.Providers.Moonshot.APIBase, MoonshotBaseURL)
	}
	if len(cfg.ModelList) < 1 {
		t.Fatal("expected ModelList to include moonshot entry")
	}
	entry := cfg.ModelList[0]
	if entry.ModelName != "kimi-k3" {
		t.Fatalf("ModelName = %q, want kimi-k3", entry.ModelName)
	}
	if entry.Model != MoonshotDefaultModel {
		t.Fatalf("Model = %q, want %q", entry.Model, MoonshotDefaultModel)
	}
	if entry.APIBase != MoonshotBaseURL {
		t.Fatalf("entry APIBase = %q", entry.APIBase)
	}
	if entry.ThinkingLevel != "max" {
		t.Fatalf("ThinkingLevel = %q, want max", entry.ThinkingLevel)
	}
	if cfg.Agents.Defaults.ModelName != "kimi-k3" {
		t.Fatalf("Agents.Defaults.ModelName = %q, want kimi-k3", cfg.Agents.Defaults.ModelName)
	}
}

func TestApplyEnvOverrides_MoonshotCustomModelAndEffort(t *testing.T) {
	t.Setenv("MOONSHOT_API_KEY", "sk-ms")
	t.Setenv("MOONSHOT_MODEL", "kimi-k2.7-code")
	t.Setenv("MOONSHOT_REASONING_EFFORT", "low")
	t.Setenv("MOONSHOT_BASE_URL", "https://api.moonshot.cn/v1")
	t.Setenv("XAI_API_KEY", "")
	t.Setenv("DEEPSEEK_API_KEY", "")

	cfg := DefaultConfig()
	applyEnvOverrides(cfg)

	if len(cfg.ModelList) < 1 {
		t.Fatal("empty ModelList")
	}
	entry := cfg.ModelList[0]
	if entry.Model != "kimi-k2.7-code" {
		t.Fatalf("Model = %q", entry.Model)
	}
	if entry.ThinkingLevel != "low" {
		t.Fatalf("ThinkingLevel = %q", entry.ThinkingLevel)
	}
	if entry.APIBase != "https://api.moonshot.cn/v1" {
		t.Fatalf("APIBase = %q", entry.APIBase)
	}
}

func TestApplyEnvOverrides_MoonshotBeforeXAI(t *testing.T) {
	t.Setenv("MOONSHOT_API_KEY", "sk-ms")
	t.Setenv("XAI_API_KEY", "xai-key")
	t.Setenv("DEEPSEEK_API_KEY", "")

	cfg := DefaultConfig()
	applyEnvOverrides(cfg)

	if len(cfg.ModelList) < 2 {
		t.Fatalf("want moonshot + xai (+ zkrouter), got %d", len(cfg.ModelList))
	}
	if cfg.ModelList[0].ModelName != "kimi-k3" {
		t.Fatalf("primary ModelName = %q, want kimi-k3", cfg.ModelList[0].ModelName)
	}
	if cfg.ModelList[1].ModelName != "grok" {
		t.Fatalf("second ModelName = %q, want grok", cfg.ModelList[1].ModelName)
	}
}

func TestMoonshotConstants(t *testing.T) {
	if MoonshotDefaultModel != "kimi-k3" {
		t.Fatalf("MoonshotDefaultModel = %q", MoonshotDefaultModel)
	}
	if MoonshotBaseURL != "https://api.moonshot.ai/v1" {
		t.Fatalf("MoonshotBaseURL = %q", MoonshotBaseURL)
	}
}
