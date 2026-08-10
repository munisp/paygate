import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, FlatList, TouchableOpacity, Alert, Modal, TextInput, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

type InsuranceItem = {
  id: string;
  policyNumber: string;
  provider: string;
  type: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'active' | 'inactive' | 'pending' | 'cancelled';
  startDate: string;
  endDate: string;
};

const ConsumerInsuranceScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InsuranceItem | null>(null);

  const [newPolicyNumber, setNewPolicyNumber] = useState('');
  const [newProvider, setNewProvider] = useState('');
  const [newType, setNewType] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [newStatus, setNewStatus] = useState<'active' | 'inactive' | 'pending' | 'cancelled'>('pending');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');

  const [editPolicyNumber, setEditPolicyNumber] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editType, setEditType] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive' | 'pending' | 'cancelled'>('pending');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const { data, isLoading, isError, refetch } = trpc.consumerInsurance.list.useQuery();
  const createMutation = trpc.consumerInsurance.create.useMutation();
  const updateMutation = trpc.consumerInsurance.update.useMutation();
  const deleteMutation = trpc.consumerInsurance.delete.useMutation();

  useEffect(() => {
    if (editingItem) {
      setEditPolicyNumber(editingItem.policyNumber);
      setEditProvider(editingItem.provider);
      setEditType(editingItem.type);
      setEditAmount(editingItem.amount.toString());
      setEditCurrency(editingItem.currency);
      setEditStatus(editingItem.status);
      setEditStartDate(editingItem.startDate);
      setEditEndDate(editingItem.endDate);
    }
  }, [editingItem]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter(item =>
      item.policyNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    if (currency === 'NGN') {
      return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (currency === 'USD') {
      return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return amount.toString();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getStatusBadgeStyle = (status: 'active' | 'inactive' | 'pending' | 'cancelled') => {
    switch (status) {
      case 'active': return { backgroundColor: COLORS.success };
      case 'inactive': return { backgroundColor: COLORS.muted };
      case 'pending': return { backgroundColor: COLORS.warning };
      case 'cancelled': return { backgroundColor: COLORS.error };
      default: return { backgroundColor: COLORS.muted };
    }
  };

  const handleCreatePolicy = async () => {
    try {
      await createMutation.mutateAsync({
        policyNumber: newPolicyNumber,
        provider: newProvider,
        type: newType,
        amount: parseFloat(newAmount),
        currency: newCurrency,
        status: newStatus,
        startDate: newStartDate || new Date().toISOString(),
        endDate: newEndDate || new Date().toISOString(),
      });
      refetch();
      setCreateModalVisible(false);
      setNewPolicyNumber('');
      setNewProvider('');
      setNewType('');
      setNewAmount('');
      setNewCurrency('NGN');
      setNewStatus('pending');
      setNewStartDate('');
      setNewEndDate('');
    } catch (error) {
      Alert.alert('Error', 'Failed to create policy.');
    }
  };

  const handleUpdatePolicy = async () => {
    if (!editingItem) return;
    try {
      await updateMutation.mutateAsync({
        id: editingItem.id,
        policyNumber: editPolicyNumber,
        provider: editProvider,
        type: editType,
        amount: parseFloat(editAmount),
        currency: editCurrency,
        status: editStatus,
        startDate: editStartDate,
        endDate: editEndDate,
      });
      refetch();
      setEditModalVisible(false);
      setEditingItem(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to update policy.');
    }
  };

  const handleDeletePolicy = (id: string) => {
    Alert.alert(
      'Delete Policy',
      'Are you sure you want to delete this policy?',
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
              Alert.alert('Error', 'Failed to delete policy.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (item: InsuranceItem) => {
    setEditingItem(item);
    setEditModalVisible(true);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading insurance policies...</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.centeredContent}>
          <Text style={styles.errorText}>Failed to load insurance policies.</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!filteredData || filteredData.length === 0) {
      return (
        <View style={styles.centeredContent}>
          <Text style={styles.emptyText}>No insurance policies found.</Text>
          <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
            <Text style={styles.createButtonText}>Add New Policy</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.policyNumber}</Text>
              <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
                <Text style={styles.statusBadgeText}>{item.status.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.cardText}>Provider: {item.provider}</Text>
            <Text style={styles.cardText}>Type: {item.type}</Text>
            <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
            <Text style={styles.cardText}>Start Date: {formatDate(item.startDate)}</Text>
            <Text style={styles.cardText}>End Date: {formatDate(item.endDate)}</Text>
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeletePolicy(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={COLORS.primary}
          />
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Consumer Insurance</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.headerAddButton}>
          <Text style={styles.headerAddButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search policies..."
          placeholderTextColor={COLORS.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {renderContent()}
      </View>

      {/* Create Policy Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Policy</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Policy Number"
              placeholderTextColor={COLORS.muted}
              value={newPolicyNumber}
              onChangeText={setNewPolicyNumber}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Provider"
              placeholderTextColor={COLORS.muted}
              value={newProvider}
              onChangeText={setNewProvider}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Type"
              placeholderTextColor={COLORS.muted}
              value={newType}
              onChangeText={setNewType}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newAmount}
              onChangeText={setNewAmount}
            />
            {/* Currency and Status selection can be implemented with Picker or custom components */}
            <TextInput
              style={styles.modalInput}
              placeholder="Start Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={newStartDate}
              onChangeText={setNewStartDate}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="End Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={newEndDate}
              onChangeText={setNewEndDate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)} style={[styles.modalButton, { backgroundColor: COLORS.error }]}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreatePolicy} style={[styles.modalButton, { backgroundColor: COLORS.success }]}>
                <Text style={styles.modalButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Policy Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Policy</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Policy Number"
              placeholderTextColor={COLORS.muted}
              value={editPolicyNumber}
              onChangeText={setEditPolicyNumber}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Provider"
              placeholderTextColor={COLORS.muted}
              value={editProvider}
              onChangeText={setEditProvider}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Type"
              placeholderTextColor={COLORS.muted}
              value={editType}
              onChangeText={setEditType}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={editAmount}
              onChangeText={setEditAmount}
            />
            {/* Currency and Status selection can be implemented with Picker or custom components */}
            <TextInput
              style={styles.modalInput}
              placeholder="Start Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={editStartDate}
              onChangeText={setEditStartDate}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="End Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={editEndDate}
              onChangeText={setEditEndDate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} style={[styles.modalButton, { backgroundColor: COLORS.error }]}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleUpdatePolicy} style={[styles.modalButton, { backgroundColor: COLORS.primary }]}>
                <Text style={styles.modalButtonText}>Update</Text>
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
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerAddButton: {
    backgroundColor: COLORS.primary,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAddButtonText: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 20,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
  },
  errorText: {
    color: COLORS.error,
    marginTop: 10,
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    marginTop: 10,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 15,
  },
  retryButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 15,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 2,
  },
  cardActions: {
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
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 10,
    color: COLORS.text,
    backgroundColor: COLORS.card,
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
  },
  modalButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default ConsumerInsuranceScreen;
