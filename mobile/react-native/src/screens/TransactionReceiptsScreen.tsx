import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

export default function TransactionReceiptsScreen() {
  const receipts = [
    { id: '1', receiptNumber: 'RCP-2025-000001', amount: 50000, customerEmail: 'customer@example.com' },
    { id: '2', receiptNumber: 'RCP-2025-000002', amount: 75000, customerEmail: 'buyer@example.com' },
  ];
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Transaction Receipts</Text>
      <FlatList
        data={receipts}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.receiptNum}>{item.receiptNumber}</Text>
            <Text style={styles.email}>{item.customerEmail}</Text>
            <Text style={styles.amount}>₦{item.amount.toLocaleString()}</Text>
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
  receiptNum: { fontSize: 14, fontWeight: '600', color: '#1d4ed8' },
  email: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  amount: { fontSize: 18, fontWeight: 'bold', marginTop: 4 },
});
