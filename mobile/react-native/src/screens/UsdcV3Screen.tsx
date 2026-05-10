import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

export default function UsdcV3Screen() {
  const wallets = [
    { id: '1', network: 'Ethereum', address: '0x742d...f44e', balance: 10000 },
    { id: '2', network: 'Polygon', address: '0x8626...199', balance: 5000 },
  ];
  return (
    <View style={styles.container}>
      <Text style={styles.title}>USDC Wallets</Text>
      <FlatList
        data={wallets}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.network}>{item.network}</Text>
            <Text style={styles.address}>{item.address}</Text>
            <Text style={styles.balance}>{item.balance.toLocaleString()} USDC</Text>
          </View>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  card: { padding: 16, borderRadius: 8, backgroundColor: '#eff6ff', marginBottom: 8 },
  network: { fontSize: 16, fontWeight: '600', color: '#1d4ed8' },
  address: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  balance: { fontSize: 18, fontWeight: 'bold', marginTop: 8, color: '#1e40af' },
});
