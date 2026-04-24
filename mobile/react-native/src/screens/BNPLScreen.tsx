import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';

const mockPlans = [
  { id: 'BNPL-001', customer: 'Adaeze Okonkwo', amount: 45000, currency: 'NGN', installments: 3, paid: 1, status: 'active', nextDue: '2026-05-01' },
  { id: 'BNPL-002', customer: 'Emeka Nwosu', amount: 120000, currency: 'NGN', installments: 6, paid: 3, status: 'active', nextDue: '2026-05-15' },
  { id: 'BNPL-003', customer: 'Fatima Aliyu', amount: 30000, currency: 'NGN', installments: 3, paid: 3, status: 'completed', nextDue: null },
  { id: 'BNPL-004', customer: 'Chidi Okeke', amount: 80000, currency: 'NGN', installments: 4, paid: 0, status: 'defaulted', nextDue: '2026-04-01' },
];

const statusColor = (s: string) => ({ active: '#2563eb', completed: '#16a34a', defaulted: '#dc2626', pending: '#d97706' }[s] || '#6b7280');

export default function BNPLScreen() {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? mockPlans : mockPlans.filter(p => p.status === filter);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BNPL Plans</Text>
      <View style={styles.filterRow}>
        {['all', 'active', 'completed', 'defaulted'].map(f => (
          <TouchableOpacity key={f} style={[styles.chip, filter === f && styles.chipActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => Alert.alert(item.id, `Customer: ${item.customer}\nInstallments: ${item.paid}/${item.installments} paid\nNext Due: ${item.nextDue || 'N/A'}`)}>
            <View style={styles.row}>
              <Text style={styles.planId}>{item.id}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.customer}>{item.customer}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(item.paid / item.installments) * 100}%`, backgroundColor: statusColor(item.status) }]} />
            </View>
            <View style={styles.row}>
              <Text style={styles.installments}>{item.paid}/{item.installments} installments</Text>
              <Text style={styles.amount}>{item.amount.toLocaleString()} {item.currency}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  planId: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  customer: { fontSize: 13, color: '#475569', marginBottom: 8 },
  progressBar: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  installments: { fontSize: 12, color: '#64748b' },
  amount: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
});
