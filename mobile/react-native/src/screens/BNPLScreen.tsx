import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { trpc } from '../lib/trpc';

const statusColor = (s: string) => ({ active: '#2563eb', completed: '#16a34a', defaulted: '#dc2626', pending: '#d97706', cancelled: '#6b7280' }[s] ?? '#6b7280');

export default function BNPLScreen() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = trpc.bnpl.list.useQuery({
    status: filter === 'all' ? undefined : filter,
    limit: 50,
  });

  const approveMutation = trpc.bnpl.approve.useMutation({
    onSuccess: () => { refetch(); Alert.alert('Approved', 'BNPL plan approved'); },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const cancelMutation = trpc.bnpl.cancel.useMutation({
    onSuccess: () => { refetch(); Alert.alert('Cancelled', 'BNPL plan cancelled'); },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const plans = (data as any[]) ?? [];
  const filtered = plans.filter(p =>
    !search || String(p.customerId ?? '').toLowerCase().includes(search.toLowerCase()) ||
    String(p.id ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handlePlanPress = (item: any) => {
    const paid = item.installmentsPaid ?? 0;
    const total = item.totalInstallments ?? 0;
    Alert.alert(
      String(item.id ?? 'BNPL Plan'),
      `Customer: ${item.customerId ?? 'N/A'}\nAmount: ${(item.totalAmount ?? 0).toLocaleString()} ${item.currency ?? 'NGN'}\nInstallments: ${paid}/${total} paid\nNext Due: ${item.nextDueDate ? new Date(item.nextDueDate).toLocaleDateString() : 'N/A'}\nStatus: ${item.status}`,
      [
        { text: 'Close', style: 'cancel' },
        item.status === 'pending'
          ? { text: 'Approve', onPress: () => approveMutation.mutate({ id: item.id }) }
          : { text: 'Cancel', style: 'destructive', onPress: () => cancelMutation.mutate({ id: item.id }) },
      ]
    );
  };

  if (isLoading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={{ marginTop: 8, color: '#6b7280' }}>Loading BNPL plans...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BNPL Plans</Text>
      <TextInput style={styles.search} placeholder="Search by customer or plan ID..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
      <View style={styles.filterRow}>
        {['all', 'active', 'pending', 'completed', 'defaulted'].map(f => (
          <TouchableOpacity key={f} style={[styles.chip, filter === f && styles.chipActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {filtered.length === 0 ? (
        <View style={styles.center}><Text style={{ color: '#6b7280' }}>No BNPL plans found</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={p => String(p.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const paid = item.installmentsPaid ?? 0;
            const total = item.totalInstallments ?? 1;
            return (
              <TouchableOpacity style={styles.card} onPress={() => handlePlanPress(item)}>
                <View style={styles.row}>
                  <Text style={styles.planId}>{item.id}</Text>
                  <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                    <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
                  </View>
                </View>
                <Text style={styles.customer}>{item.customerId ?? 'Unknown'}</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${Math.min(paid / total, 1) * 100}%`, backgroundColor: statusColor(item.status) }]} />
                </View>
                <View style={styles.row}>
                  <Text style={styles.installments}>{paid}/{total} installments</Text>
                  <Text style={styles.amount}>{(item.totalAmount ?? 0).toLocaleString()} {item.currency ?? 'NGN'}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
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
