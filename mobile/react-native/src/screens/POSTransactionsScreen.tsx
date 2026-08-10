import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, Alert, TextInput, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface POSTransaction {
  id: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'completed' | 'pending' | 'failed';
  transactionDate: string;
  merchantId: string;
  terminalId: string;
}

const POSTransactionsScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<POSTransaction | null>(null);
  const [newTransactionData, setNewTransactionData] = useState({
    amount: '',
    currency: 'NGN',
    status: 'pending',
    merchantId: '',
    terminalId: '',
  });

  const { data: transactions, isLoading, isError, error, refetch } = trpc.pos.list.useQuery();
  const createTransactionMutation = trpc.pos.create.useMutation();
  const updateTransactionMutation = trpc.pos.update.useMutation();
  const deleteTransactionMutation = trpc.pos.delete.useMutation();

  const filteredTransactions = transactions?.filter(transaction =>
    transaction.id.toLowerCase().includes(searchText.toLowerCase()) ||
    transaction.merchantId.toLowerCase().includes(searchText.toLowerCase()) ||
    transaction.terminalId.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleCreateNew = () => {
    setEditingTransaction(null);
    setNewTransactionData({
      amount: '',
      currency: 'NGN',
      status: 'pending',
      merchantId: '',
      terminalId: '',
    });
    setModalVisible(true);
  };

  const handleEdit = (transaction: POSTransaction) => {
    setEditingTransaction(transaction);
    setModalVisible(true);
  };

  const handleSaveTransaction = async () => {
    try {
      if (editingTransaction) {
        await updateTransactionMutation.mutateAsync({
          id: editingTransaction.id,
          amount: editingTransaction.amount,
          currency: editingTransaction.currency,
          status: editingTransaction.status,
          merchantId: editingTransaction.merchantId,
          terminalId: editingTransaction.terminalId,
        });
      } else {
        await createTransactionMutation.mutateAsync({
          amount: parseFloat(newTransactionData.amount),
          currency: newTransactionData.currency as 'NGN' | 'USD',
          status: newTransactionData.status as 'completed' | 'pending' | 'failed',
          merchantId: newTransactionData.merchantId,
          terminalId: newTransactionData.terminalId,
        });
      }
      refetch();
      setModalVisible(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to save transaction.');
      console.error(err);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await deleteTransactionMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete transaction.');
              console.error(err);
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  };

  const renderItem = ({ item }: { item: POSTransaction }) => (
    <View style={styles.transactionCard}>
      <Text style={styles.transactionId}>ID: {item.id}</Text>
      <Text style={styles.transactionAmount}>Amount: {item.currency === 'NGN' ? '₦' : '$'}{item.amount.toFixed(2)}</Text>
      <View style={[styles.statusBadge, { backgroundColor: item.status === 'completed' ? COLORS.success : item.status === 'pending' ? COLORS.warning : COLORS.error }]}>
        <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
      </View>
      <Text style={styles.transactionDate}>Date: {new Date(item.transactionDate).toLocaleString()}</Text>
      <View style={styles.actionButtons}>
        <TouchableOpacity style={[styles.button, styles.editButton]} onPress={() => handleEdit(item)}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={() => handleDelete(item.id)}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>POS Transactions</Text>
        <TouchableOpacity style={styles.createButton} onPress={handleCreateNew}>
          <Text style={styles.buttonText}>Create New</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search transactions..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {isLoading && <ActivityIndicator size="large" color={COLORS.primary} style={styles.loadingIndicator} />}
      {isError && <Text style={styles.errorText}>Error: {error?.message}</Text>}
      {!isLoading && !isError && filteredTransactions.length === 0 && (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>No POS transactions found.</Text>
        </View>
      )}

      <FlatList
        data={filteredTransactions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.headerTitle}>{editingTransaction ? 'Edit Transaction' : 'Create New Transaction'}</Text>
            <TextInput
              style={styles.modalTextInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={editingTransaction ? editingTransaction.amount.toString() : newTransactionData.amount}
              onChangeText={(text) => editingTransaction ? setEditingTransaction({ ...editingTransaction, amount: parseFloat(text) || 0 }) : setNewTransactionData({ ...newTransactionData, amount: text })}
            />
            <TextInput
              style={styles.modalTextInput}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={editingTransaction ? editingTransaction.currency : newTransactionData.currency}
              onChangeText={(text) => editingTransaction ? setEditingTransaction({ ...editingTransaction, currency: text as 'NGN' | 'USD' }) : setNewTransactionData({ ...newTransactionData, currency: text as 'NGN' | 'USD' })}
            />
            <TextInput
              style={styles.modalTextInput}
              placeholder="Status (completed, pending, failed)"
              placeholderTextColor={COLORS.muted}
              value={editingTransaction ? editingTransaction.status : newTransactionData.status}
              onChangeText={(text) => editingTransaction ? setEditingTransaction({ ...editingTransaction, status: text as 'completed' | 'pending' | 'failed' }) : setNewTransactionData({ ...newTransactionData, status: text as 'completed' | 'pending' | 'failed' })}
            />
            <TextInput
              style={styles.modalTextInput}
              placeholder="Merchant ID"
              placeholderTextColor={COLORS.muted}
              value={editingTransaction ? editingTransaction.merchantId : newTransactionData.merchantId}
              onChangeText={(text) => editingTransaction ? setEditingTransaction({ ...editingTransaction, merchantId: text }) : setNewTransactionData({ ...newTransactionData, merchantId: text })}
            />
            <TextInput
              style={styles.modalTextInput}
              placeholder="Terminal ID"
              placeholderTextColor={COLORS.muted}
              value={editingTransaction ? editingTransaction.terminalId : newTransactionData.terminalId}
              onChangeText={(text) => editingTransaction ? setEditingTransaction({ ...editingTransaction, terminalId: text }) : setNewTransactionData({ ...newTransactionData, terminalId: text })}
            />
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.error} />
              <Button title={editingTransaction ? 'Update' : 'Create'} onPress={handleSaveTransaction} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  transactionCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  transactionId: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 4,
  },
  transactionAmount: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  transactionStatus: {
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 8,
  },
  transactionDate: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 8,
  },
  editButton: {
    backgroundColor: COLORS.warning,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  loadingIndicator: {
    marginTop: 20,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    color: COLORS.muted,
    fontSize: 18,
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
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
    width: '90%',
  },
  modalTextInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    width: '100%',
    marginBottom: 15,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  statusText: {
    color: COLORS.background,
    fontWeight: 'bold',
    fontSize: 12,
  },
});

export default POSTransactionsScreen;