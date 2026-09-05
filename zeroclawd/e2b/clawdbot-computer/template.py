"""Clawd Bot E2B computer — bake `npx clawdbot-go` into a sandbox image.

Spawn with template alias `clawdbot-computer`. The start command serves a
desk on :8787; ready when GET /health returns 200.

Build (requires E2B_API_KEY and the `e2b` Python package):

    python e2b/clawdbot-computer/build.py
    python e2b/clawdbot-computer/build.py --dockerfile
"""

from __future__ import annotations

from pathlib import Path

from e2b import Template, wait_for_url

ROOT = Path(__file__).resolve().parent
COMPUTER_DIR = ROOT / "computer"

NPM_SPEC = "clawdbot-go@latest"
TEMPLATE_ALIAS = "clawdbot-computer"
COMPUTER_PORT = 8787

template = (
    Template()
    .from_node_image("lts")
    .apt_install(["curl", "ca-certificates", "git"])
    .set_workdir("/home/user")
    .set_envs(
        {
            "CLAWDBOT_NPM_SPEC": NPM_SPEC,
            "CLAWDBOT_SKILLS_DIR": "/home/user/.clawdbot/skills",
            "CLAWDBOT_COMPUTER_PORT": str(COMPUTER_PORT),
            "CLAWD_PRODUCT": "Clawd Bot",
            "npm_config_update_notifier": "false",
        }
    )
    .npm_install([NPM_SPEC], g=True)
    .run_cmd(
        [
            f"npx --yes {NPM_SPEC} help",
            f"npx --yes {NPM_SPEC} skills-install --force",
            f"npx --yes {NPM_SPEC} oneshot --skip-go --skip-automaton --skip-birth --force",
            "mkdir -p /home/user/.clawdbot-computer /home/user/.clawdbot/skills",
        ]
    )
    .copy(str(COMPUTER_DIR), "/home/user/clawdbot-computer")
    .run_cmd("chmod +x /home/user/clawdbot-computer/boot.sh /home/user/clawdbot-computer/oneshot.sh")
    .set_start_cmd(
        "bash /home/user/clawdbot-computer/boot.sh",
        wait_for_url(f"http://127.0.0.1:{COMPUTER_PORT}/health", 200),
    )
)
