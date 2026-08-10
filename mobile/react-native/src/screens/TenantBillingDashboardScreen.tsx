import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

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

type BillingItem = {
  id: string;
  tenantId: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'Paid' | 'Pending' | 'Overdue';
  dueDate: string;
  description: string;
};

const TenantBillingDashboardScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<BillingItem | null>(null);
  const [formState, setFormState] = useState({
    amount: '',
    currency: 'NGN',
    status: 'Pending',
    dueDate: '',
    description: '',
  });

  const { data: billingItems, isLoading, isError, error, refetch, isRefetching } = trpc.tenantBilling.list.useQuery();
  const createMutation = trpc.tenantBilling.create.useMutation();
  const updateMutation = trpc.tenantBilling.update.useMutation();
  const deleteMutation = trpc.tenantBilling.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (editingItem) {
      setFormState({
        amount: editingItem.amount.toString(),
        currency: editingItem.currency,
        status: editingItem.status,
        dueDate: editingItem.dueDate.split('T')[0], // Assuming ISO string, take YYYY-MM-DD
        description: editingItem.description,
      });
      setModalVisible(true);
    }
  }, [editingItem]);

  const filteredItems = billingItems?.filter(item =>
    item.description.toLowerCase().includes(searchText.toLowerCase()) ||
    item.status.toLowerCase().includes(searchText.toLowerCase())
  );

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadgeStyle = (status: 'Paid' | 'Pending' | 'Overdue') => {
    switch (status) {
      case 'Paid':
        return { backgroundColor: COLORS.success };
      case 'Pending':
        return { backgroundColor: COLORS.warning };
      case 'Overdue':
        return { backgroundColor: COLORS.error };
      default:
        return { backgroundColor: COLORS.muted };
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        amount: parseFloat(formState.amount),
        currency: formState.currency as 'NGN' | 'USD',
        status: formState.status as 'Paid' | 'Pending' | 'Overdue',
        dueDate: new Date(formState.dueDate).toISOString(),
        description: formState.description,
      };

      if (editingItem) {
        await updateMutation.mutateAsync({ id: editingItem.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setModalVisible(false);
      setEditingItem(null);
      setFormState({ amount: '', currency: 'NGN', status: 'Pending', dueDate: '', description: '' });
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to save billing item.');
      console.error(err);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this billing item?',
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
              Alert.alert('Error', 'Failed to delete billing item.');
              console.error(err);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: BillingItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.description}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Due Date: {formatDate(item.dueDate)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => setEditingItem(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loadingIndicator} />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load billing items.'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!billingItems || filteredItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No billing items found.</Text>
        <Button title="Add New Billing Item" onPress={() => setModalVisible(true)} color={COLORS.primary} />
        <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.header}>Tenant Billing Dashboard</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search billing items..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      />

      <TouchableOpacity style={styles.addButton} onPress={() => {
        setEditingItem(null);
        setFormState({ amount: '', currency: 'NGN', status: 'Pending', dueDate: '', description: '' });
        setModalVisible(true);
      }}>
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
            <Text style={styles.modalTitle}>{editingItem ? 'Edit Billing Item' : 'Add New Billing Item'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={formState.amount}
              onChangeText={(text) => setFormState({ ...formState, amount: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={formState.currency}
              onChangeText={(text) => setFormState({ ...formState, currency: text.toUpperCase() })}
            />
            <TextInput
              style={styles.input}
              placeholder="Status (Paid, Pending, Overdue)"
              placeholderTextColor={COLORS.muted}
              value={formState.status}
              onChangeText={(text) => setFormState({ ...formState, status: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Due Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={formState.dueDate}
              onChangeText={(text) => setFormState({ ...formState, dueDate: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={formState.description}
              onChangeText={(text) => setFormState({ ...formState, description: text })}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={handleSave} color={COLORS.primary} />
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
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    padding: 16,
    textAlign: 'center',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80, // To make space for the add button
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
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
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    marginLeft: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
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
    marginTop: 50,
    fontSize: 16,
  },
  addButton: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: COLORS.primary,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  addButtonText: {
    color: COLORS.text,
    fontSize: 30,
    lineHeight: 30,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 20,
    width: '80%',
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    height: 45,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
});

export default TenantBillingDashboardScreen;
