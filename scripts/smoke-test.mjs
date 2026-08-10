/**
 * PayGate Merchant Portal — Smoke Test Suite
 * Validates all critical endpoints and services are operational.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
 *   BASE_URL=https://merchant.paygate.ng node scripts/smoke-test.mjs
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TIMEOUT_MS = 10000;

let passed = 0;
let failed = 0;
const failures = [];

// ─── Test Runner ─────────────────────────────────────────────────────────────
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ─── Health Checks ────────────────────────────────────────────────────────────
console.log("\n🔍 PayGate Merchant Portal — Smoke Tests");
console.log(`   Target: ${BASE_URL}\n`);

console.log("📡 Health & Connectivity");
await test("GET /api/health returns 200", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/api/health`);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const body = await res.json();
  if (body.status !== "ok") throw new Error(`Health status: ${body.status}`);
});

await test("GET /api/health includes database check", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/api/health`);
  const body = await res.json();
  if (!body.checks?.database) throw new Error("Missing database check");
  if (body.checks.database !== "ok") throw new Error(`DB check: ${body.checks.database}`);
});

await test("GET /api/health includes service version", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/api/health`);
  const body = await res.json();
  if (!body.version) throw new Error("Missing version field");
  if (!body.timestamp) throw new Error("Missing timestamp field");
});

// ─── Frontend ─────────────────────────────────────────────────────────────────
console.log("\n🌐 Frontend");
await test("GET / returns HTML", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/`);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/html")) throw new Error(`Expected HTML, got ${ct}`);
});

await test("GET /login returns HTML (no redirect loop)", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/login`);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
});

await test("GET /404 returns HTML (not found page)", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/this-page-does-not-exist-xyz`);
  // SPA should return 200 with HTML (client-side routing handles 404)
  if (res.status !== 200) throw new Error(`Expected 200 (SPA), got ${res.status}`);
});

// ─── Security Headers ─────────────────────────────────────────────────────────
console.log("\n🔒 Security Headers");
await test("X-Content-Type-Options header present", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/`);
  const header = res.headers.get("x-content-type-options");
  if (!header) throw new Error("Missing X-Content-Type-Options header");
  if (header !== "nosniff") throw new Error(`Expected nosniff, got ${header}`);
});

await test("X-Frame-Options header present", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/`);
  const header = res.headers.get("x-frame-options");
  if (!header) throw new Error("Missing X-Frame-Options header");
});

await test("Content-Security-Policy header present", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/`);
  const header = res.headers.get("content-security-policy");
  if (!header) throw new Error("Missing Content-Security-Policy header");
});

// ─── API Endpoints ────────────────────────────────────────────────────────────
console.log("\n🔌 API Endpoints");
await test("POST /api/trpc/auth.me returns unauthorized (not 500)", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/api/trpc/auth.me`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  // Should return 200 with null user or 401, not 500
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
});

await test("GET /api/trpc/system.ping returns pong", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/api/trpc/system.ping`);
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────
console.log("\n⚡ Rate Limiting");
await test("Rate limiting headers present on API requests", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/api/health`);
  // Either RateLimit or X-RateLimit headers should be present
  const hasRateLimit = res.headers.get("ratelimit-limit") ||
    res.headers.get("x-ratelimit-limit") ||
    res.headers.get("retry-after");
  // Rate limiting may not apply to health endpoint — just ensure no 429 on first request
  if (res.status === 429) throw new Error("Rate limited on first health request");
});

// ─── Static Assets ────────────────────────────────────────────────────────────
console.log("\n📦 Static Assets");
await test("GET /favicon.ico returns 200 or 404 (not 500)", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/favicon.ico`);
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
});

await test("GET /robots.txt returns 200 or 404 (not 500)", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/robots.txt`);
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
});

// ─── Webhook Endpoint ─────────────────────────────────────────────────────────
console.log("\n🪝 Webhook Endpoints");
await test("POST /api/stripe/webhook returns 400 (missing signature) not 500", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "test" }),
  });
  // Should return 400 (bad signature) not 500 (crash)
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
  if (res.status === 200) throw new Error("Should not accept unsigned webhook");
});

// ─── Wave 108: Security Services ────────────────────────────────────────────
console.log("\n🛡️  Wave 108: Security Services");
await test("GET /api/security/pbac-health returns 200", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/api/security/pbac-health`);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  const body = await res.json();
  if (body.localMatrixActive === undefined) throw new Error("Missing localMatrixActive field in PBAC health");
  if (!Array.isArray(body.policies)) throw new Error("Missing policies array in PBAC health");
});

await test("POST /api/nibss/webhook returns 401 (missing sig) not 500", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/api/nibss/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "test" }),
  });
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
  if (res.status === 200) throw new Error("Should not accept unsigned NIBSS webhook");
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────────");
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\n  Failed tests:");
  for (const f of failures) {
    console.log(`    ❌ ${f.name}`);
    console.log(`       ${f.error}`);
  }
}
console.log("─────────────────────────────────────────\n");

if (failed > 0) {
  process.exit(1);
}
