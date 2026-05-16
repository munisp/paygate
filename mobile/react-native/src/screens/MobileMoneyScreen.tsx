/**
 * MobileMoneyScreen — React Native
 * Mobile money wallet management: balance, send, receive, history.
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
};

interface MobileMoneyTx {
  id: string;
  type: string;
  amount: number;
  phone: string;
  status: string;
  createdAt: string;
}

export default function MobileMoneyScreen() {
  const { trpc } = useTrpc();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = trpc.mobileMoney.listTransactions.useQuery(
    { page: 1, limit: 20 },
    { staleTime: 30_000 }
  );

  const transactions: MobileMoneyTx[] = (data as any)?.items ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderTx = ({ item }: { item: MobileMoneyTx }) => (
    <View style={styles.txRow}>
      <View style={styles.txInfo}>
        <Text style={styles.txPhone}>{item.phone}</Text>
        <Text style={styles.txDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, { color: item.type === "credit" ? colors.success : colors.danger }]}>
          {item.type === "credit" ? "+" : "-"}₦{(item.amount / 100).toLocaleString()}
        </Text>
        <Text style={styles.txStatus}>{item.status}</Text>
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
      <Text style={styles.title}>Mobile Money</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionText}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnOutline]}>
          <Text style={[styles.actionText, { color: colors.primary }]}>Receive</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionTitle}>Recent Transactions</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTx}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No mobile money transactions yet.</Text>
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
  actionsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  actionBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  actionBtnOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.primary },
  actionText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 12 },
  list: { paddingBottom: 24 },
  txRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  txInfo: { flex: 1 },
  txPhone: { fontSize: 14, color: colors.text, marginBottom: 2 },
  txDate: { fontSize: 12, color: colors.muted },
  txRight: { alignItems: "flex-end" },
  txAmount: { fontSize: 15, fontWeight: "700" },
  txStatus: { fontSize: 11, color: colors.muted, marginTop: 2 },
  emptyText: { color: colors.muted, fontSize: 14 },
});
