import React, { useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet, Alert } from 'react-native';
import { trpc } from '../lib/trpc';
import { Card, Badge } from 'react-native-paper';

interface TenantProvisionItem {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'inactive';
  provisionedDate: string;
}

const TenantProvisioningScreen: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = trpc.tenantProvision.list.useQuery(undefined, {
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
        <Text>Loading tenant provisions...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load tenant provisions'}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No tenant provisions found.</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: TenantProvisionItem }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Badge style={item.status === 'active' ? styles.badgeActive : item.status === 'pending' ? styles.badgePending : styles.badgeInactive}>
            {item.status.toUpperCase()}
          </Badge>
        </View>
        <Text>ID: {item.id}</Text>
        <Text>Provisioned Date: {new Date(item.provisionedDate).toLocaleDateString()}</Text>
      </Card.Content>
    </Card>
  );

  return (
    <FlatList
      data={data as TenantProvisionItem[]}
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
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
  },
  listContainer: {
    padding: 10,
  },
  card: {
    marginVertical: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  badgeActive: {
    backgroundColor: 'green',
    color: 'white',
  },
  badgePending: {
    backgroundColor: 'orange',
    color: 'white',
  },
  badgeInactive: {
    backgroundColor: 'gray',
    color: 'white',
  },
});

export default TenantProvisioningScreen;
