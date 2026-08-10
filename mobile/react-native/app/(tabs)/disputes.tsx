import React, { useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { trpc } from "../../src/lib/trpc";

const STATUS_COLORS: Record<string, string> = {
  open: "#f59e0b",
  under_review: "#3b82f6",
  resolved: "#22c55e",
  closed: "#64748b",
  escalated: "#ef4444",
};

function DisputeItem({ item, onPress }: any) {
  const color = STATUS_COLORS[item.status] ?? "#64748b";
  return (
    <TouchableOpacity style={styles.disputeItem} onPress={() => onPress(item)}>
      <View style={[styles.disputeIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name="alert-circle" size={18} color={color} />
      </View>
      <View style={styles.disputeInfo}>
        <Text style={styles.disputeRef} numberOfLines={1}>{item.reference ?? item.id}</Text>
        <Text style={styles.disputeReason}>{item.reason ?? "Dispute"}</Text>
        <Text style={styles.disputeDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <View style={styles.disputeRight}>
        <Text style={styles.disputeAmount}>
          ₦{((item.amount ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: color + "20" }]}>
          <Text style={[styles.statusText, { color }]}>{item.status?.replace("_", " ")}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DisputesScreen() {
  const [selected, setSelected] = useState<any>(null);
  const [response, setResponse] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data, isLoading, refetch } = trpc.disputes.list.useQuery(
    { page: 1, limit: 20, status: statusFilter },
    { staleTime: 30_000 }
  );

  const respondToDispute = trpc.disputes.respond.useMutation({
    onSuccess: () => {
      setSelected(null);
      setResponse("");
      refetch();
      Alert.alert("Success", "Response submitted");
    },
    onError: (e) => Alert.alert("Error", e.message),
  });

  const escalateDispute = trpc.disputes.escalate.useMutation({
    onSuccess: () => { setSelected(null); refetch(); Alert.alert("Escalated", "Dispute escalated to support team"); },
    onError: (e) => Alert.alert("Error", e.message),
  });

  return (
    <View style={styles.container}>
      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: "Open", value: data?.openCount ?? 0, color: "#f59e0b" },
          { label: "Under Review", value: data?.reviewCount ?? 0, color: "#3b82f6" },
          { label: "Resolved", value: data?.resolvedCount ?? 0, color: "#22c55e" },
        ].map((s, i) => (
          <View key={i} style={styles.statCard}>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {[undefined, "open", "under_review", "resolved"].map((s) => (
          <TouchableOpacity
            key={s ?? "all"}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.filterText, statusFilter === s && styles.filterTextActive]}>
              {s ? s.replace("_", " ") : "All"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#3b82f6" size="large" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={data?.disputes ?? []}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <DisputeItem item={item} onPress={setSelected} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark" size={48} color="#334155" />
              <Text style={styles.emptyText}>No disputes found</Text>
            </View>
          }
        />
      )}

      {/* Detail Modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dispute Details</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Reference</Text>
                <Text style={styles.detailValue}>{selected.reference ?? selected.id}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Amount</Text>
                <Text style={styles.detailValue}>₦{((selected.amount ?? 0) / 100).toLocaleString()}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Reason</Text>
                <Text style={styles.detailValue}>{selected.reason}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={[styles.detailValue, { color: STATUS_COLORS[selected.status] }]}>{selected.status}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Opened</Text>
                <Text style={styles.detailValue}>{new Date(selected.createdAt).toLocaleString()}</Text>
              </View>
              {selected.description && (
                <View style={styles.descBox}>
                  <Text style={styles.descText}>{selected.description}</Text>
                </View>
              )}

              {selected.status === "open" && (
                <>
                  <Text style={styles.inputLabel}>Your Response</Text>
                  <TextInput
                    style={[styles.input, { height: 100, textAlignVertical: "top" }]}
                    placeholder="Provide evidence or explanation..."
                    placeholderTextColor="#64748b"
                    value={response}
                    onChangeText={setResponse}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.submitBtn, respondToDispute.isPending && styles.submitBtnDisabled]}
                    onPress={() => respondToDispute.mutate({ disputeId: selected.id, response })}
                    disabled={respondToDispute.isPending || !response.trim()}
                  >
                    {respondToDispute.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Response</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.escalateBtn}
                    onPress={() => escalateDispute.mutate({ disputeId: selected.id })}
                  >
                    <Text style={styles.escalateBtnText}>Escalate to Support</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  statsRow: { flexDirection: "row", padding: 16, gap: 8 },
  statCard: { flex: 1, backgroundColor: "#1e293b", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#334155" },
  statLabel: { color: "#64748b", fontSize: 11, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: "700" },
  filters: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" },
  filterChipActive: { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
  filterText: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  filterTextActive: { color: "#fff" },
  disputeItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  disputeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  disputeInfo: { flex: 1 },
  disputeRef: { color: "#f1f5f9", fontSize: 14, fontWeight: "600" },
  disputeReason: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  disputeDate: { color: "#475569", fontSize: 11, marginTop: 2 },
  disputeRight: { alignItems: "flex-end" },
  disputeAmount: { color: "#f1f5f9", fontSize: 14, fontWeight: "700" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyText: { color: "#475569", fontSize: 16 },
  modal: { flex: 1, backgroundColor: "#0f172a" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  modalTitle: { color: "#f1f5f9", fontSize: 18, fontWeight: "700" },
  modalBody: { padding: 20 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  detailLabel: { color: "#64748b", fontSize: 13 },
  detailValue: { color: "#f1f5f9", fontSize: 13, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  descBox: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginVertical: 12 },
  descText: { color: "#94a3b8", fontSize: 14, lineHeight: 20 },
  inputLabel: { color: "#94a3b8", fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, color: "#f1f5f9", fontSize: 15, borderWidth: 1, borderColor: "#334155" },
  submitBtn: { backgroundColor: "#3b82f6", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 16 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  escalateBtn: { borderWidth: 1, borderColor: "#ef4444", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 10, marginBottom: 40 },
  escalateBtnText: { color: "#ef4444", fontSize: 16, fontWeight: "700" },
});
