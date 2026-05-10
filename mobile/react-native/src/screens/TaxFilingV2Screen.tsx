import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

export default function TaxFilingV2Screen() {
  const filings = [
    { id: '1', taxType: 'VAT', period: '2025-Q1', amount: 375000, status: 'submitted' },
    { id: '2', taxType: 'WHT', period: '2025-Q1', amount: 100000, status: 'approved' },
  ];
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tax Filings</Text>
      <FlatList
        data={filings}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.type}>{item.taxType}</Text>
              <Text style={styles.period}>{item.period}</Text>
            </View>
            <Text style={styles.amount}>₦{item.amount.toLocaleString()}</Text>
            <Text style={[styles.status, item.status === 'approved' ? styles.approved : styles.pending]}>
              {item.status}
            </Text>
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
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  type: { fontSize: 16, fontWeight: '600' },
  period: { fontSize: 14, color: '#6b7280' },
  amount: { fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  status: { fontSize: 12, marginTop: 4 },
  approved: { color: '#059669' },
  pending: { color: '#d97706' },
});
