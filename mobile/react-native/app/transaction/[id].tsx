import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Share, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { trpc } from "../../src/lib/trpc";

const STATUS_COLORS: Record<string, string> = {
  success: "#22c55e",
  failed: "#ef4444",
  pending: "#f59e0b",
  reversed: "#8b5cf6",
};

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.detailValueMono]} selectable>{value}</Text>
    </View>
  );
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading } = trpc.transactions.getById.useQuery(
    { id: parseInt(id ?? "0") },
    { enabled: !!id }
  );

  const refundTransaction = trpc.transactions.refund.useMutation({
    onSuccess: () => Alert.alert("Success", "Refund initiated"),
    onError: (e) => Alert.alert("Error", e.message),
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#3b82f6" size="large" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Transaction not found</Text>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[data.status] ?? "#64748b";

  async function handleShare() {
    await Share.share({
      message: `Transaction ${data.reference}\nAmount: ₦${((data.amount ?? 0) / 100).toLocaleString()}\nStatus: ${data.status}\nDate: ${new Date(data.createdAt).toLocaleString()}`,
    });
  }

  return (
    <ScrollView style={styles.container}>
      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color="#94a3b8" />
        <Text style={styles.backText}>Transactions</Text>
      </TouchableOpacity>

      {/* Amount Hero */}
      <View style={styles.hero}>
        <View style={[styles.statusCircle, { backgroundColor: statusColor + "20" }]}>
          <Ionicons
            name={data.status === "success" ? "checkmark" : data.status === "pending" ? "time" : "close"}
            size={32}
            color={statusColor}
          />
        </View>
        <Text style={styles.heroAmount}>
          ₦{((data.amount ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
        </Text>
        <View style={[styles.heroBadge, { backgroundColor: statusColor + "20" }]}>
          <Text style={[styles.heroBadgeText, { color: statusColor }]}>{data.status.toUpperCase()}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Transaction Details</Text>
        <DetailRow label="Reference" value={data.reference ?? data.id.toString()} mono />
        <DetailRow label="Amount" value={`₦${((data.amount ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`} />
        <DetailRow label="Currency" value={data.currency ?? "NGN"} />
        <DetailRow label="Channel" value={data.channel ?? "card"} />
        <DetailRow label="Status" value={data.status} />
        <DetailRow label="Date" value={new Date(data.createdAt).toLocaleString()} />
        {data.description && <DetailRow label="Description" value={data.description} />}
      </View>

      {/* Customer */}
      {(data.customerEmail || data.customerName) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          {data.customerName && <DetailRow label="Name" value={data.customerName} />}
          {data.customerEmail && <DetailRow label="Email" value={data.customerEmail} />}
          {data.customerPhone && <DetailRow label="Phone" value={data.customerPhone} />}
        </View>
      )}

      {/* Metadata */}
      {data.metadata && Object.keys(data.metadata).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Metadata</Text>
          {Object.entries(data.metadata).map(([k, v]) => (
            <DetailRow key={k} label={k} value={String(v)} />
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color="#3b82f6" />
          <Text style={styles.actionBtnText}>Share</Text>
        </TouchableOpacity>
        {data.status === "success" && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={() => Alert.alert(
              "Refund Transaction",
              `Refund ₦${((data.amount ?? 0) / 100).toLocaleString()}?`,
              [
                { text: "Cancel", style: "cancel" },
                { text: "Refund", style: "destructive", onPress: () => refundTransaction.mutate({ transactionId: data.id }) },
              ]
            )}
          >
            <Ionicons name="return-down-back" size={20} color="#ef4444" />
            <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>Refund</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0f172a" },
  errorText: { color: "#ef4444", fontSize: 16 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 16 },
  backText: { color: "#94a3b8", fontSize: 15 },
  hero: { alignItems: "center", padding: 24, gap: 12 },
  statusCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  heroAmount: { color: "#f1f5f9", fontSize: 32, fontWeight: "700" },
  heroBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  heroBadgeText: { fontSize: 13, fontWeight: "700" },
  card: { margin: 16, marginTop: 0, backgroundColor: "#1e293b", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#334155" },
  cardTitle: { color: "#f1f5f9", fontSize: 15, fontWeight: "700", marginBottom: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#0f172a" },
  detailLabel: { color: "#64748b", fontSize: 13, flex: 1 },
  detailValue: { color: "#f1f5f9", fontSize: 13, fontWeight: "600", flex: 2, textAlign: "right" },
  detailValueMono: { fontFamily: "monospace", fontSize: 12 },
  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#1e293b", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#3b82f6" },
  actionBtnDanger: { borderColor: "#ef4444" },
  actionBtnText: { color: "#3b82f6", fontSize: 15, fontWeight: "700" },
});
