/**
 * CouponsScreen — Wave 124
 * Coupon and promo code management with real tRPC wiring
 * Uses trpc.coupons.list, trpc.coupons.create, trpc.coupons.deactivate
 */
import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView, Alert, Modal, TextInput,
} from "react-native";
import { trpc } from "../lib/trpc";

const TYPE_COLORS: Record<string, string> = {
  percentage: "#6366f1",
  fixed_amount: "#10b981",
  free_shipping: "#3b82f6",
  buy_x_get_y: "#f59e0b",
};

interface Coupon {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minOrderAmount?: number | null;
  maxUsage?: number | null;
  usageCount: number;
  isActive: boolean;
  expiresAt?: Date | null;
  createdAt: Date;
}

export default function CouponsScreen() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    code: "",
    discountType: "percentage",
    discountValue: "",
    minOrderAmount: "",
    maxUsage: "",
  });

  const { data, isLoading, refetch, isFetching } = trpc.coupons.list.useQuery({ limit: 20, offset: 0 });

  const createMutation = trpc.coupons.create.useMutation({
    onSuccess: () => {
      Alert.alert("Created", "Coupon created successfully");
      setShowCreate(false);
      setForm({ code: "", discountType: "percentage", discountValue: "", minOrderAmount: "", maxUsage: "" });
      refetch();
    },
    onError: (e) => Alert.alert("Error", e.message),
  });

  const deactivateMutation = trpc.coupons.deactivate.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => Alert.alert("Error", e.message),
  });

  const renderItem = ({ item }: { item: Coupon }) => (
    <View style={[styles.card, !item.isActive && styles.cardInactive]}>
      <View style={styles.cardHeader}>
        <View style={styles.codeBox}>
          <Text style={styles.code}>{item.code}</Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[item.discountType] + "20" }]}>
          <Text style={[styles.typeText, { color: TYPE_COLORS[item.discountType] }]}>
            {item.discountType.replace("_", " ")}
          </Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>
            {item.discountType === "percentage" ? `${item.discountValue}%` : `₦${item.discountValue}`}
          </Text>
          <Text style={styles.metricLabel}>Discount</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>{item.usageCount}/{item.maxUsage ?? "∞"}</Text>
          <Text style={styles.metricLabel}>Used</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={[styles.metricValue, { color: item.isActive ? "#10b981" : "#ef4444" }]}>
            {item.isActive ? "Active" : "Inactive"}
          </Text>
          <Text style={styles.metricLabel}>Status</Text>
        </View>
      </View>
      {item.isActive && (
        <TouchableOpacity
          style={styles.deactivateButton}
          onPress={() => Alert.alert("Deactivate", `Deactivate coupon ${item.code}?`, [
            { text: "Cancel" },
            { text: "Deactivate", style: "destructive", onPress: () => deactivateMutation.mutate({ id: item.id }) },
          ])}
        >
          <Text style={styles.deactivateButtonText}>Deactivate</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data?.rows ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No coupons found</Text>}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Coupon</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Coupon Code</Text>
            <TextInput
              style={styles.input}
              value={form.code}
              onChangeText={v => setForm(f => ({ ...f, code: v.toUpperCase() }))}
              placeholder="SUMMER20"
              autoCapitalize="characters"
            />

            <Text style={styles.fieldLabel}>Discount Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {["percentage", "fixed_amount", "free_shipping", "buy_x_get_y"].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, form.discountType === t && styles.typeChipActive]}
                  onPress={() => setForm(f => ({ ...f, discountType: t }))}
                >
                  <Text style={[styles.typeChipText, form.discountType === t && styles.typeChipTextActive]}>
                    {t.replace(/_/g, " ")}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Discount Value</Text>
            <TextInput
              style={styles.input}
              value={form.discountValue}
              onChangeText={v => setForm(f => ({ ...f, discountValue: v }))}
              placeholder={form.discountType === "percentage" ? "20 (for 20%)" : "500 (₦500)"}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>Max Usage (optional)</Text>
            <TextInput
              style={styles.input}
              value={form.maxUsage}
              onChangeText={v => setForm(f => ({ ...f, maxUsage: v }))}
              placeholder="100"
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={[styles.submitButton, createMutation.isPending && { opacity: 0.6 }]}
              disabled={createMutation.isPending}
              onPress={() => createMutation.mutate({
                code: form.code,
                discountType: form.discountType,
                discountValue: parseFloat(form.discountValue || "0"),
                maxUsage: form.maxUsage ? parseInt(form.maxUsage) : undefined,
              })}
            >
              <Text style={styles.submitButtonText}>
                {createMutation.isPending ? "Creating..." : "Create Coupon"}
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
  card: {
    backgroundColor: "#fff", marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, padding: 14, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  cardInactive: { opacity: 0.6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  codeBox: { backgroundColor: "#f1f5f9", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  code: { fontSize: 16, fontWeight: "800", color: "#1e293b", letterSpacing: 1.5 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  typeText: { fontSize: 12, fontWeight: "600" },
  cardBody: { flexDirection: "row", marginBottom: 10 },
  metricBox: { flex: 1 },
  metricValue: { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  metricLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  deactivateButton: {
    backgroundColor: "#ef444420", borderWidth: 1, borderColor: "#ef4444",
    borderRadius: 8, paddingVertical: 8, alignItems: "center",
  },
  deactivateButtonText: { color: "#ef4444", fontWeight: "600", fontSize: 13 },
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
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#1e293b",
  },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: "#f1f5f9", marginRight: 8, borderWidth: 1, borderColor: "#e2e8f0",
  },
  typeChipActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  typeChipText: { fontSize: 12, color: "#64748b" },
  typeChipTextActive: { color: "#fff", fontWeight: "600" },
  submitButton: {
    backgroundColor: "#6366f1", borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 24, marginBottom: 40,
  },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
