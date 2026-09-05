// Package e2bcomputer is the Clawd Bot E2B sandbox computer: template metadata,
// REST spawn/kill, and token-gated exec against the in-sandbox desk.
package e2bcomputer

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	TemplateAlias         = "clawdbot-computer"
	TemplateDir           = "e2b/clawdbot-computer"
	ComputerPort          = 8787
	DefaultNPMSpec        = "clawdbot-go@latest"
	DefaultAPIBase        = "https://api.e2b.app"
	DefaultSandboxDomain  = "e2b.app"
	DefaultTimeoutSeconds = 900
	MaxTimeoutSeconds     = 3600
	EnvdPort              = 49983
)

// Preset is an allowlisted command the desk may run. Raw shell is rejected.
var Presets = []string{"help", "skills", "inspect", "skills-dir", "oneshot", "bins"}

var (
	ErrMissingAPIKey  = errors.New("e2b api key is not set")
	ErrInvalidSandbox = errors.New("invalid sandbox id")
	ErrUnknownPreset  = errors.New("unknown exec preset")
	ErrNotFound       = errors.New("sandbox not found")
)

var sandboxIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{4,128}$`)

// Status is the secret-safe GET /api/e2b/computer payload.
type Status struct {
	OK        bool         `json:"ok"`
	Product   string       `json:"product"`
	Package   string       `json:"package"`
	NPMSpec   string       `json:"npmSpec"`
	Template  TemplateInfo `json:"template"`
	KeySet    bool         `json:"keySet"`
	KeySource string       `json:"keySource,omitempty"`
	Oneshot   []string     `json:"oneshot"`
	Build     string       `json:"build"`
	Install   string       `json:"installScript"`
	Hosted    string       `json:"hosted"`
	Presets   []string     `json:"presets"`
}

// TemplateInfo describes the in-repo E2B template.
type TemplateInfo struct {
	Alias     string `json:"alias"`
	Path      string `json:"path"`
	NPMSpec   string `json:"npmSpec"`
	StartPort int    `json:"startPort"`
	ReadyPath string `json:"readyPath"`
}

// SandboxView is the frontend-safe sandbox record (no access tokens).
type SandboxView struct {
	SandboxID   string `json:"sandboxId"`
	TemplateID  string `json:"templateId,omitempty"`
	Alias       string `json:"alias,omitempty"`
	State       string `json:"state,omitempty"`
	ComputerURL string `json:"computerUrl,omitempty"`
	ReadyURL    string `json:"readyUrl,omitempty"`
	Domain      string `json:"domain,omitempty"`
	StartedAt   string `json:"startedAt,omitempty"`
	EndAt       string `json:"endAt,omitempty"`
}

// SpawnResult is returned to the handler; Token is never JSON-encoded.
type SpawnResult struct {
	SandboxView
	Token string `json:"-"`
}

// ExecResult is stdout/stderr from an allowlisted preset.
type ExecResult struct {
	OK       bool   `json:"ok"`
	Preset   string `json:"preset"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode,omitempty"`
}

// Client talks to api.e2b.app and the in-sandbox desk.
type Client struct {
	APIKey     string
	BaseURL    string
	Domain     string
	DeskURL    string // optional override of ComputerURL (tests / local desk)
	HTTPClient *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		APIKey:     strings.TrimSpace(apiKey),
		BaseURL:    DefaultAPIBase,
		Domain:     DefaultSandboxDomain,
		HTTPClient: &http.Client{Timeout: 45 * time.Second},
	}
}

func (c *Client) http() *http.Client {
	if c != nil && c.HTTPClient != nil {
		return c.HTTPClient
	}
	return http.DefaultClient
}

func (c *Client) base() string {
	if c != nil && strings.TrimSpace(c.BaseURL) != "" {
		return strings.TrimRight(c.BaseURL, "/")
	}
	return DefaultAPIBase
}

func (c *Client) domain() string {
	if c != nil && strings.TrimSpace(c.Domain) != "" {
		return stripHost(c.Domain)
	}
	return DefaultSandboxDomain
}

// NewStatus is the poll payload. keySource is "env" or "file" or empty.
func NewStatus(keySet bool, keySource string) Status {
	return Status{
		OK:      true,
		Product: "Clawd Bot",
		Package: "clawdbot-go",
		NPMSpec: DefaultNPMSpec,
		Template: TemplateInfo{
			Alias:     TemplateAlias,
			Path:      TemplateDir,
			NPMSpec:   DefaultNPMSpec,
			StartPort: ComputerPort,
			ReadyPath: "/health",
		},
		KeySet:    keySet,
		KeySource: keySource,
		Oneshot: []string{
			"npx --yes clawdbot-go@latest skills-install --force",
			"npx --yes clawdbot-go@latest oneshot --skip-go --skip-automaton --skip-birth --force",
			"npx --yes clawdbot-go@latest skills",
		},
		Build:   "python e2b/clawdbot-computer/build.py",
		Install: "/api/e2b/install.sh",
		Hosted:  "https://cheshireterminal.ai/cheshire-computer",
		Presets: append([]string(nil), Presets...),
	}
}

func ValidSandboxID(id string) bool {
	return sandboxIDRe.MatchString(strings.TrimSpace(id))
}

func ValidPreset(name string) bool {
	name = strings.TrimSpace(name)
	for _, p := range Presets {
		if p == name {
			return true
		}
	}
	return false
}

func NewComputerToken() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", fmt.Errorf("computer token: %w", err)
	}
	return hex.EncodeToString(buf[:]), nil
}

func ComputerHost(sandboxID, domain string) string {
	id := strings.TrimSpace(sandboxID)
	d := stripHost(domain)
	if d == "" {
		d = DefaultSandboxDomain
	}
	return fmt.Sprintf("%d-%s.%s", ComputerPort, id, d)
}

func ComputerURL(sandboxID, domain string) string {
	return "https://" + ComputerHost(sandboxID, domain)
}

func ReadyURL(sandboxID, domain string) string {
	return ComputerURL(sandboxID, domain) + "/health"
}

func ClampTimeout(seconds int) int {
	if seconds <= 0 {
		return DefaultTimeoutSeconds
	}
	if seconds > MaxTimeoutSeconds {
		return MaxTimeoutSeconds
	}
	return seconds
}

func stripHost(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	raw = strings.TrimSuffix(raw, "/")
	if host, rest, ok := strings.Cut(raw, "/"); ok {
		_ = rest
		raw = host
	}
	if u, err := url.Parse("https://" + raw); err == nil && u.Host != "" {
		return u.Host
	}
	return raw
}

type createRequest struct {
	TemplateID          string            `json:"templateID"`
	Timeout             int               `json:"timeout"`
	Secure              bool              `json:"secure"`
	AllowInternetAccess bool              `json:"allow_internet_access"`
	Metadata            map[string]string `json:"metadata"`
	EnvVars             map[string]string `json:"envVars"`
}

type createResponse struct {
	TemplateID      string `json:"templateID"`
	SandboxID       string `json:"sandboxID"`
	Alias           string `json:"alias"`
	EnvdAccessToken string `json:"envdAccessToken"`
	Domain          string `json:"domain"`
}

type sandboxGET struct {
	TemplateID string `json:"templateID"`
	SandboxID  string `json:"sandboxID"`
	Alias      string `json:"alias"`
	State      string `json:"state"`
	Domain     string `json:"domain"`
	StartedAt  string `json:"startedAt"`
	EndAt      string `json:"endAt"`
}

// Create spawns a clawdbot-computer sandbox. token is injected as CLAWDBOT_COMPUTER_TOKEN.
func (c *Client) Create(ctx context.Context, timeoutSeconds int, token string) (*SpawnResult, error) {
	if c == nil || strings.TrimSpace(c.APIKey) == "" {
		return nil, ErrMissingAPIKey
	}
	token = strings.TrimSpace(token)
	if token == "" {
		generated, err := NewComputerToken()
		if err != nil {
			return nil, err
		}
		token = generated
	}
	body := createRequest{
		TemplateID:          TemplateAlias,
		Timeout:             ClampTimeout(timeoutSeconds),
		Secure:              true,
		AllowInternetAccess: true,
		Metadata: map[string]string{
			"product": "clawd-bot",
			"app":     TemplateAlias,
		},
		EnvVars: map[string]string{
			"CLAWDBOT_COMPUTER_TOKEN": token,
			"CLAWDBOT_NPM_SPEC":       DefaultNPMSpec,
			"CLAWDBOT_SKILLS_DIR":     "/home/user/.clawdbot/skills",
		},
	}
	var out createResponse
	if err := c.doJSON(ctx, http.MethodPost, "/sandboxes", body, http.StatusCreated, &out); err != nil {
		return nil, templateHint(err)
	}
	domain := firstNonEmpty(out.Domain, c.domain())
	id := strings.TrimSpace(out.SandboxID)
	if !ValidSandboxID(id) {
		return nil, fmt.Errorf("%w: %s", ErrInvalidSandbox, id)
	}
	return &SpawnResult{
		SandboxView: SandboxView{
			SandboxID:   id,
			TemplateID:  firstNonEmpty(out.TemplateID, TemplateAlias),
			Alias:       firstNonEmpty(out.Alias, TemplateAlias),
			State:       "running",
			ComputerURL: ComputerURL(id, domain),
			ReadyURL:    ReadyURL(id, domain),
			Domain:      stripHost(domain),
		},
		Token: token,
	}, nil
}

func (c *Client) Get(ctx context.Context, sandboxID string) (*SandboxView, error) {
	if err := requireKeyAndID(c, sandboxID); err != nil {
		return nil, err
	}
	var out sandboxGET
	if err := c.doJSON(ctx, http.MethodGet, "/sandboxes/"+url.PathEscape(sandboxID), nil, http.StatusOK, &out); err != nil {
		return nil, err
	}
	id := firstNonEmpty(out.SandboxID, sandboxID)
	domain := firstNonEmpty(out.Domain, c.domain())
	return &SandboxView{
		SandboxID:   id,
		TemplateID:  out.TemplateID,
		Alias:       firstNonEmpty(out.Alias, TemplateAlias),
		State:       firstNonEmpty(out.State, "running"),
		ComputerURL: ComputerURL(id, domain),
		ReadyURL:    ReadyURL(id, domain),
		Domain:      stripHost(domain),
		StartedAt:   out.StartedAt,
		EndAt:       out.EndAt,
	}, nil
}

func (c *Client) Kill(ctx context.Context, sandboxID string) error {
	if err := requireKeyAndID(c, sandboxID); err != nil {
		return err
	}
	return c.doJSON(ctx, http.MethodDelete, "/sandboxes/"+url.PathEscape(sandboxID), nil, http.StatusOK, nil)
}

func (c *Client) List(ctx context.Context) ([]SandboxView, error) {
	if c == nil || strings.TrimSpace(c.APIKey) == "" {
		return nil, ErrMissingAPIKey
	}
	reqURL := c.base() + "/v2/sandboxes?metadata=" + url.QueryEscape("app="+TemplateAlias)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	c.auth(req)
	res, err := c.http().Do(req)
	if err != nil {
		return nil, fmt.Errorf("list sandboxes: %w", err)
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, apiError(res.StatusCode, payload)
	}
	views := parseSandboxList(payload, c.domain())
	return views, nil
}

func parseSandboxList(payload []byte, domain string) []SandboxView {
	var asArray []sandboxGET
	if err := json.Unmarshal(payload, &asArray); err == nil {
		return mapSandboxList(asArray, domain)
	}
	var wrapped struct {
		Sandboxes []sandboxGET `json:"sandboxes"`
	}
	if err := json.Unmarshal(payload, &wrapped); err == nil {
		return mapSandboxList(wrapped.Sandboxes, domain)
	}
	return nil
}

func mapSandboxList(items []sandboxGET, domain string) []SandboxView {
	out := make([]SandboxView, 0, len(items))
	for _, item := range items {
		id := strings.TrimSpace(item.SandboxID)
		if !ValidSandboxID(id) {
			continue
		}
		d := firstNonEmpty(item.Domain, domain)
		out = append(out, SandboxView{
			SandboxID:   id,
			TemplateID:  item.TemplateID,
			Alias:       firstNonEmpty(item.Alias, TemplateAlias),
			State:       firstNonEmpty(item.State, "running"),
			ComputerURL: ComputerURL(id, d),
			ReadyURL:    ReadyURL(id, d),
			Domain:      stripHost(d),
			StartedAt:   item.StartedAt,
			EndAt:       item.EndAt,
		})
	}
	return out
}

// Exec runs an allowlisted preset on the sandbox desk (POST /exec).
func (c *Client) Exec(ctx context.Context, sandboxID, token, preset string) (*ExecResult, error) {
	if !ValidSandboxID(sandboxID) {
		return nil, ErrInvalidSandbox
	}
	if !ValidPreset(preset) {
		return nil, ErrUnknownPreset
	}
	desk := ""
	if c != nil {
		desk = strings.TrimRight(strings.TrimSpace(c.DeskURL), "/")
	}
	if desk == "" {
		view, err := c.Get(ctx, sandboxID)
		if err != nil {
			return nil, err
		}
		desk = strings.TrimRight(view.ComputerURL, "/")
	}
	body, _ := json.Marshal(map[string]string{"preset": preset})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, desk+"/exec", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("X-Clawd-Token", token)
	}
	res, err := c.http().Do(req)
	if err != nil {
		return nil, fmt.Errorf("desk exec: %w", err)
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	var out ExecResult
	if err := json.Unmarshal(payload, &out); err != nil {
		return nil, fmt.Errorf("desk exec: %w", err)
	}
	out.Preset = preset
	return &out, nil
}

func (c *Client) ProbeReady(ctx context.Context, sandboxID string) (bool, error) {
	view, err := c.Get(ctx, sandboxID)
	if err != nil {
		return false, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, view.ReadyURL, nil)
	if err != nil {
		return false, err
	}
	res, err := c.http().Do(req)
	if err != nil {
		return false, err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<16))
	return res.StatusCode == http.StatusOK, nil
}

func requireKeyAndID(c *Client, sandboxID string) error {
	if c == nil || strings.TrimSpace(c.APIKey) == "" {
		return ErrMissingAPIKey
	}
	if !ValidSandboxID(sandboxID) {
		return ErrInvalidSandbox
	}
	return nil
}

func (c *Client) auth(req *http.Request) {
	req.Header.Set("X-API-Key", c.APIKey)
	req.Header.Set("Content-Type", "application/json")
}

func (c *Client) doJSON(ctx context.Context, method, path string, body any, want int, dest any) error {
	var rdr io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base()+path, rdr)
	if err != nil {
		return err
	}
	c.auth(req)
	if body == nil {
		req.Header.Del("Content-Type")
	}
	res, err := c.http().Do(req)
	if err != nil {
		return fmt.Errorf("e2b %s %s: %w", method, path, err)
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return err
	}
	if res.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if !statusOK(res.StatusCode, want) {
		return apiError(res.StatusCode, payload)
	}
	if dest == nil || len(payload) == 0 {
		return nil
	}
	if err := json.Unmarshal(payload, dest); err != nil {
		return fmt.Errorf("e2b decode: %w", err)
	}
	return nil
}

func statusOK(got, want int) bool {
	if got == want {
		return true
	}
	// Create may return 200 or 201; kill may return 204.
	if want == http.StatusOK || want == http.StatusCreated {
		return got >= 200 && got < 300
	}
	return false
}

func templateHint(err error) error {
	if err == nil {
		return nil
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "template") || strings.Contains(msg, "not found") || strings.Contains(msg, "404") {
		return fmt.Errorf("template %s is not built — run: python e2b/clawdbot-computer/build.py (%w)", TemplateAlias, err)
	}
	return err
}

func apiError(status int, payload []byte) error {
	msg := strings.TrimSpace(string(payload))
	if len(msg) > 400 {
		msg = msg[:400]
	}
	msg = strings.ReplaceAll(msg, "\n", " ")
	if msg == "" {
		msg = http.StatusText(status)
	}
	return fmt.Errorf("e2b api: %s (%d)", msg, status)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// InstallScript is the oneshot inject script served at GET /api/e2b/install.sh.
func InstallScript() string {
	return `#!/usr/bin/env bash
set -euo pipefail
# Clawd Bot computer oneshot — skills-first, no Go compiler required.
export CLAWDBOT_NPM_SPEC="${CLAWDBOT_NPM_SPEC:-clawdbot-go@latest}"
export CLAWDBOT_SKILLS_DIR="${CLAWDBOT_SKILLS_DIR:-$HOME/.clawdbot/skills}"
npx --yes "$CLAWDBOT_NPM_SPEC" skills-install --force
npx --yes "$CLAWDBOT_NPM_SPEC" oneshot --skip-go --skip-automaton --skip-birth --force
npx --yes "$CLAWDBOT_NPM_SPEC" skills-dir
echo "Clawd Bot computer oneshot complete."
`
}
