import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { useTrpc } from '../hooks/useTrpc'; // Assuming this path is correct

// Define the color scheme
const Colors = {
  primary: '#6366f1',
  background: '#0f172a',
  card: '#1e293b',
  text: 'white',
  subtext: '#94a3b8',
};

// Define mock types for billing data. In a real application, these would be generated from tRPC.
interface BillingPlan {
  name: string;
  price: string;
  features: string[];
}

interface UsageMeter {
  name: string;
  current: number;
  limit: number;
  unit: string;
}

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: string;
}

interface BillingData {
  plan: BillingPlan;
  usage: UsageMeter[];
  invoices: Invoice[];
}

const BillingScreen = () => {
  const { query } = useTrpc();

  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBillingData = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const activePlanPromise = query.billing.getActive.fetch();
      const billingEventsPromise = query.billing.listBillingEvents.fetch();

      const [activePlan, billingEvents] = await Promise.all([
        activePlanPromise,
        billingEventsPromise,
      ]);

      // Mock data for demonstration, replace with actual tRPC response mapping
      const mockPlan: BillingPlan = activePlan || {
        name: 'Pro Plan',
        price: '$99/month',
        features: ['Unlimited Transactions', 'Advanced Analytics', '24/7 Support'],
      };

      const mockUsage: UsageMeter[] = [
        { name: 'Transactions', current: 1500, limit: 2000, unit: '' },
        { name: 'API Calls', current: 8000, limit: 10000, unit: '' },
      ];

      const mockInvoices: Invoice[] = billingEvents || [
        { id: 'INV001', date: '2024-04-01', amount: '$99.00', status: 'Paid' },
        { id: 'INV002', date: '2024-03-01', amount: '$99.00', status: 'Paid' },
        { id: 'INV003', date: '2024-02-01', amount: '$99.00', status: 'Due' },
      ];

      setBillingData({
        plan: mockPlan,
        usage: mockUsage,
        invoices: mockInvoices,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch billing data.');
      setBillingData(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [query.billing.getActive, query.billing.listBillingEvents]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchBillingData();
  }, [fetchBillingData]);

  const renderInvoiceItem = ({ item }: { item: Invoice }) => (
    <View style={styles.invoiceCard}>
      <View>
        <Text style={styles.invoiceId}>Invoice #{item.id}</Text>
        <Text style={styles.invoiceDate}>{item.date}</Text>
      </View>
      <View style={styles.invoiceDetailsRight}>
        <Text style={styles.invoiceAmount}>{item.amount}</Text>
        <Text style={[styles.invoiceStatus, item.status === 'Paid' ? styles.statusPaid : styles.statusDue]}>
          {item.status}
        </Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading billing information...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchBillingData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!billingData || (!billingData.plan && billingData.invoices.length === 0)) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.emptyText}>No billing information available.</Text>
        <Text style={styles.emptySubText}>Please check back later or contact support.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchBillingData}>
          <Text style={styles.retryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
      {/* Current Plan Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Plan</Text>
        <Text style={styles.planName}>{billingData.plan.name}</Text>
        <Text style={styles.planPrice}>{billingData.plan.price}</Text>
        <View style={styles.featuresContainer}>
          {billingData.plan.features.map((feature, index) => (
            <Text key={index} style={styles.featureItem}>• {feature}</Text>
          ))}
        </View>
      </View>

      {/* Usage Meters Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Usage</Text>
        {billingData.usage.map((meter, index) => (
          <View key={index} style={styles.usageItem}>
            <Text style={styles.usageName}>{meter.name}</Text>
            <Text style={styles.usageValue}>{meter.current} / {meter.limit} {meter.unit}</Text>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${(meter.current / meter.limit) * 100}%` },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      {/* Invoice List Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Invoices</Text>
        {billingData.invoices.length > 0 ? (
          <FlatList
            data={billingData.invoices}
            keyExtractor={(item) => item.id}
            renderItem={renderInvoiceItem}
            scrollEnabled={false} // Disable FlatList scrolling as it's inside a ScrollView
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : (
          <Text style={styles.emptySubText}>No invoices found.</Text>
        )}
      </View>
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
    paddingBottom: 32, // Add some padding at the bottom for better scroll experience
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 20,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 15,
  },
  planName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 5,
  },
  planPrice: {
    fontSize: 16,
    color: Colors.subtext,
    marginBottom: 15,
  },
  featuresContainer: {
    marginTop: 10,
  },
  featureItem: {
    fontSize: 14,
    color: Colors.subtext,
    marginBottom: 5,
  },
  usageItem: {
    marginBottom: 15,
  },
  usageName: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 5,
  },
  usageValue: {
    fontSize: 14,
    color: Colors.subtext,
    marginBottom: 5,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: `${Colors.subtext}33`, // Lighter shade of subtext
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  invoiceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  invoiceId: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  invoiceDate: {
    fontSize: 13,
    color: Colors.subtext,
    marginTop: 2,
  },
  invoiceDetailsRight: {
    alignItems: 'flex-end',
  },
  invoiceAmount: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  invoiceStatus: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2,
  },
  statusPaid: {
    color: '#34d399', // Green for paid
  },
  statusDue: {
    color: '#f87171', // Red for due
  },
  separator: {
    height: 1,
    backgroundColor: `${Colors.subtext}33`, // Light separator
    marginVertical: 5,
  },
  loadingText: {
    color: Colors.subtext,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444', // Red error color
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 15,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubText: {
    color: Colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default BillingScreen;
