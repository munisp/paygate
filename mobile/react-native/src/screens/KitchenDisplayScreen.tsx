import React, { useState, useCallback } from 'react';
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
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path

// Define COLORS as per requirement
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
  if (currency === 'NGN') {
    return `₦${amount.toFixed(2)}`;
  } else if (currency === 'USD') {
    return `$${amount.toFixed(2)}`;
  }
  return amount.toFixed(2);
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

type KitchenItem = {
  id: string;
  name: string;
  status: 'Pending' | 'Preparing' | 'Ready' | 'Delivered' | 'Cancelled';
  orderId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
  notes?: string;
};

const KitchenDisplayScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<KitchenItem | null>(null);

  // tRPC query for listing kitchen items
  const { data, isLoading, isError, error, refetch } = trpc.kitchenDisplay.list.useQuery();

  // tRPC mutation for creating a new item
  const createMutation = trpc.kitchenDisplay.create.useMutation({
    onSuccess: () => {
      refetch();
      setCreateModalVisible(false);
      Alert.alert('Success', 'Item created successfully!');
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to create item: ${err.message}`);
    },
  });

  // tRPC mutation for updating an item
  const updateMutation = trpc.kitchenDisplay.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditModalVisible(false);
      Alert.alert('Success', 'Item updated successfully!');
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to update item: ${err.message}`);
    },
  });

  // tRPC mutation for deleting an item
  const deleteMutation = trpc.kitchenDisplay.delete.useMutation({
    onSuccess: () => {
      refetch();
      Alert.alert('Success', 'Item deleted successfully!');
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to delete item: ${err.message}`);
    },
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(item =>
    item.name.toLowerCase().includes(searchText.toLowerCase()) ||
    item.orderId.toLowerCase().includes(searchText.toLowerCase()) ||
    item.status.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const handleCreate = (newItem: Omit<KitchenItem, 'id' | 'createdAt'>) => {
    createMutation.mutate(newItem);
  };

  const handleEdit = (updatedItem: KitchenItem) => {
    updateMutation.mutate(updatedItem);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id }) },
      ]
    );
  };

  const getStatusBadgeStyle = (status: KitchenItem['status']) => {
    switch (status) {
      case 'Pending':
        return { backgroundColor: COLORS.warning };
      case 'Preparing':
        return { backgroundColor: COLORS.primary };
      case 'Ready':
        return { backgroundColor: COLORS.success };
      case 'Delivered':
        return { backgroundColor: COLORS.muted };
      case 'Cancelled':
        return { backgroundColor: COLORS.error };
      default:
        return { backgroundColor: COLORS.muted };
    }
  };

  const renderItem = ({ item }: { item: KitchenItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Order ID: {item.orderId}</Text>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      {item.notes && <Text style={styles.cardText}>Notes: {item.notes}</Text>}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} 
          onPress={() => {
            setCurrentItem(item);
            setEditModalVisible(true);
          }}
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
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading kitchen items...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch items'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Kitchen Display</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ Add Item</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by name, order ID, or status..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No kitchen items found.</Text>
          <Button title="Refresh" onPress={() => refetch()} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContentContainer}
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

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Kitchen Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Item Name"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentItem(prev => ({ ...prev!, name: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Order ID"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentItem(prev => ({ ...prev!, orderId: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              onChangeText={(text) => setCurrentItem(prev => ({ ...prev!, amount: parseFloat(text) || 0 }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Notes (Optional)"
              placeholderTextColor={COLORS.muted}
              onChangeText={(text) => setCurrentItem(prev => ({ ...prev!, notes: text }))}
            />
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button
                title="Create"
                onPress={() => {
                  if (currentItem?.name && currentItem?.orderId && currentItem?.amount !== undefined) {
                    handleCreate({
                      name: currentItem.name,
                      orderId: currentItem.orderId,
                      amount: currentItem.amount,
                      currency: 'NGN', // Default currency
                      status: 'Pending', // Default status
                    });
                  } else {
                    Alert.alert('Error', 'Please fill all required fields.');
                  }
                }}
                color={COLORS.primary}
                disabled={createMutation.isLoading}
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
            <Text style={styles.modalTitle}>Edit Kitchen Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Item Name"
              placeholderTextColor={COLORS.muted}
              value={currentItem?.name}
              onChangeText={(text) => setCurrentItem(prev => ({ ...prev!, name: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Order ID"
              placeholderTextColor={COLORS.muted}
              value={currentItem?.orderId}
              onChangeText={(text) => setCurrentItem(prev => ({ ...prev!, orderId: text }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentItem?.amount?.toString()}
              onChangeText={(text) => setCurrentItem(prev => ({ ...prev!, amount: parseFloat(text) || 0 }))}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Notes (Optional)"
              placeholderTextColor={COLORS.muted}
              value={currentItem?.notes}
              onChangeText={(text) => setCurrentItem(prev => ({ ...prev!, notes: text }))}
            />
            {/* Status Picker/Dropdown could be added here for more robust editing */}
            <View style={styles.modalButtonContainer}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button
                title="Save Changes"
                onPress={() => {
                  if (currentItem?.id && currentItem?.name && currentItem?.orderId && currentItem?.amount !== undefined) {
                    handleEdit(currentItem);
                  } else {
                    Alert.alert('Error', 'Please fill all required fields.');
                  }
                }}
                color={COLORS.primary}
                disabled={updateMutation.isLoading}
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 10,
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
    margin: 16,
    paddingHorizontal: 12,
    color: COLORS.text,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flexShrink: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 4,
  },
  cardActions: {
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: COLORS.text,
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

export default KitchenDisplayScreen;
