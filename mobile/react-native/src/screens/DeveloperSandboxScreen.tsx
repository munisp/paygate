import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert, TextInput, Modal, Button, RefreshControl, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface SandboxItem {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  amount: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
}

const DeveloperSandboxScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<SandboxItem | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [newItemCurrency, setNewItemCurrency] = useState<'NGN' | 'USD'>('NGN');

  const { data, isLoading, isError, error, refetch } = trpc.developerSandbox.list.useQuery();
  const createMutation = trpc.developerSandbox.create.useMutation();
  const updateMutation = trpc.developerSandbox.update.useMutation();
  const deleteMutation = trpc.developerSandbox.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(item =>
    item.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newItemName || !newItemAmount) return;
    try {
      await createMutation.mutateAsync({
        name: newItemName,
        amount: parseFloat(newItemAmount),
        currency: newItemCurrency,
      });
      setCreateModalVisible(false);
      setNewItemName('');
      setNewItemAmount('');
      setNewItemCurrency('NGN');
      refetch();
    } catch (err) {
      console.error('Failed to create item:', err);
      Alert.alert('Error', 'Failed to create item.');
    }
  };

  const handleEdit = async () => {
    if (!currentItem || !newItemName || !newItemAmount) return;
    try {
      await updateMutation.mutateAsync({
        id: currentItem.id,
        name: newItemName,
        amount: parseFloat(newItemAmount),
        currency: newItemCurrency,
      });
      setEditModalVisible(false);
      setCurrentItem(null);
      setNewItemName('');
      setNewItemAmount('');
      setNewItemCurrency('NGN');
      refetch();
    } catch (err) {
      console.error('Failed to update item:', err);
      Alert.alert('Error', 'Failed to update item.');
    }
  };

  const handleDelete = (id: string) => {
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
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              console.error('Failed to delete item:', err);
              Alert.alert('Error', 'Failed to delete item.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: SandboxItem }) => (
    <View style={styles.itemContainer}>
      <View>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDetails}>
          {item.currency === 'NGN' ? '₦' : '$'}{item.amount.toFixed(2)} - Created: {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        <Text style={[styles.itemStatus, item.status === 'active' ? styles.statusActive : item.status === 'inactive' ? styles.statusInactive : styles.statusPending]}>
          {item.status.toUpperCase()}
        </Text>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} 
          onPress={() => {
            setCurrentItem(item);
            setNewItemName(item.name);
            setNewItemAmount(item.amount.toString());
            setNewItemCurrency(item.currency);
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
        <Text style={styles.loadingText}>Loading sandbox items...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!filteredData || filteredData.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No sandbox items found.</Text>
        <Button title="Create New Item" onPress={() => setCreateModalVisible(true)} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Developer Sandbox</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search items..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      <FlatList
        data={filteredData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
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
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newItemAmount}
              onChangeText={setNewItemAmount}
            />
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, newItemCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewItemCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newItemCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewItemCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
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
              value={newItemName}
              onChangeText={setNewItemName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newItemAmount}
              onChangeText={setNewItemAmount}
            />
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, newItemCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewItemCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newItemCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewItemCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
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
    backgroundColor: COLORS.background,
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
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 15,
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
    margin: 10,
    borderRadius: 5,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  itemDetails: {
    color: COLORS.muted,
    fontSize: 14,
    marginTop: 5,
  },
  itemStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 3,
    alignSelf: 'flex-start',
  },
  statusActive: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusInactive: {
    backgroundColor: COLORS.muted,
    color: COLORS.background,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  itemActions: {
    flexDirection: 'row',
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
    backgroundColor: COLORS.background,
    color: COLORS.text,
    width: '100%',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  currencySelector: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  currencyButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginHorizontal: 5,
    backgroundColor: COLORS.background,
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
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
});

export default DeveloperSandboxScreen;
