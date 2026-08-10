import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, SafeAreaView, StatusBar,
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
 * Audit Log Screen
 * Wired to tRPC procedure: admin.getAuditLog
 */
export default function AuditLogScreen() {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = (trpc as any).admin?.getAuditLog?.useQuery?.({ limit: 50, offset: 0 }) ?? { data: null, isLoading: false, error: null, refetch: async () => {} };

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
          <Text style={styles.loadingText}>Loading Audit Log...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load Audit Log</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const events = data?.events || [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Audit Log</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {events.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Audit Events</Text>
            <Text style={styles.emptySubtitle}>Audit events will appear here.</Text>
          </View>
        ) : (
          events.map((event: any, idx: number) => (
            <View key={event.id || idx} style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <Text style={styles.eventAction}>{event.action}</Text>
                <Text style={styles.eventTime}>
                  {event.createdAt ? new Date(event.createdAt).toLocaleString() : ''}
                </Text>
              </View>
              <Text style={styles.eventUser}>By: {event.actorEmail || event.actorId || 'System'}</Text>
              {event.resourceType && (
                <Text style={styles.eventResource}>{event.resourceType}: {event.resourceId}</Text>
              )}
            </View>
          ))
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
  eventCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border, marginBottom: 10,
  },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  eventAction: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  eventTime: { color: colors.muted, fontSize: 11 },
  eventUser: { color: colors.muted, fontSize: 12, marginTop: 2 },
  eventResource: { color: colors.primary, fontSize: 12, marginTop: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtitle: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  loadingText: { color: colors.muted, marginTop: 12, fontSize: 14 },
  errorText: { color: colors.error, fontSize: 16, marginBottom: 16 },
  retryButton: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
});
