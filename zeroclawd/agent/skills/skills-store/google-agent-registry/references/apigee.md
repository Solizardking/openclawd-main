# Apigee reverse proxies (x402-477302)

## Org layout

| Detail | Value |
|--------|-------|
| Org | `x402-477302` |
| Environment | `test-env` (**BASE**) |
| Env group hostname | `34.54.168.40.nip.io` |
| Instance region | `us-west1` |
| Bundles | `apigee/myproxy`, `apigee/cheshire-zero` |
| Deploy script | `scripts/google-cloud/deploy-apigee-proxy.sh` |

BASE environments accept **STANDARD** proxies only — do not use extensible-only policies.

## Bundles

| Bundle | Path | Behavior |
|--------|------|----------|
| `myproxy` | `apigee/myproxy` | Tutorial reverse proxy → mocktarget |
| `cheshire-zero` | `apigee/cheshire-zero` | `/zero/*` → Cloud Run clawd-zero-service |

## Deploy

```bash
pnpm run deploy:apigee:myproxy
pnpm run deploy:apigee:zero
# or
bash scripts/google-cloud/deploy-apigee-proxy.sh myproxy
bash scripts/google-cloud/deploy-apigee-proxy.sh cheshire-zero
```

## Smoke

```bash
# Tutorial
curl -sS https://34.54.168.40.nip.io/myproxy
# → Hello, Guest!

# Zero-service via Apigee
curl -sS https://34.54.168.40.nip.io/zero/health
# → {"ok":true,...}
```

## Related Google edges

| Surface | Hostname | Auth |
|---------|----------|------|
| Apigee env group | `34.54.168.40.nip.io` | none on tutorial proxies |
| API Gateway | `clawd-gateway-cxnyacdr.uc.gateway.dev` | `?key=` |
| Cloud Run zero | `clawd-zero-service-….run.app` | IAM / public as configured |
| Public product | `cheshireterminal.ai` | product auth |

Prefer product origin for agents; use Apigee for Google-edge demos and zero-service fan-in.

## Docs

- `apigee/README.md` — bundle layout
- `GOOGLE.md` — full GCP map
- `API.md` — API + registry section
