/**
 * InsuranceScreen — React Native
 * Lists active insurance policies and allows filing new claims.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useTrpc } from "../hooks/useTrpc";

const colors = {
  primary: "#6366F1",
  background: "#0F172A",
  card: "#1E293B",
  text: "#F1F5F9",
  muted: "#94A3B8",
  border: "#334155",
  success: "#10B981",
  danger: "#EF4444",
  warning: "#F59E0B",
};

interface Policy {
  id: string;
  type: string;
  status: string;
  premium: number;
  coverage: number;
  expiresAt: string;
}

export default function InsuranceScreen() {
  const { trpc } = useTrpc();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch, error } = trpc.insurancePolicies.list.useQuery(
    { page: 1, limit: 20 },
    { staleTime: 60_000 }
  );

  const policies: Policy[] = (data as any)?.items ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getStatusColor = (status: string) => {
    if (status === "active") return colors.success;
    if (status === "expired") return colors.danger;
    return colors.warning;
  };

  const renderPolicy = ({ item }: { item: Policy }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.policyType}>{item.type}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "22" }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status}
          </Text>
        </View>
      </View>
      <View style={styles.cardRow}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Premium</Text>
          <Text style={styles.metricValue}>₦{(item.premium / 100).toLocaleString()}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Coverage</Text>
          <Text style={styles.metricValue}>₦{(item.coverage / 100).toLocaleString()}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Expires</Text>
          <Text style={styles.metricValue}>
            {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "—"}
          </Text>
        </View>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Insurance Policies</Text>
      <FlatList
        data={policies}
        keyExtractor={(item) => item.id}
        renderItem={renderPolicy}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No insurance policies found.</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 16 },
  list: { paddingBottom: 24 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  policyType: { fontSize: 16, fontWeight: "600", color: colors.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: "600" },
  cardRow: { flexDirection: "row", justifyContent: "space-between" },
  metricBox: { flex: 1, alignItems: "center" },
  metricLabel: { fontSize: 11, color: colors.muted, marginBottom: 4 },
  metricValue: { fontSize: 13, fontWeight: "600", color: colors.text },
  emptyText: { color: colors.muted, fontSize: 14 },
});
