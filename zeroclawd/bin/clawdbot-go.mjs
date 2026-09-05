#!/usr/bin/env node
/**
 * CLI entry for `clawd` / `clawdbot` / `clawd-bot` / `npx clawdbot-go`.
 */
import { main } from "../scripts/oneshot-install.mjs";

main(process.argv.slice(2));
