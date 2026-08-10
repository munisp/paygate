import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useTrpc } from '../../hooks/useTrpc';

const STATUS_COLORS: Record<string, string> = { verified: '#22c55e', pending: '#f97316', uploaded: '#3b82f6', rejected: '#ef4444' };

export default function KYBDocumentUploadScreen() {
  const { query, mutation } = useTrpc();
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const result = await query.kyb.getDocuments.query();
      setDocuments(result?.documents ?? result ?? []);
    } catch (error) {
      console.error('Failed to fetch KYB documents:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const onRefresh = () => { setRefreshing(true); fetchDocuments(); };

  const verified = documents.filter(d => d.status === 'verified').length;
  const required = documents.filter(d => d.required).length;

  if (isLoading) return <View style={styles.container}><ActivityIndicator color="#6366f1" /></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>KYB Documents</Text>
      <View style={styles.progress}>
        <Text style={styles.progressText}>{verified}/{required} verified</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${required > 0 ? (verified / required) * 100 : 0}%` }]} />
        </View>
      </View>
      <FlatList
        data={documents}
        keyExtractor={item => item.id ?? item.type ?? String(Math.random())}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{item.label ?? item.type}</Text>
              {item.status ? (
                <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] ?? '#64748b' }]}>
                  <Text style={styles.badgeText}>{item.status}</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadBtn} onPress={() => Alert.alert('Upload', 'Document upload coming soon')}>
                  <Text style={styles.uploadText}>Upload</Text>
                </TouchableOpacity>
              )}
            </View>
            {item.required && <Text style={styles.required}>Required</Text>}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No documents required</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: 'white', marginBottom: 16 },
  progress: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 16 },
  progressText: { color: '#94a3b8', marginBottom: 8 },
  progressBar: { height: 8, backgroundColor: '#334155', borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: '#22c55e', borderRadius: 4 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '600', color: 'white', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: 'white', fontSize: 12, fontWeight: '600' },
  uploadBtn: { backgroundColor: '#6366f1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  uploadText: { color: 'white', fontSize: 13, fontWeight: '600' },
  required: { color: '#f97316', fontSize: 12, marginTop: 4 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 40 },
});
