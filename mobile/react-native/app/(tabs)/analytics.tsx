import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { trpc } from "../../src/lib/trpc";

const { width } = Dimensions.get("window");

function BarChart({ data, maxValue }: { data: { label: string; value: number }[]; maxValue: number }) {
  return (
    <View style={chartStyles.container}>
      {data.map((item, i) => (
        <View key={i} style={chartStyles.bar}>
          <View style={chartStyles.barTrack}>
            <View
              style={[chartStyles.barFill, { height: `${(item.value / maxValue) * 100}%` }]}
            />
          </View>
          <Text style={chartStyles.barLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 4 },
  bar: { flex: 1, alignItems: "center", gap: 4 },
  barTrack: { flex: 1, width: "100%", backgroundColor: "#1e293b", borderRadius: 4, justifyContent: "flex-end" },
  barFill: { backgroundColor: "#3b82f6", borderRadius: 4 },
  barLabel: { color: "#64748b", fontSize: 10 },
});

export default function AnalyticsScreen() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const { data, isLoading } = trpc.analytics.getOverview.useQuery(
    { period },
    { staleTime: 60_000 }
  );

  const chartData = (data?.dailyRevenue ?? []).map((d: any) => ({
    label: new Date(d.date).toLocaleDateString("en", { day: "2-digit" }),
    value: d.amount / 100,
  }));
  const maxValue = Math.max(...chartData.map((d: any) => d.value), 1);

  return (
    <ScrollView style={styles.container}>
      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(["7d", "30d", "90d"] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
              {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "90 Days"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#3b82f6" size="large" style={{ padding: 40 }} />
      ) : (
        <>
          {/* KPI Cards */}
          <View style={styles.kpiGrid}>
            {[
              { label: "Total Revenue", value: `₦${((data?.totalRevenue ?? 0) / 100).toLocaleString()}`, icon: "cash", color: "#3b82f6" },
              { label: "Transactions", value: (data?.totalTransactions ?? 0).toLocaleString(), icon: "swap-horizontal", color: "#22c55e" },
              { label: "Avg Ticket", value: `₦${((data?.avgTicket ?? 0) / 100).toLocaleString()}`, icon: "trending-up", color: "#f59e0b" },
              { label: "Success Rate", value: `${(data?.successRate ?? 0).toFixed(1)}%`, icon: "checkmark-circle", color: "#8b5cf6" },
            ].map((kpi, i) => (
              <View key={i} style={styles.kpiCard}>
                <View style={[styles.kpiIcon, { backgroundColor: kpi.color + "20" }]}>
                  <Ionicons name={kpi.icon as any} size={18} color={kpi.color} />
                </View>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
                <Text style={styles.kpiValue}>{kpi.value}</Text>
              </View>
            ))}
          </View>

          {/* Revenue Chart */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Daily Revenue</Text>
            {chartData.length > 0 ? (
              <BarChart data={chartData.slice(-14)} maxValue={maxValue} />
            ) : (
              <Text style={styles.noData}>No data for this period</Text>
            )}
          </View>

          {/* Top Channels */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top Payment Channels</Text>
            {(data?.channelBreakdown ?? []).map((ch: any, i: number) => (
              <View key={i} style={styles.channelRow}>
                <Text style={styles.channelName}>{ch.channel}</Text>
                <View style={styles.channelBar}>
                  <View style={[styles.channelFill, { width: `${ch.percentage}%` }]} />
                </View>
                <Text style={styles.channelPct}>{ch.percentage.toFixed(0)}%</Text>
              </View>
            ))}
          </View>

          {/* Top Merchants */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top Performing Periods</Text>
            {(data?.topHours ?? []).slice(0, 5).map((h: any, i: number) => (
              <View key={i} style={styles.topRow}>
                <Text style={styles.topRank}>#{i + 1}</Text>
                <Text style={styles.topLabel}>{h.hour}:00</Text>
                <Text style={styles.topValue}>₦{(h.revenue / 100).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  periodSelector: { flexDirection: "row", margin: 16, backgroundColor: "#1e293b", borderRadius: 12, padding: 4 },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  periodBtnActive: { backgroundColor: "#3b82f6" },
  periodBtnText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  periodBtnTextActive: { color: "#fff" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 },
  kpiCard: { width: "48%", margin: "1%", backgroundColor: "#1e293b", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#334155" },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiLabel: { color: "#64748b", fontSize: 11, marginBottom: 4 },
  kpiValue: { color: "#f1f5f9", fontSize: 18, fontWeight: "700" },
  chartCard: { margin: 16, backgroundColor: "#1e293b", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#334155" },
  chartTitle: { color: "#f1f5f9", fontSize: 15, fontWeight: "700", marginBottom: 16 },
  noData: { color: "#475569", textAlign: "center", padding: 20 },
  card: { margin: 16, marginTop: 0, backgroundColor: "#1e293b", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#334155" },
  cardTitle: { color: "#f1f5f9", fontSize: 15, fontWeight: "700", marginBottom: 12 },
  channelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  channelName: { color: "#94a3b8", fontSize: 13, width: 60 },
  channelBar: { flex: 1, height: 6, backgroundColor: "#0f172a", borderRadius: 3 },
  channelFill: { height: 6, backgroundColor: "#3b82f6", borderRadius: 3 },
  channelPct: { color: "#64748b", fontSize: 12, width: 32, textAlign: "right" },
  topRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#0f172a" },
  topRank: { color: "#3b82f6", fontSize: 13, fontWeight: "700", width: 28 },
  topLabel: { flex: 1, color: "#94a3b8", fontSize: 13 },
  topValue: { color: "#f1f5f9", fontSize: 13, fontWeight: "700" },
});
