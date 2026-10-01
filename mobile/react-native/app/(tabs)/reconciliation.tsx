import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { trpc } from '@/lib/trpc';

const C = { bg: '#0f172a', card: '#1e293b', accent: '#6366f1', text: '#f8fafc', muted: '#94a3b8', border: '#334155', success: '#22c55e', error: '#ef4444', warning: '#f59e0b' };

const STATUS_COLORS: Record<string, string> = {
  completed: C.success, matched: C.success,
  pending: C.warning, running: C.warning, in_progress: C.warning,
  failed: C.error, discrepancy: C.error,
};

export default function ReconciliationScreen() {
  // Server proc is reconciliation.listAlerts (returns { alerts, total }); there
  // is no reconciliation.list. Alerts carry pgBalance/tbBalance/delta/currency.
  const { data, isLoading, refetch } = trpc.reconciliation.listAlerts.useQuery({ limit: 20 });

  const alerts: any[] = (data as any)?.alerts ?? [];

  // BLOCKED (W15b): there is NO server procedure to trigger a reconciliation
  // run (reconciliation.runReconciliation does not exist). The original fake
  // call is removed; reconciliation runs are produced by the server-side
  // ledger reconciliation job, which raises the alerts listed below.
  const handleRun = () => {
    Alert.alert(
      'Not available',
      'Manual reconciliation runs are not supported by the server yet. This screen lists reconciliation alerts raised by the automated ledger reconciliation job.'
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Reconciliation</Text>
        <TouchableOpacity style={s.runBtn} onPress={handleRun}>
          <Text style={s.runBtnText}>▶ Run</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          {alerts.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>No reconciliation alerts</Text>
              <Text style={s.emptySubtext}>Ledger balances are in sync — no discrepancies reported by the reconciliation job</Text>
            </View>
          ) : alerts.map((alert) => (
            <View key={alert.id} style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.runDate}>{new Date(alert.createdAt).toLocaleDateString()}</Text>
                <View style={[s.badge, { backgroundColor: (STATUS_COLORS[alert.status] ?? C.muted) + '22' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLORS[alert.status] ?? C.muted }]}>{alert.status}</Text>
                </View>
              </View>
              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Text style={s.statLabel}>PG Balance</Text>
                  <Text style={s.statValue}>{((alert.pgBalance ?? 0) / 100).toLocaleString()}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>Ledger Balance</Text>
                  <Text style={s.statValue}>{((alert.tbBalance ?? 0) / 100).toLocaleString()}</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statLabel}>Delta ({alert.currency ?? ''})</Text>
                  <Text style={[s.statValue, { color: (alert.delta ?? 0) !== 0 ? C.error : C.text }]}>
                    {((alert.delta ?? 0) / 100).toLocaleString()}
                  </Text>
                </View>
              </View>
              {alert.notes && <Text style={s.notes}>{alert.notes}</Text>}
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
