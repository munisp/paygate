import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import { trpc } from '../lib/trpc';

export default function FXScreen() {
  const [fromCurrency, setFromCurrency] = useState('NGN');
  const [toCurrency, setToCurrency] = useState('USD');
  const [amount, setAmount] = useState('');
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const convertMutation = trpc.fx.convert.useMutation({
    onSuccess: (data) => { setResult(data); setConverting(false); },
    onError: (e) => { Alert.alert('Error', e.message); setConverting(false); },
  });

  const handleConvert = () => {
    if (!amount || isNaN(Number(amount))) { Alert.alert('Invalid', 'Enter a valid amount'); return; }
    setConverting(true);
    setResult(null);
    convertMutation.mutate({ fromCurrency, toCurrency, amount: Number(amount) });
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={s.title}>FX Conversion</Text>
      <View style={s.card}>
        <Text style={s.label}>From Currency</Text>
        <TextInput style={s.input} value={fromCurrency} onChangeText={setFromCurrency} autoCapitalize="characters" maxLength={3} />
        <Text style={s.label}>To Currency</Text>
        <TextInput style={s.input} value={toCurrency} onChangeText={setToCurrency} autoCapitalize="characters" maxLength={3} />
        <Text style={s.label}>Amount</Text>
        <TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#9ca3af" />
        <TouchableOpacity style={s.btn} onPress={handleConvert} disabled={converting}>
          {converting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Convert</Text>}
        </TouchableOpacity>
      </View>
      {result && (
        <View style={s.resultCard}>
          <Text style={s.resultLabel}>Converted Amount</Text>
          <Text style={s.resultAmount}>{(result.convertedAmount ?? 0).toLocaleString()} {result.toCurrency ?? toCurrency}</Text>
          <Text style={s.resultRate}>Rate: 1 {result.fromCurrency ?? fromCurrency} = {(result.rate ?? 0).toFixed(6)} {result.toCurrency ?? toCurrency}</Text>
          {result.fee != null && <Text style={s.resultFee}>Fee: {result.fee} {result.fromCurrency ?? fromCurrency}</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  label: { fontSize: 13, color: '#6b7280', marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb' },
  btn: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  resultCard: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 20, alignItems: 'center' },
  resultLabel: { fontSize: 13, color: '#3b82f6', marginBottom: 8 },
  resultAmount: { fontSize: 28, fontWeight: '800', color: '#1d4ed8', marginBottom: 4 },
  resultRate: { fontSize: 13, color: '#6b7280' },
  resultFee: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
});
