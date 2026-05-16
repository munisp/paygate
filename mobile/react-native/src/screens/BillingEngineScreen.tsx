import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity } from 'react-native';
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";

const C = { primary: '#6366F1', bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', muted: '#94A3B8', success: '#10B981', error: '#EF4444', border: '#334155', warning: '#F59E0B' };

/** NGN kobo formatter — 1 NGN = 100 kobo */
const fmtNGN = (kobo: number) => `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

const FALLBACK_CONFIGS = [
  { id: 'starter', tier: 'Starter', description: 'For early-stage merchants', transactionFeePercent: 1.5, flatFeeKobo: 10000, monthlyCapKobo: 500000, features: ['Basic dashboard', 'Standard support', 'Up to 500 txns/day'] },
  { id: 'growth', tier: 'Growth', description: 'For growing businesses', transactionFeePercent: 1.2, flatFeeKobo: 7500, monthlyCapKobo: 2000000, features: ['Advanced analytics', 'Priority support', 'Up to 5,000 txns/day', 'Webhooks'] },
  { id: 'enterprise', tier: 'Enterprise', description: 'For large-scale operations', transactionFeePercent: 0.8, flatFeeKobo: 5000, monthlyCapKobo: 0, features: ['Custom integrations', 'Dedicated support', 'Unlimited txns', 'SLA guarantee'] },
];

type Tab = 'summary' | 'configs' | 'events';

export default function BillingEngineScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [refreshing, setRefreshing] = useState(false);

  // Use auth user id as tenantId — user.id or user.openId mapped to tenantId
  const tenantId = (user?.id ?? user?.openId) || user?.merchantId ?? '';

  const { data: configData, isLoading: configLoading, refetch: refetchConfig } =
    // tRPC: "billing"."getActive" query for active billing config
  (trpc as any).billing?.getActive?.useQuery?.({ tenantId }, { enabled: !!tenantId }) ??
    { data: null, isLoading: false, refetch: async () => {} };

  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } =
    // tRPC: "billing"."listBillingEvents" query for billing event history
  (trpc as any).billing?.listBillingEvents?.useQuery?.({ tenantId, limit: 50 }, { enabled: !!tenantId }) ??
    { data: null, isLoading: false, refetch: async () => {} };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchConfig(), refetchEvents()]);
    setRefreshing(false);
  }, [refetchConfig, refetchEvents]);

  const displayConfigs = (configData as any)?.configs?.length ? (configData as any).configs : FALLBACK_CONFIGS;
  const displayEvents: any[] = (eventsData as any)?.events ?? (eventsData as any)?.data ?? [];

  const today = new Date().toDateString();
  const feesToday = displayEvents.filter((e: any) => new Date(e.createdAt ?? e.timestamp).toDateString() === today).reduce((sum: number, e: any) => sum + Number(e.amountKobo ?? e.amount ?? 0), 0);
  const pendingCount = displayEvents.filter((e: any) => e.status === 'pending').length;
  const activeTiers = displayConfigs.length;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'configs', label: 'Fee Schedules' },
    { key: 'events', label: 'Billing Events' },
  ];

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.header}>
        <Text style={s.title}>Billing Engine</Text>
        {(configLoading || eventsLoading) && <ActivityIndicator color={C.primary} size="small" />}
      </View>
      <View style={s.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity key={tab.key} style={[s.tab, activeTab === tab.key && s.tabActive]} onPress={() => setActiveTab(tab.key)}>
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}>
        {activeTab === 'summary' && (
          <View>
            <View style={s.metricsRow}>
              <View style={s.metricCard}><Text style={s.metricLabel}>Active Tiers</Text><Text style={s.metricValue}>{activeTiers}</Text></View>
              <View style={s.metricCard}><Text style={s.metricLabel}>Fees Today</Text><Text style={s.metricValue}>{fmtNGN(feesToday)}</Text></View>
              <View style={s.metricCard}><Text style={s.metricLabel}>Pending</Text><Text style={s.metricValue}>{pendingCount}</Text></View>
            </View>
            <Text style={s.sectionTitle}>Tier Overview</Text>
            {displayConfigs.map((cfg: any) => (
              <View key={cfg.id ?? cfg.tier} style={s.tierCard}>
                <View style={s.row}><Text style={s.tierName}>{cfg.tier ?? cfg.name}</Text><Text style={s.tierFee}>{cfg.transactionFeePercent ?? 0}%</Text></View>
                <Text style={s.tierDesc}>{cfg.description ?? ''}</Text>
                <Text style={s.tierKobo}>Flat fee: {fmtNGN(cfg.flatFeeKobo ?? 0)} (kobo: {cfg.flatFeeKobo ?? 0})</Text>
                {(cfg.features ?? []).map((f: string, i: number) => <Text key={i} style={s.tierFeature}>• {f}</Text>)}
              </View>
            ))}
          </View>
        )}
        {activeTab === 'configs' && (
          <View>
            <Text style={s.sectionTitle}>Fee Schedules</Text>
            {displayConfigs.map((cfg: any) => (
              <View key={cfg.id ?? cfg.tier} style={s.card}>
                <Text style={s.cardTitle}>{cfg.tier ?? cfg.name}</Text>
                <View style={s.row}><Text style={s.label}>Transaction Fee</Text><Text style={s.value}>{cfg.transactionFeePercent ?? 0}%</Text></View>
                <View style={s.row}><Text style={s.label}>Flat Fee (kobo)</Text><Text style={s.value}>{cfg.flatFeeKobo ?? 0} kobo = {fmtNGN(cfg.flatFeeKobo ?? 0)}</Text></View>
                <View style={s.row}><Text style={s.label}>Monthly Cap</Text><Text style={s.value}>{cfg.monthlyCapKobo ? fmtNGN(cfg.monthlyCapKobo) : 'Unlimited'}</Text></View>
              </View>
            ))}
          </View>
        )}
        {activeTab === 'events' && (
          <View>
            <Text style={s.sectionTitle}>Billing Events</Text>
            {displayEvents.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyIcon}>📋</Text>
                <Text style={s.emptyText}>No billing events yet</Text>
                <Text style={s.emptySubtext}>Events will appear here once transactions are processed</Text>
              </View>
            ) : (
              displayEvents.map((evt: any, idx: number) => (
                <View key={evt.id ?? idx} style={s.card}>
                  <View style={s.row}>
                    <Text style={s.cardTitle}>{evt.eventType ?? evt.type ?? 'Billing Event'}</Text>
                    <View style={[s.badge, { backgroundColor: evt.status === 'settled' ? C.success : C.warning }]}><Text style={s.badgeText}>{evt.status ?? 'pending'}</Text></View>
                  </View>
                  <Text style={s.value}>{fmtNGN(evt.amountKobo ?? evt.amount ?? 0)}</Text>
                  <Text style={s.muted}>{new Date(evt.createdAt ?? evt.timestamp).toLocaleString()}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, marginHorizontal: 2 },
  tabActive: { backgroundColor: C.primary },
  tabText: { fontSize: 12, color: C.muted, fontWeight: '500' },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  metricCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  metricLabel: { fontSize: 11, color: C.muted, marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: '700', color: C.text },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 12 },
  tierCard: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  tierName: { fontSize: 16, fontWeight: '700', color: C.primary },
  tierFee: { fontSize: 18, fontWeight: '800', color: C.text },
  tierDesc: { fontSize: 12, color: C.muted, marginBottom: 6 },
  tierKobo: { fontSize: 11, color: C.muted, marginBottom: 4 },
  tierFeature: { fontSize: 12, color: C.text, marginTop: 2 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  configCard: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  eventCard: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label: { fontSize: 12, color: C.muted },
  value: { fontSize: 13, color: C.text, fontWeight: '500' },
  muted: { fontSize: 11, color: C.muted, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 6 },
  emptySubtext: { fontSize: 13, color: C.muted, textAlign: 'center' },
});
