import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, SafeAreaView, StatusBar, FlatList, RefreshControl, Alert, TextInput, TouchableOpacity, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  balance: number;
  createdAt: string;
}

const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  if (currency === 'NGN') {
    return `₦${amount.toLocaleString('en-NG')}`;
  } else {
    return `$${amount.toLocaleString('en-US')}`;
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const TenantAdminDashboardScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // State for new tenant creation
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantBalance, setNewTenantBalance] = useState('');

  // State for editing tenant
  const [editTenantName, setEditTenantName] = useState('');
  const [editTenantBalance, setEditTenantBalance] = useState('');
  const [editTenantStatus, setEditTenantStatus] = useState<'active' | 'inactive' | 'pending'>('active');

  const { data, isLoading, isError, refetch } = trpc.tenantAdmin.list.useQuery();
  const tenants: Tenant[] = data || [];

  const createTenantMutation = trpc.tenantAdmin.create.useMutation();
  const updateTenantMutation = trpc.tenantAdmin.update.useMutation();
  const deleteTenantMutation = trpc.tenantAdmin.delete.useMutation();

  useEffect(() => {
    if (selectedTenant) {
      setEditTenantName(selectedTenant.name);
      setEditTenantBalance(selectedTenant.balance.toString());
      setEditTenantStatus(selectedTenant.status);
    }
  }, [selectedTenant]);

  const filteredTenants = useMemo(() => {
    return tenants.filter(tenant =>
      tenant.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [tenants, searchText]);

  const handleCreateTenant = async () => {
    if (!newTenantName || !newTenantBalance) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await createTenantMutation.mutateAsync({
        name: newTenantName,
        balance: parseFloat(newTenantBalance),
      });
      Alert.alert('Success', 'Tenant created successfully.');
      setCreateModalVisible(false);
      setNewTenantName('');
      setNewTenantBalance('');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create tenant.');
    }
  };

  const handleUpdateTenant = async () => {
    if (!selectedTenant || !editTenantName || !editTenantBalance) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await updateTenantMutation.mutateAsync({
        id: selectedTenant.id,
        name: editTenantName,
        balance: parseFloat(editTenantBalance),
        status: editTenantStatus,
      });
      Alert.alert('Success', 'Tenant updated successfully.');
      setEditModalVisible(false);
      setSelectedTenant(null);
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update tenant.');
    }
  };

  const handleDeleteTenant = (id: string) => {
    Alert.alert(
      'Delete Tenant',
      'Are you sure you want to delete this tenant?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteTenantMutation.mutateAsync({ id });
            Alert.alert('Success', 'Tenant deleted successfully.');
            refetch();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to delete tenant.');
          }
        }},
      ],
      { cancelable: true }
    );
  };

  const renderTenantItem = ({ item }: { item: Tenant }) => (
    <View style={styles.tenantCard}>
      <View style={styles.tenantInfo}>
        <Text style={styles.tenantName}>{item.name}</Text>
        <View style={[styles.statusBadge, styles[`statusBadge_${item.status}`]]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.tenantDetails}>
        <Text style={styles.detailText}>Balance: <Text style={styles.detailValue}>{formatCurrency(item.balance, 'NGN')}</Text></Text>
        <Text style={styles.detailText}>Created: <Text style={styles.detailValue}>{formatDate(item.createdAt)}</Text></Text>
      </View>
      <View style={styles.tenantActions}>
        <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => { setSelectedTenant(item); setEditModalVisible(true); }}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDeleteTenant(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading tenants...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load tenants. Please try again later.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (tenants.length === 0 && !isLoading) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No tenants found.</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create New Tenant</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.title}>Tenant Admin Dashboard</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Search tenants..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredTenants}
        keyExtractor={(item) => item.id}
        renderItem={renderTenantItem}
        contentContainerStyle={styles.flatListContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || createTenantMutation.isLoading || updateTenantMutation.isLoading || deleteTenantMutation.isLoading}
            onRefresh={refetch}
            tintColor={COLORS.primary}
          />
        }
      />
      <TouchableOpacity style={styles.fab} onPress={() => setCreateModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Tenant</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Tenant Name"
              placeholderTextColor={COLORS.muted}
              value={newTenantName}
              onChangeText={setNewTenantName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Balance"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newTenantBalance}
              onChangeText={setNewTenantBalance}
            />
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: COLORS.success }]} 
              onPress={handleCreateTenant}
              disabled={createTenantMutation.isLoading}
            >
              {createTenantMutation.isLoading ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.modalButtonText}>Create Tenant</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.error }]} onPress={() => setCreateModalVisible(false)}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
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
            <Text style={styles.modalTitle}>Edit Tenant</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Tenant Name"
              placeholderTextColor={COLORS.muted}
              value={editTenantName}
              onChangeText={setEditTenantName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Balance"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={editTenantBalance}
              onChangeText={setEditTenantBalance}
            />
            <View style={styles.statusPickerContainer}>
              <TouchableOpacity
                style={[styles.statusPickerOption, editTenantStatus === 'active' && styles.statusPickerOptionSelected]}
                onPress={() => setEditTenantStatus('active')}
              >
                <Text style={[styles.statusPickerText, editTenantStatus === 'active' && styles.statusPickerTextSelected]}>Active</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusPickerOption, editTenantStatus === 'inactive' && styles.statusPickerOptionSelected]}
                onPress={() => setEditTenantStatus('inactive')}
              >
                <Text style={[styles.statusPickerText, editTenantStatus === 'inactive' && styles.statusPickerTextSelected]}>Inactive</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusPickerOption, editTenantStatus === 'pending' && styles.statusPickerOptionSelected]}
                onPress={() => setEditTenantStatus('pending')}
              >
                <Text style={[styles.statusPickerText, editTenantStatus === 'pending' && styles.statusPickerTextSelected]}>Pending</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: COLORS.primary }]} 
              onPress={handleUpdateTenant}
              disabled={updateTenantMutation.isLoading}
            >
              {updateTenantMutation.isLoading ? (
                <ActivityIndicator color={COLORS.background} />
              ) : (
                <Text style={styles.modalButtonText}>Update Tenant</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.error }]} onPress={() => setEditModalVisible(false)}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
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
    padding: 16,
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
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  retryButton: {
    marginTop: 15,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: COLORS.text,
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
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  createButton: {
    marginTop: 15,
    backgroundColor: COLORS.success,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: COLORS.text,
    marginBottom: 15,
    backgroundColor: COLORS.card,
  },
  flatListContent: {
    paddingBottom: 20,
  },
  tenantCard: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  tenantInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tenantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  statusBadge_active: {
    backgroundColor: COLORS.success,
  },
  statusBadge_inactive: {
    backgroundColor: COLORS.error,
  },
  statusBadge_pending: {
    backgroundColor: COLORS.warning,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  tenantDetails: {
    marginBottom: 10,
  },
  detailText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  detailValue: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  tenantActions: {
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
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    right: 20,
    bottom: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    elevation: 8,
  },
  fabText: {
    fontSize: 24,
    color: 'white',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
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
  modalInput: {
    width: '100%',
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: COLORS.text,
    marginBottom: 15,
    backgroundColor: COLORS.background,
  },
  modalButton: {
    borderRadius: 10,
    padding: 10,
    elevation: 2,
    marginTop: 15,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  statusPickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 15,
  },
  statusPickerOption: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: COLORS.muted,
  },
  statusPickerOptionSelected: {
    backgroundColor: COLORS.primary,
  },
  statusPickerText: {
    color: COLORS.background,
    fontWeight: 'bold',
  },
  statusPickerTextSelected: {
    color: COLORS.text,
  },
});

export default TenantAdminDashboardScreen;
