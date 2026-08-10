import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, TextInput, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface BnplRepayment {
  id: string;
  customerName: string;
  loanId: string;
  amountDue: number;
  currency: '₦' | '$';
  dueDate: string; // ISO date string
  status: 'Pending' | 'Paid' | 'Overdue' | 'Partially Paid';
  lastPaymentDate?: string; // ISO date string
  nextPaymentAmount?: number;
  nextPaymentDate?: string; // ISO date string
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

interface CreateBnplRepaymentInput {
  customerName: string;
  loanId: string;
  amountDue: number;
  currency: '₦' | '$';
  dueDate: string; // ISO date string
}

interface UpdateBnplRepaymentInput {
  id: string;
  customerName?: string;
  loanId?: string;
  amountDue?: number;
  currency?: '₦' | '$';
  dueDate?: string; // ISO date string
  status?: 'Pending' | 'Paid' | 'Overdue' | 'Partially Paid';
  lastPaymentDate?: string; // ISO date string
  nextPaymentAmount?: number;
  nextPaymentDate?: string; // ISO date string
}

const BnplRepaymentTrackerScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingRepayment, setEditingRepayment] = useState<BnplRepayment | null>(null);

  // State for Create form
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newLoanId, setNewLoanId] = useState('');
  const [newAmountDue, setNewAmountDue] = useState('');
  const [newCurrency, setNewCurrency] = useState<'₦' | '$'>('₦');
  const [newDueDate, setNewDueDate] = useState('');

  // State for Edit form
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editLoanId, setEditLoanId] = useState('');
  const [editAmountDue, setEditAmountDue] = useState('');
  const [editCurrency, setEditCurrency] = useState<'₦' | '$'>('₦');
  const [editDueDate, setEditDueDate] = useState('');
  const [editStatus, setEditStatus] = useState<'Pending' | 'Paid' | 'Overdue' | 'Partially Paid'>('Pending');

  const { data: repayments, isLoading, isError, refetch } = trpc.bnplRepayments.list.useQuery();
  const createMutation = trpc.bnplRepayments.create.useMutation();
  const updateMutation = trpc.bnplRepayments.update.useMutation();
  const deleteMutation = trpc.bnplRepayments.delete.useMutation();

  useEffect(() => {
    if (editingRepayment) {
      setEditCustomerName(editingRepayment.customerName);
      setEditLoanId(editingRepayment.loanId);
      setEditAmountDue(editingRepayment.amountDue.toString());
      setEditCurrency(editingRepayment.currency);
      setEditDueDate(editingRepayment.dueDate.split('T')[0]);
      setEditStatus(editingRepayment.status);
    }
  }, [editingRepayment]);

  const filteredRepayments = repayments?.filter(repayment =>
    repayment.customerName.toLowerCase().includes(searchText.toLowerCase()) ||
    repayment.loanId.toLowerCase().includes(searchText.toLowerCase()) ||
    repayment.status.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newCustomerName || !newLoanId || !newAmountDue || !newDueDate) {
      Alert.alert('Error', 'Please fill all required fields.');
      return;
    }
    try {
      const newRepayment: CreateBnplRepaymentInput = {
        customerName: newCustomerName,
        loanId: newLoanId,
        amountDue: parseFloat(newAmountDue),
        currency: newCurrency,
        dueDate: newDueDate,
      };
      await createMutation.mutateAsync(newRepayment);
      refetch();
      setCreateModalVisible(false);
      // Clear form fields
      setNewCustomerName('');
      setNewLoanId('');
      setNewAmountDue('');
      setNewCurrency('₦');
      setNewDueDate('');
    } catch (error) {
      Alert.alert('Error', `Failed to create repayment: ${error.message}`);
    }
  };

  const handleUpdate = async () => {
    if (!editingRepayment) return;
    try {
      const updatedRepayment: UpdateBnplRepaymentInput = {
        id: editingRepayment.id,
        customerName: editCustomerName,
        loanId: editLoanId,
        amountDue: parseFloat(editAmountDue),
        currency: editCurrency,
        dueDate: editDueDate,
        status: editStatus,
      };
      await updateMutation.mutateAsync(updatedRepayment);
      refetch();
      setEditModalVisible(false);
      setEditingRepayment(null);
    } catch (error) {
      Alert.alert('Error', `Failed to update repayment: ${error.message}`);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Repayment',
      'Are you sure you want to delete this repayment record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert('Error', `Failed to delete repayment: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const getStatusStyle = (status: BnplRepayment['status']) => {
    switch (status) {
      case 'Paid':
        return { backgroundColor: COLORS.success };
      case 'Overdue':
        return { backgroundColor: COLORS.error };
      case 'Pending':
        return { backgroundColor: COLORS.warning };
      case 'Partially Paid':
        return { backgroundColor: COLORS.primary };
      default:
        return { backgroundColor: COLORS.muted };
    }
  };

  const formatAmount = (amount: number, currency: '₦' | '$') => {
    return `${currency} ${amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const renderRepaymentItem = ({ item }: { item: BnplRepayment }) => (
    <View style={styles.repaymentItem}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle}>{item.customerName}</Text>
        <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.itemDetailText}>Loan ID: {item.loanId}</Text>
      <Text style={styles.itemDetailText}>Amount Due: {formatAmount(item.amountDue, item.currency)}</Text>
      <Text style={styles.itemDetailText}>Due Date: {formatDate(item.dueDate)}</Text>
      {item.lastPaymentDate && <Text style={styles.itemDetailText}>Last Payment: {formatDate(item.lastPaymentDate)}</Text>}
      {item.nextPaymentAmount && item.nextPaymentDate && (
        <Text style={styles.itemDetailText}>Next Payment: {formatAmount(item.nextPaymentAmount, item.currency)} by {formatDate(item.nextPaymentDate)}</Text>
      )}
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={() => { setEditingRepayment(item); setEditModalVisible(true); }} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BNPL Repayment Tracker</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading repayments...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>BNPL Repayment Tracker</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load repayments.</Text>
          <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BNPL Repayment Tracker</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.buttonText}>Add Repayment</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by customer name, loan ID, or status..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredRepayments?.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No repayment records found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRepayments}
          keyExtractor={(item) => item.id}
          renderItem={renderRepaymentItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]} // for Android
              progressBackgroundColor={COLORS.card} // for Android
            />
          }
        />
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Add New Repayment</Text>
            <TextInput style={styles.input} placeholder="Customer Name" placeholderTextColor={COLORS.muted} value={newCustomerName} onChangeText={setNewCustomerName} />
            <TextInput style={styles.input} placeholder="Loan ID" placeholderTextColor={COLORS.muted} value={newLoanId} onChangeText={setNewLoanId} />
            <TextInput style={styles.input} placeholder="Amount Due" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={newAmountDue} onChangeText={setNewAmountDue} />
            <TextInput style={styles.input} placeholder="Currency (₦ or $)" placeholderTextColor={COLORS.muted} value={newCurrency} onChangeText={(text) => setNewCurrency(text as '₦' | '$')} />
            <TextInput style={styles.input} placeholder="Due Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={newDueDate} onChangeText={setNewDueDate} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Create" onPress={handleCreate} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => { setEditModalVisible(false); setEditingRepayment(null); }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Repayment</Text>
            <TextInput style={styles.input} placeholder="Customer Name" placeholderTextColor={COLORS.muted} value={editCustomerName} onChangeText={setEditCustomerName} />
            <TextInput style={styles.input} placeholder="Loan ID" placeholderTextColor={COLORS.muted} value={editLoanId} onChangeText={setEditLoanId} />
            <TextInput style={styles.input} placeholder="Amount Due" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={editAmountDue} onChangeText={setEditAmountDue} />
            <TextInput style={styles.input} placeholder="Currency (₦ or $)" placeholderTextColor={COLORS.muted} value={editCurrency} onChangeText={(text) => setEditCurrency(text as '₦' | '$')} />
            <TextInput style={styles.input} placeholder="Due Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={editDueDate} onChangeText={setEditDueDate} />
            <TextInput style={styles.input} placeholder="Status" placeholderTextColor={COLORS.muted} value={editStatus} onChangeText={(text) => setEditStatus(text as 'Pending' | 'Paid' | 'Overdue' | 'Partially Paid')} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => { setEditModalVisible(false); setEditingRepayment(null); }} color={COLORS.error} />
              <Button title="Save" onPress={handleUpdate} color={COLORS.primary} />
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
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
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
  repaymentItem: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  itemDetailText: {
    color: COLORS.text,
    marginBottom: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 15,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  itemActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
  input: {
    width: '100%',
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});

export default BnplRepaymentTrackerScreen;
