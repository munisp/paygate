import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
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

/**
 * Merchant Management Screen
 * Auto-generated parity screen for PayGate Merchant Portal mobile app.
 * Wired to tRPC procedure: admin.getMerchants
 */
export default function AdminMerchantManagementScreen() {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = (trpc as any)['admin']?.['getMerchants']?.useQuery?.() ?? { data: null, isLoading: false, error: null, refetch: async () => {} };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading Merchant Management...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load Merchant Management</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Merchant Management</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        accessibilityLabel="Merchant Management content"
      >
        {data ? (
          <View style={styles.card}>
            <Text style={styles.cardText}>
              {JSON.stringify(data, null, 2)}
            </Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Merchant Management Data</Text>
            <Text style={styles.emptySubtitle}>
              Data will appear here once available.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { padding: 8 },
  backText: { color: colors.primary, fontSize: 16 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  content: { flex: 1, padding: 16 },
  card: {
    backgroundColor: colors.card, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
  cardText: { color: colors.text, fontSize: 12, fontFamily: 'monospace' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtitle: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  loadingText: { color: colors.muted, marginTop: 12, fontSize: 14 },
  errorText: { color: colors.error, fontSize: 16, marginBottom: 16 },
  retryButton: {
    backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
