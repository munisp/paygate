import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface ConsumerDispute {
  id: string;
  consumerName: string;
  merchantName: string;
  amount: number;
  currency: '₦' | '$';
  status: 'Pending' | 'Resolved' | 'Rejected';
  createdAt: string;
  updatedAt: string;
  description: string;
}

const ConsumerDisputesScreen: React.FC = () => {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentDispute, setCurrentDispute] = useState<Partial<ConsumerDispute> | null>(null);
  const [searchText, setSearchText] = useState('');

  const { data: disputes, isLoading, isError, error, refetch } = trpc.consumerDisputes.list.useQuery();
  const createDisputeMutation = trpc.consumerDisputes.create.useMutation();
  const updateDisputeMutation = trpc.consumerDisputes.update.useMutation();
  const deleteDisputeMutation = trpc.consumerDisputes.delete.useMutation();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDeleteDispute = (id: string) => {
    Alert.alert(
      'Delete Dispute',
      'Are you sure you want to delete this dispute?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await deleteDisputeMutation.mutateAsync({ id });
              refetch();
            } catch (err: any) {
              Alert.alert('Error deleting dispute', err.message);
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  };

  const handleCreateDispute = async () => {
    if (currentDispute?.consumerName && currentDispute?.merchantName && currentDispute?.amount && currentDispute?.description) {
      try {
        await createDisputeMutation.mutateAsync({
          consumerName: currentDispute.consumerName,
          merchantName: currentDispute.merchantName,
          amount: currentDispute.amount,
          currency: currentDispute.currency || '₦', // Default to Naira
          description: currentDispute.description,
        });
        setCreateModalVisible(false);
        setCurrentDispute(null);
        refetch();
      } catch (err: any) {
        Alert.alert('Error creating dispute', err.message);
      }
    } else {
      Alert.alert('Error', 'Please fill all required fields.');
    }
  };

  const handleUpdateDispute = async () => {
    if (currentDispute?.id && currentDispute?.consumerName && currentDispute?.merchantName && currentDispute?.amount && currentDispute?.description && currentDispute?.status && currentDispute?.currency) {
      try {
        await updateDisputeMutation.mutateAsync({
          id: currentDispute.id,
          consumerName: currentDispute.consumerName,
          merchantName: currentDispute.merchantName,
          amount: currentDispute.amount,
          currency: currentDispute.currency,
          status: currentDispute.status,
          description: currentDispute.description,
        });
        setEditModalVisible(false);
        setCurrentDispute(null);
        refetch();
      } catch (err: any) {
        Alert.alert('Error updating dispute', err.message);
      }
    } else {
      Alert.alert('Error', 'Please fill all required fields.');
    }
  };

  const openCreateModal = () => {
    setCurrentDispute({ currency: '₦', status: 'Pending' }); // Initialize with default currency and status
    setCreateModalVisible(true);
  };

  const openEditModal = (dispute: ConsumerDispute) => {
    setCurrentDispute(dispute);
    setEditModalVisible(true);
  };

  const getStatusBadgeStyle = (status: ConsumerDispute['status']) => {
    switch (status) {
      case 'Resolved':
        return styles.statusResolved;
      case 'Rejected':
        return styles.statusRejected;
      case 'Pending':
      default:
        return styles.statusPending;
    }
  };

  const formatAmount = (amount: number, currency: '₦' | '$') => {
    return `${currency} ${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const filteredDisputes = useMemo(() => {
    if (!disputes) return [];
    return disputes.filter(dispute =>
      dispute.consumerName.toLowerCase().includes(searchText.toLowerCase()) ||
      dispute.merchantName.toLowerCase().includes(searchText.toLowerCase()) ||
      dispute.description.toLowerCase().includes(searchText.toLowerCase()) ||
      dispute.status.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [disputes, searchText]);

  const renderItem = ({ item }: { item: ConsumerDispute }) => (
    <TouchableOpacity onPress={() => openEditModal(item)} style={styles.disputeCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.disputeTitle}>Dispute ID: {item.id}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusBadgeText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.disputeText}>Consumer: {item.consumerName}</Text>
      <Text style={styles.disputeText}>Merchant: {item.merchantName}</Text>
      <Text style={styles.disputeText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.disputeText}>Created: {formatDate(item.createdAt)}</Text>
      <Text style={styles.disputeText}>Description: {item.description}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteDispute(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Consumer Disputes</Text>
        <TouchableOpacity onPress={openCreateModal} style={styles.addButton}>
          <Text style={styles.addButtonText}>Add Dispute</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search disputes..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <View style={styles.content}>
        {isLoading && <ActivityIndicator size="large" color={COLORS.primary} />}
        {isError && <Text style={styles.errorText}>Error: {error?.message}</Text>}
        {!isLoading && !isError && (!filteredDisputes || filteredDisputes.length === 0) && (
          <Text style={styles.emptyText}>No disputes found.</Text>
        )}
        {!isLoading && !isError && filteredDisputes && filteredDisputes.length > 0 && (
          <FlatList
            data={filteredDisputes}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.flatListContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
              />
            }
          />
        )}
      </View>

      {/* Create Dispute Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Dispute</Text>
            <TextInput
              style={styles.input}
              placeholder="Consumer Name"
              placeholderTextColor={COLORS.muted}
              value={currentDispute?.consumerName || ''}
              onChangeText={(text) => setCurrentDispute({ ...currentDispute, consumerName: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Merchant Name"
              placeholderTextColor={COLORS.muted}
              value={currentDispute?.merchantName || ''}
              onChangeText={(text) => setCurrentDispute({ ...currentDispute, merchantName: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentDispute?.amount ? String(currentDispute.amount) : ''}
              onChangeText={(text) => setCurrentDispute({ ...currentDispute, amount: parseFloat(text) || 0 })}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={currentDispute?.description || ''}
              onChangeText={(text) => setCurrentDispute({ ...currentDispute, description: text })}
              multiline
            />
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreateDispute} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Dispute Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Dispute</Text>
            <TextInput
              style={styles.input}
              placeholder="Consumer Name"
              placeholderTextColor={COLORS.muted}
              value={currentDispute?.consumerName || ''}
              onChangeText={(text) => setCurrentDispute({ ...currentDispute, consumerName: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Merchant Name"
              placeholderTextColor={COLORS.muted}
              value={currentDispute?.merchantName || ''}
              onChangeText={(text) => setCurrentDispute({ ...currentDispute, merchantName: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentDispute?.amount ? String(currentDispute.amount) : ''}
              onChangeText={(text) => setCurrentDispute({ ...currentDispute, amount: parseFloat(text) || 0 })}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={currentDispute?.description || ''}
              onChangeText={(text) => setCurrentDispute({ ...currentDispute, description: text })}
              multiline
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <Picker
                selectedValue={currentDispute?.status || 'Pending'}
                style={styles.picker}
                onValueChange={(itemValue) => setCurrentDispute({ ...currentDispute, status: itemValue as ConsumerDispute['status'] })}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="Pending" value="Pending" />
                <Picker.Item label="Resolved" value="Resolved" />
                <Picker.Item label="Rejected" value="Rejected" />
              </Picker>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={currentDispute?.currency || '₦'}
                style={styles.picker}
                onValueChange={(itemValue) => setCurrentDispute({ ...currentDispute, currency: itemValue as ConsumerDispute['currency'] })}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="₦ Naira" value="₦" />
                <Picker.Item label="$ USD" value="$" />
              </Picker>
            </View>
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Update" onPress={handleUpdateDispute} color={COLORS.primary} />
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
  addButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  addButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    borderRadius: 5,
    padding: 10,
    margin: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
  },
  disputeCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    width: '100%',
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  disputeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  disputeText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 15,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusResolved: {
    backgroundColor: COLORS.success,
  },
  statusRejected: {
    backgroundColor: COLORS.error,
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
  flatListContent: {
    paddingBottom: 20,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
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
  input: {
    width: '100%',
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 15,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
    width: '100%',
    height: 50,
    overflow: 'hidden', // Ensures picker content stays within bounds
  },
  pickerLabel: {
    color: COLORS.muted,
    fontSize: 16,
    paddingLeft: 10,
  },
  picker: {
    flex: 1,
    color: COLORS.text,
    height: 50,
  },
  pickerItem: {
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
});

export default ConsumerDisputesScreen;