import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';

interface StaffMember { id: string; name: string; role: string; department: string; status: string; }

export default function StaffManagementScreen() {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/trpc/staffMgmt.listMembers?input=%7B%22page%22%3A1%7D', { credentials: 'include' });
      const data = await resp.json();
      setMembers(data?.result?.data?.members ?? []);
    } catch (e) { Alert.alert('Error', String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadMembers(); }, []);

  const statusColor = (s: string) => s === 'active' ? '#22c55e' : '#9ca3af';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Staff Management</Text>
        <TouchableOpacity onPress={loadMembers} style={styles.refreshBtn}><Text style={styles.refreshText}>↻</Text></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} /> :
        <FlatList data={members} keyExtractor={i => i.id}
          ListEmptyComponent={<Text style={styles.empty}>No staff members found</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={[styles.avatar, { backgroundColor: '#6366f1' }]}>
                <Text style={styles.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSub}>{item.role} · {item.department}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '33' }]}>
                <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
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
  refreshBtn: { padding: 8 },
  refreshText: { fontSize: 20, color: '#6366f1' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 8, marginHorizontal: 16, borderRadius: 12, padding: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 15 },
});
