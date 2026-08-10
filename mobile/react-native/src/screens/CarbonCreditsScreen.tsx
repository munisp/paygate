/**
 * CarbonCreditsScreen — Wave 124
 * Carbon credit trading, retirement, and offset portfolio management
 * Uses trpc.carbonCredits.list, trpc.carbonCredits.stats, trpc.carbonCredits.retire
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
  ScrollView,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { trpc } from "../lib/trpc";

const STATUS_COLORS: Record<string, string> = {
  active: "#10b981",
  retired: "#6366f1",
  pending: "#f59e0b",
  cancelled: "#ef4444",
};

const TYPE_ICONS: Record<string, string> = {
  voluntary: "🌿",
  compliance: "⚖️",
  renewable: "☀️",
  forestry: "🌲",
  blue_carbon: "🌊",
};

interface CarbonCredit {
  id: string;
  projectName: string;
  creditType: string;
  vintageYear: number;
  quantityTonnes: number;
  pricePerTonne: number;
  status: string;
  registry: string;
  serialNumber?: string | null;
  createdAt: Date;
}

export default function CarbonCreditsScreen() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [showRetire, setShowRetire] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<CarbonCredit | null>(null);
  const [retireQty, setRetireQty] = useState("");

  const { data, isLoading, refetch, isFetching } = trpc.carbonCredits.list.useQuery({
    limit: 20,
    offset: 0,
    status: statusFilter,
  });

  const { data: stats } = trpc.carbonCredits.stats.useQuery();

  const retireMutation = trpc.carbonCredits.retire.useMutation({
    onSuccess: () => {
      Alert.alert("Success", "Carbon credits retired successfully");
      setShowRetire(false);
      setSelectedCredit(null);
      setRetireQty("");
      refetch();
    },
    onError: (e) => Alert.alert("Error", e.message),
  });

  const renderItem = ({ item }: { item: CarbonCredit }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.typeIcon}>{TYPE_ICONS[item.creditType] ?? "🌍"}</Text>
          <View>
            <Text style={styles.projectName}>{item.projectName}</Text>
            <Text style={styles.registry}>{item.registry} · {item.vintageYear}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + "20" }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
            {item.status}
          </Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>{item.quantityTonnes.toLocaleString()}</Text>
          <Text style={styles.metricLabel}>Tonnes CO₂</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>${item.pricePerTonne}</Text>
          <Text style={styles.metricLabel}>Per Tonne</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricValue}>${(item.quantityTonnes * item.pricePerTonne).toLocaleString()}</Text>
          <Text style={styles.metricLabel}>Total Value</Text>
        </View>
      </View>
      {item.status === "active" && (
        <TouchableOpacity
          style={styles.retireButton}
          onPress={() => { setSelectedCredit(item); setShowRetire(true); }}
        >
          <Text style={styles.retireButtonText}>🌿 Retire Credits</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Stats */}
      {stats && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: "#10b981" }]}>
            <Text style={[styles.statValue, { color: "#10b981" }]}>{stats.totalTonnes ?? 0}</Text>
            <Text style={styles.statLabel}>Total Tonnes</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#6366f1" }]}>
            <Text style={[styles.statValue, { color: "#6366f1" }]}>{stats.retiredTonnes ?? 0}</Text>
            <Text style={styles.statLabel}>Retired</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#f59e0b" }]}>
            <Text style={[styles.statValue, { color: "#f59e0b" }]}>${stats.portfolioValue ?? 0}</Text>
            <Text style={styles.statLabel}>Portfolio</Text>
          </View>
        </View>
      )}

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {[undefined, "active", "retired", "pending", "cancelled"].map(s => (
          <TouchableOpacity
            key={s ?? "all"}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
              {s ?? "All"}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data?.rows ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No carbon credits found</Text>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* Retire Modal */}
      <Modal visible={showRetire} animationType="slide" presentationStyle="formSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Retire Carbon Credits</Text>
            <TouchableOpacity onPress={() => setShowRetire(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {selectedCredit && (
            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Project</Text>
              <Text style={styles.fieldValue}>{selectedCredit.projectName}</Text>

              <Text style={styles.fieldLabel}>Available Tonnes</Text>
              <Text style={styles.fieldValue}>{selectedCredit.quantityTonnes.toLocaleString()} tCO₂e</Text>

              <Text style={styles.fieldLabel}>Quantity to Retire (tonnes)</Text>
              <TextInput
                style={styles.input}
                value={retireQty}
                onChangeText={setRetireQty}
                keyboardType="numeric"
                placeholder="Enter quantity"
              />

              <TouchableOpacity
                style={[styles.submitButton, retireMutation.isPending && { opacity: 0.6 }]}
                disabled={retireMutation.isPending}
                onPress={() => retireMutation.mutate({
                  id: selectedCredit.id,
                  quantityToRetire: parseFloat(retireQty || "0"),
                })}
              >
                <Text style={styles.submitButtonText}>
                  {retireMutation.isPending ? "Retiring..." : "Confirm Retirement"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0fdf4" },
  statsRow: { flexDirection: "row", padding: 12, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 8, padding: 10,
    borderLeftWidth: 3, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  statLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  filterRow: { paddingHorizontal: 12, paddingVertical: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "#f1f5f9", marginRight: 8, borderWidth: 1, borderColor: "#e2e8f0",
  },
  filterChipActive: { backgroundColor: "#10b981", borderColor: "#10b981" },
  filterChipText: { fontSize: 13, color: "#64748b" },
  filterChipTextActive: { color: "#fff", fontWeight: "600" },
  card: {
    backgroundColor: "#fff", marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, padding: 14, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  typeIcon: { fontSize: 24 },
  projectName: { fontSize: 14, fontWeight: "600", color: "#1e293b", flex: 1 },
  registry: { fontSize: 12, color: "#64748b", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: "600" },
  cardBody: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  metricBox: { alignItems: "center", flex: 1 },
  metricValue: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  metricLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  retireButton: {
    backgroundColor: "#10b981", borderRadius: 8, paddingVertical: 8, alignItems: "center",
  },
  retireButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  emptyText: { textAlign: "center", color: "#94a3b8", marginTop: 60, fontSize: 15 },
  modal: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  modalClose: { fontSize: 20, color: "#64748b" },
  modalBody: { padding: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 4, marginTop: 12 },
  fieldValue: { fontSize: 14, color: "#1e293b" },
  input: {
    borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#1e293b",
  },
  submitButton: {
    backgroundColor: "#10b981", borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 24,
  },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
