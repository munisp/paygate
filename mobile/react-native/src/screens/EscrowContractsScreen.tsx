import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface EscrowContract {
  id: string;
  contractId: string;
  status: 'active' | 'pending' | 'completed' | 'cancelled';
  amount: number;
  currency: 'NGN' | 'USD';
  startDate: string;
  endDate: string;
  description: string;
}

const EscrowContractsScreen = () => {
  const navigation = useNavigation();

  const { data: contracts, isLoading, isError, error, refetch } = trpc.escrow.listContracts.useQuery();
  const createContractMutation = trpc.escrow.createContract.useMutation();
  const updateContractMutation = trpc.escrow.updateContract.useMutation();
  const deleteContractMutation = trpc.escrow.deleteContract.useMutation();

  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentContract, setCurrentContract] = useState<EscrowContract | null>(null);
  const [formContractId, setFormContractId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'pending' | 'completed' | 'cancelled'>('pending');
  const [searchText, setSearchText] = useState('');

  const onRefresh = useCallback(() => {
    refetch();
  }, []);

  useEffect(() => {
    if (createContractMutation.isSuccess || updateContractMutation.isSuccess || deleteContractMutation.isSuccess) {
      refetch();
    }
  }, [createContractMutation.isSuccess, updateContractMutation.isSuccess, deleteContractMutation.isSuccess, refetch]);

  const handleCreateContract = () => {
    if (!formContractId || !formDescription || !formAmount || !formStartDate || !formEndDate) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    createContractMutation.mutate({
      contractId: formContractId,
      description: formDescription,
      amount: parseFloat(formAmount),
      currency: formCurrency,
      startDate: formStartDate,
      endDate: formEndDate,
      status: formStatus,
    });
    setCreateModalVisible(false);
    resetForm();
  };

  const handleUpdateContract = () => {
    if (!currentContract || !formContractId || !formDescription || !formAmount || !formStartDate || !formEndDate) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    updateContractMutation.mutate({
      id: currentContract.id,
      contractId: formContractId,
      description: formDescription,
      amount: parseFloat(formAmount),
      currency: formCurrency,
      startDate: formStartDate,
      endDate: formEndDate,
      status: formStatus,
    });
    setEditModalVisible(false);
    resetForm();
  };

  const handleDeleteContract = (id: string) => {
    Alert.alert(
      'Delete Contract',
      'Are you sure you want to delete this contract?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteContractMutation.mutate({ id }) },
      ]
    );
  };

  const openCreateModal = () => {
    resetForm();
    setCreateModalVisible(true);
  };

  const openEditModal = (contract: EscrowContract) => {
    setCurrentContract(contract);
    setFormContractId(contract.contractId);
    setFormDescription(contract.description);
    setFormAmount(contract.amount.toString());
    setFormCurrency(contract.currency);
    setFormStartDate(contract.startDate);
    setFormEndDate(contract.endDate);
    setFormStatus(contract.status);
    setEditModalVisible(true);
  };

  const resetForm = () => {
    setFormContractId('');
    setFormDescription('');
    setFormAmount('');
    setFormCurrency('NGN');
    setFormStartDate('');
    setFormEndDate('');
    setFormStatus('pending');
    setCurrentContract(null);
  };

  const filteredContracts = useMemo(() => {
    if (!contracts) return [];
    return contracts.filter(contract =>
      contract.contractId.toLowerCase().includes(searchText.toLowerCase()) ||
      contract.description.toLowerCase().includes(searchText.toLowerCase()) ||
      contract.status.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [contracts, searchText]);

  const renderItem = ({ item }: { item: EscrowContract }) => (
    <View style={styles.contractCard}>
      <Text style={styles.contractId}>Contract ID: {item.contractId}</Text>
      <Text style={styles.contractDescription}>{item.description}</Text>
      <Text style={styles.contractAmount}>Amount: {item.currency === 'NGN' ? '₦' : '$'}{item.amount.toFixed(2)}</Text>
      <Text style={styles.contractDates}>Start Date: {new Date(item.startDate).toLocaleDateString()}</Text>
      <Text style={styles.contractDates}>End Date: {new Date(item.endDate).toLocaleDateString()}</Text>
      <Text style={[styles.statusBadge, styles[`status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`]]}>
        {item.status.toUpperCase()}
      </Text>
      <View style={styles.actionButtons}>
        <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => openEditModal(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDeleteContract(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Escrow Contracts</Text>
        <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
          <Text style={styles.createButtonText}>+ Create</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search contracts..."
          placeholderTextColor={COLORS.muted}
          value={searchText}
          onChangeText={setSearchText}
        />
        {isLoading ? (
          <ActivityIndicator size="large" color={COLORS.primary} />
        ) : isError ? (
          <Text style={styles.errorText}>Error loading contracts: {error?.message}</Text>
        ) : filteredContracts && filteredContracts.length > 0 ? (
          <FlatList
            data={filteredContracts}
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
        ) : (
          <Text style={styles.emptyText}>No escrow contracts found.</Text>
        )}
      </View>

      {/* Create/Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible || isEditModalVisible}
        onRequestClose={() => {
          setCreateModalVisible(false);
          setEditModalVisible(false);
          resetForm();
        }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{currentContract ? 'Edit Contract' : 'Create New Contract'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Contract ID"
              placeholderTextColor={COLORS.muted}
              value={formContractId}
              onChangeText={setFormContractId}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={formDescription}
              onChangeText={setFormDescription}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={formAmount}
              onChangeText={setFormAmount}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <TouchableOpacity
                style={[styles.pickerOption, formCurrency === 'NGN' && styles.pickerOptionSelected]}
                onPress={() => setFormCurrency('NGN')}
              >
                <Text style={[styles.pickerOptionText, formCurrency === 'NGN' && styles.pickerOptionTextSelected]}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerOption, formCurrency === 'USD' && styles.pickerOptionSelected]}
                onPress={() => setFormCurrency('USD')}
              >
                <Text style={[styles.pickerOptionText, formCurrency === 'USD' && styles.pickerOptionTextSelected]}>USD</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Start Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={formStartDate}
              onChangeText={setFormStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="End Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={formEndDate}
              onChangeText={setFormEndDate}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              {['active', 'pending', 'completed', 'cancelled'].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[styles.pickerOption, formStatus === status && styles.pickerOptionSelected]}
                  onPress={() => setFormStatus(status as 'active' | 'pending' | 'completed' | 'cancelled')}
                >
                  <Text style={[styles.pickerOptionText, formStatus === status && styles.pickerOptionTextSelected]}>{status.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelModalButton]} onPress={() => {
                setCreateModalVisible(false);
                setEditModalVisible(false);
                resetForm();
              }}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveModalButton]}
                onPress={currentContract ? handleUpdateContract : handleCreateContract}
              >
                <Text style={styles.modalButtonText}>{currentContract ? 'Save Changes' : 'Create'}</Text>
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
    fontSize: 22,
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
  content: {
    flex: 1,
    padding: 16,
  },
  searchInput: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 15,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  contractCard: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contractId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5,
  },
  contractDescription: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 5,
  },
  contractAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 5,
  },
  contractDates: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 3,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    marginTop: 8,
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusActive: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  statusCompleted: {
    backgroundColor: COLORS.primary,
    color: COLORS.text,
  },
  statusCancelled: {
    backgroundColor: COLORS.error,
    color: COLORS.text,
  },
  actionButtons: {
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
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.card,
    borderRadius: 10,
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
    backgroundColor: COLORS.background,
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
    justifyContent: 'space-around',
    backgroundColor: COLORS.background,
    borderRadius: 5,
    padding: 5,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  pickerLabel: {
    color: COLORS.muted,
    marginRight: 10,
  },
  pickerOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: COLORS.background,
    marginHorizontal: 5,
  },
  pickerOptionSelected: {
    backgroundColor: COLORS.primary,
  },
  pickerOptionText: {
    color: COLORS.text,
  },
  pickerOptionTextSelected: {
    color: COLORS.background,
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    borderRadius: 5,
    padding: 10,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelModalButton: {
    backgroundColor: COLORS.muted,
  },
  saveModalButton: {
    backgroundColor: COLORS.primary,
  },
  modalButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default EscrowContractsScreen;
