import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const colors = {
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

const CURRENCY_FLAGS: Record<string, string> = {
  NGN: '🇳🇬', GHS: '🇬🇭', KES: '🇰🇪', ZAR: '🇿🇦',
  EUR: '🇪🇺', GBP: '🇬🇧', CAD: '🇨🇦', AUD: '🇦🇺',
  JPY: '🇯🇵', CNY: '🇨🇳', INR: '🇮🇳', BRL: '🇧🇷',
  AED: '🇦🇪', SAR: '🇸🇦', MXN: '🇲🇽',
};

const FXDashboardScreen = () => {
  const navigation = useNavigation<any>();
  const [base, setBase] = useState('USD');
  const [activeTab, setActiveTab] = useState<'rates' | 'corridors'>('rates');

  const {
    data: ratesData,
    isLoading: ratesLoading,
    refetch: refetchRates,
    isRefetching: ratesRefetching,
  } = trpc.fx.getRates.useQuery({ base });

  const {
    data: corridorData,
    isLoading: corridorLoading,
    refetch: refetchCorridors,
  } = trpc.fx.corridorVolume.useQuery({ daysSince: 7 });

  const fetchMutation = trpc.fx.fetchAndStore.useMutation({
    onSuccess: (result) => {
      refetchRates();
      Alert.alert('Updated', `Fetched ${(result as any).count ?? 0} FX rates`);
    },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const BASE_CURRENCIES = ['USD', 'EUR', 'GBP'];

  // Build rate pairs from ratesData (which is an array of {baseCurrency, targetCurrency, rate, ...})
  const rates: Array<{ currency: string; rate: number }> = ratesData
    ? (ratesData as any[]).map((r: any) => ({
        currency: r.targetCurrency ?? r.currency ?? '',
        rate: parseFloat(r.rate ?? r.midRate ?? '0'),
      })).filter(r => r.currency)
    : [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>FX Dashboard</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => fetchMutation.mutate()}
          disabled={fetchMutation.isLoading}
        >
          <Text style={styles.refreshButtonText}>
            {fetchMutation.isLoading ? '...' : '↻ Refresh'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Base Currency Selector */}
      <View style={styles.baseSelectorRow}>
        <Text style={styles.baseSelectorLabel}>Base:</Text>
        {BASE_CURRENCIES.map(c => (
          <TouchableOpacity
            key={c}
            style={[styles.baseTab, base === c && styles.baseTabActive]}
            onPress={() => setBase(c)}
          >
            <Text style={[styles.baseTabText, base === c && styles.baseTabTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rates' && styles.tabActive]}
          onPress={() => setActiveTab('rates')}
        >
          <Text style={[styles.tabText, activeTab === 'rates' && styles.tabTextActive]}>Live Rates</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'corridors' && styles.tabActive]}
          onPress={() => setActiveTab('corridors')}
        >
          <Text style={[styles.tabText, activeTab === 'corridors' && styles.tabTextActive]}>Corridors (7d)</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'rates' ? (
        ratesLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={rates}
            keyExtractor={(item) => item.currency}
            renderItem={({ item }) => (
              <View style={styles.rateCard}>
                <View style={styles.rateLeft}>
                  <Text style={styles.flag}>{CURRENCY_FLAGS[item.currency] ?? '🌐'}</Text>
                  <Text style={styles.currency}>{item.currency}</Text>
                </View>
                <Text style={styles.rate}>{item.rate.toFixed(4)}</Text>
              </View>
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={ratesRefetching}
                onRefresh={refetchRates}
                tintColor={colors.primary}
              />
            }
            ListHeaderComponent={
              <Text style={styles.ratesHeader}>1 {base} = ...</Text>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No rates available. Tap ↻ Refresh to fetch.</Text>
              </View>
            }
          />
        )
      ) : (
        corridorLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={corridorData as any[] ?? []}
            keyExtractor={(item, i) => `${item.baseCurrency}-${item.targetCurrency}-${i}`}
            renderItem={({ item }) => (
              <View style={styles.corridorCard}>
                <View style={styles.corridorPair}>
                  <Text style={styles.corridorCurrency}>
                    {CURRENCY_FLAGS[item.baseCurrency] ?? '🌐'} {item.baseCurrency}
                  </Text>
                  <Text style={styles.corridorArrow}>→</Text>
                  <Text style={styles.corridorCurrency}>
                    {CURRENCY_FLAGS[item.targetCurrency] ?? '🌐'} {item.targetCurrency}
                  </Text>
                </View>
                <View style={styles.corridorStats}>
                  <Text style={styles.corridorVolume}>
                    {item.transactionCount ?? 0} txns
                  </Text>
                  <Text style={styles.corridorAmount}>
                    {item.totalVolume ? `$${Number(item.totalVolume).toLocaleString()}` : '—'}
                  </Text>
                </View>
              </View>
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No corridor data for the last 7 days.</Text>
              </View>
            }
          />
        )
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { color: colors.primary, fontSize: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  refreshButton: { backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.primary },
  refreshButtonText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  baseSelectorRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  baseSelectorLabel: { color: colors.muted, fontSize: 14 },
  baseTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  baseTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  baseTabText: { color: colors.muted, fontSize: 13 },
  baseTabTextActive: { color: '#FFF', fontWeight: '600' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.card, borderColor: colors.primary },
  tabText: { color: colors.muted, fontSize: 14 },
  tabTextActive: { color: colors.primary, fontWeight: '600' },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  ratesHeader: { color: colors.muted, fontSize: 13, marginBottom: 12, fontStyle: 'italic' },
  rateCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  rateLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flag: { fontSize: 20 },
  currency: { fontSize: 15, fontWeight: '600', color: colors.text },
  rate: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  corridorCard: { backgroundColor: colors.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  corridorPair: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  corridorCurrency: { fontSize: 14, fontWeight: '600', color: colors.text },
  corridorArrow: { color: colors.muted, fontSize: 16 },
  corridorStats: { flexDirection: 'row', justifyContent: 'space-between' },
  corridorVolume: { color: colors.muted, fontSize: 13 },
  corridorAmount: { color: colors.success, fontSize: 14, fontWeight: '600' },
  emptyContainer: { marginTop: 60, alignItems: 'center', paddingHorizontal: 20 },
  emptyText: { color: colors.muted, fontSize: 15, textAlign: 'center' },
});

export default FXDashboardScreen;
