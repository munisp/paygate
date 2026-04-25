import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert } from 'react-native';

const PAIRS = [
  { pair: 'USD/NGN', rate: 1580.50, change: +0.32, bid: 1578.00, ask: 1583.00 },
  { pair: 'EUR/NGN', rate: 1720.25, change: -0.15, bid: 1718.00, ask: 1722.50 },
  { pair: 'GBP/NGN', rate: 2010.75, change: +0.48, bid: 2008.00, ask: 2013.50 },
  { pair: 'CNY/NGN', rate: 217.80, change: +0.12, bid: 217.50, ask: 218.10 },
  { pair: 'INR/NGN', rate: 18.95, change: -0.08, bid: 18.90, ask: 19.00 },
  { pair: 'BRL/NGN', rate: 282.40, change: +0.22, bid: 282.00, ask: 282.80 },
];

export default function FXDashboardScreen() {
  const [fromAmount, setFromAmount] = useState('');
  const [selectedPair, setSelectedPair] = useState(PAIRS[0]);

  const converted = fromAmount ? (parseFloat(fromAmount) * selectedPair.rate).toFixed(2) : '';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FX Dashboard</Text>

      {/* Converter */}
      <View style={styles.converter}>
        <Text style={styles.converterTitle}>Quick Convert</Text>
        <View style={styles.converterRow}>
          <TextInput
            style={styles.input}
            placeholder="Amount (USD)"
            keyboardType="numeric"
            value={fromAmount}
            onChangeText={setFromAmount}
          />
          <Text style={styles.arrow}>→</Text>
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{converted || '0.00'} NGN</Text>
          </View>
        </View>
        <Text style={styles.rateHint}>Rate: 1 USD = {selectedPair.rate} NGN</Text>
      </View>

      {/* Rates */}
      <Text style={styles.sectionTitle}>Live Rates</Text>
      <FlatList
        data={PAIRS}
        keyExtractor={p => p.pair}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.rateCard, selectedPair.pair === item.pair && styles.rateCardSelected]}
            onPress={() => { setSelectedPair(item); Alert.alert(item.pair, `Bid: ${item.bid}\nAsk: ${item.ask}\nMid: ${item.rate}`); }}
          >
            <View style={styles.rateRow}>
              <Text style={styles.pair}>{item.pair}</Text>
              <Text style={[styles.change, { color: item.change >= 0 ? '#16a34a' : '#dc2626' }]}>
                {item.change >= 0 ? '+' : ''}{item.change}%
              </Text>
            </View>
            <Text style={styles.rate}>{item.rate.toFixed(2)}</Text>
            <View style={styles.bidAsk}>
              <Text style={styles.bidAskText}>Bid: {item.bid}</Text>
              <Text style={styles.bidAskText}>Ask: {item.ask}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  converter: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  converterTitle: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 10 },
  converterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 14 },
  arrow: { fontSize: 18, color: '#6366f1', fontWeight: '700' },
  resultBox: { flex: 1, backgroundColor: '#eff6ff', borderRadius: 8, padding: 10, alignItems: 'center' },
  resultText: { fontSize: 14, fontWeight: '600', color: '#1d4ed8' },
  rateHint: { fontSize: 11, color: '#94a3b8', marginTop: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  rateCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, borderWidth: 1, borderColor: '#e2e8f0' },
  rateCardSelected: { borderColor: '#6366f1', backgroundColor: '#f5f3ff' },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  pair: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  change: { fontSize: 13, fontWeight: '600' },
  rate: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  bidAsk: { flexDirection: 'row', gap: 16 },
  bidAskText: { fontSize: 11, color: '#64748b' },
});
