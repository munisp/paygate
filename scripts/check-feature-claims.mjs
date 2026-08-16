#!/usr/bin/env node
/**
 * Feature-claim manifest gate (assurance protocol §2A).
 *
 * Fails (exit 1) when:
 *  - a claim marked "verified" references implementation or test files that do not exist
 *  - a critical claim is marked "verified" without any test evidence
 *  - a claim's status is not one of verified|blocked|incomplete|retired|not_applicable
 *  - a verified claim lacks lastVerified
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "feature-claims.json"), "utf8"));

const VALID = new Set(["verified", "blocked", "incomplete", "retired", "not_applicable"]);
let failures = 0;
const fail = (msg) => { console.error(`CLAIM-GATE FAIL: ${msg}`); failures++; };

for (const c of manifest.claims ?? []) {
  if (!c.id || !c.claim) fail(`claim missing id/claim text: ${JSON.stringify(c).slice(0, 80)}`);
  if (!VALID.has(c.status)) fail(`${c.id}: invalid status "${c.status}"`);
  for (const f of c.implementation ?? []) {
    if (!fs.existsSync(path.join(root, f))) fail(`${c.id}: implementation file missing: ${f}`);
  }
  const tests = c.evidence?.tests ?? [];
  for (const t of tests) {
    if (!fs.existsSync(path.join(root, t))) fail(`${c.id}: evidence test missing: ${t}`);
  }
  if (c.status === "verified") {
    if (!c.lastVerified) fail(`${c.id}: verified without lastVerified`);
    if (c.critical && tests.length === 0 && !(c.limitations ?? "").match(/sweep|migrat|sandbox/i)) {
      fail(`${c.id}: critical claim verified without test evidence or documented alternative verification`);
    }
  }
}

console.log(`claim-gate: ${(manifest.claims ?? []).length} claims checked, ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
