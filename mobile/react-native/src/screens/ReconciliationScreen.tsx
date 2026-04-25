// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://paygate.manus.space';

export default function ReconciliationScreen() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/trpc/reconciliation.list?input={"limit":50}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API_BASE}/api/trpc/reconciliation.summary`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([listData, summaryData]) => {
      setRecords(listData?.result?.data?.items || []);
      setSummary(summaryData?.result?.data || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reconciliation</Text>
      {summary && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Matched</Text>
            <Text style={[styles.summaryValue, { color: '#10b981' }]}>{summary.matched || 0}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Unmatched</Text>
            <Text style={[styles.summaryValue, { color: '#ef4444' }]}>{summary.unmatched || 0}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Pending</Text>
            <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>{summary.pending || 0}</Text>
          </View>
        </View>
      )}
      {loading ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} /> : (
        <FlatList
          data={records}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }: any) => (
            <View style={styles.card}>
              <Text style={styles.ref}>{item.reference || item.id}</Text>
              <Text style={styles.amount}>₦{Number(item.amount || 0).toLocaleString()}</Text>
              <Text style={[styles.status, { color: item.status === 'matched' ? '#10b981' : '#f59e0b' }]}>{item.status}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No reconciliation records</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: '#1e293b', borderRadius: 10, padding: 12, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: '700' },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12 },
  ref: { fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' },
  amount: { fontSize: 18, fontWeight: '700', color: '#f1f5f9', marginTop: 4 },
  status: { fontSize: 13, fontWeight: '600', marginTop: 6, textTransform: 'capitalize' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40 },
});
