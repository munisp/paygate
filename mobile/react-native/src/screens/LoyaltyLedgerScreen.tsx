import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, TextInput, Modal, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Define design system colors
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

// Mock type for LoyaltyLedger entry (replace with actual tRPC type if available)
interface LoyaltyLedgerEntry {
  id: string;
  customerName: string;
  amount: number;
  type: 'credit' | 'debit';
  status: 'completed' | 'pending' | 'cancelled';
  transactionDate: string;
  description: string;
}

const LoyaltyLedgerScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<LoyaltyLedgerEntry | null>(null);

  // tRPC queries and mutations
  const { data, isLoading, isError, refetch } = trpc.loyaltyLedger.list.useQuery();
  const createMutation = trpc.loyaltyLedger.create.useMutation();
  const updateMutation = trpc.loyaltyLedger.update.useMutation();
  const deleteMutation = trpc.loyaltyLedger.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(entry =>
    entry.customerName.toLowerCase().includes(searchText.toLowerCase()) ||
    entry.description.toLowerCase().includes(searchText.toLowerCase())
  );

  // Helper for currency formatting
  const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
    const symbol = currency === 'NGN' ? '₦' : '$';
    return `${symbol}${amount.toFixed(2)}`;
  };

  // Helper for date formatting
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const handleCreate = async (newEntry: Omit<LoyaltyLedgerEntry, 'id'>) => {
    try {
      await createMutation.mutateAsync(newEntry);
      setCreateModalVisible(false);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create entry.');
    }
  };

  const handleEdit = async (updatedEntry: LoyaltyLedgerEntry) => {
    try {
      await updateMutation.mutateAsync(updatedEntry);
      setEditModalVisible(false);
      setCurrentEntry(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update entry.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this loyalty ledger entry?',
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
              Alert.alert('Error', 'Failed to delete entry.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: LoyaltyLedgerEntry }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.customerName}>{item.customerName}</Text>
        <View style={[styles.badge, item.status === 'completed' ? styles.badgeSuccess : item.status === 'pending' ? styles.badgeWarning : styles.badgeError]}>
          <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.description}>{item.description}</Text>
      <View style={styles.cardFooter}>
        <Text style={[styles.amount, item.type === 'credit' ? styles.amountCredit : styles.amountDebit]}>
          {formatCurrency(item.amount)}
        </Text>
        <Text style={styles.date}>{formatDate(item.transactionDate)}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => { setCurrentEntry(item); setEditModalVisible(true); }}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDelete(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading loyalty ledger...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load loyalty ledger. Please try again.</Text>
        <Button title="Retry" onPress={refetch} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.header}>Loyalty Ledger</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by customer name or description..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
        <Text style={styles.createButtonText}>+ Add New Entry</Text>
      </TouchableOpacity>

      {filteredData && filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No loyalty ledger entries found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
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
            <Text style={styles.modalTitle}>Create New Entry</Text>
            {/* Form fields for new entry */}
            <TextInput style={styles.input} placeholder="Customer Name" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Amount" keyboardType="numeric" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Type (credit/debit)" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Status (completed/pending/cancelled)" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Description" placeholderTextColor={COLORS.muted} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Create" onPress={() => handleCreate({ customerName: 'New Customer', amount: 100, type: 'credit', status: 'pending', transactionDate: new Date().toISOString(), description: 'New entry' })} color={COLORS.primary} />
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
            <Text style={styles.modalTitle}>Edit Entry</Text>
            {/* Form fields for editing entry */}
            <TextInput style={styles.input} placeholder="Customer Name" value={currentEntry?.customerName} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Amount" keyboardType="numeric" value={currentEntry?.amount.toString()} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Type (credit/debit)" value={currentEntry?.type} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Status (completed/pending/cancelled)" value={currentEntry?.status} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.input} placeholder="Description" value={currentEntry?.description} placeholderTextColor={COLORS.muted} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => { setEditModalVisible(false); setCurrentEntry(null); }} color={COLORS.error} />
              <Button title="Save" onPress={() => currentEntry && handleEdit(currentEntry)} color={COLORS.primary} />
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
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    padding: 20,
    paddingBottom: 10,
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginHorizontal: 20,
    marginBottom: 10,
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 15,
    alignItems: 'center',
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
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
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  badgeSuccess: {
    backgroundColor: COLORS.success,
  },
  badgeWarning: {
    backgroundColor: COLORS.warning,
  },
  badgeError: {
    backgroundColor: COLORS.error,
  },
  badgeText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  description: {
    color: COLORS.muted,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  amountCredit: {
    color: COLORS.success,
  },
  amountDebit: {
    color: COLORS.error,
  },
  date: {
    color: COLORS.muted,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
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
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    width: '100%',
    backgroundColor: COLORS.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});

export default LoyaltyLedgerScreen;