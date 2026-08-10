/**
 * Billing Engine Screen — React Native (Expo Router)
 * Wave 116 — Mobile parity for billing config management
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../src/lib/trpc";

// ── Types ─────────────────────────────────────────────────────────────────────

type BillingConfig = {
  id: string;
  tenantId: string;
  status: string;
  active: boolean;
  pricingModel: string;
  feeRate: number;
  feeCapKobo: number;
  platformShare: number;
  resellerShare: number;
  signOnFeeKobo: number;
  subscriptionFeeKobo: number;
  version: number;
  effectiveFrom?: string;
  notes?: string;
};

type AuditEntry = {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  reason?: string;
  createdAt: string;
};

// ── Tab types ─────────────────────────────────────────────────────────────────
type Tab = "config" | "history" | "audit";

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function BillingEngineScreen() {
  const [activeTab, setActiveTab] = useState<Tab>("config");
  const DEMO_TENANT_ID = "tenant-demo-001";

  const {
    data: activeConfig,
    isLoading: configLoading,
    refetch: refetchConfig,
  } = trpc.billing.getActive.useQuery({ tenantId: DEMO_TENANT_ID });

  const {
    data: versions,
    isLoading: versionsLoading,
    refetch: refetchVersions,
  } = trpc.billing.listVersions.useQuery({ tenantId: DEMO_TENANT_ID });

  const {
    data: auditLog,
    isLoading: auditLoading,
    refetch: refetchAudit,
  } = trpc.billing.getAuditLog.useQuery({ tenantId: DEMO_TENANT_ID, limit: 50, offset: 0 });

  const isLoading = configLoading || versionsLoading || auditLoading;

  const onRefresh = useCallback(async () => {
    await Promise.all([refetchConfig(), refetchVersions(), refetchAudit()]);
  }, [refetchConfig, refetchVersions, refetchAudit]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Billing Engine</Text>
        {activeConfig && (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>v{activeConfig.version} ACTIVE</Text>
          </View>
        )}
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(["config", "history", "audit"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab === "config" ? "Active Config" : tab === "history" ? "History" : "Audit Log"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
      >
        {activeTab === "config" && (
          <ActiveConfigTab config={activeConfig ?? null} loading={configLoading} />
        )}
        {activeTab === "history" && (
          <VersionHistoryTab versions={versions ?? []} loading={versionsLoading} />
        )}
        {activeTab === "audit" && (
          <AuditLogTab entries={auditLog?.entries ?? []} loading={auditLoading} />
        )}
      </ScrollView>
    </View>
  );
}

// ── Active Config Tab ─────────────────────────────────────────────────────────

function ActiveConfigTab({ config, loading }: { config: BillingConfig | null; loading: boolean }) {
  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!config) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🧮</Text>
        <Text style={styles.emptyTitle}>No Active Billing Config</Text>
        <Text style={styles.emptySubtitle}>Contact your platform admin to set up billing.</Text>
      </View>
    );
  }

  const fmtKobo = (k: number) => `₦${(k / 100).toLocaleString()}`;
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <View style={styles.configContainer}>
      <MetricCard
        label="Pricing Model"
        value={config.pricingModel.toUpperCase().replace("_", " ")}
        color="#3B82F6"
        emoji="💳"
      />
      <MetricCard
        label="Fee Rate"
        value={fmtPct(config.feeRate)}
        subtitle={`Cap: ${fmtKobo(config.feeCapKobo)}`}
        color="#10B981"
        emoji="📊"
      />
      <View style={styles.row}>
        <MetricCard
          label="Platform"
          value={fmtPct(config.platformShare)}
          color="#8B5CF6"
          emoji="🏢"
          small
        />
        <MetricCard
          label="Reseller"
          value={fmtPct(config.resellerShare)}
          color="#F59E0B"
          emoji="🤝"
          small
        />
      </View>
      {config.signOnFeeKobo > 0 && (
        <MetricCard
          label="Sign-On Fee"
          value={fmtKobo(config.signOnFeeKobo)}
          color="#14B8A6"
          emoji="✍️"
        />
      )}
      {config.subscriptionFeeKobo > 0 && (
        <MetricCard
          label="Monthly Subscription"
          value={`${fmtKobo(config.subscriptionFeeKobo)}/mo`}
          color="#6366F1"
          emoji="🔄"
        />
      )}
      {config.notes && (
        <View style={styles.notesCard}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesText}>{config.notes}</Text>
        </View>
      )}
    </View>
  );
}

// ── Version History Tab ───────────────────────────────────────────────────────

function VersionHistoryTab({ versions, loading }: { versions: BillingConfig[]; loading: boolean }) {
  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!versions.length) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No version history</Text>
      </View>
    );
  }
  return (
    <View style={styles.listContainer}>
      {versions.map((v) => (
        <View key={v.id} style={styles.versionRow}>
          <View style={[styles.versionBadge, { backgroundColor: v.active ? "#10B981" : "#9CA3AF" }]}>
            <Text style={styles.versionBadgeText}>v{v.version}</Text>
          </View>
          <View style={styles.versionInfo}>
            <Text style={styles.versionModel}>{v.pricingModel.replace("_", " ").toUpperCase()}</Text>
            <Text style={styles.versionDetail}>
              {(v.feeRate * 100).toFixed(2)}% · {(v.platformShare * 100).toFixed(0)}/{(v.resellerShare * 100).toFixed(0)} split
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: statusColor(v.status) + "20" }]}>
            <Text style={[styles.statusChipText, { color: statusColor(v.status) }]}>{v.status}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────

function AuditLogTab({ entries, loading }: { entries: AuditEntry[]; loading: boolean }) {
  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!entries.length) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No audit entries</Text>
      </View>
    );
  }
  return (
    <View style={styles.listContainer}>
      {entries.map((e) => (
        <View key={e.id} style={styles.auditRow}>
          <Text style={styles.auditAction}>{e.action.toUpperCase()}</Text>
          <Text style={styles.auditMeta}>
            {e.actorRole} · {e.actorId}
          </Text>
          {e.reason && <Text style={styles.auditReason}>{e.reason}</Text>}
          <Text style={styles.auditDate}>{new Date(e.createdAt).toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Helper Components ─────────────────────────────────────────────────────────

function MetricCard({
  label, value, subtitle, color, emoji, small,
}: {
  label: string; value: string; subtitle?: string; color: string; emoji: string; small?: boolean;
}) {
  return (
    <View style={[styles.metricCard, small && styles.metricCardSmall]}>
      <Text style={styles.metricEmoji}>{emoji}</Text>
      <View style={styles.metricContent}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
        {subtitle && <Text style={styles.metricSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "active": return "#10B981";
    case "draft": return "#3B82F6";
    case "superseded": return "#9CA3AF";
    default: return "#F59E0B";
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12,
    backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  activeBadge: { backgroundColor: "#D1FAE5", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  activeBadgeText: { fontSize: 11, fontWeight: "700", color: "#065F46" },
  tabBar: {
    flexDirection: "row", backgroundColor: "#FFFFFF",
    borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  activeTab: { borderBottomWidth: 2, borderBottomColor: "#3B82F6" },
  tabText: { fontSize: 13, color: "#6B7280" },
  activeTabText: { color: "#3B82F6", fontWeight: "600" },
  content: { flex: 1 },
  configContainer: { padding: 16, gap: 12 },
  row: { flexDirection: "row", gap: 12 },
  metricCard: {
    backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16,
    flexDirection: "row", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  metricCardSmall: { flex: 1 },
  metricEmoji: { fontSize: 28, marginRight: 12 },
  metricContent: { flex: 1 },
  metricLabel: { fontSize: 12, color: "#6B7280", marginBottom: 2 },
  metricValue: { fontSize: 22, fontWeight: "700" },
  metricSubtitle: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  notesCard: {
    backgroundColor: "#FFF7ED", borderRadius: 12, padding: 16,
    borderLeftWidth: 3, borderLeftColor: "#F59E0B",
  },
  notesLabel: { fontSize: 12, color: "#92400E", fontWeight: "600", marginBottom: 4 },
  notesText: { fontSize: 13, color: "#78350F" },
  listContainer: { padding: 16, gap: 8 },
  versionRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF",
    borderRadius: 10, padding: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  versionBadge: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  versionBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  versionInfo: { flex: 1 },
  versionModel: { fontSize: 13, fontWeight: "600", color: "#111827" },
  versionDetail: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusChipText: { fontSize: 11, fontWeight: "600" },
  auditRow: {
    backgroundColor: "#FFFFFF", borderRadius: 10, padding: 14, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: "#3B82F6",
  },
  auditAction: { fontSize: 12, fontWeight: "700", color: "#1D4ED8", marginBottom: 2 },
  auditMeta: { fontSize: 12, color: "#6B7280" },
  auditReason: { fontSize: 12, color: "#374151", marginTop: 4, fontStyle: "italic" },
  auditDate: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  emptyState: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#374151", textAlign: "center" },
  emptySubtitle: { fontSize: 13, color: "#9CA3AF", textAlign: "center", marginTop: 8 },
});
