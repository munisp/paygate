import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

interface UsdcBalance {
  amount: string;
  currency: string;
}

const UsdcV3Screen: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.usdcV3.getBalance.useQuery(undefined, {
    onError: (e) => Alert.alert('Error', e.message),
  });

  const onRefresh = React.useCallback(() => {
    refetch();
  }, [refetch]);

  const renderItem = ({ item }: { item: UsdcBalance }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>USDC Balance</Text>
      <Text style={styles.balanceText}>{item.amount} {item.currency}</Text>
      {/* Add more details or badges here if needed */}
    </View>
  );

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load USDC balance: {error?.message}</Text>
      </View>
    );
  }

  const usdcData: UsdcBalance[] = data ? [{ amount: data.amount, currency: data.currency }] : [];

  return (
    <View style={styles.container}>
      <FlatList
        data={usdcData}
        keyExtractor={(_, index) => String(index)}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No USDC balance data available.</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            colors={['#0000ff']}
            tintColor={'#0000ff'}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f0f2f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  balanceText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#007bff',
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

export default UsdcV3Screen;
