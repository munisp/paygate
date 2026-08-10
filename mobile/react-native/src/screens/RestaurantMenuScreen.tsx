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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

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

// Placeholder types for tRPC data
interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: 'NGN' | 'USD';
  status: 'available' | 'out_of_stock';
  createdAt: Date;
  updatedAt: Date;
}

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
const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const RestaurantMenuScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // tRPC queries and mutations
  const { data, isLoading, isError, error, refetch } = trpc.restaurantMenu.list.useQuery();
  const createMutation = trpc.restaurantMenu.create.useMutation();
  const updateMutation = trpc.restaurantMenu.update.useMutation();
  const deleteMutation = trpc.restaurantMenu.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter((item) =>
    item.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreate = async (newItem: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await createMutation.mutateAsync(newItem);
      setCreateModalVisible(false);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to create menu item.');
      console.error(err);
    }
  };

  const handleUpdate = async (updatedItem: MenuItem) => {
    try {
      await updateMutation.mutateAsync(updatedItem);
      setEditModalVisible(false);
      setEditingItem(null);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to update menu item.');
      console.error(err);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this menu item?',
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
              Alert.alert('Error', 'Failed to delete menu item.');
              console.error(err);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: MenuItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View
          style={[
            styles.statusBadge,
            item.status === 'available' ? styles.statusAvailable : styles.statusOutOfStock,
          ]}
        >
          <Text style={styles.statusText}>
            {item.status === 'available' ? 'Available' : 'Out of Stock'}
          </Text>
        </View>
      </View>
      <Text style={styles.itemDescription}>{item.description}</Text>
      <Text style={styles.itemPrice}>{formatCurrency(item.price, item.currency)}</Text>
      <Text style={styles.itemDate}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]}
          onPress={() => {
            setEditingItem(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error, marginLeft: 10 }]}
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
        <Text style={styles.loadingText}>Loading menu items...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load menu items'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Restaurant Menu</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.createButtonText}>Add New Item</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search menu items..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredData?.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No menu items found.</Text>
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
            <Text style={styles.modalTitle}>Create New Menu Item</Text>
            <MenuItemForm
              onSubmit={handleCreate}
              onCancel={() => setCreateModalVisible(false)}
              isLoading={createMutation.isLoading}
            />
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
            <Text style={styles.modalTitle}>Edit Menu Item</Text>
            {editingItem && (
              <MenuItemForm
                initialData={editingItem}
                onSubmit={handleUpdate}
                onCancel={() => setEditModalVisible(false)}
                isLoading={updateMutation.isLoading}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

interface MenuItemFormProps {
  initialData?: MenuItem;
  onSubmit: (item: any) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const MenuItemForm: React.FC<MenuItemFormProps> = ({ initialData, onSubmit, onCancel, isLoading }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [price, setPrice] = useState(initialData?.price.toString() || '');
  const [currency, setCurrency] = useState<'NGN' | 'USD'>(initialData?.currency || 'NGN');
  const [status, setStatus] = useState<'available' | 'out_of_stock'>(initialData?.status || 'available');

  const handleSubmit = () => {
    if (!name || !price) {
      Alert.alert('Validation Error', 'Name and Price are required.');
      return;
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice)) {
      Alert.alert('Validation Error', 'Price must be a valid number.');
      return;
    }

    const itemData = {
      ...(initialData && { id: initialData.id }), // Include ID for updates
      name,
      description,
      price: parsedPrice,
      currency,
      status,
    };
    onSubmit(itemData);
  };

  return (
    <View style={formStyles.formContainer}>
      <TextInput
        style={formStyles.input}
        placeholder="Item Name"
        placeholderTextColor={COLORS.muted}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={formStyles.input}
        placeholder="Description"
        placeholderTextColor={COLORS.muted}
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <TextInput
        style={formStyles.input}
        placeholder="Price"
        placeholderTextColor={COLORS.muted}
        keyboardType="numeric"
        value={price}
        onChangeText={setPrice}
      />
      <View style={formStyles.pickerContainer}>
        <Text style={formStyles.pickerLabel}>Currency:</Text>
        <TouchableOpacity
          style={[formStyles.pickerOption, currency === 'NGN' && formStyles.pickerOptionSelected]}
          onPress={() => setCurrency('NGN')}
        >
          <Text style={formStyles.pickerOptionText}>₦ NGN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[formStyles.pickerOption, currency === 'USD' && formStyles.pickerOptionSelected]}
          onPress={() => setCurrency('USD')}
        >
          <Text style={formStyles.pickerOptionText}>$ USD</Text>
        </TouchableOpacity>
      </View>
      <View style={formStyles.pickerContainer}>
        <Text style={formStyles.pickerLabel}>Status:</Text>
        <TouchableOpacity
          style={[formStyles.pickerOption, status === 'available' && formStyles.pickerOptionSelected]}
          onPress={() => setStatus('available')}
        >
          <Text style={formStyles.pickerOptionText}>Available</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[formStyles.pickerOption, status === 'out_of_stock' && formStyles.pickerOptionSelected]}
          onPress={() => setStatus('out_of_stock')}
        >
          <Text style={formStyles.pickerOptionText}>Out of Stock</Text>
        </TouchableOpacity>
      </View>
      <View style={formStyles.buttonContainer}>
        <TouchableOpacity
          style={[formStyles.formButton, { backgroundColor: COLORS.muted }]} 
          onPress={onCancel}
          disabled={isLoading}
        >
          <Text style={formStyles.formButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[formStyles.formButton, { backgroundColor: COLORS.primary, marginLeft: 10 }]} 
          onPress={handleSubmit}
          disabled={isLoading}
        >
          <Text style={formStyles.formButtonText}>{isLoading ? 'Saving...' : (initialData ? 'Update' : 'Create')}</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.success,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.background,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    margin: 15,
    padding: 10,
    borderRadius: 8,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
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
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flexShrink: 1,
    marginRight: 10,
  },
  itemDescription: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 5,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 5,
  },
  itemDate: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 10,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  statusAvailable: {
    backgroundColor: COLORS.success,
  },
  statusOutOfStock: {
    backgroundColor: COLORS.warning,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
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
    fontSize: 16,
    textAlign: 'center',
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
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});

const formStyles = StyleSheet.create({
  formContainer: {
    width: '100%',
  },
  input: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 16,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerLabel: {
    color: COLORS.muted,
    marginRight: 10,
    fontSize: 16,
  },
  pickerOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginRight: 10,
    backgroundColor: COLORS.border,
  },
  pickerOptionSelected: {
    backgroundColor: COLORS.primary,
  },
  pickerOptionText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  formButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default RestaurantMenuScreen;
