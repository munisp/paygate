import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { trpc } from '../lib/trpc';

interface QRPaymentItem {
  id: string;
  merchantName: string;
  amount: number;
  currency: string;
  status: string;
  transactionDate: string;
}

const QRPaymentsScreen: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.qrPayments.list.useQuery(
    { limit: 20 },
    { onError: (e) => Alert.alert('Error', e.message) }
  );

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading QR Payments...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load QR Payments'}</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: QRPaymentItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.merchantName}</Text>
      <Text style={styles.cardDetail}>Amount: {item.currency} {item.amount.toFixed(2)}</Text>
      <Text style={styles.cardDetail}>Status: <Text style={[styles.badge, item.status === 'Completed' ? styles.badgeSuccess : styles.badgePending]}>{item.status}</Text></Text>
      <Text style={styles.cardDetail}>Date: {new Date(item.transactionDate).toLocaleDateString()}</Text>
    </View>
  );

  const generateQR = () => {
    Alert.alert('Generate QR', 'QR code generation coming soon. Configure amount and merchant details.');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.generateButton} onPress={generateQR}>
        <Text style={styles.generateButtonText}>+ Generate QR Code</Text>
      </TouchableOpacity>
      {data && data.length > 0 ? (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.flatListContent}
          refreshControl={
            <RefreshControl refreshing={refreshing || isRefetching} onRefresh={onRefresh} />
          }
        />
      ) : (
        <View style={styles.centered}>
          <Text>No QR Payments found.</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flatListContent: {
    padding: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardDetail: {
    fontSize: 14,
    color: '#555',
    marginBottom: 3,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: 'bold',
    color: '#fff',
  },
  badgeSuccess: {
    backgroundColor: '#28a745',
  },
  badgePending: {
    backgroundColor: '#ffc107',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
  },
  generateButton: {
    backgroundColor: '#4f46e5',
    margin: 12,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});

export default QRPaymentsScreen;
