import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, FlatList, RefreshControl, Alert, TextInput, TouchableOpacity, Modal, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
  if (currency === 'NGN') {
    return `₦${amount.toFixed(2)}`;
  } else if (currency === 'USD') {
    return `$${amount.toFixed(2)}`;
  }
  return amount.toFixed(2);
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

interface EMICheckoutItem {
  id: string;
  merchantName: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  dueDate: string;
}

const EMICheckoutScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<EMICheckoutItem | null>(null);

  const [newMerchantName, setNewMerchantName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [newDueDate, setNewDueDate] = useState('');

  const { data, isLoading, isError, error, refetch } = trpc.emiCheckout.list.useQuery();
  const createMutation = trpc.emiCheckout.create.useMutation();
  const updateMutation = trpc.emiCheckout.update.useMutation();
  const deleteMutation = trpc.emiCheckout.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (createMutation.isSuccess || updateMutation.isSuccess || deleteMutation.isSuccess) {
      refetch();
    }
  }, [createMutation.isSuccess, updateMutation.isSuccess, deleteMutation.isSuccess, refetch]);

  const filteredData = data?.filter(item =>
    item.merchantName.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreate = () => {
    if (!newMerchantName || !newAmount || !newDueDate) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    createMutation.mutate({
      merchantName: newMerchantName,
      amount: parseFloat(newAmount),
      currency: newCurrency,
      dueDate: newDueDate,
    });
    setCreateModalVisible(false);
    setNewMerchantName('');
    setNewAmount('');
    setNewCurrency('NGN');
    setNewDueDate('');
  };

  const handleEdit = () => {
    if (!currentItem || !newMerchantName || !newAmount || !newDueDate) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    updateMutation.mutate({
      id: currentItem.id,
      merchantName: newMerchantName,
      amount: parseFloat(newAmount),
      currency: newCurrency,
      dueDate: newDueDate,
    });
    setEditModalVisible(false);
    setCurrentItem(null);
    setNewMerchantName('');
    setNewAmount('');
    setNewCurrency('NGN');
    setNewDueDate('');
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this EMI checkout item?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id }) },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (item: EMICheckoutItem) => {
    setCurrentItem(item);
    setNewMerchantName(item.merchantName);
    setNewAmount(item.amount.toString());
    setNewCurrency(item.currency);
    setNewDueDate(item.dueDate);
    setEditModalVisible(true);
  };

  const renderItem = ({ item }: { item: EMICheckoutItem }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle}>{item.merchantName}</Text>
        <Text style={[styles.statusBadge, styles[`status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`]]}>
          {item.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.itemDetail}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.itemDetail}>Created: {formatDate(item.createdAt)}</Text>
      <Text style={styles.itemDetail}>Due: {formatDate(item.dueDate)}</Text>
      <View style={styles.itemActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]}
          onPress={() => openEditModal(item)}
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
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading EMI Checkouts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error?.message}</Text>
          <TouchableOpacity onPress={refetch} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!filteredData || filteredData.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>EMI Checkout</Text>
          <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addButton}>
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No EMI checkouts found.</Text>
          <TouchableOpacity onPress={refetch} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={[styles.retryButton, { marginTop: 10 }]}>
            <Text style={styles.retryButtonText}>Create New</Text>
          </TouchableOpacity>
        </View>
        {/* Create Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={isCreateModalVisible}
          onRequestClose={() => setCreateModalVisible(false)}
        >
          <View style={styles.centeredView}>
            <View style={styles.modalView}>
              <Text style={styles.modalTitle}>Create New EMI Checkout</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Merchant Name"
                placeholderTextColor={COLORS.muted}
                value={newMerchantName}
                onChangeText={setNewMerchantName}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Amount"
                placeholderTextColor={COLORS.muted}
                keyboardType="numeric"
                value={newAmount}
                onChangeText={setNewAmount}
              />
              <View style={styles.currencySelector}>
                <TouchableOpacity
                  style={[styles.currencyButton, newCurrency === 'NGN' && styles.currencyButtonActive]}
                  onPress={() => setNewCurrency('NGN')}
                >
                  <Text style={styles.currencyButtonText}>NGN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.currencyButton, newCurrency === 'USD' && styles.currencyButtonActive]}
                  onPress={() => setNewCurrency('USD')}
                >
                  <Text style={styles.currencyButtonText}>USD</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Due Date (YYYY-MM-DD)"
                placeholderTextColor={COLORS.muted}
                value={newDueDate}
                onChangeText={setNewDueDate}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: COLORS.error }]}
                  onPress={() => setCreateModalVisible(false)}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                  onPress={handleCreate}
                >
                  <Text style={styles.modalButtonText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>EMI Checkout</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addButton}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by merchant name..."
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
            refreshing={isLoading || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending}
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
            <Text style={styles.modalTitle}>Create New EMI Checkout</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Merchant Name"
              placeholderTextColor={COLORS.muted}
              value={newMerchantName}
              onChangeText={setNewMerchantName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newAmount}
              onChangeText={setNewAmount}
            />
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, newCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Due Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={newDueDate}
              onChangeText={setNewDueDate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.error }]}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                onPress={handleCreate}
              >
                <Text style={styles.modalButtonText}>Create</Text>
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit EMI Checkout</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Merchant Name"
              placeholderTextColor={COLORS.muted}
              value={newMerchantName}
              onChangeText={setNewMerchantName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newAmount}
              onChangeText={setNewAmount}
            />
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, newCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Due Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={newDueDate}
              onChangeText={setNewDueDate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.error }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: COLORS.primary }]}
                onPress={handleEdit}
              >
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
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.muted,
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
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
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
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  itemCard: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  itemDetail: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  statusCompleted: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusFailed: {
    backgroundColor: COLORS.error,
    color: COLORS.background,
  },
  itemActions: {
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
  modalInput: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencySelector: {
    flexDirection: 'row',
    marginBottom: 15,
    width: '100%',
    justifyContent: 'space-around',
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    borderRadius: 5,
    padding: 10,
    elevation: 2,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default EMICheckoutScreen;
