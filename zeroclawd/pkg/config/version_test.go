package config

import (
	"strings"
	"testing"
)

func TestGetVersion_defaultDev(t *testing.T) {
	// GetVersion must expose the package-level Version var (ldflags can override at build).
	got := GetVersion()
	if got == "" {
		t.Fatal("GetVersion() returned empty string")
	}
	if got != Version {
		t.Fatalf("GetVersion() = %q, want Version var %q", got, Version)
	}
}

func TestFormatVersion_includesGitCommitWhenSet(t *testing.T) {
	// Drive the real FormatVersion path with temporary package vars.
	origV, origC := Version, GitCommit
	t.Cleanup(func() {
		Version, GitCommit = origV, origC
	})

	Version = "test-1.2.3"
	GitCommit = ""
	if got := FormatVersion(); got != "test-1.2.3" {
		t.Fatalf("FormatVersion without commit = %q, want %q", got, "test-1.2.3")
	}

	GitCommit = "abc1234"
	got := FormatVersion()
	if !strings.Contains(got, "test-1.2.3") {
		t.Fatalf("FormatVersion missing version: %q", got)
	}
	if !strings.Contains(got, "abc1234") {
		t.Fatalf("FormatVersion missing git commit: %q", got)
	}
	if !strings.Contains(got, "git:") {
		t.Fatalf("FormatVersion missing git: marker: %q", got)
	}
}

func TestFormatBuildInfo_fallsBackToRuntimeGoVersion(t *testing.T) {
	origB, origG := BuildTime, GoVersion
	t.Cleanup(func() {
		BuildTime, GoVersion = origB, origG
	})

	BuildTime = "2026-07-15T00:00:00Z"
	GoVersion = ""
	build, goVer := FormatBuildInfo()
	if build != "2026-07-15T00:00:00Z" {
		t.Fatalf("build = %q", build)
	}
	if goVer == "" {
		t.Fatal("expected non-empty runtime go version fallback")
	}
	if !strings.HasPrefix(goVer, "go") {
		t.Fatalf("go version should look like runtime.Version, got %q", goVer)
	}
}
