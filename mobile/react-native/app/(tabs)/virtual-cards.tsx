import React, { useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { trpc } from "../../src/lib/trpc";

function CardDisplay({ card }: { card: any }) {
  const [showDetails, setShowDetails] = useState(false);
  const isActive = card.status === "active";

  return (
    <TouchableOpacity onPress={() => setShowDetails(true)}>
      <LinearGradient
        colors={isActive ? ["#1e40af", "#3b82f6"] : ["#1e293b", "#334155"]}
        style={styles.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardLabel}>{card.label ?? "Virtual Card"}</Text>
          <View style={[styles.cardStatus, { backgroundColor: isActive ? "#22c55e30" : "#ef444430" }]}>
            <Text style={[styles.cardStatusText, { color: isActive ? "#22c55e" : "#ef4444" }]}>
              {card.status}
            </Text>
          </View>
        </View>
        <Text style={styles.cardNumber}>
          •••• •••• •••• {card.last4 ?? "0000"}
        </Text>
        <View style={styles.cardBottom}>
          <View>
            <Text style={styles.cardFieldLabel}>BALANCE</Text>
            <Text style={styles.cardFieldValue}>
              ₦{((card.balance ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View>
            <Text style={styles.cardFieldLabel}>EXPIRES</Text>
            <Text style={styles.cardFieldValue}>{card.expiryMonth}/{card.expiryYear}</Text>
          </View>
          <View>
            <Text style={styles.cardFieldLabel}>LIMIT</Text>
            <Text style={styles.cardFieldValue}>
              ₦{((card.spendLimit ?? 0) / 100).toLocaleString()}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function VirtualCardsScreen() {
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [spendLimit, setSpendLimit] = useState("");
  const [currency, setCurrency] = useState("NGN");

  const { data, isLoading, refetch } = trpc.virtualCards.list.useQuery(
    { page: 1, limit: 20 },
    { staleTime: 60_000 }
  );

  const createCard = trpc.virtualCards.create.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setLabel(""); setSpendLimit("");
      refetch();
      Alert.alert("Success", "Virtual card created successfully");
    },
    onError: (e) => Alert.alert("Error", e.message),
  });

  const cards = data?.cards ?? [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Virtual Cards</Text>
          <Text style={styles.headerSub}>{cards.length} card{cards.length !== 1 ? "s" : ""}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>New Card</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Balance</Text>
          <Text style={styles.statValue}>
            ₦{((data?.totalBalance ?? 0) / 100).toLocaleString()}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Active Cards</Text>
          <Text style={[styles.statValue, { color: "#22c55e" }]}>{data?.activeCount ?? 0}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Frozen</Text>
          <Text style={[styles.statValue, { color: "#f59e0b" }]}>{data?.frozenCount ?? 0}</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#3b82f6" size="large" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <CardDisplay card={item} />}
          contentContainerStyle={{ padding: 16, gap: 16 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="card" size={48} color="#334155" />
              <Text style={styles.emptyText}>No virtual cards yet</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
                <Text style={styles.emptyBtnText}>Create Your First Card</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Virtual Card</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.inputLabel}>Card Label</Text>
            <TextInput style={styles.input} placeholder="e.g. Marketing Expenses"
              placeholderTextColor="#64748b" value={label} onChangeText={setLabel} />

            <Text style={styles.inputLabel}>Spend Limit (₦)</Text>
            <TextInput style={styles.input} placeholder="0.00"
              placeholderTextColor="#64748b" value={spendLimit}
              onChangeText={setSpendLimit} keyboardType="decimal-pad" />

            <Text style={styles.inputLabel}>Currency</Text>
            <View style={styles.currencyRow}>
              {["NGN", "USD", "GBP", "EUR"].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.currencyChip, currency === c && styles.currencyChipActive]}
                  onPress={() => setCurrency(c)}
                >
                  <Text style={[styles.currencyText, currency === c && styles.currencyTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, createCard.isPending && styles.submitBtnDisabled]}
              onPress={() => createCard.mutate({
                label: label || "Virtual Card",
                spendLimit: spendLimit ? Math.round(parseFloat(spendLimit) * 100) : undefined,
                currency,
              })}
              disabled={createCard.isPending}
            >
              {createCard.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Create Card</Text>
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
  headerSub: { color: "#64748b", fontSize: 13 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#3b82f6", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: "#1e293b", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#334155" },
  statLabel: { color: "#64748b", fontSize: 11, marginBottom: 4 },
  statValue: { color: "#f1f5f9", fontSize: 16, fontWeight: "700" },
  card: { borderRadius: 20, padding: 20, minHeight: 160 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  cardLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cardStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  cardStatusText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  cardNumber: { color: "#fff", fontSize: 18, fontWeight: "700", letterSpacing: 3, marginBottom: 20 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between" },
  cardFieldLabel: { color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  cardFieldValue: { color: "#fff", fontSize: 14, fontWeight: "700", marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyText: { color: "#475569", fontSize: 16 },
  emptyBtn: { backgroundColor: "#3b82f6", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText: { color: "#fff", fontWeight: "700" },
  modal: { flex: 1, backgroundColor: "#0f172a" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  modalTitle: { color: "#f1f5f9", fontSize: 18, fontWeight: "700" },
  modalBody: { padding: 20 },
  inputLabel: { color: "#94a3b8", fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, color: "#f1f5f9", fontSize: 15, borderWidth: 1, borderColor: "#334155" },
  currencyRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  currencyChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" },
  currencyChipActive: { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
  currencyText: { color: "#94a3b8", fontWeight: "600" },
  currencyTextActive: { color: "#fff" },
  submitBtn: { backgroundColor: "#3b82f6", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 24, marginBottom: 40 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
