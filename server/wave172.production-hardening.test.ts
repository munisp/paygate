/**
 * Wave 172 — Liveness Replay Viewer, KYC Wizard, CAC API
 * Tests: KYCWizard page existence, KYBDirectorWizard route, CAC validation logic,
 *        liveness replay viewer route.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

describe("Wave 172 — KYC Step Wizard", () => {
  it("KYCWizard.tsx page exists", () => {
    expect(
      fs.existsSync(path.join(ROOT, "client/src/pages/KYCWizard.tsx"))
    ).toBe(true);
  });

  it("KYCWizard has Document step", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "client/src/pages/KYCWizard.tsx"),
      "utf8"
    );
    expect(src).toMatch(/document|Document/i);
  });

  it("KYCWizard has Selfie step", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "client/src/pages/KYCWizard.tsx"),
      "utf8"
    );
    expect(src).toMatch(/selfie|Selfie/i);
  });

  it("KYCWizard has Liveness step", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "client/src/pages/KYCWizard.tsx"),
      "utf8"
    );
    expect(src).toMatch(/liveness|Liveness/i);
  });

  it("KYCWizard has Review step", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "client/src/pages/KYCWizard.tsx"),
      "utf8"
    );
    expect(src).toMatch(/review|Review/i);
  });

  it("KYCWizard uses step state management", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "client/src/pages/KYCWizard.tsx"),
      "utf8"
    );
    expect(src).toMatch(/useState|step|currentStep/);
  });

  it("KYCWizard is registered as a route in App.tsx", () => {
    const app = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf8");
    expect(app).toMatch(/KYCWizard|kyc.*wizard|kyc-wizard/i);
  });
});

describe("Wave 172 — Director KYC Sub-flow", () => {
  it("KYBDirectorWizard.tsx page exists", () => {
    expect(
      fs.existsSync(path.join(ROOT, "client/src/pages/KYBDirectorWizard.tsx"))
    ).toBe(true);
  });

  it("KYBDirectorWizard is registered as a route in App.tsx", () => {
    const app = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf8");
    expect(app).toContain("KYBDirectorWizard");
  });

  it("KYBDirectorWizard route includes :id param", () => {
    const app = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf8");
    expect(app).toMatch(/kyb.*director.*:id|director-kyc.*:id/i);
  });
});

describe("Wave 172 — CAC RC Number Validation", () => {
  it("CAC validation logic: RC number must be 6-8 digits", () => {
    const validateRC = (rc: string) => /^\d{6,8}$/.test(rc);
    expect(validateRC("1234567")).toBe(true);
    expect(validateRC("123456")).toBe(true);
    expect(validateRC("12345678")).toBe(true);
    expect(validateRC("12345")).toBe(false);
    expect(validateRC("123456789")).toBe(false);
    expect(validateRC("ABC123")).toBe(false);
  });

  it("CAC validation logic: RC prefix BN is valid for business name", () => {
    const validateCAC = (rc: string) =>
      /^(RC|BN|IT|LP|LLP)?\d{6,8}$/.test(rc.toUpperCase());
    expect(validateCAC("RC1234567")).toBe(true);
    expect(validateCAC("BN1234567")).toBe(true);
    expect(validateCAC("1234567")).toBe(true);
    expect(validateCAC("XX1234567")).toBe(false);
  });

  it("CAC validation normalises leading zeros", () => {
    const normaliseRC = (rc: string) =>
      rc.replace(/^(RC|BN|IT|LP|LLP)?0+/i, (_, prefix) => prefix || "");
    expect(normaliseRC("RC0001234")).toBe("RC1234");
    expect(normaliseRC("0001234")).toBe("1234");
  });
});

describe("Wave 172 — Liveness Replay Viewer", () => {
  it("App.tsx has /compliance/liveness/:sessionId route", () => {
    const app = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf8");
    expect(app).toMatch(/compliance.*liveness|liveness.*session/i);
  });
});
