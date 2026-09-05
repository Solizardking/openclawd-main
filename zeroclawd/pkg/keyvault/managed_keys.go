package keyvault

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

// ManagedKey is a user-facing API key slot the web console can prompt for.
type ManagedKey struct {
	Name        string `json:"name"`
	Label       string `json:"label"`
	Group       string `json:"group"`
	Hint        string `json:"hint,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
}

// ManagedAPIKeys is the allowlist of env vars the one-click API key popup may set.
// Unknown names are rejected on write so the UI cannot inject arbitrary env keys.
var ManagedAPIKeys = []ManagedKey{
	{Name: "MOONSHOT_API_KEY", Label: "Moonshot Kimi K3", Group: "llm", Hint: "platform.kimi.ai/console/api-keys", Placeholder: "sk-…"},
	{Name: "XAI_API_KEY", Label: "xAI Grok", Group: "llm", Hint: "console.x.ai", Placeholder: "xai-…"},
	{Name: "OPENROUTER_API_KEY", Label: "OpenRouter", Group: "llm", Hint: "openrouter.ai/keys", Placeholder: "sk-or-…"},
	{Name: "DEEPSEEK_API_KEY", Label: "DeepSeek", Group: "llm", Hint: "platform.deepseek.com", Placeholder: "sk-…"},
	{Name: "OPENAI_API_KEY", Label: "OpenAI", Group: "llm", Hint: "platform.openai.com", Placeholder: "sk-…"},
	{Name: "ANTHROPIC_API_KEY", Label: "Anthropic", Group: "llm", Hint: "console.anthropic.com", Placeholder: "sk-ant-…"},
	{Name: "GROQ_API_KEY", Label: "Groq", Group: "llm", Hint: "console.groq.com", Placeholder: "gsk_…"},
	{Name: "HELIUS_API_KEY", Label: "Helius RPC", Group: "solana", Hint: "dashboard.helius.dev", Placeholder: "helius-…"},
	{Name: "BIRDEYE_API_KEY", Label: "Birdeye", Group: "solana", Hint: "birdeye.so", Placeholder: "…"},
	{Name: "JUPITER_API_KEY", Label: "Jupiter", Group: "solana", Hint: "portal.jup.ag", Placeholder: "…"},
	{Name: "ASTER_API_KEY", Label: "Aster API key", Group: "perps", Hint: "Aster DEX", Placeholder: "…"},
	{Name: "ASTER_API_SECRET", Label: "Aster API secret", Group: "perps", Hint: "HMAC secret", Placeholder: "…"},
	// Robinhood Chain / Blockscout — required for omni launch, deploy, Pons + Uniswap RH flows.
	// RH_RPC_URL is an endpoint URL (not a secret token) but still managed so the Connectors
	// popup can set it without a second secret path. Public RPC is a read-only fallback only.
	{Name: "BLOCKSCOUT_API_KEY", Label: "Blockscout PRO", Group: "robinhood", Hint: "dev.blockscout.com", Placeholder: "proapi_…"},
	{Name: "RH_RPC_URL", Label: "Robinhood RPC", Group: "robinhood", Hint: "rpc.mainnet.chain.robinhood.com or Alchemy", Placeholder: "https://…"},
	{Name: "TELEGRAM_BOT_TOKEN", Label: "Telegram bot", Group: "channels", Hint: "@BotFather", Placeholder: "123456:ABC…"},
	{Name: "DISCORD_BOT_TOKEN", Label: "Discord bot", Group: "channels", Hint: "Discord developer portal", Placeholder: "…"},
	{Name: "BROWSERUSE_API_KEY", Label: "Browser Use", Group: "browser", Hint: "cloud.browser-use.com", Placeholder: "bu_…"},
	{Name: "KERNEL_API_KEY", Label: "Kernel browser", Group: "browser", Hint: "onkernel.com", Placeholder: "…"},
	{Name: "E2B_API_KEY", Label: "E2B sandbox", Group: "compute", Hint: "e2b.dev", Placeholder: "e2b_…"},
	{Name: "SUPABASE_URL", Label: "Supabase URL", Group: "data", Hint: "project URL", Placeholder: "https://….supabase.co"},
	{Name: "SUPABASE_SERVICE_KEY", Label: "Supabase service key", Group: "data", Hint: "service_role (server only)", Placeholder: "eyJ…"},
}

// ManagedKeyNames returns the allowlisted env var names.
func ManagedKeyNames() []string {
	out := make([]string, 0, len(ManagedAPIKeys))
	for _, k := range ManagedAPIKeys {
		out = append(out, k.Name)
	}
	return out
}

// IsManagedKey reports whether name is in the allowlist.
func IsManagedKey(name string) bool {
	name = strings.TrimSpace(name)
	for _, k := range ManagedAPIKeys {
		if k.Name == name {
			return true
		}
	}
	return false
}

// KeyPresence is a secret-safe status for one managed key (never includes values).
type KeyPresence struct {
	Name        string `json:"name"`
	Label       string `json:"label"`
	Group       string `json:"group"`
	Hint        string `json:"hint,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
	Set         bool   `json:"set"`
	Source      string `json:"source,omitempty"` // "env", "file", or ""
}

// ListManagedKeyPresence reports which allowlisted keys are configured.
// Values are never returned.
func ListManagedKeyPresence(envFile string) ([]KeyPresence, error) {
	fileVals := map[string]string{}
	if strings.TrimSpace(envFile) != "" {
		vals, err := parseFile(envFile)
		if err == nil {
			fileVals = vals
		} else if !errors.Is(err, os.ErrNotExist) && !os.IsNotExist(err) {
			// Missing file is fine (no keys yet). Other errors surface.
			if _, statErr := os.Stat(envFile); statErr == nil {
				return nil, err
			}
		}
	}
	out := make([]KeyPresence, 0, len(ManagedAPIKeys))
	for _, k := range ManagedAPIKeys {
		p := KeyPresence{
			Name:        k.Name,
			Label:       k.Label,
			Group:       k.Group,
			Hint:        k.Hint,
			Placeholder: k.Placeholder,
		}
		if v := strings.TrimSpace(os.Getenv(k.Name)); v != "" {
			p.Set = true
			p.Source = "env"
		} else if v := strings.TrimSpace(fileVals[k.Name]); v != "" {
			p.Set = true
			p.Source = "file"
		}
		out = append(out, p)
	}
	return out, nil
}

// UpsertEnvFile updates or appends allowlisted keys in a dotenv file.
// Empty values remove the assignment (key line deleted). Unknown keys error.
// Does not log secret values.
func UpsertEnvFile(path string, updates map[string]string) (written []string, err error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, fmt.Errorf("env file path is required")
	}
	if abs, e := filepath.Abs(path); e == nil {
		path = abs
	}

	clean := make(map[string]string, len(updates))
	for k, v := range updates {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if !IsManagedKey(k) {
			return nil, fmt.Errorf("key not allowed: %s", k)
		}
		if isControlKey(k) {
			return nil, fmt.Errorf("control key not writable via UI: %s", k)
		}
		clean[k] = strings.TrimSpace(v)
	}
	if len(clean) == 0 {
		return nil, fmt.Errorf("no keys to update")
	}

	var lines []string
	if data, readErr := os.ReadFile(path); readErr == nil {
		lines = strings.Split(string(data), "\n")
		// Drop trailing empty element from trailing newline so we re-add cleanly
		if len(lines) > 0 && lines[len(lines)-1] == "" {
			lines = lines[:len(lines)-1]
		}
	} else if !os.IsNotExist(readErr) {
		return nil, fmt.Errorf("read env file: %w", readErr)
	}

	seen := make(map[string]bool)
	var outLines []string
	for _, line := range lines {
		key, _, isAssign := parseAssignmentLine(line)
		if !isAssign {
			outLines = append(outLines, line)
			continue
		}
		if newVal, ok := clean[key]; ok {
			seen[key] = true
			if newVal == "" {
				// omit line = clear key
				continue
			}
			outLines = append(outLines, key+"="+dotenvQuote(newVal))
			continue
		}
		outLines = append(outLines, line)
	}
	for k, v := range clean {
		if seen[k] {
			continue
		}
		if v == "" {
			continue
		}
		outLines = append(outLines, k+"="+dotenvQuote(v))
		seen[k] = true
	}

	body := strings.Join(outLines, "\n")
	if body != "" && !strings.HasSuffix(body, "\n") {
		body += "\n"
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(body), 0o600); err != nil {
		return nil, err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return nil, err
	}

	// Apply to current process so connectors flip without restart.
	for k, v := range clean {
		if v == "" {
			_ = os.Unsetenv(k)
		} else {
			_ = os.Setenv(k, v)
		}
		written = append(written, k)
	}
	return written, nil
}

func parseAssignmentLine(line string) (key string, value string, ok bool) {
	s := strings.TrimSpace(line)
	if s == "" || strings.HasPrefix(s, "#") {
		return "", "", false
	}
	s = strings.TrimPrefix(s, "export ")
	s = strings.TrimSpace(s)
	k, v, cut := strings.Cut(s, "=")
	if !cut {
		return "", "", false
	}
	k = strings.TrimSpace(k)
	if !validKey(k) {
		return "", "", false
	}
	return k, unquote(strings.TrimSpace(v)), true
}

func dotenvQuote(value string) string {
	// Quote when value has spaces or special dotenv chars.
	needs := false
	for _, r := range value {
		if unicode.IsSpace(r) || r == '#' || r == '"' || r == '\'' || r == '\\' || r == '=' {
			needs = true
			break
		}
	}
	if !needs {
		return value
	}
	esc := strings.ReplaceAll(value, `\`, `\\`)
	esc = strings.ReplaceAll(esc, `"`, `\"`)
	return `"` + esc + `"`
}
