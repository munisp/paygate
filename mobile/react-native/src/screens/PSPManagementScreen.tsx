import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { trpc } from '../lib/trpc';

type Tab = 'velocity' | 'interchange' | 'scheme' | 'str' | 'reports';

export function PSPManagementScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('velocity');

  const { data: limitsData, isLoading: limitsLoading } = trpc.velocityLimits.list.useQuery({ page: 1, pageSize: 20 });
  const { data: scheduleData } = trpc.interchange.getSchedule.useQuery({});
  const { data: schemeData } = trpc.schemeMembership.list.useQuery({});
  const { data: strData } = trpc.str.list.useQuery({ page: 1, pageSize: 20 });
  const { data: reportsData } = trpc.regulatoryReports.list.useQuery({ page: 1, pageSize: 20 });

  const generateReport = trpc.regulatoryReports.generate.useMutation({
    onSuccess: () => Alert.alert('Success', 'Report generation queued'),
    onError: (e) => Alert.alert('Error', e.message),
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'velocity', label: 'Velocity' },
    { key: 'interchange', label: 'Interchange' },
    { key: 'scheme', label: 'Scheme' },
    { key: 'str', label: 'STR' },
    { key: 'reports', label: 'CBN Reports' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PSP Management</Text>
        <Text style={styles.subtitle}>CBN Licence Obligations</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.content}>
        {activeTab === 'velocity' && (
          <View>
            <Text style={styles.sectionTitle}>Sub-Merchant Velocity Limits</Text>
            {limitsLoading && <ActivityIndicator />}
            {limitsData?.limits?.map((limit: any) => (
              <View key={limit.id} style={styles.card}>
                <Text style={styles.cardTitle}>{limit.merchantId}</Text>
                <Text style={styles.cardSubtitle}>
                  {limit.channel.toUpperCase()} · {limit.windowSeconds}s · max {limit.maxCount} txns
                </Text>
                <View style={[styles.badge, limit.isActive ? styles.badgeActive : styles.badgeInactive]}>
                  <Text style={styles.badgeText}>{limit.isActive ? 'Active' : 'Inactive'}</Text>
                </View>
              </View>
            ))}
            {!limitsData?.limits?.length && !limitsLoading && (
              <Text style={styles.emptyText}>No velocity limits configured.</Text>
            )}
          </View>
        )}

        {activeTab === 'interchange' && (
          <View>
            <Text style={styles.sectionTitle}>Interchange Fee Schedule</Text>
            {scheduleData?.schedules?.map((s: any) => (
              <View key={s.id} style={styles.card}>
                <Text style={styles.cardTitle}>{s.network} · {s.cardType}</Text>
                <Text style={styles.cardSubtitle}>
                  {s.feeType === 'percentage' ? `${s.feeValue}%` : `₦${(s.feeValue / 100).toFixed(2)} flat`}
                </Text>
              </View>
            ))}
            {!scheduleData?.schedules?.length && (
              <Text style={styles.emptyText}>No interchange schedules configured.</Text>
            )}
          </View>
        )}

        {activeTab === 'scheme' && (
          <View>
            <Text style={styles.sectionTitle}>Scheme Membership</Text>
            {schemeData?.memberships?.map((m: any) => (
              <View key={m.id} style={styles.card}>
                <Text style={styles.cardTitle}>{m.schemeName} · {m.membershipType}</Text>
                <Text style={styles.cardSubtitle}>BIN: {m.binRangeStart}–{m.binRangeEnd}</Text>
                <View style={[styles.badge, m.status === 'active' ? styles.badgeActive : styles.badgeInactive]}>
                  <Text style={styles.badgeText}>{m.status}</Text>
                </View>
              </View>
            ))}
            {!schemeData?.memberships?.length && (
              <Text style={styles.emptyText}>No scheme memberships registered.</Text>
            )}
          </View>
        )}

        {activeTab === 'str' && (
          <View>
            <Text style={styles.sectionTitle}>Suspicious Transaction Reports</Text>
            <Text style={styles.warningText}>CBN/NFIU requires submission within 24 hours</Text>
            {strData?.reports?.map((r: any) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle}>STR-{r.id.slice(0, 8).toUpperCase()}</Text>
                <Text style={styles.cardSubtitle}>{r.suspiciousActivityType} · ₦{((r.transactionAmountKobo ?? 0) / 100).toLocaleString()}</Text>
                <View style={[styles.badge, r.status === 'submitted' ? styles.badgeActive : styles.badgePending]}>
                  <Text style={styles.badgeText}>{r.status}</Text>
                </View>
              </View>
            ))}
            {!strData?.reports?.length && (
              <Text style={styles.emptyText}>No STRs filed.</Text>
            )}
          </View>
        )}

        {activeTab === 'reports' && (
          <View>
            <Text style={styles.sectionTitle}>CBN Regulatory Reports</Text>
            <View style={styles.buttonRow}>
              {(['form_a', 'form_b', 'form_c'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={styles.generateButton}
                  onPress={() => generateReport.mutate({
                    reportType: type,
                    periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    periodEnd: new Date().toISOString(),
                  })}
                  disabled={generateReport.isPending}
                >
                  <Text style={styles.generateButtonText}>Generate {type.replace('_', ' ').toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {reportsData?.reports?.map((r: any) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle}>{r.reportType.toUpperCase().replace('_', ' ')}</Text>
                <Text style={styles.cardSubtitle}>{new Date(r.createdAt).toLocaleDateString()}</Text>
                <View style={[styles.badge, r.status === 'submitted' ? styles.badgeActive : styles.badgePending]}>
                  <Text style={styles.badgeText}>{r.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#1e293b' },
  title: { fontSize: 24, fontWeight: '700', color: '#f8fafc' },
  subtitle: { fontSize: 14, color: '#94a3b8', marginTop: 4 },
  tabBar: { backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, borderRadius: 20, backgroundColor: '#334155' },
  activeTab: { backgroundColor: '#3b82f6' },
  tabText: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },
  activeTabText: { color: '#fff' },
  content: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#f1f5f9', marginBottom: 12 },
  warningText: { fontSize: 12, color: '#f59e0b', marginBottom: 8 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  cardSubtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginTop: 6 },
  badgeActive: { backgroundColor: '#166534' },
  badgeInactive: { backgroundColor: '#374151' },
  badgePending: { backgroundColor: '#92400e' },
  badgeText: { fontSize: 11, color: '#fff', fontWeight: '500' },
  emptyText: { color: '#64748b', textAlign: 'center', paddingVertical: 24 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  generateButton: { backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  generateButtonText: { color: '#fff', fontSize: 12, fontWeight: '500' },
});
