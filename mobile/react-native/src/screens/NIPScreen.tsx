/**
 * NIPScreen — React Native
 * NIP (NIBSS Instant Payment) transfers: initiate, track, history.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
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

interface NIPTransfer {
  id: string;
  amount: number;
  beneficiaryName: string;
  beneficiaryAccount: string;
  bankCode: string;
  status: string;
  sessionId: string;
  createdAt: string;
}

export default function NIPScreen() {
  const { trpc } = useTrpc();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch, error } = trpc.nip.listTransfers.useQuery(
    { page: 1, limit: 20 },
    { staleTime: 30_000 }
  );

  const transfers: NIPTransfer[] = (data as any)?.items ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getStatusColor = (status: string) => {
    if (status === "completed" || status === "success") return colors.success;
    if (status === "failed") return colors.danger;
    return colors.warning;
  };

  const renderTransfer = ({ item }: { item: NIPTransfer }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.beneficiaryName}>{item.beneficiaryName}</Text>
          <Text style={styles.accountText}>{item.beneficiaryAccount} · {item.bankCode}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "22" }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.amount}>₦{(item.amount / 100).toLocaleString()}</Text>
        <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      {item.sessionId && (
        <Text style={styles.sessionId}>Session: {item.sessionId}</Text>
      )}
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
      <View style={styles.header}>
        <Text style={styles.title}>NIP Transfers</Text>
        <TouchableOpacity style={styles.newBtn}>
          <Text style={styles.newBtnText}>+ New Transfer</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={transfers}
        keyExtractor={(item) => item.id}
        renderItem={renderTransfer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No NIP transfers found.</Text>
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  newBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  newBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  list: { paddingBottom: 24 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  beneficiaryName: { fontSize: 15, fontWeight: "600", color: colors.text },
  accountText: { fontSize: 12, color: colors.muted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: "600" },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amount: { fontSize: 18, fontWeight: "700", color: colors.text },
  date: { fontSize: 12, color: colors.muted },
  sessionId: { fontSize: 11, color: colors.muted, marginTop: 6 },
  emptyText: { color: colors.muted, fontSize: 14 },
});
