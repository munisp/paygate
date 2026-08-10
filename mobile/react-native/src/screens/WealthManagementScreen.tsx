import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert, Modal, TextInput, Button, RefreshControl, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface WealthItem {
  id: string;
  name: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
}

const WealthManagementScreen = () => {
  const navigation = useNavigation();
  const [isModalVisible, setModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<WealthItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemCurrency, setItemCurrency] = useState<'NGN' | 'USD'>('USD');
  const [searchQuery, setSearchQuery] = useState('');

  // tRPC queries and mutations
  const { data: wealthItems, isLoading, isError, error, refetch } = trpc.wealthManagement.list.useQuery();
  const createMutation = trpc.wealthManagement.create.useMutation();
  const updateMutation = trpc.wealthManagement.update.useMutation();
  const deleteMutation = trpc.wealthManagement.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredWealthItems = useMemo(() => {
    if (!wealthItems) return [];
    return wealthItems.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [wealthItems, searchQuery]);

  const handleCreateOrUpdate = async () => {
    if (!itemName || !itemAmount) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    const amount = parseFloat(itemAmount);
    if (isNaN(amount)) {
      Alert.alert('Error', 'Invalid amount.');
      return;
    }

    try {
      if (currentItem) {
        await updateMutation.mutateAsync({
          id: currentItem.id,
          name: itemName,
          amount,
          currency: itemCurrency,
        });
      } else {
        await createMutation.mutateAsync({
          name: itemName,
          amount,
          currency: itemCurrency,
        });
      }
      setModalVisible(false);
      setItemName('');
      setItemAmount('');
      setItemCurrency('USD');
      setCurrentItem(null);
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save item.');
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
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete item.');
            }
          },
        },
      ]
    );
  };

  const openCreateModal = () => {
    setCurrentItem(null);
    setItemName('');
    setItemAmount('');
    setItemCurrency('USD');
    setModalVisible(true);
  };

  const openEditModal = (item: WealthItem) => {
    setCurrentItem(item);
    setItemName(item.name);
    setItemAmount(item.amount.toString());
    setItemCurrency(item.currency);
    setModalVisible(true);
  };

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const renderItem = ({ item }: { item: WealthItem }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemDetails}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemAmount}>{formatCurrency(item.amount, item.currency)}</Text>
        <Text style={[styles.itemStatus, {
          color: item.status === 'active' ? COLORS.success :
                 item.status === 'pending' ? COLORS.warning : COLORS.error
        }]}>
          Status: {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </Text>
        <Text style={styles.itemDate}>Created: {formatDate(item.createdAt)}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => openEditModal(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDelete(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.muted, marginTop: 10 }}>Loading wealth items...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load wealth items.'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wealth Management</Text>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search wealth items..."
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {filteredWealthItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No wealth items found. Add a new one!</Text>
          <Button title="Create New Item" onPress={openCreateModal} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredWealthItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              testID="refresh-control"
            />
          }
        />
      )}

      <TouchableOpacity style={styles.addButton} onPress={openCreateModal}>
        <Text style={styles.addButtonText}>+</Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{currentItem ? 'Edit Wealth Item' : 'Create Wealth Item'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Item Name"
              placeholderTextColor={COLORS.muted}
              value={itemName}
              onChangeText={setItemName}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={itemAmount}
              onChangeText={setItemAmount}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, itemCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setItemCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, itemCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setItemCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.muted} />
              <Button
                title={currentItem ? 'Save' : 'Create'}
                onPress={handleCreateOrUpdate}
                color={COLORS.primary}
                disabled={createMutation.isLoading || updateMutation.isLoading}
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
    padding: 16,
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  listContent: {
    padding: 16,
  },
  itemCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  itemAmount: {
    fontSize: 16,
    color: COLORS.primary,
    marginTop: 4,
  },
  itemStatus: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 4,
  },
  itemDate: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
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
  addButton: {
    backgroundColor: COLORS.success,
    padding: 15,
    borderRadius: 30,
    position: 'absolute',
    bottom: 30,
    right: 30,
    elevation: 5,
  },
  addButtonText: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    padding: 20,
    borderRadius: 10,
    width: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginHorizontal: 5,
    backgroundColor: COLORS.muted,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    borderRadius: 8,
    margin: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});

export default WealthManagementScreen;
