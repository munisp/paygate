import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface EMILoan {
  id: string;
  customerName: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  dueDate: string;
  createdAt: string;
}

const EMILoansPageScreen: React.FC = () => {
  const navigation = useNavigation();

  const { data: loans, isLoading, isError, refetch } = trpc.emiLoans.list.useQuery();
  const createLoanMutation = trpc.emiLoans.create.useMutation();
  const updateLoanMutation = trpc.emiLoans.update.useMutation();
  const deleteLoanMutation = trpc.emiLoans.delete.useMutation();

  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentLoan, setCurrentLoan] = useState<EMILoan | null>(null);

  // Form states for Create/Edit
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'paid'>('pending');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (currentLoan) {
      setCustomerName(currentLoan.customerName);
      setAmount(currentLoan.amount.toString());
      setCurrency(currentLoan.currency);
      // Assuming currentLoan.dueDate is an ISO string, extract YYYY-MM-DD
      setDueDate(currentLoan.dueDate ? new Date(currentLoan.dueDate).toISOString().split('T')[0] : '');
      setStatus(currentLoan.status);
    } else {
      // Reset form fields when modal is closed or creating new loan
      setCustomerName('');
      setAmount('');
      setCurrency('NGN');
      setDueDate('');
      setStatus('pending');
    }
  }, [currentLoan, isCreateModalVisible]); // Added isCreateModalVisible to reset form when opening create modal

  const filteredLoans = loans?.filter((loan: EMILoan) =>
    loan.customerName.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const validateAndParseInputs = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Validation Error', 'Amount must be a positive number.');
      return null;
    }
    if (!['NGN', 'USD'].includes(currency)) {
      Alert.alert('Validation Error', 'Currency must be NGN or USD.');
      return null;
    }
    if (!['pending', 'approved', 'rejected', 'paid'].includes(status)) {
      Alert.alert('Validation Error', 'Invalid status.');
      return null;
    }
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      Alert.alert('Validation Error', 'Due Date must be in YYYY-MM-DD format.');
      return null;
    }
    // Convert to ISO string for tRPC
    const isoDueDate = new Date(dueDate).toISOString();
    return { parsedAmount, isoDueDate };
  };

  const handleCreateLoan = async () => {
    const inputs = validateAndParseInputs();
    if (!inputs) return;
    const { parsedAmount, isoDueDate } = inputs;

    try {
      await createLoanMutation.mutateAsync({
        customerName,
        amount: parsedAmount,
        currency,
        dueDate: isoDueDate,
        status,
      });
      setCreateModalVisible(false);
      refetch();
      Alert.alert('Success', 'Loan created successfully!');
    } catch (error: any) {
      Alert.alert('Error', `Failed to create loan: ${error.message || 'Unknown error'}`);
    }
  };

  const handleUpdateLoan = async () => {
    if (!currentLoan) return;
    const inputs = validateAndParseInputs();
    if (!inputs) return;
    const { parsedAmount, isoDueDate } = inputs;

    try {
      await updateLoanMutation.mutateAsync({
        id: currentLoan.id,
        customerName,
        amount: parsedAmount,
        currency,
        dueDate: isoDueDate,
        status,
      });
      setEditModalVisible(false);
      setCurrentLoan(null);
      refetch();
      Alert.alert('Success', 'Loan updated successfully!');
    } catch (error: any) {
      Alert.alert('Error', `Failed to update loan: ${error.message || 'Unknown error'}`);
    }
  };

  const handleDeleteLoan = async (id: string) => {
    try {
      await deleteLoanMutation.mutateAsync({ id });
      refetch();
      Alert.alert('Success', 'Loan deleted successfully!');
    } catch (error: any) {
      Alert.alert('Error', `Failed to delete loan: ${error.message || 'Unknown error'}`);
    }
  };

  const renderLoanItem = ({ item }: { item: EMILoan }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.customerName}</Text>
      <Text style={styles.cardText}>Amount: {item.currency === 'NGN' ? '₦' : '$'}{item.amount.toFixed(2)}</Text>
      <Text style={styles.cardText}>Due Date: {new Date(item.dueDate).toLocaleDateString()}</Text>
      <Text style={styles.cardText}>Status: <Text style={[styles.badge, styles[`badge_${item.status}`]]}>{item.status.toUpperCase()}</Text></Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.button, styles.buttonEdit]} onPress={() => handleEditPress(item)}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonDelete]} onPress={() => handleDeletePress(item.id)}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const handleEditPress = (loan: EMILoan) => {
    setCurrentLoan(loan);
    setEditModalVisible(true);
  };

  const handleDeletePress = (id: string) => {
    Alert.alert(
      'Delete Loan',
      'Are you sure you want to delete this loan?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteLoan(id) },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading EMI Loans...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load EMI Loans.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>EMI Loans</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => {
          setCurrentLoan(null); // Ensure form is reset for creation
          setCreateModalVisible(true);
        }}>
          <Text style={styles.buttonText}>Add Loan</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by customer name..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredLoans.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No EMI loans found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLoans}
          keyExtractor={(item) => item.id}
          renderItem={renderLoanItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading || createLoanMutation.isLoading || updateLoanMutation.isLoading || deleteLoanMutation.isLoading}
              onRefresh={refetch}
              tintColor={COLORS.primary}
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
            <Text style={styles.modalTitle}>Create New Loan</Text>
            <TextInput style={styles.modalInput} placeholder="Customer Name" placeholderTextColor={COLORS.muted} value={customerName} onChangeText={setCustomerName} />
            <TextInput style={styles.modalInput} placeholder="Amount" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={currency} onChangeText={(text) => setCurrency(text as 'NGN' | 'USD')} />
            <TextInput style={styles.modalInput} placeholder="Due Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={dueDate} onChangeText={setDueDate} />
            <TextInput style={styles.modalInput} placeholder="Status (pending/approved/rejected/paid)" placeholderTextColor={COLORS.muted} value={status} onChangeText={(text) => setStatus(text as 'pending' | 'approved' | 'rejected' | 'paid')} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.button, styles.buttonCancel]} onPress={() => setCreateModalVisible(false)} disabled={createLoanMutation.isLoading}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handleCreateLoan} disabled={createLoanMutation.isLoading}>
                {createLoanMutation.isLoading ? <ActivityIndicator color={COLORS.text} /> : <Text style={styles.buttonText}>Create</Text>}
              </TouchableOpacity>
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
            <Text style={styles.modalTitle}>Edit Loan</Text>
            <TextInput style={styles.modalInput} placeholder="Customer Name" placeholderTextColor={COLORS.muted} value={customerName} onChangeText={setCustomerName} />
            <TextInput style={styles.modalInput} placeholder="Amount" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={currency} onChangeText={(text) => setCurrency(text as 'NGN' | 'USD')} />
            <TextInput style={styles.modalInput} placeholder="Due Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={dueDate} onChangeText={setDueDate} />
            <TextInput style={styles.modalInput} placeholder="Status (pending/approved/rejected/paid)" placeholderTextColor={COLORS.muted} value={status} onChangeText={(text) => setStatus(text as 'pending' | 'approved' | 'rejected' | 'paid')} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.button, styles.buttonCancel]} onPress={() => setEditModalVisible(false)} disabled={updateLoanMutation.isLoading}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handleUpdateLoan} disabled={updateLoanMutation.isLoading}>
                {updateLoanMutation.isLoading ? <ActivityIndicator color={COLORS.text} /> : <Text style={styles.buttonText}>Save</Text>}
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
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
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
  headerTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    margin: 15,
    borderRadius: 5,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 3,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontWeight: 'bold',
    fontSize: 12,
  },
  badge_pending: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  badge_approved: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  badge_rejected: {
    backgroundColor: COLORS.error,
    color: COLORS.background,
  },
  badge_paid: {
    backgroundColor: COLORS.primary,
    color: COLORS.background,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  buttonEdit: {
    backgroundColor: COLORS.primary,
  },
  buttonDelete: {
    backgroundColor: COLORS.error,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.card,
    borderRadius: 10,
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
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.background,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 15,
  },
  buttonCancel: {
    backgroundColor: COLORS.muted,
  },
  buttonPrimary: {
    backgroundColor: COLORS.primary,
  },
});

export default EMILoansPageScreen;