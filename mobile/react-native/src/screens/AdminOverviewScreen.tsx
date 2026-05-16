import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useTrpc } from '../hooks/useTrpc';

interface AdminStats {
  totalMerchants: number;
  activeUsers: number;
  revenue: number;
  systemHealth: 'good' | 'warning' | 'critical';
}

const AdminScreen: React.FC = () => {
  const { query } = useTrpc();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const result = await query.adminMgmt.getStats.query();
      setStats(result);
    } catch (error) {
      console.error('Failed to fetch admin stats:', error);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [query.adminMgmt.getStats]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRetry = () => {
    fetchStats();
  };

  if (isLoading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading admin dashboard...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Failed to load data.</Text>
        <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.emptyText}>No admin statistics available.</Text>
        <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getHealthColor = (health: 'good' | 'warning' | 'critical') => {
    switch (health) {
      case 'good':
        return 'green';
      case 'warning':
        return 'orange';
      case 'critical':
        return 'red';
      default:
        return 'white';
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={fetchStats}
          tintColor="#6366f1"
        />
      }
    >
      <Text style={styles.header}>Admin Overview</Text>

      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Total Merchants</Text>
          <Text style={styles.cardValue}>{stats.totalMerchants}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Active Users</Text>
          <Text style={styles.cardValue}>{stats.activeUsers}</Text>
        </View>
      </View>

      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Revenue</Text>
          <Text style={styles.cardValue}>${stats.revenue.toLocaleString()}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>System Health</Text>
          <Text style={[styles.cardValue, { color: getHealthColor(stats.systemHealth) }]}>
            {stats.systemHealth.charAt(0).toUpperCase() + stats.systemHealth.slice(1)}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  contentContainer: {
    padding: 16,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 24,
    textAlign: 'center',
  },
  cardContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 20,
    flex: 1,
    marginHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#94a3b8',
  },
  errorText: {
    fontSize: 18,
    color: 'red',
    marginBottom: 15,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#94a3b8',
    marginBottom: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AdminScreen;
