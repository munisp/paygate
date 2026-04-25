// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TextInput } from 'react-native';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://paygate.manus.space';

export default function SettlementsScreen() {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/trpc/settlements.list?input={"limit":50}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setSettlements(d?.result?.data?.items || d?.result?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = settlements.filter((s: any) =>
    s.reference?.toLowerCase().includes(search.toLowerCase()) ||
    s.status?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (s: string) => s === 'completed' ? '#10b981' : s === 'failed' ? '#ef4444' : '#f59e0b';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settlements</Text>
      <TextInput style={styles.search} placeholder="Search settlements..." value={search} onChangeText={setSearch} placeholderTextColor="#94a3b8" />
      {loading ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} /> : (
        <FlatList
          data={filtered}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }: any) => (
            <View style={styles.card}>
              <Text style={styles.ref}>{item.reference || item.id}</Text>
              <Text style={styles.amount}>₦{Number(item.amount || 0).toLocaleString()}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status?.toUpperCase()}</Text>
              </View>
              <Text style={styles.date}>{item.settledAt ? new Date(item.settledAt).toLocaleDateString() : ''}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No settlements found</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  search: { backgroundColor: '#1e293b', color: '#f1f5f9', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12 },
  ref: { fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' },
  amount: { fontSize: 20, fontWeight: '700', color: '#f1f5f9', marginTop: 4 },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, color: '#64748b', marginTop: 6 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40 },
});
