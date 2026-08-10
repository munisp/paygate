import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { trpc } from '@/lib/trpc';

interface Transfer {
  id: string;
  senderName: string;
  recipientName: string;
  amount: number;
  currency: string;
  corridor: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export default function CrossBorderScreen() {
  const [searchText, setSearchText] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTransferSender, setNewTransferSender] = useState('');
  const [newTransferRecipient, setNewTransferRecipient] = useState('');
  const [newTransferAmount, setNewTransferAmount] = useState('');
  const [newTransferCurrency, setNewTransferCurrency] = useState('');
  const [newTransferCorridor, setNewTransferCorridor] = useState('');

  const { data: transfers, isLoading, isError, error, refetch } = trpc.crossBorder.listTransfers.useQuery();
  const createTransferMutation = trpc.crossBorder.createTransfer.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'International transfer initiated successfully!');
      refetch();
      setShowCreateForm(false);
      setNewTransferSender('');
      setNewTransferRecipient('');
      setNewTransferAmount('');
      setNewTransferCurrency('');
      setNewTransferCorridor('');
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to initiate transfer: ${err.message}`);
    },
  });

  const filteredTransfers = transfers?.filter(transfer =>
    transfer.senderName.toLowerCase().includes(searchText.toLowerCase()) ||
    transfer.recipientName.toLowerCase().includes(searchText.toLowerCase()) ||
    transfer.corridor.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateTransfer = () => {
    if (!newTransferSender || !newTransferRecipient || !newTransferAmount || !newTransferCurrency || !newTransferCorridor) {
      Alert.alert('Validation Error', 'All fields are required.');
      return;
    }
    createTransferMutation.mutate({
      senderName: newTransferSender,
      recipientName: newTransferRecipient,
      amount: parseFloat(newTransferAmount),
      currency: newTransferCurrency,
      corridor: newTransferCorridor,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Fetching your international transfers, please wait...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Oops! An error occurred: {error.message}</Text>
        <Text style={styles.errorText}>Could not load international transfers. Please check your network and try again.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'International Transfers' }} />

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search transfers by sender, recipient, or corridor..."
          placeholderTextColor={colors.muted}
          value={searchText}
          onChangeText={setSearchText}
        />

        <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateForm(!showCreateForm)}>
          <Text style={styles.createButtonText}>{showCreateForm ? 'Hide Form' : 'Initiate New Transfer'}</Text>
        </TouchableOpacity>

        {showCreateForm && (
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>New International Transfer</Text>
            <TextInput
              style={styles.input}
              placeholder="Sender Name (e.g., Bola Ahmed)"
              placeholderTextColor={colors.muted}
              value={newTransferSender}
              onChangeText={setNewTransferSender}
            />
            <TextInput
              style={styles.input}
              placeholder="Recipient Name (e.g., John Doe)"
              placeholderTextColor={colors.muted}
              value={newTransferRecipient}
              onChangeText={setNewTransferRecipient}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount (e.g., 50000)"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={newTransferAmount}
              onChangeText={setNewTransferAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (e.g., USD, GBP)"
              placeholderTextColor={colors.muted}
              value={newTransferCurrency}
              onChangeText={setNewTransferCurrency}
            />
            <TextInput
              style={styles.input}
              placeholder="Corridor (e.g., NGN-USD, NGN-GBP)"
              placeholderTextColor={colors.muted}
              value={newTransferCorridor}
              onChangeText={setNewTransferCorridor}
            />
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleCreateTransfer}
              disabled={createTransferMutation.isLoading}
            >
              {createTransferMutation.isLoading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.submitButtonText}>Submit Transfer</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {filteredTransfers && filteredTransfers.length > 0 ? (
          <FlatList
            data={filteredTransfers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Transfer ID: {item.id}</Text>
                <Text style={styles.cardText}>From: {item.senderName}</Text>
                <Text style={styles.cardText}>To: {item.recipientName}</Text>
                <Text style={styles.cardText}>Amount: {item.amount} {item.currency}</Text>
                <Text style={styles.cardText}>Corridor: {item.corridor}</Text>
                <Text style={styles.cardText}>Status: <Text style={{ color: item.status === 'completed' ? 'green' : item.status === 'failed' ? 'red' : colors.muted }}>{item.status}</Text></Text>
                <Text style={styles.cardText}>Date: {new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>
            )}
            contentContainerStyle={styles.flatListContent}
          />
        ) : (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateText}>No international transfers found.</Text>
            <Text style={styles.emptyStateText}>Time to expand your global reach! Initiate a new transfer to get started.</Text>
            <Text style={styles.emptyStateText}>Perhaps you're looking to send funds to a business partner in Ghana or a loved one in the UK?</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const colors = {
  background: '#0f172a',
  card: '#1e293b',
  accent: '#6366f1',
  text: '#f8fafc',
  muted: '#94a3b8',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  scrollViewContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.text,
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
  },
  retryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: colors.card,
    color: colors.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 16,
  },
  createButton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  createButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  formContainer: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  formTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.background,
    color: colors.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  flatListContent: {
    // No specific styles needed here, cards handle spacing
  },
  card: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  cardText: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 4,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyStateText: {
    color: colors.muted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 24,
  },
});
