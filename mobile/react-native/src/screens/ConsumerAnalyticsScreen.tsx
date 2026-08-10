import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming trpc client is set up here

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface ConsumerAnalytic {
  id: string;
  consumerName: string;
  totalSpend: number;
  lastActivity: string;
  status: 'active' | 'inactive' | 'pending';
  currency: 'NGN' | 'USD';
}

const ConsumerAnalyticsScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');

  // Assuming a tRPC procedure for fetching consumer analytics data
  const { data, isLoading, isError, error, refetch } = trpc.consumerAnalytics.get.useQuery();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(item =>
    item.consumerName.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const renderStatusBadge = (status: 'active' | 'inactive' | 'pending') => {
    let backgroundColor;
    let textColor = COLORS.background;
    switch (status) {
      case 'active':
        backgroundColor = COLORS.success;
        break;
      case 'inactive':
        backgroundColor = COLORS.error;
        break;
      case 'pending':
        backgroundColor = COLORS.warning;
        break;
      default:
        backgroundColor = COLORS.muted;
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor }]}>
        <Text style={[styles.statusText, { color: textColor }]}>{status.toUpperCase()}</Text>
      </View>
    );
  };

  const handleEdit = (item: ConsumerAnalytic) => {
    Alert.alert('Edit Consumer', `Editing ${item.consumerName}`);
    // In a real app, navigate to an edit screen or open a modal
  };

  const handleDelete = (item: ConsumerAnalytic) => {
    Alert.alert(
      'Delete Consumer',
      `Are you sure you want to delete ${item.consumerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => console.log(`Deleting ${item.id}`) },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading Consumer Analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error?.message || 'Failed to load analytics'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (filteredData.length === 0 && searchText === '') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No consumer analytics data available.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Consumer Analytics</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => Alert.alert('Create Consumer', 'Open modal for new consumer')}>
          <Text style={styles.createButtonText}>+ Add Consumer</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search consumers..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.consumerName}>{item.consumerName}</Text>
              {renderStatusBadge(item.status)}
            </View>
            <Text style={styles.cardText}>Total Spend: {formatAmount(item.totalSpend, item.currency)}</Text>
            <Text style={styles.cardText}>Last Activity: {formatDate(item.lastActivity)}</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleEdit(item)}>
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDelete(item)}>
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.text,
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    margin: 15,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  consumerName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 15,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginRight: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
});

export default ConsumerAnalyticsScreen;
