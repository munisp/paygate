import React, { useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, Alert, StyleSheet } from 'react-native';
import { trpc } from '../lib/trpc';

interface InvoiceItem {
  id: string;
  name: string;
  status: string;
  amount: number;
  dueDate: string;
}

const InvoiceFinancingScreen = () => {
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.invoiceFinV2.list.useQuery(
    { limit: 20 },
    { onError: (e) => Alert.alert('Error', e.message) }
  );

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
        <Text style={styles.loadingText}>Loading invoice financing data...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch invoice financing data'}</Text>
      </View>
    );
  }

  const invoiceData: InvoiceItem[] = data || [];

  if (invoiceData.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No invoice financing data available.</Text>
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      </View>
    );
  }

  const renderItem = ({ item }: { item: InvoiceItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name || `Invoice #${item.id}`}</Text>
      <Text style={styles.cardDetail}>Amount: ${item.amount ? item.amount.toFixed(2) : 'N/A'}</Text>
      <Text style={styles.cardDetail}>Due Date: {item.dueDate || 'N/A'}</Text>
      <View style={styles.badgeContainer}>
        <Text style={[styles.badge, item.status === 'Approved' && styles.badgeApproved, item.status === 'Pending' && styles.badgePending, item.status === 'Rejected' && styles.badgeRejected]}>
          {item.status || 'Unknown'}
        </Text>
      </View>
    </View>
  );

  return (
    <FlatList
      data={invoiceData}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing || isRefetching} onRefresh={onRefresh} />
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
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#777',
    textAlign: 'center',
  },
  listContainer: {
    padding: 10,
    backgroundColor: '#f8f8f8',
  },
  card: {
    backgroundColor: '#fff',
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
    color: '#333',
  },
  cardDetail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  badgeContainer: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  badge: {
    backgroundColor: '#e0e0e0',
    color: '#333',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    fontSize: 12,
    fontWeight: 'bold',
  },
  badgeApproved: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  badgePending: {
    backgroundColor: '#fff3cd',
    color: '#856404',
  },
  badgeRejected: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
});

export default InvoiceFinancingScreen;
