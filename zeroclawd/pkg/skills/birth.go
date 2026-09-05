package skills

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	DefaultClawdSkillsRepo = "https://github.com/Solizardking/skills"
	DefaultGoSkillsRepo    = "https://github.com/samber/cc-skills-golang"
	BirthManifestName      = "birth-skills.json"
)

type BirthSource struct {
	Name        string   `json:"name"`
	URL         string   `json:"url"`
	InstallArgs []string `json:"installArgs"`
	Reason      string   `json:"reason"`
}

type BirthManifest struct {
	GeneratedAt string        `json:"generatedAt"`
	Sources     []BirthSource `json:"sources"`
	Commands    [][]string    `json:"commands"`
}

// DefaultBirthSources returns the birth sources with no InstallArgs, which
// makes `npx skills add <url>` fall into its interactive picker so the
// operator chooses which skills and agents to install instead of everything
// being installed instantly. Use AllBirthSources for the old non-interactive
// bulk-install behavior (needed for unattended/piped installs).
func DefaultBirthSources() []BirthSource {
	return []BirthSource{
		{
			Name:        "solizardking-skills",
			URL:         DefaultClawdSkillsRepo,
			InstallArgs: nil,
			Reason:      "Canonical Clawd/Solana/trading skill pack for every spawned agent.",
		},
		{
			Name:        "golang-skills",
			URL:         DefaultGoSkillsRepo,
			InstallArgs: nil,
			Reason:      "Go engineering, performance, testing, Cobra, concurrency, and security skills for the Go runtime.",
		},
	}
}

// AllBirthSources returns the birth sources with --all set, reproducing the
// previous behavior of installing every skill for every agent with no prompt.
// Intended for unattended installs (no TTY) or callers that explicitly ask
// for it via `clawdbot skills birth --install --all`.
func AllBirthSources() []BirthSource {
	sources := DefaultBirthSources()
	for i := range sources {
		sources[i].InstallArgs = []string{"--all"}
	}
	return sources
}

func BuildBirthManifest(now time.Time, sources []BirthSource) BirthManifest {
	if now.IsZero() {
		now = time.Now()
	}
	if len(sources) == 0 {
		sources = DefaultBirthSources()
	}
	manifest := BirthManifest{
		GeneratedAt: now.UTC().Format(time.RFC3339),
		Sources:     append([]BirthSource(nil), sources...),
	}
	for _, source := range manifest.Sources {
		cmd := []string{"npx", "skills", "add", source.URL}
		cmd = append(cmd, source.InstallArgs...)
		manifest.Commands = append(manifest.Commands, cmd)
	}
	return manifest
}

func WriteBirthManifest(workspace string, manifest BirthManifest) (string, error) {
	if strings.TrimSpace(workspace) == "" {
		return "", fmt.Errorf("workspace is required")
	}
	dir := filepath.Join(workspace, "skills")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, BirthManifestName)
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return "", err
	}
	return path, os.WriteFile(path, data, 0o644)
}

func InstallBirthSources(ctx context.Context, sources []BirthSource, w io.Writer) error {
	manifest := BuildBirthManifest(time.Now(), sources)
	for _, command := range manifest.Commands {
		if len(command) == 0 {
			continue
		}
		if w != nil {
			_, _ = fmt.Fprintf(w, "running: %s\n", strings.Join(command, " "))
		}
		cmd := exec.CommandContext(ctx, command[0], command[1:]...)
		cmd.Stdin = os.Stdin
		if w != nil {
			cmd.Stdout = w
			cmd.Stderr = w
		}
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("%s: %w", strings.Join(command, " "), err)
		}
	}
	return nil
}

func FormatBirthManifest(manifest BirthManifest) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Clawd Bot birth skill seed (%s)\n", manifest.GeneratedAt)
	for _, source := range manifest.Sources {
		fmt.Fprintf(&b, "- %s: %s (%s)\n", source.Name, source.URL, source.Reason)
	}
	b.WriteString("commands:\n")
	for _, command := range manifest.Commands {
		fmt.Fprintf(&b, "- %s\n", strings.Join(command, " "))
	}
	return strings.TrimRight(b.String(), "\n")
}
