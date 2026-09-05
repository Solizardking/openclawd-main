# Open Source Release Checklist

Use this checklist before pushing a public release.

## Branding matrix (public)

| Surface | Canonical value |
|---------|-----------------|
| Product name | **Clawd Bot** (default DNA `agent-name`, web titles, banners, install receipts) |
| GitHub runtime | https://github.com/Solizardking/Zero-Bruh |
| npm package / CLIs | `clawdbot-go` · bins `clawdbot-go` / `clawd-bot` / `zero-clawd` · Go bin `clawdbot` |
| Go module path | `github.com/8bitlabs/clawdbot` (stable; not the GitHub URL) |
| Product page | https://cheshireterminal.ai/zeroclawd |
| Agent hub / forge | https://cheshireterminal.ai/agents · `/agents/forge` |
| Agents npm / source | `cheshire-terminal-agents` · https://github.com/Solizardking/Cheshire-Terminal-Agents |
| SkillHub | https://github.com/Solizardking/skillhub-main |
| Terminal | https://cheshireterminal.ai |
| Ecosystem hub | https://github.com/solizardking/solana-clawd |

**Technical aliases (not product titles):** binary names `clawdbot` / `clawdbot-go` / `clawd-bot` / `zero-clawd`, npm package `clawdbot-go`, Go import path `github.com/8bitlabs/clawdbot`, and the hosted connect path `/zeroclawd` remain for CLI/module/URL compatibility. User-facing chrome (HTML titles, boot banners, installer product lines, default agent DNA name) must say **Clawd Bot**.

Do **not** hardcode machine paths (`/Users/...`). Prefer `~/…`, `./skills`, or env vars.

## Required Gate

```bash
make release-check
```

This checks Go formatting, `go vet`, race tests, release entrypoint builds, and
tracked generated artifacts.

## Repository Hygiene

- Keep generated binaries and caches out of git: `.cache/`, `build/`, `dist/`,
  root `clawdbot`, `**/target/`, `**/.next/`, and `*.tsbuildinfo`.
- Keep `.env` local. Commit only `.env.example`.
- Keep live wallets, treasury keypairs, install ledgers, funding receipts, and
  private API keys outside the repository.
- No host-local absolute paths in docs, skills, installers, or metadata.
- Prefer `CLAWDBOT_SOURCE_MODE=archive` for one-shot installs so
  `.gitattributes export-ignore` keeps downloads small.
- Slim package rules live in `.gitattributes` (`export-ignore`). Build a local
  tarball with:

```bash
make package
# or: bash scripts/package-source.sh build/clawdbot-go-source.tar.gz
go test ./pkg/release/ -count=1
```

  The package must include Go install payload (`go.mod`, `cmd/`, `pkg/`,
  `install.sh`, …) and must exclude `docs/PiedPiper-master/`, lockfiles,
  `node_modules/`, and other bulk listed under export-ignore.

## Security Defaults

- The web console binds to `127.0.0.1` unless `--public` is passed.
- CORS only allows same-origin requests unless `CLAWDBOT_CORS_ORIGINS` is set.
- Proxy IP headers are ignored unless `CLAWDBOT_TRUST_PROXY_HEADERS=1` is set.
- `/api/config` returns redacted secrets unless `CLAWDBOT_WEB_EXPOSE_SECRETS=1`
  is set for a trusted local session.

## Publish Notes

Before announcing a release, capture the output of:

```bash
go version
make release-check
```

If `govulncheck` is installed, include the result of:

```bash
govulncheck ./...
```

### Official channels (current)

| Channel | Value |
|---------|--------|
| GitHub | https://github.com/Solizardking/Zero-Bruh |
| Latest release | https://github.com/Solizardking/Zero-Bruh/releases/tag/v1.0.3 |
| npm | `clawd-go@1.0.6` · `clawdbot-go@1.0.6` · `@clawd-bot/clawd` · `@x402solana/clawd-bot` |
| Product | https://cheshireterminal.ai/zeroclawd |

```bash
# npm (requires auth; automation token or --otp)
npm publish --access public

# GitHub tag + release notes
git tag -a vX.Y.Z -m "Clawd Bot / clawdbot-go X.Y.Z"
git push origin main vX.Y.Z
gh release create vX.Y.Z --title "Clawd Bot vX.Y.Z (clawdbot-go)" --generate-notes
```
