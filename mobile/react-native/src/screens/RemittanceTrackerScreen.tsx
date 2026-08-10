import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
  if (currency === 'NGN') {
    return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (currency === 'USD') {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return amount.toString();
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-US', options);
};

interface Remittance {
  id: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  recipientName: string;
  createdAt: string;
  updatedAt: string;
}

const RemittanceTrackerScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingRemittance, setEditingRemittance] = useState<Remittance | null>(null);

  // State for Create Modal inputs
  const [newRecipientName, setNewRecipientName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState<'NGN' | 'USD'>('NGN');

  // State for Edit Modal inputs
  const [editRecipientName, setEditRecipientName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [editStatus, setEditStatus] = useState<'pending' | 'completed' | 'failed' | 'cancelled'>('pending');

  const { data: remittances, isLoading, isError, refetch, isRefetching } = trpc.remittances.list.useQuery();
  const createMutation = trpc.remittances.create.useMutation();
  const updateMutation = trpc.remittances.update.useMutation();
  const deleteMutation = trpc.remittances.delete.useMutation();

  useEffect(() => {
    if (editingRemittance) {
      setEditRecipientName(editingRemittance.recipientName);
      setEditAmount(editingRemittance.amount.toString());
      setEditCurrency(editingRemittance.currency);
      setEditStatus(editingRemittance.status);
    }
  }, [editingRemittance]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredRemittances = remittances?.filter(remittance =>
    remittance.recipientName.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newRecipientName || !newAmount || !newCurrency) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    const amountNum = parseFloat(newAmount);
    if (isNaN(amountNum)) {
      Alert.alert('Error', 'Amount must be a valid number.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        recipientName: newRecipientName,
        amount: amountNum,
        currency: newCurrency,
        status: 'pending', // Default status for new remittances
      });
      setCreateModalVisible(false);
      setNewRecipientName('');
      setNewAmount('');
      setNewCurrency('NGN');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', `Failed to create remittance: ${error.message || 'Unknown error'}`);
    }
  };

  const handleEdit = async () => {
    if (!editingRemittance) return;
    if (!editRecipientName || !editAmount || !editCurrency || !editStatus) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    const amountNum = parseFloat(editAmount);
    if (isNaN(amountNum)) {
      Alert.alert('Error', 'Amount must be a valid number.');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: editingRemittance.id,
        recipientName: editRecipientName,
        amount: amountNum,
        currency: editCurrency,
        status: editStatus,
      });
      setEditModalVisible(false);
      setEditingRemittance(null);
      refetch();
    } catch (error: any) {
      Alert.alert('Error', `Failed to update remittance: ${error.message || 'Unknown error'}`);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Remittance',
      'Are you sure you want to delete this remittance?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (error: any) {
              Alert.alert('Error', `Failed to delete remittance: ${error.message || 'Unknown error'}`);
            }
          },
        },
      ]
    );
  };

  const renderStatusBadge = (status: Remittance['status']) => {
    let color = COLORS.muted;
    let backgroundColor = COLORS.card;
    switch (status) {
      case 'completed':
        color = COLORS.success;
        backgroundColor = `${COLORS.success}30`; // Light tint
        break;
      case 'pending':
        color = COLORS.warning;
        backgroundColor = `${COLORS.warning}30`;
        break;
      case 'failed':
      case 'cancelled':
        color = COLORS.error;
        backgroundColor = `${COLORS.error}30`;
        break;
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor }]}>
        <Text style={{ color, fontSize: 12, fontWeight: 'bold' }}>{status.toUpperCase()}</Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: Remittance }) => (
    <View style={styles.remittanceCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.recipientName}>{item.recipientName}</Text>
        {renderStatusBadge(item.status)}
      </View>
      <Text style={styles.amountText}>{formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.dateText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} 
          onPress={() => {
            setEditingRemittance(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error }]} 
          onPress={() => handleDelete(item.id)}
        >
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading remittances...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load remittances.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Remittance Tracker</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Add Remittance</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by recipient name..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredRemittances?.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No remittances found.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredRemittances}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]} // For Android
              progressBackgroundColor={COLORS.card} // For Android
            />
          }
        />
      )}

      {/* Create Remittance Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Remittance</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Recipient Name"
              placeholderTextColor={COLORS.muted}
              value={newRecipientName}
              onChangeText={setNewRecipientName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              keyboardType="numeric"
              placeholderTextColor={COLORS.muted}
              value={newAmount}
              onChangeText={setNewAmount}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={newCurrency}
              onChangeText={(text) => setNewCurrency(text.toUpperCase() as 'NGN' | 'USD')}
              maxLength={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.error }]} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.primary }]} onPress={handleCreate}>
                <Text style={styles.actionButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Remittance Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Remittance</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Recipient Name"
              placeholderTextColor={COLORS.muted}
              value={editRecipientName}
              onChangeText={setEditRecipientName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              keyboardType="numeric"
              placeholderTextColor={COLORS.muted}
              value={editAmount}
              onChangeText={setEditAmount}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={editCurrency}
              onChangeText={(text) => setEditCurrency(text.toUpperCase() as 'NGN' | 'USD')}
              maxLength={3}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Status (pending, completed, failed, cancelled)"
              placeholderTextColor={COLORS.muted}
              value={editStatus}
              onChangeText={(text) => setEditStatus(text.toLowerCase() as 'pending' | 'completed' | 'failed' | 'cancelled')}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.error }]} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.primary }]} onPress={handleEdit}>
                <Text style={styles.actionButtonText}>Save</Text>
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
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
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
    color: COLORS.text,
    margin: 15,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContentContainer: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  remittanceCard: {
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
    marginBottom: 5,
  },
  recipientName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  amountText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 5,
  },
  dateText: {
    color: COLORS.muted,
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 15,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
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
    fontSize: 12,
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
    width: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalInput: {
    height: 40,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    marginBottom: 10,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 15,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
});

export default RemittanceTrackerScreen;