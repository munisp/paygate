import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';

const GoldSIPScreen: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      // TODO: wire to real tRPC endpoint: trpc.portfolioRebalancing.list
      const response = await fetch('/api/trpc/portfolioRebalancing.list?input={}', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Request failed');
      const json = await response.json();
      setData(json?.result?.data ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading Gold SIP...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Gold SIP</Text>
      <FlatList
        data={data}
        keyExtractor={(item, index) => item?.id ?? String(index)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardText}>{item?.id ?? 'Item'}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No Gold SIP data available.</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  header: { fontSize: 20, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  loadingText: { color: '#94a3b8', marginTop: 12 },
  errorText: { color: '#f87171', fontSize: 16, textAlign: 'center' },
  retryBtn: { marginTop: 16, backgroundColor: '#6366f1', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 8 },
  cardText: { color: '#e2e8f0' },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 32 },
});

export default GoldSIPScreen;
