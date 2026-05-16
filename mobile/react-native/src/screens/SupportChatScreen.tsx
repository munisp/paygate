import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Alert, TextInput } from 'react-native';
import { trpc } from '../lib/trpc';

export default function SupportChatScreen() {
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const { data, isLoading, refetch, isRefetching } = (trpc as any).supportRouter.listTickets.useQuery(undefined, {
    onError: (e: any) => Alert.alert('Error', e.message),
  });
  const tickets: any[] = Array.isArray(data) ? data : (data as any)?.tickets ?? (data as any)?.rows ?? [];
  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#6366f1" /></View>;
  return (
    <View style={s.container}>
      <Text style={s.title}>Support Tickets</Text>
      {!creating && (
        <TouchableOpacity style={[s.btn, s.btnPrimary, { marginBottom: 12 }]} onPress={() => setCreating(true)}>
          <Text style={s.btnText}>+ New Ticket</Text>
        </TouchableOpacity>
      )}
      {creating && (
        <View style={s.createCard}>
          <TextInput style={s.input} placeholder="Subject" value={newSubject} onChangeText={setNewSubject} />
          <TextInput style={[s.input, { height: 80 }]} placeholder="Describe your issue…" value={newMessage} onChangeText={setNewMessage} multiline />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => { setCreating(false); refetch(); }}>
              <Text style={s.btnText}>Submit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={() => setCreating(false)}>
              <Text style={[s.btnText, { color: '#64748b' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <FlatList
        data={tickets}
        keyExtractor={(item: any) => String(item.id ?? Math.random())}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={<Text style={s.empty}>No support tickets yet.</Text>}
        renderItem={({ item }: { item: any }) => (
          <View style={s.card}>
            <Text style={s.label}>{item.subject ?? `Ticket #${item.id}`}</Text>
            <Text style={s.meta} numberOfLines={1}>{item.message ?? ''}</Text>
            <View style={[s.badge, item.status === 'open' ? s.open : item.status === 'resolved' ? s.resolved : s.pending]}>
              <Text style={s.badgeText}>{item.status ?? 'open'}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b', marginBottom: 16 },
  createCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 14, color: '#1e293b', backgroundColor: '#f8fafc' },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#6366f1' },
  btnSecondary: { backgroundColor: '#e2e8f0' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  label: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  meta: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  open: { backgroundColor: '#dbeafe' },
  resolved: { backgroundColor: '#dcfce7' },
  pending: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#1e293b' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 14 },
});
