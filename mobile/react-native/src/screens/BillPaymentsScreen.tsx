/**
 * BillPaymentsScreen — Wave 124
 * Nigerian utility bill payments: electricity, water, cable TV, internet, airtime, data
 * Uses trpc.billPayments.list and trpc.billPayments.stats
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from "react-native";
import { trpc } from "../lib/trpc";

const CATEGORY_ICONS: Record<string, string> = {
  electricity: "⚡",
  water: "💧",
  cable_tv: "📺",
  internet: "🌐",
  airtime: "📱",
  data: "📶",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  processing: "#3b82f6",
  completed: "#10b981",
  failed: "#ef4444",
};

interface BillPayment {
  id: string;
  billerName: string;
  billerCode: string;
  category: string;
  customerReference: string;
  amountKobo: number;
  status: string;
  createdAt: Date;
  failureReason?: string | null;
}

export default function BillPaymentsScreen() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    category: "electricity",
    billerCode: "",
    billerName: "",
    customerReference: "",
    amountKobo: "",
    walletId: "",
  });
  const limit = 20;

  const { data, isLoading, refetch, isFetching } = trpc.billPayments.list.useQuery({
    limit,
    offset,
    status: statusFilter,
  });

  const { data: stats } = trpc.billPayments.stats.useQuery();

  const createMutation = trpc.billPayments.create.useMutation({
    onSuccess: () => {
      Alert.alert("Success", "Bill payment created");
      setShowCreate(false);
      setForm({ category: "electricity", billerCode: "", billerName: "", customerReference: "", amountKobo: "", walletId: "" });
      refetch();
    },
    onError: (e) => Alert.alert("Error", e.message),
  });

  const updateStatus = trpc.billPayments.updateStatus.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => Alert.alert("Error", e.message),
  });

  const renderItem = ({ item }: { item: BillPayment }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.categoryIcon}>{CATEGORY_ICONS[item.category] ?? "📄"}</Text>
          <View>
            <Text style={styles.billerName}>{item.billerName}</Text>
            <Text style={styles.reference}>{item.customerReference}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + "20" }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
            {item.status}
          </Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.amount}>₦{(item.amountKobo / 100).toLocaleString()}</Text>
        <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString("en-NG")}</Text>
      </View>
      {item.status === "pending" && (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => updateStatus.mutate({ id: item.id, status: "processing" })}
        >
          <Text style={styles.actionButtonText}>Process Payment</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Stats Row */}
      {stats && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: "#6366f1" }]}>
            <Text style={styles.statValue}>{stats.total ?? 0}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#10b981" }]}>
            <Text style={[styles.statValue, { color: "#10b981" }]}>{stats.completed ?? 0}</Text>
            <Text style={styles.statLabel}>Done</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#f59e0b" }]}>
            <Text style={[styles.statValue, { color: "#f59e0b" }]}>{stats.pending ?? 0}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#ef4444" }]}>
            <Text style={[styles.statValue, { color: "#ef4444" }]}>{stats.failed ?? 0}</Text>
            <Text style={styles.statLabel}>Failed</Text>
          </View>
        </View>
      )}

      {/* Filter Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {[undefined, "pending", "processing", "completed", "failed"].map(s => (
          <TouchableOpacity
            key={s ?? "all"}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => { setStatusFilter(s); setOffset(0); }}
          >
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
              {s ?? "All"}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data?.rows ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No bill payments found</Text>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Bill Payment</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {["electricity", "water", "cable_tv", "internet", "airtime", "data"].map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.filterChip, form.category === cat && styles.filterChipActive]}
                  onPress={() => setForm(f => ({ ...f, category: cat }))}
                >
                  <Text style={[styles.filterChipText, form.category === cat && styles.filterChipTextActive]}>
                    {CATEGORY_ICONS[cat]} {cat.replace("_", " ")}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Biller Code</Text>
            <TextInput
              style={styles.input}
              value={form.billerCode}
              onChangeText={v => setForm(f => ({ ...f, billerCode: v }))}
              placeholder="e.g. EKEDC"
            />

            <Text style={styles.fieldLabel}>Biller Name</Text>
            <TextInput
              style={styles.input}
              value={form.billerName}
              onChangeText={v => setForm(f => ({ ...f, billerName: v }))}
              placeholder="e.g. Eko Electricity Distribution"
            />

            <Text style={styles.fieldLabel}>Customer Reference</Text>
            <TextInput
              style={styles.input}
              value={form.customerReference}
              onChangeText={v => setForm(f => ({ ...f, customerReference: v }))}
              placeholder="Meter/Account number"
            />

            <Text style={styles.fieldLabel}>Amount (₦)</Text>
            <TextInput
              style={styles.input}
              value={form.amountKobo}
              onChangeText={v => setForm(f => ({ ...f, amountKobo: v }))}
              placeholder="5000"
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={[styles.submitButton, createMutation.isPending && { opacity: 0.6 }]}
              disabled={createMutation.isPending}
              onPress={() => createMutation.mutate({
                userId: 1,
                walletId: form.walletId || "default",
                category: form.category,
                billerCode: form.billerCode,
                billerName: form.billerName,
                customerReference: form.customerReference,
                amountKobo: Math.round(parseFloat(form.amountKobo || "0") * 100),
                currency: "NGN",
              })}
            >
              <Text style={styles.submitButtonText}>
                {createMutation.isPending ? "Creating..." : "Create Bill Payment"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  statsRow: { flexDirection: "row", padding: 12, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 8, padding: 10,
    borderLeftWidth: 3, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: 20, fontWeight: "700", color: "#1e293b" },
  statLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  filterRow: { paddingHorizontal: 12, paddingVertical: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "#f1f5f9", marginRight: 8, borderWidth: 1, borderColor: "#e2e8f0",
  },
  filterChipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  filterChipText: { fontSize: 13, color: "#64748b" },
  filterChipTextActive: { color: "#fff", fontWeight: "600" },
  card: {
    backgroundColor: "#fff", marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, padding: 14, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  categoryIcon: { fontSize: 24 },
  billerName: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
  reference: { fontSize: 12, color: "#64748b", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: "600" },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amount: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  date: { fontSize: 12, color: "#94a3b8" },
  actionButton: {
    marginTop: 10, backgroundColor: "#6366f1", borderRadius: 8,
    paddingVertical: 8, alignItems: "center",
  },
  actionButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  emptyText: { textAlign: "center", color: "#94a3b8", marginTop: 60, fontSize: 15 },
  fab: {
    position: "absolute", bottom: 24, right: 24, width: 56, height: 56,
    borderRadius: 28, backgroundColor: "#6366f1", justifyContent: "center",
    alignItems: "center", shadowColor: "#6366f1", shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  fabText: { color: "#fff", fontSize: 28, fontWeight: "300", marginTop: -2 },
  modal: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  modalClose: { fontSize: 20, color: "#64748b" },
  modalBody: { padding: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#1e293b", backgroundColor: "#f8fafc",
  },
  submitButton: {
    backgroundColor: "#6366f1", borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 24, marginBottom: 40,
  },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
