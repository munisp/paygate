import React from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

export default function InsuranceClaimsScreen() {
  const { data, isLoading, refetch, isRefetching } = trpc.insuranceClaims.list.useQuery({ limit: 20 }, {
    onError: (e: any) => Alert.alert('Error', e.message),
  } as any);
  const claims: any[] = Array.isArray(data) ? data : (data as any)?.rows ?? (data as any)?.claims ?? [];
  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#6366f1" /></View>;
  return (
    <View style={s.container}>
      <Text style={s.title}>Insurance Claims</Text>
      <FlatList
        data={claims}
        keyExtractor={(item: any) => String(item.id ?? Math.random())}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={<Text style={s.empty}>No insurance claims found.</Text>}
        renderItem={({ item }: { item: any }) => (
          <View style={s.card}>
            <Text style={s.label}>{item.claimNumber ?? item.policyNumber ?? `Claim #${item.id}`}</Text>
            <Text style={s.meta}>{item.type ?? item.claimType ?? 'General'} · {item.amount ? `₦${Number(item.amount).toLocaleString()}` : ''}</Text>
            <View style={[s.badge, item.status === 'approved' ? s.approved : item.status === 'rejected' ? s.rejected : s.pending]}>
              <Text style={s.badgeText}>{item.status ?? 'pending'}</Text>
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
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  label: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  meta: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  approved: { backgroundColor: '#dcfce7' },
  rejected: { backgroundColor: '#fee2e2' },
  pending: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#1e293b' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 14 },
});
