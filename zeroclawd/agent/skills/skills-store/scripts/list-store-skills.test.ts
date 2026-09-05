/**
 * Drive the shipped listStoreSkills() from server/routes/skills-store.ts.
 * Asserts stripe is present with install metadata — not a reimplementation.
 *
 * Run: pnpm exec tsx skills-store/scripts/list-store-skills.test.ts
 */
import { listStoreSkills } from "../../server/routes/skills-store.ts";
import { readFileSync } from "node:fs";

const skills = listStoreSkills();
if (!Array.isArray(skills) || skills.length === 0) {
  throw new Error("listStoreSkills returned empty");
}

// Curated package listing remains intentionally separate from the generated
// community index consumed by the HTTP API.
const imported = JSON.parse(
  readFileSync(new URL("../imported-skills.json", import.meta.url), "utf8"),
);
if (!Array.isArray(imported.skills) || imported.count !== imported.skills.length || imported.count < 500) {
  throw new Error(`imported skills index incomplete: ${JSON.stringify({ count: imported.count, length: imported.skills?.length })}`);
}
if (!imported.skills.some((skill: { slug?: string }) => skill.slug === "cheshire-terminal")) {
  throw new Error("imported skills index missing cheshire-terminal");
}

const names = skills.map((s) => s.name);
const stripe = skills.find((s) => s.name === "stripe" || s.dirName === "stripe");
if (!stripe) {
  throw new Error(`stripe skill missing from listStoreSkills; got: ${names.join(", ")}`);
}

if (stripe.name !== "stripe" || stripe.dirName !== "stripe") {
  throw new Error(`stripe name/dir mismatch: ${JSON.stringify({ name: stripe.name, dirName: stripe.dirName })}`);
}

if (!stripe.validation?.ok) {
  throw new Error(`stripe validation not ok: ${JSON.stringify(stripe.validation)}`);
}

if (!stripe.install?.local?.includes("skills-store/stripe")) {
  throw new Error(`stripe install.local unexpected: ${stripe.install?.local}`);
}

const skillMd: string = stripe.skillMd || "";
if (!skillMd.includes("stripe@claude-plugins-official")) {
  throw new Error("stripe skillMd missing stripe@claude-plugins-official");
}
if (!skillMd.includes("/plugin install stripe@claude-plugins-official")) {
  throw new Error("stripe skillMd missing /plugin install stripe@claude-plugins-official");
}
if (!/Checkout Session|checkout\.sessions|PaymentIntent/i.test(skillMd)) {
  throw new Error("stripe skillMd missing Checkout/PaymentIntent guidance");
}
if (!skillMd.includes("mcp.stripe.com")) {
  throw new Error("stripe skillMd missing mcp.stripe.com");
}

const out = {
  ok: true,
  count: skills.length,
  names,
  stripe: {
    name: stripe.name,
    path: stripe.path,
    validation: stripe.validation,
    install: stripe.install,
    references: stripe.references,
    descriptionLength: stripe.description?.length ?? 0,
  },
};

console.log(JSON.stringify(out, null, 2));
console.log("list-store-skills.test.ts: ALL PASSED");
