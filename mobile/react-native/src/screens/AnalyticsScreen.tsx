import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { trpc } from '../lib/trpc';

// --- Types ---

type DateRange = '7d' | '30d' | '90d';

interface MetricCardProps {
  label: string;
  value: string;
  trend?: string;
  trendType?: 'positive' | 'negative' | 'neutral';
}

interface Customer {
  id: string;
  name: string;
  email: string;
  totalVolume: number;
  transactionCount: number;
}

// --- Constants ---

const COLORS = {
  primary: '#6366F1',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  muted: '#94A3B8',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  border: '#334155',
};

const SCREEN_WIDTH = Dimensions.get('window').width;

// --- Components ---

const MetricCard: React.FC<MetricCardProps> = ({ label, value, trend, trendType }) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
    {trend && (
      <Text
        style={[
          styles.metricTrend,
          trendType === 'positive' && { color: COLORS.success },
          trendType === 'negative' && { color: COLORS.error },
        ]}
      >
        {trend}
      </Text>
    )}
  </View>
);

const AnalyticsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [dateRange, setDateRange] = useState<DateRange>('7d');

  // API Queries
  const analyticsQuery = trpc.analytics.getOverview.useQuery({ range: dateRange });
  const topCustomersQuery = trpc.analytics.getTopCustomers.useQuery({ range: dateRange });

  const onRefresh = React.useCallback(() => {
    analyticsQuery.refetch();
    topCustomersQuery.refetch();
  }, [analyticsQuery, topCustomersQuery]);

  const isLoading = analyticsQuery.isLoading || topCustomersQuery.isLoading;
  const isError = analyticsQuery.isError || topCustomersQuery.isError;

  const chartData = useMemo(() => {
    if (!analyticsQuery.data?.chart) {
      return {
        labels: [],
        datasets: [{ data: [0] }],
      };
    }
    return {
      labels: analyticsQuery.data.chart.labels,
      datasets: [
        {
          data: analyticsQuery.data.chart.values,
          color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  }, [analyticsQuery.data]);

  if (isError) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load analytics data.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderHeader = () => (
    <View>
      {/* Date Range Selector */}
      <View style={styles.rangeSelector}>
        {(['7d', '30d', '90d'] as DateRange[]).map((range) => (
          <TouchableOpacity
            key={range}
            style={[
              styles.rangeButton,
              dateRange === range && styles.rangeButtonActive,
            ]}
            onPress={() => setDateRange(range)}
          >
            <Text
              style={[
                styles.rangeButtonText,
                dateRange === range && styles.rangeButtonTextActive,
              ]}
            >
              {range.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Metrics Grid */}
      <View style={styles.metricsGrid}>
        <MetricCard
          label="GMV"
          value={analyticsQuery.data?.metrics.gmv || '$0.00'}
          trend={analyticsQuery.data?.metrics.gmvTrend}
          trendType={analyticsQuery.data?.metrics.gmvTrendType}
        />
        <MetricCard
          label="Success Rate"
          value={analyticsQuery.data?.metrics.successRate || '0%'}
          trend={analyticsQuery.data?.metrics.successRateTrend}
          trendType={analyticsQuery.data?.metrics.successRateTrendType}
        />
        <MetricCard
          label="Avg Ticket"
          value={analyticsQuery.data?.metrics.avgTicket || '$0.00'}
        />
      </View>

      {/* Revenue Chart */}
      <View style={styles.chartContainer}>
        <Text style={styles.sectionTitle}>Revenue Over Time</Text>
        {analyticsQuery.data?.chart ? (
          <LineChart
            data={chartData}
            width={SCREEN_WIDTH - 32}
            height={220}
            chartConfig={{
              backgroundColor: COLORS.card,
              backgroundGradientFrom: COLORS.card,
              backgroundGradientTo: COLORS.card,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(241, 245, 249, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
                stroke: COLORS.primary,
              },
            }}
            bezier
            style={styles.chart}
          />
        ) : (
          <View style={styles.emptyChart}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Top Customers</Text>
    </View>
  );

  const renderCustomerItem = ({ item }: { item: Customer }) => (
    <View style={styles.customerRow}>
      <View style={styles.customerInfo}>
        <Text style={styles.customerName}>{item.name}</Text>
        <Text style={styles.customerEmail}>{item.email}</Text>
      </View>
      <View style={styles.customerStats}>
        <Text style={styles.customerVolume}>
          ${item.totalVolume.toLocaleString()}
        </Text>
        <Text style={styles.customerCount}>{item.transactionCount} txns</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={topCustomersQuery.data || []}
        keyExtractor={(item) => item.id}
        renderItem={renderCustomerItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No customer data available</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  scrollContent: {
    padding: 16,
  },
  rangeSelector: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rangeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  rangeButtonActive: {
    backgroundColor: COLORS.primary,
  },
  rangeButtonText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  rangeButtonTextActive: {
    color: COLORS.text,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  metricCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    width: (SCREEN_WIDTH - 48) / 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricLabel: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  metricTrend: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '600',
  },
  chartContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  chart: {
    borderRadius: 16,
    marginVertical: 8,
  },
  emptyChart: {
    height: 220,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  customerEmail: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 2,
  },
  customerStats: {
    alignItems: 'flex-end',
  },
  customerVolume: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  customerCount: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default AnalyticsScreen;
