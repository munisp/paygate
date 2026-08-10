import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, FlatList, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { Stack } from 'expo-router';
import { trpc } from '@/lib/trpc';

interface KPICardProps {
  title: string;
  value: string;
  icon: string; // In a real app, this would be a more complex icon component
}

const KPICard: React.FC<KPICardProps> = ({ title, value, icon }) => (
  <View style={styles.kpiCard}>
    <Text style={styles.kpiIcon}>{icon}</Text>
    <Text style={styles.kpiTitle}>{title}</Text>
    <Text style={styles.kpiValue}>{value}</Text>
  </View>
);

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  status: 'completed' | 'pending' | 'failed';
}

const TransactionItem: React.FC<{ transaction: Transaction }> = ({ transaction }) => (
  <View style={styles.transactionItem}>
    <View>
      <Text style={styles.transactionDescription}>{transaction.description}</Text>
      <Text style={styles.transactionDate}>{new Date(transaction.date).toLocaleDateString()}</Text>
    </View>
    <View style={styles.transactionAmountContainer}>
      <Text style={styles.transactionAmount}>₦{transaction.amount.toLocaleString()}</Text>
      <Text style={[styles.transactionStatus, styles[transaction.status]]}>{transaction.status}</Text>
    </View>
  </View>
);

export default function DashboardScreen() {
  const [searchText, setSearchText] = useState('');

  const { data: summary, isLoading: isLoadingSummary, error: errorSummary } = trpc.dashboard.getSummary.useQuery();
  const { data: transactions, isLoading: isLoadingTransactions, error: errorTransactions } = trpc.dashboard.getRecentTransactions.useQuery();

  const filteredTransactions = transactions?.filter(transaction =>
    transaction.description.toLowerCase().includes(searchText.toLowerCase())
  );

  if (isLoadingSummary || isLoadingTransactions) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Fetching your latest financial insights...</Text>
      </View>
    );
  }

  if (errorSummary || errorTransactions) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Oops! We couldn't load your dashboard data.</Text>
        <Text style={styles.errorText}>Please check your internet connection or try again later.</Text>
        <Text style={styles.errorText}>Error: {errorSummary?.message || errorTransactions?.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Dashboard', headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#f8fafc' }} />
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <Text style={styles.header}>Welcome to PayGate!</Text>

        {/* KPI Cards */}
        <View style={styles.kpiContainer}>
          <KPICard title="Total Revenue" value={`₦${summary?.totalRevenue?.toLocaleString() || '0'}`} icon="💰" />
          <KPICard title="Successful Txns" value={summary?.successfulTransactions?.toLocaleString() || '0'} icon="✅" />
          <KPICard title="Pending Txns" value={summary?.pendingTransactions?.toLocaleString() || '0'} icon="⏳" />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionHeader}>Quick Actions</Text>
        <View style={styles.quickActionsContainer}>
          <TouchableOpacity style={styles.quickActionButton}>
            <Text style={styles.quickActionButtonText}>Send Money</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton}>
            <Text style={styles.quickActionButtonText}>Generate Link</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton}>
            <Text style={styles.quickActionButtonText}>View Reports</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Transactions */}
        <Text style={styles.sectionHeader}>Recent Transactions</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search transactions..."
          placeholderTextColor="#94a3b8"
          value={searchText}
          onChangeText={setSearchText}
        />
        {filteredTransactions && filteredTransactions.length > 0 ? (
          <FlatList
            data={filteredTransactions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <TransactionItem transaction={item} />}
            scrollEnabled={false} // Disable FlatList scrolling inside ScrollView
          />
        ) : (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateText}>No recent transactions found. Time to make some naira!</Text>
            <Text style={styles.emptyStateText}>Try processing a payment or generating a payment link.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollViewContent: {
    padding: 16,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginTop: 24,
    marginBottom: 16,
  },
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  kpiCard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    width: '48%', // Roughly half width for two cards per row
    marginBottom: 16,
    alignItems: 'center',
  },
  kpiIcon: {
    fontSize: 30,
    marginBottom: 8,
  },
  kpiTitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  quickActionButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  quickActionButtonText: {
    color: '#f8fafc',
    fontWeight: 'bold',
    fontSize: 16,
  },
  searchInput: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 16,
  },
  transactionItem: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionDescription: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  transactionDate: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  transactionStatus: {
    fontSize: 12,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: 'bold',
  },
  completed: {
    color: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  pending: {
    color: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  failed: {
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#f8fafc',
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 5,
  },
  emptyStateContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  emptyStateText: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 5,
  },
});
