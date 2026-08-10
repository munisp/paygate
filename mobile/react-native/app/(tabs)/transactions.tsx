import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Animated,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { trpc } from "../../src/lib/trpc";
import { useNotificationStore } from "../../src/stores/notificationStore";

const STATUS_COLORS: Record<string, string> = {
  success: "#22c55e",
  failed: "#ef4444",
  pending: "#f59e0b",
  reversed: "#8b5cf6",
};

// ─── In-app Toast ─────────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  onDismiss: () => void;
}

function Toast({ message, type, onDismiss }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 300, useNativeDriver: true }),
      ]).start(onDismiss);
    }, 4_000);
    return () => clearTimeout(timer);
  }, []);

  const bg =
    type === "success" ? "#052e16" : type === "error" ? "#2d0707" : "#1e1b4b";
  const border =
    type === "success" ? "#22c55e" : type === "error" ? "#ef4444" : "#6366f1";
  const icon =
    type === "success" ? "checkmark-circle" : type === "error" ? "close-circle" : "information-circle";
  const iconColor =
    type === "success" ? "#22c55e" : type === "error" ? "#ef4444" : "#818cf8";

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: bg, borderColor: border, opacity, transform: [{ translateY }] },
      ]}
    >
      <Ionicons name={icon as any} size={18} color={iconColor} />
      <Text style={styles.toastText} numberOfLines={2}>
        {message}
      </Text>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <Ionicons name="close" size={16} color="#64748b" />
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

// ─── Transaction Item ─────────────────────────────────────────────────────────

function TransactionItem({ item, onPress }: any) {
  const statusColor = STATUS_COLORS[item.status] ?? "#64748b";
  return (
    <TouchableOpacity style={styles.txItem} onPress={() => onPress(item)}>
      <View style={[styles.txStatus, { backgroundColor: statusColor + "20" }]}>
        <Ionicons
          name={item.status === "success" ? "checkmark" : item.status === "pending" ? "time" : "close"}
          size={16}
          color={statusColor}
        />
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txRef} numberOfLines={1}>{item.reference ?? item.id}</Text>
        <Text style={styles.txMeta}>
          {item.channel ?? "card"} • {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, { color: statusColor }]}>
          ₦{((item.amount ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
        </Text>
        <View style={[styles.txBadge, { backgroundColor: statusColor + "20" }]}>
          <Text style={[styles.txBadgeText, { color: statusColor }]}>{item.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface ToastState {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

export default function TransactionsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const lastReceivedAt = useNotificationStore((s) => s.lastReceivedAt);
  const notifications = useNotificationStore((s) => s.notifications);
  const prevLastReceivedRef = useRef<Date | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch, isFetching } = trpc.transactions.list.useQuery(
    { page, limit: 20, search: search || undefined, status: statusFilter },
    { staleTime: 30_000 }
  );

  const transactions = data?.transactions ?? [];
  const total = data?.total ?? 0;

  // Listen for new real-time notifications and show toast for payment events
  useEffect(() => {
    if (!lastReceivedAt) return;
    if (
      prevLastReceivedRef.current &&
      lastReceivedAt <= prevLastReceivedRef.current
    ) return;

    prevLastReceivedRef.current = lastReceivedAt;

    // Find the most recent payment notification
    const recent = notifications[0];
    if (!recent) return;

    const isPaymentEvent =
      recent.type === "payment" ||
      recent.type === "payout" ||
      recent.type === "dispute";

    if (!isPaymentEvent) return;

    // Show toast
    const toastType =
      recent.priority === "critical" || recent.priority === "high"
        ? "error"
        : recent.type === "payment"
        ? "success"
        : "info";

    Haptics.notificationAsync(
      toastType === "error"
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Success
    );

    setToasts((prev) => [
      ...prev,
      { id: Date.now(), message: `${recent.title}: ${recent.body}`, type: toastType },
    ]);

    // Refresh transactions list when a payment notification arrives
    utils.transactions.list.invalidate();
  }, [lastReceivedAt, notifications, utils]);

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <View style={styles.container}>
      {/* Toast notifications */}
      <View style={styles.toastContainer} pointerEvents="box-none">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            message={t.message}
            type={t.type}
            onDismiss={() => dismissToast(t.id)}
          />
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#64748b" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by reference, amount..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={(v) => { setSearch(v); setPage(1); }}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color="#64748b" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Status Filters */}
      <View style={styles.filters}>
        {[undefined, "success", "pending", "failed"].map((s) => (
          <TouchableOpacity
            key={s ?? "all"}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => { setStatusFilter(s); setPage(1); }}
          >
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
              {s ?? "All"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <Text style={styles.summaryText}>{total.toLocaleString()} transactions</Text>
        {isFetching && <ActivityIndicator size="small" color="#3b82f6" />}
      </View>

      {/* List */}
      {isLoading ? (
        <ActivityIndicator color="#3b82f6" size="large" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TransactionItem
              item={item}
              onPress={(tx: any) => router.push(`/transaction/${tx.id}`)}
            />
          )}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor="#3b82f6" />}
          onEndReached={() => { if (transactions.length < total) setPage((p) => p + 1); }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="swap-horizontal" size={48} color="#334155" />
              <Text style={styles.emptyText}>No transactions found</Text>
            </View>
          }
          contentContainerStyle={transactions.length === 0 ? { flex: 1 } : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  // Toast
  toastContainer: {
    position: "absolute",
    top: 12,
    left: 16,
    right: 16,
    zIndex: 999,
    gap: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: { flex: 1, color: "#e2e8f0", fontSize: 13, lineHeight: 18 },
  // Search
  searchBar: {
    flexDirection: "row", alignItems: "center", margin: 16,
    backgroundColor: "#1e293b", borderRadius: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: "#334155",
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: "#f1f5f9", fontSize: 15, paddingVertical: 12 },
  // Filters
  filters: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155",
  },
  filterChipActive: { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
  filterChipText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  filterChipTextActive: { color: "#fff" },
  // Summary
  summary: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  summaryText: { color: "#64748b", fontSize: 13 },
  // Transaction item
  txItem: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  txStatus: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  txInfo: { flex: 1 },
  txRef: { color: "#f1f5f9", fontSize: 14, fontWeight: "600" },
  txMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  txRight: { alignItems: "flex-end" },
  txAmount: { fontSize: 15, fontWeight: "700" },
  txBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  txBadgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  // Empty
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { color: "#475569", fontSize: 16 },
});
