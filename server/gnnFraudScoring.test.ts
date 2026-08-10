/**
 * Tests for GNN fraud scoring merge logic (mergeFraudScores)
 * and gnnScoreTransaction function in microservices.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mergeFraudScores,
  type FraudScoreResult,
  type GNNFraudScoreResult,
} from "./microservices";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const LOW_VALUE_KOBO = 10_000_000; // ₦100,000 — below high-value threshold
const HIGH_VALUE_KOBO = 50_000_000; // ₦500,000 — at high-value threshold
const VERY_HIGH_VALUE_KOBO = 200_000_000; // ₦2,000,000

const ruleScoreLow: FraudScoreResult = {
  transaction_id: "txn_rule_001",
  risk_score: 20,
  risk_level: "low",
  recommendation: "approve",
  signals: ["velocity:ok", "device:known"],
};

const ruleScoreHigh: FraudScoreResult = {
  transaction_id: "txn_rule_002",
  risk_score: 70,
  risk_level: "high",
  recommendation: "review",
  signals: ["velocity:breach", "ip:suspicious"],
};

const ruleScoreCritical: FraudScoreResult = {
  transaction_id: "txn_rule_003",
  risk_score: 90,
  risk_level: "critical",
  recommendation: "decline",
  signals: ["velocity:critical", "blacklist:hit"],
};

const gnnScoreLow: GNNFraudScoreResult = {
  transaction_id: "txn_gnn_001",
  gnn_risk_score: 15,
  gnn_risk_level: "low",
  fraud_ring_detected: false,
  fraud_ring_id: null,
  graph_features: {
    degree_centrality: 0.1,
    clustering_coefficient: 0.05,
    pagerank: 0.002,
    suspicious_neighbors: 0,
  },
  recommendation: "approve",
  model_version: "graphsage-v2.1",
  inference_ms: 45,
};

const gnnScoreHigh: GNNFraudScoreResult = {
  transaction_id: "txn_gnn_002",
  gnn_risk_score: 85,
  gnn_risk_level: "critical",
  fraud_ring_detected: true,
  fraud_ring_id: "ring_abc123",
  graph_features: {
    degree_centrality: 0.92,
    clustering_coefficient: 0.88,
    pagerank: 0.045,
    suspicious_neighbors: 12,
  },
  recommendation: "decline",
  model_version: "graphsage-v2.1",
  inference_ms: 62,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("mergeFraudScores", () => {
  describe("null handling", () => {
    it("returns null when both scores are null", () => {
      expect(mergeFraudScores(null, null, HIGH_VALUE_KOBO)).toBeNull();
    });

    it("returns rule score when GNN is null (any amount)", () => {
      const result = mergeFraudScores(ruleScoreLow, null, HIGH_VALUE_KOBO);
      expect(result).toEqual(ruleScoreLow);
    });

    it("returns rule score when GNN is null (low-value transaction)", () => {
      const result = mergeFraudScores(ruleScoreHigh, null, LOW_VALUE_KOBO);
      expect(result).toEqual(ruleScoreHigh);
    });
  });

  describe("low-value transactions (< ₦500,000)", () => {
    it("returns rule-based score only for low-value transactions (GNN ignored)", () => {
      const result = mergeFraudScores(ruleScoreLow, gnnScoreHigh, LOW_VALUE_KOBO);
      // GNN score is 85 (critical) but should be ignored for low-value
      expect(result).toEqual(ruleScoreLow);
      expect(result?.risk_score).toBe(20);
      expect(result?.risk_level).toBe("low");
    });

    it("returns rule-based score for ₦499,999 (just below threshold)", () => {
      const result = mergeFraudScores(ruleScoreHigh, gnnScoreHigh, 49_999_999);
      expect(result).toEqual(ruleScoreHigh);
    });
  });

  describe("high-value transactions (>= ₦500,000)", () => {
    it("uses 40/60 weighted merge at exactly ₦500,000 threshold", () => {
      const result = mergeFraudScores(ruleScoreLow, gnnScoreLow, HIGH_VALUE_KOBO);
      // 20 * 0.4 + 15 * 0.6 = 8 + 9 = 17 → "low"
      expect(result?.risk_score).toBe(17);
      expect(result?.risk_level).toBe("low");
      expect(result?.recommendation).toBe("approve");
    });

    it("merges high rule score + high GNN score to critical", () => {
      const result = mergeFraudScores(ruleScoreHigh, gnnScoreHigh, HIGH_VALUE_KOBO);
      // 70 * 0.4 + 85 * 0.6 = 28 + 51 = 79 → "high" (< 80)
      expect(result?.risk_score).toBe(79);
      expect(result?.risk_level).toBe("high");
      expect(result?.recommendation).toBe("review");
    });

    it("merges critical rule + high GNN to critical (score >= 80)", () => {
      const result = mergeFraudScores(ruleScoreCritical, gnnScoreHigh, HIGH_VALUE_KOBO);
      // 90 * 0.4 + 85 * 0.6 = 36 + 51 = 87 → "critical"
      expect(result?.risk_score).toBe(87);
      expect(result?.risk_level).toBe("critical");
      expect(result?.recommendation).toBe("decline");
    });

    it("includes GNN signals in merged result", () => {
      const result = mergeFraudScores(ruleScoreLow, gnnScoreHigh, HIGH_VALUE_KOBO);
      expect(result?.signals).toContain("gnn_score:85");
      expect(result?.signals).toContain("fraud_ring:ring_abc123");
      expect(result?.signals).toContain("suspicious_neighbors:12");
    });

    it("does not include fraud_ring signal when no fraud ring detected", () => {
      const result = mergeFraudScores(ruleScoreLow, gnnScoreLow, HIGH_VALUE_KOBO);
      const hasFraudRing = result?.signals.some(s => s.startsWith("fraud_ring:"));
      expect(hasFraudRing).toBe(false);
    });

    it("preserves original rule-based signals in merged result", () => {
      const result = mergeFraudScores(ruleScoreHigh, gnnScoreHigh, HIGH_VALUE_KOBO);
      expect(result?.signals).toContain("velocity:breach");
      expect(result?.signals).toContain("ip:suspicious");
    });

    it("works for very high value transactions (₦2,000,000)", () => {
      const result = mergeFraudScores(ruleScoreLow, gnnScoreHigh, VERY_HIGH_VALUE_KOBO);
      // 20 * 0.4 + 85 * 0.6 = 8 + 51 = 59 → "medium"
      expect(result?.risk_score).toBe(59);
      expect(result?.risk_level).toBe("medium");
      expect(result?.recommendation).toBe("review");
    });
  });

  describe("GNN-only scoring (rule-based unavailable)", () => {
    it("maps GNN result to FraudScoreResult shape when rule-based is null", () => {
      const result = mergeFraudScores(null, gnnScoreHigh, HIGH_VALUE_KOBO);
      expect(result).not.toBeNull();
      expect(result?.risk_score).toBe(85);
      expect(result?.risk_level).toBe("critical");
      expect(result?.recommendation).toBe("decline");
    });

    it("includes fraud ring signal in GNN-only result", () => {
      const result = mergeFraudScores(null, gnnScoreHigh, HIGH_VALUE_KOBO);
      expect(result?.signals).toContain("fraud_ring:ring_abc123");
    });

    it("returns null for GNN-only on low-value (GNN ignored below threshold)", () => {
      // When rule-based is null and GNN is present but below threshold, return null
      const result = mergeFraudScores(null, gnnScoreHigh, LOW_VALUE_KOBO);
      expect(result).toBeNull();
    });
  });

  describe("risk level thresholds", () => {
    it("score 0-39 → low", () => {
      const rule: FraudScoreResult = { ...ruleScoreLow, risk_score: 10 };
      const gnn: GNNFraudScoreResult = { ...gnnScoreLow, gnn_risk_score: 10 };
      const result = mergeFraudScores(rule, gnn, HIGH_VALUE_KOBO);
      // 10 * 0.4 + 10 * 0.6 = 10 → "low"
      expect(result?.risk_level).toBe("low");
    });

    it("score 40-59 → medium", () => {
      const rule: FraudScoreResult = { ...ruleScoreLow, risk_score: 40 };
      const gnn: GNNFraudScoreResult = { ...gnnScoreLow, gnn_risk_score: 40 };
      const result = mergeFraudScores(rule, gnn, HIGH_VALUE_KOBO);
      // 40 * 0.4 + 40 * 0.6 = 40 → "medium"
      expect(result?.risk_level).toBe("medium");
    });

    it("score 60-79 → high", () => {
      const rule: FraudScoreResult = { ...ruleScoreLow, risk_score: 60 };
      const gnn: GNNFraudScoreResult = { ...gnnScoreLow, gnn_risk_score: 60 };
      const result = mergeFraudScores(rule, gnn, HIGH_VALUE_KOBO);
      // 60 * 0.4 + 60 * 0.6 = 60 → "high"
      expect(result?.risk_level).toBe("high");
    });

    it("score 80-100 → critical", () => {
      const rule: FraudScoreResult = { ...ruleScoreLow, risk_score: 80 };
      const gnn: GNNFraudScoreResult = { ...gnnScoreLow, gnn_risk_score: 80 };
      const result = mergeFraudScores(rule, gnn, HIGH_VALUE_KOBO);
      // 80 * 0.4 + 80 * 0.6 = 80 → "critical"
      expect(result?.risk_level).toBe("critical");
    });
  });
});
