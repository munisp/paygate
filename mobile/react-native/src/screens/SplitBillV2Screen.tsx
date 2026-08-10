import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { trpc } from '../lib/trpc'; // Assuming this path is correct

// Define a type for the data item, based on common patterns for list queries
// This is a placeholder; actual type would come from tRPC\'s generated types
interface SplitBillItem {
  id: string;
  billName: string;
  amount: number;
  status: 'pending' | 'completed' | 'cancelled';
  // Add other relevant fields as needed
}

const SplitBillV2Screen: React.FC = () => {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching, // Use isRefetching for RefreshControl to differentiate initial load from pull-to-refresh
  } = trpc.splitBillV2.list.useQuery(undefined, {
    onError: (e) => Alert.alert('Error', e.message),
  });

  const onRefresh = React.useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading && !isRefetching) { // Show full screen loader only on initial load
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>Loading split bills...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load split bills: {error?.message}</Text>
        <Text style={styles.errorText}>Please try again later.</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <FlatList
        contentContainerStyle={styles.centered}
        data={[]}
        renderItem={() => null}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No split bills found.</Text>
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />
        }
      />
    );
  }

  const renderItem = ({ item }: { item: SplitBillItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.billName}</Text>
      <Text style={styles.cardAmount}>Amount: ${item.amount.toFixed(2)}</Text>
      <View style={[styles.badge, item.status === 'completed' ? styles.badgeCompleted : item.status === 'pending' ? styles.badgePending : styles.badgeCancelled]}>
        <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
      </View>
    </View>
  );

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />
      }
    />
  );
};

const styles = StyleSheet.create({
  listContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
    marginBottom: 5,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  cardAmount: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  badgeCompleted: {
    backgroundColor: 'green',
  },
  badgePending: {
    backgroundColor: 'orange',
  },
  badgeCancelled: {
    backgroundColor: 'red',
  },
});

export default SplitBillV2Screen;
