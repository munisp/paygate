import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet, Alert } from 'react-native';
import { trpc } from './lib/trpc'; // Assuming trpc is in a sibling directory

interface TransactionReceipt {
  id: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
  // Add other relevant fields as per your tRPC response
}

const TransactionReceiptsScreen: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.txReceipts.list.useQuery({ limit: 20 }, {
    onError: (e) => Alert.alert('Error', e.message),
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading transaction receipts...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load transaction receipts.'}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No transaction receipts found.</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: TransactionReceipt }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Transaction ID: {item.id}</Text>
      <Text>Amount: {item.amount} {item.currency}</Text>
      <Text>Date: {new Date(item.date).toLocaleDateString()}</Text>
      <View style={[styles.badge, item.status === 'completed' ? styles.badgeSuccess : styles.badgePending]}>
        <Text style={styles.badgeText}>{item.status}</Text>
      </View>
    </View>
  );

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    />
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
  },
  listContainer: {
    padding: 10,
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  badge: {
    borderRadius: 15,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  badgeSuccess: {
    backgroundColor: '#d4edda',
  },
  badgePending: {
    backgroundColor: '#fff3cd',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
});

export default TransactionReceiptsScreen;