# TEE Verifier Deployment Report

> **Clawd RedPill TEE Gateway** — Solana-powered Trusted Execution Environment attestation anchoring on Solana devnet.
>
> Deploy timestamp: July 3, 2026
> Deployer: `Ds6Q...` (funded from local devnet authority)
> Gateway: `https://clawd-tee-gateway.fly.dev`
> Custom domains (DNS pending): `tee.onchainai.fund` · `tee.darkx402.com`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Deployment Summary](#deployment-summary)
3. [Program Deployment](#program-deployment)
4. [Fly.io Gateway](#flyio-gateway)
5. [Hosted Proof Anchoring (End-to-End)](#hosted-proof-anchoring-end-to-end)
6. [Pending: Cloudflare DNS Records](#pending-cloudflare-dns-records)
7. [Required DNS Records](#required-dns-records)
8. [Smoke Test Commands](#smoke-test-commands)
9. [Appendix: Account Reference](#appendix-account-reference)

---

## Architecture Overview

The Clawd TEE Verifier is a Solana RedPill attestation anchoring system composed of three layers:

```
┌─────────────────────────────────────────────┐
│          Custom Domains (DNS pending)        │
│  tee.onchainai.fund                          │
│  tee.darkx402.com                            │
├─────────────────────────────────────────────┤
│          Fly.io Gateway                      │
│  https://clawd-tee-gateway.fly.dev           │
│  - Health endpoint (/health)                 │
│  - Proof lookup (/v1/proof/:hash)            │
│  - Proof anchoring (POST /v1/proof)          │
├─────────────────────────────────────────────┤
│          Solana Devnet                       │
│  Program: HvXe5RpCcduVYJWDyavmNKde4uEgUFEiYz99JYQT4DkP │
│  PDA layout: TeeProofV2                      │
│  BPFLoaderUpgradeab1e upgradeable            │
└─────────────────────────────────────────────┘
```

**Trust chain:**
1. A client submits a TEE quote (RedPill TDX or NVIDIA NRAS) to the gateway
2. The gateway verifies the attestation and constructs a `StoreProofV2` transaction
3. The transaction is signed by the deploy payer and submitted to Solana devnet
4. The on-chain program stores the proof hash in a `TeeProofV2` PDA
5. Anyone can verify the proof by looking up the PDA via the gateway or directly on-chain

---

## Deployment Summary

| Component | Status | Details |
|-----------|--------|---------|
| Deploy payer funded | ✅ Complete | `Ds6Q...` — 3 devnet SOL from local funded devnet authority |
| Verifier program deployed | ✅ Complete | `HvXe5RpCcduVYJWDyavmNKde4uEgUFEiYz99JYQT4DkP` |
| Program executable | ✅ Complete | Owned by `BPFLoaderUpgradeab1e11111111111111111111111` |
| Fly gateway running | ✅ Complete | `https://clawd-tee-gateway.fly.dev/health` → 200 OK |
| Hosted proof anchoring | ✅ Complete | End-to-end smoke test passed |
| Fly certs created | ✅ Complete | Certificate authorities provisioned for both domains |
| **Cloudflare DNS records** | ❌ **Pending** | Tokens are zone-read only, cannot write DNS records |

---

## Program Deployment

### Deploy Transaction

The Solana verifier program was deployed to devnet with the following parameters:

- **Program ID:** `HvXe5RpCcduVYJWDyavmNKde4uEgUFEiYz99JYQT4DkP`
- **Deploy Transaction:** `2U5RYtoLdghLxempxkdeNNZZx66BuJvDLf9uuUafeHdJFD94h6CvegGLv296ge3a7wvycQzDCNtF9JMD5mitL8QK`
- **Loader:** BPFLoaderUpgradeab1e (upgradeable)
- **PDA Account Layout:** `TeeProofV2`
  - Each PDA stores a proof hash anchored to a TEE attestation
  - Derivable from the SHA-256 hash of the attestation payload

### Verification

```bash
# Confirm program is executable and owned by the upgradeable loader
solana program show HvXe5RpCcduVYJWDyavmNKde4uEgUFEiYz99JYQT4DkP --url devnet

# Or query via RPC
curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"getAccountInfo",
    "params":["HvXe5RpCcduVYJWDyavmNKde4uEgUFEiYz99JYQT4DkP",{"encoding":"base64"}]
  }' | jq '.result'
```

---

## Fly.io Gateway

### Machine Status

The gateway runs as a Fly machine with the following properties:

- **Platform:** Fly.io
- **App Name:** `clawd-tee-gateway`
- **Machine ID:** `784137db06d058`
- **State:** `started`
- **Health:** `passing`
- **Endpoint:** `https://clawd-tee-gateway.fly.dev`

### Health Check

```bash
curl https://clawd-tee-gateway.fly.dev/health
# → {"status":"ok","timestamp":"...","program":"HvXe5RpCcduVYJWDyavmNKde4uEgUFEiYz99JYQT4DkP"}
```

### API Surface

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check, returns program ID and timestamp |
| `/v1/proof/:hash` | GET | Lookup a proof PDA by its content hash |
| `/v1/proof` | POST | Submit a TEE quote for attestation anchoring |

### TLS Certificates

Fly certs have been provisioned for both custom domains:

| Domain | Cert Status | DNS Status |
|--------|------------|------------|
| `tee.onchainai.fund` | Created, **Not verified** | ❌ No DNS records |
| `tee.darkx402.com` | Created, **Not verified** | ❌ No DNS records |

Certificates cannot validate until Cloudflare DNS records point at the Fly.io IPv4/IPv6 addresses.

---

## Hosted Proof Anchoring (End-to-End)

A complete end-to-end smoke test was executed successfully, proving the entire attestation anchoring pipeline works:

### Test Results

| Check | Result |
|-------|--------|
| Chat smoke | ✅ `ok` |
| Proof PDA | `39ptznqkGnDNqa8iywgyQXBRntdsBuz5BJYZ8i8NtPFi` |
| Anchor transaction | `2fwfpmCfdeRFJXFkb42KsgRkT49PHGyQuo3q8dNxLHkCgRcLZJ5AbQWbEbotEws1q93gpCaEwMPAHeBRitL5Dsjv` |
| Gateway lookup | ✅ Returns `ok: true` |

### PDA Derivation

The proof PDA `39ptznqkGnDNqa8iywgyQXBRntdsBuz5BJYZ8i8NtPFi` was derived from the content hash:

```
content_hash = 684622101f9009163e3bc30ebe3252aef54039a8ff47475007ad4ef909077adc
PDA          = 39ptznqkGnDNqa8iywgyQXBRntdsBuz5BJYZ8i8NtPFi
```

### Gateway Lookup Verification

```bash
curl https://clawd-tee-gateway.fly.dev/v1/proof/684622101f9009163e3bc30ebe3252aef54039a8ff47475007ad4ef909077adc

# Response:
# {"ok":true,"pda":"39ptznqkGnDNqa8iywgyQXBRntdsBuz5BJYZ8i8NtPFi","transaction":"2fwfpmCfdeRFJXFkb42KsgRkT49PHGyQuo3q8dNxLHkCgRcLZJ5AbQWbEbotEws1q93gpCaEwMPAHeBRitL5Dsjv"}
```

### On-Chain Verification

```bash
# Verify the anchor transaction on Solana devnet explorer
# https://explorer.solana.com/tx/2fwfpmCfdeRFJXFkb42KsgRkT49PHGyQuo3q8dNxLHkCgRcLZJ5AbQWbEbotEws1q93gpCaEwMPAHeBRitL5Dsjv?cluster=devnet

# Or via CLI
solana confirm -v 2fwfpmCfdeRFJXFkb42KsgRkT49PHGyQuo3q8dNxLHkCgRcLZJ5AbQWbEbotEws1q93gpCaEwMPAHeBRitL5Dsjv --url devnet
```

---

## Pending: Cloudflare DNS Records

**Status: ❌ Blocking**

The Fly TLS certificates for both custom domains will not validate until the DNS records are created. Currently:

```bash
# Both domains return empty — no records exist
dig +short tee.onchainai.fund
# (empty)

dig +short tee.darkx402.com
# (empty)
```

The Cloudflare API token available in this environment has **zone read** permissions but **not DNS record write** permissions, so the records cannot be created from this session.

### How to Add the Records

These records must be added in the **Cloudflare dashboard** for each domain:

#### For `tee.onchainai.fund`

Navigate to **Cloudflare Dashboard → onchainai.fund → DNS → Add Record**:

| Type | Name | Content | TTL | Proxy Status |
|------|------|---------|-----|-------------|
| A | `tee` | `66.241.125.120` | Auto | DNS only (unproxied) |
| AAAA | `tee` | `2a09:8280:1::13d:5d07:0` | Auto | DNS only (unproxied) |

#### For `tee.darkx402.com`

Navigate to **Cloudflare Dashboard → darkx402.com → DNS → Add Record**:

| Type | Name | Content | TTL | Proxy Status |
|------|------|---------|-----|-------------|
| A | `tee` | `66.241.125.120` | Auto | DNS only (unproxied) |
| AAAA | `tee` | `2a09:8280:1::13d:5d07:0` | Auto | DNS only (unproxied) |

**Note:** Use **DNS only** (gray cloud), not proxied (orange cloud), since Fly.io handles its own TLS termination and the A/AAAA records should point directly at the Fly edge.

### Alternative: Fly CLI cert check

Once DNS propagates, verify certs from the Fly CLI:

```bash
fly certs show tee.onchainai.fund
fly certs show tee.darkx402.com
```

Expected output when DNS is wired correctly:

```
Hostname                  = tee.onchainai.fund
Configured                = true
Issued                    = (let's encrypt)
Certificate Authority     = lets_encrypt
DNS Provider              = cloudflare
DNS Status                = (verified)
```

---

## Required DNS Records

Summary of all four DNS records required:

| Domain | Type | Name | Value |
|--------|------|------|-------|
| `onchainai.fund` | A | `tee` | `66.241.125.120` |
| `onchainai.fund` | AAAA | `tee` | `2a09:8280:1::13d:5d07:0` |
| `darkx402.com` | A | `tee` | `66.241.125.120` |
| `darkx402.com` | AAAA | `tee` | `2a09:8280:1::13d:5d07:0` |

---

## Smoke Test Commands

Once DNS is wired and certificates are issued, validate the full stack:

```bash
# 1. Health check (direct Fly endpoint — should work already)
curl https://clawd-tee-gateway.fly.dev/health

# 2. Custom domain health check (after DNS + certs)
curl https://tee.onchainai.fund/health
curl https://tee.darkx402.com/health

# 3. TLS certificate validation
curl -vI https://tee.onchainai.fund/health 2>&1 | grep -i "SSL certificate\|TLS\|subject"
curl -vI https://tee.darkx402.com/health 2>&1 | grep -i "SSL certificate\|TLS\|subject"

# 4. Proof lookup via custom domains
curl https://tee.onchainai.fund/v1/proof/684622101f9009163e3bc30ebe3252aef54039a8ff47475007ad4ef909077adc
curl https://tee.darkx402.com/v1/proof/684622101f9009163e3bc30ebe3252aef54039a8ff47475007ad4ef909077adc

# 5. Submit new proof
curl -X POST https://tee.onchainai.fund/v1/proof \
  -H "Content-Type: application/json" \
  -d '{"quote":"base64-encoded-tee-quote-here"}'
```

---

## Appendix: Account Reference

### Wallet Accounts

| Account | Role | Network | Balance |
|---------|------|---------|---------|
| `Ds6Q...` | Deploy payer | Solana devnet | 3 SOL (funded from local devnet authority) |

### On-Chain Programs

| Program ID | Purpose | Owner |
|------------|---------|-------|
| `HvXe5RpCcduVYJWDyavmNKde4uEgUFEiYz99JYQT4DkP` | RedPill TEE Verifier | `BPFLoaderUpgradeab1e` |

### Proof PDAs

| PDA | Content Hash | Anchor Tx |
|-----|-------------|-----------|
| `39ptznqkGnDNqa8iywgyQXBRntdsBuz5BJYZ8i8NtPFi` | `684622101f9009163e3bc30ebe3252aef54039a8ff47475007ad4ef909077adc` | `2fwfpmCfdeRFJXFkb42KsgRkT49PHGyQuo3q8dNxLHkCgRcLZJ5AbQWbEbotEws1q93gpCaEwMPAHeBRitL5Dsjv` |

### Infrastructure

| Resource | URL | Status |
|----------|-----|--------|
| Fly.io app | `https://clawd-tee-gateway.fly.dev` | ✅ Running |
| Fly machine | `784137db06d058` | ✅ Started, health passing |
| Custom domain | `tee.onchainai.fund` | 🔒 Cert created, DNS pending |
| Custom domain | `tee.darkx402.com` | 🔒 Cert created, DNS pending |
| Fly IPv4 | `66.241.125.120` | — |
| Fly IPv6 | `2a09:8280:1::13d:5d07:0` | — |
| Explorer (devnet) | `https://explorer.solana.com/tx/2fwfpmCfdeRFJXFkb42KsgRkT49PHGyQuo3q8dNxLHkCgRcLZJ5AbQWbEbotEws1q93gpCaEwMPAHeBRitL5Dsjv?cluster=devnet` | ✅ Confirmed |

---

## Next Steps

1. **Create DNS records** in Cloudflare dashboard (see [Required DNS Records](#required-dns-records))
2. **Wait for DNS propagation** and Fly cert verification (`fly certs check`)
3. **Smoke test** both custom domains (see [Smoke Test Commands](#smoke-test-commands))
4. **Production hardening:**
   - [ ] Replace deploy payer with a multisig or hardware-backed key
   - [ ] Add rate limiting to the gateway
   - [ ] Integrate with mainnet program ID
   - [ ] Set up monitoring and alerting for the Fly machine
   - [ ] Add request signing for proof submissions

---

<div align="center">

**Clawd TEE Gateway** · Solana-native attestation anchoring  
Built with 🦞 by the Clawd ecosystem · [`github.com/Solizardking/Zero-Bruh`](https://github.com/Solizardking/Zero-Bruh)

*The shell molts. The proofs do not.*

</div>