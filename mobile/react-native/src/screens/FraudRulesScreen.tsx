import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { trpc } from '../lib/trpc';

interface FraudRule {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  threshold: number;
  description?: string;
}

const FraudRulesScreen: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = trpc.fraudRulesRouter.list.useQuery(
    { merchantId: "" },
    {
      onError: (e) => {
        Alert.alert('Error', e.message);
      },
    }
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
        <Text>Loading fraud rules...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load fraud rules: {error?.message}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No fraud rules found.</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: FraudRule }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <View style={styles.badgeContainer}>
        <Text style={[styles.badge, item.status === 'active' ? styles.badgeActive : styles.badgeInactive]}>
          {item.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.cardText}>Threshold: {item.threshold}</Text>
      {item.description && <Text style={styles.cardText}>{item.description}</Text>}
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
          colors={['#0000ff']}
          tintColor={'#0000ff'}
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
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 3,
  },
  badgeContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 15,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  badgeActive: {
    backgroundColor: '#28a745',
  },
  badgeInactive: {
    backgroundColor: '#dc3545',
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
});

export default FraudRulesScreen;
