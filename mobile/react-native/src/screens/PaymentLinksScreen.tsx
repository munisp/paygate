import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, TextInput, Share } from 'react-native';
import { trpc } from '../lib/trpc';

const statusColor = (s: string) => ({ active: '#16a34a', expired: '#6b7280', disabled: '#dc2626', draft: '#d97706' }[s] ?? '#6b7280');

export default function PaymentLinksScreen() {
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = trpc.paymentLinks.list.useQuery({ limit: 50 });
  const deactivateMutation = trpc.paymentLinks.deactivate.useMutation({ onSuccess: () => refetch(), onError: (e) => Alert.alert('Error', e.message) });
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const links = (data as any[]) ?? [];
  const filtered = links.filter(l => !search || String(l.title ?? '').toLowerCase().includes(search.toLowerCase()) || String(l.id ?? '').toLowerCase().includes(search.toLowerCase()));

  const handleShare = (item: any) => {
    if (item.url) Share.share({ message: `Pay via PayGate: ${item.url}`, url: item.url });
    else Alert.alert('No URL', 'This payment link has no URL yet');
  };

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#2563eb" /></View>;

  return (
    <View style={s.container}>
      <Text style={s.title}>Payment Links</Text>
      <TextInput style={s.search} placeholder="Search by title or ID..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
      <FlatList
        data={filtered}
        keyExtractor={l => String(l.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<View style={s.center}><Text style={{ color: '#6b7280' }}>No payment links found</Text></View>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.title2}>{item.title ?? 'Untitled'}</Text>
              <View style={[s.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={[s.badgeText, { color: statusColor(item.status) }]}>{item.status ?? 'unknown'}</Text>
              </View>
            </View>
            <Text style={s.amount}>{(item.amount ?? 0).toLocaleString()} {item.currency ?? 'NGN'}</Text>
            <Text style={s.uses}>Uses: {item.usageCount ?? 0}{item.maxUses ? `/${item.maxUses}` : ''}</Text>
            <View style={s.actions}>
              <TouchableOpacity style={s.actionBtn} onPress={() => handleShare(item)}>
                <Text style={s.actionText}>Share</Text>
              </TouchableOpacity>
              {item.status === 'active' && (
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#fee2e2' }]} onPress={() => deactivateMutation.mutate({ id: item.id })}>
                  <Text style={[s.actionText, { color: '#dc2626' }]}>Deactivate</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 12 },
  title2: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  search: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  amount: { fontSize: 18, fontWeight: '700', color: '#2563eb', marginBottom: 4 },
  uses: { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, backgroundColor: '#eff6ff', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  actionText: { fontSize: 13, fontWeight: '600', color: '#2563eb' },
});
