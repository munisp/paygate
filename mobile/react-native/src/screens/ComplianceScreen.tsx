import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet, Alert } from 'react-native';
import { trpc } from '../lib/trpc';
// Uses fetch() for compliance report export

interface ComplianceItem {
  id: string;
  ruleName: string;
  status: string;
  date: string;
}

const ComplianceScreen: React.FC = () => {
  const exportReport = async () => {
    try {
      const res = await fetch('/api/compliance/export', { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      Alert.alert('Export', 'Compliance report exported successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.adminCompliance.list.useQuery(undefined, {
    onError: (e) => Alert.alert('Error', e.message),
  });

  const renderItem = ({ item }: { item: ComplianceItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.ruleName}</Text>
      <Text>Status: {item.status}</Text>
      <Text>Date: {item.date}</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load compliance data: {error?.message}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No compliance data found.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data as ComplianceItem[]}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
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

export default ComplianceScreen;
