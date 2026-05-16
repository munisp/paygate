import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  Alert,
  TextInput,
  TouchableOpacity,
  Modal,
  Button,
  Platform,
} from 'react-native';
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

// Type definitions for a Consumer Loan (assuming structure from tRPC)
interface ConsumerLoan {
  id: string;
  borrowerName: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  startDate: Date;
  endDate: Date;
  interestRate: number;
}

const ConsumerLoansScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingLoan, setEditingLoan] = useState<ConsumerLoan | null>(null);

  // tRPC queries and mutations
  const { data: loans, isLoading, isError, refetch, isRefetching } = trpc.consumerFinanceLoans.list.useQuery();
  const createLoanMutation = trpc.consumerFinanceLoans.create.useMutation();
  const updateLoanMutation = trpc.consumerFinanceLoans.update.useMutation();
  const deleteLoanMutation = trpc.consumerFinanceLoans.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredLoans = useMemo(() => {
    if (!loans) return [];
    return loans.filter(loan =>
      loan.borrowerName.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [loans, searchText]);

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this loan?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLoanMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete loan.');
            }
          },
        },
      ]
    );
  };

  const handleEdit = (loan: ConsumerLoan) => {
    setEditingLoan(loan);
    setIsModalVisible(true);
  };

  const handleCreate = () => {
    setEditingLoan(null);
    setIsModalVisible(true);
  };

  const handleSaveLoan = async (loanData: Omit<ConsumerLoan, 'id' | 'startDate' | 'endDate'> & { startDate: string, endDate: string }) => {
    try {
      if (editingLoan) {
        await updateLoanMutation.mutateAsync({ ...loanData, id: editingLoan.id, startDate: new Date(loanData.startDate), endDate: new Date(loanData.endDate) });
      } else {
        await createLoanMutation.mutateAsync({ ...loanData, startDate: new Date(loanData.startDate), endDate: new Date(loanData.endDate) });
      }
      setIsModalVisible(false);
      setEditingLoan(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to save loan.');
    }
  };

  const renderLoanItem = ({ item }: { item: ConsumerLoan }) => (
    <View style={styles.loanCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.borrowerName}>{item.borrowerName}</Text>
        <View style={[styles.statusBadge, {
          backgroundColor: item.status === 'APPROVED' ? COLORS.success :
            item.status === 'PENDING' ? COLORS.warning :
              item.status === 'REJECTED' ? COLORS.error :
                COLORS.muted
        }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.loanDetail}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.loanDetail}>Interest Rate: {item.interestRate}%</Text>
      <Text style={styles.loanDetail}>Start Date: {formatDate(item.startDate)}</Text>
      <Text style={styles.loanDetail}>End Date: {formatDate(item.endDate)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => handleEdit(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDelete(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading loans...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load loans.</Text>
        <Button title="Retry" onPress={onRefresh} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Consumer Loans</Text>
        <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
          <Text style={styles.createButtonText}>+ Add Loan</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by borrower name..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      {filteredLoans.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No consumer loans found.</Text>
          <Button title="Add New Loan" onPress={handleCreate} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredLoans}
          keyExtractor={(item) => item.id}
          renderItem={renderLoanItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      <LoanModal
        isVisible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onSave={handleSaveLoan}
        initialData={editingLoan}
      />
    </SafeAreaView>
  );
};

interface LoanModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (loanData: Omit<ConsumerLoan, 'id' | 'startDate' | 'endDate'> & { startDate: string, endDate: string }) => void;
  initialData: ConsumerLoan | null;
}

const LoanModal: React.FC<LoanModalProps> = ({ isVisible, onClose, onSave, initialData }) => {
  const [borrowerName, setBorrowerName] = useState(initialData?.borrowerName || '');
  const [amount, setAmount] = useState(initialData?.amount.toString() || '');
  const [currency, setCurrency] = useState<'NGN' | 'USD'>(initialData?.currency || 'USD');
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID'>(initialData?.status || 'PENDING');
  const [startDate, setStartDate] = useState(initialData?.startDate.toISOString().split('T')[0] || '');
  const [endDate, setEndDate] = useState(initialData?.endDate.toISOString().split('T')[0] || '');
  const [interestRate, setInterestRate] = useState(initialData?.interestRate.toString() || '');

  React.useEffect(() => {
    if (initialData) {
      setBorrowerName(initialData.borrowerName);
      setAmount(initialData.amount.toString());
      setCurrency(initialData.currency);
      setStatus(initialData.status);
      setStartDate(initialData.startDate.toISOString().split('T')[0]);
      setEndDate(initialData.endDate.toISOString().split('T')[0]);
      setInterestRate(initialData.interestRate.toString());
    } else {
      setBorrowerName('');
      setAmount('');
      setCurrency('USD');
      setStatus('PENDING');
      setStartDate('');
      setEndDate('');
      setInterestRate('');
    }
  }, [initialData]);

  const handleSave = () => {
    if (!borrowerName || !amount || !startDate || !endDate || !interestRate) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    onSave({
      borrowerName,
      amount: parseFloat(amount),
      currency,
      status,
      startDate,
      endDate,
      interestRate: parseFloat(interestRate),
    });
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={modalStyles.centeredView}>
        <View style={modalStyles.modalView}>
          <Text style={modalStyles.modalTitle}>{initialData ? 'Edit Loan' : 'Add New Loan'}</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="Borrower Name"
            placeholderTextColor={COLORS.muted}
            value={borrowerName}
            onChangeText={setBorrowerName}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Amount"
            placeholderTextColor={COLORS.muted}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          <View style={modalStyles.pickerContainer}>
            <Text style={modalStyles.pickerLabel}>Currency:</Text>
            <Picker
              selectedValue={currency}
              style={modalStyles.picker}
              onValueChange={(itemValue) => setCurrency(itemValue as 'NGN' | 'USD')}
              itemStyle={modalStyles.pickerItem}
            >
              <Picker.Item label="USD" value="USD" />
              <Picker.Item label="NGN" value="NGN" />
            </Picker>
          </View>
          <View style={modalStyles.pickerContainer}>
            <Text style={modalStyles.pickerLabel}>Status:</Text>
            <Picker
              selectedValue={status}
              style={modalStyles.picker}
              onValueChange={(itemValue) => setStatus(itemValue as 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID')}
              itemStyle={modalStyles.pickerItem}
            >
              <Picker.Item label="Pending" value="PENDING" />
              <Picker.Item label="Approved" value="APPROVED" />
              <Picker.Item label="Rejected" value="REJECTED" />
              <Picker.Item label="Paid" value="PAID" />
            </Picker>
          </View>
          <TextInput
            style={modalStyles.input}
            placeholder="Start Date (YYYY-MM-DD)"
            placeholderTextColor={COLORS.muted}
            value={startDate}
            onChangeText={setStartDate}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="End Date (YYYY-MM-DD)"
            placeholderTextColor={COLORS.muted}
            value={endDate}
            onChangeText={setEndDate}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Interest Rate (%)"
            placeholderTextColor={COLORS.muted}
            keyboardType="numeric"
            value={interestRate}
            onChangeText={setInterestRate}
          />
          <View style={modalStyles.buttonContainer}>
            <Button title="Cancel" onPress={onClose} color={COLORS.muted} />
            <Button title="Save" onPress={handleSave} color={COLORS.primary} />
          </View>
        </View>
      </View>
    </Modal>
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
  title: {
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
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  loanCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  borrowerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  loanDetail: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 4,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    marginLeft: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
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
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
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
    marginBottom: 20,
    textAlign: 'center',
  },
});

const modalStyles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.card,
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
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  input: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden', // Ensures picker content stays within bounds
  },
  pickerLabel: {
    color: COLORS.muted,
    paddingLeft: 16,
    fontSize: 16,
  },
  picker: {
    flex: 1,
    height: 40,
    color: COLORS.text,
    // Specific styles for Android and iOS Pickers
    ...(Platform.OS === 'ios' && {
      // For iOS, the picker itself is usually styled by its container
    }),
    ...(Platform.OS === 'android' && {
      // For Android, you might need to adjust text color directly
      color: COLORS.text,
    }),
  },
  pickerItem: {
    color: COLORS.text, // This might not work on all platforms/versions
  },
});

// Dummy Picker component for web/testing if not using react-native-picker/picker
// In a real RN project, you would install and import from '@react-native-picker/picker'
const Picker = Platform.select({
  ios: require('@react-native-picker/picker').Picker,
  android: require('@react-native-picker/picker').Picker,
  default: ({ children, selectedValue, onValueChange, style, itemStyle }: any) => (
    <select
      value={selectedValue}
      onChange={(e) => onValueChange(e.target.value)}
      style={{ ...style, backgroundColor: COLORS.background, color: COLORS.text, borderWidth: 0, height: '100%' }}
    >
      {React.Children.map(children, (child) => (
        <option value={child.props.value} style={itemStyle}>{child.props.label}</option>
      ))}
    </select>
  ),
});

export default ConsumerLoansScreen;
