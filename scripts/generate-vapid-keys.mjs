#!/usr/bin/env node
/**
 * generate-vapid-keys.mjs
 *
 * Generates a fresh VAPID key pair for Web Push notifications.
 * Run once per environment (dev, staging, prod) and store the output
 * in your secrets manager or .env file.
 *
 * Usage:
 *   node scripts/generate-vapid-keys.mjs
 *   node scripts/generate-vapid-keys.mjs --env   # prints .env format
 *   node scripts/generate-vapid-keys.mjs --json  # prints JSON format
 *
 * ⚠️  Never commit the generated keys to source control.
 *     Add them via: Settings → Secrets in the Manus UI, or
 *     set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in your .env
 */

import { createECDH, randomBytes } from "node:crypto";

// ── Parse CLI flags ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const outputEnv = args.includes("--env");
const outputJson = args.includes("--json");

// ── Generate VAPID key pair using Node.js built-in crypto ─────────────────────
// VAPID requires P-256 (prime256v1) ECDH key pair, base64url-encoded.
function generateVapidKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();

  // Public key: uncompressed point (65 bytes) → base64url
  const publicKeyBuffer = ecdh.getPublicKey();
  // Private key: 32 bytes → base64url
  const privateKeyBuffer = ecdh.getPrivateKey();

  const toBase64Url = (buf) =>
    buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  return {
    publicKey: toBase64Url(publicKeyBuffer),
    privateKey: toBase64Url(privateKeyBuffer),
  };
}

const keys = generateVapidKeys();
const subject = "mailto:push@paygate.ng";

// ── Output ────────────────────────────────────────────────────────────────────
if (outputJson) {
  console.log(
    JSON.stringify(
      {
        VAPID_PUBLIC_KEY: keys.publicKey,
        VAPID_PRIVATE_KEY: keys.privateKey,
        VAPID_SUBJECT: subject,
      },
      null,
      2
    )
  );
} else if (outputEnv) {
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  console.log(`VAPID_SUBJECT=${subject}`);
} else {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           PayGate VAPID Key Generator                        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("  Public Key (VAPID_PUBLIC_KEY):");
  console.log(`  ${keys.publicKey}`);
  console.log("");
  console.log("  Private Key (VAPID_PRIVATE_KEY):");
  console.log(`  ${keys.privateKey}`);
  console.log("");
  console.log("  Subject (VAPID_SUBJECT):");
  console.log(`  ${subject}`);
  console.log("");
  console.log("─────────────────────────────────────────────────────────────────");
  console.log("  Next steps:");
  console.log("  1. Copy the keys above into Settings → Secrets in the Manus UI");
  console.log("     OR add them to your .env file (never commit to git)");
  console.log("  2. The VAPID_PUBLIC_KEY is also needed on the frontend:");
  console.log("     trpc.pushTokens.getVapidPublicKey returns it automatically");
  console.log("  3. Restart the server after updating secrets");
  console.log("─────────────────────────────────────────────────────────────────");
  console.log("");
  console.log("  .env format (--env flag):");
  console.log(`  VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`  VAPID_PRIVATE_KEY=${keys.privateKey}`);
  console.log(`  VAPID_SUBJECT=${subject}`);
  console.log("");
}
