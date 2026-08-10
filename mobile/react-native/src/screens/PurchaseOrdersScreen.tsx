import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, FlatList, StyleSheet, RefreshControl, Alert, TouchableOpacity, Modal, TextInput, Button } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

type PurchaseOrder = {
  id: string;
  orderId: string;
  supplier: string;
  amount: number;
  currency: '₦' | '$';
  status: 'Pending' | 'Approved' | 'Rejected' | 'Completed';
  orderDate: string;
};

const PurchaseOrdersScreen = () => {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<PurchaseOrder | null>(null);
  const [newOrderData, setNewOrderData] = useState({
    orderId: '',
    supplier: '',
    amount: '',
    currency: '$',
    status: 'Pending',
    orderDate: new Date().toISOString().split('T')[0],
  });

  // tRPC queries and mutations
  const { data: purchaseOrders, isLoading, isError, refetch } = trpc.purchaseOrders.list.useQuery();
  const createMutation = trpc.purchaseOrders.create.useMutation();
  const updateMutation = trpc.purchaseOrders.update.useMutation();
  const deleteMutation = trpc.purchaseOrders.delete.useMutation();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleCreateOrder = async () => {
    try {
      await createMutation.mutateAsync({
        ...newOrderData,
        amount: parseFloat(newOrderData.amount),
      });
      setCreateModalVisible(false);
      setNewOrderData({
        orderId: '',
        supplier: '',
        amount: '',
        currency: '$',
        status: 'Pending',
        orderDate: new Date().toISOString().split('T')[0],
      });
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create purchase order.');
    }
  };

  const handleUpdateOrder = async () => {
    if (!currentOrder) return;
    try {
      await updateMutation.mutateAsync({
        id: currentOrder.id,
        ...newOrderData,
        amount: parseFloat(newOrderData.amount),
      });
      setEditModalVisible(false);
      setCurrentOrder(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update purchase order.');
    }
  };

  const handleDeleteOrder = (id: string) => {
    Alert.alert(
      'Delete Order',
      'Are you sure you want to delete this purchase order?',
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
              Alert.alert('Error', 'Failed to delete purchase order.');
            }
          },
        },
      ]
    );
  };

  const renderStatusBadge = (status: PurchaseOrder['status']) => {
    let backgroundColor;
    let textColor = COLORS.background;
    switch (status) {
      case 'Pending':
        backgroundColor = COLORS.warning;
        break;
      case 'Approved':
        backgroundColor = COLORS.success;
        break;
      case 'Rejected':
        backgroundColor = COLORS.error;
        break;
      case 'Completed':
        backgroundColor = COLORS.primary;
        textColor = COLORS.text;
        break;
      default:
        backgroundColor = COLORS.muted;
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor }]}>
        <Text style={[styles.statusBadgeText, { color: textColor }]}>{status}</Text>
      </View>
    );
  };

  const formatAmount = (amount: number, currency: '₦' | '$') => {
    return `${currency} ${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const renderItem = ({ item }: { item: PurchaseOrder }) => (
    <View style={styles.orderCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.orderId}>#{item.orderId}</Text>
        {renderStatusBadge(item.status)}
      </View>
      <Text style={styles.supplierText}>Supplier: {item.supplier}</Text>
      <Text style={styles.amountText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.dateText}>Order Date: {formatDate(item.orderDate)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} 
          onPress={() => {
            setCurrentOrder(item);
            setNewOrderData({
              orderId: item.orderId,
              supplier: item.supplier,
              amount: item.amount.toString(),
              currency: item.currency,
              status: item.status,
              orderDate: new Date(item.orderDate).toISOString().split('T')[0],
            });
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error }]} 
          onPress={() => handleDeleteOrder(item.id)}
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
        <Text style={styles.loadingText}>Loading purchase orders...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load purchase orders.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Purchase Orders</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Create Order</Text>
        </TouchableOpacity>
      </View>

      {purchaseOrders && purchaseOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No purchase orders found.</Text>
          <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
            <Text style={styles.createButtonText}>Create First Order</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={purchaseOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
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
            <Text style={styles.modalTitle}>Create New Purchase Order</Text>
            <TextInput
              style={styles.input}
              placeholder="Order ID"
              placeholderTextColor={COLORS.muted}
              value={newOrderData.orderId}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, orderId: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Supplier"
              placeholderTextColor={COLORS.muted}
              value={newOrderData.supplier}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, supplier: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newOrderData.amount}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, amount: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (₦ or $)"
              placeholderTextColor={COLORS.muted}
              value={newOrderData.currency}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, currency: text as '₦' | '$' })}
            />
            <TextInput
              style={styles.input}
              placeholder="Status (Pending, Approved, Rejected, Completed)"
              placeholderTextColor={COLORS.muted}
              value={newOrderData.status}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, status: text as 'Pending' | 'Approved' | 'Rejected' | 'Completed' })}
            />
            <TextInput
              style={styles.input}
              placeholder="Order Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={newOrderData.orderDate}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, orderDate: text })}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.muted }]} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.primary }]} onPress={handleCreateOrder}>
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
            <Text style={styles.modalTitle}>Edit Purchase Order</Text>
            <TextInput
              style={styles.input}
              placeholder="Order ID"
              placeholderTextColor={COLORS.muted}
              value={newOrderData.orderId}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, orderId: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Supplier"
              placeholderTextColor={COLORS.muted}
              value={newOrderData.supplier}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, supplier: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newOrderData.amount}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, amount: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (₦ or $)"
              placeholderTextColor={COLORS.muted}
              value={newOrderData.currency}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, currency: text as '₦' | '$' })}
            />
            <TextInput
              style={styles.input}
              placeholder="Status (Pending, Approved, Rejected, Completed)"
              placeholderTextColor={COLORS.muted}
              value={newOrderData.status}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, status: text as 'Pending' | 'Approved' | 'Rejected' | 'Completed' })}
            />
            <TextInput
              style={styles.input}
              placeholder="Order Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={newOrderData.orderDate}
              onChangeText={(text) => setNewOrderData({ ...newOrderData, orderDate: text })}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.muted }]} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.primary }]} onPress={handleUpdateOrder}>
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
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  listContentContainer: {
    padding: 16,
  },
  orderCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
  orderId: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  supplierText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  amountText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  dateText: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 10,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    width: '90%',
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: COLORS.background,
    color: COLORS.text,
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  modalButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default PurchaseOrdersScreen;