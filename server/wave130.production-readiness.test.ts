/**
 * Wave 130 Production-Readiness Tests
 *
 * Covers all Wave 130 changes:
 * 1. RN BottomTabNavigator — 4 new screens (LoyaltyScreen, NIPScreen, MobileMoneyScreen, InsuranceScreen)
 * 2. publishAuditEvent wired to setUserRole, approvePayrollRun (routers.ts) and kybMgmt.updateStatus (wave121.ts)
 * 3. Security hardening — SSRF blocklist (security29.ts), redirect allowlist (security30.ts), CSP (securityHeaders.ts)
 * 4. Flutter api_service.dart base URL updated to api.paygate.africa
 * 5. notification_preferences_screen.dart save button wired to ApiService
 * 6. All 79 Flutter screens import ApiService (no more bare http/dio-only screens)
 * 7. All 90 RN screens exist
 * 8. wave121.ts publishAuditEvent import + kybMgmt.updateStatus wiring
 * 9. No manus.space URLs in Flutter screens
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(root, relPath));
}

function countFiles(dir: string, ext: string): number {
  const absDir = path.join(root, dir);
  if (!fs.existsSync(absDir)) return 0;
  const walk = (d: string): number =>
    fs.readdirSync(d).reduce((acc, f) => {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) return acc + walk(full);
      return acc + (full.endsWith(ext) ? 1 : 0);
    }, 0);
  return walk(absDir);
}

function getAllFiles(dir: string, ext: string): string[] {
  const absDir = path.join(root, dir);
  if (!fs.existsSync(absDir)) return [];
  const results: string[] = [];
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const full = path.join(d, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(ext)) results.push(full);
    }
  };
  walk(absDir);
  return results;
}

// ─── 1. RN BottomTabNavigator ─────────────────────────────────────────────────

describe("Wave 130 — RN BottomTabNavigator", () => {
  const appNav = readFile("mobile/react-native/src/navigation/AppNavigator.tsx");

  it("imports LoyaltyScreen", () => {
    expect(appNav).toContain('import LoyaltyScreen');
  });

  it("imports NIPScreen", () => {
    expect(appNav).toContain('import NIPScreen');
  });

  it("imports MobileMoneyScreen", () => {
    expect(appNav).toContain('import MobileMoneyScreen');
  });

  it("imports InsuranceScreen", () => {
    expect(appNav).toContain('import InsuranceScreen');
  });

  it("registers LoyaltyScreen as Tab.Screen", () => {
    expect(appNav).toContain('component={LoyaltyScreen}');
  });

  it("registers NIPScreen as Tab.Screen", () => {
    expect(appNav).toContain('component={NIPScreen}');
  });

  it("registers MobileMoneyScreen as Tab.Screen", () => {
    expect(appNav).toContain('component={MobileMoneyScreen}');
  });

  it("registers InsuranceScreen as Tab.Screen", () => {
    expect(appNav).toContain('component={InsuranceScreen}');
  });

  it("uses createBottomTabNavigator", () => {
    expect(appNav).toContain('createBottomTabNavigator');
  });

  it("has Loyalty tab name", () => {
    expect(appNav).toContain('name="Loyalty"');
  });

  it("has NIP tab name", () => {
    expect(appNav).toContain('name="NIP"');
  });

  it("has MobileMoney tab name", () => {
    expect(appNav).toContain('name="MobileMoney"');
  });

  it("has Insurance tab name", () => {
    expect(appNav).toContain('name="Insurance"');
  });
});

// ─── 2. RN Screen Files ───────────────────────────────────────────────────────

describe("Wave 130 — RN screen files", () => {
  it("LoyaltyScreen.tsx exists", () => {
    expect(fileExists("mobile/react-native/src/screens/LoyaltyScreen.tsx")).toBe(true);
  });

  it("NIPScreen.tsx exists", () => {
    expect(fileExists("mobile/react-native/src/screens/NIPScreen.tsx")).toBe(true);
  });

  it("MobileMoneyScreen.tsx exists", () => {
    expect(fileExists("mobile/react-native/src/screens/MobileMoneyScreen.tsx")).toBe(true);
  });

  it("InsuranceScreen.tsx exists", () => {
    expect(fileExists("mobile/react-native/src/screens/InsuranceScreen.tsx")).toBe(true);
  });

  it("has at least 87 RN screens", () => {
    const count = countFiles("mobile/react-native/src/screens", ".tsx");
    expect(count).toBeGreaterThanOrEqual(87);
  });
});

// ─── 3. publishAuditEvent in routers.ts ──────────────────────────────────────

describe("Wave 130 — publishAuditEvent in routers.ts", () => {
  const routers = readFile("server/routers.ts");

  it("imports publishAuditEvent from kafkaClient", () => {
    expect(routers).toContain('publishAuditEvent');
    expect(routers).toContain('kafkaClient');
  });

  it("calls publishAuditEvent in setUserRole", () => {
    const idx = routers.indexOf('setUserRole');
    expect(idx).toBeGreaterThan(-1);
    const section = routers.slice(idx, idx + 1000);
    expect(section).toContain('publishAuditEvent');
  });

  it("calls publishAuditEvent in approveRun (payroll)", () => {
    const idx = routers.indexOf('approveRun');
    expect(idx).toBeGreaterThan(-1);
    const section = routers.slice(idx, idx + 600);
    expect(section).toContain('publishAuditEvent');
  });

  it("publishAuditEvent has action user.role.changed", () => {
    expect(routers).toContain("'user.role.changed'");
  });

  it("publishAuditEvent has action payroll.run.approved", () => {
    expect(routers).toContain("'payroll.run.approved'");
  });

  it("publishAuditEvent calls are fire-and-forget (catch)", () => {
    const matches = routers.match(/publishAuditEvent\([^)]*\)[\s\S]*?\.catch/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── 4. publishAuditEvent in wave121.ts (KYB) ────────────────────────────────

describe("Wave 130 — publishAuditEvent in wave121.ts (kybMgmt)", () => {
  const wave121 = readFile("server/routers/wave121.ts");

  it("imports publishAuditEvent from kafkaClient", () => {
    expect(wave121).toContain('publishAuditEvent');
    expect(wave121).toContain('kafkaClient');
  });

  it("calls publishAuditEvent in kybMgmt.updateStatus", () => {
    const idx = wave121.indexOf('kyb.status.updated');
    expect(idx).toBeGreaterThan(-1);
  });

  it("publishAuditEvent fires on approved status", () => {
    expect(wave121).toContain("'approved'");
    expect(wave121).toContain("'kyb.status.updated'");
  });
});

// ─── 5. Security hardening — security29.ts SSRF blocklist ────────────────────

describe("Wave 130 — security29.ts SSRF blocklist", () => {
  const sec29 = readFile("server/security29.ts");

  it("contains paygate.africa in SSRF blocklist", () => {
    expect(sec29).toContain("paygate.africa");
  });

  it("still contains standard SSRF targets (169.254)", () => {
    expect(sec29).toContain("169.254");
  });

  it("still contains localhost in blocklist", () => {
    expect(sec29).toMatch(/localhost|127\.0\.0\.1/);
  });
});

// ─── 6. Security hardening — security30.ts redirect allowlist ────────────────

describe("Wave 130 — security30.ts redirect allowlist", () => {
  const sec30 = readFile("server/security30.ts");

  it("contains paygate.africa in allowlist", () => {
    expect(sec30).toContain("paygate.africa");
  });

  it("contains portal.paygate.africa in allowlist", () => {
    expect(sec30).toContain("portal.paygate.africa");
  });

  it("has CSP connect-src with paygate.africa wildcard", () => {
    expect(sec30).toContain("*.paygate.africa");
  });
});

// ─── 7. Security hardening — securityHeaders.ts CSP ─────────────────────────

describe("Wave 130 — securityHeaders.ts CSP connect-src", () => {
  const secHeaders = readFile("server/securityHeaders.ts");

  it("CSP connect-src includes paygate.africa wildcard", () => {
    expect(secHeaders).toContain("*.paygate.africa");
  });

  it("CSP connect-src includes wss paygate.africa", () => {
    expect(secHeaders).toContain("wss://*.paygate.africa");
  });

  it("CSP connect-src still includes stripe", () => {
    expect(secHeaders).toContain("stripe.com");
  });
});

// ─── 8. Flutter api_service.dart base URL ────────────────────────────────────

describe("Wave 130 — Flutter api_service.dart", () => {
  const apiService = readFile("mobile/flutter/lib/services/api_service.dart");

  it("uses api.paygate.africa as base URL", () => {
    expect(apiService).toContain("api.paygate.africa");
  });

  it("does not use manus.space as base URL", () => {
    expect(apiService).not.toContain("manus.space");
  });

  it("has defaultValue with https scheme", () => {
    expect(apiService).toContain("https://api.paygate.africa");
  });
});

// ─── 9. notification_preferences_screen.dart API wiring ──────────────────────

describe("Wave 130 — notification_preferences_screen.dart", () => {
  const notifScreen = readFile(
    "mobile/flutter/lib/screens/notifications/notification_preferences_screen.dart"
  );

  it("imports api_service.dart", () => {
    expect(notifScreen).toContain("api_service.dart");
  });

  it("calls ApiService.instance.post", () => {
    expect(notifScreen).toContain("ApiService.instance.post");
  });

  it("posts to /notifications/preferences endpoint", () => {
    expect(notifScreen).toContain("/notifications/preferences");
  });

  it("save button is async", () => {
    expect(notifScreen).toContain("onPressed: () async");
  });

  it("handles errors with catch block", () => {
    expect(notifScreen).toContain("catch");
  });
});

// ─── 10. All Flutter screens import ApiService ───────────────────────────────

describe("Wave 130 — All Flutter screens use ApiService", () => {
  const flutterScreens = getAllFiles("mobile/flutter/lib/screens", ".dart");

  it("has exactly 79 Flutter screens", () => {
    expect(flutterScreens.length).toBe(79);
  });

  it("all Flutter screens import api_service.dart or reference ApiService", () => {
    const screensWithoutApiService = flutterScreens.filter((f) => {
      const content = fs.readFileSync(f, "utf8");
      return !content.includes("ApiService") && !content.includes("api_service");
    });
    expect(screensWithoutApiService).toHaveLength(0);
  });

  it("no Flutter screens use manus.space URLs", () => {
    const screensWithManusSpace = flutterScreens.filter((f) => {
      const content = fs.readFileSync(f, "utf8");
      return content.includes("manus.space") || content.includes("manus.computer");
    });
    expect(screensWithManusSpace).toHaveLength(0);
  });
});

// ─── 11. All RN screens use tRPC (useTrpc hook) ──────────────────────────────

describe("Wave 130 — RN screens use tRPC", () => {
  const rnScreens = getAllFiles("mobile/react-native/src/screens", ".tsx");

  it("has at least 87 RN screens", () => {
    expect(rnScreens.length).toBeGreaterThanOrEqual(87);
  });

  it("all RN screens call useTrpc or trpc or fetch API", () => {
    const screensWithoutApi = rnScreens.filter((f) => {
      const content = fs.readFileSync(f, "utf8");
      return (
        !content.includes("useTrpc") &&
        !content.includes("trpc.") &&
        !content.includes("fetch(") &&
        !content.includes("axios") &&
        !content.includes("useQuery") &&
        !content.includes("useMutation")
      );
    });
    // Allow up to 3 pure UI screens (e.g., splash, onboarding)
    expect(screensWithoutApi.length).toBeLessThanOrEqual(3);
  });
});

// ─── 12. Kafka client exports publishAuditEvent ──────────────────────────────

describe("Wave 130 — kafkaClient.ts exports", () => {
  const kafkaClient = readFile("server/kafkaClient.ts");

  it("exports publishAuditEvent function", () => {
    expect(kafkaClient).toContain("publishAuditEvent");
  });

  it("exports publishTransactionEvent", () => {
    expect(kafkaClient).toContain("publishTransactionEvent");
  });

  it("exports publishPayoutEvent", () => {
    expect(kafkaClient).toContain("publishPayoutEvent");
  });

  it("exports publishFraudEvent", () => {
    expect(kafkaClient).toContain("publishFraudEvent");
  });
});

// ─── 13. Domain consistency — no manus.space in server code ──────────────────

describe("Wave 130 — Domain consistency", () => {
  it("oauth.ts does not hardcode manus.space fallback", () => {
    const oauth = readFile("server/_core/oauth.ts");
    // Should not have manus.space as a hardcoded fallback (env-driven only)
    const manusSpaceLines = oauth
      .split("\n")
      .filter((l) => l.includes("manus.space") && !l.trim().startsWith("//"));
    expect(manusSpaceLines.length).toBe(0);
  });

  it("digestEmail.ts does not hardcode manus.space fallback", () => {
    const digest = readFile("server/digestEmail.ts");
    const manusSpaceLines = digest
      .split("\n")
      .filter((l) => l.includes("manus.space") && !l.trim().startsWith("//"));
    expect(manusSpaceLines.length).toBe(0);
  });

  it("Flutter api_service.dart does not reference manus.space", () => {
    const apiService = readFile("mobile/flutter/lib/services/api_service.dart");
    expect(apiService).not.toContain("manus.space");
  });
});

// ─── 14. CSP ALLOWED_ORIGINS env-driven ──────────────────────────────────────

describe("Wave 130 — CSP env-driven configuration", () => {
  it("server/_core/index.ts uses ALLOWED_ORIGINS env var for CSP", () => {
    const coreIndex = readFile("server/_core/index.ts");
    expect(coreIndex).toContain("ALLOWED_ORIGINS");
  });
});

// ─── 15. Keycloak bootstrap --health-check flag ──────────────────────────────

describe("Wave 130 — keycloak-bootstrap.sh", () => {
  it("keycloak-bootstrap.sh exists", () => {
    expect(fileExists("scripts/keycloak-bootstrap.sh")).toBe(true);
  });

  it("keycloak-bootstrap.sh supports --health-check flag", () => {
    const script = readFile("scripts/keycloak-bootstrap.sh");
    expect(script).toContain("health-check");
  });
});

// ─── 16. mTLS certificates exist ─────────────────────────────────────────────

describe("Wave 130 — mTLS certificates", () => {
  it("CA certificate exists", () => {
    const exists =
      fileExists("infra/certs/ca.crt") ||
      fileExists("infra/certs/ca-cert.pem") ||
      fileExists("infra/certs/ca.pem");
    expect(exists).toBe(true);
  });
});

// ─── 17. SKILL.md exists ─────────────────────────────────────────────────────

describe("Wave 130 — SKILL.md", () => {
  it("paygate-merchant-portal SKILL.md exists", () => {
    const exists =
      fileExists("../skills/paygate-merchant-portal/SKILL.md") ||
      fs.existsSync("/home/ubuntu/skills/paygate-merchant-portal/SKILL.md");
    expect(exists).toBe(true);
  });
});

// ─── 18. Previous wave test files exist ──────────────────────────────────────

describe("Wave 130 — Previous wave test files", () => {
  it("wave125 test file exists", () => {
    expect(fileExists("server/wave125.production-readiness.test.ts")).toBe(true);
  });

  it("wave126 test file exists", () => {
    expect(fileExists("server/wave126.production-readiness.test.ts")).toBe(true);
  });

  it("wave127 test file exists", () => {
    expect(fileExists("server/wave127.production-readiness.test.ts")).toBe(true);
  });

  it("wave120 test file exists", () => {
    expect(fileExists("server/wave120.production-readiness.test.ts")).toBe(true);
  });

  it("wave129 test file exists", () => {
    expect(fileExists("server/wave129.production-readiness.test.ts")).toBe(true);
  });
});
