import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { trpc } from "../../src/lib/trpc";
import { useAuth } from "../../src/contexts/AuthContext";

function MetricCard({ title, value, change, icon, color }: any) {
  const isPositive = change >= 0;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.metricTitle}>{title}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <View style={styles.metricChange}>
        <Ionicons
          name={isPositive ? "trending-up" : "trending-down"}
          size={12}
          color={isPositive ? "#22c55e" : "#ef4444"}
        />
        <Text style={[styles.metricChangeText, { color: isPositive ? "#22c55e" : "#ef4444" }]}>
          {Math.abs(change)}%
        </Text>
      </View>
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: any) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <View style={[styles.quickActionIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = React.useState(false);

  const { data: metrics, isLoading, refetch } = trpc.dashboard.getMetrics.useQuery(
    { period: "today" },
    { staleTime: 60_000 }
  );

  const { data: recentTx } = trpc.transactions.list.useQuery(
    { limit: 5, page: 1 },
    { staleTime: 30_000 }
  );

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const totalRevenue = metrics?.totalRevenue ?? 0;
  const txCount = metrics?.transactionCount ?? 0;
  const successRate = metrics?.successRate ?? 0;
  const pendingPayouts = metrics?.pendingPayouts ?? 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
    >
      {/* Header */}
      <LinearGradient colors={["#0f172a", "#1e293b"]} style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good morning,</Text>
          <Text style={styles.userName}>{user?.name ?? "Merchant"}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/(tabs)/settings")}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name ?? "M").charAt(0).toUpperCase()}
            </Text>
          </View>
        </TouchableOpacity>
      </LinearGradient>

      {/* Revenue Card */}
      <LinearGradient colors={["#1d4ed8", "#3b82f6"]} style={styles.revenueCard}>
        <Text style={styles.revenueLabel}>Total Revenue Today</Text>
        {isLoading ? (
          <ActivityIndicator color="#fff" size="large" style={{ marginVertical: 8 }} />
        ) : (
          <Text style={styles.revenueValue}>
            ₦{(totalRevenue / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </Text>
        )}
        <View style={styles.revenueStats}>
          <Text style={styles.revenueStatText}>{txCount} transactions</Text>
          <Text style={styles.revenueStatText}>•</Text>
          <Text style={styles.revenueStatText}>{successRate.toFixed(1)}% success</Text>
        </View>
      </LinearGradient>

      {/* Metrics Grid */}
      <View style={styles.metricsGrid}>
        <MetricCard title="Transactions" value={txCount.toString()} change={12.5} icon="swap-horizontal" color="#3b82f6" />
        <MetricCard title="Success Rate" value={`${successRate.toFixed(0)}%`} change={2.1} icon="checkmark-circle" color="#22c55e" />
        <MetricCard title="Pending Payouts" value={`₦${(pendingPayouts / 100).toLocaleString()}`} change={-5.3} icon="time" color="#f59e0b" />
        <MetricCard title="Disputes" value={(metrics?.openDisputes ?? 0).toString()} change={-8.2} icon="warning" color="#ef4444" />
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <QuickAction icon="send" label="Send" color="#3b82f6" onPress={() => router.push("/(tabs)/payouts")} />
          <QuickAction icon="link" label="Pay Link" color="#8b5cf6" onPress={() => router.push("/payment-links")} />
          <QuickAction icon="qr-code" label="QR Code" color="#06b6d4" onPress={() => router.push("/qr-code")} />
          <QuickAction icon="card" label="Virtual Card" color="#f59e0b" onPress={() => router.push("/virtual-cards")} />
          <QuickAction icon="people" label="Customers" color="#22c55e" onPress={() => router.push("/customers")} />
          <QuickAction icon="analytics" label="Reports" color="#ec4899" onPress={() => router.push("/(tabs)/analytics")} />
        </View>
      </View>

      {/* Recent Transactions */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/transactions")}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        {isLoading ? (
          <ActivityIndicator color="#3b82f6" style={{ padding: 20 }} />
        ) : (
          (recentTx?.transactions ?? []).slice(0, 5).map((tx: any) => (
            <View key={tx.id} style={styles.txItem}>
              <View style={[styles.txIcon, { backgroundColor: tx.status === "success" ? "#22c55e20" : "#ef444420" }]}>
                <Ionicons
                  name={tx.status === "success" ? "checkmark" : "close"}
                  size={16}
                  color={tx.status === "success" ? "#22c55e" : "#ef4444"}
                />
              </View>
              <View style={styles.txDetails}>
                <Text style={styles.txRef}>{tx.reference ?? tx.id}</Text>
                <Text style={styles.txDate}>{new Date(tx.createdAt).toLocaleTimeString()}</Text>
              </View>
              <Text style={[styles.txAmount, { color: tx.status === "success" ? "#22c55e" : "#ef4444" }]}>
                ₦{((tx.amount ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 60 },
  greeting: { color: "#64748b", fontSize: 14 },
  userName: { color: "#f1f5f9", fontSize: 22, fontWeight: "700" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#3b82f6", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  revenueCard: { margin: 16, borderRadius: 20, padding: 24 },
  revenueLabel: { color: "rgba(255,255,255,0.7)", fontSize: 14 },
  revenueValue: { color: "#fff", fontSize: 36, fontWeight: "800", marginVertical: 8 },
  revenueStats: { flexDirection: "row", gap: 8 },
  revenueStatText: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 },
  metricCard: { width: "48%", margin: "1%", backgroundColor: "#1e293b", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#334155" },
  metricIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  metricTitle: { color: "#64748b", fontSize: 12, marginBottom: 4 },
  metricValue: { color: "#f1f5f9", fontSize: 20, fontWeight: "700" },
  metricChange: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  metricChangeText: { fontSize: 12, fontWeight: "600" },
  section: { padding: 16 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { color: "#f1f5f9", fontSize: 16, fontWeight: "700", marginBottom: 12 },
  seeAll: { color: "#3b82f6", fontSize: 13, fontWeight: "600" },
  quickActionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  quickAction: { width: "30%", alignItems: "center", gap: 8 },
  quickActionIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  txItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  txIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  txDetails: { flex: 1 },
  txRef: { color: "#f1f5f9", fontSize: 14, fontWeight: "600" },
  txDate: { color: "#64748b", fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "700" },
});
