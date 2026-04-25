import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { trpc } from '../lib/trpc';

const sevColor = (s: string) => ({ critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a' }[s] ?? '#6b7280');

export default function FraudRiskScreen() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = trpc.fraudRisk.list.useQuery({ severity: filter === 'all' ? undefined : filter, limit: 50 });
  const reviewMutation = trpc.fraudRisk.review.useMutation({ onSuccess: () => refetch(), onError: (e) => Alert.alert('Error', e.message) });
  const clearMutation = trpc.fraudRisk.clear.useMutation({ onSuccess: () => refetch(), onError: (e) => Alert.alert('Error', e.message) });

  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const alerts = (data as any[]) ?? [];
  const filtered = alerts.filter(a => !search || String(a.transactionId ?? '').toLowerCase().includes(search.toLowerCase()));

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#dc2626" /></View>;

  return (
    <View style={s.container}>
      <Text style={s.title}>Fraud & Risk Alerts</Text>
      <TextInput style={s.search} placeholder="Search by transaction ID..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
      <View style={s.filterRow}>
        {['all', 'critical', 'high', 'medium', 'low'].map(f => (
          <TouchableOpacity key={f} style={[s.chip, filter === f && s.chipActive]} onPress={() => setFilter(f)}>
            <Text style={[s.chipText, filter === f && s.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={a => String(a.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<View style={s.center}><Text style={{ color: '#6b7280' }}>No fraud alerts</Text></View>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => Alert.alert(String(item.id), `Score: ${item.riskScore ?? 'N/A'}\nReason: ${item.reason ?? 'N/A'}\nStatus: ${item.status ?? 'N/A'}\nAmount: ${(item.amount ?? 0).toLocaleString()} ${item.currency ?? 'NGN'}`, [
            { text: 'Close', style: 'cancel' },
            { text: 'Review', onPress: () => reviewMutation.mutate({ id: item.id }) },
            { text: 'Clear', onPress: () => clearMutation.mutate({ id: item.id }) },
          ])}>
            <View style={s.row}>
              <Text style={s.txnId}>{item.transactionId ?? item.id}</Text>
              <View style={[s.badge, { backgroundColor: sevColor(item.severity) + '20' }]}>
                <Text style={[s.badgeText, { color: sevColor(item.severity) }]}>{item.severity ?? 'unknown'}</Text>
              </View>
            </View>
            <Text style={s.reason}>{item.reason ?? 'No reason provided'}</Text>
            <View style={s.row}>
              <Text style={s.score}>Score: {item.riskScore ?? 'N/A'}</Text>
              <Text style={s.amount}>{(item.amount ?? 0).toLocaleString()} {item.currency ?? 'NGN'}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 12 },
  search: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#e5e7eb' },
  chipActive: { backgroundColor: '#dc2626' },
  chipText: { fontSize: 12, color: '#374151', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  txnId: { fontSize: 13, fontWeight: '600', color: '#374151' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  reason: { fontSize: 14, color: '#374151', marginBottom: 8 },
  score: { fontSize: 12, color: '#6b7280' },
  amount: { fontSize: 14, fontWeight: '600', color: '#111827' },
});
