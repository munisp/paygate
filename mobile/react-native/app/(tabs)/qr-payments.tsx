import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { trpc } from '@/lib/trpc';

// Define the dark theme colors
const Colors = {
  background: '#0f172a',
  card: '#1e293b',
  accent: '#6366f1',
  text: '#f8fafc',
  muted: '#94a3b8',
};

// TypeScript interfaces for QR payment data
interface QrCode {
  id: string;
  code: string; // Base64 encoded QR code image or URL
  amount: number;
  currency: string;
  merchantName: string;
  createdAt: string;
}

interface QrPaymentHistoryItem {
  id: string;
  transactionRef: string;
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed';
  payerName: string;
  createdAt: string;
}

export default function QrPaymentsScreen() {
  const [qrAmount, setQrAmount] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

    const generateQrCodeMutation = trpc.qrPayments.generate.useMutation({
    onSuccess: (data) => {
      Alert.alert("QR Code Generated", `QR Code for ${data.amount} ${data.currency} successfully generated.`);
      qrPaymentsQuery.refetch(); // Refetch history after successful generation
    },
    onError: (error) => {
      Alert.alert("Error", `Failed to generate QR code: ${error.message}`);
    },
  });

  const qrPaymentsQuery = trpc.qrPayments.list.useQuery();

  const filteredHistory = (qrPaymentsQuery.data || []).filter(item =>
    item.transactionRef.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.payerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'QR Payments', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text }} />
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* QR Code Generation Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Generate QR Code</Text>
                    <TextInput
            style={styles.input}
            placeholder="Enter amount (e.g., 1500.00)"
            placeholderTextColor={Colors.muted}
            keyboardType="numeric"
            value={qrAmount}
            onChangeText={setQrAmount}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={() => generateQrCodeMutation.mutate({ amount: parseFloat(qrAmount) || 0, currency: 'NGN' })}
            disabled={generateQrCodeMutation.isPending}
          >
            {generateQrCodeMutation.isPending ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <Text style={styles.buttonText}>Generate QR Code</Text>
            )}
          </TouchableOpacity>

          {generateQrCodeMutation.isError && (
            <Text style={styles.errorText}>Error generating QR: {generateQrCodeMutation.error?.message}</Text>
          )}

          {generateQrCodeMutation.isSuccess && generateQrCodeMutation.data && (
            <View style={styles.qrCodeDisplay}>
              <Text style={styles.qrCodeLabel}>Scan to Pay:</Text>
              {/* In a real app, you'd use an actual QR code library to render this */}
              <View style={styles.qrCodePlaceholder}>
                <Text style={styles.qrCodePlaceholderText}>QR Code for {generateQrCodeMutation.data.amount} {generateQrCodeMutation.data.currency}</Text>
                <Text style={styles.qrCodePlaceholderText}>ID: {generateQrCodeMutation.data.id}</Text>
              </View>
              <Text style={styles.qrCodeDetails}>Merchant: {generateQrCodeMutation.data.merchantName}</Text>
              <Text style={styles.qrCodeDetails}>Generated: {new Date(generateQrCodeMutation.data.createdAt).toLocaleString()}</Text>
            </View>
          )}
        </View>

        {/* QR Payment History Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment History</Text>
                    <TextInput
            style={styles.input}
            placeholder="Search by transaction reference or payer name..."
            placeholderTextColor={Colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          {qrPaymentsQuery.isLoading && <ActivityIndicator size="large" color={Colors.accent} style={styles.loadingIndicator} />}
          {qrPaymentsQuery.isError && (
            <Text style={styles.errorText}>Error loading history: {qrPaymentsQuery.error?.message}</Text>
          )}

          {qrPaymentsQuery.isSuccess && filteredHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No QR payment history found. Time to make some transactions!</Text>
              <Text style={styles.emptyStateText}>Perhaps a customer hasn't scanned your QR code yet, or you're yet to generate one for a transaction.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredHistory}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.historyItem}>
                  <View style={styles.historyItemHeader}>
                    <Text style={styles.historyItemTitle}>Ref: {item.transactionRef}</Text>
                    <Text style={[styles.historyItemStatus, item.status === 'completed' ? styles.statusCompleted : item.status === 'pending' ? styles.statusPending : styles.statusFailed]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.historyItemText}>Amount: {item.currency} {item.amount.toFixed(2)}</Text>
                  <Text style={styles.historyItemText}>Payer: {item.payerName}</Text>
                  <Text style={styles.historyItemText}>Date: {new Date(item.createdAt).toLocaleString()}</Text>
                </View>
              )}
              contentContainerStyle={styles.flatListContent}
            />
          )}

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollViewContent: {
    padding: 16,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.background,
    color: Colors.text,
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: Colors.accent,
    padding: 14,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
  },
  qrCodeDisplay: {
    marginTop: 20,
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 8,
  },
  qrCodeLabel: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  qrCodePlaceholder: {
    width: 200,
    height: 200,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 10,
  },
  qrCodePlaceholderText: {
    color: Colors.muted,
    textAlign: 'center',
  },
  qrCodeDetails: {
    color: Colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  loadingIndicator: {
    marginVertical: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    color: Colors.muted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  flatListContent: {
    paddingBottom: 16,
  },
  historyItem: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.card,
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  historyItemTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyItemText: {
    color: Colors.muted,
    fontSize: 14,
  },
  historyItemStatus: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusCompleted: {
    color: '#22c55e', // green-500
  },
  statusPending: {
    color: '#eab308', // yellow-500
  },
  statusFailed: {
    color: '#ef4444', // red-500
  },
});