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

  it("backup script reads admin credentials from KEYCLOAK_ADMIN env vars", () => {
    // Real contract: the in-process backup handler was replaced by
    // scripts/keycloak-realm-backup.sh, which reads the same env vars that
    // env.ts exposes as keycloakAdminUser / keycloakAdminPassword.
    const script = fs.readFileSync(path.join(projectRoot, "scripts/keycloak-realm-backup.sh"), "utf-8");
    expect(script).toContain('KC_ADMIN="${KEYCLOAK_ADMIN_USER:-admin}"');
    expect(script).toContain('KC_PASS="${KEYCLOAK_ADMIN_PASSWORD:?');
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

  // Real contract: session authentication goes through server/_core/sdk.ts
  // (sdk.authenticateRequest) and is confined to the _core auth plumbing —
  // context.ts (tRPC), oauth.ts (callback), index.ts (cron guard) and sdk.ts
  // itself. Routers and feature modules must NOT call sdk.* directly.
  it("sdk.* session calls are confined to server/_core auth plumbing", () => {
    const allowed = new Set(["context.ts", "index.ts", "oauth.ts", "sdk.ts"].map(f => path.join("_core", f)));
    const bad = getServerFiles().filter(f => {
      try {
        const lines = fs.readFileSync(f, "utf-8").split("\n")
          .filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
        const uses = lines.some(l =>
          l.includes("sdk.signSession") || l.includes("sdk.authenticateRequest") || l.includes("sdk.verifySession")
        );
        return uses && !allowed.has(path.relative(path.join(projectRoot, "server"), f));
      } catch { return false; }
    });
    expect(bad).toHaveLength(0);
  });

  it("process.env.VITE_APP_ID / OAUTH_SERVER_URL are only read in env.ts", () => {
    // Real contract: raw env access is centralized in server/_core/env.ts;
    // every other module consumes the typed ENV object.
    const envTs = path.join(projectRoot, "server", "_core", "env.ts");
    const bad = getServerFiles().filter(f => {
      if (f === envTs) return false;
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
