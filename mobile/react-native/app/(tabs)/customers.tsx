import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  FlatList, StyleSheet, Modal, ActivityIndicator, Alert
} from 'react-native';
import { trpc } from '@/lib/trpc';

const C = {
  bg: '#0f172a', card: '#1e293b', accent: '#6366f1',
  text: '#f8fafc', muted: '#94a3b8', border: '#334155',
  success: '#22c55e', error: '#ef4444', warning: '#f59e0b',
};

export default function CustomersScreen() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  const { data, isLoading, refetch } = trpc.customers.list.useQuery({ search, limit: 50 });
  const createMutation = trpc.customers.create.useMutation({
    onSuccess: () => { setShowCreate(false); setForm({ name: '', email: '', phone: '' }); refetch(); },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const customers: any[] = (data as any)?.customers ?? [];

  const statusColor = (s: string) => s === 'active' ? C.success : s === 'suspended' ? C.error : C.warning;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Customers</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowCreate(true)}>
          <Text style={s.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>
      <TextInput style={s.search} placeholder="Search customers..." placeholderTextColor={C.muted}
        value={search} onChangeText={setSearch} />
      {isLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : (
        <FlatList data={customers} keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>No customers yet</Text></View>}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardRow}>
                <View style={s.avatar}><Text style={s.avatarText}>{(item.name || 'U').charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.customerName}>{item.name}</Text>
                  <Text style={s.customerEmail}>{item.email}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: statusColor(item.status) + '22' }]}>
                  <Text style={[s.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>New Customer</Text>
            <TextInput style={s.input} placeholder="Full name" placeholderTextColor={C.muted}
              value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} />
            <TextInput style={s.input} placeholder="Email address" placeholderTextColor={C.muted}
              value={form.email} onChangeText={v => setForm(p => ({ ...p, email: v }))}
              keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={s.input} placeholder="+234 801 234 5678" placeholderTextColor={C.muted}
              value={form.phone} onChangeText={v => setForm(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.submitBtn} onPress={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
                <Text style={s.submitText}>{createMutation.isPending ? 'Saving...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  addBtn: { backgroundColor: C.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  search: { backgroundColor: C.card, color: C.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, fontSize: 14, borderWidth: 1, borderColor: C.border },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent + '33', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: C.accent, fontSize: 18, fontWeight: '700' },
  customerName: { color: C.text, fontSize: 15, fontWeight: '600' },
  customerEmail: { color: C.muted, fontSize: 13, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: C.muted, fontSize: 15 },
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modal: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: { backgroundColor: C.bg, color: C.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 14, borderWidth: 1, borderColor: C.border },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelText: { color: C.muted, fontWeight: '600' },
  submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700' },
});
