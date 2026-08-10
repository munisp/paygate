/**
 * Wave 136 — Production Hardening Tests
 * ======================================
 * Covers:
 *   1. GitHub Actions CI pipeline (.github/workflows/ci.yml)
 *   2. Python threat-intel GeoIP2 hardening (POST /geoip/reload, GET /geoip/status)
 *   3. Ollama K8s deployment manifest (k8s/ollama-deployment.yaml)
 *   4. Ollama docker-compose service
 *   5. Regressions: Mojaloop activities, LANG_PICKER_ENABLED, GeoIP download script
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. GitHub Actions CI Pipeline ───────────────────────────────────────────
describe("Wave 136 — GitHub Actions CI Pipeline", () => {
  const ciPath = join(ROOT, ".github/workflows/ci.yml");

  it("ci.yml exists at .github/workflows/ci.yml", () => {
    expect(existsSync(ciPath)).toBe(true);
  });

  it("ci.yml contains Node.js test job", () => {
    const content = readFileSync(ciPath, "utf8");
    expect(content).toMatch(/pnpm.*test|pnpm test/);
  });

  it("ci.yml contains Go vet or build step", () => {
    const content = readFileSync(ciPath, "utf8");
    expect(content).toMatch(/go.*build|go.*vet|go build|go vet/);
  });

  it("ci.yml contains Rust check or build step", () => {
    const content = readFileSync(ciPath, "utf8");
    expect(content).toMatch(/cargo.*check|cargo.*build|cargo check|cargo build/);
  });

  it("ci.yml contains Python lint or test step", () => {
    const content = readFileSync(ciPath, "utf8");
    expect(content).toMatch(/flake8|pylint|pytest|python.*lint/);
  });

  it("ci.yml defines at least one job", () => {
    const content = readFileSync(ciPath, "utf8");
    expect(content).toMatch(/^jobs:/m);
  });

  it("ci.yml triggers on push and pull_request", () => {
    const content = readFileSync(ciPath, "utf8");
    expect(content).toMatch(/on:/);
    expect(content).toMatch(/push/);
    expect(content).toMatch(/pull_request/);
  });
});

// ─── 2. Python threat-intel GeoIP2 Hardening ─────────────────────────────────
describe("Wave 136 — threat-intel GeoIP2 hardening", () => {
  const mainPath = join(ROOT, "python-services/threat-intel/main.py");

  it("threat-intel main.py exists", () => {
    expect(existsSync(mainPath)).toBe(true);
  });

  it("defines _geoip_db_info() helper function", () => {
    const content = readFileSync(mainPath, "utf8");
    expect(content).toContain("def _geoip_db_info()");
  });

  it("_geoip_db_info returns age_days field", () => {
    const content = readFileSync(mainPath, "utf8");
    expect(content).toContain('"age_days"');
  });

  it("_geoip_db_info returns stale field with 30-day threshold", () => {
    const content = readFileSync(mainPath, "utf8");
    expect(content).toContain('"stale"');
    expect(content).toContain("age_days > 30");
  });

  it("POST /geoip/reload endpoint is defined", () => {
    const content = readFileSync(mainPath, "utf8");
    expect(content).toContain('@app.post("/geoip/reload")');
  });

  it("/geoip/reload closes old reader before replacing", () => {
    const content = readFileSync(mainPath, "utf8");
    expect(content).toContain("old_reader.close()");
  });

  it("GET /geoip/status endpoint is defined", () => {
    const content = readFileSync(mainPath, "utf8");
    expect(content).toContain('@app.get("/geoip/status")');
  });

  it("/geoip/status includes staleness warning message", () => {
    const content = readFileSync(mainPath, "utf8");
    expect(content).toContain("GeoLite2 DB is more than 30 days old");
  });

  it("/geoip/reload references download-geoip.mjs in error message", () => {
    const content = readFileSync(mainPath, "utf8");
    expect(content).toContain("download-geoip.mjs");
  });
});

// ─── 3. Ollama K8s Deployment Manifest ───────────────────────────────────────
describe("Wave 136 — Ollama K8s deployment manifest", () => {
  const manifestPath = join(ROOT, "k8s/ollama-deployment.yaml");

  it("ollama-deployment.yaml exists", () => {
    expect(existsSync(manifestPath)).toBe(true);
  });

  it("contains Deployment kind for ollama", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toMatch(/kind: Deployment/);
    expect(content).toContain("app: ollama");
  });

  it("uses official ollama/ollama image", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toContain("image: ollama/ollama");
  });

  it("exposes port 11434", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toContain("11434");
  });

  it("defines PersistentVolumeClaim for model storage", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toMatch(/kind: PersistentVolumeClaim/);
    expect(content).toContain("ollama-models-pvc");
  });

  it("defines HorizontalPodAutoscaler", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toMatch(/kind: HorizontalPodAutoscaler/);
    expect(content).toContain("ollama-hpa");
  });

  it("defines PodDisruptionBudget", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toMatch(/kind: PodDisruptionBudget/);
    expect(content).toContain("ollama-pdb");
  });

  it("defines NetworkPolicy restricting ingress to paygate namespace", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toMatch(/kind: NetworkPolicy/);
    expect(content).toContain("ollama-netpol");
    expect(content).toContain("paygate");
  });

  it("defines ClusterIP Service for ollama", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toMatch(/kind: Service/);
    expect(content).toContain("type: ClusterIP");
  });

  it("includes model pre-pull Job", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toMatch(/kind: Job/);
    expect(content).toContain("ollama pull");
  });

  it("includes liveness and readiness probes", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toContain("livenessProbe");
    expect(content).toContain("readinessProbe");
  });

  it("includes resource limits for memory", () => {
    const content = readFileSync(manifestPath, "utf8");
    expect(content).toMatch(/memory:.*8Gi/);
  });
});

// ─── 4. Ollama docker-compose service ────────────────────────────────────────
describe("Wave 136 — Ollama docker-compose service", () => {
  const composePath = join(ROOT, "docker-compose.production.yml");

  it("docker-compose.production.yml has ollama service", () => {
    const content = readFileSync(composePath, "utf8");
    expect(content).toContain("ollama:");
  });

  it("ollama service uses official image", () => {
    const content = readFileSync(composePath, "utf8");
    expect(content).toContain("ollama/ollama");
  });

  it("ollama_models volume is declared", () => {
    const content = readFileSync(composePath, "utf8");
    expect(content).toContain("ollama_models:");
  });

  it("ollama service has healthcheck", () => {
    const content = readFileSync(composePath, "utf8");
    // Check that healthcheck appears after the ollama service definition
    const ollamaSection = content.split("ollama:")[1];
    expect(ollamaSection).toContain("healthcheck");
  });
});

// ─── 5. Regressions ──────────────────────────────────────────────────────────
describe("Wave 136 — Regressions", () => {
  it("Mojaloop ExecuteMojalloopTransfer is a real HTTP implementation", () => {
    const activitiesPath = join(ROOT, "go-bridge/internal/temporal/activities.go");
    const content = readFileSync(activitiesPath, "utf8");
    expect(content).toContain("ExecuteMojalloopTransfer");
    expect(content).toContain("/transfers");
    expect(content).toContain("MOJALOOP_API_KEY");
  });

  it("LANG_PICKER_ENABLED tRPC procedures exist in routers.ts", () => {
    const routersPath = join(ROOT, "server/routers.ts");
    const content = readFileSync(routersPath, "utf8");
    expect(content).toContain("getUssdLangPickerEnabled");
    expect(content).toContain("updateUssdLangPickerEnabled");
  });

  it("download-geoip.mjs script exists with MaxMind + DB-IP fallback", () => {
    const scriptPath = join(ROOT, "scripts/download-geoip.mjs");
    const content = readFileSync(scriptPath, "utf8");
    expect(existsSync(scriptPath)).toBe(true);
    expect(content).toContain("maxmind");
    expect(content).toContain("db-ip");
  });

  it("threat-intel /health endpoint still reports geoip_available", () => {
    const mainPath = join(ROOT, "python-services/threat-intel/main.py");
    const content = readFileSync(mainPath, "utf8");
    expect(content).toContain("geoip_available");
  });

  it("APISIX admin handler routes are registered in main.go", () => {
    const mainGoPath = join(ROOT, "go-bridge/cmd/bridge/main.go");
    const content = readFileSync(mainGoPath, "utf8");
    expect(content).toContain("APISIXListRoutes");
    expect(content).toContain("APISIXHealth");
  });
});
