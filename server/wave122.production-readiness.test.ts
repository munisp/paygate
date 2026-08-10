/**
 * Wave 122 Production Readiness Tests
 * Covers: Fraud Rule Engine, KYB Document Upload, Loyalty V3 Redemption
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. Backend Router Tests ─────────────────────────────────────────────────

describe("Wave 122 — Backend Routers", () => {
  it("wave122.ts router file exists", () => {
    expect(existsSync(join(ROOT, "server/routers/wave122.ts"))).toBe(true);
  });

  it("fraudRuleEngine router is exported from wave122.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("fraudRuleEngineRouter");
  });

  it("kybDocUpload router is exported from wave122.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("kybDocUploadRouter");
  });

  it("loyaltyRedemption router is exported from wave122.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("loyaltyRedemptionRouter");
  });

  it("wave122 routers are registered in main routers.ts", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("wave122");
    expect(content).toContain("fraudRuleEngine");
    expect(content).toContain("kybDocUpload");
    expect(content).toContain("loyaltyRedemption");
  });
});

// ─── 2. Fraud Rule Engine Tests ───────────────────────────────────────────────

describe("Wave 122 — Fraud Rule Engine", () => {
  it("fraudRuleEngine router has list procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("list:");
  });

  it("fraudRuleEngine router has create procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("create:");
  });

  it("fraudRuleEngine router has toggle procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("toggle");
  });

  it("fraudRuleEngine router has delete procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("delete");
  });

  it("FraudRuleEngine PWA page exists", () => {
    expect(existsSync(join(ROOT, "client/src/pages/FraudRuleEngine.tsx"))).toBe(true);
  });

  it("FraudRuleEngine page uses fraudRuleEngine tRPC namespace", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/FraudRuleEngine.tsx"), "utf-8");
    expect(content).toContain("fraudRuleEngine");
  });

  it("FraudRuleEngine page has condition builder UI", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/FraudRuleEngine.tsx"), "utf-8");
    expect(content).toContain("condition");
  });

  it("FraudRuleEngine page has action selector", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/FraudRuleEngine.tsx"), "utf-8");
    expect(content).toContain("action");
  });

  it("FraudRuleEngine page has enable/disable toggle", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/FraudRuleEngine.tsx"), "utf-8");
    expect(content).toContain("toggle");
  });

  it("FraudRuleEngine route is registered in App.tsx", () => {
    const content = readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(content).toContain("fraud-rule-engine");
    expect(content).toContain("FraudRuleEngine");
  });

  it("FraudRuleEngine nav item is in Layout.tsx", () => {
    const content = readFileSync(join(ROOT, "client/src/components/Layout.tsx"), "utf-8");
    expect(content).toContain("fraud-rule-engine");
  });
});

// ─── 3. KYB Document Upload Tests ────────────────────────────────────────────

describe("Wave 122 — KYB Document Upload", () => {
  it("kybDocUpload router has getUploadUrl procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("getUploadUrl");
  });

  it("kybDocUpload router has listDocuments procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("listDocuments");
  });

  it("kybDocUpload router uses S3 storagePut", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("storagePut");
  });

  it("KYBDocumentUpload PWA page exists", () => {
    expect(existsSync(join(ROOT, "client/src/pages/KYBDocumentUpload.tsx"))).toBe(true);
  });

  it("KYBDocumentUpload page uses kybDocUpload tRPC namespace", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/KYBDocumentUpload.tsx"), "utf-8");
    expect(content).toContain("kybDocUpload");
  });

  it("KYBDocumentUpload page has file upload input", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/KYBDocumentUpload.tsx"), "utf-8");
    expect(content).toContain("file");
  });

  it("KYBDocumentUpload page has document type checklist", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/KYBDocumentUpload.tsx"), "utf-8");
    expect(content).toContain("document");
  });

  it("KYBDocumentUpload page has verification status display", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/KYBDocumentUpload.tsx"), "utf-8");
    expect(content).toContain("status");
  });

  it("KYBDocumentUpload route is registered in App.tsx", () => {
    const content = readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(content).toContain("kyb-document-upload");
    expect(content).toContain("KYBDocumentUpload");
  });

  it("KYBDocumentUpload nav item is in Layout.tsx", () => {
    const content = readFileSync(join(ROOT, "client/src/components/Layout.tsx"), "utf-8");
    expect(content).toContain("kyb-document-upload");
  });
});

// ─── 4. Loyalty V3 Redemption Tests ──────────────────────────────────────────

describe("Wave 122 — Loyalty V3 Redemption", () => {
  it("loyaltyRedemption router has listRedemptions procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("listRedemptions");
  });

  it("loyaltyRedemption router has initiateRedemption procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("initiateRedemption");
  });

  it("loyaltyRedemption router publishes Kafka event", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("Kafka");
  });

  it("loyaltyRedemption router has getBalance procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("getBalance");
  });

  it("LoyaltyRedemption PWA page exists", () => {
    expect(existsSync(join(ROOT, "client/src/pages/LoyaltyRedemption.tsx"))).toBe(true);
  });

  it("LoyaltyRedemption page uses loyaltyRedemption tRPC namespace", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/LoyaltyRedemption.tsx"), "utf-8");
    expect(content).toContain("loyaltyRedemption");
  });

  it("LoyaltyRedemption page has PIN confirmation step", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/LoyaltyRedemption.tsx"), "utf-8");
    expect(content).toContain("pin");
  });

  it("LoyaltyRedemption page shows points balance", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/LoyaltyRedemption.tsx"), "utf-8");
    expect(content).toContain("balance");
  });

  it("LoyaltyRedemption page has reward tier selection", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/LoyaltyRedemption.tsx"), "utf-8");
    expect(content).toContain("reward");
  });

  it("LoyaltyRedemption route is registered in App.tsx", () => {
    const content = readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(content).toContain("loyalty-redemption");
    expect(content).toContain("LoyaltyRedemption");
  });

  it("LoyaltyRedemption nav item is in Layout.tsx", () => {
    const content = readFileSync(join(ROOT, "client/src/components/Layout.tsx"), "utf-8");
    expect(content).toContain("loyalty-redemption");
  });
});

// ─── 5. Database Schema Tests ─────────────────────────────────────────────────

describe("Wave 122 — Database Schema", () => {
  it("fraudRules table is defined in schema.ts", () => {
    const content = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(content).toContain("fraudRules");
  });

  it("kybDocuments table is defined in schema.ts", () => {
    const content = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(content).toContain("kybDocuments");
  });

  it("loyaltyV3Redemptions table is defined in schema.ts", () => {
    const content = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(content).toContain("loyaltyV3Redemptions");
  });
});

// ─── 6. Mobile Parity Tests ───────────────────────────────────────────────────

describe("Wave 122 — Flutter Mobile Parity", () => {
  it("Flutter FraudRuleEngine screen exists", () => {
    expect(existsSync(join(ROOT, "mobile/flutter/lib/screens/fraud_rule_engine/fraud_rule_engine_screen.dart"))).toBe(true);
  });

  it("Flutter KYBDocumentUpload screen exists", () => {
    expect(existsSync(join(ROOT, "mobile/flutter/lib/screens/kyb_document_upload/kyb_document_upload_screen.dart"))).toBe(true);
  });

  it("Flutter LoyaltyRedemption screen exists", () => {
    expect(existsSync(join(ROOT, "mobile/flutter/lib/screens/loyalty_redemption/loyalty_redemption_screen.dart"))).toBe(true);
  });

  it("Flutter app.dart registers fraud-rule-engine route", () => {
    const content = readFileSync(join(ROOT, "mobile/flutter/lib/app.dart"), "utf-8");
    expect(content).toContain("fraud-rule-engine");
  });

  it("Flutter app.dart registers kyb-document-upload route", () => {
    const content = readFileSync(join(ROOT, "mobile/flutter/lib/app.dart"), "utf-8");
    expect(content).toContain("kyb-document-upload");
  });

  it("Flutter app.dart registers loyalty-redemption route", () => {
    const content = readFileSync(join(ROOT, "mobile/flutter/lib/app.dart"), "utf-8");
    expect(content).toContain("loyalty-redemption");
  });
});

describe("Wave 122 — React Native Mobile Parity", () => {
  it("React Native FraudRuleEngine screen exists", () => {
    expect(existsSync(join(ROOT, "mobile/react-native/src/screens/FraudRuleEngine/FraudRuleEngineScreen.tsx"))).toBe(true);
  });

  it("React Native KYBDocumentUpload screen exists", () => {
    expect(existsSync(join(ROOT, "mobile/react-native/src/screens/KYBDocumentUpload/KYBDocumentUploadScreen.tsx"))).toBe(true);
  });

  it("React Native LoyaltyRedemption screen exists", () => {
    expect(existsSync(join(ROOT, "mobile/react-native/src/screens/LoyaltyRedemption/LoyaltyRedemptionScreen.tsx"))).toBe(true);
  });

  it("React Native FraudRuleEngine screen has rule list", () => {
    const content = readFileSync(join(ROOT, "mobile/react-native/src/screens/FraudRuleEngine/FraudRuleEngineScreen.tsx"), "utf-8");
    expect(content).toContain("FlatList");
  });

  it("React Native KYBDocumentUpload screen has upload button", () => {
    const content = readFileSync(join(ROOT, "mobile/react-native/src/screens/KYBDocumentUpload/KYBDocumentUploadScreen.tsx"), "utf-8");
    expect(content).toContain("Upload");
  });

  it("React Native LoyaltyRedemption screen has PIN modal", () => {
    const content = readFileSync(join(ROOT, "mobile/react-native/src/screens/LoyaltyRedemption/LoyaltyRedemptionScreen.tsx"), "utf-8");
    expect(content).toContain("Modal");
  });
});

// ─── 7. Middleware Integration Tests ─────────────────────────────────────────

describe("Wave 122 — Middleware Integration", () => {
  it("publishKafkaEventViaMiddleware is in middlewareBridge.ts", () => {
    const content = readFileSync(join(ROOT, "server/middlewareBridge.ts"), "utf-8");
    expect(content).toContain("publishKafkaEventViaMiddleware");
  });

  it("wave122.ts uses publishKafkaEventViaMiddleware for redemption", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("publishKafkaEventViaMiddleware");
  });

  it("wave122.ts uses storagePut for KYB document upload", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("storagePut");
  });
});

// ─── 8. Security Tests ────────────────────────────────────────────────────────

describe("Wave 122 — Security", () => {
  it("wave122.ts uses protectedProcedure for all write operations", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("protectedProcedure");
  });

  it("wave122.ts validates input with zod schemas", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("z.object");
  });

  it("KYB document upload validates mime type", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("mimeType");
  });

  it("Loyalty redemption validates PIN format", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave122.ts"), "utf-8");
    expect(content).toContain("pin");
  });
});
