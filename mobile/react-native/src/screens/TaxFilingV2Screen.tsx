import React from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

// Define a basic interface for the tax filing item, assuming common data structure
interface TaxFilingItem {
  id: string;
  period: string;
  status: string;
  amount: number;
  // Add other fields as per the actual tRPC response for taxFilingV2.list
}

const TaxFilingV2Screen: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.taxFilingV2.list.useQuery(undefined, {
    onError: (e) => Alert.alert('Error', e.message),
  });

  const renderItem = ({ item }: { item: TaxFilingItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Tax Period: {item.period}</Text>
      <Text style={styles.cardText}>Status: {item.status}</Text>
      <Text style={styles.cardText}>Amount: ${item.amount ? item.amount.toFixed(2) : 'N/A'}</Text>
      {/* Placeholder for badges or additional visual elements based on original screen style */}
      {/* Example: <View style={[styles.badge, item.status === 'Paid' ? styles.badgeSuccess : styles.badgePending]}><Text style={styles.badgeText}>{item.status}</Text></View> */}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>Loading tax filings...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load tax filings.</Text>
        {/* The onError callback already shows an alert, but a visual indicator on screen is also good */}
        <Text style={styles.errorDetails}>Error: {error?.message}</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No tax filings found.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
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
    backgroundColor: '#f8f8f8',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  errorText: {
    fontSize: 18,
    color: 'red',
    textAlign: 'center',
    marginBottom: 5,
  },
  errorDetails: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#777',
    textAlign: 'center',
  },
  listContainer: {
    padding: 10,
    backgroundColor: '#f0f2f5',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginVertical: 8,
    marginHorizontal: 5,
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
    color: '#333',
  },
  cardText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  // Example badge styles (uncomment and adapt if needed)
  // badge: {
  //   paddingVertical: 4,
  //   paddingHorizontal: 8,
  //   borderRadius: 12,
  //   alignSelf: 'flex-start',
  //   marginTop: 5,
  // },
  // badgeSuccess: {
  //   backgroundColor: '#d4edda',
  // },
  // badgePending: {
  //   backgroundColor: '#fff3cd',
  // },
  // badgeText: {
  //   fontSize: 12,
  //   fontWeight: 'bold',
  //   color: '#28a745',
  // },
});

export default TaxFilingV2Screen;
