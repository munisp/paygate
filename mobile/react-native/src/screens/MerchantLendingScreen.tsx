import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, Alert, TextInput, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming trpc client is available here

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Placeholder for tRPC types - these would typically be generated or defined in a shared types file
interface LendingItem {
  id: string;
  merchantId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  startDate: string;
  endDate: string;
  interestRate: number;
  repaymentAmount: number;
}

const MerchantLendingScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [newMerchantId, setNewMerchantId] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState<'NGN' | 'USD'>('USD');
  const [newInterestRate, setNewInterestRate] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');

  const [editMerchantId, setEditMerchantId] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState<'NGN' | 'USD'>('USD');
  const [editStatus, setEditStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID'>('PENDING');
  const [editInterestRate, setEditInterestRate] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [selectedLending, setSelectedLending] = useState<LendingItem | null>(null);

  useEffect(() => {
    if (selectedLending) {
      setEditMerchantId(selectedLending.merchantId);
      setEditAmount(selectedLending.amount.toString());
      setEditCurrency(selectedLending.currency);
      setEditStatus(selectedLending.status);
      setEditInterestRate(selectedLending.interestRate.toString());
      setEditStartDate(selectedLending.startDate);
      setEditEndDate(selectedLending.endDate);
    }
  }, [selectedLending]);

  // tRPC queries and mutations
  const { data: lendingData, isLoading, isError, refetch } = trpc.merchantLending.list.useQuery();
  const createLendingMutation = trpc.merchantLending.create.useMutation();
  const updateLendingMutation = trpc.merchantLending.update.useMutation();
  const deleteLendingMutation = trpc.merchantLending.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredLending = lendingData?.filter(item =>
    item.merchantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = () => {
    if (!newMerchantId || !newAmount || !newCurrency || !newInterestRate || !newStartDate || !newEndDate) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    const amount = parseFloat(newAmount);
    const interestRate = parseFloat(newInterestRate);
    if (isNaN(amount) || isNaN(interestRate)) {
      Alert.alert('Error', 'Amount and Interest Rate must be numbers.');
      return;
    }

    const newItem = {
      merchantId: newMerchantId,
      amount: amount,
      currency: newCurrency,
      status: 'PENDING', // Default status for new lending
      startDate: newStartDate,
      endDate: newEndDate,
      interestRate: interestRate,
      repaymentAmount: amount * (1 + interestRate / 100), // Simple calculation
    };

    createLendingMutation.mutate(newItem, {
      onSuccess: () => {
        setCreateModalVisible(false);
        refetch();
      },
      onError: (error) => {
        Alert.alert('Error', `Failed to create lending: ${error.message}`);
      },
    });
  };

  const handleEdit = () => {
    if (!selectedLending) return;
    if (!editMerchantId || !editAmount || !editCurrency || !editStatus || !editInterestRate || !editStartDate || !editEndDate) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    const amount = parseFloat(editAmount);
    const interestRate = parseFloat(editInterestRate);
    if (isNaN(amount) || isNaN(interestRate)) {
      Alert.alert('Error', 'Amount and Interest Rate must be numbers.');
      return;
    }

    const updatedItem: LendingItem = {
      ...selectedLending,
      merchantId: editMerchantId,
      amount: amount,
      currency: editCurrency,
      status: editStatus,
      startDate: editStartDate,
      endDate: editEndDate,
      interestRate: interestRate,
      repaymentAmount: amount * (1 + interestRate / 100), // Recalculate repayment amount
    };

    updateLendingMutation.mutate(updatedItem, {
      onSuccess: () => {
        setEditModalVisible(false);
        setSelectedLending(null);
        refetch();
      },
      onError: (error) => {
        Alert.alert('Error', `Failed to update lending: ${error.message}`);
      },
    });
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this lending record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteLendingMutation.mutate({ id }, {
              onSuccess: () => {
                refetch();
              },
              onError: (error) => {
                Alert.alert('Error', `Failed to delete lending: ${error.message}`);
              },
            });
          },
        },
      ]
    );
  };

  const renderLendingItem = ({ item }: { item: LendingItem }) => {
    const statusColor = {
      PENDING: COLORS.warning,
      APPROVED: COLORS.success,
      REJECTED: COLORS.error,
      PAID: COLORS.primary,
    }[item.status];

    const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
      const symbol = currency === 'NGN' ? '₦' : '$';
      return `${symbol}${amount.toFixed(2)}`;
    };

    const formatDate = (dateString: string) => {
      const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
      return new Date(dateString).toLocaleDateString(undefined, options);
    };

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Merchant ID: {item.merchantId}</Text>
          <Text style={[styles.statusBadge, { backgroundColor: statusColor }]}>{item.status}</Text>
        </View>
        <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
        <Text style={styles.cardText}>Repayment: {formatCurrency(item.repaymentAmount, item.currency)}</Text>
        <Text style={styles.cardText}>Interest Rate: {item.interestRate}%</Text>
        <Text style={styles.cardText}>Start Date: {formatDate(item.startDate)}</Text>
        <Text style={styles.cardText}>End Date: {formatDate(item.endDate)}</Text>
        <View style={styles.cardActions}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => {
            setSelectedLending(item);
            setEditModalVisible(true);
          }}>
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDelete(item.id)}>
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading lending data...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load lending data.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!filteredLending || filteredLending.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No lending records found.</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create New Lending</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Merchant Lending</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by Merchant ID or Status"
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <FlatList
        data={filteredLending}
        keyExtractor={(item) => item.id}
        renderItem={renderLendingItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Lending</Text>
            {/* Form fields for new lending item */}
            <TextInput style={styles.modalInput} placeholder="Merchant ID" placeholderTextColor={COLORS.muted} value={newMerchantId} onChangeText={setNewMerchantId} />
            <TextInput style={styles.modalInput} placeholder="Amount" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={newAmount} onChangeText={setNewAmount} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={newCurrency} onChangeText={(text) => setNewCurrency(text as 'NGN' | 'USD')} />
            <TextInput style={styles.modalInput} placeholder="Interest Rate" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={newInterestRate} onChangeText={setNewInterestRate} />
            <TextInput style={styles.modalInput} placeholder="Start Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={newStartDate} onChangeText={setNewStartDate} />
            <TextInput style={styles.modalInput} placeholder="End Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={newEndDate} onChangeText={setNewEndDate} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.error }]} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.primary }]} onPress={handleCreate}>
                <Text style={styles.modalButtonText}>Create</Text>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Lending</Text>
            {/* Form fields for editing lending item */}
            <TextInput style={styles.modalInput} placeholder="Merchant ID" placeholderTextColor={COLORS.muted} value={editMerchantId} onChangeText={setEditMerchantId} />
            <TextInput style={styles.modalInput} placeholder="Amount" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={editAmount} onChangeText={setEditAmount} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={editCurrency} onChangeText={(text) => setEditCurrency(text as 'NGN' | 'USD')} />
            <TextInput style={styles.modalInput} placeholder="Status" placeholderTextColor={COLORS.muted} value={editStatus} onChangeText={(text) => setEditStatus(text as 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID')} />
            <TextInput style={styles.modalInput} placeholder="Interest Rate" placeholderTextColor={COLORS.muted} keyboardType="numeric" value={editInterestRate} onChangeText={setEditInterestRate} />
            <TextInput style={styles.modalInput} placeholder="Start Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={editStartDate} onChangeText={setEditStartDate} />
            <TextInput style={styles.modalInput} placeholder="End Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={editEndDate} onChangeText={setEditEndDate} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.error }]} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.primary }]} onPress={handleEdit}>
                <Text style={styles.modalButtonText}>Save</Text>
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
    marginBottom: 10,
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
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
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
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    marginTop: 5,
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
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 12,
  },
  cardText: {
    color: COLORS.muted,
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
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  createButtonText: {
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
    width: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalInput: {
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
    justifyContent: 'flex-end',
    marginTop: 15,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginLeft: 10,
  },
  modalButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default MerchantLendingScreen;
