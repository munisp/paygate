import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface PIXGatewayItem {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  amount: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
}

const PIXGatewayScreen: React.FC = () => {
  const navigation = useNavigation();

  const { data, isLoading, isError, refetch, isRefetching } = trpc.pixGateway.list.useQuery();
  const createMutation = trpc.pixGateway.create.useMutation();
  const updateMutation = trpc.pixGateway.update.useMutation();
  const deleteMutation = trpc.pixGateway.delete.useMutation();

  const [isModalVisible, setModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<PIXGatewayItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemCurrency, setItemCurrency] = useState<'NGN' | 'USD'>('NGN');

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleCreate = () => {
    setCurrentItem(null);
    setItemName('');
    setItemAmount('');
    setItemCurrency('NGN');
    setModalVisible(true);
  };

  const handleEdit = (item: PIXGatewayItem) => {
    setCurrentItem(item);
    setItemName(item.name);
    setItemAmount(item.amount.toString());
    setItemCurrency(item.currency);
    setModalVisible(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id }) },
      ]
    );
  };

  const handleSubmit = () => {
    if (currentItem) {
      updateMutation.mutate({
        id: currentItem.id,
        name: itemName,
        amount: parseFloat(itemAmount),
        currency: itemCurrency,
      }, {
        onSuccess: () => setModalVisible(false),
      });
    } else {
      createMutation.mutate({
        name: itemName,
        amount: parseFloat(itemAmount),
        currency: itemCurrency,
      }, {
        onSuccess: () => setModalVisible(false),
      });
    }
  };

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const symbol = currency === 'NGN' ? '₦' : '$';
    return `${symbol}${amount.toFixed(2)}`;
  };

  const renderItem = ({ item }: { item: PIXGatewayItem }) => (
    <View style={styles.itemContainer}>
      <View>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDetails}>Status: <Text style={{ color: item.status === 'active' ? COLORS.success : item.status === 'pending' ? COLORS.warning : COLORS.error }}>{item.status.toUpperCase()}</Text></Text>
        <Text style={styles.itemDetails}>Amount: {formatAmount(item.amount, item.currency)}</Text>
        <Text style={styles.itemDetails}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={() => handleEdit(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error, marginLeft: 10 }]}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading PIX Gateway data...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load PIX Gateway data.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!data || data.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No PIX Gateway items found.</Text>
        <Button title="Create New" onPress={handleCreate} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PIX Gateway</Text>
        <TouchableOpacity onPress={handleCreate} style={styles.createButton}>
          <Text style={styles.buttonText}>Create New</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{currentItem ? 'Edit Item' : 'Create New Item'}</Text>
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
                style={[styles.currencyButton, itemCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setItemCurrency('NGN')}
              >
                <Text style={[styles.currencyButtonText, itemCurrency === 'NGN' && styles.currencyButtonTextActive]}>₦ NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, itemCurrency === 'USD' && styles.currencyButtonActive, { marginLeft: 10 }]}
                onPress={() => setItemCurrency('USD')}
              >
                <Text style={[styles.currencyButtonText, itemCurrency === 'USD' && styles.currencyButtonTextActive]}>$ USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.error} />
              <Button title={currentItem ? 'Update' : 'Create'} onPress={handleSubmit} color={COLORS.primary} />
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
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
    marginBottom: 20,
    fontSize: 16,
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
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 15,
  },
  itemContainer: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  itemActions: {
    flexDirection: 'row',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyToggle: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.muted,
    fontWeight: 'bold',
  },
  currencyButtonTextActive: {
    color: COLORS.text,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
});

export default PIXGatewayScreen;