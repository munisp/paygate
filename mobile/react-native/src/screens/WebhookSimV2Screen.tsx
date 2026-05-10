import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

export default function WebhookSimV2Screen() {
  const logs = [
    { id: '1', eventType: 'payment.completed', status: 'success', responseCode: 200, latencyMs: 145 },
    { id: '2', eventType: 'payout.initiated', status: 'failed', responseCode: 404, latencyMs: 89 },
  ];
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Webhook Simulator V2</Text>
      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.event}>{item.eventType}</Text>
            <Text style={[styles.status, item.status === 'success' ? styles.success : styles.failed]}>
              {item.status} ({item.responseCode})
            </Text>
            <Text style={styles.latency}>{item.latencyMs}ms</Text>
          </View>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  card: { padding: 12, borderRadius: 8, backgroundColor: '#f9fafb', marginBottom: 8 },
  event: { fontSize: 14, fontWeight: '600' },
  status: { fontSize: 12, marginTop: 4 },
  success: { color: '#059669' },
  failed: { color: '#dc2626' },
  latency: { fontSize: 12, color: '#6b7280', marginTop: 2 },
});
