#!/usr/bin/env python3
"""Build or inspect the Clawd Bot E2B computer template."""

from __future__ import annotations

import argparse
import os
import sys

from template import TEMPLATE_ALIAS, template


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Clawd Bot E2B computer template")
    parser.add_argument(
        "--dockerfile",
        action="store_true",
        help="print the equivalent Dockerfile and exit (no cloud build)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="print the template JSON and exit (no cloud build)",
    )
    parser.add_argument("--alias", default=TEMPLATE_ALIAS, help="template alias (default: clawdbot-computer)")
    args = parser.parse_args()

    from e2b import Template

    if args.dockerfile:
        print(Template.to_dockerfile(template))
        return 0
    if args.json:
        print(Template.to_json(template))
        return 0

    if not os.environ.get("E2B_API_KEY", "").strip():
        print("E2B_API_KEY is required to build the template", file=sys.stderr)
        return 2

    Template.build(
        template,
        alias=args.alias,
        cpu_count=2,
        memory_mb=2048,
    )
    print(f"built template alias={args.alias}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
