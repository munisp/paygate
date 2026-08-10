import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useTrpc } from '../hooks/useTrpc'; // Assuming this path

// Define types for escrow account (mocked for now, replace with actual tRPC type)
interface EscrowAccount {
  id: string;
  name: string;
  amount: number;
  currency: string;
  status: 'pending' | 'released' | 'disputed' | 'cancelled';
  createdAt: string;
}

const EscrowScreen = () => {
  const { query } = useTrpc();
  const listEscrowAccountsQuery = query.wave24.listEscrowAccounts;

  const [accounts, setAccounts] = useState<EscrowAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchEscrowAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listEscrowAccountsQuery.fetch();
      setAccounts(result || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch escrow accounts.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [listEscrowAccountsQuery]);

  useEffect(() => {
    fetchEscrowAccounts();
  }, [fetchEscrowAccounts]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchEscrowAccounts();
  }, [fetchEscrowAccounts]);

  const handleRelease = (id: string) => {
    // Placeholder for release action
    console.log(`Release escrow account: ${id}`);
    // Implement actual mutation here
  };

  const handleDispute = (id: string) => {
    // Placeholder for dispute action
    console.log(`Dispute escrow account: ${id}`);
    // Implement actual mutation here
  };

  const renderItem = ({ item }: { item: EscrowAccount }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.badge, styles[item.status]]}>
          <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardDetail}>Amount: {item.amount} {item.currency}</Text>
      <Text style={styles.cardDetail}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <View style={styles.actionsContainer}>
        {item.status === 'pending' && (
          <TouchableOpacity style={styles.actionButton} onPress={() => handleRelease(item.id)}>
            <Text style={styles.actionButtonText}>Release</Text>
          </TouchableOpacity>
        )}
        {item.status !== 'disputed' && item.status !== 'cancelled' && (
          <TouchableOpacity style={[styles.actionButton, styles.disputeButton]} onPress={() => handleDispute(item.id)}>
            <Text style={styles.actionButtonText}>Dispute</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading escrow accounts...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchEscrowAccounts}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (accounts.length === 0) {
    return (
      <FlatList
        contentContainerStyle={styles.centeredContainer}
        data={[]}
        renderItem={() => null}
        ListEmptyComponent={
          <View>
            <Text style={styles.emptyText}>No escrow accounts found.</Text>
            <Text style={styles.subtext}>Start a new transaction to see it here.</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
    </View>
  );
};

const colors = {
  primary: '#6366f1',
  background: '#0f172a',
  card: '#1e293b',
  text: 'white',
  subtext: '#94a3b8',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  listContentContainer: {
    padding: 16,
  },
  loadingText: {
    color: colors.subtext,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    color: colors.text,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardDetail: {
    color: colors.subtext,
    fontSize: 14,
    marginBottom: 4,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  badgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  pending: {
    backgroundColor: '#f59e0b', // Amber
  },
  released: {
    backgroundColor: '#22c55e', // Green
  },
  disputed: {
    backgroundColor: '#ef4444', // Red
  },
  cancelled: {
    backgroundColor: '#64748b', // Slate
  },
  actionsContainer: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 10,
  },
  actionButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  disputeButton: {
    backgroundColor: '#ef4444', // Red for dispute
  },
  actionButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default EscrowScreen;
