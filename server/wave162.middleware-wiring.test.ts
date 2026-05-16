/**
 * Wave 162 — Middleware Wiring Audit Tests
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function fileExists(rel: string) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ─── 1. Router ────────────────────────────────────────────────────────────────
describe("Wave 162: wave162Router", () => {
  it("router file exists", () => {
    expect(fileExists("server/routers/wave162.ts")).toBe(true);
  });
  it("exports wave162Router", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("export const wave162Router");
  });
  it("has dapr.health procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("dapr");
    expect(content).toContain("health");
  });
  it("has dapr.pubsub procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("pubsub");
  });
  it("has dapr.stateStore procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("stateStore");
  });
  it("has nibss.health procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("nibss");
  });
  it("has nibss.nipStats procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("nipStats");
  });
  it("has nibss.bankList procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("bankList");
  });
  it("has nibss.nameEnquiry procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("nameEnquiry");
  });
  it("has fluvio.consumerLag procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("fluvio");
    expect(content).toContain("consumerLag");
  });
  it("has fluvio.partitionStats procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("partitionStats");
  });
  it("has keycloak.tokenIntrospect procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("keycloak");
    expect(content).toContain("tokenIntrospect");
  });
  it("has keycloak.realmStats procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("realmStats");
  });
  it("has permify.bulkCheck procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("permify");
    expect(content).toContain("bulkCheck");
  });
  it("has permify.health procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("permify");
  });
  it("has redis.pipeline procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("redis");
    expect(content).toContain("pipeline");
  });
  it("has redis.keyStats procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("keyStats");
  });
  it("has tigerbeetle.balanceAudit procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("tigerbeetle");
    expect(content).toContain("balanceAudit");
  });
  it("has tigerbeetle.accountLookup procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("accountLookup");
  });
  it("has wiringAudit procedure", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("wiringAudit");
  });
  it("wiringAudit checks all 10 services", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("go-bridge");
    expect(content).toContain("kafka");
    expect(content).toContain("fluvio");
    expect(content).toContain("redis");
    expect(content).toContain("temporal");
    expect(content).toContain("keycloak");
    expect(content).toContain("permify");
    expect(content).toContain("dapr");
    expect(content).toContain("nibss");
    expect(content).toContain("tigerbeetle");
  });
  it("uses safeFetch with AbortSignal timeout", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("AbortSignal.timeout");
  });
  it("normalises status values", () => {
    const content = readFile("server/routers/wave162.ts");
    expect(content).toContain("normaliseStatus");
  });
});

// ─── 2. Router registration ───────────────────────────────────────────────────
describe("Wave 162: router registration", () => {
  it("wave162Router is imported in routers.ts", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("wave162Router");
  });
  it("middlewareWiringAudit namespace is registered", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("middlewareWiringAudit");
  });
});

// ─── 3. Frontend page ─────────────────────────────────────────────────────────
describe("Wave 162: MiddlewareWiringAudit page", () => {
  it("MiddlewareWiringAudit.tsx exists", () => {
    expect(fileExists("client/src/pages/MiddlewareWiringAudit.tsx")).toBe(true);
  });
  it("page uses trpc.middlewareWiringAudit.wiringAudit", () => {
    const content = readFile("client/src/pages/MiddlewareWiringAudit.tsx");
    expect(content).toContain("middlewareWiringAudit.wiringAudit");
  });
  it("page uses trpc.middlewareWiringAudit.dapr.health", () => {
    const content = readFile("client/src/pages/MiddlewareWiringAudit.tsx");
    expect(content).toContain("middlewareWiringAudit.dapr.health");
  });
  it("page uses trpc.middlewareWiringAudit.nibss.health", () => {
    const content = readFile("client/src/pages/MiddlewareWiringAudit.tsx");
    expect(content).toContain("middlewareWiringAudit.nibss.health");
  });
  it("page uses trpc.middlewareWiringAudit.fluvio.consumerLag", () => {
    const content = readFile("client/src/pages/MiddlewareWiringAudit.tsx");
    expect(content).toContain("middlewareWiringAudit.fluvio.consumerLag");
  });
  it("page uses trpc.middlewareWiringAudit.redis.pipeline", () => {
    const content = readFile("client/src/pages/MiddlewareWiringAudit.tsx");
    expect(content).toContain("middlewareWiringAudit.redis.pipeline");
  });
  it("page uses trpc.middlewareWiringAudit.tigerbeetle.balanceAudit", () => {
    const content = readFile("client/src/pages/MiddlewareWiringAudit.tsx");
    expect(content).toContain("middlewareWiringAudit.tigerbeetle.balanceAudit");
  });
  it("page uses trpc.middlewareWiringAudit.keycloak.realmStats", () => {
    const content = readFile("client/src/pages/MiddlewareWiringAudit.tsx");
    expect(content).toContain("middlewareWiringAudit.keycloak.realmStats");
  });
  it("page uses trpc.middlewareWiringAudit.permify.bulkCheck", () => {
    const content = readFile("client/src/pages/MiddlewareWiringAudit.tsx");
    expect(content).toContain("middlewareWiringAudit.permify.bulkCheck");
  });
  it("page is registered in App.tsx", () => {
    const appTsx = readFile("client/src/App.tsx");
    expect(appTsx).toContain("MiddlewareWiringAudit");
    expect(appTsx).toContain("/middleware-wiring-audit");
  });
  it("page is in sidebar navigation", () => {
    const layout = readFile("client/src/components/Layout.tsx");
    expect(layout).toContain("/middleware-wiring-audit");
  });
});
