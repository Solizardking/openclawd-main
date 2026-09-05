package release

import (
	"archive/tar"
	"compress/gzip"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseExportIgnorePaths(t *testing.T) {
	content := `
# comment
* text=auto
docs/PiedPiper-master/ export-ignore
build/ export-ignore
**/package-lock.json linguist-generated=true export-ignore
not-an-ignore something-else
`
	got := ParseExportIgnorePaths(content)
	want := map[string]bool{
		"docs/PiedPiper-master/": true,
		"build/":                 true,
		"**/package-lock.json":   true,
	}
	if len(got) != len(want) {
		t.Fatalf("ParseExportIgnorePaths = %#v, want %d entries", got, len(want))
	}
	for _, p := range got {
		if !want[p] {
			t.Fatalf("unexpected rule %q in %#v", p, got)
		}
	}
}

func TestValidateGitattributesContent_requiresSlimRules(t *testing.T) {
	if err := ValidateGitattributesContent("build/ export-ignore\n"); err == nil {
		t.Fatal("expected missing rules error")
	}
	// Minimal complete set
	var b strings.Builder
	for _, p := range RequiredExportIgnorePrefixes {
		b.WriteString(p)
		b.WriteString(" export-ignore\n")
	}
	if err := ValidateGitattributesContent(b.String()); err != nil {
		t.Fatalf("complete rules should pass: %v", err)
	}
}

func TestValidateGitattributesFile_worktree(t *testing.T) {
	root, err := RepoRootFromWD()
	if err != nil {
		t.Skip(err.Error())
	}
	path := filepath.Join(root, ".gitattributes")
	if err := ValidateGitattributesFile(path); err != nil {
		t.Fatalf("worktree .gitattributes failed slim contract: %v", err)
	}
}

func TestNormalizeArchivePath(t *testing.T) {
	cases := map[string]string{
		"clawdbot-go-dev/go.mod":         "go.mod",
		"clawdbot-go-v1.2.3/cmd/main.go": "cmd/main.go",
		"go.mod":                         "go.mod",
		"./clawdbot-go-x/README.md":      "README.md",
		"clawdbot-go-dev/":               "",
		"Zero-Bruh-main/go.mod":          "go.mod",
		"Zero-Bruh-v1.0.0/cmd/main.go":   "cmd/main.go",
		"./Zero-Bruh-x/README.md":        "README.md",
		"Zero-Bruh-main/":                "",
		"zero-bruh-dev/pkg/x.go":         "pkg/x.go",
	}
	for in, want := range cases {
		if got := NormalizeArchivePath(in); got != want {
			t.Fatalf("NormalizeArchivePath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidateArchiveEntries_rejectsBulkAndMissing(t *testing.T) {
	// Missing required
	if err := ValidateArchiveEntries([]string{"clawdbot-go/go.mod"}); err == nil {
		t.Fatal("expected missing required paths")
	}
	// Build a full required set then inject bulk
	entries := make([]string, 0, len(RequiredSourcePaths)+1)
	for _, p := range RequiredSourcePaths {
		entries = append(entries, "clawdbot-go-dev/"+p)
	}
	if err := ValidateArchiveEntries(entries); err != nil {
		t.Fatalf("required-only should pass: %v", err)
	}
	entries = append(entries, "clawdbot-go-dev/docs/PiedPiper-master/README.md")
	if err := ValidateArchiveEntries(entries); err == nil {
		t.Fatal("expected forbidden bulk error")
	}
}

func TestPackageSourceScript_endToEnd(t *testing.T) {
	root, err := RepoRootFromWD()
	if err != nil {
		t.Skip(err.Error())
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	if _, err := exec.LookPath("tar"); err != nil {
		t.Skip("tar not available")
	}

	// Must be a git work tree for git archive
	if out, err := exec.Command("git", "-C", root, "rev-parse", "--is-inside-work-tree").CombinedOutput(); err != nil {
		t.Skipf("not a git work tree: %s", out)
	}

	script := filepath.Join(root, "scripts", "package-source.sh")
	outDir := t.TempDir()
	out := filepath.Join(outDir, "slim-source.tar.gz")

	cmd := exec.Command("bash", script, out)
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "CLAWD_PACKAGE_DIR="+outDir)
	output, err := cmd.CombinedOutput()
	t.Logf("package-source.sh output:\n%s", output)
	if err != nil {
		t.Fatalf("scripts/package-source.sh failed: %v", err)
	}

	st, err := os.Stat(out)
	if err != nil {
		t.Fatalf("package missing: %v", err)
	}
	if st.Size() == 0 {
		t.Fatal("package is empty")
	}
	if st.Size() > SoftMaxPackageBytes {
		t.Fatalf("package size %d exceeds soft max %d", st.Size(), SoftMaxPackageBytes)
	}

	entries, err := listTarGz(out)
	if err != nil {
		t.Fatalf("list archive: %v", err)
	}
	if err := ValidateArchiveEntries(entries); err != nil {
		t.Fatalf("archive contract: %v", err)
	}

	// Extra confidence: PiedPiper must not appear even as a directory prefix
	for _, e := range entries {
		if strings.Contains(e, "PiedPiper") {
			t.Fatalf("PiedPiper leaked into slim package: %s", e)
		}
		if strings.HasSuffix(e, "package-lock.json") || strings.HasSuffix(e, "pnpm-lock.yaml") {
			t.Fatalf("lockfile leaked into slim package: %s", e)
		}
	}
}

func TestBuildSlimPackage_oneButton(t *testing.T) {
	root, err := RepoRootFromWD()
	if err != nil {
		t.Skip(err.Error())
	}
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	out := filepath.Join(t.TempDir(), "one-button-source.tar.gz")
	res, err := BuildSlimPackage(root, out)
	if err != nil {
		t.Fatalf("BuildSlimPackage: %v\nlog:\n%s", err, res.Log)
	}
	if res.Bytes <= 0 {
		t.Fatal("expected non-zero package bytes")
	}
	if res.OutputPath != out {
		t.Fatalf("OutputPath = %q, want %q", res.OutputPath, out)
	}
	if res.FileName != "one-button-source.tar.gz" {
		t.Fatalf("FileName = %q", res.FileName)
	}
	entries, err := listTarGz(out)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateArchiveEntries(entries); err != nil {
		t.Fatalf("archive contract: %v", err)
	}
}

func listTarGz(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return nil, err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	var entries []string
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		entries = append(entries, hdr.Name)
		// drain file body
		if _, err := io.Copy(io.Discard, tr); err != nil {
			return nil, err
		}
	}
	return entries, nil
}
