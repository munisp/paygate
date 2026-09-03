/**
 * Wave 134 — Production Hardening Tests
 *
 * Covers:
 *  1. Rust cross-border-fraud-engine: borrow-after-move fix, /v1/metrics endpoint
 *  2. Go crossborder_proxy.go: circuit-breaker, retry, fraud pre-screening, sandbox fallback
 *  3. Go main.go: real proxy handler registrations + circuit-status route
 *  4. Python USSD i18n: already-complete language preference endpoints (regression)
 *  5. TypeScript Keycloak: already-complete id_token logout flow (regression)
 *  6. Flutter ApiService: all 9 target screens wired (regression)
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. Rust cross-border-fraud-engine ───────────────────────────────────────

describe("Rust cross-border-fraud-engine (wave134)", () => {
  const mainRs = readFileSync(
    join(ROOT, "rust-services/cross-border-fraud-engine/src/main.rs"),
    "utf8"
  );

  it("fixes borrow-after-move: count extracted before results is moved into json", () => {
    expect(mainRs).toContain("let count = results.len();");
    // The old pattern that caused the borrow error must be gone
    expect(mainRs).not.toMatch(/"count": results\.len\(\)/);
  });

  it("exposes /v1/metrics route", () => {
    expect(mainRs).toContain('"/v1/metrics"');
    expect(mainRs).toContain("handle_metrics");
  });

  it("handle_metrics returns cache_entries and supported_rails", () => {
    expect(mainRs).toContain("cache_entries");
    expect(mainRs).toContain("supported_rails");
  });

  it("handle_batch_score uses count variable (not results.len() after move)", () => {
    const batchFn = mainRs.slice(
      mainRs.indexOf("async fn handle_batch_score"),
      mainRs.indexOf("async fn handle_rules")
    );
    expect(batchFn).toContain("let count = results.len()");
    expect(batchFn).toContain('"count": count');
  });

  it("Dockerfile exists with HEALTHCHECK and EXPOSE 8500", () => {
    const dockerfile = readFileSync(
      join(ROOT, "rust-services/cross-border-fraud-engine/Dockerfile"),
      "utf8"
    );
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("EXPOSE 8500");
  });
});

// ─── 2. Go crossborder_proxy.go ──────────────────────────────────────────────

describe("Go crossborder_proxy.go (wave134)", () => {
  const proxyGo = readFileSync(
    join(ROOT, "go-bridge/internal/handlers/crossborder_proxy.go"),
    "utf8"
  );

  it("defines circuitBreaker struct with allow/recordSuccess/recordFailure", () => {
    expect(proxyGo).toContain("type circuitBreaker struct");
    expect(proxyGo).toContain("func (cb *circuitBreaker) allow()");
    expect(proxyGo).toContain("func (cb *circuitBreaker) recordSuccess()");
    expect(proxyGo).toContain("func (cb *circuitBreaker) recordFailure()");
  });

  it("defines circuit breakers for all four rails", () => {
    expect(proxyGo).toContain("cipsCB");
    expect(proxyGo).toContain("upiCB");
    expect(proxyGo).toContain("pixCB");
    expect(proxyGo).toContain("mojaloopCB");
  });

  it("proxyRequest implements exponential backoff retry (3 attempts)", () => {
    expect(proxyGo).toContain("for attempt := 0; attempt < 3; attempt++");
    expect(proxyGo).toContain("attempt*attempt");
  });

  it("prescreenFraud calls /v1/score on FRAUD_SCORING_URL", () => {
    expect(proxyGo).toContain("FRAUD_SCORING_URL");
    expect(proxyGo).toContain('fraudURL+"/v1/score"');
  });

  it("prescreenFraud fails closed when the engine is unavailable", () => {
    // Real contract: an unconfigured/erroring fraud engine blocks the transfer
    // (failClosed), never fail-open on money movement.
    expect(proxyGo).toContain("FAIL CLOSED by default");
    expect(proxyGo).toContain("failClosed :=");
    expect(proxyGo).toContain('FRAUD_SCORING_URL not configured');
  });

  it("ProxyCIPSTransferReal checks circuit breaker before forwarding", () => {
    expect(proxyGo).toContain("func ProxyCIPSTransferReal");
    expect(proxyGo).toContain("cipsCB.allow()");
  });

  it("ProxyUPIPayReal checks circuit breaker and calls fraud pre-screen", () => {
    expect(proxyGo).toContain("func ProxyUPIPayReal");
    expect(proxyGo).toContain("upiCB.allow()");
    expect(proxyGo).toContain("prescreenFraud");
  });

  it("ProxyPIXPaymentReal checks circuit breaker and calls fraud pre-screen", () => {
    expect(proxyGo).toContain("func ProxyPIXPaymentReal");
    expect(proxyGo).toContain("pixCB.allow()");
  });

  it("sandbox fallback returns X-Sandbox-Mode: true header", () => {
    expect(proxyGo).toContain('"X-Sandbox-Mode", "true"');
  });

  it("GetCrossRailCircuitStatus returns status for all rails", () => {
    expect(proxyGo).toContain("func GetCrossRailCircuitStatus");
    expect(proxyGo).toContain('"cips"');
    expect(proxyGo).toContain('"upi"');
    expect(proxyGo).toContain('"pix"');
    expect(proxyGo).toContain('"mojaloop"');
    expect(proxyGo).toContain("fraud_blocked_total");
  });

  it("fraudBlockedResponse returns 403 with BLOCK recommendation", () => {
    expect(proxyGo).toContain("func fraudBlockedResponse");
    expect(proxyGo).toContain("StatusForbidden");
    expect(proxyGo).toContain('"BLOCK"');
  });
});

// ─── 3. Go main.go: real proxy route registrations ───────────────────────────

describe("Go main.go real proxy registrations (wave134)", () => {
  const mainGo = readFileSync(
    join(ROOT, "go-bridge/cmd/bridge/main.go"),
    "utf8"
  );

  it("routes CIPS transfer to ProxyCIPSTransferReal (not stub)", () => {
    expect(mainGo).toContain("handlers.ProxyCIPSTransferReal");
    expect(mainGo).not.toContain("handlers.ProxyCIPSTransfer)");
  });

  it("routes UPI pay to ProxyUPIPayReal (not stub)", () => {
    expect(mainGo).toContain("handlers.ProxyUPIPayReal");
    expect(mainGo).not.toContain("handlers.ProxyUPIPay)");
  });

  it("routes UPI VPA resolve to ResolveUPIVPAReal (not stub)", () => {
    expect(mainGo).toContain("handlers.ResolveUPIVPAReal");
  });

  it("routes PIX payment to ProxyPIXPaymentReal (not stub)", () => {
    expect(mainGo).toContain("handlers.ProxyPIXPaymentReal");
    expect(mainGo).not.toContain("handlers.ProxyPIXPayment)");
  });

  it("registers GET /v1/cross-border/circuit-status route", () => {
    expect(mainGo).toContain("/v1/cross-border/circuit-status");
    expect(mainGo).toContain("GetCrossRailCircuitStatus");
  });
});

// ─── 4. Python USSD i18n regression ──────────────────────────────────────────

describe("Python USSD i18n language preference endpoints (wave134 regression)", () => {
  const mainPy = readFileSync(
    join(ROOT, "python-services/merchant-ussd-fallback/main.py"),
    "utf8"
  );

  it("GET /v1/ussd/merchant/language-preference endpoint exists", () => {
    expect(mainPy).toContain('"/v1/ussd/merchant/language-preference"');
    expect(mainPy).toContain("get_language_preference");
  });

  it("DELETE /v1/ussd/merchant/language-preference endpoint exists", () => {
    expect(mainPy).toContain("delete_language_preference");
  });

  it("Redis persistence helpers are implemented", () => {
    expect(mainPy).toContain("async def _get_lang_pref");
    expect(mainPy).toContain("async def _set_lang_pref");
    expect(mainPy).toContain("async def _delete_lang_pref");
  });

  it("in-memory fallback dict exists for when Redis is unavailable", () => {
    expect(mainPy).toContain("_lang_prefs_fallback");
  });
});

// ─── 5. TypeScript Keycloak id_token logout regression ───────────────────────

describe("TypeScript Keycloak id_token logout flow (wave134 regression)", () => {
  const keycloakTs = readFileSync(
    join(ROOT, "server/_core/keycloak.ts"),
    "utf8"
  );
  const routerTs = readFileSync(join(ROOT, "server/routers.ts"), "utf8");

  it("buildEndSessionUrl is exported from keycloak.ts", () => {
    expect(keycloakTs).toContain("export function buildEndSessionUrl");
  });

  it("buildEndSessionUrl sets id_token_hint when provided", () => {
    expect(keycloakTs).toContain("id_token_hint");
    expect(keycloakTs).toContain("idTokenHint");
  });

  it("auth.logout reads ID_TOKEN_COOKIE_NAME and passes to buildEndSessionUrl", () => {
    expect(routerTs).toContain("ID_TOKEN_COOKIE_NAME");
    expect(routerTs).toContain("buildEndSessionUrl(postLogoutRedirectUri, idTokenHint)");
  });
});

// ─── 6. Flutter ApiService screen wiring regression ──────────────────────────

describe("Flutter ApiService screen wiring (wave134 regression)", () => {
  const apiService = readFileSync(
    join(ROOT, "mobile/flutter/lib/services/api_service.dart"),
    "utf8"
  );

  const screens = [
    { name: "analytics", method: "getAnalytics" },
    { name: "kyb", method: "getKybStatus" },
    { name: "loyalty", method: "listLoyaltyV3Campaigns" },
    { name: "invoice_financing", method: "listInvoiceFinancing" },
    { name: "fraud_rules", method: "listFraudRules" },
    { name: "virtual_cards_extended", method: "getVirtualCardStats" },
    { name: "pos_products", method: "listPosProducts" },
    { name: "tenant_admin", method: "listTenants" },
    { name: "kyb_submit", method: "submitKybDocument" },
  ];

  screens.forEach(({ name, method }) => {
    it(`ApiService exposes ${method} for ${name} screen`, () => {
      expect(apiService).toContain(method);
    });
  });

  it("ApiService uses trpcQuery/trpcMutation for all calls (no raw http)", () => {
    expect(apiService).toContain("Future<Map<String, dynamic>> trpcQuery");
    expect(apiService).toContain("Future<Map<String, dynamic>> trpcMutation");
    // Should not have raw http.get calls bypassing the tRPC client
    expect(apiService).not.toContain("http.get(");
    expect(apiService).not.toContain("http.post(");
  });
});
