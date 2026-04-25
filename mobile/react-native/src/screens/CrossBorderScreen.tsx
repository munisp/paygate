import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { trpc } from '../lib/trpc';

const statusColor = (s: string) => ({ completed: '#16a34a', pending: '#d97706', processing: '#2563eb', failed: '#dc2626', cancelled: '#6b7280' }[s] ?? '#6b7280');

export default function CrossBorderScreen() {
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = trpc.crossBorder.list.useQuery({ limit: 50 });
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const transfers = (data as any[]) ?? [];
  const filtered = transfers.filter(t => !search || String(t.id ?? '').toLowerCase().includes(search.toLowerCase()) || String(t.recipientName ?? '').toLowerCase().includes(search.toLowerCase()));

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#2563eb" /></View>;

  return (
    <View style={s.container}>
      <Text style={s.title}>Cross-Border Transfers</Text>
      <TextInput style={s.search} placeholder="Search by ID or recipient..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
      <FlatList
        data={filtered}
        keyExtractor={t => String(t.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<View style={s.center}><Text style={{ color: '#6b7280' }}>No transfers found</Text></View>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => Alert.alert(String(item.id), `Recipient: ${item.recipientName ?? 'N/A'}\nAmount: ${(item.sendAmount ?? 0).toLocaleString()} ${item.sendCurrency ?? 'NGN'}\nReceive: ${(item.receiveAmount ?? 0).toLocaleString()} ${item.receiveCurrency ?? 'USD'}\nStatus: ${item.status}\nCorridors: ${item.corridor ?? 'N/A'}`)}>
            <View style={s.row}>
              <Text style={s.id}>{item.id}</Text>
              <View style={[s.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={[s.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
              </View>
            </View>
            <Text style={s.recipient}>{item.recipientName ?? 'Unknown recipient'}</Text>
            <View style={s.row}>
              <Text style={s.amount}>{(item.sendAmount ?? 0).toLocaleString()} {item.sendCurrency ?? 'NGN'}</Text>
              <Text style={s.arrow}>→</Text>
              <Text style={s.amount}>{(item.receiveAmount ?? 0).toLocaleString()} {item.receiveCurrency ?? 'USD'}</Text>
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
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  id: { fontSize: 13, fontWeight: '600', color: '#374151' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  recipient: { fontSize: 15, fontWeight: '500', color: '#111827', marginBottom: 8 },
  amount: { fontSize: 14, fontWeight: '600', color: '#111827' },
  arrow: { fontSize: 16, color: '#6b7280' },
});
