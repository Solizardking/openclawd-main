package webconsole

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewHandler_servesHealthWithoutSourceTree(t *testing.T) {
	cfg := filepath.Join(t.TempDir(), "no-such-config.json")
	h, meta, err := newHandler(Options{
		Port:       "18800",
		NoBrowser:  true,
		ConfigPath: cfg,
	})
	if err != nil {
		t.Fatalf("newHandler: %v", err)
	}
	if meta.Addr == "" {
		t.Fatal("empty listen addr")
	}

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if strings.TrimSpace(rr.Body.String()) == "" {
		t.Fatal("empty health body")
	}
	var body map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" || body["agent"] == "" {
		t.Fatalf("health=%#v", body)
	}

	req = httptest.NewRequest(http.MethodGet, "/", nil)
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET / status=%d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "Clawd") && rr.Body.Len() == 0 {
		t.Fatal("expected embedded frontend or fallback HTML")
	}
}
