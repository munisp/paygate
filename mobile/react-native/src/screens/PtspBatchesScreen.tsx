
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
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Button,
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

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  const locale = currency === 'NGN' ? 'en-NG' : 'en-US';
  const options = {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  return new Intl.NumberFormat(locale, options).format(amount);
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
};

type PtspBatch = {
  id: string;
  name: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  totalAmount: number;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
};

const PtspBatchesScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<PtspBatch | null>(null);
  const [newBatchName, setNewBatchName] = useState('');
  const [editBatchName, setEditBatchName] = useState('');

  const { data, isLoading, isError, refetch, isRefetching } = trpc.ptspBatches.list.useQuery();
  const createMutation = trpc.ptspBatches.create.useMutation();
  const updateMutation = trpc.ptspBatches.update.useMutation();
  const deleteMutation = trpc.ptspBatches.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter(batch =>
      batch.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) {
      Alert.alert('Error', 'Batch name cannot be empty.');
      return;
    }
    try {
      await createMutation.mutateAsync({ name: newBatchName });
      setCreateModalVisible(false);
      setNewBatchName('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error creating batch', error.message || 'An unknown error occurred.');
    }
  };

  const handleEditBatch = async () => {
    if (!currentBatch || !editBatchName.trim()) {
      Alert.alert('Error', 'Batch name cannot be empty.');
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: currentBatch.id, name: editBatchName });
      setEditModalVisible(false);
      setCurrentBatch(null);
      setEditBatchName('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error updating batch', error.message || 'An unknown error occurred.');
    }
  };

  const handleDeleteBatch = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this batch?',
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
              Alert.alert('Error deleting batch', error.message || 'An unknown error occurred.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (batch: PtspBatch) => {
    setCurrentBatch(batch);
    setEditBatchName(batch.name);
    setEditModalVisible(true);
  };

  const renderBatchItem = ({ item }: { item: PtspBatch }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.batchName}>{item.name}</Text>
        <View
          style={[
            styles.statusBadge,
            item.status === 'COMPLETED' && styles.statusCompleted,
            item.status === 'PENDING' && styles.statusPending,
            item.status === 'FAILED' && styles.statusFailed,
          ]}
        >
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.totalAmount)}</Text>
      <Text style={styles.cardText}>Transactions: {item.transactionCount}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteBatch(item.id)} style={[styles.actionButton, styles.deleteButton]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading batches...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load batches.</Text>
        <Button title="Retry" onPress={onRefresh} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>PTSP Batches</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Create Batch</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search batches..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No batches found.</Text>
          <Button title="Refresh" onPress={onRefresh} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderBatchItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Batch Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Batch</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Batch Name"
              placeholderTextColor={COLORS.muted}
              value={newBatchName}
              onChangeText={setNewBatchName}
            />
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreateBatch} color={COLORS.primary} disabled={createMutation.isLoading} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Batch Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Batch</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Batch Name"
              placeholderTextColor={COLORS.muted}
              value={editBatchName}
              onChangeText={setEditBatchName}
            />
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={handleEditBatch} color={COLORS.primary} disabled={updateMutation.isLoading} />
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
    marginBottom: 20,
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
    color: COLORS.text,
    paddingHorizontal: 15,
    margin: 16,
    marginBottom: 10,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  batchName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  statusCompleted: {
    backgroundColor: COLORS.success,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusFailed: {
    backgroundColor: COLORS.error,
  },
  statusText: {
    color: COLORS.background,
    fontWeight: 'bold',
    fontSize: 12,
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 5,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 12,
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
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalInput: {
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
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
});

export default PtspBatchesScreen;
