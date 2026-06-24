/**
 * InsiderThreatScreen — React Native
 * Mirrors the InsiderThreat PWA page with mobile-first UX.
 *
 * Tabs: Dashboard | Alerts | Approvals | Policies
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, StatusBar,
  ActivityIndicator, FlatList, RefreshControl, Alert,
  TouchableOpacity, ScrollView, Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
  critical: '#DC2626', high: '#EA580C', medium: '#D97706', low: '#16A34A',
};

type Tab = 'dashboard' | 'alerts' | 'approvals' | 'policies';

const riskColor = (score: number) => {
  if (score >= 80) return COLORS.critical;
  if (score >= 60) return COLORS.high;
  if (score >= 40) return COLORS.medium;
  return COLORS.low;
};

const statusColor = (status: string) => {
  switch (status) {
    case 'open': return COLORS.error;
    case 'acknowledged': return COLORS.warning;
    case 'resolved': return COLORS.success;
    case 'false_positive': return COLORS.muted;
    default: return COLORS.muted;
  }
};

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab() {
  const { data: stats, isLoading } = trpc.insiderThreat.getStats.useQuery(undefined, { staleTime: 30_000 });

  if (isLoading) return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />;

  const controls = [
    { label: 'Session Binding', key: 'session_binding', desc: 'Detects session hijacking via fingerprint mismatch' },
    { label: 'Velocity Gate', key: 'velocity_gate', desc: 'Blocks excessive privileged action rates' },
    { label: '4-Eyes Approval', key: 'four_eyes', desc: 'Requires dual-control for critical operations' },
    { label: 'UEBA Scoring', key: 'ueba', desc: 'ML-based behavioural anomaly detection' },
    { label: 'Geo Anomaly', key: 'geo_anomaly', desc: 'Flags logins from unexpected countries' },
    { label: 'Off-Hours Alert', key: 'off_hours', desc: 'Detects access outside business hours' },
  ];

  return (
    <ScrollView style={styles.tabContent}>
      <View style={styles.statsRow}>
        <StatCard label="Open Alerts" value={stats?.openAlerts ?? 0} color={COLORS.error} />
        <StatCard label="Pending Approval" value={stats?.pendingApprovals ?? 0} color={COLORS.warning} />
        <StatCard label="Avg Risk Score" value={stats?.avgRiskScore ?? 0} color={COLORS.primary} />
      </View>
      <Text style={styles.sectionTitle}>Security Controls</Text>
      {controls.map((c) => (
        <View key={c.key} style={styles.controlCard}>
          <View style={styles.controlDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.controlLabel}>{c.label}</Text>
            <Text style={styles.controlDesc}>{c.desc}</Text>
          </View>
          <View style={[styles.activeBadge, { backgroundColor: COLORS.success + '22' }]}>
            <Text style={[styles.activeBadgeText, { color: COLORS.success }]}>Active</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Alerts Tab ───────────────────────────────────────────────────────────────
function AlertsTab() {
  const { data, isLoading, refetch } = trpc.insiderThreat.listAlerts.useQuery(
    { status: 'open', limit: 50 },
    { staleTime: 15_000 }
  );
  const acknowledge = trpc.insiderThreat.acknowledgeAlert.useMutation({ onSuccess: () => refetch() });
  const resolve = trpc.insiderThreat.resolveAlert.useMutation({ onSuccess: () => refetch() });

  const alerts = data?.alerts ?? [];

  const handleAcknowledge = (id: string) => {
    Alert.alert('Acknowledge Alert', 'Mark this alert as acknowledged?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Acknowledge', onPress: () => acknowledge.mutate({ alertId: id }) },
    ]);
  };

  const handleResolve = (id: string) => {
    Alert.alert('Resolve Alert', 'Mark this alert as resolved?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', onPress: () => resolve.mutate({ alertId: id }) },
    ]);
  };

  if (isLoading) return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <FlatList
      data={alerts}
      keyExtractor={(item: any) => item.id}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={COLORS.primary} />}
      contentContainerStyle={styles.tabContent}
      ListEmptyComponent={<Text style={styles.emptyText}>No open alerts</Text>}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <View style={[styles.riskBadge, { backgroundColor: riskColor(item.riskScore) + '22' }]}>
              <Text style={[styles.riskText, { color: riskColor(item.riskScore) }]}>
                Risk {item.riskScore}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '22' }]}>
              <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                {item.status}
              </Text>
            </View>
          </View>
          <Text style={styles.alertTitle}>{item.alertType?.replace(/_/g, ' ')}</Text>
          <Text style={styles.alertActor}>Actor: {item.actorId}</Text>
          <Text style={styles.alertTime}>{new Date(item.createdAt).toLocaleString()}</Text>
          {item.status === 'open' && (
            <View style={styles.alertActions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.warning + '22' }]}
                onPress={() => handleAcknowledge(item.id)}
              >
                <Text style={[styles.actionBtnText, { color: COLORS.warning }]}>Acknowledge</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: COLORS.success + '22' }]}
                onPress={() => handleResolve(item.id)}
              >
                <Text style={[styles.actionBtnText, { color: COLORS.success }]}>Resolve</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    />
  );
}

// ─── Approvals Tab ────────────────────────────────────────────────────────────
function ApprovalsTab() {
  const { data, isLoading, refetch } = trpc.insiderThreat.listPendingApprovals.useQuery(undefined, { staleTime: 15_000 });
  const approve = trpc.insiderThreat.approveAction.useMutation({ onSuccess: () => refetch() });
  const reject = trpc.insiderThreat.rejectAction.useMutation({ onSuccess: () => refetch() });

  const pending = data?.approvals ?? [];

  const handleApprove = (requestId: string) => {
    Alert.alert('Approve Action', 'Approve this privileged action?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => approve.mutate({ requestId }) },
    ]);
  };

  const handleReject = (requestId: string) => {
    Alert.alert('Reject Action', 'Reject this privileged action?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => reject.mutate({ requestId, reason: 'Rejected by mobile operator' }) },
    ]);
  };

  if (isLoading) return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <FlatList
      data={pending}
      keyExtractor={(item: any) => item.requestId}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={COLORS.primary} />}
      contentContainerStyle={styles.tabContent}
      ListEmptyComponent={<Text style={styles.emptyText}>No pending approvals</Text>}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.approvalCard}>
          <Text style={styles.approvalAction}>{item.action?.replace(/_/g, ' ')}</Text>
          <Text style={styles.approvalActor}>Requested by: {item.actorId}</Text>
          <Text style={styles.approvalTime}>{new Date(item.createdAt).toLocaleString()}</Text>
          <View style={styles.alertActions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.success + '22' }]}
              onPress={() => handleApprove(item.requestId)}
            >
              <Text style={[styles.actionBtnText, { color: COLORS.success }]}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.error + '22' }]}
              onPress={() => handleReject(item.requestId)}
            >
              <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    />
  );
}

// ─── Policies Tab ─────────────────────────────────────────────────────────────
function PoliciesTab() {
  const { data, isLoading, refetch } = trpc.insiderThreat.listPolicies.useQuery(undefined, { staleTime: 60_000 });
  const updatePolicy = trpc.insiderThreat.updatePolicy.useMutation({ onSuccess: () => refetch() });

  const policies = data?.policies ?? [];

  if (isLoading) return <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />;

  return (
    <FlatList
      data={policies}
      keyExtractor={(item: any) => item.id}
      contentContainerStyle={styles.tabContent}
      renderItem={({ item }: { item: any }) => (
        <View style={styles.policyCard}>
          <View style={styles.policyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.policyName}>{item.name}</Text>
              <Text style={styles.policyDesc}>{item.description}</Text>
              <Text style={styles.policyVerdict}>Verdict: {item.verdict}</Text>
            </View>
            <Switch
              value={item.enabled}
              onValueChange={(val) => updatePolicy.mutate({ policyId: item.id, enabled: val })}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={item.enabled ? '#fff' : COLORS.muted}
            />
          </View>
        </View>
      )}
    />
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function InsiderThreatScreen() {
  const navigation = useNavigation();
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'policies', label: 'Policies' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Insider Threat</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>LIVE</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'alerts' && <AlertsTab />}
      {tab === 'approvals' && <ApprovalsTab />}
      {tab === 'policies' && <PoliciesTab />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { marginRight: 12 },
  backText: { color: COLORS.primary, fontSize: 15 },
  headerTitle: { flex: 1, color: COLORS.text, fontSize: 18, fontWeight: '700' },
  headerBadge: { backgroundColor: COLORS.error + '22', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  headerBadgeText: { color: COLORS.error, fontSize: 11, fontWeight: '700' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabLabel: { color: COLORS.muted, fontSize: 13, fontWeight: '500' },
  tabLabelActive: { color: COLORS.primary, fontWeight: '700' },
  tabContent: { padding: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, padding: 14, borderTopWidth: 3 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  controlCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginBottom: 8, gap: 12 },
  controlDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  controlLabel: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  controlDesc: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  activeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { fontSize: 11, fontWeight: '600' },
  alertCard: { backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginBottom: 10 },
  alertHeader: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  riskBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  riskText: { fontSize: 12, fontWeight: '700' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  alertTitle: { color: COLORS.text, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  alertActor: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  alertTime: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  alertActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  approvalCard: { backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginBottom: 10 },
  approvalAction: { color: COLORS.text, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  approvalActor: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  approvalTime: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  policyCard: { backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginBottom: 10 },
  policyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  policyName: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  policyDesc: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  policyVerdict: { color: COLORS.primary, fontSize: 12, marginTop: 4, fontWeight: '500' },
  emptyText: { color: COLORS.muted, textAlign: 'center', marginTop: 40, fontSize: 14 },
});
