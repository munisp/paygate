import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';

const mockAlerts = [
  { id: 'FA-001', transactionId: 'TXN-9001', riskScore: 92, reason: 'Velocity anomaly', status: 'open', severity: 'critical', amount: 5000, currency: 'NGN' },
  { id: 'FA-002', transactionId: 'TXN-9002', riskScore: 78, reason: 'Geo mismatch', status: 'reviewing', severity: 'high', amount: 12000, currency: 'NGN' },
  { id: 'FA-003', transactionId: 'TXN-9003', riskScore: 55, reason: 'Device fingerprint change', status: 'resolved', severity: 'medium', amount: 3000, currency: 'NGN' },
];

const severityColor = (s: string) => ({ critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a' }[s] || '#6b7280');

export default function FraudRiskScreen() {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? mockAlerts : mockAlerts.filter(a => a.severity === filter);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fraud & Risk Alerts</Text>
      <View style={styles.filterRow}>
        {['all', 'critical', 'high', 'medium'].map(f => (
          <TouchableOpacity key={f} style={[styles.chip, filter === f && styles.chipActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={a => a.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => Alert.alert(item.id, `Score: ${item.riskScore}\nReason: ${item.reason}\nStatus: ${item.status}`)}>
            <View style={styles.row}>
              <Text style={styles.alertId}>{item.id}</Text>
              <View style={[styles.badge, { backgroundColor: severityColor(item.severity) + '20' }]}>
                <Text style={[styles.badgeText, { color: severityColor(item.severity) }]}>{item.severity}</Text>
              </View>
            </View>
            <Text style={styles.txnId}>{item.transactionId}</Text>
            <Text style={styles.reason}>{item.reason}</Text>
            <View style={styles.row}>
              <Text style={styles.score}>Risk Score: <Text style={{ color: severityColor(item.severity), fontWeight: '700' }}>{item.riskScore}</Text></Text>
              <Text style={styles.amount}>{item.amount.toLocaleString()} {item.currency}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  alertId: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  txnId: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  reason: { fontSize: 12, color: '#475569', marginBottom: 6 },
  score: { fontSize: 12, color: '#64748b' },
  amount: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
});
