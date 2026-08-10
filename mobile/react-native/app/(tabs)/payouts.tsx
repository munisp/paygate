import React, { useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { trpc } from "../../src/lib/trpc";

function PayoutItem({ item }: any) {
  const statusColor = item.status === "completed" ? "#22c55e" : item.status === "pending" ? "#f59e0b" : "#ef4444";
  return (
    <View style={styles.payoutItem}>
      <View style={[styles.payoutIcon, { backgroundColor: statusColor + "20" }]}>
        <Ionicons name="send" size={16} color={statusColor} />
      </View>
      <View style={styles.payoutInfo}>
        <Text style={styles.payoutName}>{item.accountName ?? "Unknown"}</Text>
        <Text style={styles.payoutBank}>{item.bankCode} • {item.accountNumber}</Text>
        <Text style={styles.payoutDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <View style={styles.payoutRight}>
        <Text style={styles.payoutAmount}>
          ₦{((item.amount ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
        </View>
      </View>
    </View>
  );
}

export default function PayoutsScreen() {
  const [showModal, setShowModal] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [accountName, setAccountName] = useState("");

  const { data, isLoading, refetch } = trpc.payouts.list.useQuery(
    { page: 1, limit: 20 },
    { staleTime: 30_000 }
  );

  const verifyAccount = trpc.payouts.verifyAccount.useMutation();
  const createPayout = trpc.payouts.create.useMutation({
    onSuccess: () => {
      setShowModal(false);
      setAccountNumber(""); setBankCode(""); setAmount(""); setNarration(""); setAccountName("");
      refetch();
      Alert.alert("Success", "Payout initiated successfully");
    },
    onError: (err) => Alert.alert("Error", err.message),
  });

  async function handleVerify() {
    if (!accountNumber || !bankCode) return;
    setIsVerifying(true);
    try {
      const result = await verifyAccount.mutateAsync({ accountNumber, bankCode });
      setAccountName(result.accountName ?? "");
    } catch (e: any) {
      Alert.alert("Verification Failed", e.message);
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleSubmit() {
    if (!accountNumber || !bankCode || !amount) {
      Alert.alert("Error", "Please fill all required fields");
      return;
    }
    createPayout.mutate({
      accountNumber, bankCode, accountName,
      amount: Math.round(parseFloat(amount) * 100),
      narration: narration || "Payout",
      currency: "NGN",
    });
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Payouts</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowModal(true)}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addButtonText}>New Payout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Paid</Text>
          <Text style={styles.statValue}>
            ₦{((data?.totalPaid ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Pending</Text>
          <Text style={[styles.statValue, { color: "#f59e0b" }]}>{data?.pendingCount ?? 0}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>This Month</Text>
          <Text style={styles.statValue}>{data?.monthCount ?? 0}</Text>
        </View>
      </View>

      {/* List */}
      {isLoading ? (
        <ActivityIndicator color="#3b82f6" size="large" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={data?.payouts ?? []}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <PayoutItem item={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="send" size={48} color="#334155" />
              <Text style={styles.emptyText}>No payouts yet</Text>
            </View>
          }
        />
      )}

      {/* New Payout Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Payout</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.inputLabel}>Bank Code *</Text>
            <TextInput style={styles.input} placeholder="e.g. 058" placeholderTextColor="#64748b"
              value={bankCode} onChangeText={setBankCode} keyboardType="number-pad" />

            <Text style={styles.inputLabel}>Account Number *</Text>
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="10-digit account number"
                placeholderTextColor="#64748b" value={accountNumber}
                onChangeText={setAccountNumber} keyboardType="number-pad" maxLength={10} />
              <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify} disabled={isVerifying}>
                {isVerifying ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.verifyBtnText}>Verify</Text>}
              </TouchableOpacity>
            </View>

            {accountName ? (
              <View style={styles.accountNameBox}>
                <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                <Text style={styles.accountNameText}>{accountName}</Text>
              </View>
            ) : null}

            <Text style={styles.inputLabel}>Amount (₦) *</Text>
            <TextInput style={styles.input} placeholder="0.00" placeholderTextColor="#64748b"
              value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />

            <Text style={styles.inputLabel}>Narration</Text>
            <TextInput style={styles.input} placeholder="Payment description"
              placeholderTextColor="#64748b" value={narration} onChangeText={setNarration} />

            <TouchableOpacity
              style={[styles.submitBtn, createPayout.isPending && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={createPayout.isPending}
            >
              {createPayout.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Send Payout</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  headerTitle: { color: "#f1f5f9", fontSize: 20, fontWeight: "700" },
  addButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#3b82f6", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: "#1e293b", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#334155" },
  statLabel: { color: "#64748b", fontSize: 11, marginBottom: 4 },
  statValue: { color: "#f1f5f9", fontSize: 16, fontWeight: "700" },
  payoutItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  payoutIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
  payoutInfo: { flex: 1 },
  payoutName: { color: "#f1f5f9", fontSize: 14, fontWeight: "600" },
  payoutBank: { color: "#64748b", fontSize: 12, marginTop: 2 },
  payoutDate: { color: "#475569", fontSize: 11, marginTop: 2 },
  payoutRight: { alignItems: "flex-end" },
  payoutAmount: { color: "#f1f5f9", fontSize: 15, fontWeight: "700" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyText: { color: "#475569", fontSize: 16 },
  modal: { flex: 1, backgroundColor: "#0f172a" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  modalTitle: { color: "#f1f5f9", fontSize: 18, fontWeight: "700" },
  modalBody: { padding: 20 },
  inputLabel: { color: "#94a3b8", fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, color: "#f1f5f9", fontSize: 15, borderWidth: 1, borderColor: "#334155" },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  verifyBtn: { backgroundColor: "#3b82f6", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14 },
  verifyBtnText: { color: "#fff", fontWeight: "700" },
  accountNameBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#22c55e20", borderRadius: 8, padding: 10, marginTop: 8 },
  accountNameText: { color: "#22c55e", fontWeight: "600" },
  submitBtn: { backgroundColor: "#3b82f6", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 24, marginBottom: 40 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
