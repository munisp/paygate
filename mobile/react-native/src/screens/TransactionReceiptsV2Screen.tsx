import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Mock types for tRPC data - replace with actual types from tRPC client if available
interface TransactionReceipt {
  id: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'completed' | 'pending' | 'failed';
  date: string;
  description: string;
  customerName: string;
}

const TransactionReceiptsV2Screen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<TransactionReceipt | null>(null);

  // tRPC query for listing transaction receipts
  const { data, isLoading, isError, error, refetch } = trpc.transactionReceipts.list.useQuery();

  // tRPC mutations for CRUD operations
  const createMutation = trpc.transactionReceipts.create.useMutation();
  const updateMutation = trpc.transactionReceipts.update.useMutation();
  const deleteMutation = trpc.transactionReceipts.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(receipt =>
    receipt.description.toLowerCase().includes(searchText.toLowerCase()) ||
    receipt.customerName.toLowerCase().includes(searchText.toLowerCase())
  );

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const getStatusBadgeStyle = (status: 'completed' | 'pending' | 'failed') => {
    switch (status) {
      case 'completed': return { backgroundColor: COLORS.success };
      case 'pending': return { backgroundColor: COLORS.warning };
      case 'failed': return { backgroundColor: COLORS.error };
      default: return { backgroundColor: COLORS.muted };
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this transaction receipt?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch(); // Refresh data after deletion
            } catch (err) {
              console.error('Failed to delete receipt:', err);
              Alert.alert('Error', 'Failed to delete receipt.');
            }
          }
        },
      ]
    );
  };

  const handleEditPress = (receipt: TransactionReceipt) => {
    setEditingReceipt(receipt);
    setEditModalVisible(true);
  };

  const handleCreateSubmit = async (newReceipt: Omit<TransactionReceipt, 'id'>) => {
    try {
      await createMutation.mutateAsync(newReceipt);
      refetch();
      setCreateModalVisible(false);
    } catch (err) {
      console.error('Failed to create receipt:', err);
      Alert.alert('Error', 'Failed to create receipt.');
    }
  };

  const handleEditSubmit = async (updatedReceipt: TransactionReceipt) => {
    try {
      await updateMutation.mutateAsync(updatedReceipt);
      refetch();
      setEditModalVisible(false);
      setEditingReceipt(null);
    } catch (err) {
      console.error('Failed to update receipt:', err);
      Alert.alert('Error', 'Failed to update receipt.');
    }
  };

  const renderItem = ({ item }: { item: TransactionReceipt }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.description}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Customer: {item.customerName}</Text>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Date: {formatDate(item.date)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => handleEditPress(item)}>
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
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading transaction receipts...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load transaction receipts.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!filteredData || filteredData.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No transaction receipts found.</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create New Receipt</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Transaction Receipts</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search receipts..."
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
          <RefreshControl
            refreshing={isLoading}
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Receipt</Text>
            {/* Form for creating a new receipt */}
            <TextInput style={styles.modalInput} placeholder="Description" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Customer Name" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Amount" keyboardType="numeric" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Status (completed/pending/failed)" placeholderTextColor={COLORS.muted} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.error }]} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.primary }]} onPress={() => handleCreateSubmit({
                amount: 100, currency: 'NGN', date: new Date().toISOString(), description: 'New Receipt', customerName: 'New Customer', status: 'pending'
              })}>
                <Text style={styles.modalButtonText}>Save</Text>
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
            <Text style={styles.modalTitle}>Edit Receipt</Text>
            {/* Form for editing an existing receipt */}
            <TextInput style={styles.modalInput} placeholder="Description" placeholderTextColor={COLORS.muted} value={editingReceipt?.description} />
            <TextInput style={styles.modalInput} placeholder="Customer Name" placeholderTextColor={COLORS.muted} value={editingReceipt?.customerName} />
            <TextInput style={styles.modalInput} placeholder="Amount" keyboardType="numeric" placeholderTextColor={COLORS.muted} value={editingReceipt?.amount.toString()} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={editingReceipt?.currency} />
            <TextInput style={styles.modalInput} placeholder="Status (completed/pending/failed)" placeholderTextColor={COLORS.muted} value={editingReceipt?.status} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.error }]} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.primary }]} onPress={() => editingReceipt && handleEditSubmit(editingReceipt)}>
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
    padding: 20,
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
  screenTitle: {
    color: COLORS.text,
    fontSize: 20,
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
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 5,
    margin: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
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
    borderRadius: 5,
  },
  statusText: {
    color: COLORS.background,
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
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 20,
    width: '80%',
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
  modalInput: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  },
  modalButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default TransactionReceiptsV2Screen;