import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, FlatList, StyleSheet, ActivityIndicator, Alert, Modal, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { trpc } from '@/lib/trpc';

type VirtualCard = {
  id: string;
  last4: string;
  status: 'active' | 'frozen';
  cardHolderName: string;
  balance: number;
  currency: string;
};

export default function VirtualCardsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [newCardHolderName, setNewCardHolderName] = useState('');
  const [newCardBalance, setNewCardBalance] = useState('');
  const [newCardCurrency, setNewCardCurrency] = useState('NGN'); // Default currency
  const { data: virtualCards, isLoading, error, refetch } = trpc.virtualCards.list.useQuery();
  const createCardMutation = trpc.virtualCards.create.useMutation();
  const freezeCardMutation = trpc.virtualCards.freeze.useMutation();

  const handleCreateCard = async () => {
    if (!newCardHolderName || !newCardBalance) {
      Alert.alert('Missing Information', 'Please provide both card holder name and initial balance.');
      return;
    }
    try {
      await createCardMutation.mutateAsync({
        cardHolderName: newCardHolderName,
        balance: parseFloat(newCardBalance),
        currency: newCardCurrency,
      });
      Alert.alert('Success', 'Virtual card created successfully!');
      setCreateModalVisible(false);
      setNewCardHolderName('');
      setNewCardBalance('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', `Failed to create card: ${err.message}`);
    }
  };

  const handleToggleFreeze = async (cardId: string, currentStatus: 'active' | 'frozen') => {
    try {
      await freezeCardMutation.mutateAsync({
        cardId,
        freeze: currentStatus === 'active',
      });
      Alert.alert('Success', `Card ${currentStatus === 'active' ? 'frozen' : 'unfrozen'} successfully!`);
      refetch();
    } catch (err: any) {
      Alert.alert('Error', `Failed to toggle card status: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Fetching your virtual cards, please wait...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error loading virtual cards: {error.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const filteredCards = virtualCards?.filter(card =>
    card.cardHolderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    card.last4.includes(searchQuery)
  ) || [];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Virtual Cards' }} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search cards by name or last 4 digits..."
        placeholderTextColor="#94a3b8"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {filteredCards.length === 0 && !isLoading && !error ? (
        <View style={styles.centered}>
          <Text style={styles.emptyStateText}>No virtual cards found. Perhaps you should create one to start managing your finances like a true Lagosian!</Text>
          <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
            <Text style={styles.createButtonText}>Create New Card</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredCards}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.cardItem}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>**** **** **** {item.last4}</Text>
                <Text style={[styles.cardStatus, item.status === 'frozen' ? styles.frozenStatus : styles.activeStatus]}>
                  {item.status === 'active' ? 'Active' : 'Frozen'}
                </Text>
              </View>
              <Text style={styles.cardHolder}>Holder: {item.cardHolderName}</Text>
              <Text style={styles.cardBalance}>Balance: {item.currency} {item.balance.toFixed(2)}</Text>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleToggleFreeze(item.id, item.status)}
                  disabled={freezeCardMutation.isLoading}
                >
                  {freezeCardMutation.isLoading ? (
                    <ActivityIndicator color="#f8fafc" />
                  ) : (
                    <Text style={styles.actionButtonText}>{item.status === 'active' ? 'Freeze' : 'Unfreeze'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setCreateModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>

    <Modal
      animationType="slide"
      transparent={true}
      visible={isCreateModalVisible}
      onRequestClose={() => {
        setCreateModalVisible(!isCreateModalVisible);
      }}>
      <View style={styles.centered}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>Create New Virtual Card</Text>
          <TextInput
            style={styles.input}
            placeholder="Card Holder Name (e.g., Emeka Obi)"
            placeholderTextColor="#94a3b8"
            value={newCardHolderName}
            onChangeText={setNewCardHolderName}
          />
          <TextInput
            style={styles.input}
            placeholder="Initial Balance (e.g., 50000.00)"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            value={newCardBalance}
            onChangeText={setNewCardBalance}
          />
          {/* Currency selection could be a Picker, but for simplicity, defaulting to NGN */}
          <TextInput
            style={styles.input}
            placeholder="Currency (e.g., NGN)"
            placeholderTextColor="#94a3b8"
            value={newCardCurrency}
            onChangeText={setNewCardCurrency}
            editable={false} // For now, keep it fixed to NGN
          />
          <View style={styles.buttonContainer}>
            <Pressable
              style={[styles.button, styles.buttonOpen]}
              onPress={handleCreateCard}
              disabled={createCardMutation.isLoading}>
              {createCardMutation.isLoading ? (
                <ActivityIndicator color="#f8fafc" />
              ) : (
                <Text style={styles.textStyle}>Create Card</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonClose]}
              onPress={() => setCreateModalVisible(!isCreateModalVisible)}>
              <Text style={styles.textStyle}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#f8fafc',
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#f8fafc',
    fontSize: 16,
  },
  searchInput: {
    height: 40,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 15,
    color: '#f8fafc',
    marginBottom: 15,
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 80, // To make space for FAB
  },
  cardItem: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  activeStatus: {
    backgroundColor: '#22c55e',
    color: '#f8fafc',
  },
  frozenStatus: {
    backgroundColor: '#ef4444',
    color: '#f8fafc',
  },
  cardHolder: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 5,
  },
  cardBalance: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyStateText: {
    color: '#94a3b8',
    fontSize: 18,
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    right: 30,
    bottom: 30,
    backgroundColor: '#6366f1',
    borderRadius: 30,
    elevation: 8,
  },
  fabText: {
    fontSize: 30,
    color: '#f8fafc',
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
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  input: {
    height: 50,
    width: '100%',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 10,
    color: '#f8fafc',
    backgroundColor: '#0f172a',
    fontSize: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  button: {
    borderRadius: 8,
    padding: 12,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  buttonOpen: {
    backgroundColor: '#6366f1',
  },
  buttonClose: {
    backgroundColor: '#ef4444',
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
});
