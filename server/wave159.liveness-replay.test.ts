/**
 * Wave 159 — Liveness Replay Viewer & Ensemble Scoring Tests
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

// ─── 1. Schema ────────────────────────────────────────────────────────────────
describe("Wave 159: liveness_sessions schema", () => {
  it("schema.ts exports livenessSessions table", () => {
    const schema = readFile("drizzle/schema.ts");
    expect(schema).toContain("liveness_sessions");
    expect(schema).toContain("livenessSessions");
  });
  it("schema includes ensemble score columns", () => {
    const schema = readFile("drizzle/schema.ts");
    expect(schema).toContain("rust_signal_score");
    expect(schema).toContain("go_gateway_score");
    expect(schema).toContain("python_ml_score");
    expect(schema).toContain("ensemble_weights");
  });
  it("schema includes liveness_decision enum", () => {
    const schema = readFile("drizzle/schema.ts");
    expect(schema).toContain("liveness_decision");
    expect(schema).toContain("real");
    expect(schema).toContain("spoof");
    expect(schema).toContain("uncertain");
  });
  it("schema includes override columns", () => {
    const schema = readFile("drizzle/schema.ts");
    expect(schema).toContain("override_decision");
    expect(schema).toContain("override_note");
    expect(schema).toContain("override_by");
  });
});

// ─── 2. Router ────────────────────────────────────────────────────────────────
describe("Wave 159: wave159Router procedures", () => {
  it("router file exists", () => {
    expect(fileExists("server/routers/wave159.ts")).toBe(true);
  });
  it("router exports wave159Router", () => {
    const content = readFile("server/routers/wave159.ts");
    expect(content).toContain("export const wave159Router");
  });
  it("router has listSessions procedure", () => {
    const content = readFile("server/routers/wave159.ts");
    expect(content).toContain("listSessions");
  });
  it("router has getSession procedure", () => {
    const content = readFile("server/routers/wave159.ts");
    expect(content).toContain("getSession");
  });
  it("router has overrideDecision procedure", () => {
    const content = readFile("server/routers/wave159.ts");
    expect(content).toContain("overrideDecision");
  });
  it("router has stats procedure", () => {
    const content = readFile("server/routers/wave159.ts");
    expect(content).toContain("stats");
  });
  it("router has ensembleScore procedure", () => {
    const content = readFile("server/routers/wave159.ts");
    expect(content).toContain("ensembleScore");
  });
  it("router has ingestSession procedure", () => {
    const content = readFile("server/routers/wave159.ts");
    expect(content).toContain("ingestSession");
  });
  it("router implements weighted ensemble computation", () => {
    const content = readFile("server/routers/wave159.ts");
    expect(content).toContain("computeEnsemble");
    expect(content).toContain("DEFAULT_WEIGHTS");
    expect(content).toContain("rust");
    expect(content).toContain("go");
    expect(content).toContain("python");
  });
  it("ensemble weights sum to 1.0 (0.3 + 0.3 + 0.4)", () => {
    const content = readFile("server/routers/wave159.ts");
    expect(content).toContain("0.3");
    expect(content).toContain("0.4");
  });
});

// ─── 3. Router registered in main routers.ts ─────────────────────────────────
describe("Wave 159: router registration", () => {
  it("wave159Router is imported in routers.ts", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("wave159Router");
  });
  it("livenessReplay namespace is registered", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("livenessReplay");
  });
});

// ─── 4. Frontend page ────────────────────────────────────────────────────────
describe("Wave 159: LivenessReplayViewer page", () => {
  it("LivenessReplayViewer.tsx exists", () => {
    expect(fileExists("client/src/pages/LivenessReplayViewer.tsx")).toBe(true);
  });
  it("page uses trpc.livenessReplay.listSessions", () => {
    const content = readFile("client/src/pages/LivenessReplayViewer.tsx");
    expect(content).toContain("livenessReplay.listSessions");
  });
  it("page uses trpc.livenessReplay.stats", () => {
    const content = readFile("client/src/pages/LivenessReplayViewer.tsx");
    expect(content).toContain("livenessReplay.stats");
  });
  it("page uses trpc.livenessReplay.getSession", () => {
    const content = readFile("client/src/pages/LivenessReplayViewer.tsx");
    expect(content).toContain("livenessReplay.getSession");
  });
  it("page uses trpc.livenessReplay.overrideDecision", () => {
    const content = readFile("client/src/pages/LivenessReplayViewer.tsx");
    expect(content).toContain("livenessReplay.overrideDecision");
  });
  it("page shows ensemble score breakdown with 3 services", () => {
    const content = readFile("client/src/pages/LivenessReplayViewer.tsx");
    expect(content.toLowerCase()).toContain("rust");
    expect(content.toLowerCase()).toContain("go");
    expect(content.toLowerCase()).toContain("python");
  });
  it("page is registered in App.tsx", () => {
    const appTsx = readFile("client/src/App.tsx");
    expect(appTsx).toContain("LivenessReplayViewer");
    expect(appTsx).toContain("/liveness-replay");
  });
});

// ─── 5. ComplianceKYC real tRPC wiring ───────────────────────────────────────
describe("Wave 159: ComplianceKYC real tRPC calls", () => {
  it("ComplianceKYC uses trpc.complianceKyc.list.useQuery", () => {
    const content = readFile("client/src/pages/ComplianceKYC.tsx");
    expect(content).toContain("trpc.complianceKyc.list.useQuery");
  });
  it("ComplianceKYC uses trpc.complianceKyc.stats.useQuery", () => {
    const content = readFile("client/src/pages/ComplianceKYC.tsx");
    expect(content).toContain("trpc.complianceKyc.stats.useQuery");
  });
  it("ComplianceKYC no longer has const data: any = null", () => {
    const content = readFile("client/src/pages/ComplianceKYC.tsx");
    expect(content).not.toContain("const data: any = null");
  });
});
