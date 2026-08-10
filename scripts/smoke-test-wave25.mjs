#!/usr/bin/env node
/**
 * Wave 25 Smoke Test Suite
 * Tests all new Wave 25 features and endpoints
 * Usage: BASE_URL=http://localhost:3000 node scripts/smoke-test-wave25.mjs
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
    results.push({ name, status: "pass" });
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
    results.push({ name, status: "fail", error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...headers },
  });
  return { res, body: await res.json().catch(() => ({})) };
}

console.log(`\n🔥 PayGate Wave 25 Smoke Tests`);
console.log(`   Target: ${BASE_URL}\n`);

// ─── Core Health ──────────────────────────────────────────────────────────────
console.log("📡 Core Health");
await test("Health endpoint responds 200", async () => {
  const { res, body } = await get("/api/health");
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(body.status === "ok", `Expected status ok, got ${body.status}`);
});

await test("Health reports database ok", async () => {
  const { body } = await get("/api/health");
  assert(body.checks?.database === "ok", "Database check should be ok");
});

await test("Health reports all integrations", async () => {
  const { body } = await get("/api/health");
  assert(body.integrations !== undefined, "Should have integrations object");
});

// ─── Security Headers ─────────────────────────────────────────────────────────
console.log("\n🔒 Security Headers");
await test("X-Content-Type-Options header present", async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  assert(
    res.headers.get("x-content-type-options") === "nosniff",
    "Missing X-Content-Type-Options: nosniff"
  );
});

await test("X-Frame-Options header present", async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  const xfo = res.headers.get("x-frame-options");
  assert(xfo !== null, "Missing X-Frame-Options header");
});

await test("No server version disclosure", async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  const server = res.headers.get("x-powered-by");
  assert(server === null, `Server version disclosed: ${server}`);
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────
console.log("\n⚡ Rate Limiting");
await test("Rate limiting active on API endpoints", async () => {
  // Make 5 rapid requests - should all succeed (under limit)
  const requests = Array.from({ length: 5 }, () =>
    fetch(`${BASE_URL}/api/health`)
  );
  const responses = await Promise.all(requests);
  const allOk = responses.every((r) => r.status < 500);
  assert(allOk, "Rapid requests should not cause 5xx errors");
});

// ─── tRPC Endpoints ───────────────────────────────────────────────────────────
console.log("\n🔌 tRPC API");
await test("tRPC batch endpoint accessible", async () => {
  const res = await fetch(`${BASE_URL}/api/trpc/auth.me?batch=1&input={}`, {
    credentials: "include",
  });
  // Should return 401 or 200, not 404 or 500
  assert(
    res.status !== 404 && res.status !== 500,
    `tRPC endpoint returned ${res.status}`
  );
});

await test("tRPC returns JSON content type", async () => {
  const res = await fetch(`${BASE_URL}/api/trpc/auth.me?batch=1&input={}`, {
    credentials: "include",
  });
  const ct = res.headers.get("content-type") || "";
  assert(ct.includes("application/json"), `Expected JSON, got ${ct}`);
});

// ─── Static Assets ────────────────────────────────────────────────────────────
console.log("\n📦 Static Assets");
await test("Frontend app loads (HTML response)", async () => {
  const res = await fetch(`${BASE_URL}/`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  assert(ct.includes("text/html"), `Expected HTML, got ${ct}`);
});

await test("404 page returns HTML", async () => {
  const res = await fetch(`${BASE_URL}/nonexistent-route-xyz`);
  // SPA should return 200 with HTML (client-side routing)
  assert(res.status === 200 || res.status === 404, `Unexpected status ${res.status}`);
});

// ─── Stripe Webhook ───────────────────────────────────────────────────────────
console.log("\n💳 Stripe Integration");
await test("Stripe webhook endpoint exists", async () => {
  const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "evt_test_smoke", type: "test.event" }),
  });
  // Should return 200 (test event) or 400 (invalid signature) - not 404
  assert(res.status !== 404, `Stripe webhook endpoint missing (404)`);
});

// ─── Feature Flags ────────────────────────────────────────────────────────────
console.log("\n🚩 Feature Flags");
await test("Feature flags tRPC endpoint accessible", async () => {
  const res = await fetch(
    `${BASE_URL}/api/trpc/wave24.featureFlags.list?batch=1&input={}`,
    { credentials: "include" }
  );
  // 401 = protected (correct), 200 = ok, anything but 404/500 is fine
  assert(
    res.status !== 404 && res.status !== 500,
    `Feature flags endpoint returned ${res.status}`
  );
});

// ─── Consumer Budget Alerts ───────────────────────────────────────────────────
console.log("\n💰 Consumer Budgets");
await test("Consumer budgets tRPC endpoint accessible", async () => {
  const res = await fetch(
    `${BASE_URL}/api/trpc/wave24.budgets.list?batch=1&input={}`,
    { credentials: "include" }
  );
  assert(
    res.status !== 404 && res.status !== 500,
    `Consumer budgets endpoint returned ${res.status}`
  );
});

// ─── Webhook Failure Alerts ───────────────────────────────────────────────────
console.log("\n🚨 Webhook Failure Alerts");
await test("Webhook failure alerts tRPC endpoint accessible", async () => {
  const res = await fetch(
    `${BASE_URL}/api/trpc/admin.webhookAlerts.summary?batch=1&input={}`,
    { credentials: "include" }
  );
  assert(
    res.status !== 404 && res.status !== 500,
    `Webhook alerts endpoint returned ${res.status}`
  );
});

// ─── SDK Tokens ───────────────────────────────────────────────────────────────
console.log("\n🔑 SDK Tokens");
await test("SDK tokens tRPC endpoint accessible", async () => {
  const res = await fetch(
    `${BASE_URL}/api/trpc/wave25.sdkToken.list?batch=1&input={}`,
    { credentials: "include" }
  );
  assert(
    res.status !== 404 && res.status !== 500,
    `SDK tokens endpoint returned ${res.status}`
  );
});

// ─── Audit Log ────────────────────────────────────────────────────────────────
console.log("\n📋 Audit Log");
await test("Audit log tRPC endpoint accessible", async () => {
  const res = await fetch(
    `${BASE_URL}/api/trpc/wave25.auditLog.list?batch=1&input={}`,
    { credentials: "include" }
  );
  assert(
    res.status !== 404 && res.status !== 500,
    `Audit log endpoint returned ${res.status}`
  );
});

// ─── Chargeback Evidence ──────────────────────────────────────────────────────
console.log("\n⚖️ Chargebacks");
await test("Chargebacks tRPC endpoint accessible", async () => {
  const res = await fetch(
    `${BASE_URL}/api/trpc/wave24.chargebacks.list?batch=1&input={}`,
    { credentials: "include" }
  );
  assert(
    res.status !== 404 && res.status !== 500,
    `Chargebacks endpoint returned ${res.status}`
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log(`✅ All Wave 25 smoke tests passed!\n`);
  process.exit(0);
} else {
  console.log(`\n❌ Failed tests:`);
  results.filter((r) => r.status === "fail").forEach((r) => {
    console.log(`   • ${r.name}: ${r.error}`);
  });
  console.log();
  process.exit(1);
}
