import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';

export default function InsuranceClaimsScreen() {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/trpc/insuranceClaims.list?input=%7B%22page%22%3A1%7D', { credentials: 'include' });
      const data = await resp.json();
      setClaims(data?.result?.data?.claims ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Insurance Claims</Text>
        <TouchableOpacity onPress={load}><Text style={styles.refresh}>↻</Text></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} /> :
        <FlatList data={claims} keyExtractor={i => i.id}
          ListEmptyComponent={<Text style={styles.empty}>No claims found</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.claimNumber ?? item.id}</Text>
              <Text style={styles.cardSub}>{item.claimType} · ₦{item.claimAmount}</Text>
              <View style={[styles.badge, { backgroundColor: item.status === 'approved' ? '#dcfce7' : '#fef9c3' }]}>
                <Text style={styles.badgeText}>{item.status}</Text>
              </View>
            </View>
          )} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  refresh: { fontSize: 20, color: '#6366f1' },
  card: { backgroundColor: '#fff', margin: 8, marginHorizontal: 16, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 6 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 15 },
});
