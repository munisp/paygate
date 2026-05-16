import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

// Assuming the tRPC query returns an array of objects with these properties
interface ReconciliationItem {
  id: string;
  transactionDate: string; // Changed from 'date' to 'transactionDate' for better clarity and common naming conventions
  amount: number; // Changed from 'string' to 'number' for better data handling
  currency: string; // Added currency for better display of amount
  status: 'completed' | 'pending' | 'failed'; // Example status types
}

const ReconciliationScreen: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.mobileMoneyRecon.list.useQuery(
    { limit: 20 },
    { onError: (e) => Alert.alert('Error', e.message) }
  );

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const getStatusBadgeStyle = (status: ReconciliationItem['status']) => {
    switch (status) {
      case 'completed':
        return styles.badgeCompleted;
      case 'pending':
        return styles.badgePending;
      case 'failed':
        return styles.badgeFailed;
      default:
        return styles.badgeDefault;
    }
  };

  const renderItem = ({ item }: { item: ReconciliationItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Transaction ID: {item.id}</Text>
      <Text>Date: {new Date(item.transactionDate).toLocaleDateString()}</Text>
      <Text>Amount: {item.currency} {item.amount.toFixed(2)}</Text>
      <View style={[styles.badge, getStatusBadgeStyle(item.status)]}>
        <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading reconciliation data...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error loading data: {error?.message}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyStateText}>No reconciliation data found.</Text>
        <Text style={styles.emptyStateSubText}>Pull down to refresh or check back later.</Text>
      </View>
    );
  }

  const matchedCount = data.filter((item: any) => item.status === 'completed' || item.status === 'matched').length;
  const unmatchedCount = data.length - matchedCount;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>Matched: {matchedCount}</Text>
        <Text style={styles.summaryText}>Unmatched: {unmatchedCount}</Text>
        <Text style={styles.summaryText}>Total: {data.length}</Text>
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />
        }
      />
    </View>
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
  emptyStateText: {
    fontSize: 18,
    color: '#555',
    marginBottom: 10,
  },
  emptyStateSubText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  listContainer: {
    padding: 10,
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  badgeCompleted: {
    backgroundColor: '#28a745', // Green
  },
  badgePending: {
    backgroundColor: '#ffc107', // Yellow/Orange
  },
  badgeFailed: {
    backgroundColor: '#dc3545', // Red
  },
  badgeDefault: {
    backgroundColor: '#6c757d', // Grey
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#f0f4ff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
});

export default ReconciliationScreen;
