package webconsole

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestE2BComputer_noKey(t *testing.T) {
	t.Setenv("E2B_API_KEY", "")
	t.Setenv("CLAWDBOT_VAULT_ENV_FILE", filepath.Join(t.TempDir(), "missing.env"))

	h, _, err := newHandler(Options{
		Port:       "18800",
		NoBrowser:  true,
		ConfigPath: filepath.Join(t.TempDir(), "no-config.json"),
	})
	if err != nil {
		t.Fatalf("newHandler: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/e2b/computer", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET status=%d body=%s", rr.Code, rr.Body.String())
	}
	body := rr.Body.String()
	if strings.Contains(body, "e2b_") || strings.Contains(body, "envdAccessToken") {
		t.Fatalf("leaked secret: %s", body)
	}
	var st map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &st); err != nil {
		t.Fatal(err)
	}
	if st["keySet"] != false {
		t.Fatalf("keySet=%v", st["keySet"])
	}
	if st["product"] != "Clawd Bot" {
		t.Fatalf("product=%v", st["product"])
	}

	req = httptest.NewRequest(http.MethodPost, "/api/e2b/computer", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("POST spawn status=%d body=%s", rr.Code, rr.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/e2b/install.sh", nil)
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("install.sh status=%d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "skills-install --force") {
		t.Fatalf("install.sh body=%s", rr.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/connectors", nil)
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if !strings.Contains(rr.Body.String(), "E2B Computer") {
		t.Fatalf("connectors missing E2B: %s", rr.Body.String())
	}
}

func TestE2BComputer_spawnExecKill(t *testing.T) {
	desk := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/exec" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"ok":true,"preset":"help","stdout":"Clawd Bot","stderr":""}`)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(desk.Close)

	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/sandboxes":
			w.WriteHeader(http.StatusCreated)
			_, _ = io.WriteString(w, `{"sandboxID":"sbx_web01","templateID":"clawdbot-computer","alias":"clawdbot-computer","domain":"e2b.app","envdAccessToken":"do-not-leak"}`)
		case r.Method == http.MethodGet && r.URL.Path == "/sandboxes/sbx_web01":
			_, _ = io.WriteString(w, `{"sandboxID":"sbx_web01","alias":"clawdbot-computer","state":"running","domain":"e2b.app"}`)
		case r.Method == http.MethodDelete && r.URL.Path == "/sandboxes/sbx_web01":
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/v2/sandboxes"):
			_, _ = io.WriteString(w, `[{"sandboxID":"sbx_web01","alias":"clawdbot-computer","state":"running"}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(api.Close)

	t.Setenv("E2B_API_KEY", "e2b_test_key")
	t.Setenv("E2B_API_BASE", api.URL)
	t.Setenv("E2B_DESK_BASE", desk.URL)

	h, _, err := newHandler(Options{
		Port:       "18800",
		NoBrowser:  true,
		ConfigPath: filepath.Join(t.TempDir(), "no-config.json"),
	})
	if err != nil {
		t.Fatalf("newHandler: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/e2b/computer", strings.NewReader(`{"timeout":60}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("spawn status=%d body=%s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "do-not-leak") || strings.Contains(rr.Body.String(), "e2b_test_key") {
		t.Fatalf("spawn leaked secret: %s", rr.Body.String())
	}
	var spawned map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &spawned); err != nil {
		t.Fatal(err)
	}
	if spawned["sandboxId"] != "sbx_web01" {
		t.Fatalf("spawned=%#v", spawned)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/e2b/computer/sbx_web01/exec", strings.NewReader(`{"preset":"help"}`))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("exec status=%d body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "Clawd Bot") {
		t.Fatalf("exec body=%s", rr.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/e2b/computer/sbx_web01/exec", strings.NewReader(`{"preset":"rm -rf"}`))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("bad preset status=%d", rr.Code)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/e2b/computer/sbx_web01", nil)
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("kill status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestE2BComputer_corsDelete(t *testing.T) {
	t.Setenv("CLAWDBOT_CORS_ORIGINS", "http://localhost:5173")
	h, _, err := newHandler(Options{
		Port:       "18800",
		NoBrowser:  true,
		ConfigPath: filepath.Join(t.TempDir(), "no-config.json"),
	})
	if err != nil {
		t.Fatalf("newHandler: %v", err)
	}
	req := httptest.NewRequest(http.MethodOptions, "/api/e2b/computer/sbx_x/exec", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS status=%d", rr.Code)
	}
	if !strings.Contains(rr.Header().Get("Access-Control-Allow-Methods"), "DELETE") {
		t.Fatalf("CORS methods=%s", rr.Header().Get("Access-Control-Allow-Methods"))
	}
}
