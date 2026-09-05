package e2bcomputer

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidSandboxID(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		id   string
		ok   bool
	}{
		{name: "typical", id: "sbx_abc-123", ok: true},
		{name: "short", id: "abc", ok: false},
		{name: "slash", id: "sbx/evil", ok: false},
		{name: "empty", id: "", ok: false},
		{name: "space", id: "sbx abc", ok: false},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := ValidSandboxID(tt.id); got != tt.ok {
				t.Fatalf("ValidSandboxID(%q)=%v want %v", tt.id, got, tt.ok)
			}
		})
	}
}

func TestValidPreset(t *testing.T) {
	t.Parallel()
	if !ValidPreset("skills") {
		t.Fatal("skills should be allowlisted")
	}
	if ValidPreset("rm -rf /") {
		t.Fatal("raw shell must be rejected")
	}
	if ValidPreset("") {
		t.Fatal("empty preset must be rejected")
	}
}

func TestComputerURL(t *testing.T) {
	t.Parallel()
	got := ComputerURL("sbx_abc", "e2b.app")
	want := "https://8787-sbx_abc.e2b.app"
	if got != want {
		t.Fatalf("ComputerURL=%q want %q", got, want)
	}
	if ReadyURL("sbx_abc", "https://e2b.app/") != want+"/health" {
		t.Fatalf("ReadyURL=%q", ReadyURL("sbx_abc", "https://e2b.app/"))
	}
}

func TestClampTimeout(t *testing.T) {
	t.Parallel()
	if ClampTimeout(0) != DefaultTimeoutSeconds {
		t.Fatalf("zero → default, got %d", ClampTimeout(0))
	}
	if ClampTimeout(99999) != MaxTimeoutSeconds {
		t.Fatalf("cap, got %d", ClampTimeout(99999))
	}
	if ClampTimeout(120) != 120 {
		t.Fatalf("passthrough, got %d", ClampTimeout(120))
	}
}

func TestStripHost(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in, want string
	}{
		{"e2b.app", "e2b.app"},
		{"https://e2b.app/", "e2b.app"},
		{"http://sandbox.e2b.dev/path", "sandbox.e2b.dev"},
	}
	for _, tt := range cases {
		if got := stripHost(tt.in); got != tt.want {
			t.Fatalf("stripHost(%q)=%q want %q", tt.in, got, tt.want)
		}
	}
}

func TestNewStatus_noSecrets(t *testing.T) {
	t.Parallel()
	st := NewStatus(true, "env")
	raw, err := json.Marshal(st)
	if err != nil {
		t.Fatal(err)
	}
	body := string(raw)
	for _, leak := range []string{"envdAccessToken", "E2B_API_KEY", "CLAWDBOT_COMPUTER_TOKEN"} {
		if strings.Contains(body, leak) {
			t.Fatalf("status leaked %s: %s", leak, body)
		}
	}
	if st.Product != "Clawd Bot" || st.Package != "clawdbot-go" {
		t.Fatalf("branding=%#v", st)
	}
	if st.Template.Alias != TemplateAlias {
		t.Fatalf("alias=%s", st.Template.Alias)
	}
}

func TestInstallScript(t *testing.T) {
	t.Parallel()
	src := InstallScript()
	if !strings.HasPrefix(src, "#!/usr/bin/env bash") {
		t.Fatal("missing shebang")
	}
	if !strings.Contains(src, "skills-install --force") {
		t.Fatal("missing skills-install")
	}
	if !strings.Contains(src, "oneshot --skip-go") {
		t.Fatal("missing oneshot")
	}
	if strings.Contains(src, "envdAccessToken") {
		t.Fatal("install script must not mention envd tokens")
	}
}

func TestClient_CreateListKillExec(t *testing.T) {
	t.Parallel()
	var createdToken string
	desk := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/exec" {
			if r.Header.Get("X-Clawd-Token") == "" {
				http.Error(w, `{"ok":false,"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"ok":true,"preset":"help","stdout":"clawdbot-go","stderr":""}`)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(desk.Close)

	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/sandboxes":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode create: %v", err)
			}
			if body["templateID"] != TemplateAlias {
				t.Errorf("templateID=%v", body["templateID"])
			}
			if env, ok := body["envVars"].(map[string]any); ok {
				createdToken, _ = env["CLAWDBOT_COMPUTER_TOKEN"].(string)
			}
			if strings.Contains(fmtJSON(body), "envdAccessToken") {
				t.Error("create request leaked envd token")
			}
			w.WriteHeader(http.StatusCreated)
			_, _ = io.WriteString(w, `{"sandboxID":"sbx_test01","templateID":"clawdbot-computer","alias":"clawdbot-computer","domain":"e2b.app","envdAccessToken":"secret-envd"}`)
		case r.Method == http.MethodGet && r.URL.Path == "/sandboxes/sbx_test01":
			_, _ = io.WriteString(w, `{"sandboxID":"sbx_test01","templateID":"clawdbot-computer","alias":"clawdbot-computer","state":"running","domain":"e2b.app"}`)
		case r.Method == http.MethodDelete && r.URL.Path == "/sandboxes/sbx_test01":
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/v2/sandboxes"):
			_, _ = io.WriteString(w, `[{"sandboxID":"sbx_test01","alias":"clawdbot-computer","state":"running","domain":"e2b.app"}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(api.Close)

	c := NewClient("e2b_test")
	c.BaseURL = api.URL
	c.HTTPClient = api.Client()
	c.DeskURL = desk.URL

	ctx := context.Background()
	spawn, err := c.Create(ctx, 60, "")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if spawn.SandboxID != "sbx_test01" {
		t.Fatalf("id=%s", spawn.SandboxID)
	}
	if spawn.Token == "" || spawn.Token != createdToken {
		t.Fatalf("token not injected")
	}
	raw, _ := json.Marshal(spawn)
	if strings.Contains(string(raw), spawn.Token) || strings.Contains(string(raw), "secret-envd") {
		t.Fatalf("spawn JSON leaked secret: %s", raw)
	}

	list, err := c.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 || list[0].SandboxID != "sbx_test01" {
		t.Fatalf("list=%#v", list)
	}

	got, err := c.Get(ctx, "sbx_test01")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ComputerURL != ComputerURL("sbx_test01", "e2b.app") {
		t.Fatalf("computerUrl=%s", got.ComputerURL)
	}

	exec, err := c.Exec(ctx, "sbx_test01", spawn.Token, "help")
	if err != nil {
		t.Fatalf("Exec: %v", err)
	}
	if !exec.OK || !strings.Contains(exec.Stdout, "clawdbot-go") {
		t.Fatalf("exec=%#v", exec)
	}

	if _, err := c.Exec(ctx, "sbx_test01", spawn.Token, "rm"); !errors.Is(err, ErrUnknownPreset) {
		t.Fatalf("unknown preset err=%v", err)
	}

	if err := c.Kill(ctx, "sbx_test01"); err != nil {
		t.Fatalf("Kill: %v", err)
	}
}

func TestClient_CreateMissingTemplate(t *testing.T) {
	t.Parallel()
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"message":"template not found"}`, http.StatusNotFound)
	}))
	t.Cleanup(api.Close)
	c := NewClient("e2b_test")
	c.BaseURL = api.URL
	c.HTTPClient = api.Client()
	_, err := c.Create(context.Background(), 30, "tok")
	if err == nil || !strings.Contains(err.Error(), "python e2b/clawdbot-computer/build.py") {
		t.Fatalf("want template hint, got %v", err)
	}
}

func TestClient_MissingAPIKey(t *testing.T) {
	t.Parallel()
	c := NewClient("")
	if _, err := c.Create(context.Background(), 0, ""); !errors.Is(err, ErrMissingAPIKey) {
		t.Fatalf("err=%v", err)
	}
}

func fmtJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
