import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface SalaryAccount {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  currency: 'NGN' | 'USD';
  balance: number;
  createdAt: string;
}

const SalaryAccountsScreen = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SalaryAccount | null>(null);
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [currency, setCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [balance, setBalance] = useState('');

  const { data: accounts, isLoading, isError, error, refetch } = trpc.salaryAccounts.list.useQuery();
  const createMutation = trpc.salaryAccounts.create.useMutation();
  const updateMutation = trpc.salaryAccounts.update.useMutation();
  const deleteMutation = trpc.salaryAccounts.delete.useMutation();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const filteredAccounts = accounts?.filter(account =>
    account.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.bankName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.accountNumber.includes(searchQuery)
  );

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    if (currency === 'NGN') {
      return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (currency === 'USD') {
      return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return amount.toString();
  };

  const handleCreateOrUpdate = async () => {
    try {
      if (editingAccount) {
        await updateMutation.mutateAsync({
          id: editingAccount.id,
          accountName,
          bankName,
          accountNumber,
          currency,
          balance: parseFloat(balance),
        });
      } else {
        await createMutation.mutateAsync({
          accountName,
          bankName,
          accountNumber,
          currency,
          balance: parseFloat(balance),
        });
      }
      setModalVisible(false);
      resetForm();
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to save account.');
      console.error(err);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete this salary account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete account.');
              console.error(err);
            }
          },
        },
      ]
    );
  };

  const openCreateModal = () => {
    setEditingAccount(null);
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (account: SalaryAccount) => {
    setEditingAccount(account);
    setAccountName(account.accountName);
    setBankName(account.bankName);
    setAccountNumber(account.accountNumber);
    setCurrency(account.currency);
    setBalance(account.balance.toString());
    setModalVisible(true);
  };

  const resetForm = () => {
    setAccountName('');
    setBankName('');
    setAccountNumber('');
    setCurrency('NGN');
    setBalance('');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading salary accounts...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Error: {error?.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!filteredAccounts || filteredAccounts.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No salary accounts found.</Text>
        <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
          <Text style={styles.createButtonText}>Create New Account</Text>
        </TouchableOpacity>
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: SalaryAccount }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.accountName}>{item.accountName}</Text>
        <View style={[styles.badge, item.currency === 'NGN' ? styles.badgeNGN : styles.badgeUSD]}>
          <Text style={styles.badgeText}>{item.currency}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Bank: {item.bankName}</Text>
      <Text style={styles.cardText}>Account No: {item.accountNumber}</Text>
      <Text style={styles.balanceText}>Balance: {formatCurrency(item.balance, item.currency)}</Text>
      <Text style={styles.cardText}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => openEditModal(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDelete(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Salary Accounts</Text>
        <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
          <Text style={styles.createButtonText}>Add Account</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search accounts..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <FlatList
        data={filteredAccounts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingAccount ? 'Edit Salary Account' : 'Create Salary Account'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Account Name"
              placeholderTextColor={COLORS.muted}
              value={accountName}
              onChangeText={setAccountName}
            />
            <TextInput
              style={styles.input}
              placeholder="Bank Name"
              placeholderTextColor={COLORS.muted}
              value={bankName}
              onChangeText={setBankName}
            />
            <TextInput
              style={styles.input}
              placeholder="Account Number"
              placeholderTextColor={COLORS.muted}
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="numeric"
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, currency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, currency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Balance"
              placeholderTextColor={COLORS.muted}
              value={balance}
              onChangeText={setBalance}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelModalButton]} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveModalButton]} onPress={handleCreateOrUpdate}>
                <Text style={styles.modalButtonText}>{editingAccount ? 'Save Changes' : 'Create'}</Text>
              </TouchableOpacity>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.text,
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  retryButton: {
    marginTop: 15,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    margin: 10,
    borderRadius: 5,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  accountName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  balanceText: {
    color: COLORS.success,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 15,
  },
  badgeNGN: {
    backgroundColor: COLORS.warning,
  },
  badgeUSD: {
    backgroundColor: COLORS.success,
  },
  badgeText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    padding: 20,
    borderRadius: 10,
    width: '85%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    borderRadius: 5,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 15,
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginHorizontal: 5,
    backgroundColor: COLORS.muted,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelModalButton: {
    backgroundColor: COLORS.muted,
  },
  saveModalButton: {
    backgroundColor: COLORS.primary,
  },
  modalButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SalaryAccountsScreen;