import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { trpc } from '@/lib/trpc';

// Matches the real settlements row (settlements.list returns { rows, total }).
interface Settlement {
  id: string;
  reference: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: number;
  currency: string;
  initiatedAt: string | Date | null;
  createdAt: string | Date;
}

export default function SettlementsScreen() {
  const [searchText, setSearchText] = useState('');
  const [isInitiateModalVisible, setInitiateModalVisible] = useState(false);
  const [initiateAmount, setInitiateAmount] = useState('');
  const [initiateCurrency, setInitiateCurrency] = useState('NGN'); // Default to NGN

  // settlements.list takes { limit, offset, status? } and returns { rows, total }.
  const { data: settlementsResult, isLoading, isError, error, refetch } = trpc.settlements.list.useQuery({});
  const settlements = (settlementsResult?.rows ?? []) as Settlement[];

  // Server proc is settlements.create { amount: int >= 100 (kobo), currency }.
  const initiateSettlementMutation = trpc.settlements.create.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'Settlement initiated successfully! Your funds are on their way.');
      setInitiateModalVisible(false);
      setInitiateAmount('');
      refetch(); // Refetch the list to show the new settlement
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to initiate settlement: ${err.message}. Please try again or contact support.`);
    },
  });

  // Filter settlements based on search text
  const filteredSettlements = settlements.filter(s =>
    s.reference.toLowerCase().includes(searchText.toLowerCase()) ||
    s.status.toLowerCase().includes(searchText.toLowerCase()) ||
    s.currency.toLowerCase().includes(searchText.toLowerCase())
  );

  // Handle initiation of settlement (amount entered in naira, sent in kobo;
  // server requires an integer >= 100).
  const handleInitiateSettlement = () => {
    const naira = parseFloat(initiateAmount);
    if (isNaN(naira) || naira <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive amount for settlement.');
      return;
    }
    const amount = Math.round(naira * 100);
    if (amount < 100) {
      Alert.alert('Invalid Amount', 'Minimum settlement amount is ₦1.00 (100 kobo).');
      return;
    }
    initiateSettlementMutation.mutate({ amount, currency: initiateCurrency });
  };

  // Render each settlement item in the FlatList
  const renderSettlementItem = ({ item }: { item: Settlement }) => (
    <TouchableOpacity style={styles.card} onPress={() => Alert.alert('Settlement Details', `Reference: ${item.reference}\nStatus: ${item.status}\nAmount: ${item.currency} ${(item.amount / 100).toLocaleString()}\nDate: ${new Date(item.initiatedAt ?? item.createdAt).toLocaleDateString()}`)}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Ref: {item.reference}</Text>
        <Text style={[styles.cardStatus, item.status === 'completed' ? styles.statusCompleted : item.status === 'pending' || item.status === 'processing' ? styles.statusPending : styles.statusFailed]}>
          {item.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.cardText}>Amount: {item.currency} {(item.amount / 100).toLocaleString()}</Text>
      <Text style={styles.cardText}>Date: {new Date(item.initiatedAt ?? item.createdAt).toLocaleDateString()}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Settlements' }} />

      <TextInput
        style={styles.searchInput}
        placeholder="Search by Batch ID, Status, or Date..."
        placeholderTextColor={styles.mutedText.color}
        value={searchText}
        onChangeText={setSearchText}
      />

      <TouchableOpacity style={styles.initiateButton} onPress={() => setInitiateModalVisible(true)}>
        <Text style={styles.initiateButtonText}>Initiate New Settlement</Text>
      </TouchableOpacity>

      {isLoading ? (
        <View style={styles.centeredMessage}>
          <ActivityIndicator size="large" color={styles.accent.color} />
          <Text style={styles.text}>Fetching settlement batches from the central bank...</Text>
        </View>
      ) : isError ? (
        <View style={styles.centeredMessage}>
          <Text style={styles.errorText}>Error: {error?.message || 'Failed to load settlements. Please check your network connection.'}</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredSettlements.length > 0 ? (
        <FlatList
          data={filteredSettlements}
          keyExtractor={(item) => item.id}
          renderItem={renderSettlementItem}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.centeredMessage}>
          <Text style={styles.text}>No settlement batches found.</Text>
          <Text style={styles.mutedText}>It looks like your transactions are still pending or you haven't initiated any settlements yet. Time to get those Naira moving!</Text>
        </View>
      )}

      {/* Initiate Settlement Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isInitiateModalVisible}
        onRequestClose={() => setInitiateModalVisible(!isInitiateModalVisible)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Initiate New Settlement</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Amount (e.g., 50000.00)"
              placeholderTextColor={styles.mutedText.color}
              keyboardType="numeric"
              value={initiateAmount}
              onChangeText={setInitiateAmount}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Currency (e.g., NGN)"
              placeholderTextColor={styles.mutedText.color}
              value={initiateCurrency}
              onChangeText={setInitiateCurrency}
              autoCapitalize="characters"
              maxLength={3}
            />
            <View style={styles.modalButtonContainer}>
              <Pressable
                style={[styles.modalButton, styles.buttonClose]}
                onPress={() => setInitiateModalVisible(!isInitiateModalVisible)}
              >
                <Text style={styles.textStyle}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.buttonInitiate, initiateSettlementMutation.isLoading && styles.buttonDisabled]}
                onPress={handleInitiateSettlement}
                disabled={initiateSettlementMutation.isLoading}
              >
                {initiateSettlementMutation.isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.textStyle}>Initiate Settlement</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Stylesheet for a consistent dark theme
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  searchInput: {
    height: 40,
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    color: '#f8fafc',
    backgroundColor: '#1e293b',
  },
  initiateButton: {
    backgroundColor: '#6366f1',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  initiateButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardStatus: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  statusCompleted: {
    backgroundColor: '#16a34a',
    color: '#dcfce7',
  },
  statusPending: {
    backgroundColor: '#f59e0b',
    color: '#fffbeb',
  },
  statusFailed: {
    backgroundColor: '#ef4444',
    color: '#fee2e2',
  },
  cardText: {
    color: '#f8fafc',
    fontSize: 14,
    marginBottom: 4,
  },
  centeredMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    color: '#f8fafc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  mutedText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalView: {
    margin: 20,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '80%',
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalInput: {
    height: 50,
    borderColor: '#0f172a',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    width: '100%',
    color: '#f8fafc',
    backgroundColor: '#0f172a',
    fontSize: 16,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  modalButton: {
    borderRadius: 8,
    padding: 12,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  buttonClose: {
    backgroundColor: '#94a3b8',
  },
  buttonInitiate: {
    backgroundColor: '#6366f1',
  },
  buttonDisabled: {
    backgroundColor: '#4f46e5',
    opacity: 0.7,
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  accent: {
    color: '#6366f1',
  },
});
