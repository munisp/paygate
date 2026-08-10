import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, RefreshControl, SafeAreaView, StatusBar, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

type MicroserviceStatus = {
  id: string;
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  lastChecked: string;
  message?: string;
};

const MicroserviceHealthScreen = () => {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);

  // Assuming a tRPC router for microservices and a procedure to get health status
  // The actual tRPC router/procedure name should be confirmed based on the backend.
  // For this example, we'll use `trpc.microservices.getHealthStatus`.
  const { data, isLoading, isError, error, refetch } = trpc.microservices.getHealthStatus.useQuery();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading microservice health...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error.message}</Text>
          <Text style={styles.errorText}>Failed to load microservice health.</Text>
          <Text style={styles.errorText}>Please try again later.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const microservices: MicroserviceStatus[] = data || [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <ScrollView
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressBackgroundColor={COLORS.card}
          />
        }
      >
        <Text style={styles.header}>Microservice Health Status</Text>
        {microservices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No microservices found or health data is empty.</Text>
            <Text style={styles.emptyText}>Pull down to refresh.</Text>
          </View>
        ) : (
          microservices.map((service) => (
            <View key={service.id} style={styles.card}>
              <Text style={styles.serviceName}>{service.name}</Text>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Status:</Text>
                <Text style={[styles.statusBadge, styles[service.status]]}>
                  {service.status.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.lastChecked}>Last Checked: {new Date(service.lastChecked).toLocaleString()}</Text>
              {service.message && <Text style={styles.message}>Message: {service.message}</Text>}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollViewContent: {
    flexGrow: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  serviceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusLabel: {
    color: COLORS.muted,
    fontSize: 14,
    marginRight: 8,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    fontWeight: 'bold',
    fontSize: 12,
  },
  healthy: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  unhealthy: {
    backgroundColor: COLORS.error,
    color: COLORS.background,
  },
  degraded: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  lastChecked: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 4,
  },
  message: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

export default MicroserviceHealthScreen;
