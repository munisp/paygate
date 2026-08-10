import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

interface FeeScheduleItem {
  id: string;
  name: string;
  description: string;
  // Add other relevant fields based on your fee schedule data structure
}

const FeeSchedulesScreen: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.feeSchedules.list.useQuery(undefined, {
    onError: (e) => Alert.alert('Error', e.message),
  });

  const onRefresh = React.useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading fee schedules...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load fee schedules.'}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No fee schedules found.</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: FeeScheduleItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardDescription}>{item.description}</Text>
      {/* Add more details or badges here based on item structure */}
    </View>
  );

  return (
    <FlatList
      data={data as FeeScheduleItem[]}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />
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
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginVertical: 8,
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
    marginBottom: 5,
  },
  cardDescription: {
    fontSize: 14,
    color: '#555',
  },
});

export default FeeSchedulesScreen;
