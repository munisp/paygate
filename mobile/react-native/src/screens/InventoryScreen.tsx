import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface InventoryItem {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
  createdAt: string;
}

const InventoryScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'In Stock' | 'Low Stock' | 'Out of Stock'>('All');

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemStock, setNewItemStock] = useState('');

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemDescription, setEditItemDescription] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemStock, setEditItemStock] = useState('');

  const { data: inventoryItems, isLoading, isError, refetch } = trpc.inventory.list.useQuery({
    search: searchQuery,
    status: filterStatus === 'All' ? undefined : filterStatus,
  });

  const createInventoryMutation = trpc.inventory.create.useMutation();
  const updateInventoryMutation = trpc.inventory.update.useMutation();
  const deleteInventoryMutation = trpc.inventory.delete.useMutation();

  const handleCreateItem = async () => {
    try {
      await createInventoryMutation.mutateAsync({
        name: newItemName,
        description: newItemDescription,
        price: parseFloat(newItemPrice),
        stock: parseInt(newItemStock),
      });
      setCreateModalVisible(false);
      setNewItemName('');
      setNewItemDescription('');
      setNewItemPrice('');
      setNewItemStock('');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create item.');
    }
  };

  const handleEditItem = async () => {
    if (!editingItem) return;
    try {
      await updateInventoryMutation.mutateAsync({
        id: editingItem.id,
        name: editItemName,
        description: editItemDescription,
        price: parseFloat(editItemPrice),
        stock: parseInt(editItemStock),
      });
      setEditModalVisible(false);
      setEditingItem(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update item.');
    }
  };

  const handleDeleteItem = (itemId: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInventoryMutation.mutateAsync({ id: itemId });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete item.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setEditItemName(item.name);
    setEditItemDescription(item.description);
    setEditItemPrice(item.price.toString());
    setEditItemStock(item.stock.toString());
    setEditModalVisible(true);
  };

  const renderItem = ({ item }: { item: InventoryItem }) => (
    <View style={styles.itemCard}>
      <Text style={styles.itemName}>{item.name}</Text>
      <Text style={styles.itemDescription}>{item.description}</Text>
      <Text style={styles.itemPrice}>₦{item.price.toFixed(2)}</Text>
      <Text style={styles.itemStock}>Stock: {item.stock}</Text>
      <Text style={[styles.itemStatus, item.status === 'In Stock' ? styles.statusInStock : item.status === 'Low Stock' ? styles.statusLowStock : styles.statusOutOfStock]}>{item.status}</Text>
      <Text style={styles.itemDate}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <View style={styles.itemActions}>
        <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => openEditModal(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDeleteItem(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inventory</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Add Item</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchFilterContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search inventory..."
          placeholderTextColor={COLORS.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.filterButtons}>
          {['All', 'In Stock', 'Low Stock', 'Out of Stock'].map((status) => (
            <TouchableOpacity
              key={status}
              style={[styles.filterButton, filterStatus === status && styles.filterButtonActive]}
              onPress={() => setFilterStatus(status as any)}
            >
              <Text style={styles.filterButtonText}>{status}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loadingIndicator} />
      ) : isError ? (
        <Text style={styles.errorText}>Failed to load inventory. Please try again.</Text>
      ) : !inventoryItems || inventoryItems.length === 0 ? (
        <Text style={styles.emptyText}>No inventory items found.</Text>
      ) : (
        <FlatList
          data={inventoryItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Add New Inventory Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Item Name"
              placeholderTextColor={COLORS.muted}
              value={newItemName}
              onChangeText={setNewItemName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={newItemDescription}
              onChangeText={setNewItemDescription}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Price"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newItemPrice}
              onChangeText={setNewItemPrice}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Stock"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newItemStock}
              onChangeText={setNewItemStock}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalSaveButton]} onPress={handleCreateItem}>
                <Text style={styles.modalButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Inventory Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Item Name"
              placeholderTextColor={COLORS.muted}
              value={editItemName}
              onChangeText={setEditItemName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={editItemDescription}
              onChangeText={setEditItemDescription}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Price"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={editItemPrice}
              onChangeText={setEditItemPrice}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Stock"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={editItemStock}
              onChangeText={setEditItemStock}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalSaveButton]} onPress={handleEditItem}>
                <Text style={styles.modalButtonText}>Save Changes</Text>
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
    fontSize: 24,
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
  },
  loadingIndicator: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  listContentContainer: {
    padding: 16,
  },
  itemCard: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 5,
  },
  itemDescription: {
    color: COLORS.muted,
    marginBottom: 5,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.success,
    marginBottom: 5,
  },
  itemStock: {
    color: COLORS.text,
    marginBottom: 5,
  },
  itemStatus: {
    fontWeight: 'bold',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 5,
    alignSelf: 'flex-start',
    marginBottom: 5,
  },
  statusInStock: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusLowStock: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  statusOutOfStock: {
    backgroundColor: COLORS.error,
    color: COLORS.background,
  },
  itemDate: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 10,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
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
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
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
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    width: '45%',
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: COLORS.muted,
  },
  modalSaveButton: {
    backgroundColor: COLORS.primary,
  },
  modalButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default InventoryScreen;
