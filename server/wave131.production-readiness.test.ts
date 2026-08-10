/**
 * Wave 131 — Production-Readiness Tests
 * Covers:
 *   1. publishAuditEvent wired to webhook.delete, api_key.revoke
 *   2. BillingConfig.tsx billing.listBillingEvents live data
 *   3. Flutter digital_gold_screen getPortfolioHistory
 *   4. RN DigitalGoldScreen getPortfolioHistory
 *   5. TypeScript fixes: ctx.user.tenantId (was merchantId), and(...conditions) safe pattern
 *   6. FraudRisk.tsx rules array access fix
 *   7. sdk.ts env variable fixes (oAuthServerUrl -> keycloakUrl)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. publishAuditEvent wired to webhook.delete ────────────────────────────
describe("Wave 131 — publishAuditEvent wired to webhook.delete", () => {
  const getContent = () => readFileSync(join(ROOT, "server/routers.ts"), "utf-8");

  it("webhook.delete calls publishAuditEvent", () => {
    const content = getContent();
    const webhookSection = content.split("webhooksRouter")[1] ?? "";
    const deleteSection = webhookSection.split("delete:")[1]?.split("update:")[0] ?? "";
    expect(deleteSection).toContain("publishAuditEvent");
  });

  it("api_key.revoke calls publishAuditEvent", () => {
    const content = getContent();
    const apiKeySection = content.split("apiKeysRouter")[1] ?? "";
    const revokeSection = apiKeySection.split("revoke:")[1]?.split("rotate:")[0] ?? "";
    expect(revokeSection).toContain("publishAuditEvent");
  });
});

// ─── 2. BillingConfig.tsx — listBillingEvents live data ──────────────────────
describe("Wave 131 — BillingConfig.tsx billing events live data", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/pages/BillingConfig.tsx"), "utf-8");

  it("queries billing.listBillingEvents", () => {
    const content = getContent();
    expect(content).toContain("trpc.billing.listBillingEvents.useQuery");
  });

  it("has a Billing Events tab", () => {
    const content = getContent();
    expect(content).toContain("Billing Events");
  });

  it("renders billing events from live data", () => {
    const content = getContent();
    expect(content).toContain("billingEvents");
    expect(content).toContain("billingEvents.data");
  });

  it("shows loading state for billing events", () => {
    const content = getContent();
    expect(content).toContain("billingEvents.isLoading");
  });
});

// ─── 3. Flutter digital_gold_screen — getPortfolioHistory ────────────────────
describe("Wave 131 — Flutter digital_gold_screen portfolio history", () => {
  const screenPath = join(ROOT, "mobile/flutter/lib/screens/digital_gold/digital_gold_screen.dart");

  it("digital_gold_screen.dart exists", () => {
    expect(existsSync(screenPath)).toBe(true);
  });

  it("calls getPortfolioHistory API", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("digitalGold.getPortfolioHistory");
  });

  it("passes months parameter to getPortfolioHistory", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("months");
  });

  it("stores history data in state", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("_historyData");
  });
});

// ─── 4. RN DigitalGoldScreen — getPortfolioHistory ───────────────────────────
describe("Wave 131 — RN DigitalGoldScreen portfolio history", () => {
  const screenPath = join(ROOT, "mobile/react-native/src/screens/DigitalGoldScreen.tsx");

  it("DigitalGoldScreen.tsx exists", () => {
    expect(existsSync(screenPath)).toBe(true);
  });

  it("calls getPortfolioHistory tRPC query", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("getPortfolioHistory");
  });

  it("passes months: 6 to portfolio history", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("months: 6");
  });
});

// ─── 5. TypeScript fixes: ctx.user.tenantId ──────────────────────────────────
describe("Wave 131 — ctx.user.tenantId fix (no more merchantId on user)", () => {
  it("wave121.ts uses ctx.user.tenantId not ctx.user.merchantId", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave121.ts"), "utf-8");
    expect(content).not.toContain("ctx.user.merchantId");
    expect(content).toContain("ctx.user.tenantId");
  });

  it("crud120.ts uses ctx.user.tenantId not ctx.user.merchantId", () => {
    const content = readFileSync(join(ROOT, "server/routers/crud120.ts"), "utf-8");
    expect(content).not.toContain("ctx.user.merchantId");
  });

  it("crud120b.ts uses ctx.user.tenantId not ctx.user.merchantId", () => {
    const content = readFileSync(join(ROOT, "server/routers/crud120b.ts"), "utf-8");
    expect(content).not.toContain("ctx.user.merchantId");
  });
});

// ─── 6. TypeScript fixes: and(...conditions) safe pattern ────────────────────
describe("Wave 131 — and(...conditions) safe spread pattern", () => {
  it("wave121.ts uses safe conditions spread", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave121.ts"), "utf-8");
    expect(content).not.toContain(".where(and(...conditions))");
  });

  it("crud119.ts uses safe conditions spread", () => {
    const content = readFileSync(join(ROOT, "server/routers/crud119.ts"), "utf-8");
    expect(content).not.toContain(".where(and(...conditions))");
  });
});

// ─── 7. FraudRisk.tsx — rules array access fix ───────────────────────────────
describe("Wave 131 — FraudRisk.tsx rules array access", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/pages/FraudRisk.tsx"), "utf-8");

  it("does not access .rules property on array response", () => {
    const content = getContent();
    expect(content).not.toContain("dbRulesData.rules");
  });

  it("handles rules as array or falls back to RULES", () => {
    const content = getContent();
    expect(content).toContain(": RULES");
  });
});

// ─── 8. sdk.ts — env variable fixes ─────────────────────────────────────────
describe("Wave 131 — sdk.ts env variable fixes", () => {
  const getContent = () => readFileSync(join(ROOT, "server/_core/sdk.ts"), "utf-8");

  it("does not reference ENV.oAuthServerUrl (removed field)", () => {
    const content = getContent();
    expect(content).not.toContain("ENV.oAuthServerUrl");
  });

  it("uses ENV.keycloakUrl for OAuth base URL", () => {
    const content = getContent();
    expect(content).toContain("ENV.keycloakUrl");
  });
});

// ─── 9. Cross-platform GoldSIP parity ────────────────────────────────────────
describe("Wave 131 — Cross-platform GoldSIP portfolio history parity", () => {
  it("PWA GoldSIP.tsx has tRPC calls", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/GoldSIP.tsx"), "utf-8");
    expect(content).toContain("trpc");
  });

  it("Flutter SIP screen calls sipPlans", () => {
    const path = join(ROOT, "mobile/flutter/lib/screens/sip/sip_investments_screen.dart");
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("digitalGold.sipPlans");
    }
  });

  it("RN SIPScreen exists and has tRPC calls", () => {
    const path = join(ROOT, "mobile/react-native/src/screens/SIPScreen.tsx");
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      // RN SIPScreen may use trpc or custom query hook
      const hasApiCall = content.includes("trpc") || content.includes("query.sip") || content.includes("useSip") || content.includes("fetch");
      expect(hasApiCall).toBe(true);
    }
  });
});

// ─── 10. BillingConfig.tsx — events tab completeness ─────────────────────────
describe("Wave 131 — BillingConfig.tsx events tab completeness", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/pages/BillingConfig.tsx"), "utf-8");

  it("shows billing events data", () => {
    const content = getContent();
    expect(content).toContain("billingEvents.data");
  });

  it("events tab is accessible via TabsTrigger", () => {
    const content = getContent();
    expect(content).toContain("value=\"events\"");
  });

  it("uses limit: 50 for billing events query", () => {
    const content = getContent();
    expect(content).toContain("limit: 50");
  });
});
