import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { trpc } from '@/lib/trpc';

const C = { bg: '#0f172a', card: '#1e293b', accent: '#6366f1', text: '#f8fafc', muted: '#94a3b8', border: '#334155', success: '#22c55e', error: '#ef4444', warning: '#f59e0b' };

const STATUS_COLORS: Record<string, string> = {
  completed: C.success, matched: C.success,
  pending: C.warning, running: C.warning, in_progress: C.warning,
  failed: C.error, discrepancy: C.error,
};

export default function ReconciliationScreen() {
  const [running, setRunning] = useState(false);
  const { data, isLoading, refetch } = trpc.reconciliation.list.useQuery({ limit: 20 });
  const runMutation = trpc.reconciliation.runReconciliation.useMutation({
    onSuccess: () => { setRunning(false); refetch(); Alert.alert('Success', 'Reconciliation run started'); },
    onError: (e) => { setRunning(false); Alert.alert('Error', e.message); },
  });

  const runs: any[] = (data as any)?.runs ?? [];

  const handleRun = () => {
    Alert.alert('Run Reconciliation', 'Start a new reconciliation run for today?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Run', onPress: () => { setRunning(true); runMutation.mutate({ date: new Date().toISOString().split('T')[0] }); } },
    ]);
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Reconciliation</Text>
        <TouchableOpacity style={s.runBtn} onPress={handleRun} disabled={running || runMutation.isPending}>
          <Text style={s.runBtnText}>{running ? 'Running...' : '▶ Run'}</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          {runs.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>No reconciliation runs yet</Text>
              <Text style={s.emptySubtext}>Run your first reconciliation to match transactions with settlements</Text>
            </View>
          ) : runs.map((run, i) => (
            <View key={i} style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.runDate}>{run.date ?? run.periodStart ?? 'Unknown date'}</Text>
                <View style={[s.badge, { backgroundColor: (STATUS_COLORS[run.status] ?? C.muted) + '22' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLORS[run.status] ?? C.muted }]}>{run.status}</Text>
                </View>
              </View>
              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Text style={s.statLabel}>Total Txns</Text>
                  <Text style={s.statValue}>{(run.totalTransactions ?? run.txnCount ?? 0).toLocaleString()}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>Matched</Text>
                  <Text style={[s.statValue, { color: C.success }]}>{(run.matchedCount ?? 0).toLocaleString()}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>Discrepancies</Text>
                  <Text style={[s.statValue, { color: (run.discrepancyCount ?? 0) > 0 ? C.error : C.text }]}>
                    {(run.discrepancyCount ?? 0).toLocaleString()}
                  </Text>
                </View>
              </View>
              {run.notes && <Text style={s.notes}>{run.notes}</Text>}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  runBtn: { backgroundColor: C.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  runBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  runDate: { color: C.text, fontSize: 15, fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: C.bg, borderRadius: 8, padding: 10, alignItems: 'center' },
  statLabel: { color: C.muted, fontSize: 11, marginBottom: 4 },
  statValue: { color: C.text, fontSize: 16, fontWeight: '700' },
  notes: { color: C.muted, fontSize: 12, marginTop: 8 },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: C.text, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: C.muted, fontSize: 13, marginTop: 6, textAlign: 'center' },
});
