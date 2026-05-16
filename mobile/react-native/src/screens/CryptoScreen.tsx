import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useTrpc } from '../hooks/useTrpc'; // Assuming this path is correct

// Define the color scheme
const Colors = {
  primary: '#6366f1',
  background: '#0f172a',
  card: '#1e293b',
  text: 'white',
  subtext: '#94a3b8',
};

// Dummy data structure for crypto balances
interface CryptoBalance {
  id: string;
  currency: string;
  balance: string;
  usdValue: string;
}

const CryptoScreen: React.FC = () => {
  const { query } = useTrpc(); // Assuming getBalance is a query
  const [balances, setBalances] = useState<CryptoBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    setError(null);
    try {
      // Simulate API call
      // const result = await query.consumerWallet.getBalance.query();
      // For now, using dummy data
      const dummyResult: CryptoBalance[] = [
        { id: '1', currency: 'BTC', balance: '0.05', usdValue: '3500.00' },
        { id: '2', currency: 'ETH', balance: '0.75', usdValue: '2250.00' },
        { id: '3', currency: 'USDT', balance: '1000.00', usdValue: '1000.00' },
      ];
      setBalances(dummyResult);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch crypto balances.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchBalances();
  }, [fetchBalances]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading wallet balances...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchBalances}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (balances.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No crypto balances found. Start by depositing funds!</Text>
        </View>
      );
    }

    return (
      <View>
        {balances.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.currencyText}>{item.currency}</Text>
            <Text style={styles.balanceText}>{item.balance}</Text>
            <Text style={styles.usdValueText}>~ ${item.usdValue} USD</Text>
          </View>
        ))}
        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={() => console.log('Send Crypto')}>
            <Text style={styles.actionButtonText}>Send</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => console.log('Receive Crypto')}>
            <Text style={styles.actionButtonText}>Receive</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={Colors.primary}
          colors={[Colors.primary]}
          progressBackgroundColor={Colors.card}
        />
      }
    >
      <Text style={styles.header}>My Crypto Wallet</Text>
      {renderContent()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 24,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200, // Ensure it takes up some space
  },
  loadingText: {
    color: Colors.subtext,
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
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  currencyText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 5,
  },
  balanceText: {
    fontSize: 18,
    color: Colors.text,
    marginBottom: 5,
  },
  usdValueText: {
    fontSize: 16,
    color: Colors.subtext,
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  actionButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  actionButtonText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default CryptoScreen;
