import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { trpc } from '@/lib/trpc';

type FraudAlert = {
  id: string;
  customerName: string;
  transactionId: string;
  amount: number;
  currency: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'resolved';
  description: string;
  timestamp: string;
};

const FraudRiskScreen = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: alerts, isLoading, isError, error, refetch } = trpc.fraudRisk.listAlerts.useQuery();
  const updateAlertMutation = trpc.fraudRisk.updateAlert.useMutation();

  const filteredAlerts = alerts?.filter(alert =>
    alert.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    alert.transactionId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleMarkResolved = async (alertId: string) => {
    Alert.alert(
      'Resolve Alert',
      'Are you sure you want to mark this alert as resolved?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          onPress: async () => {
            try {
              await updateAlertMutation.mutateAsync({ id: alertId, status: 'resolved' });
              refetch();
              Alert.alert('Success', 'Alert marked as resolved.');
            } catch (err: any) {
              Alert.alert('Error', `Failed to resolve alert: ${err.message}`);
            }
          },
        },
      ]
    );
  };

  const getSeverityColor = (severity: FraudAlert['severity']) => {
    switch (severity) {
      case 'low': return '#22c55e'; // green
      case 'medium': return '#eab308'; // yellow
      case 'high': return '#f97316'; // orange
      case 'critical': return '#ef4444'; // red
      default: return '#94a3b8';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Fetching fraud alerts from Lagos...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Error loading alerts: {error?.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Try Again, Oga!</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Fraud Risk Alerts', headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#f8fafc' }} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search by customer or transaction ID..."
        placeholderTextColor="#94a3b8"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.customerName}>{item.customerName}</Text>
              <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(item.severity) }]}>
                <Text style={styles.severityText}>{item.severity.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.detailText}>Transaction ID: {item.transactionId}</Text>
            <Text style={styles.detailText}>Amount: {item.currency} {item.amount.toLocaleString()}</Text>
            <Text style={styles.detailText}>Status: {item.status === 'resolved' ? 'Resolved' : 'Pending'}</Text>
            <Text style={styles.detailText}>Description: {item.description}</Text>
            <Text style={styles.detailText}>Time: {new Date(item.timestamp).toLocaleString()}</Text>
            {item.status === 'pending' && (
              <TouchableOpacity
                style={styles.resolveButton}
                onPress={() => handleMarkResolved(item.id)}
                disabled={updateAlertMutation.isLoading}
              >
                {updateAlertMutation.isLoading ? (
                  <ActivityIndicator color="#f8fafc" />
                ) : (
                  <Text style={styles.resolveButtonText}>Mark as Resolved</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateText}>No fraud alerts found. All clear, for now!</Text>
            <Text style={styles.emptyStateSubText}>Perhaps all the scammers are on holiday in Dubai. Or maybe your system is just that good, eh?</Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  loadingText: {
    color: '#f8fafc',
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 16,
    borderColor: '#6366f1',
    borderWidth: 1,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  severityText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: 'bold',
  },
  detailText: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 4,
  },
  resolveButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  resolveButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyStateText: {
    color: '#f8fafc',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyStateSubText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default FraudRiskScreen;
