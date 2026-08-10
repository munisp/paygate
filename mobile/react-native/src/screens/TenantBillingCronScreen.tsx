import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, FlatList, RefreshControl, Alert, TouchableOpacity, Modal, TextInput } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Real tRPC client import

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

type RootStackParamList = {
  TenantBillingCron: undefined;
  // Add other routes here if necessary
};

interface TenantBillingCronItem {
  id: string;
  tenantId: string;
  billingCycle: string;
  nextRunDate: string;
  status: 'active' | 'inactive' | 'failed';
  amount: number;
  currency: 'NGN' | 'USD';
}

const TenantBillingCronScreen = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  // tRPC hooks (mocked for now, replace with actual calls)
  // For demonstration, assuming trpc.tenantBillingCron.list, create, update, delete exist.
  // In a real app, these would be defined in your tRPC router.
  const { data, isLoading, isError, refetch } = trpc.tenantBillingCron.list.useQuery();
  const createMutation = trpc.tenantBillingCron.create.useMutation();
  const updateMutation = trpc.tenantBillingCron.update.useMutation();
  const deleteMutation = trpc.tenantBillingCron.delete.useMutation();

  // State for CRUD operations
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<TenantBillingCronItem | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState('');
  const [currentBillingCycle, setCurrentBillingCycle] = useState('');
  const [currentNextRunDate, setCurrentNextRunDate] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [currentCurrency, setCurrentCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [searchQuery, setSearchQuery] = useState('');

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(item =>
    item.tenantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.billingCycle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetForm = () => {
    setEditingItem(null);
    setCurrentTenantId('');
    setCurrentBillingCycle('');
    setCurrentNextRunDate('');
    setCurrentAmount('');
    setCurrentCurrency('NGN');
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalVisible(true);
  };

  const openEditModal = (item: TenantBillingCronItem) => {
    setEditingItem(item);
    setCurrentTenantId(item.tenantId);
    setCurrentBillingCycle(item.billingCycle);
    setCurrentNextRunDate(item.nextRunDate.split('T')[0]); // Assuming ISO string, take date part
    setCurrentAmount(item.amount.toString());
    setCurrentCurrency(item.currency);
    setIsModalVisible(true);
  };

  const handleSave = async () => {
    if (!currentTenantId || !currentBillingCycle || !currentNextRunDate || !currentAmount) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }

    const itemData = {
      tenantId: currentTenantId,
      billingCycle: currentBillingCycle,
      nextRunDate: new Date(currentNextRunDate).toISOString(), // Convert to ISO string for backend
      amount: parseFloat(currentAmount),
      currency: currentCurrency,
    };

    try {
      if (editingItem) {
        await updateMutation.mutateAsync({ id: editingItem.id, ...itemData });
      } else {
        await createMutation.mutateAsync({ ...itemData, status: 'active' }); // Default status for new items
      }
      setIsModalVisible(false);
      resetForm();
      refetch();
    } catch (error) {
      Alert.alert('Error', `Failed to ${editingItem ? 'update' : 'create'} billing cron entry.`);
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
            } catch (error) {
              Alert.alert('Error', 'Failed to delete billing cron entry.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    const symbol = currency === 'NGN' ? '₦' : '$';
    return `${symbol}${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const getStatusStyle = (status: 'active' | 'inactive' | 'failed') => {
    switch (status) {
      case 'active': return styles.statusActive;
      case 'inactive': return styles.statusInactive;
      case 'failed': return styles.statusFailed;
      default: return {};
    }
  };

  const renderItem = ({ item }: { item: TenantBillingCronItem }) => (
    <View style={styles.listItem}>
      <View style={styles.itemDetails}>
        <Text style={styles.itemTitle}>Tenant ID: {item.tenantId}</Text>
        <Text style={styles.itemText}>Billing Cycle: {item.billingCycle}</Text>
        <Text style={styles.itemText}>Next Run: {formatDate(item.nextRunDate)}</Text>
        <Text style={[styles.itemStatus, getStatusStyle(item.status)]}>
          Status: {item.status.toUpperCase()}
        </Text>
        <Text style={styles.itemText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tenant Billing Cron</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={onRefresh} style={[styles.createButton, { marginRight: 10 }]}>
            <Text style={styles.createButtonText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openCreateModal} style={styles.createButton}>
            <Text style={styles.createButtonText}>+ Add New</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by Tenant ID, Billing Cycle, or Status"
        placeholderTextColor={COLORS.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <View style={styles.content}>
        {isLoading && <ActivityIndicator size="large" color={COLORS.primary} />}
        {isError && <Text style={styles.errorText}>Failed to load billing cron data.</Text>}
        {!isLoading && !isError && (!filteredData || filteredData.length === 0) && (
          <Text style={styles.emptyText}>No billing cron entries found.</Text>
        )}
        {!isLoading && !isError && filteredData && filteredData.length > 0 && (
          <FlatList
            data={filteredData}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.flatListContent}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
                progressBackgroundColor={COLORS.card}
              />
            }
          />
        )}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingItem ? 'Edit Billing Cron' : 'Create New Billing Cron'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Tenant ID"
              placeholderTextColor={COLORS.muted}
              value={currentTenantId}
              onChangeText={setCurrentTenantId}
            />
            <TextInput
              style={styles.input}
              placeholder="Billing Cycle (e.g., Monthly)"
              placeholderTextColor={COLORS.muted}
              value={currentBillingCycle}
              onChangeText={setCurrentBillingCycle}
            />
            <TextInput
              style={styles.input}
              placeholder="Next Run Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={currentNextRunDate}
              onChangeText={setCurrentNextRunDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentAmount}
              onChangeText={setCurrentAmount}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, currentCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setCurrentCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, currentCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setCurrentCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => {
                setIsModalVisible(false);
                resetForm();
              }} style={[styles.actionButton, { backgroundColor: COLORS.muted }]}>
                <Text style={styles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={[styles.actionButton, { backgroundColor: COLORS.success }]}>
                <Text style={styles.actionButtonText}>{editingItem ? 'Update' : 'Create'}</Text>
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
  headerButtons: {
    flexDirection: 'row',
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
    padding: 12,
    margin: 16,
    borderRadius: 8,
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
  },
  flatListContent: {
    flexGrow: 1,
    width: '100%',
  },
  listItem: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDetails: {
    flex: 1,
  },
  itemTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  itemText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  itemStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 5,
  },
  statusActive: {
    color: COLORS.success,
  },
  statusInactive: {
    color: COLORS.muted,
  },
  statusFailed: {
    color: COLORS.error,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 10,
    marginLeft: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
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
    width: '90%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  input: {
    width: '100%',
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
    marginBottom: 20,
    width: '100%',
    justifyContent: 'center',
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
    width: '100%',
    marginTop: 10,
    gap: 10,
  },
});

export default TenantBillingCronScreen;
