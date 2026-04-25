// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://paygate.manus.space';

export default function QRPaymentsScreen() {
  const [qrCodes, setQrCodes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadQRCodes = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/trpc/qrPayments.list?input={"limit":50}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setQrCodes(d?.result?.data?.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadQRCodes(); }, []);

  const generateQR = () => {
    fetch(`${API_BASE}/api/trpc/qrPayments.generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ json: { amount: 1000, currency: 'NGN', description: 'Mobile QR Payment' } }),
    }).then(r => r.json()).then(() => { Alert.alert('Success', 'QR code generated'); loadQRCodes(); }).catch(() => Alert.alert('Error', 'Failed to generate QR code'));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>QR Payments</Text>
        <TouchableOpacity style={styles.btn} onPress={generateQR}>
          <Text style={styles.btnText}>+ Generate QR</Text>
        </TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} /> : (
        <FlatList
          data={qrCodes}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }: any) => (
            <View style={styles.card}>
              <Text style={styles.ref}>{item.qrCode || item.id}</Text>
              <Text style={styles.amount}>₦{Number(item.amount || 0).toLocaleString()}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No QR codes yet. Generate one above.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#f1f5f9' },
  btn: { backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12 },
  ref: { fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' },
  amount: { fontSize: 20, fontWeight: '700', color: '#f1f5f9', marginTop: 4 },
  status: { fontSize: 13, color: '#6366f1', marginTop: 6, textTransform: 'capitalize' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40 },
});
