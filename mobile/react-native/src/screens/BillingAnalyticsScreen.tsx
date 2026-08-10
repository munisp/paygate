import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface BillingRecord {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'Paid' | 'Pending' | 'Failed';
  dueDate: string;
  createdAt: string;
}

const BillingAnalyticsScreen = () => {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<BillingRecord | null>(null);

  // State for new record creation
  const [newInvoiceNumber, setNewInvoiceNumber] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [newStatus, setNewStatus] = useState<'Paid' | 'Pending' | 'Failed'>('Pending');
  const [newDueDate, setNewDueDate] = useState('');

  // State for editing existing record
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [editStatus, setEditStatus] = useState<'Paid' | 'Pending' | 'Failed'>('Pending');
  const [editDueDate, setEditDueDate] = useState('');

  // tRPC query for listing billing records
  const { data, isLoading, isError, error, refetch } = trpc.billingAnalytics.list.useQuery();
  const createMutation = trpc.billingAnalytics.create.useMutation();
  const updateMutation = trpc.billingAnalytics.update.useMutation();
  const deleteMutation = trpc.billingAnalytics.delete.useMutation();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filteredData = data?.filter(record =>
    record.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getStatusStyle = (status: 'Paid' | 'Pending' | 'Failed') => {
    switch (status) {
      case 'Paid': return { backgroundColor: COLORS.success };
      case 'Pending': return { backgroundColor: COLORS.warning };
      case 'Failed': return { backgroundColor: COLORS.error };
      default: return { backgroundColor: COLORS.muted };
    }
  };

  const handleCreateSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        invoiceNumber: newInvoiceNumber,
        amount: parseFloat(newAmount),
        currency: newCurrency,
        status: newStatus,
        dueDate: newDueDate,
      });
      setCreateModalVisible(false);
      setNewInvoiceNumber('');
      setNewAmount('');
      setNewCurrency('NGN');
      setNewStatus('Pending');
      setNewDueDate('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create record.');
    }
  };

  const handleEditSubmit = async () => {
    if (!currentRecord) return;
    try {
      await updateMutation.mutateAsync({
        id: currentRecord.id,
        invoiceNumber: editInvoiceNumber,
        amount: parseFloat(editAmount),
        currency: editCurrency,
        status: editStatus,
        dueDate: editDueDate,
      });
      setEditModalVisible(false);
      setCurrentRecord(null);
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update record.');
    }
  };

  const confirmDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync({ id });
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete record.');
    }
  };

  const renderItem = ({ item }: { item: BillingRecord }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.invoiceNumber}>Invoice: {item.invoiceNumber}</Text>
        <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Due Date: {formatDate(item.dueDate)}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => handleEdit(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDelete(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const handleCreate = () => {
    setCreateModalVisible(true);
  };

  const handleEdit = (record: BillingRecord) => {
    setCurrentRecord(record);
    setEditInvoiceNumber(record.invoiceNumber);
    setEditAmount(String(record.amount));
    setEditCurrency(record.currency);
    setEditStatus(record.status);
    setEditDueDate(record.dueDate);
    setEditModalVisible(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Record',
      'Are you sure you want to delete this billing record?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(id) },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading billing data...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load billing data'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (filteredData.length === 0 && searchQuery === '') {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No billing records found.</Text>
        <Button title="Create New Record" onPress={handleCreate} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Billing Analytics</Text>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={handleCreate}>
          <Text style={styles.actionButtonText}>Add New</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by invoice number..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressBackgroundColor={COLORS.card}
          />
        }
      />

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Billing Record</Text>
            <TextInput style={styles.modalInput} placeholder="Invoice Number" placeholderTextColor={COLORS.muted} value={newInvoiceNumber} onChangeText={setNewInvoiceNumber} />
            <TextInput style={styles.modalInput} placeholder="Amount" keyboardType="numeric" placeholderTextColor={COLORS.muted} value={newAmount} onChangeText={setNewAmount} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={newCurrency} onChangeText={(text) => setNewCurrency(text as 'NGN' | 'USD')} />
            <TextInput style={styles.modalInput} placeholder="Status (Paid/Pending/Failed)" placeholderTextColor={COLORS.muted} value={newStatus} onChangeText={(text) => setNewStatus(text as 'Paid' | 'Pending' | 'Failed')} />
            <TextInput style={styles.modalInput} placeholder="Due Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={newDueDate} onChangeText={setNewDueDate} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Save" onPress={handleCreateSubmit} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Billing Record</Text>
            {currentRecord && (
              <>
                <TextInput style={styles.modalInput} placeholder="Invoice Number" value={editInvoiceNumber} onChangeText={setEditInvoiceNumber} placeholderTextColor={COLORS.muted} />
                <TextInput style={styles.modalInput} placeholder="Amount" keyboardType="numeric" value={editAmount} onChangeText={setEditAmount} placeholderTextColor={COLORS.muted} />
                <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" value={editCurrency} onChangeText={(text) => setEditCurrency(text as 'NGN' | 'USD')} placeholderTextColor={COLORS.muted} />
                <TextInput style={styles.modalInput} placeholder="Status (Paid/Pending/Failed)" value={editStatus} onChangeText={(text) => setEditStatus(text as 'Paid' | 'Pending' | 'Failed')} placeholderTextColor={COLORS.muted} />
                <TextInput style={styles.modalInput} placeholder="Due Date (YYYY-MM-DD)" value={editDueDate} onChangeText={setEditDueDate} placeholderTextColor={COLORS.muted} />
              </>
            )}
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.error} />
              <Button title="Save Changes" onPress={handleEditSubmit} color={COLORS.primary} />
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  loadingText: {
    color: COLORS.text,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    margin: 15,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  invoiceNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  statusText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 12,
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 5,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 15,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});

export default BillingAnalyticsScreen;
