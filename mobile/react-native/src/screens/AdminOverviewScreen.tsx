import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, SafeAreaView, StatusBar } from 'react-native';
import { trpc } from '../lib/trpc';
const C = { primary: '#6366F1', bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', muted: '#94A3B8', success: '#10B981', error: '#EF4444', border: '#334155' };
export default function AdminOverviewScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data: stats, isLoading, refetch } = trpc.adminMgmt.getStats.useQuery();
  const { data: merchants } = trpc.adminMgmt.listMerchants.useQuery({ page: 1, limit: 5 });
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  if (isLoading) return <View style={[s.container, s.center]}><ActivityIndicator color={C.primary} size="large" /></View>;
  const statCards = [
    { label: 'Total Merchants', value: (stats as any)?.totalMerchants ?? 0 },
    { label: 'Active Users', value: (stats as any)?.activeUsers ?? 0 },
    { label: 'Transactions Today', value: (stats as any)?.transactionsToday ?? 0 },
    { label: 'Revenue (NGN)', value: `₦${((stats as any)?.revenueToday ?? 0).toLocaleString()}` },
  ];
  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}>
        <Text style={s.title}>Admin Overview</Text>
        <View style={s.grid}>
          {statCards.map(c => (
            <View key={c.label} style={s.statCard}>
              <Text style={s.statValue}>{c.value}</Text>
              <Text style={s.statLabel}>{c.label}</Text>
            </View>
          ))}
        </View>
        <Text style={s.sectionTitle}>Recent Merchants</Text>
        {((merchants as any)?.merchants ?? []).map((m: any) => (
          <View key={m.id} style={s.card}>
            <Text style={s.cardTitle}>{m.businessName ?? m.name}</Text>
            <Text style={s.cardSub}>{m.email} · {m.status}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg }, center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 }, title: { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  statValue: { fontSize: 22, fontWeight: '700', color: C.primary, marginBottom: 4 },
  statLabel: { fontSize: 12, color: C.muted },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 12 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 15, fontWeight: '600', color: C.text }, cardSub: { fontSize: 12, color: C.muted, marginTop: 2 },
});
