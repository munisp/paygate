
import React, { useState } from 'react';
import { View, Text, FlatList, Switch, StyleSheet } from 'react-native';

const RULES = [
  { id: '1', name: 'High Amount Block', condition: 'amount > 500000', action: 'block', enabled: true },
  { id: '2', name: 'Velocity Check', condition: 'tx_count_1h > 10', action: 'flag', enabled: true },
  { id: '3', name: 'Foreign Card Alert', condition: 'card_country != NG', action: 'notify', enabled: false },
];

const ACTION_COLORS: Record<string, string> = { block: '#ef4444', flag: '#f97316', notify: '#3b82f6' };

export default function FraudRuleEngineScreen() {
  const [rules, setRules] = useState(RULES);
  const toggleRule = (id: string) => setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fraud Rule Engine</Text>
      <FlatList
        data={rules}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={[styles.badge, { backgroundColor: ACTION_COLORS[item.action] + '20' }]}>
              <Text style={[styles.badgeText, { color: ACTION_COLORS[item.action] }]}>{item.action.toUpperCase()}</Text>
            </View>
            <Text style={styles.ruleName}>{item.name}</Text>
            <Text style={styles.condition}>{item.condition}</Text>
            <Switch value={item.enabled} onValueChange={() => toggleRule(item.id)} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 8 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  ruleName: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  condition: { fontSize: 12, color: '#64748b', marginBottom: 8 },
});
