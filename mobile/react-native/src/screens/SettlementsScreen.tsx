import React, { useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

// Define a basic type for settlement items, adjust as per actual tRPC response
interface SettlementItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
  // Add other relevant fields from your settlement data
}

const SettlementsScreen: React.FC = () => {
  const exportCSV = async () => {
    try {
      const res = await fetch('/api/settlements/export?format=csv', { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      Alert.alert('Export', 'Settlement CSV exported successfully');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const { data, isLoading, isError, error, refetch } = trpc.settlements.list.useQuery(
    { limit: 20 },
    {
      onError: (e) => Alert.alert('Error', e.message),
    }
  );

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading && !refreshing) { // Show spinner only on initial load, not during pull-to-refresh
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load settlements: {error?.message}</Text>
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No settlements found.</Text>
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      </View>
    );
  }

  const renderItem = ({ item }: { item: SettlementItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Settlement ID: {item.id}</Text>
        <View style={[styles.badge, item.status === 'completed' ? styles.badgeCompleted : styles.badgePending]}>
          <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {item.currency} {item.amount.toFixed(2)}</Text>
      <Text style={styles.cardText}>Date: {item.date}</Text>
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
  listContainer: {
    padding: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.20,
    shadowRadius: 1.41,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardText: {
    fontSize: 14,
    marginBottom: 5,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  badgeCompleted: {
    backgroundColor: '#4CAF50',
  },
  badgePending: {
    backgroundColor: '#FFC107',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default SettlementsScreen;
