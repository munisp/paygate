import React from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, Alert } from 'react-native';
import { trpc } from '../lib/trpc'; // Import tRPC client

interface LoyaltyProgramItem {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  points: number;
}

const LoyaltyV3Screen: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.loyaltyV3.getProgram.useQuery(
    undefined,
    {
      onError: (e) => Alert.alert('Error', e.message),
    }
  );

  const renderItem = ({ item }: { item: LoyaltyProgramItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardDescription}>{item.description}</Text>
      <View style={[styles.badge, item.status === 'active' ? styles.badgeActive : styles.badgeInactive]}>
        <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
      </View>
      <Text style={styles.cardPoints}>{item.points} Points</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>Loading loyalty programs...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Failed to load loyalty programs: {error?.message}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.emptyStateText}>No loyalty programs found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.flatListContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
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
    backgroundColor: '#f0f2f5',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
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
    marginHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#777',
    textAlign: 'center',
    marginHorizontal: 20,
  },
  flatListContent: {
    padding: 10,
  },
  card: {
    backgroundColor: '#ffffff',
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
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 15,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  badgeActive: {
    backgroundColor: '#e6ffe6',
  },
  badgeInactive: {
    backgroundColor: '#ffe6e6',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  cardPoints: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007bff',
  },
});

export default LoyaltyV3Screen;
