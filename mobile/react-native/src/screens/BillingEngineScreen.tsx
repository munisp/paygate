/**
 * PayGate Merchant Portal — Billing Engine Screen (React Native)
 * Displays billing configurations, fee schedules, and billing events.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { trpc } from "../lib/trpc";

const colors = {
  primary: "#6366F1",
  background: "#0F172A",
  card: "#1E293B",
  text: "#F1F5F9",
  muted: "#94A3B8",
  border: "#334155",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  accent: "#8B5CF6",
};

interface BillingConfig {
  id: string;
  tier: string;
  flatFeeKobo: number;
  percentageBps: number;
  capKobo: number;
  isActive: boolean;
}

interface BillingEvent {
  id: string;
  eventType: string;
  merchantId: string;
  amountKobo: number;
  feeKobo: number;
  status: string;
  createdAt: string;
}

// Static fallback configs shown when no DB config is provisioned yet
const FALLBACK_CONFIGS: BillingConfig[] = [
  { id: "starter", tier: "Starter", flatFeeKobo: 10000, percentageBps: 150, capKobo: 500000, isActive: true },
  { id: "growth", tier: "Growth", flatFeeKobo: 5000, percentageBps: 100, capKobo: 300000, isActive: true },
  { id: "enterprise", tier: "Enterprise", flatFeeKobo: 0, percentageBps: 75, capKobo: 200000, isActive: true },
];

function fmtNGN(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function BillingEngineScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<"configs" | "events">("configs");
  const [refreshing, setRefreshing] = useState(false);

  // Real tRPC data — billing config and events
  const { data: activeConfig, isLoading: configLoading, refetch: refetchConfig } =
    (trpc as any)["billing"]?.["getActive"]?.useQuery?.({ tenantId: "" }) ??
    { data: null, isLoading: false, refetch: async () => {} };

  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } =
    (trpc as any)["billing"]?.["listBillingEvents"]?.useQuery?.({ tenantId: "", limit: 50 }) ??
    { data: [], isLoading: false, refetch: async () => {} };

  const liveEvents: BillingEvent[] = (eventsData ?? []).map((e: any) => ({
    id: e.id,
    eventType: e.eventType ?? "transaction",
    merchantId: e.merchantId ?? "",
    amountKobo: e.transactionAmountKobo ?? e.amountKobo ?? 0,
    feeKobo: e.grossFeeKobo ?? e.feeKobo ?? 0,
    status: e.status ?? "unknown",
    createdAt: e.occurredAt ?? e.createdAt ?? new Date().toISOString(),
  }));

  const displayConfigs: BillingConfig[] = activeConfig
    ? [{ id: activeConfig.id ?? "active", tier: activeConfig.tier ?? "custom", flatFeeKobo: activeConfig.feeCapKobo ?? 0, percentageBps: Math.round((activeConfig.feeRate ?? 0) * 10000), capKobo: activeConfig.feeCapKobo ?? 0, isActive: true }]
    : FALLBACK_CONFIGS;

  const displayEvents: BillingEvent[] = liveEvents.length > 0 ? liveEvents : [];

  const isLoading = configLoading || eventsLoading;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchConfig(), refetchEvents()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchConfig, refetchEvents]);

  // Derive live summary metrics
  const feesToday = displayEvents
    .filter(e => new Date(e.createdAt).toDateString() === new Date().toDateString())
    .reduce((s, e) => s + e.feeKobo, 0);
  const pendingCount = displayEvents.filter(e => e.status === "pending").length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Billing Engine</Text>
        <Text style={styles.headerSubtitle}>Fee schedules & billing events</Text>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { borderLeftColor: colors.primary }]}>
          <Text style={styles.summaryValue}>{displayConfigs.length}</Text>
          <Text style={styles.summaryLabel}>Active Tiers</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: colors.success }]}>
          <Text style={styles.summaryValue}>{fmtNGN(feesToday)}</Text>
          <Text style={styles.summaryLabel}>Fees Today</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: colors.warning }]}>
          <Text style={styles.summaryValue}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "configs" && styles.tabActive]}
          onPress={() => setActiveTab("configs")}
        >
          <Text style={[styles.tabText, activeTab === "configs" && styles.tabTextActive]}>
            Fee Schedules
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "events" && styles.tabActive]}
          onPress={() => setActiveTab("events")}
        >
          <Text style={[styles.tabText, activeTab === "events" && styles.tabTextActive]}>
            Billing Events
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : activeTab === "configs" ? (
          <View style={styles.section}>
            {displayConfigs.map((config) => (
              <View key={config.id} style={styles.configCard}>
                <View style={styles.configHeader}>
                  <Text style={styles.configTier}>{config.tier}</Text>
                  <View style={[styles.badge, config.isActive ? styles.badgeSuccess : styles.badgeMuted]}>
                    <Text style={styles.badgeText}>{config.isActive ? "Active" : "Inactive"}</Text>
                  </View>
                </View>
                <View style={styles.configGrid}>
                  <View style={styles.configItem}>
                    <Text style={styles.configLabel}>Flat Fee</Text>
                    <Text style={styles.configValue}>{fmtNGN(config.flatFeeKobo)}</Text>
                  </View>
                  <View style={styles.configItem}>
                    <Text style={styles.configLabel}>Rate</Text>
                    <Text style={styles.configValue}>{fmtBps(config.percentageBps)}</Text>
                  </View>
                  <View style={styles.configItem}>
                    <Text style={styles.configLabel}>Cap</Text>
                    <Text style={styles.configValue}>{fmtNGN(config.capKobo)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.section}>
            {displayEvents.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>No billing events yet.</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Events appear once transactions are processed.</Text>
              </View>
            ) : displayEvents.map((event) => (
              <View key={event.id} style={styles.eventCard}>
                <View style={styles.eventHeader}>
                  <Text style={styles.eventType}>{event.eventType}</Text>
                  <View style={[
                    styles.badge,
                    event.status === "processed" ? styles.badgeSuccess : styles.badgeWarning,
                  ]}>
                    <Text style={styles.badgeText}>{event.status}</Text>
                  </View>
                </View>
                <View style={styles.eventDetails}>
                  <View style={styles.eventRow}>
                    <Text style={styles.eventLabel}>Amount</Text>
                    <Text style={styles.eventValue}>{fmtNGN(event.amountKobo)}</Text>
                  </View>
                  <View style={styles.eventRow}>
                    <Text style={styles.eventLabel}>Fee</Text>
                    <Text style={[styles.eventValue, { color: colors.primary }]}>{fmtNGN(event.feeKobo)}</Text>
                  </View>
                  <View style={styles.eventRow}>
                    <Text style={styles.eventLabel}>Merchant</Text>
                    <Text style={styles.eventValue}>{event.merchantId}</Text>
                  </View>
                  <View style={styles.eventRow}>
                    <Text style={styles.eventLabel}>Time</Text>
                    <Text style={styles.eventValue}>{timeAgo(event.createdAt)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: "700", color: colors.text },
  headerSubtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  summaryRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  summaryCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: 12,
    borderLeftWidth: 3,
  },
  summaryValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  summaryLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  tabBar: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.card, borderRadius: 8, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 6 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: "500", color: colors.muted },
  tabTextActive: { color: colors.text },
  content: { flex: 1 },
  section: { paddingHorizontal: 16, gap: 10 },
  configCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 2 },
  configHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  configTier: { fontSize: 16, fontWeight: "700", color: colors.text },
  configGrid: { flexDirection: "row", gap: 8 },
  configItem: { flex: 1 },
  configLabel: { fontSize: 11, color: colors.muted, marginBottom: 2 },
  configValue: { fontSize: 14, fontWeight: "600", color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeSuccess: { backgroundColor: "rgba(34,197,94,0.15)" },
  badgeWarning: { backgroundColor: "rgba(245,158,11,0.15)" },
  badgeMuted: { backgroundColor: "rgba(148,163,184,0.15)" },
  badgeText: { fontSize: 11, fontWeight: "600", color: colors.text },
  eventCard: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 2 },
  eventHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  eventType: { fontSize: 13, fontWeight: "600", color: colors.text, flex: 1, marginRight: 8 },
  eventDetails: { gap: 6 },
  eventRow: { flexDirection: "row", justifyContent: "space-between" },
  eventLabel: { fontSize: 12, color: colors.muted },
  eventValue: { fontSize: 12, fontWeight: "500", color: colors.text },
});
