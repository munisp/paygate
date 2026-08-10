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
  info: '#3B82F6',
};

const STATUS_COLORS: Record<string, string> = {
  pending: colors.warning,
  matched: colors.success,
  unmatched: colors.error,
  manual_review: colors.info,
};

const PROVIDER_COLORS: Record<string, string> = {
  mtn: '#FFCC00',
  airtel: '#EF4444',
  glo: '#22C55E',
  '9mobile': '#10B981',
  mpesa: '#22C55E',
  default: colors.primary,
};

const MobileMoneyReconScreen = () => {
  const navigation = useNavigation<any>();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: statsData } = trpc.mobileMoneyRecon.stats.useQuery();
  const {
    data: records,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = trpc.mobileMoneyRecon.list.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 50,
  });

  const reconcileMutation = trpc.mobileMoneyRecon.reconcile.useMutation({
    onSuccess: (result) => {
      refetch();
      setSelectedIds([]);
      Alert.alert('Success', `Reconciled ${(result as any).reconciled ?? 0} records`);
    },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const formatCurrency = (amount: number, currency = 'NGN') => {
    const symbol = currency === 'NGN' ? '₦' : currency === 'KES' ? 'KSh' : currency;
    return `${symbol}${(amount / 100).toLocaleString()}`;
  };

  const renderRecord = ({ item }: { item: any }) => {
    const isSelected = selectedIds.includes(item.id);
    const providerColor = PROVIDER_COLORS[item.provider?.toLowerCase()] ?? PROVIDER_COLORS.default;

    return (
      <TouchableOpacity
        style={[styles.card, isSelected && styles.cardSelected]}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.providerBadge}>
            <Text style={[styles.providerText, { color: providerColor }]}>
              {(item.provider ?? 'N/A').toUpperCase()}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
              {(item.status ?? 'pending').replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.amount}>{formatCurrency(item.amount ?? 0, item.currency)}</Text>
          <Text style={styles.reference}>{item.externalRef ?? item.id?.slice(-8)}</Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.phone}>{item.phoneNumber ?? '—'}</Text>
          <Text style={styles.date}>
            {item.transactionDate ? new Date(item.transactionDate).toLocaleDateString() : '—'}
          </Text>
        </View>

        {isSelected && (
          <View style={styles.selectedIndicator}>
            <Text style={styles.selectedText}>✓ Selected</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.muted, { marginTop: 12 }]}>Loading reconciliation data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Mobile Money Recon</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Stats */}
      {statsData && (
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{(statsData as any).total ?? 0}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.success }]}>{(statsData as any).matched ?? 0}</Text>
            <Text style={styles.statLabel}>Matched</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.error }]}>{(statsData as any).unmatched ?? 0}</Text>
            <Text style={styles.statLabel}>Unmatched</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.warning }]}>{(statsData as any).pending ?? 0}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>
      )}

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {['all', 'pending', 'unmatched', 'matched', 'manual_review'].map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.filterTab, statusFilter === s && styles.filterTabActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.filterTabText, statusFilter === s && styles.filterTabTextActive]}>
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkText}>{selectedIds.length} selected</Text>
          <TouchableOpacity
            style={styles.reconcileButton}
            onPress={() => {
              Alert.alert('Reconcile', `Reconcile ${selectedIds.length} records?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reconcile', onPress: () => reconcileMutation.mutate({ ids: selectedIds }) },
              ]);
            }}
            disabled={reconcileMutation.isLoading}
          >
            <Text style={styles.reconcileButtonText}>
              {reconcileMutation.isLoading ? 'Processing...' : 'Reconcile Selected'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedIds([])}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={records ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderRecord}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No records found</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { color: colors.primary, fontSize: 16 },
  title: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  statsRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  statLabel: { fontSize: 10, color: colors.muted, marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 12, gap: 6, flexWrap: 'wrap' },
  filterTab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  filterTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterTabText: { color: colors.muted, fontSize: 12 },
  filterTabTextActive: { color: '#FFF', fontWeight: '600' },
  bulkBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.card, gap: 12 },
  bulkText: { color: colors.text, fontSize: 13, flex: 1 },
  reconcileButton: { backgroundColor: colors.success, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  reconcileButtonText: { color: '#FFF', fontWeight: '600', fontSize: 12 },
  clearText: { color: colors.muted, fontSize: 13 },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  providerBadge: { backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  providerText: { fontSize: 11, fontWeight: 'bold' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  amount: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  reference: { fontSize: 12, color: colors.muted, fontFamily: 'monospace' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  phone: { fontSize: 12, color: colors.muted },
  date: { fontSize: 12, color: colors.muted },
  selectedIndicator: { marginTop: 8, alignItems: 'center' },
  selectedText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  muted: { color: colors.muted },
  errorText: { color: colors.error, fontSize: 16, marginBottom: 16 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 8 },
  retryButtonText: { color: '#FFF', fontWeight: '600' },
  emptyContainer: { marginTop: 60, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: 16 },
});

export default MobileMoneyReconScreen;
