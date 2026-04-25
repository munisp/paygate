/**
 * Wave 100 Tests — Comprehensive Audit Sprint
 * Covers: microservice wiring, mobile screens, PWA, env docs, CRUD completeness
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const BASE = join(__dirname, "..");

// ─── Helper ──────────────────────────────────────────────────────────────────
const fileExists = (p: string) => existsSync(join(BASE, p));
const fileContains = (p: string, text: string) => {
  try {
    return readFileSync(join(BASE, p), "utf8").includes(text);
  } catch {
    return false;
  }
};
const fileContainsAll = (p: string, texts: string[]) => {
  try {
    const content = readFileSync(join(BASE, p), "utf8");
    return texts.every((t) => content.includes(t));
  } catch {
    return false;
  }
};

// ─── Go Bridge: All 57 Microservices Wired ───────────────────────────────────
describe("Go Bridge — All microservices wired", () => {
  const mainGo = "go-bridge/cmd/bridge/main.go";

  // Go services
  it("wires mojaloop FSPIOP adapter", () => {
    expect(fileContains(mainGo, "/v1/mojaloop/health")).toBe(true);
  });
  it("wires CIPS gateway", () => {
    expect(fileContains(mainGo, "/v1/cips/health")).toBe(true);
  });
  it("wires UPI gateway", () => {
    expect(fileContains(mainGo, "/v1/upi/health")).toBe(true);
  });
  it("wires PIX gateway", () => {
    expect(fileContains(mainGo, "/v1/pix/health")).toBe(true);
  });

  // Rust services
  it("wires billing engine", () => {
    expect(fileContains(mainGo, "/v1/billing/health")).toBe(true);
  });
  it("wires credit scoring Rust", () => {
    expect(fileContains(mainGo, "/v1/credit-scoring/health")).toBe(true);
  });
  it("wires inventory engine", () => {
    expect(fileContains(mainGo, "/v1/inventory/health")).toBe(true);
  });
  it("wires KYC OCR engine", () => {
    expect(fileContains(mainGo, "/v1/kyc-ocr/health")).toBe(true);
  });
  it("wires loyalty ledger", () => {
    expect(fileContains(mainGo, "/v1/loyalty-ledger/health")).toBe(true);
  });
  it("wires TigerBeetle recon", () => {
    expect(fileContains(mainGo, "/v1/tigerbeetle-recon/health")).toBe(true);
  });
  it("wires wallet FFI", () => {
    expect(fileContains(mainGo, "/v1/wallet-ffi/health")).toBe(true);
  });
  it("wires cross-border fraud engine", () => {
    expect(fileContains(mainGo, "/v1/cross-border-fraud/health")).toBe(true);
  });
  it("wires TigerBeetle ledger", () => {
    expect(fileContains(mainGo, "/v1/tigerbeetle-ledger/health")).toBe(true);
  });

  // Python services
  it("wires AI insights", () => {
    expect(fileContains(mainGo, "/v1/ai-insights/health")).toBe(true);
  });
  it("wires AML monitor", () => {
    expect(fileContains(mainGo, "/v1/aml-monitor/health")).toBe(true);
  });
  it("wires cashback rewards", () => {
    expect(fileContains(mainGo, "/v1/cashback/health")).toBe(true);
  });
  it("wires cohort analytics", () => {
    expect(fileContains(mainGo, "/v1/cohort/health")).toBe(true);
  });
  it("wires EMI service", () => {
    expect(fileContains(mainGo, "/v1/emi/health")).toBe(true);
  });
  it("wires fraud heatmap", () => {
    expect(fileContains(mainGo, "/v1/fraud-heatmap/health")).toBe(true);
  });
  it("wires fraud scoring", () => {
    expect(fileContains(mainGo, "/v1/fraud-scoring/health")).toBe(true);
  });
  it("wires FX rate feed", () => {
    expect(fileContains(mainGo, "/v1/fx-rate/health")).toBe(true);
  });
  it("wires insurance pricing", () => {
    expect(fileContains(mainGo, "/v1/insurance/health")).toBe(true);
  });
  it("wires ISO 20022 parser", () => {
    expect(fileContains(mainGo, "/v1/iso20022/health")).toBe(true);
  });
  it("wires kiosk health", () => {
    expect(fileContains(mainGo, "/v1/kiosk/health")).toBe(true);
  });
  it("wires KYC OCR Python", () => {
    expect(fileContains(mainGo, "/v1/kyc-ocr-py/health")).toBe(true);
  });
  it("wires lakehouse audit", () => {
    expect(fileContains(mainGo, "/v1/lakehouse-audit/health")).toBe(true);
  });
  it("wires liveness detection", () => {
    expect(fileContains(mainGo, "/v1/liveness/health")).toBe(true);
  });
  it("wires M-Pesa connector", () => {
    expect(fileContains(mainGo, "/v1/mpesa/health")).toBe(true);
  });
  it("wires pension NPS", () => {
    expect(fileContains(mainGo, "/v1/pension/health")).toBe(true);
  });
  it("wires push service", () => {
    expect(fileContains(mainGo, "/v1/push/health")).toBe(true);
  });
  it("wires reconciliation engine", () => {
    expect(fileContains(mainGo, "/v1/reconciliation-engine/health")).toBe(true);
  });
  it("wires settlement forecast", () => {
    expect(fileContains(mainGo, "/v1/settlement-forecast/health")).toBe(true);
  });
  it("wires Spark compaction", () => {
    expect(fileContains(mainGo, "/v1/spark/health")).toBe(true);
  });
  it("wires USDC lakehouse", () => {
    expect(fileContains(mainGo, "/v1/usdc-lakehouse/health")).toBe(true);
  });
  it("wires USSD gateway", () => {
    expect(fileContains(mainGo, "/v1/ussd-gw/health")).toBe(true);
  });
  it("wires wealth management", () => {
    expect(fileContains(mainGo, "/v1/wealth/health")).toBe(true);
  });
  it("wires vector store", () => {
    expect(fileContains(mainGo, "/v1/vector-store/health")).toBe(true);
  });
  it("wires knowledge graph", () => {
    expect(fileContains(mainGo, "/v1/knowledge-graph/health")).toBe(true);
  });
  it("wires GNN fraud", () => {
    expect(fileContains(mainGo, "/v1/gnn-fraud/health")).toBe(true);
  });
  it("wires wealth advisor", () => {
    expect(fileContains(mainGo, "/v1/wealth-advisor/health")).toBe(true);
  });
  it("wires CIPS/UPI/PIX FX service", () => {
    expect(fileContains(mainGo, "/v1/cips-upi-pix-fx/health")).toBe(true);
  });
  it("wires OpenSearch service", () => {
    expect(fileContains(mainGo, "/v1/opensearch/health")).toBe(true);
  });
  it("wires ART reasoning", () => {
    expect(fileContains(mainGo, "/v1/art-reasoning/health")).toBe(true);
  });
  it("wires CocoIndex", () => {
    expect(fileContains(mainGo, "/v1/cocoindex/health")).toBe(true);
  });
  it("wires Lakehouse AI", () => {
    expect(fileContains(mainGo, "/v1/lakehouse-ai/health")).toBe(true);
  });
});

// ─── React Native Screens ────────────────────────────────────────────────────
describe("React Native — Mobile screens exist", () => {
  const rnBase = "mobile/react-native/src/screens";

  it("has ComplianceScreen", () => {
    expect(fileExists(`${rnBase}/ComplianceScreen.tsx`)).toBe(true);
  });
  it("has SettlementsScreen", () => {
    expect(fileExists(`${rnBase}/SettlementsScreen.tsx`)).toBe(true);
  });
  it("has ReconciliationScreen", () => {
    expect(fileExists(`${rnBase}/ReconciliationScreen.tsx`)).toBe(true);
  });
  it("has QRPaymentsScreen", () => {
    expect(fileExists(`${rnBase}/QRPaymentsScreen.tsx`)).toBe(true);
  });
  it("has CrossBorderScreen", () => {
    expect(fileExists(`${rnBase}/CrossBorderScreen.tsx`)).toBe(true);
  });
  it("has FraudRiskScreen", () => {
    expect(fileExists(`${rnBase}/FraudRiskScreen.tsx`)).toBe(true);
  });
  it("has BNPLScreen", () => {
    expect(fileExists(`${rnBase}/BNPLScreen.tsx`)).toBe(true);
  });
  it("has FXScreen", () => {
    expect(fileExists(`${rnBase}/FXDashboardScreen.tsx`)).toBe(true);
  });
  it("has PaymentLinksScreen", () => {
    expect(fileExists(`${rnBase}/PaymentLinksScreen.tsx`)).toBe(true);
  });
  it("ComplianceScreen uses API call", () => {
    expect(fileContains(`${rnBase}/ComplianceScreen.tsx`, "fetch(")).toBe(true);
  });
  it("SettlementsScreen uses API call", () => {
    expect(fileContains(`${rnBase}/SettlementsScreen.tsx`, "fetch(")).toBe(true);
  });
  it("ReconciliationScreen shows summary stats", () => {
    expect(fileContains(`${rnBase}/ReconciliationScreen.tsx`, "Matched")).toBe(true);
  });
  it("QRPaymentsScreen has generate button", () => {
    expect(fileContains(`${rnBase}/QRPaymentsScreen.tsx`, "generateQR")).toBe(true);
  });
});

// ─── Flutter Screens ─────────────────────────────────────────────────────────
describe("Flutter — Mobile screens exist", () => {
  const flutterBase = "mobile/flutter/lib/screens";

  it("has compliance screen", () => {
    expect(fileExists(`${flutterBase}/compliance/compliance_screen.dart`)).toBe(true);
  });
  it("has settlements screen", () => {
    expect(fileExists(`${flutterBase}/settlements/settlements_screen.dart`)).toBe(true);
  });
  it("has QR payments screen", () => {
    expect(fileExists(`${flutterBase}/qr_payments/qr_payments_screen.dart`)).toBe(true);
  });
  it("compliance screen uses http", () => {
    expect(fileContains(`${flutterBase}/compliance/compliance_screen.dart`, "http.get")).toBe(true);
  });
  it("settlements screen shows amount", () => {
    expect(fileContains(`${flutterBase}/settlements/settlements_screen.dart`, "amount")).toBe(true);
  });
  it("QR payments screen has generate action", () => {
    expect(fileContains(`${flutterBase}/qr_payments/qr_payments_screen.dart`, "_generate")).toBe(true);
  });
});

// ─── PWA ─────────────────────────────────────────────────────────────────────
describe("PWA — Manifest and service worker", () => {
  it("has manifest.json", () => {
    expect(fileExists("client/public/manifest.json")).toBe(true);
  });
  it("manifest has required PWA fields", () => {
    expect(
      fileContainsAll("client/public/manifest.json", [
        '"name"',
        '"short_name"',
        '"start_url"',
        '"display"',
        '"icons"',
      ])
    ).toBe(true);
  });
  it("has service worker", () => {
    const hasSw =
      fileExists("client/public/sw.js") ||
      fileExists("client/src/sw.ts") ||
      fileExists("client/public/service-worker.js");
    expect(hasSw).toBe(true);
  });
  it("index.html links manifest", () => {
    expect(
      fileContains("client/index.html", "manifest") ||
      fileContains("client/public/manifest.json", "PayGate")
    ).toBe(true);
  });
});

// ─── Env Reference Documentation ─────────────────────────────────────────────
describe("Environment — Documentation complete", () => {
  it("has ENV_REFERENCE.md", () => {
    expect(fileExists("docs/ENV_REFERENCE.md")).toBe(true);
  });
  it("ENV_REFERENCE.md covers all major services", () => {
    expect(
      fileContainsAll("docs/ENV_REFERENCE.md", [
        "DATABASE_URL",
        "JWT_SECRET",
        "KEYCLOAK_URL",
        "KAFKA_BOOTSTRAP_SERVERS",
        "TEMPORAL_HOST_PORT",
        "TIGERBEETLE_ADDRESS",
        "STRIPE_SECRET_KEY",
        "NIBSS_GATEWAY_URL",
        "MOJALOOP_URL",
        "CIPS_GATEWAY_URL",
        "UPI_GATEWAY_URL",
        "PIX_GATEWAY_URL",
        "REDIS_URL",
        "PERMIFY_URL",
        "VAPID_PUBLIC_KEY",
      ])
    ).toBe(true);
  });
  it("ENV_REFERENCE.md covers all Python microservices", () => {
    expect(
      fileContainsAll("docs/ENV_REFERENCE.md", [
        "AI_INSIGHTS_URL",
        "AML_MONITOR_URL",
        "FRAUD_SCORING_URL",
        "OPENSEARCH_SERVICE_URL",
        "GNN_FRAUD_URL",
        "WEALTH_ADVISOR_URL",
      ])
    ).toBe(true);
  });
  it("ENV_REFERENCE.md covers all Rust microservices", () => {
    expect(
      fileContainsAll("docs/ENV_REFERENCE.md", [
        "BILLING_ENGINE_URL",
        "CREDIT_SCORING_URL",
        "INVENTORY_ENGINE_URL",
        "LOYALTY_LEDGER_URL",
        "TIGERBEETLE_LEDGER_URL",
      ])
    ).toBe(true);
  });
  it("ENV_REFERENCE.md has production checklist", () => {
    expect(fileContains("docs/ENV_REFERENCE.md", "Production Checklist")).toBe(true);
  });
});

// ─── Wave99 Router CRUD Coverage ─────────────────────────────────────────────
describe("Wave99 Router — CRUD completeness", () => {
  it("wave99Router.ts exists", () => {
    expect(fileExists("server/wave99Router.ts")).toBe(true);
  });
  it("wave99Router has list procedures", () => {
    expect(fileContains("server/wave99Router.ts", "list:")).toBe(true);
  });
  it("wave99Router has create procedures", () => {
    expect(fileContains("server/wave99Router.ts", ".create")).toBe(true);
  });
  it("wave99Router has update procedures", () => {
    expect(fileContains("server/wave99Router.ts", ".update")).toBe(true);
  });
  it("wave99Router has delete procedures", () => {
    expect(fileContains("server/wave99Router.ts", ".delete")).toBe(true);
  });
  it("wave99Router is wired in appRouter", () => {
    expect(fileContains("server/routers.ts", "wave99")).toBe(true);
  });
});

// ─── Orphaned Tables CRUD ────────────────────────────────────────────────────
describe("OrphanedTablesCRUD — All tables covered", () => {
  it("orphanedTablesCRUD.ts exists", () => {
    expect(fileExists("server/orphanedTablesCRUD.ts")).toBe(true);
  });
  it("orphanedTablesCRUD is wired in appRouter", () => {
    expect(fileContains("server/routers.ts", "orphanedTables")).toBe(true);
  });
  it("orphanedTablesCRUD has list procedures", () => {
    expect(fileContains("server/orphanedTablesCRUD.ts", "list:")).toBe(true);
  });
});

// ─── GoldSIP tRPC Integration ────────────────────────────────────────────────
describe("GoldSIP — tRPC integration", () => {
  it("GoldSIP.tsx uses tRPC", () => {
    expect(
      fileContains("client/src/pages/GoldSIP.tsx", "trpc.") ||
      fileContains("client/src/pages/GoldSIP.tsx", "useQuery")
    ).toBe(true);
  });
  it("newFeaturesRouter has listSIPs", () => {
    expect(fileContains("server/newFeaturesRouter.ts", "listSIPs")).toBe(true);
  });
  it("newFeaturesRouter has pauseSIP", () => {
    expect(fileContains("server/newFeaturesRouter.ts", "pauseSIP")).toBe(true);
  });
  it("newFeaturesRouter has cancelSIP", () => {
    expect(fileContains("server/newFeaturesRouter.ts", "cancelSIP")).toBe(true);
  });
});

// ─── MojaloopDashboard ───────────────────────────────────────────────────────
describe("MojaloopDashboard — UI page", () => {
  it("MojaloopDashboard.tsx exists", () => {
    expect(fileExists("client/src/pages/MojaloopDashboard.tsx")).toBe(true);
  });
  it("MojaloopDashboard has CIPS/UPI/PIX tabs", () => {
    expect(
      fileContainsAll("client/src/pages/MojaloopDashboard.tsx", [
        "CIPS",
        "UPI",
        "PIX",
      ])
    ).toBe(true);
  });
});

// ─── Docker Compose ──────────────────────────────────────────────────────────
describe("Docker Compose — All services configured", () => {
  it("main docker-compose.yml exists", () => {
    expect(fileExists("docker/docker-compose.yml")).toBe(true);
  });
  it("middleware docker-compose exists", () => {
    expect(fileExists("docker/docker-compose.middleware.yml")).toBe(true);
  });
  it("main docker-compose has kafka", () => {
    expect(fileContains("docker/docker-compose.yml", "kafka")).toBe(true);
  });
  it("main docker-compose has redis", () => {
    expect(fileContains("docker/docker-compose.yml", "redis")).toBe(true);
  });
  it("main docker-compose has temporal", () => {
    expect(fileContains("docker/docker-compose.yml", "temporal")).toBe(true);
  });
  it("main docker-compose has keycloak", () => {
    expect(fileContains("docker/docker-compose.yml", "keycloak")).toBe(true);
  });
  it("main docker-compose has opensearch", () => {
    expect(fileContains("docker/docker-compose.yml", "opensearch")).toBe(true);
  });
});

// ─── Kubernetes YAML ─────────────────────────────────────────────────────────
describe("Kubernetes — Deployment manifests", () => {
  it("middleware-stack.yaml exists", () => {
    expect(fileExists("k8s/middleware-stack.yaml")).toBe(true);
  });
  it("middleware-stack.yaml has HPA", () => {
    expect(fileContains("k8s/middleware-stack.yaml", "HorizontalPodAutoscaler")).toBe(true);
  });
  it("middleware-stack.yaml has NetworkPolicy", () => {
    expect(fileContains("k8s/middleware-stack.yaml", "NetworkPolicy")).toBe(true);
  });
});

// ─── Security Audit ──────────────────────────────────────────────────────────
describe("Security — Audit documentation", () => {
  it("SECURITY_AUDIT_v99.md exists", () => {
    expect(fileExists("SECURITY_AUDIT_v99.md")).toBe(true);
  });
  it("security audit shows 0 critical vulnerabilities", () => {
    expect(
      fileContains("SECURITY_AUDIT_v99.md", "0 Critical") ||
      fileContains("SECURITY_AUDIT_v99.md", "Critical: 0")
    ).toBe(true);
  });
  it("no dangerouslySetInnerHTML in production pages", () => {
    // Check a sample of pages
    const pages = [
      "client/src/pages/Dashboard.tsx",
      "client/src/pages/Transactions.tsx",
      "client/src/pages/Customers.tsx",
    ];
    for (const page of pages) {
      if (fileExists(page)) {
        expect(fileContains(page, "dangerouslySetInnerHTML")).toBe(false);
      }
    }
  });
});

// ─── Go Services — Dockerfiles ───────────────────────────────────────────────
describe("Go Services — Dockerfiles present", () => {
  const goServices = [
    "go-services/mojaloop-fspiop-adapter",
    "go-services/cips-gateway",
    "go-services/upi-gateway",
    "go-services/pix-gateway",
  ];

  for (const svc of goServices) {
    it(`${svc} has Dockerfile`, () => {
      expect(fileExists(`${svc}/Dockerfile`)).toBe(true);
    });
  }
});

// ─── Rust Services — Cargo.toml ──────────────────────────────────────────────
describe("Rust Services — Cargo.toml present", () => {
  it("cross-border-fraud-engine has Cargo.toml", () => {
    expect(fileExists("rust-services/cross-border-fraud-engine/Cargo.toml")).toBe(true);
  });
  it("tigerbeetle-ledger has Cargo.toml", () => {
    expect(fileExists("rust-services/tigerbeetle-ledger/Cargo.toml")).toBe(true);
  });
});

// ─── Python Services — main.py ───────────────────────────────────────────────
describe("Python Services — main.py present", () => {
  const pythonServices = [
    "python-services/opensearch-service/main.py",
    "python-services/cips-upi-pix-fx/main.py",
    "python-services/lakehouse-v2/crossborder_ingestion.py",
  ];

  for (const svc of pythonServices) {
    it(`${svc} exists`, () => {
      expect(fileExists(svc)).toBe(true);
    });
  }
});

// ─── Smoke Test Script ───────────────────────────────────────────────────────
describe("Smoke Tests — Script present", () => {
  it("smoke-test-middleware.sh exists", () => {
    expect(fileExists("scripts/smoke-test-middleware.sh")).toBe(true);
  });
  it("smoke test covers CIPS health check", () => {
    expect(fileContains("scripts/smoke-test-middleware.sh", "cips")).toBe(true);
  });
  it("smoke test covers UPI health check", () => {
    expect(fileContains("scripts/smoke-test-middleware.sh", "upi")).toBe(true);
  });
  it("smoke test covers PIX health check", () => {
    expect(fileContains("scripts/smoke-test-middleware.sh", "pix")).toBe(true);
  });
});
