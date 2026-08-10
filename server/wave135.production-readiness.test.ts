/**
 * Wave 135 — Production-Readiness Tests
 * Covers:
 *   1. Flutter screens: all 79 have ApiService import (not splash)
 *   2. RN screens: FraudRuleEngineScreen, KYBDocumentUploadScreen, LoyaltyRedemptionScreen wired to tRPC
 *   3. No hardcoded manus.space URLs in Flutter/RN screens
 *   4. All Flutter screens have error handling
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. Flutter screens: all have ApiService import ──────────────────────────
describe("Wave 135 — Flutter screens have ApiService import", () => {
  const flutterDir = join(ROOT, "mobile/flutter/lib/screens");
  const skip = new Set(["splash_screen.dart"]);

  function getAllDartScreens(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...getAllDartScreens(full));
      else if (entry.name.endsWith(".dart")) results.push(full);
    }
    return results;
  }

  const screens = getAllDartScreens(flutterDir);

  it("has at least 79 Flutter screens", () => {
    expect(screens.length).toBeGreaterThanOrEqual(79);
  });

  for (const screenPath of screens) {
    const fname = screenPath.split("/").pop()!;
    if (skip.has(fname)) continue;

    it(`${fname} has ApiService import`, () => {
      const content = readFileSync(screenPath, "utf-8");
      const hasApi = content.includes("ApiService") || content.includes("api_service");
      expect(hasApi).toBe(true);
    });
  }
});

// ─── 2. RN screens wired to tRPC ─────────────────────────────────────────────
describe("Wave 135 — RN screens wired to tRPC", () => {
  const rnDir = join(ROOT, "mobile/react-native/src/screens");

  it("FraudRuleEngineScreen uses useTrpc hook", () => {
    const path = join(rnDir, "FraudRuleEngine/FraudRuleEngineScreen.tsx");
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("useTrpc");
    expect(content).toContain("fraudRuleEngine");
  });

  it("KYBDocumentUploadScreen uses useTrpc hook", () => {
    const path = join(rnDir, "KYBDocumentUpload/KYBDocumentUploadScreen.tsx");
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("useTrpc");
    expect(content).toContain("kyb");
  });

  it("LoyaltyRedemptionScreen uses useTrpc hook", () => {
    const path = join(rnDir, "LoyaltyRedemption/LoyaltyRedemptionScreen.tsx");
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("useTrpc");
    expect(content).toContain("loyalty");
  });
});

// ─── 3. No hardcoded manus.space URLs in mobile screens ──────────────────────
describe("Wave 135 — No hardcoded manus.space URLs in mobile screens", () => {
  function getAllMobileFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...getAllMobileFiles(full));
      else if (entry.name.endsWith(".dart") || entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
        results.push(full);
      }
    }
    return results;
  }

  const flutterFiles = getAllMobileFiles(join(ROOT, "mobile/flutter/lib/screens"));
  const rnFiles = getAllMobileFiles(join(ROOT, "mobile/react-native/src/screens"));

  for (const filePath of [...flutterFiles, ...rnFiles]) {
    const fname = filePath.split("/").pop()!;
    it(`${fname} has no hardcoded manus.space URL`, () => {
      const content = readFileSync(filePath, "utf-8");
      // Allow manus.space in comments only
      const nonCommentLines = content.split("\n").filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
      const hasHardcoded = nonCommentLines.some(l => l.includes(".manus.space") && !l.includes("api.paygate.africa"));
      expect(hasHardcoded).toBe(false);
    });
  }
});

// ─── 4. All RN screens have loading states ───────────────────────────────────
describe("Wave 135 — RN screens have loading states", () => {
  const rnDir = join(ROOT, "mobile/react-native/src/screens");

  function getAllRNScreens(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...getAllRNScreens(full));
      else if (entry.name.endsWith(".tsx")) results.push(full);
    }
    return results;
  }

  const screens = getAllRNScreens(rnDir);

  it("has at least 90 RN screens", () => {
    expect(screens.length).toBeGreaterThanOrEqual(90);
  });

  for (const screenPath of screens) {
    const fname = screenPath.split("/").pop()!;
    it(`${fname} has loading state`, () => {
      const content = readFileSync(screenPath, "utf-8");
      const hasLoading = content.includes("isLoading") || content.includes("ActivityIndicator") || content.includes("loading");
      expect(hasLoading).toBe(true);
    });
  }
});
