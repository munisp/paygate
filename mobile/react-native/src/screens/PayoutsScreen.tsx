import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design System Colors
const colors = {
  primary: '#6366F1',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  muted: '#94A3B8',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  border: '#334155',
};

// Types
type PayoutStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'PROCESSING';

interface Payout {
  id: string;
  amount: number;
  currency: string;
  bankName: string;
  accountNumber: string; // Masked
  status: PayoutStatus;
  createdAt: string;
}

const PayoutsScreen = () => {
  const navigation = useNavigation<any>();
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // tRPC Queries
  const { data: payouts, isLoading, error, refetch, isRefetching } = trpc.payouts.list.useQuery();
  const { data: stats } = trpc.payouts.getStats.useQuery();

  const filteredPayouts = useMemo(() => {
    if (!payouts) return [];
    return payouts.filter((p: Payout) => {
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const matchesSearch = p.bankName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           p.accountNumber.includes(searchQuery);
      return matchesStatus && matchesSearch;
    });
  }, [payouts, statusFilter, searchQuery]);

  const renderStatusBadge = (status: PayoutStatus) => {
    let bgColor = colors.muted;
    let textColor = colors.text;

    switch (status) {
      case 'COMPLETED':
        bgColor = `${colors.success}20`;
        textColor = colors.success;
        break;
      case 'PENDING':
        bgColor = `${colors.warning}20`;
        textColor = colors.warning;
        break;
      case 'FAILED':
        bgColor = `${colors.error}20`;
        textColor = colors.error;
        break;
      case 'PROCESSING':
        bgColor = `${colors.primary}20`;
        textColor = colors.primary;
        break;
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor: bgColor }]}>
        <Text style={[styles.statusText, { color: textColor }]}>{status}</Text>
      </View>
    );
  };

  const renderPayoutItem = ({ item }: { item: Payout }) => (
    <TouchableOpacity 
      style={styles.payoutCard}
      onPress={() => navigation.navigate('PayoutDetails', { id: item.id })}
    >
      <View style={styles.payoutHeader}>
        <Text style={styles.amountText}>
          {new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency }).format(item.amount)}
        </Text>
        {renderStatusBadge(item.status)}
      </View>
      
      <View style={styles.payoutDetails}>
        <View>
          <Text style={styles.bankName}>{item.bankName}</Text>
          <Text style={styles.accountNumber}>{item.accountNumber}</Text>
        </View>
        <Text style={styles.dateText}>
          {new Date(item.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const FilterButton = ({ label, value }: { label: string, value: PayoutStatus | 'ALL' }) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        statusFilter === value && styles.filterButtonActive
      ]}
      onPress={() => setStatusFilter(value)}
    >
      <Text style={[
        styles.filterButtonText,
        statusFilter === value && styles.filterButtonTextActive
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load payouts</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerLabel}>Total Pending Payouts</Text>
        <Text style={styles.bannerAmount}>
          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(stats?.totalPending || 0)}
        </Text>
      </View>

      {/* Search and Filters */}
      <View style={styles.controlsContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search bank or account..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.filterRow}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[
              { label: 'All', value: 'ALL' },
              { label: 'Pending', value: 'PENDING' },
              { label: 'Processing', value: 'PROCESSING' },
              { label: 'Completed', value: 'COMPLETED' },
              { label: 'Failed', value: 'FAILED' },
            ]}
            renderItem={({ item }) => (
              <FilterButton label={item.label} value={item.value as any} />
            )}
            keyExtractor={(item) => item.value}
            contentContainerStyle={styles.filterList}
          />
        </View>
      </View>

      {/* Payout List */}
      <FlatList
        data={filteredPayouts}
        renderItem={renderPayoutItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No payouts found</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('InitiatePayout')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  banner: {
    backgroundColor: colors.primary,
    padding: 20,
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  bannerLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  bannerAmount: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  controlsContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  filterRow: {
    marginBottom: 8,
  },
  filterList: {
    paddingRight: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  payoutCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  payoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  amountText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  payoutDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bankName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  accountNumber: {
    color: colors.muted,
    fontSize: 12,
  },
  dateText: {
    color: colors.muted,
    fontSize: 12,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '300',
    marginTop: -2,
  },
});

export default PayoutsScreen;
