import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';

const RAILS = ['CIPS', 'UPI', 'PIX', 'SWIFT', 'SEPA'];
const STATUSES = ['all', 'pending', 'processing', 'completed', 'failed'];

interface Transfer {
  id: string;
  rail: string;
  amount: number;
  currency: string;
  status: string;
  recipient: string;
  createdAt: string;
}

export default function CrossBorderScreen() {
  const [selectedRail, setSelectedRail] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [transfers] = useState<Transfer[]>([
    { id: 'CB-001', rail: 'CIPS', amount: 50000, currency: 'CNY', status: 'completed', recipient: 'Bank of China', createdAt: new Date().toISOString() },
    { id: 'CB-002', rail: 'UPI', amount: 100000, currency: 'INR', status: 'processing', recipient: 'HDFC Bank', createdAt: new Date().toISOString() },
    { id: 'CB-003', rail: 'PIX', amount: 2500, currency: 'BRL', status: 'completed', recipient: 'Itaú Unibanco', createdAt: new Date().toISOString() },
    { id: 'CB-004', rail: 'SWIFT', amount: 10000, currency: 'USD', status: 'pending', recipient: 'JP Morgan', createdAt: new Date().toISOString() },
  ]);

  const filtered = transfers.filter(t => {
    const matchRail = selectedRail === 'all' || t.rail === selectedRail;
    const matchStatus = selectedStatus === 'all' || t.status === selectedStatus;
    const matchSearch = !search || t.id.includes(search) || t.recipient.toLowerCase().includes(search.toLowerCase());
    return matchRail && matchStatus && matchSearch;
  });

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return '#22c55e';
      case 'processing': return '#3b82f6';
      case 'pending': return '#f59e0b';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const railColor = (r: string) => {
    switch (r) {
      case 'CIPS': return '#dc2626';
      case 'UPI': return '#7c3aed';
      case 'PIX': return '#059669';
      case 'SWIFT': return '#2563eb';
      case 'SEPA': return '#0891b2';
      default: return '#6b7280';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cross-Border Transfers</Text>

      {/* Search */}
      <TextInput
        style={styles.search}
        placeholder="Search by ID or recipient..."
        value={search}
        onChangeText={setSearch}
      />

      {/* Rail Filter */}
      <FlatList
        horizontal
        data={['all', ...RAILS]}
        keyExtractor={i => i}
        style={styles.filterRow}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, selectedRail === item && styles.filterChipActive]}
            onPress={() => setSelectedRail(item)}
          >
            <Text style={[styles.filterChipText, selectedRail === item && styles.filterChipTextActive]}>
              {item.toUpperCase()}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Status Filter */}
      <FlatList
        horizontal
        data={STATUSES}
        keyExtractor={i => i}
        style={styles.filterRow}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, selectedStatus === item && styles.filterChipActive]}
            onPress={() => setSelectedStatus(item)}
          >
            <Text style={[styles.filterChipText, selectedStatus === item && styles.filterChipTextActive]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{transfers.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#22c55e' }]}>
            {transfers.filter(t => t.status === 'completed').length}
          </Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#f59e0b' }]}>
            {transfers.filter(t => t.status === 'pending').length}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#ef4444' }]}>
            {transfers.filter(t => t.status === 'failed').length}
          </Text>
          <Text style={styles.statLabel}>Failed</Text>
        </View>
      </View>

      {/* Transfer List */}
      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={t => t.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => Alert.alert(item.id, `Rail: ${item.rail}\nAmount: ${item.amount} ${item.currency}\nStatus: ${item.status}\nRecipient: ${item.recipient}`)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.railBadge, { backgroundColor: railColor(item.rail) + '20', borderColor: railColor(item.rail) }]}>
                  <Text style={[styles.railText, { color: railColor(item.rail) }]}>{item.rail}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: statusColor(item.status) }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.transferId}>{item.id}</Text>
              <Text style={styles.recipient}>{item.recipient}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.amount}>{item.amount.toLocaleString()} {item.currency}</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No transfers found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  search: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 14 },
  filterRow: { flexGrow: 0, marginBottom: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  filterChipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  filterChipText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  railBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  railText: { fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  transferId: { fontSize: 13, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
  recipient: { fontSize: 12, color: '#64748b', marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  date: { fontSize: 11, color: '#94a3b8' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#94a3b8', fontSize: 14 },
});
