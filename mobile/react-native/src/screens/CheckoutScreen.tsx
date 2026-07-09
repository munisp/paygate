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
  Linking,
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

const STATUS_COLORS: Record<string, string> = {
  active: colors.success,
  inactive: colors.muted,
  expired: colors.error,
  draft: colors.warning,
};

const CheckoutScreen = () => {
  const navigation = useNavigation<any>();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    currency: 'NGN',
    redirectUrl: '',
  });

  const { data: links, isLoading, error, refetch, isRefetching } = trpc.paymentLinks.list.useQuery();

  const createMutation = trpc.paymentLinks.create.useMutation({
    onSuccess: () => {
      refetch();
      setCreateModalVisible(false);
      setForm({ title: '', description: '', amount: '', currency: 'NGN', redirectUrl: '' });
      Alert.alert('Success', 'Payment link created');
    },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const deactivateMutation = trpc.paymentLinks.deactivate.useMutation({
    onSuccess: () => {
      refetch();
      Alert.alert('Success', 'Link deactivated');
    },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const formatCurrency = (amount: number, currency = 'NGN') => {
    const symbol = currency === 'NGN' ? '₦' : currency === 'KES' ? 'KSh' : currency;
    return `${symbol}${(amount / 100).toLocaleString()}`;
  };

  const renderLink = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>{item.title}</Text>
          {item.description && (
            <Text style={styles.linkDescription} numberOfLines={1}>{item.description}</Text>
          )}
        </View>
        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] }]}>
            {(item.status ?? 'active').toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <Text style={styles.amount}>
          {item.amount ? formatCurrency(item.amount, item.currency) : 'Open amount'}
        </Text>
        <Text style={styles.currency}>{item.currency}</Text>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.stat}>
          {item.usageCount ?? 0}/{item.usageLimit ?? '∞'} uses
        </Text>
        <Text style={styles.stat}>
          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
        </Text>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.copyButton}
          onPress={() => {
            const url = item.checkoutUrl ?? item.slug;
            Alert.alert('Payment Link', url, [
              { text: 'Open', onPress: () => Linking.openURL(url) },
              { text: 'Close' },
            ]);
          }}
        >
          <Text style={styles.copyButtonText}>View Link</Text>
        </TouchableOpacity>
        {item.status === 'active' && (
          <TouchableOpacity
            style={styles.deactivateButton}
            onPress={() => {
              Alert.alert('Deactivate', 'Deactivate this payment link?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Deactivate', style: 'destructive', onPress: () => deactivateMutation.mutate({ id: item.id }) },
              ]);
            }}
          >
            <Text style={styles.deactivateButtonText}>Deactivate</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.muted, { marginTop: 12 }]}>Loading payment links...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load payment links</Text>
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
        <Text style={styles.title}>Checkout Links</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {links?.length ?? 0} payment link{(links?.length ?? 0) !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={links ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderLink}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No payment links yet</Text>
            <TouchableOpacity style={styles.emptyActionButton} onPress={() => setCreateModalVisible(true)}>
              <Text style={styles.emptyActionButtonText}>Create First Link</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Create Modal */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Payment Link</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={v => setForm(p => ({ ...p, title: v }))}
                placeholder="e.g. Product Payment"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                value={form.description}
                onChangeText={v => setForm(p => ({ ...p, description: v }))}
                placeholder="Optional description"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Amount (Kobo, leave blank for open)</Text>
              <TextInput
                style={styles.input}
                value={form.amount}
                onChangeText={v => setForm(p => ({ ...p, amount: v }))}
                placeholder="e.g. 500000 for ₦5,000"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
              />
              {form.amount ? (
                <Text style={styles.amountHint}>= ₦{(parseInt(form.amount) / 100).toLocaleString()}</Text>
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Currency</Text>
              <View style={styles.currencyRow}>
                {['NGN', 'USD', 'GHS', 'KES'].map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.currencyTab, form.currency === c && styles.currencyTabActive]}
                    onPress={() => setForm(p => ({ ...p, currency: c }))}
                  >
                    <Text style={[styles.currencyTabText, form.currency === c && styles.currencyTabTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
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
                disabled={!form.title || createMutation.isLoading}
                onPress={() => createMutation.mutate({
                  title: form.title,
                  description: form.description || undefined,
                  amount: form.amount ? parseInt(form.amount) : undefined,
                  currency: form.currency,
                  redirectUrl: form.redirectUrl || undefined,
                })}
              >
                <Text style={styles.buttonTextPrimary}>
                  {createMutation.isLoading ? 'Creating...' : 'Create Link'}
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
  statsBar: { paddingHorizontal: 20, paddingBottom: 12 },
  statsText: { color: colors.muted, fontSize: 14 },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  linkTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  linkDescription: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 8 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 8 },
  amount: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  currency: { fontSize: 13, color: colors.muted },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: { fontSize: 12, color: colors.muted },
  cardActions: { flexDirection: 'row', gap: 10 },
  copyButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 8 },
  copyButtonText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  deactivateButton: { paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.error, borderRadius: 8 },
  deactivateButtonText: { color: colors.error, fontWeight: '600', fontSize: 13 },
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
  inputGroup: { marginBottom: 16 },
  label: { color: colors.muted, fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, borderWidth: 1, borderColor: colors.border },
  amountHint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  currencyRow: { flexDirection: 'row', gap: 8 },
  currencyTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  currencyTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  currencyTabText: { color: colors.muted, fontSize: 13 },
  currencyTabTextActive: { color: '#FFF', fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, minWidth: 100, alignItems: 'center' },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: 'transparent' },
  buttonTextPrimary: { color: '#FFF', fontWeight: '600' },
  buttonTextSecondary: { color: colors.muted, fontWeight: '600' },
});

export default CheckoutScreen;
