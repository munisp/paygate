import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, SafeAreaView, StatusBar } from 'react-native';
import { trpc } from '../lib/trpc';
const C = { primary: '#6366F1', bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', muted: '#94A3B8', success: '#10B981', error: '#EF4444', border: '#334155', warning: '#F59E0B' };
export default function CryptoScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = trpc.consumerWallet.getBalance.useQuery();
  const { data: txData } = trpc.consumerWallet.getTransactions.useQuery({ limit: 20 });
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const balances = (data as any)?.balances ?? (data as any)?.data ?? [];
  const txs = (txData as any)?.transactions ?? (txData as any)?.data ?? [];
  if (isLoading) return <View style={[s.container, s.center]}><ActivityIndicator color={C.primary} size="large" /></View>;
  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}>
        <Text style={s.title}>Crypto Wallet</Text>
        {balances.length === 0 && <View style={s.card}><Text style={s.muted}>No balances found</Text></View>}
        {balances.map((b: any, i: number) => (
          <View key={i} style={s.card}>
            <Text style={s.currency}>{b.currency ?? b.asset}</Text>
            <Text style={s.balance}>{b.balance ?? b.amount}</Text>
            <Text style={s.muted}>{b.usdValue ? `≈ $${b.usdValue}` : ''}</Text>
          </View>
        ))}
        <Text style={s.sectionTitle}>Recent Transactions</Text>
        {txs.slice(0, 10).map((tx: any) => (
          <View key={tx.id} style={s.txRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.txType}>{tx.type ?? tx.transactionType}</Text>
              <Text style={s.txDate}>{new Date(tx.createdAt ?? tx.timestamp).toLocaleDateString()}</Text>
            </View>
            <Text style={[s.txAmount, { color: tx.type === 'credit' ? C.success : C.error }]}>
              {tx.type === 'credit' ? '+' : '-'}{tx.amount} {tx.currency}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg }, center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 }, title: { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 20 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  currency: { fontSize: 14, color: C.muted, marginBottom: 4 }, balance: { fontSize: 28, fontWeight: '700', color: C.text },
  muted: { color: C.muted, fontSize: 12 }, sectionTitle: { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 12, marginTop: 8 },
  txRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  txType: { fontSize: 14, fontWeight: '600', color: C.text, textTransform: 'capitalize' },
  txDate: { fontSize: 11, color: C.muted, marginTop: 2 }, txAmount: { fontSize: 15, fontWeight: '700' },
});
