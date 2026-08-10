import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Switch, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useTrpc } from '../../hooks/useTrpc';

const ACTION_COLORS: Record<string, string> = { block: '#ef4444', flag: '#f97316', notify: '#3b82f6' };

export default function FraudRuleEngineScreen() {
  const { query } = useTrpc();
  const [rules, setRules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const result = await query.wave22.fraudRuleEngine.list.query({ limit: 50 });
      setRules(result?.rules ?? result ?? []);
    } catch (error) {
      console.error('Failed to fetch fraud rules:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const onRefresh = () => { setRefreshing(true); fetchRules(); };

  if (isLoading) return <View style={styles.container}><ActivityIndicator color="#6366f1" /></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fraud Rule Engine</Text>
      <FlatList
        data={rules}
        keyExtractor={item => item.id ?? String(Math.random())}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.name ?? item.ruleName}</Text>
              <View style={[styles.badge, { backgroundColor: ACTION_COLORS[item.action] ?? '#6366f1' }]}>
                <Text style={styles.badgeText}>{item.action ?? item.ruleType}</Text>
              </View>
            </View>
            <Text style={styles.condition}>{item.condition ?? item.description}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No fraud rules configured</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: 'white', marginBottom: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  name: { fontSize: 16, fontWeight: '600', color: 'white', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: 'white', fontSize: 12, fontWeight: '600' },
  condition: { fontSize: 13, color: '#94a3b8', fontFamily: 'monospace' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 40 },
});
