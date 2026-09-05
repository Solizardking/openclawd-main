package webconsole

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/8bitlabs/clawdbot/pkg/e2bcomputer"
)

var e2bTokens sync.Map // sandboxID → computer token (never JSON-encoded)

func registerE2BRoutes(mux *http.ServeMux, projectRoot string) {
	mux.HandleFunc("/api/e2b/computer", e2bComputerRootHandler(projectRoot))
	mux.HandleFunc("/api/e2b/computer/sandboxes", e2bComputerListHandler(projectRoot))
	mux.HandleFunc("/api/e2b/computer/{id}", e2bComputerItemHandler(projectRoot))
	mux.HandleFunc("/api/e2b/computer/{id}/exec", e2bComputerExecHandler(projectRoot))
	mux.HandleFunc("/api/e2b/install.sh", e2bInstallScriptHandler())
}

func e2bComputerRootHandler(projectRoot string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			client, source, err := lookupE2B(projectRoot)
			st := e2bcomputer.NewStatus(err == nil, source)
			payload := map[string]any{
				"ok":            st.OK,
				"product":       st.Product,
				"package":       st.Package,
				"npmSpec":       st.NPMSpec,
				"template":      st.Template,
				"keySet":        st.KeySet,
				"oneshot":       st.Oneshot,
				"build":         st.Build,
				"installScript": st.Install,
				"hosted":        st.Hosted,
				"presets":       st.Presets,
				"sandboxes":     []e2bcomputer.SandboxView{},
			}
			if st.KeySource != "" {
				payload["keySource"] = st.KeySource
			}
			if client != nil {
				if list, lerr := client.List(r.Context()); lerr == nil {
					payload["sandboxes"] = list
				}
			}
			writeJSON(w, http.StatusOK, payload)
		case http.MethodPost:
			client, _, err := lookupE2B(projectRoot)
			if err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{
					"ok":     false,
					"keySet": false,
					"error":  "E2B_API_KEY is not set — save it in API Keys or export E2B_API_KEY",
					"build":  "python e2b/clawdbot-computer/build.py",
				})
				return
			}
			var body struct {
				Timeout int `json:"timeout"`
			}
			if r.Body != nil {
				_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body)
			}
			spawn, err := client.Create(r.Context(), body.Timeout, "")
			if err != nil {
				status := http.StatusBadGateway
				if errors.Is(err, e2bcomputer.ErrMissingAPIKey) {
					status = http.StatusServiceUnavailable
				}
				writeJSON(w, status, map[string]any{
					"ok":    false,
					"error": err.Error(),
					"build": "python e2b/clawdbot-computer/build.py",
				})
				return
			}
			e2bTokens.Store(spawn.SandboxID, spawn.Token)
			writeJSON(w, http.StatusCreated, spawn.SandboxView)
		default:
			w.Header().Set("Allow", "GET, POST")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func e2bComputerListHandler(projectRoot string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		client, _, err := lookupE2B(projectRoot)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"ok":     false,
				"keySet": false,
				"error":  "E2B_API_KEY is not set",
			})
			return
		}
		list, err := client.List(r.Context())
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "sandboxes": list})
	}
}

func e2bComputerItemHandler(projectRoot string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.PathValue("id"))
		if !e2bcomputer.ValidSandboxID(id) {
			http.Error(w, "invalid sandbox id", http.StatusBadRequest)
			return
		}
		client, _, err := lookupE2B(projectRoot)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "E2B_API_KEY is not set"})
			return
		}
		switch r.Method {
		case http.MethodGet:
			view, err := client.Get(r.Context(), id)
			if err != nil {
				status := http.StatusBadGateway
				if errors.Is(err, e2bcomputer.ErrNotFound) {
					status = http.StatusNotFound
				}
				writeJSON(w, status, map[string]any{"ok": false, "error": err.Error()})
				return
			}
			ready, _ := client.ProbeReady(r.Context(), id)
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":          true,
				"sandbox":     view,
				"ready":       ready,
				"computerUrl": view.ComputerURL,
			})
		case http.MethodDelete:
			if err := client.Kill(r.Context(), id); err != nil && !errors.Is(err, e2bcomputer.ErrNotFound) {
				writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": err.Error()})
				return
			}
			e2bTokens.Delete(id)
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "sandboxId": id})
		default:
			w.Header().Set("Allow", "GET, DELETE")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func e2bComputerExecHandler(projectRoot string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		id := strings.TrimSpace(r.PathValue("id"))
		if !e2bcomputer.ValidSandboxID(id) {
			http.Error(w, "invalid sandbox id", http.StatusBadRequest)
			return
		}
		client, _, err := lookupE2B(projectRoot)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "E2B_API_KEY is not set"})
			return
		}
		var body struct {
			Preset string `json:"preset"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "invalid exec payload"})
			return
		}
		if !e2bcomputer.ValidPreset(body.Preset) {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"ok":      false,
				"error":   "unknown exec preset",
				"presets": e2bcomputer.Presets,
			})
			return
		}
		tokenVal, ok := e2bTokens.Load(id)
		if !ok {
			writeJSON(w, http.StatusConflict, map[string]any{
				"ok":    false,
				"error": "computer token not in this process — respawn the desk",
			})
			return
		}
		token, _ := tokenVal.(string)
		out, err := client.Exec(r.Context(), id, token, body.Preset)
		if err != nil {
			status := http.StatusBadGateway
			if errors.Is(err, e2bcomputer.ErrUnknownPreset) {
				status = http.StatusBadRequest
			}
			writeJSON(w, status, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func e2bInstallScriptHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Disposition", "inline; filename=\"install.sh\"")
		_, _ = w.Write([]byte(e2bcomputer.InstallScript()))
	}
}

func lookupE2B(projectRoot string) (*e2bcomputer.Client, string, error) {
	key, source := e2bAPIKey(projectRoot)
	if key == "" {
		return nil, "", e2bcomputer.ErrMissingAPIKey
	}
	c := e2bcomputer.NewClient(key)
	if base := strings.TrimSpace(os.Getenv("E2B_API_BASE")); base != "" {
		c.BaseURL = strings.TrimRight(base, "/")
	}
	if desk := strings.TrimSpace(os.Getenv("E2B_DESK_BASE")); desk != "" {
		c.DeskURL = strings.TrimRight(desk, "/")
	}
	return c, source, nil
}

func e2bAPIKey(projectRoot string) (string, string) {
	if v := strings.TrimSpace(os.Getenv("E2B_API_KEY")); v != "" {
		return v, "env"
	}
	vault, err := loadLocalVault(projectRoot)
	if err != nil || vault == nil {
		return "", ""
	}
	if v, ok := vault.Get("E2B_API_KEY"); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v), "file"
	}
	return "", ""
}

func e2bConnectorStatus(projectRoot string) string {
	if key, _ := e2bAPIKey(projectRoot); key != "" {
		return "connected"
	}
	return "not_configured"
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
