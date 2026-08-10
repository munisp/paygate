import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useTrpc } from '../hooks/useTrpc';

interface PosTerminal {
  id: string;
  terminalId: string;
  status: 'active' | 'inactive' | 'maintenance';
  location: string;
  transactionCount: number;
  lastActive: string;
}

export default function PosScreen() {
  const { query } = useTrpc();
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTerminals = useCallback(async () => {
    try {
      setError(null);
      const response = await query('posTerminals.list', {});
      // Assuming response is an array of terminals or has a data property
      setTerminals(response?.data || response || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load POS terminals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    fetchTerminals();
  }, [fetchTerminals]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTerminals();
  }, [fetchTerminals]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#10b981'; // emerald-500
      case 'inactive':
        return '#ef4444'; // red-500
      case 'maintenance':
        return '#f59e0b'; // amber-500
      default:
        return '#94a3b8';
    }
  };

  const renderTerminal = ({ item }: { item: PosTerminal }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.terminalId}>{item.terminalId || item.id}</Text>
          <Text style={styles.location}>{item.location || 'Unknown Location'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}20` }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Unknown'}
          </Text>
        </View>
      </View>
      
      <View style={styles.divider} />
      
      <View style={styles.cardFooter}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Transactions</Text>
          <Text style={styles.statValue}>{item.transactionCount || 0}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Last Active</Text>
          <Text style={styles.statValue}>
            {item.lastActive ? new Date(item.lastActive).toLocaleDateString() : 'N/A'}
          </Text>
        </View>
      </View>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading POS terminals...</Text>
      </View>
    );
  }

  if (error && !refreshing && terminals.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchTerminals}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>POS Terminals</Text>
        <Text style={styles.subtitle}>Manage your point of sale devices</Text>
      </View>

      <FlatList
        data={terminals}
        keyExtractor={(item, index) => item.id || index.toString()}
        renderItem={renderTerminal}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366f1"
            colors={['#6366f1']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No POS Terminals</Text>
            <Text style={styles.emptyText}>
              You don't have any POS terminals assigned to your account yet.
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchTerminals}>
              <Text style={styles.retryButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
  },
  listContainer: {
    padding: 16,
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  terminalId: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  location: {
    fontSize: 14,
    color: '#94a3b8',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  loadingText: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
});