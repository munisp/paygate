import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { useTrpc } from '../hooks/useTrpc'; // Assuming this path is correct

// Define types for SIP investment data
interface SipInvestment {
  id: string;
  planName: string;
  currentValue: number;
  investedAmount: number;
  returns: number;
  status: 'active' | 'paused' | 'completed';
}

const SipScreen: React.FC = () => {
  const { query } = useTrpc();
  const { data, isLoading, isError, error, refetch } = query.sip.list();

  const onRefresh = () => {
    refetch();
  };

  const renderSipItem = ({ item }: { item: SipInvestment }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.planName}</Text>
      <View style={styles.detailRow}>
        <Text style={styles.label}>Current Value:</Text>
        <Text style={styles.value}>${item.currentValue.toFixed(2)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.label}>Invested Amount:</Text>
        <Text style={styles.value}>${item.investedAmount.toFixed(2)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.label}>Returns:</Text>
        <Text style={styles.value}>${item.returns.toFixed(2)}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.label}>Status:</Text>
        <Text style={[styles.value, { color: item.status === 'active' ? '#4CAF50' : styles.value.color }]}>{item.status}</Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading SIP investments...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Failed to load investments: {error?.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.centeredContainer}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <Text style={styles.emptyText}>No SIP investment plans found.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Calculate total portfolio value (example, adjust based on actual data structure)
  const totalPortfolioValue = data.reduce((sum, item) => sum + item.currentValue, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      <Text style={styles.header}>SIP Investments</Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Portfolio Value</Text>
        <Text style={styles.summaryValue}>${totalPortfolioValue.toFixed(2)}</Text>
      </View>

      <Text style={styles.sectionHeader}>Active Plans</Text>
      <FlatList
        data={data}
        renderItem={renderSipItem}
        keyExtractor={(item) => item.id}
        scrollEnabled={false} // Disable FlatList scrolling as it's inside a ScrollView
        ListEmptyComponent={
          <View style={styles.emptyListContainer}>
            <Text style={styles.emptyText}>No active SIP plans.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.investButton} onPress={() => console.log('Navigate to Invest screen')}>
        <Text style={styles.investButtonText}>Invest Now</Text>
      </TouchableOpacity>
    </ScrollView>
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
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  summaryLabel: {
    fontSize: 16,
    color: colors.subtext,
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
  },
  sectionHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 20,
    marginBottom: 15,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  label: {
    fontSize: 14,
    color: colors.subtext,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  investButton: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  investButtonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
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
    marginBottom: 15,
  },
  emptyText: {
    color: colors.subtext,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyListContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
});

export default SipScreen;
