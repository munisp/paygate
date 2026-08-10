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
  Modal,
  TextInput,
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
  green: '#22C55E',
};

const STATUS_COLORS: Record<string, string> = {
  pending: colors.warning,
  approved: colors.success,
  processing: colors.primary,
  completed: colors.green,
  failed: colors.error,
};

const PayrollScreen = () => {
  const navigation = useNavigation<any>();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const { data: runs, isLoading, error, refetch, isRefetching } = trpc.payroll.listRuns.useQuery();

  const approveMutation = trpc.payroll.approveRun.useMutation({
    onSuccess: () => {
      refetch();
      Alert.alert('Success', 'Payroll run approved');
    },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const createMutation = trpc.payroll.createRun.useMutation({
    onSuccess: () => {
      refetch();
      setCreateModalVisible(false);
      setPeriodStart('');
      setPeriodEnd('');
      Alert.alert('Success', 'Payroll run created');
    },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const formatCurrency = (amount: number) => {
    return `₦${(amount / 100).toLocaleString()}`;
  };

  const renderRun = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.runId}>Run #{item.id?.slice(-8)}</Text>
          <Text style={styles.period}>
            {item.periodStart ? new Date(item.periodStart).toLocaleDateString() : '—'} →{' '}
            {item.periodEnd ? new Date(item.periodEnd).toLocaleDateString() : '—'}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] }]}>
            {(item.status ?? 'pending').toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{item.staffCount ?? 0}</Text>
          <Text style={styles.statLabel}>Staff</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatCurrency(item.totalGross ?? 0)}</Text>
          <Text style={styles.statLabel}>Gross</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatCurrency(item.totalNet ?? 0)}</Text>
          <Text style={styles.statLabel}>Net Pay</Text>
        </View>
      </View>

      {item.status === 'pending' && (
        <TouchableOpacity
          style={styles.approveButton}
          onPress={() => {
            Alert.alert('Confirm', 'Approve this payroll run?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Approve', onPress: () => approveMutation.mutate({ id: item.id }) },
            ]);
          }}
        >
          <Text style={styles.approveButtonText}>Approve Run</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.muted, { marginTop: 12 }]}>Loading payroll runs...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load payroll data</Text>
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
        <Text style={styles.title}>Payroll</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ New Run</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={runs ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderRun}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No payroll runs yet</Text>
            <TouchableOpacity style={styles.emptyActionButton} onPress={() => setCreateModalVisible(true)}>
              <Text style={styles.emptyActionButtonText}>Create First Run</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Create Modal */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Payroll Run</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Period Start (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={periodStart}
                onChangeText={setPeriodStart}
                placeholder="2026-05-01"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Period End (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={periodEnd}
                onChangeText={setPeriodEnd}
                placeholder="2026-05-31"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.buttonTextSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary]}
                disabled={!periodStart || !periodEnd || createMutation.isLoading}
                onPress={() => createMutation.mutate({ periodStart, periodEnd })}
              >
                <Text style={styles.buttonTextPrimary}>
                  {createMutation.isLoading ? 'Creating...' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { color: colors.primary, fontSize: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  createButton: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  createButtonText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  runId: { fontSize: 16, fontWeight: '600', color: colors.text },
  period: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 15, fontWeight: 'bold', color: colors.text },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  approveButton: { backgroundColor: colors.success + '20', borderWidth: 1, borderColor: colors.success, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  approveButtonText: { color: colors.success, fontWeight: '600' },
  muted: { color: colors.muted },
  errorText: { color: colors.error, fontSize: 16, marginBottom: 16 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 8 },
  retryButtonText: { color: '#FFF', fontWeight: '600' },
  emptyContainer: { marginTop: 60, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: 16, marginBottom: 16 },
  emptyActionButton: { paddingVertical: 10, paddingHorizontal: 20, borderWidth: 1, borderColor: colors.primary, borderRadius: 8 },
  emptyActionButtonText: { color: colors.primary, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: 24 },
  inputGroup: { marginBottom: 20 },
  label: { color: colors.muted, fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, borderWidth: 1, borderColor: colors.border },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, minWidth: 100, alignItems: 'center' },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: 'transparent' },
  buttonTextPrimary: { color: '#FFF', fontWeight: '600' },
  buttonTextSecondary: { color: colors.muted, fontWeight: '600' },
});

export default PayrollScreen;
