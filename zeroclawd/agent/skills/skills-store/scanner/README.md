# Skill Scanner

Local scanner and browser hub for the Cheshire Skills Store catalog.

The scanner is dependency-free Node.js. It reads `skills-store/catalog.json`,
runs a static rule pass over each packaged skill, optionally consumes generated
verification and Merkle registry files when present, and writes a static data
file consumed by the hub UI.

## Commands

```bash
pnpm run scan:skills-store
pnpm run check:skills-store-scan
```

## Upload pipeline integration

Upload integrations can use the same vetter rules via
`skills-store/scanner/lib/scan-upload.mjs`.

```bash
node skills-store/scanner/bin/scan-skills.mjs --help
node skills-store/scanner/bin/scan-skills.mjs --all-local
node skills-store/scanner/bin/scan-skills.mjs --check
```

## Outputs

- `results/scan-results.json` - full machine-readable scan output.
- `results/summary.md` - compact human-readable summary.
- `public/scan-data.js` - browser data loaded by `public/index.html`.
- `public/index.html` - static hub for filtering by surface, verification state, risk, category, and install telemetry.

## Verification Model

For each canonical skill, the scanner checks:

1. The generated per-skill verification file exists.
2. Every listed bundle file exists locally and its SHA-256 hash matches.
3. The deterministic bundle hash matches.
4. The skill Merkle leaf matches `sha256(slug + "\0" + bundleHash)`.
5. The leaf is present in `public/api/verification.json`.
6. The registry Merkle root recomputes correctly.
7. The on-chain anchor state is reported from local registry artifacts.

The hub reports the current anchor state from `onchain/publish-plan.json` and, when present, `onchain/publish-receipt.json`.

## Install Telemetry

The repository does not include install-count telemetry. The hub therefore shows install counts as unknown unless you provide:

```text
skills-store/scanner/data/install-metrics.json
```

Use `scanner/data/install-metrics.example.json` as the schema. The scanner never fabricates install counts.

## Cisco Scanner Context

The original Dockerfile still documents how to build Cisco `cisco-ai-skill-scanner` with the local LLM base URL backport. The local scanner added here is separate: it is intended for this repository's static skill catalog and frontend hub.
