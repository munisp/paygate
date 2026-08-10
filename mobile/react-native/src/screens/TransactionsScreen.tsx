import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

/**
 * Design System Colors
 */
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

/**
 * Types
 */
type TransactionStatus = 'completed' | 'pending' | 'failed';

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  customerName: string;
  status: TransactionStatus;
  timestamp: string;
  description?: string;
  reference?: string;
}

/**
 * Components
 */

const StatusBadge = ({ status }: { status: TransactionStatus }) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'completed':
        return { bg: '#10B98120', text: colors.success };
      case 'pending':
        return { bg: '#F59E0B20', text: colors.warning };
      case 'failed':
        return { bg: '#EF444420', text: colors.error };
      default:
        return { bg: colors.border, text: colors.muted };
    }
  };

  const styles = getStatusStyles();

  return (
    <View style={[uiStyles.badge, { backgroundColor: styles.bg }]}>
      <Text style={[uiStyles.badgeText, { color: styles.text }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
};

const TransactionItem = ({ item, onPress }: { item: Transaction; onPress: (item: Transaction) => void }) => (
  <TouchableOpacity style={uiStyles.transactionItem} onPress={() => onPress(item)} activeOpacity={0.7}>
    <View style={uiStyles.itemLeft}>
      <Text style={uiStyles.customerName}>{item.customerName}</Text>
      <Text style={uiStyles.timestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
    </View>
    <View style={uiStyles.itemRight}>
      <Text style={uiStyles.amount}>
        {item.currency} {item.amount.toFixed(2)}
      </Text>
      <StatusBadge status={item.status} />
    </View>
  </TouchableOpacity>
);

const FilterButton = ({ 
  label, 
  active, 
  onPress 
}: { 
  label: string; 
  active: boolean; 
  onPress: () => void 
}) => (
  <TouchableOpacity
    style={[uiStyles.filterButton, active && uiStyles.filterButtonActive]}
    onPress={onPress}
  >
    <Text style={[uiStyles.filterButtonText, active && uiStyles.filterButtonTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

/**
 * Main Screen Component
 */
const TransactionsScreen = () => {
  const navigation = useNavigation();
  
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TransactionStatus>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // tRPC Query
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
    isRefetching,
    error,
  } = trpc.transactions.list.useInfiniteQuery(
    {
      limit: 20,
      search: searchQuery,
      status: statusFilter === 'all' ? undefined : statusFilter,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const transactions = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) ?? [];
  }, [data]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const openDetails = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsModalVisible(true);
  };

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={uiStyles.loaderFooter}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={uiStyles.emptyContainer}>
        <Text style={uiStyles.emptyText}>No transactions found</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={uiStyles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header & Search */}
      <View style={uiStyles.header}>
        <Text style={uiStyles.title}>Transactions</Text>
        <View style={uiStyles.searchContainer}>
          <TextInput
            style={uiStyles.searchInput}
            placeholder="Search by customer or ID..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Filters */}
      <View style={uiStyles.filtersWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', 'completed', 'pending', 'failed']}
          keyExtractor={(item) => item}
          contentContainerStyle={uiStyles.filtersContainer}
          renderItem={({ item }) => (
            <FilterButton
              label={item.charAt(0).toUpperCase() + item.slice(1)}
              active={statusFilter === item}
              onPress={() => setStatusFilter(item as any)}
            />
          )}
        />
      </View>

      {/* List */}
      {isLoading && !isRefetching ? (
        <View style={uiStyles.centerLoader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TransactionItem item={item} onPress={openDetails} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={uiStyles.listContent}
        />
      )}

      {/* Transaction Details Modal */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={uiStyles.modalOverlay}>
          <View style={uiStyles.modalContent}>
            <View style={uiStyles.modalHeader}>
              <Text style={uiStyles.modalTitle}>Transaction Details</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Text style={uiStyles.closeButton}>Close</Text>
              </TouchableOpacity>
            </View>

            {selectedTransaction && (
              <View style={uiStyles.modalBody}>
                <View style={uiStyles.detailRow}>
                  <Text style={uiStyles.detailLabel}>Amount</Text>
                  <Text style={uiStyles.detailValue}>
                    {selectedTransaction.currency} {selectedTransaction.amount.toFixed(2)}
                  </Text>
                </View>
                <View style={uiStyles.detailRow}>
                  <Text style={uiStyles.detailLabel}>Status</Text>
                  <StatusBadge status={selectedTransaction.status} />
                </View>
                <View style={uiStyles.detailRow}>
                  <Text style={uiStyles.detailLabel}>Customer</Text>
                  <Text style={uiStyles.detailValue}>{selectedTransaction.customerName}</Text>
                </View>
                <View style={uiStyles.detailRow}>
                  <Text style={uiStyles.detailLabel}>Date</Text>
                  <Text style={uiStyles.detailValue}>
                    {new Date(selectedTransaction.timestamp).toLocaleString()}
                  </Text>
                </View>
                <View style={uiStyles.detailRow}>
                  <Text style={uiStyles.detailLabel}>Reference</Text>
                  <Text style={uiStyles.detailValue}>{selectedTransaction.id}</Text>
                </View>
                {selectedTransaction.description && (
                  <View style={uiStyles.detailRowVertical}>
                    <Text style={uiStyles.detailLabel}>Description</Text>
                    <Text style={uiStyles.detailValueText}>{selectedTransaction.description}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const uiStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 16,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  searchContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    color: colors.text,
    fontSize: 16,
  },
  filtersWrapper: {
    marginBottom: 8,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    color: colors.muted,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  transactionItem: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemLeft: {
    flex: 1,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 13,
    color: colors.muted,
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderFooter: {
    paddingVertical: 20,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalBody: {
    gap: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailRowVertical: {
    gap: 8,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 14,
  },
  detailValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  detailValueText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
});

export default TransactionsScreen;
