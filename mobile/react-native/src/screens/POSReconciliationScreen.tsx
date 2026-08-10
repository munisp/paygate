import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  muted: '#94A3B8',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  border: '#334155',
};

type ReconciliationItem = {
  id: string;
  transactionId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'Pending' | 'Completed' | 'Failed';
  reconciliationDate: string;
  terminalId: string;
};

const POSReconciliationScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ReconciliationItem | null>(null);
  const [formState, setFormState] = useState({
    transactionId: '',
    amount: '',
    currency: 'NGN',
    status: 'Pending',
    terminalId: '',
  });

  // Map to tRPC router namespace based on page name: POSReconciliation -> trpc.posReconciliation
  const { data, isLoading, isError, error, refetch } = trpc.posReconciliation.list.useQuery();
  const createMutation = trpc.posReconciliation.create.useMutation();
  const updateMutation = trpc.posReconciliation.update.useMutation();
  const deleteMutation = trpc.posReconciliation.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(item =>
    item.transactionId.toLowerCase().includes(searchText.toLowerCase()) ||
    item.terminalId.toLowerCase().includes(searchText.toLowerCase())
  );

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const getStatusBadgeStyle = (status: 'Pending' | 'Completed' | 'Failed') => {
    switch (status) {
      case 'Completed':
        return { backgroundColor: COLORS.success };
      case 'Failed':
        return { backgroundColor: COLORS.error };
      case 'Pending':
      default:
        return { backgroundColor: COLORS.warning };
    }
  };

  const handleCreateEdit = async () => {
    try {
      const payload = {
        ...formState,
        amount: parseFloat(formState.amount),
      };
      if (editingItem) {
        await updateMutation.mutateAsync({ id: editingItem.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setModalVisible(false);
      setEditingItem(null);
      setFormState({
        transactionId: '',
        amount: '',
        currency: 'NGN',
        status: 'Pending',
        terminalId: '',
      });
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to save reconciliation item.');
      console.error(err);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this reconciliation item?',
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
              Alert.alert('Error', 'Failed to delete reconciliation item.');
              console.error(err);
            }
          },
        },
      ]
    );
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setFormState({
      transactionId: '',
      amount: '',
      currency: 'NGN',
      status: 'Pending',
      terminalId: '',
    });
    setModalVisible(true);
  };

  const openEditModal = (item: ReconciliationItem) => {
    setEditingItem(item);
    setFormState({
      transactionId: item.transactionId,
      amount: item.amount.toString(),
      currency: item.currency,
      status: item.status,
      terminalId: item.terminalId,
    });
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: ReconciliationItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Transaction ID: {item.transactionId}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Terminal ID: {item.terminalId}</Text>
      <Text style={styles.cardText}>Date: {formatDate(item.reconciliationDate)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading reconciliation data...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch data'}</Text>
        <TouchableOpacity onPress={refetch} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!filteredData || filteredData.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No reconciliation data found.</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.createButton}>
          <Text style={styles.createButtonText}>Create New</Text>
        </TouchableOpacity>
        <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.screenTitle}>POS Reconciliation</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.createButtonHeader}>
          <Text style={styles.createButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by Transaction ID or Terminal ID"
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
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
            <Text style={styles.modalTitle}>{editingItem ? 'Edit Item' : 'Create New Item'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Transaction ID"
              placeholderTextColor={COLORS.muted}
              value={formState.transactionId}
              onChangeText={(text) => setFormState({ ...formState, transactionId: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={formState.amount}
              onChangeText={(text) => setFormState({ ...formState, amount: text })}
            />
            {/* Currency and Status could be dropdowns in a real app, using TextInput for simplicity */}
            <TextInput
              style={styles.input}
              placeholder="Currency (e.g., NGN, USD)"
              placeholderTextColor={COLORS.muted}
              value={formState.currency}
              onChangeText={(text) => setFormState({ ...formState, currency: text as 'NGN' | 'USD' })}
            />
            <TextInput
              style={styles.input}
              placeholder="Status (e.g., Pending, Completed, Failed)"
              placeholderTextColor={COLORS.muted}
              value={formState.status}
              onChangeText={(text) => setFormState({ ...formState, status: text as 'Pending' | 'Completed' | 'Failed' })}
            />
            <TextInput
              style={styles.input}
              placeholder="Terminal ID"
              placeholderTextColor={COLORS.muted}
              value={formState.terminalId}
              onChangeText={(text) => setFormState({ ...formState, terminalId: text })}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.modalButton, { backgroundColor: COLORS.muted }]}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateEdit} style={[styles.modalButton, { backgroundColor: COLORS.primary }]}>
                <Text style={styles.modalButtonText}>{editingItem ? 'Save Changes' : 'Create'}</Text>
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
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
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
  screenTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  createButtonHeader: {
    backgroundColor: COLORS.primary,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 20,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    margin: 10,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    flexShrink: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 20,
    width: '90%',
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
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  modalButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default POSReconciliationScreen;
