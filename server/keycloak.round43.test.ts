/**
 * Round 43 — ENV.keycloakAdminUser/Password, docker-compose admin vars, final production audit
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const projectRoot = path.resolve(__dirname, "..");

describe("Round 43 — ENV keycloak admin credentials", () => {
  it("env.ts exposes keycloakAdminUser from KEYCLOAK_ADMIN env var", () => {
    const env = fs.readFileSync(path.join(projectRoot, "server/_core/env.ts"), "utf-8");
    expect(env).toContain("keycloakAdminUser");
    expect(env).toContain("KEYCLOAK_ADMIN");
  });

  it("env.ts exposes keycloakAdminPassword from KEYCLOAK_ADMIN_PASSWORD env var", () => {
    const env = fs.readFileSync(path.join(projectRoot, "server/_core/env.ts"), "utf-8");
    expect(env).toContain("keycloakAdminPassword");
    expect(env).toContain("KEYCLOAK_ADMIN_PASSWORD");
  });

  it("backup handler uses ENV.keycloakAdminUser instead of process.env directly", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).toContain("ENV.keycloakAdminUser");
    expect(index).toContain("ENV.keycloakAdminPassword");
    expect(index).not.toContain('process.env.KEYCLOAK_ADMIN ?? "admin"');
  });
});

describe("Round 43 — docker-compose admin vars in app service", () => {
  it("docker-compose app service includes KEYCLOAK_ADMIN env var", () => {
    const dc = fs.readFileSync(path.join(projectRoot, "docker-compose.production.yml"), "utf-8");
    const appSection = dc.split("# ─── PostgreSQL")[0];
    expect(appSection).toContain("KEYCLOAK_ADMIN:");
  });

  it("docker-compose app service includes KEYCLOAK_ADMIN_PASSWORD env var", () => {
    const dc = fs.readFileSync(path.join(projectRoot, "docker-compose.production.yml"), "utf-8");
    const appSection = dc.split("# ─── PostgreSQL")[0];
    expect(appSection).toContain("KEYCLOAK_ADMIN_PASSWORD:");
  });

  it("docker-compose app service includes KEYCLOAK_WEBHOOK_SECRET env var", () => {
    const dc = fs.readFileSync(path.join(projectRoot, "docker-compose.production.yml"), "utf-8");
    const appSection = dc.split("# ─── PostgreSQL")[0];
    expect(appSection).toContain("KEYCLOAK_WEBHOOK_SECRET:");
  });
});

describe("Round 43 — Final production audit: no Manus OAuth in non-test server code", () => {
  const getServerFiles = () =>
    (fs.readdirSync(path.join(projectRoot, "server"), { recursive: true }) as string[])
      .filter(f => f.endsWith(".ts") && !f.includes(".test.") && !f.includes("migration") && !f.includes("round4"))
      .map(f => path.join(projectRoot, "server", f));

  it("no server file uses sdk.signSession, sdk.authenticateRequest, or sdk.verifySession", () => {
    const bad = getServerFiles().filter(f => {
      try {
        const c = fs.readFileSync(f, "utf-8");
        return c.includes("sdk.signSession") || c.includes("sdk.authenticateRequest") || c.includes("sdk.verifySession");
      } catch { return false; }
    });
    expect(bad).toHaveLength(0);
  });

  it("no server file uses process.env.VITE_APP_ID or process.env.OAUTH_SERVER_URL as active config", () => {
    const bad = getServerFiles().filter(f => {
      try {
        const lines = fs.readFileSync(f, "utf-8").split("\n")
          .filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
        return lines.some(l =>
          l.includes("process.env.VITE_APP_ID") || l.includes("process.env.OAUTH_SERVER_URL")
        );
      } catch { return false; }
    });
    expect(bad).toHaveLength(0);
  });

  it("core auth files do not use process.env.KEYCLOAK_ directly (use ENV object)", () => {
    const coreFiles = ["server/_core/oauth.ts", "server/_core/keycloak.ts", "server/_core/context.ts"]
      .map(f => path.join(projectRoot, f));
    const bad = coreFiles.filter(f => {
      try { return fs.readFileSync(f, "utf-8").includes("process.env.KEYCLOAK_"); }
      catch { return false; }
    });
    expect(bad).toHaveLength(0);
  });
});

describe("Round 43 — Production checklist items", () => {
  it("docker-compose keycloak service has a healthcheck", () => {
    const dc = fs.readFileSync(path.join(projectRoot, "docker-compose.production.yml"), "utf-8");
    const kcSection = dc.split("# ─── Keycloak Identity Provider")[1]?.split("# ───")[0] ?? "";
    expect(kcSection).toContain("healthcheck");
    expect(kcSection).toContain("health/ready");
  });

  it("app service depends_on keycloak with service_healthy condition", () => {
    const dc = fs.readFileSync(path.join(projectRoot, "docker-compose.production.yml"), "utf-8");
    const appSection = dc.split("# ─── PostgreSQL")[0];
    expect(appSection).toContain("service_healthy");
    expect(appSection).toContain("keycloak:");
  });

  it("keycloak-admin network is defined as internal:true", () => {
    const dc = fs.readFileSync(path.join(projectRoot, "docker-compose.production.yml"), "utf-8");
    expect(dc).toContain("keycloak-admin:");
    expect(dc).toContain("internal: true");
  });

  it("production checklist in docs covers all key items", () => {
    const docs = fs.readFileSync(path.join(projectRoot, "docs/keycloak-deployment.md"), "utf-8");
    expect(docs).toContain("Production Checklist");
    expect(docs).toContain("KEYCLOAK_CLIENT_SECRET");
    expect(docs).toContain("ALLOWED_ORIGINS");
    expect(docs).toContain("TLS");
  });
});
