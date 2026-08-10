import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, TextInput, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming trpc client is available here

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Type definition for a carbon credit ledger entry
interface CarbonCreditEntry {
  id: string;
  transactionId: string;
  date: string;
  type: 'Purchase' | 'Sale' | 'Adjustment';
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'Completed' | 'Pending' | 'Failed';
  description?: string;
}

const CarbonCreditsLedgerScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<CarbonCreditEntry | null>(null);

  // tRPC queries and mutations
  const { data: ledgerEntries, isLoading, isError, refetch } = trpc.carbonCredits.list.useQuery();
  const createMutation = trpc.carbonCredits.create.useMutation();
  const updateMutation = trpc.carbonCredits.update.useMutation();
  const deleteMutation = trpc.carbonCredits.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredEntries = ledgerEntries?.filter(entry =>
    entry.transactionId.toLowerCase().includes(searchText.toLowerCase()) ||
    entry.description?.toLowerCase().includes(searchText.toLowerCase()) ||
    entry.type.toLowerCase().includes(searchText.toLowerCase())
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

  const getStatusBadgeStyle = (status: 'Completed' | 'Pending' | 'Failed') => {
    switch (status) {
      case 'Completed': return styles.statusBadgeCompleted;
      case 'Pending': return styles.statusBadgePending;
      case 'Failed': return styles.statusBadgeFailed;
      default: return {};
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this entry?',
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
              console.error('Failed to delete entry:', error);
              Alert.alert('Error', 'Failed to delete entry.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleCreate = async (newEntryData: Omit<CarbonCreditEntry, 'id'>) => {
    try {
      await createMutation.mutateAsync(newEntryData);
      setCreateModalVisible(false);
      refetch();
    } catch (error) {
      console.error('Failed to create entry:', error);
      Alert.alert('Error', 'Failed to create entry.');
    }
  };

  const handleUpdate = async (updatedEntryData: CarbonCreditEntry) => {
    try {
      await updateMutation.mutateAsync(updatedEntryData);
      setEditModalVisible(false);
      setCurrentEntry(null);
      refetch();
    } catch (error) {
      console.error('Failed to update entry:', error);
      Alert.alert('Error', 'Failed to update entry.');
    }
  };

  const renderItem = ({ item }: { item: CarbonCreditEntry }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.transactionId}>#{item.transactionId}</Text>
        <Text style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>{item.status}</Text>
      </View>
      <Text style={styles.cardText}>Date: {formatDate(item.date)}</Text>
      <Text style={styles.cardText}>Type: {item.type}</Text>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      {item.description && <Text style={styles.cardText}>Description: {item.description}</Text>}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => { setCurrentEntry(item); setEditModalVisible(true); }}>
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
        <Text style={styles.loadingText}>Loading Carbon Credits Ledger...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load carbon credits ledger.</Text>
        <Button title="Retry" onPress={refetch} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!ledgerEntries || ledgerEntries.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No carbon credit entries found.</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Add New Entry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Carbon Credits Ledger</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Add Entry</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by Transaction ID or Description..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredEntries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContentContainer}
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Entry</Text>
            {/* Form fields for new entry */}
            <TextInput style={styles.modalInput} placeholder="Transaction ID" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Type (Purchase, Sale, Adjustment)" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Amount" keyboardType="numeric" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN, USD)" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Status (Completed, Pending, Failed)" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Description (Optional)" placeholderTextColor={COLORS.muted} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={() => handleCreate({ /* new entry data */ transactionId: 'TID123', date: new Date().toISOString(), type: 'Purchase', amount: 100, currency: 'USD', status: 'Pending' })} color={COLORS.primary} />
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
            {/* Form fields for editing currentEntry */}
            <TextInput style={styles.modalInput} placeholder="Transaction ID" value={currentEntry?.transactionId} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Type" value={currentEntry?.type} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Amount" keyboardType="numeric" value={currentEntry?.amount.toString()} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Currency" value={currentEntry?.currency} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Status" value={currentEntry?.status} placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Description" value={currentEntry?.description} placeholderTextColor={COLORS.muted} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => { setEditModalVisible(false); setCurrentEntry(null); }} color={COLORS.muted} />
              <Button title="Save" onPress={() => handleUpdate(currentEntry!)} color={COLORS.primary} />
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
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  transactionId: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cardText: {
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusBadgeCompleted: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusBadgePending: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  statusBadgeFailed: {
    backgroundColor: COLORS.error,
    color: COLORS.background,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.background,
    fontWeight: 'bold',
  },
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
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
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
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
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '80%',
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
    backgroundColor: COLORS.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
});

export default CarbonCreditsLedgerScreen;