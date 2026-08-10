import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { trpc } from '@/lib/trpc';

const C = { bg: '#0f172a', card: '#1e293b', accent: '#6366f1', text: '#f8fafc', muted: '#94a3b8', border: '#334155', success: '#22c55e', error: '#ef4444', warning: '#f59e0b' };

const CURRENCIES = ['USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR'];

export default function FXScreen() {
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [amount, setAmount] = useState('');
  const [toCurrency, setToCurrency] = useState('NGN');

  const { data: ratesData, isLoading } = trpc.fx.getRates.useQuery({ baseCurrency: 'NGN' });
  const { data: historyData } = trpc.fx.getConversionHistory.useQuery({ limit: 10 });
  const convertMutation = trpc.fx.createConversion.useMutation({
    onSuccess: () => { setAmount(''); Alert.alert('Success', 'Conversion created successfully'); },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const rates: any = (ratesData as any)?.rates ?? {};
  const history: any[] = (historyData as any)?.conversions ?? [];

  const getRate = (currency: string) => {
    if (currency === 'NGN') return 1;
    return rates[currency] ?? 0;
  };

  const convertedAmount = amount && getRate(fromCurrency) > 0
    ? (parseFloat(amount) / getRate(fromCurrency)).toFixed(2)
    : '0.00';

  return (
    <View style={s.container}>
      <Text style={s.title}>FX Rates</Text>
      <View style={s.card}>
        <Text style={s.sectionTitle}>Live Rates (vs NGN)</Text>
        {isLoading ? <ActivityIndicator color={C.accent} /> : (
          <View style={s.ratesGrid}>
            {CURRENCIES.map(cur => (
              <TouchableOpacity key={cur} style={[s.rateItem, fromCurrency === cur && s.rateItemActive]}
                onPress={() => setFromCurrency(cur)}>
                <Text style={s.rateCurrency}>{cur}</Text>
                <Text style={s.rateValue}>₦{(getRate(cur)).toLocaleString()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <View style={s.card}>
        <Text style={s.sectionTitle}>Convert</Text>
        <View style={s.convertRow}>
          <TextInput style={[s.input, { flex: 1 }]} placeholder="Amount" placeholderTextColor={C.muted}
            value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <View style={s.currencyBadge}><Text style={s.currencyText}>{fromCurrency}</Text></View>
        </View>
        <View style={s.resultRow}>
          <Text style={s.resultLabel}>= </Text>
          <Text style={s.resultValue}>₦{parseFloat(convertedAmount).toLocaleString()}</Text>
          <Text style={s.resultLabel}> NGN</Text>
        </View>
        <TouchableOpacity style={s.convertBtn}
          onPress={() => convertMutation.mutate({ fromCurrency, toCurrency: 'NGN', amount: parseFloat(amount) || 0 })}
          disabled={!amount || convertMutation.isPending}>
          <Text style={s.convertBtnText}>{convertMutation.isPending ? 'Processing...' : 'Create Conversion'}</Text>
        </TouchableOpacity>
      </View>
      {history.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>Recent Conversions</Text>
          {history.map((item, i) => (
            <View key={i} style={s.historyItem}>
              <Text style={s.historyText}>{item.fromAmount} {item.fromCurrency} → {item.toAmount} {item.toCurrency}</Text>
              <Text style={s.historyDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 16 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '600', marginBottom: 12 },
  ratesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rateItem: { backgroundColor: C.bg, borderRadius: 10, padding: 10, minWidth: '30%', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  rateItemActive: { borderColor: C.accent, backgroundColor: C.accent + '22' },
  rateCurrency: { color: C.muted, fontSize: 12, fontWeight: '600' },
  rateValue: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 4 },
  convertRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { backgroundColor: C.bg, color: C.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: C.border },
  currencyBadge: { backgroundColor: C.accent + '33', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
  currencyText: { color: C.accent, fontWeight: '700', fontSize: 14 },
  resultRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 12 },
  resultLabel: { color: C.muted, fontSize: 14 },
  resultValue: { color: C.success, fontSize: 20, fontWeight: '700' },
  convertBtn: { backgroundColor: C.accent, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  convertBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  historyItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border },
  historyText: { color: C.text, fontSize: 13 },
  historyDate: { color: C.muted, fontSize: 12 },
});
