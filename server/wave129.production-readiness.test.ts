/**
 * Wave 129 Production-Readiness Tests
 * Covers: CSP ALLOWED_ORIGINS, keycloak-bootstrap health-check, mTLS certs,
 *         RN mobile parity (16 new screens), Kafka publishAuditEvent import,
 *         middleware integration counts, seed script coverage, WAFAlertDashboard sync fix.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "server");
const CLIENT = path.join(ROOT, "client", "src");
const RN_SCREENS = path.join(ROOT, "mobile", "react-native", "src", "screens");
const RN_NAV = path.join(ROOT, "mobile", "react-native", "src", "navigation", "AppNavigator.tsx");
const SCRIPTS = path.join(ROOT, "scripts");
const INFRA_CERTS = path.join(ROOT, "infra", "certs");

// ─── Helper ──────────────────────────────────────────────────────────────────
function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}
function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// ─── 1. CSP ALLOWED_ORIGINS ──────────────────────────────────────────────────
describe("Wave 129 — CSP ALLOWED_ORIGINS", () => {
  const indexTs = path.join(SERVER, "_core", "index.ts");

  // STALE CONTRACT: CSP/CORS moved out of _core/index.ts into
  // server/securityHeaders.ts (ALLOWED_ORIGINS env drives CORS origins; CSP
  // directives live in the same module).
  it("securityHeaders.ts CSP present and ALLOWED_ORIGINS env-driven", () => {
    const content = readFile(path.join(SERVER, "securityHeaders.ts"));
    expect(content).toMatch(/ALLOWED_ORIGINS/);
    expect(content).toContain("process.env.ALLOWED_ORIGINS");
    expect(content).toMatch(/connect-src 'self'/);
  });

  it("index.ts CSP does not hardcode manus.space wildcard", () => {
    const content = readFile(indexTs);
    // Should not have *.manus.space as a literal string (env-driven is OK)
    expect(content).not.toMatch(/\*\.manus\.space/);
  });

  it("index.ts CSP does not hardcode manus.computer wildcard", () => {
    const content = readFile(indexTs);
    expect(content).not.toMatch(/\*\.manus\.computer/);
  });
});

// ─── 2. Keycloak Bootstrap Health Check ──────────────────────────────────────
describe("Wave 129 — Keycloak Bootstrap Health Check", () => {
  const bootstrapSh = path.join(SCRIPTS, "keycloak-bootstrap.sh");

  it("keycloak-bootstrap.sh exists", () => {
    expect(fileExists(bootstrapSh)).toBe(true);
  });

  it("keycloak-bootstrap.sh has health-check flag support", () => {
    const content = readFile(bootstrapSh);
    expect(content).toMatch(/health.check|health_check/i);
  });

  it("keycloak-bootstrap.sh checks Keycloak realm reachability", () => {
    const content = readFile(bootstrapSh);
    // Should have curl or wget call to check Keycloak
    expect(content).toMatch(/curl|wget/);
  });
});

// ─── 3. mTLS Certificates ────────────────────────────────────────────────────
describe("Wave 129 — mTLS Certificates", () => {
  it("infra/certs directory exists", () => {
    expect(fileExists(INFRA_CERTS)).toBe(true);
  });

  it("CA certificate exists", () => {
    const caCert = path.join(INFRA_CERTS, "ca.crt");
    expect(fileExists(caCert)).toBe(true);
  });

  it("server certificate exists", () => {
    const serverCert = path.join(INFRA_CERTS, "server.crt");
    expect(fileExists(serverCert)).toBe(true);
  });

  it("client certificate exists", () => {
    const clientCert = path.join(INFRA_CERTS, "client.crt");
    expect(fileExists(clientCert)).toBe(true);
  });

  it("CA cert is valid PEM format", () => {
    const caCert = readFile(path.join(INFRA_CERTS, "ca.crt"));
    expect(caCert).toMatch(/-----BEGIN CERTIFICATE-----/);
    expect(caCert).toMatch(/-----END CERTIFICATE-----/);
  });

  it("server cert is valid PEM format", () => {
    const serverCert = readFile(path.join(INFRA_CERTS, "server.crt"));
    expect(serverCert).toMatch(/-----BEGIN CERTIFICATE-----/);
    expect(serverCert).toMatch(/-----END CERTIFICATE-----/);
  });

  it("client cert is valid PEM format", () => {
    const clientCert = readFile(path.join(INFRA_CERTS, "client.crt"));
    expect(clientCert).toMatch(/-----BEGIN CERTIFICATE-----/);
    expect(clientCert).toMatch(/-----END CERTIFICATE-----/);
  });
});

// ─── 4. React Native Mobile Parity ───────────────────────────────────────────
describe("Wave 129 — React Native Mobile Parity (16 new screens)", () => {
  const newScreens = [
    "AdminOverviewScreen.tsx",
    "AIHubScreen.tsx",
    "AuthScreen.tsx",
    "BillingScreen.tsx",
    "CryptoScreen.tsx",
    "EscrowScreen.tsx",
    "InsuranceScreen.tsx",
    "KYBDocumentUploadScreen.tsx",
    "LoyaltyScreen.tsx",
    "MobileMoneyScreen.tsx",
    "NIPScreen.tsx",
    "POSScreen.tsx",
    "ProfileScreen.tsx",
    "SIPScreen.tsx",
    "TeamScreen.tsx",
    "USSDScreen.tsx",
  ];

  newScreens.forEach((screenFile) => {
    it(`${screenFile} exists`, () => {
      expect(fileExists(path.join(RN_SCREENS, screenFile))).toBe(true);
    });

    it(`${screenFile} is a valid React Native component`, () => {
      const content = readFile(path.join(RN_SCREENS, screenFile));
      expect(content).toMatch(/import React/);
      expect(content).toMatch(/StyleSheet\.create/);
      expect(content).toMatch(/export default/);
    });
  });

  it("AppNavigator registers all 16 new screens", () => {
    const navContent = readFile(RN_NAV);
    newScreens.forEach((screenFile) => {
      const screenName = screenFile.replace(".tsx", "");
      expect(navContent).toContain(screenName);
    });
  });

  it("AppNavigator has at least 34 Stack.Screen registrations", () => {
    const navContent = readFile(RN_NAV);
    const matches = navContent.match(/Stack\.Screen/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(34);
  });

  it("RootStackParamList includes all 16 new screen types", () => {
    const navContent = readFile(RN_NAV);
    expect(navContent).toContain("AdminOverview: undefined");
    expect(navContent).toContain("AIHub: undefined");
    expect(navContent).toContain("Auth: undefined");
    expect(navContent).toContain("Crypto: undefined");
    expect(navContent).toContain("Escrow: undefined");
    expect(navContent).toContain("USSD: undefined");
  });

  it("total RN screen count is at least 85 (including subdirectory screens)", () => {
    // Count .tsx files in screens dir + subdirectory screens
    const topLevel = fs.readdirSync(RN_SCREENS).filter((f) => f.endsWith(".tsx"));
    const subDirs = fs.readdirSync(RN_SCREENS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => fs.readdirSync(path.join(RN_SCREENS, d.name)).filter((f) => f.endsWith(".tsx")));
    expect(topLevel.length + subDirs.length).toBeGreaterThanOrEqual(85);
  });
});

// ─── 5. Kafka publishAuditEvent ───────────────────────────────────────────────
describe("Wave 129 — Kafka publishAuditEvent Integration", () => {
  const kafkaClient = path.join(SERVER, "kafkaClient.ts");
  const routersTs = path.join(SERVER, "routers.ts");

  it("kafkaClient.ts exports publishAuditEvent", () => {
    const content = readFile(kafkaClient);
    expect(content).toMatch(/export.*function.*publishAuditEvent|export async function publishAuditEvent/);
  });

  it("routers.ts imports publishAuditEvent from kafkaClient", () => {
    const content = readFile(routersTs);
    expect(content).toMatch(/publishAuditEvent/);
    expect(content).toMatch(/from.*kafkaClient/);
  });

  it("routers.ts imports publishTransactionEvent", () => {
    const content = readFile(routersTs);
    expect(content).toMatch(/publishTransactionEvent/);
  });

  it("routers.ts imports publishPayoutEvent", () => {
    const content = readFile(routersTs);
    expect(content).toMatch(/publishPayoutEvent/);
  });

  it("routers.ts imports publishFraudEvent", () => {
    const content = readFile(routersTs);
    expect(content).toMatch(/publishFraudEvent/);
  });
});

// ─── 6. Middleware Integration Counts ────────────────────────────────────────
describe("Wave 129 — Middleware Integration Coverage", () => {
  function countOccurrences(dir: string, pattern: RegExp, ext = ".ts"): number {
    let count = 0;
    function walk(d: string) {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node_modules") continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(ext) && !entry.name.includes(".test.")) {
          const content = fs.readFileSync(full, "utf-8");
          const matches = content.match(pattern) ?? [];
          count += matches.length;
        }
      }
    }
    walk(dir);
    return count;
  }

  it("Temporal workflow calls exist in server code (≥25)", () => {
    const count = countOccurrences(SERVER, /startWorkflow|triggerWorkflow|temporal/gi);
    expect(count).toBeGreaterThanOrEqual(25);
  });

  it("TigerBeetle calls exist in server code (≥50)", () => {
    const count = countOccurrences(SERVER, /tigerbeetle|TigerBeetle|TIGERBEETLE/g);
    expect(count).toBeGreaterThanOrEqual(50);
  });

  it("Permify calls exist in server code (≥80)", () => {
    const count = countOccurrences(SERVER, /permify|Permify|PERMIFY/g);
    expect(count).toBeGreaterThanOrEqual(80);
  });

  it("Mojaloop calls exist in server code (≥40)", () => {
    const count = countOccurrences(SERVER, /mojaloop|Mojaloop|MOJALOOP/g);
    expect(count).toBeGreaterThanOrEqual(40);
  });

  it("OpenSearch calls exist in server code (≥20)", () => {
    const count = countOccurrences(SERVER, /openSearch|OpenSearch|opensearch/g);
    expect(count).toBeGreaterThanOrEqual(20);
  });
});

// ─── 7. WAFAlertDashboard DB Sync Fix ────────────────────────────────────────
describe("Wave 129 — WAFAlertDashboard DB Sync", () => {
  const wafPage = path.join(CLIENT, "pages", "WAFAlertDashboard.tsx");

  it("WAFAlertDashboard.tsx exists", () => {
    expect(fileExists(wafPage)).toBe(true);
  });

  // STALE CONTRACT: the manual useEffect/setEvents DB-sync was replaced by a
  // declarative trpc.wafAlerts.list.useQuery (React Query owns the sync).
  it("WAFAlertDashboard.tsx syncs DB events via the wafAlerts tRPC query", () => {
    const content = readFile(wafPage);
    expect(content).toMatch(/trpc\.wafAlerts\.list\.useQuery/);
    expect(content).toMatch(/wafAlertsData/);
  });

  it("WAFAlertDashboard.tsx uses tRPC wafAlerts query", () => {
    const content = readFile(wafPage);
    expect(content).toMatch(/trpc\.|wafAlerts/);
  });
});

// ─── 8. Seed Script Coverage ─────────────────────────────────────────────────
describe("Wave 129 — Seed Script Coverage", () => {
  it("seed-all.sh exists", () => {
    expect(fileExists(path.join(SCRIPTS, "seed-all.sh"))).toBe(true);
  });

  it("seed-all.mjs exists", () => {
    expect(fileExists(path.join(SCRIPTS, "seed-all.mjs"))).toBe(true);
  });

  it("seed-production-data.mjs exists", () => {
    expect(fileExists(path.join(SCRIPTS, "seed-production-data.mjs"))).toBe(true);
  });

  it("drizzle/seed.ts exists", () => {
    expect(fileExists(path.join(ROOT, "drizzle", "seed.ts"))).toBe(true);
  });

  it("at least 15 seed scripts exist", () => {
    const seedFiles = fs.readdirSync(SCRIPTS).filter((f) => f.startsWith("seed-"));
    expect(seedFiles.length).toBeGreaterThanOrEqual(15);
  });
});

// ─── 9. No Hardcoded Secrets ─────────────────────────────────────────────────
describe("Wave 129 — No Hardcoded Secrets in Client", () => {
  const loginPage = path.join(CLIENT, "pages", "Login.tsx");

  it("Login.tsx does not have hardcoded password in initial state", () => {
    const content = readFile(loginPage);
    // Should not have password: "demo123" or similar hardcoded values in useState
    expect(content).not.toMatch(/useState\(\s*["']demo\d{3,}["']\s*\)/);
    expect(content).not.toMatch(/password:\s*["']demo\d{3,}["']/);
  });
});

// ─── 10. SKILL.md ────────────────────────────────────────────────────────────
// STALE CONTRACT: the out-of-repo /home/ubuntu/skills/paygate-merchant-portal/SKILL.md
// artifact no longer exists; platform docs now live in docs/ inside the
// repository (same contract as wave131.production-hardening.test.ts).
describe("Wave 129 — Platform documentation", () => {
  const archDoc = path.join(ROOT, "docs", "ARCHITECTURE.md");

  it("docs/ARCHITECTURE.md exists", () => {
    expect(fileExists(archDoc)).toBe(true);
  });

  it("docs/ARCHITECTURE.md has meaningful content (>500 chars)", () => {
    const content = readFile(archDoc);
    expect(content.length).toBeGreaterThan(500);
  });

  it("docs/ARCHITECTURE.md describes the PayGate platform", () => {
    const content = readFile(archDoc);
    expect(content.toLowerCase()).toMatch(/paygate|merchant|portal/);
  });
});
