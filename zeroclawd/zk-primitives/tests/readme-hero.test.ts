/**
 * Structural smoke: the GitHub-rendered README hero must exist and
 * use real SVG animation primitives (SMIL), not a static image only.
 *
 * This drives the shipped assets referenced by README.md.
 */
import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("zk-primitives animated README hero", () => {
  test("README references the hero SVG asset", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).toMatch(/Clawd ZK Primitives/);
    expect(readme).toMatch(/nullifier/i);
    expect(readme).toMatch(/Groth16/);
    expect(readme).toMatch(/Light Protocol/);
    expect(readme).toMatch(/docs\/assets\/clawd-zk-hero\.svg/);
  });

  test("hero SVG exists and uses SMIL animation primitives", () => {
    const svgPath = join(root, "docs/assets/clawd-zk-hero.svg");
    expect(existsSync(svgPath)).toBe(true);
    const svg = readFileSync(svgPath, "utf8");
    expect(svg).toMatch(/<svg[\s>]/);
    // Real animation primitives GitHub will render without JavaScript.
    expect(svg).toMatch(/<animate[\s>]/);
    expect(svg).toMatch(/<animateTransform[\s>]/);
    expect(svg).toMatch(/repeatCount=["']indefinite["']/);
    // Identity content in the hero itself.
    expect(svg.toLowerCase()).toMatch(/nullifier|groth16|light/);
    expect(svg).toMatch(/CLAWD ZK/);
  });
});
