import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { trpc } from '@/lib/trpc';

const C = { bg: '#0f172a', card: '#1e293b', accent: '#6366f1', text: '#f8fafc', muted: '#94a3b8', border: '#334155', success: '#22c55e', error: '#ef4444', warning: '#f59e0b' };

const STATUS_COLORS: Record<string, string> = {
  approved: C.success, verified: C.success, passed: C.success,
  pending: C.warning, under_review: C.warning, submitted: C.warning,
  rejected: C.error, failed: C.error, expired: C.error,
};

export default function ComplianceScreen() {
  const [activeTab, setActiveTab] = useState<'kyc' | 'kyb' | 'aml'>('kyc');
  const { data, isLoading } = trpc.compliance.listItems.useQuery({ category: activeTab });
  const items: any[] = (data as any)?.items ?? [];

  return (
    <View style={s.container}>
      <Text style={s.title}>Compliance</Text>
      <View style={s.tabs}>
        {(['kyc', 'kyb', 'aml'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[s.tab, activeTab === tab && s.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{tab.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {isLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          {items.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyText}>No {activeTab.toUpperCase()} items</Text></View>
          ) : items.map((item, i) => (
            <View key={i} style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.itemName}>{item.name ?? item.checkType ?? item.type}</Text>
                <View style={[s.badge, { backgroundColor: (STATUS_COLORS[item.status] ?? C.muted) + '22' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLORS[item.status] ?? C.muted }]}>{item.status}</Text>
                </View>
              </View>
              {item.description && <Text style={s.itemDesc}>{item.description}</Text>}
              {item.expiresAt && <Text style={s.itemMeta}>Expires: {new Date(item.expiresAt).toLocaleDateString()}</Text>}
              {item.documentUrl && (
                <View style={[s.badge, { backgroundColor: C.accent + '22', alignSelf: 'flex-start', marginTop: 8 }]}>
                  <Text style={[s.badgeText, { color: C.accent }]}>Document attached</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 16 },
  tabs: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 10, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: C.accent },
  tabText: { color: C.muted, fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { color: C.text, fontSize: 15, fontWeight: '600', flex: 1 },
  itemDesc: { color: C.muted, fontSize: 13, marginTop: 6 },
  itemMeta: { color: C.muted, fontSize: 12, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: C.muted, fontSize: 15 },
});
