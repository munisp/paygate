import React, { useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

interface ChargebackCase {
  id: string;
  caseId: string;
  status: string;
  amount: number;
  currency: string;
  reason: string;
  date: string;
}

const ChargebackCasesScreen: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = trpc.chargebackMgmt.list.useQuery({ limit: 20 }, {
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
        <Text>Loading chargeback cases...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load chargeback cases'}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No chargeback cases found.</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: ChargebackCase }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Case ID: {item.caseId}</Text>
      <Text>Status: {item.status}</Text>
      <Text>Amount: {item.currency} {item.amount.toFixed(2)}</Text>
      <Text>Reason: {item.reason}</Text>
      <Text>Date: {item.date}</Text>
    </View>
  );

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      }
    />
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
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
  errorText: {
    color: 'red',
    fontSize: 16,
  },
});

export default ChargebackCasesScreen;
