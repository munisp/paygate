import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, SafeAreaView, StatusBar, Alert, TouchableOpacity, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

type Settlement = {
  id: string;
  merchantId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  settlementDate: string;
  transactionCount: number;
};

const PTSPSettlementScreen = () => {
  const navigation = useNavigation();

  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [newSettlement, setNewSettlement] = useState({
    merchantId: '',
    amount: '',
    currency: 'NGN',
    settlementDate: new Date().toISOString().split('T')[0],
    transactionCount: '',
  });

  const createSettlementMutation = trpc.ptsp.createSettlement.useMutation();

  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentSettlement, setCurrentSettlement] = useState<Settlement | null>(null);

  const updateSettlementMutation = trpc.ptsp.updateSettlement.useMutation();
  const deleteSettlementMutation = trpc.ptsp.deleteSettlement.useMutation();

  const handleEditPress = (settlement: Settlement) => {
    setCurrentSettlement(settlement);
    setEditModalVisible(true);
  };

  const handleUpdateSettlement = async () => {
    if (!currentSettlement) return;
    try {
      await updateSettlementMutation.mutateAsync({
        id: currentSettlement.id,
        merchantId: currentSettlement.merchantId,
        amount: parseFloat(currentSettlement.amount.toString()),
        currency: currentSettlement.currency,
        settlementDate: new Date(currentSettlement.settlementDate).toISOString(),
        transactionCount: parseInt(currentSettlement.transactionCount.toString()),
      });
      setEditModalVisible(false);
      refetch();
      Alert.alert('Success', 'Settlement updated successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to update settlement.');
    }
  };

  const handleDeleteSettlement = (id: string) => {
    Alert.alert(
      'Delete Settlement',
      'Are you sure you want to delete this settlement?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteSettlementMutation.mutateAsync({ id });
            refetch();
            Alert.alert('Success', 'Settlement deleted successfully!');
          } catch (error) {
            Alert.alert('Error', 'Failed to delete settlement.');
          }
        } },
      ]
    );
  };

  const handleCreateSettlement = async () => {
    try {
      await createSettlementMutation.mutateAsync({
        merchantId: newSettlement.merchantId,
        amount: parseFloat(newSettlement.amount),
        currency: newSettlement.currency as 'NGN' | 'USD',
        settlementDate: new Date(newSettlement.settlementDate).toISOString(),
        transactionCount: parseInt(newSettlement.transactionCount),
      });
      setCreateModalVisible(false);
      refetch();
      Alert.alert('Success', 'Settlement created successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to create settlement.');
    }
  };

  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'FAILED'>('ALL');

  const { data, isLoading, isError, refetch } = trpc.ptsp.listSettlements.useQuery();

  const filteredData = data?.filter(item => {
    const matchesSearch = item.merchantId.toLowerCase().includes(searchText.toLowerCase()) ||
                          item.id.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const renderItem = ({ item }: { item: Settlement }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Settlement ID: {item.id}</Text>
      <Text style={styles.cardText}>Merchant ID: {item.merchantId}</Text>
      <Text style={styles.cardText}>Amount: {item.currency === 'NGN' ? '₦' : '$'} {item.amount.toFixed(2)}</Text>
      <Text style={styles.cardText}>Status: <Text style={{ color: item.status === 'COMPLETED' ? COLORS.success : item.status === 'FAILED' ? COLORS.error : COLORS.warning }}>{item.status}</Text></Text>
      <Text style={styles.cardText}>Date: {new Date(item.settlementDate).toLocaleDateString()}</Text>
      <Text style={styles.cardText}>Transactions: {item.transactionCount}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.buttonText}>View Details</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.warning }]} onPress={() => handleEditPress(item)}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.error }]} onPress={() => handleDeleteSettlement(item.id)}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading settlements...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load settlements. Please try again.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!data || data.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No settlements found.</Text>
        <Button title="Refresh" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.header}>PTSP Settlements</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by Merchant ID or Settlement ID"
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === 'ALL' && styles.filterButtonActive]}
          onPress={() => setFilterStatus('ALL')}
        >
          <Text style={styles.filterButtonText}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === 'PENDING' && styles.filterButtonActive]}
          onPress={() => setFilterStatus('PENDING')}
        >
          <Text style={styles.filterButtonText}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === 'COMPLETED' && styles.filterButtonActive]}
          onPress={() => setFilterStatus('COMPLETED')}
        >
          <Text style={styles.filterButtonText}>Completed</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === 'FAILED' && styles.filterButtonActive]}
          onPress={() => setFilterStatus('FAILED')}
        >
          <Text style={styles.filterButtonText}>Failed</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.button, styles.createButton]} onPress={() => setCreateModalVisible(true)}>
        <Text style={styles.buttonText}>Create New Settlement</Text>
      </TouchableOpacity>
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
          />
        }
      />

      {/* Create Settlement Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Settlement</Text>
            <TextInput
              style={styles.input}
              placeholder="Merchant ID"
              placeholderTextColor={COLORS.muted}
              value={newSettlement.merchantId}
              onChangeText={(text) => setNewSettlement({ ...newSettlement, merchantId: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newSettlement.amount}
              onChangeText={(text) => setNewSettlement({ ...newSettlement, amount: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={newSettlement.currency}
              onChangeText={(text) => setNewSettlement({ ...newSettlement, currency: text as 'NGN' | 'USD' })}
            />
            <TextInput
              style={styles.input}
              placeholder="Settlement Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={newSettlement.settlementDate}
              onChangeText={(text) => setNewSettlement({ ...newSettlement, settlementDate: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Transaction Count"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newSettlement.transactionCount}
              onChangeText={(text) => setNewSettlement({ ...newSettlement, transactionCount: text })}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleCreateSettlement}>
                <Text style={styles.buttonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Settlement Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Settlement</Text>
            {currentSettlement && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Merchant ID"
                  placeholderTextColor={COLORS.muted}
                  value={currentSettlement.merchantId}
                  onChangeText={(text) => setCurrentSettlement({ ...currentSettlement, merchantId: text })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Amount"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="numeric"
                  value={currentSettlement.amount.toString()}
                  onChangeText={(text) => setCurrentSettlement({ ...currentSettlement, amount: parseFloat(text) || 0 })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Currency (NGN or USD)"
                  placeholderTextColor={COLORS.muted}
                  value={currentSettlement.currency}
                  onChangeText={(text) => setCurrentSettlement({ ...currentSettlement, currency: text as 'NGN' | 'USD' })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Settlement Date (YYYY-MM-DD)"
                  placeholderTextColor={COLORS.muted}
                  value={currentSettlement.settlementDate.split('T')[0]}
                  onChangeText={(text) => setCurrentSettlement({ ...currentSettlement, settlementDate: text })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Transaction Count"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="numeric"
                  value={currentSettlement.transactionCount.toString()}
                  onChangeText={(text) => setCurrentSettlement({ ...currentSettlement, transactionCount: parseInt(text) || 0 })}
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setEditModalVisible(false)}>
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleUpdateSettlement}>
                    <Text style={styles.buttonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.text,
    marginTop: 10,
  },
  errorText: {
    color: COLORS.error,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    marginBottom: 10,
    textAlign: 'center',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    padding: 20,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 15,
    marginVertical: 8,
    marginHorizontal: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 3,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.success,
    alignSelf: 'center',
    marginVertical: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
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
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: COLORS.error,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    padding: 10,
    marginHorizontal: 10,
    marginBottom: 10,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 10,
    marginBottom: 10,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },
  filterButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default PTSPSettlementScreen;