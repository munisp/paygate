import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

export default function FXDashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = trpc.fx.getRates.useQuery({ base: 'NGN', limit: 20 });
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const rates = (data as any[]) ?? [];

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#2563eb" /></View>;

  return (
    <View style={s.container}>
      <Text style={s.title}>FX Dashboard</Text>
      <Text style={s.subtitle}>Live exchange rates (base: NGN)</Text>
      <FlatList
        data={rates}
        keyExtractor={r => String(r.id ?? r.currency)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<View style={s.center}><Text style={{ color: '#6b7280' }}>No FX rates available</Text></View>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => Alert.alert(`${item.baseCurrency ?? 'NGN'}/${item.quoteCurrency ?? item.currency}`, `Rate: ${item.rate ?? item.midRate ?? 'N/A'}\nBid: ${item.bidRate ?? 'N/A'}\nAsk: ${item.askRate ?? 'N/A'}\nUpdated: ${item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'N/A'}`)}>
            <View style={s.row}>
              <Text style={s.pair}>{item.baseCurrency ?? 'NGN'}/{item.quoteCurrency ?? item.currency ?? 'USD'}</Text>
              <Text style={s.rate}>{(item.rate ?? item.midRate ?? 0).toFixed(4)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Bid: {(item.bidRate ?? 0).toFixed(4)}</Text>
              <Text style={s.label}>Ask: {(item.askRate ?? 0).toFixed(4)}</Text>
              <Text style={s.label}>Spread: {item.spread ?? 'N/A'}</Text>
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
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  pair: { fontSize: 16, fontWeight: '700', color: '#111827' },
  rate: { fontSize: 18, fontWeight: '700', color: '#2563eb' },
  label: { fontSize: 12, color: '#6b7280' },
});
