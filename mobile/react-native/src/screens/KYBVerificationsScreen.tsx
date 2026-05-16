import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

interface KYBVerificationItem {
  id: string;
  status: string;
  merchantName: string;
  submittedAt: string;
}

const KYBVerificationsScreen: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.kybMgmt.list.useQuery(
    { limit: 20 },
    { onError: (e) => Alert.alert('Error', e.message) }
  );

  const renderItem = ({ item }: { item: KYBVerificationItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.merchantName}</Text>
      <Text>Status: {item.status}</Text>
      <Text>Submitted: {new Date(item.submittedAt).toLocaleDateString()}</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading KYB Verifications...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load KYB Verifications: {error?.message}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No KYB verifications found.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data as KYBVerificationItem[]}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
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
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
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
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default KYBVerificationsScreen;
