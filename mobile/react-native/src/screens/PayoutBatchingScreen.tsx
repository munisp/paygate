import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, TextInput, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface PayoutBatch {
  id: string;
  batchName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  amount: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
  updatedAt: string;
}

const PayoutBatchingScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingBatch, setEditingBatch] = useState<PayoutBatch | null>(null);

  useEffect(() => {
    if (editingBatch) {
      setEditBatchName(editingBatch.batchName);
      setEditBatchAmount(editingBatch.amount.toString());
      setEditBatchCurrency(editingBatch.currency);
      setEditBatchStatus(editingBatch.status);
    }
  }, [editingBatch]);
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchAmount, setNewBatchAmount] = useState('');
  const [newBatchCurrency, setNewBatchCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [newBatchStatus, setNewBatchStatus] = useState<'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>('PENDING');

  const [editBatchName, setEditBatchName] = useState('');
  const [editBatchAmount, setEditBatchAmount] = useState('');
  const [editBatchCurrency, setEditBatchCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [editBatchStatus, setEditBatchStatus] = useState<'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>('PENDING');

  const { data: batches, isLoading, isError, error, refetch } = trpc.payoutBatching.list.useQuery();
  const createBatchMutation = trpc.payoutBatching.create.useMutation();
  const updateBatchMutation = trpc.payoutBatching.update.useMutation();
  const deleteBatchMutation = trpc.payoutBatching.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Payout Batches...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Payout Batching</Text>
      </View>

      {/* Search and Filter */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search batches..."
          placeholderTextColor={COLORS.muted}
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create Batch</Text>
        </TouchableOpacity>
      </View>

      {/* FlatList */}
      {batches && batches.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No payout batches found.</Text>
          <Button title="Refresh" onPress={onRefresh} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={batches?.filter(batch =>
            batch.batchName.toLowerCase().includes(searchText.toLowerCase())
          )}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.batchItem}>
              <View style={styles.batchDetails}>
                <Text style={styles.batchName}>{item.batchName}</Text>
                <Text style={styles.batchAmount}>{item.currency === 'NGN' ? '₦' : '$'}{item.amount.toFixed(2)}</Text>
                <Text style={styles.batchDate}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>
              <View style={styles.batchActions}>
                <Text style={[styles.statusBadge, styles[`status${item.status}`]]}>{item.status}</Text>
                <TouchableOpacity onPress={() => { setEditingBatch(item); setEditModalVisible(true); }}>
                  <Text style={styles.actionButton}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert(
                  "Delete Batch",
                  `Are you sure you want to delete batch '${item.batchName}'?`,
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: async () => {
                      try {
                        await deleteBatchMutation.mutateAsync({ id: item.id });
                        refetch();
                      } catch (err) {
                        console.error("Failed to delete batch:", err);
                        Alert.alert("Error", "Failed to delete batch.");
                      }
                    } },
                  ]
                )}>
                  <Text style={[styles.actionButton, { color: COLORS.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          contentContainerStyle={styles.flatListContent}
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
            <Text style={styles.modalTitle}>Create New Payout Batch</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Batch Name"
              placeholderTextColor={COLORS.muted}
              value={newBatchName}
              onChangeText={setNewBatchName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newBatchAmount}
              onChangeText={setNewBatchAmount}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={newBatchCurrency}
                style={styles.picker}
                onValueChange={(itemValue) => setNewBatchCurrency(itemValue as 'NGN' | 'USD')}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="NGN" value="NGN" />
                <Picker.Item label="USD" value="USD" />
              </Picker>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <Picker
                selectedValue={newBatchStatus}
                style={styles.picker}
                onValueChange={(itemValue) => setNewBatchStatus(itemValue as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED')}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="PENDING" value="PENDING" />
                <Picker.Item label="PROCESSING" value="PROCESSING" />
                <Picker.Item label="COMPLETED" value="COMPLETED" />
                <Picker.Item label="FAILED" value="FAILED" />
              </Picker>
            </View>
            {createBatchMutation.isError && <Text style={styles.modalErrorText}>Error: {createBatchMutation.error?.message}</Text>}
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button
                title={createBatchMutation.isLoading ? "Creating..." : "Create"}
                onPress={async () => {
                  try {
                    await createBatchMutation.mutateAsync({
                      batchName: newBatchName,
                      amount: parseFloat(newBatchAmount),
                      currency: newBatchCurrency,
                      status: newBatchStatus,
                    });
                    setCreateModalVisible(false);
                    setNewBatchName('');
                    setNewBatchAmount('');
                    setNewBatchCurrency('NGN');
                    setNewBatchStatus('PENDING');
                    refetch();
                  } catch (err) {
                    console.error("Failed to create batch:", err);
                  }
                }}
                color={COLORS.primary}
                disabled={createBatchMutation.isLoading}
              />
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
            <Text style={styles.modalTitle}>Edit Payout Batch</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Batch Name"
              placeholderTextColor={COLORS.muted}
              value={editBatchName}
              onChangeText={setEditBatchName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={editBatchAmount}
              onChangeText={setEditBatchAmount}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={editBatchCurrency}
                style={styles.picker}
                onValueChange={(itemValue) => setEditBatchCurrency(itemValue as 'NGN' | 'USD')}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="NGN" value="NGN" />
                <Picker.Item label="USD" value="USD" />
              </Picker>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <Picker
                selectedValue={editBatchStatus}
                style={styles.picker}
                onValueChange={(itemValue) => setEditBatchStatus(itemValue as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED')}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="PENDING" value="PENDING" />
                <Picker.Item label="PROCESSING" value="PROCESSING" />
                <Picker.Item label="COMPLETED" value="COMPLETED" />
                <Picker.Item label="FAILED" value="FAILED" />
              </Picker>
            </View>
            {updateBatchMutation.isError && <Text style={styles.modalErrorText}>Error: {updateBatchMutation.error?.message}</Text>}
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button
                title={updateBatchMutation.isLoading ? "Saving..." : "Save"}
                onPress={async () => {
                  if (!editingBatch) return;
                  try {
                    await updateBatchMutation.mutateAsync({
                      id: editingBatch.id,
                      batchName: editBatchName,
                      amount: parseFloat(editBatchAmount),
                      currency: editBatchCurrency,
                      status: editBatchStatus,
                    });
                    setEditModalVisible(false);
                    setEditingBatch(null);
                    refetch();
                  } catch (err) {
                    console.error("Failed to update batch:", err);
                  }
                }}
                color={COLORS.primary}
                disabled={updateBatchMutation.isLoading}
              />
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  modalInput: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: COLORS.text,
    marginBottom: 15,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 15,
    backgroundColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  pickerLabel: {
    color: COLORS.muted,
    marginRight: 10,
  },
  picker: {
    flex: 1,
    color: COLORS.text,
  },
  pickerItem: {
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  modalErrorText: {
    color: COLORS.error,
    marginBottom: 10,
    textAlign: 'center',
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: COLORS.card,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: COLORS.text,
    marginRight: 10,
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
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  flatListContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  batchItem: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchDetails: {
    flex: 1,
  },
  batchName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  batchAmount: {
    fontSize: 16,
    color: COLORS.text,
    marginTop: 4,
  },
  batchDate: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },
  batchActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 5,
  },
  statusPENDING: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  statusPROCESSING: {
    backgroundColor: COLORS.primary,
    color: COLORS.text,
  },
  statusCOMPLETED: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusFAILED: {
    backgroundColor: COLORS.error,
    color: COLORS.text,
  },
  actionButton: {
    color: COLORS.primary,
    marginTop: 5,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
});

export default PayoutBatchingScreen;