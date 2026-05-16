import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useTrpc } from '../hooks/useTrpc';

interface AgentTransaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  customerName: string;
  status: string;
  createdAt: string;
}

export default function AgentBankingScreen() {
  const { trpc } = useTrpc();
  const [transactions, setTransactions] = useState<AgentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agentBalance, setAgentBalance] = useState<number>(0);

  const fetchData = async () => {
    try {
      const [txRes, balRes] = await Promise.all([
        trpc.agentBanking.listTransactions.query({ limit: 20, offset: 0 }),
        trpc.agentBanking.getBalance.query(),
      ]);
      setTransactions(txRes.transactions || []);
      setAgentBalance(balRes.balance || 0);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load agent banking data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Agent Banking</Text>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Float Balance</Text>
          <Text style={styles.balanceAmount}>₦{agentBalance.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions yet</Text>
        ) : (
          transactions.map((tx) => (
            <View key={tx.id} style={styles.txCard}>
              <View style={styles.txLeft}>
                <Text style={styles.txType}>{tx.type}</Text>
                <Text style={styles.txCustomer}>{tx.customerName}</Text>
                <Text style={styles.txDate}>{new Date(tx.createdAt).toLocaleDateString()}</Text>
              </View>
              <View style={styles.txRight}>
                <Text style={styles.txAmount}>
                  {tx.currency} {tx.amount.toLocaleString()}
                </Text>
                <View style={[styles.statusBadge, tx.status === 'completed' ? styles.statusSuccess : styles.statusPending]}>
                  <Text style={styles.statusText}>{tx.status}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
  header: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#F1F5F9', marginBottom: 16 },
  balanceCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#334155' },
  balanceLabel: { fontSize: 14, color: '#94A3B8', marginBottom: 8 },
  balanceAmount: { fontSize: 32, fontWeight: 'bold', color: '#3B82F6' },
  section: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#F1F5F9', marginBottom: 16 },
  emptyText: { color: '#94A3B8', textAlign: 'center', marginTop: 20 },
  txCard: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: '#334155' },
  txLeft: { flex: 1 },
  txType: { fontSize: 14, fontWeight: '600', color: '#F1F5F9', textTransform: 'capitalize' },
  txCustomer: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  txDate: { fontSize: 11, color: '#64748B', marginTop: 4 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 14, fontWeight: 'bold', color: '#F1F5F9' },
  statusBadge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusSuccess: { backgroundColor: '#064E3B' },
  statusPending: { backgroundColor: '#1E3A5F' },
  statusText: { fontSize: 10, fontWeight: '600', color: '#A7F3D0' },
});
