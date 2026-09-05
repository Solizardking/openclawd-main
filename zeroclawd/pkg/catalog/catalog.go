// Package catalog reads local Clawd agent, skill, and zk surface catalogs.
package catalog

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/8bitlabs/clawdbot/pkg/bundled"
	"github.com/8bitlabs/clawdbot/pkg/zkomni"
)

const (
	EnvSkillsDir       = "CLAWDBOT_SKILLS_DIR"
	EnvAgentsDir       = "CLAWDBOT_AGENTS_DIR"
	EnvZKPrimitivesDir = "CLAWDBOT_ZK_PRIMITIVES_DIR"

	// BundledSkillsRel is the go-bot-relative Robinhood/EVM open skill pack.
	// Anyone can use it from a clean clone without absolute host paths.
	BundledSkillsRel = "skills"
	// PackIndexFile enumerates OBJECTIVE RH/EVM skill ids for discovery + tests.
	PackIndexFile = "pack-index.json"
)

type Roots struct {
	SkillsDir       string `json:"skillsDir"`
	AgentsDir       string `json:"agentsDir"`
	ZKPrimitivesDir string `json:"zkPrimitivesDir"`
	// SkipBundledSkills disables additive merge of the open RH/EVM pack.
	// Production DefaultRoots leaves this false so Solana-only SkillsDir still
	// picks up Robinhood skills when the go-bot pack is on disk.
	SkipBundledSkills bool `json:"skipBundledSkills,omitempty"`
}

type Report struct {
	Roots    Roots        `json:"roots"`
	Skills   []SkillEntry `json:"skills"`
	Agents   []AgentEntry `json:"agents"`
	ZK       *ZKSurface   `json:"zk,omitempty"`
	Warnings []string     `json:"warnings,omitempty"`
}

type SkillEntry struct {
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Category    string   `json:"category,omitempty"`
	Source      string   `json:"source"`
	FilePath    string   `json:"filePath,omitempty"`
	BaseDir     string   `json:"baseDir,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

type AgentEntry struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Description    string   `json:"description,omitempty"`
	Category       string   `json:"category,omitempty"`
	RiskLevel      string   `json:"riskLevel,omitempty"`
	Variant        string   `json:"variant,omitempty"`
	Avatar         string   `json:"avatar,omitempty"`
	Homepage       string   `json:"homepage,omitempty"`
	Author         string   `json:"author,omitempty"`
	CreatedAt      string   `json:"createdAt,omitempty"`
	Source         string   `json:"source"`
	FilePath       string   `json:"filePath"`
	Tags           []string `json:"tags,omitempty"`
	PluginCount    int      `json:"pluginCount,omitempty"`
	KnowledgeCount int      `json:"knowledgeCount,omitempty"`
}

type ZKSurface struct {
	Root             string            `json:"root"`
	ManifestFile     string            `json:"manifestFile,omitempty"`
	ManifestName     string            `json:"manifestName,omitempty"`
	ManifestSlug     string            `json:"manifestSlug,omitempty"`
	Status           string            `json:"status,omitempty"`
	Description      string            `json:"description,omitempty"`
	PackageManager   string            `json:"packageManager,omitempty"`
	WorkspaceFile    string            `json:"workspaceFile,omitempty"`
	LockFile         string            `json:"lockFile,omitempty"`
	SkillFile        string            `json:"skillFile,omitempty"`
	AgentManifest    string            `json:"agentManifest,omitempty"`
	AgentPackageDir  string            `json:"agentPackageDir,omitempty"`
	AgentPackageName string            `json:"agentPackageName,omitempty"`
	AgentBinary      string            `json:"agentBinary,omitempty"`
	AgentAliases     []string          `json:"agentAliases,omitempty"`
	ClientPackageDir string            `json:"clientPackageDir,omitempty"`
	ClientPackage    string            `json:"clientPackage,omitempty"`
	ProgramDir       string            `json:"programDir,omitempty"`
	ProgramName      string            `json:"programName,omitempty"`
	ProgramID        string            `json:"programId,omitempty"`
	ConfigFile       string            `json:"configFile,omitempty"`
	Docs             []string          `json:"docs,omitempty"`
	Operations       []string          `json:"operations"`
	TrustGate        map[string]string `json:"trustGate,omitempty"`
}

func DefaultRoots() Roots {
	home, _ := os.UserHomeDir()
	return Roots{
		SkillsDir:       envOrDefault(EnvSkillsDir, defaultSkillsDir(home)),
		AgentsDir:       envOrDefault(EnvAgentsDir, filepath.Join(home, "agents", "agents", "src")),
		ZKPrimitivesDir: envOrDefault(EnvZKPrimitivesDir, zkomni.DefaultDir()),
	}
}

// defaultSkillsDir prefers the bundled open RH/EVM pack (./skills with pack-index.json)
// so a clean go-bot clone resolves skills without /Users/... hardcoding.
// Falls back to ~/skills/skills for Solana-first host libraries.
func defaultSkillsDir(home string) string {
	if bundled := BundledSkillsDir(); bundled != "" {
		return bundled
	}
	if home == "" {
		return BundledSkillsRel
	}
	return filepath.Join(home, "skills", "skills")
}

// BundledSkillsDir resolves the skill pack without requiring the user's cwd
// to be the repo. Order:
//  1. CLAWDBOT_BUNDLED_SKILLS_DIR (tests / operators)
//  2. embedded pack (train2earn/skills/skills + skillhub-main/skills + RH/EVM)
//     extracted to CLAWDBOT_HOME or the user cache — preferred so a binary
//     next to the slim repo ./skills still catalogs the hub library
//  3. cwd and parents (clone / go run without a compiled embed)
//  4. directory next to the clawdbot executable
func BundledSkillsDir() string {
	if override := strings.TrimSpace(os.Getenv("CLAWDBOT_BUNDLED_SKILLS_DIR")); override != "" {
		if isSkillPackRoot(override) {
			return override
		}
	}
	if dir := extractedEmbeddedPack(); dir != "" {
		return dir
	}
	if dir := walkParentsForPack(); dir != "" {
		return dir
	}
	return executableAdjacentPack()
}

func walkParentsForPack() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		candidate := filepath.Join(cwd, BundledSkillsRel)
		if isSkillPackRoot(candidate) {
			return candidate
		}
		// Also accept skills nested under go-bot/ when cwd is monorepo root.
		candidate = filepath.Join(cwd, "go-bot", BundledSkillsRel)
		if isSkillPackRoot(candidate) {
			return candidate
		}
		parent := filepath.Dir(cwd)
		if parent == cwd {
			break
		}
		cwd = parent
	}
	return ""
}

func executableAdjacentPack() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	dir := filepath.Dir(exe)
	for _, candidate := range []string{
		filepath.Join(dir, BundledSkillsRel),
		filepath.Join(dir, "..", BundledSkillsRel),
	} {
		if isSkillPackRoot(candidate) {
			return candidate
		}
	}
	return ""
}

func extractedEmbeddedPack() string {
	dest, err := bundled.DefaultExtractDir()
	if err != nil {
		return ""
	}
	out, err := bundled.ExtractTo(dest)
	if err != nil {
		return ""
	}
	if isSkillPackRoot(out) {
		return out
	}
	return ""
}

func isSkillPackRoot(dir string) bool {
	if !fileExists(filepath.Join(dir, PackIndexFile)) {
		return false
	}
	// Require at least one loadable skill so empty stubs do not win discovery.
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.IsDir() && fileExists(filepath.Join(dir, entry.Name(), "SKILL.md")) {
			return true
		}
	}
	return false
}

// PackIndexSkillSlugs reads pack-index.json skills[] from a pack root.
func PackIndexSkillSlugs(root string) ([]string, error) {
	data, err := os.ReadFile(filepath.Join(root, PackIndexFile))
	if err != nil {
		return nil, err
	}
	var idx struct {
		Skills []string `json:"skills"`
	}
	if err := json.Unmarshal(data, &idx); err != nil {
		return nil, err
	}
	return idx.Skills, nil
}

func BuildReport(roots Roots) Report {
	report := Report{Roots: roots}

	seen := map[string]struct{}{}
	appendSkills := func(skills []SkillEntry) {
		for _, skill := range skills {
			key := strings.ToLower(firstNonEmpty(skill.Slug, skill.Name))
			if key == "" {
				continue
			}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			report.Skills = append(report.Skills, skill)
		}
	}

	skills, err := LoadSkills(roots.SkillsDir)
	if err != nil {
		report.Warnings = append(report.Warnings, fmt.Sprintf("skills: %v", err))
	} else {
		appendSkills(skills)
	}

	// Additive: merge the open RH/EVM pack when present and distinct from SkillsDir
	// (unless tests/callers set SkipBundledSkills or CLAWDBOT_MERGE_BUNDLED_SKILLS=0).
	if !roots.SkipBundledSkills && mergeBundledSkillsEnabled() {
		if bundled := BundledSkillsDir(); bundled != "" && filepath.Clean(bundled) != filepath.Clean(roots.SkillsDir) {
			extra, err := LoadSkills(bundled)
			if err != nil {
				report.Warnings = append(report.Warnings, fmt.Sprintf("bundled RH skills: %v", err))
			} else {
				appendSkills(extra)
			}
		}
	}

	if roots.ZKPrimitivesDir != "" {
		zkSkill := filepath.Join(roots.ZKPrimitivesDir, "agent", "SKILL.md")
		if entry, err := ReadSkillFile(zkSkill, "zk-primitives"); err == nil {
			entry.Category = firstNonEmpty(entry.Category, "Infrastructure")
			appendSkills([]SkillEntry{entry})
		}
	}

	agents, err := LoadAgents(roots.AgentsDir)
	if err != nil {
		report.Warnings = append(report.Warnings, fmt.Sprintf("agents: %v", err))
	} else {
		report.Agents = agents
	}

	zk, err := LoadZKSurface(roots.ZKPrimitivesDir)
	if err != nil {
		report.Warnings = append(report.Warnings, fmt.Sprintf("zk-primitives: %v", err))
	} else {
		report.ZK = &zk
	}

	sortSkills(report.Skills)
	sortAgents(report.Agents)
	return report
}

func LoadSkills(root string) ([]SkillEntry, error) {
	if root == "" {
		return nil, errors.New("empty skills root")
	}
	if _, err := os.Stat(root); err != nil {
		return nil, err
	}

	seen := map[string]struct{}{}
	var skills []SkillEntry
	appendUnique := func(extra []SkillEntry) {
		for _, skill := range extra {
			key := strings.ToLower(firstNonEmpty(skill.Slug, skill.Name))
			if key == "" {
				continue
			}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			skills = append(skills, skill)
		}
	}

	catalogPath := filepath.Join(root, "catalog.json")
	if _, err := os.Stat(catalogPath); err == nil {
		catalogSkills, err := loadSkillsCatalog(root, catalogPath)
		if err != nil {
			return nil, err
		}
		appendUnique(catalogSkills)
	}

	discovered, err := discoverSkillFiles(root)
	if err != nil {
		if len(skills) == 0 {
			return nil, err
		}
	} else {
		appendUnique(discovered)
	}
	if len(skills) == 0 {
		return nil, fmt.Errorf("no SKILL.md files under %s", root)
	}
	sortSkills(skills)
	return skills, nil
}

func ReadSkillFile(filePath, source string) (SkillEntry, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return SkillEntry{}, err
	}
	fm := parseFrontMatter(string(data))
	baseDir := filepath.Dir(filePath)
	slug := filepath.Base(baseDir)
	name := firstNonEmpty(fm["name"], slug)
	return SkillEntry{
		Slug:        slug,
		Name:        name,
		Description: fm["description"],
		Category:    fm["category"],
		Source:      source,
		FilePath:    filePath,
		BaseDir:     baseDir,
		Tags:        splitCSV(fm["tags"]),
	}, nil
}

func LoadAgents(root string) ([]AgentEntry, error) {
	if root == "" {
		return nil, errors.New("empty agents root")
	}
	if _, err := os.Stat(root); err != nil {
		return nil, err
	}
	paths, err := filepath.Glob(filepath.Join(root, "*.json"))
	if err != nil {
		return nil, err
	}
	agents := make([]AgentEntry, 0, len(paths))
	for _, path := range paths {
		agent, ok, err := readAgentFile(path)
		if err != nil {
			return nil, err
		}
		if ok {
			agents = append(agents, agent)
		}
	}
	sortAgents(agents)
	return agents, nil
}

func LoadZKSurface(root string) (ZKSurface, error) {
	if root == "" {
		return ZKSurface{}, errors.New("empty zk-primitives root")
	}
	if _, err := os.Stat(root); err != nil {
		return ZKSurface{}, err
	}

	surface := ZKSurface{
		Root:       root,
		Operations: []string{"publish_attestation", "consume_attestation", "commit_encrypted_state", "verify_proof", "compute_nullifier"},
	}

	manifestFile := filepath.Join(root, "MANIFEST.json")
	if fileExists(manifestFile) {
		surface.ManifestFile = manifestFile
		manifest, err := readZKManifest(manifestFile)
		if err != nil {
			return ZKSurface{}, err
		}
		surface.ManifestName = manifest.Name
		surface.ManifestSlug = manifest.Slug
		surface.Status = manifest.Status
		surface.Description = manifest.Description
		surface.PackageManager = manifest.PackageManager
		surface.ProgramID = manifest.Packages.Program.ProgramID
		surface.AgentAliases = manifest.Packages.Agent.BinaryAliases
		if len(manifest.Operations) > 0 {
			surface.Operations = manifest.Operations
		}
		surface.TrustGate = manifest.TrustGate
	}
	workspaceFile := filepath.Join(root, "pnpm-workspace.yaml")
	if fileExists(workspaceFile) {
		surface.WorkspaceFile = workspaceFile
	}
	lockFile := filepath.Join(root, "pnpm-lock.yaml")
	if fileExists(lockFile) {
		surface.LockFile = lockFile
	}

	skillFile := filepath.Join(root, "agent", "SKILL.md")
	if fileExists(skillFile) {
		surface.SkillFile = skillFile
	}
	agentManifest := filepath.Join(root, "agent", "agent.json")
	if fileExists(agentManifest) {
		surface.AgentManifest = agentManifest
	}

	agentDir := filepath.Join(root, "agent")
	if fileExists(filepath.Join(agentDir, "package.json")) {
		surface.AgentPackageDir = agentDir
		pkg, err := readPackageJSON(filepath.Join(agentDir, "package.json"))
		if err != nil {
			return ZKSurface{}, err
		}
		surface.AgentPackageName = pkg.Name
		surface.AgentBinary = firstPackageBin(pkg.Bin)
	}

	clientDir := filepath.Join(root, "client")
	if fileExists(filepath.Join(clientDir, "package.json")) {
		surface.ClientPackageDir = clientDir
		pkg, err := readPackageJSON(filepath.Join(clientDir, "package.json"))
		if err != nil {
			return ZKSurface{}, err
		}
		surface.ClientPackage = pkg.Name
	}

	programDir := filepath.Join(root, "programs", "clawd-zk")
	if fileExists(filepath.Join(programDir, "Cargo.toml")) {
		surface.ProgramDir = programDir
		surface.ProgramName = readCargoName(filepath.Join(programDir, "Cargo.toml"))
	}

	configFile := filepath.Join(root, "configs", "light-trees.yaml")
	if fileExists(configFile) {
		surface.ConfigFile = configFile
	}
	for _, doc := range []string{
		"README.md",
		"zk.md",
		filepath.Join("agent", "README.md"),
		filepath.Join("client", "README.md"),
		filepath.Join("configs", "README.md"),
		filepath.Join("programs", "README.md"),
		filepath.Join("tests", "README.md"),
		filepath.Join("docs", "ARCHITECTURE.md"),
		filepath.Join("docs", "INTEGRATION.md"),
		filepath.Join("docs", "EDGE_DISTRIBUTION.md"),
		filepath.Join("docs", "PIEDPIPER_ADAPTATION.md"),
	} {
		path := filepath.Join(root, doc)
		if fileExists(path) {
			surface.Docs = append(surface.Docs, path)
		}
	}
	return surface, nil
}

func FilterSkills(skills []SkillEntry, query string) []SkillEntry {
	query = strings.TrimSpace(strings.ToLower(query))
	if query == "" {
		return append([]SkillEntry{}, skills...)
	}
	var filtered []SkillEntry
	for _, skill := range skills {
		haystack := strings.ToLower(strings.Join([]string{
			skill.Slug,
			skill.Name,
			skill.Description,
			skill.Category,
			skill.Source,
			strings.Join(skill.Tags, " "),
		}, " "))
		if strings.Contains(haystack, query) {
			filtered = append(filtered, skill)
		}
	}
	return filtered
}

func FilterAgents(agents []AgentEntry, query string) []AgentEntry {
	query = strings.TrimSpace(strings.ToLower(query))
	if query == "" {
		return append([]AgentEntry{}, agents...)
	}
	var filtered []AgentEntry
	for _, agent := range agents {
		haystack := strings.ToLower(strings.Join([]string{
			agent.ID,
			agent.Name,
			agent.Description,
			agent.Category,
			agent.RiskLevel,
			agent.Variant,
			strings.Join(agent.Tags, " "),
		}, " "))
		if strings.Contains(haystack, query) {
			filtered = append(filtered, agent)
		}
	}
	return filtered
}

func loadSkillsCatalog(root, catalogPath string) ([]SkillEntry, error) {
	data, err := os.ReadFile(catalogPath)
	if err != nil {
		return nil, err
	}
	var raw []struct {
		Slug        string   `json:"slug"`
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Category    string   `json:"category"`
		Tags        []string `json:"tags"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	skills := make([]SkillEntry, 0, len(raw))
	for _, entry := range raw {
		slug := firstNonEmpty(entry.Slug, entry.Name)
		baseDir := filepath.Join(root, slug)
		filePath := filepath.Join(baseDir, "SKILL.md")
		if !fileExists(filePath) {
			filePath = ""
		}
		skills = append(skills, SkillEntry{
			Slug:        slug,
			Name:        firstNonEmpty(entry.Name, slug),
			Description: entry.Description,
			Category:    entry.Category,
			Source:      root,
			FilePath:    filePath,
			BaseDir:     baseDir,
			Tags:        entry.Tags,
		})
	}
	sortSkills(skills)
	return skills, nil
}

func discoverSkillFiles(root string) ([]SkillEntry, error) {
	var skills []SkillEntry
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			name := d.Name()
			if name == "node_modules" || name == ".git" || name == ".cache" {
				return fs.SkipDir
			}
			return nil
		}
		if d.Name() != "SKILL.md" {
			return nil
		}
		skill, err := ReadSkillFile(path, root)
		if err != nil {
			return err
		}
		rel, relErr := filepath.Rel(root, filepath.Dir(path))
		if relErr == nil && rel != "." {
			skill.Slug = filepath.ToSlash(rel)
		}
		skills = append(skills, skill)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sortSkills(skills)
	return skills, nil
}

type rawAgent struct {
	Author         string         `json:"author"`
	CreatedAt      string         `json:"createdAt"`
	Homepage       string         `json:"homepage"`
	Identifier     string         `json:"identifier"`
	KnowledgeCount int            `json:"knowledgeCount"`
	Meta           map[string]any `json:"meta"`
	PluginCount    int            `json:"pluginCount"`
}

func readAgentFile(path string) (AgentEntry, bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return AgentEntry{}, false, err
	}
	var raw rawAgent
	if err := json.Unmarshal(data, &raw); err != nil {
		return AgentEntry{}, false, fmt.Errorf("parse %s: %w", path, err)
	}
	id := strings.TrimSpace(raw.Identifier)
	if id == "" {
		return AgentEntry{}, false, nil
	}
	title := metaString(raw.Meta, "title")
	description := metaString(raw.Meta, "description")
	category := metaString(raw.Meta, "category")
	tags := metaStringSlice(raw.Meta, "tags")
	return AgentEntry{
		ID:             id,
		Name:           firstNonEmpty(title, id),
		Description:    description,
		Category:       firstNonEmpty(category, inferAgentCategory(id, tags)),
		RiskLevel:      metaString(raw.Meta, "riskLevel"),
		Variant:        metaString(raw.Meta, "variant"),
		Avatar:         metaString(raw.Meta, "avatar"),
		Homepage:       raw.Homepage,
		Author:         raw.Author,
		CreatedAt:      raw.CreatedAt,
		Source:         filepath.Dir(path),
		FilePath:       path,
		Tags:           tags,
		PluginCount:    raw.PluginCount,
		KnowledgeCount: raw.KnowledgeCount,
	}, true, nil
}

type packageJSON struct {
	Name string         `json:"name"`
	Bin  map[string]any `json:"bin"`
}

type zkManifest struct {
	Name           string            `json:"name"`
	Slug           string            `json:"slug"`
	Status         string            `json:"status"`
	Description    string            `json:"description"`
	PackageManager string            `json:"packageManager"`
	Operations     []string          `json:"operations"`
	TrustGate      map[string]string `json:"trustGate"`
	Packages       struct {
		Agent struct {
			BinaryAliases []string `json:"binaryAliases"`
		} `json:"agent"`
		Program struct {
			ProgramID string `json:"programId"`
		} `json:"program"`
	} `json:"packages"`
}

func readPackageJSON(path string) (packageJSON, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return packageJSON{}, err
	}
	var pkg packageJSON
	if err := json.Unmarshal(data, &pkg); err != nil {
		return packageJSON{}, fmt.Errorf("parse %s: %w", path, err)
	}
	return pkg, nil
}

func readZKManifest(path string) (zkManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return zkManifest{}, err
	}
	var manifest zkManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return zkManifest{}, fmt.Errorf("parse %s: %w", path, err)
	}
	return manifest, nil
}

func readCargoName(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "name") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				return stripQuotes(strings.TrimSpace(parts[1]))
			}
		}
	}
	return ""
}

func parseFrontMatter(content string) map[string]string {
	result := map[string]string{}
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return result
	}

	var key string
	var block []string
	flush := func() {
		if key != "" {
			result[key] = strings.TrimSpace(strings.Join(block, " "))
		}
		key = ""
		block = nil
	}

	for _, line := range lines[1:] {
		trimmed := strings.TrimSpace(line)
		if trimmed == "---" {
			flush()
			break
		}
		if key != "" && (strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t")) {
			if trimmed != "" && !strings.HasPrefix(trimmed, "- ") {
				block = append(block, trimmed)
			}
			continue
		}
		flush()
		k, v, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if k == "" {
			continue
		}
		if v == ">" || v == "|" {
			key = k
			block = nil
			continue
		}
		result[k] = stripQuotes(v)
	}
	return result
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func mergeBundledSkillsEnabled() bool {
	v := strings.TrimSpace(os.Getenv("CLAWDBOT_MERGE_BUNDLED_SKILLS"))
	if v == "" {
		return true
	}
	switch strings.ToLower(v) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func stripQuotes(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 {
		if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
			return value[1 : len(value)-1]
		}
	}
	return value
}

func splitCSV(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	value = strings.Trim(value, "[]")
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = stripQuotes(strings.TrimSpace(part))
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func metaString(meta map[string]any, key string) string {
	if meta == nil {
		return ""
	}
	value, ok := meta[key]
	if !ok {
		return ""
	}
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}

func metaStringSlice(meta map[string]any, key string) []string {
	if meta == nil {
		return nil
	}
	value, ok := meta[key]
	if !ok {
		return nil
	}
	raw, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, strings.TrimSpace(s))
		}
	}
	return out
}

func firstPackageBin(bin map[string]any) string {
	keys := make([]string, 0, len(bin))
	for key := range bin {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	if len(keys) == 0 {
		return ""
	}
	return keys[0]
}

func inferAgentCategory(id string, tags []string) string {
	haystack := strings.ToLower(id + " " + strings.Join(tags, " "))
	switch {
	case strings.Contains(haystack, "payment"), strings.Contains(haystack, "x402"):
		return "payments"
	case strings.Contains(haystack, "trader"), strings.Contains(haystack, "perps"), strings.Contains(haystack, "market-maker"):
		return "trading"
	case strings.Contains(haystack, "risk"):
		return "risk"
	case strings.Contains(haystack, "zk"), strings.Contains(haystack, "rpc"), strings.Contains(haystack, "infra"):
		return "infrastructure"
	case strings.Contains(haystack, "research"), strings.Contains(haystack, "analyst"):
		return "research"
	default:
		return "catalog"
	}
}

func sortSkills(skills []SkillEntry) {
	priority := packIndexPriority()
	sort.SliceStable(skills, func(i, j int) bool {
		pi, iPack := priority[strings.ToLower(skills[i].Slug)]
		pj, jPack := priority[strings.ToLower(skills[j].Slug)]
		if iPack != jPack {
			return iPack
		}
		if iPack && pi != pj {
			return pi < pj
		}
		if skills[i].Category == skills[j].Category {
			return skills[i].Slug < skills[j].Slug
		}
		return skills[i].Category < skills[j].Category
	})
}

// packIndexPriority ranks bundled pack-index.json skills ahead of the hub
// library so `catalog skills` shows the open RH/EVM pack first (and so a
// truncated listing still includes rh-bonded-launch and siblings).
func packIndexPriority() map[string]int {
	idx, err := bundled.ReadPackIndex()
	if err != nil || len(idx.Skills) == 0 {
		return nil
	}
	out := make(map[string]int, len(idx.Skills))
	for i, slug := range idx.Skills {
		key := strings.ToLower(strings.TrimSpace(slug))
		if key == "" {
			continue
		}
		if _, exists := out[key]; !exists {
			out[key] = i
		}
	}
	return out
}

func sortAgents(agents []AgentEntry) {
	sort.SliceStable(agents, func(i, j int) bool {
		if agents[i].Category == agents[j].Category {
			return agents[i].ID < agents[j].ID
		}
		return agents[i].Category < agents[j].Category
	})
}
