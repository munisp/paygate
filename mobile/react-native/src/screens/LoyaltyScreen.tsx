/**
 * LoyaltyScreen — React Native
 * Shows loyalty points balance and transaction history.
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
  warning: "#F59E0B",
};

interface LoyaltyTx {
  id: string;
  type: string;
  points: number;
  description: string;
  createdAt: string;
}

export default function LoyaltyScreen() {
  const { trpc } = useTrpc();
  const [refreshing, setRefreshing] = useState(false);

  const { data: accountData, isLoading: accountLoading, refetch: refetchAccount, error } =
    trpc.loyalty.getAccount.useQuery(undefined, { staleTime: 30_000 });

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } =
    trpc.loyalty.getHistory.useQuery({ limit: 20 }, { staleTime: 30_000 });

  const account = (accountData as any) ?? null;
  const history: LoyaltyTx[] = (historyData as any)?.items ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAccount(), refetchHistory()]);
    setRefreshing(false);
  }, [refetchAccount, refetchHistory]);

  const renderTx = ({ item }: { item: LoyaltyTx }) => (
    <View style={styles.txRow}>
      <View style={styles.txInfo}>
        <Text style={styles.txDesc}>{item.description}</Text>
        <Text style={styles.txDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <Text style={[styles.txPoints, { color: item.type === "earn" ? colors.success : colors.warning }]}>
        {item.type === "earn" ? "+" : "-"}{item.points} pts
      </Text>
    </View>
  );

  if (accountLoading || historyLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {account && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Points</Text>
          <Text style={styles.balanceValue}>{(account.pointsBalance ?? 0).toLocaleString()}</Text>
          <Text style={styles.tierLabel}>Tier: {account.tier ?? "Bronze"}</Text>
        </View>
      )}
      <Text style={styles.sectionTitle}>Transaction History</Text>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderTx}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No loyalty transactions yet.</Text>
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
  balanceCard: { backgroundColor: colors.primary, borderRadius: 16, padding: 24, marginBottom: 20, alignItems: "center" },
  balanceLabel: { fontSize: 14, color: "#fff", opacity: 0.8 },
  balanceValue: { fontSize: 40, fontWeight: "800", color: "#fff", marginVertical: 4 },
  tierLabel: { fontSize: 14, color: "#fff", opacity: 0.9 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 12 },
  list: { paddingBottom: 24 },
  txRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 14, color: colors.text, marginBottom: 2 },
  txDate: { fontSize: 12, color: colors.muted },
  txPoints: { fontSize: 15, fontWeight: "700" },
  emptyText: { color: colors.muted, fontSize: 14 },
});
