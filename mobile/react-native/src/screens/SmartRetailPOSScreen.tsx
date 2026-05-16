import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface SmartRetailPOSItem {
  id: string;
  name: string;
  price: number;
  currency: 'NGN' | 'USD';
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

const SmartRetailPOSScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<SmartRetailPOSItem | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCurrency, setNewItemCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [editItemName, setEditItemName] = useState("");
  const [editItemPrice, setEditItemPrice] = useState("");
  const [editItemCurrency, setEditItemCurrency] = useState<'NGN' | 'USD'>('NGN');

  const { data, isLoading, isError, refetch } = trpc.smartRetailPOS.list.useQuery();
  const createMutation = trpc.smartRetailPOS.create.useMutation();
  const updateMutation = trpc.smartRetailPOS.update.useMutation();
  const deleteMutation = trpc.smartRetailPOS.delete.useMutation();

  const filteredData = data?.filter(item =>
    item.name.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    if (currency === 'NGN') {
      return `₦${amount.toLocaleString('en-US')}`;
    } else if (currency === 'USD') {
      return `$${amount.toLocaleString('en-US')}`;
    }
    return `${amount}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadge = (status: 'active' | 'inactive' | 'pending') => {
    let color = COLORS.muted;
    if (status === 'active') color = COLORS.success;
    if (status === 'inactive') color = COLORS.error;
    if (status === 'pending') color = COLORS.warning;
    return <Text style={[styles.statusBadge, { backgroundColor: color }]}>{status.toUpperCase()}</Text>;
  };

  const handleCreate = () => {
    if (!newItemName || !newItemPrice) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    const price = parseFloat(newItemPrice);
    if (isNaN(price)) {
      Alert.alert("Error", "Price must be a number.");
      return;
    }
    createMutation.mutate({
      name: newItemName,
      price: price,
      currency: newItemCurrency,
      status: 'pending', // Default status for new items
    }, {
      onSuccess: () => {
        refetch();
        setCreateModalVisible(false);
        setNewItemName("");
        setNewItemPrice("");
        setNewItemCurrency('NGN');
      },
      onError: (error) => {
        Alert.alert('Error', 'Failed to create item: ' + error.message);
      },
    });
  };

  const handleEdit = () => {
    if (!currentItem || !editItemName || !editItemPrice) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    const price = parseFloat(editItemPrice);
    if (isNaN(price)) {
      Alert.alert("Error", "Price must be a number.");
      return;
    }
    updateMutation.mutate({
      ...currentItem,
      name: editItemName,
      price: price,
      currency: editItemCurrency,
    }, {
      onSuccess: () => {
        refetch();
        setEditModalVisible(false);
      },
      onError: (error) => {
        Alert.alert('Error', 'Failed to update item: ' + error.message);
      },
    });
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          deleteMutation.mutate({ id }, {
            onSuccess: () => {
              refetch();
            },
            onError: (error) => {
              Alert.alert('Error', 'Failed to delete item: ' + error.message);
            },
          });
        }},
      ]
    );
  };

  const renderItem = ({ item }: { item: SmartRetailPOSItem }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemName}>{item.name}</Text>
        {getStatusBadge(item.status)}
      </View>
      <Text style={styles.itemDetail}>Price: {formatCurrency(item.price, item.currency)}</Text>
      <Text style={styles.itemDetail}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.itemActions}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => {
          setCurrentItem(item);
          setEditItemName(item.name);
          setEditItemPrice(item.price.toString());
          setEditItemCurrency(item.currency);
          setEditModalVisible(true);
        }}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDelete(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading SmartRetailPOS data...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load SmartRetailPOS data.</Text>
        <Button title="Retry" onPress={refetch} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SmartRetailPOS Management</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Add New</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search items..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No SmartRetailPOS items found.</Text>
          <Button title="Create New Item" onPress={() => setCreateModalVisible(true)} color={COLORS.primary} />
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
              onRefresh={refetch}
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
            <Text style={styles.modalTitle}>Create New Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Item Name"
              placeholderTextColor={COLORS.muted}
              value={newItemName}
              onChangeText={setNewItemName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Price"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newItemPrice}
              onChangeText={setNewItemPrice}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={newItemCurrency}
                style={styles.picker}
                onValueChange={(itemValue) => setNewItemCurrency(itemValue as 'NGN' | 'USD')}
              >
                <Picker.Item label="NGN" value="NGN" />
                <Picker.Item label="USD" value="USD" />
              </Picker>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreate} color={COLORS.primary} />
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
            <Text style={styles.modalTitle}>Edit Item</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Item Name"
              placeholderTextColor={COLORS.muted}
              value={editItemName}
              onChangeText={setEditItemName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Price"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={editItemPrice}
              onChangeText={setEditItemPrice}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={editItemCurrency}
                style={styles.picker}
                onValueChange={(itemValue) => setEditItemCurrency(itemValue as 'NGN' | 'USD')}
              >
                <Picker.Item label="NGN" value="NGN" />
                <Picker.Item label="USD" value="USD" />
              </Picker>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={handleEdit} color={COLORS.primary} />
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    marginBottom: 10,
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
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
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    margin: 15,
    borderRadius: 5,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  itemCard: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  itemName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 15,
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  itemDetail: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 3,
  },
  itemActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 6,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
    borderRadius: 10,
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
    width: '80%',
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 5,
    paddingHorizontal: 10,
  },
  pickerLabel: {
    color: COLORS.muted,
    marginRight: 10,
  },
  picker: {
    flex: 1,
    color: COLORS.text,
  },
});

export default SmartRetailPOSScreen;