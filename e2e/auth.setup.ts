/**
 * auth.setup.ts
 * Playwright auth setup — runs once before all E2E tests.
 * Injects a valid session cookie directly (bypasses OAuth redirect in CI).
 */
import { test as setup, expect } from "@playwright/test";
import * as jose from "jose";
import * as fs from "fs";
import * as path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/user.json");

setup("authenticate as merchant owner", async ({ page }) => {
  const jwtSecret = process.env.JWT_SECRET ?? "dev-jwt-secret-paygate-2026";
  const secret = new TextEncoder().encode(jwtSecret);

  // Create a signed JWT that matches the portal's session cookie format
  const token = await new jose.SignJWT({
    id: 1,
    openId: process.env.OWNER_OPEN_ID ?? "owner-test-open-id",
    name: process.env.OWNER_NAME ?? "PayGate Test Owner",
    email: "owner@paygate.ng",
    role: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);

  // Navigate to the portal and inject the session cookie
  await page.goto("/");
  await page.context().addCookies([
    {
      name: "pg_session",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  // Navigate to dashboard to verify auth works
  await page.goto("/dashboard");
  // Wait for the dashboard to load (not the login page)
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 10_000,
  });

  // Save auth state
  await page.context().storageState({ path: AUTH_FILE });
  console.log("✅ Auth setup complete — session cookie injected");
});
