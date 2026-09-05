# Clawd Bot Computer (E2B template)

E2B sandbox image that one-shots **Clawd Bot** (`npx clawdbot-go`) so a spawned
desk already has the RH skill pack, `clawdbot-go` / `clawd-bot` bins, and a
status server on port **8787**.

This lives in the runtime repo. The hosted Cheshire desk at
[cheshireterminal.ai/cheshire-computer](https://cheshireterminal.ai/cheshire-computer)
is a separate product path that can point at the same npm package.

## Bake the image

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r e2b/clawdbot-computer/requirements.txt
export E2B_API_KEY=e2b_…
python e2b/clawdbot-computer/build.py
python e2b/clawdbot-computer/build.py --dockerfile   # inspect only
```

Alias: **`clawdbot-computer`**.

The Python builder matches the E2B Template SDK:

- `Template().from_node_image("lts")`
- `npm_install(["clawdbot-go@latest"], g=True)`
- `run_cmd` oneshot (`skills-install` + `oneshot --skip-go`)
- `set_start_cmd(..., wait_for_url("http://127.0.0.1:8787/health", 200))`

## Spawn

```bash
# Console (this repo)
# GET  /api/e2b/computer
# POST /api/e2b/computer

# SDK
# Sandbox.create("clawdbot-computer")
```

Inside a running sandbox:

```bash
curl -fsS http://127.0.0.1:8787/health
npx clawdbot-go skills
npx clawdbot-go inspect
bash ~/clawdbot-computer/oneshot.sh
```

Public desk URL shape: `https://8787-<sandboxId>.e2b.app`.
