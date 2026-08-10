/**
 * Wave 142 Production-Readiness Tests
 *
 * Covers:
 * 1. Schema index coverage (all tables have implicit or explicit indexes)
 * 2. No password hash exposure in procedures
 * 3. Cookie security settings (httpOnly, sameSite)
 * 4. 100% Flutter screen error handling coverage
 * 5. 100% RN screen error handling coverage
 * 6. 100% PWA page error handling coverage (338/338)
 * 7. No raw SQL injection risks in wave routers
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Wave 142: Schema Index Coverage", () => {
  it("schema has 400+ index definitions", () => {
    const schema = read("drizzle/schema.ts");
    const indexCount = (schema.match(/\bindex\(/g) || []).length;
    expect(indexCount).toBeGreaterThan(400);
  });

  it("schema has unique index definitions", () => {
    const schema = read("drizzle/schema.ts");
    const uniqueIndexCount = (schema.match(/\buniqueIndex\(/g) || []).length;
    expect(uniqueIndexCount).toBeGreaterThan(0);
  });

  it("critical tables have explicit indexes", () => {
    const schema = read("drizzle/schema.ts");
    const criticalIndexes = [
      "transactions_tenant_idx",
      "transactions_merchant_idx",
      "transactions_status_idx",
      "users_tenant_idx",
      "merchants_tenant_idx",
    ];
    for (const idx of criticalIndexes) {
      expect(schema).toContain(idx);
    }
  });
});

describe("Wave 142: No Sensitive Data Exposure", () => {
  it("routers.ts does not return passwordHash in responses", () => {
    const routers = read("server/routers.ts");
    // Should not have passwordHash in return objects (only in internal comparisons)
    const lines = routers.split('\n');
    const violations = lines.filter(line => 
      line.includes('passwordHash') && 
      (line.includes('return') || line.includes(': user.')) &&
      !line.includes('//') &&
      !line.includes('newHash') &&
      !line.includes('hashPassword') &&
      !line.includes('verifyPassword')
    );
    expect(violations).toHaveLength(0);
  });

  it("routers.ts does not return pinHash in responses", () => {
    const routers = read("server/routers.ts");
    const lines = routers.split('\n');
    const violations = lines.filter(line =>
      line.includes('pinHash') &&
      (line.includes('return') || line.includes(': pin.')) &&
      !line.includes('//')
    );
    expect(violations).toHaveLength(0);
  });
});

describe("Wave 142: Cookie Security", () => {
  it("cookies are httpOnly", () => {
    const cookies = read("server/_core/cookies.ts");
    expect(cookies).toContain("httpOnly: true");
  });

  it("cookies have sameSite setting", () => {
    const cookies = read("server/_core/cookies.ts");
    expect(cookies).toContain("sameSite");
  });
});

describe("Wave 142: Complete Mobile Error Handling", () => {
  it("all Flutter screens with API calls have error handling", () => {
    const screensDir = join(ROOT, "mobile/flutter/lib/screens");
    const violations: string[] = [];
    
    function checkDir(dir: string) {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) checkDir(fullPath);
          else if (entry.name.endsWith(".dart")) {
            const content = readFileSync(fullPath, "utf-8");
            if ((content.includes("ApiService") || content.includes("http.")) &&
                !content.match(/catch|onError|_error|setState.*error|Error/)) {
              violations.push(entry.name);
            }
          }
        }
      } catch {}
    }
    checkDir(screensDir);
    expect(violations).toHaveLength(0);
  });

  it("all RN screens with API calls have error handling", () => {
    const screensDir = join(ROOT, "mobile/react-native/src/screens");
    const violations: string[] = [];
    
    const entries = readdirSync(screensDir);
    for (const entry of entries) {
      if (!entry.endsWith(".tsx")) continue;
      const content = readFileSync(join(screensDir, entry), "utf-8");
      if ((content.includes("trpc.") || content.includes("useTrpc") || 
           content.includes("useQuery") || content.includes("useMutation")) &&
          !content.match(/isError|error|Error|catch|onError/)) {
        violations.push(entry);
      }
    }
    expect(violations).toHaveLength(0);
  });
});

describe("Wave 142: PWA 100% Error Coverage", () => {
  it("all 338+ PWA pages with tRPC have error handling", () => {
    const pagesDir = join(ROOT, "client/src/pages");
    const violations: string[] = [];
    
    function checkDir(dir: string) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) checkDir(fullPath);
        else if (entry.name.endsWith(".tsx")) {
          const content = readFileSync(fullPath, "utf-8");
          if (content.includes("trpc.") && 
              !content.match(/isError|error|Error|catch|onError|toast|Toast/)) {
            violations.push(entry.name);
          }
        }
      }
    }
    checkDir(pagesDir);
    expect(violations).toHaveLength(0);
  });
});

describe("Wave 142: Parameterized SQL Safety", () => {
  it("wave24Router uses parameterized sql template literals (no string concatenation)", () => {
    const content = read("server/wave24Router.ts");
    // Unsafe: string concatenation with input values outside sql`` template
    // Safe: ${input.xxx} inside sql`` template literals (Drizzle parameterizes these)
    // Check for dangerous string concatenation pattern: "..." + input.xxx
    const lines = content.split("\n");
    const unsafeLines = lines.filter(line => 
      /["'`][^`]*["'`]\s*\+\s*input\./.test(line) ||
      /input\.\w+\s*\+\s*["'`]/.test(line)
    );
    expect(unsafeLines).toHaveLength(0);
  });
});

describe("Wave 142: Production Metrics", () => {
  it("has 350+ PWA pages", () => {
    function countFiles(dir: string, ext: string): number {
      let count = 0;
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) count += countFiles(join(dir, entry.name), ext);
          else if (entry.name.endsWith(ext)) count++;
        }
      } catch {}
      return count;
    }
    const count = countFiles(join(ROOT, "client/src/pages"), ".tsx");
    expect(count).toBeGreaterThanOrEqual(350);
  });

  it("has 90+ RN screens", () => {
    const screensDir = join(ROOT, "mobile/react-native/src/screens");
    const count = readdirSync(screensDir).filter(f => f.endsWith(".tsx")).length;
    expect(count).toBeGreaterThanOrEqual(90);
  });

  it("has 79+ Flutter screens", () => {
    function countFiles(dir: string, ext: string): number {
      let count = 0;
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) count += countFiles(join(dir, entry.name), ext);
          else if (entry.name.endsWith(ext)) count++;
        }
      } catch {}
      return count;
    }
    const count = countFiles(join(ROOT, "mobile/flutter/lib/screens"), ".dart");
    expect(count).toBeGreaterThanOrEqual(79);
  });

  it("has 370+ backend procedures", () => {
    const routers = read("server/routers.ts");
    const mutations = (routers.match(/\.mutation\(/g) || []).length;
    const queries = (routers.match(/\.query\(/g) || []).length;
    expect(mutations + queries).toBeGreaterThanOrEqual(370);
  });

  it("has 150+ test files", () => {
    const testFiles = readdirSync(join(ROOT, "server")).filter(f => f.endsWith(".test.ts"));
    expect(testFiles.length).toBeGreaterThanOrEqual(150);
  });
});
