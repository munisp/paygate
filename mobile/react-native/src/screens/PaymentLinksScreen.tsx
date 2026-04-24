import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Share } from 'react-native';

const mockLinks = [
  { id: 'PL-001', title: 'Invoice #INV-2026-001', amount: 50000, currency: 'NGN', status: 'active', clicks: 12, payments: 3, expiresAt: '2026-06-01' },
  { id: 'PL-002', title: 'Product Bundle', amount: 25000, currency: 'NGN', status: 'active', clicks: 45, payments: 18, expiresAt: '2026-05-15' },
  { id: 'PL-003', title: 'Event Registration', amount: 10000, currency: 'NGN', status: 'expired', clicks: 200, payments: 87, expiresAt: '2026-04-01' },
];

const statusColor = (s: string) => ({ active: '#16a34a', expired: '#dc2626', draft: '#d97706' }[s] || '#6b7280');

export default function PaymentLinksScreen() {
  const shareLink = (link: any) => {
    Share.share({ message: `Pay ${link.amount.toLocaleString()} ${link.currency} for "${link.title}": https://pay.paygate.ng/${link.id}` });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payment Links</Text>
      <TouchableOpacity style={styles.createBtn} onPress={() => Alert.alert('Create Link', 'Payment link creation coming soon')}>
        <Text style={styles.createBtnText}>+ Create Payment Link</Text>
      </TouchableOpacity>
      <FlatList
        data={mockLinks}
        keyExtractor={l => l.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.linkTitle} numberOfLines={1}>{item.title}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '20' }]}>
                <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.amount}>{item.amount.toLocaleString()} {item.currency}</Text>
            <View style={styles.stats}>
              <Text style={styles.stat}>👁 {item.clicks} views</Text>
              <Text style={styles.stat}>💳 {item.payments} paid</Text>
              <Text style={styles.stat}>📅 Exp: {item.expiresAt}</Text>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => shareLink(item)}>
                <Text style={styles.actionBtnText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => Alert.alert('Copy', `https://pay.paygate.ng/${item.id}`)}>
                <Text style={styles.actionBtnTextSecondary}>Copy Link</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  createBtn: { backgroundColor: '#6366f1', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 16 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  linkTitle: { fontSize: 14, fontWeight: '600', color: '#1e293b', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  amount: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  stats: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  stat: { fontSize: 12, color: '#64748b' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, backgroundColor: '#6366f1', borderRadius: 8, padding: 10, alignItems: 'center' },
  actionBtnSecondary: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  actionBtnTextSecondary: { color: '#475569', fontWeight: '600', fontSize: 13 },
});
