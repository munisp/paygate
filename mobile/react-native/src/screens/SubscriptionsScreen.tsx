/**
 * SubscriptionsScreen — Wave 124
 * Merchant subscription plan management with real tRPC wiring
 * Uses trpc.subscriptions.list, trpc.subscriptions.stats, trpc.subscriptions.cancel
 */
import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView, Alert,
} from "react-native";
import { trpc } from "../lib/trpc";

const STATUS_COLORS: Record<string, string> = {
  active: "#10b981",
  trialing: "#3b82f6",
  past_due: "#f59e0b",
  cancelled: "#ef4444",
  paused: "#8b5cf6",
};

interface Subscription {
  id: string;
  planName: string;
  planCode: string;
  status: string;
  billingCycle: string;
  amountKobo: number;
  currency: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
}

export default function SubscriptionsScreen() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data, isLoading, refetch, isFetching } = trpc.subscriptions.list.useQuery({
    limit: 20,
    offset: 0,
    status: statusFilter,
  });

  const { data: stats } = trpc.subscriptions.stats.useQuery();

  const cancelMutation = trpc.subscriptions.cancel.useMutation({
    onSuccess: () => { Alert.alert("Cancelled", "Subscription cancelled at period end"); refetch(); },
    onError: (e) => Alert.alert("Error", e.message),
  });

  const pauseMutation = trpc.subscriptions.pause.useMutation({
    onSuccess: () => { Alert.alert("Paused", "Subscription paused"); refetch(); },
    onError: (e) => Alert.alert("Error", e.message),
  });

  const renderItem = ({ item }: { item: Subscription }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.planName}>{item.planName}</Text>
          <Text style={styles.planCode}>{item.planCode} · {item.billingCycle}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + "20" }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>
            {item.currency === "NGN" ? "₦" : "$"}{(item.amountKobo / 100).toLocaleString()}
          </Text>
          <Text style={styles.metricLabel}>Amount</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>{new Date(item.currentPeriodEnd).toLocaleDateString()}</Text>
          <Text style={styles.metricLabel}>Renews</Text>
        </View>
      </View>
      {item.cancelAtPeriodEnd && (
        <View style={styles.cancelWarning}>
          <Text style={styles.cancelWarningText}>⚠️ Cancels at period end</Text>
        </View>
      )}
      {item.status === "active" && !item.cancelAtPeriodEnd && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#f59e0b20", borderColor: "#f59e0b" }]}
            onPress={() => pauseMutation.mutate({ id: item.id })}
          >
            <Text style={[styles.actionBtnText, { color: "#f59e0b" }]}>Pause</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#ef444420", borderColor: "#ef4444" }]}
            onPress={() => Alert.alert("Cancel Subscription", "Cancel at period end?", [
              { text: "No" },
              { text: "Yes", style: "destructive", onPress: () => cancelMutation.mutate({ id: item.id }) },
            ])}
          >
            <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {stats && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: "#10b981" }]}>
            <Text style={[styles.statValue, { color: "#10b981" }]}>{stats.active ?? 0}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#3b82f6" }]}>
            <Text style={[styles.statValue, { color: "#3b82f6" }]}>{stats.trialing ?? 0}</Text>
            <Text style={styles.statLabel}>Trialing</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#f59e0b" }]}>
            <Text style={[styles.statValue, { color: "#f59e0b" }]}>{stats.pastDue ?? 0}</Text>
            <Text style={styles.statLabel}>Past Due</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#ef4444" }]}>
            <Text style={[styles.statValue, { color: "#ef4444" }]}>{stats.cancelled ?? 0}</Text>
            <Text style={styles.statLabel}>Cancelled</Text>
          </View>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {[undefined, "active", "trialing", "past_due", "cancelled", "paused"].map(s => (
          <TouchableOpacity
            key={s ?? "all"}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
              {s ?? "All"}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data?.rows ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No subscriptions found</Text>}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  statsRow: { flexDirection: "row", padding: 12, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 8, padding: 10,
    borderLeftWidth: 3, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  statLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  filterRow: { paddingHorizontal: 12, paddingVertical: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "#f1f5f9", marginRight: 8, borderWidth: 1, borderColor: "#e2e8f0",
  },
  filterChipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  filterChipText: { fontSize: 13, color: "#64748b" },
  filterChipTextActive: { color: "#fff", fontWeight: "600" },
  card: {
    backgroundColor: "#fff", marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, padding: 14, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  planName: { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  planCode: { fontSize: 12, color: "#64748b", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: "600" },
  cardBody: { flexDirection: "row", marginBottom: 10 },
  metricBox: { flex: 1 },
  metricValue: { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  metricLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  cancelWarning: { backgroundColor: "#fef3c7", borderRadius: 6, padding: 8, marginBottom: 8 },
  cancelWarningText: { fontSize: 12, color: "#92400e" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: "600" },
  emptyText: { textAlign: "center", color: "#94a3b8", marginTop: 60, fontSize: 15 },
});
