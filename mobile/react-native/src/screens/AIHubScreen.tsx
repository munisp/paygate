import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useTrpc } from '../hooks/useTrpc';

interface Insight {
  id: string;
  modelName: string;
  performanceMetric: number;
  prediction: string;
  timestamp: string;
}

export default function Ai() {
  const { query } = useTrpc();
  const { data, isLoading, isError, error, refetch } = query.ai.getInsights();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Loading AI insights...</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.centeredContainer}>
          <Text style={styles.errorText}>Error: {error?.message || 'Failed to load insights'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!data || data.length === 0) {
      return (
        <View style={styles.centeredContainer}>
          <Text style={styles.emptyText}>No AI insights available yet.</Text>
          <Text style={styles.subtext}>Check back later for updates.</Text>
        </View>
      );
    }

    return (
      <View style={styles.cardContainer}>
        {data.map((insight: Insight) => (
          <View key={insight.id} style={styles.card}>
            <Text style={styles.cardTitle}>{insight.modelName}</Text>
            <Text style={styles.cardText}>Performance: {insight.performanceMetric.toFixed(2)}%</Text>
            <Text style={styles.cardText}>Prediction: {insight.prediction}</Text>
            <Text style={styles.cardSubtext}>Timestamp: {new Date(insight.timestamp).toLocaleString()}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollViewContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
    >
      <Text style={styles.header}>AI Insights Hub</Text>
      {renderContent()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollViewContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 24,
    textAlign: 'center',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: 'white',
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
    backgroundColor: '#6366f1',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 5,
  },
  subtext: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  cardContainer: {
    marginTop: 16,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 16,
    color: 'white',
    marginBottom: 4,
  },
  cardSubtext: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
  },
});
