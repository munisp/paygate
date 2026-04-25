// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://paygate.manus.space';

export default function ComplianceScreen({ navigation }: any) {
  const [kycList, setKycList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/trpc/complianceKyc.list?input={"limit":50}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setKycList(d?.result?.data?.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = kycList.filter((k: any) =>
    k.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    k.status?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (s: string) => s === 'approved' ? '#10b981' : s === 'rejected' ? '#ef4444' : '#f59e0b';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Compliance & KYC</Text>
      <TextInput style={styles.search} placeholder="Search customers..." value={search} onChangeText={setSearch} placeholderTextColor="#94a3b8" />
      {loading ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} /> : (
        <FlatList
          data={filtered}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }: any) => (
            <View style={styles.card}>
              <Text style={styles.name}>{item.customerName || 'Unknown'}</Text>
              <Text style={styles.email}>{item.email}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status?.toUpperCase()}</Text>
              </View>
              <Text style={styles.date}>{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : ''}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No KYC records found</Text>}
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
  name: { fontSize: 16, fontWeight: '600', color: '#f1f5f9' },
  email: { fontSize: 13, color: '#94a3b8', marginTop: 4 },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, color: '#64748b', marginTop: 6 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40 },
});
