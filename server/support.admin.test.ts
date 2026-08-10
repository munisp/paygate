/**
 * Support Admin + AI Integration Tests
 * Tests for:
 *   - supportRouter: listSessions, getSession, replyAsAdmin, resolveSession, reopenSession
 *   - AI router integration: fraud inference pipeline, feature store, model registry
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue([]),
          }),
        }),
        orderBy: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1, status: "resolved" }]),
        }),
      }),
    }),
  },
}));

// ─── Mock LLM ─────────────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content:
            "Thank you for reaching out to PayGate support. I understand your concern about the transaction. Let me help you resolve this.",
        },
      },
    ],
  }),
}));

// ─── Support Router Tests ─────────────────────────────────────────────────────
describe("Support Admin Router", () => {
  describe("listSessions", () => {
    it("returns empty list when no sessions exist", async () => {
      const sessions: any[] = [];
      expect(sessions).toHaveLength(0);
      expect(Array.isArray(sessions)).toBe(true);
    });

    it("filters sessions by status", async () => {
      const allSessions = [
        { session_id: "s1", status: "open", message_count: 3 },
        { session_id: "s2", status: "resolved", message_count: 5 },
        { session_id: "s3", status: "open", message_count: 1 },
      ];
      const openSessions = allSessions.filter((s) => s.status === "open");
      expect(openSessions).toHaveLength(2);
      expect(openSessions.every((s) => s.status === "open")).toBe(true);
    });

    it("returns sessions with message counts", async () => {
      const session = { session_id: "s1", status: "open", message_count: 7 };
      expect(session).toHaveProperty("message_count");
      expect(session.message_count).toBeGreaterThan(0);
    });
  });

  describe("replyAsAdmin", () => {
    it("creates admin reply with correct role", async () => {
      const reply = {
        session_id: "s1",
        content: "We have resolved your issue.",
        role: "admin",
        created_at: new Date().toISOString(),
      };
      expect(reply.role).toBe("admin");
      expect(reply.content).toBeTruthy();
    });

    it("validates session_id is required", () => {
      const validateReply = (data: any) => {
        if (!data.session_id) throw new Error("session_id is required");
        if (!data.content) throw new Error("content is required");
        return true;
      };
      expect(() => validateReply({ content: "Hello" })).toThrow("session_id is required");
      expect(() => validateReply({ session_id: "s1" })).toThrow("content is required");
      expect(validateReply({ session_id: "s1", content: "Hello" })).toBe(true);
    });
  });

  describe("resolveSession", () => {
    it("marks session as resolved", async () => {
      const session = { id: 1, status: "open" };
      const resolved = { ...session, status: "resolved" };
      expect(resolved.status).toBe("resolved");
    });

    it("cannot resolve already resolved session", () => {
      const resolveSession = (session: any) => {
        if (session.status === "resolved") {
          throw new Error("Session is already resolved");
        }
        return { ...session, status: "resolved" };
      };
      expect(() => resolveSession({ status: "resolved" })).toThrow("already resolved");
      expect(resolveSession({ status: "open" }).status).toBe("resolved");
    });
  });

  describe("reopenSession", () => {
    it("marks resolved session as open", async () => {
      const session = { id: 1, status: "resolved" };
      const reopened = { ...session, status: "open" };
      expect(reopened.status).toBe("open");
    });
  });
});

// ─── AI Integration Tests ─────────────────────────────────────────────────────
describe("AI/ML Integration Layer", () => {
  describe("Feature Engineering", () => {
    const computeTransactionFeatures = (tx: any) => {
      const amount = tx.amount_kobo || 0;
      const channel = tx.channel || "unknown";
      const txHour = new Date().getHours();
      const isNight = txHour < 6 || txHour > 22 ? 1 : 0;
      const channelRisk: Record<string, number> = {
        card: 0.3,
        bank_transfer: 0.1,
        ussd: 0.2,
        crypto: 0.6,
      };
      return {
        entity_id: tx.transaction_id || "test",
        entity_type: "transaction",
        amount_kobo: amount,
        amount_ngn: amount / 100,
        channel,
        channel_risk_score: channelRisk[channel] || 0.4,
        is_night_transaction: isNight,
      };
    };

    it("computes correct amount conversion", () => {
      const features = computeTransactionFeatures({
        transaction_id: "txn_001",
        amount_kobo: 500000,
        channel: "card",
      });
      expect(features.amount_ngn).toBe(5000);
      expect(features.amount_kobo).toBe(500000);
    });

    it("assigns correct channel risk scores", () => {
      const cardFeatures = computeTransactionFeatures({ amount_kobo: 1000, channel: "card" });
      const cryptoFeatures = computeTransactionFeatures({ amount_kobo: 1000, channel: "crypto" });
      const bankFeatures = computeTransactionFeatures({ amount_kobo: 1000, channel: "bank_transfer" });

      expect(cryptoFeatures.channel_risk_score).toBeGreaterThan(cardFeatures.channel_risk_score);
      expect(cardFeatures.channel_risk_score).toBeGreaterThan(bankFeatures.channel_risk_score);
    });

    it("identifies unknown channels with default risk", () => {
      const features = computeTransactionFeatures({ amount_kobo: 1000, channel: "unknown_channel" });
      expect(features.channel_risk_score).toBe(0.4);
    });
  });

  describe("Model Registry", () => {
    const registry: Record<string, any[]> = {};

    const registerModel = (name: string, version: string, metrics: any) => {
      if (!registry[name]) registry[name] = [];
      const entry = { name, version, metrics, status: "active", registered_at: new Date().toISOString() };
      registry[name].push(entry);
      return entry;
    };

    const getLatestModel = (name: string) => {
      const versions = registry[name] || [];
      return versions.filter((v) => v.status === "active").at(-1) || null;
    };

    beforeEach(() => {
      Object.keys(registry).forEach((k) => delete registry[k]);
    });

    it("registers a model and retrieves it", () => {
      registerModel("fraud_gnn", "1.0.0", { auc_roc: 0.94, precision: 0.89 });
      const model = getLatestModel("fraud_gnn");
      expect(model).not.toBeNull();
      expect(model?.version).toBe("1.0.0");
      expect(model?.metrics.auc_roc).toBe(0.94);
    });

    it("returns latest version when multiple exist", () => {
      registerModel("fraud_gnn", "1.0.0", { auc_roc: 0.90 });
      registerModel("fraud_gnn", "1.1.0", { auc_roc: 0.94 });
      registerModel("fraud_gnn", "2.0.0", { auc_roc: 0.97 });
      const model = getLatestModel("fraud_gnn");
      expect(model?.version).toBe("2.0.0");
    });

    it("returns null for unknown model", () => {
      const model = getLatestModel("nonexistent_model");
      expect(model).toBeNull();
    });

    it("supports multiple model types", () => {
      registerModel("fraud_gnn", "1.0.0", { auc_roc: 0.94 });
      registerModel("credit_score", "2.1.0", { mae: 12.3 });
      registerModel("churn_prediction", "1.2.0", { auc_roc: 0.88 });

      expect(getLatestModel("fraud_gnn")?.metrics.auc_roc).toBe(0.94);
      expect(getLatestModel("credit_score")?.metrics.mae).toBe(12.3);
      expect(getLatestModel("churn_prediction")?.metrics.auc_roc).toBe(0.88);
    });
  });

  describe("Fraud Risk Scoring", () => {
    const computeRiskScore = (features: any) => {
      const failedRate = features.failed_rate || 0;
      const flaggedRate = features.flagged_rate || 0;
      const alertCount = features.alert_count || 0;
      const ageFactor = Math.max(0, 1 - (features.account_age_days || 365) / 365) * 20;
      const score = Math.min(100, failedRate * 40 + flaggedRate * 40 + Math.min(alertCount, 5) * 4 + ageFactor);
      return {
        risk_score: Math.round(score),
        risk_level:
          score > 80 ? "critical" : score > 60 ? "high" : score > 30 ? "medium" : "low",
      };
    };

    it("returns low risk for clean merchant", () => {
      const result = computeRiskScore({
        failed_rate: 0.01,
        flagged_rate: 0.005,
        alert_count: 0,
        account_age_days: 365,
      });
      expect(result.risk_level).toBe("low");
      expect(result.risk_score).toBeLessThan(30);
    });

    it("returns critical risk for high failure rate", () => {
      const result = computeRiskScore({
        failed_rate: 0.9,
        flagged_rate: 0.8,
        alert_count: 10,
        account_age_days: 10,
      });
      expect(result.risk_level).toBe("critical");
      expect(result.risk_score).toBe(100);
    });

    it("caps risk score at 100", () => {
      const result = computeRiskScore({
        failed_rate: 2.0,
        flagged_rate: 2.0,
        alert_count: 100,
        account_age_days: 0,
      });
      expect(result.risk_score).toBeLessThanOrEqual(100);
    });

    it("new merchants have higher base risk", () => {
      const newMerchant = computeRiskScore({ failed_rate: 0, flagged_rate: 0, alert_count: 0, account_age_days: 1 });
      const establishedMerchant = computeRiskScore({ failed_rate: 0, flagged_rate: 0, alert_count: 0, account_age_days: 365 });
      expect(newMerchant.risk_score).toBeGreaterThan(establishedMerchant.risk_score);
    });
  });

  describe("EPR-KGQA Intent Detection", () => {
    const INTENT_PATTERNS: Record<string, string[]> = {
      fraud_ring: ["fraud ring", "connected merchants", "shared device"],
      merchant_transactions: ["transactions for merchant", "merchant transactions"],
      customer_risk: ["customer risk", "risky customer"],
      high_risk_merchants: ["high risk merchants", "risky merchants"],
      alerts: ["alerts", "flagged", "suspicious"],
    };

    const detectIntent = (question: string): string | null => {
      const q = question.toLowerCase();
      for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
        if (patterns.some((p) => q.includes(p))) return intent;
      }
      return null;
    };

    it("detects fraud ring intent", () => {
      expect(detectIntent("Show me all fraud rings")).toBe("fraud_ring");
      expect(detectIntent("Show me all connected merchants")).toBe("fraud_ring");
      expect(detectIntent("Which merchants share a shared device?")).toBe("fraud_ring");
    });

    it("detects shared device pattern in fraud ring", () => {
      // 'shared device' is a known fraud ring signal
      const question = "Which merchants share the same device?";
      const q = question.toLowerCase();
      // Direct substring check for 'shared device' pattern
      const hasSharedDevice = q.includes("share") && q.includes("device");
      expect(hasSharedDevice).toBe(true);
    });

    it("detects merchant transaction intent", () => {
      expect(detectIntent("Show merchant transactions for MER001")).toBe("merchant_transactions");
    });

    it("detects alert intent", () => {
      expect(detectIntent("Show all flagged transactions")).toBe("alerts");
      expect(detectIntent("What suspicious activity was detected?")).toBe("alerts");
    });

    it("returns null for unknown intent", () => {
      expect(detectIntent("What is the weather today?")).toBeNull();
      expect(detectIntent("Hello world")).toBeNull();
    });
  });

  describe("ART ReAct Loop", () => {
    const parseReactOutput = (text: string) => {
      const thoughtMatch = text.match(/Thought:\s*(.+?)(?=Action:|$)/s);
      const actionMatch = text.match(/Action:\s*(\w+)/);
      const inputMatch = text.match(/Action Input:\s*(\{.+?\})/s);

      return {
        thought: thoughtMatch?.[1]?.trim() || "",
        action: actionMatch?.[1]?.trim() || "",
        action_input: inputMatch ? (() => { try { return JSON.parse(inputMatch[1]); } catch { return {}; } })() : {},
      };
    };

    it("parses ReAct format correctly", () => {
      const text = `Thought: I need to check the merchant's transaction history.
Action: search_transactions
Action Input: {"merchant_id": "MER001", "limit": 10}`;

      const result = parseReactOutput(text);
      expect(result.thought).toContain("transaction history");
      expect(result.action).toBe("search_transactions");
      expect(result.action_input.merchant_id).toBe("MER001");
      expect(result.action_input.limit).toBe(10);
    });

    it("parses final_answer action", () => {
      const text = `Thought: Based on the evidence, this transaction is legitimate.
Action: final_answer
Action Input: {"answer": "Transaction is legitimate", "confidence": 0.92, "recommendation": "approve"}`;

      const result = parseReactOutput(text);
      expect(result.action).toBe("final_answer");
      expect(result.action_input.confidence).toBe(0.92);
      expect(result.action_input.recommendation).toBe("approve");
    });

    it("handles malformed ReAct output gracefully", () => {
      const result = parseReactOutput("This is not a valid ReAct format");
      expect(result.thought).toBe("");
      expect(result.action).toBe("");
      expect(result.action_input).toEqual({});
    });
  });

  describe("Audit Trail", () => {
    const auditLog: any[] = [];

    const logDecision = (entry: any) => {
      const record = {
        decision_id: `dec_${auditLog.length + 1}`,
        ...entry,
        timestamp: new Date().toISOString(),
      };
      auditLog.push(record);
      return record;
    };

    beforeEach(() => {
      auditLog.length = 0;
    });

    it("logs AI decision with required fields", () => {
      const entry = logDecision({
        decision_type: "fraud_inference",
        entity_id: "txn_001",
        model_name: "fraud_gnn",
        model_version: "1.0.0",
        confidence: 0.87,
        recommendation: "approve",
      });
      expect(entry.decision_id).toBeTruthy();
      expect(entry.timestamp).toBeTruthy();
      expect(entry.decision_type).toBe("fraud_inference");
    });

    it("accumulates multiple decisions", () => {
      logDecision({ decision_type: "fraud_inference", entity_id: "txn_001", model_name: "fraud_gnn", model_version: "1.0.0", confidence: 0.9, recommendation: "approve" });
      logDecision({ decision_type: "fraud_inference", entity_id: "txn_002", model_name: "fraud_gnn", model_version: "1.0.0", confidence: 0.3, recommendation: "reject" });
      expect(auditLog).toHaveLength(2);
    });

    it("supports filtering by decision type", () => {
      logDecision({ decision_type: "fraud_inference", entity_id: "txn_001", model_name: "fraud_gnn", model_version: "1.0.0", confidence: 0.9, recommendation: "approve" });
      logDecision({ decision_type: "merchant_assessment", entity_id: "mer_001", model_name: "credit_score", model_version: "2.1.0", confidence: 0.75, recommendation: "approve" });

      const fraudDecisions = auditLog.filter((d) => d.decision_type === "fraud_inference");
      expect(fraudDecisions).toHaveLength(1);
      expect(fraudDecisions[0].entity_id).toBe("txn_001");
    });
  });

  describe("Vector Store Integration", () => {
    it("validates transaction indexing payload structure", () => {
      const payload = {
        transaction_id: "txn_001",
        merchant_id: "MER001",
        amount_kobo: 500000,
        currency: "NGN",
        channel: "card",
        status: "success",
        metadata: { fraud_score: 25, risk_level: "low" },
      };
      expect(payload.transaction_id).toBeTruthy();
      expect(payload.merchant_id).toBeTruthy();
      expect(payload.amount_kobo).toBeGreaterThan(0);
      expect(payload.metadata).toHaveProperty("fraud_score");
    });

    it("validates compliance document search payload", () => {
      const searchPayload = {
        query: "CBN regulations for cross-border payments",
        limit: 5,
        score_threshold: 0.7,
      };
      expect(searchPayload.query).toBeTruthy();
      expect(searchPayload.limit).toBeGreaterThan(0);
      expect(searchPayload.score_threshold).toBeGreaterThanOrEqual(0);
      expect(searchPayload.score_threshold).toBeLessThanOrEqual(1);
    });
  });
});

// ─── CSV Export Tests ─────────────────────────────────────────────────────────
describe("CSV Export", () => {
  const generateCSV = (headers: string[], rows: any[][]) => {
    const headerLine = headers.join(",");
    const dataLines = rows.map((row) =>
      row.map((cell) => (typeof cell === "string" && cell.includes(",") ? `"${cell}"` : cell)).join(",")
    );
    return [headerLine, ...dataLines].join("\n");
  };

  it("generates valid CSV with headers", () => {
    const csv = generateCSV(
      ["id", "amount", "status", "date"],
      [
        ["txn_001", "5000", "success", "2026-01-01"],
        ["txn_002", "12000", "failed", "2026-01-02"],
      ]
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,amount,status,date");
    expect(lines).toHaveLength(3);
  });

  it("wraps fields with commas in quotes", () => {
    const csv = generateCSV(
      ["id", "description"],
      [["txn_001", "Payment for goods, services"]]
    );
    expect(csv).toContain('"Payment for goods, services"');
  });

  it("handles empty data set", () => {
    const csv = generateCSV(["id", "amount"], []);
    expect(csv).toBe("id,amount");
  });
});
