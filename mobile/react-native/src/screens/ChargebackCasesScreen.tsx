import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';

interface Item { id: string; label: string; status: string; }

export default function ChargebackCasesScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  const loadData = async () => {
    await new Promise(r => setTimeout(r, 500));
    setItems(Array.from({ length: 6 }, (_, i) => ({ id: `item-${i}`, label: `ChargebackCases #${i}`, status: i % 2 === 0 ? 'active' : 'pending' })));
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.label}>{item.label}</Text>
            <View style={[styles.badge, item.status === 'active' ? styles.active : styles.pending]}>
              <Text style={styles.badgeText}>{item.status}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  label: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  active: { backgroundColor: '#dcfce7' },
  pending: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
