import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Button,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path

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

// Type definitions for an online order item
interface OrderItem {
  id: string;
  customerName: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'Pending' | 'Confirmed' | 'Delivered' | 'Cancelled';
  createdAt: string;
  deliveryAddress: string;
}

const RestaurantOnlineOrderingScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentOrderItem, setCurrentOrderItem] = useState<OrderItem | null>(null);

  // tRPC queries and mutations
  const { data, isLoading, isError, error, refetch } = trpc.restaurantOnlineOrdering.list.useQuery();
  const createMutation = trpc.restaurantOnlineOrdering.create.useMutation();
  const updateMutation = trpc.restaurantOnlineOrdering.update.useMutation();
  const deleteMutation = trpc.restaurantOnlineOrdering.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(item =>
    item.customerName.toLowerCase().includes(searchText.toLowerCase())
  );

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadgeStyle = (status: OrderItem['status']) => {
    switch (status) {
      case 'Confirmed':
        return { backgroundColor: COLORS.success };
      case 'Pending':
        return { backgroundColor: COLORS.warning };
      case 'Cancelled':
        return { backgroundColor: COLORS.error };
      case 'Delivered':
        return { backgroundColor: COLORS.primary };
      default:
        return { backgroundColor: COLORS.muted };
    }
  };

  const handleCreate = async (newItem: Omit<OrderItem, 'id' | 'createdAt'>) => {
    try {
      await createMutation.mutateAsync(newItem);
      setCreateModalVisible(false);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to create order.');
    }
  };

  const handleUpdate = async (updatedItem: OrderItem) => {
    try {
      await updateMutation.mutateAsync(updatedItem);
      setEditModalVisible(false);
      setCurrentOrderItem(null);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to update order.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this order?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete order.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: OrderItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.customerName}>{item.customerName}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Address: {item.deliveryAddress}</Text>
      <Text style={styles.cardText}>Ordered: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]}
          onPress={() => {
            setCurrentOrderItem(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error, marginLeft: 10 }]} // Added margin for spacing
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
        <Text style={styles.loadingText}>Loading orders...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch orders'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Restaurant Online Orders</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.addButtonText}>+ Add Order</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by customer name..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredData && filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No online orders found.</Text>
          <Button title="Refresh" onPress={() => refetch()} color={COLORS.primary} />
        </View>
      ) : (
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
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      {/* Create Order Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Order</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Customer Name"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentOrderItem(prev => ({ ...prev!, customerName: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount (e.g., 1200.50)"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              onChangeText={(text) => setCurrentOrderItem(prev => ({ ...prev!, amount: parseFloat(text) || 0 }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentOrderItem(prev => ({ ...prev!, currency: text as 'NGN' | 'USD' }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Delivery Address"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentOrderItem(prev => ({ ...prev!, deliveryAddress: text }))}
            />
            {/* Status and CreatedAt would typically be set by the backend or default values */}
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button
                title="Create"
                onPress={() => {
                  if (currentOrderItem) {
                    handleCreate({
                      customerName: currentOrderItem.customerName || '',
                      amount: currentOrderItem.amount || 0,
                      currency: currentOrderItem.currency || 'NGN',
                      status: currentOrderItem.status || 'Pending',
                      deliveryAddress: currentOrderItem.deliveryAddress || '',
                    });
                  }
                }}
                color={COLORS.primary}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Order Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Order</Text>
            {currentOrderItem && (
              <>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Customer Name"
                  placeholderTextColor={COLORS.muted}
                  value={currentOrderItem.customerName}
                  onChangeText={(text) => setCurrentOrderItem(prev => ({ ...prev!, customerName: text }))}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Amount"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="numeric"
                  value={currentOrderItem.amount.toString()}
                  onChangeText={(text) => setCurrentOrderItem(prev => ({ ...prev!, amount: parseFloat(text) || 0 }))}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Currency (NGN or USD)"
                  placeholderTextColor={COLORS.muted}
                  value={currentOrderItem.currency}
                  onChangeText={(text) => setCurrentOrderItem(prev => ({ ...prev!, currency: text as 'NGN' | 'USD' }))}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Delivery Address"
                  placeholderTextColor={COLORS.muted}
                  value={currentOrderItem.deliveryAddress}
                  onChangeText={(text) => setCurrentOrderItem(prev => ({ ...prev!, deliveryAddress: text }))}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Status (Pending, Confirmed, Delivered, Cancelled)"
                  placeholderTextColor={COLORS.muted}
                  value={currentOrderItem.status}
                  onChangeText={(text) => setCurrentOrderItem(prev => ({ ...prev!, status: text as OrderItem['status'] }))}
                />
              </>
            )}
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.error} />
              <Button
                title="Save"
                onPress={() => currentOrderItem && handleUpdate(currentOrderItem)}
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
    padding: 15,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 15,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  addButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 15,
    margin: 15,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  modalInput: {
    width: '100%',
    height: 45,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});

export default RestaurantOnlineOrderingScreen;
