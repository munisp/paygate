import React, { useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

interface AuditLogItem {
  id: string;
  timestamp: string;
  action: string;
  user: string;
  details: string;
}

const AuditLogViewerScreen: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.openSearchAudit.list.useQuery(
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
        <Text>Loading audit logs...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load audit logs.</Text>
        <Text style={styles.errorText}>{error?.message}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No audit logs found.</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: AuditLogItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Action: {item.action}</Text>
      <Text style={styles.cardText}>User: {item.user}</Text>
      <Text style={styles.cardText}>Timestamp: {new Date(item.timestamp).toLocaleString()}</Text>
      <Text style={styles.cardDetails}>Details: {item.details}</Text>
    </View>
  );

  return (
    <FlatList
      data={data as AuditLogItem[]}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing || isRefetching}
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
  errorText: {
    color: 'red',
    marginTop: 10,
    textAlign: 'center',
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
  cardText: {
    fontSize: 14,
    marginBottom: 3,
  },
  cardDetails: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
});

export default AuditLogViewerScreen;
