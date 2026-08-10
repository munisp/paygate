import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, Alert, TextInput, TouchableOpacity, Modal, Button, SafeAreaView, StatusBar, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface Order {
  id: string;
  restaurantId: string;
  customerName: string;
  amount: number;
  currency: '₦' | '$';
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

const RestaurantOrdersScreen: React.FC = () => {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState<'₦' | '$'>('$');
  const [formStatus, setFormStatus] = useState<'pending' | 'completed' | 'cancelled'>('pending');

  const { data: orders, isLoading, isError, error, refetch } = trpc.restaurantOrders.list.useQuery();
  const createOrderMutation = trpc.restaurantOrders.create.useMutation();
  const updateOrderMutation = trpc.restaurantOrders.update.useMutation();
  const deleteOrderMutation = trpc.restaurantOrders.delete.useMutation();

  useEffect(() => {
    if (currentOrder) {
      setFormCustomerName(currentOrder.customerName);
      setFormAmount(currentOrder.amount.toString());
      setFormCurrency(currentOrder.currency);
      setFormStatus(currentOrder.status);
    } else {
      setFormCustomerName('');
      setFormAmount('');
      setFormCurrency('$');
      setFormStatus('pending');
    }
  }, [currentOrder]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filteredOrders = orders?.filter(order => {
    const matchesSearch = order.customerName.toLowerCase().includes(searchText.toLowerCase()) ||
                          order.id.toLowerCase().includes(searchText.toLowerCase());
    const matchesFilter = filterStatus === 'all' || order.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const handleCreateOrUpdateOrder = async () => {
    if (!formCustomerName || !formAmount) {
      Alert.alert('Error', 'Customer Name and Amount are required.');
      return;
    }
    const amountNum = parseFloat(formAmount);
    if (isNaN(amountNum)) {
      Alert.alert('Error', 'Invalid amount.');
      return;
    }

    try {
      const orderData = {
        restaurantId: 'restaurant123', // Placeholder, ideally from context or user input
        customerName: formCustomerName,
        amount: amountNum,
        currency: formCurrency,
        status: formStatus,
      };

      if (currentOrder) {
        await updateOrderMutation.mutateAsync({ id: currentOrder.id, ...orderData });
      } else {
        await createOrderMutation.mutateAsync(orderData);
      }
      refetch();
      setModalVisible(false);
      setCurrentOrder(null);
    } catch (err) {
      Alert.alert('Error', `Failed to save order: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDeleteOrder = (orderId: string) => {
    Alert.alert(
      'Delete Order',
      'Are you sure you want to delete this order?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOrderMutation.mutateAsync({ id: orderId });
              refetch();
            } catch (err) {
              Alert.alert('Error', `Failed to delete order: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const getStatusBadgeStyle = (status: Order['status']) => {
    switch (status) {
      case 'completed': return { backgroundColor: COLORS.success };
      case 'pending': return { backgroundColor: COLORS.warning };
      case 'cancelled': return { backgroundColor: COLORS.error };
      default: return { backgroundColor: COLORS.muted };
    }
  };

  const formatAmount = (amount: number, currency: '₦' | '$') => {
    return `${currency} ${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const renderOrderItem = ({ item }: { item: Order }) => (
    <View style={styles.orderItem}>
      <View style={styles.orderItemHeader}>
        <Text style={styles.orderIdText}>Order ID: {item.id}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusBadgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.orderItemText}>Customer: {item.customerName}</Text>
      <Text style={styles.orderItemText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.orderItemText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.orderActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} 
          onPress={() => { setCurrentOrder(item); setModalVisible(true); }}
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Restaurant Orders</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => { setCurrentOrder(null); setModalVisible(true); }}
        >
          <Text style={styles.createButtonText}>+ Add Order</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchFilterContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by customer or ID..."
          placeholderTextColor={COLORS.muted}
          value={searchText}
          onChangeText={setSearchText}
        />
        <View style={styles.filterButtons}>
          {['all', 'pending', 'completed', 'cancelled'].map((status) => (
            <TouchableOpacity
              key={status}
              style={[styles.filterButton, filterStatus === status && styles.filterButtonActive]}
              onPress={() => setFilterStatus(status as 'all' | 'pending' | 'completed' | 'cancelled')}
            >
              <Text style={styles.filterButtonText}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.content}>
        {isLoading && <ActivityIndicator size="large" color={COLORS.primary} />}
        {isError && <Text style={styles.errorText}>Error: {error?.message}</Text>}
        {!isLoading && !isError && (!filteredOrders || filteredOrders.length === 0) && (
          <Text style={styles.emptyText}>No orders found.</Text>
        )}
        {!isLoading && !isError && filteredOrders && filteredOrders.length > 0 && (
          <FlatList
            data={filteredOrders}
            keyExtractor={(item) => item.id}
            renderItem={renderOrderItem}
            contentContainerStyle={styles.flatListContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]} // For Android
                progressBackgroundColor={COLORS.card} // For Android
              />
            }
          />
        )}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{currentOrder ? 'Edit Order' : 'Create New Order'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Customer Name"
              placeholderTextColor={COLORS.muted}
              value={formCustomerName}
              onChangeText={setFormCustomerName}
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
              <View style={styles.pickerOptions}>
                {['$', '₦'].map((currencyOption) => (
                  <TouchableOpacity
                    key={currencyOption}
                    style={[styles.pickerButton, formCurrency === currencyOption && styles.pickerButtonActive]}
                    onPress={() => setFormCurrency(currencyOption as '₦' | '$')}
                  >
                    <Text style={styles.pickerButtonText}>{currencyOption}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <View style={styles.pickerOptions}>
                {['pending', 'completed', 'cancelled'].map((statusOption) => (
                  <TouchableOpacity
                    key={statusOption}
                    style={[styles.pickerButton, formStatus === statusOption && styles.pickerButtonActive]}
                    onPress={() => setFormStatus(statusOption as 'pending' | 'completed' | 'cancelled')}
                  >
                    <Text style={styles.pickerButtonText}>{statusOption.charAt(0).toUpperCase() + statusOption.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.error} />
              <Button
                title={currentOrder ? 'Update' : 'Create'}
                onPress={handleCreateOrUpdateOrder}
                color={COLORS.primary}
              />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
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
  searchFilterContainer: {
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  filterButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: COLORS.muted,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },
  filterButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
  },
  flatListContent: {
    paddingBottom: 16,
  },
  orderItem: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    width: '100%',
  },
  orderItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderIdText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  statusBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  orderItemText: {
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 4,
  },
  orderActions: {
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
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
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
    maxWidth: 500,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  input: {
    height: 45,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    width: '100%',
    marginBottom: 15,
    paddingHorizontal: 15,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    fontSize: 16,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    width: '100%',
    justifyContent: 'space-between',
  },
  pickerLabel: {
    color: COLORS.text,
    fontSize: 16,
    marginRight: 10,
  },
  pickerOptions: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: COLORS.card,
  },
  pickerButtonActive: {
    backgroundColor: COLORS.primary,
  },
  pickerButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});

export default RestaurantOrdersScreen;
