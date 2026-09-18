/**
 * SQL-injection regression guards (P0-10, 2026-05 security remediation).
 *
 * The audited vulnerabilities were `sql.raw(...)` calls with directly
 * interpolated request input (e.g. wave27Router.ts updateTenantLimits and
 * audit CSV export, wave28Router.ts updateTenantBranding, wave29Router.ts
 * chargeback list / rate-limit dashboard, scumlExpiryJob.ts id array).
 * drizzle's sql.raw performs no parameter binding, so those queries were
 * simultaneously injectable and broken ($1 placeholders never bound).
 *
 * These guards statically assert the vulnerable patterns do not return:
 *  1. No `sql.raw(` anywhere in the remediated files.
 *  2. No string-concatenated request input inside SQL template literals
 *     (e.g. `WHERE id='${input.tenantId}'`).
 *  3. Dynamic SET-clause builders pass their params array to execRaw.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REMEDIATED_FILES = [
  "server/wave27Router.ts",
  "server/wave28Router.ts",
  "server/wave29Router.ts",
  "server/jobs/scumlExpiryJob.ts",
];

function src(rel: string): string {
  return readFileSync(join(__dirname, "..", rel), "utf8");
}

describe("P0-10 SQL injection regression guards", () => {
  it("no sql.raw call sites remain in remediated files", () => {
    for (const f of REMEDIATED_FILES) {
      expect(src(f), `${f} must not use sql.raw`).not.toMatch(/sql\.raw\s*\(/);
    }
  });

  it("no request input is interpolated directly into SQL", () => {
    for (const f of REMEDIATED_FILES) {
      // e.g. WHERE id='${input.tenantId}' or "'" + input.tenantId + "'"
      expect(src(f), `${f} interpolates input into SQL`).not.toMatch(
        /\$\{input\.\w+\}[^`]*('|")\s*\+|'\$\{input\./,
      );
    }
  });

  it("wave27 updateTenantLimits binds tenantId as a parameter", () => {
    const s = src("server/wave27Router.ts");
    expect(s).toMatch(/execRaw\(db,\s*`UPDATE tenants SET \$\{updates\.join/);
    expect(s).not.toMatch(/WHERE id='\$\{input\.tenantId\}'/);
  });

  it("wave27 audit CSV export binds the LIMIT as a parameter", () => {
    const s = src("server/wave27Router.ts");
    expect(s).not.toMatch(/LIMIT \$\{input\.limit\}/);
  });

  it("wave29 chargeback list passes its params array to execRaw", () => {
    const s = src("server/wave29Router.ts");
    expect(s).toMatch(
      /SELECT \* FROM chargebacks WHERE \$\{conditions\.join\(" AND "\)\}[^`]*`,\s*params\)/,
    );
  });

  it("wave29 rate-limit dashboard no longer concatenates tenantId", () => {
    const s = src("server/wave29Router.ts");
    expect(s).not.toMatch(/m\.tenant_id = '"\s*\+\s*input\.tenantId/);
  });

  it("scumlExpiryJob uses inArray instead of an interpolated ARRAY[...]", () => {
    const s = src("server/jobs/scumlExpiryJob.ts");
    expect(s).toMatch(/inArray\(scumlChecks\.id, expiredIds\)/);
    expect(s).not.toMatch(/ARRAY\[\$\{expiredIds/);
  });

  // ── wave28/29 fixed sites ──────────────────────────────────────────────────
  it("wave28 updateBranding builds its SET clause from literals and binds every value", () => {
    const s = src("server/wave28Router.ts");
    // Values are pushed to the params array alongside $N placeholders…
    expect(s).toMatch(/updates\.push\(`primary_color = \$\$\{idx\+\+\}`\);\s*params\.push\(input\.primaryColor\)/);
    // …and the final statement binds the params array — no interpolation of input.
    expect(s).toMatch(/execRaw\(db,\s*`UPDATE tenants SET \$\{updates\.join\(", "\)\} WHERE id = \$\$\{idx\}`,\s*params\)/);
    expect(s).not.toMatch(/UPDATE tenants SET[^`]*\$\{input\./);
  });

  it("wave28 saveBranding does not interpolate branding fields into SQL", () => {
    const s = src("server/wave28Router.ts");
    expect(s).not.toMatch(/logo_url\s*=\s*'\$\{input\./);
    expect(s).not.toMatch(/primary_color\s*=\s*'\$\{input\./);
  });
});
